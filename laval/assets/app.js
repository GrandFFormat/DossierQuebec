// Logique commune à toutes les pages de DossierVilleDeLaval.
//
// Chaque page HTML porte un attribut data-page sur <body> ; ce script charge uniquement
// les jeux de données dont cette page a besoin (data/*.json, lus à l'exécution), puis
// appelle le rendu correspondant. Les pages restent donc légères, et une seule extraction
// met tout le site à jour.
//
// Repris de Longueuil, avec ce qui est propre à Laval :
//   - une séance est identifiée par son id (« CM-20260203-ORD-18h30 »), pas par le couple
//     date + instance : le comité exécutif tient parfois deux séances le même jour (publique
//     et à huis clos), et le conseil deux extraordinaires ;
//   - l'ordre du jour du conseil donne les districts touchés et le montant : ils s'affichent
//     sur la fiche, et le montant ouvre « Demander le détail de l'argent » (data-montant) ;
//   - les résumés sont indexés par numéro de sommaire (SD-2026-1234), la clé qui relie la
//     résolution, l'ordre du jour et le sommaire ;
//   - la carte des districts est colorée par parti, dans des teintes neutres ;
//   - les présences viennent d'un jeu ouvert de la Ville, pas des procès-verbaux ;
//   - les photos des élus viennent de laval.ca, qui peut refuser de les servir : des
//     initiales prennent le relais quand l'image ne charge pas.
//
// Tout fichier de données peut manquer (les scrapers tournent séparément) : chaque page
// doit rester lisible sans lui, jamais casser.

const PAS = 60; // fiches affichées par palier, en liste continue
const PAS_SEANCES = 8; // séances affichées par palier, en mode groupé
// Cinq à l'arrivée pour que la page reste courte, dix par clic ensuite : le premier
// écran sert à décider si on veut lire, les suivants à lire pour vrai.
const PAS_VOTES_DEPART = 5;
const PAS_VOTES = 10;
const PAS_FIL = 5; // éléments du fil d'accueil par palier

const etat = {
  decisions: null,
  votes: null,
  elus: null,
  districts: null,
  presences: null,
  resumes: null,
  sommaires: null,
  lexique: null,
  parSommaire: new Map(), // numéro de sommaire (SD-AAAA-N) -> résumé IA
  sommairesLus: new Map(), // numéro de sommaire -> ce que le PDF du sommaire dit (data/sommaires.json)
  seances: new Map(), // id de séance -> séance (decisions.json, seances[])
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
export function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${Number(j)} ${MOIS[Number(m) - 1]} ${a}`;
}

// « 18h30 » (tel qu'écrit dans les noms de fichiers de la Ville) -> « 18 h 30 » ; « 09h00 » -> « 9 h ».
function heureFr(heure) {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(heure ?? '');
  if (!m) return heure ?? '';
  return `${Number(m[1])} h${m[2] && m[2] !== '00' ? ' ' + m[2] : ''}`;
}

const nombreFr = (n) => Number(n).toLocaleString('fr-CA');

// « … .pdf#page=12 » -> 12. Les scrapers écrivent la page où la résolution commence.
function pageDuPdf(url) {
  const m = /#page=(\d+)/.exec(url ?? '');
  return m ? Number(m[1]) : null;
}

// ---------- chargement ----------
async function charger(nom) {
  try {
    const res = await fetch(`data/${nom}.json`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function messageSansDonnees() {
  const zone = $('#chargement');
  if (!zone) return;
  zone.hidden = false;
  zone.innerHTML =
    "<strong>Aucune donnée.</strong> Lancez <code>npm run refresh</code> dans le dossier <code>laval/</code>, " +
    'puis <code>npm run serve</code> et rechargez cette page. ' +
    "(Ouvrir le fichier par double-clic ne fonctionne pas&nbsp;: le navigateur bloque la lecture des fichiers JSON.)";
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

// Le résumé d'une décision est celui de son sommaire décisionnel : c'est le numéro SD qui
// relie les deux. Une résolution sans sommaire (un dépôt de pétition, par exemple) n'a
// donc jamais de résumé, et c'est normal.
function resumePour(d) {
  const cle = d.sommaireId ?? d.dossier;
  return cle ? etat.parSommaire.get(cle) ?? null : null;
}

// Ce que le PDF du sommaire décisionnel dit lui-même (service responsable, montant), quand
// scrapers/sommaires.js l'a lu. Le comité exécutif ne publie pas ses sommaires : pour lui,
// il n'y a jamais rien ici.
function sommairePour(d) {
  const cle = d.sommaireId ?? d.dossier;
  return cle ? etat.sommairesLus.get(cle) ?? null : null;
}

// Le résumé n'est affiché que s'il existe pour ce sommaire précis, toujours identifié
// comme généré par une IA, et toujours accompagné du lien vers le PDF officiel.
function blocResume(r) {
  if (!r) return '';
  return `<div class="resume">
    <div class="resume-entete">
      <span>Résumé généré par IA${r.id ? ` — sommaire ${echapper(r.id)}` : ''}</span>
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(r.montantPrincipal)}</span>` : ''}
      ${r.sansContenuSubstantiel ? '<span class="puce procedural">document de procédure</span>' : ''}
    </div>
    <ul>${(r.puces ?? []).map((p) => `<li>${echapper(p)}</li>`).join('')}</ul>
  </div>`;
}

// La couleur vit dans le CSS, pas dans les données : on émet une classe (t-urbanisme,
// t-contrats…) et la feuille de style décide. Le tableau des libellés vient du jeu chargé
// par la page : decisions.json sur la page des décisions, votes.json sur celle des votes.
function puceTheme(cle) {
  const t = etat.decisions?.themes?.[cle] ?? etat.votes?.themes?.[cle];
  if (!t) return '';
  return `<span class="puce theme t-${echapper(cle)}">${echapper(t.libelle)}</span>`;
}

// « 05 – Marigot », comme la Ville l'écrit ; « Tous les districts » quand l'ordre du jour
// le dit (numéro 0 dans les données).
function libelleDistrict(k) {
  if (!k) return '';
  if (!k.numero) return k.nom ?? 'Tous les districts';
  return `${String(k.numero).padStart(2, '0')} – ${k.nom ?? ''}`;
}

// Un procès-verbal ou un ordre du jour est un document de séance, pas une décision : même
// fiche, mais ni résultat, ni sommaire, ni espace abonnés.
const estDocument = (d) => d.type === 'Procès-verbal' || d.type === 'Ordre du jour';

// Après un redessin, les fiches reviennent fermées : le bouton doit le refléter, sinon il
// annonce « Tout replier » devant une liste entièrement repliée.
function reinitialiserDepliage() {
  const b = $('#tout-deplier');
  if (!b) return;
  b.dataset.etat = 'replie';
  b.textContent = 'Tout déplier';
}

// Fiche repliée par défaut : on voit de quoi il s'agit d'un coup d'œil, on déplie pour lire.
//
// L'attribut `name` partagé fait de la liste un accordéon natif : ouvrir une fiche ferme
// la précédente, sans une ligne de JavaScript. Le clavier, la recherche du navigateur et
// les lecteurs d'écran suivent tout seuls. Sur un vieux navigateur qui ignore `name`, on
// retombe simplement sur des fiches indépendantes — dégradation sans casse.
const NOM_ACCORDEON = 'fiches';

function carteRepliable(entete, corps) {
  return `<details class="carte pliante" name="${NOM_ACCORDEON}"><summary>${entete}</summary><div class="corps">${corps}</div></details>`;
}

