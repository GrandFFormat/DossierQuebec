// Essai hors ligne des abonnements RÉCURRENTS offerts (api/_offert.js, api/abonnement.js,
// api/_stripe.js, api/stripe-webhook.js), sur des données SIMULÉES : fetch est remplacé, rien ne
// part vers Stripe, Supabase ni Resend. La fonction SQL echanger_code_cadeau est imitée ici
// (scripts/supabase-cadeau-recurrent.sql en est la vraie) : l'essai vérifie le branchement, pas Postgres.
//
//   node scripts/test-cadeau-recurrent.js

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.PUBLIC_SITE_URL = 'https://site.simule';
process.env.STRIPE_SECRET_KEY = 'sk_live_simule';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_simule';
process.env.STRIPE_PRIX_MENSUEL = 'price_mensuel';
process.env.STRIPE_PRIX_ANNUEL = 'price_annuel';
process.env.STRIPE_OUVERT = '1';

const DONATEUR = '11111111-1111-1111-1111-111111111111';
const AMIE = '22222222-2222-2222-2222-222222222222';
const STRIPEUR = '33333333-3333-3333-3333-333333333333';
const AUTRE = '44444444-4444-4444-4444-444444444444';
const comptes = {
  'jeton-d': { id: DONATEUR, email: 'd@exemple.test' },
  'jeton-a': { id: AMIE, email: 'a@exemple.test' },
  'jeton-s': { id: STRIPEUR, email: 's@exemple.test' },
  'jeton-o': { id: AUTRE, email: 'o@exemple.test' },
};
const maintenant = () => Math.floor(Date.now() / 1000);
const MOIS = 30 * 864e2;

// Le donateur est lui-même abonné par Stripe : sa ligne ne doit jamais bouger.
const finDonateur = new Date(Date.now() + 20 * 864e5).toISOString();
const abonnements = {
  [DONATEUR]: { user_id: DONATEUR, statut: 'actif', source: 'stripe', fin: finDonateur, stripe_customer_id: 'cus_d', stripe_subscription_id: 'sub_perso', annulation_prevue: false },
  [STRIPEUR]: { user_id: STRIPEUR, statut: 'actif', source: 'stripe', fin: new Date(Date.now() + 9e8).toISOString(), stripe_customer_id: 'cus_s', stripe_subscription_id: 'sub_s' },
};
const ligneDonateurAvant = JSON.stringify(abonnements[DONATEUR]);
const offerts = [];
const codesCadeaux = [];
const essais = [];
const courriels = [];
const sessionsStripe = [];
const portails = [];
const subs = {
  sub_perso: { id: 'sub_perso', object: 'subscription', status: 'active', customer: 'cus_d', metadata: { user_id: DONATEUR }, current_period_start: maintenant(), current_period_end: maintenant() + MOIS, items: { data: [{ price: { id: 'price_mensuel' } }] } },
};

