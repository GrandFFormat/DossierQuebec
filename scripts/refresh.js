// Rafraîchissement TOLÉRANT des données (local ET CI).
//
// Avant, un seul scraper en échec (source bloquée, 403, panne réseau) arrêtait
// TOUT le rafraîchissement — donc aucune donnée n'était publiée, même celles des
// sources qui fonctionnaient (cf. l'échec transitoire du 2026-08-12). Désormais :
// chaque scraper est lancé à tour de rôle ; s'il échoue, on le NOTE et on
// CONTINUE. Le scraper en échec garde simplement ses données de la veille (son
// data/*.json n'est pas réécrit) et le build assemble le site avec ce qui est
// disponible.
//
// Politique de sortie :
//   - Un scraper qui échoue N'ARRÊTE PAS la chaîne (données partielles = publiables).
//   - Le garde-fou anti-corruption OU un build qui échoue EST fatal : on ne publie
//     pas un index.html cassé (exit 1 → le workflow saute le commit).
//   - En CI, on écrit `builds_ok` et `failed` dans $GITHUB_OUTPUT : le workflow
//     committe les données fraîches si builds_ok, PUIS marque le run en échec si
//     « failed » n'est pas vide (alerte visuelle sans perdre les données).
//
// L'étape des résumés IA (bill-summaries) reste « best effort » : traitée comme
// un scraper tolérant, un échec (clé absente, API en panne) ne bloque rien.
//
// La clé API vient de api.env en local (chargé si le fichier existe) ou des
// variables d'environnement en CI (secret GitHub) — jamais codée en dur.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

// Lance un script node. Lève une erreur si le code de sortie n'est pas 0.
function runOrThrow(label, nodeArgs) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`code ${res.status}`);
}

// En local, api.env fournit ANTHROPIC_API_KEY ; en CI, elle vient de l'env (secret).
const summariesArgs = existsSync('api.env')
  ? ['--env-file=api.env', 'scrapers/bill-summaries.js']
  : ['scrapers/bill-summaries.js'];

// Les pétitions bougent lentement : on ne les rafraîchit qu'une fois par semaine
// (lundi UTC), pas chaque jour. FORCE_PETITIONS=1 force la mise à jour (local),
// et on force aussi si le fichier n'existe pas encore.
const doPetitions =
  new Date().getUTCDay() === 1 || // 0=dimanche, 1=lundi
  process.env.FORCE_PETITIONS === '1' ||
  !existsSync('data/petitions.json');

// 1) Scrapers (source -> data/*.json) — TOLÉRANT.
const SCRAPERS = [
  ['Scrape : projets de loi (Données Québec)', ['scrapers/bills.js']],
  ['Scrape : détails des projets de loi (assnat)', ['scrapers/bill-details.js']],
  ...(doPetitions ? [['Scrape : pétitions ouvertes (assnat, hebdo)', ['scrapers/petitions.js']]] : []),
  ['Scrape : résumés IA + traductions (Claude)', summariesArgs],
  ['Scrape : députés (assnat)', ['scrapers/deputes.js']],
  ['Scrape : courriels des députés (assnat)', ['scrapers/depute-emails.js']],
  ['Scrape : votes (assnat)', ['scrapers/votes.js']],
  ['Scrape : ministres (quebec.ca)', ['scrapers/ministers.js']],
];

const failed = [];
for (const [label, args] of SCRAPERS) {
  try {
    runOrThrow(label, args);
  } catch (e) {
    failed.push(label);
    console.error(`⚠ « ${label} » a échoué (${e.message}) — on garde ses données précédentes et on continue.`);
  }
}

// 1.5) Garde-fou anti-corruption : refuse de publier si les données fraîches
// semblent catastrophiquement cassées (une source qui change de format et vide
// un champ pour tout le monde — déjà vu : régions des députés passées à 0).
// Seuils très bas : on n'attrape que les effondrements évidents. Un scraper qui
// a ÉCHOUÉ garde ses données de la veille → il passe ce garde-fou (normal).
function sanityCheck() {
  const arr = (path, key) => {
    try { return JSON.parse(readFileSync(path, 'utf-8'))[key] || []; }
    catch { return []; }
  };
  const deputes = arr('data/deputes.json', 'deputes');
  const checks = [
    ['projets de loi', arr('data/bills.json', 'bills').length, 50],
    ['députés', deputes.length, 100],
    ['députés avec région', deputes.filter((d) => d.region).length, 100],
    ['votes', arr('data/votes.json', 'votes').length, 100],
    ['ministres', arr('data/ministers.json', 'ministers').length, 15],
  ];
  const failures = checks.filter(([, n, min]) => n < min);
  if (failures.length) {
    console.error('\n✖ Garde-fou : données suspectes — AUCUNE injection, aucun commit.');
    for (const [label, n, min] of failures) console.error(`   - ${label} : ${n} (minimum attendu : ${min})`);
    throw new Error('garde-fou anti-corruption déclenché');
  }
  console.log('\n✓ Garde-fou OK : ' + checks.map(([l, n]) => `${l}=${n}`).join(', '));
}

// 2) Builds (data/*.json -> index.html) — FATAL : on ne publie pas un site cassé.
let publishOk = true;
try {
  sanityCheck();
  const BUILDS = [
    ['Build : projets de loi -> index.html', ['scrapers/build-frontend-data.js']],
    ['Build : députés -> index.html', ['scrapers/build-deputes-data.js']],
    ['Build : courriels -> index.html', ['scrapers/build-depute-emails-data.js']],
    ['Build : votes -> index.html', ['scrapers/build-votes-data.js']],
    ['Build : ministres -> index.html', ['scrapers/build-ministers-data.js']],
    ...(doPetitions ? [['Build : pétitions -> index.html (hebdo)', ['scrapers/build-petitions-data.js']]] : []),
    // Pages de section pré-rendues (SEO) : APRÈS toutes les injections ci-dessus.
    ['Build : pages de section (SEO) -> *.html', ['scripts/build-section-pages.js']],
  ];
  for (const [label, args] of BUILDS) runOrThrow(label, args);
} catch (e) {
  publishOk = false;
  console.error(`\n✖ Étape critique échouée (${e.message}) — rien ne sera publié.`);
}

console.log('\n──────── Résumé du rafraîchissement ────────');
console.log(`  scrapers en échec : ${failed.length ? failed.join(' | ') : 'aucun'}`);
console.log(`  garde-fou + build : ${publishOk ? 'OK' : 'ÉCHEC'}`);

// Sorties pour GitHub Actions (ignorées en local, où $GITHUB_OUTPUT n'existe pas).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `builds_ok=${publishOk}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed.join(' | ')}\n`);
}

// Fatal UNIQUEMENT si le garde-fou/build a cassé. Un scraper raté ne fait pas
// échouer ce process (sinon l'étape de commit serait sautée et on ne publierait
// pas les données fraîches des autres) : c'est le workflow qui transforme
// « failed » en échec de run APRÈS le commit, pour l'alerte.
process.exit(publishOk ? 0 : 1);
