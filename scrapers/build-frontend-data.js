// Injecte data/bills.json directement dans index.html, entre les marqueurs
// BILLS_DATA_START / BILLS_DATA_END. Le prototype reste un fichier HTML unique et
// autonome — ouvrable en double-cliquant, sans serveur ni fetch() (un <script src>
// séparé pouvait ne pas se charger selon comment le fichier était ouvert).
//
// Adapte aussi le format des données au gabarit attendu par billCard() :
//   - `id` devient la clé unique utilisée pour les DOM ids (b.num n'est PAS unique,
//     le Québec réutilise les numéros de projet de loi d'une session à l'autre —
//     voir bills.js).
//   - `sponsor` est raccourci à "Prénom Nom" (la donnée brute inclut aussi le rôle,
//     déjà affiché ailleurs sur la page).
//   - `summary` (liste à puces "- ...") est converti en <ul><li>...</li></ul>.
//     Les projets sans résumé utilisable affichent un message honnête plutôt que
//     du contenu vide ou inventé.
//
// Les projets "laisse_de_cote" sont inclus (affichés comme "Sur la glace" côté
// front-end) — on ne les cache plus, voir la conversation sur la distinction
// sanctionné / à l'étude / sur la glace.

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/bills.json';
const HTML_PATH = 'index.html';
const START_MARKER = '/* BILLS_DATA_START';
const END_MARKER = '/* BILLS_DATA_END */';

function shortSponsorName(raw) {
  if (!raw) return null;
  const [namePart] = raw.split('—');
  const trimmed = namePart.trim();
  const match = trimmed.match(/^([^,]+),\s*(.+)$/); // "Nom, Prénom" -> "Prénom Nom"
  return match ? `${match[2]} ${match[1]}` : trimmed;
}

function summaryToHtml(bill) {
  if (!bill.summary) {
    return '<p><em>Résumé non disponible pour ce projet de loi.</em></p>';
  }
  const lines = bill.summary
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  if (lines.length === 0) return `<p>${bill.summary}</p>`;
  return `<ul class="bill-summary-list">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
}

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));

  const bills = data.bills.map((b) => ({
    id: b.id,
    num: b.num,
    title: b.title,
    status: b.status,
    step: b.step,
    note: b.note,
    sponsor: shortSponsorName(b.sponsor) || (b.type === 'Public du gouvernement' ? 'Gouvernement' : null),
    summary: summaryToHtml(b),
    summaryAiGenerated: Boolean(b.summaryAiGenerated),
    url: b.url,
    urlEn: null,
    titleEn: null,
    noteEn: null,
    summaryEn: null,
    lastActivity: b.lastActivity,
    presentedOn: b.presentedOn || null,
  }));

  bills.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs BILLS_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block = `${START_MARKER} — généré automatiquement par scrapers/build-frontend-data.js à partir de\n   data/bills.json (voir scrapers/bills.js, bill-details.js, bill-summaries.js). Ne pas éditer\n   ce bloc à la main : relancer \`node scrapers/build-frontend-data.js\` à la place.\n   Généré le ${new Date().toISOString()} */\nconst bills = ${JSON.stringify(bills, null, 2)};\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);
  console.log(`${bills.length} projets de loi injectés directement dans ${HTML_PATH}`);
}

main();
