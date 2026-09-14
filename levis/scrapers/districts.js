// Les 15 districts électoraux de Lévis, en géométrie, joints aux élus.
//
//   node scrapers/districts.js [--tolerance=0.00008]
//
// Source : jeu « Districts électoraux » de la Ville de Lévis sur Données Québec (CC-BY 4.0).
// On lit le fichier GeoJSON à son adresse de téléchargement, PAS l'API CKAN : le robots.txt de
// Données Québec exclut /recherche/api/ (lu le 14 septembre 2026, data/robots.json). Si la Ville
// republie le fichier sous une autre ressource, cette adresse est à mettre à jour ici.
// Chaque district porte ID (1 à 15) et NOM ; la jointure avec data/elus.json se fait par
// numéro de district, et le nom est recoupé.
//
// ⚠ LE JEU EST ANCIEN. Sa ressource GeoJSON date du 21 juillet 2022 et porte encore les
// conseillers élus en 2021 (champ CONSEILLER, ignoré ici). La Ville a depuis adopté le
// Règlement RV-2024-34-65 sur la division du territoire en districts et annoncé des
// « ajustements mineurs à la cartographie de certains districts » : les contours peuvent
// différer légèrement de ceux de 2025-2029. La carte est donc présentée comme indicative,
// `avertissement` le dit, et l'écart est consigné. On ne corrige pas les contours à la main.
//
// Même traitement qu'à Québec : simplification Douglas-Peucker avec correction cos(latitude)
// et arrondi à cinq décimales.

import { writeFile, readFile } from 'node:fs/promises';
import { requete } from '../lib/levis.js';
import { cleNom } from '../lib/pv.js';

export const JEU = 'districts-electoraux-levis';
const FICHIER = 'https://www.donneesquebec.ca/recherche/dataset/e53425f2-e4cc-4eec-b978-0b862c7a0c56/resource/ee12484f-cc90-4340-9edc-8e17de3e1422/download/districts-electoraux.json';
// Date de mise à jour de la ressource, relevée sur la page du jeu le 14 septembre 2026.
const MIS_A_JOUR = '2022-07-21';
const OUT = new URL('../data/districts.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const COS_LAT = Math.cos((46.75 * Math.PI) / 180);

function distancePerpendiculaire(p, a, b) {
  const px = (p[0] - a[0]) * COS_LAT;
  const py = p[1] - a[1];
  const bx = (b[0] - a[0]) * COS_LAT;
  const by = b[1] - a[1];
  const longueur2 = bx * bx + by * by;
  if (longueur2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / longueur2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

export function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let indexMax = 0;
  let distanceMax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distancePerpendiculaire(points[i], points[0], points[points.length - 1]);
    if (d > distanceMax) {
      distanceMax = d;
      indexMax = i;
    }
  }
  if (distanceMax <= tolerance) return [points[0], points[points.length - 1]];
  const gauche = douglasPeucker(points.slice(0, indexMax + 1), tolerance);
  const droite = douglasPeucker(points.slice(indexMax), tolerance);
  return [...gauche.slice(0, -1), ...droite];
}

const arrondir = (points) => points.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);

async function main() {
  const args = parseArgs(process.argv);
  const tolerance = Number(args.tolerance ?? 0.00008);

  const ressource = { url: FICHIER, last_modified: MIS_A_JOUR };
  console.log(`Source : ${ressource.url} (mise à jour du ${MIS_A_JOUR})`);
  const brut = await (await requete(ressource.url, { notFoundIsNull: false })).text();
  const geo = JSON.parse(brut);

  let elus = [];
  try {
    elus = JSON.parse(await readFile(new URL('../data/elus.json', import.meta.url), 'utf8')).membres ?? [];
  } catch {
    // pas d'élus : la carte se dessine sans noms
  }
  const parNumero = new Map(elus.filter((m) => m.districtNumero).map((m) => [m.districtNumero, m]));

  const ecarts = [
    `Contours du jeu ouvert mis à jour le ${String(ressource.last_modified ?? '?').slice(0, 10)}, antérieurs au Règlement RV-2024-34-65 et aux ajustements annoncés par la Ville : carte indicative.`,
  ];
  const districts = [];
  let pointsAvant = 0;
  let pointsApres = 0;
  for (const f of geo.features ?? []) {
    const p = f.properties ?? {};
    const numero = Number(p.ID ?? p.id ?? p.NUMERO);
    const nom = String(p.NOM ?? p.nom ?? '').trim() || null;
    if (!f.geometry || !numero) continue;
    const anneauxBruts = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const anneaux = anneauxBruts
      .map((anneau) => {
        pointsAvant += anneau.length;
        const s = arrondir(douglasPeucker(anneau, tolerance));
        pointsApres += s.length;
        return s;
      })
      .filter((a) => a.length >= 4);
    const elu = parNumero.get(numero) ?? null;
    if (!elu) ecarts.push(`District ${numero} « ${nom} » : aucun élu dans data/elus.json`);
    else if (cleNom(elu.district) !== cleNom(nom)) ecarts.push(`District ${numero} : « ${nom} » (GeoJSON) vs « ${elu.district} » (page des membres)`);
    districts.push({
      numero,
      cle: cleNom(nom).replace(/\s+/g, '-'),
      nom: elu?.district ?? nom,
      parti: elu?.parti ?? null,
      conseiller: elu?.nomComplet ?? null,
      arrondissement: elu?.arrondissement ?? null,
      telephone: elu?.telephone ?? null,
      formulaireCourriel: elu?.formulaireCourriel ?? null,
      photo: elu?.photo ?? null,
      roles: elu?.roles ?? [],
      anneaux,
    });
  }
  districts.sort((a, b) => a.numero - b.numero);

  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  for (const d of districts) for (const a of d.anneaux) for (const [x, y] of a) {
    if (x < ouest) ouest = x;
    if (x > est) est = x;
    if (y < sud) sud = y;
    if (y > nord) nord = y;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: `https://www.donneesquebec.ca/recherche/dataset/${JEU}`,
    fichier: ressource.url,
    licence: 'CC-BY 4.0 — Ville de Lévis, Données Québec',
    avertissement: "Contours tirés des données ouvertes de la Ville (mise à jour de 2022). La Ville a depuis ajusté légèrement certains districts : la carte est indicative ; les noms et les élus, eux, sont ceux de 2025.",
    simplification: { methode: 'Douglas-Peucker', tolerance, decimales: 5 },
    cadre: { ouest, est, sud, nord },
    nombre: districts.length,
    ecarts,
    districts,
  };
  await writeFile(OUT, JSON.stringify(payload), 'utf8');
  console.log(`${districts.length} districts écrits dans data/districts.json`);
  console.log(`Contours : ${pointsAvant} points -> ${pointsApres} (${Math.round(brut.length / 1024)} ko -> ${Math.round(JSON.stringify(payload).length / 1024)} ko)`);
  for (const e of ecarts) console.log('  ⚠ ' + e);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