// Les pastilles de l'en-tête d'une fiche de décision. Le type n'est dit que quand ce n'est
// pas une résolution (dépôt, avis de motion, prise d'acte…) : « Résolution » sur 2 400
// fiches n'apprend rien. Plus de trois districts, et c'est un compte ; la liste complète
// est dans le corps.
function pucesDecision(d, { nouveau = false, genre = false } = {}) {
  const districts = d.districts ?? [];
  return `<div class="meta">
      ${genre ? '<span class="puce genre-decision">décision</span>' : ''}
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      ${estDocument(d) ? '<span class="puce document">document de séance</span>' : d.type !== 'Résolution' ? `<span class="puce">${echapper(d.type)}</span>` : ''}
      ${d.instance ? `<span class="puce">${echapper(d.instance)}</span>` : ''}
      ${d.resultat ? `<span class="resultat ${classeResultat(d.resultat)}">${echapper(d.resultat)}</span>` : ''}
      ${d.voteEnregistre ? '<span class="puce genre-vote">vote nominal</span>' : ''}
      ${d.montant ? `<span class="puce montant">${echapper(d.montant)}</span>` : ''}
      ${districts.length > 3 ? `<span class="puce district">${districts.length} districts</span>` : districts.map((k) => `<span class="puce district">${echapper(libelleDistrict(k))}</span>`).join('')}
      ${nouveau ? '<span class="puce neuf">nouveau</span>' : ''}
    </div>`;
}

// Le corps d'une fiche : le résumé s'il existe, puis les faits que le procès-verbal et
// l'ordre du jour donnent (qui propose, qui appuie, le certificat de trésorerie, les
// districts), puis les liens vers les PDF officiels. Rien d'autre : pas d'interprétation.
function corpsDecision(d) {
  if (estDocument(d)) {
    const contenu = [
      d.nombreResolutions != null ? `${nombreFr(d.nombreResolutions)} résolution${d.nombreResolutions > 1 ? 's' : ''} lue${d.nombreResolutions > 1 ? 's' : ''}` : '',
      d.nombrePages != null ? `${nombreFr(d.nombrePages)} page${d.nombrePages > 1 ? 's' : ''}` : '',
      d.nombrePoints ? `${nombreFr(d.nombrePoints)} point${d.nombrePoints > 1 ? 's' : ''} à l'ordre du jour` : '',
    ].filter(Boolean);
    return `${contenu.length ? `<p class="faits">${contenu.join(' · ')}.</p>` : ''}
      ${d.pdf ? `<p class="liens-pdf"><a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${echapper(d.type)} (PDF) ↗</a></p>` : ''}`;
  }
  const r = resumePour(d);
  const s = sommairePour(d);
  const page = pageDuPdf(d.pdf);
  const districts = d.districts ?? [];
  const comiteExecutif = /exécutif/i.test(d.instance ?? '');
  return `${blocResume(r)}
    ${d.titre ? `<p class="faits">Au procès-verbal&nbsp;: «&nbsp;${echapper(d.titre)}&nbsp;».</p>` : ''}
    ${districts.length > 3 ? `<p class="faits">Districts touchés&nbsp;: ${districts.map((k) => echapper(libelleDistrict(k))).join(', ')}.</p>` : ''}
    ${s?.service ? `<p class="faits">Au sommaire décisionnel&nbsp;: service responsable, ${echapper(s.service)}${s.montant && !d.montant ? `&nbsp;; montant, ${echapper(s.montant)}` : ''}.</p>` : ''}
    ${d.proposeur ? `<p class="faits">Proposée par ${echapper(d.proposeur)}${d.appuyeur ? `, appuyée par ${echapper(d.appuyeur)}` : ''}.</p>` : ''}
    ${d.ct ? `<p class="faits">Certificat de trésorerie ${echapper(d.ct)}.</p>` : ''}
    ${d.voteEnregistre && d.numero ? `<p class="faits">Vote nominal consigné&nbsp;: <a href="votes.html?q=${encodeURIComponent(d.numero)}">qui a voté pour, qui a voté contre</a>.</p>` : ''}
    ${d.dossier && !d.sommairePublie ? `<p class="faits">Sommaire décisionnel ${echapper(d.dossier)} — non publié par la Ville${comiteExecutif ? ' (les sommaires du comité exécutif ne le sont pas)' : ''}.</p>` : ''}
    <p class="liens-pdf">
      ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">Procès-verbal (PDF)${page ? `, page ${page}` : ''} ↗</a>` : ''}
      ${d.sommairePublie && d.sommairePdf ? `<a class="lien-pdf" href="${echapper(d.sommairePdf)}" target="_blank" rel="noopener">Sommaire décisionnel ${echapper(d.dossier ?? '')} (PDF) ↗</a>` : ''}
    </p>`;
}

function carteDecision(d) {
  const entete = `${pucesDecision(d)}<p class="objet">${echapper(objetDecision(d))}</p>`;
  const corps = corpsDecision(d);
  // Espace abonnés (/commun/abonnes.js) : le détail de l'argent et « Signaler une erreur ». La clé
  // de dossier est le numéro de sommaire, qui suit la décision du comité exécutif au conseil.
  // Un procès-verbal ou un ordre du jour n'est pas un dossier : rien à suivre.
  if (estDocument(d)) return carteRepliable(entete, corps);
  // data-montant : la décision a un montant à l'ordre du jour, ou le résumé en a trouvé un —
  // un abonné peut alors demander le détail de l'argent. Laval n'a ni statut de dossier, ni
  // étape, ni échéance, ni projets suivis : attributs présents mais vides, pour la couche commune.
  const r = resumePour(d);
  const montant = d.montant || sommairePour(d)?.montant || (r?.montantPrincipal && !r.sansContenuSubstantiel) ? 1 : 0;
  const abonnes = `<div class="ab-fiche" data-dossier="${echapper(d.dossier ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}" data-montant="${montant}"
    data-statut="" data-etape="" data-echeance="" data-projets="[]"></div>`;
  return carteRepliable(entete, corps + abonnes);
}

// Le filtre par district vient de l'adresse (?district=5), depuis la fiche d'un membre du
// conseil : il n'a pas de menu déroulant, mais une pastille qui dit qu'il est là et comment
// l'enlever.
function districtDemande() {
  const n = new URLSearchParams(location.search).get('district');
  return n && /^\d+$/.test(n) ? Number(n) : null;
}

function decisionsFiltrees() {
  const q = $('#rech-decisions').value.trim().toLowerCase();
  const type = $('#filtre-type').value;
  const instance = $('#filtre-instance')?.value ?? '';
  const theme = $('#filtre-theme')?.value ?? '';
  const avecResume = $('#filtre-resume')?.checked ?? false;
  const district = districtDemande();
  return etat.decisions.decisions.filter((d) => {
    if (type && d.type !== type) return false;
    if (instance && d.instance !== instance) return false;
    if (theme && d.theme !== theme) return false;
    if (avecResume && !resumePour(d)) return false;
    if (district != null && !(d.districts ?? []).some((k) => k.numero === district)) return false;
    if (q && ![d.objet, d.numero, d.dossier, d.titre].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}

function rendreDecisions() {
  const { facettes, parametres, nombre } = etat.decisions;
  if (!$('#filtre-type').dataset.rempli) {
    remplirSelect($('#filtre-type'), facettes.type ?? []);
    if ($('#filtre-instance')) remplirSelect($('#filtre-instance'), facettes.instance ?? []);
    // La case « Avec résumé seulement » n'a de sens que s'il y a des résumés. Une case qui ne
    // peut que vider la liste vaut mieux cachée.
    const caseResume = document.getElementById('case-resume');
    if (caseResume) caseResume.hidden = !etat.decisions.decisions.some((d) => resumePour(d));
    if ($('#filtre-theme')) {
      // On affiche le libellé lisible, pas la clé interne.
      remplirSelect(
        $('#filtre-theme'),
        (facettes.theme ?? []).map(({ valeur, n }) => ({ valeur, n, libelle: etat.decisions.themes?.[valeur]?.libelle }))
      );
    }
    $('#filtre-type').dataset.rempli = '1';
  }

  const district = districtDemande();
  let chip = document.getElementById('filtre-district');
  if (district != null && !chip) {
    const nom = etat.decisions.decisions.flatMap((d) => d.districts ?? []).find((k) => k.numero === district)?.nom;
    chip = document.createElement('p');
    chip.id = 'filtre-district';
    chip.className = 'filtre-actif';
    chip.innerHTML = `Décisions dont l'ordre du jour nomme le district ${echapper(libelleDistrict({ numero: district, nom: nom ?? '' }))} · <a href="decisions.html">retirer ce filtre</a>`;
    $('#compte-decisions').before(chip);
  }

  const filtrees = decisionsFiltrees();
  const parSeance = $('#affichage')?.value !== 'liste';
  const documents = etat.decisions.decisions.filter(estDocument).length;

  $('#compte-decisions').textContent =
    `${nombreFr(filtrees.length)} fiche(s) affichée(s) sur ${nombreFr(nombre)} lues dans les procès-verbaux de ${parametres.annee}` +
    ` — ${nombreFr(nombre - documents)} décisions et ${nombreFr(documents)} documents de séance` +
    (etat.decisions.seancesLues != null ? ` (${etat.decisions.seancesLues} séance(s) lue(s)${etat.decisions.seancesEnAttente ? `, ${etat.decisions.seancesEnAttente} en attente de procès-verbal` : ''}).` : '.') +
    (etat.parSommaire.size ? ` ${nombreFr(etat.decisions.decisions.filter((d) => resumePour(d)).length)} portent un résumé en langage clair.` : '');

  let reste;
  if (parSeance) {
    // En mode séance on pagine par SÉANCES, jamais par fiches : sinon la dernière séance
    // affichée serait coupée en plein milieu et son décompte mentirait.
    const groupes = grouperParSeance(filtrees);
    const montres = groupes.slice(0, etat.limiteSeances);
    $('#liste-decisions').innerHTML = montres.length
      ? montres.map(rendreSeance).join('')
      : '<p class="vide">Aucune décision ne correspond.</p>';
    reste = groupes.length - montres.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = `Afficher plus (${nombreFr(reste)} séance${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''})`;
  } else {
    const visibles = filtrees.slice(0, etat.limiteDecisions);
    $('#liste-decisions').innerHTML = visibles.length ? visibles.map(carteDecision).join('') : '<p class="vide">Aucune décision ne correspond.</p>';
    reste = filtrees.length - visibles.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = `Afficher plus (${nombreFr(reste)} restantes)`;
  }
  reinitialiserDepliage();
}

