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
import { estPdf } from './pdf.js';

export const PORTAIL_DONNEES = 'https://donnees.montreal.ca/';
export const API_CKAN = 'https://donnees.montreal.ca/api/3/action/';
export const SITE = 'https://montreal.ca/';
export const DOCUMENTS = 'https://ville.montreal.qc.ca/documents/Adi_Public/';

// Ce que notre robot laisse comme contact dans son User-Agent, pour que la Ville puisse
// nous joindre si notre trafic la dérange. MTL_CONTACT dans l'environnement ; à défaut,
// l'adresse du site.
const CONTACT = process.env.MTL_CONTACT || 'https://dossierquebec.ca/montreal/';
export const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;

const DELAY_MS = Number(process.env.MTL_DELAY_MS || 600);
// donnees.montreal.ca demande « Crawl-Delay: 10 » dans son robots.txt (lu le 13 septembre
// 2026, conservé dans data/robots.json). On le respecte : dix secondes entre deux requêtes
// à ce portail — cinq ou six par jour, ça ne coûte rien.
const DELAIS_PAR_HOTE = { 'donnees.montreal.ca': Number(process.env.MTL_DELAY_DONNEES_MS || 10000) };
const dernierAppelParHote = new Map();

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(url = '') {
  let hote = '';
  try {
    hote = new URL(url).host;
  } catch {
    hote = '';
  }
  const delai = DELAIS_PAR_HOTE[hote] ?? DELAY_MS;
  const dernier = Math.max(dernierAppelParHote.get(hote) ?? 0, dernierAppelParHote.get('') ?? 0);
  const wait = dernier + delai - Date.now();
  if (wait > 0) await sleep(wait);
  dernierAppelParHote.set(hote, Date.now());
  dernierAppelParHote.set('', Date.now());
}

