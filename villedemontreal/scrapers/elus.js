// Les élus de la Ville de Montréal, depuis le jeu de données ouvert « Liste des élus de
// la Ville de Montréal » (CC-BY 4.0).
//
//   node scrapers/elus.js
//
// Contrairement à Québec, pas de page HTML à gratter : la Ville publie un CSV, mis à
// jour à chaque changement, avec le prénom, le nom, le genre, les rôles, les
// responsabilités, l'arrondissement, le district, le parti et les coordonnées.
// L'URL du fichier n'est pas codée en dur : on demande au portail (API CKAN) la
// ressource CSV la plus récente du jeu.
//
// Le conseil municipal compte 65 membres : la mairesse ou le maire, 18 maires
// d'arrondissement et 46 conseillères et conseillers de ville. Le CSV contient aussi
// les 38 conseillères et conseillers D'ARRONDISSEMENT, qui ne siègent qu'à leur conseil
// d'arrondissement : on les garde, marqués `siegeAuConseilMunicipal: false`, parce que la
// page Conseil les montre sous leur arrondissement.

import { writeFile } from 'node:fs/promises';
import { jeu, ressource, lireCsv, PORTAIL_DONNEES } from '../lib/mtl.js';
import { colonne } from '../lib/csv.js';
import { cle, normaliserEspaces } from '../lib/noms.js';

export const JEU = 'listes-des-elus-de-la-ville-de-montreal';
const OUT = new URL('../data/elus.json', import.meta.url);

// La fonction élective telle que la Ville l'écrit — « Mairesse de la Ville de Montréal »,
// « Maire(sse) d'arrondissement », « Conseiller(ère) de la Ville », « Conseiller(ère)
// d'arrondissement » — ramenée à quatre fonctions et à un drapeau.
export function fonctionDe(roles) {
  const r = roles.join(' ').toLowerCase().replace(/\((?:sse|ère|e)\)/g, '');
  if (/maire(?:sse)?\s+(?:de la ville\s+)?de montr/.test(r) || /^maire(?:sse)?$/.test(r.trim())) return { fonction: 'Mairesse ou maire de Montréal', conseil: true };
  if (/maire(?:sse)?\s+d.arrondissement/.test(r)) return { fonction: "Maire d'arrondissement", conseil: true };
  if (/conseill[èe]re?\s+de (?:la )?ville/.test(r)) return { fonction: 'Conseiller de ville', conseil: true };
  if (/conseill[èe]re?\s+d.arrondissement/.test(r)) return { fonction: "Conseiller d'arrondissement", conseil: false };
  return { fonction: roles[0] ?? null, conseil: null };
}

// « Conseiller de la ville; Membre du comité exécutif » / « Maire d'arrondissement\nMembre… »
function decouperRoles(s) {
  return String(s ?? '')
    .split(/;|\n|\|/)
    .map((r) => normaliserEspaces(r))
    .filter(Boolean);
}

