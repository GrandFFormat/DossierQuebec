// Scraper — Registre des votes réel (détail nominatif par député·e)
//
// Source : les pages individuelles du registre des votes sur assnat.qc.ca
// (ex. /fr/travaux-parlementaires/registre-des-votes/43-3-63/index.html).
//
// Découverte importante : la page de LISTE des votes charge son contenu par
// AJAX (JS requis pour la voir), mais chaque page de détail de vote individuel
// est du HTML statique normal — un simple fetch fonctionne, comme le reste du
// site, à condition d'envoyer un user-agent réaliste (le site a un pare-feu
// anti-bot qui bloque les user-agents génériques/vides, pas juste "pas de JS").
// Playwright a servi à explorer/confirmer ça, mais n'est PAS requis pour ce
// scraper en production.
//
// Chaque projet de loi identifié dans le titre du vote ("Projet de loi n° X")
// est laissé à résoudre au moment de la fusion avec data/bills.json — voir
// build-votes-data.js — car le numéro de projet de loi seul n'est pas unique
// (voir bills.js). Ce scraper se contente de capter fidèlement ce qui est
// affiché : titre, étape, numéro de projet de loi si mentionné, date, et le
// détail nominatif (POUR/CONTRE/ABSTENTION) avec l'ID assnat de chaque
// député·e (voir deputes.js pour le même ID, utilisé comme clé de jonction).
//
// Pas de donnée inventée : si une page de vote n'existe pas (hors limites),
// le scraper s'arrête pour cette session — il ne devine jamais un numéro
// suivant qui n'existe pas.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const LEGISLATURE = 43;
const SESSIONS = [1, 2, 3];
const MAX_VOTES_PER_SESSION = 2000; // garde-fou, bien au-delà de ce qu'on attend
const REQUEST_DELAY_MS = 350;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_PATH = 'data/votes.json';

const FRENCH_MONTHS = {
  janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12',
};

function parseFrenchDate(text) {
  const match = text.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i);
  if (!match) return null;
  const [, day, monthName, year] = match;
  return `${year}-${FRENCH_MONTHS[monthName.toLowerCase()]}-${day.padStart(2, '0')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Découverte (juillet 2026) : un panneau (Pour/Contre/Abstentions) qui contient
// beaucoup de noms est affiché sur PLUSIEURS <div class="colonneVote"> côte à
// côte, pas une seule liste. Délimiter le panneau en cherchant le premier
// "</div></div>" (comme avant) coupe donc à la fin de la 1re colonne et perd
// tout le monde après — silencieusement, sans erreur. Repéré parce que deux
// ministres (Lafrenière, LeBel) n'apparaissaient dans AUCUN des 735 votes alors
// qu'ils sont visibles dans le HTML brut. Corrigé en délimitant plutôt par la
// position du panneau SUIVANT (les 3 panneaux se suivent toujours dans le même
// ordre Pour/Contre/Abstentions) : plus besoin de faire confiance à un
// découpage de balises div qui peut varier selon le nombre de colonnes.
function extractPanelHtml(html, panelId, nextPanelId) {
  const startIdx = html.indexOf(`id="${panelId}"`);
  if (startIdx === -1) return '';
  const endIdx = nextPanelId ? html.indexOf(`id="${nextPanelId}"`, startIdx) : -1;
  return endIdx === -1 ? html.slice(startIdx) : html.slice(startIdx, endIdx);
}

// Deuxième découverte : quand deux député·e·s partagent le même nom de famille
// (ex. deux "Caron", deux "Dufour", deux "Girard"), la page insère un span
// <span class="circonscription">&nbsp;(Nom de la circonscription)</span> entre
// le nom et le parti pour les distinguer. Absent la plupart du temps, présent
// seulement pour ces cas d'homonymie — la regex doit le rendre optionnel,
// sinon ces entrées précises (et seulement celles-là) disparaissent en silence.
function extractNameList(html, panelId, nextPanelId) {
  const panelHtml = extractPanelHtml(html, panelId, nextPanelId);
  const people = [];
  const re = /<div id="(\d+)" class="depute">\s*<span class="nom">([^<]+)<\/span>(?:<span class="circonscription">&nbsp;\(([^)]+)\)<\/span>)?<span class="parti">&nbsp;\(([^)]+)\)<\/span>/g;
  let m;
  while ((m = re.exec(panelHtml))) {
    people.push({ assnatId: Number(m[1]), lastName: m[2].trim(), riding: m[3] ? m[3].trim() : null, party: m[4].trim() });
  }
  return people;
}

async function fetchVote(legislature, session, num) {
  const url = `https://www.assnat.qc.ca/fr/travaux-parlementaires/registre-des-votes/${legislature}-${session}-${num}/index.html`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const html = await res.text();

  const titleMatch = html.match(/<h1 id="titreMotion">([^<]+)<\/h1>/);
  if (!titleMatch) return null; // page atypique, on ne devine pas sa structure
  const fullTitle = titleMatch[1].replace(/\s+/g, ' ').trim();

  const voteHeaderMatch = html.match(/<h2 id="titreVote"[^>]*>([\s\S]*?)<\/h2>/);
  const voteHeaderText = voteHeaderMatch ? voteHeaderMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const date = parseFrenchDate(voteHeaderText);

  const [, stage, rest] = fullTitle.match(/^([^–]+)–\s*(.*)$/) || [null, null, fullTitle];
  const billMatch = fullTitle.match(/Projet de loi n[°o]\s*(\d+)/i);
  const billNum = billMatch ? Number(billMatch[1]) : null;

  const pour = extractNameList(html, 'ctl00_ColCentre_ContenuColonneGauche_pnlPour', 'ctl00_ColCentre_ContenuColonneGauche_pnlContre');
  const contre = extractNameList(html, 'ctl00_ColCentre_ContenuColonneGauche_pnlContre', 'ctl00_ColCentre_ContenuColonneGauche_pnlAbstentions');
  const abstentions = extractNameList(html, 'ctl00_ColCentre_ContenuColonneGauche_pnlAbstentions', null);

  // Garde-fou : la page affiche elle-même le compte officiel (champs cachés
  // nbPour/nbContre/nbAbstentions) — comparé à ce qu'on a extrait, pour
  // détecter tout de suite une future régression de ce genre plutôt que de
  // laisser passer des décomptes silencieusement incomplets.
  const officialPour = Number(html.match(/id="nbPour" value="(\d+)"/)?.[1]);
  const officialContre = Number(html.match(/id="nbContre" value="(\d+)"/)?.[1]);
  const officialAbstentions = Number(html.match(/id="nbAbstentions" value="(\d+)"/)?.[1]);
  if (!Number.isNaN(officialPour) && officialPour !== pour.length) {
    console.error(`  ⚠ ${legislature}-${session}-${num} : pour extrait=${pour.length} mais officiel=${officialPour}`);
  }
  if (!Number.isNaN(officialContre) && officialContre !== contre.length) {
    console.error(`  ⚠ ${legislature}-${session}-${num} : contre extrait=${contre.length} mais officiel=${officialContre}`);
  }
  if (!Number.isNaN(officialAbstentions) && officialAbstentions !== abstentions.length) {
    console.error(`  ⚠ ${legislature}-${session}-${num} : abstentions extrait=${abstentions.length} mais officiel=${officialAbstentions}`);
  }

  return {
    legislature,
    session,
    num,
    url,
    date,
    title: fullTitle,
    stage: stage ? stage.trim() : null,
    subject: rest ? rest.trim() : fullTitle,
    billNum,
    pour,
    contre,
    abstentions,
    totals: { pour: pour.length, contre: contre.length, abstentions: abstentions.length },
  };
}

