// PRÉ-RENDU DES PAGES DU VOLET (6 nov. 2026). Chaque page arrivait vide, avec « Chargement des
// données… », puis assets/app.js téléchargeait des JSON entiers (7 Mo pour l'accueil) avant de
// dessiner quoi que ce soit : un éclair blanc, puis tout d'un coup. Ce script écrit le premier écran
// DANS le HTML, pour qu'il se lise avant tout JavaScript.
//
//   node scripts/prerendre.js        les six pages, depuis quebec/
//
// Pas de second moteur de rendu à tenir à jour : on exécute assets/app.js lui-même, ici, dans Node,
// devant un faux document qui ne connaît que les zones remplies par app.js (#fil, #liste-decisions,
// #compte-votes…). Ce qu'app.js y écrit est recopié tel quel dans la page, entre deux repères
// <!--PR:id--> … <!--/PR:id-->, et <body> reçoit data-prerendu="1" : dans le navigateur, app.js voit
// ce drapeau et ne redessine rien, il ne charge les jeux complets qu'au premier geste qui en a besoin.
//
// Écrit aussi data/pages/accueil.json : le début du fil d'accueil (100 éléments et leurs résumés),
// pour que « Afficher plus » n'aille pas chercher les 7 Mo de décisions et de résumés.
//
// Relancé par scripts/refresh.js après chaque mise à jour des données.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Les dates de la page des sources (toLocaleString) : à l'heure de Québec, pas à celle du serveur.
process.env.TZ = 'America/Toronto';

const VOLET = fileURLToPath(new URL('..', import.meta.url));
const RACINE = fileURLToPath(new URL('../..', import.meta.url));

// app.js importe /commun/… (chemin du site) : on le fait pointer vers le dossier commun/ du dépôt.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function resolve(s, c, n) { return s.startsWith('/commun/') ? { url: ${JSON.stringify(pathToFileURL(RACINE).href)} + s.slice(1), shortCircuit: true } : n(s, c); }`
    )
);

const PAGES = [
  { fichier: 'index.html', page: 'accueil', slug: '' },
  { fichier: 'decisions-de-la-ville-de-quebec.html', page: 'decisions', slug: 'decisions-de-la-ville-de-quebec' },
  { fichier: 'conseil-municipal-de-quebec.html', page: 'conseil', slug: 'conseil-municipal-de-quebec' },
  { fichier: 'lexique-municipal-de-quebec.html', page: 'lexique', slug: 'lexique-municipal-de-quebec' },
  { fichier: 'sources-des-donnees-de-quebec.html', page: 'sources', slug: 'sources-des-donnees-de-quebec' },
];

// Les zones qu'app.js remplit. Les champs de saisie (#rech-…, #affichage, #filtre-resume,
// #mode-couleur) sont lus, jamais écrits : ils gardent leur valeur par défaut.
const ZONES = [
  'chargement', 'chiffres', 'titre-fil', 'fil', 'plus-fil',
  'rech-decisions', 'filtre-type', 'filtre-theme', 'affichage', 'filtre-instance', 'filtre-resume', 'compte-decisions', 'liste-decisions', 'plus-decisions',
  'resume-dissidence', 'qui-demande', 'table-dissidence', 'table-dissidence tbody', 'rech-votes', 'filtre-theme-votes', 'filtre-instance-votes', 'compte-votes', 'liste-votes', 'plus-votes',
  'mode-couleur', 'carte', 'legende', 'compte-elus', 'legende-executif', 'liste-elus', 'compte-agglo', 'liste-agglo', 'compte-cucq', 'liste-cucq',
  'rech-lexique', 'compte-lexique', 'liste-lexique',
  'etat-donnees', 'etat-archive',
];
const VALEURS = { affichage: 'seance', 'mode-couleur': 'arrondissement' };

