// Offrir un abonnement, payé en ligne : ce que partagent api/cadeau.js (qui ouvre Stripe) et
// api/stripe-webhook.js (qui livre le code une fois le paiement reçu).
//
// LE PARCOURS. Sur /abonnement, quelqu'un inscrit l'adresse de la personne à qui il offre, son
// propre nom — ou coche « rester anonyme » —, et paie chez Stripe. Stripe appelle le webhook ;
// celui-ci fabrique un code cadeau et l'envoie à la personne, qui l'active sur /abonnement comme
// n'importe quel code. Rien de nouveau côté activation : c'est utiliser_code_cadeau, déjà éprouvée.
//
// INTERRUPTEUR. Tant que CADEAU_OUVERT ne vaut pas « 1 », le formulaire ne s'affiche pas et
// api/cadeau.js refuse d'ouvrir Stripe. Ça permet de tout déployer éteint, de faire un achat
// test de bout en bout, puis d'allumer. Même principe que STRIPE_OUVERT pour l'abonnement.

import { supabase, site } from './_alertes.js';
import { echapper } from './_infolettre.js';
import { FORFAITS, modeStripe } from './_stripe.js';

// Tolérant sur la façon d'écrire « oui » : `1`, `true`, `oui`, avec ou sans espace. Une valeur
// saisie à la main dans Vercel ne doit pas laisser l'offre fermée pour une espace en trop — c'est
// une panne invisible, puisque la page affiche simplement l'ancienne formule.
export const cadeauOuvert = () => ['1', 'true', 'oui', 'yes'].includes(String(process.env.CADEAU_OUVERT ?? '').trim().toLowerCase());

// Les durées qu'on peut offrir. Les MONTANTS viennent de FORFAITS : un prix ne vit qu'à un seul
// endroit, et un cadeau coûte exactement ce que coûte l'abonnement qu'il remplace.
export const DUREES = {
  mensuel: { mois: 1, montant: FORFAITS.mensuel.montant },
  annuel: { mois: 12, montant: FORFAITS.annuel.montant },
};

const COURRIEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Ce que le navigateur envoie, nettoyé. Renvoie { erreur } ou la demande propre.
export function demandeCadeau(corps) {
  const destinataire = String(corps?.destinataire ?? '').trim().toLowerCase();
  if (!COURRIEL.test(destinataire) || destinataire.length > 200) return { erreur: 'adresse invalide' };
  const forfait = Object.hasOwn(DUREES, corps?.forfait) ? corps.forfait : 'annuel';
  const anonyme = corps?.anonyme === true;
  // Un nom, pas du HTML : il finit dans un courriel. On le borne, et il sera échappé à l'envoi.
  const expediteur = anonyme ? '' : String(corps?.expediteur ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!anonyme && !expediteur) return { erreur: 'nom requis' };
  const langue = corps?.langue === 'en' ? 'en' : 'fr';
  return { destinataire, forfait, anonyme, expediteur, langue };
}

// Un code lisible, impossible à deviner : « DQ » + 10 caractères tirés au hasard.
function nouveauCode() {
  return 'DQ' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
}

