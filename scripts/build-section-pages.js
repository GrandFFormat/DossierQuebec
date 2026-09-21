// Génère des pages HTML PRÉ-RENDUES, une par section (SEO — option A).
//
// À partir du index.html final (données déjà injectées par les scrapers), on
// produit ministres.html, projets-de-loi.html, votes.html, lexique.html. Chaque
// page est le site complet, mais avec :
//   - la bonne vue déjà « active » dans le HTML brut (donc son contenu est
//     visible par Google SANS exécuter le JavaScript) ;
//   - son propre <title>, sa meta description, son canonical et ses balises
//     Open Graph / Twitter pointant vers SA propre URL.
//
// Ce sont des ARTEFACTS DE BUILD : régénérés à chaque rafraîchissement, jamais
// édités à la main. Les scrapers ne touchent donc qu'à index.html ; ces pages
// héritent automatiquement des données fraîches. Servies en URL propres
// (/votes, /projets-de-loi…) grâce à "cleanUrls" dans vercel.json.
//
// Le routage côté client (dans index.html) ouvre le bon onglet quand on arrive
// sur une de ces URL et remet l'onglet Aperçu à la racine.
//
// Usage : node scripts/build-section-pages.js   (appelé par scripts/refresh.js)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://dossierquebec.ca';
const SRC = 'index.html';
const CSS_PATH = 'commun/dq.css';
const JS_PATH = 'commun/dq.js';

// slug = nom de fichier (donc l'URL via cleanUrls) ; view = id de section (#view-…)
const SECTIONS = [
  {
    slug: 'ministres', view: 'ministres',
    title: 'Ministres du Québec — Conseil des ministres · DossierQuébec',
    desc: "Qui sont les ministres du gouvernement du Québec, leurs responsabilités et leurs coordonnées. Données publiques, site citoyen indépendant.",
  },
  {
    slug: 'projets-de-loi', view: 'projets',
    title: 'Projets de loi du Québec, expliqués en clair · DossierQuébec',
    desc: "Chaque projet de loi de l'Assemblée nationale du Québec résumé en langage courant, avec son étape réelle dans le processus. Données publiques.",
  },
  {
    slug: 'votes', view: 'votes',
    title: "Votes nominatifs à l'Assemblée nationale du Québec · DossierQuébec",
    desc: "Les votes nominatifs des député·e·s à l'Assemblée nationale du Québec : qui a voté pour, contre ou s'est abstenu. Vraies données publiques.",
  },
  {
    slug: 'promesses', view: 'promesses', noTab: true,
    title: 'Promesses électorales 2026 — ce que les partis promettent · DossierQuébec',
    desc: "Les engagements des partis pour l'élection québécoise du 5 octobre 2026, chacun avec sa source. Aucun verdict : la promesse et l'action, côte à côte.",
  },
  {
    slug: 'lexique', view: 'lexique',
    title: 'Lexique et compte citoyen · DossierQuébec',
    desc: "Le vocabulaire de l'Assemblée nationale expliqué simplement, et votre compte citoyen DossierQuébec. Site indépendant, données publiques.",
  },
];

// On lit et réécrit en LF (le dépôt stocke en LF).
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// Garde-fous : si le HTML source a changé de forme, on préfère échouer bruyamment
// plutôt que d'écrire des pages cassées.
function must(cond, msg){ if(!cond){ console.error('✖ build-section-pages : ' + msg); process.exit(1); } }
must(src.includes('<section class="view active" id="view-apercu">'), "vue Aperçu active introuvable (format changé ?)");
must(src.includes('<button class="active" data-view="apercu">'), "bouton nav Aperçu actif introuvable (format changé ?)");

