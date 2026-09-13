// Miroir incrémental des documents décisionnels de la Ville de Québec.
//
//   node scrapers/decisions.js [--year=2026] [--max=20000] [--type=Résolutions] [--all-types]
//
// Par défaut : toute l'année en cours, types décisionnels seulement (on laisse de côté
// « Mouvements de personnel », qui concerne des employés et non des décisions publiques).
//
// EN DEUX TEMPS, POUR MÉNAGER LE SERVEUR DE LA VILLE. D'abord les métadonnées de toute
// l'année — objet, numéro, date, instance, unité, type — à mille documents par requête.
// Ensuite le texte intégral des seules résolutions qu'on n'a jamais lues, par lots de cent
// numéros : c'est là qu'on lit le renvoi vers le sommaire décisionnel. Une exécution
// quotidienne coûte donc à la Ville une demi-douzaine de requêtes, quel que soit le nombre
// de documents déjà connus. Le texte lui-même n'est jamais conservé.

import { writeFile, readFile } from 'node:fs/promises';
import { search, searchAll, decode, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';
import { textesParNumero, normaliserObjet, LOT_TEXTE } from '../lib/textes.js';
import { classer, THEMES } from '../lib/themes.js';

const OUT = new URL('../data/decisions.json', import.meta.url);

// Types tels qu'ils existent dans l'index (facette Type).
const TYPES_DECISIONNELS = ['Résolutions', 'Sommaires et mémoires', 'Procès-verbaux', 'Tableaux des décisions'];

// Un document daté de plus de 45 jours avant le plus récent qu'on connaissait n'est pas une
// nouveauté : c'est un rattrapage — la Ville publie parfois tard, et nous-mêmes il nous
// arrive de remonter dans l'année. Le fil « ce qui a changé » ne doit pas s'en remplir.
const RATTRAPAGE_JOURS = 45;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function buildFilter({ year, types }) {
  const clauses = [];
  if (year) clauses.push(`Annee eq '${year}'`);
  if (types?.length) {
    const ors = types.map((t) => `Type eq '${encodeFieldValue(t)}'`);
    clauses.push(`(${ors.join(' or ')})`);
  }
  return clauses.join(' and ');
}

// Une résolution renvoie à son sommaire décisionnel par un hyperlien inséré dans son
// texte (…/gpdblob/DE2026-336.pdf). C'est ce lien qui permet d'afficher le résumé sur la
// décision elle-même, et pas seulement sur la note préparatoire — sans quoi une séance
// d'arrondissement, qui ne contient que des résolutions, n'affiche aucun résumé.
export function trouverSommaire(contenu, propreNom) {
  for (const m of (contenu ?? '').matchAll(/gpdblob\/([A-Z]{2,4}\d{4}-\d+\.pdf)/g)) {
    if (m[1] !== propreNom) return m[1]; // jamais un renvoi vers soi-même
  }
  return null;
}

function normalise(row) {
  const nom = row.metadata_storage_name ?? null;
  return {
    id: nom, // le nom du PDF est unique et stable — c'est notre clé
    numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
    objet: normaliserObjet(decode(row.Objet)),
    date: row.Date ?? null,
    annee: row.Annee ?? null,
    type: decode(row.Type),
    instance: decode(row.Instance) === 'null' ? null : decode(row.Instance),
    unite: decode(row.Uniteadministrative) === 'null' ? null : decode(row.Uniteadministrative),
    pdf: nom ? PDF_BASE + nom : null,
  };
}

function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([valeur, n]) => ({ valeur, n }));
}

