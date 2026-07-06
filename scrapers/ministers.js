// Scraper — Conseil des ministres (liste officielle)
//
// Source : quebec.ca/premiere-ministre/equipe/conseil-des-ministres — HTML
// statique normal, un seul fetch (pas besoin de Playwright). Contient un
// <div class="ministre-item"> par personne, avec son nom et un ou plusieurs
// <p> listant chaque portefeuille/fonction.
//
// Cette page liste aussi 2 rôles qui ne sont PAS des ministres (Président du
// caucus du gouvernement, Whip en chef du gouvernement) — exclus ici, ce ne
// sont pas des sièges au Conseil des ministres.
//
// Le parti n'est pas indiqué sur cette page (gouvernement à parti unique
// actuellement) : résolu par recoupement avec data/deputes.json (vraie
// source), jamais supposé.
//
// Homonymie connue : deux personnes nommées "Eric Girard" siègent toutes les
// deux au Conseil des ministres (Finances, à Groulx ; Développement
// économique régional, à Lac-Saint-Jean — vérifié par recherche externe, voir
// contexte-pour-claude-code.md). La page ne donne pas la circonscription ;
// on applique donc ici la correspondance déjà vérifiée plutôt que de deviner.
//
// L'anglais (roleEn) n'existe pas sur cette page (site officiel FR/EN séparé,
// pas scrapé ici) : préservé depuis l'ancien tableau `ministers` par
// correspondance de nom quand disponible ; sinon, traduit manuellement dans
// MANUAL_EN_OVERRIDES ci-dessous (2 nouveaux ministres non couverts avant).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as cheerio from 'cheerio';

const PAGE_URL = 'https://www.quebec.ca/premiere-ministre/equipe/conseil-des-ministres';
const HTML_PATH = 'index.html';
const OUT_PATH = 'data/ministers.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const START_MARKER = '/* MINISTERS_DATA_START';
const END_MARKER = '/* MINISTERS_DATA_END */';

// Rôles réels mais qui ne sont pas des postes de ministre — exclus du Conseil.
const NON_MINISTER_ROLES = ['président du caucus', 'whip en chef'];

// Vérifié par recherche externe (pas dans la page source) : voir le
// commentaire en tête de fichier.
const KNOWN_RIDING_BY_NAME_AND_ROLE = {
  'eric girard|ministre des finances': 'Groulx',
  'eric girard|ministre délégué au développement économique régional': 'Lac-Saint-Jean',
};

function foldName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-–—']/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadExistingRoleEn() {
  // Clé par nom COMPLET (avec suffixe "(Circonscription)" s'il est présent) en
  // priorité — deux personnes homonymes (les deux "Eric Girard") ont chacune
  // leur propre traduction, et les confondre via une clé par nom nu écraserait
  // silencieusement l'une des deux. Le nom nu ne sert de repli que si un seul
  // ministre porte ce nom (donc pas d'ambiguïté possible).
  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf('const ministers = [');
  const endIdx = html.indexOf('\n];', startIdx);
  const block = html.slice(startIdx, endIdx);
  const rows = [...block.matchAll(/\{name:'([^']+)', role:'((?:[^'\\]|\\.)*)', party:'([^']+)', roleEn:'((?:[^'\\]|\\.)*)'\}/g)];
  const bareNameCounts = new Map();
  for (const [, rawName] of rows) {
    const bareName = foldName(rawName.replace(/\s*\([^)]*\)\s*/g, '').trim());
    bareNameCounts.set(bareName, (bareNameCounts.get(bareName) ?? 0) + 1);
  }
  const roleEnByName = new Map();
  for (const [, rawName, , , rawRoleEn] of rows) {
    const roleEn = rawRoleEn.replace(/\\'/g, "'");
    roleEnByName.set(foldName(rawName), roleEn);
    const bareName = foldName(rawName.replace(/\s*\([^)]*\)\s*/g, '').trim());
    if (bareNameCounts.get(bareName) === 1) roleEnByName.set(bareName, roleEn);
  }
  return roleEnByName;
}

const MANUAL_EN_OVERRIDES = {
  'mathieu lacombe': 'Minister of Culture and Communications',
  'amelie dionne': 'Minister of Tourism',
};

async function main() {
  const roleEnByName = loadExistingRoleEn();
  const { deputes } = JSON.parse(readFileSync('data/deputes.json', 'utf-8'));

  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const ministers = [];
  const warnings = [];

  $('.ministre-item').each((_, el) => {
    const name = $(el).find('h3').first().text().replace(/\s+/g, ' ').trim();
    const roles = $(el).find('.description-ministre p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
    if (roles.length === 0) return;

    const isNonMinister = roles.every((r) => NON_MINISTER_ROLES.some((nm) => r.toLowerCase().includes(nm)));
    if (isNonMinister) return;

    const ridingHint = KNOWN_RIDING_BY_NAME_AND_ROLE[`${foldName(name)}|${roles[0].toLowerCase()}`] ?? null;
    const candidates = deputes.filter((d) => foldName(d.name) === foldName(name));
    const dep = ridingHint ? candidates.find((d) => d.riding === ridingHint) : (candidates.length === 1 ? candidates[0] : null);
    if (!dep) warnings.push(`${name} : aucune correspondance fiable dans deputes.json (parti laissé à null)`);

    const displayName = ridingHint ? `${name} (${ridingHint})` : name;
    const role = roles.join(' · ');
    const roleEn = roleEnByName.get(foldName(displayName)) ?? roleEnByName.get(foldName(name)) ?? MANUAL_EN_OVERRIDES[foldName(name)] ?? null;
    if (!roleEn) warnings.push(`${name} : pas de traduction anglaise connue (ni ancienne, ni manuelle) — laissé à null`);

    ministers.push({ name: displayName, role, roleEn, party: dep ? dep.party : null });
  });

  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ source: PAGE_URL, scrapedAt: new Date().toISOString(), count: ministers.length, ministers }, null, 2));

  console.log(`${ministers.length} ministres écrits dans ${OUT_PATH}`);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
}

main().catch((err) => {
  console.error('Échec du scraper ministers.js :', err);
  process.exitCode = 1;
});
