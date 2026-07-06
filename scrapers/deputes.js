// Scraper — Liste des 125 député·e·s (nom, circonscription, parti)
//
// Source : la page d'index des députés sur assnat.qc.ca (HTML statique, un seul
// fetch — même page déjà utilisée par depute-emails.js pour les courriels).
// Contrairement au courriel (voir depute-emails.js), la région administrative
// n'est PAS dans ce tableau — seulement nom, circonscription et parti. On la
// préserve donc depuis le tableau `deputesRaw` déjà présent dans veille-assnat.html
// (assignation géographique stable : une circonscription ne change pas de région
// d'une élection à l'autre, contrairement au nom du député ou à son parti).
//
// Si une nouvelle circonscription apparaît sans correspondance dans l'ancien
// tableau (élection partielle, redécoupage), la région est laissée à `null`
// plutôt que devinée — jamais de donnée inventée.

import { readFileSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

const INDEX_URL = 'https://www.assnat.qc.ca/fr/deputes/index.html';
const HTML_PATH = 'veille-assnat.html';
const OUT_PATH = 'data/deputes.json';
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';
const START_MARKER = '/* DEPUTES_DATA_START';
const END_MARKER = '/* DEPUTES_DATA_END */';

const PARTY_CODES = {
  'Coalition avenir Québec': 'CAQ',
  'Parti libéral du Québec': 'PLQ',
  'Québec solidaire': 'QS',
  'Parti québécois': 'PQ',
  'Parti conservateur du Québec': 'PCQ',
  'Indépendant': 'IND',
  'Indépendante': 'IND',
};

// Même logique que norm() dans veille-assnat.html — insensible aux accents/casse,
// pour tolérer les petites incohérences de graphie entre les pages assnat.qc.ca
// (ex. "Etienne Grandmont" sans accent sur une page, "Étienne Grandmont" ailleurs).
function foldName(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(rawName) {
  // Format brut : "Bachand, André " (Nom, Prénom) -> "André Bachand"
  const cleaned = rawName.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([^,]+),\s*(.+)$/);
  return match ? `${match[2]} ${match[1]}` : cleaned;
}

function loadExistingRegions() {
  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs DEPUTES_DATA_START/END introuvables dans ${HTML_PATH}`);
  }
  const block = html.slice(startIdx, endIdx);
  const rows = [...block.matchAll(/\["([^"]+)","([^"]+)","([^"]+)","([^"]+)"\]/g)];
  const regionByName = new Map();
  for (const [, name, , region] of rows) regionByName.set(foldName(name), region);
  return regionByName;
}

async function main() {
  const regionByName = loadExistingRegions();

  const res = await fetch(INDEX_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const deputes = [];
  $('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const nameLink = $(cells[0]).find('a').first();
    if (nameLink.length === 0) return;
    const name = normalizeName(nameLink.text());
    const riding = $(cells[1]).text().replace(/\s+/g, ' ').trim();
    const partyFull = $(cells[2]).text().replace(/\s+/g, ' ').trim();
    const party = PARTY_CODES[partyFull] ?? null;

    const region = regionByName.get(foldName(name)) ?? null;

    // ID numérique interne assnat.qc.ca (ex. "/fr/deputes/bachand-andre-17859/index.html"
    // -> 17859). Sert de clé fiable pour rapprocher chaque député·e du détail nominatif
    // des votes, où le même ID identifie la personne sans ambiguïté (contrairement au
    // nom de famille seul, que plusieurs député·e·s peuvent partager).
    const href = nameLink.attr('href') || '';
    const idMatch = href.match(/-(\d+)\/index\.html$/);
    const assnatId = idMatch ? Number(idMatch[1]) : null;

    deputes.push({ name, riding, region, party, partyFull, assnatId });
  });

  const missingRegion = deputes.filter((d) => !d.region);
  const missingParty = deputes.filter((d) => !d.party);
  const missingId = deputes.filter((d) => !d.assnatId);

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { source: INDEX_URL, scrapedAt: new Date().toISOString(), count: deputes.length, deputes },
      null,
      2
    )
  );

  console.log(`${deputes.length} député·e·s écrit·e·s dans ${OUT_PATH}`);
  if (missingRegion.length) console.log(`  ⚠ ${missingRegion.length} sans région connue : ${missingRegion.map((d) => d.name).join(', ')}`);
  if (missingParty.length) console.log(`  ⚠ ${missingParty.length} avec un intitulé de parti non reconnu : ${missingParty.map((d) => `${d.name} (${d.partyFull})`).join(', ')}`);
  if (missingId.length) console.log(`  ⚠ ${missingId.length} sans ID assnat détecté : ${missingId.map((d) => d.name).join(', ')}`);
}

main().catch((err) => {
  console.error('Échec du scraper deputes.js :', err);
  process.exitCode = 1;
});
