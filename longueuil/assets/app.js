// Logique commune à toutes les pages de DossierVille.
//
// Chaque page HTML porte un attribut data-page sur <body> ; ce script charge uniquement
// les jeux de données dont cette page a besoin, puis appelle le rendu correspondant.
// Les données sont lues à l'exécution depuis data/*.json, donc les pages restent légères
// et une seule extraction met tout le site à jour.
//
// MODÈLE : montreal/assets/app.js (Martin, 20 nov. 2026). Même code, mêmes fonctions ; ce qui est
// propre à Longueuil vit dans le bloc VILLE ci-dessous ou dans une fonction marquée « Longueuil ».

// ---------- configuration de la ville ----------
const VILLE = {
  nom: 'Longueuil',
  pages: { decisions: 'decisions-de-la-ville-de-longueuil', conseil: 'conseil-de-ville-de-longueuil', contrats: null },
  membres: ['membres du conseil de ville', 'members of City Council'],
  // Jeux que Montréal a et que Longueuil n'a pas encore : on ne les demande pas (pas de 404 en console).
  textes: false, // data/textes.json : le texte exact de la résolution
  contrats: false, // data/contrats-decisions.json : les contrats du SEAO sur la fiche
  archives: false, // data/archives/index.json : les années passées
  // La portée d'une décision, d'après son instance (blocContexte).
  portee: {
    'Conseil de ville': ['Toute la Ville de Longueuil (conseil de ville)', 'The whole City of Longueuil (city council)'],
    "Conseil d'agglomération": ["L'agglomération : Longueuil et les 4 villes liées (Boucherville, Brossard, Saint-Bruno-de-Montarville, Saint-Lambert)", 'The agglomeration: Longueuil and its 4 linked cities'],
    'Comité exécutif': ['Ville de Longueuil, décision du comité exécutif', 'City of Longueuil, executive committee decision'],
  },
};

import { EN, tr } from '/commun/langue.js';
import { libelleEn, themeEn } from './libelles-en.js';
import { boutonImprimer, brancherImpression } from '/commun/imprimer-seance.js';

brancherImpression();
// Les libellés qui viennent des données (type, instance, résultat, fonction, rôle) : traduits en
// anglais, intacts en français. Les noms propres restent français dans les deux cas.
const lib = (texte) => (EN ? libelleEn(texte) : texte);
const categorieEn = (c) => (EN ? (etat.traductionsEn?.categories?.[c] ?? c) : c);

const PAS = 60; // fiches affichées par palier
const PAS_SEANCES = 8; // séances affichées par palier, en mode groupé
// Cinq à l'arrivée pour que la page reste courte, dix par clic ensuite : le premier
// écran sert à décider si on veut lire, les suivants à lire pour vrai.
const PAS_VOTES_DEPART = 5;
const PAS_VOTES = 10;
const PAS_FIL = 3; // éléments du fil d'accueil (9 nov. 2026 : 3, puis le bouton mène à la page Décisions)

const etat = {
  decisions: null,
  projet: null, // le sujet suivi dont on arrive, depuis « Mes dossiers »
  votes: null,
  elus: null,
  resumes: null,
  parId: new Map(), // id du document -> résumé IA
  limiteDecisions: PAS,
  limiteSeances: PAS_SEANCES,
  limiteVotes: PAS_VOTES_DEPART,
  limiteFil: PAS_FIL,
};

const $ = (sel) => document.querySelector(sel);
const existe = (sel) => Boolean($(sel));

export const echapper = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
export function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return EN ? `${MONTHS[Number(m) - 1]} ${Number(j)}, ${a}` : `${Number(j)} ${MOIS[Number(m) - 1]} ${a}`;
}

const nombreFr = (n) => Number(n).toLocaleString(EN ? 'en-CA' : 'fr-CA');

// Le titre d'un procès-verbal ou d'un ordre du jour est composé par le robot, en français.
// En anglais on le recompose plutôt que de le traduire à la pièce.
const TITRE_PV = /^Procès-verbal — (.+), séance (ordinaire|extraordinaire) du (\d{4}-\d{2}-\d{2})$/;
const TITRE_ODJ = /^Ordre du jour — (.+), séance du (\d{4}-\d{2}-\d{2}) \((\d+) points?\)$/;
// Montants sans cents (rétroaction d'un lecteur, 13 nov. 2026) : « 828 241,70 $ » devient « 828 242 $ ».
export function sansCents(t) {
  if (t == null) return t;
  return String(t)
    .replace(/(\d),0(?=[   ]?[KkMG]\$)/g, (m, c) => c)
    .replace(/(\d{1,3}(?:[   ]\d{3})+|\d+),(\d)(?=[   ]?[Kk]\$)/g, (m, ent, dec) =>
      Math.round(Number(ent.replace(/[   ]/g, '')) + Number('0.' + dec)).toLocaleString('fr-CA'))
    .replace(/(\d{1,3}(?:[   ]\d{3})+|\d+),(\d{1,2})(?=[   ]?\$)/g, (m, ent, dec) =>
      Math.round(Number(ent.replace(/[   ]/g, '')) + Number('0.' + dec)).toLocaleString('fr-CA'))
    .replace(/\$[  ]?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{1,2})\b/g, (m, ent, dec) =>
      '$' + Math.round(Number(ent.replace(/,/g, '')) + Number('0.' + dec)).toLocaleString('en-CA'));
}

