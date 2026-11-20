// MOTEUR COMMUN DES VOLETS DE VILLE (20 nov. 2026). Né de montreal/assets/app.js, le modèle.
// Tout ce qui change d'une ville à l'autre vient de globalThis.VILLE, posé par <ville>/assets/ville.js
// (importé avant ce fichier par <ville>/assets/app.js). La liste des clés est en tête de montreal/assets/ville.js.
//
// Logique commune à toutes les pages de DossierVille.
//
// Chaque page HTML porte un attribut data-page sur <body> ; ce script charge uniquement
// les jeux de données dont cette page a besoin, puis appelle le rendu correspondant.
// Les données sont lues à l'exécution depuis data/*.json, donc les pages restent légères
// et une seule extraction met tout le site à jour.

const VILLE = globalThis.VILLE;
if (!VILLE) throw new Error('moteur.js : globalThis.VILLE absent (importer assets/ville.js avant)');
// Version anglaise : tr('français', 'English'). VILLE.chemins (volets copiés dans un autre dépôt,
// 20 nov. 2026) : { langue, imprimer } ; défaut, la couche commune de DossierQuébec.
const { EN, tr } = await import(VILLE.chemins?.langue ?? '/commun/langue.js');
const { boutonImprimer, brancherImpression } = await import(VILLE.chemins?.imprimer ?? '/commun/imprimer-seance.js');
// libelleFr, themeFr (facultatifs) : volets écrits en anglais, traduits vers le français.
const { libelleEn, themeEn, libelleFr, themeFr } = VILLE.libelles;
// VILLE.anglophone (Vancouver, Ottawa, Fredericton) : la Ville publie en anglais ; fiches sans espace
// abonnés, décomptes bruts par élu, objet et libellés traduits vers le français. Voir la section
// « VOLETS ANGLOPHONES » en fin de fichier.
const ANGLO = Boolean(VILLE.anglophone);
// Vocabulaire propre à une ville : VILLE.vocabulaire.cle = [français, anglais].
const voc = (cle, fr, en) => (VILLE.vocabulaire?.[cle] ? tr(...VILLE.vocabulaire[cle]) : tr(fr, en));
// Adresses des pages du volet, sans extension (ex. « decisions-de-la-ville-de-montreal »).
const PAGE = VILLE.pages;
// Les types qui sont des documents de séance, pas des dossiers à suivre.
const TYPES_DOCUMENTS = VILLE.typesDocuments ?? ['Procès-verbal', 'Ordre du jour'];
// Ce qui compte comme une décision. Défaut (Montréal) : les résolutions seules. VILLE.horsDecisions
// (Lévis : procès-verbal et points de procédure) : tout sauf ces types ; ils sortent aussi du fil.
const estDecision = VILLE.fenetre ? (d) => !d.ordreDuJour && !d.information : VILLE.horsDecisions ? (d) => !VILLE.horsDecisions.has(d.type) : (d) => d.type === 'Résolution';

brancherImpression();
// Les libellés qui viennent des données (type, instance, résultat, fonction, rôle) : traduits en
// anglais, intacts en français. Les noms propres restent français dans les deux cas.
const lib = (texte) => (EN ? libelleEn(texte) : libelleFr ? libelleFr(texte) : texte);
// Les étiquettes de catégorie viennent des données et sont traduites en lot
// (data/resumes-en.json, scrapers/traductions.js) : une par étiquette, pas une par décision.
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
  // VILLE.date1er (volets anglophones) : « 1er » le premier du mois.
  return EN ? `${MONTHS[Number(m) - 1]} ${Number(j)}, ${a}` : `${VILLE.date1er && Number(j) === 1 ? '1er' : Number(j)} ${MOIS[Number(m) - 1]} ${a}`;
}

const nombreFr = (n) => Number(n).toLocaleString(EN ? 'en-CA' : 'fr-CA');

// Le titre d'un procès-verbal ou d'un ordre du jour n'est pas écrit par la Ville : c'est le
// robot qui le compose (scrapers/decisions.js), en français, et il dort tel quel dans les
// données. En anglais on le recompose plutôt que de le traduire à la pièce.
const TITRE_PV = /^Procès-verbal — (.+), séance (ordinaire|extraordinaire) du (\d{4}-\d{2}-\d{2})$/;
const TITRE_ODJ = /^Ordre du jour — (.+), séance du (\d{4}-\d{2}-\d{2}) \((\d+) points?\)$/;
// Montants sans cents (rétroaction d'un lecteur, 13 nov. 2026) : « 828 241,70 $ » devient « 828 242 $ ».
// Mélanger des montants à virgule et des montants ronds empêche de saisir l'ordre de grandeur d'un
// coup d'oeil. Seuls les cents sont arrondis : « 1,5 M$ » reste tel quel.
export function sansCents(t) {
  if (t == null) return t;
  return String(t)
    // K$ et M$ : « 2 803,0 K$ » → « 2 803 K$ » ; une décimale de K$ s'arrondit ; « 1,5 M$ » reste.
    .replace(/(\d),0(?=[   ]?[KkMG]\$)/g, (m, c) => c)
    .replace(/(\d{1,3}(?:[   ]\d{3})+|\d+),(\d)(?=[   ]?[Kk]\$)/g, (m, ent, dec) =>
      Math.round(Number(ent.replace(/[   ]/g, '')) + Number('0.' + dec)).toLocaleString('fr-CA'))
    .replace(/(\d{1,3}(?:[   ]\d{3})+|\d+),(\d{1,2})(?=[   ]?\$)/g, (m, ent, dec) =>
      Math.round(Number(ent.replace(/[   ]/g, '')) + Number('0.' + dec)).toLocaleString('fr-CA'))
    .replace(/\$[  ]?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{1,2})\b/g, (m, ent, dec) =>
      '$' + Math.round(Number(ent.replace(/,/g, '')) + Number('0.' + dec)).toLocaleString('en-CA'));
}

