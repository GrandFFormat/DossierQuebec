// /llms.txt — le site expliqué aux assistants (ChatGPT, Claude, Perplexity…), au format proposé par
// llmstxt.org : un titre, un résumé, puis des listes de liens. Martin, 6 oct. 2026 : « il nous
// faut des llms.txt sur tous les dossiers ».
//
// Ce n'est pas une norme et rien ne garantit qu'un assistant le lise. Son intérêt : quand il est
// lu, le site est décrit avec NOS mots (non officiel, sources primaires, rien d'inventé, le texte
// officiel fait foi) plutôt que deviné. Le contenu reprend la page /regles ; si une règle change
// là-bas, elle change ici.
//
// Fabriqué à chaque build (scripts/build-section-pages.js, à la fin), pour que les nombres suivent
// les données. Aucune date dedans : le fichier ne change que si le site change.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://dossierquebec.ca';
const lire = (chemin, defaut) => (existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : defaut);

// Les volets municipaux : nom, dossier, et les adresses de leurs pages (les mêmes que le sitemap).
const VILLES = [
  { nom: 'Québec', dossier: 'quebec', etat: 'volet complet', pages: ['decisions-de-la-ville-de-quebec', 'votes-nominatifs-du-conseil-de-quebec', 'conseil-municipal-de-quebec', 'sources-des-donnees-de-quebec'] },
  { nom: 'Montréal', dossier: 'montreal', etat: 'volet complet', pages: ['decisions-de-la-ville-de-montreal', 'votes-nominatifs-du-conseil-de-montreal', 'conseil-municipal-de-montreal', 'sources-des-donnees-de-montreal'] },
  // `pause` : volets arrêtés le 7 oct. 2026 (commun/navigation.js, VILLES_EN_PAUSE), hors du fichier.
  { nom: 'Lévis', dossier: 'levis', pause: true, etat: 'volet partiel (prototype)', pages: ['decisions-de-la-ville-de-levis', 'votes-nominatifs-du-conseil-de-levis', 'conseil-municipal-de-levis', 'sources-des-donnees-de-levis'] },
  { nom: 'Longueuil', dossier: 'longueuil', pause: true, etat: 'volet partiel (prototype)', pages: ['decisions-de-la-ville-de-longueuil', 'votes-nominatifs-du-conseil-de-longueuil', 'conseil-de-ville-de-longueuil', 'sources-des-donnees-de-longueuil'] },
  { nom: 'Laval', dossier: 'laval', pause: true, etat: 'volet partiel (prototype)', pages: ['decisions-de-la-ville-de-laval', 'votes-nominatifs-du-conseil-de-laval', 'conseil-municipal-de-laval', 'sources-des-donnees-de-laval'] },
];
const LIBELLES = [
  [/^decisions/, 'Décisions'], [/^votes/, 'Votes nominatifs'], [/^conseil/, 'Conseil et élu·e·s'], [/^sources/, 'Sources des données'],
];

