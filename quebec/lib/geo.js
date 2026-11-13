// Outils communs aux scripts qui placent des points (adresses, permis) dans les districts et les
// quartiers de la Ville de Québec (scrapers/adresses.js, scrapers/permis.js — 12 nov. 2026).

export const UA = { 'User-Agent': 'DossierQuebec/1.0 (+https://dossierquebec.ca/quebec/)' };

// Contours officiels COMPLETS (Données Québec, Ville de Québec, CC BY 4.0).
export const DISTRICTS = 'https://www.donneesquebec.ca/recherche/dataset/ca1847da-e908-43de-bd8c-588570331650/resource/105b07f0-0b65-49f3-b6e0-f9b74629aa75/download/vdq-districtelectoral.geojson';
export const QUARTIERS = 'https://www.donneesquebec.ca/recherche/dataset/5b1ae6f2-6719-46df-bd2f-e57a7034c917/resource/436c85aa-88d9-4e57-9095-b72b776a71a0/download/vdq-quartier.geojson';

export async function lire(url) {
  const rep = await fetch(url, { headers: UA });
  if (!rep.ok) throw new Error(`${url} : HTTP ${rep.status}`);
  return rep.text();
}

// CSV avec champs entre guillemets (virgules et guillemets doublés à l'intérieur).
export function csv(texte) {
  const lignes = [];
  let ligne = [], champ = '', guillemets = false;
  texte = texte.replace(/^﻿/, '');
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); ligne = []; champ = ''; }
    else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// Polygones GeoJSON → anneaux avec leur boîte englobante.
export function polygones(geojson, proprietes) {
  return JSON.parse(geojson).features.map((f) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const bornes = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polys) for (const [x, y] of p[0]) {
      bornes[0] = Math.min(bornes[0], x); bornes[1] = Math.min(bornes[1], y);
      bornes[2] = Math.max(bornes[2], x); bornes[3] = Math.max(bornes[3], y);
    }
    return { ...proprietes(f.properties), polys, bornes };
  });
}

function dansAnneau(x, y, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

export function trouver(liste, x, y) {
  for (const z of liste) {
    const b = z.bornes;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    for (const p of z.polys) if (dansAnneau(x, y, p[0]) && !p.slice(1).some((trou) => dansAnneau(x, y, trou))) return z;
  }
  return null;
}

// Le contour des quartiers porte le nom dans NOM ; celui des districts, le numéro dans ID.
export const nomQuartier = (p) => p.NOM ?? p.nom ?? p.NOM_QUARTIER;
export const numeroDistrict = (p) => Number(p.ID ?? p.NUMERO ?? NaN);
