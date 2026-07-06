// Fusionne data/votes.json (scrapers/votes.js) avec data/bills.json pour
// résoudre le rapprochement vote -> projet de loi, puis injecte le résultat
// dans veille-assnat.html entre les marqueurs VOTES_DATA_START/END.
//
// Rapprochement : le numéro de projet de loi seul n'est pas unique (voir
// bills.js — un numéro comme "PL 24" ou "PL 95" est réutilisé d'une session
// à l'autre pour des lois complètement différentes). Quand plusieurs projets
// de loi partagent le même numéro, on désambiguïse en comparant le texte du
// titre de la loi (extrait du sujet du vote, après la virgule) au titre
// officiel de chaque candidat — les titres divergent toujours assez pour
// distinguer les deux, sans jamais deviner.
//
// Le détail nominatif est compressé en paires [ID assnat, parti au moment du
// vote] plutôt que des objets {name, party} : le nom complet est retrouvé
// côté client via `deputes` (voir build-deputes-data.js), qui porte le même
// ID assnat — évite de répéter des milliers de fois les mêmes chaînes de
// caractères dans le HTML final.

import { readFileSync, writeFileSync } from 'node:fs';

const VOTES_PATH = 'data/votes.json';
const BILLS_PATH = 'data/bills.json';
const HTML_PATH = 'veille-assnat.html';
const START_MARKER = '/* VOTES_DATA_START */';
const END_MARKER = '/* VOTES_DATA_END */';

function normTitle(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchBill(vote, bills) {
  if (!vote.billNum) return null;
  const candidates = bills.filter((b) => b.num === vote.billNum);
  if (candidates.length === 0) return null;
  // Découverte (juillet 2026) : même avec un seul candidat, il ne faut PAS le
  // valider aveuglément. bills.json exclut les vieux projets déjà sanctionnés
  // depuis 2+ sessions (voir bills.js) — donc si le numéro a été réutilisé et
  // que l'ancien titulaire du numéro a été exclu, il ne reste plus qu'un seul
  // candidat dans bills.json, mais ce candidat peut très bien être le MAUVAIS
  // projet de loi pour un vote plus ancien. Cas réel trouvé : le PL 10 de 2023
  // (« agence de placement », sanctionné puis exclu) rapproché à tort au PL 10
  // de 2026 (« pratiques abusives ») simplement parce qu'il était seul candidat.
  // Toujours vérifier le titre, peu importe le nombre de candidats.
  const subjectNorm = normTitle(vote.subject);
  let best = null;
  for (const c of candidates) {
    const titleNorm = normTitle(c.title);
    if (subjectNorm.includes(titleNorm) || titleNorm.includes(subjectNorm)) {
      best = c;
      break;
    }
  }
  return best;
}

function main() {
  const { votes } = JSON.parse(readFileSync(VOTES_PATH, 'utf-8'));
  const { bills } = JSON.parse(readFileSync(BILLS_PATH, 'utf-8'));

  let matched = 0;
  let unmatchedWithBillNum = 0;

  const out = votes.map((v) => {
    const bill = matchBill(v, bills);
    if (v.billNum) {
      if (bill) matched++;
      else unmatchedWithBillNum++;
    }
    const toPairs = (list) => list.map((p) => [p.assnatId, p.party]);
    return {
      id: `${v.session}-${v.num}`,
      date: v.date,
      stage: v.stage,
      subject: v.subject,
      billNum: v.billNum,
      billId: bill ? bill.id : null,
      url: v.url,
      totals: v.totals,
      nominal: {
        pour: toPairs(v.pour),
        contre: toPairs(v.contre),
        abstentions: toPairs(v.abstentions),
      },
    };
  });

  const json = JSON.stringify(out);
  const block = `${START_MARKER}\nconst votes = ${json};\n`;

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs VOTES_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);

  console.log(`${out.length} votes injectés dans ${HTML_PATH}.`);
  console.log(`  ${matched} rapprochés à un projet de loi connu, ${unmatchedWithBillNum} avec un n° de PL mais aucune correspondance dans bills.json (probablement hors du jeu de données Données Québec — pas de donnée inventée).`);
}

main();
