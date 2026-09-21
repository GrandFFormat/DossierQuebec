// Fabrique les SEPT pages du site de l'Assemblée à partir d'un seul modèle, gabarit.html.
//
// AVANT (jusqu'au 21 septembre 2026) : les six pages de la racine étaient six copies complètes
// du même document. Ouvrir /votes servait exactement le même fichier que /, à la vue active
// près — 565 ko chacune, dont 500 ko de données que la page n'utilisait pas. Les volets
// municipaux (montreal/, quebec/…) faisaient déjà bien : une page par sujet, 4 à 12 ko de HTML,
// et les données en JSON à côté.
//
// MAINTENANT : chaque page ne porte QUE sa propre <section class="view">, et déclare dans
// <body data-donnees="…"> les jeux de données qu'elle veut. commun/dq.js va les chercher au
// démarrage. Une page ne télécharge plus ce qu'elle n'affiche pas.
//
// gabarit.html n'est JAMAIS servi : c'est le modèle. Les scrapers continuent d'y injecter
// entre leurs marqueurs, exactement comme avant — la chaîne quotidienne ne change pas de forme.
//
// Usage : node scripts/build-section-pages.js   (appelé par scripts/refresh.js)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://dossierquebec.ca';
const SRC = 'gabarit.html';
const CSS_PATH = 'commun/dq.css';
const JS_PATH = 'commun/dq.js';
const DATA_DIR = 'data/site';

function must(cond, msg){ if(!cond){ console.error('✖ build-section-pages : ' + msg); process.exit(1); } }

const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- les données
//
// Chaque bloc de données du modèle devient un fichier JSON servi à part. Le nom de la
// constante devient le nom du fichier : commun/dq.js sait ainsi quoi remplir.
const JEUX = [
  { marqueur: 'MINISTERS_DATA', consts: ['ministers'] },
  { marqueur: 'BILLS_DATA', consts: ['bills'] },
  { marqueur: 'VOTES_DATA', consts: ['votes', 'presences'] },
  { marqueur: 'DEPUTES_DATA', consts: ['deputesRaw'] },
  { marqueur: 'DEPUTE_EMAILS', consts: ['deputeEmails'] },
  { marqueur: 'NEWS_DATA', consts: ['newsItems'] },
  { marqueur: 'PETITIONS_DATA', consts: ['petitions'] },
  { marqueur: 'PROMISES_DATA', consts: ['promises'] },
];

// Extrait la valeur d'un `const X = …;` de premier niveau, en s'arrêtant au point-virgule qui
// ferme vraiment la déclaration. On compte les crochets et accolades PLUTÔT que de chercher
// « ];\n » : un texte de résumé ou un sujet de vote peut contenir n'importe quoi.
function valeurDe(texte, nom) {
  const debut = new RegExp(`^const ${nom} = `, 'm').exec(texte);
  must(debut, `const ${nom} introuvable`);
  let i = debut.index + debut[0].length;
  const depart = i;
  let profondeur = 0, dansChaine = null, echappe = false;
  for (; i < texte.length; i++) {
    const c = texte[i];
    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === dansChaine) dansChaine = null;
      continue;
    }
    if (c === '"' || c === "'") { dansChaine = c; continue; }
    if (c === '[' || c === '{') profondeur++;
    else if (c === ']' || c === '}') profondeur--;
    else if (c === ';' && profondeur === 0) break;
  }
  must(i < texte.length, `fin de la déclaration ${nom} introuvable`);
  return texte.slice(depart, i);
}

