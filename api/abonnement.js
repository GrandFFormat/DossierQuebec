// L'abonnement payant, côté abonné : l'état, le paiement (Stripe Checkout) et la gestion (portail Stripe).
//
//   GET  /api/abonnement                     Authorization: Bearer <jeton Supabase> (facultatif)
//        → { ouvert, mode, peutPayer, abonne, source, fin, annulationPrevue, gerable, annulable, forfaits }
//   POST /api/abonnement?action=paiement     (connecté, pas déjà abonné) { langue?, forfait? } → { url } de
//                                             Stripe Checkout ; forfait = « mensuel » (défaut) ou « annuel ».
//                                             Un abonnement impayé que Stripe relance encore : { url, portail }
//                                             du portail, pour changer de carte — jamais un second abonnement.
//   POST /api/abonnement?action=portail      (abonné par Stripe) → { url } du portail client Stripe
//                                             (carte, factures, annulation)
//   POST /api/abonnement?action=annuler      (abonné par Stripe) → { url } du portail, ouvert directement
//                                             sur l'annulation : le bouton « Annuler mon abonnement » que
//                                             la loi exige pour un abonnement conclu en ligne (Loi 10,
//                                             en vigueur le 12 sept. 2026)
//
// Le paiement n'est offert qu'avec STRIPE_OUVERT=1 ET des clés du mode réel, ou aux adresses de
// STRIPE_ESSAI (voir _stripe.js). L'accès n'est jamais donné ici : seul le webhook
// (api/stripe-webhook.js) écrit l'abonnement, une fois le paiement confirmé par Stripe.

import { site } from './_alertes.js';
import { adresseEssai, estActive, ligneAbonnement, modeStripe, paiementOuvert, prixConforme, prixDe, stripe, stripeConfigure, synchroniser, utilisateurDe } from './_stripe.js';

const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
// L'objet n'existe pas dans CE mode (une ligne écrite en mode essai, lue avec les clés réelles), ou plus du tout.
const absent = (e) => e?.code === 'resource_missing';
const clientDe = (o) => (typeof o?.customer === 'string' ? o.customer : o?.customer?.id ?? null);

// L'abonnement Stripe de la ligne, s'il vit encore chez Stripe. On ne vend jamais par-dessus : un
// impayé que Stripe relance encore deviendrait un double débit le jour où la relance passe.
async function abonnementVivant(ligne) {
  if (!ligne?.stripe_subscription_id) return null;
  try {
    const s = await stripe(`/subscriptions/${encodeURIComponent(ligne.stripe_subscription_id)}`);
    return ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status) ? s : null;
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
}

