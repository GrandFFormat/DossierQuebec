// Ce que partagent les volets municipaux et les pages « Mes dossiers » et « Abonnement » :
// la connexion Supabase (la même que DossierQuébec — un seul compte pour tout le site), les
// suivis, l'appel au détail réservé, et le rendu de ce détail.
//
// Tous les volets sont des sous-dossiers de dossierquebec.ca : la session ouverte sur une
// page vaut pour toutes les autres, sans rien de plus.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Mêmes valeurs que index.html de DossierQuébec. La clé « publishable » est faite pour être
// publique : ce sont les règles RLS (scripts/supabase-schema-abonnes.sql) qui protègent.
export const client = createClient('https://wfgcqftgtmptfutrbujz.supabase.co', 'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6');

// VILLES, echapper et la navigation vivent dans navigation.js (sans dépendance extérieure).
import { VILLES, echapper } from './navigation.js';
import { EN, tr } from './langue.js';
export { VILLES, echapper, memoriserVolet, dernierVolet, enteteCommune, boutonRetourEnHaut } from './navigation.js';
export { EN, tr } from './langue.js';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
export const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return EN ? `${MONTHS[m - 1]} ${j}, ${a}` : `${j} ${MOIS[m - 1]} ${a}`;
};

export const mesurer = (nom, donnees = {}) => {
  try {
    window.va?.('event', { name: nom, ...donnees });
  } catch {}
};

export async function session() {
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

// Le lien de connexion ramène sur la page où l'on était. L'adresse doit être permise dans
// Supabase (Authentication → URL Configuration → Redirect URLs : https://dossierquebec.ca/**).
export async function envoyerLien(email) {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname + location.search },
  });
  return error;
}

export async function chargerSuivis() {
  const { data, error } = await client.from('dossiers_suivis').select('ville, dossier_id, numero, objet, created_at').order('created_at', { ascending: false });
  if (error) {
    console.error('suivis :', error);
    return [];
  }
  return data ?? [];
}

export async function suivre(s, { ville, dossier, numero, objet }) {
  const { error } = await client.from('dossiers_suivis').upsert(
    { user_id: s.user.id, ville, dossier_id: dossier, numero: numero || null, objet: (objet || '').slice(0, 600) || null },
    { onConflict: 'user_id,ville,dossier_id', ignoreDuplicates: true }
  );
  return error;
}

export async function nePlusSuivre(s, { ville, dossier }) {
  const { error } = await client.from('dossiers_suivis').delete().eq('user_id', s.user.id).eq('ville', ville).eq('dossier_id', dossier);
  return error;
}

