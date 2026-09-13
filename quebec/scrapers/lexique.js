// Ancre le lexique dans les documents réels.
//
//   node scrapers/lexique.js [--year=2026]
//
// Les définitions sont écrites à la main dans lib/lexique.js. Ce script n'y touche pas :
// il mesure. Pour chaque terme, il compte les documents du portail où la formulation
// apparaît — sur tout l'index et sur l'année en cours — et en attache un exemple réel
// avec son lien vers le PDF officiel.
//
// Un lexique dont chaque entrée renvoie à un vrai document est vérifiable ; un lexique de
// définitions seules demande qu'on le croie sur parole.

import { writeFile } from 'node:fs/promises';
import { search, decode, PDF_BASE, PORTAL } from '../lib/gpd.js';
import { TERMES, CATEGORIES } from '../lib/lexique.js';

const OUT = new URL('../data/lexique.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

async function compter(requete, filter) {
  const res = await search({ search: requete, searchMode: 'all', filter, top: 0, count: true });
  return res['@odata.count'] ?? 0;
}

// Un exemple parlant : récent, et avec un objet lisible plutôt qu'un procès-verbal entier.
async function exemple(requete, year) {
  const res = await search({
    search: requete,
    searchMode: 'all',
    filter: `Annee eq '${year}'`,
    orderby: 'Date desc',
    top: 1,
    select: 'Objet,Numero,Date,Instance,Type,metadata_storage_name',
  });
  const row = res.value?.[0];
  if (!row) return null;
  const nom = row.metadata_storage_name;
  return {
    numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
    objet: (decode(row.Objet) ?? '').replace(/\s+/g, ' ').trim() || null,
    date: row.Date ?? null,
    type: decode(row.Type),
    instance: decode(row.Instance) === 'null' ? null : decode(row.Instance),
    pdf: nom ? PDF_BASE + nom : null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year ?? String(new Date().getFullYear());

  console.log(`Mesure de ${TERMES.length} termes sur l'index du portail…\n`);
  const entrees = [];

  for (const t of TERMES) {
    const total = await compter(t.recherche, null);
    const annee = await compter(t.recherche, `Annee eq '${year}'`);
    const ex = annee > 0 ? await exemple(t.recherche, year) : null;

    entrees.push({
      ...t,
      occurrences: { total, annee, pourAnnee: year },
      exemple: ex,
    });
    console.log(`  ${String(total).padStart(7)} docs  ${String(annee).padStart(5)} en ${year}   ${t.terme}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    avertissement:
      'Les définitions de ce lexique sont rédigées par DossierVille — ce ne sont pas des textes de la ' +
      "Ville de Québec ni des définitions légales. Ce qui vient des documents officiels, ce sont les " +
      'décomptes et les exemples, mesurés sur l\'index du portail des documents décisionnels.',
    categories: CATEGORIES,
    parametres: { annee: year },
    nombre: entrees.length,
    entrees,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${entrees.length} entrées écrites dans data/lexique.json`);

  const muets = entrees.filter((e) => e.occurrences.total === 0);
  if (muets.length) {
    console.warn(`\n⚠ ${muets.length} terme(s) sans aucune occurrence — la formulation cherchée ne colle pas :`);
    for (const m of muets) console.warn(`  ${m.terme}  (recherche : ${m.recherche})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
