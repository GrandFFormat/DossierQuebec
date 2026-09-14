// Partagé par api/abonnement.js et api/stripe-webhook.js (le « _ » : Vercel n'en fait pas une route).
//
// Stripe sans bibliothèque : l'API est du formulaire HTTP, et la signature des webhooks un HMAC.
// Stripe est la source de vérité ; la table `abonnements` en est la copie que lisent api/detail.js,
// api/alertes-projets.js, api/message.js et Mes dossiers (statut 'actif' et fin dans le futur).
//
// Variables Vercel :
//   STRIPE_SECRET_KEY      sk_test_… en essai, sk_live_… en réel
//   STRIPE_WEBHOOK_SECRET  whsec_… du point de terminaison https://dossierquebec.ca/api/stripe-webhook
//   STRIPE_PRIX            price_… (3 $ CA par mois, récurrent)
//   STRIPE_OUVERT          « 1 » : le paiement est offert à tout le monde. Sinon, seulement aux
//                          adresses de STRIPE_ESSAI (séparées par des virgules) — pour essayer en
//                          production sans ouvrir l'abonnement.

import crypto from 'node:crypto';
import { supabase } from './_alertes.js';

export const stripeConfigure = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRIX && process.env.STRIPE_WEBHOOK_SECRET);
export const modeStripe = () => (/^[sr]k_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') ? 'reel' : 'test');
export const paiementOuvert = () => process.env.STRIPE_OUVERT === '1';
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
  if (!res.ok) throw new Error(`Stripe ${chemin.split('?')[0]} → ${res.status} ${donnees?.error?.message ?? ''}`);
  return donnees;
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

  const item = sub.items?.data?.[0] ?? {};
  const debut = sub.current_period_start ?? item.current_period_start;
  const finPeriode = sub.current_period_end ?? item.current_period_end;
  const annulationPrevue = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  let fin;
  if (!actif) fin = (sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000;
  else if (sub.status === 'past_due') fin = ((debut ?? Math.floor(Date.now() / 1000)) + JOURS_IMPAYE) * 1000;
  else if (finPeriode) fin = (annulationPrevue ? (sub.cancel_at ?? finPeriode) : finPeriode + GRACE) * 1000;
  else fin = null;

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
  });
  return actif ? 'actif' : 'annule';
}
