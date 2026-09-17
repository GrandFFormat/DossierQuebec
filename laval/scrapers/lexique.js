// Ancre le lexique dans les documents réels.
//
//   node scrapers/lexique.js [--year=2026]
//
// Les définitions sont écrites à la main dans lib/lexique.js. Ce script n'y touche pas : il
// mesure, sur les procès-verbaux du conseil municipal et du comité exécutif de l'année. Pour
// chaque terme : le nombre de procès-verbaux et de résolutions où la formulation apparaît (avec le
// détail conseil / comité exécutif, parce que les deux n'écrivent pas pareil : « IL EST PROPOSÉ
// PAR » n'existe qu'au conseil, « (CT:…) » qu'au comité exécutif), et un exemple réel — la
// résolution la plus récente dont l'objet ou le titre contient la formulation, avec son lien vers
// le PDF officiel.
//
// L'année seule suffit à Laval : le conseil y vote nommément plusieurs fois par séance (44 votes
// en 2026), alors qu'à Longueuil il fallait remonter à l'année précédente pour que les termes du
// vote ne tombent pas à zéro.
//
// Un lexique dont chaque entrée renvoie à un vrai document est vérifiable ; un lexique de
// définitions seules demande qu'on le croie sur parole. Et la mesure corrige : un terme à
// zéro occurrence est une formulation que la Ville n'emploie pas.
//
// PIÈGE : le texte extrait des PDF est ligne à ligne, et une formule peut être coupée d'une ligne
// à l'autre (« exemption de l'obligation de fournir et de maintenir les cases de / stationnement »).
// On normalise donc avant de chercher : apostrophes droites, espaces insécables et retours de
// ligne ramenés à une espace. Le texte mis en cache par decisions.js n'est pas modifié.

import { writeFile, readFile } from 'node:fs/promises';
import { TERMES, CATEGORIES } from '../lib/lexique.js';
import { decouperResolutions } from '../lib/pv.js';
import { documentDeSeance, lireJson } from './decisions.js';
import { INSTANCES, INSTANCES_ACTIVES, PAGE_INDEX } from '../lib/lav.js';

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

// Même normalisation que lib/pv.js, plus les retours de ligne : une formule se cherche sur une
// seule ligne.
export function normaliser(texte) {
  return String(texte ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ');
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Les séances de l'année au calendrier ; le texte vient du cache, ou du PDF s'il manque (un
  // cache perdu en intégration continue ne doit pas faire tomber les décomptes à zéro). Une
  // séance illisible n'emporte pas les autres.
  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/index.js");
  const seances = (calendrier.seances ?? []).filter((s) => s.pv && INSTANCES_ACTIVES.includes(s.instance) && s.date.startsWith(year));
  const documents = [];
  const erreurs = [];
  for (const s of seances) {
    let doc;
    try {
      doc = await documentDeSeance(s, 'PV');
    } catch (err) {
      erreurs.push(`${s.id} : ${err.message}`);
      continue;
    }
    if (!doc?.texte) continue;
    const blocs = decouperResolutions(doc.texte, { prefixe: s.prefixe, pages: doc.pages }).map((r) => normaliser(r.texte));
    documents.push({ id: s.id, instance: s.instance, texte: normaliser(doc.texte), blocs });
  }
  for (const e of erreurs) console.warn(`⚠ ${e}`);

  const precedent = await lireJson(OUT);
  if (!documents.length) {
    // Rien à mesurer : on garde le fichier de la veille et on le dit ; sans fichier de la
    // veille, c'est un échec.
    console.warn(`⚠ aucun procès-verbal de ${year} lisible${precedent ? ' — data/lexique.json de la dernière exécution est conservé' : ''}.`);
    if (!precedent) process.exitCode = 1;
    return;
  }

  const decisions = JSON.parse(await readFile(DECISIONS, 'utf8').catch(() => '{"decisions":[]}')).decisions ?? [];
  const parInstance = Object.fromEntries(INSTANCES_ACTIVES.map((k) => [k, documents.filter((d) => d.instance === k).length]));
  console.log(`Mesure de ${TERMES.length} termes sur ${documents.length} procès-verbaux de ${year} (${INSTANCES_ACTIVES.map((k) => `${parInstance[k]} ${INSTANCES[k].nom.toLowerCase()}`).join(', ')}) et ${decisions.length} décisions…\n`);

  const entrees = [];
  for (const t of TERMES) {
    const re = new RegExp(t.recherche, 'i');
    const dedans = documents.filter((d) => re.test(d.texte));
    const resolutions = documents.reduce((n, d) => n + d.blocs.filter((b) => re.test(b)).length, 0);
    const parInstanceTerme = Object.fromEntries(INSTANCES_ACTIVES.map((k) => [k, dedans.filter((d) => d.instance === k).length]));
    // L'exemple : la résolution la plus récente dont l'objet (ou, à défaut, le titre du
    // procès-verbal) contient la formulation. Les fiches du procès-verbal et de l'ordre du jour
    // eux-mêmes n'en sont pas.
    const ex = decisions
      .filter((d) => d.numero && (re.test(normaliser(d.objet)) || re.test(normaliser(d.titre))))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    entrees.push({
      ...t,
      occurrences: { procesVerbaux: dedans.length, parInstance: parInstanceTerme, resolutions, pourAnnee: year, total: resolutions },
      exemple: ex ? { numero: ex.numero, objet: ex.objet, titre: ex.titre, date: ex.date, type: ex.type, instance: ex.instance, pdf: ex.pdf } : null,
    });
    console.log(`  ${String(dedans.length).padStart(4)} PV (${INSTANCES_ACTIVES.map((k) => `${k} ${String(parInstanceTerme[k]).padStart(2)}`).join(', ')})  ${String(resolutions).padStart(6)} résolutions   ${t.terme}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE_INDEX,
    avertissement:
      'Les définitions de ce lexique sont rédigées par DossierVille — ce ne sont pas des textes de la ' +
      'Ville de Laval ni des définitions légales. Ce qui vient des documents officiels, ce sont les ' +
      "décomptes et les exemples, mesurés sur les procès-verbaux du conseil municipal et du comité exécutif de l'année.",
    categories: CATEGORIES,
    parametres: { annee: year, procesVerbauxMesures: documents.length, parInstance, instances: Object.fromEntries(INSTANCES_ACTIVES.map((k) => [k, INSTANCES[k].nom])) },
    nombre: entrees.length,
    entrees,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${entrees.length} entrées écrites dans data/lexique.json`);
  const muets = entrees.filter((e) => e.occurrences.procesVerbaux === 0);
  if (muets.length) {
    console.warn(`\n⚠ ${muets.length} terme(s) sans aucune occurrence — la formulation cherchée ne colle pas :`);
    for (const m of muets) console.warn(`  ${m.terme}  (recherche : ${m.recherche})`);
  }
  const sansExemple = entrees.filter((e) => !e.exemple);
  if (sansExemple.length) console.log(`\n${sansExemple.length} terme(s) sans exemple (la formulation est dans le corps des résolutions, pas dans leur objet) : ${sansExemple.map((e) => e.terme).join(' · ')}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
