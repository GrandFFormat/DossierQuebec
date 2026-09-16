// « Les courriels de DossierQuébec » : le formulaire d'inscription (accueil des volets) et la boîte
// de Mes dossiers. Trois sortes par ville, cochées à la carte (api/_infolettre.js) :
//   — le compte rendu du mois : le gros récapitulatif ;
//   — après chaque séance du conseil de la ville, environ aux deux semaines ;
//   — son arrondissement, choisi dans un menu déroulant (on peut en suivre plusieurs).
// Les sortes et les arrondissements viennent du serveur : une ville en gagne sans toucher à ce fichier.

import { session, mesurer, echapper, tr } from './abonnes-client.js';

const ICONES = { mensuel: '🗓️', conseil: '🏛️', arrondissement: '📍' };

const etatServeur = async (s) => {
  const r = await fetch('/api/infolettre?action=etat', { headers: s ? { Authorization: `Bearer ${s.access_token}` } : {}, cache: 'no-store' }).catch(() => null);
  return r?.ok ? r.json() : null;
};
const cleChoix = ({ ville, type, arrondissement }) => [ville, type, arrondissement].filter(Boolean).join(':').replace(/:mensuel$/, '');
const inscrit = (etat, choix) => etat.inscriptions?.[cleChoix(choix)] === 'confirme';
const nomArrondissement = (offre, cle) => offre.find((o) => o.cle === 'arrondissement')?.arrondissements?.find((a) => a.cle === cle)?.nom ?? cle;

// Les arrondissements déjà suivis d'une ville, d'après l'état renvoyé par le serveur.
const arrondissementsSuivis = (etat, ville) =>
  Object.entries(etat.inscriptions ?? {})
    .filter(([cle, statut]) => statut === 'confirme' && cle.startsWith(`${ville}:arrondissement:`))
    .map(([cle]) => cle.split(':')[2]);

// Une sorte de courriel : sa case, son nom, ce qu'elle contient et son rythme.
function ligneSorte(ville, o, { coche = false } = {}) {
  return `<label class="ab-courriel">
    <input type="checkbox" data-ville="${echapper(ville)}" data-type="${echapper(o.cle)}"${coche ? ' checked' : ''}>
    <span class="ab-courriel-texte">
      <span class="ab-courriel-nom">${ICONES[o.cle] ?? '📬'} ${echapper(o.nom)}</span>
      <span class="ab-courriel-rythme">${echapper(o.rythme)}</span>
      <span class="ab-courriel-quoi">${echapper(o.quoi)}</span>
    </span>
  </label>`;
}

// L'arrondissement : un menu déroulant plutôt qu'une case, et la liste de ceux déjà suivis.
function ligneArrondissement(ville, o, suivis, { retirable = false } = {}) {
  const restants = o.arrondissements.filter((a) => !suivis.includes(a.cle));
  return `<div class="ab-courriel ab-courriel-arr">
    <span class="ab-courriel-texte">
      <span class="ab-courriel-nom">${ICONES.arrondissement} ${echapper(o.nom)}</span>
      <span class="ab-courriel-rythme">${echapper(o.rythme)}</span>
      <span class="ab-courriel-quoi">${echapper(o.quoi)}</span>
      ${suivis.length ? `<span class="ab-arr-suivis">${suivis.map((cle) => `<span class="ab-arr-puce">${echapper(nomArrondissement([o], cle))}${retirable ? `<button type="button" class="ab-arr-retirer" data-ville="${echapper(ville)}" data-arrondissement="${echapper(cle)}" aria-label="${tr('Retirer', 'Remove')} ${echapper(nomArrondissement([o], cle))}">×</button>` : ''}</span>`).join('')}</span>` : ''}
      ${restants.length ? `<select class="ab-arr-choix" data-ville="${echapper(ville)}" aria-label="${tr('Choisir un arrondissement', 'Choose a borough')}">
        <option value="">${suivis.length ? tr('Ajouter un arrondissement…', 'Add a borough…') : tr('Choisir mon arrondissement…', 'Choose my borough…')}</option>
        ${restants.map((a) => `<option value="${echapper(a.cle)}">${echapper(a.nom)}</option>`).join('')}
      </select>` : `<span class="ab-note" style="margin:0">${tr('Vous les suivez tous.', 'You follow them all.')}</span>`}
    </span>
  </div>`;
}

