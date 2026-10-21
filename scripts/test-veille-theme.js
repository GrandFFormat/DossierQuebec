// Essai hors ligne de la veille par thème (api/_veille-theme.js), sur des données SIMULÉES : fetch
// est remplacé, rien ne part vers Supabase, Resend ni le site. Aucun projet de loi avant le 17 nov.
// 2026 (nouvelle législature) : les dates sont simulées. En fin d'essai, le classement réel des
// projets de loi de data/bills.json (43e législature) est compté.
//
//   node scripts/test-veille-theme.js

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.CRON_SECRET = 'secret-simule';
process.env.PUBLIC_SITE_URL = 'https://site.simule';

const A = '11111111-1111-1111-1111-111111111111'; // abonnée, Logement, servie le lundi précédent
const B = '22222222-2222-2222-2222-222222222222'; // abonné, Santé, tout neuf
const C = '33333333-3333-3333-3333-333333333333'; // abonnée déjà servie cette semaine
const D = '44444444-4444-4444-4444-444444444444'; // pas abonné : jamais servi
const E = '55555555-5555-5555-5555-555555555555'; // abonnée, Culture : rien de neuf

const LUNDI = '2026-11-23';
const site = [
  { id: 101, num: 1, title: 'Loi visant à favoriser l’accès au logement', status: 'encours', step: 1, note: 'Présenté le 2026-11-20', lastActivity: '2026-11-20', presentedOn: '2026-11-20', legislature: 44, introSession: 1 },
  { id: 102, num: 2, title: 'Loi sur l’accès aux services médicaux', status: 'encours', step: 2, note: 'Adoption du principe le 2026-11-19', lastActivity: '2026-11-19', presentedOn: '2026-11-04', legislature: 44, introSession: 1 },
  { id: 103, num: 495, title: 'Loi visant à accroître la présence du drapeau du Québec', status: 'encours', step: 1, note: 'Présenté le 2026-11-20', lastActivity: '2026-11-20', presentedOn: '2026-11-20', legislature: 44, introSession: 1 },
  { id: 104, num: 3, title: 'Loi sur les loyers', status: 'encours', step: 1, note: 'Présenté le 2026-11-10', lastActivity: '2026-11-10', presentedOn: '2026-11-10', legislature: 44, introSession: 1 },
];
const brut = { bills: [
  { id: 101, sponsor: 'Duranceau, France-Élaine — Ministre responsable de l’Habitation' },
  { id: 102, sponsor: 'Dubé, Christian — Ministre de la Santé' },
  { id: 103, sponsor: 'Roy, Jean — Député de Lac-Sud' },
  { id: 104, sponsor: 'Roy, Jean — Député de Lac-Sud' },
] };
const votes = { votes: [
  { legislature: 44, session: 1, num: 7, date: '2026-11-21', stage: 'Adoption du principe', billNum: 2, url: 'https://assnat.simule/7', totals: { pour: 80, contre: 20, abstentions: 0 } },
  { legislature: 44, session: 1, num: 8, date: '2026-11-21', stage: 'Motion sans préavis', billNum: null, url: 'https://assnat.simule/8', totals: { pour: 100, contre: 0, abstentions: 0 } },
] };
const consultations = { projets: {
  101: { num: 1, legislature: 44, titre: site[0].title, mandats: [
    { id: '60001', titre: 'Consultations particulières sur le projet de loi n° 1', commission: 'Commission de l’aménagement du territoire', type: 'particulieres',
      seances: ['2026-12-02'], dateLimite: '2026-11-30', url: 'https://assnat.simule/m1', urlMemoires: 'https://assnat.simule/m1/memoires',
      memoires: [{ date: '2026-11-22', depose: 'Regroupement des locataires', numero: '001M' }, { date: '2026-10-01', depose: 'Trop vieux', numero: '000M' }] },
  ] },
} };
// _consultations.js lit api/consultations-data.json depuis process.cwd() : un dossier temporaire.
const dossier = mkdtempSync(join(tmpdir(), 'veille-'));
const { mkdirSync } = await import('node:fs');
mkdirSync(join(dossier, 'api'));
writeFileSync(join(dossier, 'api', 'consultations-data.json'), JSON.stringify(consultations));
const racine = process.cwd();
process.chdir(dossier);