// Un seul client Stripe par compte : celui de la ligne s'il existe dans ce mode, sinon celui que Stripe
// connaît déjà sous cette adresse (elle est vérifiée par le lien de connexion), sinon un nouveau. Avec
// « customer_email », deux paiements ouverts à quelques heures d'écart créaient deux clients, et le
// portail n'en montrait qu'un : l'autre abonnement débitait sans que l'abonné puisse le voir.
async function clientStripe(u, ligne, anglais) {
  if (ligne?.stripe_customer_id) {
    try {
      const c = await stripe(`/customers/${encodeURIComponent(ligne.stripe_customer_id)}`);
      if (!c.deleted) return c.id;
    } catch (e) {
      if (!absent(e)) throw e;
    }
  }
  const connus = await stripe(`/customers?email=${encodeURIComponent(u.email)}&limit=1`);
  if (connus.data?.[0]?.id) return connus.data[0].id;
  return (await stripe('/customers', { email: u.email, 'metadata[user_id]': u.id, 'preferred_locales[0]': anglais ? 'en' : 'fr-CA' })).id;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const configure = stripeConfigure();
  const u = await utilisateurDe(jetonDe(req));
  // « Pas de ligne » n'est pas « lecture échouée » : pendant une panne de Supabase, un abonné payant ne
  // doit pas se voir offrir de repayer.
  let ligne = null;
  let illisible = false;
  if (u) {
    try {
      ligne = await ligneAbonnement(u.id);
    } catch {
      illisible = true;
    }
  }
  const abonne = estActive(ligne);
  const peutPayer = Boolean(configure && u && !illisible && !abonne && (paiementOuvert() || adresseEssai(u.email)));
  const gerable = Boolean(configure && ligne?.source === 'stripe' && ligne.stripe_customer_id);

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
      gerable,
      annulable: Boolean(gerable && abonne && ligne.stripe_subscription_id && !ligne.annulation_prevue),
      // Ce que la page peut offrir : l'annuel seulement si son prix est configuré.
      forfaits: { mensuel: configure, annuel: Boolean(configure && prixDe('annuel')) },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non permise' });
  if (!configure) return res.status(503).json({ erreur: 'paiement pas encore branché' });
  if (!u) return res.status(401).json({ erreur: 'connexion requise' });
  if (illisible) return res.status(503).json({ erreur: 'abonnement non vérifiable' });

  const action = String(req.query?.action ?? '');
  try {
    if (action === 'paiement') {
      if (abonne) return res.status(409).json({ erreur: 'déjà abonné' });
      if (!peutPayer) return res.status(403).json({ erreur: "l'abonnement n'est pas encore ouvert" });
      if (!u.email) return res.status(400).json({ erreur: 'compte sans courriel' });
      let corps = req.body;
      if (typeof corps === 'string') { try { corps = JSON.parse(corps || '{}'); } catch { corps = {}; } }
      const anglais = String(corps?.langue ?? '') === 'en';
      const forfait = String(corps?.forfait ?? 'mensuel');
      if (!prixDe(forfait)) return res.status(400).json({ erreur: 'forfait indisponible' });
      if (!(await prixConforme(forfait))) return res.status(503).json({ erreur: 'prix mal configuré' });

      const vivant = await abonnementVivant(ligne);
      if (vivant && ['active', 'trialing'].includes(vivant.status)) {
        // Payé chez Stripe, mais la ligne ne le dit pas (un webhook perdu) : on répare au lieu de revendre.
        await synchroniser(vivant.id, u.id);
        return res.status(409).json({ erreur: 'déjà abonné' });
      }
      if (vivant) {
        const portail = await stripe('/billing_portal/sessions', { customer: clientDe(vivant), return_url: `${site()}/abonnement` });
        return res.status(200).json({ url: portail.url, portail: true });
      }

      const session = await stripe('/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': prixDe(forfait),
        'line_items[0][quantity]': '1',
        success_url: `${site()}/mes-dossiers?abonnement=merci`,
        cancel_url: `${site()}/abonnement?abonnement=annule`,
        client_reference_id: u.id,
        'metadata[user_id]': u.id,
        'subscription_data[metadata][user_id]': u.id,
        'subscription_data[metadata][forfait]': forfait,
        locale: anglais ? 'en' : 'fr-CA',
        customer: await clientStripe(u, ligne, anglais),
        // Le contrat à distance doit porter le nom et l'adresse du consommateur (LPC) : Stripe les
        // demande, et les range sur le client.
        billing_address_collection: 'required',
        'customer_update[address]': 'auto',
        'customer_update[name]': 'auto',
        // Payé d'avance : par carte seulement, ce qui garde au consommateur la rétrofacturation.
        'payment_method_types[0]': 'card',
        // Une session abandonnée ne reste pas payable 24 heures (le minimum de Stripe est 30 minutes).
        expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      });
      return res.status(200).json({ url: session.url });
    }
    if (action === 'portail' || action === 'annuler') {
      if (!gerable || (action === 'annuler' && !ligne.stripe_subscription_id)) return res.status(404).json({ erreur: 'aucun abonnement Stripe' });
      const portail = await stripe('/billing_portal/sessions', {
        customer: ligne.stripe_customer_id,
        return_url: `${site()}/${action === 'annuler' ? 'abonnement' : 'mes-dossiers'}`,
        ...(action === 'annuler'
          ? {
            'flow_data[type]': 'subscription_cancel',
            'flow_data[subscription_cancel][subscription]': ligne.stripe_subscription_id,
            'flow_data[after_completion][type]': 'redirect',
            'flow_data[after_completion][redirect][return_url]': `${site()}/abonnement?abonnement=annulation`,
          }
          : {}),
      });
      return res.status(200).json({ url: portail.url });
    }
    return res.status(400).json({ erreur: 'action inconnue' });
  } catch (e) {
    // Une ligne du mode essai lue avec les clés réelles : le client n'existe pas de ce côté-là.
    if (absent(e) && action !== 'paiement') return res.status(404).json({ erreur: 'aucun abonnement Stripe' });
    console.error('abonnement :', action, e.message);
    return res.status(502).json({ erreur: 'Stripe indisponible' });
  }
}
