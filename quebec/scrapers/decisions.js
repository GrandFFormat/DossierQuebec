// Miroir incrémental des documents décisionnels de la Ville de Québec.
//
//   node scrapers/decisions.js [--year=2026] [--max=20000] [--type=Résolutions] [--all-types]
//
// Par défaut : toute l'année en cours, types décisionnels seulement (on laisse de côté
// « Mouvements de personnel », qui concerne des employés et non des décisions publiques).
//
// EN DEUX TEMPS, POUR MÉNAGER LE SERVEUR DE LA VILLE. D'abord les métadonnées de toute
// l'année — objet, numéro, date, instance, unité, type — à mille documents par requête.
// Ensuite le texte intégral des seules résolutions qu'on n'a jamais lues, par lots de cent
// numéros : c'est là qu'on lit le renvoi vers le sommaire décisionnel. Une exécution
// quotidienne coûte donc à la Ville une demi-douzaine de requêtes, quel que soit le nombre
// de documents déjà connus. Le texte lui-même n'est jamais conservé.

import { writeFile, readFile } from 'node:fs/promises';
import { search, searchAll, decode, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';
import { textesParNumero, normaliserObjet, LOT_TEXTE } from '../lib/textes.js';
import { classer, THEMES } from '../lib/themes.js';
import { PROJETS, projetsDe } from '../lib/projets.js';

const OUT = new URL('../data/decisions.json', import.meta.url);

// Types tels qu'ils existent dans l'index (facette Type).
const TYPES_DECISIONNELS = ['Résolutions', 'Sommaires et mémoires', 'Procès-verbaux', 'Tableaux des décisions'];

// Un document daté de plus de 45 jours avant le plus récent qu'on connaissait n'est pas une
// nouveauté : c'est un rattrapage — la Ville publie parfois tard, et nous-mêmes il nous
// arrive de remonter dans l'année. Le fil « ce qui a changé » ne doit pas s'en remplir.
const RATTRAPAGE_JOURS = 45;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function buildFilter({ year, types }) {
  const clauses = [];
  if (year) clauses.push(`Annee eq '${year}'`);
  if (types?.length) {
    const ors = types.map((t) => `Type eq '${encodeFieldValue(t)}'`);
    clauses.push(`(${ors.join(' or ')})`);
  }
  return clauses.join(' and ');
}

// Une résolution renvoie à son sommaire décisionnel par un hyperlien inséré dans son
// texte (…/gpdblob/DE2026-336.pdf). C'est ce lien qui permet d'afficher le résumé sur la
// décision elle-même, et pas seulement sur la note préparatoire — sans quoi une séance
// d'arrondissement, qui ne contient que des résolutions, n'affiche aucun résumé.
export function trouverSommaire(contenu, propreNom) {
  for (const m of (contenu ?? '').matchAll(/gpdblob\/([A-Z]{2,4}\d{4}-\d+\.pdf)/g)) {
    if (m[1] !== propreNom) return m[1]; // jamais un renvoi vers soi-même
  }
  return null;
}

function normalise(row) {
  const nom = row.metadata_storage_name ?? null;
  return {
    id: nom, // le nom du PDF est unique et stable — c'est notre clé
    numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
    objet: normaliserObjet(decode(row.Objet)),
    date: row.Date ?? null,
    annee: row.Annee ?? null,
    type: decode(row.Type),
    instance: decode(row.Instance) === 'null' ? null : decode(row.Instance),
    unite: decode(row.Uniteadministrative) === 'null' ? null : decode(row.Uniteadministrative),
    pdf: nom ? PDF_BASE + nom : null,
  };
}

function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([valeur, n]) => ({ valeur, n }));
}