export function normaliserMembre(ligne, cles) {
  const col = (...frags) => {
    const c = colonne(cles, ...frags);
    return c ? ligne[c] : '';
  };
  const prenom = normaliserEspaces(col('prenom'));
  const nom = normaliserEspaces(col('nom de famille', 'nom'));
  if (!prenom && !nom) return null;
  // Deux formes de CSV vues chez la Ville : « Rôles » + « Responsabilités » (2021), ou
  // « Fonction élective » + « Fonctions additionnelles » + « Responsabilités CE » (2025).
  const principale = decouperRoles(col('fonction elective', 'roles', 'role'));
  const additionnelles = decouperRoles(col('fonctions additionnelles'));
  const responsabilitesCe = decouperRoles(col('responsabilites ce'));
  const responsabilites = responsabilitesCe.length ? responsabilitesCe : decouperRoles(col('responsabilit'));
  const roles = [...principale, ...additionnelles];
  const { fonction, conseil } = fonctionDe(principale.length ? principale : roles);
  const arrondissement = normaliserEspaces(col('arrondissement')).replace(/^ville de montr[ée]al$/i, '') || null;
  const district = normaliserEspaces(col('nom du district', 'district')) || null;
  const parti = normaliserEspaces(col('nom du parti', 'parti')) || null;
  // La cellule commence parfois par « Tél. : » ; sans numéro derrière, il n'y a rien.
  const telephone = normaliserEspaces(col('telephone (hotel', 'telephone')).replace(/^t[ée]l\.?\s*:?\s*/i, '') || null;
  const courriel = normaliserEspaces(col('courriel', 'email')).split(/\s+/).pop() || null;
  const photo = normaliserEspaces(col('url d\'une photo', 'photo')) || null;

  return {
    nom,
    prenom,
    nomComplet: [prenom, nom].filter(Boolean).join(' '),
    genre: normaliserEspaces(col('genre', 'appellation')) || null,
    fonction,
    siegeAuConseilMunicipal: conseil,
    districtNumero: null, // Montréal ne numérote pas ses districts dans ce jeu ; la clé sert de jointure
    district,
    districtCle: district ? cle(district) : null,
    arrondissement,
    arrondissementCle: arrondissement ? cle(arrondissement) : null,
    parti: parti && /^ind[ée]pendant/i.test(parti) ? 'Indépendant' : parti,
    // Les rôles secondaires (comité exécutif, présidence, commissions) sans la fonction
    // principale, plus les responsabilités que la Ville publie.
    roles: [...roles.filter((r) => r !== roles[0]), ...responsabilites],
    // La Ville publie une colonne « Responsabilités CE » : non vide = membre du comité exécutif.
    comiteExecutif: responsabilitesCe.length > 0 || roles.some((r) => /comit[ée] ex[ée]cutif/i.test(r)),
    telephone,
    // La Ville publie une adresse courriel directe : on la garde sous le nom que le site
    // attend (formulaireCourriel = « comment écrire à cette personne »).
    formulaireCourriel: courriel ? `mailto:${courriel}` : null,
    courriel,
    biographie: null,
    photo,
  };
}

export async function chargerElus() {
  const j = await jeu(JEU);
  const r = ressource(j, 'CSV', 'elus_montreal|liste_elus|courant|2025');
  if (!r) throw new Error(`aucune ressource CSV dans le jeu « ${JEU} »`);
  console.log(`Source : ${r.url} (${r.name ?? ''}, modifié ${r.last_modified ?? '?'})`);
  const { colonnes, cles, lignes } = await lireCsv(r.url);
  console.log(`Colonnes : ${colonnes.join(' | ')}`);
  const membres = lignes.map((l) => normaliserMembre(l, cles)).filter(Boolean);
  return { membres, source: r.url, jeu: j, colonnes };
}

async function main() {
  const { membres, source, jeu: j, colonnes } = await chargerElus();

  const partis = {};
  for (const m of membres) if (m.parti && m.siegeAuConseilMunicipal) partis[m.parti] = (partis[m.parti] ?? 0) + 1;

  const conseil = membres.filter((m) => m.siegeAuConseilMunicipal);
  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    jeu: `${PORTAIL_DONNEES}dataset/${JEU}`,
    licence: j.license_title ?? 'CC-BY 4.0 — Ville de Montréal',
    colonnesSource: colonnes,
    nombre: conseil.length,
    nombreTotal: membres.length,
    partis,
    membres: membres.sort(
      (a, b) =>
        Number(b.siegeAuConseilMunicipal) - Number(a.siegeAuConseilMunicipal) ||
        (a.arrondissement ?? '').localeCompare(b.arrondissement ?? '') ||
        a.nom.localeCompare(b.nom)
    ),
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`${conseil.length} membres du conseil municipal (${membres.length} élus au total) écrits dans data/elus.json`);
  for (const [parti, n] of Object.entries(partis).sort((a, b) => b[1] - a[1])) console.log(`  ${parti} : ${n}`);

  // 65 sièges : 1 + 18 + 46. Un autre compte, c'est une vacance réelle ou un CSV qui a
  // changé de forme — dans les deux cas on veut le savoir.
  if (conseil.length !== 65) console.warn(`\n⚠ ${conseil.length} membres du conseil municipal trouvés au lieu de 65 attendus — à vérifier.`);
  const sansFonction = membres.filter((m) => m.siegeAuConseilMunicipal == null);
  if (sansFonction.length) console.warn(`⚠ Rôle non reconnu : ${sansFonction.map((m) => `${m.nomComplet} (${m.fonction})`).join(', ')}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