// CONTEXTE D'UNE DÉCISION (rétroaction d'un lecteur, 13 nov. 2026) : « on ne comprend pas tout de suite
// quel est le périmètre concerné ni où en est chaque décision dans le processus ». Trois lignes, tirées
// des faits seulement : la portée (l'instance), la durée (dates écrites dans l'objet), le parcours du
// dossier (les autres décisions qui portent le même numéro de dossier, d'une instance à l'autre).
const MOIS_FR = { janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11 };
function porteeDe(instance) {
  if (!instance) return null;
  return VILLE.porteeDe?.(instance, tr, etat, EN) ?? null;
}
function dureeDe(objet) {
  if (!objet) return null;
  // Une décision qui annule ne dure pas : la période écrite est celle de ce qui est annulé.
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
// La clé qui suit un dossier d'une instance à l'autre : VILLE.cleDossier (« dossier » à Montréal,
// « sommaireId » à Québec).
const CLE_DOSSIER = VILLE.cleDossier ?? 'dossier';
function parcoursDe(d) {
  const k = d[CLE_DOSSIER];
  if (!k || !etat.decisions?.decisions) return null;
  if (!parDossier) {
    parDossier = new Map();
    for (const x of etat.decisions.decisions) if (x[CLE_DOSSIER]) (parDossier.get(x[CLE_DOSSIER]) ?? parDossier.set(x[CLE_DOSSIER], []).get(x[CLE_DOSSIER])).push(x);
  }
  const l = (parDossier.get(k) ?? []).filter((x) => x.type !== 'Procès-verbal' && x.type !== 'Ordre du jour');
  if (l.length < 2) return null;
  return l.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((x) => {
    const double = l.some((y) => y !== x && y.date === x.date && y.instance === x.instance);
    const etiquette = `${dateFr(x.date)}, ${echapper(lib(x.instance ?? ''))}${double && x.numero ? ` (${echapper(x.numero)})` : ''}`;
    if (x === d) return `<strong>${etiquette} ${tr('(cette décision)', '(this decision)')}</strong>`;
    const cle = x.numero || x.id;
    return `<a href="${PAGE.decisions}?q=${encodeURIComponent(cle)}">${etiquette}</a>`;
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
  if (VILLE.objetFr && !EN && d?.objetFr) return d.objetFr;   // VILLE.objetFr : titre français fourni par les données (N.-B.)
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

// Extraction en panne (Lévis d'abord, 27 sept. 2026) : un fichier peut être là et n'affirmer rien de
// vrai. Une extraction qui n'a lu aucun procès-verbal alors que la Ville en offre publierait des zéros
// avec l'air d'un fait : on l'avoue plutôt. Le test porte sur la contradiction (des procès-verbaux
// publiés et aucune décision), pas sur un zéro : un début d'année sans procès-verbal n'est pas une panne.
function extractionEnPanne(jeu) {
  return Boolean(jeu?.seances?.some((s) => s.pv) && !jeu.decisions?.length);
}

function messageExtractionEnPanne(jeu) {
  const zone = $('#chargement');
  if (!zone) return;
  const le = String(jeu?.generatedAt ?? '').slice(0, 10);
  zone.innerHTML =
    "<strong>Extraction en panne.</strong> Aucun procès-verbal n'a pu être lu" +
    (le ? ` lors du dernier passage (${le})` : '') +
    '. Les chiffres de cette page ne sont pas à jour&nbsp;; la source officielle reste ' +
    (VILLE.archivesSeances ? `<a href="${VILLE.archivesSeances}">les archives des séances de la Ville</a>.` : 'le site de la Ville.');
}

// L'archive des années passées. La page ne charge que l'année en cours ; un lien reçu par courriel
// il y a des mois peut viser un document plus vieux. Dans ce cas seulement, on va lire l'année
// archivée : un fichier compressé, demandé une fois, et jamais pour une visite ordinaire.
async function lireAnneeArchivee(fichier) {
  try {
    const res = await fetch(`data/${fichier}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    if (!('DecompressionStream' in window) || !res.body) return await res.json();
    const flux = res.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flux).text());
  } catch {
    // Si l'hébergeur a décompressé le fichier en route, c'est du JSON ordinaire.
    try { return await (await fetch(`data/${fichier}`, { cache: 'force-cache' })).json(); } catch { return null; }
  }
}

async function chercherDansArchive(q) {
  const liste = $('#liste-decisions');
  if (!liste) return;
  const manifeste = VILLE.archives ? await charger('archives/index') : null;
  const annees = [...(manifeste?.annees ?? [])].sort((a, b) => (a.annee < b.annee ? 1 : -1));
  if (!annees.length) return;
  const avis = document.createElement('p');
  avis.className = 'compte';
  avis.id = 'avis-archive';
  avis.textContent = tr('Rien dans l\u2019année en cours. Lecture des années archivées…', 'Nothing in the current year. Reading the archived years…');
  liste.before(avis);
  const cherche = q.trim().toLowerCase();
  for (const a of annees) {
    const annee = await lireAnneeArchivee(a.fichier);
    const trouvees = (annee?.decisions ?? []).filter((d) => ((d.objet ?? '') + ' ' + (d.numero ?? '') + ' ' + (d.id ?? '')).toLowerCase().includes(cherche));
    if (!trouvees.length) continue;
    avis.textContent = tr(
      `Ce document n\u2019est pas de l\u2019année en cours : ${nombreFr(trouvees.length)} trouvé(s) dans l\u2019archive de ${a.annee}. Les résumés en langage clair ne couvrent pas les années archivées.`,
      `This document is not from the current year: ${nombreFr(trouvees.length)} found in the ${a.annee} archive. Plain-language summaries do not cover archived years.`
    );
    liste.innerHTML = trouvees.slice(0, 50).map(carteDecision).join('');
    // Le décompte et le bouton « afficher plus » parlent de l'année en cours : ils mentiraient
    // au-dessus d'une fiche venue de l'archive. L'avis dit tout ce qu'il y a à dire.
    if ($('#compte-decisions')) $('#compte-decisions').textContent = '';
    if ($('#plus-decisions')) $('#plus-decisions').hidden = true;
    return;
  }
  avis.textContent = tr('Ce document n\u2019est ni dans l\u2019année en cours, ni dans les années archivées.', 'This document is in neither the current year nor the archived years.');
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
// Le résumé du sommaire décisionnel passe avant celui du texte de la résolution : le
// sommaire explique le pourquoi, la résolution ne dit que le quoi. Une décision peut
// avoir les deux (lot Grok d'après la résolution, puis lecture des sommaires annexés).
function resumePour(d) {
  if (d.theme === 'procedure') return null;   // résumés de procédure masqués : jamais rien d'utile (Martin, 9 nov. 2026)
  // VILLE.resumeParSommaire (Laval) : les résumés sont indexés par numéro de sommaire (SD-2026-1234).
  if (VILLE.resumeParSommaire) { const cle = d.sommaireId ?? d.dossier; const r = cle ? etat.parId.get(cle) : null; return r ? { r, indirect: true } : null; }
  // Québec (VILLE.resumeDirectDabord) : le résumé du document lui-même d'abord, le sommaire ensuite.
  if (VILLE.resumeDirectDabord) {
    const direct = etat.parId.get(d.id);
    if (direct) return { r: direct, indirect: false };
    const viaSommaire = d.sommaireId ? etat.parId.get(d.sommaireId) : null;
    return viaSommaire ? { r: viaSommaire, indirect: true } : null;
  }
  const viaSommaire = d.sommaireId ? etat.parId.get(d.sommaireId) : null;
  if (viaSommaire) return { r: viaSommaire, indirect: viaSommaire.id !== d.id };
  const direct = etat.parId.get(d.id);
  return direct ? { r: direct, indirect: false } : null;
}
// Une décision « vaut la vitrine » quand elle porte un résumé IA. Une ville sans aucun résumé publié
// (Laval, résumés éteints) retomberait sur une page vide : on se rabat alors sur les vraies décisions,
// hors procédure et documents de séance (Longueuil, 20 nov. 2026).
function aResume(d) {
  if (etat.parId.size) return Boolean(resumePour(d));
  return d.theme !== 'procedure' && d.type !== 'Procès-verbal' && d.type !== 'Ordre du jour' && d.type !== 'Document de séance';
}
// Combien de décisions de la liste ont un résumé, par l'une ou l'autre voie.
function nombreResumees(liste) {
  return liste.filter((d) => estDecision(d) && resumePour(d)).length;
}

// Le résumé n'est affiché que s'il existe pour ce document précis, toujours identifié
// comme généré par une IA, et toujours accompagné du lien vers le PDF officiel.
function blocResume(trouve) {
  if (!trouve) return '';
  const { r, indirect } = trouve;
  // Québec (VILLE.enteteResumeCourte) : « — sommaire NUMÉRO » seulement quand le résumé vient du sommaire.
  if (VILLE.enteteResumeCourte) return `<div class="resume">
    <div class="resume-entete">
      <span>${tr('Résumé généré par IA', 'AI-generated summary')}${indirect && r.numero ? ` — ${tr('sommaire', 'decision summary')} ${echapper(r.numero)}` : ''}</span>
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(sansCents(r.montantPrincipal))}</span>` : ''}
      ${r.sansContenuSubstantiel ? `<span class="puce procedural">${tr('document de procédure', 'procedural document')}</span>` : ''}
      ${r.francaisSeulement ? '<span class="puce procedural" lang="en">summary not yet translated</span>' : ''}
    </div>
    <ul>${r.puces.map((p) => `<li>${echapper(sansCents(p))}</li>`).join('')}</ul>
  </div>`;
  return `<div class="resume">
    <div class="resume-entete">
      <span>${tr('Résumé généré par IA', 'AI-generated summary')}${r.source === 'sommaire' || indirect ? `${tr(" — d'après le sommaire décisionnel", ' — from the decision summary')}${indirect && r.numero ? ` ${echapper(r.numero)}` : ''}` : ANGLO && r.source === 'pv' ? tr(' — d’après le procès-verbal officiel', ' — from the official minutes') : tr(" — d'après le texte de la résolution", ' — from the text of the resolution')}</span>
      ${r.francaisSeulement ? '<span class="puce procedural" lang="en">summary not yet translated</span>' : ''}
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(sansCents(r.montantPrincipal))}</span>` : ''}
      ${r.sansContenuSubstantiel ? `<span class="puce procedural">${tr('document de procédure', 'procedural document')}</span>` : ''}
    </div>
    <ul>${r.puces.map((p) => `<li>${echapper(sansCents(p))}</li>`).join('')}</ul>
  </div>`;
}

// La couleur vit dans le CSS, pas dans les données : on émet une classe (t-urbanisme,
// t-contrats…) et la feuille de style décide. Avant, la teinte était écrite en style
// inline depuis data/decisions.json — changer une couleur obligeait à relancer un
// scraper, ce qui est absurde pour une décision d'affichage.
// Le tableau des libellés vient du jeu chargé par la page : decisions.json sur la page
// des décisions, votes.json sur celle des votes. Sans ce repli, la pastille disparaissait
// silencieusement sur la page des votes, qui ne charge pas les décisions.
function puceTheme(cle) {
  const t = etat.decisions?.themes?.[cle] ?? etat.votes?.themes?.[cle] ?? etat.fil?.themes?.[cle];
  if (!t) return '';
  return `<span class="puce theme t-${echapper(cle)}">${echapper(EN ? themeEn(cle, t.libelle) : themeFr ? themeFr(cle, t.libelle) : t.libelle)}</span>`;
}

// Après un redessin, les fiches reviennent fermées : le bouton doit le refléter, sinon il
// annonce « Tout replier » devant une liste entièrement repliée.
// ---------- le texte d'une décision ----------
//
// Ce que la décision DIT, par-delà son titre : le dispositif (« Et résolu : … »), qui porte
// les montants, les parties et les durées, et les motifs (« Vu… », « Attendu que… »), qui
// disent sur quoi le conseil s'appuie. Faute des sommaires décisionnels, dont Montréal ne
// publie pas l'index, c'est le plus près du « pourquoi » que les documents publics
// donnent — et ils sont publics depuis toujours, dans le procès-verbal.
//
// Le fichier ne se charge qu'à la première fiche dépliée : la page des décisions pèse déjà
// 4,7 Mo, et personne ne lit 5 245 dispositifs. Une fois là, il sert tout le reste de la
// visite. Si le chargement échoue, la fiche reste ce qu'elle était : rien ne se casse.
let textesDecisions = null;
let textesEnCours = null;

async function chargerTextes() {
  if (textesDecisions) return textesDecisions;
  textesEnCours ??= charger('textes').then((t) => (textesDecisions = t?.textes ?? {}));
  return textesEnCours;
}

// Le texte officiel reste derrière un pli fermé : le résumé suffit à la plupart des lecteurs, et
// Québec ne montre pas plus. Rien du tout quand le procès-verbal n'en a pas (Martin, 18 sept. 2026 :
// « pourquoi y a ça en plus, y a pas ça à Québec »).
function rendreTexteDecision(zone, t) {
  if (ANGLO && t && !EN && t.dispositifFr) t = { ...t, dispositif: t.dispositifFr };   // Ottawa : le procès-verbal français
  if (!t || (!t.dispositif && !t.motifs)) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = `<details class="texte-decision-pli"><summary>${voc('texteExact', 'Texte exact de la résolution', 'Exact text of the resolution')}</summary>
    ${t.dispositif ? `<div class="dispositif"><h4>${tr('Ce que le conseil a décidé', 'What the council decided')}</h4><p>${echapper(t.dispositif)}</p></div>` : ''}
    ${t.motifs ? `<div class="motifs"><h4>${tr("Sur quoi il s'appuie", 'What it is based on')}</h4><p>${echapper(t.motifs)}</p></div>` : ''}
  </details>`;
}

// `toggle` ne remonte pas : on écoute à la capture, sur la liste entière.
function brancherTextes(liste) {
  if (!liste || liste.dataset.textes) return;
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

function reinitialiserDepliage() {
  const b = $('#tout-deplier');
  if (!b) return;
  b.dataset.etat = 'replie';
  b.textContent = tr('Tout déplier', 'Expand all');
}

// Fiche repliée par défaut : on voit de quoi il s'agit d'un coup d'œil, on déplie pour lire.
//
// L'attribut `name` partagé fait de la liste un accordéon natif : ouvrir une fiche ferme
// la précédente, sans une ligne de JavaScript. Le clavier, la recherche du navigateur et
// les lecteurs d'écran suivent tout seuls. Sur un vieux navigateur qui ignore `name`, on
// retombe simplement sur des fiches indépendantes — dégradation sans casse.
const NOM_ACCORDEON = 'fiches';

// Au bas de chaque décision dépliée QUI A UN RÉSUMÉ IA (22 oct. 2026) : la partager sur Facebook,
// sur X ou en copiant le lien, et l'appel à l'abonnement de DossierQuébec. Le texte partagé porte un
// court récap tiré du résumé, comme sur DQ ; Facebook n'affiche que l'aperçu du lien (règle de FB).
// Le lien passe par la recherche (?q=numéro), qui cherche aussi dans l'archive et ouvre la fiche.
function actionsFiche(d) {
  const r = resumePour(d)?.r;
  if (!r?.puces?.length || r.sansContenuSubstantiel) return '';
  const cle = d.numero || d.objet || '';
  if (!cle) return '';
  const lien = new URL(`${PAGE.decisions}?q=${encodeURIComponent(cle)}`, location.href).href;
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

// « Ce que le conseil décide » (Lévis d'abord) : la phrase de décision du procès-verbal, recopiée telle
// quelle (« D’ACCORDER la dérogation mineure… »), montrée quand la décision n'a pas de résumé. Les
// énumérations « - … ; - … » de la Ville deviennent des lignes, sans rien changer aux mots.
function blocDispositif(paragraphes) {
  const paragraphe = (p) => {
    const [tete, ...items] = p.split(/\s+-\s+(?=\S)/);
    return `<p style="margin:0 0 6px">${echapper(tete)}</p>${items.length ? `<ul style="margin:0 0 8px">${items.map((i) => `<li>${echapper(i)}</li>`).join('')}</ul>` : ''}`;
  };
  return `<div class="resume">
    <div class="resume-entete"><span>${tr('Ce que le conseil décide — texte du procès-verbal', 'What the council decides — text of the minutes')}</span></div>
    ${paragraphes.map(paragraphe).join('')}
  </div>`;
}

function carteRepliable(entete, corps, ouverte = false) {
  return `<details class="carte pliante"${ouverte ? ' open' : ''} name="${NOM_ACCORDEON}"><summary>${entete}</summary><div class="corps">${corps}</div></details>`;
}

function carteDecision(d, ouverte = false) {
  if (VILLE.ficheFaits) return carteDecisionFaits(d, ouverte);
  if (ANGLO) return carteDecisionAnglo(d, ouverte);
  const entete = `<div class="meta">
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${d.categorie && !/^\d{8,}$/.test(d.categorie) ? `<span class="puce">${echapper(categorieEn(d.categorie))}</span>` : ''}
      ${d.unite ? `<span class="puce">${echapper(VILLE.uniteBrute ? d.unite : lib(d.unite.replace(/_/g, ', ')))}</span>` : ''}
      ${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(lib(d.resultat))}</span>` : ''}
      ${d.refus === 'refus' ? `<span class="resultat r-rejetee">${tr('Demande refusée', 'Request denied')}</span>` : d.refus === 'refus-partiel' ? `<span class="resultat r-rejetee">${tr('Refusée en partie', 'Partly denied')}</span>` : ''}
      ${d.voteEnregistre ? `<span class="puce genre-vote">${tr('vote enregistré', 'recorded vote')}</span>` : ''}
    </div>
    <p class="objet">${echapper(objetDe(d) ?? tr('(sans objet)', '(no subject)'))}</p>`;
  // Faits bruts tirés des données, chacun seulement s'il existe : les dissidences consignées
  // (Montréal), la phrase de décision du procès-verbal quand il n'y a pas de résumé (d.dispositif,
  // Lévis), le numéro de résolution annoté (d.annotation) et les sommaires décisionnels cités (d.sommaires).
  const corps = `${blocContexte(d)}${blocResume(resumePour(d))}
    ${!resumePour(d) && d.dispositif?.length ? blocDispositif(d.dispositif) : ''}
    ${d.dissidences?.length ? `<p class="compte" style="margin:0 0 8px">${tr(`Dissidence${d.dissidences.length > 1 ? 's' : ''}&nbsp;:`, `${s(d.dissidences.length, 'Dissent', 'Dissents')}:`)} ${d.dissidences.map(echapper).join(', ')}.</p>` : ''}
    ${d.modifieePar?.length ? `<p class="compte" style="margin:0 0 8px">${tr('Modifiée par la résolution', 'Amended by resolution')} ${d.modifieePar.map(echapper).join(', ')}.</p>` : ''}
    ${VILLE.textes ? `<div class="texte-decision" data-id="${echapper(d.id)}"></div>` : ''}
    ${d.annotation ? `<p class="compte" style="margin:0 0 8px">${tr('Résolution', 'Resolution')} ${echapper(d.annotation)}.</p>` : ''}
    ${d.sommaires?.length ? `<p class="compte" style="margin:0 0 8px">${tr('Sommaire décisionnel', 'Decision summary')} ${d.sommaires.map(echapper).join(', ')}</p>` : ''}
    ${VILLE.dossierEstSommaire
      // Longueuil : le numéro de dossier est celui du sommaire décisionnel (« SD-2026-0984 ») ; il n'est
      // dit que tant que le sommaire n'est pas résumé.
      ? (d.dossier && !resumePour(d) ? `<p class="compte" style="margin:0 0 8px">${tr('Sommaire décisionnel', 'Decision summary')} ${echapper(d.dossier)} — ${tr('pas encore résumé', 'not summarized yet')}.</p>` : '')
      : (d.dossier ? `<p class="compte" style="margin:0 0 8px">${tr('Dossier', 'File')} ${echapper(d.dossier)}${d.article ? ` · ${tr('article', 'item')} ${echapper(d.article)}` : ''}</p>` : '')}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${(VILLE.pdfSelonNumero ? d.numero : d.type === 'Résolution') ? tr('Procès-verbal officiel (PDF)', 'Official minutes (PDF, in French)') : tr('Document officiel (PDF)', 'Official document (PDF, in French)')} ↗</a>` : ''}
    ${d.sommairePdf ? ` &nbsp;<a class="lien-pdf" href="${echapper(d.sommairePdf)}" target="_blank" rel="noopener">${VILLE.dossierEstSommaire ? `${tr('Sommaire, dans le document de séance', 'Summary, in the meeting document')}${resumePour(d)?.r?.page ? ` (page ${resumePour(d).r.page})` : ''}` : tr('Sommaire décisionnel (PDF)', 'Decision summary (PDF, in French)')} ↗</a>` : ''}
    ${actionsFiche(d)}`;
  // Espace abonnés (/commun/abonnes.js) : « Suivre ce dossier » et le détail de l'argent. La clé
  // de dossier suit la décision d'une instance à l'autre.
  // Un document de séance (VILLE.typesDocuments : procès-verbal, ordre du jour…) n'est pas un dossier : rien à suivre.
  if (TYPES_DOCUMENTS.includes(d.type)) return carteRepliable(entete, corps, ouverte);
  // VILLE.abonnesMontant (Longueuil) : data-montant="1" quand le résumé a trouvé un montant.
  let abonnes = `<div class="ab-fiche" data-dossier="${echapper(d[CLE_DOSSIER] ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}"${VILLE.abonnesMontant && resumePour(d)?.r?.montantPrincipal ? ' data-montant="1"' : ''}></div>`;
  // VILLE.abonnesEtendu (Québec) : « Décision finale », les projets et le montant, pour abonnes.js.
  if (VILLE.abonnesEtendu) {
    const projets = (d.projets ?? []).map((cle) => ({ cle, titre: etat.decisions?.projets?.[cle]?.titre ?? cle }));
    const resume = resumePour(d)?.r;
    abonnes = `<div class="ab-fiche" data-dossier="${echapper(d[CLE_DOSSIER] ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}" data-montant="${resume?.montantPrincipal && !resume.sansContenuSubstantiel ? 1 : 0}"
    data-statut="${echapper(d.statutDossier ?? '')}" data-etape="${echapper(d.etapeFinale ?? '')}" data-echeance="${echapper(d.echeance ?? '')}"
    data-projets="${echapper(JSON.stringify(projets))}"></div>`;
  }
  return carteRepliable(entete, corps + abonnes, ouverte);
}

// Le total honnête : les résolutions seules. `nombre` compte aussi les fiches de
// documents (un procès-verbal et un ordre du jour par séance), qui ne sont pas des
// décisions. La facette donne le compte sans reparcourir les milliers de fiches.
// VILLE.compteCharges (Québec) : les données ne séparent pas les documents des décisions ; on dit
// combien sont chargées et combien la Ville en a publié (totalDisponible).
function totalDecisions() {
  if (VILLE.fenetre) return etat.decisions.nombre ?? etat.decisions.decisions.length;   // chaque fiche est une décision de la fenêtre
  if (VILLE.compteCharges) return etat.decisions.totalDisponible;
  if (VILLE.horsDecisions) {
    const types = etat.decisions.facettes?.type;
    return types ? types.filter((t) => estDecision({ type: t.valeur })).reduce((n, t) => n + t.n, 0) : etat.decisions.decisions.filter(estDecision).length;
  }
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
    // ?district=N (fiche d'un élu) : les décisions dont l'ordre du jour nomme ce district (d.districts, Laval).
    if (districtDemande() != null && !(d.districts ?? []).some((k) => k.numero === districtDemande())) return false;
    // VILLE.ficheFaits : le numéro de sommaire (d.dossier) et le titre au procès-verbal se cherchent aussi.
    if (q && VILLE.ficheFaits) return [d.objet, d.numero, d.dossier, d.titre, d.id].join(' ').toLowerCase().includes(q);
    // L'identifiant du document entre aussi dans la recherche : un procès-verbal n'a pas de numéro,
    // et c'est par son identifiant que le courriel ouvre sa fiche (?q=PV_CA4_OR_…).
    // Les identifiants de sommaires cités (d.sommaires, Lévis : FIN-2026-035) se cherchent aussi, Mes dossiers y renvoie.
    // ANGLO : les noms de qui a voté contre (et des conflits déclarés, VILLE.conflits) se cherchent aussi.
    if (q && !((d.objet ?? '') + ' ' + (d.numero ?? '') + ' ' + (d.id ?? '') + (d.sommaires?.length ? ' ' + d.sommaires.join(' ') : '') + (ANGLO ? ' ' + (d.dissidences ?? []).join(' ') + ' ' + (VILLE.conflits ? d.conflits ?? [] : []).join(' ') : '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function rendreDecisions() {
  const { facettes, parametres } = etat.decisions;
  if (!$('#filtre-type').dataset.rempli) {
    remplirSelect($('#filtre-type'), facettes.type.map((f) => ({ ...f, libelle: lib(f.valeur) })));
    remplirSelect($('#filtre-instance'), facettes.instance.slice(0, 25).map((f) => ({ ...f, libelle: lib(f.valeur) })));
    // La case « Avec résumé seulement » n'a de sens que s'il y a des résumés. Sur Montréal
    // il n'y en a aucun, faute de lien vers les sommaires décisionnels — voir l'encadré en
    // haut de la page. Une case qui ne peut que vider la liste vaut mieux cachée.
    const caseResume = document.getElementById('case-resume');
    // Les résumés vivent dans resumes.json, pas sur la fiche : c'est resumePour qui sait.
    if (caseResume) caseResume.hidden = !etat.parId.size;

    if ($('#filtre-theme')) {
      // On affiche le libellé lisible, pas la clé interne.
      remplirSelect(
        $('#filtre-theme'),
        (facettes.theme ?? []).map(({ valeur, n }) => ({ valeur, n, libelle: EN ? themeEn(valeur, etat.decisions.themes?.[valeur]?.libelle) : themeFr ? themeFr(valeur, etat.decisions.themes?.[valeur]?.libelle) : etat.decisions.themes?.[valeur]?.libelle }))
      );
    }
    $('#filtre-type').dataset.rempli = '1';
  }
  puceFiltreDistrict();
  const filtrees = decisionsFiltrees();
  const parSeance = $('#affichage')?.value !== 'liste';

  // Une décision, c'est une RÉSOLUTION. Le procès-verbal et l'ordre du jour d'une séance
  // ont eux aussi leur fiche — elles donnent accès au PDF officiel — mais ce sont des
  // documents, pas des décisions, et les compter gonflerait le total de 272 pour rien.
  // C'est précisément le défaut qu'on reproche aux données de Québec : on ne le refait pas.
  const nDecisions = filtrees.reduce((n, d) => n + (estDecision(d) ? 1 : 0), 0);

  // Court : le nombre, l'état des séances, les résumés. Le compte des documents de séance
  // (procès-verbaux, ordres du jour) se lit dans le filtre des types, pas ici.
  const total = totalDecisions();
  const filtre = VILLE.fenetre ? filtreFenetre(nDecisions, total, filtrees, parametres) : nDecisions !== total
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
  $('#compte-decisions').textContent = VILLE.compteCharges
    ? (EN
      ? `${nombreFr(filtrees.length)} decision(s) shown of ${nombreFr(etat.decisions.nombre)} loaded — the City published ${nombreFr(etat.decisions.totalDisponible)} in ${parametres.annee}.` +
        (etat.parId.size ? ` ${nombreFr(etat.parId.size)} have a plain-language summary.` : '')
      : `${nombreFr(filtrees.length)} décision(s) affichée(s) sur ${nombreFr(etat.decisions.nombre)} chargées — ` +
        `la Ville en a publié ${nombreFr(etat.decisions.totalDisponible)} en ${parametres.annee}.` +
        (etat.parId.size ? ` ${nombreFr(etat.parId.size)} portent un résumé en langage clair.` : ''))
    : `${filtre}${seancesTexte}.${resumesTexte}`;
  if (VILLE.ficheFaits) $('#compte-decisions').textContent = compteDecisionsFaits(filtrees);

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
    $('#liste-decisions').innerHTML = visibles.map(carteDecision).join('') || (VILLE.ficheFaits ? '<p class="vide">Aucune décision ne correspond.</p>' : '');
    reste = filtrees.length - visibles.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = tr(`Afficher plus (${nombreFr(reste)} restantes)`, `Show more (${nombreFr(reste)} left)`);
  }
  if ($('#filtre-vote')?.checked) $('#liste-decisions').insertAdjacentHTML('beforeend', votesHorsAnnee());
  if (VILLE.textes) brancherTextes($('#liste-decisions'));
  reinitialiserDepliage();
}

// Une séance, c'est une date et une instance : « le conseil de la ville du 7 juillet ».
// C'est l'unité dans laquelle la Ville travaille et dans laquelle les gens pensent — bien
// plus qu'une liste continue de 2 000 décisions.
//
// Les sommaires décisionnels n'ont pas d'instance (la Ville ne la publie pas sur ce type
// de document) : ils sont regroupés à part sous leur date, plutôt que d'être rattachés
// d'autorité à une séance à laquelle rien ne dit qu'ils appartiennent.
// VILLE.sansInstance : { fr, en } (Montréal « Autres documents », Québec « Documents préparatoires »).
const SANS_INSTANCE = VILLE.sansInstance?.fr ?? 'Autres documents';
const SANS_INSTANCE_EN = VILLE.sansInstance?.en ?? 'Other documents';

function grouperParSeance(decisions) {
  if (VILLE.seancesParId) return grouperParIdSeance(decisions);
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
        tronquee: !VILLE.fenetre && Boolean(d.date) && d.date === plusAncienne,   // VILLE.fenetre : la fenêtre est lue en entier
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
  if (VILLE.seancesParId) return rendreSeanceParId(g, ouverte);
  // 9 nov. 2026 (Martin) : tout ce qui n'a pas de résumé, pas seulement la procédure. aResume retombe
  // sur les vraies décisions quand la Ville n'a aucun résumé (Laval).
  // ANGLO : sans aucun résumé dans le volet, seule la procédure descend sous « No summary ».
  const estProcedure = ANGLO ? (d) => (etat.parId.size ? !resumePour(d) : d.theme === 'procedure') : (d) => !aResume(d);
  const procedure = g.lignes.filter(estProcedure);
  const autres = g.lignes.filter((d) => !estProcedure(d));
  // Les points de procédure, même résumés, passent sous les vraies décisions (Martin, 9 nov. 2026).
  const lignes = [...autres.filter((d) => d.theme !== 'procedure'), ...autres.filter((d) => d.theme === 'procedure')];
  const carte = (d, i) => carteDecision(d, ouverte && i === 0 && (ANGLO || Boolean(resumePour(d))));
  const blocProcedure = procedure.length
    ? `<details class="seance-procedure"><summary>${tr(
        `${etat.parId.size || ANGLO ? 'Sans résumé' : 'Procédure et documents de séance'} (${procedure.length} point${procedure.length > 1 ? 's' : ''})`,
        `No summary (${procedure.length} item${procedure.length > 1 ? 's' : ''})`
      )}</summary>${procedure.map((d) => carteDecision(d)).join('')}</details>`
    : '';
  return `<details class="seance"${ouverte ? ' open' : ''}>
      <summary class="seance-entete">
        <h3>${echapper(g.instance === SANS_INSTANCE ? tr(SANS_INSTANCE, SANS_INSTANCE_EN) : lib(g.instance))}</h3>
        <span class="seance-date">${dateFr(g.date)}</span>
        ${ANGLO ? pucesSeanceAnglo(g) : `<span class="puce">${g.lignes.length} ${tr(s(g.lignes.length, 'décision', 'décisions'), s(g.lignes.length, 'decision', 'decisions'))}</span>`}
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
  if (VILLE.votesDecompteImprime) return classeResultatLarge(r);
  if (ANGLO) {   // « Carried Unanimously », « Carried », « Lost », « Defeated » ; Ottawa : « Received », « Approved »…
    if (/unanim/i.test(r)) return 'r-unanimite';
    if (/^Carried$/i.test(r) || r.includes('majorité')) return 'r-majorite';
    if (/^(Lost|Defeated)$/i.test(r) || r.includes('Rejet')) return 'r-rejetee';
    if (/^Carried|^Received|^Approved|^Adopted/i.test(r)) return 'r-majorite';
  }
  if (r.includes('unanimité')) return 'r-unanimite';
  if (r.includes('majorité')) return 'r-majorite';
  if (r.includes('division')) return 'r-division';
  if (r.includes('Rejet')) return 'r-rejetee';
  return '';
}

function carteVote(v) {
  if (VILLE.votesDecompteImprime) return carteVoteImprimee(v);
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

  // Ce sur quoi porte le vote (v.etiquette, Longueuil et Laval) ; au conseil d'agglomération, l'absence
  // de décompte imprimé (voix pondérées) est dite plutôt que de laisser un zéro.
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
    ${v.demandeParVote ? `<p class="compte" style="margin:2px 0 0">${tr('Vote demandé par', 'Vote called by')} ${echapper(v.demandeParVote)}.</p>` : ''}
    ${v.avertissements.length ? `<div class="drapeau"><strong>${tr('À vérifier&nbsp;:', 'To check:')}</strong> ${v.avertissements.map((a) => echapper(EN ? a.replace(/^Texte source dégradé.*$/, 'Degraded source text (PDF with spaced-out glyphs) — names not extracted; see the original passage.') : a)).join(' · ')}</div>` : ''}
    <details><summary>${tr("Voir le passage d'origine", 'See the original passage (in French)')}</summary><p>${echapper(v.brut)}</p></details>
    ${v.pdf ? `<p style="margin:9px 0 0"><a class="lien-pdf" href="${echapper(v.pdf)}" target="_blank" rel="noopener">${VILLE.pdfVoteResolution ? tr('Résolution officielle (PDF)', 'Official resolution (PDF, in French)') : tr('Procès-verbal officiel (PDF)', 'Official minutes (PDF, in French)')} ↗</a></p>` : ''}`;

  return carteRepliable(entete, corps);
}

// VILLE.votesDetailles : un vote de data/votes.json, en bloc sur la fiche de sa décision (il dit sur quoi
// porte le vote et en garde chacun quand un numéro en porte plusieurs).
function blocVoteDetail(v) {
  return `<div class="bloc-vote">
    <div class="resume-entete">${tr('Vote nominatif', 'Recorded vote')}${v.etiquette ? ` · ${echapper(v.etiquette)}` : ''} · ${echapper(v.resultat ?? '')} · ${v.decomptePour ?? v.pour.length} ${tr('pour', 'for')}, ${v.decompteContre ?? v.contre.length} ${tr('contre', 'against')}</div>
    <p style="margin:0 0 4px"><strong>${tr('Pour', 'For')}</strong> : ${v.pour.map(echapper).join(', ') || '—'}</p>
    <p style="margin:0 0 4px"><strong>${tr('Contre', 'Against')}</strong> : ${v.contre.map(echapper).join(', ') || '—'}</p>
    ${v.demandeParVote ? `<p class="compte" style="margin:0">${tr('Vote demandé par', 'Vote called by')} ${echapper(v.demandeParVote)}.</p>` : ''}
    ${v.pdf ? `<p class="compte" style="margin:2px 0 0"><a href="${echapper(v.pdf)}" target="_blank" rel="noopener">${tr('Procès-verbal officiel (PDF) ↗', 'Official minutes (PDF, in French) ↗')}</a></p>` : ''}
  </div>`;
}

// VILLE.votesDetailles : les votes nominatifs dont la décision n'est pas dans l'année chargée (Longueuil :
// ceux de 2025 restent consultables). Montrés sous la liste quand on filtre les votes.
function votesHorsAnnee() {
  if (!VILLE.votesDetailles || !etat.votes?.votes?.length || !etat.decisions) return '';
  const numeros = new Set(etat.decisions.decisions.map((d) => d.numero).filter(Boolean));
  const hors = etat.votes.votes.filter((v) => !v.numero || !numeros.has(v.numero));
  if (!hors.length) return '';
  if (VILLE.votesDecompteImprime) return `<h2 class="section" id="votes-hors-annee">Votes nominatifs sans décision dans l'année (${hors.length})</h2>${hors.map(carteVote).join('')}`;
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
const sansTitre = (nom) => String(nom).replace(/^(Deputy Mayor|Acting Mayor|Mayor|Councillor|Conseill[eè]re?|Maire(sse)?)\s+/i, '');
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
    // Ordre alphabétique, sans le titre qui précède certains noms (« Councillor », « Mayor ») : pas de palmarès.
    .sort(VILLE.palmaresVotesContre ? (a, b) => b[1].n - a[1].n : (a, b) => sansTitre(a[0]).localeCompare(sansTitre(b[0]), 'fr'))
    .map(([nom, fiche]) => {
      const principale = [...fiche.instances.entries()].sort((a, b) => b[1] - a[1])[0];
      return `<tr><td>${echapper(nom)}</td><td>${echapper(principale ? lib(principale[0]) : '—')}</td><td class="n">${fiche.n}</td></tr>`;
    })
    .join('');
}

// Le tableau des votes contre : sur la page Conseil depuis la fusion des pages Votes et Décisions
// (12 nov. 2026).
function rendreDissidence(votes) {
  if (VILLE.tableauPourContre) return rendreDissidencePourContre(votes);
  if ($('#table-dissidence')) {
    $('#table-dissidence tbody').innerHTML = tableauVotesContre(votes);
    // Le tableau est replié : son résumé doit donc porter assez d'information pour qu'on
    // sache s'il vaut la peine de l'ouvrir : le nombre de personnes, sans nommer personne en tête.
    if ($('#resume-dissidence')) {
      const compte = new Map();
      for (const v of votes) for (const n of v.contre) compte.set(n, (compte.get(n) ?? 0) + 1);
      const n = compte.size;
      if (VILLE.palmaresVotesContre) {
        const tri = [...compte.entries()].sort((a, b) => b[1] - a[1]);
        const tete = tri.slice(0, 3).map(([nom, c]) => `${nom} (${c})`).join(', ');
        $('#resume-dissidence').textContent = EN
          ? `${n} ${s(n, 'person', 'people')}` + (tete ? `. Most: ${tete}` : '')
          : `${n} personne${n > 1 ? 's' : ''}` + (tete ? `. En tête : ${tete}` : '');
      } else {
        $('#resume-dissidence').textContent = EN
          ? `${n} ${s(n, 'person', 'people')}, in alphabetical order`
          : `${n} personne${n > 1 ? 's' : ''}, en ordre alphabétique`;
      }
    }
  }

  // Qui demande les votes du conseil, calculé sur l'année affichée (Hugo, 12 nov. 2026) : une phrase
  // écrite à la main aurait vieilli à la prochaine élection. Seulement si la page a #qui-demande et
  // que VILLE.instanceConseil dit quelle instance est le conseil.
  if ($('#qui-demande') && etat.elus?.membres && VILLE.instanceConseil) {
    const parti = new Map(etat.elus.membres.map((m) => [m.nomComplet, m.parti]));
    const maire = etat.elus.membres.find((m) => m.roles?.includes('Maire'))?.parti;
    const duConseil = votes.filter((v) => VILLE.instanceConseil.test(v.instance ?? ''));
    // L'opposition : un parti reconnu autre que celui du maire. Un indépendant ou un élu sans parti connu
    // n'y est pas compté (Hugo, 12 nov. 2026).
    const opposition = (n) => { const p = parti.get(n); return Boolean(p) && p !== maire && !/ind[ée]pendant/i.test(p); };
    const parOpposition = duConseil.filter((v) => v.demandeParVote && opposition(v.demandeParVote)).length;
    const annee = etat.votes.parametres?.annee ?? '';
    $('#qui-demande').textContent = duConseil.length && parOpposition * 2 > duConseil.length
      ? tr(`En ${annee}, le vote a surtout été demandé par les élus de l’opposition (${parOpposition} des ${duConseil.length} votes du conseil de la ville).`,
           `In ${annee}, the vote was mostly called by opposition members (${parOpposition} of the ${duConseil.length} votes of City Council).`)
      : '';
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
      [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, n]) => ({ valeur, n, libelle: lib(valeur) }))
    );
    if ($('#filtre-theme-votes')) {
      const parTheme = new Map();
      for (const v of votes) if (v.theme) parTheme.set(v.theme, (parTheme.get(v.theme) ?? 0) + 1);
      remplirSelect(
        $('#filtre-theme-votes'),
        [...parTheme.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([valeur, n]) => ({ valeur, n, libelle: EN ? themeEn(valeur, etat.votes.themes?.[valeur]?.libelle) : etat.votes.themes?.[valeur]?.libelle }))
      );
    }
    $('#filtre-instance-votes').dataset.rempli = '1';
  }

  const filtres = votesFiltres();
  const visibles = filtres.slice(0, etat.limiteVotes);
  $('#compte-votes').textContent = EN
    ? `${filtres.length} recorded vote(s) shown of ${etat.votes.nombre} in ${etat.votes.parametres.annee}. ` +
      `${etat.votes.avecAvertissement} carry an extraction warning.`
    : `${filtres.length} ${VILLE.appelsNominaux ? 'appel(s) nominal(aux)' : 'vote(s) enregistré(s)'} affiché(s) sur ${etat.votes.nombre} en ${etat.votes.parametres.annee}. ` +
      `${etat.votes.avecAvertissement} portent un avertissement d'extraction.`;
  $('#liste-votes').innerHTML = visibles.map(carteVote).join('');
  const reste = filtres.length - visibles.length;
  $('#plus-votes').hidden = reste <= 0;
  $('#plus-votes').textContent = tr(`${Math.min(PAS_VOTES, reste)} de plus (${reste} restants)`, `${Math.min(PAS_VOTES, reste)} more (${reste} left)`);
  reinitialiserDepliage();
}

