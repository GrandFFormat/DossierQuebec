// Consultations publiques de la Ville de Lévis (16 nov. 2026) → data/consultations.json.
//
// Source : l'API GraphQL de levis.ca (lib/levis.js), la même que pour les séances. Le calendrier
// de participation citoyenne mêle séances du conseil et consultations : on garde tout ce qui n'est
// pas une séance (forums, assemblées, etc.), à venir. L'heure et le lieu viennent de la fiche
// (HTML complet), une requête par consultation. Sans IA. Format commun : voir quebec/scrapers/consultations.js.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { graphql, texte, sleep } from '../lib/levis.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const CALENDRIER = 'https://levis.ca/fr/ville/organisation-municipale/participation-citoyenne/calendrier-participation-citoyenne';
const REQUETE = `query{ s: participationsCitoyennesStructureEntries(site:["fr"], limit:80, orderBy:"dateElement DESC") {
  title url
  ... on participationCitoyenneStructure_Entry {
    cancelledElement dateElement
    type: selectOneParticipationTypeElement { slug title }
    secteur: selectSecteurElement { title }
  }
} }`;

const auj = new Date().toISOString().slice(0, 10);
const { s } = await graphql(REQUETE);
const items = [];
for (const e of s) {
  const type = e.type?.[0];
  if (!type || /^seance/.test(type.slug)) continue;   // séances du conseil et procès-verbaux : ailleurs
  const debut = String(e.dateElement ?? '').slice(0, 10);
  if (!debut || debut < auj) continue;
  let heure = null, lieu = null;
  try {
    const html = await texte(e.url);
    const t = (html ?? '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '\n').split('\n').map((x) => x.trim()).filter(Boolean);
    const i = t.findIndex((x) => /^Le \d{1,2}(er)? \p{L}+ \d{4}$/u.test(x));
    if (i >= 0) {
      const h = /^De (\d{1,2})h(\d{2})? à (\d{1,2})h(\d{2})?$/.exec(t[i + 1] ?? '');
      if (h) { heure = `${h[1]} h${h[2] ? ' ' + h[2] : ''} à ${h[3]} h${h[4] ? ' ' + h[4] : ''}`; lieu = t[i + 2] && !/^Réserver$/.test(t[i + 2]) ? t[i + 2] : null; }
    }
  } catch (err) { console.warn(`Consultations : fiche illisible (${e.url}) : ${err.message}`); }
  await sleep(600);
  const secteurs = (e.secteur ?? []).map((x) => x.title);
  items.push({
    id: `${e.url}|${debut}`,
    titre: e.title,
    type: type.title,
    debut, fin: null, heure, lieu,
    secteur: secteurs.length === 1 ? secteurs[0] : null,   // les trois arrondissements = toute la ville
    url: e.url,
    annule: Boolean(e.cancelledElement),
  });
}
items.sort((a, b) => a.debut.localeCompare(b.debut));

mkdirSync('data', { recursive: true });
writeFileSync('data/consultations.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: { nom: 'Ville de Lévis', url: CALENDRIER }, items }, null, 1));
console.log(`Consultations : ${items.length} à venir.`);
