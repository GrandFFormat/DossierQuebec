// Registre des votes nominaux de la Ville de Longueuil.
//
//   node scrapers/votes.js [--year=2026] [--depuis=2026-07-13] [--complet]
//   node scrapers/votes.js --fichier=chemin/vers/CO-250121-PV.pdf
//
// Quand un membre demande le vote, le procès-verbal nomme qui a voté en faveur et qui a voté
// contre (lib/pv.js). Ce scraper lit ces passages dans le texte des procès-verbaux — celui que
// decisions.js a mis en cache dans data/textes/, ou le PDF de la Ville si le cache manque.
//
// DEUX ANNÉES, PAS UNE. Depuis l'élection de novembre 2025, le conseil de ville et le conseil
// d'agglomération ont tout adopté à l'unanimité : aucun vote divisé de janvier à juillet 2026.
// Un registre de la seule année en cours serait une page vide, alors que 2025 en compte une
// trentaine. Le registre couvre donc l'année en cours et la précédente, et la page le dit.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote conserve le passage brut, et tout écart
// entre les noms extraits et le décompte imprimé est signalé (`avertissements`).
//
// --depuis limite la relecture aux séances de la fenêtre (routine quotidienne) ; le reste est
// conservé du fichier précédent. Le 1er du mois, la routine relit tout (--complet).

import { writeFile, readFile } from 'node:fs/promises';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, parserOrdreDuJour } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { documentDeSeance, lireJson, casseDePhrase } from './decisions.js';
import { INSTANCES } from '../lib/lgl.js';

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

// `objets` : les titres lisibles de decisions.json, par numéro, quand on les a (année en cours).
export function votesDeSeance(seance, pv, objets = new Map()) {
  const { prefixe } = INSTANCES[seance.instance];
  const votes = [];
  for (const r of decouperResolutions(pv.texte, { prefixe, seanceId: seance.id })) {
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
        pdf: pv.url,
        ...v,
        ...classer({ objet, chapitre: r.chapitre }),
      });
    });
  }
  return votes;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = Number(args.year ?? new Date().getFullYear());
  const annees = [String(year - 1), String(year)];

  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const m = nom.match(/^([A-Z]+?)(X\d?)?-(\d{2})(\d{2})(\d{2})-PV/);
    const instance = m && INSTANCES[m[1]] ? m[1] : 'CO';
    const seance = { id: m ? `${m[1]}${m[2] ?? ''}-${m[3]}${m[4]}${m[5]}` : 'LOCAL', instance, nom: INSTANCES[instance].nom, date: m ? `20${m[3]}-${m[4]}-${m[5]}` : `${year}-01-01` };
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const votes = votesDeSeance(seance, { url: 'file://' + args.fichier, texte: lu.texte });
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
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");
  const depuis = args.complet ? null : args.depuis ?? null;
  if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) throw new Error('--depuis attend une date au format AAAA-MM-JJ.');
  const precedent = await lireJson(OUT);
  const lecteurAChange = precedent && precedent.versionLecture !== VERSION_LECTURE_VOTES;
  const anneesChangees = precedent && precedent.parametres?.annees?.join() !== annees.join();
  const depuisEffectif = precedent?.votes && !lecteurAChange && !anneesChangees ? depuis : null;
  if (depuis && !depuisEffectif) console.log('Registre à reconstruire : relecture des deux années, sans fenêtre.');
  const idsPrecedents = new Set((precedent?.votes ?? []).map((v) => v.id));
  const objets = new Map(((await lireJson(DECISIONS))?.decisions ?? []).filter((d) => d.numero).map((d) => [d.numero, d.objet]));
  const seances = calendrier.seances.filter((s) => s.pv && annees.includes(s.date.slice(0, 4)) && (!depuisEffectif || s.date >= depuisEffectif));

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
    let lus = votesDeSeance(seance, pv, objets);
    // Hors de l'année en cours, decisions.json n'a pas les titres : l'ordre du jour de la séance
    // les donne en casse normale. Lu seulement quand la séance a des votes.
    if (lus.some((v) => !objets.has(v.numero)) && seance.odj) {
      const odj = await documentDeSeance(seance, 'OJ').catch(() => null);
      if (odj) {
        for (const [numero, p] of parserOrdreDuJour(odj.texte, { prefixe: INSTANCES[seance.instance].prefixe })) if (p.objet && !objets.has(numero)) objets.set(numero, p.objet);
        lus = votesDeSeance(seance, pv, objets);
      }
    }
    if (lus.length) console.log(`${seance.id} : ${lus.length} vote(s) nominal(aux)`);
    votes.push(...lus);
  }

  for (const v of votes) v.nouveau = precedent ? !idsPrecedents.has(v.id) : null;
  if (depuisEffectif && precedent) {
    const conserves = (precedent.votes ?? []).filter((v) => annees.includes(String(v.annee)) && !seancesVues.has(v.seanceId));
    for (const v of conserves) v.nouveau = false;
    votes.push(...conserves);
    console.log(`Fenêtre depuis ${depuisEffectif} : ${analysees} séance(s) relue(s), ${conserves.length} vote(s) conservé(s) du fichier précédent.`);
  }
  votes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.id ?? '').localeCompare(b.id ?? ''));

  const douteux = votes.filter((v) => v.avertissements.length > 0);
  const parAnnee = Object.fromEntries(annees.map((a) => [a, votes.filter((v) => v.annee === a).length]));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: calendrier.source,
    methode:
      'Extraction par analyse du texte des procès-verbaux (PDF de la Ville). ' +
      'Les noms sont lus dans les passages « Votent en faveur de cette proposition / Votent contre cette proposition ». ' +
      'Chaque vote conserve le texte brut et signale tout écart avec le décompte imprimé.',
    parametres: { annee: String(year), annees, depuis: depuisEffectif, complet: !depuisEffectif },
    versionLecture: VERSION_LECTURE_VOTES,
    totalDisponible: votes.length,
    documentsAnalyses: analysees,
    nombre: votes.length,
    parAnnee,
    nouveauxDepuisDerniereExecution: precedent ? votes.filter((v) => v.nouveau).length : null,
    avecAvertissement: douteux.length,
    themes: THEMES,
    votes,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${votes.length} votes nominaux écrits dans data/votes.json (${annees.map((a) => `${a} : ${parAnnee[a]}`).join(', ')} ; ${analysees} procès-verbaux analysés).`);
  console.log(`${douteux.length} portent un avertissement d'extraction (à vérifier à la main).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
