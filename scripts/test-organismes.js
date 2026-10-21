// Essai hors ligne de « Suivre une entreprise ou un organisme » (21 oct. 2026) : la règle de
// regroupement (api/_organismes.js), la recherche et la liste servies par api/export.js, puis la ligne
// du courriel du matin (api/_alertes-assemblee.js). fetch est remplacé : rien ne part vers Supabase,
// Resend ni le site. Les mémoires viennent du vrai api/consultations-data.json.
//   node scripts/test-organismes.js

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.simule';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-simulee';
process.env.RESEND_API_KEY = 'cle-simulee';
process.env.DIGEST_FROM = 'essai@exemple.test';
process.env.CRON_SECRET = 'secret-simule';
process.env.PUBLIC_SITE_URL = 'https://site.simule';

const { cleOrganisme, estPersonne, indexOrganismes, chercherOrganismes, organisme, chargerIndex, cleEtatOrganisme, idMemoire } = await import('../api/_organismes.js');

// 1. La règle : ce qui est regroupé…
const meme = (a, b) => assert.equal(cleOrganisme(a), cleOrganisme(b), `${a} = ${b}`);
const autre = (a, b) => assert.notEqual(cleOrganisme(a), cleOrganisme(b), `${a} ≠ ${b}`);
meme('Action autonomie', 'Action Autonomie');
meme("Carrefour d'éducation populaire de Pointe-Saint-Charles", 'Carrefour d’éducation populaire de Pointe-Saint-Charles');
meme('Le Regroupement des Auberges du cœur du Québec', 'Regroupement des Auberges du coeur du Québec');
meme("L'R des centres de femmes du Québec", 'R des centres de femmes du Québec');
meme('Comité chômage de l\'Est de Montréal Inc', 'Comité chômage de l\'Est de Montréal');
meme('Habitations de Lotbinière inc.', 'Habitations de Lotbinière');
meme("Fédération des syndicats de l'enseignement (FSE-CSQ)", "Fédération des syndicats de l'enseignement");
meme('Comité logement de La Petite-Patrie', 'Comité logement de la Petite Patrie');
// … et ce qui ne l'est pas.
autre('Droit collectif Québec', 'Droits collectifs Québec');
autre("Commission de l'éthique en science et en technologie", "Commission de l'éthique en sciences et en technologie");
autre("Regroupement national des conseils régionaux de l'environnement", "Regroupement national des conseils régionaux de l'environnement du Québec");
autre("Comité consultatif de l'environnement de Kativik", "Comité consultatif de l'environnement Kativik");
autre('Ordre des conseillers en ressources humaines agréés', 'Ordre des conseillers en ressources humaines et en relations industrielles agréés du Québec');
autre('TALQ', 'Table des aînés du Québec');
assert.equal(cleOrganisme('Auto-Psy (région de Québec)'), 'auto psy (region de quebec)', 'une parenthèse en mots reste');
assert.ok(estPersonne('Monsieur Farnell Morisset') && estPersonne('Maître Daniel Payette') && estPersonne('Docteure Geneviève Bois'));
assert.ok(!estPersonne('Mouvement Desjardins'));

