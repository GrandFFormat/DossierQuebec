// Les fichiers que lit « Mes dossiers » (/mes-dossiers, commun à toutes les villes).
//
//   node scripts/projets-publics.js
//
// Mes dossiers ne doit jamais télécharger toutes les décisions d'une ville : avec quinze villes,
// ce serait une quinzaine de mégaoctets à chaque visite. On lui prépare ici, à chaque
// rafraîchissement, exactement ce qu'il affiche, en deux tailles :
//
//   data/projets/index.json      tous les projets de la ville en quelques lignes chacun
//                                (titre, chiffres, en bref) — pour les en-têtes et les
//                                suggestions. Quelques kilo-octets.
//   data/projets/<cle>.json      un projet au complet — chiffres, graphiques, récapitulatif,
//                                chaque dossier avec son résumé et son parcours. Chargé
//                                seulement quand on ouvre ce projet.
//
// LE FORMAT EST COMMUN À TOUTES LES VILLES : une autre ville qui veut ses projets dans Mes
// dossiers produit les mêmes deux fichiers, avec les mêmes champs (voir le README).
// Rien n'est calculé par l'IA ici : le récapitulatif vient tel quel de data/projets-recaps.json.
//
// LAVAL : copié de levis/scripts/projets-publics.js, qui ne dépend d'aucun champ propre à
// Lévis. Un dossier est un sommaire décisionnel et ses résolutions ; sans sommaire, la
// résolution seule.
//
// PAS de data/attendues.json ici, contrairement à Québec et Lévis : les décisions de Laval ne
// portent pas de `statutDossier`, donc on ne sait pas lesquelles attendent encore une décision
// finale. Écrire un fichier vide laisserait croire qu'il n'y a rien en attente.
//
// Laval n'a pas non plus de data/resumes.json (les résumés payants y sont éteints, voir
// LAV_RESUMES) : les puces restent vides et les dossiers s'affichent par leur objet officiel.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROJETS } from '../lib/projets.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const PAS_UN_DOSSIER = new Set(['Procès-verbal', 'Ordre du jour']);
// Le dossier d'un groupe de décisions, vu du côté de Mes dossiers.
const principalDe = (groupe) => groupe.at(-1);
const numerosDe = (groupe) => [...new Set([...groupe.map((d) => d.numero), groupe[0].sommaireId].filter(Boolean))];
const DOSSIER = 'data/projets';

const lire = async (f, repli) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return repli;
  }
};
const parDate = (a, b) => (a.date ?? '').localeCompare(b.date ?? '');

const decisions = await lire('data/decisions.json', null);
if (!decisions?.decisions) {
  console.error('data/decisions.json introuvable : rien à publier.');
  process.exit(1);
}
const { resumes = [] } = await lire('data/resumes.json', {});
const { recaps = {} } = await lire('data/projets-recaps.json', {});
const resumeDe = new Map(resumes.map((r) => [r.id, r]));
const themes = decisions.themes ?? {};

await mkdir(DOSSIER, { recursive: true });
const index = {};
let octets = 0;