function ajouterJours(dateIso, jours) {
  const d = new Date(dateIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

async function chargerExistant() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year ?? String(new Date().getFullYear());
  const max = Number(args.max ?? 20000);
  const types = args['all-types'] ? [] : args.type ? [args.type] : TYPES_DECISIONNELS;

  const filter = buildFilter({ year, types });
  const total = (await search({ filter, top: 0, count: true }))['@odata.count'] ?? 0;

  console.log(`Portail   : ${PORTAL}`);
  console.log(`Filtre    : ${filter}`);
  console.log(`Disponible: ${total} documents — on en récupère au plus ${max}`);

  // 1. Les métadonnées de toute l'année, sans le texte : mille documents par requête.
  const select = 'Objet,Numero,Date,Annee,Instance,Uniteadministrative,Type,metadata_storage_name';
  const vus = new Set();
  const decisions = [];
  for await (const row of searchAll(
    // Un tri sur la seule date n'est pas déterministe : des centaines de documents
    // partagent la même journée, et la pagination par $skip peut alors sauter ou répéter
    // des lignes d'une page à l'autre. Le numéro sert de départage.
    { filter, select, orderby: 'Date desc, Numero asc' },
    { pageSize: 1000, max }
  )) {
    const d = normalise(row);
    if (!d.id || vus.has(d.id)) continue; // un même PDF peut ressortir entre deux pages
    vus.add(d.id);
    decisions.push(d);
  }
  console.log(`${decisions.length} documents (métadonnées seulement).`);

  // 2. Ce qu'on savait déjà, et ce qui est vraiment nouveau. À la toute première extraction
  //    il n'y a rien à comparer — on laisse `nouveau` à null plutôt que de tout déclarer
  //    nouveau.
  const precedent = await chargerExistant();
  const connus = new Map((precedent?.decisions ?? []).map((d) => [d.id, d]));
  const plusRecentConnu = [...connus.values()].reduce((m, d) => ((d.date ?? '') > m ? d.date : m), '');
  const seuilNouveaute = plusRecentConnu ? ajouterJours(plusRecentConnu, -RATTRAPAGE_JOURS) : '';
  for (const d of decisions) {
    d.nouveau = precedent ? !connus.has(d.id) && (d.date ?? '') >= seuilNouveaute : null;
  }
  const inconnus = decisions.filter((d) => !connus.has(d.id)).length;
  const nouveaux = decisions.filter((d) => d.nouveau).length;

  // 3. Le texte intégral des seules résolutions jamais lues. Les autres types n'ont pas de
  //    renvoi à trouver ; les résolutions déjà lues gardent le leur. Une résolution qui
  //    reste introuvable par numéro n'a pas de clé `sommaireId` du tout — absente du JSON,
  //    elle est relue à la prochaine exécution.
  for (const d of decisions) {
    if (d.type !== 'Résolutions' || !d.numero) d.sommaireId = null;
    else if (connus.has(d.id) && 'sommaireId' in connus.get(d.id)) d.sommaireId = connus.get(d.id).sommaireId;
  }
  const aLire = decisions.filter((d) => d.type === 'Résolutions' && d.numero && d.sommaireId === undefined);
  const parNom = new Map(aLire.map((d) => [d.id, d]));
  let lues = 0;
  for await (const row of textesParNumero(aLire.map((d) => d.numero))) {
    const d = parNom.get(row.metadata_storage_name);
    if (!d) continue;
    d.sommaireId = trouverSommaire(row.content, d.id);
    lues++;
  }
  if (aLire.length) {
    const requetes = Math.ceil(aLire.length / LOT_TEXTE);
    console.log(`Texte intégral lu pour ${lues} résolution(s) sur ${aLire.length} (${requetes} requête(s)).`);
    if (lues < aLire.length) console.warn(`⚠ ${aLire.length - lues} résolution(s) introuvable(s) par numéro — relues la prochaine fois.`);
  }

  // Pastille thématique : ce que la décision concerne. Voir lib/themes.js pour la méthode.
  for (const d of decisions) Object.assign(d, classer(d));
  const sansTheme = decisions.filter((d) => !d.theme).length;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    licence: 'Documents publics de la Ville de Québec — reproduction avec mention de la source, usage non commercial.',
    parametres: { annee: year, max, types },
    totalDisponible: total,
    nombre: decisions.length,
    nouveauxDepuisDerniereExecution: precedent ? nouveaux : null,
    themes: THEMES,
    sansTheme,
    facettes: {
      type: tally(decisions, 'type'),
      instance: tally(decisions, 'instance'),
      unite: tally(decisions, 'unite'),
      theme: tally(decisions, 'theme'),
    },
    decisions,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${decisions.length} décisions écrites dans data/decisions.json`);
  if (precedent) {
    console.log(
      `${inconnus} document(s) qu'on ne connaissait pas, dont ${nouveaux} nouveauté(s)` +
        (inconnus > nouveaux ? ` — le reste est un rattrapage de plus de ${RATTRAPAGE_JOURS} jours.` : '.')
    );
  }
  console.log(`\nPastilles thématiques :`);
  for (const { valeur, n } of payload.facettes.theme) {
    console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  }
  console.log(`  ${String(sansTheme).padStart(5)}  (sans pastille — aucune règle n'a tranché)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
