// Les membres du conseil d'agglomération de Montréal.
//
//   node scrapers/agglomeration.js
//
// À Québec, il a fallu reconstituer ce conseil depuis les listes de présences des
// procès-verbaux. Montréal publie une liste en données ouvertes — « Liste des élus du
// Conseil d'agglomération » (CC-BY 4.0) : appellation, prénom, nom, fonction,
// arrondissement, district, adresse, téléphone, parti, courriel, responsabilités.
//
// Ce conseil réunit la mairesse ou le maire de Montréal, quinze élus de Montréal désignés
// par le conseil municipal, et les maires des quinze villes liées de l'île (Dollard-Des
// Ormeaux a un second représentant, en raison de sa population). Ses membres des villes
// liées ne siègent PAS au conseil municipal de Montréal.

import { writeFile } from 'node:fs/promises';
import { jeu, ressource, lireCsv, PORTAIL_DONNEES } from '../lib/mtl.js';
import { colonne } from '../lib/csv.js';
import { normaliserEspaces } from '../lib/noms.js';

export const JEU = 'listes-des-elus-du-conseil-d-agglomeration';
const OUT = new URL('../data/agglomeration.json', import.meta.url);

// « Maire de la Ville de Dorval » / « Mairesse de la Cité de Dorval » / « Maire de Montréal-Est »
function villeDe(fonction, arrondissement) {
  if (arrondissement) return 'Montréal';
  const m = String(fonction ?? '').match(/(?:ville|cit[ée]|municipalit[ée]) (?:de |d')\s*(.+)$/i) ?? String(fonction ?? '').match(/maire(?:sse)?\s+(?:de |d')\s*(.+)$/i);
  if (!m) return null;
  const v = normaliserEspaces(m[1]).replace(/[.,;]$/, '');
  return /^montr[ée]al$/i.test(v) ? 'Montréal' : v;
}

export function normaliserMembre(ligne, cles) {
  const col = (...frags) => {
    const c = colonne(cles, ...frags);
    return c ? ligne[c] : '';
  };
  const prenom = normaliserEspaces(col('prenom'));
  const nom = normaliserEspaces(col('nom de famille', 'nom'));
  if (!prenom && !nom) return null;
  const fonction = normaliserEspaces(col('fonction', 'role')) || null;
  const arrondissement = normaliserEspaces(col('arrondissement')) || null;
  const responsabilites = String(col('responsabilit') ?? '')
    .split(/;|\n|\|/)
    .map(normaliserEspaces)
    .filter(Boolean);
  const civilite = normaliserEspaces(col('appellation', 'civilite', 'genre')) || null;
  return {
    nom: [prenom, nom].filter(Boolean).join(' '),
    civilite: civilite ? civilite.replace(/^madame$/i, 'Mme').replace(/^monsieur$/i, 'M.') : null,
    fonction: fonction ? fonction.toLowerCase() : null,
    fonctionTelleQuelle: fonction,
    ville: villeDe(fonction, arrondissement),
    arrondissement,
    district: normaliserEspaces(col('district')) || null,
    parti: normaliserEspaces(col('parti')) || null,
    telephone: normaliserEspaces(col('telephone')) || null,
    courriel: normaliserEspaces(col('courriel', 'email')).split(/\s+/).pop() || null,
    roles: responsabilites,
    // Champs du contrat de données, sans objet ici : Montréal publie la liste, pas les
    // présences. On les laisse à null pour que le site sache qu'il ne doit pas les afficher.
    presences: null,
    absences: null,
    seances: null,
    remplace: [],
  };
}

async function main() {
  const j = await jeu(JEU);
  const r = ressource(j, 'CSV');
  if (!r) throw new Error(`aucune ressource CSV dans le jeu « ${JEU} »`);
  console.log(`Source : ${r.url} (modifié ${r.last_modified ?? '?'})`);
  const { colonnes, cles, lignes } = await lireCsv(r.url);
  console.log(`Colonnes : ${colonnes.join(' | ')}`);
  const membres = lignes.map((l) => normaliserMembre(l, cles)).filter(Boolean);

  const villes = {};
  for (const m of membres) if (m.ville) villes[m.ville] = (villes[m.ville] ?? 0) + 1;
  const sansVille = membres.filter((m) => !m.ville);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: r.url,
    jeu: `${PORTAIL_DONNEES}dataset/${JEU}`,
    licence: j.license_title ?? 'CC-BY 4.0 — Ville de Montréal',
    methode:
      "Liste publiée par la Ville en données ouvertes (« Liste des élus du Conseil d'agglomération »). " +
      'Ce jeu donne la composition, pas les présences aux séances.',
    avertissement:
      "Le conseil d'agglomération est distinct du conseil municipal de Montréal. Les maires des quinze villes " +
      'liées y siègent, mais ne siègent pas au conseil municipal de Montréal et ne représentent aucun district de Montréal.',
    colonnesSource: colonnes,
    seancesAnalysees: null,
    nombre: membres.length,
    villes,
    membres: membres.sort((a, b) => ((a.ville === 'Montréal') - (b.ville === 'Montréal')) || a.nom.localeCompare(b.nom)),
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${membres.length} membres écrits dans data/agglomeration.json`);
  for (const [v, n] of Object.entries(villes).sort((a, b) => b[1] - a[1])) console.log(`  ${v} : ${n}`);
  if (sansVille.length) console.warn(`⚠ Ville non déduite pour : ${sansVille.map((m) => `${m.nom} (${m.fonctionTelleQuelle})`).join(', ')}`);
  // 1 + 15 + 15 + 1 = 32 sièges.
  if (membres.length !== 32) console.warn(`⚠ ${membres.length} membres au lieu des 32 sièges attendus — vacance, ou jeu de données modifié.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