const tables = {
  abonnements: [A, B, C, E].map((u) => ({ user_id: u, statut: 'actif', fin: null })),
  alertes_preferences: [
    { user_id: A, veille_themes: ['logement'] },
    { user_id: B, veille_themes: ['sante', 'inconnu'] },
    { user_id: C, veille_themes: ['logement'] },
    { user_id: D, veille_themes: ['logement'] },
    { user_id: E, veille_themes: ['culture'] },
  ],
  alertes_etat: [
    { user_id: A, etat: { semaine: '2026-W47', jusqua: '2026-11-16', vus: ['pres_104'] } },
    { user_id: C, etat: { semaine: '2026-W48', jusqua: LUNDI, vus: [] } },
    { user_id: E, etat: { semaine: '2026-W47', jusqua: '2026-11-16', vus: [] } },
  ],
};

const envoyes = [];
const ecritures = [];
let resendEnPanne = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const ok = (corps) => ({ ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) });
  if (u.host === 'site.simule') {
    const fichiers = { '/data/site/bills.json': site, '/data/bills.json': brut, '/data/votes.json': votes };
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
    if ((opts.method ?? 'GET') !== 'GET') { ecritures.push({ table, methode: opts.method, url: String(url), corps: JSON.parse(opts.body) }); return ok(null); }
    if (Number(u.searchParams.get('offset')) > 0) return ok([]);
    return ok(tables[table] ?? []);
  }
  throw new Error(`appel réseau inattendu : ${url}`);
};

const V = await import('../api/_veille-theme.js');

// 0. Le classement, sans IA.
assert.deepEqual(V.themesDeLoi('Loi quelconque', 'Ministre des Finances'), { codes: ['economie'], par: 'ministere' });
assert.deepEqual(V.themesDeLoi('Loi sur les loyers', 'Député de Lac-Sud').codes, ['logement']);
assert.deepEqual(V.themesDeLoi('Loi visant à accroître la présence du drapeau du Québec', 'Député de Lac-Sud'), { codes: [], par: null });
assert.equal(V.semaineIso(LUNDI), '2026-W48');
assert.equal(V.estLundi(LUNDI), true);
assert.equal(V.CODES.length, 14);
// La liste des codes est la même dans le SQL et dans commun/dq.js.
const sql = readFileSync(join(racine, 'scripts', 'supabase-veille.sql'), 'utf8');
const dq = readFileSync(join(racine, 'commun', 'dq.js'), 'utf8');
for (const c of V.CODES) {
  assert.ok(sql.includes(`'${c}'`), `code ${c} absent du SQL`);
  assert.ok(new RegExp(`code:\\s*'${c}'`).test(dq), `code ${c} absent de commun/dq.js`);
}

// 1. Aperçu : rien n'est envoyé ni écrit.
let r = await V.envoyerVeille({ apercu: true, aujourdhui: LUNDI });
assert.equal(envoyes.length, 0);
assert.equal(ecritures.length, 0);
const qui = Object.fromEntries(r.apercu.map((x) => [x.a, x.themes.map((t) => `${t.theme}:${t.nombre}`).join(',')]));
// A : PL 1 présenté + consultation annoncée + mémoire (le PL 3 du 10 nov. est déjà dit).
// B : étape du PL 2 + vote. C est servie pourtant (aperçu = comme un lundi, avec ses clés vides).
assert.equal(qui['1***@exemple.test'], 'Logement et habitation:3');
assert.equal(qui['2***@exemple.test'], 'Santé:2');
assert.ok(!qui['4***@exemple.test'], 'D n’est pas abonné');
assert.ok(!qui['5***@exemple.test'], 'E : rien de neuf en Culture');

// 2. Un mardi : personne de neuf n'est servi (B attend le lundi) ; A et E, servis la semaine passée, oui.
r = await V.envoyerVeille({ apercu: false, aujourdhui: '2026-11-24', plafond: 0 });
assert.equal(r.envoyes, 0);
assert.equal(r.reportes, 2, 'A et E dus (lundi raté), reportés faute de quota ; B et C non');
assert.equal(ecritures.length, 0);

// 3. Envoi qui échoue : rien n'est mémorisé pour A ni B ; E (rien de neuf) est mémorisée sans courriel.
resendEnPanne = true;
r = await V.envoyerVeille({ aujourdhui: LUNDI });
assert.equal(r.envoyes, 0);
assert.equal(r.rienDeNeuf, 1);
const memorises = () => ecritures.filter((e) => e.table.startsWith('alertes_etat')).map((e) => e.corps[0].user_id);
assert.deepEqual(memorises(), [E]);
ecritures.length = 0;

