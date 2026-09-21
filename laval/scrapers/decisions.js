// Les décisions de l'année : les résolutions lues dans les procès-verbaux du conseil municipal
// et du comité exécutif.
//
//   node scrapers/decisions.js [--year=2026] [--complet] [--seance=CM-20260203-ORD-18h30]
//   node scrapers/decisions.js --fichier=chemin/vers/CM_PV_ORD_18h30_2026_02_03_2.0.pdf
//
// INCRÉMENTAL, POUR MÉNAGER LE SERVEUR DE LA VILLE. Le calendrier (data/seances.json, écrit par
// index.js) donne l'adresse de chaque procès-verbal publié. Une séance déjà lue n'est pas relue
// (sauf --complet, changement de VERSION_LECTURE, ou nouvelle version du PDF) ; une séance dont
// le procès-verbal n'est pas encore publié ne coûte rien.
//
// Pour chaque séance : le procès-verbal (PV), découpé en résolutions (lib/pv.js) ; puis l'ordre
// du jour (ODJ), qui écrit les mêmes objets en casse normale, avec les districts touchés et le
// montant — relié par le numéro de sommaire décisionnel. Le texte extrait de chaque PDF est mis
// en cache dans data/textes/ (hors dépôt) pour que votes.js et lexique.js ne le
// retéléchargent pas.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { INSTANCES, INSTANCES_ACTIVES, pdf as telechargerPdf, lireNomFichier, sommairesDepuisIndex } from '../lib/lav.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, parserOrdreDuJour, apparierOrdreDuJour } from '../lib/pv.js';
import { classer, THEMES } from '../lib/themes.js';
import { projetsDe } from '../lib/projets.js';