// ---------- élus ----------
// Montréal ne numérote pas ses districts : la carte et les fiches se rejoignent par la clé
// du district (data/districts.json attribue un numéro stable à chaque clé).
function numeroDistrict(m) {
  if (m.districtNumero) return m.districtNumero;
  if (!etat.districts || !m.districtCle) return null;
  return etat.districts.districts.find((d) => d.cle === m.districtCle)?.numero ?? null;
}

// Les votes contre d'un élu. VILLE.comparerNoms :
//  « famille » (Montréal, défaut) : les procès-verbaux nomment les votants par leur nom de famille
//    seulement (« Mmes et MM. Martinez Ferrada, Bourque… ») ; on compare sur le nom de famille ou le nom complet.
//  « normalise » (Québec) : nom complet comparé sans accents, tirets ni espaces ; les résolutions
//    écrivent parfois « Marie–Pierre » ou « Vallières- Roland » (12 nov. 2026).
const cleNom = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase();
//  « complet » (Lévis) : nom complet sans accents ni casse, espaces et tirets confondus ; deux
//    conseillers portent le nom Tremblay. Sert aussi aux présences des conseils d'arrondissement.
const cleNomComplet = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s-]+/g, ' ').trim();
//  « sansAccents » (Longueuil) : nom complet sans accents ni casse ; la page des élus écrit parfois
//    « Lysa BELAICHA » quand le procès-verbal écrit « Lysa Bélaïcha ».
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function votesContreDe(m) {
  if (VILLE.comparerNoms === 'sansAccents') {
    if (!etat.votes || !m.nomComplet) return null;
    const nom = sansAccents(m.nomComplet);
    return etat.votes.votes.filter((v) => v.contre.some((n) => sansAccents(n) === nom)).length;
  }
  if (VILLE.comparerNoms === 'complet') {
    if (!etat.votes || !m.nomComplet) return null;
    const cle = cleNomComplet(m.nomComplet);
    return etat.votes.votes.filter((v) => v.contre.some((n) => cleNomComplet(n) === cle)).length;
  }
  if (VILLE.comparerNoms === 'normalise') {
    if (!etat.votes || !m.nomComplet) return 0;
    const moi = cleNom(m.nomComplet);
    return etat.votes.votes.filter((v) => v.contre.some((n) => cleNom(n) === moi)).length;
  }
  if (!etat.votes || !m.nom) return null;
  const nom = m.nom.toLowerCase();
  return etat.votes.votes.filter((v) => v.contre.some((n) => n.toLowerCase() === nom || n.toLowerCase() === m.nomComplet.toLowerCase())).length;
}

// LA LÉGENDE DU COMITÉ EXÉCUTIF (Martin, 7 oct. 2026). Le conseil et le comité exécutif se confondent
// facilement : la légende dit ce qu'est chacun, et qui siège au comité EN CE MOMENT, calculé sur les
// données lues à la Ville (data/elus.json, champ `executif` des élus) plutôt qu'écrit en dur. Seulement
// si la page a #legende-executif et que les données ont des rôles au comité.
function rendreLegendeExecutif(membres) {
  const boite = $('#legende-executif');
  if (!boite) return;
  const ex = membres.filter((m) => m.executif);
  if (!ex.length) { boite.hidden = true; return; }
  const associes = ex.filter((m) => /associ/i.test(m.executif.role));
  const titulaires = ex.length - associes.length;
  const partisEx = [...new Set(ex.map((m) => m.parti).filter(Boolean))];
  const absents = [...new Set(membres.map((m) => m.parti).filter(Boolean))].filter((p) => !partisEx.includes(p));
  const source = etat.elus.executif?.source;
  const fr = `<strong>Le comité exécutif n'est pas le conseil.</strong> Le conseil municipal réunit les ${membres.length} élus, en séance publique : c'est là qu'on débat et qu'on vote devant les citoyens. Le comité exécutif est un petit groupe : ${titulaires} membres${associes.length ? ` et ${associes.length} conseiller${associes.length > 1 ? 's' : ''} associé${associes.length > 1 ? 's' : ''}` : ''}, qui siègent à huis clos, environ une fois par semaine, et prennent la plupart des décisions courantes de la Ville. Sur les fiches ci-dessous, leur rôle au comité est sur une pastille jaune, avec leurs responsabilités. ${partisEx.length === 1
    ? `En ce moment, ses membres sont tous de ${partisEx[0]}${absents.length ? `. Aucun élu de ${absents.join(' ni de ')} n'y siège` : ''}.`
    : `En ce moment, y siègent des élus de ${partisEx.join(' et de ')}.`}`;
  const en = `<strong>The executive committee is not the council.</strong> City Council brings together all ${membres.length} elected members, in public session: that is where debates and votes take place in front of citizens. The executive committee is a small group: ${titulaires} members${associes.length ? ` and ${associes.length} associate councillor${associes.length > 1 ? 's' : ''}` : ''}, who sit behind closed doors about once a week and make most of the City's day-to-day decisions. On the cards below, their role on the committee is on a yellow tag, with their responsibilities. ${partisEx.length === 1
    ? `At the moment, its members are all from ${partisEx[0]}${absents.length ? `. No member of ${absents.join(' or ')} sits on it` : ''}.`
    : `At the moment, members of ${partisEx.join(' and ')} sit on it.`}`;
  boite.hidden = false;
  boite.innerHTML = tr(fr, en) + (source ? ` <a href="${echapper(source)}" target="_blank" rel="noopener">${tr('La liste, sur le site de la Ville', 'The list, on the City’s website')}</a>.` : '');
}

function carteElu(m) {
  if (ANGLO) return carteEluAnglo(m);
  const roles = m.roles.filter((r) => (VILLE.elusSimple ? true : r) && r !== 'Maire');
  const votesContre = votesContreDe(m);
  const numero = numeroDistrict(m);
  const arr = instanceArrondissement(m.arrondissement);
  const fonction = m.fonction ?? '';
  // VILLE.elusSimple (Québec) : sous le nom, le district et son numéro ; le maire n'a pas de district.
  // VILLE.ficheEluSobre (Longueuil, Laval) : « District 3 — Nom », ou la fonction pour la mairie.
  const ligneDistrict = VILLE.elusSimple
    ? `${echapper(m.district ?? tr(`Maire de ${VILLE.nom}`, `Mayor of ${VILLE.nom}`))}${m.districtNumero ? ` (${m.districtNumero})` : ''}`
    : VILLE.ficheEluSobre
      ? echapper(m.district ? `District ${m.districtNumero ? m.districtNumero + ' — ' : ''}${m.district}` : m.fonction ?? '')
      : `${echapper(m.district ? m.district : fonction)}${m.district && fonction ? ` — ${echapper(fonction)}` : ''}`;
  // VILLE.ficheEluSobre : pas de téléphone, les votes contre « depuis » la première année des votes, et
  // les liens « Écrire » (courriel), « Sa fiche sur le site de la Ville », décisions de l'arrondissement.
  if (VILLE.ficheEluSobre) {
    return `<article class="carte elu${m.siegeAuConseilMunicipal === false ? ' arrondissement-seulement' : ''}"${numero ? ` id="elu-${numero}"` : ''}>
    ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${ligneDistrict}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${m.siegeAuConseilMunicipal === false ? '<span class="puce procedural">conseil d\'arrondissement seulement</span>' : ''}
        ${m.roles.filter(Boolean).map((r) => `<span class="puce">${echapper(r)}</span>`).join('')}
      </div>
      ${votesContre ? `<p class="compte" style="margin:6px 0 0">${votesContre} vote(s) contre consigné(s) depuis ${echapper(etat.votes.parametres.annees?.[0] ?? etat.votes.parametres.annee)}.</p>` : ''}
      <p style="margin:4px 0 0; font-size:13px">
        ${[
          m.courriel ? `<a href="mailto:${echapper(m.courriel)}">Écrire</a>` : '',
          m.biographie ? `<a href="${echapper(m.biographie)}" target="_blank" rel="noopener">Sa fiche sur le site de la Ville</a>` : '',
          arr ? `<a href="${PAGE.decisions}?instance=${encodeURIComponent(arr.instance)}">${arr.n} décisions de l'arrondissement</a>` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  </article>`;
  }

  return `<article class="carte elu${m.siegeAuConseilMunicipal === false ? ' arrondissement-seulement' : ''}"${numero ? ` id="elu-${numero}"` : ''}>
    ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${ligneDistrict}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${m.siegeAuConseilMunicipal === false ? `<span class="puce procedural">${tr("conseil d'arrondissement seulement", 'borough council only')}</span>` : ''}
        ${roles.map((r) => `<span class="puce">${echapper(lib(r))}</span>`).join('')}
        ${m.executif ? `<span class="puce puce-executif">${echapper(lib(m.executif.role))}</span>` : ''}
      </div>
      ${m.executif && m.executif.responsabilites?.length ? `<p class="responsabilites"><strong>${tr('Responsabilités au comité exécutif :', 'Responsibilities on the executive committee:')}</strong> ${m.executif.responsabilites.map(echapper).join(' · ')}</p>` : ''}
      <p class="compte" style="margin:6px 0 0">${echapper(m.telephone ?? '')}</p>
      ${votesContre ? `<p class="compte" style="margin:2px 0 0">${votesContre} ${tr('vote(s) contre consigné(s) cette année.', 'vote(s) against recorded this year.')}</p>` : ''}
      <p style="margin:4px 0 0; font-size:13px">
        ${m.formulaireCourriel ? `<a href="${echapper(m.formulaireCourriel)}" target="_blank" rel="noopener">${tr('Écrire', 'Write')}</a>` : ''}
        ${m.biographie ? ` · <a href="${echapper(m.biographie)}" target="_blank" rel="noopener">${tr('Biographie', 'Biography')}</a>` : ''}
        ${arr ? ` · <a href="${PAGE.decisions}?instance=${encodeURIComponent(arr.instance)}">${arr.n} ${tr("décisions de l'arrondissement", 'borough decisions')}</a>` : ''}
      </p>
    </div>
  </article>`;
}

// Un siège sans titulaire (etat.elus.postesVacants, Longueuil d'abord).
function carteVacant(v) {
  return `<article class="carte elu"${v.districtNumero ? ` id="elu-${v.districtNumero}"` : ''}>
    <div>
      <h3>Poste vacant</h3>
      <p class="district">District ${v.districtNumero ? v.districtNumero + ' — ' : ''}${echapper(v.district)}</p>
      <p class="compte" style="margin:6px 0 0">Le siège sera pourvu par une élection partielle.</p>
    </div>
  </article>`;
}

function rendreElus() {
  if (VILLE.elusDistrictsNumerotes) return rendreElusDistricts();
  if (ANGLO) return rendreElusAnglo();
  const membres = etat.elus.membres;
  const partis = Object.entries(etat.elus.partis).sort((a, b) => b[1] - a[1]);
  rendreLegendeExecutif(membres);
  // VILLE.elusSimple (Québec) : les élus dans l'ordre des données, groupés par arrondissement.
  if (VILLE.elusSimple) {
    $('#compte-elus').textContent = `${membres.length} ${tr('membres', 'members')} — ` + partis.map(([p, n]) => `${p} : ${n}`).join(' · ');
    const groupes = new Map();
    for (const m of membres) {
      const cle = m.arrondissement ?? 'Mairie';
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(m);
    }
    $('#liste-elus').innerHTML = [...groupes.entries()]
      .map(([titre, gens]) => `<h2 class="section">${echapper(lib(titre))}</h2><div class="grille-elus">${gens.map(carteElu).join('')}</div>`)
      .join('');
    return;
  }
  // VILLE.ordreArrondissements (Longueuil) : la mairie, puis les arrondissements dans l'ordre de la
  // Ville ; dans chacun, les conseillers de ville par numéro de district, puis ceux d'arrondissement.
  // Un poste vacant (etat.elus.postesVacants) reste dans la liste : c'est aussi une information.
  if (VILLE.ordreArrondissements) {
    const total = etat.elus.nombreTotal && etat.elus.nombreTotal !== etat.elus.nombre ? ` (${etat.elus.nombreTotal} avec ${VILLE.totalAvec ?? "les conseillers d'arrondissement"})` : '';
    const vacants = etat.elus.postesVacants ?? [];
    $('#compte-elus').textContent =
      `${etat.elus.nombre} ${(VILLE.libelleMembres ?? ['membres du conseil municipal'])[0]}${total}` +
      (partis.length ? ' — conseillers : ' + partis.map(([p, n]) => `${p} ${n}`).join(' · ') : '') +
      (vacants.length ? ` — ${vacants.length} poste${vacants.length > 1 ? 's' : ''} vacant${vacants.length > 1 ? 's' : ''}` : '') + '.';
    const groupes = new Map([['Mairie', []], ...VILLE.ordreArrondissements.map((a) => [a, []])]);
    for (const m of membres) {
      const cle = VILLE.regexMaire.test(m.fonction ?? '') || !m.arrondissement ? 'Mairie' : m.arrondissement;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(m);
    }
    for (const v of vacants) {
      if (!groupes.has(v.arrondissement)) groupes.set(v.arrondissement, []);
      const numero = etat.districts?.districts.find((d) => d.nom === v.district)?.numero ?? null;
      groupes.get(v.arrondissement).push({ vacant: true, district: v.district, districtNumero: numero });
    }
    const rangDistrict = (m) => (m.siegeAuConseilMunicipal === false ? 1000 : m.districtNumero ?? 999);
    $('#liste-elus').innerHTML = [...groupes.entries()]
      .filter(([, gens]) => gens.length)
      .map(([titre, gens]) => `<h2 class="section">${titre === 'Mairie' ? 'Mairie' : echapper(VILLE.titreArrondissement?.(titre) ?? titre)}</h2><div class="grille-elus">${gens.sort((a, b) => rangDistrict(a) - rangDistrict(b)).map((m) => (m.vacant ? carteVacant(m) : carteElu(m))).join('')}</div>`)
      .join('');
    return;
  }
  const total = etat.elus.nombreTotal && etat.elus.nombreTotal !== etat.elus.nombre
    ? tr(` (${etat.elus.nombreTotal} élus avec les conseils d'arrondissement)`, ` (${etat.elus.nombreTotal} elected officials including borough councils)`)
    : '';
  $('#compte-elus').textContent = tr(`${etat.elus.nombre} membres du conseil municipal${total} — `, `${etat.elus.nombre} members of City Council${total} — `) + partis.map(([p, n]) => `${p} : ${n}`).join(' · ');

  // La mairie d'abord, puis les arrondissements par ordre alphabétique ; dans chacun, la
  // mairie d'arrondissement, les conseillers de ville, puis ceux d'arrondissement.
  // VILLE.elusParDistrict (Lévis) : le maire, puis chaque arrondissement, les districts dans l'ordre de
  // leur numéro ; le titre du groupe vient du crochet VILLE.titreArrondissement(nom) s'il existe.
  const parDistrict = VILLE.elusParDistrict;
  const rang = parDistrict
    ? (m) => (VILLE.regexMaire.test(m.fonction ?? '') ? 0 : 2)
    : (m) => (VILLE.regexMaire.test(m.fonction ?? '') ? 0 : /maire/i.test(m.fonction ?? '') ? 1 : m.siegeAuConseilMunicipal === false ? 3 : 2);
  const ordre = parDistrict ? (a, b) => (a.districtNumero ?? 0) - (b.districtNumero ?? 0) : (a, b) => a.nom.localeCompare(b.nom);
  const groupes = new Map();
  for (const m of [...membres].sort((a, b) => rang(a) - rang(b) || ordre(a, b))) {
    const cle = rang(m) === 0 ? tr(`Mairie de ${VILLE.nom}`, `${VILLE.nom} City Hall`) : m.arrondissement ? (VILLE.titreArrondissement?.(m.arrondissement) ?? m.arrondissement) : tr('Sans arrondissement', 'No borough');
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(m);
  }
  $('#liste-elus').innerHTML = [...groupes.entries()]
    .map(([titre, gens]) => `<h2 class="section">${echapper(lib(titre))}</h2><div class="grille-elus">${gens.map(carteElu).join('')}</div>`)
    .join('');
}

