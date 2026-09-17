// L'index des documents décisionnels de la Ville de Laval, et le calendrier des séances qu'on
// en déduit.
//
//   node scrapers/index.js                       essaie l'index en ligne ; sinon garde la capture
//   node scrapers/index.js --capture=chemin.json ingère une capture faite dans un navigateur
//
// L'index est le tableau « Ordre du jour, procès-verbaux et sommaire décisionnel » de laval.ca
// (lib/lav.js). Tant que Cloudflare refuse les robots, il vient d'une CAPTURE MANUELLE :
// data/index-documents.json, obtenu dans un navigateur (README, « Rafraîchir l'index à la
// main »). Ce script essaie chaque jour l'index en ligne — le jour où la Ville ouvre la porte,
// il prend le relais sans qu'on ait rien à changer — et, en attendant, sort sans erreur : la
// capture reste la référence, et son âge est écrit dans le fichier pour que la page Sources
// le dise.
//
// Il écrit aussi data/seances.json : une séance par procès-verbal ou ordre du jour, avec les
// liens des deux PDF (lib/lav.js, seancesDepuisIndex). C'est ce que decisions.js et votes.js
// lisent ; ils ne touchent jamais à laval.ca.

import { writeFile, readFile } from 'node:fs/promises';
import { lireIndexEnLigne, normaliserLigneIndex, seancesDepuisIndex, sommairesDepuisIndex, PAGE_INDEX, AJAX_INDEX, INSTANCES, ErreurBloque } from '../lib/lav.js';

const OUT = new URL('../data/index-documents.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

export async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

function trier(documents) {
  return [...documents].sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);
}

async function ecrire(index) {
  const documents = trier(index.documents);
  const seances = seancesDepuisIndex(documents);
  const sommaires = sommairesDepuisIndex(documents);
  const payload = { ...index, documents };
  await writeFile(OUT, JSON.stringify(payload), 'utf8');
  const parInstance = {};
  for (const s of seances) parInstance[s.instance] = (parInstance[s.instance] ?? 0) + 1;
  await writeFile(
    SEANCES,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: PAGE_INDEX,
        obtenu: index.obtenu,
        indexDu: index.generatedAt,
        instances: Object.fromEntries(Object.entries(INSTANCES).map(([k, v]) => [k, v.nom])),
        nombre: seances.length,
        parInstance,
        sommairesPublies: sommaires.size,
        seances,
      },
      null,
      1
    ),
    'utf8'
  );
  return { documents, seances, sommaires };
}

async function main() {
  const args = parseArgs(process.argv);
  const precedent = await lireJson(OUT);

  let index = null;
  if (args.capture) {
    // Une capture brute (ce que le navigateur a reçu de l'API : { lignes: [...] } ou
    // { data: [[...], ...] }) ou déjà normalisée ({ documents: [...] }).
    const brut = JSON.parse(await readFile(args.capture, 'utf8'));
    const lignes = brut.documents ?? brut.lignes ?? brut.data;
    if (!Array.isArray(lignes)) throw new Error('La capture ne contient ni « documents », ni « lignes », ni « data ».');
    index = {
      generatedAt: new Date().toISOString(),
      obtenu: `capture manuelle dans un navigateur (Cloudflare refuse les robots), ${new Date().toISOString().slice(0, 10)}`,
      page: PAGE_INDEX,
      requete: AJAX_INDEX,
      recordsTotal: Number(brut.recordsTotal ?? lignes.length),
      documents: lignes.map(normaliserLigneIndex),
    };
    console.log(`Capture ingérée : ${index.documents.length} documents.`);
  } else {
    try {
      const enLigne = await lireIndexEnLigne();
      index = {
        generatedAt: new Date().toISOString(),
        obtenu: 'en ligne',
        page: PAGE_INDEX,
        requete: AJAX_INDEX,
        recordsTotal: enLigne.recordsTotal,
        documents: enLigne.documents,
      };
      console.log(`Index lu en ligne : ${index.documents.length} documents (${enLigne.recordsTotal} annoncés).`);
      if (index.documents.length < (precedent?.documents?.length ?? 0) * 0.9) {
        console.warn(`⚠ L'index en ligne compte ${index.documents.length} documents contre ${precedent.documents.length} dans le fichier précédent : on garde le précédent.`);
        index = null;
      }
    } catch (err) {
      if (err instanceof ErreurBloque || err?.bloque) {
        console.log(`Index en ligne : refusé (${err.status}) — laval.ca bloque encore les robots. La capture manuelle reste la référence.`);
      } else {
        console.warn(`⚠ Index en ligne : ${err.message}`);
      }
    }
  }

  if (!index) {
    if (!precedent) throw new Error("Aucun index : ni en ligne, ni data/index-documents.json. Faire une capture (README, « Rafraîchir l'index à la main »).");
    index = precedent;
    console.log(`Index conservé : ${index.documents.length} documents, ${index.obtenu} (du ${String(index.generatedAt).slice(0, 10)}).`);
  }

  const { seances, sommaires } = await ecrire(index);
  const avecPv = seances.filter((s) => s.pv).length;
  console.log(`${seances.length} séances dans data/seances.json (${avecPv} avec procès-verbal), ${sommaires.size} sommaires décisionnels publiés.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
