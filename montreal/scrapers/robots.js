// Ce que les sites de la Ville demandent aux robots.
//
//   node scrapers/robots.js
//
// robots.txt n'interdit rien techniquement : c'est la règle de politesse que chaque site
// publie. Avant tout volume, et avant de rendre le site public, on veut savoir ce qu'elle
// dit pour les chemins qu'on lit — et le garder avec les données, daté, pour que la
// réponse soit dans le dépôt plutôt que dans la mémoire de quelqu'un.

import { writeFile } from 'node:fs/promises';
import { texte } from '../lib/mtl.js';

const OUT = new URL('../data/robots.json', import.meta.url);
const SITES = ['https://ville.montreal.qc.ca/robots.txt', 'https://donnees.montreal.ca/robots.txt', 'https://montreal.ca/robots.txt'];
// Les chemins que nos scrapers lisent.
const CHEMINS = ['/documents/Adi_Public/', '/api/3/action/', '/dataset/'];

// Lecture minimale : les groupes « User-agent: * » et les Disallow/Allow qui s'appliquent.
export function analyser(contenu) {
  const groupes = [];
  let courant = null;
  for (const ligne of String(contenu ?? '').split(/\r?\n/)) {
    const l = ligne.replace(/#.*$/, '').trim();
    if (!l) continue;
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, cle, valeur] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (cle === 'user-agent') {
      if (!courant || courant.regles.length) courant = { agents: [], regles: [] }, groupes.push(courant);
      courant.agents.push(valeur);
    } else if ((cle === 'disallow' || cle === 'allow') && courant) courant.regles.push({ type: cle, chemin: valeur });
  }
  const general = groupes.find((g) => g.agents.includes('*'));
  const concerne = (g) => (g?.regles ?? []).filter((r) => r.chemin && CHEMINS.some((c) => c.startsWith(r.chemin) || r.chemin.startsWith(c)));
  return { groupes, toutInterdit: Boolean(general?.regles.some((r) => r.type === 'disallow' && r.chemin === '/')), reglesConcernantNosChemins: concerne(general) };
}

async function main() {
  const sites = [];
  for (const url of SITES) {
    let contenu = null;
    let erreur = null;
    try {
      contenu = await texte(url, { accept: 'text/plain' });
    } catch (err) {
      erreur = String(err.message ?? err);
    }
    const a = contenu ? analyser(contenu) : null;
    sites.push({ url, present: Boolean(contenu), erreur, toutInterdit: a?.toutInterdit ?? null, reglesConcernantNosChemins: a?.reglesConcernantNosChemins ?? null, texte: contenu ? contenu.slice(0, 4000) : null });
    console.log(`${url} : ${contenu ? (a.toutInterdit ? 'INTERDIT À TOUS' : a.reglesConcernantNosChemins.length ? 'règles sur nos chemins : ' + a.reglesConcernantNosChemins.map((r) => `${r.type} ${r.chemin}`).join(', ') : 'rien qui concerne nos chemins') : erreur ?? 'absent (404)'}`);
  }
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cheminsLus: CHEMINS, sites }, null, 1), 'utf8');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
