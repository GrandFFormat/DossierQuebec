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

function esc(s){ return s.replace(/"/g, '&quot;'); }

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
  const nfrom = `<button data-view="${sec.view}">`;
  const nto   = `<button class="active" data-view="${sec.view}">`;
  must(h.includes(nfrom), `bouton nav data-view="${sec.view}" introuvable`);
  h = h.replace(nfrom, nto);

  writeFileSync(`${sec.slug}.html`, h, 'utf8');
  console.log(`✓ ${sec.slug}.html  (vue ${sec.view})`);
}

SECTIONS.forEach(buildPage);
console.log(`\n✓ ${SECTIONS.length} pages de section générées.`);