const json = (d, status = 200) => new Response(d == null || status === 204 ? '' : JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const actifLigne = (a) => a && a.statut === 'actif' && (!a.fin || new Date(a.fin) > new Date());

// L'imitation de echanger_code_cadeau (scripts/supabase-cadeau-recurrent.sql).
function echanger(user, brut) {
  if (essais.filter((e) => e.user === user && e.le > Date.now() - 3600e3).length >= 10) return { ok: false, raison: 'trop' };
  essais.push({ user, le: Date.now() });
  const code = String(brut).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const a = abonnements[user];
  const o = offerts.find((x) => x.code === code);
  if (o) {
    if (o.beneficiaire) return { ok: false, raison: 'utilise' };
    if (o.donateur === user) return { ok: false, raison: 'soi_meme' };
    if (o.statut !== 'actif' || (o.fin && new Date(o.fin) <= new Date())) return { ok: false, raison: 'termine' };
    if (actifLigne(a)) return { ok: false, raison: a.source === 'stripe' ? 'stripe' : 'deja_abonne' };
    abonnements[user] = { user_id: user, statut: 'actif', source: 'offert', fin: o.fin, stripe_customer_id: null, stripe_subscription_id: o.stripe_subscription_id, annulation_prevue: o.annulation_prevue };
    o.beneficiaire = user; o.utilise_le = new Date().toISOString();
    return { ok: true, offert: true, forfait: o.forfait, fin: o.fin };
  }
  if (actifLigne(a) && a.source === 'offert') return { ok: false, raison: 'offert' };
  return { ok: false, raison: 'inconnu' };
}

// Les filtres PostgREST « col=eq.val » d'une adresse.
const filtres = (u) => [...u.searchParams].filter(([k, v]) => !['select', 'order', 'on_conflict'].includes(k) && v.startsWith('eq.')).map(([k, v]) => [k, decodeURIComponent(v.slice(3))]);
const correspond = (l, f) => f.every(([k, v]) => String(l[k]) === v);

globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url);
  const methode = o.method ?? 'GET';
  const corps = o.body ? (String(o.headers?.['Content-Type'] ?? '').includes('json') ? JSON.parse(o.body) : Object.fromEntries(new URLSearchParams(o.body))) : null;
  if (u.host === 'supabase.simule') {
    if (u.pathname === '/auth/v1/user') {
      const c = comptes[String(o.headers.Authorization).replace('Bearer ', '')];
      return c ? json(c) : json({}, 401);
    }
    const f = filtres(u);
    if (u.pathname === '/rest/v1/abonnements') {
      if (methode === 'PATCH') { for (const l of Object.values(abonnements)) if (correspond(l, f)) Object.assign(l, corps); return new Response(null, { status: 204 }); }
      if (methode === 'POST') { abonnements[corps.user_id] = { ...abonnements[corps.user_id], ...corps }; return new Response(null, { status: 201 }); }
      return json(Object.values(abonnements).filter((l) => correspond(l, f)));
    }
    if (u.pathname === '/rest/v1/rpc/echanger_code_cadeau') return json(echanger(corps.p_user, corps.p_code));
    if (u.pathname === '/rest/v1/codes_cadeaux') return json(codesCadeaux.filter((l) => correspond(l, f)));
    if (u.pathname === '/rest/v1/abonnements_offerts') {
      if (methode === 'POST') {
        for (const l of corps) if (!offerts.some((x) => x.stripe_subscription_id === l.stripe_subscription_id)) offerts.push({ fin: null, annulation_prevue: false, beneficiaire: null, utilise_le: null, courriel_envoye_le: null, cree_le: new Date().toISOString(), ...l });
        return new Response(null, { status: 201 });
      }
      if (methode === 'PATCH') { for (const l of offerts) if (correspond(l, f)) Object.assign(l, corps); return new Response(null, { status: 204 }); }
      return json(offerts.filter((l) => correspond(l, f)));
    }
  }
  if (u.host === 'api.resend.com') { courriels.push(JSON.parse(o.body)); return json({ id: 'courriel' }); }
  if (u.host === 'api.stripe.com') {
    const p = u.pathname;
    if (p.startsWith('/v1/prices/')) return json({ id: p.slice(11), active: true, currency: 'cad', unit_amount: p.endsWith('annuel') ? 9900 : 999, recurring: { interval: p.endsWith('annuel') ? 'year' : 'month', interval_count: 1 } });
    if (p.startsWith('/v1/subscriptions/')) { const s = subs[decodeURIComponent(p.slice(18))]; return s ? json(s) : json({ error: { code: 'resource_missing' } }, 404); }
    if (p === '/v1/customers/cus_d') return json({ id: 'cus_d', email: 'd@exemple.test' });
    if (p.startsWith('/v1/customers/')) return json({ id: p.slice(14), email: 'x@exemple.test' });
    if (p === '/v1/customers' && methode !== 'POST') return json({ data: [{ id: 'cus_d' }] });
    if (p === '/v1/checkout/sessions') { sessionsStripe.push(corps); return json({ id: 'cs_o', url: 'https://checkout.simule/cs_o' }); }
    if (p === '/v1/billing_portal/sessions') { portails.push(corps); return json({ url: 'https://portail.simule' }); }
  }
  throw new Error(`fetch inattendu : ${methode} ${url}`);
};

const { default: abonnement } = await import('../api/abonnement.js');
const { POST: webhook } = await import('../api/stripe-webhook.js');
const { codeAffiche } = await import('../api/_cadeau.js');

