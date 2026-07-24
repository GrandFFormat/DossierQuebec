// Met à jour la balise <lastmod> du sitemap avec une date donnée (YYYY-MM-DD).
//
// Appelé par le workflow de rafraîchissement UNIQUEMENT les jours où le contenu
// a réellement changé (voir .github/workflows/refresh.yml). But : dire à Google
// « la page a changé ce jour-là » pour qu'il revienne l'explorer plus souvent,
// sans jamais créer de commit fantôme les jours sans changement.
//
// Usage : node scripts/update-sitemap-lastmod.js 2026-07-24
//         (sans argument -> date UTC du jour)

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'sitemap.xml';
const date = (process.argv[2] || new Date().toISOString().slice(0, 10)).trim();

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`✖ Date invalide : « ${date} » (attendu AAAA-MM-JJ).`);
  process.exit(1);
}

// On lit en LF (le dépôt stocke en LF) et on réécrit en LF.
let xml = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

if (/<lastmod>[^<]*<\/lastmod>/.test(xml)) {
  // Toutes les <url> du sitemap sont datées du jour du changement.
  xml = xml.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${date}</lastmod>`);
} else {
  // Aucun <lastmod> : on en insère un après chaque <loc>.
  xml = xml.replace(/(<loc>[^<]*<\/loc>)/g, `$1\n    <lastmod>${date}</lastmod>`);
}

writeFileSync(FILE, xml, 'utf8');
console.log(`✓ sitemap.xml : lastmod = ${date} (toutes les URL)`);
