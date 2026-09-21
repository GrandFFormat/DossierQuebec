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
  const reecrits = new Set();   // jeux dont le fichier a vraiment changé (voir `changees`)
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
      if (!existsSync(chemin) || readFileSync(chemin, 'utf8') !== contenu) { writeFileSync(chemin, contenu); reecrits.add(nom); }
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
    if (!existsSync(chemin) || readFileSync(chemin, 'utf8') !== contenu) { writeFileSync(chemin, contenu); reecrits.add(nom); }
    tailles[nom] = Buffer.byteLength(contenu);
  }
  return { tailles, valeurs, reecrits };
}

// ---------------------------------------------------------------- les pages
//
// `donnees` : ce que la page va chercher au démarrage. Volontairement explicite plutôt que
// deviné — une vue qui se met à lire un jeu qu'elle ne déclare pas doit se voir tout de suite,
// pas produire une page à moitié vide en production.
//
// `stats` (42 octets) est ajouté à TOUTES les pages plus bas : la bande défilante du haut
// affiche les trois compteurs partout. Elle les comptait dans les jeux complets, que la plupart
// des pages ne chargent plus — elle affichait « 0 vote nominatif » depuis le découpage.
//
// RÉFÉRENCEMENT (21 sept. 2026). `title` suit la formule « Sujet — DossierQuébec », 65 caractères
// au plus ; `desc` fait entre 120 et 165 caractères. Le <h1> de chaque page s'ouvre sur le même
// sujet (span .hero-sujet dans gabarit.html). `fil` est le nom de la page dans le fil d'Ariane
// (visible et JSON-LD) ; `cle` sa traduction. `frequence` et `priorite` vont au sitemap. Les
// contrôles plus bas refusent un titre ou une description en double, hors longueur, ou une page
// sans son <h1> unique : une page qui dérive se voit au build, pas dans la Search Console.
const PAGES = [
  {
    fichier: 'index.html', vue: 'apercu', onglet: 'apercu', url: '/',
    donnees: ['newsItems', 'petitions', 'apercuBills', 'deputesRaw', 'stats'],
    title: "L'Assemblée nationale du Québec en clair — DossierQuébec",
    desc: "Suivez l'Assemblée nationale du Québec en langage clair : projets de loi résumés, votes nominatifs de chaque député·e, ministres et promesses électorales 2026.",
    frequence: 'daily', priorite: '1.0',
  },
  {
    fichier: 'ministres.html', vue: 'ministres', onglet: 'ministres', url: '/ministres',
    donnees: ['ministers', 'deputesRaw', 'deputeEmails', 'presences'],
    title: 'Ministres et député·e·s du Québec — DossierQuébec',
    desc: "Les ministres du gouvernement du Québec et les député·e·s de l'Assemblée nationale : rôles, circonscriptions, présence aux votes et coordonnées officielles.",
    fil: 'Ministres et député·e·s', cle: 'fil.ministres', frequence: 'weekly', priorite: '0.8',
  },
  {
    fichier: 'projets-de-loi.html', vue: 'projets', onglet: 'projets', url: '/projets-de-loi',
    donnees: ['bills', 'deputesRaw'],
    title: 'Projets de loi du Québec expliqués en clair — DossierQuébec',
    desc: "Les projets de loi de l'Assemblée nationale du Québec résumés en langage courant, avec leur étape réelle dans le processus et le lien vers le texte officiel.",
    fil: 'Projets de loi', cle: 'fil.projets', frequence: 'daily', priorite: '0.9',
  },
  {
    fichier: 'votes.html', vue: 'votes', onglet: 'votes', url: '/votes',
    donnees: ['votes', 'deputesRaw', 'billsTitres'],
    title: "Votes nominatifs à l'Assemblée nationale — DossierQuébec",
    desc: "Le registre des votes nominatifs de l'Assemblée nationale du Québec : qui a voté pour, contre ou s'est abstenu, député·e par député·e, sans interprétation.",
    fil: 'Votes', cle: 'fil.votes', frequence: 'daily', priorite: '0.9',
  },
  {
    fichier: 'promesses.html', vue: 'promesses', onglet: null, url: '/promesses',
    donnees: ['promises', 'deputesRaw'],
    title: 'Promesses électorales 2026 au Québec — DossierQuébec',
    desc: "Les engagements des partis pour l'élection québécoise du 5 octobre 2026, chacun avec sa source officielle. Aucun verdict : la promesse et l'action, côte à côte.",
    fil: 'Promesses', cle: 'fil.promesses', frequence: 'weekly', priorite: '0.8',
  },
  {
    fichier: 'lexique.html', vue: 'lexique', onglet: 'lexique', url: '/lexique',
    donnees: [],
    title: "Lexique de l'Assemblée nationale en clair — DossierQuébec",
    desc: "Sanction royale, étude détaillée, vote par appel nominal : le vocabulaire de l'Assemblée nationale du Québec expliqué simplement, avec les sources officielles.",
    fil: 'Lexique', cle: 'fil.lexique', frequence: 'monthly', priorite: '0.6',
  },
  {
    fichier: 'sources.html', vue: 'bd', onglet: null, url: '/sources',
    donnees: ['journal'],
    title: 'Mises à jour du site — DossierQuébec',
    desc: "Ce qui change sur DossierQuébec, site citoyen indépendant qui rend lisibles l'Assemblée nationale et les conseils municipaux du Québec, et qui est derrière.",
    fil: 'Mises à jour du site', cle: 'fil.bd', frequence: 'weekly', priorite: '0.4',
  },
];
for (const page of PAGES) if (!page.donnees.includes('stats')) page.donnees.push('stats');