async function appel(methode, action, jeton, corps) {
  let statut, donnees;
  const res = { setHeader() {}, status(s) { statut = s; return this; }, json(d) { donnees = d; return this; } };
  await abonnement({ method: methode, query: { action }, headers: jeton ? { authorization: `Bearer ${jeton}` } : {}, body: corps }, res);
  return { statut, donnees };
}
async function evenement(type, objet) {
  const brut = JSON.stringify({ type, data: { object: objet } });
  const t = maintenant();
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${brut}`).digest('hex');
  const r = await webhook(new Request('https://site.simule/api/stripe-webhook', { method: 'POST', body: brut, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const ligneDonateurIntacte = () => assert.equal(JSON.stringify(abonnements[DONATEUR]), ligneDonateurAvant, 'la ligne du donateur a bougé');

// 1. Achat : non connecté refusé ; forfait inconnu refusé ; mode abonnement, prix configuré, marqué « offert ».
assert.equal((await appel('POST', 'offrir', null, { forfait: 'mensuel' })).statut, 401);
assert.equal((await appel('POST', 'offrir', 'jeton-d', { forfait: 'a-vie' })).statut, 400);
assert.equal((await appel('POST', 'offrir', 'jeton-d', { forfait: 'trimestriel' })).statut, 400); // prix non configuré
const achat = await appel('POST', 'offrir', 'jeton-d', { forfait: 'mensuel', langue: 'fr' });
assert.equal(achat.statut, 200, JSON.stringify(achat.donnees));
assert.equal(achat.donnees.url, 'https://checkout.simule/cs_o');
const s = sessionsStripe.at(-1);
assert.equal(s.mode, 'subscription');
assert.equal(s['line_items[0][price]'], 'price_mensuel');
assert.equal(s['metadata[type]'], 'offert');
assert.equal(s['subscription_data[metadata][type]'], 'offert');
assert.equal(s['subscription_data[metadata][donateur]'], DONATEUR);
assert.equal(s['subscription_data[metadata][forfait]'], 'mensuel');
assert.equal(s.client_reference_id, undefined);
assert.equal(s['subscription_data[metadata][user_id]'], undefined);
// Le donateur abonné peut quand même offrir (plusieurs fois).
assert.equal((await appel('POST', 'offrir', 'jeton-d', { forfait: 'annuel' })).statut, 200);
process.env.STRIPE_OUVERT = '0';
assert.equal((await appel('POST', 'offrir', 'jeton-d', { forfait: 'mensuel' })).statut, 403);
process.env.STRIPE_OUVERT = '1';

// 2. Paiement confirmé : l'abonnement Stripe existe, le webhook crée UN code et l'envoie au donateur.
const debut = maintenant();
subs.sub_o = { id: 'sub_o', object: 'subscription', status: 'active', customer: 'cus_d', metadata: { type: 'offert', donateur: DONATEUR, forfait: 'mensuel', langue: 'fr' }, current_period_start: debut, current_period_end: debut + MOIS, items: { data: [{ price: { id: 'price_mensuel' } }] } };
const session = { id: 'cs_o', object: 'checkout.session', mode: 'subscription', subscription: 'sub_o', metadata: { type: 'offert', donateur: DONATEUR, forfait: 'mensuel' } };
let r = await evenement('checkout.session.completed', session);
assert.equal(r.status, 200);
assert.equal(r.resultat, 'offert-actif');
assert.equal(offerts.length, 1);
assert.match(offerts[0].code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/);
assert.equal(offerts[0].donateur, DONATEUR);
assert.equal(offerts[0].stripe_customer_id, 'cus_d');
assert.equal(courriels.length, 1);
assert.deepEqual(courriels[0].to, ['d@exemple.test']);
assert.ok(courriels[0].html.includes(codeAffiche(offerts[0].code)));
assert.ok(courriels[0].html.includes('Donnez ce code à la personne que vous abonnez'));
assert.ok(courriels[0].html.includes('Mettez votre code ici'));
assert.ok(courriels[0].html.includes('Vous payez tant que vous n’annulez pas'));
ligneDonateurIntacte();

// 3. Webhooks rejoués (et dans le désordre) : un seul code, un seul courriel.
r = await evenement('customer.subscription.created', subs.sub_o);
r = await evenement('invoice.paid', { object: 'invoice', subscription: 'sub_o' });
r = await evenement('checkout.session.completed', session);
assert.equal(offerts.length, 1);
assert.equal(courriels.length, 1);
ligneDonateurIntacte();

// Un abonnement offert à un prix inconnu ne crée rien.
subs.sub_faux = { ...subs.sub_o, id: 'sub_faux', items: { data: [{ price: { id: 'price_ailleurs' } }] } };
r = await evenement('customer.subscription.created', subs.sub_faux);
assert.equal(r.resultat, 'offert-prix');
assert.equal(offerts.length, 1);

// Le donateur voit son abonnement offert dans Mon dossier ; les autres non.
let liste = await appel('GET', 'codes', 'jeton-d');
assert.equal(liste.donnees.offerts.length, 1);
assert.equal(liste.donnees.offerts[0].forfait, 'mensuel');
assert.equal(liste.donnees.offerts[0].utilise, false);
assert.equal(liste.donnees.offerts[0].actif, true);
assert.equal((await appel('GET', 'codes', 'jeton-a')).donnees.offerts.length, 0);

// 4. Le donateur ne peut pas utiliser son propre code ; un compte qui paie déjà par carte non plus.
const code = codeAffiche(offerts[0].code).toLowerCase();
let u = await appel('POST', 'code', 'jeton-d', { code });
assert.equal(u.donnees.raison, 'soi_meme');
u = await appel('POST', 'code', 'jeton-s', { code });
assert.equal(u.donnees.raison, 'stripe');
assert.equal(offerts[0].beneficiaire, null);
assert.equal(abonnements[STRIPEUR].source, 'stripe');

// 5. Le code utilisé : la destinataire est abonnée, source 'offert', liée à l'abonnement du donateur.
u = await appel('POST', 'code', 'jeton-a', { code });
assert.equal(u.statut, 200);
assert.equal(u.donnees.ok, true);
assert.equal(u.donnees.offert, true);
assert.equal(abonnements[AMIE].source, 'offert');
assert.equal(abonnements[AMIE].stripe_subscription_id, 'sub_o');
assert.equal(abonnements[AMIE].stripe_customer_id, null);
let etat = (await appel('GET', undefined, 'jeton-a')).donnees;
assert.equal(etat.abonne, true);
assert.equal(etat.source, 'offert');
assert.equal(etat.gerable, false); // pas de portail pour la destinataire
assert.equal((await appel('POST', 'portail', 'jeton-a', {})).statut, 404);
assert.equal((await appel('GET', 'codes', 'jeton-d')).donnees.offerts[0].utilise, true);
ligneDonateurIntacte();

// 6. Code réutilisé, code faux : refus.
assert.equal((await appel('POST', 'code', 'jeton-o', { code })).donnees.raison, 'utilise');
assert.equal((await appel('POST', 'code', 'jeton-o', { code: 'ZZZZ-ZZZZ-ZZZZ' })).donnees.raison, 'inconnu');

// 7. Renouvellement payé : la fin de la destinataire avance avec la période.
const fin1 = new Date(abonnements[AMIE].fin).getTime();
subs.sub_o = { ...subs.sub_o, current_period_start: debut + MOIS, current_period_end: debut + 2 * MOIS };
r = await evenement('invoice.paid', { object: 'invoice', parent: { subscription_details: { subscription: 'sub_o' } } });
assert.equal(r.resultat, 'offert-actif');
assert.ok(new Date(abonnements[AMIE].fin).getTime() >= fin1 + (MOIS - 10) * 1000);
assert.equal(courriels.length, 1);
ligneDonateurIntacte();

// 8. Échec de paiement : trois jours de grâce depuis le début de la période, puis plus d'accès.
subs.sub_o = { ...subs.sub_o, status: 'past_due', current_period_start: debut - 10 * 864e2 * 10 };
r = await evenement('invoice.payment_failed', { object: 'invoice', subscription: 'sub_o' });
assert.equal(abonnements[AMIE].statut, 'actif');
assert.ok(new Date(abonnements[AMIE].fin) < new Date(), 'la grâce aurait dû expirer');
assert.equal((await appel('GET', undefined, 'jeton-a')).donnees.abonne, false);
// Le paiement repris : l'accès revient.
subs.sub_o = { ...subs.sub_o, status: 'active', current_period_start: debut + MOIS, current_period_end: debut + 2 * MOIS };
await evenement('invoice.paid', { object: 'invoice', subscription: 'sub_o' });
assert.equal((await appel('GET', undefined, 'jeton-a')).donnees.abonne, true);
ligneDonateurIntacte();

// 9. Le donateur gère et annule depuis Mon dossier : le portail de SON client, sur CET abonnement.
assert.equal((await appel('POST', 'annuler', 'jeton-a', { offert: code })).statut, 404); // pas son abonnement offert
let g = await appel('POST', 'annuler', 'jeton-d', { offert: code });
assert.equal(g.statut, 200);
assert.equal(portails.at(-1).customer, 'cus_d');
assert.equal(portails.at(-1)['flow_data[type]'], 'subscription_cancel');
assert.equal(portails.at(-1)['flow_data[subscription_cancel][subscription]'], 'sub_o');
g = await appel('POST', 'portail', 'jeton-d', { offert: code });
assert.equal(g.statut, 200);
// Sans « offert », le portail reste celui de l'abonnement personnel.
g = await appel('POST', 'annuler', 'jeton-d', {});
assert.equal(portails.at(-1)['flow_data[subscription_cancel][subscription]'], 'sub_perso');

// Annulation prévue à la fin de la période : la destinataire le voit, reste abonnée jusque-là.
subs.sub_o = { ...subs.sub_o, cancel_at_period_end: true };
await evenement('customer.subscription.updated', subs.sub_o);
assert.equal(abonnements[AMIE].annulation_prevue, true);
assert.equal((await appel('GET', undefined, 'jeton-a')).donnees.abonne, true);

// 10. Annulation effective : la destinataire n'est plus abonnée ; le donateur garde son abonnement.
subs.sub_o = { ...subs.sub_o, status: 'canceled', ended_at: maintenant() - 5 };
r = await evenement('customer.subscription.deleted', subs.sub_o);
assert.equal(r.resultat, 'offert-annule');
assert.equal(abonnements[AMIE].statut, 'annule');
assert.equal((await appel('GET', undefined, 'jeton-a')).donnees.abonne, false);
assert.equal((await appel('GET', undefined, 'jeton-d')).donnees.abonne, true);
assert.equal((await appel('GET', 'codes', 'jeton-d')).donnees.offerts[0].actif, false);
ligneDonateurIntacte();

// Un abonnement personnel du donateur qui se renouvelle : seule SA ligne bouge, jamais la destinataire.
subs.sub_perso = { ...subs.sub_perso, current_period_end: maintenant() + 2 * MOIS };
await evenement('invoice.paid', { object: 'invoice', subscription: 'sub_perso' });
assert.equal(abonnements[DONATEUR].source, 'stripe');
assert.equal(abonnements[DONATEUR].stripe_subscription_id, 'sub_perso');
assert.equal(abonnements[AMIE].source, 'offert');
assert.equal(abonnements[AMIE].statut, 'annule');

// Un 2e abonnement offert, annulé AVANT que son code serve : le code ne vaut plus.
subs.sub_o2 = { ...subs.sub_o, id: 'sub_o2', status: 'active', cancel_at_period_end: false, ended_at: undefined, current_period_start: maintenant(), current_period_end: maintenant() + MOIS };
await evenement('customer.subscription.created', subs.sub_o2);
assert.equal(offerts.length, 2);
assert.equal(courriels.length, 2);
subs.sub_o2 = { ...subs.sub_o2, status: 'canceled', ended_at: maintenant() - 5 };
await evenement('customer.subscription.deleted', subs.sub_o2);
assert.equal((await appel('POST', 'code', 'jeton-o', { code: offerts[1].code })).donnees.raison, 'termine');
assert.equal(abonnements[AUTRE], undefined);

console.log('test-cadeau-recurrent : tout passe');
