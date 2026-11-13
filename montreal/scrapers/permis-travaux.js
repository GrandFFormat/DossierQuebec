// Permis de construction et de démolition des 12 derniers mois, et travaux en cours, par quartier, pour
// « Près de chez moi » de Montréal (12 nov. 2026).
//
//   node scrapers/permis-travaux.js
//
// Sources (donnees.montreal.ca, Ville de Montréal, CC BY 4.0) : « Permis de construction, transformation
// et démolition » et « Entraves et travaux en cours », mis à jour chaque jour par la Ville.
// Permis gardés : constructions, agrandissements et démolitions (codes CO et DE). Les rénovations,
// piscines, abattages et transformations courantes sont laissés de côté, comme à Québec.
// Travaux : les chantiers actifs aujourd'hui. Quand un chantier porte un numéro de contrat qu'on retrouve
// au SEAO (data/contrats.json), on garde le fournisseur, le montant et l'avis : 73 le 12 nov. 2026.
//
// Sortie : data/permis/<quartier>.json, data/permis/index.json et data/entraves.json.

import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { csv, polygones, trouver } from '../../quebec/lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; DossierQuebec/1.0; +https://dossierquebec.ca/montreal/)' };
const lire = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`); return r.text(); };
const PERMIS = 'https://donnees.montreal.ca/dataset/d90eaf1b-2de8-43f0-923a-27a620ecdf41/resource/5232a72d-235a-48eb-ae20-bb9d501300ad/download/permis-construction.csv';
const TRAVAUX = 'https://donnees.montreal.ca/dataset/667342f7-f667-4c3c-9837-65e81312cd8d/resource/cc41b532-f12d-40fb-9f55-eb58c9a2b12b/download/entraves-travaux-en-cours.csv';
const QUARTIERS = 'https://donnees.montreal.ca/dataset/f38c91a1-e33f-4475-a112-3b84b1c60c1e/resource/a80e611f-5336-4306-ba2a-fd657f0f00fa/download/quartierreferencehabitation.geojson';

const nomsQuartiers = JSON.parse(readFileSync('data/adresses/index.json', 'utf8')).quartiers;
const [bP, bT, geoQ] = await Promise.all([lire(PERMIS), lire(TRAVAUX), lire(QUARTIERS)]);
const quartiers = polygones(geoQ, (p) => ({ nom: p.nom_qr }));
const quartierDe = (x, y) => { const q = Number.isFinite(x) && Number.isFinite(y) ? trouver(quartiers, x, y) : null; return q ? nomsQuartiers.indexOf(q.nom) : -1; };
const titre = (s) => String(s ?? '').trim().toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

// ---------- PERMIS ----------
const P = csv(bP);
const hp = P[0];
const p = (n) => hp.indexOf(n);
const fin = P.slice(1).reduce((m, l) => ((l[p('date_emission')] || '') > m ? l[p('date_emission')] : m), '');
const debut = new Date(new Date(fin).getTime() - 365 * 864e5).toISOString().slice(0, 10);
const RETENU = /construction|agrandissement|d[ée]molition|b[âa]t\.?\s*principal/i;
const EXCLU = /piscine|spa|abattage|r[ée]novation|excavation|transformation|d[ée]pendance/i;
const parQuartier = {};
let nP = 0;
for (const l of P.slice(1)) {
  const date = l[p('date_emission')] || '';
  if (date < debut) continue;
  const code = l[p('code_type_base_demande')], type = l[p('description_type_demande')] || '';
  if (!/^(CO|DE)$/.test(code) || !RETENU.test(type) || EXCLU.test(type)) continue;
  const x = Number(l[p('longitude')]), y = Number(l[p('latitude')]);
  const i = quartierDe(x, y);
  if (i < 0) continue;
  const genre = code === 'DE' ? 'Démolition d’un bâtiment' : /agrandissement/i.test(type) ? 'Agrandissement' : 'Construction';
  const logements = Number(l[p('nb_logements')]) || 0;
  const motif = `${genre}${logements && code === 'CO' ? ` (${logements} logement${logements > 1 ? 's' : ''})` : ''}`;
  (parQuartier[i] ||= []).push([date, titre(l[p('emplacement')]).replace(/\s+/g, ' '), motif, l[p('id_permis')], +y.toFixed(5), +x.toFixed(5)]);
  nP++;
}
rmSync('data/permis', { recursive: true, force: true });
mkdirSync('data/permis', { recursive: true });
const comptes = {};
for (const [i, liste] of Object.entries(parQuartier)) {
  liste.sort((a, b) => b[0].localeCompare(a[0]));
  comptes[i] = liste.length;
  writeFileSync(`data/permis/${i}.json`, JSON.stringify(liste));
}
writeFileSync('data/permis/index.json', JSON.stringify({ source: 'Permis de construction, transformation et démolition, Ville de Montréal (CC BY 4.0)', extraction: new Date().toISOString(), debut, fin, comptes }));

// ---------- TRAVAUX ----------
const contrats = existsSync('data/contrats.json') ? JSON.parse(readFileSync('data/contrats.json', 'utf8')).contrats : [];
const parNumero = new Map();
for (const c of contrats) if (c.numero && !parNumero.has(c.numero)) parNumero.set(c.numero, c);
const T = csv(bT);
const ht = T[0];
const t = (n) => ht.indexOf(n);
const maintenant = new Date().toISOString();
const travaux = {};
let nT = 0, relies = 0;
for (const l of T.slice(1)) {
  if (l[t('permitcategory')] !== 'Travaux') continue;
  if (!(l[t('duration_start_date')] <= maintenant && l[t('duration_end_date')] >= maintenant)) continue;
  const x = Number(l[t('longitude')]), y = Number(l[t('latitude')]);
  const i = quartierDe(x, y);
  if (i < 0) continue;
  const c = parNumero.get(l[t('contractnumber')]);
  if (c) relies++;
  const deVille = /Ville de Montr[ée]al/i.test(l[t('submittercategory')] || '') || /organisation publique/i.test(l[t('submittercategory')] || '');
  (travaux[i] ||= []).push([
    `${l[t('occupancy_name')] || ''}${l[t('reason_category')] && l[t('reason_category')] !== 'Autre' ? ` : ${l[t('reason_category')].toLowerCase()}` : ''}`,
    (l[t('duration_start_date')] || '').slice(0, 10), (l[t('duration_end_date')] || '').slice(0, 10),
    deVille ? 'public' : 'prive', +y.toFixed(5), +x.toFixed(5),
    c ? [c.fournisseur, c.montant, (c.url || '').split('ItemId=')[1] || ''] : null,
  ]);
  nT++;
}
for (const l of Object.values(travaux)) l.sort((a, b) => a[2].localeCompare(b[2]));
writeFileSync('data/entraves.json', JSON.stringify({ source: 'Entraves et travaux en cours, Ville de Montréal (CC BY 4.0)', extraction: new Date().toISOString(), parQuartier: travaux }));
console.log(`Permis : ${nP} du ${debut} au ${fin}. Travaux : ${nT} chantiers actifs, dont ${relies} reliés à un contrat SEAO.`);
