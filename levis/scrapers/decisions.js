// Les décisions de l'année : les résolutions lues dans les procès-verbaux du conseil de la
// Ville, du comité exécutif et des trois conseils d'arrondissement.
//
//   node scrapers/decisions.js [--year=2026] [--complet] [--seance=CV_2026-06-16]
//   node scrapers/decisions.js --fichier=chemin/vers/un-proces-verbal.pdf [--instance=CV]
//
// INCRÉMENTAL, POUR MÉNAGER LE SERVEUR DE LA VILLE. data/seances.json (scrapers/seances.js)
// dit quelles séances ont un procès-verbal en ligne ; un procès-verbal déjà lu n'est pas
// relu (sauf --complet, ou si la Ville l'a remplacé : sa date de modification a changé).
// Une exécution quotidienne coûte donc zéro PDF les jours calmes, un ou deux les jours de
// publication.
//
// Le texte extrait de chaque PDF (lignes, graisse, hyperliens) est mis en cache dans
// data/textes/ (hors dépôt) pour que votes.js et lexique.js n'aient pas à le retélécharger.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { INSTANCES, pdf as telechargerPdf, PAGE_ARCHIVES } from '../lib/levis.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, extrairePresences } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { PROJETS, projetsDe } from '../lib/projets.js';

const OUT = new URL('../data/decisions.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
const PRESENCES = new URL('../data/presences.json', import.meta.url);
export const CACHE = new URL('../data/textes/', import.meta.url);

const RATTRAPAGE_JOURS = 45;
// Quand le découpage change (ce numéro augmente), les séances déjà lues sont relues à la
// prochaine exécution — depuis le cache, sans rien redemander à la Ville.
export const VERSION_LECTURE = 10;

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

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
};

export async function lireJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

// Le cache de texte : un .json par document (procès-verbal, sommaire), jamais versionné.
export async function ecrireCache(nom, contenu) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(new URL(nom + '.json', CACHE), JSON.stringify(contenu), 'utf8');
}
export async function lireCache(nom) {
  return lireJson(new URL(nom + '.json', CACHE));
}

// Le procès-verbal d'une séance : cache d'abord (s'il correspond au même fichier, dans la
// même version), la Ville ensuite.
export async function procesVerbal(seance, { forcer = false } = {}) {
  if (!seance.pv) return null;
  const nom = `${seance.id}_PV`;
  if (!forcer) {
    const cache = await lireJson(new URL(nom + '.json', CACHE));
    if (cache && cache.url === seance.pv && (cache.modifieLe ?? null) === (seance.pvModifieLe ?? null)) return { ...cache, depuisCache: true };
  }
  const data = await telechargerPdf(seance.pv);
  if (!data) return { url: null, erreur: 'le lien du procès-verbal ne rend pas un PDF' };
  const lu = await lirePdf(data);
  const contenu = {
    url: seance.pv,
    modifieLe: seance.pvModifieLe ?? null,
    nombrePages: lu.nombrePages,
    liens: lu.liens,
    pages: lu.pages.map((p) => ({ numero: p.numero, lignes: p.lignes.map(({ texte, gras }) => ({ texte, gras })) })),
  };
  await ecrireCache(nom, contenu);
  return { ...contenu, depuisCache: false };
}