// Une séance, c'est l'unité dans laquelle la Ville travaille et dans laquelle les gens
// pensent — bien plus qu'une liste continue de 2 900 fiches. À Laval elle a un id
// (« CE-20260204-HC-09h11 »), parce que la date et l'instance ne suffisent pas : le comité
// exécutif siège parfois deux fois le même jour, en public puis à huis clos.
const SOUS_TYPES = { Ordinaire: 'séance ordinaire', Extraordinaire: 'séance extraordinaire', Publique: 'séance publique', 'Huis clos': 'séance à huis clos' };

function libelleSeance(s, d) {
  const sousType = s?.sousTypeLibelle ?? d?.sousType ?? '';
  const heure = s?.pv?.heure ?? s?.heure ?? null;
  return `${SOUS_TYPES[sousType] ?? (sousType ? `séance ${sousType.toLowerCase()}` : 'séance')} du ${dateFr(s?.date ?? d?.date)}${heure ? `, ${heureFr(heure)}` : ''}`;
}

// Le titre affiché d'une fiche. Pour une décision, c'est l'objet, tel que les scrapers
// l'ont lu. Pour un document de séance, scrapers/decisions.js écrit un libellé technique
// qui porte la date brute du fichier — « Procès-verbal — Comité exécutif, séance publique
// du 2026-09-09 à 09 h 00 ». On le réécrit ici à partir de la séance elle-même : même
// instance, même sous-type, même date, même heure, rien d'ajouté — seulement écrit comme
// on lit une date en français. Si la séance manque de decisions.json, on garde le texte
// des données plutôt que d'en inventer un.
function objetDecision(d) {
  if (!estDocument(d)) return d.objet ?? '(sans objet)';
  const s = etat.seances.get(d.seanceId);
  if (!s) return d.objet ?? '(sans objet)';
  return `${d.type} — ${s.nom ?? d.instance ?? ''}, ${libelleSeance(s, d)}`;
}

function grouperParSeance(decisions) {
  const groupes = new Map();
  for (const d of decisions) {
    const cle = d.seanceId ?? `${d.date ?? '0000-00-00'}__${d.instance ?? ''}`;
    if (!groupes.has(cle)) {
      const s = etat.seances.get(d.seanceId) ?? null;
      groupes.set(cle, {
        id: cle,
        date: s?.date ?? d.date ?? '',
        instance: s?.nom ?? d.instance ?? '',
        rang: (s?.instance ?? (/exécutif/i.test(d.instance ?? '') ? 'CE' : 'CM')) === 'CM' ? 0 : 1,
        heure: s?.pv?.heure ?? s?.heure ?? '',
        libelle: libelleSeance(s, d),
        lignes: [],
      });
    }
    groupes.get(cle).lignes.push(d);
  }
  // Les plus récentes d'abord ; le même jour, le conseil avant le comité exécutif, puis
  // l'ordre des heures.
  return [...groupes.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.rang - b.rang || a.heure.localeCompare(b.heure)
  );
}

// La séance est elle-même repliable : au chargement on ne voit que les en-têtes, ce qui
// donne l'agenda de la Ville d'un coup d'œil. On ouvre la séance qui nous intéresse, puis
// la décision qui nous intéresse dedans. Deux niveaux, deux clics.
//
// Pas d'accordéon ici, contrairement aux fiches : on veut pouvoir comparer deux séances
// côte à côte, alors qu'empiler quinze décisions dépliées n'aide personne.
function rendreSeance(g) {
  const decisions = g.lignes.filter((d) => !estDocument(d)).length;
  const documents = g.lignes.length - decisions;
  return `<details class="seance">
      <summary class="seance-entete">
        <h3>${echapper(g.instance)}</h3>
        <span class="seance-date">${echapper(g.libelle)}</span>
        ${decisions ? `<span class="puce">${decisions} décision${decisions > 1 ? 's' : ''}</span>` : ''}
        ${documents ? `<span class="puce document">${documents} document${documents > 1 ? 's' : ''}</span>` : ''}
      </summary>
      <div class="seance-corps">${g.lignes.map(carteDecision).join('')}</div>
    </details>`;
}

// ---------- votes ----------
// Les résultats tels que les scrapers les écrivent : « Adoptée à l'unanimité », « Adoptée »
// (après un vote demandé), « Rejetée ».
function classeResultat(r) {
  if (!r) return '';
  if (r.includes('unanimité')) return 'r-unanimite';
  if (/rejet/i.test(r)) return 'r-rejetee';
  // « Maintenue » : le mot de la Ville quand le vote porte sur une décision de la présidence.
  if (/adopt|accept|maintenu/i.test(r)) return 'r-majorite';
  return '';
}

