// Client de source pour la Ville de Longueuil : le pendant de lib/gpd.js à Québec et de
// lib/mtl.js à Montréal.
//
// Longueuil n'a ni index de recherche comme Québec, ni noms de fichiers prévisibles comme
// Montréal. Elle a mieux, pour un lecteur poli : UNE PAGE PAR INSTANCE qui liste toutes ses
// séances dans un tableau — date, ordre du jour, procès-verbal, et « Global » :
//
//   https://longueuil.quebec/fr/services/instances-decisionnelles-et-consultatives/conseil-de-ville
//
//   | 7 juillet | CO-260707-OJ | CO-260707-PV | CO-260707-Global |
//
// Le tableau est dans le HTML servi (une charge utile Nuxt, où « / » s'écrit \u002F) : une
// requête par instance donne toute l'année, sans deviner d'URL.
//
//   - OJ et PV sont des PDF sur cms.longueuil.quebec (un Drupal).
//   - « Global » est un lien de partage SharePoint (longueuilqc.sharepoint.com, site
//     « Documentsdeseance ») vers le document de séance complet : l'ordre du jour, puis pour
//     chaque point ses pièces — le SOMMAIRE DÉCISIONNEL et ses annexes. C'est là que les
//     résumés trouvent leur matière (scrapers/sommaires.js). Le fichier est lourd (94 Mo pour
//     le conseil du 7 juillet 2026) : on ne le lit qu'une fois par séance.
//
// robots.txt de longueuil.quebec et de cms.longueuil.quebec (lu le 14 septembre 2026) : rien
// d'interdit hors /admin/, /search/, /user/… ; aucun Crawl-delay. Avis juridique : les
// documents sont la propriété de la Ville ; la reproduction « à des fins de commercialisation »
// demande son autorisation — voir README et courriel-greffe.md.

import { estPdf } from './pdf.js';

export const SITE = 'https://longueuil.quebec/';
export const PAGES_INSTANCES = 'https://longueuil.quebec/fr/services/instances-decisionnelles-et-consultatives/';

// Ce que notre robot laisse comme contact dans son User-Agent. LGL_CONTACT dans
// l'environnement ; à défaut, l'adresse du volet.
const CONTACT = process.env.LGL_CONTACT || 'https://dossierquebec.ca/longueuil/';
export const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;

const DELAY_MS = Number(process.env.LGL_DELAY_MS || 600);
let dernierAppel = 0;

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = dernierAppel + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  dernierAppel = Date.now();
}