// Où en est un dossier (un sommaire décisionnel et ses résolutions). Le sommaire de Lévis ne
// porte pas, comme celui de Québec, une « instance décisionnelle » et une date cible lisibles
// d'un coup : on le déduit des résolutions elles-mêmes.
//   - une résolution du conseil de la Ville qui n'est ni un avis de motion ni l'adoption d'un
//     projet de règlement : décision finale (`termine`, Conseil de la Ville) ;
//   - sinon, une résolution du comité exécutif qui « recommande au conseil de la Ville », ou une
//     étape préliminaire d'un règlement : en attente du conseil (`en_cours`) ;
//   - sinon, le comité exécutif a décidé lui-même : `termine`.
// Les conseils d'arrondissement n'ont pas de sommaire : pas de statut.
const PRELIMINAIRE = new Set(['Avis de motion', 'Projet de règlement']);
function statutsDesDossiers(liste) {
  const parDossier = new Map();
  for (const d of liste) {
    delete d.statutDossier;
    delete d.etapeFinale;
    delete d.echeance;
    if (!d.dossier) continue;
    if (!parDossier.has(d.dossier)) parDossier.set(d.dossier, []);
    parDossier.get(d.dossier).push(d);
  }
  for (const groupe of parDossier.values()) {
    const finalAuConseil = groupe.some((d) => d.instanceCode === 'CV' && !PRELIMINAIRE.has(d.type));
    const attendConseil = groupe.some((d) => d.recommandeAuConseil || PRELIMINAIRE.has(d.type));
    const statut = finalAuConseil
      ? { statutDossier: 'termine', etapeFinale: 'Conseil de la Ville' }
      : attendConseil
        ? { statutDossier: 'en_cours', etapeFinale: 'Conseil de la Ville' }
        : { statutDossier: 'termine', etapeFinale: groupe.at(-1).instance };
    for (const d of groupe) Object.assign(d, statut, { echeance: null });
  }
}

