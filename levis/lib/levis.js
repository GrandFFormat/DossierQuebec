// Client de source pour la Ville de Lévis : le pendant de lib/gpd.js à Québec et de
// lib/mtl.js à Montréal.
//
// Lévis publie ses séances sur levis.ca, un site Nuxt adossé à Craft CMS. La page « Archives
// des séances du conseil municipal » n'affiche que quatre séances par année et en charge
// d'autres par « Voir plus » : derrière, c'est l'API GraphQL de Craft (https://levis.ca/
// graphql/), interrogée par le navigateur avec un jeton de LECTURE PUBLIQUE écrit en clair
// dans le JavaScript du site. On fait comme le navigateur : on lit ce jeton dans le code du
// site à l'exécution (jamais dans le dépôt — voir le guide de reproduction, section 11), et on
// demande la même chose que la page.
//
// Une requête rend toutes les « participations citoyennes » d'une année : séances du conseil
// de la Ville, du comité exécutif et des trois conseils d'arrondissement, avec pour chacune
// son type, son arrondissement, et les liens vers l'ordre du jour et le procès-verbal (PDF sur
// un stockage S3 d'OVH, levis-website-resources.s3.bhs.io.cloud.ovh.net). Les noms de ces
// fichiers ne sont PAS prévisibles (« PV-CV-2026-08-25-CV3600-a-CV3637.pdf »,
// « PVCV-2025-12-08.pdf », « 07-Proces_verbal_de_la_seance_ordinaire_du_29_juillet_2026.pdf ») :
// on ne les construit jamais, on les lit dans l'API.
//
// ⚠ AVANT TOUT USAGE EN VOLUME — voir README.md : robots.txt de levis.ca permissif, contenu
// « Tous droits réservés », courriel au greffe. Même règle qu'ailleurs : throttle, User-Agent
// identifiable, lecture incrémentale.

import { estPdf } from './pdf.js';

export const SITE = 'https://levis.ca/';
export const GRAPHQL = 'https://levis.ca/graphql/';
export const PAGE_ARCHIVES = 'https://levis.ca/fr/ville/conseil-municipal/seances-du-conseil-municipal/archives-des-seances-du-conseil-municipal';
export const PAGE_MEMBRES = 'https://levis.ca/fr/ville/conseil-municipal/membres-du-conseil-municipal';
export const STOCKAGE = 'https://levis-website-resources.s3.bhs.io.cloud.ovh.net/';

const CONTACT = process.env.LEVIS_CONTACT || 'https://dossierquebec.ca/levis/';
export const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;
const DELAY_MS = Number(process.env.LEVIS_DELAY_MS || 600);

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
export async function requete(url, { accept, method = 'GET', headers = {}, body, notFoundIsNull = true } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}), ...headers },
        redirect: 'follow',
      });
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

// Un PDF de la Ville, ou null (404, ou une page HTML servie à la place).
export async function pdf(url) {
  const data = await octets(url, { accept: 'application/pdf' });
  return data && estPdf(data) ? data : null;
}

// ---------- Le jeton de lecture de l'API ----------

