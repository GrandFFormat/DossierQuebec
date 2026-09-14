// Logique commune à toutes les pages de DossierVille.
//
// Chaque page HTML porte un attribut data-page sur <body> ; ce script charge uniquement
// les jeux de données dont cette page a besoin, puis appelle le rendu correspondant.
// Les données sont lues à l'exécution depuis data/*.json, donc les pages restent légères
// et une seule extraction met tout le site à jour.

// Version anglaise (commun/langue.js) : tr('français', 'English'), lib() pour les libellés de la Ville.
import { EN, tr } from '/commun/langue.js';
import { libelleEn, themeEn } from './libelles-en.js';
const lib = (texte) => (EN ? libelleEn(texte) : texte);

const PAS = 60; // fiches affichées par palier
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
const s = (n, sing, plur) => (n > 1 ? plur : sing);

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
  zone.innerHTML = tr(
    "<strong>Aucune donnée.</strong> Lancez <code>npm run refresh</code> à la racine du projet, " +
    'puis <code>npm run serve</code> et rechargez cette page. ' +
    "(Ouvrir le fichier par double-clic ne fonctionne pas&nbsp;: le navigateur bloque la lecture des fichiers JSON.)",
    '<strong>No data.</strong> Run <code>npm run refresh</code> at the project root, then <code>npm run serve</code>, and reload this page.'
  );
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
  const direct = etat.parId.get(d.id);
  if (direct) return { r: direct, indirect: false };
  const viaSommaire = d.sommaireId ? etat.parId.get(d.sommaireId) : null;
  return viaSommaire ? { r: viaSommaire, indirect: true } : null;
}

// Le résumé n'est affiché que s'il existe pour ce document précis, toujours identifié
// comme généré par une IA, et toujours accompagné du lien vers le PDF officiel.
function blocResume(trouve) {
  if (!trouve) return '';
  const { r, indirect } = trouve;
  return `<div class="resume">
    <div class="resume-entete">
      <span>${tr('Résumé généré par IA', 'AI-generated summary')}${indirect && r.numero ? ` — ${tr('sommaire', 'decision summary')} ${echapper(r.numero)}` : ''}</span>
      ${r.montantPrincipal ? `<span class="puce montant">${echapper(r.montantPrincipal)}</span>` : ''}
      ${r.sansContenuSubstantiel ? `<span class="puce procedural">${tr('document de procédure', 'procedural document')}</span>` : ''}
      ${r.francaisSeulement ? '<span class="puce procedural" lang="en">summary not yet translated</span>' : ''}
    </div>
    <ul>${r.puces.map((p) => `<li>${echapper(p)}</li>`).join('')}</ul>
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
  const t = etat.decisions?.themes?.[cle] ?? etat.votes?.themes?.[cle];
  if (!t) return '';
  return `<span class="puce theme t-${echapper(cle)}">${echapper(EN ? themeEn(cle, t.libelle) : t.libelle)}</span>`;
}

// Après un redessin, les fiches reviennent fermées : le bouton doit le refléter, sinon il
// annonce « Tout replier » devant une liste entièrement repliée.
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

function carteRepliable(entete, corps) {
  return `<details class="carte pliante" name="${NOM_ACCORDEON}"><summary>${entete}</summary><div class="corps">${corps}</div></details>`;
}

function carteDecision(d) {
  const entete = `<div class="meta">
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${d.unite ? `<span class="puce">${echapper(d.unite)}</span>` : ''}
    </div>
    <p class="objet">${echapper(d.objet ?? tr('(sans objet)', '(no subject)'))}</p>`;
  const corps = `${blocResume(resumePour(d))}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${tr('Document officiel (PDF) ↗', 'Official document (PDF, in French) ↗')}</a>` : ''}`;
  // Espace abonnés (/commun/abonnes.js) : « Suivre », « Décision finale », les projets et le détail
  // de l'argent. La clé de dossier suit la décision d'une instance à l'autre. Un procès-verbal ou
  // un tableau des décisions n'est pas un dossier : rien à suivre.
  if (d.type === 'Procès-verbaux' || d.type === 'Tableaux des décisions') return carteRepliable(entete, corps);
  const projets = (d.projets ?? []).map((cle) => ({ cle, titre: etat.decisions?.projets?.[cle]?.titre ?? cle }));
  // data-montant : le résumé a trouvé un montant, donc un abonné peut demander le détail de l'argent.
  const resume = resumePour(d)?.r;
  const abonnes = `<div class="ab-fiche" data-dossier="${echapper(d.sommaireId ?? d.id)}" data-numero="${echapper(d.numero ?? '')}" data-objet="${echapper((d.objet ?? '').slice(0, 300))}" data-montant="${resume?.montantPrincipal && !resume.sansContenuSubstantiel ? 1 : 0}"
    data-statut="${echapper(d.statutDossier ?? '')}" data-etape="${echapper(d.etapeFinale ?? '')}" data-echeance="${echapper(d.echeance ?? '')}"
    data-projets="${echapper(JSON.stringify(projets))}"></div>`;
  return carteRepliable(entete, corps + abonnes);
}

