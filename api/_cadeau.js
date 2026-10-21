// Offrir un abonnement (retiré le 27 sept. 2026, remis le 21 oct. 2026) : ce que partagent
// api/abonnement.js (qui ouvre Stripe, liste les codes et fait valoir un code) et
// api/stripe-webhook.js (qui fabrique le code une fois le paiement reçu).
//
// LE PARCOURS. Sur /abonnement, une personne connectée choisit une durée (1 mois, 3 mois, 1 an) et
// paie UNE fois chez Stripe. Le webhook fabrique un code et l'envoie par courriel À L'ACHETEUR, qui
// le donne à qui il veut ; le code paraît aussi dans son Mon dossier. La personne qui le reçoit le
// colle dans la case « Mettez votre code ici » : le serveur appelle echanger_code_cadeau
// (scripts/supabase-cadeaux-retour.sql), qui compte les essais puis délègue à utiliser_code_cadeau,
// la fonction déjà éprouvée des codes de Martin et des bibliothèques.
//
// Le code est rangé SANS tirets (12 caractères) : utiliser_code_cadeau ne garde que lettres et
// chiffres de ce qu'on lui donne. Il s'affiche groupé, XXXX-XXXX-XXXX.

import crypto from 'node:crypto';
import { supabase, site } from './_alertes.js';
import { echapper } from './_infolettre.js';
import { FORFAITS, modeStripe } from './_stripe.js';

// Les durées qu'on peut offrir. Les MONTANTS viennent de FORFAITS : un cadeau coûte exactement ce
// que coûte l'abonnement qu'il remplace. Le navigateur n'envoie que le nom de la durée.
export const DUREES = {
  mensuel: { mois: 1, montant: FORFAITS.mensuel.montant },
  trimestriel: { mois: 3, montant: FORFAITS.trimestriel.montant },
  annuel: { mois: 12, montant: FORFAITS.annuel.montant },
};

// Sans 0/O, 1/I/L : un code recopié à la main ne se trompe pas de lettre. 31 signes, 12 places :
// 31^12 ≈ 8 × 10^17 codes possibles, contre 10 essais par heure et par compte.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function nouveauCode() {
  let c = '';
  for (let i = 0; i < 12; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return c;
}
export const codeAffiche = (code) => String(code ?? '').replace(/(.{4})(?=.)/g, '$1-');
// Ce que la personne colle, nettoyé comme le fait utiliser_code_cadeau.
export const codeNettoye = (brut) => String(brut ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 40);

const duree = (mois, en) => (en ? (mois === 1 ? '1 month' : mois === 12 ? '1 year' : `${mois} months`) : (mois === 1 ? '1 mois' : mois === 12 ? '1 an' : `${mois} mois`));
export const nomProduit = (forfait, en) => (en ? `DossierQuébec gift subscription (${duree(DUREES[forfait].mois, true)})` : `Abonnement DossierQuébec à offrir (${duree(DUREES[forfait].mois, false)})`);

// ---------- le courriel envoyé à l'acheteur ----------
export function courrielCadeau({ code, mois, langue }) {
  const en = langue === 'en';
  const c = echapper(codeAffiche(code));
  const lien = `${site()}/abonnement`;
  const sujet = en ? 'Your DossierQuébec gift code' : 'Votre code cadeau DossierQuébec';
  const html = en
    ? `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p>Here is your DossierQuébec gift code (${duree(mois, true)}):</p>
  <p style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${c}</p>
  <p>Give it to anyone you like. It is used on <a href="${lien}">dossierquebec.ca/abonnement</a>, in the “Enter your code here” box.</p>
  <p style="font-size:13px;color:#5B6570">The code works once. You also find it in My file.</p>
</div>`
    : `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p>Voici votre code cadeau DossierQuébec (${duree(mois, false)}) :</p>
  <p style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${c}</p>
  <p>Donnez-le à qui vous voulez. Il s’utilise sur <a href="${lien}">dossierquebec.ca/abonnement</a>, dans la case « Mettez votre code ici ».</p>
  <p style="font-size:13px;color:#5B6570">Le code sert une seule fois. Vous le retrouvez aussi dans Mon dossier.</p>
</div>`;
  return { sujet, html };
}

