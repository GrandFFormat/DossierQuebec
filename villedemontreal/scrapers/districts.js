// Les 58 districts électoraux de Montréal (découpage 2025-2029), en géométrie.
//
//   node scrapers/districts.js [--tolerance=0.00008]
//
// Source : jeu « Élections municipales - Districts électoraux » du portail de données
// ouvertes de la Ville (CC-BY 4.0). Le jeu garde les découpages des élections
// précédentes à côté du courant : on prend la ressource GeoJSON la plus récente, en
// préférant celle dont le nom porte « 2025 ».
//
// Même traitement qu'à Québec : simplification Douglas-Peucker avec correction
// cos(latitude) — à 45,5°, un degré de longitude vaut 0,70 degré de latitude — et
// arrondi à cinq décimales. Puis jointure avec data/elus.json PAR NOM DE DISTRICT (le jeu
// ne numérote pas les districts ; on leur attribue un numéro stable en les triant par
// arrondissement puis par nom, et une clé de jointure).
//
// Les contradictions entre le GeoJSON et la liste des élus sont consignées (`ecarts`),
// jamais écrasées.

import { writeFile, readFile } from 'node:fs/promises';
import { jeu, ressource, texte, PORTAIL_DONNEES } from '../lib/mtl.js';
import { cle } from '../lib/noms.js';

export const JEU = 'districts-electoraux';
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

// Les propriétés du GeoJSON ne sont pas connues d'avance (la Ville a changé de schéma
// entre deux élections) : on cherche par familles de noms et on dit ce qu'on a trouvé.
function propriete(p, ...candidats) {
  const cles = Object.keys(p);
  for (const c of candidats) {
    const trouve = cles.find((k) => k.toLowerCase() === c.toLowerCase()) ?? cles.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (trouve && p[trouve] != null && String(p[trouve]).trim() !== '') return String(p[trouve]).trim();
  }
  return null;
}

async function chargerElus() {
  try {
    const data = JSON.parse(await readFile(new URL('../data/elus.json', import.meta.url), 'utf8'));
    return new Map((data.membres ?? []).filter((m) => m.districtCle && m.siegeAuConseilMunicipal).map((m) => [m.districtCle, m]));
  } catch {
    return new Map();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const tolerance = Number(args.tolerance ?? 0.00008);

  const j = await jeu(JEU);
  const r = ressource(j, 'GeoJSON', '2025') ?? ressource(j, 'JSON', 'geo');
  if (!r) throw new Error(`aucune ressource GeoJSON dans le jeu « ${JEU} »`);
  console.log(`Source : ${r.url} (${r.name ?? ''}, modifié ${r.last_modified ?? '?'})`);
  const brut = await texte(r.url, { notFoundIsNull: false });
  const geo = JSON.parse(brut);
  if (geo.features?.[0]) console.log(`Propriétés : ${Object.keys(geo.features[0].properties ?? {}).join(' | ')}`);

  const elus = await chargerElus();
  const districts = [];
  const ecarts = [];
  let pointsAvant = 0;
  let pointsApres = 0;

  for (const feature of geo.features ?? []) {
    const p = feature.properties ?? {};
    const nom = propriete(p, 'NOM_DISTRICT', 'NOM_DIS', 'NM_DIS', 'DISTRICT', 'NOM', 'NAME', 'LIBELLE');
    const arrondissement = propriete(p, 'NOM_ARROND', 'ARRONDISSEMENT', 'NM_ARON', 'ARROND', 'ARR');
    const numeroSource = propriete(p, 'NO_DISTRICT', 'NO_DIS', 'NUMERO', 'NUM', 'CODE', 'ID');
    if (!feature.geometry) continue;
    const anneauxBruts = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    const anneaux = anneauxBruts
      .map((anneau) => {
        pointsAvant += anneau.length;
        const simplifie = arrondir(douglasPeucker(anneau, tolerance));
        pointsApres += simplifie.length;
        return simplifie;
      })
      .filter((anneau) => anneau.length >= 4);

    const cleDistrict = cle(nom);
    const elu = elus.get(cleDistrict);
    if (!elu && nom) ecarts.push(`District « ${nom} » : aucun élu de ville correspondant dans data/elus.json`);
    if (elu && arrondissement && elu.arrondissement && cle(arrondissement) !== cle(elu.arrondissement)) {
      ecarts.push(`District « ${nom} » : arrondissement « ${arrondissement} » (GeoJSON) vs « ${elu.arrondissement} » (liste des élus)`);
    }
    districts.push({
      numero: null,
      numeroSource,
      cle: cleDistrict,
      nom,
      parti: elu?.parti ?? null,
      conseiller: elu?.nomComplet ?? null,
      arrondissement: elu?.arrondissement ?? arrondissement ?? null,
      telephone: elu?.telephone ?? null,
      formulaireCourriel: elu?.formulaireCourriel ?? null,
      photo: elu?.photo ?? null,
      roles: elu?.roles ?? [],
      anneaux,
    });
  }

  // Un district par arrondissement peut porter le même nom que l'arrondissement (Anjou,
  // Lachine, LaSalle… élisent leurs conseillers de ville sans district nommé) : la clé
  // reste unique tant que l'arrondissement est dans le nom. Sinon on le signale.
  const vues = new Map();
  for (const d of districts) vues.set(d.cle, (vues.get(d.cle) ?? 0) + 1);
  for (const [k, n] of vues) if (n > 1) ecarts.push(`Clé « ${k} » portée par ${n} districts — jointure ambiguë`);

  districts.sort((a, b) => (a.arrondissement ?? '').localeCompare(b.arrondissement ?? '') || (a.nom ?? '').localeCompare(b.nom ?? ''));
  districts.forEach((d, i) => {
    d.numero = i + 1;
  });

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
    source: `${PORTAIL_DONNEES}dataset/${JEU}`,
    fichier: r.url,
    licence: 'CC-BY 4.0 — Ville de Montréal, portail de données ouvertes',
    simplification: { methode: 'Douglas-Peucker', tolerance, decimales: 5 },
    cadre: { ouest, est, sud, nord },
    nombre: districts.length,
    ecarts,
    districts,
  };

  await writeFile(OUT, JSON.stringify(payload), 'utf8');
  console.log(`${districts.length} districts écrits dans data/districts.json`);
  console.log(`Contours : ${pointsAvant} points -> ${pointsApres} (${Math.round(brut.length / 1024)} ko -> ${Math.round(JSON.stringify(payload).length / 1024)} ko)`);
  if (districts.length !== 58) console.warn(`⚠ ${districts.length} districts au lieu de 58 (découpage 2025-2029) — vérifier la ressource choisie.`);
  if (ecarts.length) {
    console.log('\n⚠ Écarts entre les deux sources de la Ville :');
    for (const e of ecarts) console.log('  ' + e);
  } else console.log('Aucun écart entre le GeoJSON et la liste des élus.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