function decisionsFiltrees() {
  const q = $('#rech-decisions').value.trim().toLowerCase();
  const type = $('#filtre-type').value;
  const instance = $('#filtre-instance').value;
  const theme = $('#filtre-theme')?.value ?? '';
  const avecResume = $('#filtre-resume').checked;
  const projet = etat.projet;
  return etat.decisions.decisions.filter((d) => {
    if (projet && !d.projets?.includes(projet)) return false;
    if (type && d.type !== type) return false;
    if (instance && d.instance !== instance) return false;
    if (theme && d.theme !== theme) return false;
    if (avecResume && !resumePour(d)) return false;
    if (q && !((d.objet ?? '') + ' ' + (d.numero ?? '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

function rendreDecisions() {
  const { facettes, totalDisponible, parametres, nombre } = etat.decisions;
  if (!$('#filtre-type').dataset.rempli) {
    remplirSelect($('#filtre-type'), facettes.type.map((f) => ({ ...f, libelle: lib(f.valeur) })));
    remplirSelect($('#filtre-instance'), facettes.instance.slice(0, 25).map((f) => ({ ...f, libelle: lib(f.valeur) })));
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

  $('#compte-decisions').textContent = EN
    ? `${nombreFr(filtrees.length)} decision(s) shown of ${nombreFr(nombre)} loaded — the City published ${nombreFr(totalDisponible)} in ${parametres.annee}.` +
      (etat.parId.size ? ` ${nombreFr(etat.parId.size)} have a plain-language summary.` : '')
    : `${nombreFr(filtrees.length)} décision(s) affichée(s) sur ${nombreFr(nombre)} chargées — ` +
      `la Ville en a publié ${nombreFr(totalDisponible)} en ${parametres.annee}.` +
      (etat.parId.size ? ` ${nombreFr(etat.parId.size)} portent un résumé en langage clair.` : '');

  let reste;
  if (parSeance) {
    // En mode séance on pagine par SÉANCES, jamais par fiches : sinon la dernière séance
    // affichée serait coupée en plein milieu et son décompte mentirait.
    const groupes = grouperParSeance(filtrees);
    const montres = groupes.slice(0, etat.limiteSeances);
    $('#liste-decisions').innerHTML = montres.length
      ? montres.map(rendreSeance).join('')
      : `<p class="vide">${tr('Aucune décision ne correspond.', 'No decisions match.')}</p>`;
    reste = groupes.length - montres.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = EN ? `Show more (${nombreFr(reste)} ${s(reste, 'meeting', 'meetings')} left)` : `Afficher plus (${nombreFr(reste)} séance${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''})`;
  } else {
    const visibles = filtrees.slice(0, etat.limiteDecisions);
    $('#liste-decisions').innerHTML = visibles.map(carteDecision).join('');
    reste = filtrees.length - visibles.length;
    $('#plus-decisions').hidden = reste <= 0;
    $('#plus-decisions').textContent = tr(`Afficher plus (${nombreFr(reste)} restantes)`, `Show more (${nombreFr(reste)} left)`);
  }
  reinitialiserDepliage();
}

// Une séance, c'est une date et une instance : « le conseil de la ville du 7 juillet ».
// C'est l'unité dans laquelle la Ville travaille et dans laquelle les gens pensent — bien
// plus qu'une liste continue de 2 000 décisions.
//
// Les sommaires décisionnels n'ont pas d'instance (la Ville ne la publie pas sur ce type
// de document) : ils sont regroupés à part sous leur date, plutôt que d'être rattachés
// d'autorité à une séance à laquelle rien ne dit qu'ils appartiennent.
const SANS_INSTANCE = 'Documents préparatoires';

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
function rendreSeance(g) {
  return `<details class="seance">
      <summary class="seance-entete">
        <h3>${echapper(lib(g.instance))}</h3>
        <span class="seance-date">${dateFr(g.date)}</span>
        <span class="puce">${g.lignes.length} ${tr(s(g.lignes.length, 'décision', 'décisions'), s(g.lignes.length, 'decision', 'decisions'))}</span>
        ${g.tronquee ? `<span class="puce procedural">${tr('journée partiellement chargée', 'day partly loaded')}</span>` : ''}
      </summary>
      <div class="seance-corps">${g.lignes.map(carteDecision).join('')}</div>
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

  const corps = `<div class="colonnes-vote">
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
    ${v.avertissements.length ? `<div class="drapeau"><strong>${tr('À vérifier&nbsp;:', 'To check:')}</strong> ${v.avertissements.map((a) => echapper(EN ? a.replace(/^Texte source dégradé.*$/, 'Degraded source text (PDF with spaced-out glyphs) — names not extracted; see the original passage.') : a)).join(' · ')}</div>` : ''}
    <details><summary>${tr("Voir le passage d'origine", 'See the original passage (in French)')}</summary><p>${echapper(v.brut)}</p></details>
    ${v.pdf ? `<p style="margin:9px 0 0"><a class="lien-pdf" href="${echapper(v.pdf)}" target="_blank" rel="noopener">${tr('Résolution officielle (PDF) ↗', 'Official resolution (PDF, in French) ↗')}</a></p>` : ''}`;

  return carteRepliable(entete, corps);
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
      return `<tr><td>${echapper(nom)}</td><td>${echapper(principale ? lib(principale[0]) : '—')}</td><td class="n">${fiche.n}</td></tr>`;
    })
    .join('');
}

function rendreVotes() {
  const votes = etat.votes.votes;
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
        ? `${tri.length} ${s(tri.length, 'person', 'people')}` + (tete ? ` — most: ${tete}` : '')
        : `${tri.length} personne${tri.length > 1 ? 's' : ''}` + (tete ? ` — en tête : ${tete}` : '');
    }
  }

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
    ? `${filtres.length} recorded vote(s) shown of ${etat.votes.nombre} in ${etat.votes.parametres.annee}. ${etat.votes.avecAvertissement} carry an extraction warning.`
    : `${filtres.length} appel(s) nominal(aux) affiché(s) sur ${etat.votes.nombre} en ${etat.votes.parametres.annee}. ` +
      `${etat.votes.avecAvertissement} portent un avertissement d'extraction.`;
  $('#liste-votes').innerHTML = visibles.map(carteVote).join('');
  const reste = filtres.length - visibles.length;
  $('#plus-votes').hidden = reste <= 0;
  $('#plus-votes').textContent = tr(`${Math.min(PAS_VOTES, reste)} de plus (${reste} restants)`, `${Math.min(PAS_VOTES, reste)} more (${reste} left)`);
  reinitialiserDepliage();
}

// ---------- élus ----------
function carteElu(m) {
  const roles = m.roles.filter((r) => r !== 'Maire');
  // Décompte réel tiré du registre des appels nominaux, sans interprétation.
  const votesContre = etat.votes && m.nomComplet
    ? etat.votes.votes.filter((v) => v.contre.includes(m.nomComplet)).length
    : null;
  const arr = instanceArrondissement(m.arrondissement);

  return `<article class="carte elu"${m.districtNumero ? ` id="elu-${m.districtNumero}"` : ''}>
    ${m.photo ? `<img src="${echapper(m.photo)}" alt="" loading="lazy">` : ''}
    <div>
      <h3>${echapper(m.nomComplet)}</h3>
      <p class="district">${echapper(m.district ?? tr('Maire de Québec', 'Mayor of Québec'))}${m.districtNumero ? ` (${m.districtNumero})` : ''}</p>
      <div class="meta">
        ${m.parti ? `<span class="puce">${echapper(m.parti)}</span>` : ''}
        ${roles.map((r) => `<span class="puce">${echapper(lib(r))}</span>`).join('')}
      </div>
      <p class="compte" style="margin:6px 0 0">${echapper(m.telephone ?? '')}</p>
      ${votesContre ? `<p class="compte" style="margin:2px 0 0">${votesContre} ${tr('vote(s) contre consigné(s) cette année.', 'vote(s) against recorded this year.')}</p>` : ''}
      <p style="margin:4px 0 0; font-size:13px">
        ${m.formulaireCourriel ? `<a href="${echapper(m.formulaireCourriel)}" target="_blank" rel="noopener">${tr('Écrire', 'Write')}</a>` : ''}
        ${m.biographie ? ` · <a href="${echapper(m.biographie)}" target="_blank" rel="noopener">${tr('Biographie', 'Biography')}</a>` : ''}
        ${arr ? ` · <a href="decisions.html?instance=${encodeURIComponent(arr.instance)}">${arr.n} ${tr("décisions de l'arrondissement", 'borough decisions')}</a>` : ''}
      </p>
    </div>
  </article>`;
}

function rendreElus() {
  const membres = etat.elus.membres;
  const partis = Object.entries(etat.elus.partis).sort((a, b) => b[1] - a[1]);
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
}

// Le conseil d'agglomération : une instance distincte, avec des élus d'autres villes.
// On l'affiche sur la même page que le conseil municipal — les gens concernés sont les
// mêmes — mais dans sa propre section, parce que ce ne sont pas les mêmes sièges.
function carteMembreAgglo(m) {
  const dequebec = (m.ville ?? '') === 'Québec';
  return `<article class="carte elu">
    <div>
      <h3>${echapper(m.nom)}</h3>
      <p class="district">${echapper(lib(m.fonction))}${m.ville ? ' — ' + echapper(m.ville) : ''}</p>
      <div class="meta">
        ${m.ville ? `<span class="puce ${dequebec ? '' : 'reconstituee'}">${echapper(m.ville)}</span>` : ''}
        ${m.roles.map((r) => `<span class="puce">${echapper(lib(r))}</span>`).join('')}
      </div>
      <p class="compte" style="margin:6px 0 0">
        ${EN ? `Present at ${m.presences} of the ${m.seances} meeting(s) where attendance is recorded.` : `Présent à ${m.presences} séance(s) sur ${m.seances} où sa présence est consignée.`}
      </p>
      ${m.remplace.length ? `<p class="compte" style="margin:2px 0 0">${tr('Siège en remplacement de', 'Sits as a replacement for')} ${m.remplace.map(echapper).join(', ')}.</p>` : ''}
    </div>
  </article>`;
}

// ---------- commission d'urbanisme (CUCQ) ----------
// Même source que l'agglomération : les listes de présences. On dit ce que le procès-verbal
// dit — votant ou substitut, élu·e ou non, présidence — et rien de plus sur les personnes.
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

function rendreAgglomeration() {
  if (!$('#liste-agglo') || !etat.agglomeration) return;
  const a = etat.agglomeration;
  const villes = Object.entries(a.villes ?? {}).sort((x, y) => y[1] - x[1]);
  // Le conseil compte 9 sièges. Nos listes de présences relèvent plus de personnes que ça,
  // parce que les remplaçants y figurent : on le dit, plutôt que de laisser croire à un
  // conseil de 15 membres.
  $('#compte-agglo').textContent =
    (EN
      ? `The council has 9 seats. ${a.nombre} people held them over ${a.seancesAnalysees} meetings in ${a.parametres.annee}, replacements included — `
      : `Le conseil compte 9 sièges. ${a.nombre} personnes les ont occupés sur ${a.seancesAnalysees} séances ` +
        `de ${a.parametres.annee}, remplaçants compris — `) +
    villes.map(([v, n]) => `${v} : ${n}`).join(' · ');

  // Les villes reconstituées d'abord : ce sont elles qu'on ne trouve nulle part ailleurs.
  const membres = [...a.membres].sort((x, y) => {
    const xq = (x.ville ?? '') === 'Québec' ? 1 : 0;
    const yq = (y.ville ?? '') === 'Québec' ? 1 : 0;
    return xq - yq || y.presences - x.presences;
  });
  $('#liste-agglo').innerHTML = `<div class="grille-elus">${membres.map(carteMembreAgglo).join('')}</div>`;
}

// ---------- carte des districts ----------
// Projection Web Mercator, calculée ici : 21 polygones en SVG, aucune librairie et aucun
// serveur de tuiles à appeler. La page reste autonome et ne fuit rien vers l'extérieur.
function projeter([lon, lat]) {
  const x = (lon * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
  return [x, y];
}

// Teintes franches, cernées de noir par la feuille de style : la carte doit tenir le
// même langage que le reste. Six teintes distinctes, une par arrondissement.
const PALETTE_ARRONDISSEMENT = ['#0E4FC1', '#1E6A3C', '#C22B1D', '#FFD24D', '#7A4FA3', '#D97706'];

function couleurs(districts, mode) {
  if (mode === 'parti') {
    const partis = [...new Set(districts.map((d) => d.parti).filter(Boolean))].sort();
    const tons = ['#0E4FC1', '#FFD24D', '#7A4FA3', '#1E6A3C'];
    const table = new Map(partis.map((p, i) => [p, tons[i % tons.length]]));
    return { cle: (d) => d.parti, table };
  }
  const arrs = [...new Set(districts.map((d) => d.arrondissement).filter(Boolean))].sort();
  const table = new Map(arrs.map((a, i) => [a, PALETTE_ARRONDISSEMENT[i % PALETTE_ARRONDISSEMENT.length]]));
  return { cle: (d) => d.arrondissement, table };
}

function rendreCarte() {
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
    `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${tr('Carte des 21 districts électoraux de la Ville de Québec', 'Map of the 21 electoral districts of the City of Québec')}">` +
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
    .map(([valeur, couleur]) => `<span class="cle-legende"><i style="background:${couleur}"></i>${echapper(lib(valeur))}</span>`)
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
  const categories = etat.lexique.categories ?? {};
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
        <span class="puce genre-vote">${tr('vote nominatif', 'recorded vote')}</span>
        ${v.numero ? `<span class="puce num">${echapper(v.numero)}</span>` : ''}
        <span>${dateFr(v.date)}</span>
        ${v.instance ? `<span class="puce">${echapper(lib(v.instance))}</span>` : ''}
        ${v.resultat ? `<span class="resultat ${classeResultat(v.resultat)}">${echapper(lib(v.resultat))}</span>` : ''}
        ${e.nouveau ? `<span class="puce neuf">${tr('nouveau', 'new')}</span>` : ''}
      </div>
      <p class="objet">${echapper(v.objet ?? tr('(sans objet)', '(no subject)'))}</p>`;
    const corps = `<p class="compte" style="margin:0">
        ${v.decomptePour ?? v.pour.length} ${tr('pour', 'for')}, ${v.decompteContre ?? v.contre.length} ${tr('contre', 'against')}${
          v.contre.length ? ' — ' + v.contre.map(echapper).join(', ') : ''
        }. <a href="votes.html">${tr('Voir le détail', 'See details')}</a>
      </p>`;
    return carteRepliable(entete, corps);
  }

  const d = e.data;
  const entete = `<div class="meta">
      <span class="puce genre-decision">${tr('décision', 'decision')}</span>
      ${puceTheme(d.theme)}
      ${d.numero ? `<span class="puce num">${echapper(d.numero)}</span>` : ''}
      <span>${dateFr(d.date)}</span>
      <span class="puce">${echapper(lib(d.type))}</span>
      ${d.instance ? `<span class="puce">${echapper(lib(d.instance))}</span>` : ''}
      ${e.nouveau ? `<span class="puce neuf">${tr('nouveau', 'new')}</span>` : ''}
    </div>
    <p class="objet">${echapper(d.objet ?? tr('(sans objet)', '(no subject)'))}</p>`;
  const corps = `${blocResume(resumePour(d))}
    ${d.pdf ? `<a class="lien-pdf" href="${echapper(d.pdf)}" target="_blank" rel="noopener">${tr('Document officiel (PDF) ↗', 'Official document (PDF, in French) ↗')}</a>` : ''}`;
  return carteRepliable(entete, corps);
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
  $('#fil').innerHTML = aMontrer.map(ligneEvenement).join('');

  const reste = source.length - aMontrer.length;
  if ($('#plus-fil')) {
    $('#plus-fil').hidden = reste <= 0;
    $('#plus-fil').textContent = tr(`${Math.min(PAS_FIL, reste)} de plus (${nombreFr(reste)} restants)`, `${Math.min(PAS_FIL, reste)} more (${nombreFr(reste)} left)`);
  }
}

// ---------- accueil ----------
function rendreAccueil() {
  const chiffres = [];
  if (etat.decisions) {
    chiffres.push({ n: nombreFr(etat.decisions.totalDisponible), quoi: tr(`décisions publiées en ${etat.decisions.parametres.annee}`, `decisions published in ${etat.decisions.parametres.annee}`), lien: 'decisions.html' });
  }
  if (etat.votes) {
    chiffres.push({ n: nombreFr(etat.votes.nombre), quoi: tr('votes nominatifs consignés cette année', 'recorded votes this year'), lien: 'votes.html' });
  }
  if (etat.resumes) {
    chiffres.push({ n: nombreFr(etat.resumes.nombre), quoi: tr('décisions résumées en langage clair', 'decisions summarized in plain language'), lien: 'decisions.html' });
  }
  if (etat.elus) {
    chiffres.push({ n: etat.elus.nombre, quoi: tr('membres du conseil municipal', 'members of City Council'), lien: 'conseil.html' });
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
  ajouter(tr("Commission d'urbanisme (CUCQ)", 'Urban Planning Commission (CUCQ)'), etat.cucq, etat.cucq ? `${etat.cucq.nombre}` : '');
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
          `<td class="n">${nombreFr(Math.round(a.octetsCompresses / 1024))} ko</td>` +
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
  decisions: ['decisions', 'resumes'],
  votes: ['votes'],
  conseil: ['elus', 'districts', 'votes', 'decisions', 'agglomeration', 'cucq'],
  lexique: ['lexique'],
  sources: ['decisions', 'votes', 'elus', 'resumes', 'districts', 'agglomeration', 'cucq'],
};

async function init() {
  const page = document.body.dataset.page;
  const noms = BESOINS[page] ?? [];
  const jeux = await Promise.all(noms.map(charger));
  noms.forEach((nom, i) => {
    etat[nom] = jeux[i];
  });
  // En anglais : les puces traduites remplacent les françaises (data/resumes-en.json) ; un résumé
  // pas encore traduit reste en français, et le dit.
  if (EN && etat.resumes) {
    const traductions = (await charger('resumes-en'))?.traductions ?? {};
    for (const r of etat.resumes.resumes ?? []) {
      const t = traductions[r.id];
      if (t) Object.assign(r, { puces: t.puces, montantPrincipal: t.montantPrincipal });
      else if (r.puces?.length) r.francaisSeulement = true;
    }
  }
  if (EN && page === 'lexique') etat.lexiqueEn = await charger('lexique-en');
  etat.parId = new Map((etat.resumes?.resumes ?? []).map((r) => [r.id, r]));
  // Le manifeste de l'archive vit dans un sous-dossier ; seule la page des sources le lit,
  // et elle ne lit que le manifeste, jamais les fichiers d'années eux-mêmes.
  if (page === 'sources') etat.archives = await charger('archives/index');

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
    // Arriver sur les décisions d'un projet (lien depuis « Mes dossiers ») : filtre annoncé, retirable.
    const projet = new URLSearchParams(location.search).get('projet');
    if (projet && etat.decisions.projets?.[projet]) {
      etat.projet = projet;
      $('#compte-decisions')?.insertAdjacentHTML(
        'beforebegin',
        `<p class="compte" id="filtre-projet">${tr('Projet', 'Project')} : <strong>${echapper(etat.decisions.projets[projet].titre)}</strong> — ${nombreFr(etat.decisions.projets[projet].n)} ${tr('décisions', 'decisions')}. <a href="decisions.html">${tr('Voir toutes les décisions', 'See all decisions')}</a></p>`
      );
    }
    rendreDecisions();
    if (instance && [...$('#filtre-instance').options].some((o) => o.value === instance)) {
      $('#filtre-instance').value = instance;
      rendreDecisions();
    }
  }
  if (page === 'votes') rendreVotes();
  if (page === 'conseil') {
    if (etat.districts) rendreCarte();
    rendreElus();
    rendreAgglomeration();
    rendreCucq();
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
  if (e.target.matches('#rech-votes, #filtre-instance-votes, #filtre-theme-votes')) {
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
  bouton.setAttribute('aria-label', tr('Revenir en haut de la page', 'Back to top'));
  bouton.textContent = '↑';
  document.body.appendChild(bouton);
  const majVisible = () => bouton.classList.toggle('visible', window.scrollY > 600);
  window.addEventListener('scroll', majVisible, { passive: true });
  majVisible();
  bouton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();