function extraireDonnees() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tailles = {};
  const valeurs = {};
  for (const jeu of JEUX) {
    const a = src.indexOf(`/* ${jeu.marqueur}_START`);
    const b = src.indexOf(`/* ${jeu.marqueur}_END`);
    must(a !== -1 && b !== -1 && b > a, `marqueurs ${jeu.marqueur} introuvables dans ${SRC}`);
    const bloc = src.slice(a, b);
    for (const nom of jeu.consts) {
      const brut = valeurDe(bloc, nom);
      // Ces blocs sont du littéral JavaScript, pas du JSON : `ministers` par exemple a des clés
      // sans guillemets et des apostrophes. On les évalue donc. C'est du code que NOS propres
      // scripts viennent d'écrire dans NOTRE dépôt, pas une entrée extérieure.
      let valeur;
      try { valeur = new Function(`return (${brut})`)(); }
      catch (e) { must(false, `${nom} ne s'évalue pas (${e.message.slice(0, 70)})`); }
      must(valeur && typeof valeur === 'object', `${nom} n'est ni un tableau ni un objet`);
      const contenu = JSON.stringify(valeur);
      const chemin = `${DATA_DIR}/${nom}.json`;
      // Ne réécrire que ce qui change : le diff quotidien reste lisible.
      if (!existsSync(chemin) || readFileSync(chemin, 'utf8') !== contenu) writeFileSync(chemin, contenu);
      tailles[nom] = Buffer.byteLength(contenu);
      valeurs[nom] = valeur;
    }
  }

  // Trois jeux DÉRIVÉS, pour que l'accueil et la page des votes n'aient pas à charger des
  // tableaux entiers dont elles n'utilisent qu'une poignée de champs.
  //
  //   stats        les trois compteurs de l'accueil. Ils étaient posés par renderMinistres,
  //                renderBills et renderVotes — donc par des vues qui ne sont plus sur la page.
  //   apercuBills  les 4 projets récents affichés sur l'accueil. `bills` est déjà trié par
  //                dernière activité décroissante, comme le faisait bills.slice(0, 4).
  //   billsTitres  ce que la carte d'un vote prend dans un projet de loi : le titre dans les
  //                deux langues et le parrain. 143 projets complets pour ça, c'était 113 ko.
  const derives = {
    stats: {
      ministres: valeurs.ministers.length,
      projets: valeurs.bills.length,
      votes: valeurs.votes.length,
    },
    apercuBills: valeurs.bills.slice(0, 4),
    billsTitres: valeurs.bills.map((b) => ({ id: b.id, title: b.title, titleEn: b.titleEn, sponsor: b.sponsor })),
  };
  for (const [nom, valeur] of Object.entries(derives)) {
    const contenu = JSON.stringify(valeur);
    const chemin = `${DATA_DIR}/${nom}.json`;
    if (!existsSync(chemin) || readFileSync(chemin, 'utf8') !== contenu) writeFileSync(chemin, contenu);
    tailles[nom] = Buffer.byteLength(contenu);
  }
  return tailles;
}

// ---------------------------------------------------------------- les pages
//
// `donnees` : ce que la page va chercher au démarrage. Volontairement explicite plutôt que
// deviné — une vue qui se met à lire un jeu qu'elle ne déclare pas doit se voir tout de suite,
// pas produire une page à moitié vide en production.
const PAGES = [
  {
    fichier: 'index.html', vue: 'apercu', onglet: 'apercu', url: '/',
    donnees: ['newsItems', 'petitions', 'apercuBills', 'deputesRaw', 'stats'],
    title: "DossierQuébec — ministres, projets de loi et votes de l'Assemblée nationale",
    desc: "Veille citoyenne indépendante de l'Assemblée nationale du Québec : ministres et député·e·s, projets de loi et leur statut réel, votes nominatifs — vraies données publiques.",
  },
  {
    fichier: 'ministres.html', vue: 'ministres', onglet: 'ministres', url: '/ministres',
    donnees: ['ministers', 'deputesRaw', 'deputeEmails', 'presences'],
    title: 'Ministres du Québec — Conseil des ministres · DossierQuébec',
    desc: "Qui sont les ministres du gouvernement du Québec, leurs responsabilités et leurs coordonnées. Données publiques, site citoyen indépendant.",
  },
  {
    fichier: 'projets-de-loi.html', vue: 'projets', onglet: 'projets', url: '/projets-de-loi',
    donnees: ['bills', 'deputesRaw'],
    title: 'Projets de loi du Québec, expliqués en clair · DossierQuébec',
    desc: "Chaque projet de loi de l'Assemblée nationale du Québec résumé en langage courant, avec son étape réelle dans le processus. Données publiques.",
  },
  {
    fichier: 'votes.html', vue: 'votes', onglet: 'votes', url: '/votes',
    donnees: ['votes', 'deputesRaw', 'billsTitres'],
    title: "Votes nominatifs à l'Assemblée nationale du Québec · DossierQuébec",
    desc: "Les votes nominatifs des député·e·s à l'Assemblée nationale du Québec : qui a voté pour, contre ou s'est abstenu. Vraies données publiques.",
  },
  {
    fichier: 'promesses.html', vue: 'promesses', onglet: null, url: '/promesses',
    donnees: ['promises', 'deputesRaw'],
    title: 'Promesses électorales 2026 — ce que les partis promettent · DossierQuébec',
    desc: "Les engagements des partis pour l'élection québécoise du 5 octobre 2026, chacun avec sa source. Aucun verdict : la promesse et l'action, côte à côte.",
  },
  {
    fichier: 'lexique.html', vue: 'lexique', onglet: 'lexique', url: '/lexique',
    donnees: [],
    title: 'Lexique et compte citoyen · DossierQuébec',
    desc: "Le vocabulaire de l'Assemblée nationale expliqué simplement, et votre compte citoyen DossierQuébec. Site indépendant, données publiques.",
  },
  {
    fichier: 'sources.html', vue: 'bd', onglet: null, url: '/sources',
    donnees: [],
    title: "D'où viennent ces données · DossierQuébec",
    desc: "Chaque chiffre du site, sa source officielle et sa date de collecte. Rien n'est estimé, rien n'est inventé.",
  },
];

