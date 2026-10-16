// Code postal ou municipalité → circonscription, pour la boîte de recherche des ministres et
// député·e·s (Martin, 16 oct. 2026 : « je marque Limoilou mais rien ne sort »).
//
// SOURCE : Élections Québec, fichier « Entités administratives et code postal », données brutes
// (https://www.electionsquebec.qc.ca/cartes-electorales/entites-administratives-liees-aux-circonscriptions/).
// Une ligne par code postal et municipalité, avec la circonscription de la carte en vigueur et
// celle de la nouvelle carte (colonnes CO_CIRC_NC / NM_CIRC_NC) : on lit la NOUVELLE, celle du
// scrutin du 5 octobre 2026 (127 circonscriptions). Conditions d'Élections Québec : reproduction
// permise à des fins non lucratives, en citant la source et son droit d'auteur (©) ; la page le
// fait sous la boîte. Un usage commercial demanderait leur autorisation écrite.
//
// SORTIE, légère et lue seulement au moment d'une recherche :
//   data/cp/<3 premiers caractères>.json  { c: [circonscriptions], p: { "1A1": [indices] } }
//   data/cp/municipalites.json            { "Nom": [circonscriptions] }
//
// À RELANCER quand Élections Québec publie une nouvelle version (rien d'automatique : le fichier
// change rarement). Sans argument, le script télécharge le zip et le décompresse avec `unzip` ;
// sinon : node scripts/build-codes-postaux.js chemin/vers/CP_CIRC_MUN_MRC_RA_BRUT.txt

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ZIP = 'https://docs.electionsquebec.qc.ca/ORG/6109a4fc846d2/CP_CIRC_MUN_MRC_RA_BRUT.zip';
const UA = 'DossierQuebec (dossierquebec.ca)';
const SORTIE = 'data/cp';

// Le fichier abrège quelques noms longs. On écrit chaque circonscription comme l'Assemblée
// nationale (data/deputes.json) quand le nom correspond, et ces abréviations à la main.
const ABREGES = {
  'Riv.-du-Loup-Témis.-Basques': 'Rivière-du-Loup–Témiscouata–Les Basques',
};

async function source() {
  if (process.argv[2]) return readFileSync(process.argv[2], 'latin1');
  const dossier = mkdtempSync(join(tmpdir(), 'cp-eq-'));
  const res = await fetch(ZIP, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' sur ' + ZIP);
  writeFileSync(join(dossier, 'cp.zip'), Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', join(dossier, 'cp.zip'), '-d', dossier]);
  const texte = readFileSync(join(dossier, 'CP_CIRC_MUN_MRC_RA_BRUT.txt'), 'latin1');
  rmSync(dossier, { recursive: true, force: true });
  return texte;
}

const cle = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const texte = await source();
const lignes = texte.split(/\r?\n/).filter(Boolean);
const entete = lignes.shift().split(';');
const col = (nom) => { const i = entete.indexOf(nom); if (i < 0) throw new Error('colonne ' + nom + ' absente : le format a changé'); return i; };
const [iCp, iMun, iCirc] = [col('CO_POSTL'), col('NM_MUNCP'), col('NM_CIRC_NC')];

const deputes = existsSync('data/deputes.json') ? JSON.parse(readFileSync('data/deputes.json', 'utf8')).deputes : [];
const parCle = new Map(deputes.map((d) => [cle(d.riding), d.riding]));
const nomCirc = (brut) => ABREGES[brut] || parCle.get(cle(brut)) || brut;

const parFsa = new Map();
const municipalites = new Map();
const circs = new Set();
for (const l of lignes) {
  const c = l.split(';');
  const cp = c[iCp].trim().toUpperCase();
  const circ = c[iCirc] && nomCirc(c[iCirc].trim());
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cp) || !circ) continue;
  circs.add(circ);
  const fsa = cp.slice(0, 3);
  if (!parFsa.has(fsa)) parFsa.set(fsa, new Map());
  const codes = parFsa.get(fsa);
  if (!codes.has(cp.slice(3))) codes.set(cp.slice(3), new Set());
  codes.get(cp.slice(3)).add(circ);
  const mun = c[iMun].trim();
  if (mun) { if (!municipalites.has(mun)) municipalites.set(mun, new Set()); municipalites.get(mun).add(circ); }
}
if (circs.size < 120) throw new Error('seulement ' + circs.size + ' circonscriptions lues : le fichier a changé');

rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(SORTIE, { recursive: true });
for (const [fsa, codes] of parFsa) {
  const liste = [...new Set([...codes.values()].flatMap((s) => [...s]))].sort();
  const p = {};
  for (const [fin, s] of [...codes].sort()) p[fin] = [...s].map((x) => liste.indexOf(x));
  writeFileSync(`${SORTIE}/${fsa}.json`, JSON.stringify({ c: liste, p }));
}
writeFileSync(`${SORTIE}/municipalites.json`, JSON.stringify(Object.fromEntries([...municipalites].sort().map(([m, s]) => [m, [...s].sort()]))));

const inconnues = [...circs].filter((x) => deputes.length && !deputes.some((d) => d.riding === x));
console.log(`✓ codes postaux : ${[...parFsa.values()].reduce((n, m) => n + m.size, 0)} codes en ${parFsa.size} fichiers, ${municipalites.size} municipalités, ${circs.size} circonscriptions.`);
if (inconnues.length) console.log(`  (sans élu·e proclamé·e pour l'instant, ou écrites autrement à l'Assemblée : ${inconnues.join(', ')})`);
