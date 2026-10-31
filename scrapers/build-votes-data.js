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
const ARCHIVES_DIR = 'data/archives';
// Le taux de présence de chaque législature, gardé pour toujours (Martin, 30 oct. 2026 : « garder le
// % de vote, par mandat, par député »). La législature en cours s'y réécrit à chaque passage ; quand
// votes.js passe à la suivante, la précédente reste figée telle qu'au dernier vote.
const PRESENCES_PATH = 'data/presences-par-legislature.json';
const HTML_PATH = 'gabarit.html';   // le MODÈLE, jamais servi : les pages en sont tirées
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
    presences[id] = { participated: participes, total: eligibles.length, rate: Math.round((participes / eligibles.length) * 100), depuis };   // depuis : date du premier vote nominal (partage des fiches, 22 oct. 2026)
  }
  return presences;
}

// Un fichier par vote. Les votes passés ne changent jamais : le rafraîchissement
// quotidien n'ajoute que les nouveaux, au lieu de réécrire un bloc d'un mégaoctet
// dans six pages. On retire quand même les fichiers dont le vote a disparu du jeu.
function ecrireNominal(out, dossier = NOMINAL_DIR) {
  mkdirSync(dossier, { recursive: true });
  const attendus = new Set();
  let ecrits = 0;
  for (const v of out) {
    const nom = `${v.id}.json`;
    attendus.add(nom);
    const contenu = JSON.stringify(v.nominal);
    const chemin = join(dossier, nom);
    // Ne réécrire que ce qui change : garde l'horodatage des fichiers stables
    // et le diff quotidien minuscule.
    if (existsSync(chemin) && readFileSync(chemin, 'utf-8') === contenu) continue;
    writeFileSync(chemin, contenu);
    ecrits++;
  }
  let retires = 0;
  for (const f of readdirSync(dossier)) {
    if (f.endsWith('.json') && !attendus.has(f)) { rmSync(join(dossier, f)); retires++; }
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

// Projets de loi parrainés dans chaque législature terminée, par nom de parrain normalisé (même
// normalisation que norm() dans commun/dq.js) : { 43: { "jean francois roberge": [pl, lois] } }.
const normNom = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-–—']/g, ' ').replace(/\s+/g, ' ').trim();
function plPasses(courante) {
  const out = {};
  if (!existsSync('data/archives')) return out;
  for (const l of readdirSync('data/archives')) {
    if (!/^\d+$/.test(l) || Number(l) === courante || !existsSync(`data/archives/${l}/bills.json`)) continue;
    const j = JSON.parse(readFileSync(`data/archives/${l}/bills.json`, 'utf-8'));
    const parNom = {};
    for (const b of j.bills ?? j) {
      if (!b.sponsor) continue;
      const k = normNom(b.sponsor);
      parNom[k] = parNom[k] || [0, 0];
      parNom[k][0]++;
      if (b.status === 'sanctionne') parNom[k][1]++;
    }
    out[l] = parNom;
  }
  return out;
}

function main() {
  const { votes, legislature } = JSON.parse(readFileSync(VOTES_PATH, 'utf-8'));
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
  const historique = existsSync(PRESENCES_PATH) ? JSON.parse(readFileSync(PRESENCES_PATH, 'utf-8')) : {};
  if (legislature && Object.keys(presences).length) historique[legislature] = presences;
  writeFileSync(PRESENCES_PATH, JSON.stringify(historique) + '\n');
  // Dans la page, seulement les législatures terminées (la courante est déjà dans « presences »).
  const presencesPassees = Object.fromEntries(Object.entries(historique).filter(([l]) => Number(l) !== legislature)
    .map(([l, p]) => [l, Object.fromEntries(Object.entries(p).map(([id, x]) => [id, x.rate]))]));
  const fichiers = ecrireNominal(out);

  // Ce qui part dans la page : tout sauf le nominatif.
  const allege = out.map(({ nominal, ...reste }) => reste);
  const json = JSON.stringify(allege);

  // ARCHIVE DES VOTES (Martin, 30 oct. 2026, qui renverse la décision du 4 oct.). Comme les projets
  // de loi (scripts/build-bill-pages.js), la législature en direct est recopiée dans
  // data/archives/<législature>/ : votes.json (la liste allégée) et votes/<id>.json (le nominatif).
  // Le jour où votes.js passe à la 44e, la copie de la 43e reste telle quelle et /votes?archives=43
  // la lit. Les identifiants (session-numéro) repartent à 1-1 à chaque législature : d'où un
  // dossier nominatif par archive, plutôt que data/votes/ partagé.
  if (legislature) {
    const dossierArchive = `${ARCHIVES_DIR}/${legislature}`;
    mkdirSync(dossierArchive, { recursive: true });
    const cheminListe = `${dossierArchive}/votes.json`;
    if (!existsSync(cheminListe) || readFileSync(cheminListe, 'utf-8') !== json) writeFileSync(cheminListe, json);
    const arch = ecrireNominal(out, `${dossierArchive}/votes`);
    // noms.json : le nom complet de chaque personne qui a voté dans cette législature. Une fois la
    // législature passée, les ancien·ne·s élu·e·s sortent de la liste des député·e·s : la case des
    // votes d'un projet de loi (commun/dq.js, remplirVotesProjet) les nomme grâce à ce fichier.
    // Source : data/elus-historique.json (scrapers/build-frontend-data.js), jamais vidé.
    const histo = existsSync('data/elus-historique.json') ? (JSON.parse(readFileSync('data/elus-historique.json', 'utf-8')).elus || {}) : {};
    const noms = {};
    for (const v of votes) for (const g of ['pour', 'contre', 'abstentions']) for (const p of v[g] || []) {
      noms[p.assnatId] = (histo[p.assnatId] && histo[p.assnatId].name) || noms[p.assnatId] || p.lastName;
    }
    const nomsJson = JSON.stringify(noms);
    const cheminNoms = `${dossierArchive}/noms.json`;
    if (!existsSync(cheminNoms) || readFileSync(cheminNoms, 'utf-8') !== nomsJson) writeFileSync(cheminNoms, nomsJson);
    console.log(`  archive : ${cheminListe} et ${arch.total} fichiers nominatifs (${arch.ecrits} écrit(s))`);
  }
  const block = `${START_MARKER}\nconst votes = ${json};\n`
    + `/* Le détail nominatif de chaque vote vit dans ${NOMINAL_DIR}/<id>.json et se charge quand\n`
    + `   on déplie une carte. Ici ne restent que les agrégats qui en dérivent : « divise » par\n`
    + `   vote et « presences » par député. Ne pas éditer à la main. */\n`
    + `const presences = ${JSON.stringify(presences)};\n`
    + `const historiqueLeg = ${JSON.stringify({ courante: legislature ?? null, presences: presencesPassees, pl: plPasses(legislature) })};\n`;

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
