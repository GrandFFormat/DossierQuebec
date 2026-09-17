// Les 22 districts électoraux de Laval (découpage en vigueur depuis l'élection de novembre
// 2025), en géométrie, avec la personne élue de chacun.
//
//   node scrapers/districts.js [--tolerance=0.00006]
//
// Source : Données Québec, jeu « Limites des districts électoraux des dernières élections
// municipales » de la Ville de Laval (CC-BY 4.0), ressource GeoJSON
// « limite-district-electoral.geojson ». On passe par l'API CKAN (package_show) pour trouver
// l'adresse de la ressource au lieu de l'écrire en dur : elle porte des identifiants qui changent
// à chaque republication, et c'est l'API qui dit quand le jeu a été mis à jour. 22 polygones en
// CRS84 ([lon, lat]) ; propriétés NOM, NUMERO (une chaîne : « 5 »), CONSEILLER, TEL_CELL,
// COURRIEL.
//
// Même traitement qu'à Québec, Montréal et Longueuil : simplification Douglas-Peucker avec
// correction cos(latitude) (un degré de longitude est plus court qu'un degré de latitude à 45°
// nord : sans la correction, la tolérance serait plus lâche est-ouest que nord-sud), cinq
// décimales (≈ 1 m), puis jointure avec data/elus.json PAR NUMÉRO de district. Le GeoJSON porte
// aussi un nom, un téléphone et un courriel par district : quand ils contredisent la page des
// élus (« Davis De Cotis » pour David De Cotis, un téléphone qui diffère), l'écart est consigné
// dans `ecarts` et c'est la page des élus qui fait foi — rien n'est écrasé en silence.
//
// Tolérant : si Données Québec ne répond pas, data/districts.json de la veille reste en place.

import { writeFile, readFile } from 'node:fs/promises';
import { texte, CKAN, JEUX } from '../lib/lav.js';
import { cle, cleStricte } from '../lib/noms.js';

export const JEU = JEUX.districts;
export const PAGE_JEU = `https://www.donneesquebec.ca/recherche/dataset/${JEU}`;
const OUT = new URL('../data/districts.json', import.meta.url);
const ELUS = new URL('../data/elus.json', import.meta.url);
const DISTRICTS_ATTENDUS = 22;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// ---------- simplification ----------

const COS_LAT = Math.cos((45.58 * Math.PI) / 180);

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

export const arrondir = (points) => points.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);

// ---------- les deux sources comparées ----------

const chiffres = (s) => String(s ?? '').replace(/\D/g, '');

// Les contradictions entre les propriétés d'un polygone et la fiche de l'élu du même numéro.
// Le nom du district, le nom de la personne, le téléphone (à l'espacement près ; un poste
// « #4126 » en plus compte comme un écart) et le courriel.
export function comparerSources(props, elu) {
  const ecarts = [];
  const ou = `District ${props.NUMERO} (${props.NOM})`;
  if (!elu) return [`${ou} : aucun élu de ce numéro dans data/elus.json`];
  if (cleStricte(props.NOM) !== cleStricte(elu.district)) ecarts.push(`${ou} : le district s'appelle « ${elu.district} » sur la page des élus — la page fait foi`);
  if (cle(props.CONSEILLER) !== cle(elu.nomComplet)) ecarts.push(`${ou} : « ${String(props.CONSEILLER ?? '').trim()} » dans le GeoJSON, « ${elu.nomComplet} » sur la page des élus — la page fait foi`);
  if (elu.telephone && chiffres(props.TEL_CELL) !== chiffres(elu.telephone)) ecarts.push(`${ou} : téléphone « ${String(props.TEL_CELL ?? '').trim()} » dans le GeoJSON, « ${elu.telephone} » sur la page des élus — la page fait foi`);
  if (elu.courriel && String(props.COURRIEL ?? '').trim().toLowerCase() !== elu.courriel.toLowerCase()) ecarts.push(`${ou} : courriel « ${String(props.COURRIEL ?? '').trim()} » dans le GeoJSON, « ${elu.courriel} » sur la page des élus — la page fait foi`);
  return ecarts;
}

// ---------- la ressource sur Données Québec ----------

// package_show, puis la ressource GeoJSON. Rend { url, jeuModifieLe, ressourceModifieeLe }.
export async function ressourceGeoJson() {
  const brut = await texte(CKAN + JEU, { accept: 'application/json', notFoundIsNull: false });
  const j = JSON.parse(brut);
  if (!j?.success || !Array.isArray(j.result?.resources)) throw new Error(`CKAN n'a pas rendu le jeu « ${JEU} »`);
  const r = j.result.resources.find((x) => String(x.format ?? '').toUpperCase() === 'GEOJSON' || /\.geojson$/i.test(x.url ?? ''));
  if (!r?.url) throw new Error(`Le jeu « ${JEU} » n'a pas de ressource GeoJSON`);
  return { url: r.url, nom: r.name ?? null, jeuModifieLe: j.result.metadata_modified ?? null, ressourceModifieeLe: r.last_modified ?? null, licence: j.result.license_title ?? null };
}

