// Client minimal pour l'index Azure Search du portail des documents décisionnels
// de la Ville de Québec (https://decisions.ville.quebec.qc.ca/).
//
// La configuration n'est pas un secret arraché : elle est publiée en clair dans
// https://decisions.ville.quebec.qc.ca/js/scripts.js, que tout navigateur télécharge en
// ouvrant le portail. C'est une clé de lecture seule (query key). On ne la copie pas pour
// autant dans le dépôt — GitHub la reconnaît comme une clé Azure et bloque le push, et il
// n'a pas tort de principe : on fait comme un navigateur, on la lit dans ce code au premier
// appel (une requête vers le portail, pas vers Azure). Si la Ville change de clé, on suit.
//
// ⚠ AVANT TOUT USAGE EN VOLUME — voir README.md :
//   - le robots.txt du portail est « User-agent: * / Disallow: / »
//   - l'avis de droit d'auteur interdit l'usage commercial sans autorisation préalable
//   - chaque requête est facturée à la Ville sur son service Azure
// D'où : throttle par défaut, User-Agent identifiable, et sync incrémental (jamais un
// re-téléchargement complet des 207 000 documents).

const SERVICE = 'srch-gpd-p';
const INDEX = 'stgpdprod01-index';
const API_VERSION = '2020-06-30';
const SCRIPTS_PORTAIL = 'https://decisions.ville.quebec.qc.ca/js/scripts.js';

const BASE = `https://${SERVICE}.search.windows.net/indexes/${INDEX}/docs`;

// Le code du portail déclare plusieurs environnements (dev, dcc, prod) sous la forme
// `new AzSearch.Automagic({ index: "…", queryKey: "…", service: "…" })`. On prend la clé
// du bloc qui nomme notre index et notre service. GPD_QUERY_KEY dans l'environnement
// court-circuite cette lecture.
let cleLecture = null;
async function queryKey() {
  if (process.env.GPD_QUERY_KEY) return process.env.GPD_QUERY_KEY;
  cleLecture ??= (async () => {
    await throttle();
    const res = await fetch(SCRIPTS_PORTAIL, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`portail ${res.status} en lisant ${SCRIPTS_PORTAIL}`);
    const code = await res.text();
    for (const [, bloc] of code.matchAll(/Automagic\(\{([^}]*)\}/g)) {
      if (!bloc.includes(`"${INDEX}"`) || !bloc.includes(`"${SERVICE}"`)) continue;
      const m = bloc.match(/queryKey\s*:\s*"([A-Za-z0-9]+)"/);
      if (m) return m[1];
    }
    throw new Error(`clé de lecture introuvable pour ${SERVICE}/${INDEX} dans ${SCRIPTS_PORTAIL}`);
  })().catch((err) => {
    cleLecture = null; // on réessaiera au prochain appel plutôt que de figer l'échec
    throw err;
  });
  return cleLecture;
}

// Ce que notre robot laisse comme contact dans son User-Agent, pour que la Ville puisse
// nous joindre si notre trafic la dérange — la contrepartie minimale du Disallow.
// GPD_CONTACT dans l'environnement (une adresse courriel, par exemple) ; à défaut,
// l'adresse du site, où la Ville trouve qui nous sommes.
const CONTACT = process.env.GPD_CONTACT || 'https://dossierquebec.ca/quebec/';
const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;

const DELAY_MS = Number(process.env.GPD_DELAY_MS || 600);
let lastCallAt = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = lastCallAt + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

// Les valeurs de champs sont stockées URL-encodées DANS l'index
// (« Sommaires%20et%20m%C3%A9moires », « Conseil%20d%27arrondissement »).
// decode() les rend lisibles.
export function decode(value) {
  if (value == null) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // quelques valeurs contiennent un % isolé et ne sont pas décodables
  }
}

// Chemin inverse : pour filtrer sur « Résolutions », il faut écrire la valeur telle
// qu'elle est stockée, donc « R%C3%A9solutions ». L'encodeur d'origine est côté .NET
// (Uri.EscapeDataString) : tout est échappé sauf A-Z a-z 0-9 - . _ ~
export function encodeFieldValue(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// Littéral de chaîne OData : les apostrophes se doublent. (Après encodeFieldValue il
// n'en reste normalement plus, mais on ne suppose pas.)
export function odataString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function search(params = {}) {
  const qs = new URLSearchParams({
    'api-version': API_VERSION,
    search: params.search ?? '*',
  });
  if (params.searchMode) qs.set('searchMode', params.searchMode);
  if (params.queryType) qs.set('queryType', params.queryType);
  if (params.filter) qs.set('$filter', params.filter);
  if (params.orderby) qs.set('$orderby', params.orderby);
  if (params.select) qs.set('$select', params.select);
  if (params.top != null) qs.set('$top', String(params.top));
  if (params.skip != null) qs.set('$skip', String(params.skip));
  if (params.count) qs.set('$count', 'true');
  for (const facet of params.facets ?? []) qs.append('facet', facet);

  const url = `${BASE}?${qs.toString()}`;

  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        headers: { 'api-key': await queryKey(), 'User-Agent': USER_AGENT },
      });
    } catch (err) {
      lastError = err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    // 429 = on tape trop vite, 5xx = leur côté. On recule. Le reste est une vraie erreur.
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** attempt));
      continue;
    }
    throw new Error(`GPD ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  throw lastError ?? new Error('GPD : échec après 4 tentatives');
}

// Pagination. L'API accepte $top jusqu'à 1000 et $skip jusqu'à 100 000.
// On trie par Date décroissante pour que « les N plus récents » soit stable.
export async function* searchAll(params = {}, { pageSize = 1000, max = Infinity } = {}) {
  let skip = 0;
  let yielded = 0;
  while (yielded < max) {
    const top = Math.min(pageSize, max - yielded);
    const page = await search({ ...params, top, skip });
    const rows = page.value ?? [];
    if (rows.length === 0) return;
    for (const row of rows) {
      yield row;
      yielded++;
      if (yielded >= max) return;
    }
    skip += rows.length;
    if (skip >= 100000) return; // limite dure d'Azure Search
  }
}

export async function count(params = {}) {
  const res = await search({ ...params, top: 0, count: true });
  return res['@odata.count'] ?? 0;
}

export const PDF_BASE = 'https://gpddocs.ville.quebec.qc.ca/gpdblob/';
export const PORTAL = 'https://decisions.ville.quebec.qc.ca/';
