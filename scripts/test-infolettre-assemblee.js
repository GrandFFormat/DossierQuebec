// Essai hors ligne de l'infolettre de l'Assemblée nationale (21 oct. 2026) : le numéro de février
// 2026 fabriqué avec les vraies données (scripts/infolettre-assemblee.js), un mois vide, la
// publication idempotente (--si-nouveau), puis l'inscription, la confirmation, la bienvenue et la
// désinscription par api/infolettre.js. fetch est remplacé : rien ne part vers Supabase ni Resend.
// Écrit les deux versions du numéro de février 2026 dans %TEMP%\infolettre-assemblee\.
//   node scripts/test-infolettre-assemblee.js

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.CRON_SECRET = 'secret-simule';
process.env.PUBLIC_SITE_URL = 'https://site.simule';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => JSON.parse(readFileSync(join(racine, chemin), 'utf8'));
const donnees = { bills: lire('data/bills.json'), votes: lire('data/votes.json'), consultations: lire('api/consultations-data.json') };

const { fabriquerNumero, publier, moisPrecedent } = await import('./infolettre-assemblee.js');

// 1. Février 2026.
const fev = fabriquerNumero('2026-02', donnees);
assert.ok(fev, 'février 2026 a un numéro');
const c = fev.chiffres;
assert.equal(c.presentes.length, 7);
assert.equal(c.sanctionnes.length, 2);
assert.deepEqual(c.sanctionnes.map((x) => x.b.num).sort((a, b) => a - b), [19, 111]);
assert.equal(c.votes.length, 26);
assert.deepEqual(c.etapes.map((x) => `${x.v.stage} ${x.v.billNum}`), ['Adoption du principe 9', 'Adoption 19']);
assert.equal(c.section.memoires.total, 436);
assert.ok(fev.html.includes('Source : Assemblée nationale du Québec'));
assert.ok(fev.html.includes('https://dossierquebec.ca/projets-de-loi/19-43-2'), 'lien vers la page du site');
assert.ok(fev.html.includes('<!--BANDEAU-->') && fev.html.includes('<!--DESINSCRIPTION-->') && fev.html.includes('<!--ABONNES:COMPLET-->'));
assert.ok(fev.html.includes('Ce numéro couvre tout le mois de février 2026.'));
assert.ok(!/résumé|IA\b/.test(fev.html), 'aucun texte d’IA');

// 2. Un mois vide : pas de numéro. Novembre 2026 avec une séance le 17 : l'intro le dit.
assert.equal(fabriquerNumero('2026-09', donnees), null);
assert.equal(moisPrecedent(new Date('2026-12-01T08:00:00Z')), '2026-11');
const nov = fabriquerNumero('2026-11', { ...donnees, votes: { votes: [{ legislature: 44, session: 1, num: 1, date: '2026-11-18', stage: 'Motion sans préavis', billNum: null, subject: 'Motion simulée', url: 'https://www.assnat.qc.ca/simule', pour: [{ assnatId: 1, party: 'CAQ' }], contre: [], abstentions: [], totals: { pour: 1, contre: 0, abstentions: 0 } }] } });
assert.ok(nov.html.includes('commencé à siéger le 17 novembre 2026'));

// 3. La publication, deux fois de suite avec --si-nouveau : une seule ligne.
let lignes = [];
const courriels = [];
let inscriptions = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const json = (corps, status = 200) => ({ ok: status < 300, status, json: async () => corps, text: async () => (corps == null ? '' : JSON.stringify(corps)) });
  if (url.startsWith('https://api.resend.com/')) { courriels.push(...JSON.parse(opts.body)); return json({ data: [] }); }
  const u = new URL(url);
  const methode = opts.method ?? 'GET';
  const corps = opts.body ? JSON.parse(opts.body) : null;
  const egal = (cle) => { const v = u.searchParams.get(cle); return v?.startsWith('eq.') ? v.slice(3) : null; };
  if (u.pathname === '/rest/v1/infolettre_numeros') {
    if (methode === 'POST') { for (const l of corps) { lignes = lignes.filter((x) => x.mois !== l.mois); lignes.push({ ...l, envoyes: 0 }); } return json(null, 201); }
    if (methode === 'PATCH') return json(null);
    return json(lignes.filter((l) => (!egal('ville') || l.ville === egal('ville')) && (!egal('mois') || l.mois === egal('mois')) && (!u.searchParams.has('publie_le') || l.publie_le)).sort((a, b) => b.mois.localeCompare(a.mois)));
  }
  if (u.pathname === '/rest/v1/infolettre_inscriptions') {
    const ids = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url))?.[1]?.split(',');
    if (methode === 'POST') {
      const nouvelles = corps.map((l, i) => {
        const e = inscriptions.find((x) => x.email === l.email && x.ville === l.ville && x.type === l.type);
        if (e) { Object.assign(e, l); return e; }
        const n = { id: `aaaaaaaa-0000-0000-0000-00000000000${inscriptions.length + 1}`, arrondissement: '', langue: 'fr', user_id: null, ...l };
        inscriptions.push(n);
        return n;
      });
      return json(nouvelles);
    }
    if (methode === 'PATCH') { for (const l of inscriptions) if (ids?.includes(l.id) || (egal('email') && l.email === egal('email'))) Object.assign(l, corps); return json(null); }
    if (ids) return json(inscriptions.filter((l) => ids.includes(l.id)));
    if (egal('email')) return json(inscriptions.filter((l) => l.email === decodeURIComponent(egal('email'))));
    return json([]); // le garde-fou « 30 par heure »
  }
  if (u.pathname === '/rest/v1/abonnements') return json([{ user_id: '11111111-1111-1111-1111-111111111111', statut: 'actif', fin: null }]);
  if (u.pathname === '/auth/v1/user') return json(null, 401);
  throw new Error(`requête imprévue : ${methode} ${url}`);
};

