// Injecte data/petitions.json dans index.html, entre les marqueurs
// PETITIONS_DATA_START / PETITIONS_DATA_END (même principe que
// build-frontend-data.js pour les projets de loi : le prototype reste un HTML
// unique, sans fetch()).
//
// Adapte au gabarit attendu par renderPetitions() : title, titleEn, sponsor,
// start, end (YYYY-MM-DD), count (entier), url, urlEn.

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/petitions.json';
const HTML_PATH = 'index.html';
const START_MARKER = '/* PETITIONS_DATA_START';
const END_MARKER = '/* PETITIONS_DATA_END */';

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));
  const petitions = (data.petitions || []).map((p) => ({
    title: p.title,
    titleEn: p.titleEn || null,
    sponsor: p.sponsor,
    start: p.start,
    end: p.end,
    count: p.count,
    url: p.url,
    urlEn: p.urlEn,
  }));

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs PETITIONS_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block =
    `${START_MARKER} — généré automatiquement par scrapers/build-petitions-data.js à partir de\n` +
    `   data/petitions.json (voir scrapers/petitions.js). Ne pas éditer ce bloc à la main :\n` +
    `   relancer \`node scrapers/petitions.js && node scrapers/build-petitions-data.js\`.\n` +
    `   Généré le ${new Date().toISOString()} */\n` +
    `const petitions = ${JSON.stringify(petitions, null, 2)};\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);
  console.log(`${petitions.length} pétition(s) injectée(s) directement dans ${HTML_PATH}`);
}

main();