// Le conseil d'agglomération : une instance distincte, avec des élus d'autres villes.
// On l'affiche sur la même page que le conseil municipal — les gens concernés sont les
// mêmes — mais dans sa propre section, parce que ce ne sont pas les mêmes sièges.
// VILLE.agglomeration = { sieges } (Québec) : le conseil compte N sièges, les remplaçants sont dits,
// la fonction est suivie de la ville, et les villes reconstituées passent d'abord, par présences.
// VILLE.agglomeration = { reconstituee: true } (Longueuil) : la Ville ne publie pas de liste ; elle est
// reconstituée depuis les procès-verbaux, et la fiche dit les présences de l'année et les remplacements.
function carteAggloReconstituee(m) {
  const remplacements = (etat.agglomeration.remplacants ?? []).filter((r) => r.remplace.includes(m.nom));
  return `${m.seances ? `<p class="compte" style="margin:6px 0 0">Présence consignée à ${m.presences} séance(s) sur ${m.seances} en ${echapper(etat.agglomeration.parametres.annee)}.</p>` : ''}
      ${remplacements.length ? `<p class="compte" style="margin:2px 0 0">Remplacement consigné&nbsp;: ${remplacements.map((r) => `${echapper(r.nom)} (${r.remplacements} séance${r.remplacements > 1 ? 's' : ''})`).join(', ')}.</p>` : ''}`;
}

function carteMembreAgglo(m) {
  const deLaVille = (m.ville ?? '') === VILLE.nom;
  const sieges = VILLE.agglomeration?.sieges;
  return `<article class="carte elu">
    <div>
      <h3>${echapper(m.nom)}</h3>
      <p class="district">${sieges ? `${echapper(lib(m.fonction))}${m.ville ? ' — ' + echapper(m.ville) : ''}` : `${echapper(m.fonctionTelleQuelle ?? m.fonction ?? '')}${m.district ? ' — ' + echapper(m.district) : ''}`}</p>
      <div class="meta">
        ${m.ville ? `<span class="puce ${deLaVille ? '' : 'reconstituee'}">${echapper(m.ville)}</span>` : ''}
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${m.roles.map((r) => `<span class="puce">${echapper(lib(r))}</span>`).join('')}
      </div>
      ${VILLE.agglomeration?.reconstituee ? carteAggloReconstituee(m) : `${m.presences != null ? `<p class="compte" style="margin:6px 0 0">${EN ? `Present at ${m.presences} of the ${m.seances} meeting(s) where attendance is recorded.` : `Présent à ${m.presences} séance(s) sur ${m.seances} où sa présence est consignée.`}</p>` : ''}
      ${m.remplace?.length ? `<p class="compte" style="margin:2px 0 0">${tr('Siège en remplacement de', 'Sits as a replacement for')} ${m.remplace.map(echapper).join(', ')}.</p>` : ''}`}
      ${m.courriel ? `<p style="margin:4px 0 0; font-size:13px"><a href="mailto:${echapper(m.courriel)}">${tr('Écrire', 'Write')}</a></p>` : ''}
    </div>
  </article>`;
}

// ---------- commission d'urbanisme (CUCQ, Québec) ----------
// Données : data/cucq.json (VILLE.cucq). Même source que l'agglomération : les listes de présences.
// On dit ce que le procès-verbal dit — votant ou substitut, élu·e ou non, présidence — et rien de plus.
function carteMembreCucq(m) {
  const statut = m.categorie === 'substitut' ? tr('Membre substitut', 'Substitute member') : tr('Membre votant', 'Voting member');
  const fonction = m.elu ? (EN ? 'city councillor' : m.civilite === 'Mme' ? 'conseillère municipale' : 'conseiller municipal') : null;
  const partiel = m.partielles ? tr(`, dont ${m.partielles} en partie`, `, ${m.partielles} of them in part`) : '';
  return `<article class="carte elu">
    <div>
      <h3>${echapper(m.nom)}</h3>
      <p class="district">${statut}${fonction ? ' — ' + fonction : ''}</p>
      <div class="meta">
        ${m.roles.map((r) => `<span class="puce">${echapper(lib(r))}</span>`).join('')}
        ${m.elu ? `<span class="puce">${tr('siège au conseil municipal', 'sits on City Council')}</span>` : ''}
      </div>
      <p class="compte" style="margin:6px 0 0">
        ${EN ? `Attendance recorded at ${m.presences} of ${m.seances} meeting(s)${partiel}.` : `Présence consignée à ${m.presences} séance(s) sur ${m.seances}${partiel}.`}
      </p>
    </div>
  </article>`;
}

function rendreCucq() {
  if (!$('#liste-cucq') || !etat.cucq) return;
  const c = etat.cucq;
  const elus = c.membres.filter((m) => m.elu).length;
  $('#compte-cucq').textContent = EN
    ? `${c.votants} voting members and ${c.substituts} substitutes found over ${c.seancesAnalysees} meetings in ${c.parametres.annee}, ${elus} of whom also sit on City Council. ` +
      (c.derniereSeance ? `Last minutes analyzed: ${dateFr(c.derniereSeance.date)}.` : '')
    : `${c.votants} membres votants et ${c.substituts} substituts relevés sur ${c.seancesAnalysees} séances de ` +
      `${c.parametres.annee}, dont ${elus} qui siègent aussi au conseil municipal. ` +
      (c.derniereSeance ? `Dernier procès-verbal analysé : ${dateFr(c.derniereSeance.date)}.` : '');
  $('#liste-cucq').innerHTML = `<div class="grille-elus">${c.membres.map(carteMembreCucq).join('')}</div>`;
}

// ---------- conseils d'arrondissement par les présences (Lévis d'abord) ----------
// VILLE.presences = { arrondissements: [[code, nom de l'instance], …] } et data/presences.json. La Ville ne
// publie pas la composition des conseils d'arrondissement à part : elle se lit dans les listes de
// présences en tête de chaque procès-verbal. On montre les faits consignés, bruts.
function membresDInstance(code) {
  const seances = (etat.presences?.seances ?? []).filter((s) => s.instanceCode === code);
  const parNom = new Map();
  for (const s of seances) {
    for (const nom of s.presents ?? []) {
      const m = parNom.get(cleNomComplet(nom)) ?? { nom, presences: 0, absences: 0, presidences: 0 };
      m.presences++;
      if (cleNomComplet(s.president) === cleNomComplet(nom)) m.presidences++;
      parNom.set(cleNomComplet(nom), m);
    }
    for (const nom of s.absents ?? []) {
      const m = parNom.get(cleNomComplet(nom)) ?? { nom, presences: 0, absences: 0, presidences: 0 };
      m.absences++;
      parNom.set(cleNomComplet(nom), m);
    }
  }
  return { seances: seances.length, membres: [...parNom.values()].sort((a, b) => b.presences - a.presences || a.nom.localeCompare(b.nom)) };
}

// Le dénominateur ne peut pas se lire dans presences.json seul : une séance dont l'en-tête n'a pas
// été reconnu n'y a AUCUNE entrée. On compte donc les procès-verbaux réellement lus ; Math.max : le
// dénominateur ne doit jamais passer sous le numérateur (27 septembre 2026).
function pvLus(code, auMoins) {
  return Math.max((etat.decisions?.seances ?? []).filter((s) => s.instance === code && s.etat === 'lue').length, auMoins);
}

function carteMembreInstance(m, seances) {
  const elu = (etat.elus?.membres ?? []).find((e) => cleNomComplet(e.nomComplet) === cleNomComplet(m.nom));
  return `<article class="carte elu">
    ${elu?.photo ? `<img src="${echapper(elu.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nom)}</h3>
      <p class="district">${elu?.district ? `District ${elu.districtNumero}, ${echapper(elu.district)}` : echapper(elu?.fonction ?? '')}</p>
      <p class="compte" style="margin:6px 0 0">Présent à ${m.presences} séance(s) sur ${seances}${m.absences ? `, absence consignée à ${m.absences}` : ''}.${m.presidences ? ` A présidé ${m.presidences} séance(s).` : ''}</p>
      ${elu?.districtNumero ? `<p style="margin:4px 0 0; font-size:13px"><a href="#elu-${elu.districtNumero}">Sa fiche au conseil de la Ville</a></p>` : ''}
    </div>
  </article>`;
}

function rendreArrondissements() {
  if (!$('#liste-arrondissements') || !etat.presences || !VILLE.presences) return;
  $('#liste-arrondissements').innerHTML = VILLE.presences.arrondissements.map(([code, nom]) => {
    const { seances, membres } = membresDInstance(code);
    const lus = pvLus(code, seances);
    if (!lus) return '';
    const n = etat.decisions?.facettes.instance.find((f) => f.valeur === nom)?.n;
    return `<h2 class="section">${echapper(nom.replace("Conseil d'arrondissement ", 'Arrondissement '))}</h2>
      <p class="compte">${membres.length} membres nommés dans ${lus === seances ? `les ${seances} procès-verbaux` : `${seances} des ${lus} procès-verbaux`} de l'année${lus > seances ? ` — la liste des présences de ${lus - seances} d'entre eux n'a pas été reconnue` : ''}${n ? ` · <a href="${PAGE.decisions}?instance=${encodeURIComponent(nom)}">${nombreFr(n)} décisions</a>` : ''}</p>
      <div class="grille-elus">${membres.map((m) => carteMembreInstance(m, lus)).join('')}</div>`;
  }).join('');
}

// ---------- comité exécutif ----------
// Pas de jeu de données à part : ses membres sont les élus dont les rôles publiés par la
// Ville disent « comité exécutif » (présidence, vice-présidence, membre, responsabilités).
function membresComiteExecutif() {
  return (etat.elus?.membres ?? []).filter((m) => m.comiteExecutif || [m.fonction, ...(m.roles ?? [])].some((r) => /comit[ée] ex[ée]cutif/i.test(r ?? '')));
}

function carteMembreCe(m) {
  const rolesCe = (m.roles ?? []).filter((r) => /comit[ée] ex[ée]cutif|responsable|pr[ée]siden|vice-pr[ée]siden/i.test(r));
  const numero = numeroDistrict(m);
  return `<article class="carte elu">
    ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${echapper(m.fonction ?? '')}${m.district ? ` — ${echapper(m.district)}` : ''}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${rolesCe.map((r) => `<span class="puce">${echapper(r)}</span>`).join('')}
      </div>
      ${numero ? `<p style="margin:4px 0 0; font-size:13px"><a href="#elu-${numero}">${tr('Sa fiche au conseil municipal', 'Their city council profile')}</a></p>` : ''}
    </div>
  </article>`;
}

function rendreComiteExecutif() {
  if (!$('#liste-ce') || !etat.elus) return;
  const membres = membresComiteExecutif();
  if (!membres.length) {
    $('#compte-ce').textContent = tr(
      "Aucun rôle « comité exécutif » dans la liste des élus publiée par la Ville — la composition sera affichée dès que le jeu de données la donnera.",
      "No 'executive committee' role appears in the City's list of elected officials — the membership will be shown as soon as the data set includes it."
    );
    return;
  }
  // Crochet VILLE.rangComiteExecutif(m) : l'ordre propre à une ville (Lévis : le maire, la vice-présidence, les membres).
  const rang = VILLE.rangComiteExecutif ?? ((m) => (VILLE.regexMaire.test(m.fonction ?? '') ? 0 : /pr[ée]siden/i.test(m.roles.join(' ')) && !/vice/i.test(m.roles.join(' ')) ? 1 : /vice-pr[ée]siden/i.test(m.roles.join(' ')) ? 2 : 3));
  membres.sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom));
  // VILLE.comiteSelonFonctions (Lévis) : la composition vient des fonctions de la page des membres du conseil.
  $('#compte-ce').textContent = VILLE.comiteSelonFonctions
    ? tr(`${membres.length} membres, d'après les fonctions publiées sur la page des membres du conseil.`, `${membres.length} members, based on the positions published on the council members page.`)
    : tr(
      `${membres.length} membres, d'après les rôles publiés dans la liste des élus de la Ville.`,
      `${membres.length} members, based on the roles published in the City's list of elected officials.`
    );
  $('#liste-ce').innerHTML = `<div class="grille-elus">${membres.map(carteMembreCe).join('')}</div>`;
}

function rendreAgglomeration() {
  if (!$('#liste-agglo') || !etat.agglomeration) return;
  const a = etat.agglomeration;
  const villes = Object.entries(a.villes ?? {}).sort((x, y) => y[1] - x[1]);
  const sieges = VILLE.agglomeration?.sieges;
  // Avec VILLE.agglomeration.sieges : nos listes de présences relèvent plus de personnes que de sièges,
  // parce que les remplaçants y figurent ; on le dit, plutôt que de laisser croire à un conseil plus grand.
  $('#compte-agglo').textContent = (sieges
    ? (EN
      ? `The council has ${sieges} seats. ${a.nombre} people held them over ${a.seancesAnalysees} meetings in ${a.parametres.annee}, replacements included — `
      : `Le conseil compte ${sieges} sièges. ${a.nombre} personnes les ont occupés sur ${a.seancesAnalysees} séances ` +
        `de ${a.parametres.annee}, remplaçants compris — `)
    : VILLE.agglomeration?.reconstituee ? `${a.nombre} membres à la dernière séance — ` : tr(`${a.nombre} membres — `, `${a.nombre} members — `)) + villes.map(([v, n]) => `${v} : ${n}`).join(' · ');

  // Les villes liées d'abord : ce sont elles qu'on ne trouve nulle part ailleurs sur le site.
  const membres = [...a.membres].sort((x, y) => {
    const xm = (x.ville ?? '') === VILLE.nom ? 1 : 0;
    const ym = (y.ville ?? '') === VILLE.nom ? 1 : 0;
    return xm - ym || (sieges ? y.presences - x.presences : (x.ville ?? '').localeCompare(y.ville ?? '') || x.nom.localeCompare(y.nom));
  });
  $('#liste-agglo').innerHTML = `<div class="grille-elus">${membres.map(carteMembreAgglo).join('')}</div>`;
}

