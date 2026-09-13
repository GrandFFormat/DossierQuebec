// Client de source pour la Ville de Montréal : le pendant de lib/gpd.js à Québec.
//
// Montréal n'a pas d'index de recherche plein texte ouvert au public comme le portail
// AzSearch de Québec. Ses données sortent par deux portes, et ce fichier centralise
// l'accès aux deux :
//
//   1. LE PORTAIL DE DONNÉES OUVERTES — https://donnees.montreal.ca/ — un CKAN classique,
//      sous licence CC-BY 4.0 (résolution CG14 0091). On y lit les élus, les élus du
//      conseil d'agglomération, les contours des districts, le calendrier des séances,
//      et les jeux « Contrats » et « Nominations ». L'API `package_show` donne les
//      ressources d'un jeu avec leur URL : on ne code jamais en dur l'URL d'un fichier,
//      on la retrouve à l'exécution par son format — quand la Ville republie le fichier
//      sous un autre nom, ça continue de marcher.
//
//   2. LES DOCUMENTS DES SÉANCES — procès-verbaux et ordres du jour — publiés en PDF sous
//      https://ville.montreal.qc.ca/documents/Adi_Public/<INSTANCE>/… avec un nom de
//      fichier ENTIÈREMENT PRÉVISIBLE : CM_PV_ORDI_2026-01-26_13h00_FR.pdf. Instance,
//      type, date, heure. Combiné au calendrier des séances (porte 1), ça permet de
//      construire l'URL de chaque document sans jamais gratter une page de liste.
//      Le même viewer existe sous /sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&doc=N
//      avec des identifiants séquentiels — on ne s'en sert pas : on ne peut pas deviner N.
//
// ⚠ AVANT TOUT USAGE EN VOLUME — voir README.md : les documents de montreal.ca sont
// « propriété exclusive de la Ville », reproduction d'images interdite à des fins
// commerciales ; les données ouvertes, elles, sont CC-BY. Même règle qu'à Québec :
// throttle, User-Agent identifiable, lecture incrémentale, et un courriel au greffe.

import { parserCsv } from './csv.js';

export const PORTAIL_DONNEES = 'https://donnees.montreal.ca/';
export const API_CKAN = 'https://donnees.montreal.ca/api/3/action/';
export const SITE = 'https://montreal.ca/';
export const DOCUMENTS = 'https://ville.montreal.qc.ca/documents/Adi_Public/';

// Ce que notre robot laisse comme contact dans son User-Agent, pour que la Ville puisse
// nous joindre si notre trafic la dérange. MTL_CONTACT dans l'environnement ; à défaut,
// l'adresse du site.
const CONTACT = process.env.MTL_CONTACT || 'https://dossierquebec.ca/villedemontreal/';
export const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;

const DELAY_MS = Number(process.env.MTL_DELAY_MS || 600);
let lastCallAt = 0;

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = lastCallAt + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

// Un fetch poli : throttle, User-Agent, quatre tentatives avec recul sur 429/5xx et sur
// les erreurs réseau. Un 404 est rendu tel quel (`null`) : pour les documents de séance,
// « ce fichier n'existe pas » est une réponse normale, pas une panne.
export async function requete(url, { accept, notFoundIsNull = true } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}) },
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

export async function json(url, options) {
  const res = await requete(url, { accept: 'application/json', ...options });
  return res ? res.json() : null;
}

// ---------- CKAN ----------

// Un jeu de données par son identifiant (le segment d'URL de sa page, « listes-des-elus-
// de-la-ville-de-montreal »). Renvoie l'objet CKAN : titre, licence, ressources…
export async function jeu(id) {
  const r = await json(`${API_CKAN}package_show?id=${encodeURIComponent(id)}`, { notFoundIsNull: false });
  if (!r?.success) throw new Error(`CKAN : package_show a échoué pour « ${id} »`);
  return r.result;
}

