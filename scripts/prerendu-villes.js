// Écrit les décisions les plus récentes DANS la page des décisions d'un volet municipal, pour que
// Google les lise sans exécuter le code. Sans ça, /laval/decisions n'avait que ~300 mots lisibles
// (en-tête, filtres, pied de page), et Google l'a « lue puis écartée » le 22 sept. 2026.
// Décidé le 27 sept. 2026 : Québec et Montréal d'abord ; Lévis, Longueuil et Laval attendent.
//
//   node scripts/prerendu-villes.js            quebec et montreal
//   node scripts/prerendu-villes.js quebec     un seul volet
//
// Ce qui est écrit : les NOMBRE dernières décisions qui ont un résumé en clair (objet, date,
// instance, numéro, les puces du résumé, le lien vers le PDF officiel), entre deux marqueurs dans
// <div id="liste-decisions">. Le visiteur ne le voit qu'un instant : assets/app.js remplace le
// contenu de ce div dès que les données sont chargées. Rien n'est inventé : tout vient de
// data/decisions.json et data/resumes.json, les mêmes fichiers que la page lit.
//
// Relancé par le rafraîchissement quotidien de chaque volet (scripts/refresh.js du volet).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const NOMBRE = 30;
const DEBUT = '<!--PRERENDU:decisions-->';
const FIN = '<!--/PRERENDU:decisions-->';

const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso) => { const [a, m, j] = iso.split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; };

function prerendre(ville) {
  const lire = (f) => JSON.parse(readFileSync(`${RACINE}${ville}/data/${f}`, 'utf8'));
  const { decisions } = lire('decisions.json');
  const parId = new Map(lire('resumes.json').resumes.map((r) => [r.id, r]));
  // Même règle que la page (assets/app.js, resumePour) : le résumé du document, sinon celui de son sommaire.
  const resumeDe = (d) => parId.get(d.id) ?? (d.sommaireId ? parId.get(d.sommaireId) : null);
  const vus = new Set();
  const retenues = [];
  for (const d of [...decisions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))) {
    const r = resumeDe(d);
    if (!r?.puces?.length || r.sansContenuSubstantiel || d.theme === 'procedure') continue;
    // Une même décision traverse plusieurs documents (sommaire, résolution) : une seule fois.
    if (vus.has(r.id)) continue;
    vus.add(r.id);
    retenues.push({ d, r });
    if (retenues.length === NOMBRE) break;
  }
  const html = retenues.map(({ d, r }) => `<article class="decision-prerendu">
<h3>${echapper(d.objet ?? r.objet)}</h3>
<p>${echapper(dateFr(d.date))} · ${echapper(d.instance ?? r.unite ?? '')}${d.numero ? ` · ${echapper(d.numero)}` : ''}</p>
<ul>${r.puces.map((p) => `<li>${echapper(p)}</li>`).join('')}</ul>
<p><a href="${echapper(d.pdf ?? r.pdf)}" rel="noopener">Document officiel (PDF)</a> — résumé généré par IA, le PDF fait foi.</p>
</article>`).join('\n');

  const chemin = `${RACINE}${ville}/decisions-de-la-ville-de-${ville}.html`;
  const page = readFileSync(chemin, 'utf8');
  const nl = page.includes('\r\n') ? '\r\n' : '\n';
  const bloc = `${DEBUT}${nl}<h2 class="prerendu-titre">Les ${retenues.length} décisions les plus récentes, en clair</h2>${nl}${html.split('\n').join(nl)}${nl}${FIN}`;
  let neuve;
  if (page.includes(DEBUT)) neuve = page.slice(0, page.indexOf(DEBUT)) + bloc + page.slice(page.indexOf(FIN) + FIN.length);
  else if (page.includes('<div id="liste-decisions"></div>')) neuve = page.replace('<div id="liste-decisions"></div>', `<div id="liste-decisions">${bloc}</div>`);
  else throw new Error(`${ville}/decisions-de-la-ville-de-${ville}.html : ni marqueurs ni <div id="liste-decisions"></div>`);
  if (neuve !== page) writeFileSync(chemin, neuve);
  console.log(`${ville} : ${retenues.length} décisions écrites dans la page des décisions${neuve === page ? ' (inchangé)' : ''}.`);
}

const demandes = process.argv.slice(2);
for (const ville of demandes.length ? demandes : ['quebec', 'montreal']) prerendre(ville);
