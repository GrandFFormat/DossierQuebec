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
export { VILLES, echapper, memoriserVolet, dernierVolet, enteteCommune, boutonRetourEnHaut } from './navigation.js';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
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
export const SUJETS_MESSAGE = { idee: 'Une idée', suggestion: 'Une suggestion', probleme: 'Un problème sur le site', erreur: 'Une erreur dans une donnée' };

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
const merci = (sujet) => {
  const phrases = MERCIS[sujet] ?? MERCIS.idee;
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
  const question = fixe && sujet === 'erreur' ? `Qu'est-ce qui ne va pas${numero ? ` dans ${numero}` : ''} ?` : 'Votre message';
  const EXEMPLES = {
    erreur: 'Par exemple : le montant indiqué ne correspond pas à celui de la page 3 du PDF.',
    suggestion: 'Par exemple : un mot-clé qui ne donne rien (« école Rochebelle »), un lieu ou un sujet que vous aimeriez suivre.',
  };
  const exemple = EXEMPLES[sujet] ?? '';
  boite.innerHTML = `<form class="ab-message">
    ${fixe ? '' : `<label>Sujet <select name="sujet">${Object.entries(SUJETS_MESSAGE).map(([k, v]) => `<option value="${k}"${k === sujet ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`}
    <label>${echapper(question)} <textarea name="message" required minlength="3" maxlength="4000" rows="5" placeholder="${echapper(exemple)}"></textarea></label>
    <div><button type="submit" class="ab-bouton">Envoyer</button></div>
    <p class="ab-note">Si une réponse est utile, elle vous arrivera à ${echapper(s.user.email)}.</p>
    <p class="ab-note ab-etat" aria-live="polite"></p>
  </form>`;
  const form = boite.querySelector('form');
  form.elements.sujet?.addEventListener('change', (e) => { form.elements.message.placeholder = EXEMPLES[e.target.value] ?? ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = form.querySelector('button');
    const etat = form.querySelector('.ab-etat');
    bouton.disabled = true;
    etat.textContent = 'Envoi…';
    const choix = form.elements.sujet?.value ?? sujet;
    const erreur = await envoyerMessage({ sujet: choix, message: form.elements.message.value.trim(), ville, numero, page: (location.pathname + location.search).slice(0, 300) });
    if (!erreur) {
      boite.innerHTML = `<p class="ab-merci">${echapper(merci(choix))}</p>`;
      mesurer('message_envoye', { sujet: choix, ville: ville ?? '' });
      return;
    }
    bouton.disabled = false;
    etat.textContent = {
      limite: 'Vous avez déjà envoyé 5 messages dans les dernières 24 heures. Réessayez demain.',
      session: 'Votre session a expiré. Reconnectez-vous, puis renvoyez le message.',
      erreur: "L'envoi n'a pas fonctionné. Réessayez dans un moment.",
    }[erreur];
  });
  return form;
}

const ligne = (etiquette, texte) => (texte ? `<li><strong>${echapper(etiquette)} :</strong> ${echapper(texte)}</li>` : '');

export function rendreDetail(reponse, ville) {
  if (!reponse?.existe) return '';
  if (reponse.acces === 'apercu') {
    const a = reponse.apercu;
    return `<div class="ab-detail ab-verrou">
      <div class="ab-detail-titre">Détail de l'argent <span class="ab-etiquette">réservé aux abonnés</span></div>
      <p class="ab-apercu">Nature du montant : <strong>${echapper(a.nature)}</strong>${a.beneficiaire ? ` · ${echapper(a.beneficiaire)}` : ''}</p>
      ${a.sections.length ? `<p class="ab-apercu">L'abonnement débloque ${echapper(a.sections.join(', '))}.</p>` : ''}
      <a class="ab-bouton" href="/abonnement?ville=${encodeURIComponent(ville)}" data-mesure="clic_abonnez_vous">Abonnez-vous</a>
    </div>`;
  }
  const d = reponse.detail;
  const soumissions = (d.soumissions ?? [])
    .map((s) => `<li><strong>${s.retenue ? 'Soumission retenue' : 'Autre soumission'} :</strong> ${echapper(s.entreprise)}${s.ville ? ` (${echapper(s.ville)})` : ''}${s.prix ? ` · ${echapper(s.prix)}` : ''}${s.conforme === false ? ' · non conforme' : ''}</li>`)
    .join('');
  const parAnnee = (d.repartitionAnnuelle ?? []).map((r) => `${r.annee} : ${r.montant}`).join(' · ');
  const chiffres = (d.chiffresCles ?? []).map((c) => `${c.libelle} : ${c.valeur}`).join(' · ');
  return `<div class="ab-detail">
    <div class="ab-detail-titre">Détail de l'argent <span class="ab-etiquette">${echapper(d.nature)}</span></div>
    ${d.enUnePhrase ? `<p class="ab-phrase">${echapper(d.enUnePhrase)}</p>` : ''}
    <ul>
      ${ligne('Montant', d.montantPrincipal)}
      ${ligne('Qui reçoit', [d.beneficiaire, d.beneficiaireVille].filter(Boolean).join(', '))}
      ${ligne('Qui paie', d.payeur)}
      ${ligne('Durée', d.duree)}
      ${ligne('Renouvellements', d.renouvellements)}
      ${ligne('Attribué par', d.modeAttribution)}
      ${soumissions}
      ${ligne('Estimation de la Ville', d.estimationVille)}
      ${ligne('Écart', d.ecartEstimation)}
      ${ligne('Par année', parAnnee)}
      ${ligne('Financement', d.sourceFinancement)}
      ${ligne('En chiffres', chiffres)}
      ${(d.changementsNotables ?? []).map((c) => ligne('Ce qui change', c)).join('')}
      ${(d.conditions ?? []).map((c) => ligne('Condition', c)).join('')}
    </ul>
    <p class="ab-note">Extrait automatiquement du sommaire décisionnel, puis vérifié automatiquement contre son texte ; ce qui ne se vérifiait pas a été retiré. En cas d'écart, le PDF officiel fait foi.</p>
  </div>`;
}

// ---------- demander un détail de l'argent manquant (abonnés) ----------
// Quand un dossier avec un montant n'a pas encore de détail, l'abonné peut le demander : la
// demande passe en tête de la lecture du lendemain matin (api/detail.js en POST,
// quebec/scripts/details-du-jour.js). À n'afficher que pour un dossier dont le résumé a un montant :
// sans montant, il n'y a rien à détailler.
const HEURE_LECTURE = 'demain matin';
export function rendreDemande(reponse) {
  if (!reponse || reponse.existe) return '';
  if (reponse.lu) return '<div class="ab-demande"><p class="ab-note" style="margin:0">Ce document a été lu, mais on n’a pas pu en tirer un détail de l’argent fiable. Le PDF officiel fait foi.</p></div>';
  if (!reponse.demandable) return '';
  return `<div class="ab-demande">${contenuDemande(reponse.demande)}</div>`;
}
function contenuDemande(demande) {
  if (demande) {
    return `<p class="ab-demande-etat">Détail de l’argent ${demande.parVous ? 'demandé' : 'déjà demandé par un abonné'} le ${echapper(dateFr(new Date(demande.le).toLocaleDateString('en-CA')))} : lu en priorité, normalement ${HEURE_LECTURE}.</p>`;
  }
  // Exactement comme « Signaler une erreur dans cette fiche » : un lien seul, sans phrase autour
  // (un bouton vert, puis une phrase grise, étaient de trop).
  return `<p><button type="button" class="ab-demande-lien" data-action="demander-detail" title="Pas encore lu pour ce dossier : on le met en tête de la liste">Demander le détail de l’argent</button>
    <span class="ab-demande-message" aria-live="polite"></span></p>`;
}
export async function demanderDetail(bouton, ville, dossier, s) {
  const boite = bouton.closest('.ab-demande');
  const message = boite.querySelector('.ab-demande-message');
  bouton.disabled = true;
  message.textContent = 'Envoi…';
  try {
    const res = await fetch(`/api/detail?ville=${encodeURIComponent(ville)}&dossier=${encodeURIComponent(dossier)}`, {
      method: 'POST',
      headers: s ? { Authorization: `Bearer ${s.access_token}` } : {},
    });
    const corps = await res.json().catch(() => ({}));
    if (res.ok && corps.demande) {
      boite.innerHTML = contenuDemande(corps.demande);
      mesurer('detail_demande', { ville });
      return;
    }
    message.textContent = res.status === 429 ? 'Vous avez déjà fait 10 demandes dans les dernières 24 heures. Réessayez demain.'
      : res.status === 409 ? 'Ce détail vient d’être lu : rouvrez la fiche.'
      : res.status === 403 ? 'Réservé aux abonnés.' : 'La demande n’a pas fonctionné. Réessayez dans un moment.';
  } catch {
    message.textContent = 'La demande n’a pas fonctionné. Réessayez dans un moment.';
  }
  bouton.disabled = false;
}