// Un fetch poli : throttle, User-Agent, quatre tentatives avec recul sur 429/5xx et sur
// les erreurs réseau. Un 404 est rendu tel quel (`null`) : pour les documents de séance,
// « ce fichier n'existe pas » est une réponse normale, pas une panne.
export async function requete(url, { accept, notFoundIsNull = true } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(url);
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
    // Un 403 sur un document public : certains serveurs refusent les User-Agent qu'ils ne
    // connaissent pas. On se représente une fois sous une forme de navigateur, en gardant
    // notre nom et notre contact dedans — on ne se cache pas, on se présente autrement.
    if (res.status === 403 && attempt === 0) {
      await throttle(url);
      const res2 = await fetch(url, { headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT})`, ...(accept ? { Accept: accept } : {}) }, redirect: 'follow' });
      if (res2.ok) return res2;
      if (res2.status === 404 && notFoundIsNull) return null;
    }
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

// LES 19 CONSEILS D'ARRONDISSEMENT. Chaque code a été relevé dans une URL réellement
// publiée par la Ville — aucun n'est déduit d'une règle. La règle n'existe d'ailleurs
// pas : « Mhm », « Rdp », « Vsm » prennent l'initiale de chaque composante du nom,
// « Ahu », « Lac », « Out » les trois premières lettres, et « Las »/« Lac » comme
// « Slt »/« Sld » ne sont que des désambiguïsations (LaSalle et Lachine, Saint-Laurent
// et Saint-Léonard commencent pareil).
//
// L'HEURE fait partie du nom du fichier, donc il faut la connaître pour construire une
// URL. Elle est stable dans le temps, contrairement à la date. Trois familles : la
// plupart siègent à 19 h, trois à 18 h 30, deux à 19 h 30. `heuresSecours` couvre les
// changements annoncés mais pas encore visibles dans les noms de fichiers — Côte-des-
// Neiges–Notre-Dame-de-Grâce a annoncé 18 h 30 en 2025, ses fichiers disent encore 19 h.
export const ARRONDISSEMENTS_CODES = {
  'Ahuntsic-Cartierville': { code: 'Ahu', heure: '19h00' },
  Anjou: { code: 'Anj', heure: '19h00' },
  'Côte-des-Neiges–Notre-Dame-de-Grâce': { code: 'Cdn', heure: '19h00', heuresSecours: ['18h30'] },
  Lachine: { code: 'Lac', heure: '19h00' },
  LaSalle: { code: 'Las', heure: '19h00' },
  "L'Île-Bizard–Sainte-Geneviève": { code: 'Ibs', heure: '19h30' },
  'Mercier–Hochelaga-Maisonneuve': { code: 'Mhm', heure: '18h30' },
  'Montréal-Nord': { code: 'Mtn', heure: '19h00' },
  Outremont: { code: 'Out', heure: '19h00' },
  'Pierrefonds-Roxboro': { code: 'Pir', heure: '19h00' },
  // Le Plateau-Mont-Royal ne publie rien sous Adi_Public, et c'est établi, pas supposé :
  // 900 requêtes le 15 septembre 2026 — six codes plausibles (Pmr, Plt, Pla, Lpm, Pmt,
  // Plm) sur 65 dates de 2026 et deux formes, puis huit heures sur le code Pmr — n'ont
  // trouvé aucun document. Les dix-huit autres conseils en rendent tous. On garde donc
  // le code relevé, mais on plafonne la dépense : `budget` borne ce qu'on accepte de
  // perdre à le redemander, assez pour s'en apercevoir le jour où la Ville publiera.
  // C'est l'un des points du courriel envoyé au Service des données ouvertes.
  'Le Plateau-Mont-Royal': { code: 'Pmr', heure: '19h00', budget: 40, absentDuRepertoire: true },
  'Rivière-des-Prairies–Pointe-aux-Trembles': { code: 'Rdp', heure: '19h00' },
  'Rosemont–La Petite-Patrie': { code: 'Rpp', heure: '19h00' },
  'Saint-Laurent': { code: 'Slt', heure: '19h30' },
  'Saint-Léonard': { code: 'Sld', heure: '19h00' },
  'Le Sud-Ouest': { code: 'Sud', heure: '19h00' },
  Verdun: { code: 'Ver', heure: '19h00' },
  'Ville-Marie': { code: 'Vma', heure: '18h30' },
  'Villeray–Saint-Michel–Parc-Extension': { code: 'Vsm', heure: '18h30' },
};

// Du code vers le nom : « CA_Mhm » -> « Mercier–Hochelaga-Maisonneuve ».
export const ARRONDISSEMENT_PAR_CODE = Object.fromEntries(
  Object.entries(ARRONDISSEMENTS_CODES).map(([nom, a]) => [`CA_${a.code}`, { nom, ...a }])
);

// Les heures à essayer pour un arrondissement, l'habituelle d'abord.
export function heuresArrondissement(nom) {
  const a = ARRONDISSEMENTS_CODES[nom];
  if (!a) return [];
  return [a.heure, ...(a.heuresSecours ?? [])];
}

// Une instance d'arrondissement s'écrit CA_<code> partout : répertoire, nom de fichier,
// et clé de séance.
export function instanceArrondissement(nom) {
  const a = ARRONDISSEMENTS_CODES[nom];
  return a ? `CA_${a.code}` : null;
}

export function estInstanceArrondissement(instance) {
  return typeof instance === 'string' && instance.startsWith('CA_');
}

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
    // Quatre formes coexistent, et un même conseil passe de l'une à l'autre d'une année
    // à l'autre : « ODJ_LPP » (liens vers les pièces publiques), « ODJ_LP », « ODJ » nu,
    // et « ODJP » en un seul bloc, très répandu dans les arrondissements. On les essaie
    // toutes et on garde la première qui répond.
    return [
      urlDocument({ ...base, qualificatif: 'LPP' }),
      urlDocument({ ...base, qualificatif: 'LP' }),
      urlDocument(base),
      urlDocument({ ...base, genre: 'ODJP' }),
      urlDocument({ ...base, qualificatif: 'ADOPTE' }),
    ];
  }
  return [urlDocument(base)];
}

// Essaie chaque URL et garde la trace de ce que chacune a répondu : c'est ce qui permet,
// depuis le fichier de données, de comprendre pourquoi une séance n'a pas de procès-verbal
// (404 = pas encore publié ; 403 = refusé ; autre = à regarder).
export async function premierDocument(candidats) {
  const essais = [];
  for (const url of candidats) {
    try {
      const data = await octets(url, { accept: 'application/pdf' });
      if (data && estPdf(data)) return { url, data, essais };
      if (data && data.length) {
        const extrait = new TextDecoder().decode(data.slice(0, 4000)).replace(/\s+/g, ' ');
        const titre = extrait.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
        essais.push({ url, resultat: 'pas un PDF' + (titre ? ` — page « ${titre} »` : ''), extrait: extrait.slice(0, 300) });
      } else essais.push({ url, resultat: data ? 'réponse vide' : '404' });
    } catch (err) {
      essais.push({ url, resultat: String(err.message ?? err) });
    }
  }
  return { url: null, data: null, essais };
}

// Identifiant stable d'une séance : « CM_2026-01-26_13h00 ».
export function idSeance({ instance, date, heure }) {
  return `${instance}_${date}_${heureFichier(heure)}`;
}
