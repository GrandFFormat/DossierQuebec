// Essai hors ligne des abonnements offerts (api/_cadeau.js, api/abonnement.js, api/stripe-webhook.js),
// sur des données SIMULÉES : fetch est remplacé, rien ne part vers Stripe, Supabase ni Resend.
// La fonction SQL echanger_code_cadeau est imitée ici (scripts/supabase-cadeaux-retour.sql en est la
// vraie) : l'essai vérifie le branchement, pas Postgres.
//
//   node scripts/test-cadeaux.js

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.PUBLIC_SITE_URL = 'https://site.simule';
process.env.STRIPE_SECRET_KEY = 'sk_live_simule';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_simule';
process.env.STRIPE_PRIX_MENSUEL = 'price_simule';
process.env.STRIPE_OUVERT = '1';

const ACHETEUR = '11111111-1111-1111-1111-111111111111';
const AMIE = '22222222-2222-2222-2222-222222222222';
const STRIPEUR = '33333333-3333-3333-3333-333333333333';
const comptes = { 'jeton-a': { id: ACHETEUR, email: 'a@exemple.test' }, 'jeton-b': { id: AMIE, email: 'b@exemple.test' }, 'jeton-c': { id: STRIPEUR, email: 'c@exemple.test' } };

const codes = [];      // codes_cadeaux
const abonnements = { [STRIPEUR]: { user_id: STRIPEUR, statut: 'actif', source: 'stripe', fin: new Date(Date.now() + 9e8).toISOString() } };
const essais = [];
const courriels = [];
const sessionsStripe = [];

const json = (d, status = 200) => new Response(d == null || status === 204 ? '' : JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

// L'imitation de echanger_code_cadeau → utiliser_code_cadeau.
function echanger(user, brut) {
  if (essais.filter((e) => e.user === user && e.le > Date.now() - 3600e3).length >= 10) return { ok: false, raison: 'trop' };
  essais.push({ user, le: Date.now() });
  const c = codes.find((x) => x.code === String(brut).replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  if (!c) return { ok: false, raison: 'inconnu' };
  if (c.utilise_par) return { ok: false, raison: 'utilise' };
  const a = abonnements[user];
  const active = a && a.statut === 'actif' && (!a.fin || new Date(a.fin) > new Date());
  if (active && a.source === 'stripe') return { ok: false, raison: 'stripe' };
  const depart = Math.max(Date.now(), active ? new Date(a.fin).getTime() : 0);
  const d = new Date(depart); d.setMonth(d.getMonth() + c.mois);
  abonnements[user] = { user_id: user, statut: 'actif', source: 'manuel', fin: d.toISOString() };
  c.utilise_par = user; c.utilise_le = new Date().toISOString();
  return { ok: true, mois: c.mois, fin: d.toISOString() };
}

globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url);
  const corps = o.body ? (String(o.headers?.['Content-Type'] ?? '').includes('json') ? JSON.parse(o.body) : Object.fromEntries(new URLSearchParams(o.body))) : null;
  if (u.host === 'supabase.simule') {
    if (u.pathname === '/auth/v1/user') {
      const c = comptes[String(o.headers.Authorization).replace('Bearer ', '')];
      return c ? json(c) : json({}, 401);
    }
    if (u.pathname === '/rest/v1/abonnements') return json(abonnements[u.searchParams.get('user_id')?.slice(3)] ? [abonnements[u.searchParams.get('user_id').slice(3)]] : []);
    if (u.pathname === '/rest/v1/rpc/echanger_code_cadeau') return json(echanger(corps.p_user, corps.p_code));
    if (u.pathname === '/rest/v1/codes_cadeaux') {
      const sid = u.searchParams.get('stripe_session_id')?.slice(3);
      const ach = u.searchParams.get('acheteur')?.slice(3);
      if (o.method === 'POST') {
        for (const l of corps) if (!codes.some((x) => x.stripe_session_id === l.stripe_session_id)) codes.push({ ...l, cree_le: new Date().toISOString(), utilise_par: null, utilise_le: null, courriel_envoye_le: null });
        return json(null, 201);
      }
      if (o.method === 'PATCH') { Object.assign(codes.find((x) => x.stripe_session_id === decodeURIComponent(sid)), corps); return new Response(null, { status: 204 }); }
      if (sid) return json(codes.filter((x) => x.stripe_session_id === decodeURIComponent(sid)));
      if (ach) return json(codes.filter((x) => x.acheteur === ach));
    }
  }
  if (u.host === 'api.resend.com') { courriels.push(JSON.parse(o.body)); return json({ id: 'courriel' }); }
  if (u.host === 'api.stripe.com') {
    if (u.pathname === '/v1/customers' && o.method !== 'POST') return json({ data: [] });
    if (u.pathname === '/v1/customers') return json({ id: 'cus_simule' });
    if (u.pathname === '/v1/checkout/sessions') { sessionsStripe.push(corps); return json({ id: 'cs_1', url: 'https://checkout.simule/cs_1' }); }
  }
  throw new Error(`fetch inattendu : ${o.method ?? 'GET'} ${url}`);
};