// « L'amendement » -> « l'amendement », pour le mettre dans une phrase.
const minusculeInitiale = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function carteVote(v) {
  const noms = (liste) =>
    liste.length
      ? `<div class="noms">${liste.map((n) => `<span class="nom">${echapper(n)}</span>`).join('')}</div>`
      : '<p class="vide">Aucun nom extrait.</p>';

  // Le décompte est l'information la plus utile de l'en-tête : elle mérite sa couleur,
  // séparée en deux jetons plutôt qu'une pastille grise où tout se vaut. C'est le décompte
  // imprimé par la Ville qui est montré ; les noms lus sont recoupés avec lui.
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
      ${v.numero && !v.voteDeProcedure ? `<a class="lien-pdf" href="decisions.html?q=${encodeURIComponent(v.numero)}">La décision ${echapper(v.numero)}</a>` : ''}
    </p>`;

  return carteRepliable(entete, corps);
}

function votesFiltres() {
  const q = $('#rech-votes').value.trim().toLowerCase();
  const resultat = $('#filtre-resultat-votes')?.value ?? '';
  const theme = $('#filtre-theme-votes')?.value ?? '';
  return etat.votes.votes.filter((v) => {
    if (resultat && v.resultat !== resultat) return false;
    if (theme && v.theme !== theme) return false;
    if (!q) return true;
    return [v.objet ?? '', v.numero ?? '', v.dossier ?? '', ...v.pour, ...v.contre].join(' ').toLowerCase().includes(q);
  });
}

// Décompte brut par personne : combien de fois nommée contre, combien de fois pour, combien
// de fois nommée en tout. Aucune interprétation — voter contre est une position, pas un
// défaut ni un mérite, et la page le dit.
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
  // Par ordre alphabétique, jamais par nombre de votes contre : un tableau trié par « contre »
  // est un classement de personnes, et le projet n'en fait pas (règle 2).
  return [...parPersonne.entries()]
    .map(([nom, c]) => ({ nom, ...c, nommee: c.pour + c.contre }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function tableauVotesContre(votes) {
  return comptesParPersonne(votes)
    .map((p) => `<tr><td>${echapper(p.nom)}</td><td class="n">${p.contre}</td><td class="n">${p.pour}</td><td class="n">${p.nommee}</td></tr>`)
    .join('');
}

function rendreVotes() {
  const votes = etat.votes.votes;
  if ($('#table-dissidence')) {
    $('#table-dissidence tbody').innerHTML = tableauVotesContre(votes);
    // Le tableau est replié : son résumé dit combien de personnes y figurent, et rien de plus.
    // Il a d'abord nommé les trois plus souvent contre : c'était un palmarès sur de vraies
    // personnes, que la règle 2 du projet interdit — et une assiette trompeuse, puisque les
    // votes nominaux ne portent que sur les points contestés du conseil municipal. Le décompte
    // reste consultable, il n'est plus classé en accroche.
    if ($('#resume-dissidence')) {
      const tri = comptesParPersonne(votes);
      $('#resume-dissidence').textContent =
        `${tri.length} personne${tri.length > 1 ? 's' : ''} nommée${tri.length > 1 ? 's' : ''} — décompte brut, sans interprétation`;
    }
  }

  if (!$('#rech-votes').dataset.rempli) {
    if ($('#filtre-resultat-votes')) {
      const compte = new Map();
      for (const v of votes) if (v.resultat) compte.set(v.resultat, (compte.get(v.resultat) ?? 0) + 1);
      remplirSelect(
        $('#filtre-resultat-votes'),
        [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, n]) => ({ valeur, n }))
      );
    }
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
    $('#rech-votes').dataset.rempli = '1';
  }

  const filtres = votesFiltres();
  const visibles = filtres.slice(0, etat.limiteVotes);
  const annee = etat.votes.parametres?.annee ?? '';
  $('#compte-votes').textContent =
    `${filtres.length} vote(s) nominal(aux) affiché(s) sur ${etat.votes.nombre}${annee ? ` en ${annee}` : ''}` +
    (etat.votes.documentsAnalyses != null ? ` (${etat.votes.documentsAnalyses} procès-verbaux lus)` : '') +
    `. ${etat.votes.avecAvertissement ?? 0} portent un avertissement d'extraction.`;
  $('#liste-votes').innerHTML = visibles.length ? visibles.map(carteVote).join('') : '<p class="vide">Aucun vote ne correspond.</p>';
  const reste = filtres.length - visibles.length;
  $('#plus-votes').hidden = reste <= 0;
  $('#plus-votes').textContent = `${Math.min(PAS_VOTES, reste)} de plus (${reste} restants)`;
  reinitialiserDepliage();
}

// ---------- membres du conseil ----------
// Les procès-verbaux nomment les votants en toutes lettres (« Aglaia Revelakis ») ; la page
// des élus peut écrire autrement (accents, espaces insécables). On compare sans accents ni casse.
const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();

function votesContreDe(m) {
  if (!etat.votes || !m.nomComplet) return null;
  const nom = sansAccents(m.nomComplet);
  return etat.votes.votes.filter((v) => v.contre.some((n) => sansAccents(n) === nom)).length;
}

// Les présences (jeu ouvert de la Ville) sont rangées par année (parAnnee). On montre
// l'année demandée si la Ville y a publié des séances ; sinon la plus récente qui en a —
// le jeu est mensuel et prend du retard (au 17 septembre 2026, il s'arrêtait au
// 18 novembre 2025). L'année affichée est toujours dite sur la fiche.
function blocPresences() {
  const p = etat.presences;
  if (!p) return null;
  if (Array.isArray(p.membres) && p.membres.length) return { annee: p.annee, nombreSeances: p.nombreSeances, membres: p.membres };
  const annees = [...new Set([p.annee, ...(p.annees ?? []), ...Object.keys(p.parAnnee ?? {})].filter(Boolean))].sort().reverse();
  for (const annee of annees) {
    const bloc = p.parAnnee?.[annee];
    if (bloc?.nombreSeances > 0 && bloc.membres?.length) return bloc;
  }
  return null;
}

// Une personne se rattache d'abord par le numéro de district — la clé la plus sûre —,
// sinon par le nom (le maire n'a pas de district).
function presencesDe(m) {
  const membres = blocPresences()?.membres ?? [];
  if (!membres.length) return null;
  const parDistrict = m.districtNumero ? membres.find((p) => p.districtNumero === m.districtNumero) : null;
  if (parDistrict) return parDistrict;
  const nom = sansAccents(m.nomComplet);
  return membres.find((p) => sansAccents(p.nomComplet) === nom) ?? null;
}

// Accord en genre. Onze des vingt-trois fiches de la Ville portent « Conseillère
// municipale » : écrire « présent à 18 séances » sous le nom de Cecilia Macedo était une
// faute de français, et sur un site qui parle de personnes réelles, une faute qui se voit.
// Le genre n'est jamais deviné d'après le prénom : il vient de la fonction que la Ville
// écrit elle-même (dans l'alt de la photo pour la page des élus, dans la colonne
// « fonction » du jeu des présences). Sans fonction connue, masculin, comme la Ville.
const auFeminin = (...sources) => sources.some((f) => /^\s*(conseill[èe]re|mairesse|pr[ée]sidente|vice-pr[ée]sidente)/i.test(f ?? ''));

// « Stéphane Boyer » -> « SB ». Derrière la photo, pour quand elle ne charge pas.
function initiales(nomComplet) {
  return String(nomComplet ?? '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');
}

// Le nombre d'habitants, tel que la Ville l'écrit sur la fiche de profil (nombre ou texte).
function habitantsFr(h) {
  if (h == null || h === '') return '';
  return typeof h === 'number' ? nombreFr(h) : String(h).trim();
}

// Les décisions de l'année dont l'ordre du jour nomme ce district (jamais « Tous les
// districts », qui n'apprend rien sur celui-ci). Le lien filtre la page des décisions.
function decisionsDuDistrict(numero) {
  if (!etat.decisions || !numero) return 0;
  return etat.decisions.decisions.filter((d) => (d.districts ?? []).some((k) => k.numero === numero)).length;
}