const esc = (s) => s.replace(/"/g, '&quot;');

// Découpe le modèle : le tronc commun d'un côté, chaque vue de l'autre.
function decouper() {
  const vues = {};
  const re = /<section class="view[^"]*" id="view-([a-z-]+)">/g;
  const bornes = [];
  let m;
  while ((m = re.exec(src))) {
    const fin = src.indexOf('</section>', m.index);
    must(fin !== -1, `</section> introuvable pour view-${m[1]}`);
    bornes.push({ nom: m[1], a: m.index, b: fin + '</section>'.length });
  }
  must(bornes.length === 7, `attendu 7 vues, trouvé ${bornes.length}`);
  // Aucune imbrication : on vérifie qu'il y a exactement autant de <section> que de </section>
  // dans chaque vue, sinon la découpe emporterait du HTML voisin.
  for (const v of bornes) {
    const bloc = src.slice(v.a, v.b);
    must((bloc.match(/<section\b/g) || []).length === 1 && (bloc.match(/<\/section>/g) || []).length === 1,
      `la vue ${v.nom} contient des <section> imbriquées : la découpe n'est plus sûre`);
    vues[v.nom] = bloc;
  }
  // Le tronc = le modèle privé de toutes les vues (on garde un repère pour les réinsérer).
  let tronc = '';
  let curseur = 0;
  for (const v of bornes) { tronc += src.slice(curseur, v.a); curseur = v.b; }
  const REPERE = '<!--VUE-->';
  tronc = tronc.slice(0, bornes[0].a) + REPERE + tronc.slice(bornes[0].a);
  tronc += src.slice(curseur);
  must(tronc.includes(REPERE), 'repère de vue perdu');
  return { tronc, vues, REPERE };
}

// Le bloc <script> des données quitte les pages : elles les chargent maintenant.
function retirerDonneesEnLigne(html) {
  const a = html.indexOf('/* MINISTERS_DATA_START');
  must(a !== -1, 'bloc de données introuvable dans le tronc');
  const debutScript = html.lastIndexOf('<script>', a);
  const finScript = html.indexOf('</script>', a);
  must(debutScript !== -1 && finScript !== -1, 'balises <script> du bloc de données introuvables');
  return html.slice(0, debutScript) + html.slice(finScript + '</script>'.length).replace(/^\n/, '');
}

function fabriquer(page, tronc, vues, REPERE) {
  must(vues[page.vue], `vue ${page.vue} introuvable`);
  let h = tronc.replace(REPERE, vues[page.vue]);
  const url = page.url === '/' ? BASE + '/' : BASE + page.url;

  h = h.replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(page.desc)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`);
  h = h.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(page.title)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(page.desc)}$2`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(page.title)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(page.desc)}$2`);

  // La vue de la page est TOUJOURS celle qui s'affiche : plus de bascule côté client.
  h = h.replace(/<section class="view[^"]*" id="view-[a-z-]+">/, `<section class="view active" id="view-${page.vue}">`);

  // UN <h1>, celui de la page. Dans le modèle, une seule vue porte le <h1> et les autres un
  // <h2> — sinon le document en aurait sept. Maintenant que chaque vue a SA page, c'est la
  // sienne qui doit porter le titre de une. Le style tient à la classe .hero-h1, pas à la
  // balise : le rendu ne bouge pas d'un pixel.
  const heros = /<(h1|h2)(\s+class="hero-h1[^"]*")>/.exec(h);
  if (heros) {
    const fin = h.indexOf(`</${heros[1]}>`, heros.index);
    must(fin !== -1, `</${heros[1]}> du titre de une introuvable sur ${page.fichier}`);
    h = h.slice(0, heros.index) + `<h1${heros[2]}>` + h.slice(heros.index + heros[0].length, fin)
      + '</h1>' + h.slice(fin + `</${heros[1]}>`.length);
  } else {
    // La vue « d'où viennent ces données » n'a pas de titre de une : elle n'était pas une page.
    // Son premier <h2> le devient, sinon /sources partirait sans <h1>.
    const premier = /<h2([^>]*)>/.exec(h.slice(h.indexOf('<section class="view active"')));
    must(premier, `aucun titre dans la vue ${page.vue} : la page n'aurait pas de <h1>`);
    const abs = h.indexOf('<section class="view active"') + premier.index;
    const fin = h.indexOf('</h2>', abs);
    h = h.slice(0, abs) + `<h1${premier[1]}>` + h.slice(abs + premier[0].length, fin) + '</h1>' + h.slice(fin + 5);
  }

  // L'onglet courant. Certaines pages n'en ont pas (promesses, sources) : personne n'est actif.
  h = h.replace('<button class="active" data-view="apercu">', '<button data-view="apercu">');
  if (page.onglet) {
    const de = `<button data-view="${page.onglet}">`;
    must(h.includes(de), `bouton de nav data-view="${page.onglet}" introuvable`);
    h = h.replace(de, `<button class="active" data-view="${page.onglet}">`);
  }

  // Ce que la page doit charger, et qui elle est.
  h = h.replace('<body>', `<body data-page="${page.vue}" data-donnees="${page.donnees.join(',')}">`);
  must(h.includes(`data-page="${page.vue}"`), '<body> introuvable dans le modèle');

  return h;
}

