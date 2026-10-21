// SUIVRE UNE ENTREPRISE OU UN ORGANISME (21 oct. 2026), septième outil de l'abonnement. Le « _ » :
// Vercel n'en fait pas une route. Avec les seules données officielles disponibles, un organisme
// (entreprise, syndicat, association, ordre professionnel, groupe) se suit par SES MÉMOIRES DÉPOSÉS
// EN COMMISSION à l'Assemblée nationale : la colonne « Déposé par » des pages de mémoires, relevée
// par scrapers/consultations.js dans api/consultations-data.json (fichier que Vercel ne sert pas).
//
// Servi par api/export.js (?jeu=organismes, JSON, abonné·e·s seulement) et par les alertes du matin
// (api/_alertes-assemblee.js : une ligne par nouveau mémoire d'un organisme suivi). La table
// organismes_suivis (portee « assemblee ») garde la CLÉ de l'organisme (cleOrganisme), pas son nom
// affiché : scripts/supabase-organismes-retour.sql.
//
// LA RÈGLE DE REGROUPEMENT. Deux graphies sont un même organisme si elles donnent la même clé, et
// seulement dans ce cas. La clé :
//   1. sans accents ni majuscules ; « œ » devient « oe » ; apostrophes droites ou courbes, pareilles ;
//   2. tirets et traits (‑ – —) deviennent des espaces, les espaces sont ramenés à un seul ;
//   3. sans sigle final entre parenthèses, s'il est fait de MAJUSCULES, chiffres et tirets
//      (« Fédération des syndicats de l'enseignement (FSE-CSQ) ») ; une parenthèse en mots reste ;
//   4. sans forme juridique finale : inc, inc., ltée, ltd, enr. ;
//   5. sans article de tête : le, la, les, l'.
// Rien d'autre. Un pluriel, un mot en plus ou en moins (« Droit collectif » / « Droits collectifs »,
// « … de l'environnement » / « … de l'environnement du Québec ») : deux organismes séparés. On ne
// devine pas qu'un sigle seul (« TALQ ») et un nom complet sont le même groupe.
//
// LES MÉMOIRES À PLUSIEURS. « A, B, C » (mémoire commun) reste une entrée à part. Il compte AUSSI pour
// A, B et C, mais seulement pour un morceau qui est, tel quel, le nom d'un organisme qui a déposé seul
// au moins une fois : une virgule peut faire partie d'un nom (« Association du Barreau canadien,
// Division du Québec »), on ne coupe donc jamais au hasard.
//
// LES PERSONNES. Un « Déposé par » qui commence par Madame, Monsieur, Maître, Docteur ou Docteure est
// une personne, pas un organisme : il n'est ni cherchable ni suivable ici.

import crypto from 'node:crypto';
import { chargerConsultations } from './_consultations.js';

export const ORGANISMES_MAX = 10;      // par abonné·e ; le même chiffre est dans le SQL et dans commun/dq.js
export const RESULTATS_MAX = 20;       // résultats d'une recherche
export const CLE_MAX = 400;            // longueur d'une clé (même borne que le SQL)

