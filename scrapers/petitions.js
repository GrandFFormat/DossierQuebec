// Scraper — Pétitions électroniques ouvertes à la signature
//
// Source : la page officielle « Signer une pétition électronique » de
// l'Assemblée nationale (HTML statique, un tableau propre) :
//   https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html
//
// Une ligne du tableau = une pétition ouverte. Colonnes : sujet (+ lien vers la
// page individuelle avec un ID stable « Petition-XXXXX »), député intermédiaire,
// date de début, date limite, nombre de signataires. On ne garde QUE les
// pétitions réellement ouvertes affichées là — quand une pétition ferme, elle
// disparaît de la page, donc du site (pas de donnée périmée).
//
// Scraper PUR : aucune dépendance à une clé IA. La traduction anglaise du titre
// (titleEn) est faite séparément, en « best effort », par l'étape de résumés IA
// (bill-summaries.js). On préserve ici titleEn/enSource d'un run à l'autre pour
// ne pas retraduire inutilement.
//
// ⚠️ Si le tableau attendu est introuvable (changement de structure de la page),
// on sort en erreur AU LIEU d'écrire une liste vide — sinon un simple changement
// de mise en page effacerait toutes les pétitions du site.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const URL = 'https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html';
const OUT_PATH = 'data/petitions.json';
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';

// "Nom, Prénom" -> "Prénom Nom" (comme le reste du site).
function normalizeSponsor(raw) {
  if (!raw) return null;
  const t = raw.trim();
  const m = t.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : t;
}

function parseCount(raw) {
  const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en téléchargeant ${url}`);
  return res.text();
}

function scrapePetitions(html) {
  const $ = cheerio.load(html);
  const table = $('table').first();
  if (table.length === 0) {
    throw new Error('Aucun tableau trouvé sur la page des pétitions — changement de format probable. Rien écrit.');
  }
  const petitions = [];
  table.find('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 5) return; // en-tête ou ligne incomplète
    const link = $(tds[0]).find('a').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/Petition-(\d+)/i);
    const id = idMatch ? idMatch[1] : null;
    const title = (link.text().trim() || $(tds[0]).text().trim()).replace(/\s+/g, ' ');
    if (!id || !title) return;
    const url = href.startsWith('http') ? href : new URL(href, 'https://www.assnat.qc.ca').href;
    petitions.push({
      id,
      title,
      titleEn: null, // rempli plus tard, best effort, par bill-summaries.js
      enSource: null,
      sponsor: normalizeSponsor($(tds[1]).text()),
      start: $(tds[2]).text().trim(),
      end: $(tds[3]).text().trim(),
      count: parseCount($(tds[4]).text()),
      url,
      urlEn: url.replace('/fr/', '/en/'),
    });
  });
  return petitions;
}

// Reprend titleEn/enSource de la version précédente (clé = id) pour ne pas
// retraduire ce qui n'a pas changé.
function carryTranslations(petitions) {
  if (!existsSync(OUT_PATH)) return;
  let prev;
  try {
    prev = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  } catch {
    return;
  }
  const byId = new Map((prev.petitions || []).map((p) => [p.id, p]));
  for (const p of petitions) {
    const old = byId.get(p.id);
    if (old && old.titleEn) {
      p.titleEn = old.titleEn;
      p.enSource = old.enSource ?? null;
    }
  }
}

async function main() {
  const html = await fetchPage(URL);
  const petitions = scrapePetitions(html);
  // Tableau présent mais 0 pétition = légitime (aucune pétition ouverte) : on
  // écrit une liste vide, le site affiche son état « aucune pétition ».
  carryTranslations(petitions);
  writeFileSync(OUT_PATH, JSON.stringify({ scrapedAt: new Date().toISOString(), petitions }, null, 2));
  console.log(`${petitions.length} pétition(s) ouverte(s) écrite(s) dans ${OUT_PATH}.`);
}

export { scrapePetitions, normalizeSponsor, parseCount };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper petitions.js :', err.message);
    process.exitCode = 1;
  });
}