export function decisionsDeSeance(seance, pv) {
  const presences = extrairePresences(pv.pages);
  const resolutions = decouperResolutions(pv.pages, { liens: pv.liens, presences });
  const decisions = resolutions.map((r) => ({
    id: r.numero,
    numero: r.numero,
    objet: r.objet,
    // « modifiée par CV3432 » : l'annotation que la greffe écrit à côté du numéro.
    annotation: r.annotation ?? undefined,
    date: seance.date,
    annee: seance.date.slice(0, 4),
    type: r.nature,
    instance: seance.nom,
    instanceCode: seance.instance,
    seanceId: seance.id,
    variante: seance.variante,
    unite: null,
    // Le sommaire décisionnel suit le dossier d'une instance à l'autre (comité exécutif, puis
    // conseil de la Ville) : c'est la clé de suivi des abonnés.
    dossier: r.sommaireId,
    sommaires: r.sommaires,
    sommaireId: r.sommaireId,
    sommairePdf: r.sommairePdf,
    resultat: r.resultat,
    // Ce que le conseil décide, recopié du procès-verbal (conseils d'arrondissement surtout, qui
    // n'ont pas de sommaire) ; `sens` dit si c'est un refus. Voir extraireDispositif (lib/pv.js).
    dispositif: r.nature !== 'Procédure' ? r.dispositif?.paragraphes : undefined,
    refus: r.nature !== 'Procédure' ? r.dispositif?.sens ?? undefined : undefined,
    voteEnregistre: r.votes.length > 0,
    recommandeAuConseil: /recommander au conseil de la Ville/i.test(r.texte) || undefined,
    pdf: r.page ? `${pv.url}#page=${r.page}` : pv.url,
  }));
  decisions.push({
    id: `${seance.id}_PV`,
    numero: null,
    objet: `Procès-verbal — ${seance.nom}, séance ${seance.variante === 'EXTRA' ? 'extraordinaire' : 'ordinaire'} du ${dateLongue(seance.date)}`,
    date: seance.date,
    annee: seance.date.slice(0, 4),
    type: 'Procès-verbal',
    instance: seance.nom,
    instanceCode: seance.instance,
    seanceId: seance.id,
    variante: seance.variante,
    unite: null,
    dossier: null,
    sommaires: [],
    sommaireId: null,
    sommairePdf: null,
    resultat: null,
    voteEnregistre: false,
    pdf: pv.url,
    nombreResolutions: resolutions.length,
    nombrePages: pv.nombrePages,
  });
  return { decisions, resolutions, presences };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Mode local : un PDF, pas de réseau.
  if (args.fichier) {
    const instance = String(args.instance ?? 'CV');
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const seance = { id: 'LOCAL', instance, nom: INSTANCES[instance]?.nom ?? instance, date: args.date ?? `${year}-01-01`, variante: 'ORDI' };
    const { resolutions, presences } = decisionsDeSeance(seance, { url: 'file://' + args.fichier, liens: lu.liens, pages: lu.pages, nombrePages: lu.nombrePages });
    console.log(`${lu.nombrePages} pages, ${resolutions.length} résolution(s) ; ${presences?.presents.length ?? 0} présent(s).`);
    for (const r of resolutions) console.log(`  ${r.numero.padEnd(16)} ${(r.sommaireId ?? '').padEnd(20)} ${(r.resultat ?? '').padEnd(24)} ${(r.objet ?? '(objet non lu)').slice(0, 90)}`);
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const seances = calendrier.seances.filter((s) => s.date.startsWith(year) && s.date <= aujourdhui && !s.annulee && (!args.seance || s.id === args.seance));

  const precedent = await lireJson(OUT);
  const connues = new Map((precedent?.seances ?? []).map((s) => [s.id, s]));
  const decisionsConnues = new Map((precedent?.decisions ?? []).map((d) => [d.id, d]));
  const decisions = new Map(args.complet ? [] : decisionsConnues);
  const presencesPrecedentes = await lireJson(PRESENCES);
  const presences = new Map((presencesPrecedentes?.seances ?? []).map((p) => [p.seanceId, p]));
  const etatSeances = [];
  let lues = 0;

  const ecrire = async (partiel) => {
    const liste = [...decisions.values()].filter((d) => d.annee === year);
    const plusRecentConnu = [...decisionsConnues.values()].reduce((m, d) => ((d.date ?? '') > m ? d.date : m), '');
    const seuil = plusRecentConnu ? ajouterJours(plusRecentConnu, -RATTRAPAGE_JOURS) : '';
    for (const d of liste) d.nouveau = precedent ? !decisionsConnues.has(d.id) && (d.date ?? '') >= seuil : null;
    for (const d of liste) Object.assign(d, classer({ objet: d.type === 'Procès-verbal' ? 'procès-verbal' : d.objet, categorie: d.type, unite: d.unite }));
    liste.sort((a, b) => b.date.localeCompare(a.date) || (a.instance ?? '').localeCompare(b.instance ?? '') || (a.numero ?? '').localeCompare(b.numero ?? '', 'fr', { numeric: true }));
    for (const d of liste) {
      delete d.projets;
      const p = d.type === 'Procès-verbal' ? [] : projetsDe(d.objet);
      if (p.length) d.projets = p;
    }
    statutsDesDossiers(liste);
    const traitees = new Set(etatSeances.map((s) => s.id));
    const etats = [...etatSeances, ...seances.filter((s) => !traitees.has(s.id)).map((s) => connues.get(s.id) ?? { ...s, etat: partiel ? 'non traitée' : 'procès-verbal non publié' })];
    const payload = {
      generatedAt: new Date().toISOString(),
      source: PAGE_ARCHIVES,
      licence: 'Documents publics de la Ville de Lévis — reproduits avec mention de la source et lien vers le document officiel, lecture gratuite (voir README).',
      parametres: { annee: year, instances: Object.keys(INSTANCES) },
      partiel,
      totalDisponible: liste.length,
      nombre: liste.length,
      nouveauxDepuisDerniereExecution: precedent ? liste.filter((d) => d.nouveau).length : null,
      seancesLues: etats.filter((s) => s.etat === 'lue').length,
      seancesEnAttente: etats.filter((s) => s.etat === 'procès-verbal non publié').length,
      themes: THEMES,
      sansTheme: liste.filter((d) => d.themeSource === 'defaut').length,
      facettes: { type: tally(liste, 'type'), instance: tally(liste, 'instance'), unite: tally(liste, 'unite'), theme: tally(liste, 'theme') },
      projets: Object.fromEntries(Object.entries(PROJETS).map(([cle, p]) => [cle, { titre: p.titre, description: p.description, n: liste.filter((d) => d.projets?.includes(cle)).length }])),
      dossiers: {
        termines: new Set(liste.filter((d) => d.statutDossier === 'termine').map((d) => d.dossier)).size,
        enCours: new Set(liste.filter((d) => d.statutDossier === 'en_cours').map((d) => d.dossier)).size,
      },
      seances: etats.sort((a, b) => b.date.localeCompare(a.date)),
      decisions: liste,
    };
    await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
    await writeFile(
      PRESENCES,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: PAGE_ARCHIVES,
          methode: 'Listes « Sont présents / Est absent / Sont excusés » en tête de chaque procès-verbal. « partiellement » est consigné tel quel.',
          parametres: { annee: year },
          seances: [...presences.values()].filter((p) => p.date.startsWith(year)).sort((a, b) => b.date.localeCompare(a.date)),
        },
        null,
        1
      ),
      'utf8'
    );
    return payload;
  };

  for (const seance of seances) {
    const deja = connues.get(seance.id);
    if (!seance.pv) {
      etatSeances.push({ ...seance, etat: 'procès-verbal non publié' });
      continue;
    }
    const inchange = deja?.etat === 'lue' && deja.versionLecture === VERSION_LECTURE && deja.pv === seance.pv && (deja.pvModifieLe ?? null) === (seance.pvModifieLe ?? null);
    if (inchange && !args.complet && !args.seance) {
      etatSeances.push(deja);
      continue;
    }
    let pv;
    try {
      pv = await procesVerbal(seance, { forcer: Boolean(args.complet) && Boolean(args.telecharger) });
    } catch (err) {
      console.warn(`⚠ ${seance.id} : ${err.message}`);
      etatSeances.push({ ...seance, etat: 'erreur', erreur: String(err.message ?? err), essaye: aujourdhui });
      continue;
    }
    if (!pv?.url) {
      etatSeances.push({ ...seance, etat: 'erreur', erreur: pv?.erreur ?? 'procès-verbal illisible', essaye: aujourdhui });
      continue;
    }
    // Les décisions déjà connues de cette séance sont remplacées, pas additionnées : une
    // relecture qui ne trouve plus une résolution ne doit pas la laisser traîner.
    for (const [id, d] of decisions) if (d.seanceId === seance.id) decisions.delete(id);
    const { decisions: nouvelles, resolutions, presences: p } = decisionsDeSeance(seance, pv);
    for (const d of nouvelles) decisions.set(d.id, d);
    if (p) presences.set(seance.id, { seanceId: seance.id, date: seance.date, instance: seance.nom, instanceCode: seance.instance, pdf: pv.url, ...p });
    lues++;
    const avecSommaire = resolutions.filter((r) => r.sommairePdf).length;
    const votes = resolutions.reduce((s, r) => s + r.votes.length, 0);
    console.log(`${seance.id} : ${pv.nombrePages} pages, ${resolutions.length} résolutions, ${avecSommaire} liées à un sommaire, ${votes} vote(s) nominal(aux)${pv.depuisCache ? ' (cache)' : ''}`);
    if (resolutions.length === 0) console.warn(`⚠ ${seance.id} : aucune résolution reconnue — le gabarit du procès-verbal a peut-être changé.`);
    if (!p) console.warn(`⚠ ${seance.id} : liste des présences non reconnue.`);
    etatSeances.push({ ...seance, etat: 'lue', versionLecture: VERSION_LECTURE, nombreResolutions: resolutions.length, lueLe: aujourdhui });
    await ecrire(true);
  }

  const payload = await ecrire(false);
  const liste = payload.decisions;
  console.log(`\n${liste.length} décisions écrites dans data/decisions.json — ${lues} séance(s) lue(s) cette fois, ${payload.seancesEnAttente} en attente de procès-verbal.`);
  if (precedent) console.log(`${payload.nouveauxDepuisDerniereExecution ?? 0} nouveauté(s) depuis la dernière exécution.`);
  console.log('\nPastilles thématiques :');
  for (const { valeur, n } of payload.facettes.theme) console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  console.log(`  ${String(payload.sansTheme).padStart(5)}  (classées par défaut — aucune règle n'a tranché)`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