// La ressource d'un jeu par format (CSV, GeoJSON…), la plus récemment modifiée d'abord.
// `prefere` : un mot du nom ou de la description pour départager quand un jeu porte
// plusieurs fichiers du même format (Montréal garde souvent l'historique à côté du
// fichier courant).
export function ressource(jeuCkan, format, prefere = null) {
  const candidates = (jeuCkan.resources ?? [])
    .filter((r) => (r.format ?? '').toLowerCase() === format.toLowerCase() || (r.url ?? '').toLowerCase().endsWith('.' + format.toLowerCase()))
    .sort((a, b) => (b.last_modified ?? b.created ?? '').localeCompare(a.last_modified ?? a.created ?? ''));
  if (!candidates.length) return null;
  if (prefere) {
    const re = new RegExp(prefere, 'i');
    const trouve = candidates.find((r) => re.test(r.name ?? '') || re.test(r.description ?? '') || re.test(r.url ?? ''));
    if (trouve) return trouve;
  }
  return candidates[0];
}

// Lit une ressource CSV : en-têtes normalisés (minuscules, sans accents ni espaces
// superflus) dans `colonnes`, lignes en objets clés par en-tête normalisé.
export async function lireCsv(url) {
  const brut = await texte(url, { notFoundIsNull: false });
  return parserCsv(brut);
}

// ---------- Les documents de séance ----------

// Les instances centrales, avec le code que la Ville emploie dans ses noms de fichiers.
// Les conseils d'arrondissement suivent le même schéma sous CA_<code> (CA_Pmr, CA_Rpp,
// CA_Sud, CA_Pir…) — voir README pour la liste, et pour la raison de ne pas commencer
// par eux.
export const INSTANCES = {
  CM: { code: 'CM', nom: 'Conseil municipal', prefixeResolution: 'CM' },
  CG: { code: 'CG', nom: "Conseil d'agglomération", prefixeResolution: 'CG' },
  CE: { code: 'CE', nom: 'Comité exécutif', prefixeResolution: 'CE' },
};

// « 13 h » / « 13:00 » / « 13h00 » -> « 13h00 », comme dans les noms de fichiers.
export function heureFichier(h) {
  const m = String(h ?? '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}h${(m[2] ?? '00').padStart(2, '0')}`;
}

// L'URL d'un document de séance. `genre` : PV (procès-verbal) ou ODJ (ordre du jour).
// `variante` : ORDI, EXTRA (séance extraordinaire). Les ordres du jour existent en
// plusieurs versions ; `qualificatif` sert à demander « ODJ_LPP » (avec les liens vers
// les pièces publiques) ou « ODJ_ADOPTE ».
export function urlDocument({ instance, genre, variante = 'ORDI', date, heure, qualificatif = null }) {
  const h = heureFichier(heure);
  if (!h) throw new Error(`heure illisible : ${heure}`);
  const morceaux = [instance, genre, qualificatif, variante, date, h, 'FR'].filter(Boolean);
  return `${DOCUMENTS}${instance}/${morceaux.join('_')}.pdf`;
}

// Les URL à essayer, dans l'ordre, pour un document donné. La Ville n'est pas constante
// d'une instance ou d'une année à l'autre : on essaie les formes connues et on garde la
// première qui répond.
export function candidatsDocument({ instance, genre, variante, date, heure }) {
  const base = { instance, genre, variante, date, heure };
  if (genre === 'ODJ') {
    return [
      urlDocument({ ...base, qualificatif: 'LPP' }), // avec liens vers les pièces publiques (sommaires)
      urlDocument(base),
      urlDocument({ ...base, qualificatif: 'ADOPTE' }),
    ];
  }
  return [urlDocument(base)];
}

export async function premierDocument(candidats) {
  for (const url of candidats) {
    const data = await octets(url, { accept: 'application/pdf' });
    if (data && data.length > 100) return { url, data };
  }
  return null;
}

// Identifiant stable d'une séance : « CM_2026-01-26_13h00 ».
export function idSeance({ instance, date, heure }) {
  return `${instance}_${date}_${heureFichier(heure)}`;
}
