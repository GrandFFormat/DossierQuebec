// Essai hors ligne des alertes sur mesure (api/_alertes-assemblee.js), sur des données SIMULÉES :
// fetch est remplacé, rien ne part vers Supabase, Resend ni le site. Aucun projet de loi avant le
// 17 nov. 2026 (nouvelle législature) : c'est la seule façon de voir la logique tourner d'ici là.
//
//   node scripts/test-alertes-assemblee.js

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.CRON_SECRET = 'secret-simule';
process.env.PUBLIC_SITE_URL = 'https://site.simule';

const A = '11111111-1111-1111-1111-111111111111'; // abonnée, déjà vue hier
const B = '22222222-2222-2222-2222-222222222222'; // abonné, tout neuf : mémorisé sans courriel
const C = '33333333-3333-3333-3333-333333333333'; // abonnée qui a coupé ses alertes

const lois = [
  { id: 1, num: 1, title: 'Loi sur le logement abordable', status: 'encours', step: 2, note: 'Adoption du principe le 2026-11-25', sponsor: 'Marie Tremblay', lastActivity: '2026-11-25', legislature: 44, introSession: 1 },
  { id: 2, num: 2, title: 'Loi sur les forêts', status: 'encours', step: 1, note: 'Présenté le 2026-11-20', sponsor: 'Jean Roy', lastActivity: '2026-11-20', legislature: 44, introSession: 1 },
  { id: 3, num: 3, title: 'Loi modifiant diverses dispositions', status: 'encours', step: 1, note: 'Présenté le 2026-11-26', sponsor: 'Jean Roy', lastActivity: '2026-11-26', legislature: 44, introSession: 1 },
];
const brut = { bills: lois.map((b) => ({ ...b, liveStage: true, sponsor: `${b.sponsor.split(' ').reverse().join(', ')} — Ministre` })) };
const resumes = { 3: '<p>Ce projet touche aussi le <b>logement</b> social.</p>' };
const deputes = [['Jean Roy', 'Lac-Sud', 'Région', 'XX', 501], ['Marie Tremblay', 'Nord', 'Région', 'YY', 502]];
const personnes = (id) => ({ pour: [{ assnatId: id }], contre: [], abstentions: [] });
const votes = { votes: [
  { legislature: 44, session: 1, num: 1, date: '2026-11-24', stage: 'Motion', subject: 'Motion A', url: 'https://assnat.simule/1', ...personnes(501) },
  { legislature: 44, session: 1, num: 2, date: '2026-11-25', stage: 'Adoption du principe', subject: 'PL 1', url: 'https://assnat.simule/2', pour: [], contre: [{ assnatId: 501 }], abstentions: [] },
] };

const tables = {
  abonnements: [A, B, C].map((u) => ({ user_id: u, statut: 'actif', fin: null })),
  dossiers_suivis: [{ user_id: A, dossier_id: 'pl:1' }, { user_id: B, dossier_id: 'pl:1' }],
  follows: [{ user_id: A, person_type: 'depute', person_key: 'Jean Roy|Lac-Sud' }, { user_id: C, person_type: 'minister', person_key: 'Jean Roy' }],
  alertes_preferences: [{ user_id: C, actif: false }],
  alertes_mots_cles: [{ id: 'aaaaaaaa-0000-0000-0000-000000000001', user_id: A, mot: 'Logement' }],
  alertes_etat: [
    // Hier : PL 1 était à l'étape « présenté », le mot-clé avait vu le PL 1, les votes allaient jusqu'au 44-1-1,
    // et Jean Roy n'avait présenté que le PL 2.
    { user_id: A, projet: 'pl-1', etat: { statut: 'encours', note: 'Présenté le 2026-11-18', rang: 10 } },
    { user_id: A, projet: 'mot_aaaaaaaa000000000000000000000001', etat: { vus: [1] } },
  ],
};
const { clePersonne, cleVotes } = await import('../api/_alertes-assemblee.js');
const per = clePersonne('Jean Roy|Lac-Sud');
tables.alertes_etat.push({ user_id: A, projet: per, etat: { vus: [2] } }, { user_id: A, projet: cleVotes(per), etat: { dernier: [44, 1, 1] } });

