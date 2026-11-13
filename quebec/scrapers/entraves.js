// Entraves à la circulation (travaux en cours) par quartier, pour « Travaux en cours » dans la recherche
// par adresse de la page Conseil (12 nov. 2026).
//
//   node scrapers/entraves.js
//
// Source : « Entraves à la circulation en temps réel de la Ville de Québec », Données Québec (CC BY 4.0),
// flux WZDx. Lu chaque matin avec le reste du volet : la page montre l'état du matin, pas le temps réel,
// et le dit. Les entraves d'une même chantier (une par direction) sont regroupées par leur « parent ».
// Aucun lien n'est fait avec les contrats du SEAO : le flux ne porte aucun numéro de contrat et le
// rapprochement par nom de rue donnait surtout de faux liens (vérifié le 12 nov. 2026).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUARTIERS, lire, polygones, trouver, nomQuartier } from '../lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const FLUX = 'https://quebec.gewi.com/wzdx4waze/pull';
const nomsQuartiers = JSON.parse(readFileSync('data/adresses/index.json', 'utf8')).quartiers;
const [brut, geoQ] = await Promise.all([lire(FLUX), lire(QUARTIERS)]);
const quartiers = polygones(geoQ, (p) => ({ nom: nomQuartier(p) }));

const premierPoint = (g) => {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') return g.coordinates[0];
  if (g.type === 'MultiLineString') return g.coordinates[0]?.[0];
  return null;
};

const vus = new Set();
const parQuartier = {};
let n = 0;
for (const f of JSON.parse(brut).features ?? []) {
  const p = f.properties?.core_details ?? f.properties ?? {};
  if (p.event_status && p.event_status !== 'active') continue;
  const cle = p.relationship?.parents?.[0] ?? `${(p.road_names ?? []).join('/')}|${p.start_date}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  const pt = premierPoint(f.geometry);
  const q = pt ? trouver(quartiers, pt[0], pt[1]) : null;
  const i = q ? nomsQuartiers.indexOf(q.nom) : -1;
  if (i < 0) continue;
  // La description répète les dates à la fin (« du 2026-11-12 08:00 jusqu'au … ») : on les retire,
  // la page les affiche à part.
  const description = String(p.description ?? '').replace(/,?\s*du \d{4}-\d{2}-\d{2}.*$/, '').trim();
  // « via Chemin Ste-Foy, … » : c'est le détour d'un chantier déjà compté, pas un chantier.
  if (!description || /^via\s/i.test(description)) continue;
  // Le premier point du chantier (latitude, longitude) sert au lien « voir sur la carte » de la page.
  (parQuartier[i] ||= []).push([description, (p.start_date ?? '').slice(0, 10), (p.end_date ?? '').slice(0, 10), p.vehicle_impact ?? '', +pt[1].toFixed(5), +pt[0].toFixed(5)]);
  n++;
}
for (const l of Object.values(parQuartier)) l.sort((a, b) => a[2].localeCompare(b[2]));
writeFileSync('data/entraves.json', JSON.stringify({
  source: 'Entraves à la circulation en temps réel de la Ville de Québec, Données Québec (CC BY 4.0)',
  extraction: new Date().toISOString(), parQuartier,
}));
console.log(`Entraves : ${n} chantiers actifs placés dans ${Object.keys(parQuartier).length} quartiers.`);
