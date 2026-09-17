// Registre des votes nominaux de la Ville de Laval.
//
//   node scrapers/votes.js [--year=2026] [--depuis=2026-07-13] [--complet]
//   node scrapers/votes.js --fichier=chemin/vers/CM_PV_ORD_18h30_2026_02_03_2.0.pdf
//
// Quand un membre « demande le vote », le procès-verbal nomme qui se prononce en faveur et qui
// se prononce contre, avec le décompte dans la même phrase (lib/pv.js). Ce scraper lit ces
// passages dans le texte des procès-verbaux — celui que decisions.js a mis en cache dans
// data/textes/, ou le PDF de la Ville si le cache manque.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote conserve le passage brut, et tout écart
// entre les noms extraits et le décompte imprimé est signalé (`avertissements`). Un vote demandé
// mais adopté à l'unanimité n'a pas de noms : il n'entre pas au registre.
//
// --depuis limite la relecture aux séances de la fenêtre (routine quotidienne) ; le reste est
// conservé du fichier précédent. Le 1er du mois, la routine relit tout (--complet).

import { writeFile, readFile } from 'node:fs/promises';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { documentDeSeance, lireJson, casseDePhrase } from './decisions.js';
import { INSTANCES, INSTANCES_ACTIVES, lireNomFichier } from '../lib/lav.js';

const OUT = new URL('../data/votes.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
// Quand la lecture des votes change (ce numéro augmente), le registre est relu en entier.
export const VERSION_LECTURE_VOTES = 1;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// `objets` : les objets lisibles de decisions.json, par numéro, quand on les a.
export function votesDeSeance(seance, pv, objets = new Map()) {
  const votes = [];
  for (const r of decouperResolutions(pv.texte, { prefixe: seance.prefixe, pages: pv.pages })) {
    r.votes.forEach((v, i) => {
      const objet = objets.get(r.numero) ?? casseDePhrase(r.titreMajuscules);
      votes.push({
        id: r.votes.length > 1 ? `${r.numero}#${i + 1}` : r.numero,
        numero: r.numero,
        objet,
        date: seance.date,
        annee: seance.date.slice(0, 4),
        instance: seance.nom,
        seanceId: seance.id,
        dossier: r.sommaire,
        pdf: r.page ? `${pv.url}#page=${r.page}` : pv.url,
        ...v,
        ...classer({ objet, titre: r.titreMajuscules }),
      });
    });
  }
  return votes;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const lu = lireNomFichier(nom);
    if (!lu || lu.genre !== 'PV') throw new Error(`« ${nom} » n'est pas un nom de procès-verbal de la Ville.`);
    const compact = lu.date.replace(/-/g, '');
    const seance = { id: `${lu.instance}-${compact}-${lu.sousType}-${lu.heure}`, instance: lu.instance, nom: INSTANCES[lu.instance].nom, date: lu.date, prefixe: `${lu.instance}-${compact}` };
    const doc = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const votes = votesDeSeance(seance, { url: 'file://' + args.fichier, texte: doc.texte, pages: doc.pages.map((p) => p.texte) });
    console.log(`${nom} : ${votes.length} vote(s) nominal(aux)`);
    for (const v of votes) {
      console.log(`\n${v.id}  ${v.etiquette ?? ''}  ${v.resultat ?? '?'}  pour ${v.pour.length}/${v.decomptePour ?? '?'}  contre ${v.contre.length}/${v.decompteContre ?? '?'}`);
      console.log(`  ${(v.objet ?? '').slice(0, 100)}`);
      console.log(`  contre : ${v.contre.join(', ')}`);
      if (v.avertissements.length) console.log(`  ⚠ ${v.avertissements.join(' · ')}`);
    }
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/index.js");
  const depuis = args.complet ? null : args.depuis ?? null;
  if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) throw new Error('--depuis attend une date au format AAAA-MM-JJ.');
  const precedent = await lireJson(OUT);
  const lecteurAChange = precedent && precedent.versionLecture !== VERSION_LECTURE_VOTES;
  const anneeChangee = precedent && precedent.parametres?.annee !== year;
  const depuisEffectif = precedent?.votes && !lecteurAChange && !anneeChangee ? depuis : null;
  if (depuis && !depuisEffectif) console.log("Registre à reconstruire : relecture de l'année, sans fenêtre.");
  const idsPrecedents = new Set((precedent?.votes ?? []).map((v) => v.id));
  const objets = new Map(((await lireJson(DECISIONS))?.decisions ?? []).filter((d) => d.numero).map((d) => [d.numero, d.objet]));
  const seances = calendrier.seances.filter((s) => s.pv && INSTANCES_ACTIVES.includes(s.instance) && s.date.startsWith(year) && (!depuisEffectif || s.date >= depuisEffectif));

  const votes = [];
  let analysees = 0;
  const seancesVues = new Set();
  for (const seance of seances) {
    let pv;
    try {
      pv = await documentDeSeance(seance, 'PV');
    } catch (err) {
      console.warn(`⚠ ${seance.id} : ${err.message}`);
      continue;
    }
    if (!pv) continue;
    analysees++;
    seancesVues.add(seance.id);
    const lus = votesDeSeance(seance, pv, objets);
    if (lus.length) console.log(`${seance.id} : ${lus.length} vote(s) nominal(aux)`);
    votes.push(...lus);
  }

  for (const v of votes) v.nouveau = precedent ? !idsPrecedents.has(v.id) : null;
  if (depuisEffectif && precedent) {
    const conserves = (precedent.votes ?? []).filter((v) => String(v.annee) === year && !seancesVues.has(v.seanceId));
    for (const v of conserves) v.nouveau = false;
    votes.push(...conserves);
    console.log(`Fenêtre depuis ${depuisEffectif} : ${analysees} séance(s) relue(s), ${conserves.length} vote(s) conservé(s) du fichier précédent.`);
  }
  votes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.id ?? '').localeCompare(b.id ?? ''));

  const douteux = votes.filter((v) => v.avertissements.length > 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: calendrier.source,
    methode:
      'Extraction par analyse du texte des procès-verbaux (PDF de la Ville). ' +
      'Les noms sont lus dans les passages « … demande le vote sur la proposition, laquelle est adoptée par un compte de N en faveur et de M contre : … se prononcent en faveur … ; … se prononcent contre … ». ' +
      'Chaque vote conserve le texte brut et signale tout écart avec le décompte imprimé.',
    parametres: { annee: year, depuis: depuisEffectif, complet: !depuisEffectif },
    versionLecture: VERSION_LECTURE_VOTES,
    totalDisponible: votes.length,
    documentsAnalyses: analysees,
    nombre: votes.length,
    nouveauxDepuisDerniereExecution: precedent ? votes.filter((v) => v.nouveau).length : null,
    avecAvertissement: douteux.length,
    themes: THEMES,
    votes,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${votes.length} votes nominaux écrits dans data/votes.json (${analysees} procès-verbaux analysés).`);
  console.log(`${douteux.length} portent un avertissement d'extraction (à vérifier à la main).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