// ---------- le courriel envoyé à la personne qui reçoit ----------
export function courrielCadeau({ code, mois, expediteur, anonyme, langue }) {
  const en = langue === 'en';
  const qui = anonyme || !expediteur ? null : echapper(expediteur);
  const duree = en ? (mois === 1 ? 'one month' : `${mois} months`) : (mois === 1 ? 'un mois' : `${mois} mois`);
  const lien = `${site()}/abonnement?code=${encodeURIComponent(code)}#cadeau`;
  const sujet = en
    ? (qui ? `${expediteur} is giving you a DossierQuébec subscription` : 'You’ve been given a DossierQuébec subscription')
    : (qui ? `${expediteur} vous offre un abonnement à DossierQuébec` : 'On vous offre un abonnement à DossierQuébec');
  const html = en
    ? `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p style="font-size:17px"><strong>${qui ? `${qui} is giving you` : 'Someone is giving you'} ${duree} of DossierQuébec.</strong></p>
  <p>DossierQuébec makes the decisions of the National Assembly and of city councils readable: official sources taken as is, with a plain-language summary. The subscription opens the <strong>money detail</strong> of each decision, keyword alerts and exports.</p>
  <p style="margin:22px 0"><span style="font-size:13px;color:#5B6570">Your code</span><br>
  <span style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${code}</span></p>
  <p><a href="${lien}" style="background:#0B8A4B;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Activate my subscription</a></p>
  <p style="font-size:13px;color:#5B6570">No card, no payment: it has already been paid for. If you already have a subscription, the code adds to the time you have left. You can also enter it by hand on dossierquebec.ca/abonnement.</p>
</div>`
    : `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.55">
  <p style="font-size:17px"><strong>${qui ? `${qui} vous offre` : 'Quelqu’un vous offre'} ${duree} de DossierQuébec.</strong></p>
  <p>DossierQuébec rend lisibles les décisions de l’Assemblée nationale et des conseils municipaux : les sources officielles telles quelles, avec un résumé en langage clair. L’abonnement ouvre le <strong>détail de l’argent</strong> de chaque décision, les alertes par mot-clé et les exports.</p>
  <p style="margin:22px 0"><span style="font-size:13px;color:#5B6570">Votre code</span><br>
  <span style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${code}</span></p>
  <p><a href="${lien}" style="background:#0B8A4B;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Activer mon abonnement</a></p>
  <p style="font-size:13px;color:#5B6570">Aucune carte, aucun paiement : c’est déjà payé. Si vous avez déjà un abonnement, le code s’ajoute au temps qu’il vous reste. Vous pouvez aussi l’entrer à la main sur dossierquebec.ca/abonnement.</p>
</div>`;
  return { sujet, html };
}

async function envoyer({ a, sujet, html }) {
  const { RESEND_API_KEY, DIGEST_FROM } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM) throw new Error('envoi de courriel non configuré');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DIGEST_FROM, to: [a], subject: sujet, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// ---------- livrer un cadeau payé (appelé par le webhook) ----------
//
// IDEMPOTENT, parce que Stripe relivre un même événement tant que le webhook ne répond pas 200 :
//   1. un code existe déjà pour cette session ? on le reprend, on n'en fabrique pas un second ;
//   2. son courriel est déjà parti ? on s'arrête là ;
//   3. sinon on l'envoie, et on note la date.
// Si l'envoi échoue, on LÈVE l'erreur : le webhook répond 500, Stripe réessaie, et l'étape 1
// retrouve le code déjà fabriqué. La personne reçoit donc un seul code, même après une panne.
export async function livrerCadeau(session) {
  const m = session.metadata ?? {};
  const duree = DUREES[m.forfait] ?? DUREES.annuel;

  let [ligne] = await supabase(`/rest/v1/codes_cadeaux?stripe_session_id=eq.${encodeURIComponent(session.id)}&select=code,courriel_envoye_le`) ?? [];
  if (!ligne) {
    const code = nouveauCode();
    await supabase('/rest/v1/codes_cadeaux?on_conflict=stripe_session_id', {
      methode: 'POST',
      entetes: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      corps: [{
        code, mois: duree.mois, lecture_seule: false, maitre: false,
        stripe_session_id: session.id, destinataire: m.destinataire,
        note: `Cadeau payé${m.anonyme === '1' ? ' (anonyme)' : ` — de ${m.expediteur}`}${modeStripe() === 'test' ? ' [ESSAI]' : ''}`,
      }],
    });
    // Relu plutôt que supposé : si deux livraisons de Stripe se sont croisées, l'une a gagné et
    // l'autre a été ignorée — c'est le code enregistré qui fait foi.
    [ligne] = await supabase(`/rest/v1/codes_cadeaux?stripe_session_id=eq.${encodeURIComponent(session.id)}&select=code,courriel_envoye_le`) ?? [];
  }
  if (!ligne) throw new Error('code cadeau introuvable après insertion');
  if (ligne.courriel_envoye_le) return 'deja-livre';

  const { sujet, html } = courrielCadeau({
    code: ligne.code, mois: duree.mois,
    expediteur: m.expediteur, anonyme: m.anonyme === '1', langue: m.langue,
  });
  await envoyer({ a: m.destinataire, sujet, html });
  await supabase(`/rest/v1/codes_cadeaux?stripe_session_id=eq.${encodeURIComponent(session.id)}`, {
    methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: { courriel_envoye_le: new Date().toISOString() },
  });
  return 'livre';
}