// CONTEXTE D'UNE DÉCISION (13 nov. 2026) : la portée (l'instance), la durée (dates écrites dans
// l'objet), le parcours du dossier (les autres décisions qui portent le même numéro de dossier).
const MOIS_FR = { janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11 };
function porteeDe(instance) {
  if (!instance) return null;
  const p = VILLE.portee[instance];
  if (p) return tr(p[0], p[1]);
  const a = instance.match(/^Conseil d'arrondissement (de |du |d')(.+)$/);
  if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
  return null;
}
function dureeDe(objet) {
  if (!objet) return null;
  if (/^(Abroger|Annuler|Résilier|Mettre fin|Abrogation|Annulation|Résiliation)/i.test(objet.trim())) return null;
  const m = objet.match(/du (1er|\d{1,2})(?:er)? (\p{L}+) (\d{4}) au (1er|\d{1,2})(?:er)? (\p{L}+) (\d{4})/iu);
  if (m && MOIS_FR[m[2].toLowerCase()] != null && MOIS_FR[m[5].toLowerCase()] != null) {
    const d1 = new Date(+m[3], MOIS_FR[m[2].toLowerCase()], m[1] === '1er' ? 1 : +m[1]);
    const d2 = new Date(+m[6], MOIS_FR[m[5].toLowerCase()], m[4] === '1er' ? 1 : +m[4]);
    const mois = Math.round((d2 - d1) / (30.44 * 864e5));
    if (mois > 0 && mois < 600) {
      const txt = mois % 12 === 0 ? (mois === 12 ? tr('1 an', '1 year') : tr(`${mois / 12} ans`, `${mois / 12} years`)) : tr(`${mois} mois`, `${mois} months`);
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return `${txt} (${dateFr(iso(d1))} → ${dateFr(iso(d2))})`;
    }
  }
  const p = objet.match(/p[ée]riode (?:additionnelle )?d(?:'|e )(un|une|deux|trois|quatre|cinq|six|dix|\d+) (ans?|années?|mois)/i);
  if (p) {
    const n = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, dix: 10 }[p[1].toLowerCase()] ?? +p[1];
    const an = /^an/i.test(p[2]);
    return an ? tr(`${n} an${n > 1 ? 's' : ''}`, `${n} year${n > 1 ? 's' : ''}`) : tr(`${n} mois`, `${n} month${n > 1 ? 's' : ''}`);
  }
  return null;
}
let parDossier = null;
function parcoursDe(d) {
  if (!d.dossier || !etat.decisions?.decisions) return null;
  if (!parDossier) {
    parDossier = new Map();
    for (const x of etat.decisions.decisions) if (x.dossier) (parDossier.get(x.dossier) ?? parDossier.set(x.dossier, []).get(x.dossier)).push(x);
  }
  const l = (parDossier.get(d.dossier) ?? []).filter((x) => x.type !== 'Procès-verbal' && x.type !== 'Ordre du jour');
  if (l.length < 2) return null;
  return l.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((x) => {
    const double = l.some((y) => y !== x && y.date === x.date && y.instance === x.instance);
    const etiquette = `${dateFr(x.date)}, ${echapper(lib(x.instance ?? ''))}${double && x.numero ? ` (${echapper(x.numero)})` : ''}`;
    if (x === d) return `<strong>${etiquette} ${tr('(cette décision)', '(this decision)')}</strong>`;
    const cle = x.numero || x.id;
    return `<a href="${VILLE.pages.decisions}?q=${encodeURIComponent(cle)}">${etiquette}</a>`;
  }).join(' → ');
}
function blocContexte(d) {
  if (d.type === 'Procès-verbal' || d.type === 'Ordre du jour') return '';
  const lignes = [];
  const portee = porteeDe(d.instance);
  if (portee) lignes.push(`<li><strong>${tr('Portée', 'Scope')}&nbsp;:</strong> ${echapper(portee)}</li>`);
  const duree = dureeDe(d.objet);
  if (duree) lignes.push(`<li><strong>${tr('Durée', 'Term')}&nbsp;:</strong> ${echapper(duree)}</li>`);
  const parcours = parcoursDe(d);
  if (parcours) lignes.push(`<li><strong>${tr('Parcours du dossier', 'Path of this file')}&nbsp;:</strong> ${parcours}</li>`);
  return lignes.length ? `<ul class="contexte-decision">${lignes.join('')}</ul>` : '';
}

function objetDe(d) {
  const objet = sansCents(d?.objet ?? null);
  if (!EN || !objet) return objet;
  const pv = objet.match(TITRE_PV);
  if (pv) return `Minutes — ${libelleEn(pv[1])}, ${pv[2] === 'extraordinaire' ? 'special' : 'regular'} meeting of ${dateFr(pv[3])}`;
  const odj = objet.match(TITRE_ODJ);
  if (odj) return `Agenda — ${libelleEn(odj[1])}, meeting of ${dateFr(odj[2])} (${odj[3]} item${odj[3] === '1' ? '' : 's'})`;
  return objet;
}
const s = (n, sing, plur) => (n > 1 ? plur : sing);

// ---------- chargement ----------
async function charger(nom) {
  try {
    const res = await fetch(`data/${nom}.json`, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function messageSansDonnees() {
  const zone = $('#chargement');
  if (!zone) return;
  zone.innerHTML = tr(
    "<strong>Aucune donnée.</strong> Lancez <code>npm run refresh</code> à la racine du projet, " +
    'puis <code>npm run serve</code> et rechargez cette page. ' +
    "(Ouvrir le fichier par double-clic ne fonctionne pas&nbsp;: le navigateur bloque la lecture des fichiers JSON.)",
    '<strong>No data.</strong> Run <code>npm run refresh</code> at the project root, then <code>npm run serve</code>, and reload this page.'
  );
}

// L'archive des années passées : lue seulement quand une recherche venue de l'adresse ne trouve
// rien dans l'année en cours (un lien reçu par courriel il y a des mois).
async function lireAnneeArchivee(fichier) {
  try {
    const res = await fetch(`data/${fichier}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    if (!('DecompressionStream' in window) || !res.body) return await res.json();
    const flux = res.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flux).text());
  } catch {
    try { return await (await fetch(`data/${fichier}`, { cache: 'force-cache' })).json(); } catch { return null; }
  }
}

async function chercherDansArchive(q) {
  const liste = $('#liste-decisions');
  if (!liste || !VILLE.archives) return;
  const manifeste = await charger('archives/index');
  const annees = [...(manifeste?.annees ?? [])].sort((a, b) => (a.annee < b.annee ? 1 : -1));
  if (!annees.length) return;
  const avis = document.createElement('p');
  avis.className = 'compte';
  avis.id = 'avis-archive';
  avis.textContent = tr('Rien dans l’année en cours. Lecture des années archivées…', 'Nothing in the current year. Reading the archived years…');
  liste.before(avis);
  const cherche = q.trim().toLowerCase();
  for (const a of annees) {
    const annee = await lireAnneeArchivee(a.fichier);
    const trouvees = (annee?.decisions ?? []).filter((d) => ((d.objet ?? '') + ' ' + (d.numero ?? '') + ' ' + (d.id ?? '')).toLowerCase().includes(cherche));
    if (!trouvees.length) continue;
    avis.textContent = tr(
      `Ce document n’est pas de l’année en cours : ${nombreFr(trouvees.length)} trouvé(s) dans l’archive de ${a.annee}. Les résumés en langage clair ne couvrent pas les années archivées.`,
      `This document is not from the current year: ${nombreFr(trouvees.length)} found in the ${a.annee} archive. Plain-language summaries do not cover archived years.`
    );
    liste.innerHTML = trouvees.slice(0, 50).map(carteDecision).join('');
    if ($('#compte-decisions')) $('#compte-decisions').textContent = '';
    if ($('#plus-decisions')) $('#plus-decisions').hidden = true;
    return;
  }
  avis.textContent = tr('Ce document n’est ni dans l’année en cours, ni dans les années archivées.', 'This document is in neither the current year nor the archived years.');
}

// ---------- décisions ----------
function remplirSelect(select, valeurs) {
  for (const { valeur, n, libelle } of valeurs) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = `${libelle ?? valeur} (${n})`;
    select.append(option);
  }
}

// Le résumé d'une décision peut venir de deux endroits : du document lui-même s'il s'agit
// d'un sommaire décisionnel, ou du sommaire auquel une résolution renvoie. Sans ce second
// cas, une séance d'arrondissement — qui ne contient que des résolutions — n'afficherait
// aucun résumé, alors que la matière existe.
function resumePour(d) {
  if (d.theme === 'procedure') return null;   // résumés de procédure masqués : jamais rien d'utile (Martin, 9 nov. 2026)
  const viaSommaire = d.sommaireId ? etat.parId.get(d.sommaireId) : null;
  if (viaSommaire) return { r: viaSommaire, indirect: viaSommaire.id !== d.id };
  const direct = etat.parId.get(d.id);
  return direct ? { r: direct, indirect: false } : null;
}
// Combien de décisions de la liste ont un résumé, par l'une ou l'autre voie.
function nombreResumees(liste) {
  return liste.filter((d) => d.type === 'Résolution' && resumePour(d)).length;
}

// Le résumé n'est affiché que s'il existe pour ce document précis, toujours identifié
// comme généré par une IA, et toujours accompagné du lien vers le PDF officiel.
function blocResume(trouve) {
  if (!trouve) return '';
  const { r, indirect } = trouve;
  return `<div class="resume">
    <div class="resume-entete">
      <span>${tr('Résumé généré par IA', 'AI-generated summary')}${r.source === 'sommaire' || indirect ? `${tr(" — d'après le sommaire décisionnel", ' — from the decision summary')}${indirect && r.numero ? ` ${echapper(r.numero)}` : ''}` : tr(" — d'après le texte de la résolution", ' — from the text of the resolution')}</span>
      ${r.francaisSeulement ? '<span class="puce procedural" lang="en">summary not yet translated</span>' : ''}
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(sansCents(r.montantPrincipal))}</span>` : ''}
      ${r.sansContenuSubstantiel ? `<span class="puce procedural">${tr('document de procédure', 'procedural document')}</span>` : ''}
    </div>
    <ul>${r.puces.map((p) => `<li>${echapper(sansCents(p))}</li>`).join('')}</ul>
  </div>`;
}

// La couleur vit dans le CSS, pas dans les données : on émet une classe (t-urbanisme,
// t-contrats…) et la feuille de style décide.
function puceTheme(cle) {
  const t = etat.decisions?.themes?.[cle] ?? etat.votes?.themes?.[cle];
  if (!t) return '';
  return `<span class="puce theme t-${echapper(cle)}">${echapper(EN ? themeEn(cle, t.libelle) : t.libelle)}</span>`;
}

// ---------- le texte d'une décision ----------
// Le dispositif et les motifs, derrière un pli fermé. Le fichier ne se charge qu'à la première
// fiche dépliée et seulement si la ville en a un (VILLE.textes).
let textesDecisions = null;
let textesEnCours = null;

async function chargerTextes() {
  if (textesDecisions) return textesDecisions;
  textesEnCours ??= charger('textes').then((t) => (textesDecisions = t?.textes ?? {}));
  return textesEnCours;
}

function rendreTexteDecision(zone, t) {
  if (!t || (!t.dispositif && !t.motifs)) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = `<details class="texte-decision-pli"><summary>${tr('Texte exact de la résolution', 'Exact text of the resolution')}</summary>
    ${t.dispositif ? `<div class="dispositif"><h4>${tr('Ce que le conseil a décidé', 'What the council decided')}</h4><p>${echapper(t.dispositif)}</p></div>` : ''}
    ${t.motifs ? `<div class="motifs"><h4>${tr("Sur quoi il s'appuie", 'What it is based on')}</h4><p>${echapper(t.motifs)}</p></div>` : ''}
  </details>`;
}

// `toggle` ne remonte pas : on écoute à la capture, sur la liste entière.
function brancherTextes(liste) {
  if (!liste || liste.dataset.textes || !VILLE.textes) return;
  liste.dataset.textes = '1';
  liste.addEventListener(
    'toggle',
    async (e) => {
      const fiche = e.target;
      if (!fiche.open) return;
      const zone = fiche.querySelector('.texte-decision');
      if (!zone || zone.dataset.rempli) return;
      zone.dataset.rempli = '1';
      const textes = await chargerTextes();
      rendreTexteDecision(zone, textes?.[zone.dataset.id]);
    },
    true
  );
}

// Après un redessin, les fiches reviennent fermées : le bouton doit le refléter.
function reinitialiserDepliage() {
  const b = $('#tout-deplier');
  if (!b) return;
  b.dataset.etat = 'replie';
  b.textContent = tr('Tout déplier', 'Expand all');
}

// Fiche repliée par défaut ; l'attribut `name` partagé fait de la liste un accordéon natif.
const NOM_ACCORDEON = 'fiches';

// Longueuil : une décision « vaut la vitrine » quand elle porte un résumé IA. Tant que la Ville
// n'a aucun résumé publié (résumés éteints), la règle retomberait sur une page vide : on se rabat
// alors sur les vraies décisions, hors procédure et documents de séance.
function aResume(d) {
  if (etat.parId.size) return Boolean(resumePour(d));
  return d.theme !== 'procedure' && d.type !== 'Procès-verbal' && d.type !== 'Ordre du jour' && d.type !== 'Document de séance';
}

// Au bas de chaque décision dépliée QUI A UN RÉSUMÉ IA : la partager.
function actionsFiche(d) {
  const r = resumePour(d)?.r;
  if (!r?.puces?.length || r.sansContenuSubstantiel) return '';
  const cle = d.numero || d.objet || '';
  if (!cle) return '';
  const lien = new URL(`${VILLE.pages.decisions}?q=${encodeURIComponent(cle)}`, location.href).href;
  const coupe = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
  const recap = coupe(r.puces[0], 200);
  const texteX = coupe(recap, 230);
  const texteComplet = `${coupe(d.objet ?? '', 160)}\n\n${r.puces.slice(0, 3).map((p) => '• ' + p).join('\n')}\n\n${lien}`;
  return `<div class="fiche-actions">
      <span class="fiche-actions-titre">${tr('Partager', 'Share')}</span>
      <a class="fiche-bouton" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien)}" target="_blank" rel="noopener">Facebook</a>
      <a class="fiche-bouton" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(texteX)}&url=${encodeURIComponent(lien)}" target="_blank" rel="noopener">X</a>
      <button type="button" class="fiche-bouton" data-texte="${echapper(texteComplet)}" onclick="copierLienFiche(this)">⧉ ${tr('Copier', 'Copy')}</button>
    </div>`;
}
function copierLienFiche(b) {
  const texte = b.dataset.texte;
  const avant = b.textContent;
  const fait = () => { b.textContent = '✓ ' + tr('Copié', 'Copied'); setTimeout(() => { b.textContent = avant; }, 1500); };
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(fait).catch(() => window.prompt(tr('Copiez :', 'Copy:'), texte));
}
window.copierLienFiche = copierLienFiche;

function carteRepliable(entete, corps, ouverte = false) {
  return `<details class="carte pliante"${ouverte ? ' open' : ''} name="${NOM_ACCORDEON}"><summary>${entete}</summary><div class="corps">${corps}</div></details>`;
}

function carteDecision(d, ouverte = false) {
  const entete = `<div class="meta">
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${d.categorie && !/^\d{8,}$/.test(d.categorie) ? `<span class="puce">${echapper(categorieEn(d.categorie))}</span>` : ''}
      ${d.unite ? `<span class="puce">${echapper(lib(d.unite.replace(/_/g, ', ')))}</span>` : ''}
      ${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(lib(d.resultat))}</span>` : ''}
      ${d.voteEnregistre ? `<span class="puce genre-vote">${tr('vote enregistré', 'recorded vote')}</span>` : ''}
    </div>
    <p class="objet">${echapper(objetDe(d) ?? tr('(sans objet)', '(no subject)'))}</p>`;
  // Longueuil : le numéro de sommaire (« SD-2026-0984 ») suit le dossier du conseil de ville au
  // conseil d'agglomération. Le sommaire n'est pas un fichier à part : il est dans le document de
  // séance, à la page que donne le résumé. Les dissidences sont les noms consignés contre, sans
  // appel nominal. Faits bruts.
  const trouve = resumePour(d);
  const page = trouve?.r?.page;
  const corps = `${blocContexte(d)}${blocResume(trouve)}
    ${d.dissidences?.length ? `<p class="compte" style="margin:0 0 8px">${tr(`Dissidence${d.dissidences.length > 1 ? 's' : ''}&nbsp;:`, `${s(d.dissidences.length, 'Dissent', 'Dissents')}:`)} ${d.dissidences.map(echapper).join(', ')}.</p>` : ''}
    ${d.modifieePar?.length ? `<p class="compte" style="margin:0 0 8px">${tr('Modifiée par la résolution', 'Amended by resolution')} ${d.modifieePar.map(echapper).join(', ')}.</p>` : ''}
    <div class="texte-decision" data-id="${echapper(d.id)}"></div>
    ${d.dossier && !trouve ? `<p class="compte" style="margin:0 0 8px">${tr('Sommaire décisionnel', 'Decision summary')} ${echapper(d.dossier)} — ${tr('pas encore résumé', 'not summarized yet')}.</p>` : ''}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${d.type === 'Résolution' ? tr('Procès-verbal officiel (PDF)', 'Official minutes (PDF, in French)') : tr('Document officiel (PDF)', 'Official document (PDF, in French)')} ↗</a>` : ''}
    ${d.sommairePdf ? ` &nbsp;<a class="lien-pdf" href="${echapper(d.sommairePdf)}" target="_blank" rel="noopener">${tr('Sommaire, dans le document de séance', 'Summary, in the meeting document')}${page ? ` (page ${page})` : ''} ↗</a>` : ''}
    ${actionsFiche(d)}`;
  // Espace abonnés (/commun/abonnes.js) : « Suivre ce dossier » et le détail de l'argent. La clé
  // de dossier suit la décision d'une instance à l'autre.
  // Longueuil : un procès-verbal ou un document de séance n'est pas un dossier : rien à suivre.
  if (d.type !== 'Résolution') return carteRepliable(entete, corps, ouverte);
  const abonnes = `<div class="ab-fiche" data-dossier="${echapper(d.dossier ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}"${trouve?.r?.montantPrincipal ? ' data-montant="1"' : ''}></div>`;
  return carteRepliable(entete, corps + abonnes, ouverte);
}

// Le total honnête : les résolutions seules. `nombre` compte aussi les fiches de
// documents (procès-verbaux, documents de séance), qui ne sont pas des décisions.
function totalDecisions() {
  const f = (etat.decisions.facettes?.type ?? []).find((t) => t.valeur === 'Résolution');
  return f ? f.n : etat.decisions.decisions.filter((d) => d.type === 'Résolution').length;
}

function decisionsFiltrees() {
  const q = $('#rech-decisions').value.trim().toLowerCase();
  const type = $('#filtre-type').value;
  const instance = $('#filtre-instance').value;
  const theme = $('#filtre-theme')?.value ?? '';
  const avecResume = $('#filtre-resume')?.checked ?? false;
  const avecVote = $('#filtre-vote')?.checked;
  return etat.decisions.decisions.filter((d) => {
    if (etat.projet && !d.projets?.includes(etat.projet)) return false;
    if (type && d.type !== type) return false;
    if (instance && d.instance !== instance) return false;
    if (theme && d.theme !== theme) return false;
    if (avecResume && !resumePour(d)) return false;
    if (avecVote && !etat['votes-decisions']?.v?.[d.numero]) return false;
    // L'identifiant du document entre aussi dans la recherche : un procès-verbal n'a pas de numéro,
    // et c'est par son identifiant que le courriel ouvre sa fiche (?q=…).
    if (q && !((d.objet ?? '') + ' ' + (d.numero ?? '') + ' ' + (d.id ?? '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function rendreDecisions() {
  const { facettes, parametres } = etat.decisions;
  if (!$('#filtre-type').dataset.rempli) {
    remplirSelect($('#filtre-type'), facettes.type.map((f) => ({ ...f, libelle: lib(f.valeur) })));
    remplirSelect($('#filtre-instance'), facettes.instance.slice(0, 25).map((f) => ({ ...f, libelle: lib(f.valeur) })));
    // La case « Avec résumé seulement » n'a de sens que s'il y a des résumés.
    const caseResume = document.getElementById('case-resume');
    if (caseResume) caseResume.hidden = !etat.parId.size;

    if ($('#filtre-theme')) {
      // On affiche le libellé lisible, pas la clé interne.
      remplirSelect(
        $('#filtre-theme'),
        (facettes.theme ?? []).map(({ valeur, n }) => ({ valeur, n, libelle: EN ? themeEn(valeur, etat.decisions.themes?.[valeur]?.libelle) : etat.decisions.themes?.[valeur]?.libelle }))
      );
    }
    $('#filtre-type').dataset.rempli = '1';
  }
  const filtrees = decisionsFiltrees();
  const parSeance = $('#affichage')?.value !== 'liste';

  // Une décision, c'est une RÉSOLUTION : les procès-verbaux et documents de séance ont leur fiche,
  // mais ne gonflent pas le total.
  const nDecisions = filtrees.reduce((n, d) => n + (d.type === 'Résolution' ? 1 : 0), 0);
  const total = totalDecisions();
  const filtre = nDecisions !== total
    ? tr(`${nombreFr(nDecisions)} décision(s) affichée(s) sur ${nombreFr(total)}`, `${nombreFr(nDecisions)} decision(s) shown of ${nombreFr(total)}`)
    : tr(`${nombreFr(total)} décisions de ${parametres.annee}`, `${nombreFr(total)} decisions from ${parametres.annee}`);
  const seancesTexte = etat.decisions.seancesLues != null
    ? tr(
        `, ${etat.decisions.seancesLues} séances lues${etat.decisions.seancesEnAttente ? `, ${etat.decisions.seancesEnAttente} en attente de procès-verbal` : ''}`,
        `, ${etat.decisions.seancesLues} meetings read${etat.decisions.seancesEnAttente ? `, ${etat.decisions.seancesEnAttente} awaiting minutes` : ''}`
      )
    : '';
  const resumesTexte = etat.parId.size
    ? tr(` ${nombreFr(nombreResumees(etat.decisions.decisions))} ont un résumé.`, ` ${nombreFr(nombreResumees(etat.decisions.decisions))} have a summary.`)
    : '';
  $('#compte-decisions').textContent = `${filtre}${seancesTexte}.${resumesTexte}`;

  let reste;
  if (parSeance) {
    // En mode séance on pagine par SÉANCES, jamais par fiches : sinon la dernière séance
    // affichée serait coupée en plein milieu et son décompte mentirait.
    const groupes = grouperParSeance(filtrees);
    const montres = groupes.slice(0, etat.limiteSeances);
    $('#liste-decisions').innerHTML = montres.length
      ? montres.map((g, i) => rendreSeance(g, i === 0)).join('')
      : `<p class="vide">${tr('Aucune décision ne correspond.', 'No decisions match.')}</p>`;
    reste = groupes.length - montres.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = tr(`Afficher plus (${nombreFr(reste)} séance${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''})`, `Show more (${nombreFr(reste)} ${s(reste, 'meeting', 'meetings')} left)`);
  } else {
    const visibles = filtrees.slice(0, etat.limiteDecisions);
    $('#liste-decisions').innerHTML = visibles.map(carteDecision).join('');
    reste = filtrees.length - visibles.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = tr(`Afficher plus (${nombreFr(reste)} restantes)`, `Show more (${nombreFr(reste)} left)`);
  }
  if ($('#filtre-vote')?.checked) $('#liste-decisions').insertAdjacentHTML('beforeend', votesHorsAnnee());
  brancherTextes($('#liste-decisions'));
  reinitialiserDepliage();
}

// Une séance, c'est une date et une instance : « le conseil de la ville du 7 juillet ».
// C'est l'unité dans laquelle la Ville travaille et dans laquelle les gens pensent — bien
// plus qu'une liste continue de 2 000 décisions.
//
// Les sommaires décisionnels n'ont pas d'instance (la Ville ne la publie pas sur ce type
// de document) : ils sont regroupés à part sous leur date, plutôt que d'être rattachés
// d'autorité à une séance à laquelle rien ne dit qu'ils appartiennent.
const SANS_INSTANCE = 'Autres documents';

function grouperParSeance(decisions) {
  // La date la plus ancienne du jeu chargé est presque toujours coupée : on ne rapatrie
  // que les N documents les plus récents, donc cette journée-là est tronquée en plein
  // milieu. On le signale au lieu d'afficher un décompte trompeur.
  const dates = etat.decisions.decisions.map((d) => d.date).filter(Boolean);
  const plusAncienne = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;

  const groupes = new Map();
  for (const d of decisions) {
    const cle = `${d.date ?? '0000-00-00'}__${d.instance ?? SANS_INSTANCE}`;
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        date: d.date,
        instance: d.instance ?? SANS_INSTANCE,
        tronquee: Boolean(d.date) && d.date === plusAncienne,
        lignes: [],
      });
    }
    groupes.get(cle).lignes.push(d);
  }

  return [...groupes.values()].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.instance.localeCompare(b.instance)
  );
}

// La séance est elle-même repliable : au chargement on ne voit que les en-têtes, ce qui
// donne l'agenda de la Ville d'un coup d'œil. On ouvre la séance qui nous intéresse, puis
// la décision qui nous intéresse dedans. Deux niveaux, deux clics.
//
// Pas d'accordéon ici, contrairement aux fiches : on veut pouvoir comparer deux séances
// côte à côte, alors qu'empiler quinze décisions dépliées n'aide personne.
//
// 9 nov. 2026 (Martin) : la première séance est ouverte au chargement ; dans chaque séance, les
// décisions qui ont un résumé IA passent en tête, et la première s'ouvre avec sa séance. Les points
// de procédure sans résumé (ouverture, dépôts, adoption de l'ordre du jour…) descendent en bas de
// la séance, repliés sous « Procédure ».
function rendreSeance(g, ouverte = false) {
  // Longueuil : aResume, qui retombe sur les vraies décisions quand la Ville n'a aucun résumé.
  const estProcedure = (d) => !aResume(d);
  const procedure = g.lignes.filter(estProcedure);
  const autres = g.lignes.filter((d) => !estProcedure(d));
  // Les points de procédure, même résumés, passent sous les vraies décisions (Martin, 9 nov. 2026).
  const lignes = [...autres.filter((d) => d.theme !== 'procedure'), ...autres.filter((d) => d.theme === 'procedure')];
  const carte = (d, i) => carteDecision(d, ouverte && i === 0 && Boolean(resumePour(d)));
  const blocProcedure = procedure.length
    ? `<details class="seance-procedure"><summary>${tr(
        `${etat.parId.size ? 'Sans résumé' : 'Procédure et documents de séance'} (${procedure.length} point${procedure.length > 1 ? 's' : ''})`,
        `No summary (${procedure.length} item${procedure.length > 1 ? 's' : ''})`
      )}</summary>${procedure.map((d) => carteDecision(d)).join('')}</details>`
    : '';
  return `<details class="seance"${ouverte ? ' open' : ''}>
      <summary class="seance-entete">
        <h3>${echapper(g.instance === SANS_INSTANCE ? tr(SANS_INSTANCE, 'Other documents') : lib(g.instance))}</h3>
        <span class="seance-date">${dateFr(g.date)}</span>
        <span class="puce">${g.lignes.length} ${tr(s(g.lignes.length, 'décision', 'décisions'), s(g.lignes.length, 'decision', 'decisions'))}</span>
        ${g.tronquee ? `<span class="puce procedural">${tr('journée partiellement chargée', 'day partly loaded')}</span>` : ''}
        ${boutonImprimer(tr('Imprimer cette séance, toutes ses décisions dépliées', 'Print this meeting, with all its decisions expanded'))}
        <button type="button" class="bouton-tout-ouvrir">${tr('Tout ouvrir', 'Expand all')}</button>
      </summary>
      <div class="seance-corps">${lignes.map(carte).join('')}${blocProcedure}</div>
    </details>`;
}

// ---------- votes ----------
function classeResultat(r) {
  if (!r) return '';
  if (r.includes('unanimité')) return 'r-unanimite';
  if (r.includes('majorité')) return 'r-majorite';
  if (r.includes('division')) return 'r-division';
  if (r.includes('Rejet')) return 'r-rejetee';
  return '';
}

function carteVote(v) {
  const noms = (liste) =>
    liste.length
      ? `<div class="noms">${liste.map((n) => `<span class="nom">${echapper(n)}</span>`).join('')}</div>`
      : `<p class="vide">${tr('Aucun nom extrait.', 'No names extracted.')}</p>`;

  // Le décompte est l'information la plus utile de l'en-tête : elle mérite sa couleur,
  // séparée en deux jetons plutôt qu'une pastille grise où tout se vaut.
  const pour = v.decomptePour ?? v.pour.length;
  const contre = v.decompteContre ?? v.contre.length;

  const entete = `<div class="meta">
      ${puceTheme(v.theme)}
      ${v.numero ? `<span class="puce num">${echapper(v.numero)}</span>` : ''}
      <span>${dateFr(v.date)}</span>
      ${v.instance ? `<span class="puce">${echapper(lib(v.instance))}</span>` : ''}
      ${v.resultat ? `<span class="resultat ${classeResultat(v.resultat)}">${echapper(lib(v.resultat))}</span>` : ''}
      <span class="decompte"><span class="d-pour">${pour} ${tr('pour', 'for')}</span><span class="d-contre">${contre} ${tr('contre', 'against')}</span></span>
    </div>
    <p class="objet">${echapper(v.objet ?? tr('(sans objet)', '(no subject)'))}</p>`;

  // Longueuil : ce sur quoi porte le vote ; au conseil d'agglomération, l'absence de décompte imprimé.
  const corps = `${v.etiquette ? `<p class="compte" style="margin:0 0 8px">${tr('Vote sur', 'Vote on')} ${echapper(v.etiquette.charAt(0).toLowerCase() + v.etiquette.slice(1))}.</p>` : ''}
    ${v.decomptePour == null && /agglom/i.test(v.instance ?? '') ? `<p class="compte" style="margin:0 0 8px">${tr("Au conseil d'agglomération, les voix sont pondérées selon la population&nbsp;: le procès-verbal ne donne pas de décompte.", 'At the agglomeration council, votes are weighted by population: the minutes give no count.')}</p>` : ''}
    <div class="colonnes-vote">
      <div class="colonne-vote pour">
        <h4>${tr('Pour', 'For')}${v.decomptePour != null ? ` — ${v.decomptePour}` : ''}</h4>
        ${noms(v.pour)}
      </div>
      <div class="colonne-vote contre">
        <h4>${tr('Contre', 'Against')}${v.decompteContre != null ? ` — ${v.decompteContre}` : ''}</h4>
        ${noms(v.contre)}
      </div>
    </div>
    ${v.abstention ? `<p class="compte" style="margin:10px 0 0">${tr('Abstention&nbsp;:', 'Abstention:')} ${echapper(v.abstention)}.</p>` : ''}
    ${v.demandeParVote ? `<p class="compte" style="margin:2px 0 0">${tr('Vote demandé par', 'Vote requested by')} ${echapper(v.demandeParVote)}.</p>` : ''}
    ${v.avertissements.length ? `<div class="drapeau"><strong>${tr('À vérifier&nbsp;:', 'To check:')}</strong> ${v.avertissements.map(echapper).join(' · ')}</div>` : ''}
    <details><summary>${tr("Voir le passage d'origine", 'See the original passage (in French)')}</summary><p>${echapper(v.brut)}</p></details>
    ${v.pdf ? `<p style="margin:9px 0 0"><a class="lien-pdf" href="${echapper(v.pdf)}" target="_blank" rel="noopener">${tr('Procès-verbal officiel (PDF)', 'Official minutes (PDF, in French)')} ↗</a></p>` : ''}`;

  return carteRepliable(entete, corps);
}

// Volet : un vote de data/votes.json, en bloc sur la fiche de sa décision (il dit sur quoi porte le vote
// et en garde chacun quand un numéro en porte plusieurs). Même gabarit que le bloc de votes-decisions.json.
function blocVoteDetail(v) {
  return `<div class="bloc-vote">
    <div class="resume-entete">${tr('Vote nominatif', 'Recorded vote')}${v.etiquette ? ` · ${echapper(v.etiquette)}` : ''} · ${echapper(v.resultat ?? '')} · ${v.decomptePour ?? v.pour.length} ${tr('pour', 'for')}, ${v.decompteContre ?? v.contre.length} ${tr('contre', 'against')}</div>
    <p style="margin:0 0 4px"><strong>${tr('Pour', 'For')}</strong> : ${v.pour.map(echapper).join(', ') || '—'}</p>
    <p style="margin:0 0 4px"><strong>${tr('Contre', 'Against')}</strong> : ${v.contre.map(echapper).join(', ') || '—'}</p>
    ${v.demandeParVote ? `<p class="compte" style="margin:0">${tr('Vote demandé par', 'Vote called by')} ${echapper(v.demandeParVote)}.</p>` : ''}
    ${v.pdf ? `<p class="compte" style="margin:2px 0 0"><a href="${echapper(v.pdf)}" target="_blank" rel="noopener">${tr('Procès-verbal officiel (PDF) ↗', 'Official minutes (PDF, in French) ↗')}</a></p>` : ''}
  </div>`;
}

// Volet : les votes nominatifs dont la décision n'est pas dans l'année chargée (Longueuil : aucun vote
// divisé en 2026, ceux de 2025 restent consultables). Montrés sous la liste quand on filtre les votes.
function votesHorsAnnee() {
  if (!etat.votes?.votes?.length || !etat.decisions) return '';
  const numeros = new Set(etat.decisions.decisions.map((d) => d.numero).filter(Boolean));
  const hors = etat.votes.votes.filter((v) => !v.numero || !numeros.has(v.numero));
  if (!hors.length) return '';
  return `<h2 class="section" id="votes-hors-annee">${tr(
    `Votes nominatifs d'avant ${etat.decisions.parametres.annee} (${hors.length})`,
    `Recorded votes before ${etat.decisions.parametres.annee} (${hors.length})`
  )}</h2>${hors.map(carteVote).join('')}`;
}

function votesFiltres() {
  const q = $('#rech-votes').value.trim().toLowerCase();
  const instance = $('#filtre-instance-votes').value;
  const theme = $('#filtre-theme-votes')?.value ?? '';
  return etat.votes.votes.filter((v) => {
    if (instance && v.instance !== instance) return false;
    if (theme && v.theme !== theme) return false;
    if (!q) return true;
    return [v.objet ?? '', v.numero ?? '', ...v.pour, ...v.contre].join(' ').toLowerCase().includes(q);
  });
}

// Décompte brut des votes contre, par personne. Aucune interprétation.
function tableauVotesContre(votes) {
  const parPersonne = new Map();
  for (const v of votes) {
    for (const nom of v.contre) {
      if (!parPersonne.has(nom)) parPersonne.set(nom, { n: 0, instances: new Map() });
      const fiche = parPersonne.get(nom);
      fiche.n++;
      if (v.instance) fiche.instances.set(v.instance, (fiche.instances.get(v.instance) ?? 0) + 1);
    }
  }
  return [...parPersonne.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([nom, fiche]) => {
      const principale = [...fiche.instances.entries()].sort((a, b) => b[1] - a[1])[0];
      return `<tr><td>${echapper(nom)}</td><td>${echapper(principale ? principale[0] : '—')}</td><td class="n">${fiche.n}</td></tr>`;
    })
    .join('');
}

// Le tableau des votes contre : sur la page Conseil depuis la fusion des pages Votes et Décisions
// (12 nov. 2026).
function rendreDissidence(votes) {
  if ($('#table-dissidence')) {
    $('#table-dissidence tbody').innerHTML = tableauVotesContre(votes);
    // Le tableau est replié : son résumé doit donc porter assez d'information pour qu'on
    // sache s'il vaut la peine de l'ouvrir — le nombre de personnes et les trois premières.
    if ($('#resume-dissidence')) {
      const compte = new Map();
      for (const v of votes) for (const n of v.contre) compte.set(n, (compte.get(n) ?? 0) + 1);
      const tri = [...compte.entries()].sort((a, b) => b[1] - a[1]);
      const tete = tri.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(', ');
      $('#resume-dissidence').textContent = EN
        ? `${tri.length} ${s(tri.length, 'person', 'people')}` + (tete ? `. Most: ${tete}` : '')
        : `${tri.length} personne${tri.length > 1 ? 's' : ''}` + (tete ? `. En tête : ${tete}` : '');
    }
  }

}

function rendreVotes() {
  const votes = etat.votes.votes;
  rendreDissidence(votes);

  if (!$('#filtre-instance-votes').dataset.rempli) {
    const compte = new Map();
    for (const v of votes) if (v.instance) compte.set(v.instance, (compte.get(v.instance) ?? 0) + 1);
    remplirSelect(
      $('#filtre-instance-votes'),
      [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, n]) => ({ valeur, n }))
    );
    if ($('#filtre-theme-votes')) {
      const parTheme = new Map();
      for (const v of votes) if (v.theme) parTheme.set(v.theme, (parTheme.get(v.theme) ?? 0) + 1);
      remplirSelect(
        $('#filtre-theme-votes'),
        [...parTheme.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([valeur, n]) => ({ valeur, n, libelle: etat.votes.themes?.[valeur]?.libelle }))
      );
    }
    $('#filtre-instance-votes').dataset.rempli = '1';
  }

  const filtres = votesFiltres();
  const visibles = filtres.slice(0, etat.limiteVotes);
  $('#compte-votes').textContent = EN
    ? `${filtres.length} recorded vote(s) shown of ${etat.votes.nombre} in ${etat.votes.parametres.annee}. ` +
      `${etat.votes.avecAvertissement} carry an extraction warning.`
    : `${filtres.length} vote(s) enregistré(s) affiché(s) sur ${etat.votes.nombre} en ${etat.votes.parametres.annee}. ` +
      `${etat.votes.avecAvertissement} portent un avertissement d'extraction.`;
  $('#liste-votes').innerHTML = visibles.map(carteVote).join('');
  const reste = filtres.length - visibles.length;
  $('#plus-votes').hidden = reste <= 0;
  $('#plus-votes').textContent = tr(`${Math.min(PAS_VOTES, reste)} de plus (${reste} restants)`, `${Math.min(PAS_VOTES, reste)} more (${reste} left)`);
  reinitialiserDepliage();
}

// ---------- élus ----------
// Longueuil numérote ses districts (1 à 18) : la carte et les fiches se rejoignent par ce numéro.
function numeroDistrict(m) {
  return m.districtNumero ?? null;
}

// Les procès-verbaux de Longueuil nomment les votants en toutes lettres (« Lysa Bélaïcha ») ; la
// page des élus écrit parfois sans accents (« Lysa BELAICHA »). On compare sans accents ni casse.
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function votesContreDe(m) {
  if (!etat.votes || !m.nomComplet) return null;
  const nom = sansAccents(m.nomComplet);
  return etat.votes.votes.filter((v) => v.contre.some((n) => sansAccents(n) === nom)).length;
}

function carteElu(m) {
  const roles = m.roles.filter(Boolean);
  const votesContre = votesContreDe(m);
  const numero = numeroDistrict(m);
  const arr = instanceArrondissement(m.arrondissement);
  // « District de Georges-Dor », ou la fonction pour la mairesse.
  const sousTitre = m.district ? `District ${m.districtNumero ? m.districtNumero + ' — ' : ''}${m.district}` : m.fonction ?? '';

  return `<article class="carte elu${m.siegeAuConseilMunicipal === false ? ' arrondissement-seulement' : ''}"${numero ? ` id="elu-${numero}"` : ''}>
    ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${echapper(sousTitre)}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${m.siegeAuConseilMunicipal === false ? '<span class="puce procedural">conseil d\'arrondissement seulement</span>' : ''}
        ${roles.map((r) => `<span class="puce">${echapper(r)}</span>`).join('')}
      </div>
      ${votesContre ? `<p class="compte" style="margin:6px 0 0">${votesContre} vote(s) contre consigné(s) depuis ${echapper(etat.votes.parametres.annees?.[0] ?? etat.votes.parametres.annee)}.</p>` : ''}
      <p style="margin:4px 0 0; font-size:13px">
        ${[
          m.courriel ? `<a href="mailto:${echapper(m.courriel)}">Écrire</a>` : '',
          m.biographie ? `<a href="${echapper(m.biographie)}" target="_blank" rel="noopener">Sa fiche sur le site de la Ville</a>` : '',
          arr ? `<a href="decisions-de-la-ville-de-longueuil?instance=${encodeURIComponent(arr.instance)}">${arr.n} décisions de l'arrondissement</a>` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  </article>`;
}

function rendreElus() {
  const membres = etat.elus.membres;
  const partis = Object.entries(etat.elus.partis).sort((a, b) => b[1] - a[1]);
  const total = etat.elus.nombreTotal && etat.elus.nombreTotal !== etat.elus.nombre ? ` (${etat.elus.nombreTotal} avec les conseillers d'arrondissement de Greenfield Park)` : '';
  const vacants = etat.elus.postesVacants ?? [];
  $('#compte-elus').textContent =
    `${etat.elus.nombre} membres du conseil de ville${total}` +
    (partis.length ? ' — conseillers : ' + partis.map(([p, n]) => `${p} ${n}`).join(' · ') : '') +
    (vacants.length ? ` — ${vacants.length} poste${vacants.length > 1 ? 's' : ''} vacant${vacants.length > 1 ? 's' : ''}` : '') + '.';

  // La mairesse d'abord, puis les trois arrondissements dans l'ordre de la Ville ; dans chacun,
  // les conseillers de ville par numéro de district, puis ceux d'arrondissement.
  const ORDRE = ['Vieux-Longueuil', 'Saint-Hubert', 'Greenfield Park'];
  const groupes = new Map([['Mairie', []], ...ORDRE.map((a) => [a, []])]);
  for (const m of membres) {
    const cle = m.fonction === 'Mairesse' || !m.arrondissement ? 'Mairie' : m.arrondissement;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(m);
  }
  for (const v of vacants) {
    if (!groupes.has(v.arrondissement)) groupes.set(v.arrondissement, []);
    const numero = etat.districts?.districts.find((d) => d.nom === v.district)?.numero ?? null;
    groupes.get(v.arrondissement).push({ vacant: true, district: v.district, districtNumero: numero });
  }
  const rang = (m) => (m.siegeAuConseilMunicipal === false ? 1000 : m.districtNumero ?? 999);
  $('#liste-elus').innerHTML = [...groupes.entries()]
    .filter(([, gens]) => gens.length)
    .map(([titre, gens]) => `<h2 class="section">${titre === 'Mairie' ? 'Mairie' : `Arrondissement ${/^Vieux/.test(titre) ? 'du' : 'de'} ${echapper(titre)}`}</h2><div class="grille-elus">${gens.sort((a, b) => rang(a) - rang(b)).map((m) => (m.vacant ? carteVacant(m) : carteElu(m))).join('')}</div>`)
    .join('');
}

// Un siège sans titulaire reste sur la carte et dans la liste : c'est aussi une information.
function carteVacant(v) {
  return `<article class="carte elu"${v.districtNumero ? ` id="elu-${v.districtNumero}"` : ''}>
    <div>
      <h3>Poste vacant</h3>
      <p class="district">District ${v.districtNumero ? v.districtNumero + ' — ' : ''}${echapper(v.district)}</p>
      <p class="compte" style="margin:6px 0 0">Le siège sera pourvu par une élection partielle.</p>
    </div>
  </article>`;
}

// Le conseil d'agglomération : une instance distincte, avec les maires des villes liées. On
// l'affiche sur la même page que le conseil de ville — les gens concernés sont en partie les
// mêmes — mais dans sa propre section, parce que ce ne sont pas les mêmes sièges. La Ville ne
// publie pas de liste : elle est reconstituée depuis les procès-verbaux, et la fiche le dit.
function carteMembreAgglo(m) {
  const deLongueuil = (m.ville ?? '') === 'Longueuil';
  const remplacements = (etat.agglomeration.remplacants ?? []).filter((r) => r.remplace.includes(m.nom));
  return `<article class="carte elu">
    <div>
      <h3>${echapper(m.nom)}</h3>
      <p class="district">${echapper(m.fonctionTelleQuelle ?? m.fonction ?? '')}</p>
      <div class="meta">
        ${m.ville ? `<span class="puce ${deLongueuil ? '' : 'reconstituee'}">${echapper(m.ville)}</span>` : ''}
      </div>
      ${m.seances ? `<p class="compte" style="margin:6px 0 0">Présence consignée à ${m.presences} séance(s) sur ${m.seances} en ${echapper(etat.agglomeration.parametres.annee)}.</p>` : ''}
      ${remplacements.length ? `<p class="compte" style="margin:2px 0 0">Remplacement consigné&nbsp;: ${remplacements.map((r) => `${echapper(r.nom)} (${r.remplacements} séance${r.remplacements > 1 ? 's' : ''})`).join(', ')}.</p>` : ''}
    </div>
  </article>`;
}

function rendreAgglomeration() {
  if (!$('#liste-agglo') || !etat.agglomeration) return;
  const a = etat.agglomeration;
  const villes = Object.entries(a.villes ?? {}).sort((x, y) => y[1] - x[1]);
  $('#compte-agglo').textContent = `${a.nombre} membres à la dernière séance — ` + villes.map(([v, n]) => `${v} : ${n}`).join(' · ');

  // Les villes liées d'abord : ce sont elles qu'on ne trouve nulle part ailleurs sur le site.
  const membres = [...a.membres].sort((x, y) => {
    const xm = (x.ville ?? '') === 'Longueuil' ? 1 : 0;
    const ym = (y.ville ?? '') === 'Longueuil' ? 1 : 0;
    return xm - ym || (x.ville ?? '').localeCompare(y.ville ?? '') || x.nom.localeCompare(y.nom);
  });
  $('#liste-agglo').innerHTML = `<div class="grille-elus">${membres.map(carteMembreAgglo).join('')}</div>`;
}

// ---------- carte des districts ----------
// Projection Web Mercator, calculée ici : 18 polygones en SVG, aucune librairie et aucun
// serveur de tuiles à appeler. La page reste autonome et ne fuit rien vers l'extérieur.
function projeter([lon, lat]) {
  const x = (lon * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
  return [x, y];
}

// Teintes franches, cernées de noir par la feuille de style : la carte doit tenir le
// même langage que le reste. Trois arrondissements, trois teintes. Pas de coloriage par parti :
// un seul parti occupe tous les sièges depuis novembre 2025, la carte serait d'une couleur.
const PALETTE_ARRONDISSEMENT = { 'Vieux-Longueuil': '#0E4FC1', 'Saint-Hubert': '#1E6A3C', 'Greenfield Park': '#D97706' };

function couleurs() {
  return { cle: (d) => d.arrondissement, table: new Map(Object.entries(PALETTE_ARRONDISSEMENT)) };
}

function rendreCarte() {
  const { districts, cadre } = etat.districts;
  const { cle, table } = couleurs();

  // Cadre projeté, puis mise à l'échelle dans un viewBox de largeur fixe.
  const [x0, y1] = projeter([cadre.ouest, cadre.nord]);
  const [x1, y0] = projeter([cadre.est, cadre.sud]);
  const LARGEUR = 1000;
  const hauteur = Math.round((LARGEUR * (y1 - y0)) / (x1 - x0));
  const enSvg = ([lon, lat]) => {
    const [x, y] = projeter([lon, lat]);
    return [((x - x0) / (x1 - x0)) * LARGEUR, ((y1 - y) / (y1 - y0)) * hauteur];
  };
  const chemin = (anneaux) =>
    anneaux
      .map((anneau) => 'M' + anneau.map((pt) => enSvg(pt).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z')
      .join(' ');

  $('#carte').innerHTML =
    `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="Carte des ${districts.length} districts électoraux de la Ville de Longueuil">` +
    districts
      .map(
        (d) =>
          `<path d="${chemin(d.anneaux)}" class="district" data-numero="${d.numero}" ` +
          `fill="${table.get(cle(d)) ?? '#999'}" tabindex="0" role="button" ` +
          `aria-label="District ${d.numero} — ${echapper(d.nom ?? '')}"><title>${echapper(d.nom ?? '')} (${d.numero}) — ${echapper(d.conseiller ?? '')}</title></path>`
      )
      .join('') +
    '</svg>';

  $('#legende').innerHTML = [...table.entries()]
    .map(([valeur, couleur]) => `<span class="cle-legende"><i style="background:${couleur}"></i>${echapper(valeur)}</span>`)
    .join('');
}

// Un clic sur la carte mène à la fiche de la personne, plus bas dans la page. Une seule
// source d'information par élu, pas un panneau qui répéterait la même chose à côté.
function choisirDistrict(numero) {
  for (const chemin of document.querySelectorAll('.zone-carte .district')) {
    chemin.classList.toggle('choisi', Number(chemin.dataset.numero) === numero);
  }
  const fiche = document.getElementById('elu-' + numero);
  if (!fiche) return;
  for (const autre of document.querySelectorAll('.elu.choisi')) autre.classList.remove('choisi');
  fiche.classList.add('choisi');
  fiche.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Le conseil d'arrondissement correspondant, parmi les décisions chargées.
function instanceArrondissement(arrondissement) {
  if (!etat.decisions || !arrondissement) return null;
  const suffixe = arrondissement.replace(/^Arrondissement (de |des |du |d')?/i, '').trim();
  const trouve = etat.decisions.facettes.instance.find(
    (f) => /arrondissement/i.test(f.valeur) && f.valeur.toLowerCase().includes(suffixe.toLowerCase().slice(0, 8))
  );
  return trouve ? { instance: trouve.valeur, n: trouve.n } : null;
}

// ---------- lexique ----------
// Les définitions viennent de nous ; les décomptes et les exemples viennent des documents
// de la Ville. La page distingue visuellement les deux — c'est tout l'intérêt de l'exercice.
// Le plus simple possible : le mot, ce qu'il veut dire, et où on le croise. Rien d'autre.
// Les décomptes mesurés sur le corpus restent dans data/lexique.json — ils servent à
// vérifier que les formulations cherchées collent encore aux documents — mais les
// afficher répondait à une question que le lecteur ne se pose pas.
function entreeLexique(e) {
  // En anglais : le terme reste en français (c'est lui qu'on croise dans les documents), suivi de
  // son équivalent ; la définition est traduite (data/lexique-en.json).
  const en = EN ? etat.lexiqueEn?.entrees?.[e.terme] : null;
  return `<div class="entree-lexique">
      <h3 class="terme">${echapper(e.terme)}${en?.equivalent ? ` <span class="alias" lang="en">(${echapper(en.equivalent)})</span>` : ''}</h3>
      ${(en ? en.aussi : e.aussi) ? `<p class="alias">${tr('On dit aussi&nbsp;:', 'Also called:')} ${echapper(en ? en.aussi : e.aussi)}</p>` : ''}
      <p class="definition">${echapper(en?.definition ?? e.definition)}</p>
      ${(en?.ouVousLeVoyez ?? e.ouVousLeVoyez) ? `<p class="remarque">${echapper(en?.ouVousLeVoyez ?? e.ouVousLeVoyez)}</p>` : ''}
    </div>`;
}

function lexiqueFiltre() {
  const q = ($('#rech-lexique')?.value ?? '').trim().toLowerCase();
  return etat.lexique.entrees.filter((e) => {
    if (!q) return true;
    const en = etat.lexiqueEn?.entrees?.[e.terme];
    return [e.terme, e.aussi ?? '', e.definition, e.ouVousLeVoyez ?? '', en?.equivalent ?? '', en?.definition ?? '', en?.aussi ?? ''].join(' ').toLowerCase().includes(q);
  });
}

function rendreLexique() {
  const entrees = lexiqueFiltre();
  const categories = (EN && etat.lexiqueEn?.categories) || etat.lexique.categories || {};
  // Chaque catégorie est un menu dépliant, fermé à l'arrivée : on voit les six titres d'un
  // coup, on ouvre celui qu'on cherche. Une recherche en cours ouvre les catégories où
  // elle a trouvé quelque chose — sinon les résultats resteraient cachés.
  const recherche = ($('#rech-lexique')?.value ?? '').trim() !== '';
  $('#compte-lexique').textContent =
    entrees.length === etat.lexique.nombre
      ? tr(`${entrees.length} termes`, `${entrees.length} terms`)
      : tr(`${entrees.length} terme(s) sur ${etat.lexique.nombre}`, `${entrees.length} term(s) of ${etat.lexique.nombre}`);

  // Regroupés par catégorie, dans l'ordre déclaré côté données.
  const html = Object.entries(categories)
    .map(([cle, titre]) => {
      const dedans = entrees.filter((e) => e.categorie === cle);
      if (!dedans.length) return '';
      // La classe de catégorie porte la couleur : le titre, le filet et les termes en
      // héritent, sans qu'aucune teinte soit écrite dans le HTML.
      return (
        `<details class="lexique-cat cat-${echapper(cle)}"${recherche ? ' open' : ''}>` +
        `<summary><h2 class="section">${echapper(titre)}<span class="compte-cat">${dedans.length} ${tr(s(dedans.length, 'terme', 'termes'), s(dedans.length, 'term', 'terms'))}</span></h2></summary>` +
        `<div class="bloc-lexique">${dedans.map(entreeLexique).join('')}</div>` +
        `</details>`
      );
    })
    .join('');
  $('#liste-lexique').innerHTML = html || `<p class="vide">${tr('Aucun terme ne correspond.', 'No terms match.')}</p>`;
  reinitialiserDepliage();
}

// ---------- accueil : le fil de ce qui a changé ----------
// Les scrapers marquent `nouveau` sur ce qui n'était pas là à l'extraction précédente.
// Quand rien n'a bougé (ou à la toute première extraction, où il n'y a rien à comparer),
// on montre l'activité la plus récente en le disant clairement, plutôt qu'une page vide.
function evenementsRecents() {
  const evenements = [];
  for (const d of etat.decisions?.decisions ?? []) {
    // Martin, 9 nov. 2026 : le fil ne montre que les décisions qui ont un résumé IA.
    if (!aResume(d)) continue;   // aResume : la règle du résumé, avec le repli des villes sans résumés
    if (d.theme === 'procedure') continue;   // ni ordre du jour ni procès-verbal en vitrine, même résumés (9 nov. 2026)
    evenements.push({ date: d.date, genre: 'decision', nouveau: d.nouveau === true, data: d });
  }
  // Les votes nominatifs n'ont pas de résumé IA : ils restent sur leur page, hors du fil (9 nov. 2026).
  evenements.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const nouveaux = evenements.filter((e) => e.nouveau);
  return { evenements, nouveaux, mode: nouveaux.length ? 'nouveautes' : 'recents' };
}

function ligneEvenement(e) {
  if (e.genre === 'vote') {
    const v = e.data;
    const entete = `<div class="meta">
        <span class="puce genre-vote">${tr('vote nominatif', 'recorded vote')}</span>
        ${v.numero ? `<span class="puce num">${echapper(v.numero)}</span>` : ''}
        <span>${dateFr(v.date)}</span>
        ${v.instance ? `<span class="puce">${echapper(lib(v.instance))}</span>` : ''}
        ${v.resultat ? `<span class="resultat ${classeResultat(v.resultat)}">${echapper(lib(v.resultat))}</span>` : ''}
        
      </div>
      <p class="objet">${echapper(v.objet ?? tr('(sans objet)', '(no subject)'))}</p>`;
    const corps = `<p class="compte" style="margin:0">
        ${v.decomptePour ?? v.pour.length} ${tr('pour', 'for')}, ${v.decompteContre ?? v.contre.length} ${tr('contre', 'against')}${
          v.contre.length ? ' — ' + v.contre.map(echapper).join(', ') : ''
        }. <a href="${VILLE.pages.decisions}?q=${encodeURIComponent(v.numero ?? '')}">${tr('Voir le détail', 'See details')}</a>
      </p>`;
    return lienFil(entete);
  }

  const d = e.data;
  const entete = `<div class="meta">
      <span class="puce genre-decision">${tr('décision', 'decision')}</span>
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${e.nouveau && resumePour(d)?.r?.puces?.length && !resumePour(d).r.sansContenuSubstantiel ? `<span class="puce neuf">${tr('nouveau', 'new')}</span>` : ''}
    </div>
    <p class="objet">${echapper(objetDe(d) ?? tr('(sans objet)', '(no subject)'))}</p>`;
  const corps = `${blocResume(resumePour(d))}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${tr('Document officiel (PDF) ↗', 'Official document (PDF, in French) ↗')}</a>` : ''}
    ${actionsFiche(d)}`;
  return lienFil(entete);
}

// 19 nov. 2026 (Martin) : sur l'accueil, « Ce qui a changé » montre des cartes fermées ; un clic
// mène en haut de la page Décisions, sans filtrer.
function lienFil(entete) {
  return `<a class="carte pliante fil-lien" href="${VILLE.pages.decisions}">${entete}</a>`;
}

function rendreFil() {
  if (!$('#fil')) return;
  const { evenements, nouveaux, mode } = evenementsRecents();
  const source = mode === 'nouveautes' ? nouveaux : evenements;
  const aMontrer = source.slice(0, etat.limiteFil);

  // Le titre suffit à dire ce qu'on regarde. Le détail de l'extraction (date, nombre de
  // nouveautés) vit sur la page « Sources et limites », là où on va quand on se pose la
  // question — pas en travers du fil quand on veut juste lire.
  $('#titre-fil').textContent = mode === 'nouveautes' ? tr('Ce qui a changé', "What's new") : tr('Activité récente', 'Recent activity');
  // La première carte du fil est toujours ouverte : elle montre ce qu'est un résumé (9 nov. 2026).
  $('#fil').innerHTML = aMontrer.map(ligneEvenement).join('');

  // 9 nov. 2026 : 3 décisions, puis le bouton mène toujours à la page Décisions.
  if ($('#plus-fil')) {
    $('#plus-fil').hidden = false;
    $('#plus-fil').textContent = tr('Voir plus de décisions →', 'See more decisions →');
  }
}

// ---------- accueil ----------
function rendreAccueil() {
  const chiffres = [];
  if (etat.decisions) {
    // Les résolutions seules : les fiches de procès-verbaux et d'ordres du jour sont des
    // documents, pas des décisions (voir totalDecisions).
    chiffres.push({ n: nombreFr(totalDecisions()), quoi: tr(`décisions publiées en ${etat.decisions.parametres.annee}`, `decisions published in ${etat.decisions.parametres.annee}`), lien: VILLE.pages.decisions });
  }
  if (etat.votes) {
    // Les votes peuvent couvrir plus d'une année (Longueuil : 2025 et 2026) : la phrase le dit.
    const depuis = etat.votes.parametres?.annees?.length > 1 ? etat.votes.parametres.annees[0] : null;
    chiffres.push({ n: nombreFr(etat.votes.nombre), quoi: depuis ? tr(`votes nominatifs consignés depuis ${depuis}`, `recorded votes since ${depuis}`) : tr('votes nominatifs consignés cette année', 'recorded votes this year'), lien: `${VILLE.pages.decisions}?vote=1` });
  }
  if (etat.resumes) {
    // Décisions qui affichent un résumé (procédure exclue, 9 nov. 2026), pas le total brut du fichier.
    chiffres.push({ n: nombreFr(etat.decisions ? etat.decisions.decisions.filter((d) => resumePour(d)).length : etat.resumes.nombre), quoi: tr('décisions résumées en langage clair', 'decisions summarized in plain language'), lien: VILLE.pages.decisions });
  }
  if (etat.elus) {
    chiffres.push({ n: etat.elus.nombre, quoi: tr(VILLE.membres[0], VILLE.membres[1]), lien: VILLE.pages.conseil });
  }
  if ($('#chiffres')) {
    $('#chiffres').innerHTML = chiffres
      .map((c) => `<a class="chiffre" href="${c.lien}"><div class="n">${c.n}</div><div class="quoi">${echapper(c.quoi)}</div></a>`)
      .join('');
  }

  rendreFil();
}

// ---------- état des données ----------
function rendreEtat() {
  const lignes = [];
  const ajouter = (nom, data, extra) => {
    if (!data) {
      lignes.push(`<tr><td>${nom}</td><td colspan="2">${tr('non chargé', 'not loaded')}</td></tr>`);
      return;
    }
    lignes.push(`<tr><td>${nom}</td><td>${new Date(data.generatedAt).toLocaleString(EN ? 'en-CA' : 'fr-CA')}</td><td class="n">${extra}</td></tr>`);
  };
  ajouter(tr('Décisions', 'Decisions'), etat.decisions, etat.decisions ? `${etat.decisions.nombre} / ${etat.decisions.totalDisponible}` : '');
  ajouter(tr('Votes nominatifs', 'Recorded votes'), etat.votes, etat.votes ? `${etat.votes.nombre} / ${etat.votes.totalDisponible}` : '');
  ajouter(tr('Résumés en langage clair', 'Plain-language summaries'), etat.resumes, etat.resumes ? `${etat.resumes.nombre}` : '');
  ajouter(tr('Membres du conseil', 'Council members'), etat.elus, etat.elus ? `${etat.elus.nombre}` : '');
  ajouter(tr('Districts électoraux', 'Electoral districts'), etat.districts, etat.districts ? `${etat.districts.nombre}` : '');
  ajouter(tr("Conseil d'agglomération", 'Urban Agglomeration Council'), etat.agglomeration, etat.agglomeration ? `${etat.agglomeration.nombre}` : '');
  if (etat.decisions?.seances) {
    lignes.push(`<tr><td>${tr("Séances de l'année", 'Meetings this year')}</td><td>${etat.decisions.seancesLues ?? 0} ${tr('procès-verbaux lus', 'minutes read')}</td><td class="n">${etat.decisions.seancesEnAttente ?? 0} ${tr('en attente', 'awaiting')}</td></tr>`);
  }
  $('#etat-donnees').innerHTML =
    `<table><thead><tr><th>${tr('Jeu', 'Dataset')}</th><th>${tr('Dernière extraction', 'Last extraction')}</th><th class="n">${tr('Chargé / disponible', 'Loaded / available')}</th></tr></thead><tbody>${lignes.join('')}</tbody></table>` +
    (etat.resumes?.modele ? `<p class="compte">${tr('Modèle utilisé pour les résumés&nbsp;:', 'Model used for the summaries:')} <code>${echapper(etat.resumes.modele)}</code>.</p>` : '');

  // L'archive : le site ne la charge pas, il se contente d'annoncer ce qu'elle contient.
  if (!$('#etat-archive')) return;
  const annees = etat.archives?.annees ?? [];
  if (annees.length === 0) {
    $('#etat-archive').innerHTML = `<p class="compte">${tr("Aucune année archivée pour l'instant.", 'No archived year yet.')}</p>`;
    return;
  }
  const totalDocs = annees.reduce((n, a) => n + a.nombre, 0);
  const totalOctets = annees.reduce((n, a) => n + a.octetsCompresses, 0);
  $('#etat-archive').innerHTML =
    `<table><thead><tr><th>${tr('Année', 'Year')}</th><th class="n">Documents</th><th class="n">${tr('Taille', 'Size')}</th><th>${tr('Archivée le', 'Archived on')}</th></tr></thead><tbody>` +
    annees
      .map(
        (a) =>
          `<tr><td>${echapper(a.annee)}</td><td class="n">${nombreFr(a.nombre)}</td>` +
          `<td class="n">${nombreFr(Math.round(a.octetsCompresses / 1024))} ${tr('ko', 'KB')}</td>` +
          `<td>${echapper(a.archiveLe.slice(0, 10))}</td></tr>`
      )
      .join('') +
    '</tbody></table>' +
    (EN
      ? `<p class="compte">${annees.length} year(s), ${nombreFr(totalDocs)} documents, ${nombreFr(Math.round(totalOctets / 1024))} KB compressed in total.</p>`
      : `<p class="compte">${annees.length} année(s), ${nombreFr(totalDocs)} documents, ` +
        `${nombreFr(Math.round(totalOctets / 1024))} ko compressés au total.</p>`);
}

// ---------- démarrage ----------
const BESOINS = {
  accueil: ['decisions', 'votes', 'elus', 'resumes'],
  decisions: ['decisions', 'resumes', 'votes-decisions', 'votes'],
  votes: ['votes'],
  conseil: ['elus', 'districts', 'votes', 'decisions', 'agglomeration'],
  lexique: ['lexique'],
  sources: ['decisions', 'votes', 'elus', 'resumes', 'districts', 'agglomeration'],
};

// Longueuil : quand la Ville ne répond plus à notre robot (écrit par scrapers/seances.js), un bandeau le
// dit sur chaque page : le lecteur doit savoir que les données peuvent avoir du retard, et depuis quand.
async function bandeauAccesVille() {
  const acces = await charger('acces-ville');
  if (!acces?.echecDepuis) return;
  const avis = document.createElement('div');
  avis.className = 'avis';
  avis.setAttribute('role', 'status');
  const depuis = dateFr(acces.echecDepuis.slice(0, 10));
  const reussite = acces.derniereReussite ? dateFr(acces.derniereReussite.slice(0, 10)) : null;
  avis.innerHTML =
    `<strong>Mise à jour interrompue depuis le ${depuis}.</strong> Le site de la Ville de Longueuil ne répond plus ` +
    'à notre outil de mise à jour automatique. Les données de cette page peuvent donc avoir du retard' +
    (reussite ? `&nbsp;: la dernière lecture réussie du calendrier des séances date du ${reussite}.` : '.') +
    // Robot éteint depuis la pause (11 nov. 2026) : plus de « nous vérifions chaque jour », mais la réactivation.
    ' <a class="bouton-reactiver" href="https://promo.dafrsolution.com/payment-link/6af4eaec906a8b62055d5b71" rel="noopener">Réactiver pour 150&nbsp;$ →</a>';
  const repere = $('#chargement') ?? document.querySelector('main') ?? document.body.firstElementChild;
  repere?.parentNode?.insertBefore(avis, repere);
}

async function init() {
  const page = document.body.dataset.page;
  bandeauAccesVille();
  const noms = BESOINS[page] ?? [];
  const jeux = await Promise.all(noms.map(charger));
  noms.forEach((nom, i) => {
    etat[nom] = jeux[i];
  });
  // En anglais : les puces traduites remplacent les françaises, et l'objet de chaque décision
  // aussi (data/resumes-en.json). Ce qui n'est pas encore traduit reste en français, et le dit.
  if (EN && (etat.resumes || etat.decisions)) {
    const en = await charger('resumes-en');
    etat.traductionsEn = en;
    const traductions = en?.traductions ?? {};
    const objets = en?.objets ?? {};
    for (const r of etat.resumes?.resumes ?? []) {
      const t = traductions[r.id];
      if (t) Object.assign(r, { puces: t.puces, montantPrincipal: t.montantPrincipal });
      else if (r.puces?.length) r.francaisSeulement = true;
    }
    for (const d of etat.decisions?.decisions ?? []) {
      const o = objets[d.id];
      if (o?.en) d.objet = o.en;
    }
  }
  if (EN && page === 'lexique') etat.lexiqueEn = await charger('lexique-en');
  etat.parId = new Map((etat.resumes?.resumes ?? []).map((r) => [r.id, r]));
  // Le manifeste de l'archive vit dans un sous-dossier ; seule la page des sources le lit,
  // et elle ne lit que le manifeste, jamais les fichiers d'années eux-mêmes.
  if (page === 'sources' && VILLE.archives) etat.archives = await charger('archives/index');

  const requis = { accueil: 'decisions', decisions: 'decisions', votes: 'votes', conseil: 'elus', lexique: 'lexique', sources: null }[page];
  if (requis && !etat[requis]) {
    messageSansDonnees();
    return;
  }
  if ($('#chargement')) $('#chargement').hidden = true;

  if (page === 'accueil') rendreAccueil();
  if (page === 'decisions') {
    // Permet d'arriver ici depuis la carte avec un arrondissement déjà sélectionné.
    const instance = new URLSearchParams(location.search).get('instance');
    const recherche = new URLSearchParams(location.search).get('q');
    if (recherche && $('#rech-decisions')) $('#rech-decisions').value = recherche;
    // ?vote=1 : arrivée depuis l'ancienne page Votes nominatifs (redirection), filtre déjà coché.
    if (new URLSearchParams(location.search).has('vote') && $('#filtre-vote')) $('#filtre-vote').checked = true;
    // Arriver sur les décisions d'un sujet (lien depuis « Mes dossiers ») : filtre annoncé,
    // et retirable — sans quoi le lecteur croit voir toutes les décisions de la Ville.
    const projet = new URLSearchParams(location.search).get('projet');
    if (projet && etat.decisions.projets?.[projet]) {
      etat.projet = projet;
      $('#compte-decisions')?.insertAdjacentHTML(
        'beforebegin',
        `<p class="compte" id="filtre-projet">${tr('Projet&nbsp;:', 'Project:')} <strong>${echapper(etat.decisions.projets[projet].titre)}</strong> — ${nombreFr(etat.decisions.projets[projet].n)} ${tr('décision(s)', 'decision(s)')}. <a href="${VILLE.pages.decisions}">${tr('Voir toutes les décisions', 'See all decisions')}</a></p>`
      );
    }
    rendreDecisions();
    if (instance && [...$('#filtre-instance').options].some((o) => o.value === instance)) {
      $('#filtre-instance').value = instance;
      rendreDecisions();
    }
    // Un lien de courriel peut viser un document d'une année passée : la recherche venue de
    // l'adresse n'a rien trouvé, donc on va voir dans l'archive avant de dire qu'il n'y a rien.
    if (recherche && !$('#liste-decisions').querySelector('.carte')) chercherDansArchive(recherche);
    else if (recherche) { const seules = $('#liste-decisions').querySelectorAll('details.carte'); if (seules.length === 1) { for (let p = seules[0]; p; p = p.parentElement?.closest('details')) p.open = true; seules[0].scrollIntoView({ block: 'center' }); } }
  }
  if (page === 'votes') rendreVotes();
  if (page === 'conseil') {
    if (etat.votes) rendreDissidence(etat.votes.votes);
    if (etat.districts) rendreCarte();
    rendreElus();
    rendreAgglomeration();
  }
  if (page === 'lexique') rendreLexique();
  if (page === 'sources') rendreEtat();
}

// Filtres et pagination : câblés seulement si la page les contient.
document.addEventListener('input', (e) => {
  if (e.target.matches('#rech-decisions, #filtre-type, #filtre-instance, #filtre-theme, #filtre-resume, #filtre-vote, #affichage')) {
    etat.limiteDecisions = PAS;
    etat.limiteSeances = PAS_SEANCES;
    rendreDecisions();
  }
  if (e.target.matches('#rech-lexique')) rendreLexique();
  if (e.target.matches('#rech-votes, #filtre-instance-votes, #filtre-theme-votes')) {
    etat.limiteVotes = PAS_VOTES_DEPART;
    rendreVotes();
  }
});
// Ouvrir une séance ouvre aussi sa première décision, si elle porte un résumé IA (9 nov. 2026).
if (existe('#liste-decisions')) {
  $('#liste-decisions').addEventListener('toggle', (ev) => {
    const s = ev.target;
    if (!s.classList?.contains('seance') || !s.open) return;
    const premiere = s.querySelector('.seance-corps > details.carte');
    if (premiere && premiere.querySelector('.resume, [class*="resume"]')) premiere.open = true;
  }, true);
}
if (existe('#plus-decisions')) {
  $('#plus-decisions').addEventListener('click', () => {
    etat.limiteDecisions += PAS;
    etat.limiteSeances += PAS_SEANCES;
    rendreDecisions();
  });
}
// L'accueil montre 3 décisions résumées ; le bouton mène à la page Décisions (9 nov. 2026).
if (existe('#plus-fil')) {
  $('#plus-fil').addEventListener('click', () => {
    location.href = `${VILLE.pages.decisions}${EN ? '?lang=en' : ''}`;
  });
}
if (existe('#plus-votes')) {
  $('#plus-votes').addEventListener('click', () => {
    etat.limiteVotes += PAS_VOTES;
    rendreVotes();
  });
}

// Carte : clic ou clavier sur un district, et changement de mode de coloration.
document.addEventListener('click', (e) => {
  const district = e.target.closest?.('.zone-carte .district');
  if (district) choisirDistrict(Number(district.dataset.numero));
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const district = e.target.closest?.('.zone-carte .district');
  if (district) {
    e.preventDefault();
    choisirDistrict(Number(district.dataset.numero));
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches('#mode-couleur')) rendreCarte();
});

// Tout déplier / tout replier, pour la liste visible.
//
// Le bouton agit d'après SON état, pas d'après celui du DOM. La version précédente
// calculait « est-ce que toutes les fiches sont ouvertes ? » : une seule fiche fermée
// parmi soixante suffisait à répondre non, et le bouton ouvrait tout alors qu'il
// affichait « Tout replier ». L'étiquette annonçait le contraire de ce qui arrivait.
//
// La portée est limitée aux listes : les blocs repliables hors liste (le tableau des
// votes contre, par exemple) ne sont pas des fiches et ne doivent pas suivre.
document.addEventListener('click', (e) => {
  const bouton = e.target.closest?.('#tout-deplier');
  if (!bouton) return;

  const fiches = document.querySelectorAll('#liste-decisions .pliante, #liste-votes .pliante, #liste-lexique .pliante');
  const onDeplie = bouton.dataset.etat !== 'deplie';

  // Les séances s'ouvrent avec les fiches qu'elles contiennent : déplier tout en laissant
  // les séances fermées ne montrerait rien du tout.
  for (const s of document.querySelectorAll('#liste-decisions .seance')) s.open = onDeplie;

  // L'accordéon et « tout déplier » se contredisent : l'un veut une seule fiche ouverte,
  // l'autre les veut toutes. On lève donc l'exclusivité le temps du dépliage, en retirant
  // l'attribut `name`, puis on la rétablit au repliage. Sans ça, tout ouvrir n'ouvrirait
  // que la dernière fiche — le navigateur refermant les autres au fur et à mesure.
  for (const f of fiches) {
    if (onDeplie) f.removeAttribute('name');
    else f.setAttribute('name', NOM_ACCORDEON);
    f.open = onDeplie;
  }

  bouton.dataset.etat = onDeplie ? 'deplie' : 'replie';
  bouton.textContent = onDeplie ? tr('Tout replier', 'Collapse all') : tr('Tout déplier', 'Expand all');
});

init();

// ---------- Bascule clair / sombre ----------
// Le thème est déjà posé sur <html> par le script en <head> (avant le premier rendu).
// Ici on ne fait que basculer et mémoriser. Si la personne n'a jamais choisi, on suit la
// préférence du système — y compris si elle change pendant la visite.
(function basculeTheme() {
  const bouton = document.getElementById('bascule-theme');
  if (!bouton) return;

  const appliquer = (theme) => {
    document.documentElement.dataset.theme = theme;
    const versSombre = theme !== 'sombre';
    bouton.setAttribute('aria-pressed', String(theme === 'sombre'));
    const etiquette = versSombre ? tr('Passer au thème sombre', 'Switch to dark theme') : tr('Passer au thème clair', 'Switch to light theme');
    bouton.title = etiquette;
    bouton.setAttribute('aria-label', etiquette);
  };

  appliquer(document.documentElement.dataset.theme || 'clair');

  bouton.addEventListener('click', () => {
    const suivant = document.documentElement.dataset.theme === 'sombre' ? 'clair' : 'sombre';
    appliquer(suivant);
    try { localStorage.setItem('dvq:theme', suivant); } catch {}
  });

  // Tant que rien n'a été choisi explicitement, on reste aligné sur le système.
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener?.('change', (e) => {
    let choisi = null;
    try { choisi = localStorage.getItem('dvq:theme'); } catch {}
    if (!choisi) appliquer(e.matches ? 'sombre' : 'clair');
  });
})();

// ---------- Taille du texte : A− / 100 % / A+ ----------
// Même mécanique que sur DossierQuébec : un zoom de la page entre 80 et 150 %, par pas de
// dix, mémorisé. Le zoom plutôt qu'une taille de police racine, parce que la feuille de
// style est en pixels : un zoom agrandit tout — texte, espacements, pastilles — de façon
// cohérente, là où changer la seule police laisserait les boîtes à leur taille.
// La valeur est appliquée avant le premier rendu par le script en <head> ; ici on ne fait
// que réagir aux clics et tenir l'affichage à jour.
(function tailleTexte() {
  const moins = document.getElementById('texte-moins');
  const plus = document.getElementById('texte-plus');
  const pct = document.getElementById('texte-pct');
  if (!moins || !plus || !pct) return;

  const MIN = 80;
  const MAX = 150;
  const PAS = 10;

  const lire = () => {
    const z = parseInt(document.documentElement.style.zoom, 10);
    return z >= MIN && z <= MAX ? z : 100;
  };

  const appliquer = (z) => {
    document.documentElement.style.zoom = z + '%';
    pct.textContent = z + '%';
    moins.disabled = z <= MIN;
    plus.disabled = z >= MAX;
    try { localStorage.setItem('dvq:zoom', String(z)); } catch {}
  };

  appliquer(lire());
  moins.addEventListener('click', () => appliquer(Math.max(MIN, lire() - PAS)));
  plus.addEventListener('click', () => appliquer(Math.min(MAX, lire() + PAS)));
})();

// ---------- retour en haut ----------
// Sur toutes les pages : la liste des décisions et la page du conseil sont longues. Le bouton
// n'apparaît qu'une fois qu'on a vraiment descendu, pour ne pas encombrer l'en-tête.
(function retourEnHaut() {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'haut';
  bouton.setAttribute('aria-label', tr('Revenir en haut de la page', 'Go to the top of the page'));
  bouton.textContent = '↑';
  document.body.appendChild(bouton);
  // Le bouton apparaît quand on a descendu d'à peu près un écran, pas après 600 pixels fixes :
  // sur une page courte ou sur un téléphone, 600 pixels n'arrivaient jamais et la flèche ne
  // sortait pas (Martin, 18 septembre 2026 : « ya pas de up arrow sur la page Mes dossiers »).
  const seuil = () => Math.max(200, Math.min(600, Math.round(window.innerHeight * 0.6)));
  const majVisible = () => bouton.classList.toggle('visible', window.scrollY > seuil());
  window.addEventListener('scroll', majVisible, { passive: true });
  window.addEventListener('resize', majVisible, { passive: true });
  majVisible();
  // La flèche s'envole vers le haut en même temps que la page remonte (Martin, 16 nov. 2026).
  bouton.addEventListener('click', () => {
    bouton.style.setProperty('--envol', `${-(window.innerHeight - 90)}px`);
    bouton.classList.remove('envol'); void bouton.offsetWidth; bouton.classList.add('envol');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  bouton.addEventListener('animationend', () => bouton.classList.remove('envol'));
})();

// « Tout ouvrir » d'une séance (Martin, 9 nov. 2026) : déplie la séance et toutes ses fiches ;
// en ouvrir une autre referme la précédente. Les fiches forment un accordéon (attribut name) :
// on le retire le temps de tout déplier, on le remet en refermant.
function fermerSeanceDepliee(s) {
  s.classList.remove('tout-ouvert');
  s.querySelectorAll('details.carte[data-nom]').forEach((c) => { c.open = false; c.setAttribute('name', c.dataset.nom); delete c.dataset.nom; });
  s.querySelectorAll('.seance-procedure').forEach((p) => { p.open = false; });
  const b = s.querySelector('.bouton-tout-ouvrir');
  if (b) b.textContent = tr('Tout ouvrir', 'Expand all');
  s.open = false;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.bouton-tout-ouvrir');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const s = b.closest('details.seance');
  if (s.classList.contains('tout-ouvert')) { fermerSeanceDepliee(s); return; }
  document.querySelectorAll('details.seance[open], details.seance.tout-ouvert').forEach((x) => { if (x !== s) fermerSeanceDepliee(x); });
  s.open = true;
  s.classList.add('tout-ouvert');
  s.querySelectorAll('.seance-procedure').forEach((p) => { p.open = true; });
  s.querySelectorAll('details.carte').forEach((c) => {
    if (c.hasAttribute('name')) { c.dataset.nom = c.getAttribute('name'); c.removeAttribute('name'); }
    c.open = true;
  });
  b.textContent = tr('Tout fermer', 'Collapse all');
  s.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, true);


// VOTE NOMINATIF SUR LA FICHE (fusion des pages Votes et Décisions, 12 nov. 2026). Quand la décision a
// fait l'objet d'un vote, la fiche montre le résultat, qui a voté pour et contre, et qui a demandé le
// vote (scripts/votes-decisions.js → data/votes-decisions.json, lu une seule fois).
let votesParDecision = null;
document.addEventListener('toggle', async (e) => {
  const fiche = e.target;
  if (!fiche.matches?.('details.carte.pliante') || !fiche.open || fiche.querySelector('.bloc-vote')) return;
  if (document.body.dataset.page !== 'decisions') return;
  const numero = fiche.querySelector('.puce.num')?.textContent.trim();
  if (!numero) return;
  votesParDecision ??= etat['votes-decisions'] ? Promise.resolve(etat['votes-decisions']) : charger('votes-decisions');
  const jeu = await votesParDecision;
  // Volet : data/votes.json garde chaque vote et ce sur quoi il porte. Un même numéro peut en porter
  // plusieurs (un amendement, puis la proposition) : on les montre tous, rien ne se perd.
  const tous = (etat.votes?.votes ?? []).filter((x) => x.numero === numero);
  if (tous.length) {
    if (!fiche.querySelector('.bloc-vote')) fiche.querySelector('.corps')?.insertAdjacentHTML('afterbegin', tous.map(blocVoteDetail).join(''));
    return;
  }
  const v = jeu?.v?.[numero];
  if (!v || fiche.querySelector('.bloc-vote')) return;
  const [resultat, pour, contre, demandeur, pdf] = v;
  const noms = (l) => l.map((i) => echapper(jeu.noms[i])).join(', ');
  fiche.querySelector('.corps')?.insertAdjacentHTML('afterbegin', `<div class="bloc-vote">
    <div class="resume-entete">${tr('Vote nominatif', 'Recorded vote')} · ${echapper(resultat)} · ${pour.length} ${tr('pour', 'for')}, ${contre.length} ${tr('contre', 'against')}</div>
    <p style="margin:0 0 4px"><strong>${tr('Pour', 'For')}</strong> : ${noms(pour) || '—'}</p>
    <p style="margin:0 0 4px"><strong>${tr('Contre', 'Against')}</strong> : ${noms(contre) || '—'}</p>
    ${demandeur ? `<p class="compte" style="margin:0">${tr('Vote demandé par', 'Vote called by')} ${echapper(demandeur)}.</p>` : ''}
    ${pdf ? `<p class="compte" style="margin:2px 0 0"><a href="${echapper(pdf)}" target="_blank" rel="noopener">${tr('Résolution officielle (PDF) ↗', 'Official resolution (PDF, in French) ↗')}</a></p>` : ''}
  </div>`);
}, true);

// CONTRAT AU SEAO (16 nov. 2026, comme à Québec). Sur une fiche de décision qui adjuge un contrat, le
// contrat déclaré au SEAO (scrapers/contrats.js → data/contrats-decisions.json, lu une seule fois).
let contratsParDecision = null;
document.addEventListener('toggle', async (e) => {
  const fiche = e.target;
  if (!VILLE.contrats) return; // pas de contrats SEAO pour cette ville (bloc VILLE)
  if (!fiche.matches?.('details.carte.pliante') || !fiche.open || fiche.querySelector('.bloc-seao')) return;
  if (document.body.dataset.page !== 'decisions') return;
  const numero = fiche.querySelector('.puce.num')?.textContent.trim();
  if (!numero) return;
  contratsParDecision ??= charger('contrats-decisions');
  const liste = (await contratsParDecision)?.[numero];
  if (!liste?.length || fiche.querySelector('.bloc-seao')) return;
  const argent = (n) => (n == null ? '—' : Number(n).toLocaleString(EN ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 0 }) + ' $');
  const lignes = liste.map(([fournisseur, montant, gre, soum, item]) => `<li><strong>${echapper(fournisseur)}</strong> : ${argent(montant)}${
    gre ? ` · ${tr('gré à gré', 'direct award')}` : soum ? ` · ${soum} ${soum > 1 ? tr('soumissions', 'bids') : tr('soumission', 'bid')}` : ''
  }${item ? ` · <a href="https://seao.gouv.qc.ca/avis-resultat-recherche/consulter?ItemId=${echapper(item)}" target="_blank" rel="noopener">${tr('avis SEAO', 'SEAO notice')} ↗</a>` : ''}</li>`).join('');
  fiche.querySelector('.corps')?.insertAdjacentHTML('afterbegin', `<div class="bloc-contrat bloc-seao">
    <div class="resume-entete">${tr('Contrat déclaré au SEAO', 'Contract declared in SEAO')} · <a href="${VILLE.pages.contrats}${EN ? '?lang=en' : ''}">${tr('tous les contrats', 'all contracts')}</a></div>
    <ul>${lignes}</ul></div>`);
}, true);
