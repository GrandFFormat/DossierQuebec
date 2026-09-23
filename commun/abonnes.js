// L'espace abonnés dans chaque volet municipal. Une page de volet n'a que deux choses à faire :
//   1. porter data-ville="quebec" (ou montreal…) sur <body> et charger ce module ;
//   2. mettre dans chaque fiche de décision un
//        <div class="ab-fiche" data-dossier="…" data-numero="…" data-objet="…"></div>
//      où data-dossier est la clé qui suit la décision d'une instance à l'autre (le sommaire à
//      Québec, le numéro de dossier à Montréal).
//
// Le module ajoute « Mes dossiers » et « Abonnement » dans l'en-tête de la page et, sur chaque fiche :
//   - si la décision fait partie d'un projet suivable (tramway, logement…), un bouton
//     « ☆ Projet : … » dans la ligne des pastilles, cliquable sans déplier la fiche ;
//     une décision seule ne se suit pas : ce qui a du sens à suivre, c'est le projet ;
//   - à l'ouverture, le « Détail de l'argent » s'il existe — complet pour un abonné, aperçu et
//     « Abonnez-vous » sinon. Rien n'est chargé tant qu'on n'ouvre pas une fiche ;
//   - au bas de la fiche ouverte, « Signaler une erreur dans cette fiche » (compte requis).

import { VILLES, echapper, mesurer, session, envoyerLien, chargerSuivis, suivre, limiteSuivis, nePlusSuivre, chargerDetail, rendreDetail, rendreDemande, demanderDetail, formulaireMessage, client , marquerConsultation } from './abonnes-client.js';
import { memoriserVolet } from './navigation.js';
import { tr } from './langue.js';

const VILLE = document.body.dataset.ville;
let sess = null;
let suivis = new Set(); // clés « ville|dossier »
const cle = (ville, dossier) => `${ville}|${dossier}`;
const zoneDe = (fiche) => fiche?.querySelector(':scope > .corps > .ab-fiche');

