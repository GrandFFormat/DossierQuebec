// Les présences des élus aux séances du conseil municipal de Laval, depuis les données
// ouvertes de la Ville — pour l'année en cours et la précédente.
//
//   node scrapers/presences.js [--annee=2026]
//
// Source : Données Québec, jeu « Présence des élus au conseil municipal » de la Ville de Laval
// (CC-BY 4.0, mise à jour mensuelle), ressource « presence-elus.json » : une ligne par personne
// et par séance depuis 2016 (6 000 lignes), clés « DATE_SÉANCE », « HEURE », « TYPE-SÉANCE »,
// « NOM », « ABSENT/PRÉSENT ». L'adresse de la ressource vient de l'API CKAN (package_show),
// qui dit aussi quand le jeu a été mis à jour (`jeuModifieLe`).
//
// LE JEU EST SALE, ET ON NE LE CORRIGE PAS EN DOUCE. Les statuts sont tapés à la main :
// « présent », « present », « présente », « presente », « prsente », « présnet », « présete »,
// « absent », « absente », « adsent », « asbent », « absent  » (espace final), « vacant ». Ils
// sont ramenés à present / absent / vacant par une TABLE EXPLICITE (STATUTS) ; ce qui n'y est
// pas devient « inconnu », compté à part, jamais deviné. Le décompte des valeurs brutes est
// écrit dans le fichier (`valeursBrutes`) pour qu'on puisse vérifier la table. Même chose pour
// les types de séance (« ordinaire  », « ajournement de la suspension »…) et pour les heures
// (« 18 h 30 », « 16 h », « 19h », « 10 H 14 », parfois absente). Les noms sont tantôt
// « Aline Dib », tantôt « DIB Aline » (2016) : NOM en capitales puis prénom, remis dans l'ordre
// (nomPresence). La jointure avec la page des élus (data/elus.json) se fait par clé de nom
// (lib/noms.js) ; un nom qui ne rejoint personne est dit dans `avertissements` — « Mohammed Bâ »
// dans le jeu, « Mohamed Bâ » sur la page : on ne tranche pas, on signale.
//
// Une SÉANCE est un triplet (date, heure normalisée, type). Piège vu dans le jeu : le 20 mai 2025,
// 22 lignes d'une séance extraordinaire portent chacune une heure différente, de « 17 h 30 » à
// « 38 h 30 » — visiblement une seule séance dont la colonne des heures a été remplie par
// glissement. On la compte telle que le jeu l'écrit (22 « séances » d'une ligne) et on le dit
// dans les avertissements de l'année : corriger serait deviner.
//
// DEUX BLOCS (`parAnnee`) : l'élection du 2 novembre 2025 a changé le conseil ; l'année
// précédente mêle l'ancien conseil (jusqu'au 1er octobre) et le nouveau (dès le 10 novembre), et
// chaque membre porte sa première et sa dernière séance de l'année pour qu'on le voie.
//
// Tolérant : si Données Québec ne répond pas, data/presences.json de la veille reste en place.
// Le jeu est en retard sur le calendrier (au 4 septembre 2026, il s'arrêtait au 18 novembre
// 2025) : `derniereSeance` dit jusqu'où il va, et une année sans ligne le dit aussi.

import { writeFile, readFile } from 'node:fs/promises';
import { texte, CKAN, JEUX } from '../lib/lav.js';
import { cle, casseDeNom, normaliserEspaces } from '../lib/noms.js';

