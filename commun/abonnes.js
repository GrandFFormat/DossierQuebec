// L'espace abonnés dans chaque volet municipal. Une page de volet n'a que deux choses à faire :
//   1. porter data-ville="quebec" (ou montreal…) sur <body> et charger ce module ;
//   2. mettre dans chaque fiche de décision un
//        <div class="ab-fiche" data-dossier="…" data-numero="…" data-objet="…"></div>
//      où data-dossier est la clé qui suit la décision d'une instance à l'autre (le sommaire à
//      Québec, le numéro de dossier à Montréal).
//
// Le module ajoute « Mes dossiers » dans l'en-tête, et à l'ouverture d'une fiche : « Suivre ce
// dossier » et, s'il existe un détail vérifié, l'onglet « Détail de l'argent » — complet pour un
// abonné, aperçu et « Abonnez-vous » sinon. Rien n'est chargé tant qu'on n'ouvre pas une fiche.

import { VILLES, echapper, mesurer, session, envoyerLien, chargerSuivis, suivre, nePlusSuivre, chargerDetail, rendreDetail, client } from './abonnes-client.js';

const VILLE = document.body.dataset.ville;
let sess = null;
let suivis = new Set(); // clés « ville|dossier »
const cle = (ville, dossier) => `${ville}|${dossier}`;

function boutonEntete() {
  if (document.querySelector('.ab-mes-dossiers')) return;
  const lien = document.createElement('a');
  lien.className = 'ab-mes-dossiers';
  lien.href = '/mes-dossiers';
  lien.innerHTML = 'Mes dossiers <span class="ab-compte" hidden></span>';
  const reperes = document.querySelector('header .taille-texte') ?? document.querySelector('header .bascule-theme');
  if (reperes) reperes.before(lien);
  else document.querySelector('header nav')?.append(lien);
}

function majCompte() {
  const badge = document.querySelector('.ab-mes-dossiers .ab-compte');
  if (!badge) return;
  badge.hidden = !suivis.size;
  badge.textContent = suivis.size;
}

async function rafraichirSession() {
  sess = await session();
  suivis = new Set(sess ? (await chargerSuivis()).map((s) => cle(s.ville, s.dossier_id)) : []);
  majCompte();
}

function boutonSuivre(zone) {
  const suivi = suivis.has(cle(VILLE, zone.dataset.dossier));
  return `<button type="button" class="ab-suivre${suivi ? ' actif' : ''}" aria-pressed="${suivi}">${suivi ? '★ Dossier suivi — retirer' : '☆ Suivre ce dossier'}</button>`;
}

async function peupler(zone) {
  if (!zone || !VILLE || zone.dataset.pret === '1') return;
  zone.dataset.pret = '1';
  zone.innerHTML = `<div class="ab-actions">${boutonSuivre(zone)}</div><div class="ab-connexion" hidden></div><div class="ab-detail-zone"></div>`;
  const reponse = await chargerDetail(VILLE, zone.dataset.dossier, sess);
  zone.querySelector('.ab-detail-zone').innerHTML = rendreDetail(reponse, VILLE);
}

function formulaireConnexion(boite, message) {
  boite.hidden = false;
  boite.innerHTML = `<p>${echapper(message)}</p>
    <form class="ab-form"><input type="email" required placeholder="Votre courriel" autocomplete="email">
    <button type="submit" class="ab-bouton">Recevoir le lien de connexion</button></form>
    <p class="ab-note">Un seul lien peut être envoyé toutes les 5 minutes. Pensez à vérifier vos courriels indésirables.</p>
    <p class="ab-note ab-etat" aria-live="polite"></p>`;
  boite.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const champ = boite.querySelector('input');
    const bouton = boite.querySelector('button');
    const etat = boite.querySelector('.ab-etat');
    bouton.disabled = true;
    etat.textContent = 'Envoi…';
    const erreur = await envoyerLien(champ.value.trim());
    if (erreur) {
      bouton.disabled = false;
      etat.textContent = erreur.code === 'over_email_send_rate_limit' ? 'Un lien a déjà été envoyé il y a moins de 5 minutes — vérifiez votre boîte courriel (et les indésirables), ou réessayez dans quelques minutes.' : 'Une erreur est survenue. Réessayez.';
    } else {
      etat.textContent = `Lien envoyé à ${champ.value.trim()}. Ouvrez-le pour revenir ici, connecté.`;
    }
  });
}

document.addEventListener(
  'toggle',
  (e) => {
    // Seulement une fiche (details.pliante), jamais une séance qui en contient des dizaines.
    if (e.target instanceof HTMLDetailsElement && e.target.open && e.target.matches('details.pliante')) {
      peupler(e.target.querySelector(':scope > .corps > .ab-fiche'));
    }
  },
  true
);

document.addEventListener('click', async (e) => {
  const abonner = e.target.closest('[data-mesure]');
  if (abonner) mesurer(abonner.dataset.mesure, { ville: VILLE });

  const bouton = e.target.closest('.ab-suivre');
  if (!bouton) return;
  const zone = bouton.closest('.ab-fiche');
  if (!sess) {
    formulaireConnexion(zone.querySelector('.ab-connexion'), 'Connectez-vous pour suivre ce dossier et le retrouver dans « Mes dossiers », peu importe la ville.');
    return;
  }
  bouton.disabled = true;
  const cible = { ville: VILLE, dossier: zone.dataset.dossier, numero: zone.dataset.numero, objet: zone.dataset.objet };
  const dejaSuivi = suivis.has(cle(VILLE, cible.dossier));
  const erreur = dejaSuivi ? await nePlusSuivre(sess, cible) : await suivre(sess, cible);
  if (erreur) {
    console.error(erreur);
    bouton.disabled = false;
    bouton.textContent = "Impossible d'enregistrer — réessayez";
    return;
  }
  if (dejaSuivi) suivis.delete(cle(VILLE, cible.dossier));
  else {
    suivis.add(cle(VILLE, cible.dossier));
    mesurer('suivre_dossier', { ville: VILLE });
  }
  majCompte();
  bouton.outerHTML = boutonSuivre(zone);
});

// Après la connexion (retour du lien) ou la déconnexion : on remet les fiches ouvertes à jour.
client.auth.onAuthStateChange(async () => {
  await rafraichirSession();
  for (const zone of document.querySelectorAll('.ab-fiche[data-pret="1"]')) {
    zone.dataset.pret = '';
    if (zone.closest('details')?.open) peupler(zone);
  }
});

if (VILLE && VILLES[VILLE]) {
  boutonEntete();
  rafraichirSession();
}
