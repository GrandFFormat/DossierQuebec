// Met à jour la balise <lastmod> du sitemap avec une date donnée (YYYY-MM-DD).
//
// OUTIL MANUEL SEULEMENT. Aucun workflow ne l'appelle plus : .github/workflows/refresh.yml a
// cessé de le faire le 21 sept. 2026. La date quotidienne du sitemap est posée par
// scripts/build-section-pages.js, qui ne date que les pages réellement changées.
// Attention : ce script met la MÊME date sur les 7 pages de l'Assemblée (/, /ministres,
// /projets-de-loi, /votes, /promesses, /lexique, /sources), qu'elles aient changé ou non.
// Il ne touche pas aux pages des volets municipaux.
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

// Seules les pages de l'ASSEMBLÉE prennent la date du jour : c'est leur contenu que cette routine
// rafraîchit. Les pages des volets municipaux (dans le sitemap depuis le 21 sept. 2026) portent la
// date de leur décision ou de leur vote le plus récent, posée par scripts/build-section-pages.js :
// on n'y touche pas, et on n'ajoute pas de <lastmod> à celles qui n'en ont pas.
const VOLET = /<loc>https:\/\/dossierquebec\.ca\/(?:quebec|montreal|levis|longueuil|laval)\//;
let n = 0;
xml = xml.replace(/<url>[\s\S]*?<\/url>/g, (bloc) => {
  if (VOLET.test(bloc)) return bloc;
  n++;
  return /<lastmod>[^<]*<\/lastmod>/.test(bloc)
    ? bloc.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`)
    : bloc.replace(/(<loc>[^<]*<\/loc>)/, `$1\n    <lastmod>${date}</lastmod>`);
});

writeFileSync(FILE, xml, 'utf8');
console.log(`✓ sitemap.xml : lastmod = ${date} (${n} pages de l'Assemblée ; volets inchangés)`);