// 4. Envoi réussi : un courriel à A, un à B, avec le lien de désabonnement signé.
resendEnPanne = false;
r = await V.envoyerVeille({ aujourdhui: LUNDI });
assert.equal(r.envoyes, 2);
assert.deepEqual(envoyes.map((e) => e.to).sort(), ['1@exemple.test', '2@exemple.test']);
const aMail = envoyes.find((e) => e.to === '1@exemple.test');
assert.match(aMail.html, /\/api\/unsubscribe\?u=11111111-1111-1111-1111-111111111111&amp;v=[0-9a-f]{64}/);
assert.match(aMail.headers['List-Unsubscribe'], /api\/unsubscribe\?u=.*&v=/);
assert.match(aMail.html, /Regroupement des locataires/);
assert.ok(!/Trop vieux/.test(aMail.html), 'un mémoire hors fenêtre n’est pas redit');
assert.ok(!/PL 3</.test(aMail.html), 'le PL 3, déjà dit, ne revient pas');
assert.ok(!/drapeau/.test(aMail.html), 'un projet sans thème n’apparaît nulle part');
const bMail = envoyes.find((e) => e.to === '2@exemple.test');
assert.match(bMail.html, /Vote 44-1-7/);
assert.ok(!/44-1-8/.test(bMail.html), 'un vote sans projet de loi n’a pas de thème');
assert.ok(!/décision|Ville de/i.test(aMail.html + bMail.html), 'aucun contenu municipal');
const etatA = ecritures.find((e) => e.table.startsWith('alertes_etat') && e.corps[0].user_id === A).corps[0];
assert.equal(etatA.ville, 'assemblee');
assert.equal(etatA.projet, 'veille');
assert.equal(etatA.etat.semaine, '2026-W48');
assert.ok(etatA.etat.vus.includes('pres_101') && etatA.etat.vus.includes('con_60001'));

// 5. Le lendemain, avec l'état mémorisé : rien ne repart (un courriel par semaine).
for (const e of ecritures.filter((x) => x.table.startsWith('alertes_etat'))) {
  const i = tables.alertes_etat.findIndex((x) => x.user_id === e.corps[0].user_id);
  const ligne = { user_id: e.corps[0].user_id, etat: e.corps[0].etat };
  if (i >= 0) tables.alertes_etat[i] = ligne; else tables.alertes_etat.push(ligne);
}
envoyes.length = 0; ecritures.length = 0;
r = await V.envoyerVeille({ aujourdhui: '2026-11-24' });
assert.equal(envoyes.length, 0);
// Et le lundi suivant, seules les nouveautés : la consultation déjà annoncée ne revient pas.
r = await V.envoyerVeille({ apercu: true, aujourdhui: '2026-11-30' });
assert.ok(!r.apercu.some((x) => x.a.startsWith('1')), 'A : rien de neuf le 30 nov.');

// 6. Essai pour une adresse : les plus récents, rien de mémorisé, même pour une servie cette semaine.
envoyes.length = 0; ecritures.length = 0;
r = await V.envoyerVeille({ essai: '3@exemple.test', aujourdhui: '2026-11-25' });
assert.equal(envoyes.length, 1);
assert.match(envoyes[0].subject, /^\[Essai\]/);
assert.equal(ecritures.length, 0);

// 7. Le lien de désabonnement vide les thèmes, et seulement avec la bonne signature.
const { default: desabonner } = await import('../api/unsubscribe.js');
const reponse = () => ({ code: 0, corps: '', setHeader() {}, status(c) { this.code = c; return this; }, send(t) { this.corps = t; return this; } });
let rep = reponse();
await desabonner({ method: 'GET', query: { u: A, v: 'f'.repeat(64) } }, rep);
assert.equal(rep.code, 400);
rep = reponse();
await desabonner({ method: 'GET', query: { u: A, v: V.signatureVeille(A) } }, rep);
assert.equal(rep.code, 200);
const patch = ecritures.find((e) => e.methode === 'PATCH');
assert.deepEqual(patch.corps.veille_themes, []);
assert.match(patch.url, /user_id=eq\.11111111/);

// 8. Le vrai classement de data/bills.json.
const reels = JSON.parse(readFileSync(join(racine, 'data', 'bills.json'), 'utf8')).bills;
const avec = reels.filter((b) => V.themesDeLoi(b.title, V.roleParrain(b.sponsor)).codes.length).length;
console.log(`classement réel (data/bills.json, ${reels.length} projets) : ${avec} avec au moins un thème, ${reels.length - avec} sans thème`);

process.chdir(racine);
console.log('veille par thème : tous les essais passent');