const envoyes = [];
const ecritures = [];
let resendEnPanne = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const ok = (corps) => ({ ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) });
  if (u.host === 'site.simule') {
    const fichiers = { '/data/site/bills.json': lois, '/data/bills-resumes-fr.json': resumes, '/data/bills.json': brut, '/data/site/ministers.json': [], '/data/site/deputesRaw.json': deputes, '/data/votes.json': votes };
    return fichiers[u.pathname] ? ok(fichiers[u.pathname]) : { ok: false, status: 404, json: async () => null, text: async () => '' };
  }
  if (u.host === 'api.resend.com') {
    if (resendEnPanne) return { ok: false, status: 500, text: async () => 'panne simulée' };
    envoyes.push(JSON.parse(opts.body));
    return ok({ id: 'x' });
  }
  if (u.host === 'supabase.simule') {
    const m = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(u.pathname);
    if (m) return ok({ id: m[1], email: `${m[1].slice(0, 1)}@exemple.test` });
    const table = u.pathname.replace('/rest/v1/', '');
    if ((opts.method ?? 'GET') === 'POST') { ecritures.push({ table, corps: JSON.parse(opts.body) }); return ok(null); }
    if (Number(u.searchParams.get('offset')) > 0) return ok([]);
    return ok(tables[table] ?? []);
  }
  throw new Error(`appel réseau inattendu : ${url}`);
};

const { envoyerAlertes } = await import('../api/_alertes-assemblee.js');

// 1. Aperçu : rien n'est envoyé ni écrit.
let r = await envoyerAlertes({ apercu: true });
assert.equal(envoyes.length, 0);
assert.equal(ecritures.length, 0);
assert.equal(r.apercu.length, 1, 'seule A recevrait un courriel (B est neuf, C a coupé)');
const quoi = r.apercu[0].sections.map((s) => `${s.titre}|${s.quoi}|${s.nombre}`);
assert.deepEqual(quoi, [
  'Projets de loi suivis|Nouvelle étape|1',
  'Mot-clé « Logement »|Projets de loi qui le mentionnent|1', // PL 3, par son résumé
  'Jean Roy (Lac-Sud)|Votes nominaux|1', // le vote 44-1-2 ; le PL 3 est déjà dit plus haut
]);

// 2. Envoi qui échoue : rien n'est mémorisé pour A.
resendEnPanne = true;
r = await envoyerAlertes({});
assert.equal(r.envoyes, 0);
assert.ok(!ecritures.some((e) => e.table.startsWith('alertes_etat') && e.corps.some((x) => x.user_id === A)), 'A non mémorisée après un échec');
assert.ok(ecritures.some((e) => e.table.startsWith('alertes_etat') && e.corps.some((x) => x.user_id === B)), 'B (rien à envoyer) est mémorisé');
ecritures.length = 0;

// 3. Envoi réussi : un seul courriel, à A, avec son lien de désabonnement signé.
resendEnPanne = false;
r = await envoyerAlertes({});
assert.equal(envoyes.length, 1);
assert.equal(envoyes[0].to, `${A.slice(0, 1)}@exemple.test`);
assert.match(envoyes[0].html, /\/api\/unsubscribe\?u=11111111-1111-1111-1111-111111111111&amp;s=[0-9a-f]{64}/);
assert.match(envoyes[0].headers['List-Unsubscribe'], /api\/unsubscribe\?u=/);
assert.match(envoyes[0].html, /a voté <b>contre<\/b>/);
assert.ok(!/décision|Ville de/i.test(envoyes[0].html), 'aucun contenu municipal');
const etatA = ecritures.find((e) => e.table.startsWith('alertes_etat') && e.corps[0].user_id === A).corps;
assert.ok(etatA.every((x) => x.ville === 'assemblee'));
assert.deepEqual(etatA.find((x) => x.projet === cleVotes(per)).etat.dernier, [44, 1, 2]);
assert.ok(ecritures.some((e) => e.table === 'alertes_envois'));

// 4. Essai pour une adresse : reprend le plus récent, ne mémorise rien.
envoyes.length = 0; ecritures.length = 0;
r = await envoyerAlertes({ essai: '3@exemple.test' });
assert.equal(envoyes.length, 1, "l'essai part même si C a coupé ses alertes");
assert.match(envoyes[0].subject, /^\[Essai\]/);
assert.ok(!ecritures.some((e) => e.table.startsWith('alertes_etat')));

// 5. Plafond du jour : au-delà, on reporte sans mémoriser.
envoyes.length = 0; ecritures.length = 0;
r = await envoyerAlertes({ plafond: 0 });
assert.equal(envoyes.length, 0);
assert.ok(r.reportes >= 1);

console.log('alertes sur mesure : tous les essais passent');
