// Les événements Stripe de l'abonnement payant → table `abonnements`.
//
//   POST /api/stripe-webhook   (appelé par Stripe seulement, signé avec STRIPE_WEBHOOK_SECRET)
//
// Dans Stripe (Développeurs → Webhooks), le point de terminaison https://dossierquebec.ca/api/stripe-webhook
// avec ces événements : checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed.
//
// Signature Web (Request → Response) plutôt que (req, res) : il faut le corps BRUT pour vérifier la
// signature, avant tout décodage JSON. Une erreur répond 500 : Stripe réessaie pendant trois jours.

import { annulerCadeauRembourse, livrerCadeau } from './_cadeau.js';
import { signatureStripeValide, stripeConfigure, synchroniser } from './_stripe.js';

const TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

// L'abonnement dont parle l'objet : l'abonnement lui-même, la session de paiement ou la facture
// (deux formes selon la version de l'API Stripe).
function abonnementDe(o) {
  if (o?.object === 'subscription') return o.id;
  const s = o?.subscription ?? o?.parent?.subscription_details?.subscription;
  return typeof s === 'string' ? s : s?.id ?? null;
}

export async function POST(request) {
  if (!stripeConfigure()) return new Response('Stripe non configuré', { status: 503 });
  const brut = await request.text();
  if (!signatureStripeValide(brut, request.headers.get('stripe-signature'))) return new Response('signature invalide', { status: 400 });

  let evenement;
  try {
    evenement = JSON.parse(brut);
  } catch {
    return new Response('corps invalide', { status: 400 });
  }
  const objet = evenement.data?.object ?? {};
  // Un abonnement OFFERT (remis le 21 oct. 2026) : un paiement unique, marqué « cadeau » par
  // api/abonnement.js. Il ne touche pas la table `abonnements` : il fabrique un code (api/_cadeau.js).
  if (evenement.type === 'checkout.session.completed' && objet.mode === 'payment' && objet.metadata?.type === 'cadeau') {
    try {
      const resultat = await livrerCadeau(objet);
      console.log(`Stripe cadeau ${objet.id} → ${resultat}`);
      return Response.json({ recu: true, resultat });
    } catch (e) {
      console.error(`Stripe cadeau ${objet.id} :`, e.message);
      return new Response('erreur', { status: 500 });
    }
  }

  // Un cadeau remboursé (22 oct. 2026) : ses codes disparaissent, le temps déjà donné est repris.
  if (evenement.type === 'charge.refunded') {
    try {
      const resultat = await annulerCadeauRembourse(objet);
      console.log(`Stripe remboursement ${objet.id} → ${resultat}`);
      return Response.json({ recu: true, resultat });
    } catch (e) {
      console.error(`Stripe remboursement ${objet.id} :`, e.message);
      return new Response('erreur', { status: 500 });
    }
  }

  // Un abonnement RÉCURRENT offert à quelqu'un d'autre (21 oct. 2026) passe par synchroniser comme
  // les autres : celui-ci le reconnaît à metadata.type = « offert » et le confie à api/_offert.js,
  // qui fabrique le code et met à jour la ligne du destinataire — jamais celle du donateur.
  const abonnement = abonnementDe(objet);
  if (!TYPES.has(evenement.type) || !abonnement) return Response.json({ recu: true, ignore: true });

  try {
    const resultat = await synchroniser(abonnement, objet.client_reference_id ?? objet.metadata?.user_id);
    console.log(`Stripe ${evenement.type} ${abonnement} → ${resultat}`);
    return Response.json({ recu: true, resultat });
  } catch (e) {
    console.error(`Stripe ${evenement.type} ${abonnement} :`, e.message);
    return new Response('erreur', { status: 500 });
  }
}