const esc = (s) => s.replace(/"/g, '&quot;');
// Échappement complet, pour du texte venu des données et posé dans le HTML.
const ht = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- données structurées
//
// Une seule balise JSON-LD par page. L'accueil décrit le site et son éditeur ; chaque section,
// son fil d'Ariane. Avant, les sept pages portaient toutes le même bloc WebSite, avec la
// description de l'accueil.
const ORGANISATION = {
  '@type': 'Organization',
  '@id': `${BASE}/#organisation`,
  name: 'DossierQuébec',
  url: `${BASE}/`,
  logo: { '@type': 'ImageObject', url: `${BASE}/commun/dq-512.png`, width: 512, height: 512 },
  sameAs: ['https://www.facebook.com/dossierquebec', 'https://github.com/GrandFFormat/DossierQuebec'],
};
function jsonLd(page) {
  const donnees = page.url === '/'
    ? {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite', '@id': `${BASE}/#site`, name: 'DossierQuébec', url: `${BASE}/`,
          description: page.desc, inLanguage: 'fr-CA', publisher: { '@id': `${BASE}/#organisation` },
        },
        ORGANISATION,
      ],
    }
    : {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: page.fil, item: BASE + page.url },
      ],
    };
  // « </ » ne doit jamais apparaître dans un <script> : un texte qui contiendrait « </script> »
  // fermerait la balise.
  return `<script type="application/ld+json">\n${JSON.stringify(donnees, null, 2).replace(/<\//g, '<\\/')}\n</script>`;
}

