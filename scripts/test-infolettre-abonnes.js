// Essai hors ligne de la section « Pour les abonné·e·s » de l'infolettre de l'Assemblée nationale
// (api/_section-abonnes.js, api/_infolettre.js) et du paramètre mois=AAAA-MM d'api/export.js.
// fetch est remplacé : rien ne part vers Supabase, Resend ni le site. Les données sont les vraies
// (api/consultations-data.json, data/votes.json). Écrit les deux courriels de février 2026 dans un
// dossier temporaire, pour les regarder.
//   node scripts/test-infolettre-abonnes.js

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
const donnees = { consultations: lire('api/consultations-data.json'), votes: lire('data/votes.json') };

const { calculerSection, enrober, sectionComplete, sectionApercu, choisirVersion, aUneSection } = await import('../api/_section-abonnes.js');

// 1. Les chiffres de février 2026.
const s = calculerSection('2026-02', donnees);
assert.equal(s.memoires.total, 436);
assert.equal(s.memoires.projets[0].num, 1);
assert.equal(s.memoires.projets[0].n, 238);
assert.equal(s.memoires.projets.length, 4);
assert.ok(s.memoires.organismes.length <= 6 && s.memoires.organismes.length > 0);
assert.ok(s.memoires.organismes.every((o) => !/^(Madame|Monsieur|Maître|Docteur)/.test(o.nom)), 'pas de particuliers');
assert.equal(s.votes.total, 26);
assert.equal(s.votes.adoption.stage, 'Adoption du principe');
assert.equal(s.votes.adoption.billNum, 9);
assert.ok(s.votes.moinsLarges.length <= 3 && s.votes.moinsLarges.every((v) => v.contre > 0));
assert.ok(s.votes.divises.every((v) => v.partis.every((p) => p.parti !== 'IND')), 'les indépendants ne sont pas un parti');

const complet = sectionComplete(s);
const apercu = sectionApercu(s);
assert.ok(complet.includes('Pour les abonné·e·s') && complet.includes('Abonné·e'));
assert.ok(complet.includes('Ce que février 2026 a apporté à l\'Assemblée nationale'));
assert.ok(complet.includes('Les votes à surveiller') && !/serr/i.test(complet));
assert.ok(complet.includes('registre-des-votes'), 'chaque vote mène au registre');
assert.ok(complet.includes('/mon-dossier?mois=2026-02#mdExport'));
if (!s.votes.divises.length) assert.ok(complet.includes('Aucun député n’a voté autrement que son parti ce mois-ci.'));
assert.ok(apercu.includes('436 mémoires déposés en commission, dont 238 sur le projet de loi n° 1'));
assert.ok(apercu.includes('26 votes nominaux, dont l’adoption du principe du projet de loi n° 9'));
assert.ok(apercu.includes('https://dossierquebec.ca/abonnement') && apercu.includes('dès 9,99 $ par mois'));
assert.ok(!apercu.includes('registre-des-votes') && !apercu.includes('Centrale des syndicats'), 'l’aperçu ne montre rien d’autre');

// 2. Un mois vide : pas de section du tout.
const vide = calculerSection('2026-08', { consultations: { projets: {} }, votes: { votes: [] } });
assert.ok(vide.vide);
assert.equal(enrober(vide), '');
assert.equal(enrober(calculerSection('2026-11', donnees)), '', 'novembre 2026 : rien avant le 17');

// 3. L'envoi : fetch simulé, composé destinataire par destinataire.
const ABONNE = '11111111-1111-1111-1111-111111111111';
const AUTRE = '22222222-2222-2222-2222-222222222222';
const gabarit = (corps) => `<html><body><table width="100%"><tr><td><!--BANDEAU--><h1>L'Assemblée nationale en février 2026</h1><p>Le mot du mois.</p>${corps}<p style="font-size:12px">DossierQuébec<!--DESINSCRIPTION--></p></td></tr></table></body></html>`;
const numeroAssemblee = { ville: 'assemblee', type: 'mensuel', arrondissement: '', langue: 'fr', mois: '2026-02', titre: 'L’Assemblée en février 2026', html: gabarit(enrober(s)), envoyes: 0 };
const numeroVille = { ville: 'quebec', type: 'mensuel', arrondissement: '', langue: 'fr', mois: '2026-09', titre: 'Québec — septembre 2026', html: gabarit('<p>Les décisions de la Ville.</p>'), envoyes: 0 };
assert.ok(aUneSection(numeroAssemblee.html) && !aUneSection(numeroVille.html));