// ---------------------------------------------------------------- contrôles de santé
//
// Une feuille de style ou un script cassé ne lève AUCUNE erreur au build : le navigateur
// avale silencieusement ce qui suit, et le site part en production à moitié mort. Ces
// contrôles ont déjà attrapé deux pannes de ce genre.
(function verifierCss(){
  must(src.includes(`<link rel="stylesheet" href="/${CSS_PATH}">`), `${SRC} ne pointe plus vers /${CSS_PATH}`);
  must(!/<style[\s>]/.test(src), `un bloc <style> est revenu dans ${SRC} : la feuille doit vivre dans ${CSS_PATH}`);
  must(existsSync(CSS_PATH), `${CSS_PATH} introuvable`);
  const css = readFileSync(CSS_PATH, 'utf8');
  const ouvrants = (css.match(/\/\*/g) || []).length;
  const fermants = (css.match(/\*\//g) || []).length;
  must(ouvrants === fermants, `commentaires CSS déséquilibrés : ${ouvrants} « /* » pour ${fermants} « */ »`);
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const o = (sansCommentaires.match(/\{/g) || []).length;
  const c = (sansCommentaires.match(/\}/g) || []).length;
  must(o === c, `accolades CSS déséquilibrées : ${o} « { » pour ${c} « } »`);
  const definies = new Set([...sansCommentaires.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  const sansRepli = [...sansCommentaires.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)].map((m) => m[1]);
  const orphelines = [...new Set(sansRepli.filter((v) => !definies.has(v)))];
  must(orphelines.length === 0, `variable(s) CSS utilisée(s) sans être définie(s) ni valeur de repli : ${orphelines.join(', ')}`);
  console.log(`✓ CSS sain (${o} règles, ${ouvrants} commentaires équilibrés, aucune variable orpheline)`);
})();

(function verifierJs(){
  const blocs = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  let n = 0;
  for (const b of blocs) {
    const attrs = b[1] || '';
    if (/\bsrc=/.test(attrs) || /type=["'](application\/(ld\+)?json)["']/.test(attrs)) continue;
    n++;
    try { new Function(b[2]); }
    catch (e) { must(false, `erreur de syntaxe JavaScript dans le bloc <script> n° ${n} : ${e.message}`); }
  }
  must(src.includes(`<script src="/${JS_PATH}"></script>`), `${SRC} n'appelle plus ${JS_PATH}`);
  must(existsSync(JS_PATH), `${JS_PATH} introuvable`);
  try { new Function(readFileSync(JS_PATH, 'utf8')); }
  catch (e) { must(false, `erreur de syntaxe JavaScript dans ${JS_PATH} : ${e.message}`); }
  console.log(`✓ JavaScript sain (${n + 1} bloc(s) compilé(s), dont ${JS_PATH})`);
})();

// ---------------------------------------------------------------- exécution
const tailles = extraireDonnees();
const { tronc, vues, REPERE } = decouper();
const troncSansDonnees = retirerDonneesEnLigne(tronc);

const ko = (o) => (o / 1024).toFixed(0).padStart(4) + ' ko';
console.log('\n✓ données extraites vers ' + DATA_DIR + '/ :');
for (const [nom, o] of Object.entries(tailles).sort((a, b) => b[1] - a[1])) console.log(`    ${nom.padEnd(14)} ${ko(o)}`);

console.log('\n✓ pages :');
for (const page of PAGES) {
  const html = fabriquer(page, troncSansDonnees, vues, REPERE);
  writeFileSync(page.fichier, html, 'utf8');
  console.log(`    ${page.url.padEnd(16)} ${ko(Buffer.byteLength(html))}  ${page.fichier}  [${page.donnees.join(' ') || 'aucune donnée'}]`);
}
console.log(`\n✓ ${PAGES.length} pages fabriquées depuis ${SRC}.`);
