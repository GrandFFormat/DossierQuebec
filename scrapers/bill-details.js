// Scraper — Enrichissement des pages individuelles de projets de loi
//
// Complète data/bills.json (produit par scrapers/bills.js) avec des données que
// le jeu de données Données Québec ne contient pas :
//   - le parrain (sponsor) et son rôle
//   - l'étape la plus récente réellement affichée sur la page officielle, qui peut
//     être plus à jour que le CSV (le CSV a un léger retard connu, voir bills.js).
//
// Source : la page HTML individuelle de chaque projet de loi sur assnat.qc.ca
// (`bill.url`). Ces pages sont du HTML statique — pas besoin de navigateur
// automatisé.
//
// Règle de fusion : ce script ne fait JAMAIS reculer un projet de loi. Le champ
// `step`/`status`/`note`/`lastActivity` du CSV n'est remplacé que si la page en
// direct montre une étape égale ou plus avancée. Le `sponsor` est rempli s'il est
// absent, sans jamais écraser une valeur déjà présente (ex. saisie manuellement).
//
// Libellés d'étapes confirmés en inspectant une vraie page de projet de loi
// sanctionné (aucun libellé inventé) :
//   Présentation → Consultations particulières / Consultation générale →
//   Dépôt du rapport de commission - Consultation → Adoption du principe →
//   Étude détaillée en commission → Dépôt du rapport de commission - Étude
//   détaillée → Prise en considération du rapport de commission → Adoption →
//   Sanction

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const BILLS_PATH = 'data/bills.json';
const REQUEST_DELAY_MS = 400; // pour rester poli envers un site gouvernemental
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';

const FRENCH_MONTHS = {
  janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12',
};

// Ordre de vérification volontairement du plus spécifique au plus général —
// certains libellés (« Adoption du principe ») contiennent le mot d'un libellé
// plus générique (« Adoption »).
const STAGE_STEP_RULES = [
  [/sanction/i, 5],
  [/^adoption$/i, 5],
  [/prise en considération/i, 4],
  [/étude détaillée/i, 3],
  [/adoption du principe/i, 2],
  [/consultation/i, 1],
  [/présentation/i, 1],
];

function stageNameToStep(stageName) {
  for (const [pattern, step] of STAGE_STEP_RULES) {
    if (pattern.test(stageName)) return step;
  }
  return null;
}

function parseFrenchDate(text) {
  const match = text.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = FRENCH_MONTHS[monthName.toLowerCase()];
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function extractSponsor($) {
  const firstRow = $('.tableInvisible tr').first();
  const name = firstRow.find('a').first().text().trim().replace(/,$/, '');
  if (!name) return { name: null, role: null };
  const role = firstRow
    .find('td')
    .eq(1)
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return { name, role: role || null };
}

function extractPresentationPdfUrl($) {
  const stepsHeading = $('h2').filter((_, el) => $(el).text().trim() === 'Étapes de cheminement').first();
  if (stepsHeading.length === 0) return null;

  const presentationHeading = stepsHeading
    .nextAll('h3')
    .filter((_, el) => $(el).text().trim() === 'Présentation')
    .first();
  if (presentationHeading.length === 0) return null;

  const list = presentationHeading.nextAll('ul.ListeLien').first();
  const pdfLink = list.find('a').filter((_, el) => $(el).text().includes('PDF')).first();
  if (pdfLink.length === 0) return null;

  const href = pdfLink.attr('href');
  if (!href) return null;
  return href.startsWith('http') ? href : new URL(href, 'https://www.assnat.qc.ca').href;
}

function extractPresentationDate($) {
  const stepsHeading = $('h2').filter((_, el) => $(el).text().trim() === 'Étapes de cheminement').first();
  if (stepsHeading.length === 0) return null;

  const presentationHeading = stepsHeading
    .nextAll('h3')
    .filter((_, el) => $(el).text().trim() === 'Présentation')
    .first();
  if (presentationHeading.length === 0) return null;

  // Le premier événement daté sous « Présentation » — dans l'immense majorité des
  // cas la présentation elle-même. Note : pour de rares projets réinscrits, cette
  // section peut aussi contenir un vote très rapproché de la présentation (le site
  // officiel les regroupe ainsi) ; on prend quand même la première date trouvée,
  // c'est la meilleure approximation disponible sans inventer de donnée.
  const list = presentationHeading.nextAll('ul.ListeLien').first();
  const items = list.find('li');
  for (let i = 0; i < items.length; i++) {
    const date = parseFrenchDate($(items[i]).text().replace(/\s+/g, ' ').trim());
    if (date) return date;
  }
  return null;
}

function extractLatestStage($) {
  const stepsHeading = $('h2').filter((_, el) => $(el).text().trim() === 'Étapes de cheminement').first();
  if (stepsHeading.length === 0) return null;

  const stageHeadings = stepsHeading.nextAll('h3');
  if (stageHeadings.length === 0) return null;

  const lastHeading = stageHeadings.last();
  const stageName = lastHeading.text().replace(/\s+/g, ' ').trim();

  const list = lastHeading.nextAll('ul.ListeLien').first();
  const items = list.find('li');
  if (items.length === 0) return { stageName, date: null, annotation: null };

  const lastItemText = items.last().text().replace(/\s+/g, ' ').trim();
  const date = parseFrenchDate(lastItemText);
  const annotationMatch = lastItemText.match(/\(([^)]+)\)\s*$/);
  const annotation = annotationMatch ? annotationMatch[1] : null;

  return { stageName, date, annotation };
}