// ---------- carte des districts ----------
// Projection Web Mercator, calculée ici : 58 polygones en SVG, aucune librairie et aucun
// serveur de tuiles à appeler. La page reste autonome et ne fuit rien vers l'extérieur.
function projeter([lon, lat]) {
  const x = (lon * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
  return [x, y];
}

// Teintes franches, cernées de noir par la feuille de style : la carte doit tenir le
// même langage que le reste. Dix-neuf arrondissements : dix-neuf teintes, aussi distinctes
// que possible pour des voisins.
const PALETTE_ARRONDISSEMENT = [
  '#0E4FC1', '#1E6A3C', '#C22B1D', '#FFD24D', '#7A4FA3', '#D97706', '#0891B2', '#65A30D',
  '#DB2777', '#92400E', '#4338CA', '#059669', '#A21CAF', '#CA8A04', '#DC2626', '#2563EB',
  '#0D9488', '#9F1239', '#64748B',
];

function couleurs(districts, mode) {
  if (mode === 'parti') {
    const partis = [...new Set(districts.map((d) => d.parti).filter(Boolean))].sort();
    const tons = ['#0E4FC1', '#FFD24D', '#7A4FA3', '#1E6A3C'];
    const table = new Map(partis.map((p, i) => [p, tons[i % tons.length]]));
    return { cle: (d) => d.parti, table };
  }
  // VILLE.paletteArrondissements { nom: couleur } (Longueuil) : une teinte choisie par arrondissement,
  // dans l'ordre de la Ville, plutôt que la palette dans l'ordre alphabétique.
  if (VILLE.paletteArrondissements) return { cle: (d) => d.arrondissement, table: new Map(Object.entries(VILLE.paletteArrondissements)) };
  const arrs = [...new Set(districts.map((d) => d.arrondissement).filter(Boolean))].sort();
  const table = new Map(arrs.map((a, i) => [a, PALETTE_ARRONDISSEMENT[i % PALETTE_ARRONDISSEMENT.length]]));
  return { cle: (d) => d.arrondissement, table };
}

function rendreCarte() {
  if (VILLE.carteParParti) return rendreCarteParParti();
  const { districts, cadre } = etat.districts;
  const mode = $('#mode-couleur')?.value ?? 'arrondissement';
  const { cle, table } = couleurs(districts, mode);

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
    `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${VILLE.quartiers ? voc('carte', '', '').replace('{n}', districts.length) : tr(`Carte des ${districts.length} districts électoraux de la Ville de ${VILLE.nom}`, `Map of the ${districts.length} electoral districts of the City of ${VILLE.nom}`)}">` +
    districts
      .map(
        (d) =>
          `<path d="${chemin(d.anneaux)}" class="district" data-numero="${d.numero}" ` +
          `fill="${table.get(cle(d)) ?? '#999'}" tabindex="0" role="button" ` +
          (VILLE.quartiers   // Ottawa : « Quartier / Ward », nom français du quartier (d.nomFr)
            ? `aria-label="${tr('Quartier', 'Ward')} ${d.numero} — ${echapper((EN ? d.nom : d.nomFr) ?? '')}"><title>${echapper((EN ? d.nom : d.nomFr) ?? '')} (${d.numero})`
            : `aria-label="District ${d.numero} — ${echapper(d.nom ?? '')}"><title>${echapper(d.nom ?? '')} (${d.numero})`) +
          ` — ${echapper(d.conseiller ?? '')}${d.conseillerArrondissement ? tr(" (conseil d'arrondissement)", ' (borough council)') : ''}</title></path>`
      )
      .join('') +
    '</svg>';

  $('#legende').innerHTML = [...table.entries()]
    .map(([valeur, couleur]) => `<span class="cle-legende"><i style="background:${couleur}"></i>${echapper(VILLE.quartiers ? (EN ? valeur : districts.find((d) => d.arrondissement === valeur)?.arrondissementFr ?? valeur) : lib(valeur))}</span>`)
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
  // ANGLO : l'inverse, le terme anglais et son équivalent français (data/lexique-fr.json).
  const en = ANGLO ? (EN ? null : etat.lexiqueFr?.entrees?.[e.terme]) : EN ? etat.lexiqueEn?.entrees?.[e.terme] : null;
  return `<div class="entree-lexique">
      <h3 class="terme">${echapper(e.terme)}${en?.equivalent ? ` <span class="alias" lang="${ANGLO ? 'fr' : 'en'}">(${echapper(en.equivalent)})</span>` : ''}</h3>
      ${(en ? en.aussi : e.aussi) ? `<p class="alias">${tr('On dit aussi&nbsp;:', 'Also called:')} ${echapper(en ? en.aussi : e.aussi)}</p>` : ''}
      <p class="definition">${echapper(en?.definition ?? e.definition)}</p>
      ${(en?.ouVousLeVoyez ?? e.ouVousLeVoyez) ? `<p class="remarque">${echapper(en?.ouVousLeVoyez ?? e.ouVousLeVoyez)}</p>` : ''}${VILLE.lexiqueExemples ? '\n      ' + exempleLexique(e) : ''}
    </div>`;
}

function lexiqueFiltre() {
  const q = ($('#rech-lexique')?.value ?? '').trim().toLowerCase();
  return etat.lexique.entrees.filter((e) => {
    if (!q) return true;
    const en = ANGLO ? etat.lexiqueFr?.entrees?.[e.terme] : etat.lexiqueEn?.entrees?.[e.terme];
    return [e.terme, e.aussi ?? '', e.definition, e.ouVousLeVoyez ?? '', en?.equivalent ?? '', en?.definition ?? '', en?.aussi ?? ''].join(' ').toLowerCase().includes(q);
  });
}

function rendreLexique() {
  const entrees = lexiqueFiltre();
  // L'ordre et les clés viennent du lexique français ; le titre anglais, clé par clé (lexique-en.json).
  const categories = (ANGLO && !EN && etat.lexiqueFr?.categories) || etat.lexique.categories || {};
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
        `<summary><h2 class="section">${echapper((EN && etat.lexiqueEn?.categories?.[cle]) || titre)}<span class="compte-cat">${dedans.length} ${tr(s(dedans.length, 'terme', 'termes'), s(dedans.length, 'term', 'terms'))}</span></h2></summary>` +
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
export function evenementsRecents() {
  // Page pré-rendue, jeux complets pas encore chargés : le fil vient de data/pages/accueil.json, le
  // début du même fil, déjà trié et choisi au build (quebec/scripts/prerendre.js).
  if (!etat.decisions && etat.fil) {
    const { evenements, mode, total } = etat.fil;
    return { evenements, nouveaux: evenements, mode, total };
  }
  const evenements = [];
  for (const d of etat.decisions?.decisions ?? []) {
    // Martin, 9 nov. 2026 : le fil ne montre que les décisions qui ont un résumé IA.
    // ANGLO sans résumé : VILLE.filSansResume(d) choisit (Vancouver : les points divisés ou rejetés).
    if (ANGLO && !etat.parId.size) { if (VILLE.filSansResume && !VILLE.filSansResume(d)) continue; }
    else if (!aResume(d)) continue;   // aResume : la règle du résumé, avec le repli des villes sans résumés
    if (d.theme === 'procedure') continue;   // ni ordre du jour ni procès-verbal en vitrine, même résumés (9 nov. 2026)
    if (VILLE.horsDecisions && !estDecision(d)) continue;   // ni procès-verbal ni point de procédure (Lévis)
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
        }. <a href="${PAGE.decisions}?q=${encodeURIComponent(v.numero ?? '')}">${tr('Voir le détail', 'See details')}</a>
      </p>`;
    return lienFil(entete);
  }

  const d = e.data;
  if (VILLE.ficheFaits) return lienFil(`${pucesDecision(d, { nouveau: e.nouveau, genre: true })}<p class="objet">${echapper(objetDecision(d))}</p>`);
  const entete = `<div class="meta">
      <span class="puce genre-decision">${ANGLO && d.ordreDuJour ? tr('à l’ordre du jour', 'on the agenda') : ANGLO && d.information ? tr('information', 'information') : tr('décision', 'decision')}</span>
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${e.nouveau && resumePour(d)?.r?.puces?.length && !resumePour(d).r.sansContenuSubstantiel ? `<span class="puce neuf">${tr('nouveau', 'new')}</span>` : ''}
      ${ANGLO ? enteteVoteAnglo(d) : ''}
    </div>
    <p class="objet">${echapper(objetDe(d) ?? tr('(sans objet)', '(no subject)'))}</p>`;
  const corps = `${blocContexte(d)}${blocResume(resumePour(d))}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${tr('Document officiel (PDF) ↗', 'Official document (PDF, in French) ↗')}</a>` : ''}
    ${actionsFiche(d)}`;
  return lienFil(entete);
}

// 19 nov. 2026 (Martin) : sur l'accueil, « Ce qui a changé » montre des cartes fermées ; un clic
// mène en haut de la page Décisions, sans filtrer.
function lienFil(entete) {
  return `<a class="carte pliante fil-lien" href="${PAGE.decisions}">${entete}</a>`;
}

function rendreFil() {
  if (!$('#fil')) return;
  const { evenements, nouveaux, mode } = evenementsRecents();
  const source = mode === 'nouveautes' ? nouveaux : evenements;
  const aMontrer = source.slice(0, etat.limiteFil);

  // Le titre suffit à dire ce qu'on regarde. Le détail de l'extraction (date, nombre de
  // nouveautés) vit sur la page « Sources et limites », là où on va quand on se pose la
  // question — pas en travers du fil quand on veut juste lire.
  $('#titre-fil').textContent = mode === 'nouveautes' ? tr('Ce qui a changé', "What's new") : ANGLO && !etat.parId.size ? voc('titreFil', 'Activité récente', 'Recent activity') : tr('Activité récente', 'Recent activity');
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
  if (VILLE.accueilProcesVerbaux) return rendreAccueilProcesVerbaux();
  const chiffres = [];
  if (etat.decisions) {
    // Les résolutions seules : les fiches de procès-verbaux et d'ordres du jour sont des
    // documents, pas des décisions (voir totalDecisions).
    if (VILLE.fenetre) chiffres.push(...chiffresFenetre());   // la fenêtre de dates, pas l'année
    else chiffres.push({ n: nombreFr(totalDecisions()), quoi: tr(`décisions publiées en ${etat.decisions.parametres.annee}`, `decisions published in ${etat.decisions.parametres.annee}`), lien: PAGE.decisions });
  }
  // VILLE.chiffreVotes(etat, tr, nombreFr) → { n, quoi } : le chiffre des votes propre à la ville.
  if (etat.votes && VILLE.chiffreVotes) chiffres.push({ ...VILLE.chiffreVotes(etat, tr, nombreFr), lien: PAGE.decisions });
  else if (etat.votes) {
    // Les votes peuvent couvrir plus d'une année (Longueuil : 2025 et 2026) : la phrase le dit.
    const depuis = etat.votes.parametres?.annees?.length > 1 ? etat.votes.parametres.annees[0] : null;
    chiffres.push({ n: nombreFr(etat.votes.nombre), quoi: depuis ? tr(`votes nominatifs consignés depuis ${depuis}`, `recorded votes since ${depuis}`) : tr('votes nominatifs consignés cette année', 'recorded votes this year'), lien: `${PAGE.decisions}?vote=1` });
  }
  if (etat.resumes) {
    // Décisions qui affichent un résumé (procédure exclue, 9 nov. 2026), pas le total brut du fichier.
    chiffres.push({ n: nombreFr(etat.decisions ? etat.decisions.decisions.filter((d) => resumePour(d)).length : etat.resumes.nombre), quoi: tr('décisions résumées en langage clair', 'decisions summarized in plain language'), lien: PAGE.decisions });
  }
  if (etat.elus) {
    const membres = VILLE.libelleMembres ?? ['membres du conseil municipal', 'members of City Council'];
    chiffres.push({ n: etat.elus.nombre, quoi: tr(membres[0], membres[1]), lien: PAGE.conseil });
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
  if (VILLE.etatDetaille) return rendreEtatDetaille();
  const lignes = [];
  const ajouter = (nom, data, extra) => {
    if (!data) {
      lignes.push(`<tr><td>${nom}</td><td colspan="2">${tr('non chargé', 'not loaded')}</td></tr>`);
      return;
    }
    lignes.push(`<tr><td>${nom}</td><td>${new Date(data.generatedAt).toLocaleString(EN ? 'en-CA' : 'fr-CA')}</td><td class="n">${extra}</td></tr>`);
  };
  // VILLE.lignesSources(ajouter, { etat, tr, nombreFr }) : les lignes du tableau propres à la ville.
  if (VILLE.lignesSources) VILLE.lignesSources(ajouter, { etat, tr, nombreFr });
  else {
  ajouter(tr('Décisions', 'Decisions'), etat.decisions, etat.decisions ? `${etat.decisions.nombre} / ${etat.decisions.totalDisponible}` : '');
  ajouter(tr('Votes nominatifs', 'Recorded votes'), etat.votes, etat.votes ? `${etat.votes.nombre} / ${etat.votes.totalDisponible}` : '');
  ajouter(tr('Résumés en langage clair', 'Plain-language summaries'), etat.resumes, etat.resumes ? `${etat.resumes.nombre}` : '');
  ajouter(tr('Membres du conseil', 'Council members'), etat.elus, etat.elus ? `${etat.elus.nombre}` : '');
  ajouter(tr('Districts électoraux', 'Electoral districts'), etat.districts, etat.districts ? `${etat.districts.nombre}` : '');
  if (VILLE.agglomeration) ajouter(tr("Conseil d'agglomération", 'Urban Agglomeration Council'), etat.agglomeration, etat.agglomeration ? `${etat.agglomeration.nombre}` : '');
  if (VILLE.presences) ajouter(tr('Présences aux séances', 'Meeting attendance'), etat.presences, etat.presences ? `${etat.presences.seances.length} ${tr('séances', 'meetings')}` : '');
  if (etat.decisions?.seances) {
    lignes.push(`<tr><td>${tr("Séances de l'année", 'Meetings this year')}</td><td>${etat.decisions.seancesLues ?? 0} ${tr('procès-verbaux lus', 'minutes read')}</td><td class="n">${etat.decisions.seancesEnAttente ?? 0} ${tr('en attente', 'awaiting')}</td></tr>`);
  }
  if (VILLE.cucq) ajouter(tr("Commission d'urbanisme (CUCQ)", 'Urban Planning Commission (CUCQ)'), etat.cucq, etat.cucq ? `${etat.cucq.nombre}` : '');
  }
  $('#etat-donnees').innerHTML =
    `<table><thead><tr><th>${tr('Jeu', 'Dataset')}</th><th>${tr('Dernière extraction', 'Last extraction')}</th><th class="n">${tr('Chargé / disponible', 'Loaded / available')}</th></tr></thead><tbody>${lignes.join('')}</tbody></table>` +
    (etat.resumes?.modele ? `<p class="compte">${tr('Modèle utilisé pour les résumés&nbsp;:', 'Model used for the summaries:')} <code>${echapper(etat.resumes.modele)}</code>.</p>` : '') +
    // VILLE.noteSources(etat, tr, echapper) : une note sous le tableau (Vancouver : le robots.txt lu).
    (VILLE.noteSources?.(etat, tr, echapper) ?? '');

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
// Les jeux propres à certaines villes, lus seulement si ville.js les déclare (sinon un 404 par page).
const JEUX_EN_PLUS = [
  ...(VILLE.agglomeration ? ['agglomeration'] : []),
  ...(VILLE.cucq ? ['cucq'] : []),
  ...(VILLE.presences ? ['presences'] : []),
  ...(VILLE.presencesOuvertes ? ['presences'] : []),
];
// VILLE.resumes === false : pas de data/resumes.json (Laval, résumés éteints). VILLE.sommaires : data/sommaires.json.
const JEU_RESUMES = VILLE.resumes === false ? [] : ['resumes'];
const JEU_SOMMAIRES = VILLE.sommaires ? ['sommaires'] : [];
const BESOINS = VILLE.besoins ?? {
  accueil: ['decisions', 'votes', 'elus', ...JEU_RESUMES, ...JEU_SOMMAIRES],
  decisions: ['decisions', ...JEU_RESUMES, ...JEU_SOMMAIRES, 'votes-decisions', ...(VILLE.votesDetailles ? ['votes'] : [])],
  votes: ['votes', 'elus'],
  conseil: ['elus', 'districts', 'votes', 'decisions', ...JEUX_EN_PLUS],
  lexique: ['lexique'],
  sources: ['decisions', 'votes', 'elus', ...JEU_RESUMES, ...JEU_SOMMAIRES, 'districts', ...JEUX_EN_PLUS, ...(VILLE.etatDetaille ? ['lexique'] : [])],
};

// Les jeux complets de la page, chargés une seule fois. Sur une page pré-rendue, on ne les demande
// qu'au premier geste qui en a besoin (recherche, filtre, « afficher plus ») : le premier écran est
// déjà dans le HTML.
let promesseJeux = null;
function chargerJeux(page) {
  promesseJeux ??= (async () => {
    const noms = BESOINS[page] ?? [];
    const jeux = await Promise.all(noms.map(charger));
    noms.forEach((nom, i) => {
      etat[nom] = jeux[i];
    });
    // En anglais : les puces traduites remplacent les françaises, et l'objet de chaque décision
    // aussi (data/resumes-en.json). Ce qui n'est pas encore traduit reste en français, et le dit.
    // VILLE.apresChargement({ etat, EN, charger, page }) : traductions propres à la ville (volets anglophones).
    await VILLE.apresChargement?.({ etat, EN, charger, page });
    if (EN && !ANGLO && (etat.resumes || etat.decisions)) {
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
    if (EN && !ANGLO && page === 'lexique') etat.lexiqueEn = await charger('lexique-en');
    if (ANGLO && !EN && page === 'lexique') etat.lexiqueFr = await charger('lexique-fr');
    etat.parId = new Map((etat.resumes?.resumes ?? []).map((r) => [r.id, r]));
    etat.sommairesLus = new Map((etat.sommaires?.sommaires ?? []).map((x) => [x.numero, x]));
    etat.seancesParId = new Map((etat.decisions?.seances ?? []).map((x) => [x.id, x]));
    // Le manifeste de l'archive vit dans un sous-dossier ; seule la page des sources le lit,
    // et elle ne lit que le manifeste, jamais les fichiers d'années eux-mêmes.
    if (page === 'sources' && VILLE.archives) etat.archives = await charger('archives/index');
  })();
  return promesseJeux;
}

// PRÉ-RENDU (6 nov. 2026, Québec). quebec/scripts/prerendre.js exécute ce même moteur au build et écrit
// le premier écran dans le HTML (body[data-prerendu]). Ici, rien à redessiner : la page est déjà la
// bonne. Seul un lien profond (?q=, ?instance=, ?projet=, ?vote=) change le premier écran : celui-là
// se rend comme avant, jeux complets chargés. Une page sans data-prerendu se rend toujours.
const PRERENDU = document.body.dataset.prerendu === '1';

// VILLE.accesVille = { reactiver } (Longueuil, Laval) : quand la Ville ne répond plus à notre robot
// (data/acces-ville.json, écrit par scrapers/seances.js), un bandeau le dit sur chaque page : le
// lecteur doit savoir que les données peuvent avoir du retard, et depuis quand.
async function bandeauAccesVille() {
  if (!VILLE.accesVille) return;
  const acces = await charger('acces-ville');
  if (!acces?.echecDepuis) return;
  const avis = document.createElement('div');
  avis.className = 'avis';
  avis.setAttribute('role', 'status');
  const depuis = dateFr(acces.echecDepuis.slice(0, 10));
  const reussite = acces.derniereReussite ? dateFr(acces.derniereReussite.slice(0, 10)) : null;
  avis.innerHTML =
    `<strong>Mise à jour interrompue depuis le ${depuis}.</strong> Le site de la Ville de ${VILLE.nom} ne répond plus ` +
    'à notre outil de mise à jour automatique. Les données de cette page peuvent donc avoir du retard' +
    (reussite ? `&nbsp;: la dernière lecture réussie du calendrier des séances date du ${reussite}.` : '.') +
    // Robot éteint depuis la pause (11 nov. 2026) : plus de « nous vérifions chaque jour », mais la réactivation.
    (VILLE.accesVille.reactiver ? ` <a class="bouton-reactiver" href="${VILLE.accesVille.reactiver}" rel="noopener">Réactiver pour 150&nbsp;$ →</a>` : '');
  const repere = $('#chargement') ?? document.querySelector('main') ?? document.body.firstElementChild;
  repere?.parentNode?.insertBefore(avis, repere);
}

async function init() {
  const page = document.body.dataset.page;
  bandeauAccesVille();
  const parametres = new URLSearchParams(location.search);
  const lienProfond = (page === 'decisions' && ['q', 'instance', 'projet', 'vote', 'district'].some((p) => parametres.has(p))) || (page === 'votes' && parametres.has('q'));
  if (PRERENDU && !lienProfond && !EN) return;
  await chargerJeux(page);

  const requis = { accueil: 'decisions', decisions: 'decisions', votes: 'votes', conseil: 'elus', lexique: 'lexique', sources: null }[page];
  if (requis && !etat[requis] && !(page === 'conseil' && VILLE.elusDistrictsNumerotes && etat.districts)) {
    messageSansDonnees();
    return;
  }
  // Les pages qui vivent des procès-verbaux : si la dernière extraction n'en a lu aucun, on ne
  // remplit pas la page de zéros, on dit ce qui s'est passé.
  if (['accueil', 'decisions'].includes(page) && extractionEnPanne(etat.decisions)) {
    messageExtractionEnPanne(etat.decisions);
    return;
  }
  if ($('#chargement')) $('#chargement').hidden = true;
  // Lien profond sur une page pré-rendue : le script en ligne avait caché la liste du premier écran.
  if (PRERENDU && $('#liste-decisions')) $('#liste-decisions').hidden = false;

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
        `<p class="compte" id="filtre-projet">${tr('Projet&nbsp;:', 'Project:')} <strong>${echapper(etat.decisions.projets[projet].titre)}</strong> — ${nombreFr(etat.decisions.projets[projet].n)} ${tr('décision(s)', 'decision(s)')}. <a href="${PAGE.decisions}">${tr('Voir toutes les décisions', 'See all decisions')}</a></p>`
      );
    }
    rendreDecisions();
    if (instance && [...$('#filtre-instance').options].some((o) => o.value === instance)) {
      $('#filtre-instance').value = instance;
      rendreDecisions();
    }
    // ?type= et ?theme= : un lien peut aussi arriver avec un type ou un sujet déjà choisi.
    let refaire = false;
    for (const [param, id] of [['type', '#filtre-type'], ['theme', '#filtre-theme']]) {
      const valeur = parametres.get(param);
      if (valeur && $(id) && [...$(id).options].some((o) => o.value === valeur)) { $(id).value = valeur; refaire = true; }
    }
    if (refaire) rendreDecisions();
    // Un lien de courriel peut viser un document d'une année passée : la recherche venue de
    // l'adresse n'a rien trouvé, donc on va voir dans l'archive avant de dire qu'il n'y a rien.
    if (recherche && !$('#liste-decisions').querySelector('.carte')) chercherDansArchive(recherche);
    else if (recherche) { const seules = $('#liste-decisions').querySelectorAll('details.carte'); if (seules.length === 1) { for (let p = seules[0]; p; p = p.parentElement?.closest('details')) p.open = true; seules[0].scrollIntoView({ block: 'center' }); } }
  }
  if (page === 'votes') {
    // ?q=Nom : arriver depuis la fiche d'un élu (page Conseil) sur ses votes.
    const recherche = new URLSearchParams(location.search).get('q');
    if (recherche && $('#rech-votes')) $('#rech-votes').value = recherche;
    rendreVotes();
  }
  if (page === 'conseil') {
    if (etat.votes) rendreDissidence(etat.votes.votes);
    if (etat.districts) rendreCarte();
    rendreElus();
    rendreComiteExecutif();
    rendreAgglomeration();
    rendreCucq();
    rendreArrondissements();
  }
  if (page === 'lexique') rendreLexique();
  if (page === 'sources') rendreEtat();
}

// Filtres et pagination : câblés seulement si la page les contient.
// Sur une page pré-rendue, chaque geste attend d'abord les jeux complets (chargerJeux, une fois).
const jeux = () => chargerJeux(document.body.dataset.page);
document.addEventListener('input', async (e) => {
  if (e.target.matches('#rech-decisions, #filtre-type, #filtre-instance, #filtre-theme, #filtre-resume, #filtre-vote, #affichage')) {
    await jeux();
    etat.limiteDecisions = PAS;
    etat.limiteSeances = PAS_SEANCES;
    rendreDecisions();
  }
  if (e.target.matches('#rech-lexique')) { await jeux(); rendreLexique(); }
  if (e.target.matches('#rech-votes, #filtre-instance-votes, #filtre-theme-votes')) {
    await jeux();
    etat.limiteVotes = PAS_VOTES_DEPART;
    rendreVotes();
  }
});
// Le chargement part dès qu'une main approche des outils : la frappe qui suit n'attend presque plus.
for (const geste of ['focusin', 'pointerdown']) {
  document.addEventListener(geste, (e) => {
    if (PRERENDU && e.target.closest?.('.barre-outils, #plus-decisions, #plus-votes')) jeux();
  });
}
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
  $('#plus-decisions').addEventListener('click', async () => {
    await jeux();
    etat.limiteDecisions += PAS;
    etat.limiteSeances += PAS_SEANCES;
    rendreDecisions();
  });
}
// L'accueil montre 3 décisions résumées ; le bouton mène à la page Décisions (9 nov. 2026).
if (existe('#plus-fil')) {
  $('#plus-fil').addEventListener('click', () => {
    location.href = `${PAGE.decisions}${EN && VILLE.langueDefaut !== 'en' ? '?lang=en' : ''}`;   // VILLE.langueDefaut 'en' : pas de ?lang
  });
}
if (existe('#plus-votes')) {
  $('#plus-votes').addEventListener('click', async () => {
    await jeux();
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
document.addEventListener('change', async (e) => {
  if (!e.target.matches('#mode-couleur')) return;
  etat.districts ??= await charger('districts');
  if (etat.districts) rendreCarte();
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

// Exporté pour quebec/scripts/prerendre.js, qui attend la fin du rendu avant d'écrire la page.
export const rendu = init();
export { etat };

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
    try { localStorage.setItem(VILLE.cleZoom ?? 'dvq:zoom', String(z)); } catch {}
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
  // VILLE.votesDetailles (Longueuil, Laval) : data/votes.json garde chaque vote et ce sur quoi il porte.
  // Un même numéro peut en porter plusieurs (un amendement, puis la proposition) : on les montre tous.
  if (VILLE.votesDetailles) {
    const tous = (etat.votes?.votes ?? []).filter((x) => x.numero === numero);
    if (tous.length) {
      if (!fiche.querySelector('.bloc-vote')) fiche.querySelector('.corps')?.insertAdjacentHTML('afterbegin', tous.map(blocVoteDetail).join(''));
      return;
    }
  }
  const v = jeu?.v?.[numero];
  if (!v || fiche.querySelector('.bloc-vote')) return;
  const [resultat, pour, contre, demandeur, pdf, abstentions = [], absents = [], conflits = []] = v;   // ANGLO : trois listes de plus
  const noms = (l) => l.map((i) => echapper(jeu.noms[i])).join(', ');
  fiche.querySelector('.corps')?.insertAdjacentHTML('afterbegin', `<div class="bloc-vote">
    <div class="resume-entete">${tr('Vote nominatif', 'Recorded vote')} · ${echapper(ANGLO ? lib(resultat) : resultat)} · ${pour.length} ${tr('pour', 'for')}, ${contre.length} ${tr('contre', 'against')}</div>
    <p style="margin:0 0 4px"><strong>${tr('Pour', 'For')}</strong> : ${noms(pour) || '—'}</p>
    <p style="margin:0 0 4px"><strong>${tr('Contre', 'Against')}</strong> : ${noms(contre) || '—'}</p>
    ${ANGLO && abstentions.length ? `<p style="margin:0 0 4px"><strong>${tr('Abstention', 'Abstained')}</strong> : ${noms(abstentions)}</p>` : ''}
    ${ANGLO && absents.length ? `<p style="margin:0 0 4px"><strong>${tr('Absent', 'Absent')}</strong> : ${noms(absents)}</p>` : ''}
    ${VILLE.conflits && conflits.length ? `<p style="margin:0 0 4px"><strong>${tr('Conflit déclaré', 'Declared conflict')}</strong> : ${noms(conflits)}</p>` : ''}
    ${demandeur ? `<p class="compte" style="margin:0">${tr('Vote demandé par', 'Vote called by')} ${echapper(demandeur)}.</p>` : ''}
    ${pdf ? `<p class="compte" style="margin:2px 0 0"><a href="${echapper(pdf)}" target="_blank" rel="noopener">${ANGLO ? voc('lienSource', '', '') : tr('Résolution officielle (PDF) ↗', 'Official resolution (PDF, in French) ↗')}</a></p>` : ''}
  </div>`);
}, true);

// CONTRAT AU SEAO (16 nov. 2026, comme à Québec). Sur une fiche de décision qui adjuge un contrat, le
// contrat déclaré au SEAO (scrapers/contrats.js → data/contrats-decisions.json, lu une seule fois).
let contratsParDecision = null;
document.addEventListener('toggle', async (e) => {
  const fiche = e.target;
  if (!PAGE.contrats) return;   // pas de page Contrats, pas de data/contrats-decisions.json (Longueuil, Laval)
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
    <div class="resume-entete">${tr('Contrat déclaré au SEAO', 'Contract declared in SEAO')} · <a href="${PAGE.contrats}${EN ? '?lang=en' : ''}">${tr('tous les contrats', 'all contracts')}</a></div>
    <ul>${lignes}</ul></div>`);
}, true);

// ========== FICHES TIRÉES DU PROCÈS-VERBAL ET DE L'ORDRE DU JOUR (Laval d'abord, 20 nov. 2026) ==========
// Fonctions venues de laval/assets/app.js, chacune allumée par un drapeau de ville.js ou par la donnée
// elle-même (liste des clés en tête de montreal/assets/ville.js). Laval n'a pas d'anglais : textes en français.

// « 18h30 » (tel qu'écrit dans les noms de fichiers de la Ville) -> « 18 h 30 » ; « 09h00 » -> « 9 h ».
function heureFr(heure) {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(heure ?? '');
  if (!m) return heure ?? '';
  return `${Number(m[1])} h${m[2] && m[2] !== '00' ? ' ' + m[2] : ''}`;
}

// « … .pdf#page=12 » -> 12. Les scrapers écrivent la page où la résolution commence.
function pageDuPdf(url) {
  const m = /#page=(\d+)/.exec(url ?? '');
  return m ? Number(m[1]) : null;
}

// VILLE.sommaires : ce que le PDF du sommaire décisionnel dit lui-même (service responsable, montant).
function sommairePour(d) {
  const cle = d.sommaireId ?? d.dossier;
  return cle ? etat.sommairesLus?.get(cle) ?? null : null;
}

// Le résumé d'un sommaire décisionnel (VILLE.resumeParSommaire) : « — sommaire SD-2026-1234 ».
function blocResumeSommaire(trouve) {
  const r = trouve?.r;
  if (!r) return '';
  return `<div class="resume">
    <div class="resume-entete">
      <span>Résumé généré par IA${r.id ? ` — sommaire ${echapper(r.id)}` : ''}</span>
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(sansCents(r.montantPrincipal))}</span>` : ''}
      ${r.sansContenuSubstantiel ? `<span class="puce procedural">${tr('document de procédure', 'procedural document')}</span>` : ''}
    </div>
    <ul>${(r.puces ?? []).map((p) => `<li>${echapper(sansCents(p))}</li>`).join('')}</ul>
  </div>`;
}

// « 05 – Marigot », comme la Ville l'écrit ; « Tous les districts » quand l'ordre du jour le dit (numéro 0).
function libelleDistrict(k) {
  if (!k) return '';
  if (!k.numero) return k.nom ?? 'Tous les districts';
  return `${String(k.numero).padStart(2, '0')} – ${k.nom ?? ''}`;
}

const estDocumentSeance = (d) => TYPES_DOCUMENTS.includes(d.type);

// VILLE.ficheFaits : les pastilles de l'en-tête. Le type n'est dit que quand ce n'est pas une résolution ;
// le montant et les districts touchés (d.montant, d.districts) quand l'ordre du jour les donne.
function pucesDecision(d, { nouveau = false, genre = false } = {}) {
  const districts = d.districts ?? [];
  return `<div class="meta">
      ${genre ? '<span class="puce genre-decision">décision</span>' : ''}
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      ${estDocumentSeance(d) ? '<span class="puce document">document de séance</span>' : d.type !== 'Résolution' ? `<span class="puce">${echapper(d.type)}</span>` : ''}
      ${d.instance ? `<span class="puce">${echapper(d.instance)}</span>` : ''}
      ${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(d.resultat)}</span>` : ''}
      ${d.voteEnregistre ? '<span class="puce genre-vote">vote nominal</span>' : ''}
      ${d.montant ? `<span class="puce montant">${echapper(d.montant)}</span>` : ''}
      ${districts.length > 3 ? `<span class="puce district">${districts.length} districts</span>` : districts.map((k) => `<span class="puce district">${echapper(libelleDistrict(k))}</span>`).join('')}
      ${nouveau ? '<span class="puce neuf">nouveau</span>' : ''}
    </div>`;
}

// Le corps : le résumé s'il existe, puis les faits du procès-verbal et de l'ordre du jour (qui propose,
// qui appuie, le certificat de trésorerie, les districts), puis les PDF officiels. Pas d'interprétation.
function corpsDecisionFaits(d) {
  if (estDocumentSeance(d)) {
    const contenu = [
      d.nombreResolutions != null ? `${nombreFr(d.nombreResolutions)} résolution${d.nombreResolutions > 1 ? 's' : ''} lue${d.nombreResolutions > 1 ? 's' : ''}` : '',
      d.nombrePages != null ? `${nombreFr(d.nombrePages)} page${d.nombrePages > 1 ? 's' : ''}` : '',
      d.nombrePoints ? `${nombreFr(d.nombrePoints)} point${d.nombrePoints > 1 ? 's' : ''} à l'ordre du jour` : '',
    ].filter(Boolean);
    return `${contenu.length ? `<p class="faits">${contenu.join(' · ')}.</p>` : ''}
      ${d.pdf ? `<p class="liens-pdf"><a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${echapper(d.type)} (PDF) ↗</a></p>` : ''}`;
  }
  const r = resumePour(d);
  const so = sommairePour(d);
  const page = pageDuPdf(d.pdf);
  const districts = d.districts ?? [];
  const comiteExecutif = /exécutif/i.test(d.instance ?? '');
  return `${blocContexte(d)}${blocResumeSommaire(r)}
    ${d.titre ? `<p class="faits">Au procès-verbal&nbsp;: «&nbsp;${echapper(d.titre)}&nbsp;».</p>` : ''}
    ${districts.length > 3 ? `<p class="faits">Districts touchés&nbsp;: ${districts.map((k) => echapper(libelleDistrict(k))).join(', ')}.</p>` : ''}
    ${so?.service ? `<p class="faits">Au sommaire décisionnel&nbsp;: service responsable, ${echapper(so.service)}${so.montant && !d.montant ? `&nbsp;; montant, ${echapper(so.montant)}` : ''}.</p>` : ''}
    ${d.proposeur ? `<p class="faits">Proposée par ${echapper(d.proposeur)}${d.appuyeur ? `, appuyée par ${echapper(d.appuyeur)}` : ''}.</p>` : ''}
    ${d.ct ? `<p class="faits">Certificat de trésorerie ${echapper(d.ct)}.</p>` : ''}
    ${d.dossier && !d.sommairePublie ? `<p class="faits">Sommaire décisionnel ${echapper(d.dossier)} — non publié par la Ville${comiteExecutif ? ' (les sommaires du comité exécutif ne le sont pas)' : ''}.</p>` : ''}
    <p class="liens-pdf">
      ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">Procès-verbal (PDF)${page ? `, page ${page}` : ''} ↗</a>` : ''}
      ${d.sommairePublie && d.sommairePdf ? `<a class="lien-pdf" href="${echapper(d.sommairePdf)}" target="_blank" rel="noopener">Sommaire décisionnel ${echapper(d.dossier ?? '')} (PDF) ↗</a>` : ''}
    </p>`;
}

function carteDecisionFaits(d, ouverte = false) {
  const entete = `${pucesDecision(d)}<p class="objet">${echapper(objetDecision(d))}</p>`;
  const corps = corpsDecisionFaits(d) + actionsFiche(d);
  if (estDocumentSeance(d)) return carteRepliable(entete, corps, ouverte);
  // data-montant : un montant à l'ordre du jour, au sommaire ou dans le résumé ouvre le détail de l'argent.
  const r = resumePour(d)?.r;
  const montant = d.montant || sommairePour(d)?.montant || (r?.montantPrincipal && !r.sansContenuSubstantiel) ? 1 : 0;
  const abonnes = `<div class="ab-fiche" data-dossier="${echapper(d[CLE_DOSSIER] ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}" data-montant="${montant}"
    data-statut="" data-etape="" data-echeance="" data-projets="[]"></div>`;
  return carteRepliable(entete, corps + abonnes, ouverte);
}

// ?district=5, depuis la fiche d'un élu : pas de menu, une pastille qui dit que le filtre est là.
function districtDemande() {
  const n = new URLSearchParams(location.search).get('district');
  return n && /^\d+$/.test(n) ? Number(n) : null;
}
function puceFiltreDistrict() {
  const district = districtDemande();
  if (district == null || document.getElementById('filtre-district') || !$('#compte-decisions')) return;
  const nom = etat.decisions.decisions.flatMap((d) => d.districts ?? []).find((k) => k.numero === district)?.nom;
  const chip = document.createElement('p');
  chip.id = 'filtre-district';
  chip.className = 'filtre-actif';
  chip.innerHTML = `Décisions dont l'ordre du jour nomme le district ${echapper(libelleDistrict({ numero: district, nom: nom ?? '' }))} · <a href="${PAGE.decisions}">retirer ce filtre</a>`;
  $('#compte-decisions').before(chip);
}

