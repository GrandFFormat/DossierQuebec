// Registre des votes nominaux de la Ville de Lévis.
//
//   node scrapers/votes.js [--year=2026] [--depuis=2026-07-13] [--complet]
//
// Quand un membre le demande, le président du conseil « appelle le vote » et le procès-verbal
// nomme qui vote en faveur et qui vote en défaveur (lib/pv.js). Ce scraper lit ces passages
// dans les procès-verbaux mis en cache par decisions.js — ou le PDF de la Ville si le cache
// manque — et en fait des données structurées.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Lévis n'imprime pas de décompte : chaque vote
// est recoupé avec la liste des présences de sa séance et avec le résultat que déclare le
// président ; tout écart va dans `avertissements`, le passage brut est conservé.
//
// --depuis limite la relecture aux séances de la fenêtre (routine quotidienne) ; ce qui est
// plus ancien est conservé du fichier précédent. Le 1er du mois, la routine relit l'année.

import { writeFile } from 'node:fs/promises';
import { decouperResolutions, extrairePresences } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { procesVerbal, lireJson } from './decisions.js';
import { PAGE_ARCHIVES } from '../lib/levis.js';

const OUT = new URL('../data/votes.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
export const VERSION_LECTURE_VOTES = 1;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

export function votesDeSeance(seance, pv) {
  const presences = extrairePresences(pv.pages);
  const votes = [];
  for (const r of decouperResolutions(pv.pages, { liens: pv.liens, presences })) {
    r.votes.forEach((v, i) => {
      votes.push({
        id: r.votes.length > 1 ? `${r.numero}-${i + 1}` : r.numero,
        numero: r.numero,
        objet: r.objet,
        date: seance.date,
        annee: seance.date.slice(0, 4),
        instance: seance.nom,
        seanceId: seance.id,
        dossier: r.sommaireId,
        sommairePdf: r.sommairePdf,
        pdf: r.page ? `${pv.url}#page=${r.page}` : pv.url,
        ...v,
        ...classer({ objet: r.objet, categorie: r.nature, unite: null }),
      });
    });
  }
  return votes;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());
  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");

  const depuis = args.complet ? null : args.depuis ?? null;
  if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) throw new Error('--depuis attend une date au format AAAA-MM-JJ.');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const precedent = await lireJson(OUT);
  const lecteurAChange = precedent && precedent.versionLecture !== VERSION_LECTURE_VOTES;
  const depuisEffectif = precedent?.votes?.length && !lecteurAChange ? depuis : null;
  if (depuis && !depuisEffectif) console.log(lecteurAChange ? "Le lecteur des votes a changé : relecture de toute l'année." : "Registre vide : première passe sur toute l'année, sans fenêtre.");
  const idsPrecedents = new Set((precedent?.votes ?? []).map((v) => v.id));
  // Les conseils d'arrondissement ne nomment pas les votants : on ne lit que le conseil de la
  // Ville et le comité exécutif (qui n'en a encore aucun, mais le jour où il en aura…).
  const seances = calendrier.seances.filter((s) => s.pv && ['CV', 'CE'].includes(s.instance) && s.date.startsWith(year) && s.date <= aujourdhui && (!depuisEffectif || s.date >= depuisEffectif));

  const votes = [];
  let analysees = 0;
  const seancesVues = new Set();
  for (const seance of seances) {
    let pv;
    try {
      pv = await procesVerbal(seance);
    } catch (err) {
      console.warn(`⚠ ${seance.id} : ${err.message}`);
      continue;
    }
    if (!pv?.url) continue;
    analysees++;
    seancesVues.add(seance.id);
    votes.push(...votesDeSeance(seance, pv));
  }

  for (const v of votes) v.nouveau = precedent ? !idsPrecedents.has(v.id) : null;
  const nouveaux = precedent ? votes.filter((v) => v.nouveau).length : null;
  if (depuisEffectif && precedent) {
    const conserves = (precedent.votes ?? []).filter((v) => String(v.annee) === year && !seancesVues.has(v.seanceId) && (v.date ?? '') < depuisEffectif);
    for (const v of conserves) v.nouveau = false;
    votes.push(...conserves);
    console.log(`Fenêtre depuis ${depuisEffectif} : ${analysees} séance(s) relue(s), ${conserves.length} vote(s) conservé(s) du fichier précédent.`);
  }
  votes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.id ?? '').localeCompare(b.id ?? '', 'fr', { numeric: true }));

  const douteux = votes.filter((v) => v.avertissements.length > 0);
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: PAGE_ARCHIVES,
        methode:
          'Extraction par analyse du texte des procès-verbaux (PDF de la Ville). ' +
          'Les noms sont lus dans les passages « … votent en faveur / votent en défaveur de la proposition », après « le président du conseil appelle le vote ». ' +
          "La Ville n'imprime pas de décompte : chaque nom est recoupé avec la liste des présences de la séance, et le résultat avec celui que déclare le président. " +
          'Chaque vote conserve le texte brut et signale tout écart.',
        parametres: { annee: year, depuis: depuisEffectif, complet: Boolean(args.complet) || !depuisEffectif },
        versionLecture: VERSION_LECTURE_VOTES,
        totalDisponible: votes.length,
        documentsAnalyses: analysees,
        nombre: votes.length,
        nouveauxDepuisDerniereExecution: nouveaux,
        avecAvertissement: douteux.length,
        themes: THEMES,
        votes,
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`\n${votes.length} votes nominaux écrits dans data/votes.json (${analysees} procès-verbaux analysés).`);
  console.log(`${douteux.length} portent un avertissement d'extraction (à vérifier à la main).`);
  for (const v of douteux) console.log(`  ${v.id} ${v.date} : ${v.avertissements.join(' · ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
