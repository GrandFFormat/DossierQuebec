// Registre des votes enregistrés de la Ville de Montréal.
//
//   node scrapers/votes.js [--year=2026] [--depuis=2026-07-13] [--complet]
//   node scrapers/votes.js --fichier=chemin/vers/CM_PV_ORDI_2026-01-26_13h00_FR.pdf
//
// Quand un membre demande un vote enregistré, le procès-verbal nomme qui a voté en
// faveur et qui a voté contre, avec le décompte. Ce scraper lit ces passages dans le
// texte des procès-verbaux — celui que decisions.js a mis en cache dans data/textes/,
// ou le PDF de la Ville si le cache manque — et en fait des données structurées.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote conserve le passage brut,
// et tout écart entre les noms extraits et le décompte officiel est signalé
// (`avertissements`) plutôt que corrigé en douce.
//
// --depuis limite la relecture aux séances de la fenêtre (routine quotidienne) ; ce qui
// est plus ancien est conservé du fichier précédent. Le 1er du mois, la routine relit
// l'année complète (--complet).

import { writeFile, readFile } from 'node:fs/promises';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { documentDeSeance } from './decisions.js';
import { INSTANCES, idSeance } from '../lib/mtl.js';

const OUT = new URL('../data/votes.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);

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

export function votesDeSeance(seance, pv) {
  const votes = [];
  for (const r of decouperResolutions(pv.texte, { instance: seance.instance })) {
    if (!r.vote) continue;
    votes.push({
      id: r.numero,
      numero: r.numero,
      objet: r.objet,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      instance: seance.nom,
      seanceId: seance.id,
      dossier: r.dossier,
      pdf: pv.url,
      ...r.vote,
      ...classer({ objet: r.objet, unite: null }),
    });
  }
  return votes;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const m = nom.match(/^(CM|CG|CE)_PV(?:_[A-Z]+)?_(ORDI|EXTRA)_(\d{4}-\d{2}-\d{2})_(\d{2}h\d{2})/);
    const instance = m ? m[1] : args.instance ?? 'CM';
    const seance = { id: m ? idSeance({ instance, date: m[3], heure: m[4] }) : 'LOCAL', instance, nom: INSTANCES[instance].nom, date: m ? m[3] : `${year}-01-01` };
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const votes = votesDeSeance(seance, { url: 'file://' + args.fichier, texte: lu.texte });
    console.log(`${nom} : ${votes.length} vote(s) enregistré(s)`);
    for (const v of votes) {
      console.log(`\n${v.numero}  ${v.resultat ?? '?'}  pour ${v.pour.length}/${v.decomptePour ?? '?'}  contre ${v.contre.length}/${v.decompteContre ?? '?'}`);
      console.log(`  ${(v.objet ?? '').slice(0, 100)}`);
      if (v.avertissements.length) console.log(`  ⚠ ${v.avertissements.join(' · ')}`);
    }
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error('data/seances.json manquant — lancez d\'abord scrapers/seances.js');
  const depuis = args.complet ? null : args.depuis ?? null;
  if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) {
    console.error('--depuis attend une date au format AAAA-MM-JJ.');
    process.exit(1);
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const seances = calendrier.seances.filter((s) => s.date.startsWith(year) && s.date <= aujourdhui && (!depuis || s.date >= depuis));

  const precedent = await lireJson(OUT);
  const idsPrecedents = new Set((precedent?.votes ?? []).map((v) => v.id));
  const votes = [];
  let analysees = 0;
  const seancesVues = new Set();
  for (const seance of seances) {
    const pv = await documentDeSeance(seance, 'PV');
    if (!pv) continue;
    analysees++;
    seancesVues.add(seance.id);
    votes.push(...votesDeSeance(seance, pv));
  }

  for (const v of votes) v.nouveau = precedent ? !idsPrecedents.has(v.id) : null;
  const nouveaux = precedent ? votes.filter((v) => v.nouveau).length : null;

  // Fenêtre : ce qui est hors fenêtre est conservé du fichier précédent.
  if (depuis && precedent) {
    const conserves = (precedent.votes ?? []).filter((v) => String(v.annee) === year && !seancesVues.has(v.seanceId) && (v.date ?? '') < depuis);
    for (const v of conserves) v.nouveau = false;
    votes.push(...conserves);
    console.log(`Fenêtre depuis ${depuis} : ${analysees} séance(s) relue(s), ${conserves.length} vote(s) conservé(s) du fichier précédent.`);
  }
  votes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.numero ?? '').localeCompare(b.numero ?? ''));

  const douteux = votes.filter((v) => v.avertissements.length > 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'https://ville.montreal.qc.ca/documents/Adi_Public/',
    methode:
      'Extraction par analyse du texte des procès-verbaux (PDF de la Ville). ' +
      'Les noms sont lus dans les passages « Votent en faveur / Votent contre ». ' +
      'Chaque vote conserve le texte brut et signale tout écart avec le décompte officiel.',
    parametres: { annee: year, depuis, complet: Boolean(args.complet) },
    totalDisponible: votes.length,
    documentsAnalyses: analysees,
    nombre: votes.length,
    nouveauxDepuisDerniereExecution: nouveaux,
    avecAvertissement: douteux.length,
    themes: THEMES,
    votes,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${votes.length} votes enregistrés écrits dans data/votes.json (${analysees} procès-verbaux analysés).`);
  console.log(`${douteux.length} portent un avertissement d'extraction (à vérifier à la main).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
