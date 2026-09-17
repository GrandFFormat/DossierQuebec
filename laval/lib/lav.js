// Client de source pour la Ville de Laval : le pendant de lib/gpd.js à Québec, lib/mtl.js à
// Montréal et lib/lgl.js à Longueuil.
//
// Laval publie ses documents décisionnels à deux endroits :
//
//   1. L'INDEX — la page « Ordre du jour, procès-verbaux et sommaire décisionnel » de laval.ca,
//      un tableau wpDataTables servi par admin-ajax.php (POST, pagination côté serveur). Une
//      ligne par document : nom de fichier, instance, sous-type, type, date de séance, numéro
//      et titre (sommaires seulement), version, lien. 4 360 lignes depuis mai 2023.
//   2. LES PDF — un stockage Azure de la Ville, sans pare-feu :
//      https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_PV_ORD_18h30_2026_09_01_2.0.pdf
//      Le nom porte l'instance, le genre, le sous-type, l'HEURE RÉELLE d'ouverture (18h33 pour un
//      procès-verbal, 18h30 pour l'ordre du jour de la même séance), la date et la version.
//
// LE PARE-FEU. laval.ca est derrière Cloudflare, qui refuse (403) tout client qui n'est pas un
// navigateur, quel que soit le User-Agent — alors que robots.txt autorise explicitement
// admin-ajax.php. On ne le contourne pas : pas de navigateur sans tête, pas de faux User-Agent.
// La Ville a été écrite le 14 septembre 2026 (README, étape 2). En attendant sa réponse, l'index
// vient d'une capture faite à la main dans un navigateur (data/index-documents.json) ;
// scrapers/index.js essaie chaque jour de le lire en ligne et garde la capture tant que ça
// échoue. Les PDF, eux, se lisent normalement, et c'est là qu'est toute la matière.

import { estPdf } from './pdf.js';

export const SITE = 'https://www.laval.ca/';
export const PAGE_INDEX = 'https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/ordre-jour-proces-verbaux-sommaire/';
export const AJAX_INDEX = 'https://www.laval.ca/wp-admin/admin-ajax.php?action=get_wdtable&table_id=11';
export const STOCKAGE = 'https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/';
export const PAGE_ELUS = 'https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/';
// Données Québec (CKAN, CC-BY 4.0) : les jeux de la Ville qu'on lit.
export const CKAN = 'https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=';
export const JEUX = {
  districts: 'limites-des-districts-electoraux-des-dernieres-elections-municipales',
  presences: 'presence-des-elus-au-conseil-municipal',
};

// Ce que notre robot laisse comme contact dans son User-Agent. LAV_CONTACT dans
// l'environnement ; à défaut, l'adresse du volet.
const CONTACT = process.env.LAV_CONTACT || 'https://dossierquebec.ca/laval/';
export const USER_AGENT = `DossierVille/0.1 (veille citoyenne; ${CONTACT})`;

const DELAY_MS = Number(process.env.LAV_DELAY_MS || 600);
let dernierAppel = 0;

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = dernierAppel + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  dernierAppel = Date.now();
}

// Le refus du pare-feu, reconnaissable pour que les scrapers le distinguent d'une panne.
export class ErreurBloque extends Error {
  constructor(url, status) {
    super(`HTTP ${status} sur ${url} — laval.ca refuse les clients hors navigateur (Cloudflare) ; voir README, étape 2.`);
    this.bloque = true;
    this.status = status;
  }
}

