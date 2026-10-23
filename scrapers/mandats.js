// Nombre de mandats de chaque député·e (23 oct. 2026, Martin : « tu marqueras si c'est un deuxième
// ou troisième mandat »). La fiche de chaque député·e sur assnat.qc.ca liste ses élections
// (« Élu député de la circonscription de … aux élections générales du … », « Réélue … », élections
// partielles comprises) : un mandat = une de ces lignes. On lit la liste des député·e·s, puis
// chaque fiche, et on écrit data/mandats.json { assnatId: n }.
//
// Les mandats ne changent qu'aux élections : ce script se relance à la main après une élection
// ou une partielle (node scrapers/mandats.js, puis node scrapers/build-deputes-data.js), il ne
// fait pas partie de la tournée quotidienne.
import { writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

const BASE = 'https://www.assnat.qc.ca';
const UA = 'Mozilla/5.0 (DossierQuébec; +https://dossierquebec.ca)';
const OUT = 'data/mandats.json';

const lire = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.text();
};

async function main() {
  const $ = cheerio.load(await lire(`${BASE}/fr/deputes/index.html`));
  const fiches = new Map();
  $('a[href*="/fr/deputes/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/fr\/deputes\/[^/]+-(\d+)\/index\.html$/);
    if (m) fiches.set(Number(m[1]), href.startsWith('http') ? href : BASE + href);
  });
  const mandats = {};
  for (const [id, url] of fiches) {
    const texte = cheerio.load(await lire(url))('body').text().replace(/\s+/g, ' ');
    const n = (texte.match(/(?:Réélue?|Élue?) députée? de la circonscription/g) || []).length;
    if (n) mandats[id] = n;
    else console.log(`  ⚠ aucune élection lue sur ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  writeFileSync(OUT, JSON.stringify({ source: 'assnat.qc.ca, fiche de chaque député·e', lu: new Date().toISOString().slice(0, 10), mandats }, null, 2) + '\n');
  console.log(`${Object.keys(mandats).length} député·e·s sur ${fiches.size} écrit·e·s dans ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
