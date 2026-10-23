// La page Wikipédia (français) de chaque député·e, pour le bouton « W » des cartes (Martin, 23 oct.
// 2026 : « sur le site de l'Assemblée, ça explique rien »). Pour chaque nom, on essaie le titre nu,
// puis les titres d'homonymie usuels (« … (homme politique) »…), par l'API publique de Wikipédia.
// Une page n'est retenue que si elle parle d'une personne politique du Québec ; sinon pas de lien.
// Écrit data/wikipedia.json { assnatId: url }.
//
// Comme les mandats, se relance à la main après une élection (node scrapers/wikipedia.js, puis
// node scrapers/build-deputes-data.js).
import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'DossierQuebec/1.0 (https://dossierquebec.ca)';
const OUT = 'data/wikipedia.json';
const SUFFIXES = ['', ' (homme politique)', ' (femme politique)', ' (homme politique québécois)', ' (femme politique québécoise)', ' (politicien)', ' (politicienne)', ' (personnalité politique)'];
const QUEBEC = /Qu[ée]bec|qu[ée]b[ée]cois|Assembl[ée]e nationale/;
const POLITIQUE = /politi|d[ée]put[ée]|ministre/i;

async function resume(titre) {
  const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  return r.json();
}

async function main() {
  const { deputes } = JSON.parse(readFileSync('data/deputes.json', 'utf-8'));
  const liens = {};
  const manquants = [];
  for (const d of deputes) {
    let trouve = null;
    for (const s of SUFFIXES) {
      const j = await resume(d.name + s);
      await new Promise((r) => setTimeout(r, 120));
      if (!j || j.type !== 'standard') continue;
      const texte = `${j.description ?? ''} ${j.extract ?? ''}`;
      // Une personne politique du Québec ; un homonyme député à Ottawa (« Chambre des communes »,
      // « fédéral ») est écarté, sauf si le résumé parle aussi de l'Assemblée nationale.
      const federal = /Chambre des communes|f[ée]d[ée]ral/i.test(texte) && !/Assembl[ée]e nationale/.test(texte);
      if (QUEBEC.test(texte) && POLITIQUE.test(texte) && !federal) { trouve = j.content_urls?.desktop?.page; break; }
    }
    if (trouve) liens[d.assnatId] = trouve;
    else manquants.push(d.name);
  }
  writeFileSync(OUT, JSON.stringify({ source: 'fr.wikipedia.org (API publique)', lu: new Date().toISOString().slice(0, 10), liens }, null, 2) + '\n');
  console.log(`${Object.keys(liens).length} pages trouvées sur ${deputes.length}`);
  if (manquants.length) console.log(`  sans page sûre : ${manquants.join(', ')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