// Un fetch poli : throttle, User-Agent, quatre tentatives avec recul sur 429/5xx et sur les
// erreurs réseau. Un 404 rend `null`. Un 403 de laval.ca lève ErreurBloque sans réessayer :
// insister ne sert à rien et ce n'est pas poli.
export async function requete(url, { accept, notFoundIsNull = true, method = 'GET', body, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, { method, body, headers: { 'User-Agent': USER_AGENT, ...(accept ? { Accept: accept } : {}), ...headers }, redirect: 'follow' });
    } catch (err) {
      lastError = err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    if (res.status === 404 && notFoundIsNull) return null;
    if (res.status === 403 && /laval\.ca\//.test(url)) throw new ErreurBloque(url, res.status);
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

// Un PDF, ou null. Le stockage répond 404 (en XML) à un sommaire qui n'est pas publié — ceux du
// comité exécutif, par exemple : on ne les devine pas, on lit l'index.
export async function pdf(url) {
  const data = await octets(url, { accept: 'application/pdf' });
  return data && estPdf(data) ? data : null;
}

// ---------- les instances ----------

export const INSTANCES = {
  CM: { nom: 'Conseil municipal', actif: true },
  CE: { nom: 'Comité exécutif', actif: true },
};
export const INSTANCES_ACTIVES = Object.keys(INSTANCES).filter((k) => INSTANCES[k].actif);

export const SOUS_TYPES = { ORD: 'Ordinaire', EXT: 'Extraordinaire', PUB: 'Publique', HC: 'Huis clos' };
export const GENRES = { PV: 'Procès-verbal', ODJ: 'Ordre du jour', SD: 'Sommaire décisionnel' };

// « CM_PV_ORD_18h30_2026_09_01_2.0.pdf » -> instance, genre, sous-type, heure, date, version.
// « SD-2026-4237_1.0.pdf » -> genre SD, numéro, version. Un nom hors gabarit rend null.
export function lireNomFichier(fichier) {
  const nom = String(fichier ?? '').split('/').pop();
  let m = nom.match(/^(CM|CE)_(PV|ODJ)_(ORD|EXT|PUB|HC)_(\d{2})h(\d{2})_(\d{4})_(\d{2})_(\d{2})(?:_(\d+\.\d+))?(?:-\d+)?\.pdf$/i);
  if (m) {
    const [, instance, genre, sousType, hh, mm, aaaa, mois, jj, version] = m;
    return {
      instance: instance.toUpperCase(),
      genre: genre.toUpperCase(),
      sousType: sousType.toUpperCase(),
      heure: `${hh}h${mm}`,
      minutes: Number(hh) * 60 + Number(mm),
      date: `${aaaa}-${mois}-${jj}`,
      version: version ? Number(version) : 0,
    };
  }
  m = nom.match(/^(SD-\d{4}-\d+)_(\d+\.\d+)\.pdf$/i);
  if (m) return { genre: 'SD', numero: m[1].toUpperCase(), version: Number(m[2]) };
  return null;
}

export function urlDocument(fichier) {
  return STOCKAGE + fichier;
}

// ---------- l'index ----------

// Une ligne du tableau wpDataTables, telle que l'API la rend (dix colonnes, la dernière en HTML)
// ou telle qu'un navigateur l'a capturée, ramenée à notre forme.
const INSTANCE_PAR_LIBELLE = { 'Conseil municipal': 'CM', 'Comité exécutif': 'CE' };
const GENRE_PAR_LIBELLE = { 'Ordre du jour': 'ODJ', 'Proces verbal': 'PV', 'Procès verbal': 'PV', 'Procès-verbal': 'PV', 'Sommaire décisionnel': 'SD' };

export function normaliserLigneIndex(ligne) {
  const brut = Array.isArray(ligne)
    ? { id: ligne[0], fichier: ligne[1], seance: ligne[2], sousType: ligne[3], typeDocument: ligne[4], date: ligne[5], numero: ligne[6], titre: ligne[7], version: ligne[8], url: String(ligne[9] ?? '').match(/href="([^"]+)"/)?.[1] ?? null }
    : ligne;
  const [jj, mm, aaaa] = String(brut.date ?? '').split('/');
  const date = aaaa ? `${aaaa}-${mm}-${jj}` : String(brut.date ?? '');
  return {
    id: Number(brut.id),
    fichier: String(brut.fichier ?? '').trim(),
    instance: INSTANCE_PAR_LIBELLE[String(brut.seance ?? '').trim()] ?? String(brut.seance ?? '').trim(),
    sousType: brut.sousType?.trim() || null,
    genre: GENRE_PAR_LIBELLE[String(brut.typeDocument ?? '').trim()] ?? String(brut.typeDocument ?? '').trim(),
    date,
    numero: brut.numero?.trim() || null,
    titre: brut.titre?.trim() || null,
    version: Number(String(brut.version ?? '0').replace(',', '.')) || 0,
    url: brut.url || null,
  };
}

// Lit l'index en ligne, comme le fait la page : d'abord la page elle-même (elle porte le jeton
// « wdtNonce » que l'API exige), puis un POST à admin-ajax.php qui demande tout d'un coup —
// l'API accepte length=5000, et ça évite une pagination sans départage. Lève ErreurBloque tant
// que Cloudflare refuse ; le jour où la Ville ouvre la porte, rien d'autre n'est à changer.
export async function lireIndexEnLigne() {
  const html = await texte(PAGE_INDEX, { notFoundIsNull: false, accept: 'text/html' });
  const nonce = html.match(/wdtNonceFrontendServerSide_11"[^>]*\bvalue="([0-9a-f]+)"/)?.[1] ?? html.match(/value="([0-9a-f]+)"[^>]*wdtNonceFrontendServerSide_11"/)?.[1];
  if (!nonce) throw new Error("La page de l'index n'a pas le jeton wdtNonce attendu — le tableau a peut-être changé.");
  const COLONNES = ['ID', 'Nom Fichier', 'Type de séance', 'Sous-Type de séance / Catégorie', 'Type de Document', 'Date de séance', 'Numéro', 'Titre', 'Version', 'url'];
  const corps = new URLSearchParams();
  corps.set('draw', '1');
  corps.set('start', '0');
  corps.set('length', '5000');
  corps.set('order[0][column]', '5');
  corps.set('order[0][dir]', 'desc');
  corps.set('search[value]', '');
  corps.set('search[regex]', 'false');
  corps.set('wdtNonce', nonce);
  corps.set('showAllRows', 'false');
  COLONNES.forEach((nom, i) => {
    corps.set(`columns[${i}][data]`, String(i));
    corps.set(`columns[${i}][name]`, nom);
    corps.set(`columns[${i}][searchable]`, i === 0 ? 'false' : 'true');
    corps.set(`columns[${i}][orderable]`, [2, 3, 4, 5, 6, 7].includes(i) ? 'true' : 'false');
    corps.set(`columns[${i}][search][value]`, '');
    corps.set(`columns[${i}][search][regex]`, 'false');
  });
  const res = await requete(AJAX_INDEX, { method: 'POST', body: corps, accept: 'application/json', notFoundIsNull: false, headers: { Referer: PAGE_INDEX, 'X-Requested-With': 'XMLHttpRequest' } });
  const json = await res.json();
  if (!Array.isArray(json?.data)) throw new Error("L'API de l'index n'a pas rendu de tableau « data ».");
  return { recordsTotal: Number(json.recordsTotal), documents: json.data.map(normaliserLigneIndex) };
}

// ---------- séances et sommaires, déduits de l'index ----------

// Deux documents peuvent décrire le même fichier (l'ordre du jour du 11 août 2026 existe sans
// version sur wp-content et en 2.0 sur le stockage) : on garde la version la plus haute, et à
// version égale le lien du stockage.
function meilleur(a, b) {
  if (!a) return b;
  if (b.version !== a.version) return b.version > a.version ? b : a;
  if ((b.url ?? '').startsWith(STOCKAGE) !== (a.url ?? '').startsWith(STOCKAGE)) return (b.url ?? '').startsWith(STOCKAGE) ? b : a;
  return b.id > a.id ? b : a;
}

// Les séances : un procès-verbal et un ordre du jour appariés. Ils ne portent pas la même heure
// (l'ordre du jour dit 18h30, le procès-verbal l'heure réelle, 18h33) : on regroupe par instance,
// date et sous-type, puis on apparie par heure la plus proche — il arrive qu'il y ait deux séances
// extraordinaires le même jour (15 décembre 2025 : 16h00 et 17h30).
//
// L'identifiant est stable : « CM-20260203-ORD-18h30 », l'heure étant celle de l'ordre du jour
// quand il existe (publié en premier) et sinon celle du procès-verbal. `prefixe` (« CM-20260203 »)
// est ce qui ouvre les numéros de résolution de la journée.
export function seancesDepuisIndex(documents) {
  const groupes = new Map();
  for (const d of documents) {
    if (d.genre !== 'PV' && d.genre !== 'ODJ') continue;
    const lu = lireNomFichier(d.fichier);
    if (!lu || !INSTANCES[lu.instance]) continue;
    const cle = `${lu.instance}|${lu.date}|${lu.sousType}`;
    const g = groupes.get(cle) ?? { instance: lu.instance, date: lu.date, sousType: lu.sousType, PV: new Map(), ODJ: new Map() };
    const doc = { ...d, heure: lu.heure, minutes: lu.minutes, version: lu.version || d.version };
    g[lu.genre].set(lu.heure, meilleur(g[lu.genre].get(lu.heure), doc));
    groupes.set(cle, g);
  }
  const seances = [];
  for (const g of groupes.values()) {
    const odjs = [...g.ODJ.values()].sort((a, b) => a.minutes - b.minutes);
    const pvs = [...g.PV.values()].sort((a, b) => a.minutes - b.minutes);
    const paires = [];
    // Autant d'ordres du jour que de procès-verbaux : dans l'ordre. Sinon, chaque procès-verbal
    // prend l'ordre du jour libre le plus proche en heure.
    if (odjs.length === pvs.length) {
      odjs.forEach((o, i) => paires.push({ odj: o, pv: pvs[i] }));
    } else {
      // Les couples les plus proches d'abord, à moins de deux heures d'écart ; ce qui reste va seul.
      const couples = [];
      pvs.forEach((pv, i) => odjs.forEach((o, j) => couples.push({ i, j, ecart: Math.abs(o.minutes - pv.minutes) })));
      couples.sort((a, b) => a.ecart - b.ecart);
      const pvPris = new Set();
      const odjPris = new Set();
      for (const c of couples) {
        if (c.ecart > 120 || pvPris.has(c.i) || odjPris.has(c.j)) continue;
        pvPris.add(c.i);
        odjPris.add(c.j);
        paires.push({ pv: pvs[c.i], odj: odjs[c.j] });
      }
      pvs.forEach((pv, i) => !pvPris.has(i) && paires.push({ pv, odj: null }));
      odjs.forEach((o, j) => !odjPris.has(j) && paires.push({ pv: null, odj: o }));
    }
    for (const { odj, pv } of paires) {
      const heure = (odj ?? pv).heure;
      const compact = g.date.replace(/-/g, '');
      seances.push({
        id: `${g.instance}-${compact}-${g.sousType}-${heure}`,
        instance: g.instance,
        nom: INSTANCES[g.instance].nom,
        date: g.date,
        heure,
        sousType: g.sousType,
        sousTypeLibelle: SOUS_TYPES[g.sousType] ?? g.sousType,
        prefixe: `${g.instance}-${compact}`,
        pv: pv ? { url: pv.url ?? urlDocument(pv.fichier), fichier: pv.fichier, version: pv.version, heure: pv.heure } : null,
        odj: odj ? { url: odj.url ?? urlDocument(odj.fichier), fichier: odj.fichier, version: odj.version, heure: odj.heure } : null,
      });
    }
  }
  return seances.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

// Les sommaires décisionnels : un fichier par numéro, mais l'index le liste une fois par passage
// au conseil (dépôt du projet de règlement, avis de motion, adoption — jusqu'à trois dates). On
// garde le fichier de la version la plus haute et la liste des passages.
export function sommairesDepuisIndex(documents) {
  const par = new Map();
  for (const d of documents) {
    if (d.genre !== 'SD') continue;
    const lu = lireNomFichier(d.fichier);
    const numero = lu?.numero ?? d.numero;
    if (!numero) continue;
    const s = par.get(numero) ?? { numero, fichier: null, url: null, version: -1, passages: [] };
    if ((lu?.version ?? d.version) > s.version) {
      s.fichier = d.fichier;
      s.url = d.url ?? urlDocument(d.fichier);
      s.version = lu?.version ?? d.version;
    }
    if (!s.passages.some((p) => p.date === d.date && p.titre === d.titre)) s.passages.push({ date: d.date, titre: d.titre, instance: d.instance });
    par.set(numero, s);
  }
  for (const s of par.values()) s.passages.sort((a, b) => a.date.localeCompare(b.date));
  return par;
}
