// Registre des votes nominatifs de la Ville de Québec.
//
//   node scrapers/votes.js [--year=2026] [--max=400] [--all-years] [--depuis=2026-07-13]
//
// Quand un membre « demande le vote », le procès-verbal consigne l'appel nominal complet :
// qui a voté en faveur, qui a voté contre, les décomptes, les abstentions et le résultat.
// Ce scraper cherche ces passages dans le texte intégral (déjà extrait par la Ville dans
// son index) et les transforme en données structurées.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote conserve le segment de texte
// brut d'où les noms ont été tirés, et tout écart entre les noms extraits et le décompte
// officiel est signalé (`avertissements`) plutôt que corrigé en douce.

import { writeFile, readFile } from 'node:fs/promises';
import { search, searchAll, decode, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';
import { classer, THEMES } from '../lib/themes.js';

const OUT = new URL('../data/votes.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// Le PDF utilise des espaces insécables un peu partout.
function normaliser(texte) {
  return (texte ?? '').replace(/ /g, ' ').replace(/\r\n/g, '\n');
}

// En-têtes et pieds de page du gabarit PDF, qui peuvent s'intercaler au milieu d'une
// liste de noms quand elle chevauche deux pages.
function nettoyerArtefacts(s) {
  return s
    // Les résolutions contiennent des hyperliens vers le sommaire décisionnel, dont
    // l'URL ressort en plein milieu d'un nom à l'extraction du PDF.
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/GPD\d+\w*/g, ' ')
    .replace(/Page\s*:\s*\d+\s+de\s+\d+/gi, ' ')
    .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, ' ')
    .replace(/\n\s*\d+\s*\n/g, '\n');
}

// Fin d'un segment de noms : le marqueur suivant, jamais une simple ligne vide — une
// liste de 18 noms traverse souvent une coupure de page.
const FIN_SEGMENT = "(?=(?:A|Ont)\\s+vot[ée]|En\\s+faveur\\s*:|Contre\\s*:\\s*\\d|Adopt[ée]|Rejet[ée]|s['’]est\\s+abstenu|$)";

// Isole ce qui suit « Ont voté en faveur : ». Le singulier existe aussi : quand une seule
// personne vote d'un côté, le procès-verbal écrit « A voté contre : ».
function extraireSegment(texte, etiquette) {
  const re = new RegExp(
    '(?:A|Ont)\\s+vot[ée]s?\\s+' + etiquette + '\\s*:\\s*([\\s\\S]{0,1500}?)' + FIN_SEGMENT,
    'i'
  );
  const m = texte.match(re);
  return m ? nettoyerArtefacts(m[1]).trim() : null;
}

// Une minorité de PDF ressortent de l'extraction avec les lettres espacées
// (« Ca the r ine Va l l i è r e s -Ro land »). On ne peut pas reconstituer les noms de
// façon fiable : on le signale au lieu de deviner.
function texteDegrade(s) {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return false;
  const isoles = tokens.filter((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, '').length === 1).length;
  return isoles / tokens.length > 0.25;
}

// « mesdames les conseillères Marie-Pierre Boucher, Elainie Lepage et Elisa Verreault
//   et monsieur le conseiller Gabriel Dusablon. »  ->  4 noms
function extraireNoms(segment) {
  if (!segment) return { noms: [], avertissements: [], degrade: false };
  const avertissements = [];

  let t = segment.replace(/\s+/g, ' ').trim();

  // « Ont voté contre : aucun membre du conseil » — personne n'a voté de ce côté.
  // C'est une liste vide légitime, pas un échec d'extraction.
  if (/^aucun/i.test(t)) return { noms: [], avertissements: [], degrade: false };

  if (texteDegrade(t)) {
    return {
      noms: [],
      degrade: true,
      avertissements: ['Texte source dégradé (PDF aux glyphes espacés) — noms non extraits, voir le champ « brut ».'],
    };
  }

  // Aux conseils d'agglomération on trouve « monsieur le maire de Saint-Augustin-de-
  // Desmaures, Sylvain Juneau » : la municipalité s'intercale avant le nom.
  t = t.replace(/(?:monsieur|madame)\s+(?:le|la)\s+maire(?:sse)?\s+de\s+[^,]+,\s*/gi, '');

  // Titres de civilité et fonctions, au singulier comme au pluriel.
  t = t.replace(
    /\b(?:mesdames|messieurs|madame|monsieur)\s+(?:les\s+|la\s+|le\s+)?(?:conseill(?:ères|ers|ère|er)|mairesses?|maires?|président(?:es|s|e)?)?\s*/gi,
    ''
  );

  const noms = t
    // Séparateurs observés dans les procès-verbaux : la virgule, « et », « ainsi que ».
    .split(/,| ainsi que | et /i)
    .map((s) => s.replace(/[.;]+$/, '').trim())
    .filter(Boolean)
    .filter((nom) => {
      // Un nom de personne : commence par une majuscule, tient en quelques mots.
      const plausible = /^[A-ZÀ-Ÿ]/.test(nom) && nom.length <= 60 && nom.split(' ').length <= 6;
      if (!plausible) avertissements.push('Fragment ignoré : « ' + nom + ' »');
      return plausible;
    });

  return { noms, avertissements, degrade: false };
}