// « Mes dossiers » et « Abonnement » en tête des outils du menu (nav .outils), dans tous les
// volets. La ville est mémorisée : Mes dossiers et Abonnement prennent la marque de ce volet.
function boutonsEntete() {
  if (document.querySelector('.ab-mes-dossiers')) return;
  const mesDossiers = document.createElement('a');
  mesDossiers.className = 'ab-mes-dossiers';
  mesDossiers.href = '/mes-dossiers';
  mesDossiers.innerHTML = `${tr('Mes dossiers', 'My files')} <span class="ab-compte" hidden></span>`;
  const abonnement = document.createElement('a');
  abonnement.className = 'ab-lien-abonnement';
  abonnement.href = `/abonnement?ville=${encodeURIComponent(VILLE)}`;
  abonnement.textContent = tr('Abonnement', 'Subscription');
  const outils = document.querySelector('header nav .outils');
  const repere = document.querySelector('header .taille-texte') ?? document.querySelector('header .bascule-theme');
  if (outils) outils.prepend(mesDossiers, abonnement);
  else if (repere) repere.before(mesDossiers, abonnement);
  else document.querySelector('header nav')?.append(mesDossiers, abonnement);
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
  bouton.innerHTML = `<span aria-hidden="true">${suivi ? '★' : '☆'}</span> ${tr('Projet :', 'Project:')} ${echapper(projet)}`;
  bouton.title = suivi
    ? tr(`Projet suivi — cliquer pour ne plus suivre « ${projet} »`, `Project followed — click to stop following "${projet}"`)
    : tr(`Suivre toutes les décisions du projet « ${projet} »`, `Follow all decisions of the project "${projet}"`);
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
    <div class="ab-signaler"><button type="button" class="ab-signaler-lien" data-action="signaler">${tr('Signaler une erreur dans cette fiche', 'Report an error in this item')}</button><div class="ab-message-boite" hidden></div></div>`;
  // La session du moment, pas celle gardée en mémoire : son jeton a pu être renouvelé entre-temps.
  const reponse = await chargerDetail(VILLE, zone.dataset.dossier, await session());
  // Sans détail : un abonné peut le demander, si le résumé a trouvé un montant (data-montant).
  zone.querySelector('.ab-detail-zone').innerHTML = rendreDetail(reponse, VILLE) || (zone.dataset.montant === '1' ? rendreDemande(reponse, VILLE) : '');
}

function formulaireConnexion(boite, message) {
  boite.hidden = false;
  boite.innerHTML = `<p>${echapper(message)}</p>
    <form class="ab-form"><input type="email" required placeholder="${tr('Votre courriel', 'Your email')}" autocomplete="email">
    <button type="submit" class="ab-bouton">${tr('Recevoir le lien de connexion', 'Get the sign-in link')}</button></form>
    <p class="ab-note">${tr('Un seul lien peut être envoyé toutes les 5 minutes. Pensez à vérifier vos courriels indésirables.', 'Only one link can be sent every 5 minutes. Check your spam folder.')}</p>
    <p class="ab-note ab-etat" aria-live="polite"></p>`;
  boite.querySelector('input').focus();
  boite.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const champ = boite.querySelector('input');
    const bouton = boite.querySelector('button');
    const etat = boite.querySelector('.ab-etat');
    bouton.disabled = true;
    etat.textContent = tr('Envoi…', 'Sending…');
    const erreur = await envoyerLien(champ.value.trim());
    if (erreur) {
      bouton.disabled = false;
      etat.textContent = erreur.code === 'over_email_send_rate_limit'
        ? tr('Un lien a déjà été envoyé il y a moins de 5 minutes — vérifiez votre boîte courriel (et les indésirables), ou réessayez dans quelques minutes.', 'A link was already sent less than 5 minutes ago — check your inbox (and spam), or try again in a few minutes.')
        : tr('Une erreur est survenue. Réessayez.', 'Something went wrong. Try again.');
    } else {
      etat.textContent = tr(`Lien envoyé à ${champ.value.trim()}. Ouvrez-le pour revenir ici, connecté.`, `Link sent to ${champ.value.trim()}. Open it to come back here, signed in.`);
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

  const demande = e.target.closest('[data-action="demander-detail"]');
  if (demande) {
    await demanderDetail(demande, VILLE, demande.closest('.ab-fiche').dataset.dossier, await session());
    return;
  }

  const signaler = e.target.closest('[data-action="signaler"]');
  if (signaler) {
    const zone = signaler.closest('.ab-fiche');
    if (!sess) {
      formulaireConnexion(zone.querySelector('.ab-connexion'), tr('Connectez-vous pour signaler une erreur : on vous envoie un lien par courriel, sans mot de passe.', 'Sign in to report an error: we email you a link, no password needed.'));
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
        ? tr(`Connectez-vous pour suivre le projet « ${etoile.dataset.titre} » et retrouver toutes ses décisions dans « Mes dossiers ».`, `Sign in to follow the project "${etoile.dataset.titre}" and find all its decisions in "My files".`)
        : tr('Connectez-vous pour suivre ce projet et le retrouver dans « Mes dossiers ».', 'Sign in to follow this project and find it in "My files".')
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
    const plafond = limiteSuivis(erreur);
    // Le message doit se LIRE : une infobulle ne s'affiche jamais au doigt, et l'aria-label posé
    // par etatEtoile() masquerait un title mis à jour tout seul. On ouvre donc la fiche et on
    // écrit dans sa zone, comme pour la connexion — d'autant que le plafond du compte gratuit est
    // justement le moment où l'abonnement a quelque chose à offrir.
    const texte = plafond === 3
      ? tr('Limite atteinte : 3 suivis avec un compte gratuit — projets de ville et projets de loi ensemble. L’abonnement en donne 10.', 'Limit reached: 3 follows with a free account — city projects and bills together. The subscription raises it to 10.')
      : plafond
        ? tr(`Limite atteinte : ${plafond} suivis en tout.`, `Limit reached: ${plafond} follows in all.`)
        : tr("Impossible d'enregistrer — réessayez", "Couldn't save — try again");
    etoile.title = texte;
    etoile.setAttribute('aria-label', texte);
    if (plafond) {
      await peupler(zone);
      fiche.open = true;
      const boite = zone.querySelector('.ab-connexion');
      if (boite) {
        boite.hidden = false;
        boite.innerHTML = `<p class="ab-note" role="status">${echapper(texte)} <a class="ab-lien" href="/abonnement">${tr("Voir l'abonnement", 'See the subscription')}</a></p>`;
      }
    }
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
  // Compte de consultation (une bibliothèque sur un poste public) : la classe retire les étoiles
  // « Suivre », le signalement et la demande de détail (voir abonnes.css). La protection réelle
  // est dans Postgres ; ceci évite des boutons qui échouent.
  if (sess) await marquerConsultation();
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
  memoriserVolet(VILLE);
  boutonsEntete();
  equiperTout();
  rafraichirSession();
}
