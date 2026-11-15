// « Les courriels » : UN bloc compact, le même partout (accueil des volets, Mon dossier, et demain les
// autres sites Dossier). Refonte du 14 nov. 2026 (Martin : « moins mêlant, plus précis, compact et clair »).
//
// Tout vient du serveur (/api/infolettre?action=etat) : la première ligne est l'infolettre du site
// (ici « assemblee », api/_infolettre.js), puis UNE rangée par ville : le compte rendu du mois, après
// chaque séance du conseil, un ou plusieurs arrondissements, et la langue quand la ville en offre deux.
// Sur un autre site, le serveur renvoie d'autres villes : le bloc ne change pas.
//
// Deux modes, même balisage :
//   formulaire  — courriel + bouton « M'inscrire » ; les choix s'accumulent puis partent d'un coup ;
//   boite       — connecté·e (Mon dossier) : chaque changement s'enregistre tout de suite.
// Les champs portent les mêmes classes et data-* dans les deux modes (ab-mtl-blocs, ab-langue-case,
// ab-sorte-ville, ab-arr-mtl, ab-arr-suivis, ab-arr-retirer) : un seul jeu de gestionnaires. Une ville à
// une seule langue a une case de langue cachée, cochée « fr ».

import { session, mesurer, echapper, tr } from './abonnes-client.js';
import { dernierVolet } from './navigation.js';

