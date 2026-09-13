// Rafraîchissement du volet Montréal — en local comme sur GitHub Actions.
//
//   npm run refresh                     la routine quotidienne
//   npm run refresh -- --complet        relit tous les procès-verbaux de l'année
//   npm run refresh -- --sans-resumes   n'appelle pas l'API Claude
//   npm run refresh -- --elus           force les jeux du conseil (sinon : le lundi)
//   npm run refresh -- --fenetre=30 --plafond=50
//
// Tolérant, comme scripts/refresh.js de DossierQuébec : une étape qui échoue est notée et
// on continue — la source en panne garde ses données de la veille. En CI, les échecs sont
// écrits dans $GITHUB_OUTPUT ; le workflow publie ce qui a marché, puis alerte.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR JOUR. Le calendrier des séances (deux requêtes au portail
// de données ouvertes) ; pour chaque séance passée dont le procès-verbal n'a pas encore été
// lu, un ou deux essais d'URL (404 tant qu'il n'est pas publié, un PDF le jour où il l'est,
// puis l'ordre du jour) ; les sommaires à résumer, un PDF chacun, plafonnés. Le lundi, les
// trois jeux du conseil (élus, agglomération, districts). Une poignée de requêtes les
// jours calmes, quelques PDF les jours de publication, à 0,6 s d'écart. C'est ce qui est
// décrit au greffe dans le courriel — ne pas l'alourdir sans le mettre à jour.

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
  { nom: 'Archivage des années révolues', argv: ['scrapers/archive.js', '--rotate'], secondaire: true },
  ...(conseil
    ? [
        { nom: 'Élus de la Ville', argv: ['scrapers/elus.js'], secondaire: true },
        { nom: "Conseil d'agglomération", argv: ['scrapers/agglomeration.js'], secondaire: true },
        { nom: 'Districts électoraux', argv: ['scrapers/districts.js'], secondaire: true },
      ]
    : []),
  { nom: 'Calendrier des séances', argv: ['scrapers/seances.js'] },
  { nom: "Décisions de l'année" + (complet ? ' (relecture complète)' : ''), argv: ['scrapers/decisions.js', ...(complet ? ['--complet'] : [])] },
  {
    nom: 'Votes enregistrés' + (complet ? ' (année complète)' : ` (depuis ${depuis})`),
    argv: ['scrapers/votes.js', ...(complet ? ['--complet'] : [`--depuis=${depuis}`])],
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

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${echecs.join(' | ')}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${avertissements.join(' | ')}\n`);
}
