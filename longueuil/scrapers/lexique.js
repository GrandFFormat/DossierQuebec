// Ancre le lexique dans les documents réels.
//
//   node scrapers/lexique.js [--year=2026]
//
// Les définitions sont écrites à la main dans lib/lexique.js. Ce script n'y touche pas :
// il mesure, sur les procès-verbaux du conseil de ville et de l'agglomération — l'année et la
// précédente, comme la page des votes : sans 2025, les termes du vote tombaient à zéro, puisque
// rien n'a été voté nommément en 2026. Pour chaque terme : le nombre de procès-verbaux et de
// résolutions où la formulation apparaît, et un exemple réel — la résolution la plus récente dont
// l'objet la contient, avec son lien vers le PDF officiel.
//
// Un lexique dont chaque entrée renvoie à un vrai document est vérifiable ; un lexique de
// définitions seules demande qu'on le croie sur parole. Et la mesure corrige : un terme à
// zéro occurrence est une formulation que la Ville n'emploie pas.

import { writeFile, readFile } from 'node:fs/promises';
import { TERMES, CATEGORIES } from '../lib/lexique.js';
import { decouperResolutions } from '../lib/pv.js';
import { documentDeSeance, lireJson } from './decisions.js';
import { INSTANCES, INSTANCES_ACTIVES } from '../lib/lgl.js';

const OUT = new URL('../data/lexique.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Les séances des deux années au calendrier ; le texte vient du cache, ou du PDF s'il manque
  // (un cache perdu en intégration continue ne doit pas faire tomber les décomptes à zéro).
  const annees = [String(Number(year) - 1), year];
  const calendrier = await lireJson(SEANCES);
  const seances = (calendrier?.seances ?? []).filter((s) => s.pv && INSTANCES_ACTIVES.includes(s.instance) && annees.includes(s.date.slice(0, 4)));
  const documents = [];
  for (const s of seances) {
    const doc = await documentDeSeance(s, 'PV').catch(() => null);
    if (!doc?.texte) continue;
    documents.push({ id: s.id, texte: doc.texte, blocs: decouperResolutions(doc.texte, { prefixe: INSTANCES[s.instance].prefixe, seanceId: s.id }).map((r) => r.texte) });
  }
  const decisions = JSON.parse(await readFile(DECISIONS, 'utf8').catch(() => '{"decisions":[]}')).decisions ?? [];
  console.log(`Mesure de ${TERMES.length} termes sur ${documents.length} procès-verbaux de ${Number(year) - 1} et ${year} et ${decisions.length} décisions…\n`);

  const entrees = [];
  for (const t of TERMES) {
    const re = new RegExp(t.recherche, 'i');
    const docs = documents.filter((d) => re.test(d.texte)).length;
    const resolutions = documents.reduce((n, d) => n + d.blocs.filter((b) => re.test(b)).length, 0);
    const ex = decisions.filter((d) => d.type === 'Résolution' && re.test(d.objet ?? '')).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    entrees.push({
      ...t,
      occurrences: { procesVerbaux: docs, resolutions, pourAnnee: year, total: resolutions },
      exemple: ex ? { numero: ex.numero, objet: ex.objet, date: ex.date, type: ex.type, instance: ex.instance, pdf: ex.pdf } : null,
    });
    console.log(`  ${String(docs).padStart(4)} PV  ${String(resolutions).padStart(6)} résolutions   ${t.terme}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'https://longueuil.quebec/fr/services/instances-decisionnelles-et-consultatives/proces-verbaux',
    avertissement:
      'Les définitions de ce lexique sont rédigées par DossierVille — ce ne sont pas des textes de la ' +
      'Ville de Longueuil ni des définitions légales. Ce qui vient des documents officiels, ce sont les ' +
      "décomptes et les exemples, mesurés sur les procès-verbaux de l'année et de la précédente.",
    categories: CATEGORIES,
    parametres: { annee: year, annees, procesVerbauxMesures: documents.length },
    nombre: entrees.length,
    entrees,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${entrees.length} entrées écrites dans data/lexique.json`);
  const muets = entrees.filter((e) => e.occurrences.total === 0);
  if (documents.length && muets.length) {
    console.warn(`\n⚠ ${muets.length} terme(s) sans aucune occurrence — la formulation cherchée ne colle pas :`);
    for (const m of muets) console.warn(`  ${m.terme}  (recherche : ${m.recherche})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
