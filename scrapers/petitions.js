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
// Page « Signer une pétition » (FR/EN) — cible de TOUS les liens de pétition.
// Les URL par pétition d'assnat renvoient 404 (pas de page publique stable).
const SIGN_URL_FR = 'https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html';
const SIGN_URL_EN = 'https://www.assnat.qc.ca/en/exprimez-votre-opinion/petition/signer-petition/index.html';

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
    // ⚠️ Les URL individuelles « Petition-XXXX/index.html » présentes dans le
    // tableau renvoient 404 (pas de page publique stable par pétition ; la
    // signature se fait via un formulaire JS sur la page générale). On pointe
    // donc TOUJOURS vers la page « Signer une pétition » (vérifiée 200, FR/EN)
    // plutôt que vers un lien mort. L'`id` reste conservé pour l'agrégation et
    // la clé de traduction.
    petitions.push({
      id,
      title,
      titleEn: null, // rempli plus tard, best effort, par bill-summaries.js
      enSource: null,
      sponsor: normalizeSponsor($(tds[1]).text()),
      start: $(tds[2]).text().trim(),
      end: $(tds[3]).text().trim(),
      count: parseCount($(tds[4]).text()),
      url: SIGN_URL_FR,
      urlEn: SIGN_URL_EN,
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // La liste est parfois rendue côté serveur, parfois servie en AJAX (réponse
  // sans tableau/lignes). On réessaie quelques fois, espacé, pour attraper la
  // version complète. Si toutes les tentatives donnent 0 pétition, on ÉCHOUE
  // (source « douce » dans refresh.js → garde les données de la veille, pas
  // d'alerte) — jamais on ne vide la liste du site.
  const ATTEMPTS = 4;
  let petitions = null;
  let lastErr = null;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const html = await fetchPage(URL);
      const p = scrapePetitions(html);
      if (p.length > 0) { petitions = p; break; }
      lastErr = new Error('0 pétition extraite (réponse AJAX/incomplète probable)');
    } catch (e) {
      lastErr = e;
    }
    if (i < ATTEMPTS) {
      console.warn(`  tentative ${i}/${ATTEMPTS} infructueuse — nouvel essai dans 8 s…`);
      await sleep(8000);
    }
  }
  if (!petitions) {
    throw new Error(`${ATTEMPTS} tentatives infructueuses (${lastErr ? lastErr.message : 'inconnu'}) — données précédentes conservées.`);
  }
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
