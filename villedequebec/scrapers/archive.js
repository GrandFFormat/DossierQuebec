// Archivage des années révolues.
//
//   node scrapers/archive.js --list            état de l'archive
//   node scrapers/archive.js --year=2025       archive une année précise
//   node scrapers/archive.js --rotate          archive l'année de data/decisions.json
//                                              si ce n'est plus l'année courante
//
// Le site ne montre que l'année en cours : c'est ce qui intéresse quelqu'un qui veut savoir
// ce que sa ville décide en ce moment. Les années précédentes ne disparaissent pas pour
// autant — elles sont écrites compressées dans data/archives/, hors du chemin de chargement
// des pages. Le manifeste data/archives/index.json dit ce qui existe, et c'est la seule
// chose que le site lit.
//
// Sur le volume : on n'archive que les métadonnées, jamais le champ `content`. Une année
// complète, c'est environ 9 000 documents, donc une dizaine de requêtes. Ce n'est pas le
// volume qui pose problème — c'est le robots.txt et l'usage. Voir README.

import { writeFile, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { search, searchAll, decode, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';

const DOSSIER = new URL('../data/archives/', import.meta.url);
const MANIFESTE = new URL('../data/archives/index.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);

const TYPES_DECISIONNELS = ['Résolutions', 'Sommaires et mémoires', 'Procès-verbaux', 'Tableaux des décisions'];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const ko = (octets) => Math.round(octets / 1024).toLocaleString('fr-CA') + ' ko';

async function lireManifeste() {
  try {
    return JSON.parse(await readFile(MANIFESTE, 'utf8'));
  } catch {
    return { generatedAt: null, source: PORTAL, annees: [] };
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

async function archiverAnnee(annee) {
  const ors = TYPES_DECISIONNELS.map((t) => `Type eq '${encodeFieldValue(t)}'`);
  const filter = `Annee eq '${annee}' and (${ors.join(' or ')})`;
  const total = (await search({ filter, top: 0, count: true }))['@odata.count'] ?? 0;

  if (total === 0) {
    console.log(`Aucun document pour ${annee} — rien à archiver.`);
    return null;
  }
  console.log(`${annee} : ${total.toLocaleString('fr-CA')} documents à récupérer…`);

  // Métadonnées seulement : le champ `content` (le texte intégral) n'est pas archivé.
  // Il reste disponible à la source, et il ferait exploser la taille pour rien.
  const select = 'Objet,Numero,Date,Annee,Instance,Uniteadministrative,Type,metadata_storage_name';
  const vus = new Set();
  const decisions = [];

  for await (const row of searchAll({ filter, select, orderby: 'Date desc' }, { pageSize: 1000, max: Infinity })) {
    const id = row.metadata_storage_name;
    if (!id || vus.has(id)) continue;
    vus.add(id);
    decisions.push({
      id,
      numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
      objet: (decode(row.Objet) ?? '').replace(/\s+/g, ' ').trim() || null,
      date: row.Date ?? null,
      annee: row.Annee ?? null,
      type: decode(row.Type),
      instance: decode(row.Instance) === 'null' ? null : decode(row.Instance),
      unite: decode(row.Uniteadministrative) === 'null' ? null : decode(row.Uniteadministrative),
      pdf: PDF_BASE + id,
    });
    if (decisions.length % 2000 === 0) console.log(`  … ${decisions.length.toLocaleString('fr-CA')}`);
  }

  const contenu = {
    annee,
    archiveLe: new Date().toISOString(),
    source: PORTAL,
    note: 'Métadonnées seulement. Le texte intégral reste disponible dans le PDF officiel, dont le lien est conservé.',
    totalDisponible: total,
    nombre: decisions.length,
    facettes: { type: tally(decisions, 'type'), instance: tally(decisions, 'instance') },
    decisions,
  };

  const json = JSON.stringify(contenu);
  const compresse = gzipSync(json, { level: 9 });
  await mkdir(DOSSIER, { recursive: true });
  await writeFile(new URL(`${annee}.json.gz`, DOSSIER), compresse);

  console.log(`  ${decisions.length.toLocaleString('fr-CA')} documents -> ${annee}.json.gz (${ko(json.length)} -> ${ko(compresse.length)})`);

  const manifeste = await lireManifeste();
  manifeste.annees = manifeste.annees.filter((a) => a.annee !== annee);
  manifeste.annees.push({
    annee,
    fichier: `archives/${annee}.json.gz`,
    nombre: decisions.length,
    totalDisponible: total,
    octets: json.length,
    octetsCompresses: compresse.length,
    archiveLe: contenu.archiveLe,
    types: contenu.facettes.type,
  });
  await ecrireManifeste(manifeste);
  return contenu;
}

// Rotation : si data/decisions.json porte encore une année révolue, on l'archive avant que
// la prochaine extraction ne l'écrase. C'est le cas d'usage normal — l'archive se remplit
// toute seule au fil des ans, sans jamais rapatrier deux décennies d'un coup.
async function rotation() {
  let courant;
  try {
    courant = JSON.parse(await readFile(DECISIONS, 'utf8'));
  } catch {
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
  await archiverAnnee(anneeFichier);
  console.log(`\nRelancez « npm run refresh » pour repartir sur ${anneeCourante}.`);
}

async function lister() {
  const manifeste = await lireManifeste();
  if (manifeste.annees.length === 0) {
    console.log('Archive vide. « node scrapers/archive.js --year=2025 » pour commencer.');
    return;
  }
  let totalDocs = 0;
  let totalOctets = 0;
  console.log('Année   Documents   Compressé   Archivé le');
  for (const a of manifeste.annees) {
    totalDocs += a.nombre;
    totalOctets += a.octetsCompresses;
    console.log(
      `${a.annee}    ${String(a.nombre).padStart(7)}   ${ko(a.octetsCompresses).padStart(9)}   ${a.archiveLe.slice(0, 10)}`
    );
  }
  console.log(`\n${manifeste.annees.length} année(s), ${totalDocs.toLocaleString('fr-CA')} documents, ${ko(totalOctets)} au total.`);

  // On vérifie que les fichiers annoncés existent vraiment.
  try {
    const fichiers = new Set(await readdir(DOSSIER));
    for (const a of manifeste.annees) {
      const nom = a.fichier.split('/').pop();
      if (!fichiers.has(nom)) console.warn(`⚠ ${nom} est au manifeste mais absent du disque.`);
      else {
        const info = await stat(new URL(nom, DOSSIER));
        if (info.size !== a.octetsCompresses) console.warn(`⚠ ${nom} : taille sur disque différente du manifeste.`);
      }
    }
  } catch {
    console.warn('⚠ Dossier data/archives/ introuvable.');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.list) return lister();
  if (args.rotate) return rotation();
  if (args.year) {
    await archiverAnnee(String(args.year));
    return;
  }
  console.log(
    'Usage :\n' +
      '  node scrapers/archive.js --list          état de l\'archive\n' +
      '  node scrapers/archive.js --year=2025     archive une année\n' +
      '  node scrapers/archive.js --rotate        archive l\'année révolue de decisions.json\n'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