// VILLE.ficheFaits : le compte dit les fiches, les décisions et les documents de séance.
function compteDecisionsFaits(filtrees) {
  const { parametres, nombre } = etat.decisions;
  const documents = etat.decisions.decisions.filter(estDocumentSeance).length;
  return `${nombreFr(filtrees.length)} fiche(s) affichée(s) sur ${nombreFr(nombre)} lues dans les procès-verbaux de ${parametres.annee}` +
    ` — ${nombreFr(nombre - documents)} décisions et ${nombreFr(documents)} documents de séance` +
    (etat.decisions.seancesLues != null ? ` (${etat.decisions.seancesLues} séance(s) lue(s)${etat.decisions.seancesEnAttente ? `, ${etat.decisions.seancesEnAttente} en attente de procès-verbal` : ''}).` : '.') +
    (etat.parId.size ? ` ${nombreFr(etat.decisions.decisions.filter((d) => resumePour(d)).length)} portent un résumé en langage clair.` : '');
}

// VILLE.seancesParId : une séance a un identifiant (« CE-20260204-HC-09h11 ») ; la date et l'instance ne
// suffisent pas quand le comité exécutif siège deux fois le même jour, en public puis à huis clos.
const SOUS_TYPES = { Ordinaire: 'séance ordinaire', Extraordinaire: 'séance extraordinaire', Publique: 'séance publique', 'Huis clos': 'séance à huis clos' };

function libelleSeance(se, d) {
  const sousType = se?.sousTypeLibelle ?? d?.sousType ?? '';
  const heure = se?.pv?.heure ?? se?.heure ?? null;
  return `${SOUS_TYPES[sousType] ?? (sousType ? `séance ${sousType.toLowerCase()}` : 'séance')} du ${dateFr(se?.date ?? d?.date)}${heure ? `, ${heureFr(heure)}` : ''}`;
}

// Le titre d'un document de séance, réécrit d'après la séance (même instance, sous-type, date, heure).
function objetDecision(d) {
  if (!estDocumentSeance(d)) return d.objet ?? '(sans objet)';
  const se = VILLE.seancesParId ? etat.seancesParId?.get(d.seanceId) : null;
  if (!se) return d.objet ?? '(sans objet)';
  return `${d.type} — ${se.nom ?? d.instance ?? ''}, ${libelleSeance(se, d)}`;
}

function grouperParIdSeance(decisions) {
  const groupes = new Map();
  for (const d of decisions) {
    const cle = d.seanceId ?? `${d.date ?? '0000-00-00'}__${d.instance ?? ''}`;
    if (!groupes.has(cle)) {
      const se = etat.seancesParId?.get(d.seanceId) ?? null;
      groupes.set(cle, {
        id: cle,
        date: se?.date ?? d.date ?? '',
        instance: se?.nom ?? d.instance ?? '',
        rang: (se?.instance ?? (/exécutif/i.test(d.instance ?? '') ? 'CE' : 'CM')) === 'CM' ? 0 : 1,
        heure: se?.pv?.heure ?? se?.heure ?? '',
        libelle: libelleSeance(se, d),
        lignes: [],
      });
    }
    groupes.get(cle).lignes.push(d);
  }
  // Les plus récentes d'abord ; le même jour, le conseil avant le comité exécutif, puis l'heure.
  return [...groupes.values()].sort((a, b) => b.date.localeCompare(a.date) || a.rang - b.rang || a.heure.localeCompare(b.heure));
}

function rendreSeanceParId(g, ouverte = false) {
  const sansResume = g.lignes.filter((d) => !aResume(d));
  const autres = g.lignes.filter((d) => aResume(d));
  const lignes = [...autres.filter((d) => d.theme !== 'procedure'), ...autres.filter((d) => d.theme === 'procedure')];
  const blocSansResume = sansResume.length
    ? `<details class="seance-procedure"><summary>${etat.parId.size ? 'Sans résumé' : 'Procédure et documents de séance'} (${sansResume.length} point${sansResume.length > 1 ? 's' : ''})</summary>${sansResume.map((d) => carteDecision(d)).join('')}</details>`
    : '';
  const decisions = g.lignes.filter((d) => !estDocumentSeance(d)).length;
  const documents = g.lignes.length - decisions;
  return `<details class="seance"${ouverte ? ' open' : ''}>
      <summary class="seance-entete">
        <h3>${echapper(g.instance)}</h3>
        <span class="seance-date">${echapper(g.libelle)}</span>
        ${decisions ? `<span class="puce">${decisions} décision${decisions > 1 ? 's' : ''}</span>` : ''}
        ${documents ? `<span class="puce document">${documents} document${documents > 1 ? 's' : ''}</span>` : ''}
        ${boutonImprimer(tr('Imprimer cette séance, toutes ses décisions dépliées', 'Print this meeting, with all its decisions expanded'))}
        <button type="button" class="bouton-tout-ouvrir">${tr('Tout ouvrir', 'Expand all')}</button>
      </summary>
      <div class="seance-corps">${lignes.map((d, i) => carteDecision(d, ouverte && i === 0 && Boolean(resumePour(d)))).join('')}${blocSansResume}</div>
    </details>`;
}

// VILLE.votesDecompteImprime : « Adoptée » (après un vote), « Rejetée », « Maintenue » (décision de la présidence).
function classeResultatLarge(r) {
  if (r.includes('unanimité')) return 'r-unanimite';
  if (/rejet/i.test(r)) return 'r-rejetee';
  if (/adopt|accept|maintenu/i.test(r)) return 'r-majorite';
  return '';
}

const minusculeInitiale = (x) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);