const texte = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const attr = (s) => String(s).replace(/[&"]/g, (c) => ({ '&': '&amp;', '"': '&quot;' }[c]));

// ---------- le faux document ----------
// Juste ce qu'app.js touche : innerHTML, textContent, hidden, value, dataset, options.
class Zone {
  constructor(id, hidden) {
    this.id = id;
    this.hidden = hidden;
    this.hiddenDepart = hidden;
    this.value = VALEURS[id] ?? '';
    this.checked = false;
    this.dataset = {};
    this.options = [];
    this.html = null; // null : intérieur intact
  }
  set innerHTML(v) { this.html = String(v); this.options = []; }
  get innerHTML() { return this.html ?? ''; }
  set textContent(v) { this.html = texte(v); }
  get textContent() { return this.html ?? ''; }
  append(option) { this.options.push(option); }
  insertAdjacentHTML() {}
  addEventListener() {}
  before() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const vide = () => {};
const classes = { add: vide, remove: vide, toggle: vide, contains: () => false };
function fauxDocument(html, page) {
  const zones = new Map();
  for (const id of ZONES) {
    const [base, sous] = id.split(' ');
    const ouverture = html.match(new RegExp(`<\\w+\\b[^<>]*\\bid="${base}"[^<>]*>`));
    if (!ouverture) continue;
    zones.set(id, new Zone(id, !sous && /\shidden(?=[\s>])/.test(ouverture[0])));
  }
  const chercher = (sel) => zones.get(String(sel).replace(/^#/, '')) ?? null;
  return {
    zones,
    document: {
      body: { dataset: { page, ville: 'quebec' }, appendChild: vide, classList: classes },
      head: { appendChild: vide },
      documentElement: { dataset: {}, style: {}, classList: classes, lang: 'fr' },
      querySelector: chercher,
      getElementById: chercher,
      querySelectorAll: () => [],
      addEventListener: vide,
      createElement: (tag) => ({ tagName: tag, dataset: {}, style: {}, classList: classes, setAttribute: vide, addEventListener: vide, append: vide }),
    },
  };
}

// L'environnement du navigateur, le strict nécessaire.
Object.assign(globalThis, {
  window: globalThis,
  addEventListener: vide,
  innerHeight: 800,
  scrollY: 0,
  matchMedia: () => ({ matches: false, addEventListener: vide }),
  requestAnimationFrame: vide,
});
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: vide }, configurable: true });
globalThis.fetch = async (url) => {
  try {
    const contenu = readFileSync(`${VOLET}${String(url).split('?')[0]}`, 'utf8');
    return { ok: true, json: async () => JSON.parse(contenu) };
  } catch {
    return { ok: false, json: async () => null };
  }
};

// ---------- l'écriture dans la page ----------
const debut = (id) => `<!--PR:${id}-->`;
const fin = (id) => `<!--/PR:${id}-->`;

function ecrireZone(html, zone) {
  const [base, sous] = zone.id.split(' ');
  const re = new RegExp(`<(\\w+)\\b[^<>]*\\bid="${base}"[^<>]*>`);
  const m = html.match(re);
  let ouverture = m[0];
  let tag = m[1];
  let pos = m.index;
  if (sous) {
    // « #table-dissidence tbody » : le premier <tbody> après la table.
    pos = html.indexOf(`<${sous}`, pos);
    ouverture = html.slice(pos, html.indexOf('>', pos) + 1);
    tag = sous;
  }
  // L'attribut hidden et les data-* posés par app.js (data-rempli : menus déjà remplis, que
  // remplirSelect ne refait pas ; data-etat du bouton « Tout déplier »).
  let neuve = ouverture.replace(/\shidden(?=[\s>])/, '');
  for (const [cle, valeur] of Object.entries(zone.dataset)) {
    neuve = neuve.replace(new RegExp(`\\sdata-${cle}="[^"]*"`), '').replace(/>$/, ` data-${cle}="${attr(valeur)}">`);
  }
  if (zone.hidden) neuve = neuve.replace(/>$/, ' hidden>');
  html = html.slice(0, pos) + neuve + html.slice(pos + ouverture.length);
  const apres = pos + neuve.length;

  let interieur = zone.html;
  if (zone.options.length) {
    interieur = zone.options.map((o) => `<option value="${attr(o.value)}">${texte(o.textContent)}</option>`).join('');
  }
  if (interieur == null) return html;
  // Lien profond (?q=, ?instance=, ?projet=) : app.js redessine la liste ; d'ici là, elle reste
  // cachée sous l'avis de chargement, comme avant, plutôt que de montrer un autre premier écran.
  if (zone.id === 'liste-decisions') {
    interieur += `<script>if (/[?&](q|instance|projet)=/.test(location.search)) { document.getElementById('liste-decisions').hidden = true; document.getElementById('chargement').hidden = false; }</script>`;
  }
  const bloc = debut(zone.id) + interieur + fin(zone.id);
  const iDebut = html.indexOf(debut(zone.id), apres);
  if (iDebut !== -1) {
    const iFin = html.indexOf(fin(zone.id), iDebut) + fin(zone.id).length;
    return html.slice(0, iDebut) + bloc + html.slice(iFin);
  }
  // Première fois : la zone est vide, sauf un menu (son option « Tous les… ») qu'on garde en tête.
  const fermeture = html.indexOf(`</${tag}>`, apres);
  if (tag === 'select') return html.slice(0, fermeture) + bloc + html.slice(fermeture);
  return html.slice(0, apres) + bloc + html.slice(fermeture);
}

// L'ancien pré-rendu « pour Google » (scripts/prerendu-villes.js, 27 sept. 2026) : remplacé ici par
// le vrai premier écran, qui porte plus de texte encore.
const sansAncienPrerendu = (html) => html.replace(/<!--PRERENDU:decisions-->[\s\S]*?<!--\/PRERENDU:decisions-->/, '');

// ---------- le fil d'accueil, en petit ----------
const CHAMPS_DECISION = ['id', 'sommaireId', 'numero', 'date', 'type', 'instance', 'theme', 'objet', 'pdf'];
const CHAMPS_VOTE = ['numero', 'date', 'instance', 'resultat', 'objet', 'decomptePour', 'decompteContre', 'pour', 'contre'];
const garder = (o, champs) => Object.fromEntries(champs.filter((c) => o[c] !== undefined).map((c) => [c, o[c]]));
const NOMBRE_FIL = 100;

function filAccueil(app) {
  const { evenements, nouveaux, mode } = app.evenementsRecents();
  const source = mode === 'nouveautes' ? nouveaux : evenements;
  const resumes = {};
  const garde = source.slice(0, NOMBRE_FIL).map((e) => {
    if (e.genre === 'decision') {
      for (const id of [e.data.id, e.data.sommaireId]) {
        const r = id && app.etat.parId.get(id);
        if (r) resumes[id] = garder(r, ['id', 'numero', 'puces', 'montantPrincipal', 'sansContenuSubstantiel']);
      }
    }
    return { genre: e.genre, nouveau: e.nouveau, date: e.date, data: garder(e.data, e.genre === 'vote' ? CHAMPS_VOTE : CHAMPS_DECISION) };
  });
  return { mode, total: source.length, themes: app.etat.decisions?.themes ?? {}, evenements: garde, resumes };
}

// ---------- les six pages ----------
for (const { fichier, page, slug } of PAGES) {
  const chemin = `${VOLET}${fichier}`;
  const origine = readFileSync(chemin, 'utf8');
  let html = sansAncienPrerendu(origine);
  const { zones, document } = fauxDocument(html, page);
  globalThis.document = document;
  globalThis.location = new URL(`https://dossierquebec.ca/quebec/${slug}`);
  // Une instance fraîche d'app.js par page (son état est au niveau du module).
  const app = await import(`${pathToFileURL(`${VOLET}assets/app.js`).href}?page=${page}`);
  await app.rendu;
  if (zones.get('chargement') && !zones.get('chargement').hidden && page !== 'sources') {
    throw new Error(`${fichier} : app.js n'a rien rendu (données manquantes ?)`);
  }

  for (const zone of zones.values()) {
    if (zone.html == null && !zone.options.length && zone.hidden === zone.hiddenDepart && !Object.keys(zone.dataset).length) continue;
    html = ecrireZone(html, zone);
  }
  if (!/<body[^>]*\bdata-prerendu="1"/.test(html)) html = html.replace(/<body\b/, '<body data-prerendu="1"');
  if (html !== origine) writeFileSync(chemin, html);
  console.log(`${fichier} : ${Math.round(Buffer.byteLength(html) / 1024)} ko${html === origine ? ' (inchangé)' : ''}`);

  if (page === 'accueil') {
    mkdirSync(`${VOLET}data/pages`, { recursive: true });
    writeFileSync(`${VOLET}data/pages/accueil.json`, JSON.stringify(filAccueil(app)));
  }
}
