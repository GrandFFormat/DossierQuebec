// Les décisions de l'année : les résolutions lues dans les procès-verbaux du conseil de ville
// et du conseil d'agglomération.
//
//   node scrapers/decisions.js [--year=2026] [--complet] [--seance=CO-260616]
//   node scrapers/decisions.js --fichier=chemin/vers/CO-260616-PV.pdf
//
// INCRÉMENTAL, POUR MÉNAGER LE SERVEUR DE LA VILLE. Le calendrier (data/seances.json, écrit par
// seances.js) donne l'adresse de chaque procès-verbal publié. Une séance déjà lue n'est pas
// relue (sauf --complet ou changement de VERSION_LECTURE) ; une séance dont le procès-verbal
// n'est pas encore publié ne coûte rien — on attend qu'il apparaisse dans la page.
//
// Pour chaque séance : le procès-verbal (PV), découpé en résolutions (lib/pv.js) ; puis l'ordre
// du jour (OJ), qui écrit les mêmes titres en casse normale. Le texte extrait de chaque PDF est
// mis en cache dans data/textes/ (hors dépôt) pour que votes.js et lexique.js ne le
// retéléchargent pas.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { INSTANCES, pdf as telechargerPdf } from '../lib/lgl.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, parserOrdreDuJour } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';

const OUT = new URL('../data/decisions.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
export const CACHE = new URL('../data/textes/', import.meta.url);

const RATTRAPAGE_JOURS = 45;
// Quand le découpage change (ce numéro augmente), les séances déjà lues sont relues à la
// prochaine exécution, sans qu'on ait à le demander.
export const VERSION_LECTURE = 2;

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

export async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

export async function ecrireCache(nom, contenu) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(new URL(nom + '.json', CACHE), JSON.stringify(contenu), 'utf8');
}
export async function lireCache(nom) {
  return lireJson(new URL(nom + '.json', CACHE));
}

// Un document de séance (PV ou OJ) : cache d'abord, la Ville ensuite. On garde le texte de
// chaque page, pour pointer une résolution à sa page (« pdf#page=N »).
export async function documentDeSeance(seance, genre, { forcer = false } = {}) {
  const url = genre === 'PV' ? seance.pv : seance.odj;
  if (!url) return null;
  const nom = `${seance.id}_${genre}`;
  if (!forcer) {
    const cache = await lireCache(nom);
    if (cache && cache.url === url) return { ...cache, depuisCache: true };
  }
  const data = await telechargerPdf(url);
  if (!data) return null;
  const lu = await lirePdf(data);
  const contenu = { url, nombrePages: lu.nombrePages, texte: lu.texte, pages: lu.pages.map((p) => p.texte) };
  await ecrireCache(nom, contenu);
  return { ...contenu, depuisCache: false };
}

function pageDe(pages, numero) {
  const re = new RegExp('^\\s*' + numero.replace(/\./g, '\\.') + '\\s*$', 'm');
  const i = (pages ?? []).findIndex((t) => re.test(t));
  return i >= 0 ? i + 1 : null;
}

// Repli quand l'ordre du jour ne donne pas le titre : les majuscules du procès-verbal remises en
// casse de phrase. Les sigles s'y perdent (« Rtl ») : c'est pourquoi l'ordre du jour passe avant.
export function casseDePhrase(majuscules) {
  if (!majuscules) return null;
  const bas = majuscules.toLocaleLowerCase('fr-CA');
  // Les numéros de règlement et de contrat reprennent leurs capitales : « CO-2025-1311 », « LONG-26-0074 ».
  return (bas.charAt(0).toLocaleUpperCase('fr-CA') + bas.slice(1)).replace(/\b([a-z]{2,4})(-\d{2,4}-\d+)/g, (_, p, r) => p.toUpperCase() + r);
}

