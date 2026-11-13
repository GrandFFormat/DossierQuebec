// Index des adresses de la Ville de Québec → district électoral et quartier, pour la recherche
// « Qui me représente ? » de la page Conseil (12 nov. 2026).
//
//   node scrapers/adresses.js
//
// Sources (Données Québec, Ville de Québec, CC BY 4.0) :
//   - « Adresses de la Ville de Québec » : 210 000 points d'adresse avec longitude et latitude ;
//   - « Districts électoraux » et « Quartiers » : les contours COMPLETS (pas la version simplifiée
//     de la carte, qui classerait mal les adresses près d'une frontière).
// Chaque adresse est placée dans son district et son quartier par le calcul point-dans-polygone,
// ici, une fois par semaine. Aucun service de géolocalisation externe, aucune adresse tapée par un
// visiteur n'est envoyée nulle part : la page lit un petit fichier par lettre et cherche chez lui.
//
// Sortie : data/adresses/<lettre>.json — { "voie normalisée": [libellé, [[no, district, quartier], …]] }
// et data/adresses/index.json (quartiers, date, nombre).

import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

import { UA, DISTRICTS, QUARTIERS, lire, polygones, trouver, nomQuartier, numeroDistrict } from '../lib/geo.js';

const ADRESSES = 'https://www.donneesquebec.ca/recherche/dataset/2567eac8-a3ce-423a-a43d-6b8e74708c1d/resource/cef2c0b7-8eac-4466-9a0b-6987501edace/download/vdq-adresse.csv';

// La même normalisation que la page (contrats et conseil) : sans accents, sans articles en tête.
export function cleVoie(nom) {
  return String(nom ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim()
    .replace(/^((DE|DU|DES|LA|LE|LES|L|D|DE LA|DE L)\s+)+/, '')
    .replace(/\s+/g, ' ');
}

const [csv, geoD, geoQ] = await Promise.all([lire(ADRESSES), lire(DISTRICTS), lire(QUARTIERS)]);
const champNum = numeroDistrict;
const districts = polygones(geoD, (p) => ({ numero: champNum(p) }));
if (districts.some((d) => !Number.isFinite(d.numero))) {
  throw new Error(`Districts : numéro introuvable dans les propriétés (${Object.keys(JSON.parse(geoD).features[0].properties).join(', ')}).`);
}
const quartiers = polygones(geoQ, (p) => ({ nom: nomQuartier(p) }));
const nomsQuartiers = [...new Set(quartiers.map((q) => q.nom))].sort((a, b) => a.localeCompare(b, 'fr'));

const lignes = csv.replace(/^﻿/, '').split(/\r?\n/);
const entetes = lignes[0].split(',');
const col = (n) => entetes.indexOf(n);
// Contrôle : l'arrondissement inscrit par la Ville pour l'adresse doit être celui du district calculé.
const cArr = col('ARRONDISSEMENT');
// « Arrondissement des Rivières » (districts) et « Les Rivières » (adresses) : on retire les mots vides.
const sansAccent = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(arrondissement|de|des|du|la|les|le)\b/g, '').replace(/[^a-z]/g, '');
let arrDistrict = new Map();
try { arrDistrict = new Map(JSON.parse(readFileSync('data/districts.json', 'utf8')).districts.map((x) => [x.numero, sansAccent(x.arrondissement)])); } catch {}
let ecarts = 0; const paires = {};
const [cNo, cOr, cNom, cLien, cType, cLon, cLat] = ['NO_CIVIQUE', 'ORIENTATION', 'NOM_VOIE', 'LIEN_VOIE', 'TYPE_VOIE', 'LONGITUDE', 'LATITUDE'].map(col);
const parLettre = {};
let n = 0, horsDistrict = 0;
for (const l of lignes.slice(1)) {
  if (!l) continue;
  const v = l.split(',');
  const x = Number(v[cLon]), y = Number(v[cLat]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  const d = trouver(districts, x, y);
  if (!d) { horsDistrict++; continue; }
  const attendu = arrDistrict.get(d.numero);
  if (attendu && v[cArr] && !attendu.includes(sansAccent(v[cArr])) && !sansAccent(v[cArr]).includes(attendu)) { ecarts++; paires[attendu + " <> " + sansAccent(v[cArr])] = (paires[attendu + " <> " + sansAccent(v[cArr])] || 0) + 1; }
  const q = trouver(quartiers, x, y);
  const cle = cleVoie(v[cNom]) + (v[cOr] ? ' ' + v[cOr] : '');
  const lettre = (cle[0] || '_').replace(/[^A-Z0-9]/, '_');
  // NOM_VOIE porte déjà l'article (« DES JARDINS ») : LIEN_VOIE le répéterait.
  const libelle = [v[cType], v[cNom], v[cOr]].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const voies = (parLettre[lettre] ||= {});
  const voie = (voies[cle] ||= [libelle, []]);
  voie[1].push([v[cNo], d.numero, q ? nomsQuartiers.indexOf(q.nom) : -1]);
  n++;
}

rmSync('data/adresses', { recursive: true, force: true });
mkdirSync('data/adresses', { recursive: true });
for (const [lettre, voies] of Object.entries(parLettre)) {
  for (const v of Object.values(voies)) v[1].sort((a, b) => (parseInt(a[0], 10) || 0) - (parseInt(b[0], 10) || 0));
  writeFileSync(`data/adresses/${lettre}.json`, JSON.stringify(voies));
}
writeFileSync('data/adresses/index.json', JSON.stringify({
  source: 'Adresses, Districts électoraux et Quartiers de la Ville de Québec, Données Québec (CC BY 4.0)',
  extraction: new Date().toISOString(), adresses: n, quartiers: nomsQuartiers, lettres: Object.keys(parLettre).sort(),
}));
console.log(`Adresses : ${n} placées (${horsDistrict} hors des districts), ${ecarts} en désaccord avec l'arrondissement inscrit, ${Object.keys(parLettre).length} fichiers.`);
