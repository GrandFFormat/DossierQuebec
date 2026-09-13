// Les décisions de l'année : les résolutions lues dans les procès-verbaux du conseil
// municipal, du conseil d'agglomération et du comité exécutif.
//
//   node scrapers/decisions.js [--year=2026] [--complet] [--seance=CM_2026-01-26_13h00]
//   node scrapers/decisions.js --fichier=chemin/vers/CM_PV_ORDI_2026-01-26_13h00_FR.pdf
//
// INCRÉMENTAL, POUR MÉNAGER LE SERVEUR DE LA VILLE. Une séance dont le procès-verbal a
// déjà été lu n'est pas relue (sauf --complet). Une séance dont le procès-verbal n'est
// pas encore en ligne — la Ville le publie une fois adopté, à la séance suivante — est
// réessayée à chaque exécution, jusqu'à ce qu'il apparaisse. Une exécution quotidienne
// coûte donc à la Ville quelques requêtes 404 et, les jours de publication, un ou deux
// PDF.
//
// Pour chaque séance : le procès-verbal (PV), découpé en résolutions ; puis l'ordre du
// jour « LPP » (avec liens vers les pièces publiques), d'où l'on tire, par numéro de
// dossier, le lien vers le sommaire décisionnel. Le texte extrait de chaque PDF est mis
// en cache dans data/textes/ (hors dépôt) pour que votes.js et lexique.js n'aient pas à
// le retélécharger.
//
// --fichier lit un PDF local sans rien demander à la Ville : c'est le mode pour vérifier
// le découpage sur un vrai document avant de laisser tourner la routine.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { candidatsDocument, premierDocument, INSTANCES, idSeance } from '../lib/mtl.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, parserOrdreDuJour } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';