function carteElu(m) {
  const roles = (m.roles ?? []).filter(Boolean);
  const votesContre = votesContreDe(m);
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
      ${votesContre ? `<p class="compte" style="margin:6px 0 0">${votesContre} vote${votesContre > 1 ? 's' : ''} contre consigné${votesContre > 1 ? 's' : ''}${etat.votes?.parametres?.annee ? ` en ${echapper(etat.votes.parametres.annee)}` : ''} — <a href="votes.html?q=${encodeURIComponent(m.nomComplet)}">les voir</a>.</p>` : ''}
      <p class="coordonnees">
        ${[
          m.courriel ? `<a href="mailto:${echapper(m.courriel)}">${echapper(m.courriel)}</a>` : '',
          m.telephone ? `<a href="tel:${echapper(String(m.telephone).replace(/[^\d+]/g, ''))}">${echapper(m.telephone)}</a>` : '',
          m.profil ? `<a href="${echapper(m.profil)}" target="_blank" rel="noopener">Son profil sur laval.ca ↗</a>` : '',
          decisions ? `<a href="decisions.html?district=${numero}">${decisions} décision${decisions > 1 ? 's' : ''} de l'année nomme${decisions > 1 ? 'nt' : ''} le district</a>` : '',
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  </article>`;
}

// Sans elus.json, districts.json porte déjà l'essentiel (nom, parti, coordonnées, rôles) :
// la page reste utile avec la carte seule, en le disant.
function membresDepuisDistricts() {
  return (etat.districts?.districts ?? []).map((d) => ({
    nomComplet: d.conseiller ?? 'Poste vacant',
    fonction: null,
    districtNumero: d.numero,
    district: d.nom,
    parti: d.parti ?? null,
    roles: d.roles ?? [],
    telephone: d.telephone ?? null,
    courriel: d.courriel ?? null,
    profil: null,
    habitants: null,
    photo: d.photo ?? null,
  }));
}

// Les partis : liste [{nom, n}] à Laval ; on accepte aussi l'objet {nom: n} de Longueuil.
function partisEnListe(partis) {
  if (Array.isArray(partis)) return partis.map((p) => [p.nom, p.n]);
  return Object.entries(partis ?? {});
}

const estMaire = (m) => !m.districtNumero && /maire/i.test(m.fonction ?? '');

function rendreElus() {
  const depuisDistricts = !etat.elus;
  const membres = etat.elus?.membres ?? membresDepuisDistricts();
  const partis = partisEnListe(etat.elus?.partis).sort((a, b) => b[1] - a[1]);
  const conseillers = membres.filter((m) => !estMaire(m)).length;
  $('#compte-elus').textContent =
    (depuisDistricts
      ? `${membres.length} districts, d'après la carte des districts (la page des membres du conseil n'a pas encore été lue)`
      : `${membres.length} membres du conseil municipal — ${membres.length - conseillers ? 'le maire et ' : ''}${conseillers} conseillères et conseillers`) +
    (partis.length ? ' — ' + partis.map(([p, n]) => `${p} ${n}`).join(' · ') : '') + '.';

  // Les présences : d'où elles viennent et jusqu'où le jeu de la Ville va. Quand l'année
  // affichée n'est pas celle du site, on le dit avant les fiches, pas en petit dessous.
  const bloc = blocPresences();
  const p = etat.presences;
  const notePresences = !p
    ? ''
    : !bloc
      ? `<p class="compte">Présences&nbsp;: le jeu ouvert de la Ville ne contient encore aucune séance exploitable${p.derniereSeance ? ` (dernière séance publiée&nbsp;: ${dateFr(p.derniereSeance)})` : ''}.</p>`
      : `<p class="compte">Présences&nbsp;: ${bloc.nombreSeances} séance${bloc.nombreSeances > 1 ? 's' : ''} de ${echapper(bloc.annee)} dans le jeu ouvert de la Ville${bloc.annee !== p.annee && p.derniereSeance ? ` — le jeu s'arrête au ${dateFr(p.derniereSeance)}, aucune séance de ${echapper(p.annee)} n'y est encore publiée` : ''}${p.jeuModifieLe ? ` (jeu mis à jour le ${dateFr(String(p.jeuModifieLe).slice(0, 10))})` : ''}. Le nombre de séances où une personne est nommée dépend de la date de son entrée au conseil.</p>`;

  // Ce que le scraper n'a pas su lire proprement dans le jeu de la Ville est écrit dans
  // presences.json — il n'était affiché nulle part. Or ces avertissements changent la
  // lecture des chiffres juste au-dessus : en 2025, une séance extraordinaire y compte
  // pour vingt-deux, ce qui gonfle le « nombre de séances de l'année ». On le dit ici
  // plutôt que de corriger le jeu à la place de la Ville (règle : on signale, on ne
  // devine pas). L'avertissement du fichier entier, lui, est déjà dans la note ci-dessus.
  const alertesPresences = bloc?.avertissements ?? [];
  const notePresencesAlertes = alertesPresences.length
    ? `<div class="drapeau"><strong>Ce que le jeu de la Ville ne dit pas clairement&nbsp;:</strong><ul>${alertesPresences
        .map((a) => `<li>${echapper(a)}</li>`)
        .join('')}</ul></div>`
    : '';

  const maire = membres.filter(estMaire);
  const districts = membres.filter((m) => !estMaire(m)).sort((a, b) => (a.districtNumero ?? 999) - (b.districtNumero ?? 999));
  $('#liste-elus').innerHTML =
    notePresences +
    notePresencesAlertes +
    (maire.length ? `<h2 class="section">Mairie</h2><div class="grille-elus">${maire.map(carteElu).join('')}</div>` : '') +
    `<h2 class="section">Les ${districts.length} districts</h2><div class="grille-elus">${districts.map(carteElu).join('')}</div>`;
}

// ---------- carte des districts ----------
// Projection Web Mercator, calculée ici : 22 polygones en SVG, aucune librairie et aucun
// serveur de tuiles à appeler. La page reste autonome et ne fuit rien vers l'extérieur.
function projeter([lon, lat]) {
  const x = (lon * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
  return [x, y];
}

// La carte est colorée par parti. Teintes neutres et volontairement éloignées des couleurs
// des partis : la carte dit qui siège où, pas pour qui voter. La clé est le nom du parti
// normalisé (laval.ca écrit tantôt « Mouvement Lavallois », tantôt « Mouvement lavallois »).
// Un parti absent d'ici reçoit une teinte de réserve, dans l'ordre d'apparition.
const PALETTE_PARTI = new Map([
  ['mouvement lavallois', '#6B7A8A'], // gris-bleu
  ['action laval', '#8B7355'], // brun clair
  ['parti laval', '#6F7A52'], // olive
  ['independante', '#8A6B8F'], // mauve
]);
const PALETTE_RESERVE = ['#4E7F7A', '#96741A', '#7D6A55', '#5F7F6B'];
const cleParti = (nom) => sansAccents(nom).replace(/^independant$/, 'independante');

function couleursParParti(districts) {
  const table = new Map(); // clé normalisée -> { libelle, couleur, n }
  let reserve = 0;
  for (const d of districts) {
    if (!d.parti) continue;
    const cle = cleParti(d.parti);
    if (!table.has(cle)) {
      table.set(cle, { libelle: String(d.parti).replace(/ /g, ' ').trim(), couleur: PALETTE_PARTI.get(cle) ?? PALETTE_RESERVE[reserve++ % PALETTE_RESERVE.length], n: 0 });
    }
    table.get(cle).n++;
  }
  return table;
}

// Le cadre géographique : celui que le scraper a écrit, sinon celui que les contours donnent.
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

function rendreCarte() {
  const districts = (etat.districts?.districts ?? []).filter((d) => d.anneaux?.length);
  if (!districts.length) {
    if ($('#carte')) $('#carte').innerHTML = '<p class="vide">La carte des districts n\'est pas disponible pour l\'instant.</p>';
    return;
  }
  const table = couleursParParti(districts);
  const cadre = cadreDe(districts, etat.districts.cadre);

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
  // Le numéro du district, posé au centre de la boîte de son plus grand contour. C'est un
  // repère, pas une mesure : sur un district en archipel, il peut tomber dans l'eau.
  const centre = (anneaux) => {
    const plusGrand = [...anneaux].sort((a, b) => b.length - a.length)[0];
    const pts = plusGrand.map(enSvg);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };

  $('#carte').innerHTML =
    `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="Carte des ${districts.length} districts électoraux de la Ville de Laval, colorée par parti">` +
    districts
      .map((d) => {
        const parti = d.parti ? table.get(cleParti(d.parti)) : null;
        return (
          `<path d="${chemin(d.anneaux)}" class="district${d.conseiller ? '' : ' vacant'}" data-numero="${d.numero}" ` +
          `fill="${parti?.couleur ?? '#999'}" tabindex="0" role="button" ` +
          `aria-label="District ${d.numero} — ${echapper(d.nom ?? '')}${d.conseiller ? `, ${echapper(d.conseiller)}` : ''}">` +
          `<title>${echapper(libelleDistrict(d))}${d.conseiller ? ` — ${echapper(d.conseiller)}` : ''}${parti ? ` (${echapper(parti.libelle)})` : ''}</title></path>`
        );
      })
      .join('') +
    districts
      .map((d) => {
        const [x, y] = centre(d.anneaux);
        return `<text class="etiquette-district" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${d.numero}</text>`;
      })
      .join('') +
    '</svg>';

  $('#legende').innerHTML = [...table.values()]
    .sort((a, b) => b.n - a.n)
    .map((p) => `<span class="cle-legende"><i style="background:${p.couleur}"></i>${echapper(p.libelle)} <span class="n">(${p.n})</span></span>`)
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

// ---------- lexique ----------
// Les définitions viennent de nous ; les décomptes et les exemples viennent des documents
// de la Ville. La page distingue visuellement les deux — c'est tout l'intérêt de l'exercice.
// Le plus simple possible : le mot, ce qu'il veut dire, où on le croise, et un vrai exemple.
// Les décomptes mesurés sur le corpus restent dans data/lexique.json — ils servent à
// vérifier que les formulations cherchées collent encore aux documents — mais les
// afficher répondait à une question que le lecteur ne se pose pas.
function exempleLexique(e) {
  const ex = e.exemple;
  if (!ex) return '';
  if (typeof ex === 'string') return `<p class="exemple">Exemple&nbsp;: «&nbsp;${echapper(ex)}&nbsp;»</p>`;
  const texte = ex.objet ?? ex.texte ?? ex.titre ?? '';
  const lien = ex.pdf ?? ex.url ?? null;
  if (!texte && !lien) return '';
  return `<p class="exemple">Exemple&nbsp;: ${texte ? `«&nbsp;${echapper(texte)}&nbsp;»` : ''}${ex.numero ? ` (${echapper(ex.numero)}${ex.date ? `, ${dateFr(ex.date)}` : ''})` : ex.date ? ` (${dateFr(ex.date)})` : ''}${lien ? ` — <a href="${echapper(lien)}" target="_blank" rel="noopener">document officiel (PDF) ↗</a>` : ''}</p>`;
}

function entreeLexique(e) {
  return `<div class="entree-lexique">
      <h3 class="terme">${echapper(e.terme)}</h3>
      ${e.aussi ? `<p class="alias">On dit aussi&nbsp;: ${echapper(e.aussi)}</p>` : ''}
      <p class="definition">${echapper(e.definition)}</p>
      ${e.ouVousLeVoyez ? `<p class="remarque">${echapper(e.ouVousLeVoyez)}</p>` : ''}
      ${exempleLexique(e)}
    </div>`;
}

function lexiqueFiltre() {
  const q = ($('#rech-lexique')?.value ?? '').trim().toLowerCase();
  return (etat.lexique.entrees ?? []).filter((e) => {
    if (!q) return true;
    return [e.terme, e.aussi ?? '', e.definition, e.ouVousLeVoyez ?? ''].join(' ').toLowerCase().includes(q);
  });
}

function rendreLexique() {
  const entrees = lexiqueFiltre();
  const total = etat.lexique.nombre ?? (etat.lexique.entrees ?? []).length;
  // Les catégories : un objet {clé: titre} (ordre déclaré côté données), ou, à défaut, les
  // clés rencontrées dans les entrées.
  let categories = etat.lexique.categories ?? {};
  if (Array.isArray(categories)) categories = Object.fromEntries(categories.map((c) => (typeof c === 'string' ? [c, c] : [c.cle ?? c.id, c.titre ?? c.libelle ?? c.cle])));
  if (!Object.keys(categories).length) categories = Object.fromEntries([...new Set((etat.lexique.entrees ?? []).map((e) => e.categorie ?? 'autres'))].map((c) => [c, c]));

  // Chaque catégorie est un menu dépliant, fermé à l'arrivée : on voit les titres d'un
  // coup, on ouvre celui qu'on cherche. Une recherche en cours ouvre les catégories où
  // elle a trouvé quelque chose — sinon les résultats resteraient cachés.
  const recherche = ($('#rech-lexique')?.value ?? '').trim() !== '';
  $('#compte-lexique').textContent = entrees.length === total ? `${entrees.length} termes` : `${entrees.length} terme(s) sur ${total}`;

  const html = Object.entries(categories)
    .map(([cle, titre]) => {
      const dedans = entrees.filter((e) => (e.categorie ?? 'autres') === cle);
      if (!dedans.length) return '';
      // La classe de catégorie porte la couleur : le titre, le filet et les termes en
      // héritent, sans qu'aucune teinte soit écrite dans le HTML.
      return (
        `<details class="lexique-cat cat-${echapper(cle)}"${recherche ? ' open' : ''}>` +
        `<summary><h2 class="section">${echapper(titre)}<span class="compte-cat">${dedans.length} terme${dedans.length > 1 ? 's' : ''}</span></h2></summary>` +
        `<div class="bloc-lexique">${dedans.map(entreeLexique).join('')}</div>` +
        `</details>`
      );
    })
    .join('');
  $('#liste-lexique').innerHTML = html || '<p class="vide">Aucun terme ne correspond.</p>';
  reinitialiserDepliage();
}

// ---------- accueil : le fil de ce qui a changé ----------
// Les scrapers marquent `nouveau` sur ce qui n'était pas là à l'extraction précédente.
// Quand rien n'a bougé (ou à la toute première extraction, où il n'y a rien à comparer),
// on montre l'activité la plus récente en le disant clairement, plutôt qu'une page vide.
function evenementsRecents() {
  const evenements = [];
  for (const d of etat.decisions?.decisions ?? []) {
    evenements.push({ date: d.date, genre: 'decision', nouveau: d.nouveau === true, data: d });
  }
  for (const v of etat.votes?.votes ?? []) {
    evenements.push({ date: v.date, genre: 'vote', nouveau: v.nouveau === true, data: v });
  }
  evenements.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const nouveaux = evenements.filter((e) => e.nouveau);
  return { evenements, nouveaux, mode: nouveaux.length ? 'nouveautes' : 'recents' };
}

function ligneEvenement(e) {
  if (e.genre === 'vote') {
    const v = e.data;
    const entete = `<div class="meta">
        <span class="puce genre-vote">vote nominal</span>
        ${v.numero ? `<span class="puce num">${echapper(v.numero)}</span>` : ''}
        <span>${dateFr(v.date)}</span>
        ${v.instance ? `<span class="puce">${echapper(v.instance)}</span>` : ''}
        ${v.resultat ? `<span class="resultat ${classeResultat(v.resultat)}">${echapper(v.resultat)}</span>` : ''}
        ${e.nouveau ? '<span class="puce neuf">nouveau</span>' : ''}
      </div>
      <p class="objet">${echapper(v.objet ?? '(sans objet)')}</p>`;
    const corps = `<p class="compte" style="margin:0">
        ${v.decomptePour ?? v.pour.length} pour, ${v.decompteContre ?? v.contre.length} contre${
          v.contre.length ? ' — contre : ' + v.contre.map(echapper).join(', ') : ''
        }. <a href="votes.html${v.numero ? `?q=${encodeURIComponent(v.numero)}` : ''}">Voir le détail</a>
      </p>`;
    return carteRepliable(entete, corps);
  }

  const d = e.data;
  const entete = `${pucesDecision(d, { nouveau: e.nouveau, genre: true })}<p class="objet">${echapper(objetDecision(d))}</p>`;
  return carteRepliable(entete, corpsDecision(d));
}

function rendreFil() {
  if (!$('#fil')) return;
  const { evenements, nouveaux, mode } = evenementsRecents();
  const source = mode === 'nouveautes' ? nouveaux : evenements;
  const aMontrer = source.slice(0, etat.limiteFil);

  // Le titre suffit à dire ce qu'on regarde. Le détail de l'extraction (date, nombre de
  // nouveautés) vit sur la page « Sources », là où on va quand on se pose la question —
  // pas en travers du fil quand on veut juste lire.
  $('#titre-fil').textContent = mode === 'nouveautes' ? 'Ce qui a changé' : 'Activité récente';
  $('#fil').innerHTML = aMontrer.map(ligneEvenement).join('');

  const reste = source.length - aMontrer.length;
  if ($('#plus-fil')) {
    $('#plus-fil').hidden = reste <= 0;
    $('#plus-fil').textContent = `${Math.min(PAS_FIL, reste)} de plus (${nombreFr(reste)} restants)`;
  }
}

// ---------- accueil ----------
function rendreAccueil() {
  const chiffres = [];
  if (etat.decisions) {
    const decisions = etat.decisions.decisions.filter((d) => !estDocument(d)).length;
    chiffres.push({ n: nombreFr(decisions), quoi: `décisions lues dans les procès-verbaux de ${etat.decisions.parametres.annee}`, lien: 'decisions.html' });
  }
  if (etat.votes) {
    chiffres.push({ n: nombreFr(etat.votes.nombre), quoi: `votes nominaux au conseil municipal en ${etat.votes.parametres?.annee ?? ''}`.trim(), lien: 'votes.html' });
  }
  if (etat.resumes) {
    chiffres.push({ n: nombreFr(etat.resumes.nombre ?? etat.parSommaire.size), quoi: 'sommaires décisionnels résumés en langage clair', lien: 'decisions.html' });
  }
  if (etat.elus) {
    chiffres.push({ n: etat.elus.nombre ?? etat.elus.membres?.length ?? 0, quoi: 'membres du conseil municipal', lien: 'conseil.html' });
  }
  if ($('#chiffres')) {
    $('#chiffres').innerHTML = chiffres
      .map((c) => `<a class="chiffre" href="${c.lien}"><div class="n">${c.n}</div><div class="quoi">${echapper(c.quoi)}</div></a>`)
      .join('');
  }

  rendreFil();
}

// ---------- état des données ----------
// La page Sources dit ce qui est chargé, de quand, et ce qui manque — jeu par jeu. C'est
// là qu'on voit qu'une séance attend encore son procès-verbal, ou que l'index de la Ville
// date d'une capture d'il y a dix jours.
function rendreEtat() {
  const lignes = [];
  const quand = (data) => (data?.generatedAt ? new Date(data.generatedAt).toLocaleString('fr-CA') : '—');
  const ajouter = (nom, data, extra) => {
    if (!data) {
      lignes.push(`<tr><td>${nom}</td><td colspan="2">non chargé</td></tr>`);
      return;
    }
    lignes.push(`<tr><td>${nom}</td><td>${quand(data)}</td><td class="n">${extra}</td></tr>`);
  };
  const d = etat.decisions;
  ajouter('Décisions', d, d ? `${nombreFr(d.nombre)} fiches / ${nombreFr(d.totalDisponible)}` : '');
  ajouter('Votes nominaux', etat.votes, etat.votes ? `${etat.votes.nombre} / ${etat.votes.totalDisponible ?? etat.votes.nombre}` : '');
  ajouter('Sommaires décisionnels lus', etat.sommaires, etat.sommaires ? `${etat.sommaires.nombre ?? etat.sommairesLus.size}${etat.sommaires.nonPublies?.nombre ? ` (${nombreFr(etat.sommaires.nonPublies.nombre)} cités mais non publiés)` : ''}` : '');
  ajouter('Résumés en langage clair', etat.resumes, etat.resumes ? `${etat.resumes.nombre ?? etat.parSommaire.size}` : '');
  ajouter('Membres du conseil', etat.elus, etat.elus ? `${etat.elus.nombre ?? etat.elus.membres?.length ?? 0}` : '');
  ajouter('Districts électoraux', etat.districts, etat.districts ? `${etat.districts.nombre ?? etat.districts.districts?.length ?? 0}` : '');
  const bloc = blocPresences();
  ajouter('Présences aux séances', etat.presences, etat.presences ? (bloc ? `${bloc.membres.length} personnes, ${bloc.nombreSeances} séances en ${bloc.annee}` : 'aucune séance exploitable') : '');
  ajouter('Lexique', etat.lexique, etat.lexique ? `${etat.lexique.nombre ?? (etat.lexique.entrees ?? []).length} termes` : '');
  if (d?.seances) {
    lignes.push(`<tr><td>Séances de l'année</td><td>${d.seancesLues ?? 0} procès-verbaux lus</td><td class="n">${d.seancesEnAttente ?? 0} en attente</td></tr>`);
  }
  const enAttente = (d?.seances ?? []).filter((s) => s.etat && s.etat !== 'lue');

  // Ce que les scrapers n'ont pas su lire proprement. La page d'état est justement l'endroit
  // où on vient chercher ça : afficher « 40 séances en 2025 » sans dire qu'une séance
  // extraordinaire y compte pour vingt-deux ferait mentir le tableau juste au-dessus.
  // On recopie les avertissements des fichiers, on ne les résume pas.
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
      ? `<div class="drapeau"><strong>Ce qui reste à vérifier dans les données&nbsp;:</strong><ul>${reserves
          .map(([jeu, texte]) => `<li><strong>${echapper(jeu)}</strong> — ${echapper(texte)}</li>`)
          .join('')}</ul></div>`
      : '') +
    (d?.indexObtenu ? `<p class="etat-note">Index des documents de la Ville&nbsp;: ${echapper(d.indexObtenu)}${d.indexDu ? ` — état de l'index au ${new Date(d.indexDu).toLocaleString('fr-CA')}` : ''}.</p>` : '') +
    (enAttente.length ? `<p class="etat-note">En attente&nbsp;: ${enAttente.map((s) => `${echapper(s.nom ?? s.instance)} du ${dateFr(s.date)}${s.heure ? `, ${heureFr(s.heure)}` : ''} (${echapper(s.etat)})`).join(' · ')}.</p>` : '') +
    (d?.licence ? `<p class="etat-note">${echapper(d.licence)}</p>` : '') +
    (etat.resumes?.modele ? `<p class="etat-note">Modèle utilisé pour les résumés&nbsp;: <code>${echapper(etat.resumes.modele)}</code>.</p>` : '');
  if ($('#date-index') && d?.indexObtenu) $('#date-index').textContent = d.indexObtenu;

  // L'archive : le site ne la charge pas, il se contente d'annoncer ce qu'elle contient.
  if (!$('#etat-archive')) return;
  const annees = etat.archives?.annees ?? [];
  if (annees.length === 0) {
    $('#etat-archive').innerHTML = '<p class="compte">Aucune année archivée pour l\'instant.</p>';
    return;
  }
  const totalDocs = annees.reduce((n, a) => n + a.nombre, 0);
  const totalOctets = annees.reduce((n, a) => n + a.octetsCompresses, 0);
  $('#etat-archive').innerHTML =
    '<table><thead><tr><th>Année</th><th class="n">Documents</th><th class="n">Taille</th><th>Archivée le</th></tr></thead><tbody>' +
    annees
      .map(
        (a) =>
          `<tr><td>${echapper(a.annee)}</td><td class="n">${nombreFr(a.nombre)}</td>` +
          `<td class="n">${nombreFr(Math.round(a.octetsCompresses / 1024))} ko</td>` +
          `<td>${echapper(String(a.archiveLe ?? '').slice(0, 10))}</td></tr>`
      )
      .join('') +
    '</tbody></table>' +
    `<p class="compte">${annees.length} année(s), ${nombreFr(totalDocs)} documents, ` +
    `${nombreFr(Math.round(totalOctets / 1024))} ko compressés au total.</p>`;
}

