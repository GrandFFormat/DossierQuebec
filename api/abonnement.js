// L'abonnement facultatif, côté abonné : l'état, le paiement (Stripe Checkout) et la gestion (portail
// Stripe). Remis le 21 oct. 2026 : le texte et le suivi restent gratuits, l'abonnement vend des outils.
//
//   GET  /api/abonnement                     Authorization: Bearer <jeton Supabase> (facultatif)
//        → { ouvert, mode, peutPayer, abonne, source, fin, annulationPrevue, gerable, annulable, forfaits }
//   GET  /api/abonnement?action=flux         (abonné) → { adresse, ministeres } : l'adresse personnelle
//                                             signée des flux RSS (api/feed.js, api/_rss-abonnes.js) ;
//                                             le navigateur n'y ajoute que « &type=… », jamais un secret
//   POST /api/abonnement?action=paiement     (connecté, pas déjà abonné) { langue?, forfait? } → { url } de
//                                             Stripe Checkout ; forfait = « mensuel » (défaut),
//                                             « trimestriel » ou « annuel ».
//                                             Un abonnement impayé que Stripe relance encore : { url, portail }
//                                             du portail, pour changer de carte — jamais un second abonnement.
//   POST /api/abonnement?action=portail      (abonné par Stripe) → { url } du portail client Stripe
//                                             (carte, factures, annulation)
//   POST /api/abonnement?action=annuler      (abonné par Stripe) → { url } du portail, ouvert directement
//                                             sur l'annulation : le bouton « Annuler mon abonnement » que
//                                             la loi exige pour un abonnement conclu en ligne (Loi 10,
//                                             en vigueur le 12 sept. 2026)
//   POST /api/abonnement?action=cadeau       (connecté) { duree, langue? } → { url } de Stripe Checkout, un
//                                             paiement UNIQUE ; duree = « mensuel », « trimestriel » ou
//                                             « annuel ». Le code part par courriel à l'acheteur une fois
//                                             le paiement reçu (webhook, api/_cadeau.js).
//   POST /api/abonnement?action=offrir       (connecté) { forfait, langue? } → { url } de Stripe Checkout :
//                                             un abonnement RÉCURRENT payé par le donateur pour quelqu'un
//                                             d'autre (21 oct. 2026), aux mêmes prix STRIPE_PRIX_*. Le code
//                                             part par courriel au donateur (webhook, api/_offert.js).
//   GET  /api/abonnement?action=codes        (connecté) → { codes: [{ code, mois, achete, utilise }],
//                                             offerts: [{ code, forfait, actif, fin, annulationPrevue, utilise }] }
//   POST /api/abonnement?action=code         (connecté) { code } → { ok, mois, fin } ou { ok:false, raison } :
//                                             faire valoir un code cadeau OU d'abonnement offert (10 essais
//                                             par heure par compte ; tout se joue dans echanger_code_cadeau)
//   POST /api/abonnement?action=portail|annuler  { offert: code } → le portail Stripe du donateur, ouvert
//                                             sur CET abonnement offert (annuler : directement sur l'annulation)
//
// Le paiement n'est offert qu'avec STRIPE_OUVERT=1 ET des clés du mode réel, ou aux adresses de
// STRIPE_ESSAI (voir _stripe.js). L'accès n'est jamais donné ici : seul le webhook
// (api/stripe-webhook.js) écrit l'abonnement, une fois le paiement confirmé par Stripe.

import { site } from './_alertes.js';
import { codesDe, DUREES, echangerCode, nomProduit } from './_cadeau.js';
import { offertDuDonateur, offertsDe } from './_offert.js';
import { adresseFlux, ministeres } from './_rss-abonnes.js';
import { adresseEssai, estActive, FORFAITS, ligneAbonnement, modeStripe, paiementOuvert, prixConforme, prixDe, stripe, stripeConfigure, synchroniser, utilisateurDe } from './_stripe.js';

