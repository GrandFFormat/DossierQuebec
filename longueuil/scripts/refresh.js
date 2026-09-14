// Rafraîchissement du volet Longueuil — en local comme sur GitHub Actions.
//
//   npm run refresh                     la routine quotidienne
//   npm run refresh -- --complet        relit tous les procès-verbaux de l'année
//   npm run refresh -- --sans-resumes   n'appelle pas l'API Claude
//   npm run refresh -- --elus           force les élus et les districts (sinon : le lundi)
//   npm run refresh -- --fenetre=30 --plafond=50
//
// Tolérant, comme les autres volets : une étape qui échoue est notée et on continue — la source
// en panne garde ses données de la veille. En CI, les échecs sont écrits dans $GITHUB_OUTPUT ; le
// workflow publie ce qui a marché, puis alerte.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR JOUR. Deux pages (la liste des séances du conseil de ville et
// celle de l'agglomération) ; les jours où un procès-verbal paraît, ce PDF et son ordre du jour ;
// le lundi, la page des élus et la couche des districts. Le document de séance (« Global »,
// jusqu'à 150 Mo) est servi par SharePoint, pas par le serveur de la Ville, et n'est lu qu'une
// fois par séance — quatre au plus par exécution. C'est ce qui est décrit au greffe dans le
// courriel — ne pas l'alourdir sans le mettre à jour.

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
const conseil = args.has('elus') || maintenant.getUTCDay() === 1 || !existsSync('data/elus.json') || !existsSync('data/districts.json');

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
        { nom: 'Districts électoraux', argv: ['scrapers/districts.js'], secondaire: true },
        // Une seconde fois : les numéros de district des élus viennent de districts.json.
        { nom: 'Élus de la Ville (numéros de district)', argv: ['scrapers/elus.js'], secondaire: true },
      ]
    : []),
  { nom: 'Calendrier des séances', argv: ['scrapers/seances.js'] },
  {
    nom: "Décisions de l'année" + (complet ? ' (relecture complète)' : ''),
    argv: ['--max-old-space-size=4096', 'scrapers/decisions.js', ...(complet ? ['--complet'] : [])],
  },
  {
    nom: 'Votes nominatifs' + (complet ? ' (deux années complètes)' : ` (depuis ${depuis})`),
    argv: ['--max-old-space-size=4096', 'scrapers/votes.js', ...(complet ? ['--complet'] : [`--depuis=${depuis}`])],
  },
  { nom: "Conseil d'agglomération (listes de présences)", argv: ['scrapers/agglomeration.js'], secondaire: true },
  { nom: 'Lexique, mesuré sur les procès-verbaux', argv: ['scrapers/lexique.js'], secondaire: true },
  // Le document de séance de chaque séance, une fois : les sommaires décisionnels qu'il contient.
  { nom: 'Sommaires décisionnels (documents de séance)', argv: ['--max-old-space-size=4096', 'scrapers/sommaires.js', '--max-seances=4'], secondaire: true },
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
