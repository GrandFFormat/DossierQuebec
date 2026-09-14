// Les 18 districts électoraux de Longueuil (découpage 2025-2029), en géométrie.
//
//   node scrapers/districts.js [--tolerance=0.00006]
//
// Source : la couche « District électoral » du service ArcGIS de la Ville
// (Elections2025_Districts), celle qu'affiche sa carte « Consultation des districts électoraux
// (2025-2029) ». Chaque district y porte son NUMÉRO officiel, son nom et un paragraphe sur
// l'origine du nom.
//
// ⚠ Pas le jeu « Districts électoraux » de Données Québec : sa ressource GeoJSON (vérifiée le
// 14 septembre 2026) a encore les 15 districts et les élus d'avant 2021. Il est sous licence
// CC-BY 4.0 ; la couche ArcGIS, publique, n'affiche pas de licence — la source est citée.
//
// Même traitement qu'à Québec et Montréal : simplification Douglas-Peucker avec correction
// cos(latitude), cinq décimales, puis jointure avec data/elus.json par nom de district. Les
// écarts entre les deux sources sont consignés (`ecarts`), jamais écrasés.

import { writeFile, readFile } from 'node:fs/promises';
import { texte } from '../lib/lgl.js';
import { cleStricte } from '../lib/noms.js';

export const SERVICE = 'https://services2.arcgis.com/h4XWvDXfYYyD6jNu/arcgis/rest/services/Elections2025_Districts/FeatureServer/1';
export const CARTE = 'https://longueuil.maps.arcgis.com/apps/instant/media/index.html?appid=48f43831ecd14c0fb67cd88be52653f3';
const OUT = new URL('../data/districts.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const COS_LAT = Math.cos((45.5 * Math.PI) / 180);

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
  const tolerance = Number(args.tolerance ?? 0.00006);
  const url = `${SERVICE}/query?where=1%3D1&outFields=NUMERO,DESCRIPTION,INFORMATION&returnGeometry=true&outSR=4326&f=geojson`;
  const brut = await texte(url, { notFoundIsNull: false });
  const geo = JSON.parse(brut);
  if (!geo.features?.length) throw new Error('la couche des districts ne renvoie aucun polygone');

  let elus = [];
  let vacants = [];
  try {
    const e = JSON.parse(await readFile(new URL('../data/elus.json', import.meta.url), 'utf8'));
    elus = (e.membres ?? []).filter((m) => m.district && m.siegeAuConseilMunicipal);
    vacants = e.postesVacants ?? [];
  } catch {
    // pas d'élus : la carte se dessine sans noms
  }

  const districts = [];
  const ecarts = [];
  let pointsAvant = 0;
  let pointsApres = 0;
  for (const f of geo.features) {
    const p = f.properties ?? {};
    const nom = String(p.DESCRIPTION ?? '').trim();
    const anneauxBruts = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const anneaux = anneauxBruts
      .map((anneau) => {
        pointsAvant += anneau.length;
        const simplifie = arrondir(douglasPeucker(anneau, tolerance));
        pointsApres += simplifie.length;
        return simplifie;
      })
      .filter((anneau) => anneau.length >= 4);
    const elu = elus.find((m) => cleStricte(m.district) === cleStricte(nom)) ?? null;
    const vacant = vacants.find((v) => cleStricte(v.district) === cleStricte(nom)) ?? null;
    if (!elu && !vacant) ecarts.push(`District « ${nom} » (${p.NUMERO}) : ni élu ni poste vacant dans data/elus.json`);
    districts.push({
      numero: Number(p.NUMERO),
      nom,
      origineDuNom: p.INFORMATION ?? null,
      parti: elu?.parti ?? null,
      conseiller: elu?.nomComplet ?? (vacant ? 'Poste vacant' : null),
      posteVacant: Boolean(vacant),
      arrondissement: elu?.arrondissement ?? vacant?.arrondissement ?? null,
      telephone: null,
      formulaireCourriel: null,
      photo: elu?.photo ?? null,
      roles: [],
      anneaux,
    });
  }
  for (const m of elus) {
    if (!districts.some((d) => cleStricte(d.nom) === cleStricte(m.district))) ecarts.push(`${m.nomComplet} : district « ${m.district} » absent de la couche des districts`);
  }
  districts.sort((a, b) => a.numero - b.numero);

  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  for (const d of districts) {
    for (const anneau of d.anneaux) {
      for (const [x, y] of anneau) {
        if (x < ouest) ouest = x;
        if (x > est) est = x;
        if (y < sud) sud = y;
        if (y > nord) nord = y;
      }
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: CARTE,
    fichier: SERVICE,
    licence: 'Couche publique de la Ville de Longueuil (service ArcGIS « Elections2025_Districts ») — aucune licence affichée ; source citée.',
    simplification: { methode: 'Douglas-Peucker', tolerance, decimales: 5 },
    cadre: { ouest, est, sud, nord },
    nombre: districts.length,
    ecarts,
    districts,
  };
  await writeFile(OUT, JSON.stringify(payload), 'utf8');
  console.log(`${districts.length} districts écrits dans data/districts.json`);
  console.log(`Contours : ${pointsAvant} points -> ${pointsApres} (${Math.round(brut.length / 1024)} ko -> ${Math.round(JSON.stringify(payload).length / 1024)} ko)`);
  if (districts.length !== 18) console.warn(`⚠ ${districts.length} districts au lieu de 18 (découpage 2025-2029).`);
  if (ecarts.length) {
    console.log('\n⚠ Écarts entre les deux sources de la Ville :');
    for (const e of ecarts) console.log('  ' + e);
  } else console.log('Aucun écart entre la couche des districts et la liste des élus.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
