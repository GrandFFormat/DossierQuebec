// Partagé par api/abonnement.js et api/stripe-webhook.js (le « _ » : Vercel n'en fait pas une route).
//
// Stripe sans bibliothèque : l'API est du formulaire HTTP, et la signature des webhooks un HMAC.
// Stripe est la source de vérité ; la table `abonnements` en est la copie que lisent api/detail.js,
// api/alertes-projets.js, api/message.js et Mes dossiers (statut 'actif' et fin dans le futur).
//
// Variables Vercel :
//   STRIPE_SECRET_KEY      sk_test_… en essai, sk_live_… en réel
//   STRIPE_WEBHOOK_SECRET  whsec_… du point de terminaison https://dossierquebec.ca/api/stripe-webhook
//   STRIPE_PRIX            price_… du forfait mensuel (10 $ CA par mois, récurrent)
//   STRIPE_PRIX_ANNUEL     price_… du forfait annuel (80 $ CA par an, récurrent) — facultatif : sans
//                          lui, seul le mensuel est offert
//   STRIPE_OUVERT          « 1 » : le paiement est offert à tout le monde. Sinon, seulement aux
//                          adresses de STRIPE_ESSAI (séparées par des virgules) — pour essayer en
//                          production sans ouvrir l'abonnement.

import crypto from 'node:crypto';
import { supabase } from './_alertes.js';

export const stripeConfigure = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRIX && process.env.STRIPE_WEBHOOK_SECRET);
export const modeStripe = () => (/^[sr]k_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') ? 'reel' : 'test');
// STRIPE_OUVERT ne vaut qu'avec une clé du mode RÉEL. Posé par-dessus des clés d'essai — le geste
// littéral de « débarrer » — il donnerait l'accès payant à n'importe qui contre la carte 4242, que la
// page affiche elle-même en mode essai.
export const paiementOuvert = () => process.env.STRIPE_OUVERT === '1' && modeStripe() === 'reel';
// Comparées sans majuscules, guillemets ni « +étiquette » : « moi+essai@gmail.com » vaut pour
// « moi@gmail.com » et inversement (la même boîte, donc la même personne).
const adresseSimple = (a) => String(a ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/\+[^@]*@/, '@');
export const adresseEssai = (email) =>
  Boolean(email) && (process.env.STRIPE_ESSAI ?? '').split(/[,;\s]+/).map(adresseSimple).filter(Boolean).includes(adresseSimple(email));

export async function stripe(chemin, parametres) {
  const res = await fetch(`https://api.stripe.com/v1${chemin}`, {
    method: parametres ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(parametres ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: parametres ? new URLSearchParams(parametres).toString() : undefined,
  });
  const donnees = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error(`Stripe ${chemin.split('?')[0]} → ${res.status} ${donnees?.error?.message ?? ''}`);
    e.code = donnees?.error?.code ?? null; // « resource_missing » : l'objet n'existe pas dans ce mode (essai ou réel)
    throw e;
  }
  return donnees;
}

// Les forfaits (Martin, 18 sept. 2026 : 10 $ par mois ou 80 $ par an). Le navigateur n'envoie que
// « mensuel » ou « annuel » : l'identifiant du prix Stripe ne vient jamais de lui.
export const FORFAITS = {
  mensuel: { variable: 'STRIPE_PRIX', montant: 1000, intervalle: 'month' },
  annuel: { variable: 'STRIPE_PRIX_ANNUEL', montant: 8000, intervalle: 'year' },
};
export const prixDe = (forfait) => (Object.hasOwn(FORFAITS, forfait) ? process.env[FORFAITS[forfait].variable] || null : null);

// Avant d'envoyer quelqu'un payer : le prix configuré dans Vercel vaut-il ce que la page annonce ?
// Un vieux price_… oublié (l'ancien 3 $) vendrait au mauvais montant. Un prix conforme le reste
// (Stripe ne permet pas d'en changer le montant) : on ne le redemande pas à chaque paiement.
const conformes = new Set();
export async function prixConforme(forfait) {
  const id = prixDe(forfait);
  if (!id) return false;
  if (conformes.has(id)) return true;
  const p = await stripe(`/prices/${encodeURIComponent(id)}`);
  const { montant, intervalle } = FORFAITS[forfait];
  const ok = Boolean(p.active && p.currency === 'cad' && p.unit_amount === montant && p.recurring?.interval === intervalle && (p.recurring?.interval_count ?? 1) === 1);
  if (ok) conformes.add(id);
  else console.error(`Stripe : le prix du forfait ${forfait} (${FORFAITS[forfait].variable}) ne vaut pas ${montant / 100} $ CA par ${intervalle} — paiement refusé.`);
  return ok;
}

// Stripe-Signature: t=<horodatage>,v1=<hmac>[,v1=…] ; HMAC-SHA256 de « t.corps brut ». Cinq minutes
// de tolérance, comme la bibliothèque officielle.
export function signatureStripeValide(brut, entete, maintenant = Date.now()) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !entete) return false;
  const parties = entete.split(',').map((p) => p.trim().split('='));
  const t = parties.find(([k]) => k === 't')?.[1];
  const signatures = parties.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!/^\d+$/.test(t ?? '') || !signatures.length || Math.abs(maintenant / 1000 - Number(t)) > 300) return false;
  const attendu = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${brut}`).digest('hex'));
  return signatures.some((v) => {
    const recu = Buffer.from(v);
    return recu.length === attendu.length && crypto.timingSafeEqual(recu, attendu);
  });
}

// Le compte derrière un jeton de session Supabase : { id, email } ou null.
export async function utilisateurDe(jeton) {
  if (!jeton) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jeton}` },
  }).catch(() => null);
  const u = res?.ok ? await res.json() : null;
  return u?.id && /^[0-9a-f-]{36}$/.test(u.id) ? { id: u.id, email: u.email ?? '' } : null;
}

