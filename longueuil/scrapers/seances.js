// Le calendrier des séances : une requête par instance active, à sa page officielle.
//
//   node scrapers/seances.js
//
// Chaque page liste toutes les séances de l'instance depuis 2021 — date, ordre du jour,
// procès-verbal (quand il est adopté et publié, environ un mois plus tard) et « Global » (le
// document de séance avec les sommaires décisionnels). Le fichier écrit, data/seances.json, est
// ce que lisent decisions.js, votes.js et sommaires.js : eux ne redemandent jamais la page.

import { writeFile, readFile } from 'node:fs/promises';
import { INSTANCES, INSTANCES_ACTIVES, seancesInstance } from '../lib/lgl.js';

const OUT = new URL('../data/seances.json', import.meta.url);

async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const precedent = await lireJson(OUT);
  const connues = new Map((precedent?.seances ?? []).map((s) => [s.id, s]));
  const seances = [];
  const pages = {};
  const echecs = [];
  for (const cle of INSTANCES_ACTIVES) {
    try {
      const { url, seances: lues } = await seancesInstance(cle);
      pages[cle] = url;
      if (!lues.length) throw new Error(`aucune séance reconnue sur ${url} — la page a peut-être changé`);
      seances.push(...lues);
      console.log(`${INSTANCES[cle].nom} : ${lues.length} séances (${lues.filter((s) => s.pv).length} avec procès-verbal, ${lues.filter((s) => s.global).length} avec document de séance)`);
    } catch (err) {
      // Une page en panne garde les séances de la veille pour cette instance.
      echecs.push(cle);
      console.warn(`⚠ ${INSTANCES[cle].nom} : ${err.message}`);
      seances.push(...[...connues.values()].filter((s) => s.instance === cle));
    }
  }
  seances.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const nouveauxPv = seances.filter((s) => s.pv && !connues.get(s.id)?.pv).map((s) => s.id);
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: pages, instances: INSTANCES_ACTIVES, nombre: seances.length, nouveauxProcesVerbaux: precedent ? nouveauxPv : null, seances }, null, 1),
    'utf8'
  );
  console.log(`\n${seances.length} séances écrites dans data/seances.json${precedent ? ` — ${nouveauxPv.length} procès-verbal(aux) nouvellement publié(s)` : ''}.`);
  if (echecs.length === INSTANCES_ACTIVES.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