for (const [cle, def] of Object.entries(PROJETS)) {
  const docs = decisions.decisions.filter((d) => d.projets?.includes(cle) && !PAS_UN_DOSSIER.has(d.type));
  const groupes = new Map();
  for (const d of docs) {
    const k = d.sommaireId ?? d.id;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }

  const dossiers = [...groupes.entries()].map(([k, groupe]) => {
    groupe.sort(parDate);
    const principal = principalDe(groupe);
    const resume = resumeDe.get(k);
    return {
      numero: principal.numero ?? null,
      numeros: numerosDe(groupe),
      date: groupe[0].date ?? null,
      derniere: groupe.at(-1).date ?? null,
      instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
      statutDossier: principal.statutDossier ?? null,
      etapeFinale: principal.etapeFinale ?? null,
      echeance: principal.echeance ?? null,
      theme: principal.theme ?? null,
      objet: principal.objet ?? null,
      puces: resume?.puces?.length ? resume.puces : [],
      pdf: principal.sommairePdf ?? principal.pdf ?? null,
      resolutions: groupe.filter((d) => d.instance).map((d) => ({ numero: d.numero ?? null, instance: d.instance, date: d.date ?? null, resultat: d.resultat ?? null })),
    };
  });
  dossiers.sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));

  const derniere = docs.map((d) => d.date).filter(Boolean).sort().pop() ?? null;
  const annee = Number((derniere ?? decisions.generatedAt ?? new Date().toISOString()).slice(0, 4));
  const parMois = Array(12).fill(0);
  for (const d of docs) if (d.date?.startsWith(String(annee))) parMois[Number(d.date.slice(5, 7)) - 1]++;
  const parTheme = new Map();
  for (const d of dossiers) if (d.theme) parTheme.set(d.theme, (parTheme.get(d.theme) ?? 0) + 1);
  const recap = recaps[cle]?.utilisable ? recaps[cle] : null;
  const chiffres = {
    decisions: docs.length,
    dossiers: dossiers.length,
    resolutions: docs.filter((d) => d.instance).length,
    enAttente: dossiers.filter((d) => d.statutDossier === 'en_cours').length,
    derniere,
  };

  const projet = {
    cle,
    titre: def.titre,
    description: def.description,
    annee,
    chiffres,
    parMois,
    themes: [...parTheme]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => ({ cle: t, libelle: themes[t]?.libelle ?? t, couleur: themes[t]?.couleur ?? null, n })),
    recap: recap && {
      enBref: recap.enBref,
      etapes: recap.etapes,
      aSurveiller: recap.aSurveiller,
      dossiers: recap.dossiers,
      genereLe: recap.genereLe,
      genereParIA: true,
    },
    dossiers,
  };
  const texte = JSON.stringify(projet);
  octets += texte.length;
  await writeFile(`${DOSSIER}/${cle}.json`, texte, 'utf8');

  // Ce qu'une carte montre sans ouvrir le projet : le récapitulatif en bref, sinon la dernière décision.
  const recent = dossiers[0];
  index[cle] = {
    titre: def.titre,
    description: def.description,
    annee,
    ...chiffres,
    enBref: recap?.enBref ?? null,
    plusRecent: recent ? recent.puces[0] ?? recent.objet : null,
  };
}

// Un projet retiré de lib/projets.js ne laisse pas de fichier orphelin.
for (const f of await readdir(DOSSIER)) {
  if (f !== 'index.json' && f.endsWith('.json') && !(f.slice(0, -5) in PROJETS)) await rm(`${DOSSIER}/${f}`);
}
const texteIndex = JSON.stringify({ generatedAt: new Date().toISOString(), projets: index });
await writeFile(`${DOSSIER}/index.json`, texteIndex, 'utf8');

console.log(`Projets publics : ${Object.keys(index).length} projets · index ${(texteIndex.length / 1024).toFixed(1)} Ko · fichiers de projet ${(octets / 1024).toFixed(0)} Ko au total.`);

// ---------- les décisions récentes (alertes par mot-clé) ----------
// data/recentes.json : chaque dossier qui a bougé dans les 45 derniers jours (le sommaire et ses
// résolutions comptent une fois), avec ce qu'on cherche dedans (objet et résumé). Lu par
// api/alertes-projets.js pour les mots-clés des abonnés, et par Mes dossiers pour dire combien de
// décisions récentes contiennent un mot. FORMAT COMMUN À TOUTES LES VILLES :
//   { generatedAt, depuis, dossiers: [{ numero, numeros[], date, derniere, instances[],
//     statutDossier, etapeFinale, echeance, objet, puces[], pdf }] }
const RECENT_JOURS = 45;
const plusRecente = decisions.decisions.map((d) => d.date).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10);
const depuisRecent = new Date(Date.parse(plusRecente) - RECENT_JOURS * 864e5).toISOString().slice(0, 10);
const groupesRecents = new Map();
for (const d of decisions.decisions) {
  if (PAS_UN_DOSSIER.has(d.type)) continue;
  const k = d.sommaireId ?? d.id;
  if (!groupesRecents.has(k)) groupesRecents.set(k, []);
  groupesRecents.get(k).push(d);
}
const recentes = [...groupesRecents.entries()]
  .map(([k, groupe]) => {
    groupe.sort(parDate);
    const principal = principalDe(groupe);
    const resume = resumeDe.get(k);
    return {
      numero: principal.numero ?? null,
      numeros: numerosDe(groupe),
      date: groupe[0].date ?? null,
      derniere: groupe.at(-1).date ?? null,
      instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
      statutDossier: principal.statutDossier ?? null,
      etapeFinale: principal.etapeFinale ?? null,
      echeance: principal.echeance ?? null,
      objet: principal.objet ?? null,
      puces: resume?.puces?.length && !resume.sansContenuSubstantiel ? resume.puces : [],
      pdf: principal.sommairePdf ?? principal.pdf ?? null,
      resolutions: groupe.filter((d) => d.instance).map((d) => ({ numero: d.numero ?? null, instance: d.instance, date: d.date ?? null })),
    };
  })
  .filter((d) => d.numero && (d.derniere ?? '') >= depuisRecent)
  .sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));