assert.equal(await publier('2026-02', fev, { siNouveau: true }), 'publie');
assert.equal(await publier('2026-02', fev, { siNouveau: true }), 'deja');
assert.equal(lignes.length, 1);
assert.equal(lignes[0].ville, 'assemblee');

// 4. Inscription, confirmation (bienvenue avec le dernier numéro), désinscription.
const { default: handler } = await import('../api/infolettre.js');
const { idsSignes, lienSigne } = await import('../api/_infolettre.js');
const appel = async (query, { method = 'GET', body = null } = {}) => {
  const r = { code: 0, corps: null, entetes: {} };
  const res = { setHeader: (k, v) => { r.entetes[k] = v; }, status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; }, send(x) { r.corps = x; return this; } };
  await handler({ query, method, headers: {}, body }, res);
  return r;
};
let r = await appel({ action: 'etat' });
const offre = r.corps.villes.find((v) => v.cle === 'assemblee');
assert.ok(offre && offre.offre.length === 1 && offre.offre[0].cle === 'mensuel', 'une seule sorte pour l’Assemblée');

r = await appel({ action: 'inscrire' }, { method: 'POST', body: { email: 'lecteur@exemple.test', choix: [{ ville: 'assemblee', type: 'mensuel', langue: 'fr' }, { ville: 'assemblee', type: 'conseil' }] } });
assert.equal(r.code, 200);
assert.equal(inscriptions.length, 1, 'la sorte « conseil » est refusée pour l’Assemblée');
assert.equal(inscriptions[0].statut, 'en_attente');
assert.ok(courriels.at(-1).subject.includes("L'infolettre de l'Assemblée nationale"));
const lien = new URL(/href="([^"]*action=confirmer[^"]*)"/.exec(courriels.at(-1).html)[1].replace(/&amp;/g, '&'));
assert.ok(idsSignes('confirmer', lien.searchParams.get('ids'), lien.searchParams.get('s')));

r = await appel({ action: 'confirmer', ids: lien.searchParams.get('ids'), s: lien.searchParams.get('s') });
assert.equal(r.code, 200);
assert.equal(inscriptions[0].statut, 'confirme');
assert.ok(r.corps.includes('https://site.simule/"') && r.corps.includes('Revenir à DossierQuébec'));
const bienvenue = courriels.at(-1);
assert.ok(bienvenue.subject.startsWith('Bienvenue') && bienvenue.html.includes('Voir l’abonnement'), 'bienvenue : le numéro, version non abonnée');
assert.equal(inscriptions[0].dernier_mois, '2026-02');

const d = new URL(lienSigne('desinscrire', [inscriptions[0].id]));
r = await appel({ action: 'desinscrire', ids: d.searchParams.get('ids'), s: d.searchParams.get('s') });
assert.equal(r.code, 200);
assert.equal(inscriptions[0].statut, 'desinscrit');

// Sans numéro publié : le court mot dit quand part le premier.
lignes = [];
courriels.length = 0;
const { envoyerBienvenue } = await import('../api/_infolettre.js');
await envoyerBienvenue([{ id: 'aaaaaaaa-0000-0000-0000-000000000009', email: 'nouveau@exemple.test', ville: 'assemblee', type: 'mensuel', arrondissement: '', langue: 'fr' }]);
if (new Date().toISOString().slice(0, 7) < '2026-12') assert.ok(courriels[0].html.includes('au début de décembre 2026'));
assert.ok(courriels[0].html.includes('https://site.simule/"'));

// 5. Les deux versions du numéro de février 2026, à regarder.
const { composer } = await import('../api/_infolettre.js');
const numero = { ville: 'assemblee', type: 'mensuel', arrondissement: '', mois: '2026-02', titre: fev.titre, html: fev.html };
const dossier = join(tmpdir(), 'infolettre-assemblee');
mkdirSync(dossier, { recursive: true });
writeFileSync(join(dossier, '2026-02-abonne.html'), composer(numero, { id: 'aaaaaaaa-0000-0000-0000-000000000001', bienvenue: false, abonne: true }));
writeFileSync(join(dossier, '2026-02-non-abonne.html'), composer(numero, { id: 'aaaaaaaa-0000-0000-0000-000000000001', bienvenue: false, abonne: false }));
console.log(`infolettre de l'Assemblée : tous les essais passent ; courriels dans ${dossier}`);
