// Index des adresses de Lévis → district électoral et secteur, pour « Près de chez moi » (12 nov. 2026).
// Même mécanique que quebec/scrapers/adresses.js : point-dans-polygone ici, petit fichier par lettre
// pour la page, aucune adresse tapée par un visiteur n'est envoyée nulle part.
//
//   node scrapers/adresses.js
//
// Sources (Données Québec, Ville de Lévis, CC BY 4.0) : « Adresse ponctuelle », « Districts
// électoraux », « Secteur ».
//
// LIMITES DE 2022. Les contours des districts publiés par la Ville datent de 2022 et la Ville les a
// légèrement ajustés pour l'élection de 2025 (data/districts.json le dit déjà). Chaque adresse à moins
// de 100 m d'une limite de district est marquée : la page avertit qu'elle est peut-être de l'autre côté.
//
// Sortie : data/adresses/<lettre>.json — { "voie": [libellé, [[no, district, secteur, prèsLimite], …]] }
// et data/adresses/index.json (secteurs, date, nombre).

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lire, csv, polygones, trouver } from '../../quebec/lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const ADRESSES = 'https://www.donneesquebec.ca/recherche/dataset/c7811bb5-ed56-4356-a574-7b32193f990d/resource/8254bc8f-8b0f-4085-8213-3449553e0d27/download/adresse-ponctuelle.csv';
const DISTRICTS = 'https://www.donneesquebec.ca/recherche/dataset/e53425f2-e4cc-4eec-b978-0b862c7a0c56/resource/ee12484f-cc90-4340-9edc-8e17de3e1422/download/districts-electoraux.json';
const SECTEURS = 'https://www.donneesquebec.ca/recherche/dataset/b68b2510-5704-48ba-95ca-cb2cf1c25d61/resource/daa9a1ef-23ad-4570-81ec-e613e9c7c37b/download/secteur.json';
const LIMITE_M = 100;

// La même normalisation que la page : sans accents, sans articles en tête.
const cleVoie = (nom) => String(nom ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ').trim()
  .replace(/^((DE|DU|DES|LA|LE|LES|L|D|DE LA|DE L)\s+)+/, '')
  .replace(/\s+/g, ' ');

// Distance approximative en mètres d'un point au bord le plus proche d'une liste d'anneaux.
const M_LAT = 111320;
function distanceBord(x, y, polys) {
  const mLon = M_LAT * Math.cos((y * Math.PI) / 180);
  let min = Infinity;
  for (const p of polys) for (const anneau of p) {
    for (let i = 1; i < anneau.length; i++) {
      const ax = (anneau[i - 1][0] - x) * mLon, ay = (anneau[i - 1][1] - y) * M_LAT;
      const bx = (anneau[i][0] - x) * mLon, by = (anneau[i][1] - y) * M_LAT;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      min = Math.min(min, Math.hypot(px, py));
    }
  }
  return min;
}

const [brut, geoD, geoS] = await Promise.all([lire(ADRESSES), lire(DISTRICTS), lire(SECTEURS)]);
const districts = polygones(geoD, (p) => ({ numero: Number(p.ID) }));
const secteurs = polygones(geoS, (p) => ({ nom: p.NOM }));
const nomsSecteurs = [...new Set(secteurs.map((s) => s.nom))].sort((a, b) => a.localeCompare(b, 'fr'));

const lignes = csv(brut);
const h = lignes[0];
const c = (n) => h.indexOf(n);
const [cNo, cOr, cNom, cLien, cType, cLat, cLon] = ['NO_CIVIQUE', 'ORIENTATION', 'NOM_VOIE', 'LIEN_VOIE', 'TYPE_VOIE', 'LAT', 'LONG'].map(c);
if ([cNo, cNom, cLat, cLon].some((i) => i < 0)) throw new Error(`Adresses de Lévis : colonnes changées (${h.join(', ')}).`);

const parLettre = {};
let n = 0, hors = 0, presLimite = 0;
for (const l of lignes.slice(1)) {
  const x = Number(l[cLon]), y = Number(l[cLat]);
  if (!l[cNo] || !Number.isFinite(x) || !Number.isFinite(y)) continue;
  const d = trouver(districts, x, y);
  if (!d) { hors++; continue; }
  const s = trouver(secteurs, x, y);
  // Seules comptent les limites partagées avec un AUTRE district : le fleuve et la limite de la ville
  // ne bougent pas d'un découpage à l'autre.
  const proche = districts.some((o) => o !== d && x > o.bornes[0] - 0.002 && x < o.bornes[2] + 0.002 && y > o.bornes[1] - 0.002 && y < o.bornes[3] + 0.002 && distanceBord(x, y, o.polys) < LIMITE_M) ? 1 : 0;
  presLimite += proche;
  const cle = cleVoie(`${l[cLien] ?? ''} ${l[cNom]}`) + (l[cOr] ? ' ' + l[cOr].toUpperCase() : '');
  const lettre = (cle[0] || '_').replace(/[^A-Z0-9]/, '_');
  const libelle = [l[cType], l[cLien], l[cNom], l[cOr]].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const voie = ((parLettre[lettre] ||= {})[cle] ||= [libelle, []]);
  voie[1].push([l[cNo], d.numero, s ? nomsSecteurs.indexOf(s.nom) : -1, proche]);
  n++;
}

rmSync('data/adresses', { recursive: true, force: true });
mkdirSync('data/adresses', { recursive: true });
for (const [lettre, voies] of Object.entries(parLettre)) {
  for (const v of Object.values(voies)) v[1].sort((a, b) => (parseInt(a[0], 10) || 0) - (parseInt(b[0], 10) || 0));
  writeFileSync(`data/adresses/${lettre}.json`, JSON.stringify(voies));
}
writeFileSync('data/adresses/index.json', JSON.stringify({
  source: 'Adresse ponctuelle, Districts électoraux et Secteur de la Ville de Lévis, Données Québec (CC BY 4.0)',
  extraction: new Date().toISOString(), adresses: n, quartiers: nomsSecteurs, limiteMetres: LIMITE_M,
}));
console.log(`Adresses de Lévis : ${n} placées (${hors} hors des districts), ${presLimite} à moins de ${LIMITE_M} m d'une limite, ${Object.keys(parLettre).length} fichiers.`);