const OUT = new URL('../data/decisions.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
const INDEX = new URL('../data/index-documents.json', import.meta.url);
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

// Un document de séance (PV ou ODJ) : cache d'abord, la Ville ensuite. On garde le texte de
// chaque page, pour pointer une résolution à sa page (« pdf#page=N »). Le cache est invalidé
// par l'adresse : une nouvelle version du PDF (« _3.0 ») a une autre adresse.
export async function documentDeSeance(seance, genre, { forcer = false } = {}) {
  const doc = genre === 'PV' ? seance.pv : seance.odj;
  if (!doc?.url) return null;
  const nom = `${seance.id}_${genre}`;
  if (!forcer) {
    const cache = await lireCache(nom);
    if (cache && cache.url === doc.url) return { ...cache, depuisCache: true };
  }
  const data = await telechargerPdf(doc.url);
  if (!data) return null;
  const lu = await lirePdf(data);
  const contenu = { url: doc.url, fichier: doc.fichier, nombrePages: lu.nombrePages, texte: lu.texte, pages: lu.pages.map((p) => p.texte) };
  await ecrireCache(nom, contenu);
  return { ...contenu, depuisCache: false };
}

// Repli quand l'ordre du jour ne donne pas l'objet : les majuscules du procès-verbal remises en
// casse de phrase. Les sigles et les numéros reprennent leurs capitales (« DOS-3623 », « L-13132 »,
// « CDU-1 », « PL-2026-94 ») ; les noms propres, eux, se perdent — c'est pourquoi l'ordre du jour
// passe avant.
export function casseDePhrase(majuscules) {
  if (!majuscules) return null;
  const bas = majuscules.toLocaleLowerCase('fr-CA');
  return (bas.charAt(0).toLocaleUpperCase('fr-CA') + bas.slice(1))
    .replace(/\b([a-z]{1,4})(-\d{1,5}(?:-\d+)?(?:-[a-z])?)\b/g, (_, p, r) => p.toUpperCase() + r.toUpperCase())
    .replace(/\b(cdu|piia|ppcmoi|ccu|rtl|stl|arTM|cmm|omh|sd|ct)\b/g, (m) => m.toUpperCase());
}

// L'objet de l'ordre du jour est un infinitif en minuscules (« adjuger le contrat… ») : une
// capitale au début, rien d'autre.
function capitaliser(s) {
  return s ? s.charAt(0).toLocaleUpperCase('fr-CA') + s.slice(1) : s;
}

// « 2026-09-09 » -> « 9 septembre 2026 ». L'objet d'une fiche est lu par des humains : c'est le
// seul endroit du fichier où une date sert de texte, et une date ISO s'y lisait mal.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function dateEnToutesLettres(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso ?? '');
  const jour = Number(m[3]);
  return `${jour === 1 ? '1er' : jour} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

// « 09h00 » -> « 9 h », « 18h33 » -> « 18 h 33 ».
export function heureEnToutesLettres(heure) {
  const m = String(heure ?? '').match(/^(\d{1,2})h(\d{2})$/);
  if (!m) return String(heure ?? '');
  return `${Number(m[1])} h${m[2] === '00' ? '' : ' ' + m[2]}`;
}

// Le genre de la fiche, d'après le titre du procès-verbal. Tout est une résolution au sens
// large ; on distingue ce qui n'est pas une décision — un dépôt, un avis de motion, une prise
// d'acte — pour que le fil et les pastilles ne les confondent pas avec les décisions.
export function typeDeResolution(titre, corps) {
  const t = titre ?? '';
  if (/^D[ÉE]P[ÔO]T\b/.test(t)) return 'Dépôt';
  if (/^AVIS DE MOTION\b/.test(t)) return 'Avis de motion';
  if (/^AVIS DE PROPOSITION\b/.test(t)) return 'Avis de proposition';
  if (/^CERTIFICAT DE REGISTRE\b/.test(t) || /^\s*de prendre acte\b/i.test(corps ?? '')) return 'Prise d’acte';
  return 'Résolution';
}

export function decisionsDeSeance(seance, pv, odj, sommaires = new Map()) {
  const resolutions = decouperResolutions(pv.texte, { prefixe: seance.prefixe, pages: pv.pages });
  const points = odj ? parserOrdreDuJour(odj.texte) : [];
  const appariement = apparierOrdreDuJour(resolutions, points);
  let objetsDeLOrdreDuJour = 0;

  const decisions = resolutions.map((r) => {
    const point = appariement.get(r.numero) ?? null;
    if (point?.objet) objetsDeLOrdreDuJour++;
    const sommaire = sommaires.get(r.sommaire ?? '') ?? null;
    const type = typeDeResolution(r.titreMajuscules, r.texte);
    let resultat = r.resultat;
    if (!resultat && /\bACCEPT[ÉE]E\b/.test(r.titreMajuscules ?? '')) resultat = 'Adoptée';
    if (!resultat && /\bREJET[ÉE]E\b/.test(r.titreMajuscules ?? '')) resultat = 'Rejetée';
    return {
      id: r.numero,
      numero: r.numero,
      objet: point?.objet ? capitaliser(point.objet) : casseDePhrase(r.titreMajuscules),
      objetSource: point?.objet ? 'ordre du jour' : 'procès-verbal',
      titre: r.titreMajuscules,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type,
      instance: seance.nom,
      seanceId: seance.id,
      sousType: seance.sousTypeLibelle,
      categorie: point?.chapitre ?? null,
      unite: null,
      districts: point?.districts ?? [],
      montant: point?.montant ?? null,
      ct: r.ct ?? point?.ct ?? null,
      dossier: r.sommaire,
      resultat,
      proposeur: r.proposeur,
      appuyeur: r.appuyeur,
      voteEnregistre: r.votes.length > 0,
      pdf: r.page ? `${pv.url}#page=${r.page}` : pv.url,
      sommairePdf: sommaire?.url ?? null,
      sommaireId: r.sommaire,
      sommairePublie: Boolean(sommaire),
    };
  });

  decisions.push({
    id: `${seance.id}_PV`,
    numero: null,
    objet: `Procès-verbal — ${seance.nom}, séance ${seance.sousTypeLibelle.toLowerCase()} du ${dateEnToutesLettres(seance.date)}, ${heureEnToutesLettres(seance.pv.heure)}`,
    date: seance.date,
    annee: seance.date.slice(0, 4),
    type: 'Procès-verbal',
    instance: seance.nom,
    seanceId: seance.id,
    sousType: seance.sousTypeLibelle,
    categorie: null,
    unite: null,
    districts: [],
    montant: null,
    ct: null,
    dossier: null,
    resultat: null,
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
      objet: `Ordre du jour — ${seance.nom}, séance ${seance.sousTypeLibelle.toLowerCase()} du ${dateEnToutesLettres(seance.date)}`,
      date: seance.date,
      annee: seance.date.slice(0, 4),
      type: 'Ordre du jour',
      instance: seance.nom,
      seanceId: seance.id,
      sousType: seance.sousTypeLibelle,
      categorie: null,
      unite: null,
      districts: [],
      montant: null,
      ct: null,
      dossier: null,
      resultat: null,
      voteEnregistre: false,
      pdf: odj.url,
      sommairePdf: null,
      sommaireId: null,
      nombrePoints: points.length,
    });
  }
  return { decisions, resolutions, points, objetsDeLOrdreDuJour };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());

  // Mode local : un PDF, pas de réseau.
  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const lu = lireNomFichier(nom);
    if (!lu || lu.genre !== 'PV') throw new Error(`« ${nom} » n'est pas un nom de procès-verbal de la Ville (CM_PV_ORD_18h30_2026_02_03_2.0.pdf).`);
    const compact = lu.date.replace(/-/g, '');
    const seance = { id: `${lu.instance}-${compact}-${lu.sousType}-${lu.heure}`, instance: lu.instance, nom: INSTANCES[lu.instance].nom, date: lu.date, sousTypeLibelle: lu.sousType, prefixe: `${lu.instance}-${compact}`, pv: { url: 'file://' + args.fichier, heure: lu.heure } };
    const doc = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const { resolutions } = decisionsDeSeance(seance, { url: seance.pv.url, texte: doc.texte, pages: doc.pages.map((p) => p.texte), nombrePages: doc.nombrePages }, null);
    console.log(`${nom} : ${doc.nombrePages} pages, ${resolutions.length} résolution(s)`);
    for (const r of resolutions) {
      console.log(`  ${r.numero.padEnd(18)} ${(r.sommaire ?? '').padEnd(13)} p.${String(r.page ?? '?').padEnd(3)} ${r.resultat ?? '—'}${r.votes.length ? `  [${r.votes.length} vote(s)]` : ''}`);
      console.log(`  ${''.padEnd(18)} ${(r.titreMajuscules ?? '(titre non lu)').slice(0, 110)}`);
    }
    return;
  }

  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/index.js");
  const index = await lireJson(INDEX);
  const sommaires = sommairesDepuisIndex(index?.documents ?? []);
  const seances = calendrier.seances.filter((s) => s.date.startsWith(year) && INSTANCES_ACTIVES.includes(s.instance) && (!args.seance || s.id === args.seance));

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
    for (const d of liste) Object.assign(d, classer({ objet: ['Procès-verbal', 'Ordre du jour'].includes(d.type) ? d.type : d.objet, titre: d.titre, chapitre: d.categorie, type: d.type }));
    // Les projets suivables dont parle chaque décision (voir ../lib/projets.js). Recalculé à
    // chaque passage : une règle qu'on affine doit reclasser tout l'historique, pas seulement
    // les nouvelles décisions.
    for (const d of liste) {
      delete d.projets;
      const p = ['Procès-verbal', 'Ordre du jour'].includes(d.type) ? [] : projetsDe(d.objet);
      if (p.length) d.projets = p;
    }
    liste.sort((a, b) => b.date.localeCompare(a.date) || (a.instance ?? '').localeCompare(b.instance ?? '') || ordreNumero(a) - ordreNumero(b));
    const traitees = new Set(etatSeances.map((s) => s.id));
    const etats = [...etatSeances, ...seances.filter((s) => !traitees.has(s.id)).map((s) => connues.get(s.id) ?? { ...s, etat: 'non traitée' })];
    const payload = {
      generatedAt: new Date().toISOString(),
      source: calendrier.source,
      indexObtenu: calendrier.obtenu,
      indexDu: calendrier.indexDu,
      licence: 'Documents publics de la Ville de Laval — reproduits avec mention de la source et lien vers le document officiel (voir README).',
      parametres: { annee: year, instances: calendrier.instances },
      totalDisponible: liste.length,
      nombre: liste.length,
      nouveauxDepuisDerniereExecution: precedent ? liste.filter((d) => d.nouveau).length : null,
      seancesLues: etats.filter((s) => s.etat === 'lue').length,
      seancesEnAttente: etats.filter((s) => s.etat === 'procès-verbal non publié').length,
      themes: THEMES,
      sansTheme: liste.filter((d) => d.themeSource === 'defaut').length,
      facettes: { type: tally(liste, 'type'), instance: tally(liste, 'instance'), categorie: tally(liste, 'categorie'), theme: tally(liste, 'theme') },
      seances: etats.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
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
    if (deja?.etat === 'lue' && deja.versionLecture === VERSION_LECTURE && deja.pv?.url === seance.pv.url && (deja.odj?.url ?? null) === (seance.odj?.url ?? null) && !args.complet && !args.seance) {
      etatSeances.push(deja);
      continue;
    }
    let pv;
    let odj = null;
    try {
      // --complet REJOUE LE DÉCOUPAGE, il ne retélécharge pas : le cache est invalidé par
      // l'adresse, et une nouvelle version d'un PDF en a une autre. Seul --retelecharger force la
      // Ville à resservir ses fichiers — la routine du 1er du mois n'a plus à lui redemander les
      // ~175 PDF de l'année pour un résultat identique (règle 3 : jamais de re-téléchargement complet).
      pv = await documentDeSeance(seance, 'PV', { forcer: Boolean(args.retelecharger) });
      if (pv) odj = await documentDeSeance(seance, 'ODJ', { forcer: Boolean(args.retelecharger) }).catch((err) => (console.warn(`⚠ ${seance.id} : ordre du jour illisible (${err.message})`), null));
    } catch (err) {
      // Une séance qui plante (PDF illisible, réseau) n'emporte pas les autres.
      console.warn(`⚠ ${seance.id} : ${err.message}`);
      etatSeances.push({ ...seance, etat: 'erreur', erreur: String(err.message ?? err) });
      continue;
    }
    if (!pv) {
      etatSeances.push({ ...seance, etat: 'erreur', erreur: 'le lien du procès-verbal ne donne pas de PDF' });
      continue;
    }
    // Les décisions précédentes de cette séance sont remplacées, pas additionnées.
    for (const [id, d] of decisions) if (d.seanceId === seance.id) decisions.delete(id);
    const { decisions: nouvelles, resolutions, objetsDeLOrdreDuJour } = decisionsDeSeance(seance, pv, odj, sommaires);
    for (const d of nouvelles) decisions.set(d.id, d);
    lues++;
    console.log(`${seance.id} : ${pv.nombrePages} pages, ${resolutions.length} résolutions, ${objetsDeLOrdreDuJour} objets pris à l'ordre du jour, ${resolutions.filter((r) => r.sommaire).length} sommaires cités (${nouvelles.filter((d) => d.sommairePublie).length} publiés), ${resolutions.reduce((n, r) => n + r.votes.length, 0)} vote(s) nominal(aux)${pv.depuisCache ? ' (cache)' : ''}`);
    if (resolutions.length === 0) console.warn(`⚠ ${seance.id} : aucune résolution reconnue — le gabarit du procès-verbal a peut-être changé.`);
    etatSeances.push({ ...seance, etat: 'lue', versionLecture: VERSION_LECTURE, nombreResolutions: resolutions.length, lueLe: new Date().toISOString().slice(0, 10) });
    await ecrire();
  }

  // GARDE-FOU DE LA RELECTURE COMPLÈTE. En --complet, la carte des décisions repart vide : chaque
  // séance relue réécrit ses propres fiches. Si AUCUNE séance n'a pu être lue (stockage de la Ville
  // en panne, PDF retirés, réseau coupé), le fichier écrit serait vide — et la routine du 1er du
  // mois, qui force --complet (scripts/refresh.js), le committerait par-dessus l'année entière sans
  // que rien n'échoue. Mesuré : avec le stockage répondant 404 partout, data/decisions.json passait
  // de 2 892 fiches à 0, code de sortie 0. On garde donc le fichier de la veille et on échoue, pour
  // que le workflow alerte. Le compte se fait sur l'ANNÉE DEMANDÉE : au changement d'année, le
  // fichier précédent n'en contient aucune et la première relecture de l'année neuve reste possible.
  const connuesDeLAnnee = (precedent?.decisions ?? []).filter((d) => d.annee === year).length;
  if (args.complet && lues === 0 && connuesDeLAnnee > 0) {
    console.error(
      `Relecture complète : aucune des ${seances.length} séance(s) de ${year} n'a pu être lue — ` +
        `data/decisions.json (${connuesDeLAnnee} fiches) est conservé tel quel, rien n'est réécrit.`
    );
    process.exitCode = 1;
    return;
  }

  const payload = await ecrire();
  console.log(`\n${payload.decisions.length} décisions écrites dans data/decisions.json — ${lues} séance(s) lue(s) cette fois, ${payload.seancesEnAttente} en attente de procès-verbal.`);
  if (precedent) console.log(`${payload.nouveauxDepuisDerniereExecution} nouveauté(s) depuis la dernière exécution.`);
  console.log('\nPastilles thématiques :');
  for (const { valeur, n } of payload.facettes.theme) console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  console.log(`  ${String(payload.sansTheme).padStart(5)}  (classées par défaut — aucune règle n'a tranché)`);
}

// « CM-20260203-64 » : tri par numéro, numériquement.
function ordreNumero(d) {
  const m = (d.numero ?? '').match(/-(\d+)$/);
  return m ? Number(m[1]) : 1e6;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
