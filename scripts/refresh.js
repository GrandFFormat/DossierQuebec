// Orchestrateur du rafraîchissement complet des données (local ET CI).
//
// Lance chaque scraper puis chaque build d'injection dans le bon ordre. Un seul
// script à retenir : `npm run refresh`. Utilisé aussi par le workflow GitHub
// Actions (.github/workflows/refresh.yml) qui tourne chaque jour.
//
// Ordre : d'abord les scrapers (source -> data/*.json), puis les builds
// (data/*.json -> injection dans index.html). Chaque scraper tape UNE source et
// n'invente rien.
//
// L'étape des résumés IA (bill-summaries) est « best effort » : si la clé
// ANTHROPIC_API_KEY manque ou que l'API échoue, on log et on CONTINUE. Les
// données civiques (nouveaux projets de loi, votes) et le déploiement ne doivent
// jamais être bloqués par cet enrichissement optionnel et payant.
//
// La clé API vient de api.env en local (chargé si le fichier existe) ou des
// variables d'environnement en CI (secret GitHub) — jamais codée en dur.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function run(label, nodeArgs, { optional = false } = {}) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });
  if (res.status === 0) return true;
  if (optional) {
    console.warn(`⚠ « ${label} » a échoué (étape optionnelle, code ${res.status}) — on continue.`);
    return false;
  }
  console.error(`✖ « ${label} » a échoué (code ${res.status}) — arrêt du rafraîchissement.`);
  process.exit(res.status || 1);
}

// En local, api.env fournit ANTHROPIC_API_KEY ; en CI, elle vient de l'env (secret).
const summariesArgs = existsSync('api.env')
  ? ['--env-file=api.env', 'scrapers/bill-summaries.js']
  : ['scrapers/bill-summaries.js'];

// 1) Scrapers : source -> data/*.json
run('Scrape : projets de loi (Données Québec)', ['scrapers/bills.js']);
run('Scrape : détails des projets de loi (assnat)', ['scrapers/bill-details.js']);
run('Scrape : résumés IA (Claude)', summariesArgs, { optional: true });
run('Scrape : députés (assnat)', ['scrapers/deputes.js']);
run('Scrape : courriels des députés (assnat)', ['scrapers/depute-emails.js']);
run('Scrape : votes (assnat)', ['scrapers/votes.js']);
run('Scrape : ministres (quebec.ca)', ['scrapers/ministers.js']);

// 1.5) Garde-fou : on refuse de continuer (donc d'injecter dans index.html, de
// committer et de déployer) si les données fraîches semblent catastrophiquement
// cassées — typiquement une source qui change de format et vide un champ pour
// tout le monde (déjà vu : régions des députés passées à 0). Seuils très bas :
// on n'attrape que les effondrements évidents, jamais les variations normales.
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
    console.error('  Probable changement de format d\'une source. À vérifier à la main avant de rafraîchir.');
    process.exit(2);
  }
  console.log('\n✓ Garde-fou OK : ' + checks.map(([l, n]) => `${l}=${n}`).join(', '));
}
sanityCheck();

// 2) Builds : data/*.json -> injection dans index.html
run('Build : projets de loi -> index.html', ['scrapers/build-frontend-data.js']);
run('Build : députés -> index.html', ['scrapers/build-deputes-data.js']);
run('Build : courriels -> index.html', ['scrapers/build-depute-emails-data.js']);
run('Build : votes -> index.html', ['scrapers/build-votes-data.js']);
run('Build : ministres -> index.html', ['scrapers/build-ministers-data.js']);

console.log('\n✓ Rafraîchissement complet terminé.');