// Santé de la feuille de style. Un commentaire mal fermé ou une accolade en trop
// ne fait PAS planter le navigateur : il avale silencieusement tout ce qui suit,
// et une partie du site perd son style sans qu'aucune erreur n'apparaisse. C'est
// arrivé deux fois — d'où ce contrôle, ici, où il bloque aussi le build quotidien.
//
// La feuille vivait en ligne dans index.html ; elle est sortie dans commun/dq.css pour que le
// navigateur la garde d'une page à l'autre. Le contrôle l'a suivie : on vérifie AUSSI que la
// page pointe encore dessus, sinon une page sans style partirait en production sans rien casser
// de visible au build.
(function verifierCss(){
  must(src.includes(`<link rel="stylesheet" href="/${CSS_PATH.replace(/\\/g, '/')}">`),
    `index.html ne pointe plus vers /${CSS_PATH}`);
  must(!/<style[\s>]/.test(src), 'un bloc <style> est revenu dans index.html : la feuille doit vivre dans ' + CSS_PATH);
  must(existsSync(CSS_PATH), `${CSS_PATH} introuvable`);
  const css = readFileSync(CSS_PATH, 'utf8');
  const ouvrants = (css.match(/\/\*/g) || []).length;
  const fermants = (css.match(/\*\//g) || []).length;
  must(ouvrants === fermants, `commentaires CSS déséquilibrés : ${ouvrants} « /* » pour ${fermants} « */ »`);
  // Hors commentaires, les accolades doivent s'équilibrer.
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const o = (sansCommentaires.match(/\{/g) || []).length;
  const c = (sansCommentaires.match(/\}/g) || []).length;
  must(o === c, `accolades CSS déséquilibrées : ${o} « { » pour ${c} « } »`);
  // Variables CSS utilisées mais jamais définies. Une var() vers une variable
  // inexistante ne lève aucune erreur : la propriété tombe simplement sur sa
  // valeur héritée ou initiale. C'est arrivé avec --bg et --muted, recopiées
  // depuis la feuille du volet municipal — le fond de survol du menu « Villes »
  // ne s'affichait tout bonnement pas.
  // On ne signale QUE les var() SANS valeur de repli : une variable posée par le
  // JavaScript à l'exécution (ex. var(--vw, 100vw)) est volontaire.
  const definies = new Set([...sansCommentaires.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
  const sansRepli = [...sansCommentaires.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)].map(m => m[1]);
  const orphelines = [...new Set(sansRepli.filter(v => !definies.has(v)))];
  must(orphelines.length === 0, `variable(s) CSS utilisée(s) sans être définie(s) ni avoir de valeur de repli : ${orphelines.join(', ')}`);
  console.log(`✓ CSS sain (${o} règles, ${ouvrants} commentaires équilibrés, aucune variable orpheline)`);
})();

// Santé du JavaScript. Une seule erreur de syntaxe tue TOUT le script : plus de rendu des
// projets de loi, plus de filtres, plus de bascule de langue — une page qui s'affiche mais ne
// fait plus rien. Ça s'est produit sur une simple apostrophe mal échappée dans une chaîne. On
// compile donc chaque bloc avant de publier. `new Function` vérifie la syntaxe sans exécuter.
//
// La logique est sortie dans commun/dq.js ; elle est compilée ici comme le reste. Deux contrôles
// de plus, parce qu'un découpage mal refait ne casserait RIEN au build tout en publiant un site
// mort : la page doit encore appeler le fichier, et l'appel doit venir APRÈS les données (un
// script classique lit la portée globale dans l'ordre d'exécution, pas dans le désordre).
(function verifierJs(){
  const blocs = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  let n = 0;
  for (const b of blocs) {
    const attrs = b[1] || '';
    // On saute les scripts externes et les blocs de données (JSON-LD).
    if (/\bsrc=/.test(attrs) || /type=["'](application\/(ld\+)?json)["']/.test(attrs)) continue;
    n++;
    try { new Function(b[2]); }
    catch (e) { must(false, `erreur de syntaxe JavaScript dans le bloc <script> n° ${n} : ${e.message}`); }
  }

  const appel = `<script src="/${JS_PATH}"></script>`;
  must(src.includes(appel), `index.html n'appelle plus ${JS_PATH}`);
  must(!/<script src="\/commun\/dq\.js"[^>]*\stype=["']module["']/.test(src),
    `${JS_PATH} ne doit PAS être un module : il ne verrait plus les données restées en ligne`);
  must(src.indexOf('/* VOTES_DATA_START') < src.indexOf(appel),
    `${JS_PATH} est appelé AVANT les données : la logique ne les verrait pas`);
  must(existsSync(JS_PATH), `${JS_PATH} introuvable`);
  try { new Function(readFileSync(JS_PATH, 'utf8')); }
  catch (e) { must(false, `erreur de syntaxe JavaScript dans ${JS_PATH} : ${e.message}`); }
  n++;
  console.log(`✓ JavaScript sain (${n} bloc(s) compilé(s), dont ${JS_PATH})`);
})();

function esc(s){ return s.replace(/"/g, '&quot;'); }

// UN SEUL <h1> par page : celui de la vue affichée.
//
// Le problème réglé ici : toutes les vues vivent dans le même document, chacune
// avec son titre de une. Chaque page servait donc SIX <h1>, dont cinq décrivant
// une section qui n'est pas son sujet — sur /votes, Google lisait « Projets de
// loi, traduits en clair » et « Le jargon, décodé » au même rang que le titre
// de la page. Le titre de une de la vue cible reste <h1>, les autres passent
// en <h2>. Le style tient à la classe .hero-h1 (margin:0 comprise), pas à la
// balise : le rendu est identique au pixel près.
//
// Idempotent : la fonction accepte h1 comme h2 en entrée, donc la relancer ne
// dégrade rien. C'est ce qui permet de l'appliquer aussi à index.html lui-même.
function unSeulH1(html, vueCible){
  return html.split(/(?=<section class="view)/).map((bloc) => {
    const m = bloc.match(/^<section class="view[^"]*" id="view-([a-z-]+)"/);
    if (!m) return bloc;                                  // tout ce qui précède la 1re vue
    const balise = m[1] === vueCible ? 'h1' : 'h2';
    const ouv = bloc.match(/<(h1|h2)(\s+class="hero-h1[^"]*")>/);
    if (!ouv) return bloc;                                // vue sans titre de une (bd, compte)
    const debut = bloc.indexOf(ouv[0]);
    const ferm = `</${ouv[1]}>`;
    const fin = bloc.indexOf(ferm, debut);
    if (fin === -1) return bloc;
    return bloc.slice(0, debut)
      + `<${balise}${ouv[2]}>`
      + bloc.slice(debut + ouv[0].length, fin)
      + `</${balise}>`
      + bloc.slice(fin + ferm.length);
  }).join('');
}

function buildPage(sec){
  const url = `${BASE}/${sec.slug}`;
  let h = src;

  // 1) <title>
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${sec.title}</title>`);

  // 2) meta description
  h = h.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(sec.desc)}$2`);

  // 3) canonical
  h = h.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`);

  // 4) Open Graph
  h = h.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(sec.title)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(sec.desc)}$2`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`);

  // 5) Twitter
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(sec.title)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(sec.desc)}$2`);

  // 6) Vue active : on retire « active » d'Aperçu, on l'ajoute à la section cible.
  h = h.replace('<section class="view active" id="view-apercu">', '<section class="view" id="view-apercu">');
  const from = `<section class="view" id="view-${sec.view}">`;
  const to   = `<section class="view active" id="view-${sec.view}">`;
  must(h.includes(from), `section #view-${sec.view} introuvable`);
  h = h.replace(from, to);

  // 7) Onglet actif dans le menu : idem côté nav.
  h = h.replace('<button class="active" data-view="apercu">', '<button data-view="apercu">');
  // Certaines vues n'ont PAS d'onglet (ex. /promesses, comme view-bd) : on ne
  // marque alors aucun bouton actif, et c'est normal.
  if (!sec.noTab) {
    const nfrom = `<button data-view="${sec.view}">`;
    const nto   = `<button class="active" data-view="${sec.view}">`;
    must(h.includes(nfrom), `bouton nav data-view="${sec.view}" introuvable`);
    h = h.replace(nfrom, nto);
  }

  // 8) Un seul <h1>, celui de la vue affichée.
  h = unSeulH1(h, sec.view);

  writeFileSync(`${sec.slug}.html`, h, 'utf8');
  console.log(`✓ ${sec.slug}.html  (vue ${sec.view})`);
}

// index.html est servi à la racine : c'est la page « Aperçu », et elle a droit
// au même traitement. On la réécrit donc en place. Sans danger : unSeulH1 est
// idempotent, donc une exécution répétée laisse le fichier tel quel — et ça
// évite d'avoir deux implémentations de la même règle qui se désynchronisent.
const racine = unSeulH1(src, 'apercu');
if (racine !== src) {
  writeFileSync(SRC, racine, 'utf8');
  console.log(`✓ ${SRC}  (vue apercu — titres normalisés)`);
}

SECTIONS.forEach(buildPage);
console.log(`\n✓ ${SECTIONS.length} pages de section générées.`);
