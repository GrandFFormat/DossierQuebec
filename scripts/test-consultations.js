// Essai hors ligne des consultations et mémoires (21 oct. 2026) : scrapers/consultations.js avec un
// faux « fetch » (des extraits réduits des vraies pages d'assnat.qc.ca), puis api/_consultations.js
// et les rappels d'échéance d'api/_alertes-assemblee.js. Aucun réseau.
//   node scripts/test-consultations.js

import assert from 'node:assert/strict';
import { relever, lireMandat, lireMemoires, mandatsDeFiche, dateFr, typeMandat } from '../scrapers/consultations.js';
import { consultationsAVenir, memoiresDe, comptes, rappelsEcheance } from '../api/_consultations.js';
import { alertesAssemblee, cleEcheance } from '../api/_alertes-assemblee.js';

assert.equal(dateFr('Le mardi 10 février 2026'), '2026-02-10');
assert.equal(dateFr('le 1er décembre 2026'), '2026-12-01');
assert.equal(typeMandat('Consultations particulières et auditions publiques sur le projet de loi n° 9'), 'particulieres');
assert.equal(typeMandat('Consultation générale et auditions publiques sur le projet de loi n° 1'), 'generale');
assert.equal(typeMandat('Étude détaillée du projet de loi n° 9'), 'etude');

const FICHE = `<a href='/fr/travaux-parlementaires/commissions/crc/index.html'>CRC</a>
  <a href='/fr/travaux-parlementaires/mandats/Mandat-54647/index.html'>Consultations particulières</a>
  <a href='/fr/travaux-parlementaires/mandats/Mandat-54700/index.html'>Étude détaillée</a>
  <a href='/fr/travaux-parlementaires/mandats/Mandat-54647/index.html'>doublon</a>`;
assert.deepEqual(mandatsDeFiche(FICHE), ['54647', '54700']);

const MANDAT = `<html><body><h1>Commission des relations avec les citoyens</h1>
  <h2 class="titre2TravauxParl">Consultations particulières et auditions publiques sur le projet de loi n° 9, Loi sur le renforcement de la laïcité au Québec</h2>
  <h4>Le mardi 10 février 2026</h4><h4>Le mardi 3 février 2026</h4>
  <a href="https://www.assnat.qc.ca/fr/travaux-parlementaires/commissions/CRC/mandats/Mandat-54647/memoires-deposes.html">Mémoires</a>
  <p>Date de la dernière modification : 17 décembre 2025</p></body></html>`;
const m = lireMandat(MANDAT, 'https://www.assnat.qc.ca/x');
assert.equal(m.commission, 'Commission des relations avec les citoyens');
assert.equal(m.type, 'particulieres');
assert.deepEqual(m.seances, ['2026-02-03', '2026-02-10']);
assert.equal(m.dateLimite, null, 'aucune date limite inventée (« dernière modification » n’en est pas une)');
assert.match(m.urlMemoires, /memoires-deposes\.html$/);
// Une date limite écrite en toutes lettres est prise.
assert.equal(lireMandat(MANDAT.replace('<p>', '<p>Date limite pour transmettre un mémoire : le 4 décembre 2026. '), '').dateLimite, '2026-12-04');
assert.equal(lireMandat(MANDAT.replace('<p>', '<p>Les mémoires doivent parvenir au plus tard le 1er décembre 2026. '), '').dateLimite, '2026-12-01');

const MEMOIRES = `<table id="ListeMemoires"><thead><tr><th>Date</th><th>Déposé par</th><th>Titre</th><th>Numéro</th></tr></thead><tbody>
  <tr><td> 2026-02-10 </td><td> Fédération québécoise des professeures et professeurs d'université </td>
    <td><a href="https://www.assnat.qc.ca/Media/Process.aspx?MediaId=ANQ.Vigie.Bll.DocumentGenerique_1&amp;process=Default">FQPPU (PDF,&nbsp;889&nbsp;Ko)</a></td><td>040M</td></tr>
  <tr><td>2026-02-03</td><td>Église adventiste du septième jour</td><td><a href="/Media/Process.aspx?MediaId=2">Mémoire (PDF, 1 Mo)</a></td><td>039M</td></tr>
</tbody></table>`;
const mem = lireMemoires(MEMOIRES);
assert.equal(mem.length, 2);
assert.deepEqual(mem[0], { date: '2026-02-10', depose: "Fédération québécoise des professeures et professeurs d'université", titre: 'FQPPU', url: 'https://www.assnat.qc.ca/Media/Process.aspx?MediaId=ANQ.Vigie.Bll.DocumentGenerique_1&process=Default', numero: '040M' });
assert.equal(mem[1].url, 'https://www.assnat.qc.ca/Media/Process.aspx?MediaId=2');

