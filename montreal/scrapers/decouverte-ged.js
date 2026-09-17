// Découverte, pas extraction : ce script ne produit aucune donnée de site.
//
// Le 17 septembre 2026, l'équipe des Données ouvertes a répondu qu'il n'existe pas de façon
// publique d'atteindre un sommaire décisionnel par son identifiant, MAIS que plusieurs
// sommaires se trouvent dans l'outil de gestion documentaire de la Ville, avec cet exemple :
//
//   https://mtl.ged.montreal.ca/constellio/?collection=mtlca&portal=REPDOCVDM
//     #!searchResults/s/46b35cdf-b20b-11f1-81fa-496f41e4c0cd
//
// C'est une information neuve et importante : les documents ne sont pas derrière un
// intranet, ils sont dans un portail public. Ce qui manque, c'est le chemin qui va d'un
// numéro de dossier à son document. Or ce portail est un Constellio — un logiciel libre de
// gestion documentaire —, et un Constellio se cherche. Si sa recherche est ouverte, on peut
// faire nous-mêmes ce que la Ville dit ne pas pouvoir offrir.
//
// Ce script pose la question, sobrement : que dit le robots.txt, à quoi ressemble le
// portail, et existe-t-il un point d'entrée de recherche qui réponde à un numéro de
// dossier. Une trentaine de requêtes au plus, une seconde entre chacune.
//
//   npm run decouvrir:ged
//
// RÈGLE : on ne contourne rien. Si le robots.txt interdit un chemin, on ne le demande pas,
// et le rapport le dit. Ce qu'on cherche, c'est une porte ouverte, pas une serrure.

import { writeFile, mkdir } from 'node:fs/promises';
import { requete } from '../lib/mtl.js';

const OUT = new URL('../data/ged-decouverte.json', import.meta.url);
const HOTE = 'https://mtl.ged.montreal.ca';
const EXEMPLE = `${HOTE}/constellio/?collection=mtlca&portal=REPDOCVDM#!searchResults/s/46b35cdf-b20b-11f1-81fa-496f41e4c0cd`;

// Un numéro de dossier bien réel, tiré de nos propres décisions : c'est lui qu'on cherchera.
const DOSSIER = '1265298015';

// Les chemins que Constellio expose habituellement. On les demande un à un et on note ce
// qui répond — sans jamais forcer : un 401, un 403 ou un 404 est une réponse, pas un mur à
// escalader.
const CHEMINS = [
  '/robots.txt',
  '/constellio/',
  '/constellio/?collection=mtlca&portal=REPDOCVDM',
  // L'API REST de Constellio (v1/v2 selon les versions).
  '/constellio/rest/v1/collections',
  '/constellio/rest/v2/collections',
  '/constellio/rest/search',
  // Le moteur d'indexation, quand il est exposé.
  `/constellio/select?q=${DOSSIER}&wt=json`,
  `/constellio/solr/select?q=${DOSSIER}&wt=json`,
  // Les vues de recherche du portail, telles que l'exemple les suggère.
  `/constellio/search?collection=mtlca&portal=REPDOCVDM&q=${DOSSIER}`,
  `/constellio/?collection=mtlca&portal=REPDOCVDM&q=${DOSSIER}`,
  // Un document par son identifiant, si la forme existe.
  '/constellio/document/46b35cdf-b20b-11f1-81fa-496f41e4c0cd',
];

function interessant(html) {
  if (!html) return null;
  const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const formulaires = [...html.matchAll(/<form[^>]*action="([^"]+)"/gi)].map((m) => m[1]).slice(0, 6);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]).slice(0, 8);
  // Une application d'une seule page ne dit rien dans son HTML : on le signale plutôt que
  // de conclure « rien trouvé ».
  const spa = /vaadin|constellio/i.test(html) && html.length < 60000;
  return { titre, longueur: html.length, formulaires, scripts, applicationUnePage: spa, extrait: html.replace(/\s+/g, ' ').slice(0, 400) };
}

async function essayer(chemin) {
  const url = chemin.startsWith('http') ? chemin : `${HOTE}${chemin}`;
  const ligne = { url };
  let rep;
  try {
    rep = await requete(url, { notFoundIsNull: false });
  } catch (err) {
    ligne.resultat = String(err.message ?? err).replace(/ sur https?:\/\/\S+$/, '');
    console.log(`  ${ligne.resultat.padEnd(34)} ${url}`);
    return ligne;
  }
  ligne.statut = rep.status;
  ligne.type = rep.headers.get('content-type') ?? '';
  const corps = await rep.text().catch(() => '');
  ligne.resultat = `HTTP ${rep.status} ${ligne.type.split(';')[0]}`;
  if (/json/i.test(ligne.type)) {
    ligne.json = corps.slice(0, 1200);
  } else {
    Object.assign(ligne, interessant(corps) ?? {});
  }
  // Le numéro de dossier apparaît-il quelque part dans la réponse ? C'est le seul signe qui
  // compte : il dirait que la recherche fonctionne et qu'elle nous répond.
  ligne.contientLeDossier = corps.includes(DOSSIER);
  console.log(`  ${ligne.resultat.padEnd(34)} ${url}${ligne.contientLeDossier ? '   ← contient le numéro de dossier' : ''}`);
  if (ligne.titre) console.log(`      titre : ${ligne.titre}`);
  return ligne;
}

async function principal() {
  const rapport = { generatedAt: new Date().toISOString(), hote: HOTE, exemple: EXEMPLE, dossierCherche: DOSSIER, essais: [] };

  console.log(`=== Le portail documentaire de la Ville : ${HOTE} ===`);
  console.log("(une seconde entre deux requêtes ; on ne demande rien que le robots.txt interdise)\n");

  // Le robots.txt d'abord, et on s'y tient pour la suite.
  const robots = await essayer('/robots.txt');
  rapport.essais.push(robots);
  const interdits = (robots.extrait ?? '')
    .split(/\s+/)
    .filter((_, i, t) => t[i - 1]?.toLowerCase() === 'disallow:')
    .filter((c) => c && c !== '/');
  if (interdits.length) console.log(`\n  robots.txt interdit : ${interdits.join(', ')}`);
  const permis = (chemin) => !interdits.some((d) => chemin.startsWith(d));

  console.log('');
  for (const chemin of CHEMINS.slice(1)) {
    if (!permis(chemin.split('?')[0])) {
      console.log(`  (sauté, interdit par robots.txt)           ${chemin}`);
      rapport.essais.push({ url: HOTE + chemin, resultat: 'sauté — interdit par robots.txt' });
      continue;
    }
    rapport.essais.push(await essayer(chemin));
  }

  const repondent = rapport.essais.filter((e) => e.statut && e.statut < 400);
  const trouve = rapport.essais.filter((e) => e.contientLeDossier);
  console.log(`\n${repondent.length} chemin(s) répondent, ${trouve.length} contiennent le numéro de dossier ${DOSSIER}.`);
  if (!trouve.length) {
    console.log("Aucune recherche ouverte n'a rendu le dossier. Le portail est probablement une");
    console.log('application d\'une seule page : sa recherche passe par des appels que ce script ne');
    console.log('devine pas. La suite se fait à la main, dans un navigateur, ou en la redemandant.');
  }

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
  console.log('\nRapport écrit dans data/ged-decouverte.json');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