// ---------- démarrage ----------
const BESOINS = {
  accueil: ['decisions', 'votes', 'elus', 'resumes', 'sommaires'],
  decisions: ['decisions', 'resumes', 'sommaires'],
  votes: ['votes'],
  conseil: ['elus', 'districts', 'presences', 'votes', 'decisions'],
  lexique: ['lexique'],
  sources: ['decisions', 'votes', 'elus', 'resumes', 'sommaires', 'districts', 'presences', 'lexique'],
};

async function init() {
  const page = document.body.dataset.page;
  const noms = BESOINS[page] ?? [];
  const jeux = await Promise.all(noms.map(charger));
  noms.forEach((nom, i) => {
    etat[nom] = jeux[i];
  });
  etat.parSommaire = new Map((etat.resumes?.resumes ?? []).map((r) => [r.id, r]));
  etat.sommairesLus = new Map((etat.sommaires?.sommaires ?? []).map((s) => [s.numero, s]));
  etat.seances = new Map((etat.decisions?.seances ?? []).map((s) => [s.id, s]));
  // Le manifeste de l'archive vit dans un sous-dossier ; seule la page des sources le lit,
  // et elle ne lit que le manifeste, jamais les fichiers d'années eux-mêmes.
  if (page === 'sources') etat.archives = await charger('archives/index');

  // Ce sans quoi la page n'a rien à montrer. Le conseil se contente de la carte si la page
  // des membres n'a pas encore été lue.
  const requis = { accueil: 'decisions', decisions: 'decisions', votes: 'votes', conseil: 'elus', lexique: 'lexique', sources: null }[page];
  const manque = requis && !etat[requis] && !(page === 'conseil' && etat.districts);
  if (manque) {
    messageSansDonnees();
    return;
  }
  if ($('#chargement')) $('#chargement').hidden = true;

  if (page === 'accueil') rendreAccueil();
  if (page === 'decisions') {
    // Permet d'arriver ici avec un filtre déjà posé : depuis un vote (?q=numéro), depuis la
    // fiche d'un membre du conseil (?district=5), ou par un lien (?instance=, ?type=, ?theme=).
    const params = new URLSearchParams(location.search);
    const recherche = params.get('q');
    if (recherche && $('#rech-decisions')) $('#rech-decisions').value = recherche;
    rendreDecisions();
    let refaire = false;
    for (const [param, id] of [['instance', '#filtre-instance'], ['type', '#filtre-type'], ['theme', '#filtre-theme']]) {
      const valeur = params.get(param);
      const select = $(id);
      if (valeur && select && [...select.options].some((o) => o.value === valeur)) {
        select.value = valeur;
        refaire = true;
      }
    }
    if (refaire) rendreDecisions();
  }
  if (page === 'votes') {
    const recherche = new URLSearchParams(location.search).get('q');
    if (recherche && $('#rech-votes')) $('#rech-votes').value = recherche;
    rendreVotes();
  }
  if (page === 'conseil') {
    rendreCarte();
    rendreElus();
  }
  if (page === 'lexique') rendreLexique();
  if (page === 'sources') rendreEtat();
}

