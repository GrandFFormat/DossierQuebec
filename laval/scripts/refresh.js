// Rafraîchissement du volet Laval — en local comme sur GitHub Actions.
//
//   npm run refresh                     la routine quotidienne
//   npm run refresh -- --complet        relit tous les procès-verbaux de l'année
//   npm run refresh -- --avec-resumes   ajoute l'étape PAYANTE des résumés (sinon elle est sautée)
//   npm run refresh -- --sans-resumes   n'appelle pas l'API Claude
//   npm run refresh -- --elus           force les districts, les élus et les présences (sinon : le lundi)
//   npm run refresh -- --fenetre=30 --plafond=50
//   npm run refresh -- --liste          affiche les étapes du jour, sans rien lancer
//
// Tolérant, comme les autres volets : une étape qui échoue est notée et on continue — la source
// en panne garde ses données de la veille. En CI, les échecs sont écrits dans $GITHUB_OUTPUT ; le
// workflow (.github/workflows/refresh-villedelaval.yml) publie ce qui a marché, puis alerte.
//
// L'INDEX EST À PART. scrapers/index.js est une étape principale (sans calendrier, decisions.js et
// votes.js n'ont rien à lire), mais laval.ca refuse les robots (Cloudflare, 403) : le script le
// sait, garde la capture manuelle data/index-documents.json et sort 0 — ce n'est pas un échec,
// c'est l'état des choses tant que la Ville n'a pas répondu (README, étape 2). Il n'échoue (code 1)
// que s'il n'y a NI index en ligne NI capture, et là le run doit le dire. Le jour où la porte
// s'ouvre, rien à changer ici.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR JOUR. Une requête à laval.ca — la page de l'index, refusée
// aujourd'hui dès la première réponse et sans réessai (le jour où elle passe : la page, puis son
// tableau). Les jours où un procès-verbal ou un ordre du jour paraît, ces PDF ; et jusqu'à 120
// sommaires décisionnels de rattrapage — tous lus sur le stockage Azure de la Ville
// (blob.core.windows.net), pas sur le serveur de laval.ca. Le lundi : les districts et les
// présences sur Données Québec (CKAN, CC-BY 4.0), et la page des élus de laval.ca (refusée elle
// aussi ; la capture data/sources/elus-laval.json sert de repli). C'est ce qui a été décrit à la
// Ville dans le courriel du 14 septembre — ne pas l'alourdir sans le mettre à jour.

import { spawnSync } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tout se passe dans laval/, d'où qu'on lance le script (npm, CI, node ../laval/scripts/…).
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [cle, valeur] = raw.replace(/^--/, '').split('=');
    return [cle, valeur ?? true];
  })
);
const fenetreJours = Number(args.get('fenetre') ?? 60);
const plafond = Number(args.get('plafond') ?? 120);
const maintenant = new Date();
const depuis = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() - fenetreJours))
  .toISOString()
  .slice(0, 10);

// Le 1er du mois, tout est relu : une nouvelle version d'un procès-verbal (« _3.0 ») a une autre
// adresse et decisions.js la voit tout seul, mais une résolution mal découpée ne se corrige que
// par une relecture.
const complet = args.has('complet') || maintenant.getUTCDate() === 1;
// Le conseil (districts, élus, présences) ne bouge pas tous les jours : le lundi, ou dès qu'un
// des trois fichiers manque — un premier lancement, ou un volet qu'on vient de cloner.
const conseil =
  args.has('elus') ||
  maintenant.getUTCDay() === 1 ||
  !existsSync('data/elus.json') ||
  !existsSync('data/districts.json') ||
  !existsSync('data/presences.json');

// La clé API : api.env dans laval/, sinon celui du dépôt (../api.env), sinon l'environnement (CI).
// On ne lit jamais la clé ici ; on passe le fichier à node (--env-file), qui la met dans
// l'environnement de resumes.js seulement.
const fichierCle = ['api.env', '../api.env'].find((f) => existsSync(f));
const cleDisponible = Boolean(fichierCle || process.env.ANTHROPIC_API_KEY);
// LES RÉSUMÉS SONT LE SEUL POSTE PAYANT DU VOLET, et ils ne démarrent pas tout seuls. Ailleurs,
// la seule présence de la clé suffisait : le jour où le secret ANTHROPIC_API_KEY est posé dans
// GitHub Actions, la routine se serait mise à dépenser chaque matin (jusqu'à 120 sommaires par
// jour, au modèle par défaut, en synchrone) sans que personne l'ait décidé. Ici il faut le dire :
// --avec-resumes en local, ou la variable LAV_RESUMES=oui dans le workflow. Le modèle et le mode
// se choisissent avec LAV_RESUMES_MODELE (claude-opus-5 par défaut dans resumes.js) et
// LAV_RESUMES_BATCH=oui (API Batches, moitié prix, résultats en différé).
const resumesDemandes = args.has('avec-resumes') || String(process.env.LAV_RESUMES ?? '').toLowerCase() === 'oui';
const resumes = !args.has('sans-resumes') && resumesDemandes && cleDisponible;
if (!resumes) {
  const pourquoi = args.has('sans-resumes')
    ? 'sautés (--sans-resumes).'
    : !resumesDemandes
      ? 'sautés : étape payante, à demander explicitement (--avec-resumes, ou LAV_RESUMES=oui dans le workflow).'
      : 'sautés, aucune clé API (api.env ou ANTHROPIC_API_KEY).';
  console.log('Résumés : ' + pourquoi);
}
const modeleResumes = process.env.LAV_RESUMES_MODELE || null;
const batchResumes = String(process.env.LAV_RESUMES_BATCH ?? '').toLowerCase() === 'oui';