// ---------- les dossiers de l'année et les organismes (suivre un organisme) ----------
// data/dossiers.json : tous les dossiers de l'année, compacts (ce qu'on cherche et ce qu'on
// affiche), pour la vue « organisme » de Mes dossiers — chargé seulement quand un abonné l'ouvre.
// data/organismes.json : des SUGGESTIONS de noms d'entreprises et d'organismes, repérés par leur
// forme juridique (« inc. », « ltée »…) ou par « l'organisme X » dans les objets et les résumés.
// Le repérage est mécanique et imparfait : ce ne sont que des suggestions, l'abonné écrit le nom
// qu'il veut suivre, et on cherche ce nom tel quel (mot entier, sans accents ni majuscules).
const annee = [...groupesRecents.entries()]
  .map(([k, groupe]) => {
    groupe.sort(parDate);
    const principal = principalDe(groupe);
    const resume = resumeDe.get(k);
    return {
      numero: principal.numero ?? null,
      // Tous les numéros du dossier (sommaire et résolutions) : un projet peut citer une résolution
      // seule (CA-2026-0362) là où ce fichier la range sous son sommaire (DE2026-212).
      numeros: numerosDe(groupe),
      date: groupe[0].date ?? null,
      derniere: groupe.at(-1).date ?? null,
      instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
      statutDossier: principal.statutDossier ?? null,
      theme: principal.theme ?? null,
      objet: principal.objet ?? null,
      puces: resume?.puces?.length && !resume.sansContenuSubstantiel ? resume.puces : [],
      montant: resume?.montantPrincipal ?? null,
      pdf: principal.sommairePdf ?? principal.pdf ?? null,
    };
  })
  .filter((d) => d.numero)
  .sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));