// VILLE.votesDecompteImprime : le décompte imprimé par la Ville, recoupé avec les noms lus ; la page du PDF,
// le vote sur la conduite de la séance, le texte dégradé et le lien vers la décision.
function carteVoteImprimee(v) {
  const noms = (liste) =>
    liste.length
      ? `<div class="noms">${liste.map((n) => `<span class="nom">${echapper(n)}</span>`).join('')}</div>`
      : '<p class="vide">Aucun nom extrait.</p>';
  const pour = v.decomptePour ?? v.pour.length;
  const contre = v.decompteContre ?? v.contre.length;
  const page = pageDuPdf(v.pdf);
  const entete = `<div class="meta">
      ${puceTheme(v.theme)}
      ${v.numero ? `<span class="puce num">${echapper(v.numero)}</span>` : ''}
      <span>${dateFr(v.date)}</span>
      ${v.etiquette ? `<span class="puce">${echapper(v.etiquette)}</span>` : ''}
      ${v.resultat ? `<span class="resultat ${classeResultat(v.resultat)}">${echapper(v.resultat)}</span>` : ''}
      <span class="decompte"><span class="d-pour">${pour} pour</span><span class="d-contre">${contre} contre</span></span>
    </div>
    <p class="objet">${echapper(v.objet ?? '(sans objet)')}</p>`;
  const corps = `<p class="faits">Vote sur ${echapper(minusculeInitiale(v.etiquette) ?? 'la proposition')}${v.demandeParVote ? `, demandé par ${echapper(v.demandeParVote)}` : ''}.</p>
    <div class="colonnes-vote">
      <div class="colonne-vote pour">
        <h4>Pour${v.decomptePour != null ? ` — ${v.decomptePour} au décompte imprimé` : ''}</h4>
        ${noms(v.pour)}
      </div>
      <div class="colonne-vote contre">
        <h4>Contre${v.decompteContre != null ? ` — ${v.decompteContre} au décompte imprimé` : ''}</h4>
        ${noms(v.contre)}
      </div>
    </div>
    ${v.abstention ? `<p class="faits" style="margin-top:10px">Abstention&nbsp;: ${echapper(v.abstention)}.</p>` : ''}
    ${v.texteSourceDegrade ? '<p class="faits" style="margin-top:10px">Le texte du PDF était dégradé à cet endroit&nbsp;: lecture à vérifier sur le document.</p>' : ''}
    ${v.voteDeProcedure ? "<p class=\"faits\" style=\"margin-top:10px\">Vote sur la conduite de la séance, pas sur une décision : la Ville ne lui donne un numéro de résolution que s'il est adopté. Le passage se lit dans le procès-verbal, à la suite de la résolution en cours.</p>" : ''}
    ${v.avertissements?.length ? `<div class="drapeau"><strong>À vérifier&nbsp;:</strong> ${v.avertissements.map(echapper).join(' · ')}</div>` : ''}
    <details><summary>Voir le passage d'origine</summary><p>${echapper(v.brut)}</p></details>
    <p class="liens-pdf">
      ${v.pdf ? `<a class="lien-pdf" href="${echapper(v.pdf)}" target="_blank" rel="noopener">Procès-verbal (PDF)${page ? `, page ${page}` : ''} ↗</a>` : ''}
      ${v.numero && !v.voteDeProcedure ? `<a class="lien-pdf" href="${PAGE.decisions}?q=${encodeURIComponent(v.numero)}">La décision ${echapper(v.numero)}</a>` : ''}
    </p>`;
  return carteRepliable(entete, corps);
}

