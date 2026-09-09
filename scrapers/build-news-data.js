// Génère « Quoi de neuf » à partir des données déjà scrapées, et l'injecte dans
// index.html entre les marqueurs NEWS_DATA_START / NEWS_DATA_END.
//
// Avant, ce bloc était écrit À LA MAIN : il est resté figé au 12 juin 2026
// pendant trois mois, donnant l'impression d'un site à l'abandon alors qu'il ne
// s'était simplement rien passé (Assemblée ajournée puis dissoute).
//
// Trois types d'événements, tous FACTUELS et dérivés des fichiers existants —
// aucune interprétation, aucun jugement :
//   1. dépôt d'un projet de loi        (bills[].presentedOn)
//   2. sanction d'un projet de loi     (bills[] status=sanctionne + lastActivity)
//   3. journée de votes nominatifs     (votes[].date, regroupés par jour)
//
// Les titres sont tronqués pour rester lisibles ; le texte complet vit déjà sur
// la fiche du projet de loi.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const HTML_PATH = 'index.html';
const START_MARKER = '/* NEWS_DATA_START';
const END_MARKER = '/* NEWS_DATA_END */';
const MAX_ITEMS = 80; // le front paginera par fenêtres de 7 jours

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MOIS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function labels(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return { fr: `${j} ${MOIS_FR[m - 1]} ${a}`, en: `${MOIS_EN[m - 1]} ${j}, ${a}` };
}

function court(s, max = 105) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function lire(path, cle) {
  try { return JSON.parse(readFileSync(path, 'utf-8'))[cle] || []; }
  catch { return []; }
}

function main() {
  const bills = lire('data/bills.json', 'bills');
  const votes = lire('data/votes.json', 'votes');
  const items = [];

  for (const b of bills) {
    const titreFr = court(b.title);
    const titreEn = court(b.titleEn || b.title);
    if (b.presentedOn) {
      items.push({
        date: b.presentedOn,
        text: `Dépôt du projet de loi n° ${b.num} — ${titreFr}`,
        textEn: `Bill ${b.num} introduced — ${titreEn}`,
      });
    }
    if (b.status === 'sanctionne' && b.lastActivity) {
      items.push({
        date: b.lastActivity,
        text: `Sanction du projet de loi n° ${b.num} — ${titreFr}`,
        textEn: `Bill ${b.num} assented to — ${titreEn}`,
      });
    }
  }

  // Journées de votes : un événement par jour, pas un par vote (sinon une seule
  // journée de séance noierait tout le reste).
  const parJour = {};
  for (const v of votes) if (v.date) parJour[v.date] = (parJour[v.date] || 0) + 1;
  for (const [date, n] of Object.entries(parJour)) {
    items.push({
      date,
      text: `${n} vote${n > 1 ? 's' : ''} nominatif${n > 1 ? 's' : ''} tenu${n > 1 ? 's' : ''} à l'Assemblée.`,
      textEn: `${n} recorded division${n > 1 ? 's' : ''} held in the Assembly.`,
    });
  }

  if (items.length === 0) throw new Error('aucun événement généré — données absentes ou format changé ?');

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const retenus = items.slice(0, MAX_ITEMS).map((it) => {
    const l = labels(it.date);
    return { date: it.date, label: l.fr, labelEn: l.en, text: it.text, textEn: it.textEn };
  });

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs NEWS_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const block =
    `${START_MARKER} — généré par scrapers/build-news-data.js à partir de data/bills.json\n` +
    `   et data/votes.json. Ne pas éditer à la main : relancer le build.\n` +
    `   Généré le ${new Date().toISOString()} */\n` +
    `const newsItems = ${JSON.stringify(retenus, null, 2)};\n`;

  writeFileSync(HTML_PATH, html.slice(0, startIdx) + block + html.slice(endIdx));
  console.log(`${retenus.length} événement(s) « Quoi de neuf » injecté(s) — du ${retenus[retenus.length - 1].date} au ${retenus[0].date}.`);
}

main();