export function construireLlms() {
  const bills = lire('data/bills.json', { bills: [] }).bills;
  const votes = lire('data/votes.json', { votes: [] }).votes;
  const ministres = lire('data/ministers.json', { ministers: [] }).ministers;
  const promesses = lire('data/promises.json', { promises: [] }).promises;
  const legislature = Math.max(0, ...bills.map((b) => Number(b.legislature) || 0));
  const parParti = {};
  for (const p of promesses) parParti[p.party] = (parParti[p.party] || 0) + 1;
  const partis = Object.entries(parParti).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ');
  const exemple = bills.find((b) => b.legislature && b.introSession);
  const adresseExemple = exemple ? `${SITE}/projets-de-loi/${exemple.num}-${exemple.legislature}-${exemple.introSession}` : null;

  const villes = VILLES.filter((v) => !v.pause && v.pages.every((p) => existsSync(`${v.dossier}/${p}.html`)));
  const lignes = [
    '# DossierQuébec',
    '',
    "> Site citoyen indépendant et NON OFFICIEL qui rend lisibles, en langage clair, les travaux de l'Assemblée nationale du Québec (projets de loi, votes nominatifs, ministres et député·e·s, promesses électorales) et les décisions des villes de Québec et de Montréal. Gratuit, sans publicité, sans abonnement. Site en français, avec une version anglaise (ajouter ?lang=en à l'adresse).",
    '',
    'À savoir avant de citer ce site :',
    '',
    "- Le site n'est pas une source officielle. Chaque élément renvoie à sa source officielle ; en cas d'écart, c'est le document d'origine qui fait foi. Citez la source officielle avec DossierQuébec, pas DossierQuébec seul.",
    "- Les résumés des projets de loi sont rédigés par une IA à partir du texte officiel de l'Assemblée nationale, et présentés comme tels. Ils ne remplacent pas le texte de loi.",
    "- Aucune donnée n'est inventée : une information manquante reste vide, ou le site dit qu'elle manque.",
    "- Sources primaires seulement : Assemblée nationale, Données Québec, Élections Québec, les Villes, et les documents officiels des partis. Rien n'est tiré des médias.",
    "- Les promesses électorales sont des citations mot pour mot des documents des partis. Le site ne rend aucun verdict (« tenue », « brisée »). La Coalition avenir Québec en est absente parce que son site demande aux outils automatisés de ne pas le lire : cette absence ne dit rien de ce que le parti a promis.",
    `- Les règles complètes : ${SITE}/regles`,
    '',
    "## Assemblée nationale",
    '',
    `- [Projets de loi](${SITE}/projets-de-loi): les ${bills.length} projets de loi de la ${legislature}e législature, chacun résumé en langage clair, avec son étape réelle et le lien vers le texte officiel.`,
    `- [Votes nominatifs](${SITE}/votes): ${votes.length} votes enregistrés, député·e par député·e, sans interprétation.`,
    `- [Ministres et député·e·s](${SITE}/ministres): ${ministres.length} ministres, les député·e·s, leur circonscription et leur présence aux votes.`,
    `- [Promesses électorales 2026](${SITE}/promesses): ${promesses.length} engagements cités mot pour mot (${partis}), chacun avec le lien vers le document du parti.`,
    `- [Lexique](${SITE}/lexique): le vocabulaire de l'Assemblée nationale expliqué simplement.`,
    `- [Les règles du site](${SITE}/regles): d'où viennent les données et ce que le site s'interdit.`,
    `- [Mises à jour du site](${SITE}/sources): ce qui a changé sur le site, du plus récent au plus ancien, et qui est derrière.`,
    '',
    '## Une page par projet de loi',
    '',
    "Chaque projet de loi a sa propre adresse, sur le modèle de celle de l'Assemblée nationale : `/projets-de-loi/NUMÉRO-LÉGISLATURE-SESSION`. Le numéro seul ne suffit pas : il recommence à 1 à chaque session.",
    '',
    ...(adresseExemple ? [`- [Exemple : projet de loi n° ${exemple.num}](${adresseExemple}): ${exemple.title}`] : []),
    `- [Plan du site](${SITE}/sitemap.xml): la liste de toutes les pages, dont celle de chaque projet de loi.`,
    '',
    '## Villes',
    '',
    "Décisions des conseils municipaux, lues dans les documents publiés par chaque Ville : Québec et Montréal. Les volets de Lévis, Longueuil et Laval sont en pause depuis le 7 octobre 2026 : leurs données ne sont plus mises à jour, ne les citez pas comme à jour.",
    '',
    ...villes.flatMap((v) => [
      `- [${v.nom}](${SITE}/${v.dossier}/): ${v.etat}.`,
      ...v.pages.map((p) => `- [${v.nom} — ${LIBELLES.find(([re]) => re.test(p))[1]}](${SITE}/${v.dossier}/${p})`),
    ]),
    '',
    '## Optional',
    '',
    `- [Flux RSS « Quoi de neuf »](${SITE}/feed.xml): les nouveautés de l'Assemblée nationale.`,
    '- [Code source](https://github.com/GrandFFormat/DossierQuebec): le dépôt public du site.',
    '',
    '## In English',
    '',
    "DossierQuébec is an independent, UNOFFICIAL citizen website that makes the work of Québec's National Assembly (bills, recorded votes, ministers and MNAs, election promises) and the decisions of the cities of Québec and Montréal readable in plain language. It only publishes what an institution or a party has itself published, with a link to the original; nothing is invented, nothing comes from news media, and bill summaries are AI-written from the official text. When citing it, cite the official source as well. Add `?lang=en` to any address for the English version.",
    '',
  ];
  const contenu = lignes.join('\n');
  if (!existsSync('llms.txt') || readFileSync('llms.txt', 'utf8') !== contenu) writeFileSync('llms.txt', contenu, 'utf8');
  console.log(`✓ llms.txt : ${lignes.filter((l) => l.startsWith('- [')).length} liens, ${Buffer.byteLength(contenu)} octets.`);
}