// Le site le passe dans l'en-tête « X-Craft-Authorization: Bearer … », écrit dans son module
// d'entrée (/_nuxt/<hash>.js, dont le nom change à chaque déploiement). On lit la page des
// archives, on suit ses scripts, et on s'arrête au premier qui contient l'en-tête.
// LEVIS_GRAPHQL_JETON dans l'environnement court-circuite la recherche (pour un essai local).
let jetonPromesse = null;
export function jeton() {
  jetonPromesse ??= (async () => {
    if (process.env.LEVIS_GRAPHQL_JETON) return process.env.LEVIS_GRAPHQL_JETON;
    const html = await texte(PAGE_ARCHIVES, { notFoundIsNull: false });
    const scripts = [
      ...new Set([...html.matchAll(/(?:src|href)="(\/_nuxt\/[^"]+\.js)"/g)].map((m) => new URL(m[1], SITE).href)),
    ];
    for (const url of scripts.slice(0, 12)) {
      const code = await texte(url);
      const m = code?.match(/X-Craft-Authorization["']?\s*:\s*["']Bearer\s+([A-Za-z0-9_\-]+)["']/);
      if (m) return m[1];
    }
    throw new Error("Jeton de lecture introuvable dans le JavaScript de levis.ca — le site a peut-être changé (voir README, « Le gisement »).");
  })();
  return jetonPromesse;
}

export async function graphql(query, variables = {}) {
  const res = await requete(GRAPHQL, {
    method: 'POST',
    accept: 'application/json',
    headers: { 'Content-Type': 'application/json', 'X-Craft-Authorization': `Bearer ${await jeton()}` },
    body: JSON.stringify({ query, variables }),
    notFoundIsNull: false,
  });
  const r = await res.json();
  if (r.errors?.length) throw new Error('GraphQL : ' + r.errors.map((e) => e.message).join(' | '));
  return r.data;
}

// ---------- Les séances ----------

// Les instances, avec le préfixe de leurs numéros de résolution dans les procès-verbaux.
export const INSTANCES = {
  CV: { code: 'CV', nom: 'Conseil de la Ville', court: 'Conseil de la Ville' },
  CE: { code: 'CE', nom: 'Comité exécutif', court: 'Comité exécutif' },
  CAD: { code: 'CAD', nom: "Conseil d'arrondissement de Desjardins", court: 'Desjardins', secteur: 'desjardins' },
  CACCE: { code: 'CACCE', nom: "Conseil d'arrondissement des Chutes-de-la-Chaudière-Est", court: 'Chutes-de-la-Chaudière-Est', secteur: 'chutes-de-la-chaudiere-est' },
  CACCO: { code: 'CACCO', nom: "Conseil d'arrondissement des Chutes-de-la-Chaudière-Ouest", court: 'Chutes-de-la-Chaudière-Ouest', secteur: 'chutes-de-la-chaudiere-ouest' },
};
const INSTANCE_PAR_SECTEUR = Object.fromEntries(Object.values(INSTANCES).filter((i) => i.secteur).map((i) => [i.secteur, i.code]));

const REQUETE_SEANCES = `query($year:[QueryArgument], $offset:Int) {
  s: participationsCitoyennesStructureEntries(site:["fr"], year:$year, limit:200, offset:$offset, orderBy:"dateElement DESC") {
    uid title url
    ... on participationCitoyenneStructure_Entry {
      cancelledElement
      dateElement
      type: selectOneParticipationTypeElement { slug }
      secteur: selectSecteurElement { slug }
      odjAssetsElement { url dateModified }
      pvAssetsElement { url dateModified }
      docDecisions: assetsElement { title url }
    }
  }
}`;

// Quelle instance a tenu la séance. Le type et l'arrondissement viennent de l'API ; les
// procès-verbaux du comité exécutif n'ont pas de type (ils sont publiés sur la page du comité,
// titrés « Procès-verbal de la séance du … ») : on les reconnaît au nom de leur fichier.
export function instanceDeSeance(e) {
  const type = e.type?.[0]?.slug ?? '';
  const secteur = e.secteur?.[0]?.slug ?? '';
  if (/arrondissement/.test(type)) return INSTANCE_PAR_SECTEUR[secteur] ?? null;
  if (/conseil-municipal/.test(type)) return 'CV';
  const fichiers = [...(e.pvAssetsElement ?? []), ...(e.odjAssetsElement ?? [])].map((a) => a.url.split('/').pop()).join(' ');
  if (/(?:^|[^A-Z])(?:PV)?CE[-_ ]?\d{4}/.test(fichiers)) return 'CE';
  if (/(?:^|[^A-Z])(?:PV)?CV[-_ ]?\d{4}/.test(fichiers)) return 'CV';
  return null;
}

export async function seancesDeLAnnee(annee) {
  const entrees = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const { s } = await graphql(REQUETE_SEANCES, { year: [String(annee)], offset });
    entrees.push(...s);
    if (s.length < 200) break;
  }
  return entrees.map((e) => {
    const instance = instanceDeSeance(e);
    const date = String(e.dateElement ?? '').slice(0, 10);
    const extra = /extraordinaire|extra\b/i.test(e.title + ' ' + (e.pvAssetsElement ?? []).map((a) => a.url).join(' '));
    return {
      id: `${instance ?? 'INCONNUE'}_${date}${extra ? '_EXTRA' : ''}`,
      uid: e.uid,
      instance,
      nom: instance ? INSTANCES[instance].nom : null,
      date,
      variante: extra ? 'EXTRA' : 'ORDI',
      titre: e.title,
      page: e.url,
      annulee: Boolean(e.cancelledElement),
      pv: e.pvAssetsElement?.[0]?.url ?? null,
      pvModifieLe: e.pvAssetsElement?.[0]?.dateModified ?? null,
      odj: e.odjAssetsElement?.[0]?.url ?? null,
      documents: (e.docDecisions ?? []).map((d) => ({ titre: d.title, url: d.url })),
    };
  });
}