const listeSortes = (etat, ville, offre, options = {}) =>
  offre.map((o) => (o.arrondissements ? ligneArrondissement(ville, o, arrondissementsSuivis(etat, ville), options) : ligneSorte(ville, o, { coche: options.cocherSuivis && inscrit(etat, { ville, type: o.cle }) }))).join('');

// Ce que le navigateur a coché : [{ ville, type, arrondissement }]
const choixCoches = (racine) => [
  ...[...racine.querySelectorAll('input[type="checkbox"][data-type]:checked')].map((c) => ({ ville: c.dataset.ville, type: c.dataset.type })),
  ...[...racine.querySelectorAll('.ab-arr-choix')].filter((s) => s.value).map((s) => ({ ville: s.dataset.ville, type: 'arrondissement', arrondissement: s.value })),
];

// ---------- le formulaire public (accueil des volets) ----------
export async function formulaireInfolettre(zone, { ville = null } = {}) {
  if (!zone) return;
  const s = await session().catch(() => null);
  const etat = await etatServeur(s);
  if (!etat?.villes?.length) { zone.hidden = true; return; }
  // La ville du volet d'abord ; les autres ensuite.
  const villes = [...etat.villes].sort((a, b) => (b.cle === ville) - (a.cle === ville));

  zone.innerHTML = `<section class="ab-infolettre">
    <h2>📬 ${tr('Les courriels de DossierQuébec', 'DossierQuébec emails')}</h2>
    <p>${tr('Choisissez ce que vous voulez recevoir. C’est gratuit, et on se désinscrit en un clic dans chaque courriel. <strong>Vous recevez tout de suite le plus récent de chaque sorte cochée.</strong>', 'Choose what you want to receive. It is free, and one click unsubscribes you in every email. <strong>You get the latest of each kind right away</strong> (in French).')}</p>
    <form class="ab-infolettre-form" novalidate>
      ${villes.map((v) => `${villes.length > 1 ? `<h3 class="ab-sous-titre">${echapper(v.nom)}</h3>` : ''}${listeSortes(etat, v.cle, v.offre)}`).join('')}
      <div class="ab-form">
        <input type="email" name="email" required maxlength="200" autocomplete="email" placeholder="${tr('Votre courriel', 'Your email')}" aria-label="${tr('Votre courriel', 'Your email')}" value="${echapper(etat.courriel ?? '')}">
        <input type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true" class="ab-pot-de-miel">
        <button type="submit" class="ab-bouton">${tr('M’inscrire', 'Subscribe')}</button>
      </div>
    </form>
    <p class="ab-note ab-infolettre-etat" aria-live="polite"></p>
    <p class="ab-note">${tr('Un courriel par sorte cochée. Aucune publicité ; votre adresse ne sert qu’à ça.', 'One email per kind you check. No ads; your address is used for nothing else.')}</p>
  </section>`;
  zone.hidden = false;

  const form = zone.querySelector('form');
  const etatTexte = zone.querySelector('.ab-infolettre-etat');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const choix = choixCoches(form);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { etatTexte.textContent = tr('Entrez une adresse courriel valide.', 'Enter a valid email address.'); return; }
    if (!choix.length) { etatTexte.textContent = tr('Cochez au moins un courriel, ou choisissez un arrondissement.', 'Check at least one email, or choose a borough.'); return; }
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
    mesurer('infolettre_inscription', { sortes: choix.map((c) => c.type).join(','), connecte: donnees.confirme ? 'oui' : 'non' });
    etatTexte.innerHTML = donnees.confirme
      ? tr(`<strong>C'est fait.</strong> Le plus récent de chaque sorte part vers ${echapper(email)}.`, `<strong>Done.</strong> The latest of each kind is on its way to ${echapper(email)}.`)
      : tr(`<strong>Presque fini :</strong> on vient d'écrire à ${echapper(email)}. Cliquez sur « Confirmer mon inscription » dans ce courriel. (Pas reçu ? Regardez dans les indésirables.)`, `<strong>Almost done:</strong> we just emailed ${echapper(email)}. Click “Confirmer mon inscription” in that email. (Not there? Check your spam folder.)`);
    form.reset();
  });
}