async function fetchBillPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichBill(bill) {
  const html = await fetchBillPage(bill.url);
  const $ = cheerio.load(html);

  const sponsor = extractSponsor($);
  if (!bill.sponsor && sponsor.name) {
    bill.sponsor = sponsor.role ? `${sponsor.name} — ${sponsor.role}` : sponsor.name;
  }

  const pdfUrl = extractPresentationPdfUrl($);
  if (pdfUrl) bill.presentationPdfUrl = pdfUrl;

  // Ne jamais écraser une fois capturée — c'est une date historique fixe.
  if (!bill.presentedOn) {
    const presentedOn = extractPresentationDate($);
    if (presentedOn) bill.presentedOn = presentedOn;
  }

  // On ne recalcule le statut/l'étape que pour les dossiers actifs. Un projet
  // "laissé de côté" n'est, par définition, plus mis à jour ; on se contente d'y
  // ajouter le parrain.
  if (bill.status === 'laisse_de_cote') return { updated: false, sponsorFound: Boolean(sponsor.name) };

  const latest = extractLatestStage($);
  if (!latest) return { updated: false, sponsorFound: Boolean(sponsor.name) };

  bill.liveStage = latest.stageName;

  const liveStep = stageNameToStep(latest.stageName);
  const csvStep = bill.step ?? 0;
  const isMoreAdvanced = liveStep !== null && liveStep > csvStep;
  const isSameStepButFresherDate = liveStep !== null && liveStep === csvStep && latest.date && (!bill.lastActivity || latest.date > bill.lastActivity);

  if (isMoreAdvanced || isSameStepButFresherDate) {
    bill.step = liveStep;
    bill.status = liveStep === 5 && /sanction/i.test(latest.stageName) ? 'sanctionne' : 'encours';
    bill.lastActivity = latest.date ?? bill.lastActivity;
    bill.note = latest.date
      ? `${latest.stageName}${latest.annotation ? ` (${latest.annotation})` : ''} — ${latest.date}`
      : latest.stageName;
    return { updated: true, sponsorFound: Boolean(sponsor.name) };
  }

  return { updated: false, sponsorFound: Boolean(sponsor.name) };
}

async function main() {
  const data = JSON.parse(readFileSync(BILLS_PATH, 'utf-8'));

  const limit = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : data.bills.length;
  const bills = data.bills.slice(0, limit);

  let updatedCount = 0;
  let sponsorCount = 0;
  let errorCount = 0;

  for (const [i, bill] of bills.entries()) {
    try {
      const result = await enrichBill(bill);
      if (result.updated) updatedCount++;
      if (result.sponsorFound) sponsorCount++;
    } catch (err) {
      errorCount++;
      console.error(`  ⚠ PL ${bill.num} (id ${bill.id}) : ${err.message}`);
    }

    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${data.bills.length}`);
    await sleep(REQUEST_DELAY_MS);
  }

  data.enrichedAt = new Date().toISOString();
  writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));

  console.log(
    `Terminé. ${bills.length} pages visitées, ${sponsorCount} parrains trouvés, ${updatedCount} étapes mises à jour vers une donnée plus récente, ${errorCount} erreurs.`
  );
}

export { extractSponsor, extractLatestStage, extractPresentationPdfUrl, extractPresentationDate, stageNameToStep, parseFrenchDate, fetchBillPage };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper bill-details.js :', err);
    process.exitCode = 1;
  });
}
