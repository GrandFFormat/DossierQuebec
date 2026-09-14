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

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROJETS } from '../lib/projets.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const PAS_UN_DOSSIER = new Set(['Procès-verbaux', 'Tableaux des décisions']);
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
    const principal = groupe.find((d) => d.id === k) ?? groupe[0];
    const resume = resumeDe.get(k);
    return {
      numero: principal.numero ?? null,
      numeros: [...new Set(groupe.map((d) => d.numero).filter(Boolean))],
      date: principal.date ?? null,
      derniere: groupe.at(-1).date ?? null,
      instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
      statutDossier: principal.statutDossier ?? null,
      etapeFinale: principal.etapeFinale ?? null,
      echeance: principal.echeance ?? null,
      theme: principal.theme ?? null,
      objet: principal.objet ?? null,
      puces: resume?.puces?.length ? resume.puces : [],
      pdf: principal.pdf ?? null,
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

// ---------- les dossiers ouverts (abonnés, dans Mes dossiers) ----------
// data/attendues.json : chaque dossier encore en attente d'une décision finale, avec l'instance qui
// doit décider, la date cible telles que la Ville les écrit dans le sommaire, et son résumé. Une
// date cible n'est pas un ordre du jour : le dossier peut être reporté — la page le dit.
// FORMAT COMMUN À TOUTES LES VILLES :
//   { generatedAt, themes: { cle: { libelle, couleur } }, projets: { cle: titre },
//     decisions: [{ numero, date, instance, groupe, echeance, projets[], theme, unite, phrase,
//     puces[], pdf }] }   groupe : l'instance regroupée pour le menu de Mes dossiers
const groupeInstance = (instance) => {
  const i = (instance ?? '').toLowerCase();
  if (i.includes('agglom')) return "Conseil d'agglomération";
  if (i.includes('arrondissement')) return "Conseils d'arrondissement";
  if (i.includes('exécutif') || i.includes('executif')) return 'Comité exécutif';
  if (i.includes('conseil de la ville')) return 'Conseil de la ville';
  return instance || 'Instance non indiquée';
};
const attendues = decisions.decisions
  .filter((d) => d.type === 'Sommaires et mémoires' && d.statutDossier === 'en_cours' && d.numero)
  .map((d) => {
    const resume = resumeDe.get(d.id);
    return {
      numero: d.numero,
      date: d.date ?? null,
      instance: d.etapeFinale ?? null,
      groupe: groupeInstance(d.etapeFinale),
      echeance: d.echeance ?? null,
      projets: (d.projets ?? []).filter((cle) => cle in PROJETS),
      theme: d.theme ?? null,
      unite: d.unite ?? null,
      phrase: resume?.puces?.[0] ?? d.objet ?? '',
      puces: resume?.puces?.length && !resume.sansContenuSubstantiel ? resume.puces : [],
      pdf: d.pdf ?? null,
    };
  })
  .sort((a, b) => (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999') || (b.date ?? '').localeCompare(a.date ?? ''));
// Les pastilles de sujet (libellé, couleur) et le titre des projets, pour afficher sans autre fichier.
const themesUtilises = Object.fromEntries([...new Set(attendues.map((d) => d.theme).filter(Boolean))].map((t) => [t, { libelle: themes[t]?.libelle ?? t, couleur: themes[t]?.couleur ?? null }]));
const projetsUtilises = Object.fromEntries([...new Set(attendues.flatMap((d) => d.projets))].map((cle) => [cle, PROJETS[cle].titre]));
const texteAttendues = JSON.stringify({ generatedAt: new Date().toISOString(), themes: themesUtilises, projets: projetsUtilises, decisions: attendues });
await writeFile('data/attendues.json', texteAttendues, 'utf8');
console.log(`Décisions attendues : ${attendues.length} dossiers en attente, dont ${attendues.filter((d) => d.echeance).length} avec une date cible · ${(texteAttendues.length / 1024).toFixed(1)} Ko.`);

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
    const principal = groupe.find((d) => d.id === k) ?? groupe[0];
    const resume = resumeDe.get(k);
    return {
      numero: principal.numero ?? null,
      numeros: [...new Set(groupe.map((d) => d.numero).filter(Boolean))],
      date: principal.date ?? null,
      derniere: groupe.at(-1).date ?? null,
      instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
      statutDossier: principal.statutDossier ?? null,
      etapeFinale: principal.etapeFinale ?? null,
      echeance: principal.echeance ?? null,
      objet: principal.objet ?? null,
      puces: resume?.puces?.length && !resume.sansContenuSubstantiel ? resume.puces : [],
      pdf: principal.pdf ?? null,
      resolutions: groupe.filter((d) => d.instance).map((d) => ({ numero: d.numero ?? null, instance: d.instance, date: d.date ?? null })),
    };
  })
  .filter((d) => d.numero && (d.derniere ?? '') >= depuisRecent)
  .sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));
const texteRecentes = JSON.stringify({ generatedAt: new Date().toISOString(), depuis: depuisRecent, dossiers: recentes });
await writeFile('data/recentes.json', texteRecentes, 'utf8');
console.log(`Décisions récentes : ${recentes.length} dossiers depuis le ${depuisRecent} · ${(texteRecentes.length / 1024).toFixed(0)} Ko.`);