// VILLE.tableauPourContre : par personne, combien de fois contre, pour, nommée en tout ; ordre alphabétique.
function comptesParPersonne(votes) {
  const parPersonne = new Map();
  const fiche = (nom) => {
    if (!parPersonne.has(nom)) parPersonne.set(nom, { contre: 0, pour: 0 });
    return parPersonne.get(nom);
  };
  for (const v of votes) {
    for (const nom of v.contre) fiche(nom).contre++;
    for (const nom of v.pour) fiche(nom).pour++;
  }
  return [...parPersonne.entries()]
    .map(([nom, c]) => ({ nom, ...c, nommee: c.pour + c.contre }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function rendreDissidencePourContre(votes) {
  if (!$('#table-dissidence')) return;
  const tri = comptesParPersonne(votes);
  $('#table-dissidence tbody').innerHTML = tri
    .map((p) => `<tr><td>${echapper(p.nom)}</td><td class="n">${p.contre}</td><td class="n">${p.pour}</td><td class="n">${p.nommee}</td></tr>`)
    .join('');
  if ($('#resume-dissidence')) {
    $('#resume-dissidence').textContent = `${tri.length} personne${tri.length > 1 ? 's' : ''} nommée${tri.length > 1 ? 's' : ''} — décompte brut, sans interprétation`;
  }
}

// ---------- VILLE.elusDistrictsNumerotes : la mairie, puis les districts dans l'ordre de leur numéro ----------
// Noms comparés sans accents ni casse, espaces insécables et doubles espaces confondus.
const sansAccentsEspaces = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();

function votesContreParNom(m) {
  if (!etat.votes || !m.nomComplet) return null;
  const nom = sansAccentsEspaces(m.nomComplet);
  return etat.votes.votes.filter((v) => v.contre.some((n) => sansAccentsEspaces(n) === nom)).length;
}

// VILLE.presencesOuvertes : le jeu ouvert des présences, rangé par année (parAnnee). L'année demandée si la
// Ville y a publié des séances, sinon la plus récente qui en a ; l'année affichée est toujours dite.
function blocPresences() {
  const p = VILLE.presencesOuvertes ? etat.presences : null;
  if (!p) return null;
  if (Array.isArray(p.membres) && p.membres.length) return { annee: p.annee, nombreSeances: p.nombreSeances, membres: p.membres };
  const annees = [...new Set([p.annee, ...(p.annees ?? []), ...Object.keys(p.parAnnee ?? {})].filter(Boolean))].sort().reverse();
  for (const annee of annees) {
    const bloc = p.parAnnee?.[annee];
    if (bloc?.nombreSeances > 0 && bloc.membres?.length) return bloc;
  }
  return null;
}

// Par le numéro de district d'abord (la clé la plus sûre), sinon par le nom (le maire n'a pas de district).
function presencesDe(m) {
  const membres = blocPresences()?.membres ?? [];
  if (!membres.length) return null;
  const parDistrict = m.districtNumero ? membres.find((p) => p.districtNumero === m.districtNumero) : null;
  if (parDistrict) return parDistrict;
  const nom = sansAccentsEspaces(m.nomComplet);
  return membres.find((p) => sansAccentsEspaces(p.nomComplet) === nom) ?? null;
}

// Accord en genre d'après la fonction que la Ville écrit elle-même, jamais d'après le prénom.
const auFeminin = (...sources) => sources.some((f) => /^\s*(conseill[èe]re|mairesse|pr[ée]sidente|vice-pr[ée]sidente)/i.test(f ?? ''));

// « Stéphane Boyer » -> « SB ». Derrière la photo, pour quand elle ne charge pas.
function initiales(nomComplet) {
  return String(nomComplet ?? '').split(/[\s-]+/).filter(Boolean).slice(0, 3).map((mot) => mot.charAt(0).toUpperCase()).join('');
}

function habitantsFr(h) {
  if (h == null || h === '') return '';
  return typeof h === 'number' ? nombreFr(h) : String(h).trim();
}

// Les décisions de l'année dont l'ordre du jour nomme ce district (d.districts).
function decisionsDuDistrict(numero) {
  if (!etat.decisions || !numero) return 0;
  return etat.decisions.decisions.filter((d) => (d.districts ?? []).some((k) => k.numero === numero)).length;
}

function carteEluDistrict(m) {
  const roles = (m.roles ?? []).filter(Boolean);
  const votesContre = votesContreParNom(m);
  const presences = presencesDe(m);
  const numero = m.districtNumero ?? null;
  const decisions = decisionsDuDistrict(numero);
  const habitants = habitantsFr(m.habitants);
  const e = auFeminin(m.fonction, presences?.fonction) ? 'e' : '';
  const sousTitre = m.district
    ? `District <span class="numero-district">${String(numero ?? '').padStart(2, '0')}</span> – ${echapper(m.district)}`
    : echapper(m.fonction ?? '');
  const anneePresences = blocPresences()?.annee ?? '';
  return `<article class="carte elu"${numero ? ` id="elu-${numero}"` : ''}>
    <div class="portrait${m.photo ? '' : ' sans-photo'}" aria-hidden="true">
      <span class="initiales">${echapper(initiales(m.nomComplet))}</span>
      ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    </div>
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${sousTitre}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${roles.map((r) => `<span class="puce">${echapper(r)}</span>`).join('')}
      </div>
      ${habitants ? `<p class="compte" style="margin:6px 0 0">${echapper(habitants)} habitants dans le district, selon la Ville.</p>` : ''}
      ${presences ? `<p class="compte" style="margin:6px 0 0"><span class="presences"><span class="p-present">présent${e} à ${presences.presences} séance${presences.presences > 1 ? 's' : ''}</span><span class="p-absent">absent${e} à ${presences.absences}</span></span> sur ${presences.seances} où la personne est nommée${anneePresences ? ` en ${echapper(anneePresences)}` : ''}${presences.inconnu ? ` (${presences.inconnu} sans mention)` : ''}.</p>` : ''}
      ${votesContre ? `<p class="compte" style="margin:6px 0 0">${votesContre} vote${votesContre > 1 ? 's' : ''} contre consigné${votesContre > 1 ? 's' : ''}${etat.votes?.parametres?.annee ? ` en ${echapper(etat.votes.parametres.annee)}` : ''} — <a href="${PAGE.decisions}?vote=1">les votes nominatifs</a>.</p>` : ''}
      <p class="coordonnees">
        ${[
          m.courriel ? `<a href="mailto:${echapper(m.courriel)}">${echapper(m.courriel)}</a>` : '',
          m.telephone ? `<a href="tel:${echapper(String(m.telephone).replace(/[^\d+]/g, ''))}">${echapper(m.telephone)}</a>` : '',
          m.profil ? `<a href="${echapper(m.profil)}" target="_blank" rel="noopener">Son profil sur ${echapper(VILLE.domaineVille ?? 'le site de la Ville')} ↗</a>` : '',
          decisions ? `<a href="${PAGE.decisions}?district=${numero}">${decisions} décision${decisions > 1 ? 's' : ''} de l'année nomme${decisions > 1 ? 'nt' : ''} le district</a>` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  </article>`;
}

// Sans elus.json, districts.json porte déjà l'essentiel : la page reste utile avec la carte seule.
function membresDepuisDistricts() {
  return (etat.districts?.districts ?? []).map((d) => ({
    nomComplet: d.conseiller ?? 'Poste vacant', fonction: null, districtNumero: d.numero, district: d.nom,
    parti: d.parti ?? null, roles: d.roles ?? [], telephone: d.telephone ?? null, courriel: d.courriel ?? null,
    profil: null, habitants: null, photo: d.photo ?? null,
  }));
}

// Les partis : liste [{nom, n}] (Laval) ou objet {nom: n} (Longueuil).
function partisEnListe(partis) {
  if (Array.isArray(partis)) return partis.map((p) => [p.nom, p.n]);
  return Object.entries(partis ?? {});
}

const estMaireSansDistrict = (m) => !m.districtNumero && /maire/i.test(m.fonction ?? '');

function rendreElusDistricts() {
  const depuisDistricts = !etat.elus;
  const membres = etat.elus?.membres ?? membresDepuisDistricts();
  const partis = partisEnListe(etat.elus?.partis).sort((a, b) => b[1] - a[1]);
  const conseillers = membres.filter((m) => !estMaireSansDistrict(m)).length;
  const libelle = (VILLE.libelleMembres ?? ['membres du conseil municipal'])[0];
  $('#compte-elus').textContent =
    (depuisDistricts
      ? `${membres.length} districts, d'après la carte des districts (la page des membres du conseil n'a pas encore été lue)`
      : `${membres.length} ${libelle} — ${membres.length - conseillers ? 'le maire et ' : ''}${conseillers} conseillères et conseillers`) +
    (partis.length ? ' — ' + partis.map(([p, n]) => `${p} ${n}`).join(' · ') : '') + '.';

  // Les présences : d'où elles viennent et jusqu'où le jeu de la Ville va, avant les fiches.
  const bloc = blocPresences();
  const p = VILLE.presencesOuvertes ? etat.presences : null;
  const notePresences = !p
    ? ''
    : !bloc
      ? `<p class="compte">Présences&nbsp;: le jeu ouvert de la Ville ne contient encore aucune séance exploitable${p.derniereSeance ? ` (dernière séance publiée&nbsp;: ${dateFr(p.derniereSeance)})` : ''}.</p>`
      : `<p class="compte">Présences&nbsp;: ${bloc.nombreSeances} séance${bloc.nombreSeances > 1 ? 's' : ''} de ${echapper(bloc.annee)} dans le jeu ouvert de la Ville${bloc.annee !== p.annee && p.derniereSeance ? ` — le jeu s'arrête au ${dateFr(p.derniereSeance)}, aucune séance de ${echapper(p.annee)} n'y est encore publiée` : ''}${p.jeuModifieLe ? ` (jeu mis à jour le ${dateFr(String(p.jeuModifieLe).slice(0, 10))})` : ''}. Le nombre de séances où une personne est nommée dépend de la date de son entrée au conseil.</p>`;
  // Ce que le robot n'a pas su lire proprement dans le jeu de la Ville : on le signale, on ne devine pas.
  const alertes = bloc?.avertissements ?? [];
  const noteAlertes = alertes.length
    ? `<div class="drapeau"><strong>Ce que le jeu de la Ville ne dit pas clairement&nbsp;:</strong><ul>${alertes.map((a) => `<li>${echapper(a)}</li>`).join('')}</ul></div>`
    : '';
  const maire = membres.filter(estMaireSansDistrict);
  const districts = membres.filter((m) => !estMaireSansDistrict(m)).sort((a, b) => (a.districtNumero ?? 999) - (b.districtNumero ?? 999));
  $('#liste-elus').innerHTML =
    notePresences + noteAlertes +
    (maire.length ? `<h2 class="section">Mairie</h2><div class="grille-elus">${maire.map(carteEluDistrict).join('')}</div>` : '') +
    `<h2 class="section">Les ${districts.length} districts</h2><div class="grille-elus">${districts.map(carteEluDistrict).join('')}</div>`;
}

// Une photo qui ne charge pas (le site de la Ville peut refuser de la servir) laisse la place aux
// initiales dessinées derrière elle (.portrait). error ne remonte pas : on l'écoute à la capture.
document.addEventListener('error', (e) => {
  const portrait = e.target instanceof HTMLImageElement ? e.target.closest('.portrait') : null;
  if (portrait) portrait.classList.add('sans-photo');
}, true);

// ---------- VILLE.carteParParti = { palette: { parti normalisé: couleur }, reserve: [couleurs] } ----------
// Teintes neutres, éloignées des couleurs des partis : la carte dit qui siège où, pas pour qui voter.
const cleParti = (nom) => sansAccentsEspaces(nom).replace(/^independant$/, 'independante');

function couleursParParti(districts) {
  const palette = new Map(Object.entries(VILLE.carteParParti.palette ?? {}));
  const reserve = VILLE.carteParParti.reserve ?? ['#999'];
  const table = new Map();
  let n = 0;
  for (const d of districts) {
    if (!d.parti) continue;
    const cle = cleParti(d.parti);
    if (!table.has(cle)) table.set(cle, { libelle: String(d.parti).replace(/ /g, ' ').trim(), couleur: palette.get(cle) ?? reserve[n++ % reserve.length], n: 0 });
    table.get(cle).n++;
  }
  return table;
}

// Le cadre écrit par le robot, sinon celui que les contours donnent.
function cadreDe(districts, cadre) {
  if (cadre && [cadre.ouest, cadre.est, cadre.sud, cadre.nord].every((v) => Number.isFinite(v))) return cadre;
  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  for (const d of districts) for (const anneau of d.anneaux ?? []) for (const [lon, lat] of anneau) {
    if (lon < ouest) ouest = lon;
    if (lon > est) est = lon;
    if (lat < sud) sud = lat;
    if (lat > nord) nord = lat;
  }
  return { ouest, est, sud, nord };
}

function rendreCarteParParti() {
  const districts = (etat.districts?.districts ?? []).filter((d) => d.anneaux?.length);
  if (!districts.length) {
    if ($('#carte')) $('#carte').innerHTML = '<p class="vide">La carte des districts n\'est pas disponible pour l\'instant.</p>';
    return;
  }
  const table = couleursParParti(districts);
  const cadre = cadreDe(districts, etat.districts.cadre);
  const [x0, y1] = projeter([cadre.ouest, cadre.nord]);
  const [x1, y0] = projeter([cadre.est, cadre.sud]);
  const LARGEUR = 1000;
  const hauteur = Math.round((LARGEUR * (y1 - y0)) / (x1 - x0));
  const enSvg = ([lon, lat]) => {
    const [x, y] = projeter([lon, lat]);
    return [((x - x0) / (x1 - x0)) * LARGEUR, ((y1 - y) / (y1 - y0)) * hauteur];
  };
  const chemin = (anneaux) => anneaux.map((anneau) => 'M' + anneau.map((pt) => enSvg(pt).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join(' ');
  // Le numéro du district, au centre de la boîte de son plus grand contour : un repère, pas une mesure.
  const centre = (anneaux) => {
    const plusGrand = [...anneaux].sort((a, b) => b.length - a.length)[0];
    const pts = plusGrand.map(enSvg);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  $('#carte').innerHTML =
    `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="Carte des ${districts.length} districts électoraux de la Ville de ${VILLE.nom}, colorée par parti">` +
    districts.map((d) => {
      const parti = d.parti ? table.get(cleParti(d.parti)) : null;
      return `<path d="${chemin(d.anneaux)}" class="district${d.conseiller ? '' : ' vacant'}" data-numero="${d.numero}" ` +
        `fill="${parti?.couleur ?? '#999'}" tabindex="0" role="button" ` +
        `aria-label="District ${d.numero} — ${echapper(d.nom ?? '')}${d.conseiller ? `, ${echapper(d.conseiller)}` : ''}">` +
        `<title>${echapper(libelleDistrict(d))}${d.conseiller ? ` — ${echapper(d.conseiller)}` : ''}${parti ? ` (${echapper(parti.libelle)})` : ''}</title></path>`;
    }).join('') +
    districts.map((d) => {
      const [x, y] = centre(d.anneaux);
      return `<text class="etiquette-district" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${d.numero}</text>`;
    }).join('') +
    '</svg>';
  $('#legende').innerHTML = [...table.values()]
    .sort((a, b) => b.n - a.n)
    .map((p) => `<span class="cle-legende"><i style="background:${p.couleur}"></i>${echapper(p.libelle)} <span class="n">(${p.n})</span></span>`)
    .join('');
}

// VILLE.lexiqueExemples : un vrai exemple tiré des documents de la Ville (e.exemple), sous la définition.
function exempleLexique(e) {
  const ex = e.exemple;
  if (!ex) return '';
  if (typeof ex === 'string') return `<p class="exemple">Exemple&nbsp;: «&nbsp;${echapper(ex)}&nbsp;»</p>`;
  const texte = ex.objet ?? ex.texte ?? ex.titre ?? '';
  const lien = ex.pdf ?? ex.url ?? null;
  if (!texte && !lien) return '';
  return `<p class="exemple">Exemple&nbsp;: ${texte ? `«&nbsp;${echapper(texte)}&nbsp;»` : ''}${ex.numero ? ` (${echapper(ex.numero)}${ex.date ? `, ${dateFr(ex.date)}` : ''})` : ex.date ? ` (${dateFr(ex.date)})` : ''}${lien ? ` — <a href="${echapper(lien)}" target="_blank" rel="noopener">document officiel (PDF) ↗</a>` : ''}</p>`;
}

// VILLE.accueilProcesVerbaux : les chiffres de l'accueil disent d'où ils viennent (les procès-verbaux lus).
function rendreAccueilProcesVerbaux() {
  const chiffres = [];
  if (etat.decisions) {
    const n = etat.decisions.decisions.filter((d) => !estDocumentSeance(d)).length;
    chiffres.push({ n: nombreFr(n), quoi: `décisions lues dans les procès-verbaux de ${etat.decisions.parametres.annee}`, lien: PAGE.decisions });
  }
  if (etat.votes) {
    chiffres.push({ n: nombreFr(etat.votes.nombre), quoi: `votes nominaux au conseil municipal en ${etat.votes.parametres?.annee ?? ''}`.trim(), lien: `${PAGE.decisions}?vote=1` });
  }
  if (etat.resumes) {
    chiffres.push({ n: nombreFr(etat.decisions ? etat.decisions.decisions.filter((d) => resumePour(d)).length : etat.parId.size), quoi: 'décisions résumées en langage clair', lien: PAGE.decisions });
  }
  if (etat.elus) {
    chiffres.push({ n: etat.elus.nombre ?? etat.elus.membres?.length ?? 0, quoi: (VILLE.libelleMembres ?? ['membres du conseil municipal'])[0], lien: PAGE.conseil });
  }
  if ($('#chiffres')) {
    $('#chiffres').innerHTML = chiffres
      .map((c) => `<a class="chiffre" href="${c.lien}"><div class="n">${c.n}</div><div class="quoi">${echapper(c.quoi)}</div></a>`)
      .join('');
  }
  rendreFil();
}

// VILLE.etatDetaille : la page Sources dit, jeu par jeu, ce qui est chargé, ce qui attend et ce que les
// robots n'ont pas su lire (avertissements recopiés des fichiers, pas résumés).
function rendreEtatDetaille() {
  const lignes = [];
  const quand = (data) => (data?.generatedAt ? new Date(data.generatedAt).toLocaleString('fr-CA') : '—');
  const ajouter = (nom, data, extra) => {
    if (!data) { lignes.push(`<tr><td>${nom}</td><td colspan="2">non chargé</td></tr>`); return; }
    lignes.push(`<tr><td>${nom}</td><td>${quand(data)}</td><td class="n">${extra}</td></tr>`);
  };
  const d = etat.decisions;
  ajouter('Décisions', d, d ? `${nombreFr(d.nombre)} fiches / ${nombreFr(d.totalDisponible)}` : '');
  ajouter('Votes nominaux', etat.votes, etat.votes ? `${etat.votes.nombre} / ${etat.votes.totalDisponible ?? etat.votes.nombre}` : '');
  ajouter('Sommaires décisionnels lus', etat.sommaires, etat.sommaires ? `${etat.sommaires.nombre ?? etat.sommairesLus.size}${etat.sommaires.nonPublies?.nombre ? ` (${nombreFr(etat.sommaires.nonPublies.nombre)} cités mais non publiés)` : ''}` : '');
  ajouter('Résumés en langage clair', etat.resumes, etat.resumes ? `${etat.resumes.nombre ?? etat.parId.size}` : '');
  ajouter('Membres du conseil', etat.elus, etat.elus ? `${etat.elus.nombre ?? etat.elus.membres?.length ?? 0}` : '');
  ajouter('Districts électoraux', etat.districts, etat.districts ? `${etat.districts.nombre ?? etat.districts.districts?.length ?? 0}` : '');
  const bloc = blocPresences();
  ajouter('Présences aux séances', etat.presences, etat.presences ? (bloc ? `${bloc.membres.length} personnes, ${bloc.nombreSeances} séances en ${bloc.annee}` : 'aucune séance exploitable') : '');
  ajouter('Lexique', etat.lexique, etat.lexique ? `${etat.lexique.nombre ?? (etat.lexique.entrees ?? []).length} termes` : '');
  if (d?.seances) lignes.push(`<tr><td>Séances de l'année</td><td>${d.seancesLues ?? 0} procès-verbaux lus</td><td class="n">${d.seancesEnAttente ?? 0} en attente</td></tr>`);
  const enAttente = (d?.seances ?? []).filter((se) => se.etat && se.etat !== 'lue');
  const reserves = [
    ...(etat.presences?.avertissements ?? []).map((a) => ['Présences', a]),
    ...(bloc?.avertissements ?? []).map((a) => ['Présences', a]),
    ...(etat.elus?.avertissements ?? []).map((a) => ['Membres du conseil', a]),
    ...(etat.districts?.ecarts ?? []).map((a) => ['Districts électoraux', a]),
    ...(etat.sommaires?.echecs ?? []).map((a) => ['Sommaires décisionnels', typeof a === 'string' ? a : (a.numero ?? '') + ' : ' + (a.raison ?? a.message ?? 'échec de lecture')]),
  ];
  $('#etat-donnees').innerHTML =
    `<table><thead><tr><th>Jeu</th><th>Dernière extraction</th><th class="n">Chargé / disponible</th></tr></thead><tbody>${lignes.join('')}</tbody></table>` +
    (reserves.length
      ? `<div class="drapeau"><strong>Ce qui reste à vérifier dans les données&nbsp;:</strong><ul>${reserves.map(([jeu, texte]) => `<li><strong>${echapper(jeu)}</strong> — ${echapper(texte)}</li>`).join('')}</ul></div>`
      : '') +
    (d?.indexObtenu ? `<p class="etat-note">Index des documents de la Ville&nbsp;: ${echapper(d.indexObtenu)}${d.indexDu ? ` — état de l'index au ${new Date(d.indexDu).toLocaleString('fr-CA')}` : ''}.</p>` : '') +
    (enAttente.length ? `<p class="etat-note">En attente&nbsp;: ${enAttente.map((se) => `${echapper(se.nom ?? se.instance)} du ${dateFr(se.date)}${se.heure ? `, ${heureFr(se.heure)}` : ''} (${echapper(se.etat)})`).join(' · ')}.</p>` : '') +
    (d?.licence ? `<p class="etat-note">${echapper(d.licence)}</p>` : '') +
    (etat.resumes?.modele ? `<p class="etat-note">Modèle utilisé pour les résumés&nbsp;: <code>${echapper(etat.resumes.modele)}</code>.</p>` : '');
  if ($('#date-index') && d?.indexObtenu) $('#date-index').textContent = d.indexObtenu;
  if (!$('#etat-archive')) return;
  const annees = etat.archives?.annees ?? [];
  if (annees.length === 0) { $('#etat-archive').innerHTML = '<p class="compte">Aucune année archivée pour l\'instant.</p>'; return; }
  const totalDocs = annees.reduce((n, a) => n + a.nombre, 0);
  const totalOctets = annees.reduce((n, a) => n + a.octetsCompresses, 0);
  $('#etat-archive').innerHTML =
    '<table><thead><tr><th>Année</th><th class="n">Documents</th><th class="n">Taille</th><th>Archivée le</th></tr></thead><tbody>' +
    annees.map((a) => `<tr><td>${echapper(a.annee)}</td><td class="n">${nombreFr(a.nombre)}</td><td class="n">${nombreFr(Math.round(a.octetsCompresses / 1024))} ko</td><td>${echapper(String(a.archiveLe ?? '').slice(0, 10))}</td></tr>`).join('') +
    '</tbody></table>' +
    `<p class="compte">${annees.length} année(s), ${nombreFr(totalDocs)} documents, ${nombreFr(Math.round(totalOctets / 1024))} ko compressés au total.</p>`;
}


// ---------- VOLETS ANGLOPHONES (Vancouver, Ottawa, Fredericton ; 20 nov. 2026) ----------
// Allumé par VILLE.anglophone. Ces volets vivent dans d'autres dépôts : le moteur y est COPIÉ par
// scripts/synchro-moteur.js (dossierquebec), jamais chargé depuis dossierquebec.ca. La Ville publie
// en anglais ; le français est en option (VILLE.langueDefaut 'en'). Pas d'espace abonnés. Les clés :
//   fenetre      { points, affichees, seances, point } : une fenêtre de dates plutôt qu'une année ;
//                chaque fiche est une décision (sauf d.ordreDuJour et d.information, Fredericton)
//   vocabulaire  { lienSource, bulletins, titreFil, texteExact, pageVille, carte } : [fr, en]
//   conflits     conflits d'intérêts déclarés : puce sur la fiche et sur l'élu, recherche (Ottawa)
//   quartiers    élus par quartier, coordonnées, présences, carte des quartiers (Ottawa)
//   fichePV      fiche tirée du procès-verbal : texte, proposée/appuyée, absents, PDF anglais et
//                français, points d'ordre du jour et d'information (Fredericton)
//   absencesSurSeances  la fiche d'élu compte les absences sur les séances (Fredericton)
//   compteElus({ n, maires, conseillers, p }, tr, dateFr)  crochet : la phrase sous « Conseil »
//   filSansResume(d), chiffreVotes, lignesSources, noteSources, apresChargement, besoins : crochets
//   mesure       URL de la mesure maison, injectée par le moteur
function enteteVoteAnglo(d) {
  return `${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(lib(d.resultat))}</span>` : ''}
      ${d.decomptePour != null ? `<span class="decompte"><span class="d-pour">${d.decomptePour} ${tr('pour', 'for')}</span><span class="d-contre">${d.decompteContre} ${tr('contre', 'against')}</span></span>` : ''}`;
}

function fen(cle) {
  return VILLE.fenetre?.[cle] ?? [];
}

// « 12 décisions affichées sur 40 », ou la fenêtre : « 40 points mis aux voix du 1er janv. 2026 au … ».
// Fredericton : les points d'ordre du jour et les informations se comptent à part.
function filtreFenetre(nDecisions, total, filtrees, parametres) {
  const [pointsFr, pointsEn] = fen('points');
  const [affFr, affEn] = fen('affichees');
  const nOdj = filtrees.filter((d) => d.ordreDuJour).length, nInfo = filtrees.filter((d) => d.information).length;
  const enPlus = (nOdj || nInfo) ? tr(` (plus ${[nOdj ? `${nombreFr(nOdj)} point${nOdj > 1 ? 's' : ''} à l’ordre du jour` : '', nInfo ? `${nombreFr(nInfo)} information${nInfo > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ')})`, ` (plus ${[nOdj ? `${nombreFr(nOdj)} agenda item${nOdj > 1 ? 's' : ''}` : '', nInfo ? `${nombreFr(nInfo)} information item${nInfo > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')})`) : '';
  return (nDecisions !== total
    ? tr(`${nombreFr(nDecisions)} ${affFr} sur ${nombreFr(total)}`, `${nombreFr(nDecisions)} ${affEn} of ${nombreFr(total)}`)
    : tr(`${nombreFr(total)} ${pointsFr} du ${dateFr(parametres.depuis)} au ${dateFr(parametres.jusqua)}`, `${nombreFr(total)} ${pointsEn}, ${dateFr(parametres.depuis)} to ${dateFr(parametres.jusqua)}`)) + enPlus;
}

function chiffresFenetre() {
  const p = etat.decisions.parametres ?? {};
  const [pointsFr, pointsEn] = fen('points');
  const l = [{ n: nombreFr(totalDecisions()), quoi: tr(`${pointsFr} du ${dateFr(p.depuis)} au ${dateFr(p.jusqua)}`, `${pointsEn}, ${dateFr(p.depuis)} to ${dateFr(p.jusqua)}`), lien: PAGE.decisions }];
  if (etat.decisions.seancesLues != null) l.push({ n: nombreFr(etat.decisions.seancesLues), quoi: tr(...fen('seances')), lien: PAGE.decisions });
  return l;
}

function pucesSeanceAnglo(g) {
  const n = g.lignes.length;
  const [unFr, plFr, unEn, plEn] = fen('point');
  if (g.lignes[0]?.ordreDuJour) {
    return `<span class="puce">${n} ${tr(s(n, 'point à l’ordre du jour', 'points à l’ordre du jour'), s(n, 'agenda item', 'agenda items'))}</span>
        <span class="puce procedural">${tr('procès-verbal pas encore publié', 'minutes not yet published')}</span>`;
  }
  return `<span class="puce">${n} ${tr(s(n, unFr, plFr), s(n, unEn, plEn))}</span>`;
}

function carteDecisionAnglo(d, ouverte = false) {
  const entete = `<div class="meta">
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${d.ordreDuJour ? tr('À l’ordre du jour', 'On the agenda') : d.information ? tr('Information', 'Information') : echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${d.categorie && !/^\d{8,}$/.test(d.categorie) ? `<span class="puce">${echapper(categorieEn(d.categorie))}</span>` : ''}
      ${d.unite ? `<span class="puce">${echapper(lib(d.unite.replace(/_/g, ', ')))}</span>` : ''}
      ${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(lib(d.resultat))}</span>` : ''}
      ${d.voteEnregistre ? `<span class="puce genre-vote">${tr('vote enregistré', 'recorded vote')}</span>` : ''}
      ${d.decomptePour != null ? `<span class="decompte"><span class="d-pour">${d.decomptePour} ${tr('pour', 'for')}</span><span class="d-contre">${d.decompteContre} ${tr('contre', 'against')}</span></span>` : ''}
      ${VILLE.conflits && d.conflits?.length ? `<span class="puce conflit">${tr('conflit déclaré', 'declared conflict')}&nbsp;: ${d.conflits.map(echapper).join(', ')}</span>` : ''}
    </div>
    <p class="objet">${echapper(objetDe(d) ?? tr('(sans objet)', '(no subject)'))}</p>`;
  // Faits bruts : les dissidences consignées ; la fiche du procès-verbal (VILLE.fichePV) ou le lien
  // vers la donnée officielle (d.lienSource).
  const pv = VILLE.fichePV
    ? `${d.information ? `<p class="compte" style="margin:0 0 8px">${tr('Ce n’est pas une décision : le procès-verbal le rapporte pour information', 'This is not a decision: the minutes report it for information')}${(!EN && d.sectionFr ? d.sectionFr : d.section) ? ` (${echapper(!EN && d.sectionFr ? d.sectionFr : d.section)})` : ''}.</p>` : ''}
    ${d.ordreDuJour ? `<p class="compte" style="margin:0 0 8px">${tr('Ce point était à l’ordre du jour de la séance. La Ville n’a pas encore publié le procès-verbal : on ne sait pas encore ce que le conseil a décidé.', 'This item was on the meeting agenda. The City has not yet published the minutes, so what Council decided is not known yet.')}</p>` : ''}
    ${(() => { const t = !EN && d.texteFr ? d.texteFr : d.texte; return t ? `<p style="margin:0 0 10px;white-space:pre-line">${echapper(t)}</p>` : ''; })()}
    ${d.proposePar ? `<p class="compte" style="margin:0 0 8px">${tr('Proposée par', 'Moved by')} ${echapper(d.proposePar)}${d.appuyePar ? ` · ${tr('appuyée par', 'seconded by')} ${echapper(d.appuyePar)}` : ''}. ${d.dissidences?.length ? '' : tr('Le procès-verbal ne note aucun vote contre.', 'The minutes record no vote against.')}</p>` : ''}
    ${d.absents?.length ? `<p class="compte" style="margin:0 0 8px">${tr('Absent à la séance', 'Absent from the meeting')} : ${d.absents.map(echapper).join(', ')}.</p>` : ''}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${d.ordreDuJour ? tr('Ordre du jour officiel, anglais et français (PDF)', 'Official agenda, English and French (PDF)') : tr('Procès-verbal officiel, en anglais (PDF)', 'Official minutes (PDF)')} ↗</a>` : ''}
    ${d.pdfFr ? ` &nbsp;<a class="lien-pdf" href="${echapper(d.pdfFr)}" target="_blank" rel="noopener">${tr('Procès-verbal officiel (PDF)', 'Official minutes, in French (PDF)')} ↗</a>` : ''}`
    : `${d.dossier ? `<p class="compte" style="margin:0 0 8px">${tr('Dossier', 'File')} ${echapper(d.dossier)}${d.article ? ` · ${tr('article', 'item')} ${echapper(d.article)}` : ''}</p>` : ''}
    ${d.lienSource ? `<a class="lien-pdf" href="${echapper(d.lienSource)}" target="_blank" rel="noopener">${voc('lienSource', '', '')}</a>` : ''}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${d.type === 'Résolution' ? tr('Procès-verbal officiel (PDF)', 'Official minutes (PDF, in French)') : tr('Document officiel (PDF)', 'Official document (PDF, in French)')} ↗</a>` : ''}`;
  const corps = `${blocContexte(d)}${blocResume(resumePour(d))}
    ${d.dissidences?.length ? `<p class="compte" style="margin:0 0 8px">${tr(`Dissidence${d.dissidences.length > 1 ? 's' : ''}&nbsp;:`, `${s(d.dissidences.length, 'Dissent', 'Dissents')}:`)} ${d.dissidences.map(echapper).join(', ')}.</p>` : ''}
    <div class="texte-decision" data-id="${echapper(d.id)}"></div>
    ${pv}
    ${d.sommairePdf ? ` &nbsp;<a class="lien-pdf" href="${echapper(d.sommairePdf)}" target="_blank" rel="noopener">${tr('Sommaire décisionnel (PDF)', 'Decision summary (PDF, in French)')} ↗</a>` : ''}
    ${actionsFiche(d)}`;
  return carteRepliable(entete, corps, ouverte);
}

// La fiche d'un élu : la fonction et les décomptes bruts de la période (pour, contre, abstentions,
// absences, conflits), des faits consignés montrés tels quels. VILLE.quartiers (Ottawa) : le quartier,
// les coordonnées et les présences au conseil.
function carteEluAnglo(m) {
  const v = m.votes ?? {};
  const puce = (nb, fr, en, classe = '') => (nb ? `<span class="puce${classe ? ' ' + classe : ''}">${nb} ${tr(fr, en)}</span>` : '');
  const Q = VILLE.quartiers;
  const quartier = Q && m.districtNumero ? `${tr('Quartier', 'Ward')} ${m.districtNumero} · ${echapper(EN ? m.district : m.districtFr ?? m.district)}${m.arrondissement ? ` · ${echapper(EN ? m.arrondissement : m.arrondissementFr ?? m.arrondissement)}` : ''}` : '';
  const pr = Q ? m.presence : null;
  const contact = Q ? [
    m.telephone ? `<a href="tel:${echapper(m.telephone.replace(/[^\d+]/g, ''))}">${echapper(m.telephone)}</a>` : '',
    m.courriel ? `<a href="mailto:${echapper(m.courriel)}">${echapper(m.courriel)}</a>` : '',
    m.lienVille ? `<a href="${echapper(m.lienVille)}" target="_blank" rel="noopener">${voc('pageVille', 'Page sur le site de la Ville', 'Page on the City website')} ↗</a>` : '',
  ].filter(Boolean).join(' · ') : '';
  const fonction = Q ? (/mayor/i.test(m.fonction ?? '') ? tr('Maire', 'Mayor') : tr('Conseiller ou conseillère', 'Councillor')) : echapper(m.fonction ?? '');
  const total = VILLE.absencesSurSeances
    ? `${v.absents ?? 0} ${tr(`absence${(v.absents ?? 0) > 1 ? 's' : ''} sur ${v.total ?? 0} séances`, `absence${(v.absents ?? 0) === 1 ? '' : 's'} out of ${v.total ?? 0} meetings`)}.   `
    : `${v.total ?? 0} ${voc('bulletins', 'bulletins consignés sur la période', 'votes on record in this period')}.`;
  return `<article class="carte elu"${Q && m.districtNumero ? ` id="elu-${m.districtNumero}"` : ''}>
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${fonction}${quartier ? ` — ${quartier}` : ''}</p>
      ${contact ? `<p class="compte" style="margin:2px 0 6px">${contact}</p>` : ''}
      ${pr ? `<p class="compte" style="margin:0 0 6px">${tr(`Présent à ${pr.presents} séances du conseil sur ${pr.seances} (${pr.taux} %), du ${dateFr(pr.du)} au ${dateFr(pr.au)}.`, `Present at ${pr.presents} of ${pr.seances} Council meetings (${pr.taux}%), ${dateFr(pr.du)} to ${dateFr(pr.au)}.`)}</p>` : ''}
      <div class="meta">
        ${puce(v.pour, 'pour', 'in favour')}
        ${puce(v.contre, 'contre', 'opposed')}
        ${puce(v.abstentions, 'abstention(s)', 'abstained')}
        ${puce(v.absents, 'absence(s)', 'absent')}
        ${VILLE.conflits ? puce(v.conflits, 'conflit(s) déclaré(s)', v.conflits > 1 ? 'declared conflicts' : 'declared conflict', 'conflit') : ''}
        ${puce(v.inadmissibles, 'inadmissible(s)', 'ineligible')}
        ${puce(v.sansVote, 'sans vote', 'no vote')}
      </div>
      <p class="compte" style="margin:6px 0 0">${total}${
        v.contre ? ` <a href="${PAGE.decisions}?q=${encodeURIComponent(m.nomComplet)}">${tr('Voir les points votés contre', 'See the motions they opposed')} →</a>` : ''
      }</p>
    </div>
  </article>`;
}

// La mairie, puis les conseillers et conseillères (par quartier avec VILLE.quartiers).
function rendreElusAnglo() {
  const membres = etat.elus.membres;
  const p = etat.elus.parametres ?? {};
  const maires = membres.filter((m) => /mayor/i.test(m.fonction ?? ''));
  const conseillers = membres.filter((m) => !/mayor/i.test(m.fonction ?? ''));
  if (VILLE.quartiers) conseillers.sort((a, b) => (a.districtNumero ?? 99) - (b.districtNumero ?? 99));
  $('#compte-elus').textContent = VILLE.compteElus?.({ n: etat.elus.nombre, maires, conseillers, p }, tr, dateFr) ?? '';
  const groupes = [[tr('Maire ou mairesse', 'Mayor'), maires], [tr('Conseillers et conseillères', 'Councillors'), conseillers]].filter(([, l]) => l.length);
  $('#liste-elus').innerHTML = groupes
    .map(([titre, gens]) => `<h2 class="section">${echapper(titre)}</h2><div class="grille-elus">${gens.map(carteElu).join('')}</div>`)
    .join('');
}

// VILLE.mesure : la mesure maison commune aux sites Dossier (pages vues et clics, sans donnée
// personnelle, lue dans dossierquebec.ca/admin), pour les volets dont les pages ne la chargent pas.
if (VILLE.mesure && !window.__dqMesure) {
  window.__dqMesure = true;
  const script = document.createElement('script');
  script.src = VILLE.mesure;
  script.defer = true;
  document.head.appendChild(script);
}