// Renvoie { existe, acces, apercu | detail } ou null si le service ne répond pas (en local,
// par exemple, où les fonctions Vercel n'existent pas).
export async function chargerDetail(ville, dossier, s) {
  try {
    const res = await fetch(`/api/detail?ville=${encodeURIComponent(ville)}&dossier=${encodeURIComponent(dossier)}`, {
      headers: s ? { Authorization: `Bearer ${s.access_token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------- Nous écrire / Signaler une erreur ----------
// Le serveur (api/message.js) exige une session : il en tire le courriel de la personne, note si
// elle est abonnée, limite à 5 messages par 24 heures, garde le message et en envoie une copie.
export const SUJETS_MESSAGE = EN
  ? { idee: 'An idea', suggestion: 'A suggestion', probleme: 'A problem with the site', erreur: 'An error in the data' }
  : { idee: 'Une idée', suggestion: 'Une suggestion', probleme: 'Un problème sur le site', erreur: 'Une erreur dans une donnée' };

// Le remerciement dépend du sujet, et change d'une fois à l'autre : quelqu'un qui écrit souvent
// ne reçoit pas toujours la même phrase.
const MERCIS = {
  suggestion: [
    "Merci pour la suggestion ! On la lit, et c'est comme ça que le site colle à ce que les gens cherchent.",
    'Suggestion bien reçue, merci ! Votre temps et votre implication font avancer le site.',
    "Merci d'avoir pris le temps de nous l'écrire : chaque suggestion nous aide à mieux couvrir ce qui compte pour vous.",
  ],
  idee: [
    "Merci pour votre idée ! Merci d'avoir pris le temps de nous l'écrire, et de vous impliquer dans le site.",
    'Idée bien reçue, merci ! Votre temps et votre implication font avancer le site.',
    "Merci d'avoir partagé cette idée. C'est grâce à des gens impliqués comme vous que le site s'améliore.",
    "Bien reçu, merci ! Chaque idée est lue, et on apprécie que vous preniez le temps de contribuer.",
  ],
  probleme: [
    "Merci d'avoir pris le temps de nous signaler ce problème : vous nous aidez à rendre le site meilleur.",
    'Problème bien reçu, merci ! Votre signalement nous aide à améliorer le site pour tout le monde.',
    "Merci de nous l'avoir signalé. C'est comme ça qu'on rend le site meilleur, un problème à la fois.",
    "Bien reçu, merci d'avoir pris ce temps : grâce à vous, on peut corriger ce qui cloche.",
  ],
  erreur: [
    "Merci d'avoir pris le temps de signaler cette erreur : vous nous aidez à rendre les décisions plus claires pour tout le monde.",
    "Erreur bien reçue, merci ! Votre œil attentif aide tout le monde à mieux comprendre ce que la Ville décide.",
    "Merci de nous l'avoir signalée. Chaque correction rend l'information plus juste et plus lisible.",
    "Bien reçu, merci ! Grâce à votre signalement, la fiche sera plus exacte pour les prochains lecteurs.",
  ],
};
const MERCIS_EN = {
  suggestion: ["Thanks for the suggestion! We read every one — it's how the site keeps up with what people look for.", 'Suggestion received, thank you! Your time and involvement move the site forward.'],
  idee: ['Thanks for your idea! We appreciate you taking the time to write and to get involved.', 'Idea received, thank you! Every idea is read.'],
  probleme: ['Thanks for taking the time to report this problem: you help make the site better.', 'Problem received, thank you! Your report helps us improve the site for everyone.'],
  erreur: ['Thanks for taking the time to report this error: you help make decisions clearer for everyone.', 'Error received, thank you! Thanks to your report, the item will be more accurate for the next readers.'],
};
const merci = (sujet) => {
  const phrases = (EN ? MERCIS_EN : MERCIS)[sujet] ?? (EN ? MERCIS_EN : MERCIS).idee;
  return phrases[Math.floor(Math.random() * phrases.length)];
};

async function envoyerMessage(contenu) {
  const s = await session();
  if (!s) return 'session';
  try {
    const res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify(contenu),
    });
    if (res.ok) return null;
    return res.status === 429 ? 'limite' : res.status === 401 ? 'session' : 'erreur';
  } catch {
    return 'erreur';
  }
}

// Dans « Mes dossiers », on choisit le sujet ; sous une fiche, sujet et numéro sont déjà remplis.
export function formulaireMessage(boite, s, { sujet = 'idee', ville = null, numero = null, fixe = false } = {}) {
  boite.hidden = false;
  const question = fixe && sujet === 'erreur'
    ? tr(`Qu'est-ce qui ne va pas${numero ? ` dans ${numero}` : ''} ?`, `What's wrong${numero ? ` in ${numero}` : ''}?`)
    : tr('Votre message', 'Your message');
  const EXEMPLES = EN
    ? { erreur: "For example: the amount shown doesn't match the one on page 3 of the PDF.", suggestion: 'For example: a keyword that finds nothing ("école Rochebelle"), a place or a topic you would like to follow.' }
    : {
      erreur: 'Par exemple : le montant indiqué ne correspond pas à celui de la page 3 du PDF.',
      suggestion: 'Par exemple : un mot-clé qui ne donne rien (« école Rochebelle »), un lieu ou un sujet que vous aimeriez suivre.',
    };
  const exemple = EXEMPLES[sujet] ?? '';
  boite.innerHTML = `<form class="ab-message">
    ${fixe ? '' : `<label>${tr('Sujet', 'Topic')} <select name="sujet">${Object.entries(SUJETS_MESSAGE).map(([k, v]) => `<option value="${k}"${k === sujet ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`}
    <label>${echapper(question)} <textarea name="message" required minlength="3" maxlength="4000" rows="5" placeholder="${echapper(exemple)}"></textarea></label>
    <div><button type="submit" class="ab-bouton">${tr('Envoyer', 'Send')}</button></div>
    <p class="ab-note">${tr('Si une réponse est utile, elle vous arrivera à', 'If a reply is useful, it will be sent to')} ${echapper(s.user.email)}.</p>
    <p class="ab-note ab-etat" aria-live="polite"></p>
  </form>`;
  const form = boite.querySelector('form');
  form.elements.sujet?.addEventListener('change', (e) => { form.elements.message.placeholder = EXEMPLES[e.target.value] ?? ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = form.querySelector('button');
    const etat = form.querySelector('.ab-etat');
    bouton.disabled = true;
    etat.textContent = tr('Envoi…', 'Sending…');
    const choix = form.elements.sujet?.value ?? sujet;
    const erreur = await envoyerMessage({ sujet: choix, message: form.elements.message.value.trim(), ville, numero, page: (location.pathname + location.search).slice(0, 300) });
    if (!erreur) {
      boite.innerHTML = `<p class="ab-merci">${echapper(merci(choix))}</p>`;
      mesurer('message_envoye', { sujet: choix, ville: ville ?? '' });
      return;
    }
    bouton.disabled = false;
    etat.textContent = (EN
      ? { limite: "You've already sent 5 messages in the last 24 hours. Try again tomorrow.", session: 'Your session has expired. Sign in again, then resend the message.', erreur: "Sending didn't work. Try again in a moment." }
      : {
        limite: 'Vous avez déjà envoyé 5 messages dans les dernières 24 heures. Réessayez demain.',
        session: 'Votre session a expiré. Reconnectez-vous, puis renvoyez le message.',
        erreur: "L'envoi n'a pas fonctionné. Réessayez dans un moment.",
      })[erreur];
  });
  return form;
}

const ligne = (etiquette, texte) => (texte ? `<li><strong>${echapper(etiquette)}${EN ? ':' : ' :'}</strong> ${echapper(texte)}</li>` : '');
// En anglais : les libellés du détail sont traduits, son contenu (extrait des documents) reste en français.
const NATURES_EN = { 'dépense': 'expense', 'subvention maximale': 'maximum grant', 'reçu par la Ville': 'received by the City', 'prêt': 'loan', "valeur au rôle d'évaluation": 'assessed value', 'revenu pour la Ville': 'revenue for the City', 'investissement privé': 'private investment', "fermeture d'emprunts": 'loan closing', 'montant': 'amount', 'aucun montant': 'no amount' };
const SECTIONS_EN = [[/qui reçoit et qui paie/, 'who receives and who pays'], [/soumission\(s\) comparée\(s\)/, 'bid(s) compared'], [/l'estimation de la Ville/, "the City's estimate"], [/la répartition par année/, 'the breakdown by year'], [/d'où vient l'argent/, 'where the money comes from'], [/les conditions/, 'the conditions'], [/ce qui change/, 'what changes'], [/la durée/, 'the duration']];
const nature = (n) => (EN ? NATURES_EN[n] ?? n : n);
const section = (texte) => (EN ? SECTIONS_EN.reduce((t, [a, b]) => t.replace(a, b), texte) : texte);

export function rendreDetail(reponse, ville) {
  if (!reponse?.existe) return '';
  if (reponse.acces === 'apercu') {
    const a = reponse.apercu;
    return `<div class="ab-detail ab-verrou">
      <div class="ab-detail-titre">${tr("Détail de l'argent", 'Money details')} <span class="ab-etiquette">${tr('réservé aux abonnés', 'subscribers only')}</span></div>
      <p class="ab-apercu">${tr('Nature du montant :', 'Type of amount:')} <strong>${echapper(nature(a.nature))}</strong>${a.beneficiaire ? ` · ${echapper(a.beneficiaire)}` : ''}</p>
      ${a.sections.length ? `<p class="ab-apercu">${tr("L'abonnement débloque", 'A subscription unlocks')} ${echapper(a.sections.map(section).join(', '))}.</p>` : ''}
      <a class="ab-bouton" href="/abonnement?ville=${encodeURIComponent(ville)}" data-mesure="clic_abonnez_vous">${tr('Abonnez-vous', 'Subscribe')}</a>
    </div>`;
  }
  const d = reponse.detail;
  const soumissions = (d.soumissions ?? [])
    .map((s) => `<li><strong>${s.retenue ? tr('Soumission retenue', 'Winning bid') : tr('Autre soumission', 'Other bid')}${EN ? ':' : ' :'}</strong> ${echapper(s.entreprise)}${s.ville ? ` (${echapper(s.ville)})` : ''}${s.prix ? ` · ${echapper(s.prix)}` : ''}${s.conforme === false ? ` · ${tr('non conforme', 'non-compliant')}` : ''}</li>`)
    .join('');
  const parAnnee = (d.repartitionAnnuelle ?? []).map((r) => `${r.annee} : ${r.montant}`).join(' · ');
  const chiffres = (d.chiffresCles ?? []).map((c) => `${c.libelle} : ${c.valeur}`).join(' · ');
  return `<div class="ab-detail">
    <div class="ab-detail-titre">${tr("Détail de l'argent", 'Money details')} <span class="ab-etiquette">${echapper(nature(d.nature))}</span></div>
    ${d.enUnePhrase ? `<p class="ab-phrase">${echapper(d.enUnePhrase)}</p>` : ''}
    <ul>
      ${ligne(tr('Montant', 'Amount'), d.montantPrincipal)}
      ${ligne(tr('Qui reçoit', 'Who receives'), [d.beneficiaire, d.beneficiaireVille].filter(Boolean).join(', '))}
      ${ligne(tr('Qui paie', 'Who pays'), d.payeur)}
      ${ligne(tr('Durée', 'Duration'), d.duree)}
      ${ligne(tr('Renouvellements', 'Renewals'), d.renouvellements)}
      ${ligne(tr('Attribué par', 'Awarded by'), d.modeAttribution)}
      ${soumissions}
      ${ligne(tr('Estimation de la Ville', "City's estimate"), d.estimationVille)}
      ${ligne(tr('Écart', 'Difference'), d.ecartEstimation)}
      ${ligne(tr('Par année', 'By year'), parAnnee)}
      ${ligne(tr('Financement', 'Funding'), d.sourceFinancement)}
      ${ligne(tr('En chiffres', 'Key figures'), chiffres)}
      ${(d.changementsNotables ?? []).map((c) => ligne(tr('Ce qui change', 'What changes'), c)).join('')}
      ${(d.conditions ?? []).map((c) => ligne(tr('Condition', 'Condition'), c)).join('')}
    </ul>
    <p class="ab-note">${tr("Extrait automatiquement du sommaire décisionnel, puis vérifié automatiquement contre son texte ; ce qui ne se vérifiait pas a été retiré. En cas d'écart, le PDF officiel fait foi.", "Extracted automatically from the decision summary, then checked automatically against its text; anything that couldn't be verified was removed. The details are quoted in French, as in the document. If anything differs, the official PDF prevails.")}</p>
  </div>`;
}

// ---------- demander un détail de l'argent manquant (abonnés) ----------
// Quand un dossier avec un montant n'a pas encore de détail, l'abonné peut le demander : la
// demande passe en tête de la lecture du lendemain matin (api/detail.js en POST,
// quebec/scripts/details-du-jour.js). À n'afficher que pour un dossier dont le résumé a un montant :
// sans montant, il n'y a rien à détailler.
const HEURE_LECTURE = tr('demain matin', 'tomorrow morning');
// Les villes où les demandes sont réellement lues chaque matin (celles qui ont la chaîne
// details-du-jour / publier-details). Ailleurs — les prototypes (Lévis, Longueuil, Laval), et
// Montréal, sorti du prototype le 18 septembre 2026 sans cette chaîne —, les demandes sont
// enregistrées, elles disent où est l'intérêt, mais mises sur la glace : le message ne promet pas
// une lecture qui n'aura pas lieu. Une ville qui reçoit la chaîne entre dans cette liste.
const VILLES_DETAIL_LU = new Set(['quebec']);
export function rendreDemande(reponse, ville) {
  if (!reponse || reponse.existe) return '';
  if (reponse.lu) return `<div class="ab-demande"><p class="ab-note" style="margin:0">${tr('Ce document a été lu, mais on n’a pas pu en tirer un détail de l’argent fiable. Le PDF officiel fait foi.', "This document was read, but no reliable money details could be drawn from it. The official PDF prevails.")}</p></div>`;
  if (reponse.sansMontant) return `<div class="ab-demande"><p class="ab-note" style="margin:0">${tr('Ce dossier n’a pas de montant à détailler.', 'This item has no amount to detail.')}</p></div>`;
  // Visible pour tous, utilisable par les abonnés seulement (Martin, 17 sept. 2026) : un visiteur ou
  // un compte gratuit voit la fonction, fermée, avec le chemin vers l'abonnement. Rien sur les volets
  // en prototype, où les demandes ne sont pas encore lues : on n'y vend pas ce qui n'existe pas.
  if (!reponse.demandable) {
    if (!VILLES_DETAIL_LU.has(ville)) return '';
    return `<div class="ab-demande"><p class="ab-demande-verrou"><span aria-hidden="true">🔒</span> <span class="ab-demande-verrou-nom">${tr('Demander le détail de l’argent', 'Request the money details')}</span> · <a class="ab-lien" href="/abonnement?ville=${encodeURIComponent(ville)}" data-mesure="clic_demande_verrou">${tr('réservé aux abonnés', 'subscribers only')}</a></p></div>`;
  }
  return `<div class="ab-demande">${contenuDemande(reponse.demande, ville)}</div>`;
}
function contenuDemande(demande, ville) {
  if (demande && !VILLES_DETAIL_LU.has(ville)) {
    // Sans « en prototype » : Montréal n'en est plus un, et la raison qui compte pour l'abonné est
    // que la lecture n'est pas encore offerte ici, pas l'étiquette du volet.
    return `<p class="ab-demande-etat">${tr('Demande enregistrée ; le détail de l’argent n’est pas encore offert pour cette ville.', 'Request recorded; money details are not yet offered for this city.')}</p>`;
  }
  if (demande) {
    return EN
      ? `<p class="ab-demande-etat">Money details ${demande.parVous ? 'requested' : 'already requested by a subscriber'} on ${echapper(dateFr(new Date(demande.le).toLocaleDateString('en-CA')))}: read as a priority, normally ${HEURE_LECTURE}.</p>`
      : `<p class="ab-demande-etat">Détail de l’argent ${demande.parVous ? 'demandé' : 'déjà demandé par un abonné'} le ${echapper(dateFr(new Date(demande.le).toLocaleDateString('en-CA')))} : lu en priorité, normalement ${HEURE_LECTURE}.</p>`;
  }
  // Exactement comme « Signaler une erreur dans cette fiche » : un lien seul, sans phrase autour
  // (un bouton vert, puis une phrase grise, étaient de trop).
  return `<p><button type="button" class="ab-demande-lien" data-action="demander-detail" title="${tr('Pas encore lu pour ce dossier : on le met en tête de la liste', 'Not read yet for this item: we put it at the top of the list')}">${tr('Demander le détail de l’argent', 'Request the money details')}</button>
    <span class="ab-demande-message" aria-live="polite"></span></p>`;
}
export async function demanderDetail(bouton, ville, dossier, s) {
  const boite = bouton.closest('.ab-demande');
  const message = boite.querySelector('.ab-demande-message');
  bouton.disabled = true;
  message.textContent = tr('Envoi…', 'Sending…');
  try {
    const res = await fetch(`/api/detail?ville=${encodeURIComponent(ville)}&dossier=${encodeURIComponent(dossier)}`, {
      method: 'POST',
      headers: s ? { Authorization: `Bearer ${s.access_token}` } : {},
    });
    const corps = await res.json().catch(() => ({}));
    if (res.ok && corps.demande) {
      boite.innerHTML = contenuDemande(corps.demande, ville);
      mesurer('detail_demande', { ville });
      return;
    }
    // Des phrases fixes (aucune donnée de l'utilisateur) : innerHTML pour le lien vers l'abonnement.
    message.innerHTML = res.status === 429 ? tr('Vous avez déjà fait 10 demandes dans les dernières 24 heures. Réessayez demain.', "You've already made 10 requests in the last 24 hours. Try again tomorrow.")
      : res.status === 409 && corps.erreur === 'sans montant' ? tr('Ce dossier n’a pas de montant à détailler.', 'This item has no amount to detail.')
      : res.status === 409 ? tr('Ce détail vient d’être lu : rechargez la page pour l’afficher.', 'These details were just read: reload the page to see them.')
      // « n'est plus actif » seulement quand le serveur a vraiment lu un abonnement inactif — pas
      // pour une session absente ni une panne (503 : « réessayez »).
      : res.status === 403 && corps.erreur === 'abonnement inactif' ? tr(`Réservé aux abonnés — votre abonnement n’est plus actif. <a class="ab-lien" href="/abonnement?ville=${encodeURIComponent(ville)}">Voir l’abonnement</a>`, `Subscribers only — your subscription is no longer active. <a class="ab-lien" href="/abonnement?ville=${encodeURIComponent(ville)}">See the subscription</a>`)
      : res.status === 403 ? tr(`Réservé aux abonnés. <a class="ab-lien" href="/abonnement?ville=${encodeURIComponent(ville)}">Voir l’abonnement</a>`, `Subscribers only. <a class="ab-lien" href="/abonnement?ville=${encodeURIComponent(ville)}">See the subscription</a>`) : tr('La demande n’a pas fonctionné. Réessayez dans un moment.', "The request didn't work. Try again in a moment.");
  } catch {
    message.textContent = tr('La demande n’a pas fonctionné. Réessayez dans un moment.', "The request didn't work. Try again in a moment.");
  }
  bouton.disabled = false;
}
