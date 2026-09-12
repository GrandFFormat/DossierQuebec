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
const FEED_PATH = 'feed.xml';                 // flux RSS, mêmes événements
const SITE = 'https://dossierquebec.ca';
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

  // ⚠️ On lit UNIQUEMENT le champ `note`, qui reprend mot pour mot la ligne de
  // statut officielle d'assnat (« Présenté le AAAA-MM-JJ », « Sanctionné le
  // AAAA-MM-JJ »). C'est une citation, donc une date exacte.
  //
  // NE PAS utiliser `presentedOn` ni `lastActivity` ici : ce sont des
  // APPROXIMATIONS. `presentedOn` prend le premier événement daté sous
  // « Présentation », ce qui, pour certains projets, attrape un vote rapproché —
  // d'où des aberrations (PL 7 et PL 16 « présentés et sanctionnés le même
  // jour »). C'est aussi pourquoi la carte d'un projet dit prudemment « Suivi
  // depuis le » et non « déposé le ». Un événement daté publié doit être exact,
  // pas approximatif : on préfère afficher moins d'événements que des faux.
  for (const b of bills) {
    const titreFr = court(b.title);
    const titreEn = court(b.titleEn || b.title);
    const note = String(b.note || '');
    const presente = note.match(/^Présenté le (\d{4}-\d{2}-\d{2})/);
    // `link` : le lien profond qui ouvre CE projet (voir openBillFromQuery). Il
    // ne sert pas dans la page — le bloc « Quoi de neuf » n'a pas de liens — mais
    // le flux RSS en a besoin : un item de flux sans lien vers la chose dont il
    // parle est inutile à qui le reçoit.
    const lien = `${SITE}/projets-de-loi?pl=${encodeURIComponent(b.num)}`;
    if (presente) {
      items.push({
        date: presente[1],
        text: `Dépôt du projet de loi n° ${b.num} — ${titreFr}`,
        textEn: `Bill ${b.num} introduced — ${titreEn}`,
        link: lien,
        guid: `depot-${b.num}-${presente[1]}`,
      });
    }
    const sanctionne = note.match(/^Sanctionné le (\d{4}-\d{2}-\d{2})/);
    if (sanctionne) {
      items.push({
        date: sanctionne[1],
        text: `Sanction du projet de loi n° ${b.num} — ${titreFr}`,
        textEn: `Bill ${b.num} assented to — ${titreEn}`,
        link: lien,
        guid: `sanction-${b.num}-${sanctionne[1]}`,
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
      link: `${SITE}/votes`,
      guid: `votes-${date}`,
    });
  }

  if (items.length === 0) throw new Error('aucun événement généré — données absentes ou format changé ?');

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const retenus = items.slice(0, MAX_ITEMS).map((it) => {
    const l = labels(it.date);
    return { date: it.date, label: l.fr, labelEn: l.en, text: it.text, textEn: it.textEn, link: it.link, guid: it.guid };
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

  // Flux RSS : les MÊMES événements, une seule source de vérité. Généré ici et
  // non dans un script à part, pour qu'il ne puisse jamais diverger du bloc
  // affiché. Le guid est stable (type + numéro + date) : un agrégateur ne
  // republiera pas un événement déjà vu quand le fichier est régénéré.
  writeFileSync(FEED_PATH, rss(retenus));
  console.log(`✓ ${FEED_PATH} : ${retenus.length} item(s).`);
}

// Le strict nécessaire de RSS 2.0, sans dépendance. Dates au format RFC 822
// exigé par le standard, à midi heure de Montréal pour ne pas glisser d'un jour
// en UTC. Tout texte passe par xml() : un « & » dans un titre de loi (fréquent)
// suffirait sinon à rendre le flux illisible.
function xml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function rfc822(iso) {
  return new Date(`${iso}T12:00:00-04:00`).toUTCString();
}
function rss(items) {
  const entries = items.map((it) => `    <item>
      <title>${xml(it.text)}</title>
      <link>${xml(it.link || SITE)}</link>
      <guid isPermaLink="false">${xml(it.guid || `${it.date}-${it.text}`)}</guid>
      <pubDate>${rfc822(it.date)}</pubDate>
      <description>${xml(it.text)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>DossierQuébec — Quoi de neuf</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/${FEED_PATH}" rel="self" type="application/rss+xml"/>
    <description>Dépôts et sanctions de projets de loi, journées de votes nominatifs à l'Assemblée nationale du Québec. Site citoyen indépendant, données publiques officielles.</description>
    <language>fr-CA</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${entries}
  </channel>
</rss>
`;
}

main();