function extraireDecompte(texte, etiquette) {
  const m = texte.match(new RegExp(etiquette + '\\s*:\\s*(\\d+)', 'i'));
  return m ? Number(m[1]) : null;
}

function extraireResultat(texte) {
  if (/Adopt[ée]e?\s+à\s+l['’]unanimité/i.test(texte)) return "Adoptée à l'unanimité";
  if (/Adopt[ée]e?\s+à\s+la\s+majorité/i.test(texte)) return 'Adoptée à la majorité';
  if (/Adopt[ée]e?\s+sur\s+division/i.test(texte)) return 'Adoptée sur division';
  if (/\bRejet[ée]e?\b/i.test(texte)) return 'Rejetée';
  if (/\bAdopt[ée]e?\b/i.test(texte)) return 'Adoptée';
  return null;
}

function parserVote(contenu) {
  const texte = normaliser(contenu);
  if (!/Ont\s+vot[ée]/i.test(texte)) return null;

  const segFaveur = extraireSegment(texte, 'en\\s+faveur');
  const segContre = extraireSegment(texte, 'contre');

  const faveur = extraireNoms(segFaveur);
  const contre = extraireNoms(segContre);

  const nFaveur = extraireDecompte(texte, 'En\\s+faveur');
  const nContre = extraireDecompte(texte, 'Contre');

  const degrade = faveur.degrade || contre.degrade;
  const avertissements = [...faveur.avertissements, ...contre.avertissements];
  // Le garde-fou : si le nombre de noms extraits ne colle pas au décompte imprimé
  // dans le document, on le dit. On ne « corrige » rien. (Inutile de le répéter quand
  // le texte source est dégradé : c'est déjà signalé et la cause est connue.)
  if (!degrade && nFaveur != null && faveur.noms.length !== nFaveur) {
    avertissements.push(faveur.noms.length + ' nom(s) extrait(s) en faveur, mais le document en déclare ' + nFaveur);
  }
  if (!degrade && nContre != null && contre.noms.length !== nContre) {
    avertissements.push(contre.noms.length + ' nom(s) extrait(s) contre, mais le document en déclare ' + nContre);
  }

  const demandeur = texte.match(
    /(?:monsieur|madame)\s+(?:le|la)\s+(?:conseill\w+|maire\w*|président\w*)\s+([A-ZÀ-Ÿ][^\n.]{1,50}?)\s+demande\s+le\s+vote/i
  );

  const abstention = /s['’]est\s+abstenue?\s+de\s+voter/i.test(texte);
  const mAbst = texte.match(/((?:monsieur|madame)[^.\n]{0,60}?)\s+s['’]est\s+abstenue?\s+de\s+voter/i);

  return {
    resultat: extraireResultat(texte),
    pour: faveur.noms,
    contre: contre.noms,
    decomptePour: nFaveur,
    decompteContre: nContre,
    abstention: abstention ? (mAbst ? mAbst[1].replace(/\s+/g, ' ').trim() : 'oui') : null,
    demandeParVote: demandeur ? demandeur[1].replace(/\s+/g, ' ').trim() : null,
    texteSourceDegrade: degrade,
    avertissements,
    // Le brut, pour qu'un humain puisse toujours vérifier ce qui a été extrait.
    brut: [segFaveur && 'Ont voté en faveur : ' + segFaveur, segContre && 'Ont voté contre : ' + segContre]
      .filter(Boolean)
      .join(' | ')
      .replace(/\s+/g, ' '),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args['all-years'] ? null : args.year ?? String(new Date().getFullYear());
  const max = Number(args.max ?? 400);

  const clauses = ["Type eq '" + encodeFieldValue('Résolutions') + "'"];
  if (year) clauses.push("Annee eq '" + year + "'");
  const filter = clauses.join(' and ');
  // Fenêtre incrémentale (--depuis=AAAA-MM-JJ) : on ne redemande à la Ville que les
  // résolutions datées de la fenêtre ; ce qui est plus ancien est conservé du fichier
  // précédent. Un vote publié en retard, daté d'avant la fenêtre, attend la passe complète
  // (sans --depuis) que la routine quotidienne fait le 1er du mois.
  const depuis = args.depuis ?? null;
  if (depuis && !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) {
    console.error('--depuis attend une date au format AAAA-MM-JJ.');
    process.exit(1);
  }
  const filtreFenetre = depuis ? `${filter} and Date ge '${depuis}'` : filter;
  const requete = '"Ont voté"';

  const total =
    (await search({ search: requete, searchMode: 'all', filter, top: 0, count: true }))['@odata.count'] ?? 0;
  console.log('Résolutions contenant un appel nominal : ' + total + (year ? ' (' + year + ')' : ' (toutes années)'));
  console.log('On en analyse au plus ' + max + '.');

  const select = 'content,Objet,Numero,Date,Annee,Instance,Type,metadata_storage_name';
  const votes = [];
  let analyses = 0;

  for await (const row of searchAll(
    { search: requete, searchMode: 'all', filter: filtreFenetre, select, orderby: 'Date desc, Numero asc' },
    { pageSize: 100, max }
  )) {
    analyses++;
    const vote = parserVote(row.content);
    if (!vote) continue;
    votes.push({
      id: row.metadata_storage_name,
      numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
      objet: (decode(row.Objet) ?? '').replace(/\s+/g, ' ').trim() || null,
      date: row.Date ?? null,
      annee: row.Annee ?? null,
      instance: decode(row.Instance) === 'null' ? null : decode(row.Instance),
      pdf: row.metadata_storage_name ? PDF_BASE + row.metadata_storage_name : null,
      ...vote,
    });
    if (analyses % 100 === 0) console.log('  … ' + analyses + ' analysées, ' + votes.length + ' votes extraits');
  }

  // Même logique que pour les décisions : on marque ce qui est apparu depuis la dernière
  // extraction, pour alimenter le fil « ce qui a changé » de la page d'accueil.
  let precedent = null;
  try {
    precedent = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    precedent = null;
  }
  const idsPrecedents = new Set((precedent?.votes ?? []).map((v) => v.id));
  for (const v of votes) v.nouveau = precedent ? !idsPrecedents.has(v.id) : null;
  const nouveaux = precedent ? votes.filter((v) => v.nouveau).length : null;

  // Fenêtre incrémentale : ce qui est daté d'avant la fenêtre n'a pas été redemandé, on le
  // garde tel quel (même année seulement). Dans la fenêtre, le portail fait foi — sauf si
  // --max a tronqué la lecture, auquel cas on ne retire rien.
  if (depuis && precedent) {
    const vus = new Set(votes.map((v) => v.id));
    const tronque = analyses >= max;
    const conserves = (precedent.votes ?? []).filter(
      (v) => (!year || String(v.annee) === String(year)) && !vus.has(v.id) && (tronque || (v.date ?? '') < depuis)
    );
    for (const v of conserves) v.nouveau = false;
    votes.push(...conserves);
    votes.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (a.numero ?? '').localeCompare(b.numero ?? ''));
    if (tronque) console.warn(`⚠ La fenêtre dépasse --max=${max} : rien n'est retiré, mais il peut manquer des votes. Augmentez --max.`);
    console.log(`Fenêtre depuis ${depuis} : ${vus.size} vote(s) relu(s), ${conserves.length} conservé(s) du fichier précédent.`);
  }

  // Même classement thématique que les décisions, sur l'objet du vote. Les votes n'ont pas
  // d'unité administrative, donc seule la règle par mots-clés s'applique.
  for (const v of votes) Object.assign(v, classer({ objet: v.objet, unite: null }));

  const douteux = votes.filter((v) => v.avertissements.length > 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    methode:
      "Extraction par analyse du texte des résolutions (champ « content » de l'index de la Ville). " +
      'Les noms sont lus dans les passages « Ont voté en faveur / Ont voté contre ». ' +
      'Chaque vote conserve le texte brut et signale tout écart avec le décompte officiel.',
    parametres: { annee: year, max, depuis },
    totalDisponible: total,
    documentsAnalyses: analyses,
    nombre: votes.length,
    nouveauxDepuisDerniereExecution: nouveaux,
    avecAvertissement: douteux.length,
    themes: THEMES,
    votes,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log('\n' + votes.length + ' votes nominatifs écrits dans data/votes.json');
  console.log(douteux.length + " portent un avertissement d'extraction (à vérifier à la main).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
