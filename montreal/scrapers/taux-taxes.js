// Taux de taxes résidentiels de l'année en cours, arrondissement par arrondissement, pour le calculateur
// de la page Budget et taxes de Montréal (12 nov. 2026).
//
//   node scrapers/taux-taxes.js
//
// Source : « Imposition annuelle de taxes municipales », Ville de Montréal, donnees.montreal.ca (CC BY 4.0).
// Chaque ligne du jeu est une ligne d'un compte de taxes, avec son taux (TAUX_IMPOSI, en $ par $
// d'évaluation). On ne garde AUCUNE donnée de compte : seulement, pour chaque arrondissement et chaque
// taxe, le taux le plus fréquent de l'année la plus récente. Le jeu « Taux de taxation et tarification »
// du même portail s'arrête en 2020 : il ne sert pas.
//
// Lu une fois par année (environ 3 Go, 19 fichiers) : le taux change au budget, pas en cours d'année.
// Sortie : data/taux-arrondissements.json.

import { createReadStream, createWriteStream, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const JEU = 'https://donnees.montreal.ca/api/3/action/package_show?id=taxes-municipales';
// Le portail refuse les clients sans en-tête de navigateur (« RBAC: access denied »).
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; DossierQuebec/1.0; +https://dossierquebec.ca/montreal/)' };

// Les taxes d'un immeuble résidentiel de 5 logements ou moins, reconnues par leur description.
const RESIDENTIEL = [
  ['generale', /^TAXE G[ÉE]N[ÉE]RALE : CAT\. IMM\. R[ÉE]SIDUELLE/i],
  ['eau', /^TAXE SP[ÉE]CIALE EAU : CAT\. IMM\. R[ÉE]SIDUELLE/i],
  ['artm', /^TAXE ARTM : CAT[ÉE]GORIE IMM\. R[ÉE]SIDUELLE/i],
  ['dette', /^DETTE ANC\.VILLE : CAT[ÉE]GORIE IMM\. R[ÉE]SIDUELLE/i],
  ['voirie', /^TAXE SP[ÉE]CIALE VOIRIE : R[ÉE]SIDENTIEL/i],
  ['services', /^TAXE RELATIVE AUX SERVICES/i],
  ['investissements', /^TAXE RELATIVE AUX INVESTISSEMENTS/i],
];

// Une ligne CSV, guillemets compris : des noms d'arrondissement contiennent une virgule
// (« AHUNTSIC, CARTIERVILLE »).
function champs(l) {
  const v = []; let c = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const x = l[i];
    if (q) { if (x === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += x; }
    else if (x === '"') q = true;
    else if (x === ',') { v.push(c); c = ''; }
    else c += x;
  }
  v.push(c);
  return v;
}

const ressources = (await (await fetch(JEU, { headers: UA })).json()).result.resources.filter((r) => /csv/i.test(r.format));
const dossier = join(tmpdir(), 'dq-taxes-mtl');
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });

const arrondissements = {};
let annee = 0;
for (const r of ressources) {
  const fichier = join(dossier, 'a.csv');
  const rep = await fetch(r.url, { headers: UA });
  if (!rep.ok) throw new Error(`${r.name} : HTTP ${rep.status}`);
  await pipeline(Readable.fromWeb(rep.body), createWriteStream(fichier));
  // Première passe : l'année la plus récente du fichier. Deuxième : les taux de cette année.
  const lignes = () => createInterface({ input: createReadStream(fichier), crlfDelay: Infinity });
  let maxAnnee = 0, entetes = null;
  for await (const l of lignes()) {
    if (!entetes) { entetes = l.replace(/^﻿/, '').split(','); continue; }
    const a = Number(champs(l)[2]);
    if (a > maxAnnee) maxAnnee = a;
  }
  annee = Math.max(annee, maxAnnee);
  const iDesc = entetes.indexOf('DESCR_LONGUE'), iTaux = entetes.indexOf('TAUX_IMPOSI'), iNom = entetes.indexOf('NOM_ARRONDISSEMENT');
  const comptes = {};
  let nom = '';
  let premiere = true;
  for await (const l of lignes()) {
    if (premiere) { premiere = false; continue; }
    const v = champs(l);
    if (Number(v[2]) !== maxAnnee) continue;
    nom ||= v[iNom];
    const desc = v[iDesc] ?? '';
    const cle = RESIDENTIEL.find(([, re]) => re.test(desc))?.[0];
    if (!cle) continue;
    const t = Number(v[iTaux]);
    if (!Number.isFinite(t)) continue;
    ((comptes[cle] ||= {})[t] = (comptes[cle][t] || 0) + 1);
  }
  // Le taux le plus fréquent de chaque taxe, converti en $ par 100 $ d'évaluation.
  const taux = {};
  for (const [cle, parTaux] of Object.entries(comptes)) {
    const [t] = Object.entries(parTaux).sort((a, b) => b[1] - a[1])[0];
    taux[cle] = Math.round(Number(t) * 100 * 10000) / 10000;
  }
  arrondissements[r.name.replace(/^Taxes municipales\s*:\s*/i, '').trim()] = { annee: maxAnnee, taux };
  console.log(`${r.name} : ${maxAnnee}`, JSON.stringify(taux));
}
rmSync(dossier, { recursive: true, force: true });

writeFileSync('data/taux-arrondissements.json', JSON.stringify({
  source: 'Imposition annuelle de taxes municipales, Ville de Montréal, donnees.montreal.ca (CC BY 4.0)',
  extraction: new Date().toISOString(), annee, arrondissements,
}, null, 1));
console.log(`Taux de taxes : ${Object.keys(arrondissements).length} arrondissements, année ${annee}.`);