// ---------- où en est un dossier ----------
// Chaque sommaire décisionnel dit, en tête, quelle instance décide et à quelle date cible :
//   « Projet  Conseil d'agglomération de Québec  Instance décisionnelle  16 Septembre 2026  Date cible »
// On le lit par des EXTRAITS de texte (highlight de l'index, environ 3 ko par document) plutôt
// que par le texte entier. Un dossier est « terminé » quand une résolution de cette instance
// renvoie à son sommaire — hors étapes préliminaires (autorisation de soumettre, avis de motion,
// adoption du projet de règlement), qui ne décident rien.
const MOIS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const sansAccents = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normInstance = (s) => sansAccents(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

export function lireInstanceDecisionnelle(extraits) {
  const t = (extraits ?? []).join(' ').replace(/<\/?em>/g, '').replace(/\s+/g, ' ');
  // L'instance commence toujours par « Comité » ou « Conseil » : ça évite de prendre un autre
  // « Projet » plus haut (« Projet de résolution (électronique) Projet Conseil de la ville »).
  const m = t.match(/Projet\s+((?:Comité|Conseil)[^]{2,90}?)\s*Instance décisionnelle\s*(\d{1,2}\s+\p{L}+\s+\d{4})?\s*Date cible/u);
  if (!m) return { instanceDecisionnelle: null, dateCible: null };
  let dateCible = null;
  if (m[2]) {
    const [j, mois, a] = m[2].split(/\s+/);
    const i = MOIS_FR.indexOf(sansAccents(mois).toLowerCase());
    if (i >= 0) dateCible = `${a}-${String(i + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  }
  return { instanceDecisionnelle: m[1].trim(), dateCible };
}

// « Autorisation de soumettre AU CONSEIL… » est une étape ; « Autorisation de soumettre une
// demande d'aide financière au ministère » est une décision (vu sur CE-2026-0839).
const PRELIMINAIRE = /^(?:Autorisation de soumettre,? (?:au|à la|à l'|aux) (?:conseil|comité)|Avis de motion|Adoption du projet de r[èe]glement)/i;
const estPreliminaire = (r) => PRELIMINAIRE.test(r.objet ?? '') || /^[A-Z]*AM\d?-/.test(r.numero ?? '');

// Les sommaires et les résolutions ne nomment pas les instances de la même façon (« Conseil
// d'arrondissement » contre « Conseil de l'Arrondissement de Beauport »). Et quand un sommaire
// en nomme plusieurs (« Conseil d'arrondissement et conseil de la ville »), c'est la dernière
// qui décide.
function instanceCanonique(s) {
  const n = normInstance(s).split(' et ').pop();
  if (n.includes('agglomeration')) return 'agglomeration';
  if (n.includes('arrondissement')) return 'arrondissement';
  if (n.includes('conseil de la ville')) return 'ville';
  if (n.includes('comite executif')) return 'executif';
  return n;
}

function statuerDossiers(decisions) {
  const parId = new Map(decisions.map((d) => [d.id, d]));
  const resolutionsDe = new Map();
  for (const d of decisions) {
    if (d.type !== 'Résolutions' || !d.sommaireId) continue;
    if (!resolutionsDe.has(d.sommaireId)) resolutionsDe.set(d.sommaireId, []);
    resolutionsDe.get(d.sommaireId).push(d);
  }
  const statutSommaire = (s) => {
    if (!s?.instanceDecisionnelle) return null;
    const cible = instanceCanonique(s.instanceDecisionnelle);
    const termine = (resolutionsDe.get(s.id) ?? []).some((r) => !estPreliminaire(r) && instanceCanonique(r.instance) === cible);
    return { statutDossier: termine ? 'termine' : 'en_cours', etapeFinale: s.instanceDecisionnelle.split(/ et /i).pop().replace(/^c/, 'C'), echeance: s.dateCible ?? null };
  };
  // Les champs lus dans les sommaires (instanceDecisionnelle, dateCible) restent intacts ; seuls
  // les champs calculés ici sont remis à zéro.
  for (const d of decisions) {
    delete d.statutDossier;
    delete d.etapeFinale;
    delete d.echeance;
    let statut = null;
    if (d.type === 'Sommaires et mémoires') statut = statutSommaire(d);
    else if (d.type === 'Résolutions') {
      statut = d.sommaireId && parId.has(d.sommaireId) ? statutSommaire(parId.get(d.sommaireId)) : null;
      // Une résolution sans sommaire connu : adoptée, donc terminée — sauf étape préliminaire.
      if (!statut) statut = { statutDossier: estPreliminaire(d) ? 'en_cours' : 'termine', etapeFinale: null, echeance: null };
    }
    if (statut) {
      d.statutDossier = statut.statutDossier;
      if (statut.etapeFinale) d.etapeFinale = statut.etapeFinale;
      if (statut.echeance) d.echeance = statut.echeance;
    }
  }
}

function ajouterJours(dateIso, jours) {
  const d = new Date(dateIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

async function chargerExistant() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year ?? String(new Date().getFullYear());
  const max = Number(args.max ?? 20000);
  const types = args['all-types'] ? [] : args.type ? [args.type] : TYPES_DECISIONNELS;

  const filter = buildFilter({ year, types });
  const total = (await search({ filter, top: 0, count: true }))['@odata.count'] ?? 0;

  console.log(`Portail   : ${PORTAL}`);
  console.log(`Filtre    : ${filter}`);
  console.log(`Disponible: ${total} documents — on en récupère au plus ${max}`);

  // 1. Les métadonnées de toute l'année, sans le texte : mille documents par requête.
  const select = 'Objet,Numero,Date,Annee,Instance,Uniteadministrative,Type,metadata_storage_name';
  const vus = new Set();
  const decisions = [];
  for await (const row of searchAll(
    // Un tri sur la seule date n'est pas déterministe : des centaines de documents
    // partagent la même journée, et la pagination par $skip peut alors sauter ou répéter
    // des lignes d'une page à l'autre. Le numéro sert de départage.
    { filter, select, orderby: 'Date desc, Numero asc' },
    { pageSize: 1000, max }
  )) {
    const d = normalise(row);
    if (!d.id || vus.has(d.id)) continue; // un même PDF peut ressortir entre deux pages
    vus.add(d.id);
    decisions.push(d);
  }
  console.log(`${decisions.length} documents (métadonnées seulement).`);

  // 2. Ce qu'on savait déjà, et ce qui est vraiment nouveau. À la toute première extraction
  //    il n'y a rien à comparer — on laisse `nouveau` à null plutôt que de tout déclarer
  //    nouveau.
  const precedent = await chargerExistant();
  const connus = new Map((precedent?.decisions ?? []).map((d) => [d.id, d]));
  const plusRecentConnu = [...connus.values()].reduce((m, d) => ((d.date ?? '') > m ? d.date : m), '');
  const seuilNouveaute = plusRecentConnu ? ajouterJours(plusRecentConnu, -RATTRAPAGE_JOURS) : '';
  for (const d of decisions) {
    d.nouveau = precedent ? !connus.has(d.id) && (d.date ?? '') >= seuilNouveaute : null;
  }
  const inconnus = decisions.filter((d) => !connus.has(d.id)).length;
  const nouveaux = decisions.filter((d) => d.nouveau).length;

  // 3. Le texte intégral des seules résolutions jamais lues. Les autres types n'ont pas de
  //    renvoi à trouver ; les résolutions déjà lues gardent le leur. Une résolution qui
  //    reste introuvable par numéro n'a pas de clé `sommaireId` du tout — absente du JSON,
  //    elle est relue à la prochaine exécution.
  for (const d of decisions) {
    if (d.type !== 'Résolutions' || !d.numero) d.sommaireId = null;
    else if (connus.has(d.id) && 'sommaireId' in connus.get(d.id)) d.sommaireId = connus.get(d.id).sommaireId;
  }
  const aLire = decisions.filter((d) => d.type === 'Résolutions' && d.numero && d.sommaireId === undefined);
  const parNom = new Map(aLire.map((d) => [d.id, d]));
  let lues = 0;
  for await (const row of textesParNumero(aLire.map((d) => d.numero))) {
    const d = parNom.get(row.metadata_storage_name);
    if (!d) continue;
    d.sommaireId = trouverSommaire(row.content, d.id);
    lues++;
  }
  if (aLire.length) {
    const requetes = Math.ceil(aLire.length / LOT_TEXTE);
    console.log(`Texte intégral lu pour ${lues} résolution(s) sur ${aLire.length} (${requetes} requête(s)).`);
    if (lues < aLire.length) console.warn(`⚠ ${aLire.length - lues} résolution(s) introuvable(s) par numéro — relues la prochaine fois.`);
  }

  // 3 bis. L'instance qui décide, pour les seuls sommaires jamais lus (extraits de texte, par lots).
  // --relire-instances : relit tous les sommaires (après une correction de la lecture).
  for (const d of decisions) {
    if (d.type !== 'Sommaires et mémoires' || args['relire-instances']) continue;
    const avant = connus.get(d.id);
    if (avant && 'instanceDecisionnelle' in avant) {
      d.instanceDecisionnelle = avant.instanceDecisionnelle;
      if (avant.dateCible) d.dateCible = avant.dateCible;
    }
  }
  const sommairesALire = decisions.filter((d) => d.type === 'Sommaires et mémoires' && d.numero && !('instanceDecisionnelle' in d));
  const sommaireParNom = new Map(sommairesALire.map((d) => [d.id, d]));
  for (let i = 0; i < sommairesALire.length; i += 100) {
    const valeurs = sommairesALire.slice(i, i + 100).map((d) => encodeFieldValue(d.numero)).join('|');
    const page = await search({
      search: 'Instance décisionnelle',
      filter: `search.in(Numero, '${valeurs}', '|')`,
      select: 'Numero,metadata_storage_name',
      highlight: 'content',
      top: 1000,
    });
    for (const row of page.value ?? []) {
      const d = sommaireParNom.get(row.metadata_storage_name);
      if (d) Object.assign(d, lireInstanceDecisionnelle(row['@search.highlights']?.content));
    }
  }
  // Un sommaire sans mention lisible est marqué lu (null), pour ne pas le redemander chaque jour.
  for (const d of sommairesALire) if (!('instanceDecisionnelle' in d)) d.instanceDecisionnelle = null;
  if (sommairesALire.length) {
    const lus = sommairesALire.filter((d) => d.instanceDecisionnelle).length;
    console.log(`Instance décisionnelle lue pour ${lus} sommaire(s) sur ${sommairesALire.length} (${Math.ceil(sommairesALire.length / 100)} requête(s)).`);
  }
  statuerDossiers(decisions);

  // Les projets suivables dont parle chaque décision (lib/projets.js).
  for (const d of decisions) {
    delete d.projets;
    const p = projetsDe(d.objet);
    if (p.length && d.type !== 'Procès-verbaux' && d.type !== 'Tableaux des décisions') d.projets = p;
  }

  // Pastille thématique : ce que la décision concerne. Voir lib/themes.js pour la méthode.
  for (const d of decisions) Object.assign(d, classer(d));
  const sansTheme = decisions.filter((d) => !d.theme).length;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    licence: 'Documents publics de la Ville de Québec — reproduction avec mention de la source, usage non commercial.',
    parametres: { annee: year, max, types },
    totalDisponible: total,
    nombre: decisions.length,
    nouveauxDepuisDerniereExecution: precedent ? nouveaux : null,
    themes: THEMES,
    sansTheme,
    projets: Object.fromEntries(
      Object.entries(PROJETS).map(([cle, p]) => [cle, { titre: p.titre, description: p.description, n: decisions.filter((d) => d.projets?.includes(cle)).length }])
    ),
    statuts: {
      termines: decisions.filter((d) => d.type === 'Sommaires et mémoires' && d.statutDossier === 'termine').length,
      enCours: decisions.filter((d) => d.type === 'Sommaires et mémoires' && d.statutDossier === 'en_cours').length,
      inconnus: decisions.filter((d) => d.type === 'Sommaires et mémoires' && !d.statutDossier).length,
    },
    facettes: {
      type: tally(decisions, 'type'),
      instance: tally(decisions, 'instance'),
      unite: tally(decisions, 'unite'),
      theme: tally(decisions, 'theme'),
    },
    decisions,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${decisions.length} décisions écrites dans data/decisions.json`);
  if (precedent) {
    console.log(
      `${inconnus} document(s) qu'on ne connaissait pas, dont ${nouveaux} nouveauté(s)` +
        (inconnus > nouveaux ? ` — le reste est un rattrapage de plus de ${RATTRAPAGE_JOURS} jours.` : '.')
    );
  }
  console.log(`\nPastilles thématiques :`);
  for (const { valeur, n } of payload.facettes.theme) {
    console.log(`  ${String(n).padStart(5)}  ${THEMES[valeur]?.libelle ?? valeur}`);
  }
  console.log(`  ${String(sansTheme).padStart(5)}  (sans pastille — aucune règle n'a tranché)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