// Filtres et pagination : câblés seulement si la page les contient.
document.addEventListener('input', (e) => {
  if (e.target.matches('#rech-decisions, #filtre-type, #filtre-instance, #filtre-theme, #filtre-resume, #affichage')) {
    etat.limiteDecisions = PAS;
    etat.limiteSeances = PAS_SEANCES;
    rendreDecisions();
  }
  if (e.target.matches('#rech-lexique')) rendreLexique();
  if (e.target.matches('#rech-votes, #filtre-resultat-votes, #filtre-theme-votes')) {
    etat.limiteVotes = PAS_VOTES_DEPART;
    rendreVotes();
  }
});
if (existe('#plus-decisions')) {
  $('#plus-decisions').addEventListener('click', () => {
    etat.limiteDecisions += PAS;
    etat.limiteSeances += PAS_SEANCES;
    rendreDecisions();
  });
}
if (existe('#plus-fil')) {
  $('#plus-fil').addEventListener('click', () => {
    etat.limiteFil += PAS_FIL;
    rendreFil();
  });
}
if (existe('#plus-votes')) {
  $('#plus-votes').addEventListener('click', () => {
    etat.limiteVotes += PAS_VOTES;
    rendreVotes();
  });
}

// Carte : clic ou clavier sur un district.
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