const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
// L'objet n'existe pas dans CE mode (une ligne écrite en mode essai, lue avec les clés réelles), ou plus du tout.
const absent = (e) => e?.code === 'resource_missing';
// La page où revenir après Stripe : toujours Mon dossier (/mes-dossiers y est fusionné depuis le
// 30 sept. 2026). L'adresse est fabriquée ici, jamais recopiée depuis le navigateur.
const retourDe = () => 'mon-dossier';
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

  if (req.method === 'GET' && req.query?.action === 'flux') {
    if (!u) return res.status(401).json({ erreur: 'connexion requise' });
    if (!abonne) return res.status(403).json({ erreur: 'réservé aux abonné·e·s' });
    const brut = await fetch(`${site()}/data/bills.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const deps = await fetch(`${site()}/data/site/deputesRaw.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const elus = (Array.isArray(deps) ? deps : []).map((d) => ({ cle: `${d[0]}|${d[1]}`, nom: `${d[0]} (${d[1]})` })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return res.status(200).json({ adresse: adresseFlux(u.id), ministeres: ministeres(brut?.bills ?? []), elus });
  }
  // Les codes cadeaux ne dépendent pas de Stripe : un code acheté reste utilisable même si le
  // paiement est fermé ou en panne.
  if (req.method === 'GET' && req.query?.action === 'codes') {
    if (!u) return res.status(401).json({ erreur: 'connexion requise' });
    try {
      // Les abonnements offerts à part : avant scripts/supabase-cadeau-recurrent.sql, la table
      // n'existe pas, et les codes cadeaux doivent quand même paraître.
      const offerts = await offertsDe(u.id).catch((e) => { console.error('abonnements offerts :', e.message); return []; });
      return res.status(200).json({ codes: await codesDe(u.id), offerts });
    } catch (e) {
      console.error('codes cadeaux :', e.message);
      return res.status(503).json({ erreur: 'codes illisibles' });
    }
  }
  if (req.method === 'POST' && req.query?.action === 'code') {
    if (!u) return res.status(401).json({ erreur: 'connexion requise' });
    let corps = req.body;
    if (typeof corps === 'string') { try { corps = JSON.parse(corps || '{}'); } catch { corps = {}; } }
    try {
      const r = await echangerCode(u.id, corps?.code);
      return res.status(r?.ok ? 200 : r?.raison === 'trop' ? 429 : 400).json(r ?? { ok: false, raison: 'inconnu' });
    } catch (e) {
      console.error('code cadeau :', e.message);
      return res.status(503).json({ ok: false, raison: 'panne' });
    }
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      ouvert: configure && paiementOuvert(),
      mode: configure ? modeStripe() : null,
      connecte: Boolean(u),
      peutPayer,
      // Offrir un abonnement (paiement unique) : mêmes protections, abonné ou non.
      peutOffrir: Boolean(configure && u?.email && (paiementOuvert() || adresseEssai(u.email))),
      abonne,
      source: ligne?.source ?? null,
      fin: abonne ? ligne.fin : null,
      annulationPrevue: Boolean(abonne && ligne.annulation_prevue),
      gerable,
      annulable: Boolean(gerable && abonne && ligne.stripe_subscription_id && !ligne.annulation_prevue),
      // Ce que la page peut offrir : un forfait seulement si son prix est configuré.
      forfaits: Object.fromEntries(Object.keys(FORFAITS).map((f) => [f, Boolean(configure && prixDe(f))])),
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
      const retour = retourDe();
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
        success_url: `${site()}/${retour}?abonnement=merci`,
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
    if (action === 'cadeau') {
      // Mêmes protections que l'abonnement (STRIPE_OUVERT avec des clés réelles, ou STRIPE_ESSAI),
      // mais un abonné peut offrir : on ne s'offre pas un cadeau à soi-même par erreur, on le donne.
      if (!(paiementOuvert() || adresseEssai(u.email))) return res.status(403).json({ erreur: "le paiement n'est pas encore ouvert" });
      if (!u.email) return res.status(400).json({ erreur: 'compte sans courriel' });
      let corps = req.body;
      if (typeof corps === 'string') { try { corps = JSON.parse(corps || '{}'); } catch { corps = {}; } }
      const anglais = String(corps?.langue ?? '') === 'en';
      const duree = String(corps?.duree ?? '');
      if (!Object.hasOwn(DUREES, duree)) return res.status(400).json({ erreur: 'durée inconnue' });
      const session = await stripe('/checkout/sessions', {
        // Un paiement UNIQUE : le cadeau ne se renouvelle pas sur la carte de l'acheteur. Le montant
        // est fixé ici, en CAD, jamais par le navigateur.
        mode: 'payment',
        'line_items[0][price_data][currency]': 'cad',
        'line_items[0][price_data][unit_amount]': String(DUREES[duree].montant),
        'line_items[0][price_data][product_data][name]': nomProduit(duree, anglais),
        'line_items[0][quantity]': '1',
        success_url: `${site()}/${retourDe()}?cadeau=merci`,
        cancel_url: `${site()}/abonnement?cadeau=annule#offrir`,
        client_reference_id: u.id,
        // Ce que le webhook relit pour fabriquer le code (api/_cadeau.js, livrerCadeau).
        'metadata[type]': 'cadeau',
        'metadata[duree]': duree,
        'metadata[user_id]': u.id,
        'metadata[langue]': anglais ? 'en' : 'fr',
        locale: anglais ? 'en' : 'fr-CA',
        customer: await clientStripe(u, ligne, anglais),
        billing_address_collection: 'required',
        'customer_update[address]': 'auto',
        'customer_update[name]': 'auto',
        'payment_method_types[0]': 'card',
        expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      });
      return res.status(200).json({ url: session.url });
    }
    if (action === 'offrir') {
      // Un abonnement RÉCURRENT au profit de quelqu'un d'autre. Mêmes protections et mêmes prix que
      // l'abonnement personnel ; un abonné peut offrir, et offrir plusieurs fois. Ni
      // client_reference_id ni metadata.user_id : rien ne doit pouvoir le rattacher à la ligne du
      // donateur. synchroniser le reconnaît à metadata.type = « offert » (api/_offert.js).
      if (!(paiementOuvert() || adresseEssai(u.email))) return res.status(403).json({ erreur: "le paiement n'est pas encore ouvert" });
      if (!u.email) return res.status(400).json({ erreur: 'compte sans courriel' });
      let corps = req.body;
      if (typeof corps === 'string') { try { corps = JSON.parse(corps || '{}'); } catch { corps = {}; } }
      const anglais = String(corps?.langue ?? '') === 'en';
      const forfait = String(corps?.forfait ?? '');
      if (!prixDe(forfait)) return res.status(400).json({ erreur: 'forfait indisponible' });
      if (!(await prixConforme(forfait))) return res.status(503).json({ erreur: 'prix mal configuré' });
      const session = await stripe('/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': prixDe(forfait),
        'line_items[0][quantity]': '1',
        success_url: `${site()}/${retourDe()}?offert=merci`,
        cancel_url: `${site()}/abonnement?offert=annule#offrir-abonnement`,
        'metadata[type]': 'offert',
        'metadata[donateur]': u.id,
        'metadata[forfait]': forfait,
        'subscription_data[metadata][type]': 'offert',
        'subscription_data[metadata][donateur]': u.id,
        'subscription_data[metadata][forfait]': forfait,
        'subscription_data[metadata][langue]': anglais ? 'en' : 'fr',
        locale: anglais ? 'en' : 'fr-CA',
        customer: await clientStripe(u, ligne?.source === 'stripe' ? ligne : null, anglais),
        billing_address_collection: 'required',
        'customer_update[address]': 'auto',
        'customer_update[name]': 'auto',
        'payment_method_types[0]': 'card',
        expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      });
      return res.status(200).json({ url: session.url });
    }
    let corps = req.body;
    if (typeof corps === 'string') { try { corps = JSON.parse(corps || '{}'); } catch { corps = {}; } }
    if ((action === 'portail' || action === 'annuler') && corps?.offert) {
      // Le portail du DONATEUR, pour un abonnement offert retrouvé par son code parmi les siens. Le
      // portail montre tous ses abonnements ; « annuler » ouvre directement l'annulation de celui-ci
      // (Loi 10 : un moyen clair d'annuler).
      const offert = await offertDuDonateur(u.id, corps?.offert);
      if (!offert?.stripe_customer_id) return res.status(404).json({ erreur: 'aucun abonnement offert' });
      const portail = await stripe('/billing_portal/sessions', {
        customer: offert.stripe_customer_id,
        return_url: `${site()}/${retourDe()}`,
        ...(action === 'annuler'
          ? {
            'flow_data[type]': 'subscription_cancel',
            'flow_data[subscription_cancel][subscription]': offert.stripe_subscription_id,
            'flow_data[after_completion][type]': 'redirect',
            'flow_data[after_completion][redirect][return_url]': `${site()}/${retourDe()}?offert=annulation`,
          }
          : {}),
      });
      return res.status(200).json({ url: portail.url });
    }
    if (action === 'portail' || action === 'annuler') {
      if (!gerable || (action === 'annuler' && !ligne.stripe_subscription_id)) return res.status(404).json({ erreur: 'aucun abonnement Stripe' });
      const portail = await stripe('/billing_portal/sessions', {
        customer: ligne.stripe_customer_id,
        return_url: `${site()}/${action === 'annuler' ? 'abonnement' : retourDe()}`,
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
