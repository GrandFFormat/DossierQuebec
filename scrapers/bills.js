// Scraper — Projets de loi (Données Québec)
//
// Source : jeu de données "Projets de loi" sur donneesquebec.ca, distribué par
// l'Assemblée nationale du Québec. Contient un enregistrement par (projet de loi,
// session) avec la dernière étape franchie à ce moment-là.
// https://www.donneesquebec.ca/recherche/dataset/projets-de-loi
//
// Limite connue : ce CSV peut avoir un léger retard sur les pages individuelles
// des projets de loi sur assnat.qc.ca (qui sont mises à jour en direct et sont
// du HTML statique lisible sans navigateur). Amélioration future possible :
// enrichir chaque projet de loi avec un fetch de sa page individuelle.
//
// Champs volontairement laissés à `null` (sponsor, summary) : ce ne sont pas des
// données présentes dans ce jeu de données, et le projet interdit d'inventer une
// donnée manquante. À compléter manuellement ou par un futur scraper dédié.
//
// Important : `num` (ex. « PL 2 ») N'EST PAS un identifiant unique. Le Québec
// réutilise les petits numéros à chaque nouvelle session — deux projets de loi
// bien réels et distincts peuvent tous les deux s'appeler « PL 2 ». Utiliser `id`
// (ou `url`) comme clé, jamais `num`.
//
// `status` peut valoir :
//   - 'encours'        : dossier actif, session en cours ou précédente
//   - 'sanctionne'      : devenu loi
//   - 'laisse_de_cote'  : d'une session antérieure du même mandat, jamais
//                         sanctionné, jamais réinscrit depuis — abandonné en
//                         cours de route (fait vérifiable dans les données,
//                         pas une supposition).

import { writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const CSV_URL = 'https://www.donneesquebec.ca/recherche/dataset/2bde70f9-15ff-455b-b3ea-c6e229b24074/resource/93c74b8c-51d1-49e6-9ab9-1f8d96dbd735/download/projets-de-loi.csv';
const OUT_PATH = 'data/bills.json';

// Ordre des 5 grandes étapes affichées dans le prototype (veille-assnat.html, `steps`).
// `depot_commission_consultation` n'a pas d'étape dédiée dans ce modèle à 5 cases :
// elle se produit après la présentation et avant l'adoption du principe, donc elle
// reste rattachée à l'étape 1 tant que le principe n'est pas adopté.
const STEP_BY_CODE = {
  presentation: 1,
  depot_commission_consultation: 1,
  adoption_principe: 2,
  depot_commission_etude_detaillee: 3,
  sanction: 5,
};

const NOTE_BY_CODE = {
  presentation: (date) => `Présenté le ${date}`,
  depot_commission_consultation: (date) => `Déposé en commission pour consultations particulières le ${date}`,
  adoption_principe: (date) => `Adoption du principe le ${date}`,
  depot_commission_etude_detaillee: (date) => `Étude détaillée entreprise le ${date}`,
  sanction: (date) => `Sanctionné le ${date}`,
};

const STEP_LABEL_BY_CODE = {
  presentation: 'présentation',
  depot_commission_consultation: 'dépôt en commission (consultations particulières)',
  adoption_principe: 'adoption du principe',
  depot_commission_etude_detaillee: 'étude détaillée',
  sanction: 'sanction',
};

function cleanTitle(rawTitle) {
  // Format brut : "43-2 PL 1  Loi constitutionnelle de 2025 sur le Québec"
  const match = rawTitle.match(/^\d+-\d+\s+PL\s+\d+\s+(.*)$/);
  return (match ? match[1] : rawTitle).trim();
}

async function fetchCsv() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Échec du téléchargement du CSV : HTTP ${res.status}`);
  return await res.text();
}

function buildBills(rows) {
  const currentLegislature = Math.max(...rows.map((r) => Number(r.No_legislature)));
  const rowsCurrentLeg = rows.filter((r) => Number(r.No_legislature) === currentLegislature);

  // `Id` identifie un vrai projet de loi de façon stable à travers ses réinscriptions
  // d'une session à l'autre (prorogation). `Numero_projet_loi`, lui, N'EST PAS un
  // identifiant fiable à lui seul : le Québec réutilise les petits numéros (PL 1, PL 2...)
  // à chaque nouvelle session — ex. le "PL 2" de la session 2 (sanctionné en oct. 2025)
  // et le "PL 2" de la session 3 (encore à l'étude) sont deux projets de loi distincts.
  // On regroupe donc par Id, et `num` ne sert que d'étiquette d'affichage (« PL 2 »),
  // pas de clé unique.
  const byId = new Map();
  for (const row of rowsCurrentLeg) {
    if (!byId.has(row.Id)) byId.set(row.Id, []);
    byId.get(row.Id).push(row);
  }

  const maxSession = Math.max(...rowsCurrentLeg.map((r) => Number(r.No_session)));

  const bills = [];
  for (const [id, group] of byId) {
    const sessionsInGroup = group.map((r) => Number(r.No_session));
    const maxSessionInGroup = Math.max(...sessionsInGroup);

    // L'étape la plus avancée atteinte, tous exemplaires (sessions) confondus —
    // un projet de loi ne recule jamais dans le processus.
    let best = group[0];
    for (const row of group) {
      const bestStep = STEP_BY_CODE[best.Derniere_etape_franchie] ?? 0;
      const rowStep = STEP_BY_CODE[row.Derniere_etape_franchie] ?? 0;
      if (rowStep > bestStep || (rowStep === bestStep && row.Date_derniere_etape > best.Date_derniere_etape)) {
        best = row;
      }
    }
    const code = best.Derniere_etape_franchie;

    // Heuristique : "sur la table" = le dossier touche la session en cours ou celle
    // juste avant (prorogation récente), sans dépendre d'un numéro de session codé
    // en dur. Un dossier plus ancien qui a été sanctionné est une loi déjà adoptée —
    // on l'exclut, il n'est pas "laissé de côté", il est simplement terminé et hors
    // du champ de la veille "affaires en cours". Un dossier plus ancien qui n'a
    // JAMAIS été sanctionné et n'a pas été réinscrit, lui, est vraiment laissé de côté.
    const onTable = maxSessionInGroup >= maxSession - 1;
    if (!onTable && code === 'sanction') continue;

    const num = Number(group[0].Numero_projet_loi);
    const introSession = Math.min(...sessionsInGroup);
    const step = STEP_BY_CODE[code] ?? null;
    const date = best.Date_derniere_etape || null;

    let status, note;
    if (onTable) {
      status = code === 'sanction' ? 'sanctionne' : 'encours';
      note = date && NOTE_BY_CODE[code] ? NOTE_BY_CODE[code](date) : null;
    } else {
      status = 'laisse_de_cote';
      const stepLabel = STEP_LABEL_BY_CODE[code] ?? code;
      note = `Resté à l'étape « ${stepLabel} » (session ${maxSessionInGroup}) — non réinscrit depuis${date ? `, dernière activité le ${date}` : ''}`;
    }

    bills.push({
      id: Number(id),
      num,
      legislature: currentLegislature,
      introSession,
      type: best.Type_projet_loi,
      title: cleanTitle(best.Titre_projet_loi),
      status,
      step,
      note,
      lastActivity: date,
      url: `https://www.assnat.qc.ca/fr/travaux-parlementaires/projets-loi/projet-loi-${num}-${currentLegislature}-${introSession}.html`,
      urlEn: `https://www.assnat.qc.ca/en/travaux-parlementaires/projets-loi/projet-loi-${num}-${currentLegislature}-${introSession}.html`,
      sponsor: null,
      summary: null,
      titleEn: null,
      noteEn: null,
      summaryEn: null,
    });
  }

  bills.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  return bills;
}

async function main() {
  const csv = await fetchCsv();
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  const bills = buildBills(rows);

  mkdirSync('data', { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        source: CSV_URL,
        scrapedAt: new Date().toISOString(),
        count: bills.length,
        bills,
      },
      null,
      2
    )
  );

  const byStatus = bills.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${bills.length} projets de loi écrits dans ${OUT_PATH}`, byStatus);
}

main().catch((err) => {
  console.error('Échec du scraper bills.js :', err);
  process.exitCode = 1;
});