let numeros = [];
const envoyes = [];
const requetes = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  requetes.push(url);
  const json = (corps) => ({ ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) });
  if (url.startsWith('https://api.resend.com/')) { envoyes.push(...JSON.parse(opts.body)); return json({ data: [] }); }
  if (url.startsWith('https://site.simule/')) return json(lire(url.slice('https://site.simule/'.length)));
  const u = new URL(url);
  if (u.pathname === '/rest/v1/infolettre_numeros') return json(opts.method === 'PATCH' ? [] : numeros);
  if (u.pathname === '/rest/v1/infolettre_inscriptions') {
    if (opts.method === 'PATCH') return json([]);
    const ville = /ville=eq\.([a-z-]+)/.exec(url)[1];
    return json([
      { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'abonne@exemple.test', user_id: ABONNE },
      { id: 'aaaaaaaa-0000-0000-0000-000000000002', email: 'autre@exemple.test', user_id: AUTRE },
      { id: 'aaaaaaaa-0000-0000-0000-000000000003', email: 'sanscompte@exemple.test', user_id: null },
    ].map((i) => ({ ...i, ville })));
  }
  if (u.pathname === '/rest/v1/abonnements') return json([{ user_id: ABONNE, statut: 'actif', fin: null }, { user_id: AUTRE, statut: 'annule', fin: null }]);
  throw new Error(`requête imprévue : ${url}`);
};
const { envoyerNumerosEnAttente, envoyerBienvenue, PAR_JOUR } = await import('../api/_infolettre.js');

numeros = [numeroAssemblee];
const r = await envoyerNumerosEnAttente(PAR_JOUR);
assert.equal(r.envoyes, 3);
const pour = (a) => envoyes.find((m) => m.to === a).html;
const htmlAbonne = pour('abonne@exemple.test');
const htmlAutre = pour('autre@exemple.test');
assert.ok(htmlAbonne.includes('Les organismes les plus actifs') && !htmlAbonne.includes('Voir l’abonnement'));
assert.ok(htmlAutre.includes('Voir l’abonnement') && !htmlAutre.includes('Les organismes les plus actifs'));
assert.ok(pour('sanscompte@exemple.test').includes('Voir l’abonnement'), 'sans compte : l’aperçu');
assert.ok(![htmlAbonne, htmlAutre].some((h) => h.includes('<!--ABONNES')), 'aucune balise ne reste');

// Le plafond quotidien tient toujours.
envoyes.length = 0;
const r2 = await envoyerNumerosEnAttente(2);
assert.equal(r2.envoyes, 2);

// Un compte rendu de ville : tel quel, et sans chercher les abonnements.
envoyes.length = 0; requetes.length = 0;
numeros = [numeroVille];
await envoyerNumerosEnAttente(PAR_JOUR);
assert.ok(!requetes.some((u) => u.includes('/abonnements')), 'aucune lecture d’abonnement pour une ville');
assert.ok(envoyes.every((m) => m.html.includes('Les décisions de la Ville.') && !m.html.includes('Pour les abonné·e·s')));

// La bienvenue : le dernier numéro, version selon le destinataire.
envoyes.length = 0;
numeros = [numeroAssemblee];
await envoyerBienvenue([
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'abonne@exemple.test', user_id: ABONNE, ville: 'assemblee', type: 'mensuel', arrondissement: '', langue: 'fr' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', email: 'autre@exemple.test', user_id: AUTRE, ville: 'assemblee', type: 'mensuel', arrondissement: '', langue: 'fr' },
]);
assert.ok(pour('abonne@exemple.test').includes('Bienvenue') && pour('abonne@exemple.test').includes('Les organismes les plus actifs'));
assert.ok(pour('autre@exemple.test').includes('Voir l’abonnement'));

// 4. api/export.js : mois=2026-02.
const { fabriquer } = await import('../api/export.js');
const lignes = (t) => t.trim().split('\r\n').length - 1;
assert.equal(lignes(await fabriquer('votes', '2026-02')), 26);
assert.equal(lignes(await fabriquer('votes-deputes', '2026-02')), s.fichiers.lignesDeputes);
assert.equal(lignes(await fabriquer('votes')), donnees.votes.votes.length, 'sans mois : tout');
const pres = await fabriquer('presences', '2026-02');
assert.ok(pres.split('\r\n')[1].split(';')[3] === '26', 'présences recomptées sur 26 votes');

// 5. Les deux courriels, à regarder.
const dossier = join(tmpdir(), 'infolettre-abonnes');
mkdirSync(dossier, { recursive: true });
writeFileSync(join(dossier, '2026-02-abonne.html'), htmlAbonne);
writeFileSync(join(dossier, '2026-02-non-abonne.html'), htmlAutre);
writeFileSync(join(dossier, 'mois-vide.html'), choisirVersion(gabarit(enrober(vide)), true));
console.log(`OK — section abonné·e·s : février 2026 = ${s.memoires.total} mémoires, ${s.votes.total} votes ; courriels dans ${dossier}`);
