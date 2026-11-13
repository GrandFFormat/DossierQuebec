// Index des adresses de Montréal → district électoral et quartier, pour « Près de chez moi » (12 nov. 2026).
// Même mécanique que quebec/scrapers/adresses.js : point-dans-polygone ici, petit fichier par lettre pour
// la page, aucune adresse tapée par un visiteur n'est envoyée nulle part.
//
//   node scrapers/adresses.js
//
// Sources (donnees.montreal.ca, Ville de Montréal, CC BY 4.0) : « Adresse ponctuelle », « Élections
// municipales - Districts électoraux » (2025), « Quartiers de référence en habitation ».
// Une adresse de Montréal peut couvrir une plage de numéros (« 6215-6223 ») : on garde le début et la fin.
//
// Sortie : data/adresses/<lettre>.json — { "voie": [libellé, [[de, à, district, quartier], …]] }, où
// district est le NO_DISTRICT de la Ville (= numeroSource de data/districts.json) ; data/adresses/index.json.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { csv, polygones, trouver } from '../../quebec/lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

// Le portail refuse les clients sans en-tête de navigateur (« RBAC: access denied »).
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; DossierQuebec/1.0; +https://dossierquebec.ca/montreal/)' };
const lire = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`); return r.text(); };
const ADRESSES = 'https://donnees.montreal.ca/dataset/63317d72-426e-41fa-bfef-b0f28bb06ce1/resource/fed5fd02-5535-458e-b13f-66e7a31a6d78/download/adresses.csv';
const DISTRICTS = 'https://donnees.montreal.ca/dataset/70acec75-c2b4-4d26-a399-facc7b0ad9bf/resource/fa1f8cfc-cdbf-42fd-9979-32c16b68b5ca/download/districts-electoraux-2025.json';
const QUARTIERS = 'https://donnees.montreal.ca/dataset/f38c91a1-e33f-4475-a112-3b84b1c60c1e/resource/a80e611f-5336-4306-ba2a-fd657f0f00fa/download/quartierreferencehabitation.geojson';

const cleVoie = (nom) => String(nom ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ').trim()
  .replace(/^((DE|DU|DES|LA|LE|LES|L|D|DE LA|DE L)\s+)+/, '')
  .replace(/\s+/g, ' ');

const [brut, geoD, geoQ] = await Promise.all([lire(ADRESSES), lire(DISTRICTS), lire(QUARTIERS)]);
const districts = polygones(geoD, (p) => ({ numero: Number(p.NO_DISTRICT) }));
const quartiers = polygones(geoQ, (p) => ({ nom: p.nom_qr }));
const nomsQuartiers = [...new Set(quartiers.map((q) => q.nom))].sort((a, b) => a.localeCompare(b, 'fr'));

const lignes = csv(brut);
const h = lignes[0];
const c = (n) => h.indexOf(n);
const [cSpec, cOr, cLien, cGen, cDe, cA, cLon, cLat] = ['SPECIFIQUE', 'ORIENTATION', 'LIEN', 'GENERIQUE', 'ADDR_DE', 'ADDR_A', 'LONGITUDE', 'LATITUDE'].map(c);
if ([cSpec, cDe, cLon, cLat].some((i) => i < 0)) throw new Error(`Adresses de Montréal : colonnes changées (${h.join(', ')}).`);

const parLettre = {};
let n = 0, hors = 0;
for (const l of lignes.slice(1)) {
  const x = Number(l[cLon]), y = Number(l[cLat]);
  if (!l[cDe] || !Number.isFinite(x) || !Number.isFinite(y)) continue;
  const d = trouver(districts, x, y);
  if (!d) { hors++; continue; }
  const q = trouver(quartiers, x, y);
  const or = l[cOr] && l[cOr] !== 'X' ? l[cOr].toUpperCase() : '';
  const cle = cleVoie(`${l[cLien] ?? ''} ${l[cSpec]}`) + (or ? ' ' + or : '');
  const lettre = (cle[0] || '_').replace(/[^A-Z0-9]/, '_');
  const libelle = [l[cGen], l[cLien], l[cSpec], or].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const voie = ((parLettre[lettre] ||= {})[cle] ||= [libelle, []]);
  voie[1].push([Number(l[cDe]), Number(l[cA] || l[cDe]), d.numero, q ? nomsQuartiers.indexOf(q.nom) : -1]);
  n++;
}

rmSync('data/adresses', { recursive: true, force: true });
mkdirSync('data/adresses', { recursive: true });
for (const [lettre, voies] of Object.entries(parLettre)) {
  for (const v of Object.values(voies)) v[1].sort((a, b) => a[0] - b[0]);
  writeFileSync(`data/adresses/${lettre}.json`, JSON.stringify(voies));
}
writeFileSync('data/adresses/index.json', JSON.stringify({
  source: 'Adresse ponctuelle, Districts électoraux 2025 et Quartiers de référence en habitation, Ville de Montréal, donnees.montreal.ca (CC BY 4.0)',
  extraction: new Date().toISOString(), adresses: n, quartiers: nomsQuartiers,
}));
console.log(`Adresses de Montréal : ${n} placées (${hors} hors des districts, villes liées), ${Object.keys(parLettre).length} fichiers.`);