const OUT = new URL('../data/decisions.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
export const CACHE = new URL('../data/textes/', import.meta.url);

const RATTRAPAGE_JOURS = 45;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
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

function ajouterJours(dateIso, jours) {
  const d = new Date(dateIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

// Le cache de texte : un .json par document (texte + pages avec liens), jamais versionné.
export async function ecrireCache(nom, contenu) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(new URL(nom + '.json', CACHE), JSON.stringify(contenu), 'utf8');
}
export async function lireCache(nom) {
  return lireJson(new URL(nom + '.json', CACHE));
}

// Lit un document de séance (PV ou ODJ) : cache d'abord, la Ville ensuite.
export async function documentDeSeance(seance, genre, { forcer = false } = {}) {
  const nom = `${seance.id}_${genre}`;
  if (!forcer) {
    const cache = await lireCache(nom);
    if (cache) return { ...cache, depuisCache: true };
  }
  const trouve = await premierDocument(candidatsDocument({ instance: seance.instance, genre, variante: seance.variante, date: seance.date, heure: seance.heure }));
  if (!trouve) return null;
  const lu = await lirePdf(trouve.data);
  const contenu = { url: trouve.url, nombrePages: lu.nombrePages, texte: lu.texte, pages: lu.pages.map((p) => ({ numero: p.numero, lignes: p.lignes, liens: p.liens })) };
  await ecrireCache(nom, contenu);
  return { ...contenu, depuisCache: false };
}

// Sur quelle page du PDF commence chaque résolution — pour un lien « pdf#page=N » qui
// ouvre le document au bon endroit.
function pageDe(pages, numero) {
  const re = new RegExp('^' + numero.replace(/\s+/g, '\\s+') + '\\s*$', 'm');
  for (const p of pages) if (re.test(p.lignes.map((l) => l.texte.trim()).join('\n'))) return p.numero;
  return null;
}

export function decisionsDeSeance(seance, pv, odj) {
  const resolutions = decouperResolutions(pv.texte, { instance: seance.instance });
  const points = odj ? parserOrdreDuJour(odj.pages) : [];
  const parDossier = new Map(points.filter((p) => p.dossier).map((p) => [p.dossier, p]));
  const parArticle = new Map(points.map((p) => [p.article, p]));

  const decisions = resolutions.map((r) => {
    const point = (r.dossier && parDossier.get(r.dossier)) || (r.article && parArticle.get(r.article)) || null;
    const page = pageDe(pv.pages, r.numero);
    return {
      id: r.numero,
      numero: r.numero,
      objet: r.objet ?? point?.objet ?? null,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type: 'Résolution',
      instance: seance.nom,
      seanceId: seance.id,
      unite: null,
      article: r.article,
      dossier: r.dossier,
      resultat: r.resultat,
      dissidences: r.dissidences,
      voteEnregistre: Boolean(r.vote),
      pdf: page ? `${pv.url}#page=${page}` : pv.url,
      sommairePdf: point?.sommairePdf ?? null,
      sommaireId: point?.sommairePdf ? r.dossier : null,
    };
  });

  // Le procès-verbal et l'ordre du jour eux-mêmes, comme documents de la séance.
  decisions.push({
    id: `${seance.id}_PV`,
    numero: null,
    objet: `Procès-verbal — ${seance.nom}, séance ${seance.variante === 'EXTRA' ? 'extraordinaire' : 'ordinaire'} du ${seance.date}`,
    date: seance.date,
    annee: seance.date.slice(0, 4),
    type: 'Procès-verbal',
    instance: seance.nom,
    seanceId: seance.id,
    unite: null,
    article: null,
    dossier: null,
    resultat: null,
    dissidences: [],
    voteEnregistre: false,
    pdf: pv.url,
    sommairePdf: null,
    sommaireId: null,
    nombreResolutions: resolutions.length,
    nombrePages: pv.nombrePages,
  });
  if (odj) {
    decisions.push({
      id: `${seance.id}_ODJ`,
      numero: null,
      objet: `Ordre du jour — ${seance.nom}, séance du ${seance.date} (${points.length} points)`,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type: 'Ordre du jour',
      instance: seance.nom,
      seanceId: seance.id,
      unite: null,
      article: null,
      dossier: null,
      resultat: null,
      dissidences: [],
      voteEnregistre: false,
      pdf: odj.url,
      sommairePdf: null,
      sommaireId: null,
    });
  }
  return { decisions, resolutions, points };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Mode local : un PDF, pas de réseau.
  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const m = nom.match(/^(CM|CG|CE)_PV(?:_[A-Z]+)?_(ORDI|EXTRA)_(\d{4}-\d{2}-\d{2})_(\d{2}h\d{2})/);
    const seance = m
      ? { id: idSeance({ instance: m[1], date: m[3], heure: m[4] }), instance: m[1], nom: INSTANCES[m[1]].nom, date: m[3], heure: m[4], variante: m[2] }
      : { id: 'LOCAL', instance: args.instance ?? 'CM', nom: INSTANCES[args.instance ?? 'CM'].nom, date: args.date ?? `${year}-01-01`, heure: '13h00', variante: 'ORDI' };
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const pv = { url: 'file://' + args.fichier, nombrePages: lu.nombrePages, texte: lu.texte, pages: lu.pages };
    const { decisions, resolutions } = decisionsDeSeance(seance, pv, null);
    console.log(`${nom} : ${lu.nombrePages} pages, ${resolutions.length} résolution(s)`);
    for (const r of resolutions.slice(0, 15)) {
      console.log(`  ${r.numero}  ${r.article ?? '     '}  ${r.dossier ?? '          '}  ${r.resultat ?? '?'}${r.vote ? '  [vote enregistré]' : ''}${r.dissidences.length ? '  [dissidences : ' + r.dissidences.join(', ') + ']' : ''}`);
      console.log(`           ${(r.objet ?? '(objet non lu)').slice(0, 110)}`);
    }
    const sansObjet = resolutions.filter((r) => !r.objet).length;
    const sansDossier = resolutions.filter((r) => !r.dossier).length;
    console.log(`\n${sansObjet} sans objet, ${sansDossier} sans numéro de dossier, ${resolutions.filter((r) => r.vote).length} vote(s) enregistré(s).`);
    if (args.sortie) await writeFile(args.sortie, JSON.stringify({ decisions, resolutions }, null, 1), 'utf8');
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error('data/seances.json manquant — lancez d\'abord scrapers/seances.js');
  const seances = calendrier.seances.filter((s) => s.date.startsWith(year) && (!args.seance || s.id === args.seance));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const precedent = await lireJson(OUT);
  const connues = new Map((precedent?.seances ?? []).map((s) => [s.id, s]));
  const decisionsConnues = new Map((precedent?.decisions ?? []).map((d) => [d.id, d]));
  const decisions = new Map(args.complet ? [] : decisionsConnues);
  const etatSeances = [];
  let lues = 0;
  let introuvables = 0;

  for (const seance of seances) {
    const deja = connues.get(seance.id);
    if (seance.date > aujourdhui) {
      etatSeances.push({ ...seance, etat: 'à venir', pv: null, odj: null });
      continue;
    }
    if (deja?.etat === 'lue' && !args.complet && !args.seance) {
      etatSeances.push(deja);
      continue;
    }
    const pv = await documentDeSeance(seance, 'PV', { forcer: Boolean(args.complet) });
    if (!pv) {
      introuvables++;
      etatSeances.push({ ...seance, etat: 'procès-verbal non publié', pv: null, odj: deja?.odj ?? null, essaye: aujourdhui });
      continue;
    }
    const odj = await documentDeSeance(seance, 'ODJ', { forcer: Boolean(args.complet) });
    const { decisions: nouvelles, resolutions, points } = decisionsDeSeance(seance, pv, odj);
    for (const d of nouvelles) decisions.set(d.id, d);
    lues++;
    const avecSommaire = nouvelles.filter((d) => d.sommairePdf).length;
    console.log(`${seance.id} : ${pv.nombrePages} pages, ${resolutions.length} résolutions, ${points.length} points à l'ordre du jour, ${avecSommaire} liens vers un sommaire${pv.depuisCache ? ' (cache)' : ''}`);
    if (resolutions.length === 0) console.warn(`⚠ ${seance.id} : aucune résolution reconnue — le gabarit du procès-verbal a peut-être changé.`);
    etatSeances.push({ ...seance, etat: 'lue', pv: pv.url, odj: odj?.url ?? null, nombreResolutions: resolutions.length, lueLe: aujourdhui });
  }

  const liste = [...decisions.values()].filter((d) => d.annee === year);
  const plusRecentConnu = [...decisionsConnues.values()].reduce((m, d) => ((d.date ?? '') > m ? d.date : m), '');
  const seuil = plusRecentConnu ? ajouterJours(plusRecentConnu, -RATTRAPAGE_JOURS) : '';
  for (const d of liste) d.nouveau = precedent ? !decisionsConnues.has(d.id) && (d.date ?? '') >= seuil : null;
  for (const d of liste) Object.assign(d, classer({ objet: d.type === 'Résolution' ? d.objet : 'procès-verbal', unite: d.unite }));
  liste.sort((a, b) => b.date.localeCompare(a.date) || (a.instance ?? '').localeCompare(b.instance ?? '') || (a.numero ?? '').localeCompare(b.numero ?? ''));

  const nouveaux = liste.filter((d) => d.nouveau).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'https://ville.montreal.qc.ca/documents/Adi_Public/',
    licence: 'Documents publics de la Ville de Montréal — reproduction avec mention de la source, usage non commercial (voir README).',
    parametres: { annee: year, instances: Object.keys(INSTANCES) },
    totalDisponible: liste.length,
    nombre: liste.length,
    nouveauxDepuisDerniereExecution: precedent ? nouveaux : null,
    seancesLues: etatSeances.filter((s) => s.etat === 'lue').length,
    seancesEnAttente: etatSeances.filter((s) => s.etat === 'procès-verbal non publié').length,
    themes: THEMES,
    sansTheme: liste.filter((d) => d.themeSource === 'defaut').length,
    facettes: {
      type: tally(liste, 'type'),
      instance: tally(liste, 'instance'),
      unite: tally(liste, 'unite'),
      theme: tally(liste, 'theme'),
    },
    seances: etatSeances.sort((a, b) => b.date.localeCompare(a.date)),
    decisions: liste,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${liste.length} décisions écrites dans data/decisions.json — ${lues} séance(s) lue(s) cette fois, ${introuvables} en attente de procès-verbal.`);
  if (precedent) console.log(`${nouveaux} nouveauté(s) depuis la dernière exécution.`);
  console.log('\nPastilles thématiques :');
  for (const { valeur, n } of payload.facettes.theme) console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  console.log(`  ${String(payload.sansTheme).padStart(5)}  (classées par défaut — aucune règle n'a tranché)`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

