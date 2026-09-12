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

import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://dossierquebec.ca';
const SRC = 'index.html';

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
(function verifierCss(){
  const d = src.indexOf('<style'), f = src.indexOf('</style>');
  must(d !== -1 && f !== -1, 'bloc <style> introuvable');
  const css = src.slice(src.indexOf('>', d) + 1, f);
  const ouvrants = (css.match(/\/\*/g) || []).length;
  const fermants = (css.match(/\*\//g) || []).length;
  must(ouvrants === fermants, `commentaires CSS déséquilibrés : ${ouvrants} « /* » pour ${fermants} « */ »`);
  // Hors commentaires, les accolades doivent s'équilibrer.
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const o = (sansCommentaires.match(/\{/g) || []).length;
  const c = (sansCommentaires.match(/\}/g) || []).length;
  must(o === c, `accolades CSS déséquilibrées : ${o} « { » pour ${c} « } »`);
  console.log(`✓ CSS sain (${o} règles, ${ouvrants} commentaires équilibrés)`);
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
