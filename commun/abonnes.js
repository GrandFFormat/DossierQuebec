// L'espace abonnés dans chaque volet municipal. Une page de volet n'a que deux choses à faire :
//   1. porter data-ville="quebec" (ou montreal…) sur <body> et charger ce module ;
//   2. mettre dans chaque fiche de décision un
//        <div class="ab-fiche" data-dossier="…" data-numero="…" data-objet="…"></div>
//      où data-dossier est la clé qui suit la décision d'une instance à l'autre (le sommaire à
//      Québec, le numéro de dossier à Montréal).
//
// Le module ajoute « Mes dossiers » dans l'en-tête de la page et, sur chaque fiche :
//   - si la décision fait partie d'un projet suivable (tramway, logement…), un bouton
//     « ☆ Projet : … » dans la ligne des pastilles, cliquable sans déplier la fiche ;
//     une décision seule ne se suit pas : ce qui a du sens à suivre, c'est le projet ;
//   - à l'ouverture, le « Détail de l'argent » s'il existe — complet pour un abonné, aperçu et
//     « Abonnez-vous » sinon. Rien n'est chargé tant qu'on n'ouvre pas une fiche ;
//   - au bas de la fiche ouverte, « Signaler une erreur dans cette fiche » (compte requis).

import { VILLES, echapper, mesurer, session, envoyerLien, chargerSuivis, suivre, nePlusSuivre, chargerDetail, rendreDetail, formulaireMessage, client } from './abonnes-client.js';

const VILLE = document.body.dataset.ville;
let sess = null;
let suivis = new Set(); // clés « ville|dossier »
const cle = (ville, dossier) => `${ville}|${dossier}`;
const zoneDe = (fiche) => fiche?.querySelector(':scope > .corps > .ab-fiche');

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

// ---------- suivre un projet ----------
// Seulement les projets dont la fiche fait partie (clé « projet:tramway »). Une décision seule
// ne se suit pas : la plupart sont finales dès leur adoption, et celles qui ne le sont pas
// avancent au sein de leur projet. Sans projet, la fiche n'a aucun bouton, et sa ligne de
// pastilles se comporte comme avant (elle déplie la fiche).
function etatEtoile(bouton) {
  const suivi = suivis.has(cle(VILLE, bouton.dataset.dossier));
  const projet = bouton.dataset.titre;
  bouton.classList.toggle('actif', suivi);
  bouton.setAttribute('aria-pressed', String(suivi));
  bouton.innerHTML = `<span aria-hidden="true">${suivi ? '★' : '☆'}</span> Projet : ${echapper(projet)}`;
  bouton.title = suivi ? `Projet suivi — cliquer pour ne plus suivre « ${projet} »` : `Suivre toutes les décisions du projet « ${projet} »`;
  bouton.setAttribute('aria-label', bouton.title);
}

function majEtoiles(dossier) {
  const selecteur = dossier ? `.ab-etoile[data-dossier="${CSS.escape(dossier)}"]` : '.ab-etoile';
  for (const b of document.querySelectorAll(selecteur)) etatEtoile(b);
}

// Chaque fiche reçoit ses boutons de projet dès qu'elle apparaît (les listes sont redessinées à
// chaque filtre, d'où l'observateur).
function equiper(fiche) {
  if (fiche.dataset.abPret) return;
  fiche.dataset.abPret = '1';
  const zone = zoneDe(fiche);
  const meta = fiche.querySelector(':scope > summary .meta');
  if (!zone || !meta) return;
  let projets = [];
  try {
    projets = JSON.parse(zone.dataset.projets || '[]');
  } catch {}
  if (!projets.length) return;

  // La ligne des pastilles porte un bouton : elle ne déplie plus la fiche (le reste de la boîte, oui).
  meta.classList.add('ab-meta-inerte');
  const groupe = document.createElement('span');
  groupe.className = 'ab-boutons';
  for (const p of projets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ab-etoile ab-projet';
    Object.assign(b.dataset, { dossier: `projet:${p.cle}`, titre: p.titre, objet: p.titre, numero: '' });
    etatEtoile(b);
    groupe.append(b);
  }
  meta.append(groupe);
}

function equiperTout() {
  for (const fiche of document.querySelectorAll('details.pliante:not([data-ab-pret])')) equiper(fiche);
}