// Le passage complet, avec un faux fetch qui compte les requêtes.
const pages = {
  'https://www.assnat.qc.ca/pl9': FICHE,
  'https://www.assnat.qc.ca/fr/travaux-parlementaires/mandats/Mandat-54647/index.html': MANDAT,
  'https://www.assnat.qc.ca/fr/travaux-parlementaires/mandats/Mandat-54700/index.html': '<h1>CRC</h1><h2 class="titre2TravauxParl">Étude détaillée du projet de loi n° 9</h2>',
  'https://www.assnat.qc.ca/fr/travaux-parlementaires/commissions/CRC/mandats/Mandat-54647/memoires-deposes.html': MEMOIRES,
};
const lus = [];
const lireUrl = async (u) => { lus.push(u); if (!(u in pages)) throw new Error(`404 ${u}`); return { html: pages[u], url: u }; };
const bills = [{ id: 26893, num: 9, legislature: 43, introSession: 2, title: 'Loi sur le renforcement de la laïcité au Québec', status: 'sanctionne', lastActivity: '2026-03-01', url: 'https://www.assnat.qc.ca/pl9' }];
const maintenant = Date.parse('2026-10-21T08:00:00Z');
const { donnees, rapport } = await relever({ bills, avant: null, maintenant, lireUrl });
assert.equal(rapport.relus, 1);
assert.equal(lus.length, 4);
assert.equal(donnees.projets[26893].mandats.length, 2);
// Deuxième passage : rien n'a bougé, projet sanctionné → aucune requête.
lus.length = 0;
await relever({ bills, avant: donnees, maintenant: maintenant + 30 * 864e5, lireUrl });
assert.equal(lus.length, 0, 'cache respecté');
// Le projet bouge → relu.
await relever({ bills: [{ ...bills[0], lastActivity: '2026-11-20' }], avant: donnees, maintenant, lireUrl });
assert.equal(lus.length, 4);
// Anti-robot : arrêt immédiat, rien d'écrasé.
const bloque = await relever({ bills: [bills[0], { ...bills[0], id: 2 }], avant: null, maintenant, lireUrl: async () => { throw Object.assign(new Error('anti-robot'), { arret: true }); } });
assert.equal(bloque.rapport.erreurs.length, 1);

// api/_consultations.js
assert.deepEqual(comptes(donnees), { 26893: 2 });
const vue = memoiresDe(donnees, 26893);
assert.equal(vue.memoires.length, 2);
assert.equal(vue.memoires[0].date, '2026-02-10');
assert.equal(vue.consultations.length, 1);
assert.equal(memoiresDe(donnees, 1), null);
assert.equal(consultationsAVenir(donnees, '2026-10-21').length, 0, 'séances passées : rien à venir');
assert.equal(consultationsAVenir(donnees, '2026-02-05').length, 1, 'une séance à venir le 10 févr.');

// Rappels : seulement avec une date limite publiée, dans les 7 jours.
const avecLimite = structuredClone(donnees);
avecLimite.projets[26893].mandats[0].dateLimite = '2026-10-25';
assert.equal(rappelsEcheance(donnees, ['26893'], '2026-10-21').length, 0, 'sans date limite, pas de rappel');
assert.equal(rappelsEcheance(avecLimite, ['26893'], '2026-10-21').length, 1);
assert.equal(rappelsEcheance(avecLimite, ['26893'], '2026-10-10').length, 0, 'trop tôt');
assert.equal(rappelsEcheance(avecLimite, ['999'], '2026-10-21').length, 0, 'projet non suivi');

const lois = [{ id: 26893, num: 9, title: 'Loi sur le renforcement de la laïcité au Québec', legislature: 43, introSession: 2, status: 'sanctionne', note: '' }];
const etat = new Map();
const passe = () => alertesAssemblee({ lois, suivies: ['26893'], dejaVu: (c) => etat.get(c), vusEnDirect: new Set(), consultations: avecLimite, aujourdhui: '2026-10-21' });
let a = passe();
const sec = a.sections.find((s) => s.titre === 'Échéances des consultations');
assert.ok(sec, 'section de rappel présente');
assert.match(sec.lignes[0], /25 oct\. 2026/);
for (const x of a.aMemoriser) etat.set(x.projet, x.etat);
assert.deepEqual(etat.get(cleEcheance('54647')), { dateLimite: '2026-10-25' });
a = passe();
assert.ok(!a.sections.some((s) => s.titre === 'Échéances des consultations'), 'un seul rappel par date limite');
// Par mot-clé, sans suivi.
a = alertesAssemblee({ lois, resumes: { 26893: '<p>laïcité</p>' }, mots: [{ cle: 'mot_1', cherche: 'laïcité' }], dejaVu: () => undefined, consultations: avecLimite, aujourdhui: '2026-10-21' });
assert.ok(a.sections.some((s) => s.titre === 'Échéances des consultations'));
// Sans données de consultations : rien.
a = alertesAssemblee({ lois, suivies: ['26893'], dejaVu: () => undefined, vusEnDirect: new Set(), consultations: null });
assert.ok(!a.sections.some((s) => s.titre === 'Échéances des consultations'));

console.log('test-consultations : tout passe');