// Votes déjà en base : ils sont IMMUABLES (un résultat de scrutin ne change pas)
// et numérotés séquentiellement par session. On reprend donc juste APRÈS le plus
// haut numéro déjà connu, au lieu de re-télécharger les ~735 votes à chaque run.
// Un rafraîchissement quotidien ne récupère ainsi que les nouveaux votes
// (quelques secondes au lieu de 10-15 min et 700+ requêtes à assnat).
function loadExistingVotes() {
  if (!existsSync(OUT_PATH)) return [];
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf-8')).votes || [];
  } catch {
    return [];
  }
}

async function main() {
  const votes = loadExistingVotes();
  let errors = 0;
  let added = 0;

  const maxBySession = new Map();
  for (const v of votes) {
    if (v.legislature === LEGISLATURE) {
      maxBySession.set(v.session, Math.max(maxBySession.get(v.session) ?? 0, v.num));
    }
  }

  const sessionsToRun = process.env.SCRAPE_SESSION ? [Number(process.env.SCRAPE_SESSION)] : SESSIONS;
  const maxPerSession = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : MAX_VOTES_PER_SESSION;

  for (const session of sessionsToRun) {
    const startNum = (maxBySession.get(session) ?? 0) + 1;
    let num = startNum;
    let consecutiveMisses = 0;
    while (num <= maxPerSession && consecutiveMisses < 2) {
      try {
        const vote = await fetchVote(LEGISLATURE, session, num);
        if (vote) {
          votes.push(vote);
          added++;
          consecutiveMisses = 0;
        } else {
          consecutiveMisses++;
        }
      } catch (err) {
        errors++;
        console.error(`  ⚠ ${LEGISLATURE}-${session}-${num} : ${err.message}`);
        consecutiveMisses++;
      }
      num++;
      await sleep(REQUEST_DELAY_MS);
    }
    const total = votes.filter((v) => v.session === session).length;
    console.log(`Session ${session} : reprise à ${startNum}, ${total} votes au total (arrêt à ${num - 1}).`);
  }

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { legislature: LEGISLATURE, scrapedAt: new Date().toISOString(), count: votes.length, votes },
      null,
      2
    )
  );

  console.log(`Terminé. ${added} nouveau(x) vote(s), ${votes.length} au total dans ${OUT_PATH}, ${errors} erreurs.`);
}

main().catch((err) => {
  console.error('Échec du scraper votes.js :', err);
  process.exitCode = 1;
});
