// Ce que les sites de la Ville demandent aux robots.
//
//   node scrapers/robots.js
//
// robots.txt n'interdit rien techniquement : c'est la règle de politesse que chaque site
// publie. Avant tout volume, et avant de rendre le site public, on veut savoir ce qu'elle
// dit pour les chemins qu'on lit — et le garder avec les données, daté, pour que la
// réponse soit dans le dépôt plutôt que dans la mémoire de quelqu'un.

import { readFile, writeFile } from 'node:fs/promises';
import { texte } from '../lib/levis.js';

const OUT = new URL('../data/robots.json', import.meta.url);
// Le stockage S3 des PDF (levis-website-resources.s3.bhs.io.cloud.ovh.net) n'a pas de robots.txt :
// il répond 403 à la racine, ce qui est consigné tel quel. Le site de la Ville, lui, est marqué
// « principal » : s'il ne répond pas, la routine doit le dire (voir main).
const SITES = [
  { url: 'https://levis.ca/robots.txt', principal: true },
  { url: 'https://www.donneesquebec.ca/robots.txt' },
  { url: 'https://levis-website-resources.s3.bhs.io.cloud.ovh.net/robots.txt' },
];
// Les chemins que nos scrapers lisent.
const CHEMINS = ['/graphql/', '/fr/ville/', '/_nuxt/', '/pc/', '/recherche/api/3/action/', '/recherche/dataset/'];

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
  // Le relevé de la veille, pour ne pas le perdre quand un site ne répond pas. Le 27 septembre
  // 2026, levis.ca a été injoignable une minute depuis GitHub : le bon relevé (ce que la Ville
  // permet, la preuve que cite le README) a été remplacé par « introuvable, texte : aucun », et
  // la routine a annoncé « avertissements : aucun ». Un relevé ne s'efface plus faute de réponse.
  const ancien = await readFile(OUT, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  const avant = new Map((ancien?.sites ?? []).map((s) => [s.url, s]));

  const sites = [];
  const muets = [];
  for (const { url, principal } of SITES) {
    let contenu = null;
    let erreur = null;
    try {
      contenu = await texte(url, { accept: 'text/plain' });
    } catch (err) {
      erreur = String(err.message ?? err);
    }
    // Deux absences à ne pas confondre : un 404 (texte() rend null sans erreur) est un FAIT sur le
    // site, on le consigne ; une erreur réseau ou HTTP, après les quatre tentatives de requete(),
    // ne dit rien du site — on garde alors le dernier relevé, daté, et on le signale.
    const precedent = avant.get(url);
    if (erreur && precedent?.present) {
      if (principal) muets.push(url);
      sites.push({ ...precedent, releveDe: precedent.releveDe ?? ancien.generatedAt, dernierEchec: { le: new Date().toISOString(), erreur } });
      console.log(`${url} : non lu (${erreur}) — relevé du ${(precedent.releveDe ?? ancien.generatedAt).slice(0, 10)} conservé`);
      continue;
    }
    if (erreur && principal) muets.push(url);
    const a = contenu ? analyser(contenu) : null;
    sites.push({ url, present: Boolean(contenu), erreur, toutInterdit: a?.toutInterdit ?? null, reglesConcernantNosChemins: a?.reglesConcernantNosChemins ?? null, texte: contenu ? contenu.slice(0, 4000) : null });
    console.log(`${url} : ${contenu ? (a.toutInterdit ? 'INTERDIT À TOUS' : a.reglesConcernantNosChemins.length ? 'règles sur nos chemins : ' + a.reglesConcernantNosChemins.map((r) => `${r.type} ${r.chemin}`).join(', ') : 'rien qui concerne nos chemins') : erreur ?? 'absent (404)'}`);
  }
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cheminsLus: CHEMINS, sites }, null, 1), 'utf8');

  // Le 403 connu du stockage S3 et un éventuel 404 restent des relevés justes : seul le site de la
  // Ville resté muet vaut un avertissement (étape secondaire dans refresh.js).
  if (muets.length) {
    console.warn(`⚠ ${muets.join(', ')} : pas de réponse aujourd'hui — les conditions de lecture n'ont pas pu être vérifiées.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
