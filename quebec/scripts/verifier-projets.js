// Relecture des projets suivables (lib/projets.js) sur les données de l'année et l'archive.
//
//   node scripts/verifier-projets.js [cle]     tous les projets, ou un seul avec toutes ses décisions
//
// Pour chaque projet : le nombre de décisions et un échantillon d'objets. C'est à relire à l'œil
// après chaque modification d'une règle : un faux positif dans un projet suivi, c'est un abonné
// qui reçoit une décision qui ne le concerne pas.

import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { PROJETS, projetsDe } from '../lib/projets.js';

const cle = process.argv[2];
const { decisions } = JSON.parse(await readFile(new URL('../data/decisions.json', import.meta.url), 'utf8'));
let archive = [];
try {
  archive = JSON.parse(gunzipSync(await readFile(new URL('../data/archives/2025.json.gz', import.meta.url)))).decisions;
} catch {}

const pertinents = (liste) => liste.filter((d) => d.type !== 'Procès-verbaux' && d.type !== 'Tableaux des décisions');
for (const [k, p] of Object.entries(PROJETS)) {
  if (cle && k !== cle) continue;
  const annee = pertinents(decisions).filter((d) => projetsDe(d.objet).includes(k));
  const avant = pertinents(archive).filter((d) => projetsDe(d.objet).includes(k));
  console.log(`\n=== ${p.titre} — ${annee.length} décision(s) en 2026, ${avant.length} en 2025`);
  const echantillon = cle ? annee : annee.filter((_, i) => i % Math.max(1, Math.floor(annee.length / 10)) === 0).slice(0, 10);
  for (const d of echantillon) console.log(`   ${d.date} ${(d.numero ?? '').padEnd(14)} ${(d.objet ?? '').slice(0, 120)}`);
}
