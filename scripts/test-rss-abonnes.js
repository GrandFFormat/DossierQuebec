// Essai hors ligne des flux RSS (api/feed.js, api/_rss-abonnes.js) sur des données SIMULÉES : fetch
// est remplacé, rien ne part vers Supabase ni le site.
//
//   node scripts/test-rss-abonnes.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.CRON_SECRET = 'secret-simule';
process.env.PUBLIC_SITE_URL = 'https://site.simule';

const A = '11111111-1111-1111-1111-111111111111'; // abonnée active
const B = '22222222-2222-2222-2222-222222222222'; // abonnement terminé

const bills = [
  { id: 1, num: 1, legislature: 44, introSession: 1, title: 'Loi sur le logement abordable', status: 'encours', note: 'Présenté le 2026-11-20', lastActivity: '2026-11-20', sponsor: 'Girard, Eric — Ministre des Finances' },
  { id: 2, num: 2, legislature: 44, introSession: 1, title: 'Loi sur les forêts', status: 'encours', note: 'Présenté le 2026-11-21', lastActivity: '2026-11-21', sponsor: 'Roy, Jean — Ministre des Ressources naturelles' },
  { id: 3, num: 3, legislature: 44, introSession: 1, title: 'Loi modifiant diverses dispositions & autres', status: 'encours', note: 'Présenté le 2026-11-22', lastActivity: '2026-11-22', sponsor: 'Girard, Eric — Ministre des Finances' },
];
const resumes = { 2: '<p>Touche aussi le <b>logement</b> en forêt.</p>' };
const votes = { votes: [{ legislature: 44, session: 1, num: 7, date: '2026-11-25', stage: 'Adoption du principe', subject: 'Projet de loi n° 2', billNum: 2, url: 'https://assnat.simule/7', pour: [{ assnatId: 501 }], contre: [], abstentions: [] }] };
const deputes = [['Jean Roy', 'Lac-Sud', 'Région', 'XX', 501]];
const tables = {
  abonnements: { [A]: [{ user_id: A, statut: 'actif', fin: null }], [B]: [{ user_id: B, statut: 'expire', fin: '2026-01-01' }] },
  alertes_mots_cles: [{ mot: 'Logement' }],
  follows: [{ person_type: 'depute', person_key: 'Jean Roy|Lac-Sud' }],
};

globalThis.fetch = async (url) => {
  const u = new URL(url);
  const ok = (c) => ({ ok: true, status: 200, json: async () => c, text: async () => JSON.stringify(c) });
  if (u.host === 'site.simule') {
    const f = { '/data/bills.json': { bills }, '/data/bills-resumes-fr.json': resumes, '/data/votes.json': votes, '/data/site/deputesRaw.json': deputes }[u.pathname];
    return f ? ok(f) : { ok: false, status: 404, json: async () => null, text: async () => '' };
  }
  if (u.pathname === '/rest/v1/abonnements') return ok(tables.abonnements[u.searchParams.get('user_id').replace('eq.', '')] ?? []);
  if (u.pathname === '/rest/v1/alertes_mots_cles') return ok(tables.alertes_mots_cles);
  if (u.pathname === '/rest/v1/follows') return ok(tables.follows);
  if (u.pathname === '/rest/v1/feed_hits') return ok(null);
  throw new Error(`fetch inattendu : ${url}`);
};

const { default: handler } = await import('../api/feed.js');
const { adresseFlux } = await import('../api/_rss-abonnes.js');

async function lire(query) {
  let statut, corps;
  const res = { setHeader() {}, status(s) { statut = s; return this; }, send(c) { corps = c; return this; } };
  await handler({ query, headers: { 'user-agent': 'essai' } }, res);
  return { statut, corps };
}
// Bien formé : une vérification simple, sans dépendance (balises équilibrées, entités connues).
function bienForme(xml) {
  assert.ok(xml.startsWith('<?xml'), 'déclaration XML');
  const pile = [];
  const sansTexte = xml.replace(/<\?xml[^>]*\?>/, '');
  for (const m of sansTexte.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) assert.equal(pile.pop(), m[2], `balise fermante ${m[2]}`);
    else pile.push(m[2]);
  }
  assert.equal(pile.length, 0, 'balises équilibrées');
  for (const e of xml.matchAll(/&([^;\s]*);?/g)) assert.ok(/^&(amp|lt|gt|quot|apos|#\d+);$/.test(e[0]), `entité ${e[0]}`);
}
const items = (xml) => (xml.match(/<item>/g) ?? []).length;
const params = (adresse) => Object.fromEntries(new URL(adresse).searchParams);

// 1. Flux public : une seule entrée, l'avis.
let r = await lire({});
assert.equal(r.statut, 200); bienForme(r.corps); assert.equal(items(r.corps), 1);
assert.match(r.corps, /maintenant réservé aux abonné·e·s/); assert.match(r.corps, /site\.simule\/abonnement/);

// 2. Signature fausse : avis, pas d'erreur.
r = await lire({ u: A, s: 'f'.repeat(64) });
assert.equal(r.statut, 200); bienForme(r.corps); assert.equal(items(r.corps), 1); assert.match(r.corps, /pas valide/);

const pa = params(adresseFlux(A));
// 3. Flux général d'une abonnée active : le contenu complet, identique au fichier.
r = await lire({ ...pa });
assert.equal(r.corps, readFileSync(new URL('../api/feed-data.xml', import.meta.url), 'utf8'));
r = await lire({ ...pa, type: 'tout' });
assert.equal(r.corps, readFileSync(new URL('../api/feed-data.xml', import.meta.url), 'utf8'));

// 4. Abonnement inactif : avis.
r = await lire({ ...params(adresseFlux(B)), type: 'mots' });
bienForme(r.corps); assert.equal(items(r.corps), 1); assert.match(r.corps, /n’est plus actif/);
// La signature de A ne vaut pas pour B.
r = await lire({ u: B, s: pa.s });
assert.match(r.corps, /pas valide/);

// 5. Mots-clés : PL 1 (titre) et PL 2 (résumé), pas le PL 3.
r = await lire({ ...pa, type: 'mots' });
bienForme(r.corps); assert.equal(items(r.corps), 2);
assert.match(r.corps, /projets-de-loi\/1-44-1/); assert.match(r.corps, /projets-de-loi\/2-44-1/); assert.doesNotMatch(r.corps, /3-44-1/);
assert.match(r.corps, /Source : Assemblée nationale du Québec/);

// 6. Élus suivis : le PL 2 présenté par Jean Roy et son vote, qui pointe vers la page du PL 2.
r = await lire({ ...pa, type: 'elus' });
bienForme(r.corps); assert.equal(items(r.corps), 2);
assert.match(r.corps, /a voté pour/); assert.match(r.corps, /vote-44-1-7-501/);

// 7. Ministère : les PL 1 et 3 (Finances), avec le « & » échappé.
r = await lire({ ...pa, type: 'ministere', m: 'Ministre des Finances' });
bienForme(r.corps); assert.equal(items(r.corps), 2); assert.match(r.corps, /&amp; autres/); assert.doesNotMatch(r.corps, /2-44-1/);

// 8. Le vrai fichier du flux général reste bien formé.
bienForme(readFileSync(new URL('../api/feed-data.xml', import.meta.url), 'utf8'));

console.log('Flux RSS : tous les essais passent.');