// 2. L'index sur des données réduites : graphies, mémoires communs, personnes.
const M = (n, depose, date) => ({ date, depose, titre: depose, url: `https://www.assnat.qc.ca/Media/Process.aspx?MediaId=ANQ.Vigie.Bll.DocumentGenerique_${n}&process=Default`, numero: `${n}M` });
const donnees = { misAJour: '2026-10-21', projets: { 7: { num: 7, legislature: 43, titre: 'Loi A', mandats: [{ titre: 'Consultations', commission: 'CFP', memoires: [
  M(1, 'Action autonomie', '2025-01-01'), M(2, 'Action Autonomie', '2025-02-01'),
  M(3, 'Barreau du Québec', '2025-01-05'),
  M(4, 'Barreau du Québec, Chambre des notaires du Québec', '2025-01-06'),
  M(5, 'Association du Barreau canadien, Division du Québec', '2025-01-07'),
  M(6, 'Monsieur Jean Untel', '2025-01-08'),
  M(7, 'Madame Une Telle, Barreau du Québec', '2025-01-09'),
] }] } } };
const ix = indexOrganismes(donnees);
assert.equal(ix.organismes.get('action autonomie').memoires.length, 2, 'deux graphies, un organisme');
assert.equal(ix.organismes.get('barreau du quebec').memoires.length, 3, 'seul + deux mémoires communs');
assert.ok(!ix.organismes.has('chambre des notaires du quebec'), "pas d'organisme inventé à partir d'un morceau jamais déposé seul");
assert.ok(ix.organismes.has('association du barreau canadien, division du quebec'), 'une virgule dans un nom ne coupe pas');
assert.ok(!ix.organismes.has('division du quebec'));
assert.ok(![...ix.organismes.keys()].some((k) => /untel|une telle/.test(k)), 'aucune personne');
assert.equal(chercherOrganismes(ix, 'barreau')[0].cle, 'barreau du quebec', 'commence par la recherche : en tête');
assert.equal(chercherOrganismes(ix, 'x').length, 0, 'au moins 2 caractères');
assert.equal(organisme(ix, 'barreau du quebec').liste[0].date, '2025-01-09', 'du plus récent au plus ancien');
assert.equal(organisme(ix, 'inconnu'), null);

// 3. Les vraies données : le compte réel.
const vrai = chargerIndex();
assert.ok(vrai && vrai.organismes.size > 500, 'index des vrais mémoires');
console.log(`organismes distincts après regroupement : ${vrai.organismes.size}`);

// 4. api/export.js : abonnement vérifié, recherche, liste.
let abonne = true;
const envoyes = [];
const ecritures = [];
const lus = [];
let resendEnPanne = false;
const A = '11111111-1111-1111-1111-111111111111'; // abonnée, suit la CSQ depuis hier
const B = '22222222-2222-2222-2222-222222222222'; // abonné, suit la CSQ depuis ce matin
const CSQ = 'centrale des syndicats du quebec';
const csq = vrai.organismes.get(CSQ);
assert.ok(csq && csq.memoires.length >= 2);
const tables = {
  abonnements: [A, B].map((u) => ({ user_id: u, statut: 'actif', fin: null })),
  organismes_suivis: [{ user_id: A, nom: CSQ }, { user_id: B, nom: CSQ }, { user_id: A, nom: 'organisme disparu' }],
  // Hier, A avait vu tous les mémoires de la CSQ sauf le plus récent.
  alertes_etat: [{ user_id: A, projet: cleEtatOrganisme(CSQ), etat: { vus: csq.memoires.slice(1).map(idMemoire) } }],
};
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const ok = (corps) => ({ ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) });
  if (u.host === 'site.simule') {
    const fichiers = { '/data/site/bills.json': [{ id: 1, num: 1, title: 'Loi', status: 'encours', note: '' }], '/data/site/deputesRaw.json': [], '/data/site/ministers.json': [] };
    return fichiers[u.pathname] ? ok(fichiers[u.pathname]) : { ok: false, status: 404, json: async () => null, text: async () => '' };
  }
  if (u.host === 'api.resend.com') {
    if (resendEnPanne) return { ok: false, status: 500, text: async () => 'panne simulée' };
    envoyes.push(JSON.parse(opts.body));
    return ok({ id: 'x' });
  }
  if (u.host === 'supabase.simule') {
    if (u.pathname === '/auth/v1/user') return ok({ id: A, email: 'a@exemple.test' });
    const m = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(u.pathname);
    if (m) return ok({ id: m[1], email: `${m[1].slice(0, 1)}@exemple.test` });
    const table = u.pathname.replace('/rest/v1/', '');
    if ((opts.method ?? 'GET') === 'POST') { ecritures.push({ table, corps: JSON.parse(opts.body) }); return ok(null); }
    lus.push(u.toString());
    if (table === 'abonnements' && !abonne) return ok([]);
    if (Number(u.searchParams.get('offset')) > 0) return ok([]);
    return ok(tables[table] ?? []);
  }
  throw new Error(`appel réseau inattendu : ${url}`);
};