// Une photo qui ne charge pas (laval.ca peut refuser de la servir à un site tiers) laisse
// la place aux initiales, déjà dessinées derrière elle. L'événement error ne remonte pas :
// on l'écoute en phase de capture, au niveau du document, avant que les fiches existent.
document.addEventListener(
  'error',
  (e) => {
    const portrait = e.target instanceof HTMLImageElement ? e.target.closest('.portrait') : null;
    if (portrait) portrait.classList.add('sans-photo');
  },
  true
);

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
  bouton.textContent = onDeplie ? 'Tout replier' : 'Tout déplier';
});

init();

// ---------- Bascule clair / sombre ----------
// Le thème est déjà posé sur <html> par le script en <head> (avant le premier rendu).
// Ici on ne fait que basculer et mémoriser. Si la personne n'a jamais choisi, on suit la
// préférence du système — y compris si elle change pendant la visite. Mêmes clés (dvm:)
// que Montréal et Longueuil : le réglage suit la personne d'un volet à l'autre.
(function basculeTheme() {
  const bouton = document.getElementById('bascule-theme');
  if (!bouton) return;

  const appliquer = (theme) => {
    document.documentElement.dataset.theme = theme;
    const versSombre = theme !== 'sombre';
    bouton.setAttribute('aria-pressed', String(theme === 'sombre'));
    const etiquette = versSombre ? 'Passer au thème sombre' : 'Passer au thème clair';
    bouton.title = etiquette;
    bouton.setAttribute('aria-label', etiquette);
  };

  appliquer(document.documentElement.dataset.theme || 'clair');

  bouton.addEventListener('click', () => {
    const suivant = document.documentElement.dataset.theme === 'sombre' ? 'clair' : 'sombre';
    appliquer(suivant);
    try { localStorage.setItem('dvm:theme', suivant); } catch {}
  });

  // Tant que rien n'a été choisi explicitement, on reste aligné sur le système.
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener?.('change', (e) => {
    let choisi = null;
    try { choisi = localStorage.getItem('dvm:theme'); } catch {}
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
  const PAS_ZOOM = 10;

  const lire = () => {
    const z = parseInt(document.documentElement.style.zoom, 10);
    return z >= MIN && z <= MAX ? z : 100;
  };

  const appliquer = (z) => {
    document.documentElement.style.zoom = z + '%';
    pct.textContent = z + '%';
    moins.disabled = z <= MIN;
    plus.disabled = z >= MAX;
    try { localStorage.setItem('dvm:zoom', String(z)); } catch {}
  };

  appliquer(lire());
  moins.addEventListener('click', () => appliquer(Math.max(MIN, lire() - PAS_ZOOM)));
  plus.addEventListener('click', () => appliquer(Math.min(MAX, lire() + PAS_ZOOM)));
})();

// ---------- retour en haut ----------
// Sur toutes les pages : la liste des décisions et la page du conseil sont longues. Le bouton
// n'apparaît qu'une fois qu'on a vraiment descendu, pour ne pas encombrer l'en-tête.
(function retourEnHaut() {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'haut';
  bouton.setAttribute('aria-label', 'Revenir en haut de la page');
  bouton.textContent = '↑';
  document.body.appendChild(bouton);
  // Le bouton apparaît quand on a descendu d'à peu près un écran, pas après 600 pixels fixes :
  // sur une page courte ou sur un téléphone, 600 pixels n'arrivaient jamais et la flèche ne
  // sortait pas (constaté le 18 septembre 2026 sur Mes dossiers).
  const seuil = () => Math.max(200, Math.min(600, Math.round(window.innerHeight * 0.6)));
  const majVisible = () => bouton.classList.toggle('visible', window.scrollY > seuil());
  window.addEventListener('scroll', majVisible, { passive: true });
  window.addEventListener('resize', majVisible, { passive: true });
  majVisible();
  bouton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();