const texteAnnee = JSON.stringify({ generatedAt: new Date().toISOString(), themes, dossiers: annee });
await writeFile('data/dossiers.json', texteAnnee, 'utf8');

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOT_NOM = "(?:[A-ZÀ-Ý0-9][\\p{L}0-9'’&.\\-]*|de|du|des|la|le|les|et|d'|l'|à|en|pour|sur)";
const FORME_JURIDIQUE = new RegExp(`(${MOT_NOM}(?:\\s+${MOT_NOM}){0,8},?\\s+(?:inc\\.|ltée|limitée|s\\.e\\.n\\.c\\.|S\\.E\\.N\\.C\\.|S\\.E\\.C\\.))`, 'gu');
const ORGANISME = /l['’]organisme\s+«?\s*([A-ZÀ-Ý][^,;()«»]{2,80}?)\s*»?(?=\s+(?:relativement|dans le cadre|pour|afin|concernant|visant|en vue)\b|[,;().]|$)/gu;
const candidats = new Map();
const nettoyerNom = (brut) => {
  let nom = brut.replace(/\s+/g, ' ').trim();
  // La fin d'une phrase avalée : « Chutes Montmorency et Orsainville. Gazon 911 inc. » → « Gazon 911
  // inc. » (un mot d'au moins 3 lettres suivi d'un point ; « P.E. Pageau » n'est pas touché).
  nom = nom.replace(/^.*\p{L}{3,}\.\s+(?=[\p{Lu}0-9])/u, '');
  // Une entente « entre la Ville de Québec et X » : on garde X.
  nom = nom.replace(/^(?:la\s+)?Ville(?:\s+de\s+[\p{Lu}][\p{L}-]+)?\s+et\s+/u, '');
  // Articles et prépositions en minuscules du début (« à Pagui inc. », « de Villéco inc. », « le
  // Patro… ») ; « Les Excavations Lafontaine », avec majuscule, fait partie du nom.
  let avant;
  do { avant = nom; nom = nom.replace(/^(?:\d{4}\.?\s+|(?:de|du|des|la|le|les|et|à|en|pour|sur|par|avec|au|aux)\s+|[dl]['’])/u, ''); } while (nom !== avant);
  // La suite d'une phrase après « l'organisme X » : « Canards Illimités Canada la conception des plans ».
  nom = nom.replace(/\s+(?:(?:la|le|les|relative|relatif|pour|afin)\s+|l['’])\p{Ll}.*$/u, '');
  return nom.replace(/[ ,]+$/, '').trim();
};
const noter = (brut, numero) => {
  const nom = nettoyerNom(brut);
  const mots = nom.replace(/\b(?:inc|ltée|limitée|s\.e\.n\.c|s\.e\.c)\.?$/i, '').trim().split(/\s+/).filter(Boolean);
  // Au moins deux mots, ou un seul avec sa forme juridique (« Pagui inc. »), ou un nom-numéro ;
  // jamais un seul nom de lieu ni un bout de phrase avec un montant.
  const formeJuridique = /\s(?:inc|ltée|limitée|s\.e\.n\.c|s\.e\.c)\.?$/i.test(nom);
  if (nom.length < 5 || nom.length > 90 || (mots.length < 2 && !/^\d/.test(nom) && !(formeJuridique && mots[0]?.length >= 4)) || /^(?:Québec|Canada|Ville)\b.{0,6}$/i.test(nom) || /\$|\d \d{3}/.test(nom) || /\s(?:et|de|du|des)$/i.test(nom)
    // Un bout coupé : « Association Y », « Loisirs des Hauts-Sentiers L », « Fonds 2 ».
    || /\s\p{Lu}$/u.test(nom) || /^\S+\s\d$/u.test(nom)) return;
  // « Loisirs Montcalm inc. » et « Loisirs Montcalm inc », « Tétra Tech » et « Tetra Tech » : un seul.
  const cle = sansAccents(nom).replace(/[’']/g, "'").replace(/[.\s]+$/, '');
  if (!candidats.has(cle)) candidats.set(cle, { graphies: new Map(), dossiers: new Set() });
  const c = candidats.get(cle);
  c.graphies.set(nom, (c.graphies.get(nom) ?? 0) + 1);
  c.dossiers.add(numero);
};
for (const d of annee) {
  const texte = [d.objet, ...d.puces].join('\n');
  for (const m of texte.matchAll(FORME_JURIDIQUE)) noter(m[1], d.numero);
  for (const m of texte.matchAll(ORGANISME)) noter(m[1], d.numero);
}
// « Fortier inc. » n'est que la fin de « Charles-Auguste Fortier inc. », « St-Sacrement inc. » celle de
// « Centre des Loisirs St-Sacrement inc. » (un mot en minuscules a coupé le repérage) : on les écarte.
const cles = [...candidats.keys()];
const organismes = [...candidats.entries()]
  .filter(([cle]) => !cles.some((autre) => autre !== cle && autre.endsWith(` ${cle}`)))
  .map(([, c]) =>({ nom: [...c.graphies].sort((a, b) => b[1] - a[1])[0][0], dossiers: c.dossiers.size }))
  .sort((a, b) => b.dossiers - a.dossiers || a.nom.localeCompare(b.nom, 'fr'));
await writeFile('data/organismes.json', JSON.stringify({ generatedAt: new Date().toISOString(), avertissement: 'Suggestions repérées automatiquement dans les objets et les résumés ; imparfaites.', organismes }), 'utf8');
console.log(`Dossiers de l'année : ${annee.length} · ${(texteAnnee.length / 1024).toFixed(0)} Ko · organismes suggérés : ${organismes.length}.`);

const texteRecentes = JSON.stringify({ generatedAt: new Date().toISOString(), depuis: depuisRecent, dossiers: recentes });
await writeFile('data/recentes.json', texteRecentes, 'utf8');
console.log(`Décisions récentes : ${recentes.length} dossiers depuis le ${depuisRecent} · ${(texteRecentes.length / 1024).toFixed(0)} Ko.`);