const PERSONNE = /^(madame|monsieur|maitre|docteure?)\s/;
const SIGLE_FINAL = /\s*\(([A-Z0-9ÉÈÀÇ][A-Z0-9ÉÈÀÇ.\- ]*)\)\s*$/;
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function cleOrganisme(nom) {
  let s = String(nom ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(SIGLE_FINAL, '');                                        // 3 (avant les minuscules)
  s = sansAccents(s).replace(/[œŒ]/g, 'oe').toLowerCase()                // 1
    .replace(/[’`´]/g, "'")
    .replace(/[‐‑‒–—―-]/g, ' ')                                          // 2
    .replace(/\s+/g, ' ').trim();
  s = s.replace(/[\s,]+(inc\.?|ltee|ltd\.?|enr\.?)$/, '').trim();        // 4
  s = s.replace(/^(le |la |les |l')/, '').trim();                        // 5
  return s;
}
export const estPersonne = (nom) => PERSONNE.test(sansAccents(String(nom ?? '').trim()).toLowerCase());
// L'identifiant d'un organisme dans alertes_etat (ville « assemblee ») : la clé peut être longue.
export const cleEtatOrganisme = (cle) => `ent_${crypto.createHash('sha1').update(String(cle)).digest('hex').slice(0, 20)}`;
// Un mémoire se reconnaît à son document (MediaId de l'Assemblée), sinon à son adresse.
export const idMemoire = (m) => /DocumentGenerique_(\d+)/.exec(m.url ?? '')?.[1] ?? String(m.url ?? `${m.date}|${m.numero}|${m.depose}`);

// L'index : { organismes: Map clé → { cle, nom, graphies, memoires: [...] } }, construit une fois par
// fichier de données. Chaque mémoire porte son projet de loi et sa commission.
let _cache = { donnees: null, index: null };
export function indexOrganismes(donnees) {
  if (!donnees) return null;
  if (_cache.donnees === donnees) return _cache.index;
  const tous = [];
  for (const [id, p] of Object.entries(donnees.projets ?? {})) {
    for (const m of p.mandats ?? []) {
      for (const x of m.memoires ?? []) {
        if (!x?.depose) continue;
        tous.push({ ...x, pl: String(id), num: p.num, legislature: p.legislature, titrePl: p.titre, mandat: m.titre, commission: m.commission });
      }
    }
  }
  const organismes = new Map();
  const ajouter = (cle, graphie, memoire) => {
    if (!organismes.has(cle)) organismes.set(cle, { cle, graphies: new Map(), memoires: [], ids: new Set() });
    const o = organismes.get(cle);
    if (graphie) o.graphies.set(graphie, (o.graphies.get(graphie) ?? 0) + 1);
    const id = idMemoire(memoire);
    if (!o.ids.has(id)) { o.ids.add(id); o.memoires.push(memoire); }
  };
  // 1. Les entrées entières (seul ou à plusieurs), sauf les personnes.
  for (const x of tous) {
    if (estPersonne(x.depose)) continue;
    const cle = cleOrganisme(x.depose);
    if (cle.length < 2 || cle.length > CLE_MAX) continue;
    ajouter(cle, x.depose.replace(/\s+/g, ' ').trim(), x);
  }
  // 2. Les mémoires communs comptent aussi pour chaque morceau qui est déjà un organisme connu.
  const connus = new Set(organismes.keys());
  for (const x of tous) {
    if (!x.depose.includes(',')) continue;
    const entiere = cleOrganisme(x.depose);
    for (const morceau of x.depose.split(',')) {
      const cle = cleOrganisme(morceau);
      if (cle !== entiere && connus.has(cle) && !estPersonne(morceau)) ajouter(cle, null, x);
    }
  }
  for (const o of organismes.values()) {
    // Le nom affiché : la graphie la plus fréquente, puis la première dans l'ordre alphabétique.
    o.nom = [...o.graphies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))[0]?.[0] ?? o.cle;
    o.variantes = [...o.graphies.keys()].filter((g) => g !== o.nom);
    o.memoires.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  }
  const index = { organismes, misAJour: donnees.misAJour ?? null };
  _cache = { donnees, index };
  return index;
}

// Chercher parmi les organismes : chaque mot de la recherche doit se trouver dans la clé (même
// normalisation). Les noms qui COMMENCENT par la recherche d'abord, puis les plus actifs.
export function chercherOrganismes(index, recherche, max = RESULTATS_MAX) {
  const q = cleOrganisme(recherche);
  if (!index || q.length < 2) return [];
  const mots = q.split(' ').filter(Boolean);
  const trouves = [];
  for (const o of index.organismes.values()) {
    if (mots.every((m) => o.cle.includes(m))) trouves.push(o);
  }
  trouves.sort((a, b) => Number(b.cle.startsWith(q)) - Number(a.cle.startsWith(q)) || b.memoires.length - a.memoires.length || a.nom.localeCompare(b.nom, 'fr'));
  return trouves.slice(0, max).map(resume);
}
const resume = (o) => ({ cle: o.cle, nom: o.nom, variantes: o.variantes, memoires: o.memoires.length });

// Un organisme et ses mémoires, tel que Mon dossier le montre ; null s'il n'existe pas (ou plus).
export function organisme(index, cle) {
  const o = index?.organismes.get(String(cle));
  if (!o) return null;
  return {
    ...resume(o),
    liste: o.memoires.map((m) => ({ date: m.date ?? null, titre: m.titre ?? '', depose: m.depose, url: m.url ?? null, pl: m.pl, num: m.num, legislature: m.legislature, titrePl: m.titrePl, commission: m.commission ?? '' })),
  };
}

export function chargerIndex() {
  return indexOrganismes(chargerConsultations());
}