export const JEU = JEUX.presences;
export const PAGE_JEU = `https://www.donneesquebec.ca/recherche/dataset/${JEU}`;
const OUT = new URL('../data/presences.json', import.meta.url);
const ELUS = new URL('../data/elus.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// ---------- les tables de normalisation ----------

// Les valeurs brutes rencontrées dans le jeu (relevé du 17 septembre 2026), et ce qu'elles
// veulent dire. Toute autre valeur -> « inconnu ».
export const STATUTS = {
  'présent': 'present',
  'present': 'present',
  'présente': 'present',
  'presente': 'present',
  'prsente': 'present',
  'présnet': 'present',
  'présete': 'present',
  'absent': 'absent',
  'absente': 'absent',
  'adsent': 'absent',
  'asbent': 'absent',
  'absent ': 'absent',
  'vacant': 'vacant',
};

export const TYPES = {
  'ordinaire': 'ordinaire',
  'ordinaire ': 'ordinaire',
  'extraordinaire': 'extraordinaire',
  'ajournement': 'ajournement',
  'ajournement de la suspension': 'ajournement de la suspension',
  'ajournement ordinaire': 'ajournement ordinaire',
};

export function normaliserStatut(brut) {
  const s = String(brut ?? '');
  return STATUTS[s] ?? STATUTS[s.trim().toLowerCase()] ?? 'inconnu';
}

// Le type tel que la table le connaît ; sinon le texte nettoyé, et `connu: false`.
export function normaliserType(brut) {
  const s = String(brut ?? '');
  const t = TYPES[s] ?? TYPES[s.trim().toLowerCase()];
  return t ? { type: t, connu: true } : { type: normaliserEspaces(s).toLowerCase() || null, connu: false };
}

// « 18 h 30 », « 16 h  », « 19h », « 16h30 », « 10 H 14 », « 9 h 02 » -> « 18 h 30 », « 16 h »,
// « 19 h », « 16 h 30 », « 10 h 14 », « 9 h 02 ». « 16 h 00 » devient « 16 h ». Une heure au-delà
// de 23 h (« 38 h 30 ») est gardée telle quelle mais dite invalide ; une heure absente rend null.
export function normaliserHeure(brut) {
  if (brut == null || String(brut).trim() === '') return { heure: null, valide: false };
  const m = String(brut).match(/^\s*(\d{1,2})\s*[hH]\s*(\d{2})?\s*$/);
  if (!m) return { heure: normaliserEspaces(brut), valide: false };
  const h = Number(m[1]);
  const mm = m[2] && m[2] !== '00' ? ` ${m[2]}` : '';
  return { heure: `${h} h${mm}`, valide: h <= 23 && Number(m[2] ?? 0) < 60 };
}

// « DIB Aline » -> « Aline Dib » ; « DE COTIS David » -> « David De Cotis » ; « Aline Dib »
// inchangé. Seul un NOM entièrement en capitales suivi d'un prénom en casse normale est
// retourné : on ne touche pas au reste.
export function nomPresence(brut) {
  const s = normaliserEspaces(brut);
  const m = s.match(/^((?:[\p{Lu}][\p{Lu}'’-]+ )+)([\p{Lu}][\p{Ll}][\p{L}'’-]*(?: [\p{Lu}][\p{Ll}][\p{L}'’-]*)*)$/u);
  return m ? `${m[2]} ${casseDeNom(m[1].trim())}` : s;
}

// Une ligne du jeu -> une ligne à nous. Les clés du jeu portent des accents (« DATE_SÉANCE ») :
// on les cherche sans y tenir, au cas où la Ville les changerait.
export function normaliserLigne(brute) {
  const valeur = (motif) => {
    const k = Object.keys(brute).find((x) => motif.test(x.normalize('NFD').replace(/[̀-ͯ]/g, '')));
    return k === undefined ? undefined : brute[k];
  };
  const date = String(valeur(/^DATE/i) ?? '').trim();
  const { heure, valide } = normaliserHeure(valeur(/^HEURE/i));
  const { type, connu } = normaliserType(valeur(/^TYPE/i));
  const nomBrut = String(valeur(/^NOM/i) ?? '').trim();
  const nom = nomPresence(nomBrut);
  const statutBrut = valeur(/ABSENT|PRESENT/i);
  return { date, annee: date.slice(0, 4), heure, heureValide: valide, heureBrute: valeur(/^HEURE/i) ?? null, type, typeConnu: connu, typeBrut: valeur(/^TYPE/i) ?? null, nom, nomBrut, cle: cle(nom), statut: normaliserStatut(statutBrut), statutBrut: statutBrut ?? null };
}

function compter(lignes, champ) {
  const c = {};
  for (const l of lignes) {
    const v = l[champ] == null ? '(absent)' : String(l[champ]);
    c[v] = (c[v] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

// ---------- une année ----------

// `elus` : les membres de data/elus.json, pour joindre le district et la fonction par clé de nom.
export function compilerAnnee(lignesNormalisees, annee, elus = [], { derniereSeanceDuJeu = null } = {}) {
  const lignes = lignesNormalisees.filter((l) => l.annee === String(annee));
  const avertissements = [];
  const parCle = new Map(elus.map((m) => [cle(m.nomComplet), m]));

  const seances = new Map();
  const membres = new Map();
  for (const l of lignes) {
    const k = `${l.date}|${l.heure ?? ''}|${l.type ?? ''}`;
    const s = seances.get(k) ?? { date: l.date, heure: l.heure, type: l.type, heureValide: l.heureValide, lignes: 0 };
    s.lignes++;
    seances.set(k, s);
    const elu = parCle.get(l.cle) ?? null;
    const m = membres.get(l.cle) ?? { nomComplet: elu?.nomComplet ?? l.nom, cle: l.cle, fonction: elu?.fonction ?? null, districtNumero: elu?.districtNumero ?? null, surLaPageDesElus: Boolean(elu), presences: 0, absences: 0, vacant: 0, inconnu: 0, seances: 0, premiereSeance: l.date, derniereSeance: l.date };
    m[l.statut === 'present' ? 'presences' : l.statut === 'absent' ? 'absences' : l.statut === 'vacant' ? 'vacant' : 'inconnu']++;
    m.seances++;
    if (l.date < m.premiereSeance) m.premiereSeance = l.date;
    if (l.date > m.derniereSeance) m.derniereSeance = l.date;
    membres.set(l.cle, m);
  }

  if (!lignes.length) {
    avertissements.push(`Le jeu ne couvre aucune séance de ${annee}${derniereSeanceDuJeu ? ` (dernière séance couverte : ${derniereSeanceDuJeu})` : ''}.`);
  }
  const inconnus = lignes.filter((l) => l.statut === 'inconnu');
  if (inconnus.length) avertissements.push(`${inconnus.length} ligne(s) au statut non reconnu, comptée(s) « inconnu » : ${[...new Set(inconnus.map((l) => `« ${l.statutBrut} »`))].join(', ')}`);
  const typesInconnus = [...new Set(lignes.filter((l) => !l.typeConnu).map((l) => `« ${l.typeBrut} »`))];
  if (typesInconnus.length) avertissements.push(`Type(s) de séance hors table : ${typesInconnus.join(', ')}`);
  // Les heures impossibles ou absentes, et les dates qui comptent plus de deux « séances ».
  const parDate = new Map();
  for (const s of seances.values()) parDate.set(s.date, [...(parDate.get(s.date) ?? []), s]);
  for (const [date, liste] of [...parDate].sort()) {
    const invalides = liste.filter((s) => !s.heureValide);
    if (liste.length > 2 || invalides.length) {
      const heures = liste.map((s) => s.heure ?? '(sans heure)').sort();
      avertissements.push(
        `${date} : ${liste.length} séance(s) « ${[...new Set(liste.map((s) => s.type))].join(' / ')} » avec ${liste.length} heure(s) différente(s) (${heures[0]} … ${heures.at(-1)}), ${invalides.length} invalide(s) ; ${liste.reduce((n, s) => n + s.lignes, 0)} ligne(s) au total — compté tel que le jeu l'écrit, à vérifier auprès de la Ville`
      );
    }
  }
  const nonJoints = [...membres.values()].filter((m) => !m.surLaPageDesElus && m.vacant < m.seances);
  if (nonJoints.length && elus.length) avertissements.push(`Noms absents de la page des élus (data/elus.json), sans district joint : ${nonJoints.map((m) => `${m.nomComplet} (${m.seances} séance${m.seances > 1 ? 's' : ''}, jusqu'au ${m.derniereSeance})`).join(' ; ')}`);

  const listeSeances = [...seances.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.heure).localeCompare(String(b.heure)));
  return {
    annee: String(annee),
    nombreLignes: lignes.length,
    nombreSeances: listeSeances.length,
    premiereSeance: listeSeances[0]?.date ?? null,
    derniereSeance: listeSeances.at(-1)?.date ?? null,
    seances: listeSeances,
    nombreMembres: membres.size,
    membres: [...membres.values()].sort((a, b) => b.seances - a.seances || a.nomComplet.localeCompare(b.nomComplet, 'fr')),
    valeursBrutes: { statuts: compter(lignes, 'statutBrut'), types: compter(lignes, 'typeBrut'), heures: compter(lignes, 'heureBrute') },
    avertissements,
  };
}

// ---------- la ressource sur Données Québec ----------

export async function ressourceJson() {
  const brut = await texte(CKAN + JEU, { accept: 'application/json', notFoundIsNull: false });
  const j = JSON.parse(brut);
  if (!j?.success || !Array.isArray(j.result?.resources)) throw new Error(`CKAN n'a pas rendu le jeu « ${JEU} »`);
  // Le jeu a aussi des fichiers 2013-2017 : on veut « presence-elus.json », le jeu courant.
  const r = j.result.resources.find((x) => /^presence-elus\.json$/i.test(x.name ?? '') || /\/presence-elus\.json$/i.test(x.url ?? ''));
  if (!r?.url) throw new Error(`Le jeu « ${JEU} » n'a pas de ressource presence-elus.json`);
  return { url: r.url, jeuModifieLe: j.result.metadata_modified ?? null, ressourceModifieeLe: r.last_modified ?? null, licence: j.result.license_title ?? null };
}

async function main() {
  const args = parseArgs(process.argv);
  const anneeCourante = Number(args.annee ?? new Date().getUTCFullYear());
  const annees = [anneeCourante, anneeCourante - 1];

  let ressource;
  let brut;
  try {
    ressource = await ressourceJson();
    brut = await texte(ressource.url, { accept: 'application/json', notFoundIsNull: false });
  } catch (err) {
    let precedent = null;
    try {
      precedent = JSON.parse(await readFile(OUT, 'utf8'));
    } catch {
      // rien à conserver
    }
    if (precedent) {
      console.warn(`⚠ Données Québec ne répond pas (${err.message}) : data/presences.json du ${precedent.generatedAt?.slice(0, 10)} conservé.`);
      return;
    }
    throw err;
  }
  // Un BOM UTF-8 en tête du fichier est possible : JSON.parse le refuse.
  const brutes = JSON.parse(brut.replace(/^﻿/, ''));
  if (!Array.isArray(brutes) || !brutes.length) throw new Error('presence-elus.json ne contient pas un tableau de lignes');
  const lignes = brutes.map(normaliserLigne).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date));
  if (lignes.length !== brutes.length) console.warn(`⚠ ${brutes.length - lignes.length} ligne(s) sans date au format AAAA-MM-JJ, ignorée(s).`);
  const dates = lignes.map((l) => l.date).sort();
  const derniereSeance = dates.at(-1) ?? null;

  let elus = [];
  try {
    elus = (JSON.parse(await readFile(ELUS, 'utf8')).membres ?? []).filter((m) => m.siegeAuConseilMunicipal !== false);
  } catch {
    console.log("data/elus.json absent : présences sans district joint (lancez scrapers/elus.js d'abord).");
  }

  const parAnnee = {};
  for (const a of annees) parAnnee[a] = compilerAnnee(lignes, a, elus, { derniereSeanceDuJeu: derniereSeance });

  const avertissements = [];
  if (!parAnnee[anneeCourante].nombreLignes) avertissements.push(`Le jeu s'arrête au ${derniereSeance} : aucune séance de ${anneeCourante} encore publiée (mise à jour annoncée mensuelle, jeu modifié le ${String(ressource.jeuModifieLe ?? '?').slice(0, 10)}).`);
  const inconnusTotal = lignes.filter((l) => l.statut === 'inconnu').length;
  if (inconnusTotal) avertissements.push(`${inconnusTotal} ligne(s) au statut non reconnu dans tout le jeu — à ajouter à la table STATUTS si c'est une faute de frappe évidente.`);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE_JEU,
    fichier: ressource.url,
    licence: `${ressource.licence ?? 'CC-BY 4.0'} — Ville de Laval, Données Québec`,
    jeuModifieLe: ressource.jeuModifieLe,
    ressourceModifieeLe: ressource.ressourceModifieeLe,
    obtenu: 'en ligne',
    nombreLignes: lignes.length,
    premiereSeance: dates[0] ?? null,
    derniereSeance,
    annee: String(anneeCourante),
    annees: annees.map(String),
    parAnnee,
    valeursBrutes: { statuts: compter(lignes, 'statutBrut'), types: compter(lignes, 'typeBrut') },
    tables: { statuts: STATUTS, types: TYPES },
    avertissements,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`${lignes.length} lignes lues (${dates[0]} -> ${derniereSeance}, jeu modifié le ${String(ressource.jeuModifieLe ?? '?').slice(0, 10)}) ; data/presences.json écrit.`);
  for (const a of annees) {
    const b = parAnnee[a];
    console.log(`${a} : ${b.nombreSeances} séance(s), ${b.nombreMembres} personne(s), ${b.nombreLignes} ligne(s)` + (b.nombreLignes ? ` ; ${b.membres.filter((m) => m.surLaPageDesElus).length} jointes à la page des élus` : ''));
    for (const av of b.avertissements) console.log('  ⚠ ' + av);
  }
  console.log('Statuts bruts : ' + Object.entries(payload.valeursBrutes.statuts).map(([v, n]) => `« ${v} » ${n}`).join(' · '));
  for (const av of avertissements) console.log('⚠ ' + av);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
