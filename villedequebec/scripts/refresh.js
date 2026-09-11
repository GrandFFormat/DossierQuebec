// Rafraîchissement du volet municipal — en local comme sur GitHub Actions.
//
//   npm run refresh                     la routine quotidienne
//   npm run refresh -- --complet        votes : toute l'année (fait d'office le 1er du mois)
//   npm run refresh -- --sans-resumes   n'appelle pas l'API Claude
//   npm run refresh -- --elus           force les pages du conseil (sinon : le lundi)
//   npm run refresh -- --fenetre=30 --plafond=50
//
// Tolérant, comme scripts/refresh.js de DossierQuébec : une étape qui échoue est notée et
// on continue — la source en panne garde ses données de la veille. En CI, les échecs sont
// écrits dans $GITHUB_OUTPUT ; le workflow publie ce qui a marché, puis alerte.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR JOUR. Les métadonnées de l'année (cinq requêtes de mille
// documents), le texte des résolutions nouvelles (une par centaine), les votes des soixante
// derniers jours (une ou deux), le texte des sommaires à résumer (une par cinquantaine) :
// une dizaine de requêtes, à 0,6 s d'écart. C'est ce qui a été décrit au greffe dans la
// demande d'autorisation — ne pas l'alourdir sans mettre le courriel à jour.
//
// La clé des résumés vient de api.env (ici, ou à la racine de DossierQuébec qui a la
// sienne) en local, et du secret ANTHROPIC_API_KEY en CI. Sans clé, l'étape est sautée.

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

// Une passe complète sur les votes le 1er du mois : un vote publié en retard, daté d'avant
// la fenêtre, est rattrapé là. Trois requêtes de plus.
const complet = args.has('complet') || maintenant.getUTCDate() === 1;
// Les pages du conseil bougent rarement : le lundi, sur demande, ou si elles manquent.
const conseil = args.has('elus') || maintenant.getUTCDay() === 1 || !existsSync('data/elus.json');

const fichierCle = ['api.env', '../api.env'].find((f) => existsSync(f));
const resumes = !args.has('sans-resumes') && Boolean(fichierCle || process.env.ANTHROPIC_API_KEY);
if (!resumes) {
  console.log(args.has('sans-resumes') ? 'Résumés : sautés (--sans-resumes).' : 'Résumés : sautés, aucune clé API (api.env ou ANTHROPIC_API_KEY).');
}

// `secondaire` : un échec n'est qu'un avertissement — la donnée bouge peu, ou l'étape coûte
// de l'argent et peut attendre demain. Les deux extractions principales, elles, alertent.
const ETAPES = [
  // Au changement d'année, l'archive prend l'année révolue avant qu'on la remplace.
  { nom: 'Archivage des années révolues', argv: ['scrapers/archive.js', '--rotate'], secondaire: true },
  ...(conseil
    ? [
        { nom: 'Membres du conseil', argv: ['scrapers/elus.js'], secondaire: true },
        { nom: 'Districts électoraux', argv: ['scrapers/districts.js'], secondaire: true },
        { nom: "Conseil d'agglomération", argv: ['scrapers/agglomeration.js'], secondaire: true },
      ]
    : []),
  { nom: "Décisions de l'année", argv: ['scrapers/decisions.js'] },
  {
    nom: 'Votes nominatifs' + (complet ? ' (année complète)' : ` (depuis ${depuis})`),
    argv: ['scrapers/votes.js', ...(complet ? ['--max=2000'] : [`--depuis=${depuis}`, '--max=1000'])],
  },
  ...(resumes
    ? [
        {
          nom: 'Résumés en langage clair',
          argv: [...(fichierCle ? [`--env-file=${fichierCle}`] : []), 'scrapers/resumes.js', `--depuis=${depuis}`, `--plafond=${plafond}`],
          secondaire: true,
        },
      ]
    : []),
];

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

// Pour GitHub Actions (ignoré en local, où $GITHUB_OUTPUT n'existe pas).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${echecs.join(' | ')}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${avertissements.join(' | ')}\n`);
}