const { default: exporter } = await import('../api/export.js');
const appeler = async (query, jeton = 'jeton') => {
  const res = { code: 0, corps: null, entetes: {}, status(c) { this.code = c; return this; }, json(c) { this.corps = c; return this; }, send(c) { this.corps = c; return this; }, setHeader(k, v) { this.entetes[k] = v; } };
  await exporter({ query, headers: jeton ? { authorization: `Bearer ${jeton}` } : {} }, res);
  return res;
};
let r = await appeler({ jeu: 'organismes', q: 'centrale syndicats' }, null);
assert.equal(r.code, 401, 'sans connexion');
abonne = false;
r = await appeler({ jeu: 'organismes', q: 'centrale syndicats' });
assert.equal(r.code, 403, 'sans abonnement');
abonne = true;
r = await appeler({ jeu: 'organismes', q: 'CENTRALE des syndicats du Québec' });
assert.equal(r.code, 200);
assert.equal(r.corps.resultats[0].cle, CSQ);
assert.ok(r.corps.resultats.length <= 20);
r = await appeler({ jeu: 'organismes', c: [CSQ, 'organisme disparu'] });
assert.equal(r.corps.organismes[CSQ].liste.length, csq.memoires.length);
assert.ok(r.corps.organismes[CSQ].liste.every((m) => m.num && m.commission !== undefined && /^https:\/\/www\.assnat\.qc\.ca\//.test(m.url)));
assert.equal(r.corps.organismes['organisme disparu'], null);
r = await appeler({ jeu: 'organismes', c: Array.from({ length: 15 }, (_, i) => `x${i}`) });
assert.equal(Object.keys(r.corps.organismes).length, 10, 'au plus 10 organismes par demande');

// 5. Le courriel du matin.
const { envoyerAlertes } = await import('../api/_alertes-assemblee.js');
r = await envoyerAlertes({ apercu: true });
assert.ok(lus.some((x) => /organismes_suivis\?.*portee=eq\.assemblee/.test(x)), 'seulement la portée « assemblee »');
assert.equal(r.apercu.length, 1, 'seule A reçoit un courriel (B : premier suivi, mémorisé sans courriel)');
assert.deepEqual(r.apercu[0].sections.map((s) => `${s.titre}|${s.quoi}|${s.nombre}`), [`${csq.nom}|Nouveaux mémoires en commission|1`]);
assert.equal(envoyes.length + ecritures.length, 0, "l'aperçu n'envoie ni n'écrit rien");

resendEnPanne = true;
r = await envoyerAlertes({});
assert.ok(!ecritures.some((e) => e.table.startsWith('alertes_etat') && e.corps.some((x) => x.user_id === A)), 'A non mémorisée après un échec');
const etatB = ecritures.find((e) => e.table.startsWith('alertes_etat') && e.corps[0].user_id === B)?.corps;
assert.ok(etatB && etatB.find((x) => x.projet === cleEtatOrganisme(CSQ)).etat.vus.length === csq.memoires.length, 'B mémorisé sans courriel');
ecritures.length = 0;

resendEnPanne = false;
r = await envoyerAlertes({});
assert.equal(envoyes.length, 1, 'un seul courriel');
assert.equal(envoyes[0].to, 'a@exemple.test'.replace('a@', '1@'));
assert.match(envoyes[0].html, /Nouveaux mémoires en commission/);
assert.ok(envoyes[0].html.includes(csq.memoires[0].url.replace(/&/g, '&amp;')), 'lien vers le PDF officiel');
const etatA = ecritures.find((e) => e.table.startsWith('alertes_etat') && e.corps[0].user_id === A).corps;
assert.equal(etatA.find((x) => x.projet === cleEtatOrganisme(CSQ)).etat.vus.length, csq.memoires.length);

console.log('suivre un organisme : tous les essais passent');