// ---------------------------------------------------------------- les listes écrites dans le HTML
//
// Les cartes des projets, des votes, des ministres… sont dessinées par commun/dq.js à partir des
// JSON. Sans JavaScript — ou pour un robot qui lit le HTML sans l'exécuter — la page était vide
// sous ses titres. Le build y écrit donc une version simple des mêmes données, que commun/dq.js
// retire dès que les vraies cartes sont affichées (voir [data-prerendu]).
//
// Même source que les cartes (les JSON de data/site/) : rien ici n'est rédigé à la main.
const ASSNAT = '<a href="https://www.assnat.qc.ca/" rel="noopener">assnat.qc.ca</a>';
const QUEBEC_CA = '<a href="https://www.quebec.ca/premiere-ministre/equipe/conseil-des-ministres" rel="noopener">quebec.ca</a>';
// Le mot sur JavaScript n'a sa place que là où il y a des filtres ou une recherche.
const SANS_JS = '<noscript> Les filtres, la recherche et le détail de chaque fiche demandent JavaScript.</noscript>';
// `jeu` : le fichier de data/site/ dont dépend la liste. commun/dq.js ne retire une liste que si
// CE fichier est arrivé : si le JSON manque, la version écrite ici reste, et c'est justement le
// cas où elle sert.
const bloc = (jeu, etiquette, items, note, filtres = false) =>
  `<div class="prerendu" data-prerendu="${jeu}">\n      <ul aria-label="${esc(etiquette)}">\n${items.map((i) => `        <li>${i}</li>`).join('\n')}\n      </ul>\n      <p class="pr-note">${note}${filtres ? SANS_JS : ''}</p>\n    </div>`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso) => { const [a, m, j] = String(iso).split('-').map(Number); return a && m && j ? `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}` : ht(iso); };
const projet = (b) => `<b>Projet de loi n° ${ht(b.num)}</b> — ${ht(b.title)}${b.note ? ` <span class="pr-meta">· ${ht(b.note)}</span>` : ''}`;
// Même normalisation que norm() dans commun/dq.js : c'est elle qui sépare les ministres du reste
// de l'Assemblée.
const normNom = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-–—']/g, ' ').replace(/\s+/g, ' ').trim();
const JOURNAL_PREMIERES = 20;   // même valeur que dans commun/dq.js : la page n'en montre pas plus