// ---------- assemblage ----------

export function construire(geo, elus, { tolerance }) {
  if (!geo.features?.length) throw new Error('le GeoJSON des districts ne contient aucun polygone');
  const districts = [];
  const ecarts = [];
  let pointsAvant = 0;
  let pointsApres = 0;
  for (const f of geo.features) {
    const p = f.properties ?? {};
    const numero = Number(String(p.NUMERO ?? '').trim());
    const nom = String(p.NOM ?? '').trim();
    const anneauxBruts = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const anneaux = anneauxBruts
      .map((anneau) => {
        pointsAvant += anneau.length;
        const simplifie = arrondir(douglasPeucker(anneau, tolerance));
        pointsApres += simplifie.length;
        return simplifie;
      })
      .filter((anneau) => anneau.length >= 4);
    const elu = elus.find((m) => m.districtNumero === numero) ?? null;
    ecarts.push(...comparerSources(p, elu));
    districts.push({
      numero,
      nom,
      parti: elu?.parti ?? null,
      conseiller: elu?.nomComplet ?? null,
      arrondissement: null,
      telephone: elu?.telephone ?? null,
      formulaireCourriel: null,
      courriel: elu?.courriel ?? null,
      photo: elu?.photo ?? null,
      roles: elu?.roles ?? [],
      anneaux,
    });
  }
  for (const m of elus) {
    if (m.districtNumero && !districts.some((d) => d.numero === m.districtNumero)) ecarts.push(`${m.nomComplet} : district ${m.districtNumero} (${m.district}) absent du GeoJSON`);
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
  return { districts, ecarts, cadre: { ouest, est, sud, nord }, pointsAvant, pointsApres };
}

async function main() {
  const args = parseArgs(process.argv);
  const tolerance = Number(args.tolerance ?? 0.00006);

  let ressource;
  let brut;
  try {
    ressource = await ressourceGeoJson();
    brut = await texte(ressource.url, { accept: 'application/geo+json, application/json', notFoundIsNull: false });
  } catch (err) {
    let precedent = null;
    try {
      precedent = JSON.parse(await readFile(OUT, 'utf8'));
    } catch {
      // rien à conserver
    }
    if (precedent) {
      console.warn(`⚠ Données Québec ne répond pas (${err.message}) : data/districts.json du ${precedent.generatedAt?.slice(0, 10)} conservé.`);
      return;
    }
    throw err;
  }
  const geo = JSON.parse(brut.replace(/^﻿/, ''));

  let elus = [];
  try {
    const e = JSON.parse(await readFile(ELUS, 'utf8'));
    elus = (e.membres ?? []).filter((m) => m.siegeAuConseilMunicipal !== false);
  } catch {
    console.log("data/elus.json absent : la carte se dessine sans noms (lancez scrapers/elus.js d'abord).");
  }

  const { districts, ecarts, cadre, pointsAvant, pointsApres } = construire(geo, elus, { tolerance });
  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE_JEU,
    fichier: ressource.url,
    licence: `${ressource.licence ?? 'CC-BY 4.0'} — Ville de Laval, Données Québec`,
    jeuModifieLe: ressource.jeuModifieLe,
    ressourceModifieeLe: ressource.ressourceModifieeLe,
    simplification: { methode: 'Douglas-Peucker', tolerance, decimales: 5, correctionLatitude: 45.58 },
    cadre,
    nombre: districts.length,
    ecarts,
    districts,
  };
  const json = JSON.stringify(payload);
  await writeFile(OUT, json, 'utf8');
  console.log(`${districts.length} districts écrits dans data/districts.json (jeu mis à jour le ${String(ressource.jeuModifieLe ?? '?').slice(0, 10)}).`);
  console.log(`Contours : ${pointsAvant} points -> ${pointsApres} (${Math.round(brut.length / 1024)} ko -> ${Math.round(json.length / 1024)} ko)`);
  if (districts.length !== DISTRICTS_ATTENDUS) console.warn(`⚠ ${districts.length} districts au lieu de ${DISTRICTS_ATTENDUS}.`);
  const sansElu = districts.filter((d) => !d.conseiller);
  if (sansElu.length) console.warn(`⚠ Sans élu joint : ${sansElu.map((d) => `${d.numero} ${d.nom}`).join(', ')}`);
  if (ecarts.length) {
    console.log('\n⚠ Écarts entre les deux sources de la Ville (consignés, rien d\'écrasé) :');
    for (const e of ecarts) console.log('  ' + e);
  } else console.log('Aucun écart entre le GeoJSON des districts et la page des élus.');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