const SITE = 'assemblee';
const FEUILLE = '/commun/courriels.css';
// Le bloc apporte son style : la page qui l'affiche n'a rien à inclure.
function chargerStyle() {
  if (document.querySelector(`link[href="${FEUILLE}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = FEUILLE;
  document.head.appendChild(l);
}

const etatServeur = async (s) => {
  const r = await fetch('/api/infolettre?action=etat', { headers: s ? { Authorization: `Bearer ${s.access_token}` } : {}, cache: 'no-store' }).catch(() => null);
  return r?.ok ? r.json() : null;
};

// montreal:mensuel:fr · montreal:conseil:en · montreal:arrondissement:plateau-mont-royal:fr
const cleChoix = ({ ville, type = 'mensuel', arrondissement = '', langue = 'fr' }) =>
  [ville, type === 'mensuel' ? null : type, arrondissement || null, langue || 'fr'].filter(Boolean).join(':');
const inscrit = (etat, choix) => etat.inscriptions?.[cleChoix(choix)] === 'confirme';
const languesDe = (v) => v?.langues ?? v?.offre?.[0]?.langues ?? ['fr'];
const confirmees = (etat) => Object.entries(etat.inscriptions ?? {}).filter(([, st]) => st === 'confirme').map(([cle]) => cle);

const arrondissementsSuivis = (etat, ville, langues) => {
  const set = new Set();
  for (const cle of confirmees(etat)) {
    const m = cle.match(new RegExp(`^${ville}:arrondissement:([^:]+)(?::([a-z]{2}))?$`));
    // Les vieux enregistrements sans langue (avant migration) comptent comme « fr ».
    if (m && langues.includes(m[2] ?? 'fr')) set.add(m[1]);
  }
  return [...set];
};
const sorteActive = (etat, ville, type, langues) => langues.some((langue) => inscrit(etat, { ville, type, langue }));
const languesActives = (etat, v) => languesDe(v).filter((lang) => confirmees(etat).some((cle) => cle.startsWith(`${v.cle}:`) && cle.endsWith(`:${lang}`)));

const libSorte = (o) => ({
  nom: tr(o.nom, o.nomEn || o.nom),
  quoi: tr(o.quoi, o.quoiEn || o.quoi),
  rythme: tr(o.rythme, o.rythmeEn || o.rythme),
});
// Dans la rangée d'une ville, chaque sorte tient en deux ou trois mots ; le détail est dans l'infobulle.
const COURT = {
  mensuel: () => tr('Chaque mois', 'Every month'),
  conseil: () => tr('Chaque séance du conseil', 'Each council meeting'),
};
const NOM_LANGUE = { fr: 'Français', en: 'English' };

// ---------- rendu ----------
const caseLangueCachee = (ville) => `<input type="checkbox" class="ab-langue-case" data-ville="${echapper(ville)}" data-langue="fr" checked hidden>`;

// L'infolettre du site : une ligne, une case.
function ligneSite(etat, v, mode) {
  const o = v.offre[0];
  if (!o) return '';
  const L = libSorte(o);
  const coche = mode === 'boite' && inscrit(etat, { ville: v.cle, type: o.cle, langue: 'fr' });
  return `<div class="cr-site ab-mtl-blocs" data-ville="${echapper(v.cle)}" data-mode="${mode}">${caseLangueCachee(v.cle)}
    <label class="cr-ligne-site">
      <input type="checkbox" class="ab-sorte-ville" data-ville="${echapper(v.cle)}" data-type="${echapper(o.cle)}"${coche ? ' checked' : ''}>
      <span><b>${echapper(L.nom)}</b> <span class="cr-rythme">${echapper(L.rythme)}</span><span class="cr-quoi">${echapper(L.quoi)}</span></span>
    </label>
  </div>`;
}

// Une ville : son nom, puis ses choix sur une ligne.
function rangeeVille(etat, v, mode) {
  const ville = v.cle;
  const langues = languesDe(v);
  const actives = mode === 'boite' ? languesActives(etat, v) : [];
  const cochees = actives.length ? actives : ['fr'];
  const suivis = mode === 'boite' ? arrondissementsSuivis(etat, ville, cochees) : [];
  const arrOffre = v.offre.find((o) => o.arrondissements);
  const restants = (arrOffre?.arrondissements ?? []).filter((a) => !suivis.includes(a.cle));
  const nomArr = (cle) => arrOffre?.arrondissements.find((a) => a.cle === cle)?.nom ?? cle;

  const chip = (o) => {
    if (!o) return '';
    const L = libSorte(o);
    const coche = mode === 'boite' && sorteActive(etat, ville, o.cle, cochees);
    return `<label class="cr-chip" title="${echapper(`${L.nom} — ${L.rythme}. ${L.quoi}`)}">
      <input type="checkbox" class="ab-sorte-ville" data-ville="${echapper(ville)}" data-type="${echapper(o.cle)}"${coche ? ' checked' : ''}><span>${COURT[o.cle]?.() ?? echapper(L.nom)}</span>
    </label>`;
  };
  const puces = suivis.map((cle) => `<span class="ab-arr-puce cr-puce" data-arrondissement="${echapper(cle)}">${echapper(nomArr(cle))}<button type="button" class="ab-arr-retirer" data-ville="${echapper(ville)}" data-arrondissement="${echapper(cle)}" aria-label="${tr('Retirer', 'Remove')} ${echapper(nomArr(cle))}">×</button></span>`).join('');
  const arr = arrOffre ? `<span class="ab-arr-suivis cr-puces">${puces}</span>${restants.length
    ? `<select class="ab-arr-choix ab-arr-mtl cr-select" data-ville="${echapper(ville)}" title="${echapper(libSorte(arrOffre).quoi)}" aria-label="${tr('Ajouter un arrondissement', 'Add a borough')}">
        <option value="">📍 ${suivis.length ? tr('+ un arrondissement', '+ a borough') : tr('Mon arrondissement…', 'My borough…')}</option>
        ${restants.map((a) => `<option value="${echapper(a.cle)}">${echapper(a.nom)}</option>`).join('')}
      </select>`
    : `<span class="cr-quoi">${tr('Tous les arrondissements.', 'Every borough.')}</span>`}` : '';
  const langue = langues.length > 1
    ? `<span class="cr-langues" role="group" aria-label="${tr('Langue des courriels', 'Email language')}">${langues.map((lang) =>
      `<label class="cr-lang" title="${NOM_LANGUE[lang] ?? lang}"><input type="checkbox" class="ab-langue-case" data-ville="${echapper(ville)}" data-langue="${lang}"${cochees.includes(lang) ? ' checked' : ''}><span>${lang.toUpperCase()}</span></label>`).join('')}</span>`
    : caseLangueCachee(ville);
  const note = (v.note || v.noteEn) ? `<p class="cr-note">${v.noteEn ? tr(v.note, v.noteEn) : v.note}</p>` : '';

  return `<div class="cr-ville ab-mtl-blocs" data-ville="${echapper(ville)}" data-mode="${mode}">
    <div class="cr-ville-nom">${echapper(v.nom)}</div>
    <div class="cr-ville-choix">${chip(v.offre.find((o) => o.cle === 'mensuel'))}${chip(v.offre.find((o) => o.cle === 'conseil'))}${arr}${langue}</div>
    ${note}
  </div>`;
}

function bloc(etat, { site, villes, mode, titre }) {
  const chapeau = villes.length
    ? `<p class="cr-chapeau"><b>${villes.length > 1 ? tr('Vos villes.', 'Your cities.') : tr('La ville.', 'The city.')}</b> ${tr('Ce que la ville a décidé, une fois par mois. En plus, si vous voulez : chaque séance du conseil, votre arrondissement.', 'What the city decided, once a month. On top, if you want: each council meeting, your borough.')}</p>`
    : '';
  return `<header class="cr-tete"><h2 id="crTitre">📬 ${titre}</h2><span class="cr-gratuit">${tr('Gratuit · un clic pour se désinscrire, dans chaque courriel', 'Free · one click to unsubscribe, in every email')}</span></header>
    ${site ? ligneSite(etat, site, mode) : ''}
    ${chapeau}${villes.map((v) => rangeeVille(etat, v, mode)).join('')}`;
}

// Les choix cochés (mode formulaire) : langues × sortes × arrondissements, par ville.
function choixDepuisFormulaire(racine) {
  const out = [];
  for (const b of racine.querySelectorAll('.ab-mtl-blocs')) {
    const ville = b.dataset.ville;
    const langues = [...b.querySelectorAll('.ab-langue-case:checked')].map((c) => c.dataset.langue);
    if (!langues.length) continue;
    for (const c of b.querySelectorAll('.ab-sorte-ville:checked')) for (const langue of langues) out.push({ ville, type: c.dataset.type, langue });
    const arrs = new Set([...b.querySelectorAll('.ab-arr-suivis [data-arrondissement]')].map((el) => el.dataset.arrondissement));
    if (b.querySelector('.ab-arr-mtl')?.value) arrs.add(b.querySelector('.ab-arr-mtl').value);
    for (const arrondissement of arrs) for (const langue of langues) out.push({ ville, type: 'arrondissement', arrondissement, langue });
  }
  return out;
}

// Mode formulaire : un arrondissement choisi devient une puce (on peut en empiler plusieurs avant d'envoyer).
function cablerPuces(racine) {
  racine.addEventListener('change', (ev) => {
    const sel = ev.target.closest('.ab-arr-mtl');
    if (!sel?.value) return;
    const liste = sel.closest('.ab-mtl-blocs')?.querySelector('.ab-arr-suivis');
    if (!liste) return;
    const nom = sel.selectedOptions[0]?.textContent ?? sel.value;
    const puce = document.createElement('span');
    puce.className = 'ab-arr-puce cr-puce';
    puce.dataset.arrondissement = sel.value;
    puce.innerHTML = `${echapper(nom)}<button type="button" class="ab-arr-retirer ab-arr-mtl-accum" aria-label="${tr('Retirer', 'Remove')} ${echapper(nom)}">×</button>`;
    liste.appendChild(puce);
    sel.querySelector(`option[value="${CSS.escape(sel.value)}"]`)?.remove();
    sel.value = '';
    if (sel.options.length === 1) sel.options[0].textContent = tr('📍 + un arrondissement', '📍 + a borough');
  });
  racine.addEventListener('click', (ev) => {
    ev.target.closest('.ab-arr-mtl-accum')?.closest('.ab-arr-puce')?.remove();
  });
}

// ---------- Formulaire public (accueil des volets, Mon dossier sans connexion) ----------
export async function formulaireInfolettre(zone, { ville = null } = {}) {
  if (!zone) return;
  chargerStyle();
  const s = await session().catch(() => null);
  const etat = await etatServeur(s);
  if (!etat?.villes?.length) { zone.hidden = true; return; }
  const site = ville ? null : etat.villes.find((v) => v.cle === SITE) ?? null;
  const villes = etat.villes.filter((v) => v.cle !== SITE && (!ville || v.cle === ville));
  if (!site && !villes.length) { zone.hidden = true; return; }
  const titre = ville
    ? tr(`Les courriels de ${echapper(villes[0].nom)}`, `${echapper(villes[0].nom)} emails`)
    : tr('Les courriels', 'The emails');

  // La même zone a pu porter la boîte connectée (déconnexion) : ses gestionnaires n'ont plus cours.
  zone.onchange = null;
  zone.onclick = null;
  zone.innerHTML = `<form class="cr" novalidate aria-labelledby="crTitre">
    ${bloc(etat, { site, villes, mode: 'formulaire', titre })}
    <div class="cr-form">
      <input type="email" name="email" required maxlength="200" autocomplete="email" placeholder="${tr('Votre courriel', 'Your email')}" aria-label="${tr('Votre courriel', 'Your email')}" value="${echapper(etat.courriel ?? '')}">
      <input type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true" class="ab-pot-de-miel">
      <button type="submit" class="cr-bouton">${tr('M’inscrire', 'Subscribe')}</button>
    </div>
    <p class="cr-etat" aria-live="polite"></p>
    <p class="cr-pied">${tr('Vous recevez tout de suite le plus récent de chaque sorte cochée. Votre adresse ne sert qu’à ça.', 'You get the latest of each kind right away. Your address is used for nothing else.')}</p>
  </form>`;
  zone.hidden = false;

  const form = zone.querySelector('form');
  const etatTexte = form.querySelector('.cr-etat');
  cablerPuces(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const choix = choixDepuisFormulaire(form);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { etatTexte.textContent = tr('Entrez une adresse courriel valide.', 'Enter a valid email address.'); return; }
    if (!choix.length) {
      const sansLangue = [...form.querySelectorAll('.ab-mtl-blocs')].some((b) => !b.querySelector('.ab-langue-case:checked') && (b.querySelector('.ab-sorte-ville:checked') || b.querySelector('.ab-arr-suivis [data-arrondissement]')));
      etatTexte.textContent = sansLangue
        ? tr('Choisissez au moins une langue (FR ou EN).', 'Pick at least one language (FR or EN).')
        : tr('Cochez au moins un courriel.', 'Check at least one email.');
      return;
    }
    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    etatTexte.textContent = tr('Envoi…', 'Sending…');
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=inscrire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(courante ? { Authorization: `Bearer ${courante.access_token}` } : {}) },
      body: JSON.stringify({ email, choix, site_web: form.site_web.value }),
    }).catch(() => null);
    const donnees = r ? await r.json().catch(() => ({})) : {};
    bouton.disabled = false;
    if (!r?.ok) {
      etatTexte.textContent = r?.status === 429
        ? tr('Trop de demandes en ce moment. Réessayez dans une heure.', 'Too many requests right now. Try again in an hour.')
        : tr('Une erreur est survenue. Réessayez dans un moment.', 'Something went wrong. Try again in a moment.');
      return;
    }
    mesurer('infolettre_inscription', { sortes: choix.map((c) => `${c.type}:${c.langue}`).join(','), connecte: donnees.confirme ? 'oui' : 'non' });
    etatTexte.innerHTML = donnees.confirme
      ? tr(`<strong>C'est fait.</strong> Le plus récent de chaque sorte part vers ${echapper(email)}.`, `<strong>Done.</strong> The latest of each kind is on its way to ${echapper(email)}.`)
      : tr(`<strong>Presque fini :</strong> on vient d'écrire à ${echapper(email)}. Cliquez sur « Confirmer mon inscription » dans ce courriel. (Pas reçu ? Regardez dans les indésirables.)`, `<strong>Almost done:</strong> we just emailed ${echapper(email)}. Click “Confirmer mon inscription” in that email. (Not there? Check your spam folder.)`);
    form.reset();
    form.querySelectorAll('.ab-arr-suivis').forEach((l) => { l.innerHTML = ''; });
  });
}