function prerendus(valeurs) {
  const bills = valeurs.bills;
  const votesRecents = [...valeurs.votes]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.id).localeCompare(String(a.id), 'fr', { numeric: true })))
    .slice(0, 30);
  const ministres = new Set(valeurs.ministers.map((m) => normNom(m.name.replace(/\s*\([^)]*\)\s*/g, ''))));
  const deputes = valeurs.deputesRaw.filter((d) => !ministres.has(normNom(d[0])));
  let journal = [];
  try { if (existsSync('data/journal.json')) journal = JSON.parse(readFileSync('data/journal.json', 'utf8')); }
  catch (e) { console.warn(`⚠ data/journal.json illisible (${e.message.slice(0, 70)}) : /sources part sans sa liste écrite`); }
  if (!Array.isArray(journal)) journal = [];
  const journalTrie = [...journal].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    apercuBills: bloc('apercuBills', 'Projets de loi récemment actifs', bills.slice(0, 4).map(projet),
      `Source officielle : ${ASSNAT}.`),
    newsList: bloc('newsItems', 'Quoi de neuf à l’Assemblée nationale',
      [...valeurs.newsItems].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
        .map((n) => `<span class="pr-meta">${ht(n.label || dateFr(n.date))} —</span> ${ht(n.text)}`),
      `Source officielle : ${ASSNAT}.`),
    ministresGrid: bloc('ministers', 'Conseil des ministres',
      valeurs.ministers.map((m) => `<b>${ht(m.name)}</b> — ${ht(m.role)} <span class="pr-meta">(${ht(m.party)})</span>`),
      `Les ${valeurs.ministers.length} membres du Conseil des ministres. Source officielle : ${QUEBEC_CA}.`, true),
    deputesList: bloc('deputesRaw', 'Le reste de l’Assemblée',
      deputes.map((d) => `${ht(d[0])} — ${ht(d[1])} <span class="pr-meta">(${ht(d[3])})</span>`),
      `Les ${deputes.length} autres député·e·s. Source officielle : ${ASSNAT}.`, true),
    billsList: bloc('bills', 'Projets de loi', bills.map(projet),
      `Les ${bills.length} projets de loi, du plus récemment actif au plus ancien. Texte intégral de chacun : ${ASSNAT}.`, true),
    // Le sujet d'un vote commence souvent déjà par « Projet de loi n° X » : on ne le répète pas.
    votesList: bloc('votes', 'Votes nominatifs récents', votesRecents.map((v) =>
      `<span class="pr-meta">${ht(dateFr(v.date))} —</span> ${v.stage ? `${ht(v.stage)} — ` : ''}${v.billNum && !/^projet de loi n[°o]\s*\d/i.test(String(v.subject || '')) ? `projet de loi n° ${ht(v.billNum)} — ` : ''}${ht(v.subject)} <span class="pr-meta">· pour ${ht(v.totals?.pour)}, contre ${ht(v.totals?.contre)}, abstentions ${ht(v.totals?.abstentions)}</span>`),
      `Les ${votesRecents.length} votes les plus récents, sur ${valeurs.votes.length}. Source officielle : le registre des votes, ${ASSNAT}.`, true),
    promisesList: bloc('promises', 'Promesses électorales 2026', valeurs.promises.filter((p) => !p.draft).map((p) =>
      `<b>${ht(p.party)}</b> <span class="pr-meta">· ${ht(p.theme)}</span> — « ${ht(p.quote)} » <span class="pr-meta">(source : ${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" rel="noopener">${ht(p.sourceLabel)}</a>` : ht(p.sourceLabel)})</span>`),
      'Chaque promesse est citée mot pour mot, avec sa source.', true),
    // Les 20 plus récentes seulement, comme la page vivante : sans plafond, le journal ferait
    // grossir /sources sans fin.
    journal: bloc('journal', 'Mises à jour du site', journalTrie.slice(0, JOURNAL_PREMIERES).map((e) =>
      `<span class="pr-meta">${ht(dateFr(e.date))} —</span> <b>${ht(e.fr?.titre)}</b> ${ht(e.fr?.texte)}`),
      journalTrie.length > JOURNAL_PREMIERES ? `Les ${JOURNAL_PREMIERES} plus récentes, sur ${journalTrie.length}.` : 'Du plus récent au plus ancien.'),
  };
}

// Les rangées de filtres de /promesses : vides dans le HTML, elles prenaient 140 px d'un coup à
// l'arrivée des données et poussaient toute la liste vers le bas (CLS mesuré à 0,1). On les écrit
// ici avec les MÊMES libellés et compteurs que renderPromFilters() (commun/dq.js), sans les
// couleurs, qui viennent du script : même hauteur dès le premier affichage, puis le script les
// remplace à l'identique, en couleur.
function filtresPromesses(promesses) {
  const n = (f) => promesses.filter(f).length;
  const btn = (texte, compte, action, classe = '') => `<button class="qf-btn${classe}" onclick="${action}">${ht(texte)} <span class="qf-n">${compte}</span></button>`;
  const partis = [...new Set(promesses.map((p) => p.party))];
  const sujets = [...new Set(promesses.map((p) => p.theme))].sort();
  const js = (x) => String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return {
    partis: [btn('Tous', promesses.length, "setPromParty('tous')", ' active'),
      ...partis.map((x) => btn(x, n((p) => p.party === x), `setPromParty('${js(x)}')`)),
      `<button class="qf-btn qf-renvoi" onclick="allerAuxComparateurs()">Médias <span class="qf-n">4</span> ↓</button>`].join(''),
    sujets: [btn('Tous', promesses.length, "setPromTheme('tous')", ' active'),
      ...sujets.map((x) => btn(x, n((p) => p.theme === x), `setPromTheme('${js(x)}')`))].join(''),
  };
}

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

function fabriquer(page, tronc, vues, REPERE, pre) {
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

  // Le fil d'Ariane (Accueil › la page), visible, sur chaque page sauf l'accueil. Son pendant
  // pour les moteurs de recherche est le BreadcrumbList de jsonLd().
  if (page.url !== '/') {
    must(page.fil && page.cle, `fil d'Ariane manquant pour ${page.fichier}`);
    const ouverture = `<section class="view active" id="view-${page.vue}">`;
    h = h.replace(ouverture, `${ouverture}
    <nav class="fil-ariane" aria-label="Fil d'Ariane"><a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><span aria-current="page" data-i18n="${page.cle}">${ht(page.fil)}</span></nav>`);
  }

  // Une seule balise JSON-LD, celle de la page.
  const ld = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  must(ld.test(h), 'balise JSON-LD introuvable dans le modèle');
  h = h.replace(ld, () => jsonLd(page));

  // Les listes écrites dans le HTML. Un repère sans liste, ou une liste sans repère, arrête tout.
  h = h.replace(/<!--PRERENDU:([A-Za-z]+)-->/g, (_, nom) => {
    must(pre[nom], `liste « ${nom} » inconnue du build`);
    return pre[nom];
  });

  // Les trois compteurs de l'accueil : le build les connaît, pourquoi afficher « — » jusqu'à ce
  // que le script arrive ? commun/dq.js y réécrit les mêmes nombres.
  for (const [id, n] of Object.entries(pre.compteurs)) {
    h = h.replace(`<b id="${id}">—</b>`, `<b id="${id}">${n}</b>`);
  }
  // Les filtres de /promesses, à leur hauteur finale dès le premier affichage (voir filtresPromesses).
  if (page.vue === 'promesses') {
    for (const [id, contenu] of [['promPartyFilters', pre.filtres.partis], ['promThemeFilters', pre.filtres.sujets]]) {
      const vide = `<div class="quick-filters" id="${id}"></div>`;
      must(h.includes(vide), `${id} introuvable dans la vue des promesses`);
      h = h.replace(vide, `<div class="quick-filters" id="${id}">${contenu}</div>`);
    }
  }

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
    // La vue des mises à jour (/sources) n'a pas de titre de une : elle n'était pas une page.
    // Son premier <h2> le devient, sinon /sources partirait sans <h1>.
    const premier = /<h2([^>]*)>/.exec(h.slice(h.indexOf('<section class="view active"')));
    must(premier, `aucun titre dans la vue ${page.vue} : la page n'aurait pas de <h1>`);
    const abs = h.indexOf('<section class="view active"') + premier.index;
    const fin = h.indexOf('</h2>', abs);
    h = h.slice(0, abs) + `<h1${premier[1]}>` + h.slice(abs + premier[0].length, fin) + '</h1>' + h.slice(fin + 5);
  }

  // L'onglet courant. Certaines pages n'en ont pas (promesses, sources) : personne n'est actif.
  if (page.onglet) {
    const de = new RegExp(`<a href="([^"]*)" data-view="${page.onglet}">`);
    must(de.test(h), `lien de nav data-view="${page.onglet}" introuvable`);
    h = h.replace(de, (_, href) => `<a class="active" aria-current="page" href="${href}" data-view="${page.onglet}">`);
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
//
// Tout est d'abord FABRIQUÉ EN MÉMOIRE, puis CONTRÔLÉ, et seulement ensuite écrit. Si un contrôle
// échoue, rien n'est écrit : sinon les pages déjà réécrites ne seraient plus vues comme
// « modifiées » au passage suivant, et leur <lastmod> n'avancerait jamais.
const { tailles, valeurs, reecrits } = extraireDonnees();
const pre = prerendus(valeurs);
// Chaque liste a exactement UN repère dans le modèle. Un repère supprimé par mégarde ferait
// disparaître la liste du HTML sans que rien ne le signale ; un repère en double, la doublerait.
for (const nom of Object.keys(pre)) {
  const n = src.split(`<!--PRERENDU:${nom}-->`).length - 1;
  must(n === 1, `liste « ${nom} » : ${n} repère(s) <!--PRERENDU:${nom}--> dans ${SRC} (attendu 1)`);
}
pre.compteurs = { statMinistres: valeurs.ministers.length, statProjets: valeurs.bills.length, statVotes: valeurs.votes.length };
pre.filtres = filtresPromesses(valeurs.promises);
const { tronc, vues, REPERE } = decouper();
const troncSansDonnees = retirerDonneesEnLigne(tronc);

const ko = (o) => (o / 1024).toFixed(0).padStart(4) + ' ko';
console.log('\n✓ données extraites vers ' + DATA_DIR + '/ :');
for (const [nom, o] of Object.entries(tailles).sort((a, b) => b[1] - a[1])) console.log(`    ${nom.padEnd(14)} ${ko(o)}`);

// Les pages dont le contenu change VRAIMENT. Elles seules prennent la date du jour dans le
// sitemap : ce qui ne change pas n'est pas réécrit (le diff quotidien reste lisible), et un
// <lastmod> qui avançait chaque matin sans raison finissait ignoré par Google.
//   `aEcrire`  : le HTML a changé — la page sera réécrite ;
//   `changees` : le HTML OU un JSON que la page affiche a changé — elle prend la date du jour.
//                (stats ne compte pas : il ne sert qu'à la bande défilante, présente partout.)
const produites = PAGES.map((page) => ({ page, html: fabriquer(page, troncSansDonnees, vues, REPERE, pre) }));
const aEcrire = new Set();
const changees = new Set();
for (const { page, html } of produites) {
  const avant = existsSync(page.fichier) ? readFileSync(page.fichier, 'utf8').replace(/\r\n/g, '\n') : null;
  if (avant !== html) { aEcrire.add(page.fichier); changees.add(page.fichier); }
  if (page.donnees.some((d) => d !== 'stats' && reecrits.has(d))) changees.add(page.fichier);
}

// ---------------------------------------------------------------- contrôles de référencement
//
// Ce qui faisait des sept pages des clones aux yeux d'un moteur de recherche — même <title>,
// même description, même <h1> — ne doit pas pouvoir revenir sans que le build s'arrête.
(function verifierReferencement(){
  const vus = { titre: new Map(), desc: new Map(), h1: new Map() };
  const doublon = (quoi, valeur, fichier) => {
    must(!vus[quoi].has(valeur), `${quoi} identique sur ${vus[quoi].get(valeur)} et ${fichier} : « ${valeur} »`);
    vus[quoi].set(valeur, fichier);
  };
  for (const { page, html } of produites) {
    const f = page.fichier;
    const titre = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    must(titre === page.title, `${f} : <title> inattendu`);
    must(titre.length <= 65 && titre.endsWith(' — DossierQuébec'), `${f} : le titre doit suivre « Sujet — DossierQuébec » en 65 caractères au plus (${titre.length})`);
    must(page.desc.length >= 120 && page.desc.length <= 165, `${f} : description de ${page.desc.length} caractères (attendu 120 à 165)`);
    const h1 = html.match(/<h1[\s>][\s\S]*?<\/h1>/g) || [];
    must(h1.length === 1, `${f} : ${h1.length} <h1> (attendu 1)`);
    const texteH1 = h1[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const canon = (html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
    must(canon === (page.url === '/' ? `${BASE}/` : BASE + page.url), `${f} : canonical ${canon}`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    must(ld.length === 1, `${f} : ${ld.length} balises JSON-LD (attendu 1)`);
    try { JSON.parse(ld[0][1]); } catch (e) { must(false, `${f} : JSON-LD invalide (${e.message})`); }
    must(!html.includes('<!--PRERENDU:'), `${f} : un repère PRERENDU n'a pas été remplacé`);
    must(!/<button[^>]*data-view=/.test(html), `${f} : un onglet du menu est encore un <button>, pas un lien`);
    must(!/<meta name="robots" content="[^"]*noindex/.test(html), `${f} : une page de l'Assemblée ne peut pas être en noindex`);
    // La description et les balises de partage sont lues DANS la page produite : si une regex de
    // fabriquer() ne trouvait plus sa balise, le remplacement ne ferait rien, en silence, et les
    // sept pages garderaient celles du modèle — des clones.
    const meta = (attr, nom) => [...html.matchAll(new RegExp(`<meta ${attr}="${nom}" content="([^"]*)">`, 'g'))].map((m) => m[1]);
    const attendus = [
      ['name', 'description', esc(page.desc)], ['property', 'og:title', esc(page.title)],
      ['property', 'og:description', esc(page.desc)], ['property', 'og:url', canon],
      ['name', 'twitter:title', esc(page.title)], ['name', 'twitter:description', esc(page.desc)],
    ];
    for (const [attr, nom, valeur] of attendus) {
      const trouves = meta(attr, nom);
      must(trouves.length === 1 && trouves[0] === valeur, `${f} : <meta ${attr}="${nom}"> vaut ${JSON.stringify(trouves)}, attendu « ${valeur} »`);
    }
    // 100 ko : un objectif, pas une panne. Le build tourne dans la chaîne quotidienne ; s'il
    // s'arrêtait là, les votes et projets de loi du jour ne seraient plus publiés.
    if (Buffer.byteLength(html) >= 100 * 1024) console.warn(`⚠ ${f} : ${ko(Buffer.byteLength(html))}, au-delà des 100 ko visés`);
    doublon('titre', titre, f); doublon('desc', page.desc, f); doublon('h1', texteH1, f);
  }
  console.log(`✓ référencement : ${PAGES.length} titres, descriptions, balises de partage et <h1> uniques ; un JSON-LD valide et un canonical par page`);
})();

// ---------------------------------------------------------------- sitemap.xml
//
// Tiré de PAGES : une page ajoutée ici entre au sitemap sans qu'on y pense. Une page de
// l'Assemblée prend la date du jour SEULEMENT si ce build l'a changée (`changees`) ; sinon elle
// garde sa date. Avant, .github/workflows/refresh.yml datait tout du jour à chaque passage — et il
// y avait toujours un changement (les horodatages des données) : /lexique « changeait » chaque
// matin. scripts/update-sitemap-lastmod.js reste pour dater à la main, au besoin.
//
// Les volets municipaux y sont depuis le 21 sept. 2026 (Martin a levé leurs verrous noindex). Leur
// <lastmod> vient de leurs propres données — la date de la décision ou du vote le plus récent —,
// jamais de la date du build : leurs routines tournent à part, et un lastmod qui avance chaque jour
// sans que rien ne change finit par ne plus rien dire à Google. Le lexique et la page des sources
// d'un volet changent rarement et n'en portent pas (le protocole le permet).
//
// GARDE-FOU : une page du sitemap ne peut PAS être en noindex (balise ou en-tête de vercel.json),
// ni porter un autre canonical que son adresse. Pour l'Assemblée, c'est un arrêt du build. Pour un
// volet, un avertissement, et la page SORT du sitemap : ce build tourne dans la chaîne quotidienne
// de l'Assemblée, et un volet qu'on reverrouille (si une Ville refuse) ou dont les données arrivent
// abîmées ne doit pas empêcher la publication des votes et des projets de loi du jour.
const VILLES = ['quebec', 'montreal', 'levis', 'longueuil', 'laval'];
const PAGES_VILLE = [
  { page: 'index', frequence: 'daily', priorite: '0.8', jeu: 'decisions' },
  { page: 'decisions', frequence: 'daily', priorite: '0.8', jeu: 'decisions' },
  { page: 'conseil', frequence: 'weekly', priorite: '0.6', jeu: 'decisions' },
  { page: 'votes', frequence: 'weekly', priorite: '0.6', jeu: 'votes' },
  { page: 'lexique', frequence: 'monthly', priorite: '0.4' },
  { page: 'sources', frequence: 'monthly', priorite: '0.3' },
];
function derniereDate(ville, jeu) {
  const chemin = `${ville}/data/${jeu}.json`;
  if (!existsSync(chemin)) return null;
  let d;
  try { d = JSON.parse(readFileSync(chemin, 'utf8')); }
  catch (e) { console.warn(`⚠ sitemap : ${chemin} illisible (${e.message.slice(0, 70)}) — pas de <lastmod>`); return null; }
  if (!d || typeof d !== 'object') return null;
  const liste = Array.isArray(d) ? d : (d[jeu] || d.items || []);
  if (!Array.isArray(liste)) return null;
  const dates = liste.map((x) => String(x?.date ?? '').slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  return dates.pop() || null;
}
const sitemap = (function preparerSitemap(){
  const dates = new Map();
  if (existsSync('sitemap.xml')) {
    for (const m of readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) dates.set(m[1], m[2]);
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const entrees = produites.map(({ page: p, html }) => {
    const loc = p.url === '/' ? `${BASE}/` : BASE + p.url;
    const lastmod = changees.has(p.fichier) ? aujourdhui : (dates.get(loc) || aujourdhui);
    return { loc, fichier: p.fichier, html, lastmod, frequence: p.frequence, priorite: p.priorite };
  });
  for (const v of VILLES) {
    for (const p of PAGES_VILLE) {
      const fichier = `${v}/${p.page}.html`;
      if (!existsSync(fichier)) { console.warn(`⚠ sitemap : ${fichier} introuvable — hors du sitemap`); continue; }
      entrees.push({
        ville: true, loc: `${BASE}/${v}/${p.page === 'index' ? '' : p.page}`, fichier,
        html: readFileSync(fichier, 'utf8'),
        lastmod: p.jeu ? derniereDate(v, p.jeu) : null, frequence: p.frequence, priorite: p.priorite,
      });
    }
  }

  // Le garde-fou (voir plus haut) : arrêt pour l'Assemblée, retrait du sitemap pour un volet.
  const enTetes = JSON.parse(readFileSync('vercel.json', 'utf8')).headers || [];
  const exclues = new Set();
  const garde = (e, ok, msg) => {
    if (ok) return;
    if (!e.ville) must(false, msg);
    console.warn(`⚠ sitemap : ${msg} — adresse retirée du sitemap`);
    exclues.add(e);
  };
  for (const e of entrees) {
    garde(e, !/<meta name="robots" content="[^"]*noindex/.test(e.html), `${e.fichier} porte un noindex`);
    const chemin = e.loc.slice(BASE.length);
    for (const h of enTetes) {
      // Les sources de vercel.json n'emploient que « (.*) » comme joker : le reste est littéral.
      const motif = new RegExp('^' + h.source.split('(.*)').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      const noindex = (h.headers || []).some((x) => /x-robots-tag/i.test(x.key) && /noindex/i.test(x.value));
      garde(e, !(noindex && motif.test(chemin)), `${chemin} : vercel.json lui envoie un noindex (${h.source})`);
    }
    const canon = (e.html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
    garde(e, canon === e.loc, `${e.fichier} : canonical ${canon} au lieu de ${e.loc}`);
  }
  const gardees = entrees.filter((e) => !exclues.has(e));
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Écrit par scripts/build-section-pages.js (PAGES, puis VILLES et PAGES_VILLE) : ne pas modifier à la main. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...gardees.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n${e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : ''}    <changefreq>${e.frequence}</changefreq>\n    <priority>${e.priorite}</priority>\n  </url>`),
    '</urlset>',
    '',
  ].join('\n');
  return { xml, n: gardees.length, villes: gardees.filter((e) => e.ville).length };
})();

// ---------------------------------------------------------------- écriture, tout contrôle passé
console.log('\n✓ pages :');
for (const { page, html } of produites) {
  if (aEcrire.has(page.fichier)) writeFileSync(page.fichier, html, 'utf8');
  console.log(`    ${page.url.padEnd(16)} ${ko(Buffer.byteLength(html))}  ${page.fichier}  [${page.donnees.join(' ') || 'aucune donnée'}]${aEcrire.has(page.fichier) ? '  ← réécrite' : changees.has(page.fichier) ? '  ← ses données ont changé' : ''}`);
}
console.log(`✓ ${PAGES.length} pages fabriquées depuis ${SRC}.`);
if (!existsSync('sitemap.xml') || readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n') !== sitemap.xml) writeFileSync('sitemap.xml', sitemap.xml, 'utf8');
console.log(`✓ sitemap.xml : ${sitemap.n} adresses (${sitemap.n - sitemap.villes} de l'Assemblée, ${sitemap.villes} des volets), aucune en noindex`);
