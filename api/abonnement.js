// L'abonnement payant, côté abonné : l'état, le paiement (Stripe Checkout) et la gestion (portail Stripe).
//
//   GET  /api/abonnement                     Authorization: Bearer <jeton Supabase> (facultatif)
//        → { ouvert, mode, peutPayer, abonne, source, fin, annulationPrevue, gerable }
//   POST /api/abonnement?action=paiement     (connecté, pas déjà abonné) { langue? } → { url } de Stripe Checkout
//   POST /api/abonnement?action=portail      (abonné par Stripe) → { url } du portail client Stripe
//                                             (carte, factures, annulation)
//
// Le paiement n'est offert qu'avec STRIPE_OUVERT=1, ou aux adresses de STRIPE_ESSAI (voir _stripe.js).
// L'accès n'est jamais donné ici : seul le webhook (api/stripe-webhook.js) écrit l'abonnement, une
// fois le paiement confirmé par Stripe.

import { site } from './_alertes.js';
import { adresseEssai, estActive, ligneAbonnement, modeStripe, paiementOuvert, stripe, stripeConfigure, utilisateurDe } from './_stripe.js';

const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const configure = stripeConfigure();
  const u = await utilisateurDe(jetonDe(req));
  const ligne = u ? await ligneAbonnement(u.id).catch(() => null) : null;
  const abonne = estActive(ligne);
  const peutPayer = Boolean(configure && u && !abonne && (paiementOuvert() || adresseEssai(u.email)));

  if (req.method === 'GET') {
    return res.status(200).json({
      ouvert: configure && paiementOuvert(),
      mode: configure ? modeStripe() : null,
      connecte: Boolean(u),
      peutPayer,
      abonne,
      source: ligne?.source ?? null,
      fin: abonne ? ligne.fin : null,
      annulationPrevue: Boolean(abonne && ligne.annulation_prevue),
      gerable: Boolean(configure && ligne?.stripe_customer_id),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non permise' });
  if (!configure) return res.status(503).json({ erreur: 'paiement pas encore branché' });
  if (!u) return res.status(401).json({ erreur: 'connexion requise' });

  const action = String(req.query?.action ?? '');
  try {
    if (action === 'paiement') {
      if (abonne) return res.status(409).json({ erreur: 'déjà abonné' });
      if (!peutPayer) return res.status(403).json({ erreur: "l'abonnement n'est pas encore ouvert" });
      const anglais = String((typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body)?.langue ?? '') === 'en';
      const session = await stripe('/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': process.env.STRIPE_PRIX,
        'line_items[0][quantity]': '1',
        success_url: `${site()}/mes-dossiers?abonnement=merci`,
        cancel_url: `${site()}/abonnement?abonnement=annule`,
        client_reference_id: u.id,
        'metadata[user_id]': u.id,
        'subscription_data[metadata][user_id]': u.id,
        locale: anglais ? 'en' : 'fr-CA',
        allow_promotion_codes: 'true',
        ...(ligne?.stripe_customer_id ? { customer: ligne.stripe_customer_id } : { customer_email: u.email }),
      });
      return res.status(200).json({ url: session.url });
    }
    if (action === 'portail') {
      if (!ligne?.stripe_customer_id) return res.status(404).json({ erreur: 'aucun abonnement Stripe' });
      const portail = await stripe('/billing_portal/sessions', { customer: ligne.stripe_customer_id, return_url: `${site()}/mes-dossiers` });
      return res.status(200).json({ url: portail.url });
    }
    return res.status(400).json({ erreur: 'action inconnue' });
  } catch (e) {
    console.error('abonnement :', action, e.message);
    return res.status(502).json({ erreur: 'Stripe indisponible' });
  }
}
