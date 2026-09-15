// Rafraîchissement du volet Lévis — en local comme sur GitHub Actions.
//
//   npm run refresh                     la routine quotidienne
//   npm run refresh -- --complet        relit tous les procès-verbaux de l'année (depuis le cache)
//   npm run refresh -- --sans-resumes   n'appelle pas l'API Claude
//   npm run refresh -- --elus           force les pages du conseil (sinon : le lundi)
//   npm run refresh -- --fenetre=30 --plafond=50
//
// Tolérant, comme les autres volets : une étape qui échoue est notée et on continue — la
// source en panne garde ses données de la veille. En CI, les échecs sont écrits dans
// $GITHUB_OUTPUT ; le workflow publie ce qui a marché, puis alerte.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR JOUR. La page des archives et son module JavaScript (pour le
// jeton de lecture), puis une requête GraphQL pour la liste des séances de l'année ; pour
// chaque séance dont le procès-verbal vient d'apparaître ou a été remplacé, un PDF ; les
// sommaires à résumer, un PDF chacun, plafonnés. Le lundi, deux pages (membres, élections) et
// le jeu des districts sur Données Québec. Quatre ou cinq requêtes les jours calmes, quelques
// PDF les jours de publication, à 0,6 s d'écart. C'est ce qui est décrit au greffe dans le
// courriel — ne pas l'alourdir sans le mettre à jour.
//
// Pas d'étape de traduction anglaise : la version anglaise n'est pas reproduite pour une
// nouvelle ville (guide de reproduction, section 10).

import { spawnSync } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const complet = args.has('complet') || maintenant.getUTCDate() === 1;
const conseil = args.has('elus') || maintenant.getUTCDay() === 1 || !existsSync('data/elus.json');

const fichierCle = ['api.env', '../api.env'].find((f) => existsSync(f));
const resumes = !args.has('sans-resumes') && Boolean(fichierCle || process.env.ANTHROPIC_API_KEY);
if (!resumes) {
  console.log(args.has('sans-resumes') ? 'Résumés : sautés (--sans-resumes).' : 'Résumés : sautés, aucune clé API (api.env ou ANTHROPIC_API_KEY).');
}

const ETAPES = [
  // Le 15 septembre 2026, un « `n » laissé par un remplacement scripté dans app.js a cassé toutes
  // les pages du volet pendant une nuit, sans que rien ne le signale : une erreur de syntaxe dans
  // le JavaScript du site rend maintenant le run rouge.
  { nom: 'Syntaxe du JavaScript du site', argv: ['--check', 'assets/app.js'] },
  { nom: 'Archivage des années révolues', argv: ['scrapers/archive.js', '--rotate'], secondaire: true },
  ...(conseil
    ? [
        { nom: 'Membres du conseil', argv: ['scrapers/elus.js'], secondaire: true },
        { nom: 'Districts électoraux', argv: ['scrapers/districts.js'], secondaire: true },
      ]
    : []),
  { nom: 'robots.txt des sites lus', argv: ['scrapers/robots.js'], secondaire: true },
  { nom: 'Calendrier des séances', argv: ['scrapers/seances.js'] },
  {
    nom: "Décisions de l'année" + (complet ? ' (relecture complète)' : ''),
    argv: ['--max-old-space-size=4096', 'scrapers/decisions.js', ...(complet ? ['--complet'] : [])],
  },
  {
    nom: 'Votes nominatifs' + (complet ? ' (année complète)' : ` (depuis ${depuis})`),
    argv: ['--max-old-space-size=4096', 'scrapers/votes.js', ...(complet ? ['--complet'] : [`--depuis=${depuis}`])],
  },
  { nom: 'Lexique, mesuré sur les procès-verbaux', argv: ['scrapers/lexique.js'], secondaire: true },
  ...(resumes
    ? [
        {
          nom: 'Résumés en langage clair',
          argv: [...(fichierCle ? [`--env-file=${fichierCle}`] : []), 'scrapers/resumes.js', `--depuis=${depuis}`, `--plafond=${plafond}`],
          secondaire: true,
        },
      ]
    : []),
  // « Où en est le projet » : refait seulement pour un projet dont un dossier a changé (signature),
  // donc rien les jours calmes ; il doit passer AVANT projets-publics.js, qui le recopie.
  ...(resumes
    ? [
        {
          nom: 'Récapitulatifs des projets',
          argv: [...(fichierCle ? [`--env-file=${fichierCle}`] : []), 'scrapers/recaps-projets.js'],
          secondaire: true,
        },
      ]
    : []),
  // Espace abonnés : les petits fichiers que lit Mes dossiers (projets, agenda, mots-clés,
  // organismes, export) et les chiffres de la page Abonnement. Pas de détail de l'argent pour
  // Lévis pour l'instant (voir README).
  { nom: 'Projets pour « Mes dossiers »', argv: ['scripts/projets-publics.js'] },
  { nom: 'Chiffres de la page Abonnement', argv: ['scripts/travail-public.js'], secondaire: true },
];

try {
  const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  if (rev.status === 0) console.log(`Code : commit ${rev.stdout.trim()} — Node ${process.version}`);
} catch {
  // pas de git : tant pis
}

const echecs = [];
const avertissements = [];
for (const etape of ETAPES) {
  console.log(`\n=== ${etape.nom} ===`);
  const res = spawnSync(process.execPath, etape.argv, { stdio: 'inherit' });
  if (res.status === 0) continue;
  if (etape.secondaire) {
    avertissements.push(etape.nom);
    console.warn(`⚠ « ${etape.nom} » a échoué (code ${res.status}) — on garde les données précédentes, ça attendra.`);
  } else {
    echecs.push(etape.nom);
    console.error(`✖ « ${etape.nom} » a échoué (code ${res.status}) — données précédentes conservées.`);
  }
}

console.log('\n=== Bilan ===');
console.log(`  étapes         : ${ETAPES.length}`);
console.log(`  échecs         : ${echecs.length ? echecs.join(' | ') : 'aucun'}`);
console.log(`  avertissements : ${avertissements.length ? avertissements.join(' | ') : 'aucun'}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${echecs.join(' | ')}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${avertissements.join(' | ')}\n`);
}
