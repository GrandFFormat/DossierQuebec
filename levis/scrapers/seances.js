// Le calendrier des séances de l'année, avec les liens vers leurs documents.
//
//   node scrapers/seances.js [--year=2026]
//
// Une seule requête GraphQL à levis.ca (lib/levis.js) : toutes les séances de l'année —
// conseil de la Ville, comité exécutif, trois conseils d'arrondissement — avec le lien vers
// l'ordre du jour et le procès-verbal quand ils sont publiés. C'est ce fichier que lisent
// decisions.js et votes.js.
//
// Une séance déjà connue n'est jamais retirée par une exécution qui ne la voit plus : le
// calendrier n'est pas une source d'effacement. Une séance dont l'instance n'a pas été
// reconnue est gardée à part (`nonReconnues`) pour qu'on la voie, pas lue.

import { writeFile, readFile } from 'node:fs/promises';
import { seancesDeLAnnee, INSTANCES, PAGE_ARCHIVES } from '../lib/levis.js';

const OUT = new URL('../data/seances.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const annee = String(args.year ?? new Date().getFullYear());
  const lues = await seancesDeLAnnee(annee);

  const precedent = await lireJson(OUT);
  const parId = new Map((precedent?.seances ?? []).filter((s) => s.date.startsWith(annee)).map((s) => [s.id, s]));
  const nonReconnues = [];
  // Le plancher du jour : ce que le fichier précédent comptait pour la MÊME année (parId est déjà
  // filtré sur `annee`, donc le passage à l'année suivante ne le déclenche pas). Voir la fin.
  const connuesAvant = parId.size;
  const vides = [];
  for (const s of lues) {
    if (!s.instance) {
      nonReconnues.push(s);
      continue;
    }
    // Deux entrées pour la même instance le même jour (une séance extraordinaire suivie d'une
    // ordinaire, par exemple) : la seconde prend un suffixe plutôt que d'écraser la première.
    let id = s.id;
    for (let n = 2; lues.some((a) => a !== s && a.id === id && lues.indexOf(a) < lues.indexOf(s)); n++) id = `${s.id}_${n}`;
    // « Le calendrier n'est pas une source d'effacement » vaut aussi pour les CHAMPS d'une séance
    // déjà connue : l'API peut répondre 200 avec une relation d'assets vide (procès-verbal délié
    // ou remplacé en cours de téléversement dans Craft), et le lien qu'on avait disparaîtrait
    // alors en silence — decisions.js rangerait la séance en « procès-verbal non publié » sous ses
    // propres décisions. On garde la valeur de la veille, et on le dit (27 septembre 2026).
    const connue = parId.get(id);
    const fusion = { ...(connue ?? {}), ...s, id };
    let perdu = false;
    for (const champ of ['pv', 'pvModifieLe', 'odj']) {
      if (connue?.[champ] && !s[champ]) (fusion[champ] = connue[champ]), (perdu = true);
    }
    if (connue?.documents?.length && !s.documents?.length) (fusion.documents = connue.documents), (perdu = true);
    if (perdu) vides.push(id);
    parId.set(id, fusion);
  }
  const seances = [...parId.values()].sort((a, b) => b.date.localeCompare(a.date) || a.instance.localeCompare(b.instance));

  const compte = {};
  for (const s of seances) {
    compte[s.instance] ??= { seances: 0, avecProcesVerbal: 0 };
    compte[s.instance].seances++;
    if (s.pv) compte[s.instance].avecProcesVerbal++;
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: PAGE_ARCHIVES,
        parametres: { annee },
        instances: INSTANCES,
        nombre: seances.length,
        parInstance: compte,
        nonReconnues: nonReconnues.map(({ titre, date, page, pv, odj }) => ({ titre, date, page, pv, odj })),
        seances,
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`${seances.length} séance(s) en ${annee} écrites dans data/seances.json.`);
  for (const [code, c] of Object.entries(compte)) console.log(`  ${code.padEnd(6)} ${String(c.seances).padStart(3)} séances, ${c.avecProcesVerbal} avec procès-verbal`);
  if (nonReconnues.length) console.warn(`⚠ ${nonReconnues.length} entrée(s) sans instance reconnue : ${nonReconnues.map((s) => s.titre).join(' | ')}`);
  if (vides.length) {
    console.warn(`⚠ ${vides.length} séance(s) dont l'API n'a plus rendu les documents — liens de la veille conservés : ${vides.join(' ')}`);
    process.exitCode = 1;
  }
  // Une lecture qui ne rapporte AUCUNE séance reconnue rendait le fichier de la veille avec un
  // horodatage neuf, en code 0 : rien ne distinguait « la Ville n'a rien publié » de « l'API n'a
  // rien répondu d'exploitable » (liste vide en 200, ou fragment GraphQL qui ne colle plus). Les
  // données restent, le calendrier n'efface pas ; mais le run doit rougir.
  if (connuesAvant > 0 && !lues.some((s) => s.instance)) {
    console.error(`✖ aucune séance reconnue en ${annee}, alors que le fichier précédent en comptait ${connuesAvant} — l'API de levis.ca n'a rien rendu d'exploitable. Données de la veille conservées.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
