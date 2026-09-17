// Le Plateau-Mont-Royal publie autrement. Ce module le lit.
//
// Les dix-huit autres conseils déposent leurs documents sous Adi_Public avec un nom de
// fichier prévisible (voir mtl.js) : la date et l'heure sont dans le nom, l'existence du
// fichier prouve la séance. Le Plateau, lui, ne dépose rien là — 900 requêtes en septembre
// 2026 n'ont rien trouvé. Il publie par sa page « Ordres du jour et procès-verbaux », qui
// renvoie au visualiseur de la Ville avec un NUMÉRO de document qu'on ne peut pas deviner :
//
//   https://ville.montreal.qc.ca/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&doc=8483
//
// Et le nom ne dit pas la date. Elle est dans le document, sur ses premières lignes :
// « Procès-verbal de la séance ordinaire du conseil d'arrondissement / tenue le lundi
// 6 juillet 2026 à 18 h 30 ». On lit donc la page pour la liste, chaque document une fois
// pour sa date, et le reste de la chaîne (decisions.js) fait comme pour les dix-huit autres.
// Un document lu une fois n'est jamais redemandé : sa date est gardée dans
// data/plateau-documents.json, par numéro.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { octets, texte, ARRONDISSEMENTS_CODES, instanceArrondissement, nomConseil } from './mtl.js';
import { lirePdf } from './pdf.js';

export const ARRONDISSEMENT = 'Le Plateau-Mont-Royal';
export const PAGE_PLATEAU = 'https://ville.montreal.qc.ca/portal/page?_pageid=7297,74659590&_dad=portal&_schema=PORTAL';
const MEMOIRE = new URL('../data/plateau-documents.json', import.meta.url);

// ---------- La page ----------

// Les liens de visualiseur de la page, dans l'ordre où elle les donne. Ils sont relatifs
// (« /sel/adi-public/… ») et leurs « & » sont encodés : on les résout contre la page.
export function documentsDePage(html, base = PAGE_PLATEAU) {
  const out = [];
  const vus = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*afficherpdf[^"']*)["']/gi)) {
    let url;
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    const genre = /typeDoc=pv/i.test(url) ? 'PV' : /typeDoc=odj/i.test(url) ? 'ODJ' : null;
    const doc = url.match(/[?&]doc=(\d+)/)?.[1] ?? null;
    if (!genre || !doc || vus.has(`${genre}${doc}`)) continue;
    vus.add(`${genre}${doc}`);
    out.push({ genre, doc, url });
  }
  return out;
}

// ---------- La date, lue dans le document ----------

