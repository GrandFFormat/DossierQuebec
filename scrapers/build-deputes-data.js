// Injecte data/deputes.json dans veille-assnat.html, entre les marqueurs
// DEPUTES_DATA_START / DEPUTES_DATA_END (le tableau `deputesRaw`).

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/deputes.json';
const HTML_PATH = 'veille-assnat.html';
const START_MARKER = '/* DEPUTES_DATA_START';
const END_MARKER = '/* DEPUTES_DATA_END */';

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));

  const rows = data.deputes
    .map((d) => `["${d.name}","${d.riding}","${d.region ?? ''}","${d.party ?? ''}",${d.assnatId ?? 'null'}]`)
    .join(',');

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs DEPUTES_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block = `${START_MARKER} — généré automatiquement par scrapers/build-deputes-data.js à partir\n   de data/deputes.json (voir scrapers/deputes.js). Nom, circonscription et parti sont\n   scrapés en direct depuis assnat.qc.ca/fr/deputes/index.html à chaque exécution ; la\n   région est préservée depuis la version précédente de ce tableau (pas dispo sur la\n   page source) — assignation géographique stable, ne change pas avec les élections.\n   L'ID assnat (5e valeur) sert à rapprocher chaque député·e du détail nominatif des\n   votes (voir scrapers/votes.js) sans dépendre du nom, qui peut être ambigu.\n   [Nom complet, Circonscription, Région, Parti, ID assnat]. Ne pas éditer ce bloc à la main.\n   Généré le ${new Date().toISOString()} */\nconst deputesRaw = [\n${rows}\n];\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);
  console.log(`${data.deputes.length} député·e·s injecté·e·s dans ${HTML_PATH}`);
}

main();