export async function envoyer({ a, sujet, html }) {
  const { RESEND_API_KEY, DIGEST_FROM } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM) throw new Error('envoi de courriel non configuré');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DIGEST_FROM, to: [a], subject: sujet, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const lire = async (sessionId) =>
  (await supabase(`/rest/v1/codes_cadeaux?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=code,mois,courriel_envoye_le`))?.[0] ?? null;

// ---------- livrer un cadeau payé (appelé par le webhook) ----------
//
// IDEMPOTENT : Stripe relivre un événement tant que le webhook ne répond pas 200.
//   1. un code existe déjà pour cette session ? on le reprend (stripe_session_id est unique) ;
//   2. son courriel est déjà parti ? on s'arrête là ;
//   3. sinon on l'envoie, et on note la date.
// Un envoi raté LÈVE l'erreur : le webhook répond 500, Stripe réessaie, l'étape 1 retrouve le code.
export async function livrerCadeau(session) {
  const m = session.metadata ?? {};
  if (session.payment_status !== 'paid') return 'non-paye';
  const d = DUREES[m.duree];
  const acheteur = /^[0-9a-f-]{36}$/.test(m.user_id ?? '') ? m.user_id : null;
  const courriel = session.customer_details?.email || session.customer_email || null;
  if (!d || !acheteur || !courriel) {
    console.error('CADEAU PAYÉ ILLISIBLE (durée, compte ou courriel manquant) — à régler à la main :', session.id);
    return 'illisible';
  }
  // Le montant payé doit être celui de la durée : une session fabriquée ailleurs ne vaut rien ici.
  if (session.amount_total !== d.montant || session.currency !== 'cad') {
    console.error('CADEAU : montant inattendu', session.id, session.amount_total, session.currency);
    return 'montant';
  }

  let ligne = await lire(session.id);
  if (!ligne) {
    await supabase('/rest/v1/codes_cadeaux?on_conflict=stripe_session_id', {
      methode: 'POST',
      entetes: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      corps: [{
        code: nouveauCode(), mois: d.mois, lecture_seule: false,
        stripe_session_id: session.id, acheteur, destinataire: courriel,
        note: `Cadeau payé${modeStripe() === 'test' ? ' [ESSAI]' : ''}`,
      }],
    });
    // Relu plutôt que supposé : deux livraisons croisées, l'une gagne, c'est le code enregistré qui fait foi.
    ligne = await lire(session.id);
  }
  if (!ligne) throw new Error('code cadeau introuvable après insertion');
  if (ligne.courriel_envoye_le) return 'deja-livre';

  const { sujet, html } = courrielCadeau({ code: ligne.code, mois: ligne.mois, langue: m.langue });
  await envoyer({ a: courriel, sujet, html });
  await supabase(`/rest/v1/codes_cadeaux?stripe_session_id=eq.${encodeURIComponent(session.id)}`, {
    methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: { courriel_envoye_le: new Date().toISOString() },
  });
  return 'livre';
}

// Les codes achetés par ce compte, pour Mon dossier.
export async function codesDe(userId) {
  const lignes = await supabase(`/rest/v1/codes_cadeaux?acheteur=eq.${userId}&select=code,mois,cree_le,utilise_le&order=cree_le.desc`) ?? [];
  return lignes.map((l) => ({ code: codeAffiche(l.code), mois: l.mois, achete: l.cree_le, utilise: Boolean(l.utilise_le) }));
}

// Faire valoir un code : tout se joue dans Postgres (verrou sur le code, compte des essais,
// prolongation). Renvoie l'objet de la fonction : { ok, mois, fin } ou { ok:false, raison }.
export async function echangerCode(userId, brut) {
  return supabase('/rest/v1/rpc/echanger_code_cadeau', {
    methode: 'POST',
    corps: { p_user: userId, p_code: codeNettoye(brut) },
  });
}