// Un fetch poli : throttle, User-Agent, quatre tentatives avec recul sur 429/5xx et sur les
// erreurs réseau. Un 404 rend `null`.
export async function requete(url, { accept, notFoundIsNull = true } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}) }, redirect: 'follow' });
    } catch (err) {
      lastError = err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    if (res.status === 404 && notFoundIsNull) return null;
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`HTTP ${res.status} sur ${url}`);
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} sur ${url}`);
  }
  throw lastError ?? new Error(`échec après 4 tentatives : ${url}`);
}

export async function texte(url, options) {
  const res = await requete(url, options);
  return res ? res.text() : null;
}

export async function octets(url, options) {
  const res = await requete(url, options);
  return res ? new Uint8Array(await res.arrayBuffer()) : null;
}

// Un PDF, ou null.
export async function pdf(url) {
  const data = /sharepoint\.com\/:b:/.test(url) ? await partageSharePoint(url) : await octets(url, { accept: 'application/pdf' });
  return data && estPdf(data) ? data : null;
}

// Un lien de partage SharePoint ouvre une visionneuse ; avec « download=1 », il répond par une
// redirection vers le fichier ET un cookie d'accès invité (FedAuth). fetch ne rejoue pas les
// cookies d'une redirection à l'autre — le fichier répondait 401 — : on suit donc la redirection
// à la main, cookie compris. Rien d'autre qu'un navigateur ne ferait.
async function partageSharePoint(lien) {
  let url = /[?&]download=1/.test(lien) ? lien : lien + (lien.includes('?') ? '&' : '?') + 'download=1';
  const cookies = new Map();
  for (let saut = 0; saut < 5; saut++) {
    await throttle();
    const entete = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf', ...(entete ? { Cookie: entete } : {}) } });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [paire] = c.split(';');
      const i = paire.indexOf('=');
      if (i > 0) cookies.set(paire.slice(0, i).trim(), paire.slice(i + 1));
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      url = new URL(res.headers.get('location'), url).href;
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} sur ${lien}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error(`trop de redirections sur ${lien}`);
}

// ---------- les instances ----------

// `prefixe` : ce qui ouvre le numéro des résolutions et le nom des documents (« CO-260120-2.1 »,
// « CO-260120-PV »). Une séance extraordinaire ajoute un X, parfois numéroté quand il y en a
// deux le même jour (« COX1-221213 », « COX2-221213 »).
// `actif` : lu par la routine. On commence par le conseil de ville et l'agglomération, les deux
// instances dont les séances ont un « Global » avec les sommaires décisionnels ; les autres
// sont prêtes à brancher (voir README).
export const INSTANCES = {
  CO: { prefixe: 'CO', nom: 'Conseil de ville', page: 'conseil-de-ville', actif: true },
  CA: { prefixe: 'CA', nom: "Conseil d'agglomération", page: 'conseil-agglomeration', actif: true },
  CE: { prefixe: 'CE', nom: 'Comité exécutif', page: 'comite-executif', actif: false },
  CEA: { prefixe: 'CEA', nom: "Comité exécutif d'agglomération", page: 'comite-executif-agglomeration', actif: false },
  VL: { prefixe: 'VL', nom: 'Arrondissement du Vieux-Longueuil', page: 'conseil-arrondissement-vieux-longueuil', actif: false },
  SH: { prefixe: 'SH', nom: 'Arrondissement de Saint-Hubert', page: 'conseil-arrondissement-saint-hubert', actif: false },
  GP: { prefixe: 'GP', nom: 'Arrondissement de Greenfield Park', page: 'conseil-arrondissement-greenfield-park', actif: false },
};

export const INSTANCES_ACTIVES = Object.keys(INSTANCES).filter((k) => INSTANCES[k].actif);

// « CO-260707-PV », « COX1-221213-OJ », « CA-260820-Global » -> morceaux. Le préfixe doit être
// exactement celui de l'instance, suivi au plus d'un X et d'un chiffre : « CEA » ne doit pas
// passer pour une séance « CE ».
export function lireCode(code, prefixe) {
  const m = String(code).match(/^([A-Z]+?)(X\d?)?-(\d{2})(\d{2})(\d{2})-(OJ|PV|Global)\b/);
  if (!m || m[1] !== prefixe) return null;
  const [, , extra, aa, mm, jj, genre] = m;
  return {
    seanceId: `${prefixe}${extra ?? ''}-${aa}${mm}${jj}`,
    extraordinaire: Boolean(extra),
    date: `20${aa}-${mm}-${jj}`,
    genre,
  };
}

// La charge utile Nuxt échappe « / », « < », « > » et les guillemets.
export function decoderNuxt(html) {
  return html
    .replace(/\\u002F/g, '/')
    .replace(/\\u003C/g, '<')
    .replace(/\\u003E/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\[rnt]/g, ' ');
}

// Les séances d'une instance, lues dans le tableau de sa page. Chaque lien est reconnu par
// son TEXTE (« CO-260707-PV »), pas par son URL : les noms de fichiers varient
// (« CO-230516-PV_0.pdf », « VL-260708-PV_modifie.pdf », « …OJ_projet_MAJ2_Noir.pdf ») alors
// que le texte du lien reste au gabarit. Le même lien figure deux fois dans la page (le HTML
// et sa copie dans la charge utile) : on dédoublonne par séance et genre.
export function parserPageInstance(html, cle) {
  const { prefixe, nom } = INSTANCES[cle];
  const t = decoderNuxt(html);
  const seances = new Map();
  for (const m of t.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>\s*([A-Z]+X?\d?-\d{6}-(?:OJ|PV|Global))\s*</g)) {
    const [, hrefBrut, code] = m;
    const lu = lireCode(code, prefixe);
    if (!lu) continue;
    const href = hrefBrut.replace(/&amp;/g, '&');
    const url = href.startsWith('/') ? 'https://cms.longueuil.quebec' + href : href;
    if (!seances.has(lu.seanceId)) {
      seances.set(lu.seanceId, { id: lu.seanceId, instance: cle, nom, date: lu.date, extraordinaire: lu.extraordinaire, odj: null, pv: null, global: null });
    }
    const s = seances.get(lu.seanceId);
    const champ = { OJ: 'odj', PV: 'pv', Global: 'global' }[lu.genre];
    s[champ] ??= url;
  }
  return [...seances.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export async function seancesInstance(cle) {
  const url = PAGES_INSTANCES + INSTANCES[cle].page;
  const html = await texte(url, { notFoundIsNull: false });
  return { url, seances: parserPageInstance(html, cle) };
}