// ---------- Mon dossier, connecté·e : même bloc, chaque changement s'enregistre ----------
export async function boiteInfolettre(zone, s, { premiereLigne = null } = {}) {
  if (!zone) return;
  if (!s) { zone.innerHTML = ''; return; }
  chargerStyle();
  let etat = await etatServeur(s);
  if (!etat?.villes?.length && !premiereLigne) { zone.innerHTML = ''; return; }
  etat ??= { villes: [], inscriptions: {}, courriel: s.user?.email ?? '' };
  const volet = dernierVolet();
  const site = etat.villes.find((v) => v.cle === SITE) ?? null;
  const lesVilles = etat.villes.filter((v) => v.cle !== SITE);
  // Venu·e d'un volet : sa ville seulement. Sinon toutes.
  const villesIci = lesVilles.filter((v) => v.cle === volet);
  const villes = villesIci.length ? villesIci : lesVilles;

  const dessiner = (message = '') => {
    zone.innerHTML = `<section class="cr" aria-labelledby="crTitre">
      ${bloc(etat, { site, villes, mode: 'boite', titre: tr('Vos courriels', 'Your emails') })}
      ${premiereLigne?.html ?? ''}
      <p class="cr-etat" aria-live="polite">${message || tr(`Tout s’enregistre tout de suite. Envoyés à ${echapper(etat.courriel ?? '')}.`, `Everything is saved right away. Sent to ${echapper(etat.courriel ?? '')}.`)}</p>
    </section>`;
    premiereLigne?.cabler?.(zone);
  };
  dessiner();

  const enregistrer = async (choixListe, message) => {
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courante?.access_token ?? ''}` },
      body: JSON.stringify({ choix: choixListe }),
    }).catch(() => null);
    const donnees = r?.ok ? await r.json().catch(() => null) : null;
    if (!donnees) { dessiner(tr('Impossible pour l’instant. Réessayez dans un moment.', "Couldn't do it right now. Try again in a moment.")); return; }
    etat = donnees;
    mesurer('infolettre_preferences', { n: String(choixListe.length) });
    dessiner(message);
  };
  const languesDuBloc = (b) => [...b.querySelectorAll('.ab-langue-case:checked')].map((c) => c.dataset.langue);
  const INSCRIT = () => tr('Inscrit·e : le plus récent part vers votre boîte.', 'Subscribed: the latest one is on its way.');
  const RETIRE = () => tr('Vous ne recevrez plus ce courriel.', "You won't receive this email anymore.");

  zone.onchange = async (ev) => {
    const b = ev.target.closest('.ab-mtl-blocs');
    if (!b) return;
    const ville = b.dataset.ville;
    const langues = languesDuBloc(b);

    // Une langue : on l'ajoute ou on la retire de tout ce qui est coché pour cette ville.
    if (ev.target.classList.contains('ab-langue-case')) {
      const langue = ev.target.dataset.langue;
      const actif = ev.target.checked;
      if (!actif && !langues.length) {
        ev.target.checked = true;
        dessiner(tr('Gardez au moins une langue.', 'Keep at least one language.'));
        return;
      }
      const batch = [
        ...[...b.querySelectorAll('.ab-sorte-ville:checked')].map((c) => ({ ville, type: c.dataset.type, langue, actif })),
        ...arrondissementsSuivis(etat, ville, ['fr', 'en']).map((arrondissement) => ({ ville, type: 'arrondissement', arrondissement, langue, actif })),
      ];
      if (!batch.length) return;
      ev.target.disabled = true;
      return enregistrer(batch, actif
        ? tr(`Vos courriels de ${echapper(ville === 'montreal' ? 'Montréal' : ville)} partiront aussi en ${NOM_LANGUE[langue].toLowerCase()}.`, `Your ${NOM_LANGUE[langue]} emails are on.`)
        : tr(`Plus de courriels en ${NOM_LANGUE[langue].toLowerCase()}.`, `No more ${NOM_LANGUE[langue]} emails.`));
    }
    if (!langues.length) {
      if (ev.target.type === 'checkbox') ev.target.checked = false; else ev.target.value = '';
      dessiner(tr('Choisissez d’abord une langue (FR ou EN).', 'Pick a language first (FR or EN).'));
      return;
    }
    // Une sorte (chaque mois, chaque séance, l'infolettre du site).
    if (ev.target.classList.contains('ab-sorte-ville')) {
      ev.target.disabled = true;
      return enregistrer(langues.map((langue) => ({ ville, type: ev.target.dataset.type, langue, actif: ev.target.checked })), ev.target.checked ? INSCRIT() : RETIRE());
    }
    // Un arrondissement de plus.
    if (ev.target.classList.contains('ab-arr-mtl') && ev.target.value) {
      const arrondissement = ev.target.value;
      const nom = ev.target.selectedOptions[0]?.textContent ?? arrondissement;
      ev.target.disabled = true;
      return enregistrer(langues.map((langue) => ({ ville, type: 'arrondissement', arrondissement, langue, actif: true })), tr(`${echapper(nom)} ajouté.`, `${echapper(nom)} added.`));
    }
  };

  zone.onclick = async (ev) => {
    const retirer = ev.target.closest('.ab-arr-retirer');
    const b = retirer?.closest('.ab-mtl-blocs');
    if (!b) return;
    const { ville, arrondissement } = retirer.dataset;
    const langues = languesDuBloc(b);
    retirer.disabled = true;
    await enregistrer((langues.length ? langues : ['fr']).map((langue) => ({ ville, type: 'arrondissement', arrondissement, langue, actif: false })), tr('Arrondissement retiré.', 'Borough removed.'));
  };
}
