// Permis délivrés par la Ville de Québec, par quartier, pour « Près de chez vous » dans la recherche
// par adresse de la page Conseil (12 nov. 2026).
//
//   node scrapers/permis.js
//
// Source : « Permis délivrés à la Ville de Québec », Données Québec (Ville de Québec, CC BY 4.0),
// mis à jour chaque semaine par la Ville. On garde les 12 derniers mois et seulement ce qui change le
// paysage d'un quartier : constructions, agrandissements, démolitions, lotissements. Les certificats
// d'autorisation courants (abattage, enseigne, piscine, fenêtres, galeries…) sont laissés de côté.
// Chaque permis est placé dans son quartier par ses coordonnées (lib/geo.js).
//
// Sortie : data/permis/<n>.json (un fichier par quartier, n = rang dans data/adresses/index.json ;
// chaque permis : [date, adresse, motif, numéro, latitude, longitude])
// et data/permis/index.json (compte par quartier, période).

import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUARTIERS, lire, csv, polygones, trouver, nomQuartier } from '../lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const PERMIS = 'https://www.donneesquebec.ca/recherche/dataset/879abf6e-c6b2-430a-b44a-16335467c6f6/resource/9555031e-cfc5-4b78-bec9-4ab84b549f67/download/vdq-permis.csv';

// Le même ordre de quartiers que l'index des adresses : la page passe de l'un à l'autre par le rang.
const nomsQuartiers = JSON.parse(readFileSync('data/adresses/index.json', 'utf8')).quartiers;
const [brut, geoQ] = await Promise.all([lire(PERMIS), lire(QUARTIERS)]);
const quartiers = polygones(geoQ, (p) => ({ nom: nomQuartier(p) }));

const lignes = csv(brut);
const h = lignes[0];
const c = (n) => h.indexOf(n);
const [cNo, cDate, cAdr, cDom, cType, cRaison, cLon, cLat] =
  ['NUMERO_PERMIS', 'DATE_DELIVRANCE', 'ADRESSE_TRAVAUX', 'DOMAINE', 'TYPE_PERMIS', 'RAISON', 'LONGITUDE', 'LATITUDE'].map(c);
if ([cNo, cDate, cType, cLon, cLat].some((i) => i < 0)) throw new Error(`Permis : colonnes changées (${h.join(', ')}).`);

const fin = lignes.slice(1).reduce((m, l) => ((l[cDate] || '') > m ? l[cDate] : m), '');
const debut = new Date(new Date(fin).getTime() - 365 * 864e5).toISOString().slice(0, 10);
// Lu dans RAISON, le motif précis du permis. Les branchements d'aqueduc, fenêtres, galeries et toitures
// sont des travaux d'entretien : ils noieraient les vrais changements (vérifié le 12 nov. 2026).
const RETENU = /^(Construction d.un nouveau|Construction d.un bâtiment principal|Agrandissement d.un bâtiment|Démolition d.un bâtiment principal|Ajout d.un ou plusieurs logements|Changement d.usage|Création, modification ou correction d.un ou plusieurs lots)/i;

const parQuartier = {};
let gardes = 0, horsQuartier = 0;
for (const l of lignes.slice(1)) {
  const date = l[cDate] || '';
  if (date < debut) continue;
  if (!RETENU.test((l[cRaison] || '').trim())) continue;
  const x = Number(l[cLon]), y = Number(l[cLat]);
  const q = Number.isFinite(x) && Number.isFinite(y) ? trouver(quartiers, x, y) : null;
  const i = q ? nomsQuartiers.indexOf(q.nom) : -1;
  if (i < 0) { horsQuartier++; continue; }
  // L'adresse se termine par « Québec Québec G1X1X1 » : la page n'a pas besoin de la ville ni du code postal.
  const adresse = (l[cAdr] || '').replace(/\s+Québec\s+Québec(\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d)?\s*$/i, '').trim();
  // Les coordonnées (5 décimales, environ un mètre) servent au lien « voir sur la carte » de la page.
  (parQuartier[i] ||= []).push([date, adresse, l[cRaison] || l[cDom] || l[cType], l[cNo], +y.toFixed(5), +x.toFixed(5)]);
  gardes++;
}

rmSync('data/permis', { recursive: true, force: true });
mkdirSync('data/permis', { recursive: true });
const comptes = {};
for (const [i, liste] of Object.entries(parQuartier)) {
  liste.sort((a, b) => b[0].localeCompare(a[0]));
  comptes[i] = liste.length;
  writeFileSync(`data/permis/${i}.json`, JSON.stringify(liste));
}
writeFileSync('data/permis/index.json', JSON.stringify({
  source: 'Permis délivrés à la Ville de Québec, Données Québec (CC BY 4.0)',
  extraction: new Date().toISOString(), debut, fin, comptes,
}));
console.log(`Permis : ${gardes} gardés du ${debut} au ${fin} (${horsQuartier} hors des quartiers), ${Object.keys(parQuartier).length} quartiers.`);
