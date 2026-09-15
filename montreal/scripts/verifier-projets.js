// Relecture des sujets suivables (lib/projets.js) sur les décisions de l'année.
//
//   node scripts/verifier-projets.js [cle]     tous les sujets, ou un seul avec toutes ses décisions
//
// Pour chaque sujet : le nombre de décisions et un échantillon d'objets. C'est à relire à
// l'œil après chaque modification d'une règle. Un faux positif dans un sujet suivi, c'est
// un abonné qui reçoit une décision qui ne le concerne pas — et une règle qui a l'air juste
// peut se tromper en silence : « \bREV\b » attrapait « REVÊTEMENT ».

import { readFile } from 'node:fs/promises';
import { PROJETS, projetsDe } from '../lib/projets.js';

const cle = process.argv[2];
const { decisions } = JSON.parse(await readFile(new URL('../data/decisions.json', import.meta.url), 'utf8'));
// Les fiches de procès-verbaux et d'ordres du jour sont des documents, pas des décisions.
const resolutions = decisions.filter((d) => d.type === 'Résolution');

for (const [k, p] of Object.entries(PROJETS)) {
  if (cle && k !== cle) continue;
  const siennes = resolutions.filter((d) => projetsDe(d.objet).includes(k));
  console.log(`\n=== ${p.titre} — ${siennes.length} décision(s) sur ${resolutions.length}`);
  const pas = Math.max(1, Math.floor(siennes.length / 10));
  const echantillon = cle ? siennes : siennes.filter((_, i) => i % pas === 0).slice(0, 10);
  for (const d of echantillon) console.log(`   ${d.date} ${(d.numero ?? '').padEnd(16)} ${(d.objet ?? '').slice(0, 118)}`);
}
