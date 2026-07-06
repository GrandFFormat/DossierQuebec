// Injecte data/ministers.json dans veille-assnat.html, entre les marqueurs
// MINISTERS_DATA_START / MINISTERS_DATA_END (le tableau `ministers`).

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/ministers.json';
const HTML_PATH = 'veille-assnat.html';
const START_MARKER = '/* MINISTERS_DATA_START';
const END_MARKER = '/* MINISTERS_DATA_END */';

function esc(s) {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));

  const rows = data.ministers
    .map((m) => `  {name:'${esc(m.name)}', role:'${esc(m.role)}', party:'${m.party ?? ''}', roleEn:'${esc(m.roleEn)}'},`)
    .join('\n');

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs MINISTERS_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block = `${START_MARKER} — généré automatiquement par scrapers/build-ministers-data.js\n   à partir de data/ministers.json (voir scrapers/ministers.js). Scrapé en direct\n   depuis quebec.ca/premiere-ministre/equipe/conseil-des-ministres. Ne pas éditer\n   ce bloc à la main. */\nconst ministers = [\n${rows}\n];\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx + END_MARKER.length);
  writeFileSync(HTML_PATH, updated);
  console.log(`${data.ministers.length} ministres injectés dans ${HTML_PATH}`);
}

main();
