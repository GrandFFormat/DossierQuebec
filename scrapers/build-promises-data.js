// Injecte data/promises.json dans index.html, entre les marqueurs
// PROMISES_DATA_START / PROMISES_DATA_END.
//
// ⚠️ Contrairement aux autres builds, la source n'est PAS scrapée : les
// promesses électorales sont saisies à la main (le choix des promesses est un
// acte éditorial, et plusieurs sites de partis bloquent l'accès automatisé).
// Ce script sert seulement à porter data/promises.json — facile à éditer — vers
// la page, sans avoir à fouiller dans un index.html de 7000 lignes.

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/promises.json';
const HTML_PATH = 'gabarit.html';   // le MODÈLE, jamais servi : les pages en sont tirées
const START_MARKER = '/* PROMISES_DATA_START';
const END_MARKER = '/* PROMISES_DATA_END */';

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));
  const promises = (data.promises || []).map((p) => ({
    id: p.id,
    party: p.party,
    theme: p.theme,
    quote: p.quote,
    sourceLabel: p.sourceLabel,
    sourceUrl: p.sourceUrl,
    sourceType: p.sourceType || 'primaire',
    capturedAt: p.capturedAt,
    draft: Boolean(p.draft),
  }));

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs PROMISES_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block =
    `${START_MARKER} — généré par scrapers/build-promises-data.js à partir de\n` +
    `   data/promises.json (saisi à la main). Éditer le JSON, pas ce bloc.\n` +
    `   Généré le ${new Date().toISOString()} */\n` +
    `const promises = ${JSON.stringify(promises, null, 2)};\n`;

  writeFileSync(HTML_PATH, html.slice(0, startIdx) + block + html.slice(endIdx));
  console.log(`${promises.length} promesse(s) injectée(s) dans ${HTML_PATH}`);
}

main();