// ---------- la boîte de Mes dossiers (compte connecté, adresse déjà vérifiée) ----------
// `premiereLigne` : une ligne fournie par la page — l'alerte du matin, qui n'est pas une infolettre
// mais se coche au même endroit. { html, cabler(racine) } : le HTML est réinséré à chaque rendu,
// et `cabler` rebranche ses boutons.
export async function boiteInfolettre(zone, s, { premiereLigne = null } = {}) {
  if (!zone) return;
  if (!s) { zone.innerHTML = ''; return; }
  let etat = await etatServeur(s);
  if (!etat?.villes?.length && !premiereLigne) { zone.innerHTML = ''; return; }
  etat ??= { villes: [], inscriptions: {}, courriel: s.user?.email ?? '' };

  const dessiner = (message = '') => {
    zone.innerHTML = `<section class="ab-carte ab-infolettre-boite">
      <h2 style="margin-top:0">📬 ${tr('Mes courriels', 'My emails')}</h2>
      <p class="ab-chapeau" style="margin-bottom:12px">${tr('Cochez ce que vous voulez recevoir, décochez quand vous voulez. Pour les infolettres, le plus récent numéro part tout de suite.', 'Check what you want to receive, uncheck whenever you like. For newsletters, the latest issue goes out right away.')}</p>
      ${premiereLigne?.html ?? ''}
      ${etat.villes.map((v) => `${etat.villes.length > 1 ? `<h3 class="ab-sous-titre">${echapper(v.nom)}</h3>` : ''}${listeSortes(etat, v.cle, v.offre, { cocherSuivis: true, retirable: true })}`).join('')}
      <p class="ab-note" aria-live="polite">${message || tr(`Envoyé à ${echapper(etat.courriel ?? '')}.`, `Sent to ${echapper(etat.courriel ?? '')}.`)}</p>
    </section>`;
    premiereLigne?.cabler?.(zone);
  };
  dessiner();

  // Une case cochée, un arrondissement choisi ou retiré : on enregistre tout de suite.
  const enregistrer = async (choix, message) => {
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courante?.access_token ?? ''}` },
      body: JSON.stringify({ choix: [choix] }),
    }).catch(() => null);
    const donnees = r?.ok ? await r.json().catch(() => null) : null;
    if (!donnees) { dessiner(tr('Impossible pour l’instant. Réessayez dans un moment.', "Couldn't do it right now. Try again in a moment.")); return; }
    etat = donnees;
    mesurer('infolettre_preferences', { type: choix.type, actif: choix.actif ? 'oui' : 'non' });
    dessiner(message);
  };

  zone.onchange = async (ev) => {
    const caseSorte = ev.target.closest('input[type="checkbox"][data-type]');
    if (caseSorte) {
      const { ville, type } = caseSorte.dataset;
      const nom = etat.villes.find((v) => v.cle === ville)?.offre.find((o) => o.cle === type)?.nom ?? '';
      caseSorte.disabled = true;
      return enregistrer({ ville, type, actif: caseSorte.checked }, caseSorte.checked
        ? tr(`Inscrit à « ${echapper(nom)} » : le plus récent part vers votre boîte.`, `Subscribed to “${echapper(nom)}”: the latest one is on its way.`)
        : tr(`Vous ne recevrez plus « ${echapper(nom)} ».`, `You won't receive “${echapper(nom)}” anymore.`));
    }
    const choixArr = ev.target.closest('.ab-arr-choix');
    if (choixArr?.value) {
      const { ville } = choixArr.dataset;
      const nom = choixArr.selectedOptions[0]?.textContent ?? '';
      const arrondissement = choixArr.value;
      choixArr.disabled = true;
      return enregistrer({ ville, type: 'arrondissement', arrondissement, actif: true },
        tr(`Inscrit à l'arrondissement ${echapper(nom)} : le plus récent part vers votre boîte.`, `Subscribed to the ${echapper(nom)} borough: the latest one is on its way.`));
    }
  };

  zone.onclick = async (ev) => {
    const retirer = ev.target.closest('.ab-arr-retirer');
    if (!retirer) return;
    const { ville, arrondissement } = retirer.dataset;
    retirer.disabled = true;
    await enregistrer({ ville, type: 'arrondissement', arrondissement, actif: false },
      tr('Arrondissement retiré.', 'Borough removed.'));
  };
}