// Les étapes du jour, dans l'ordre. `secondaire` : un échec est un avertissement, pas une alerte.
// Exportée pour qu'on puisse la relire sans rien lancer (--liste, ou un import depuis un test).
export const ETAPES = [
  { nom: 'Archivage des années révolues', argv: ['scrapers/archive.js', '--rotate'], secondaire: true },
  // Principale mais non fatale quand laval.ca refuse : voir l'en-tête. Écrit data/seances.json,
  // que toutes les étapes suivantes lisent.
  { nom: 'Index des documents et calendrier des séances', argv: ['scrapers/index.js'] },
  {
    nom: "Décisions de l'année" + (complet ? ' (relecture complète)' : ''),
    argv: ['--max-old-space-size=4096', 'scrapers/decisions.js', ...(complet ? ['--complet'] : [])],
  },
  {
    nom: 'Votes nominaux' + (complet ? " (l'année complète)" : ` (depuis ${depuis})`),
    argv: ['--max-old-space-size=4096', 'scrapers/votes.js', ...(complet ? ['--complet'] : [`--depuis=${depuis}`])],
  },
  ...(conseil
    ? [
        // Les districts d'abord : si les élus ou les présences veulent s'y référer (numéro, nom
        // officiel du district), le fichier est là. Pas de second passage des élus comme à
        // Longueuil : la page de la Ville écrit déjà « District 05 – Marigot » sous chaque nom.
        { nom: 'Districts électoraux (Données Québec)', argv: ['scrapers/districts.js'], secondaire: true },
        { nom: 'Élus de la Ville', argv: ['scrapers/elus.js'], secondaire: true },
        { nom: 'Présences aux séances (Données Québec)', argv: ['scrapers/presences.js'], secondaire: true },
      ]
    : []),
  { nom: 'Lexique, mesuré sur les procès-verbaux', argv: ['scrapers/lexique.js'], secondaire: true },
  // Un PDF par sommaire, sur le stockage Azure : 120 par jour au plus, le reste attendra demain.
  { nom: 'Sommaires décisionnels (120 par jour au plus)', argv: ['scrapers/sommaires.js', '--max=120'], secondaire: true },
  ...(resumes
    ? [
        {
          nom: 'Résumés en langage clair',
          argv: [
            ...(fichierCle ? [`--env-file=${fichierCle}`] : []),
            'scrapers/resumes.js',
            `--depuis=${depuis}`,
            `--plafond=${plafond}`,
            ...(modeleResumes ? [`--model=${modeleResumes}`] : []),
            ...(batchResumes ? ['--batch'] : []),
          ],
          secondaire: true,
        },
      ]
    : []),
];

// Le script d'une étape : le premier argument qui n'est pas une option de node.
const scriptDe = (etape) => etape.argv.find((a) => !a.startsWith('--'));

function lancer() {
  try {
    const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
    if (rev.status === 0) console.log(`Code : commit ${rev.stdout.trim()} — Node ${process.version}`);
  } catch {
    // pas de git : tant pis
  }

  if (args.has('liste')) {
    console.log(`\nÉtapes du jour (${ETAPES.length}) :`);
    for (const etape of ETAPES) console.log(`  ${etape.secondaire ? '·' : '*'} ${etape.nom}  →  node ${etape.argv.join(' ')}`);
    console.log('\n  * principale   · secondaire (un échec est un avertissement)');
    return;
  }

  const echecs = [];
  const avertissements = [];
  for (const etape of ETAPES) {
    console.log(`\n=== ${etape.nom} ===`);
    // Un scraper pas encore écrit (le volet se construit par morceaux) : on le dit et on passe,
    // plutôt que de laisser node échouer sur un « Cannot find module ». Il compte quand même —
    // comme avertissement s'il est secondaire, comme échec sinon — pour qu'on le voie en CI.
    const script = scriptDe(etape);
    if (script && !existsSync(script)) {
      (etape.secondaire ? avertissements : echecs).push(`${etape.nom} (${script} absent)`);
      console.warn(`${etape.secondaire ? '⚠' : '✖'} ${script} n'existe pas — étape sautée.`);
      continue;
    }
    const debut = Date.now();
    const res = spawnSync(process.execPath, etape.argv, { stdio: 'inherit' });
    const duree = `${Math.round((Date.now() - debut) / 1000)} s`;
    if (res.status === 0) {
      console.log(`(${duree})`);
      continue;
    }
    if (etape.secondaire) {
      avertissements.push(etape.nom);
      console.warn(`⚠ « ${etape.nom} » a échoué (code ${res.status}, ${duree}) — on garde les données précédentes, ça attendra.`);
    } else {
      echecs.push(etape.nom);
      console.error(`✖ « ${etape.nom} » a échoué (code ${res.status}, ${duree}) — données précédentes conservées.`);
    }
  }

  console.log('\n=== Bilan ===');
  console.log(`  étapes         : ${ETAPES.length}`);
  console.log(`  échecs         : ${echecs.length ? echecs.join(' | ') : 'aucun'}`);
  console.log(`  avertissements : ${avertissements.length ? avertissements.join(' | ') : 'aucun'}`);

  // Le workflow lit ces deux sorties : `failed` fait échouer le run (après avoir publié ce qui a
  // marché), `warnings` l'annote. Rien n'est écrit hors CI.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `failed=${echecs.join(' | ')}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${avertissements.join(' | ')}\n`);
  }
}

// Lancé directement (npm run refresh) : on exécute. Importé (node -e, un test) : on n'exécute
// rien, ETAPES suffit.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  lancer();
}
