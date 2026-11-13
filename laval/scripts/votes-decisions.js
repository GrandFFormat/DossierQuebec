// Votes nominatifs rangés par numéro de décision, pour la page Décisions (fusion des pages Votes et
// Décisions, 12 nov. 2026). Version allégée de data/votes.json (400 ko) : les noms sont en index.
//
//   node scripts/votes-decisions.js
//
// Sortie : data/votes-decisions.json — { noms: [...], v: { "CV-2026-0774": [résultat, [pour], [contre], demandeur, pdf] } }
// où [pour] et [contre] sont des rangs dans noms. Lu par assets/app.js (boîte « Vote nominatif » d'une
// fiche, filtre « Avec vote nominatif »).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { votes } = JSON.parse(readFileSync('data/votes.json', 'utf8'));
const noms = [];
const rang = (n) => {
  let i = noms.indexOf(n);
  if (i < 0) { noms.push(n); i = noms.length - 1; }
  return i;
};
const v = {};
for (const x of votes) {
  if (!x.numero) continue;
  v[x.numero] = [x.resultat ?? '', x.pour.map(rang), x.contre.map(rang), x.demandeParVote ?? '', x.pdf ?? ''];
}
writeFileSync('data/votes-decisions.json', JSON.stringify({ noms, v }));
console.log(`Votes par décision : ${Object.keys(v).length} décisions, ${noms.length} noms.`);
