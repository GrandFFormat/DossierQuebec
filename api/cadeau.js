// Offrir un abonnement, payé en ligne.
//
//   GET  /api/cadeau                → { ouvert, durees }   le formulaire s'affiche-t-il ?
//   POST /api/cadeau  { destinataire, forfait, expediteur, anonyme, langue }
//                                   → { url }              la page de paiement Stripe
//
// Pas besoin d'être connecté pour offrir : on offre à quelqu'un d'autre. Le code, lui, part par
// courriel une fois le paiement reçu — c'est le webhook qui s'en charge (voir api/_cadeau.js).
//
// Refus : 403 { erreur: 'cadeau fermé' } tant que CADEAU_OUVERT ne vaut pas « 1 » ;
//         400 { erreur: 'adresse invalide' | 'nom requis' } ;
//         503 si Stripe n'est pas configuré.

import { site } from './_alertes.js';
import { cadeauOuvert, demandeCadeau, DUREES } from './_cadeau.js';
import { stripe, stripeConfigure } from './_stripe.js';

const corpsDe = (req) => {
  if (typeof req.body !== 'string') return req.body ?? {};
  try { return JSON.parse(req.body); } catch { return {}; }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ouvert: cadeauOuvert() && stripeConfigure(),
      durees: Object.fromEntries(Object.entries(DUREES).map(([k, d]) => [k, { mois: d.mois, montant: d.montant }])),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non permise' });
  if (!stripeConfigure()) return res.status(503).json({ erreur: 'paiement non configuré' });
  if (!cadeauOuvert()) return res.status(403).json({ erreur: 'cadeau fermé' });

  const d = demandeCadeau(corpsDe(req));
  if (d.erreur) return res.status(400).json({ erreur: d.erreur });
  const duree = DUREES[d.forfait];
  const en = d.langue === 'en';

  try {
    const session = await stripe('/checkout/sessions', {
      // Un paiement UNIQUE, pas un abonnement : le cadeau ne se renouvelle pas tout seul sur la
      // carte de la personne qui offre.
      mode: 'payment',
      'line_items[0][price_data][currency]': 'cad',
      'line_items[0][price_data][unit_amount]': String(duree.montant),
      'line_items[0][price_data][product_data][name]': en
        ? `DossierQuébec subscription — gift (${duree.mois === 1 ? '1 month' : `${duree.mois} months`})`
        : `Abonnement DossierQuébec offert (${duree.mois === 1 ? '1 mois' : `${duree.mois} mois`})`,
      'line_items[0][price_data][product_data][description]': en
        ? `The code will be emailed to ${d.destinataire}.`
        : `Le code sera envoyé par courriel à ${d.destinataire}.`,
      'line_items[0][quantity]': '1',
      success_url: `${site()}/abonnement?cadeau=merci`,
      cancel_url: `${site()}/abonnement?cadeau=annule#offrir`,
      // Ce que le webhook relira pour fabriquer et envoyer le code. Stripe limite chaque valeur à
      // 500 caractères : l'adresse et le nom sont déjà bornés par demandeCadeau.
      'metadata[type]': 'cadeau',
      'metadata[destinataire]': d.destinataire,
      'metadata[forfait]': d.forfait,
      'metadata[expediteur]': d.expediteur,
      'metadata[anonyme]': d.anonyme ? '1' : '0',
      'metadata[langue]': d.langue,
      locale: en ? 'en' : 'fr-CA',
      // Même conformité que l'abonnement : un contrat à distance doit porter le nom et l'adresse
      // du consommateur (Loi sur la protection du consommateur). Ici, le consommateur est la
      // personne qui PAIE — pas celle qui reçoit.
      billing_address_collection: 'required',
      'payment_method_types[0]': 'card',
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Stripe cadeau :', e.message);
    return res.status(502).json({ erreur: 'stripe indisponible' });
  }
}