export function decisionsDeSeance(seance, pv, odj) {
  const { prefixe } = INSTANCES[seance.instance];
  const resolutions = decouperResolutions(pv.texte, { prefixe, seanceId: seance.id }).filter((r) => !r.nonUtilise);
  const points = odj ? parserOrdreDuJour(odj.texte, { prefixe }) : new Map();
  let objetsDeLOrdreDuJour = 0;

  const decisions = resolutions.map((r) => {
    const point = points.get(r.numero);
    // Le point de l'ordre du jour n'est retenu que s'il parle du même sommaire, quand les deux
    // en citent un : un ordre du jour renuméroté après publication donnerait sinon le titre
    // d'une autre décision.
    const pointFiable = point && (!point.sommaire || !r.sommaire || point.sommaire === r.sommaire) ? point : null;
    if (pointFiable?.objet) objetsDeLOrdreDuJour++;
    const page = pageDe(pv.pages, r.numero);
    const sommaire = r.sommaire ?? pointFiable?.sommaire ?? null;
    return {
      id: r.numero,
      numero: r.numero,
      objet: pointFiable?.objet ?? casseDePhrase(r.titreMajuscules),
      objetSource: pointFiable?.objet ? 'ordre du jour' : 'procès-verbal',
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type: 'Résolution',
      instance: seance.nom,
      seanceId: seance.id,
      categorie: r.chapitre,
      unite: null,
      dossier: sommaire,
      resultat: r.resultat,
      dissidences: r.dissidences,
      modifieePar: r.modifieePar,
      voteEnregistre: r.votes.length > 0,
      pdf: page ? `${pv.url}#page=${page}` : pv.url,
      // Le sommaire n'existe pas en fichier séparé : il est dans le document de séance.
      sommairePdf: sommaire && seance.global ? seance.global : null,
      sommaireId: sommaire,
    };
  });

  const genre = seance.extraordinaire ? 'extraordinaire' : 'ordinaire';
  decisions.push({
    id: `${seance.id}_PV`,
    numero: null,
    objet: `Procès-verbal — ${seance.nom}, séance ${genre} du ${seance.date}`,
    date: seance.date,
    annee: seance.date.slice(0, 4),
    type: 'Procès-verbal',
    instance: seance.nom,
    seanceId: seance.id,
    categorie: null,
    unite: null,
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
  if (seance.global) {
    decisions.push({
      id: `${seance.id}_GLOBAL`,
      numero: null,
      objet: `Document de séance — ${seance.nom}, séance ${genre} du ${seance.date} (ordre du jour et sommaires décisionnels)`,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type: 'Document de séance',
      instance: seance.nom,
      seanceId: seance.id,
      categorie: null,
      unite: null,
      dossier: null,
      resultat: null,
      dissidences: [],
      voteEnregistre: false,
      pdf: seance.global,
      sommairePdf: null,
      sommaireId: null,
    });
  }
  return { decisions, resolutions, objetsDeLOrdreDuJour };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Mode local : un PDF, pas de réseau.
  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const m = nom.match(/^([A-Z]+?)(X\d?)?-(\d{2})(\d{2})(\d{2})-PV/);
    const instance = m && INSTANCES[m[1]] ? m[1] : 'CO';
    const seance = { id: m ? `${m[1]}${m[2] ?? ''}-${m[3]}${m[4]}${m[5]}` : 'LOCAL', instance, nom: INSTANCES[instance].nom, date: m ? `20${m[3]}-${m[4]}-${m[5]}` : `${year}-01-01`, extraordinaire: Boolean(m?.[2]), global: null };
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const { resolutions } = decisionsDeSeance(seance, { url: 'file://' + args.fichier, texte: lu.texte, pages: lu.pages.map((p) => p.texte), nombrePages: lu.nombrePages }, null);
    console.log(`${nom} : ${lu.nombrePages} pages, ${resolutions.length} résolution(s)`);
    for (const r of resolutions) {
      console.log(`  ${r.numero.padEnd(16)} ${(r.sommaire ?? '').padEnd(13)} ${r.resultat ?? '—'}${r.votes.length ? `  [${r.votes.length} vote(s)]` : ''}${r.dissidences.length ? `  [dissidence : ${r.dissidences.join(', ')}]` : ''}`);
      console.log(`  ${''.padEnd(16)} ${(r.titreMajuscules ?? '(titre non lu)').slice(0, 110)}`);
    }
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");
  const seances = calendrier.seances.filter((s) => s.date.startsWith(year) && (!args.seance || s.id === args.seance));

  const precedent = await lireJson(OUT);
  const connues = new Map((precedent?.seances ?? []).map((s) => [s.id, s]));
  const decisionsConnues = new Map((precedent?.decisions ?? []).map((d) => [d.id, d]));
  const decisions = new Map(args.complet ? [] : decisionsConnues);
  const etatSeances = [];
  let lues = 0;

  const ecrire = async () => {
    const liste = [...decisions.values()].filter((d) => d.annee === year);
    const plusRecentConnu = [...decisionsConnues.values()].reduce((m, d) => ((d.date ?? '') > m ? d.date : m), '');
    const seuil = plusRecentConnu ? ajouterJours(plusRecentConnu, -RATTRAPAGE_JOURS) : '';
    for (const d of liste) d.nouveau = precedent ? !decisionsConnues.has(d.id) && (d.date ?? '') >= seuil : null;
    for (const d of liste) Object.assign(d, classer({ objet: d.type === 'Résolution' ? d.objet : 'procès-verbal', chapitre: d.categorie }));
    liste.sort((a, b) => b.date.localeCompare(a.date) || (a.instance ?? '').localeCompare(b.instance ?? '') || ordreNumero(a) - ordreNumero(b));
    const traitees = new Set(etatSeances.map((s) => s.id));
    const etats = [...etatSeances, ...seances.filter((s) => !traitees.has(s.id)).map((s) => connues.get(s.id) ?? { ...s, etat: 'non traitée' })];
    const payload = {
      generatedAt: new Date().toISOString(),
      source: calendrier.source,
      licence: 'Documents publics de la Ville de Longueuil — reproduits avec mention de la source et lien vers le document officiel (voir README).',
      parametres: { annee: year, instances: calendrier.instances },
      totalDisponible: liste.length,
      nombre: liste.length,
      nouveauxDepuisDerniereExecution: precedent ? liste.filter((d) => d.nouveau).length : null,
      seancesLues: etats.filter((s) => s.etat === 'lue').length,
      seancesEnAttente: etats.filter((s) => s.etat === 'procès-verbal non publié').length,
      themes: THEMES,
      sansTheme: liste.filter((d) => d.themeSource === 'defaut').length,
      facettes: { type: tally(liste, 'type'), instance: tally(liste, 'instance'), categorie: tally(liste, 'categorie'), theme: tally(liste, 'theme') },
      seances: etats.sort((a, b) => b.date.localeCompare(a.date)),
      decisions: liste,
    };
    await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
    return payload;
  };

  for (const seance of seances) {
    const deja = connues.get(seance.id);
    if (!seance.pv) {
      etatSeances.push({ ...seance, etat: 'procès-verbal non publié' });
      continue;
    }
    if (deja?.etat === 'lue' && deja.versionLecture === VERSION_LECTURE && deja.pv === seance.pv && !args.complet && !args.seance) {
      etatSeances.push({ ...deja, global: seance.global, odj: seance.odj });
      continue;
    }
    let pv;
    let odj = null;
    try {
      pv = await documentDeSeance(seance, 'PV', { forcer: Boolean(args.complet) });
      if (pv) odj = await documentDeSeance(seance, 'OJ', { forcer: Boolean(args.complet) }).catch(() => null);
    } catch (err) {
      // Une séance qui plante (PDF illisible, réseau) n'emporte pas les autres.
      console.warn(`⚠ ${seance.id} : ${err.message}`);
      etatSeances.push({ ...seance, etat: 'erreur', erreur: String(err.message ?? err) });
      continue;
    }
    if (!pv) {
      etatSeances.push({ ...seance, etat: 'erreur', erreur: "le lien du procès-verbal ne donne pas de PDF" });
      continue;
    }
    // Les décisions précédentes de cette séance sont remplacées, pas additionnées.
    for (const [id, d] of decisions) if (d.seanceId === seance.id) decisions.delete(id);
    const { decisions: nouvelles, resolutions, objetsDeLOrdreDuJour } = decisionsDeSeance(seance, pv, odj);
    for (const d of nouvelles) decisions.set(d.id, d);
    lues++;
    console.log(`${seance.id} : ${pv.nombrePages} pages, ${resolutions.length} résolutions, ${objetsDeLOrdreDuJour} titres pris à l'ordre du jour, ${resolutions.filter((r) => r.sommaire).length} sommaires cités, ${resolutions.reduce((n, r) => n + r.votes.length, 0)} vote(s) nominal(aux)${pv.depuisCache ? ' (cache)' : ''}`);
    if (resolutions.length === 0) console.warn(`⚠ ${seance.id} : aucune résolution reconnue — le gabarit du procès-verbal a peut-être changé.`);
    etatSeances.push({ ...seance, etat: 'lue', versionLecture: VERSION_LECTURE, nombreResolutions: resolutions.length, lueLe: new Date().toISOString().slice(0, 10) });
    await ecrire();
  }

  const payload = await ecrire();
  console.log(`\n${payload.decisions.length} décisions écrites dans data/decisions.json — ${lues} séance(s) lue(s) cette fois, ${payload.seancesEnAttente} en attente de procès-verbal.`);
  if (precedent) console.log(`${payload.nouveauxDepuisDerniereExecution} nouveauté(s) depuis la dernière exécution.`);
  console.log('\nPastilles thématiques :');
  for (const { valeur, n } of payload.facettes.theme) console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  console.log(`  ${String(payload.sansTheme).padStart(5)}  (classées par défaut — aucune règle n'a tranché)`);
}

// « CO-260616-10.2 » après « CO-260616-9.4 » : tri par chapitre puis par point, numériquement.
function ordreNumero(d) {
  const m = (d.numero ?? '').match(/-(\d+)\.(\d+)$/);
  return m ? Number(m[1]) * 1000 + Number(m[2]) : 1e6;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