// select=* : la page marche aussi avant que les colonnes Stripe existent (scripts/supabase-schema-stripe.sql).
export async function ligneAbonnement(userId) {
  const [ligne] = (await supabase(`/rest/v1/abonnements?user_id=eq.${userId}&select=*`)) ?? [];
  return ligne ?? null;
}

export const estActive = (l) => Boolean(l && l.statut === 'actif' && (!l.fin || new Date(l.fin) > new Date()));

const GRACE = 2 * 24 * 3600; // un renouvellement dont le webhook tarde ne coupe pas l'accès
const JOURS_IMPAYE = 3 * 24 * 3600; // carte refusée : Stripe réessaie, l'accès tient trois jours

// Recopie un abonnement Stripe dans la table. Relit toujours l'abonnement chez Stripe plutôt que de
// se fier à l'événement : l'ordre d'arrivée des webhooks n'importe plus, et rejouer un événement ne
// change rien.
export async function synchroniser(abonnementId, indiceUtilisateur) {
  const sub = await stripe(`/subscriptions/${encodeURIComponent(abonnementId)}`);
  const userId = sub.metadata?.user_id || indiceUtilisateur;
  if (!/^[0-9a-f-]{36}$/.test(userId ?? '')) {
    console.warn('Stripe : abonnement sans user_id, ignoré', sub.id);
    return 'sans-compte';
  }
  const existant = await ligneAbonnement(userId);
  // Un abonnement donné à la main (Martin, un abonnement offert) : Stripe n'y touche jamais.
  if (existant?.source === 'manuel' && estActive(existant)) {
    console.warn('Stripe : abonnement manuel actif, laissé tel quel', userId);
    return 'manuel';
  }
  const actif = ['active', 'trialing', 'past_due'].includes(sub.status);
  // Un vieil abonnement annulé ne remplace pas celui, actif, qui l'a suivi.
  if (!actif && existant?.stripe_subscription_id && existant.stripe_subscription_id !== sub.id && estActive(existant)) return 'autre';
  // Deux abonnements vivants pour un même compte (deux paiements menés en parallèle) : la ligne n'en
  // retient qu'un. On garde le premier et on le crie dans les journaux, pour que Martin annule et
  // rembourse l'autre — sinon il débiterait sans que l'abonné puisse le voir.
  if (actif && existant?.stripe_subscription_id && existant.stripe_subscription_id !== sub.id && estActive(existant)) {
    const premier = await stripe(`/subscriptions/${encodeURIComponent(existant.stripe_subscription_id)}`).catch(() => null);
    if (premier && ['active', 'trialing', 'past_due'].includes(premier.status)) {
      console.error('DOUBLE ABONNEMENT', userId, '— gardé :', premier.id, '— à annuler et rembourser dans Stripe :', sub.id);
      return 'double';
    }
  }

  const item = sub.items?.data?.[0] ?? {};
  const debut = sub.current_period_start ?? item.current_period_start;
  const finPeriode = sub.current_period_end ?? item.current_period_end;
  const annulationPrevue = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  let fin;
  if (!actif) fin = (sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000;
  else if (sub.status === 'past_due') {
    // La grâce ne se renouvelle pas : si Stripe laisse l'abonnement impayé d'une période à l'autre,
    // un accès déjà expiré le reste (sinon, trois jours gratuits reviendraient chaque mois).
    const grace = ((debut ?? Math.floor(Date.now() / 1000)) + JOURS_IMPAYE) * 1000;
    const avant = existant?.stripe_subscription_id === sub.id && existant?.fin ? new Date(existant.fin).getTime() : null;
    fin = avant != null && Number.isFinite(avant) ? Math.min(grace, avant) : grace;
  }
  else if (finPeriode) fin = (annulationPrevue ? (sub.cancel_at ?? finPeriode) : finPeriode + GRACE) * 1000;
  else fin = null;

  let orphelin = false;
  await supabase('/rest/v1/abonnements?on_conflict=user_id', {
    methode: 'POST',
    entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    corps: {
      user_id: userId,
      statut: actif ? 'actif' : 'annule',
      source: 'stripe',
      fin: fin ? new Date(fin).toISOString() : null,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      annulation_prevue: annulationPrevue,
      updated_at: new Date().toISOString(),
    },
  }).catch((e) => {
    if (!/\b23503\b/.test(e.message)) throw e;
    orphelin = true;
  });
  // Le compte a été supprimé (sa ligne avec lui, en cascade) mais Stripe débite encore. Répondre 500
  // ferait réessayer Stripe trois jours pour rien : on le crie, et on répond que c'est reçu.
  if (orphelin) {
    console.error('ABONNEMENT SANS COMPTE (compte supprimé) — à annuler dans Stripe :', sub.id, userId);
    return 'sans-compte';
  }
  return actif ? 'actif' : 'annule';
}