const { default: abonnement } = await import('../api/abonnement.js');
const { POST: webhook } = await import('../api/stripe-webhook.js');
const { nouveauCode, codeAffiche } = await import('../api/_cadeau.js');

async function appel(methode, action, jeton, corps) {
  let statut, donnees;
  const res = { setHeader() {}, status(s) { statut = s; return this; }, json(d) { donnees = d; return this; } };
  await abonnement({ method: methode, query: { action }, headers: jeton ? { authorization: `Bearer ${jeton}` } : {}, body: corps }, res);
  return { statut, donnees };
}
function evenement(objet) {
  const brut = JSON.stringify({ type: 'checkout.session.completed', data: { object: objet } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${brut}`).digest('hex');
  return webhook(new Request('https://site.simule/api/stripe-webhook', { method: 'POST', body: brut, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
}

// Le format du code.
for (let i = 0; i < 200; i++) assert.match(nouveauCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{12}$/);
assert.equal(codeAffiche('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');

// 1. Achat : non connecté refusé ; durée inventée refusée ; le montant vient du serveur.
assert.equal((await appel('POST', 'cadeau', null, { duree: 'annuel' })).statut, 401);
assert.equal((await appel('POST', 'cadeau', 'jeton-a', { duree: 'a-vie', montant: 1 })).statut, 400);
const achat = await appel('POST', 'cadeau', 'jeton-a', { duree: 'trimestriel', montant: 1 });
assert.equal(achat.statut, 200);
assert.equal(achat.donnees.url, 'https://checkout.simule/cs_1');
const s = sessionsStripe.at(-1);
assert.equal(s.mode, 'payment');
assert.equal(s['line_items[0][price_data][unit_amount]'], '2699');
assert.equal(s['line_items[0][price_data][currency]'], 'cad');
assert.equal(s['metadata[type]'], 'cadeau');
assert.equal(s['metadata[duree]'], 'trimestriel');
assert.equal(s['metadata[user_id]'], ACHETEUR);
assert.equal((await appel('GET', undefined, 'jeton-a')).donnees.peutOffrir, true);

// Paiement fermé : pas d'achat.
process.env.STRIPE_OUVERT = '0';
assert.equal((await appel('POST', 'cadeau', 'jeton-a', { duree: 'mensuel' })).statut, 403);
process.env.STRIPE_OUVERT = '1';

// 2. Webhook : code créé, courriel composé à l'acheteur.
const session = { id: 'cs_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 2699, currency: 'cad', customer_details: { email: 'a@exemple.test' }, metadata: { type: 'cadeau', duree: 'trimestriel', user_id: ACHETEUR, langue: 'fr' } };
let r = await evenement(session);
assert.equal(r.status, 200);
assert.equal((await r.json()).resultat, 'livre');
assert.equal(codes.length, 1);
assert.equal(codes[0].mois, 3);
assert.equal(codes[0].acheteur, ACHETEUR);
assert.equal(courriels.length, 1);
assert.deepEqual(courriels[0].to, ['a@exemple.test']);
assert.ok(courriels[0].html.includes(codeAffiche(codes[0].code)));
assert.ok(courriels[0].html.includes('Donnez-le à qui vous voulez'));
assert.ok(courriels[0].html.includes('Mettez votre code ici'));

// 3. Webhook rejoué : pas de 2e code, pas de 2e courriel.
r = await evenement(session);
assert.equal((await r.json()).resultat, 'deja-livre');
assert.equal(codes.length, 1);
assert.equal(courriels.length, 1);

// Un montant qui ne correspond pas à la durée ne crée rien.
r = await evenement({ ...session, id: 'cs_faux', amount_total: 100 });
assert.equal((await r.json()).resultat, 'montant');
assert.equal(codes.length, 1);

// L'acheteur voit son code dans Mon dossier.
let liste = await appel('GET', 'codes', 'jeton-a');
assert.equal(liste.donnees.codes.length, 1);
assert.equal(liste.donnees.codes[0].utilise, false);
assert.equal((await appel('GET', 'codes', 'jeton-b')).donnees.codes.length, 0);

// 4. Le code utilisé par une autre personne, tapé en minuscules avec tirets : abonnement donné.
const affiche = codeAffiche(codes[0].code).toLowerCase();
let u = await appel('POST', 'code', 'jeton-b', { code: affiche });
assert.equal(u.statut, 200);
assert.equal(u.donnees.ok, true);
assert.equal(abonnements[AMIE].source, 'manuel');
const fin1 = new Date(abonnements[AMIE].fin);
assert.ok(fin1 > new Date(Date.now() + 85 * 864e5));
assert.equal((await appel('GET', 'codes', 'jeton-a')).donnees.codes[0].utilise, true);

// 5. Code réutilisé : refus.
u = await appel('POST', 'code', 'jeton-a', { code: affiche });
assert.equal(u.statut, 400);
assert.equal(u.donnees.raison, 'utilise');

// Prolongation : un 2e code s'ajoute au temps qui reste.
await evenement({ ...session, id: 'cs_2', amount_total: 999, metadata: { ...session.metadata, duree: 'mensuel' } });
assert.equal(codes.length, 2);
u = await appel('POST', 'code', 'jeton-b', { code: codes[1].code });
assert.equal(u.donnees.ok, true);
assert.ok(new Date(abonnements[AMIE].fin) > new Date(fin1.getTime() + 27 * 864e5));

// Abonnement Stripe récurrent actif : refus poli, le code reste neuf.
await evenement({ ...session, id: 'cs_3', amount_total: 9900, metadata: { ...session.metadata, duree: 'annuel' } });
u = await appel('POST', 'code', 'jeton-c', { code: codes[2].code });
assert.equal(u.donnees.raison, 'stripe');
assert.equal(codes[2].utilise_par, null);

// 6. Code faux : refus.
u = await appel('POST', 'code', 'jeton-a', { code: 'ZZZZ-ZZZZ-ZZZZ' });
assert.equal(u.donnees.raison, 'inconnu');

// 7. Trop d'essais : refus au 11e dans l'heure (A en a déjà fait 2).
for (let i = 0; i < 8; i++) await appel('POST', 'code', 'jeton-a', { code: `FAUX${i}` });
u = await appel('POST', 'code', 'jeton-a', { code: codes[2].code });
assert.equal(u.statut, 429);
assert.equal(u.donnees.raison, 'trop');
assert.equal(codes[2].utilise_par, null);

// Non connecté : refus.
assert.equal((await appel('POST', 'code', null, { code: 'X' })).statut, 401);

console.log('test-cadeaux : tout passe');
