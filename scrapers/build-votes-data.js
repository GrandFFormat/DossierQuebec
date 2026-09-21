// Fusionne data/votes.json (scrapers/votes.js) avec data/bills.json pour
// résoudre le rapprochement vote -> projet de loi, puis injecte le résultat
// dans index.html entre les marqueurs VOTES_DATA_START/END.
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
//
// LE NOMINATIF NE VA PLUS DANS LA PAGE (21 septembre 2026). Mesuré : 1 032 ko
// pour 735 votes, soit 78 % des données de votes et 61 % du poids de la page —
// recopiés dans les six pages de la racine et retéléchargés par chaque
// visiteur, alors qu'ils ne servent qu'à une chose : afficher les noms quand
// quelqu'un déplie UNE carte de vote. Ils partent donc dans un fichier par
// vote, chargé à ce moment-là (~1,4 ko).
//
// Les deux autres usages du nominatif étaient des AGRÉGATS que le navigateur
// recalculait à chaque visite. Ils sont calculés ici, une fois :
//   `divise`    par vote — les partis se sont-ils divisés ? (735 booléens au
//               lieu de 1 032 ko reparcourus)
//   `presences` par député — le taux de participation aux votes nominaux
//               (125 fiches au lieu d'un index reconstruit au chargement)
// Leur calcul reproduit exactement ce que faisait commun/dq.js, ordre des clés
// compris : c'est lui qui décide des égalités dans `divise`.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VOTES_PATH = 'data/votes.json';
const BILLS_PATH = 'data/bills.json';
const NOMINAL_DIR = 'data/votes';
const HTML_PATH = 'index.html';
const START_MARKER = '/* VOTES_DATA_START */';
const END_MARKER = '/* VOTES_DATA_END */';

// Les partis pris en compte pour juger qu'un vote « divise ». Même liste que
// celle qui vivait dans commun/dq.js.
const PARTIS = ['CAQ', 'PLQ', 'QS', 'PQ', 'PCQ'];

// Un vote divise quand les partis ne penchent pas tous du même côté. Le camp
// d'un parti est celui où il a le plus de voix ; à égalité, c'est l'ordre
// pour → contre → abstentions qui tranche, comme avant.
function voteDivise(nominal) {
  const pos = {};
  for (const camp of ['pour', 'contre', 'abstentions']) {
    for (const entree of nominal[camp] || []) {
      const parti = entree[1];
      if (!PARTIS.includes(parti)) continue;
      pos[parti] = pos[parti] || { pour: 0, contre: 0, abstentions: 0 };
      pos[parti][camp]++;
    }
  }
  const camps = new Set(Object.values(pos).map((o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]));
  return camps.size > 1;
}

// Taux de participation par député. L'Assemblée ne publie pas d'assiduité :
// le meilleur indicateur public est la présence aux votes nominaux, comptée
// depuis le premier vote où la personne apparaît — voir la note complète dans
// commun/dq.js, d'où ce calcul vient mot pour mot.
function calculerPresences(out) {
  const parDate = out.filter((v) => v.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const vus = new Map();
  for (const v of out) {
    const ids = new Set([...v.nominal.pour, ...v.nominal.contre, ...v.nominal.abstentions].map(([id]) => id));
    for (const id of ids) {
      if (!vus.has(id)) vus.set(id, new Set());
      vus.get(id).add(v.id);
    }
  }
  const presences = {};
  for (const [id, apparus] of vus) {
    if (apparus.size === 0) continue;
    const siens = parDate.filter((v) => apparus.has(v.id));
    if (siens.length === 0) continue;
    const depuis = siens[0].date;
    const eligibles = parDate.filter((v) => v.date >= depuis);
    const participes = eligibles.filter((v) => apparus.has(v.id)).length;
    presences[id] = { participated: participes, total: eligibles.length, rate: Math.round((participes / eligibles.length) * 100) };
  }
  return presences;
}

// Un fichier par vote. Les votes passés ne changent jamais : le rafraîchissement
// quotidien n'ajoute que les nouveaux, au lieu de réécrire un bloc d'un mégaoctet
// dans six pages. On retire quand même les fichiers dont le vote a disparu du jeu.
function ecrireNominal(out) {
  mkdirSync(NOMINAL_DIR, { recursive: true });
  const attendus = new Set();
  let ecrits = 0;
  for (const v of out) {
    const nom = `${v.id}.json`;
    attendus.add(nom);
    const contenu = JSON.stringify(v.nominal);
    const chemin = join(NOMINAL_DIR, nom);
    // Ne réécrire que ce qui change : garde l'horodatage des fichiers stables
    // et le diff quotidien minuscule.
    if (existsSync(chemin) && readFileSync(chemin, 'utf-8') === contenu) continue;
    writeFileSync(chemin, contenu);
    ecrits++;
  }
  let retires = 0;
  for (const f of readdirSync(NOMINAL_DIR)) {
    if (f.endsWith('.json') && !attendus.has(f)) { rmSync(join(NOMINAL_DIR, f)); retires++; }
  }
  return { ecrits, retires, total: attendus.size };
}

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

  // Les agrégats se calculent AVANT de retirer le nominatif : c'est lui qui les nourrit.
  for (const v of out) v.divise = voteDivise(v.nominal);
  const presences = calculerPresences(out);
  const fichiers = ecrireNominal(out);

  // Ce qui part dans la page : tout sauf le nominatif.
  const allege = out.map(({ nominal, ...reste }) => reste);
  const json = JSON.stringify(allege);
  const block = `${START_MARKER}\nconst votes = ${json};\n`
    + `/* Le détail nominatif de chaque vote vit dans ${NOMINAL_DIR}/<id>.json et se charge quand\n`
    + `   on déplie une carte. Ici ne restent que les agrégats qui en dérivent : « divise » par\n`
    + `   vote et « presences » par député. Ne pas éditer à la main. */\n`
    + `const presences = ${JSON.stringify(presences)};\n`;

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs VOTES_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);

  const koPage = (Buffer.byteLength(json) / 1024).toFixed(0);
  const koNominal = (out.reduce((t, v) => t + Buffer.byteLength(JSON.stringify(v.nominal)), 0) / 1024).toFixed(0);
  console.log(`${out.length} votes injectés dans ${HTML_PATH} — ${koPage} ko dans la page.`);
  console.log(`  détail nominatif sorti : ${koNominal} ko dans ${fichiers.total} fichiers (${fichiers.ecrits} écrit(s), ${fichiers.retires} retiré(s))`);
  console.log(`  agrégats précalculés : ${out.filter((v) => v.divise).length} votes divisés, ${Object.keys(presences).length} taux de présence`);
  console.log(`  ${matched} rapprochés à un projet de loi connu, ${unmatchedWithBillNum} avec un n° de PL mais aucune correspondance dans bills.json (probablement hors du jeu de données Données Québec — pas de donnée inventée).`);
}

main();