let attente = 0;
new MutationObserver(() => {
  if (attente) return;
  attente = requestAnimationFrame(() => {
    attente = 0;
    equiperTout();
  });
}).observe(document.body, { childList: true, subtree: true });

// ---------- le corps de la fiche ----------
async function peupler(zone) {
  if (!zone || !VILLE || zone.dataset.pret === '1') return;
  zone.dataset.pret = '1';
  zone.innerHTML = `<div class="ab-connexion" hidden></div><div class="ab-detail-zone"></div>
    <div class="ab-signaler"><button type="button" class="ab-signaler-lien" data-action="signaler">Signaler une erreur dans cette fiche</button><div class="ab-message-boite" hidden></div></div>`;
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
  boite.querySelector('input').focus();
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
    if (e.target instanceof HTMLDetailsElement && e.target.open && e.target.matches('details.pliante')) peupler(zoneDe(e.target));
  },
  true
);

document.addEventListener('click', async (e) => {
  const abonner = e.target.closest('[data-mesure]');
  if (abonner) mesurer(abonner.dataset.mesure, { ville: VILLE });

  // La ligne des pastilles ne déplie pas la fiche (le reste de la boîte, oui).
  const meta = e.target.closest('summary .ab-meta-inerte');
  if (meta) e.preventDefault();

  const signaler = e.target.closest('[data-action="signaler"]');
  if (signaler) {
    const zone = signaler.closest('.ab-fiche');
    if (!sess) {
      formulaireConnexion(zone.querySelector('.ab-connexion'), 'Connectez-vous pour signaler une erreur : on vous envoie un lien par courriel, sans mot de passe.');
      return;
    }
    signaler.hidden = true;
    formulaireMessage(zone.querySelector('.ab-message-boite'), sess, { sujet: 'erreur', fixe: true, ville: VILLE, numero: zone.dataset.numero || null })
      .querySelector('textarea')
      .focus();
    mesurer('signaler_erreur', { ville: VILLE });
    return;
  }

  const etoile = e.target.closest('.ab-etoile');
  if (!etoile) return;
  const fiche = etoile.closest('details.pliante');
  const zone = zoneDe(fiche);

  if (!sess) {
    await peupler(zone);
    fiche.open = true;
    formulaireConnexion(
      zone.querySelector('.ab-connexion'),
      etoile.dataset.titre
        ? `Connectez-vous pour suivre le projet « ${etoile.dataset.titre} » et retrouver toutes ses décisions dans « Mes dossiers ».`
        : 'Connectez-vous pour suivre ce projet et le retrouver dans « Mes dossiers ».'
    );
    return;
  }

  etoile.disabled = true;
  // Le bouton porte ce qu'il suit : le dossier de la fiche, ou un projet.
  const cible = { ville: VILLE, dossier: etoile.dataset.dossier, numero: etoile.dataset.numero, objet: etoile.dataset.objet };
  const dejaSuivi = suivis.has(cle(VILLE, cible.dossier));
  const erreur = dejaSuivi ? await nePlusSuivre(sess, cible) : await suivre(sess, cible);
  etoile.disabled = false;
  if (erreur) {
    console.error(erreur);
    etoile.title = "Impossible d'enregistrer — réessayez";
    return;
  }
  if (dejaSuivi) suivis.delete(cle(VILLE, cible.dossier));
  else {
    suivis.add(cle(VILLE, cible.dossier));
    mesurer('suivre_dossier', { ville: VILLE });
  }
  majCompte();
  majEtoiles(cible.dossier); // la même clé peut apparaître sur plusieurs fiches (sommaire et résolutions)
});

// ---------- session ----------
async function rafraichirSession() {
  sess = await session();
  suivis = new Set(sess ? (await chargerSuivis()).map((s) => cle(s.ville, s.dossier_id)) : []);
  majCompte();
  majEtoiles();
}

// Après la connexion (retour du lien) ou la déconnexion : étoiles et fiches ouvertes à jour.
client.auth.onAuthStateChange(async (evenement) => {
  if (evenement === 'TOKEN_REFRESHED') return;
  await rafraichirSession();
  for (const zone of document.querySelectorAll('.ab-fiche[data-pret="1"]')) {
    zone.dataset.pret = '';
    if (zone.closest('details')?.open) peupler(zone);
  }
});

if (VILLE && VILLES[VILLE]) {
  boutonEntete();
  equiperTout();
  rafraichirSession();
}