const MOIS = {
  janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07',
  aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12',
};
const DATE_LONGUE = /(?<!\d)(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/iu;
const DATE_ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const HEURE = /(?<!\d)(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?!\d)/i;

// Les premières lignes d'un document de séance disent quand elle se tient. On prend la
// première date complète, l'heure sur la même ligne ou juste après, et « extraordinaire »
// s'il y est. L'heure par défaut est celle du conseil : le procès-verbal la dit toujours,
// l'ordre du jour pas forcément.
export function dateDuDocument(lignes, { heureDefaut = ARRONDISSEMENTS_CODES[ARRONDISSEMENT].heure, fenetre = 40 } = {}) {
  const tete = lignes.slice(0, fenetre).map((l) => String(l).replace(/\s+/g, ' ').trim());
  for (const [i, l] of tete.entries()) {
    let date = null;
    const m = l.match(DATE_LONGUE);
    if (m) date = `${m[3]}-${MOIS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
    else {
      const iso = l.match(DATE_ISO);
      if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    if (!date) continue;
    // L'heure : après la date sur cette ligne, sinon sur les deux lignes suivantes.
    let heure = null;
    const apres = m ? l.slice(m.index + m[0].length) : l;
    for (const zone of [apres, tete[i + 1] ?? '', tete[i + 2] ?? '']) {
      const h = zone.match(HEURE);
      if (h && Number(h[1]) >= 7 && Number(h[1]) <= 22) {
        heure = `${h[1].padStart(2, '0')}h${(h[2] ?? '00').padStart(2, '0')}`;
        break;
      }
    }
    const variante = tete.slice(0, i + 1).some((x) => /extraordinaire/i.test(x)) ? 'EXTRA' : 'ORDI';
    return { date, heure: heure ?? heureDefaut, variante, heureLue: Boolean(heure) };
  }
  return null;
}

// ---------- Les séances ----------

async function lireMemoire() {
  try {
    return JSON.parse(await readFile(MEMOIRE, 'utf8'));
  } catch {
    return { page: PAGE_PLATEAU, documents: {} };
  }
}

async function ecrireMemoire(memoire) {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(MEMOIRE, JSON.stringify({ generatedAt: new Date().toISOString(), page: PAGE_PLATEAU, ...memoire, documents: memoire.documents }, null, 1) + '\n');
}

// Regroupe des documents datés en séances, à la manière des dix-huit autres conseils :
// même identifiant (« CA_Pmr_2026-07-06_18h30 »), et en plus l'adresse de chaque document,
// puisqu'ici on ne peut pas la déduire.
export function seancesDesDocuments(documents, { annee = null } = {}) {
  const instance = instanceArrondissement(ARRONDISSEMENT);
  const parCle = new Map();
  for (const d of documents) {
    if (!d.date || (annee && !d.date.startsWith(String(annee)))) continue;
    // La séance est identifiée par sa date et son heure. Un ordre du jour sans heure lisible
    // prend celle du procès-verbal de la même date, s'il existe.
    const cle = d.date;
    const s = parCle.get(cle) ?? {
      id: null,
      instance,
      arrondissement: ARRONDISSEMENT,
      nomInstance: nomConseil(ARRONDISSEMENT),
      date: d.date,
      heure: null,
      variante: d.variante ?? 'ORDI',
      source: "page « Ordres du jour et procès-verbaux » de l'arrondissement (visualiseur)",
      documents: {},
    };
    if (d.heureLue && (d.genre === 'PV' || !s.heureLue)) {
      s.heure = d.heure;
      s.heureLue = true;
    } else if (!s.heure) s.heure = d.heure;
    if (d.genre === 'PV') s.variante = d.variante ?? s.variante;
    s.documents[d.genre] = d.url;
    parCle.set(cle, s);
  }
  return [...parCle.values()]
    .map(({ heureLue, ...s }) => ({ ...s, id: `${instance}_${s.date}_${s.heure}`, preuve: s.documents.PV ?? s.documents.ODJ }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Lit la page, puis chaque document pas encore daté, et rend les séances de l'année.
// `compteur.n` compte les requêtes, comme le sondage des autres conseils.
export async function seancesPlateau(annee, compteur = { n: 0 }, { journal = console } = {}) {
  const memoire = await lireMemoire();
  memoire.documents ??= {};
  compteur.n++;
  const html = await texte(PAGE_PLATEAU, { notFoundIsNull: true });
  if (html == null) {
    journal.warn(`    ⚠ ${ARRONDISSEMENT} : sa page ne répond pas (404) — on garde ce qu'on savait.`);
  }
  const surLaPage = html ? documentsDePage(html) : [];
  let nouveaux = 0;
  let illisibles = 0;
  for (const d of surLaPage) {
    const cle = `${d.genre}_${d.doc}`;
    if (memoire.documents[cle]?.date) continue;
    compteur.n++;
    let lu = null;
    try {
      const buf = await octets(d.url, { accept: 'application/pdf' });
      if (buf && buf.length) {
        const pdf = await lirePdf(buf);
        const lignes = pdf.pages.flatMap((p) => p.lignes.map((l) => l.texte));
        lu = { ...dateDuDocument(lignes), pages: pdf.nombrePages, premieresLignes: lignes.slice(0, 6) };
        if (!lu.date) lu = { pages: pdf.nombrePages, premieresLignes: lignes.slice(0, 6) };
      }
    } catch (err) {
      journal.warn(`    ⚠ ${ARRONDISSEMENT} : ${d.genre} ${d.doc} illisible — ${err.message ?? err}`);
    }
    memoire.documents[cle] = { genre: d.genre, doc: d.doc, url: d.url, luLe: new Date().toISOString().slice(0, 10), ...(lu ?? {}) };
    if (lu?.date) nouveaux++;
    else illisibles++;
    // Sauvegarde à chaque document : un run interrompu ne relit pas ce qu'il a déjà daté.
    await ecrireMemoire(memoire);
  }
  if (surLaPage.length) await ecrireMemoire(memoire);
  const dates = Object.values(memoire.documents).filter((d) => d.date);
  const seances = seancesDesDocuments(dates, { annee });
  journal.log(`    ${ARRONDISSEMENT} : ${surLaPage.length} document(s) sur la page, ${nouveaux} daté(s) aujourd'hui${illisibles ? `, ${illisibles} sans date lisible` : ''}, ${seances.length} séance(s) en ${annee}.`);
  return seances;
}
