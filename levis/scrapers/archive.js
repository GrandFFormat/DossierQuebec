// Archivage des années révolues.
//
//   node scrapers/archive.js --list            état de l'archive
//   node scrapers/archive.js --rotate          archive l'année de data/decisions.json
//                                              si ce n'est plus l'année courante
//
// Le site ne montre que l'année en cours. Les années précédentes sont écrites
// compressées dans data/archives/, hors du chemin de chargement des pages ; le site ne
// lit que le manifeste data/archives/index.json.
//
// À Québec, l'archive relisait l'année dans l'index de la Ville. Ici il n'y a pas d'index :
// on archive ce que data/decisions.json contient au moment de la rotation — les
// métadonnées des résolutions, avec le lien vers chaque PDF officiel. Le texte des
// procès-verbaux n'est jamais conservé.

import { writeFile, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const DOSSIER = new URL('../data/archives/', import.meta.url);
const MANIFESTE = new URL('../data/archives/index.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
const VOTES = new URL('../data/votes.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const ko = (octets) => Math.round(octets / 1024).toLocaleString('fr-CA') + ' ko';

async function lireJson(url, defaut) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return defaut;
  }
}

async function ecrireManifeste(manifeste) {
  manifeste.generatedAt = new Date().toISOString();
  manifeste.annees.sort((a, b) => b.annee.localeCompare(a.annee));
  await writeFile(MANIFESTE, JSON.stringify(manifeste, null, 1), 'utf8');
}

function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([valeur, n]) => ({ valeur, n }));
}

async function archiver(courant) {
  const annee = courant.parametres?.annee;
  const votes = await lireJson(VOTES, null);
  const contenu = {
    annee,
    archiveLe: new Date().toISOString(),
    source: courant.source,
    note: 'Métadonnées seulement. Le texte intégral reste disponible dans le PDF officiel, dont le lien est conservé.',
    totalDisponible: courant.totalDisponible,
    nombre: courant.decisions.length,
    facettes: { type: tally(courant.decisions, 'type'), instance: tally(courant.decisions, 'instance') },
    seances: courant.seances ?? [],
    decisions: courant.decisions,
    votes: votes && String(votes.parametres?.annee) === String(annee) ? votes.votes : [],
  };
  const json = JSON.stringify(contenu);
  const compresse = gzipSync(json, { level: 9 });
  await mkdir(DOSSIER, { recursive: true });
  await writeFile(new URL(`${annee}.json.gz`, DOSSIER), compresse);
  console.log(`  ${contenu.nombre.toLocaleString('fr-CA')} documents -> ${annee}.json.gz (${ko(json.length)} -> ${ko(compresse.length)})`);

  const manifeste = await lireJson(MANIFESTE, { generatedAt: null, source: courant.source, annees: [] });
  manifeste.annees = manifeste.annees.filter((a) => a.annee !== annee);
  manifeste.annees.push({
    annee,
    fichier: `archives/${annee}.json.gz`,
    nombre: contenu.nombre,
    totalDisponible: contenu.totalDisponible,
    votes: contenu.votes.length,
    octets: json.length,
    octetsCompresses: compresse.length,
    archiveLe: contenu.archiveLe,
    types: contenu.facettes.type,
  });
  await ecrireManifeste(manifeste);
}

async function rotation() {
  const courant = await lireJson(DECISIONS, null);
  if (!courant) {
    console.log('Aucun data/decisions.json à faire tourner.');
    return;
  }
  const anneeFichier = courant.parametres?.annee;
  const anneeCourante = String(new Date().getFullYear());
  if (!anneeFichier) {
    console.log("data/decisions.json ne porte pas d'année — rien à faire.");
    return;
  }
  if (anneeFichier === anneeCourante) {
    console.log(`data/decisions.json porte l'année courante (${anneeFichier}) — rien à archiver.`);
    return;
  }
  console.log(`data/decisions.json porte ${anneeFichier}, on est en ${anneeCourante} : archivage.`);
  await archiver(courant);
  console.log(`\nRelancez « npm run refresh » pour repartir sur ${anneeCourante}.`);
}

async function lister() {
  const manifeste = await lireJson(MANIFESTE, { annees: [] });
  if (manifeste.annees.length === 0) {
    console.log('Archive vide. Elle se remplit à chaque changement d\'année (--rotate).');
    return;
  }
  console.log('Année   Documents   Votes   Compressé   Archivé le');
  for (const a of manifeste.annees) {
    console.log(`${a.annee}    ${String(a.nombre).padStart(7)}   ${String(a.votes ?? 0).padStart(5)}   ${ko(a.octetsCompresses).padStart(9)}   ${a.archiveLe.slice(0, 10)}`);
  }
  try {
    const fichiers = new Set(await readdir(DOSSIER));
    for (const a of manifeste.annees) {
      const nom = a.fichier.split('/').pop();
      if (!fichiers.has(nom)) console.warn(`⚠ ${nom} est au manifeste mais absent du disque.`);
      else if ((await stat(new URL(nom, DOSSIER))).size !== a.octetsCompresses) console.warn(`⚠ ${nom} : taille sur disque différente du manifeste.`);
    }
  } catch {
    console.warn('⚠ Dossier data/archives/ introuvable.');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.list) return lister();
  if (args.rotate) return rotation();
  console.log('Usage :\n  node scrapers/archive.js --list\n  node scrapers/archive.js --rotate\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
