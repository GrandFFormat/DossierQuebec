// Les fichiers que lit « Mes dossiers » (/mes-dossiers, commun à toutes les villes).
//
//   node scripts/projets-publics.js
//
// Mes dossiers ne doit jamais télécharger toutes les décisions d'une ville : avec quinze
// villes, ce serait une quinzaine de mégaoctets à chaque visite. On lui prépare ici, à
// chaque rafraîchissement, exactement ce qu'il affiche :
//
//   data/projets/index.json    tous les sujets de la ville en quelques lignes chacun — pour
//                              les en-têtes et les suggestions. Quelques kilo-octets.
//   data/projets/<cle>.json    un sujet au complet — chiffres, courbe par mois, chaque
//                              dossier avec son parcours. Chargé à l'ouverture du sujet.
//   data/recentes.json         les dossiers qui ont bougé depuis 45 jours (alertes par mot).
//   data/dossiers.json         tous les dossiers de l'année, compacts (suivre un organisme).
//   data/organismes.json       des suggestions de noms d'entreprises et d'organismes.
//
// LE FORMAT EST COMMUN À TOUTES LES VILLES : copié de quebec/ et levis/, mêmes champs.
//
// CE QUI DIFFÈRE À MONTRÉAL, et il faut le savoir pour lire ce fichier :
//
//   • Pas de sommaire décisionnel. La Ville en produit — 4 088 de nos 5 244 résolutions
//     portent un numéro de dossier — mais elle ne publie pas l'adresse où les consulter,
//     et nous la lui avons demandée. Donc : aucun résumé en langage clair, donc `puces`
//     toujours vide, et `pdf` est le procès-verbal, jamais le sommaire.
//   • Un dossier, ici, c'est un NUMÉRO DE DOSSIER DÉCISIONNEL et les résolutions qui le
//     portent. C'est le bon regroupement et il est visible à l'œil : le dossier 1265298015
//     passe du comité exécutif au conseil municipal puis à l'agglomération, une résolution
//     à chaque étape. Une résolution sans numéro de dossier reste seule dans son dossier.
//   • Pas de data/attendues.json. Ce fichier liste les dossiers en attente d'une décision
//     finale, avec la date cible que la Ville écrit dans le SOMMAIRE. Sans sommaire, on ne
//     sait ni qu'un dossier est en attente ni quand il doit revenir. Écrire un fichier vide
//     laisserait croire qu'il n'y a rien en attente ; ne rien écrire dit la vérité, et Mes
//     dossiers traite un fichier absent comme « pas de données pour cette ville ».

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROJETS } from '../lib/projets.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const DOSSIER = 'data/projets';
// Les fiches de procès-verbaux et d'ordres du jour sont des documents, pas des décisions.
const EST_DECISION = (d) => d.type === 'Résolution';

const lire = async (f, repli) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return repli;
  }
};
const parDate = (a, b) => (a.date ?? '').localeCompare(b.date ?? '');
// La résolution la plus récente d'un dossier : c'est elle qui dit où il en est.
const principalDe = (groupe) => groupe.at(-1);
const numerosDe = (groupe) => [...new Set(groupe.map((d) => d.numero).filter(Boolean))];

// Pourquoi un sujet de Montréal n'a pas de « Où en est le projet ». Sans cette phrase, la
// page affiche une liste de décisions nues et le lecteur en conclut qu'il n'y a rien à
// voir, alors que le manque vient de la Ville et qu'il est en voie d'être comblé. Le champ
// est facultatif et lu par /mes-dossiers : toute ville à qui il manque ses sommaires peut
// dire pourquoi, de la même façon.
const EN_ATTENTE_DE = {
  titre: "Pas de récapitulatif : le document qui l'écrirait n'est pas ouvert",
  titreEn: 'No recap: the document that would write it is not open',
  texte:
    "Un projet se raconte à partir des sommaires décisionnels — la note que l'administration écrit pour chaque dossier, avec le contexte, les montants et les options écartées. C'est de là que viennent les récapitulatifs de Québec et de Lévis. Montréal produit exactement les mêmes documents : 4 088 de nos décisions portent leur numéro de dossier. Mais elle n'en publie pas l'adresse, et sans adresse personne ne peut les ouvrir — ni un citoyen, ni notre robot. Nous la lui avons demandée. D'ici là, ce projet montre ses décisions telles que le conseil les a adoptées, chacune avec son procès-verbal officiel.",
  texteEn:
    "A project's story comes from the decision summaries — the memo the administration writes for each file, with the context, the amounts and the options set aside. That is where the Québec and Lévis recaps come from. Montréal produces exactly the same documents: 4,088 of our decisions carry their file number. But it publishes no address for them, and without an address nobody can open them — neither a citizen nor our robot. We have asked for it. Until then, this project shows its decisions as the council adopted them, each with its official minutes.",
};

// La même chose en deux phrases, en tête de la liste des projets de la ville : sans elle, on
// croit que Montréal a des projets plus pauvres que les autres villes, alors que c'est un
// document qui manque.
const LEGENDE = {
  texte:
    "Les projets se racontent à partir des sommaires décisionnels, la note que l'administration écrit pour chaque dossier. Montréal produit ces documents mais n'en publie pas l'adresse : ni un citoyen ni notre robot ne peut les ouvrir, donc aucun projet de Montréal n'a encore de récapitulatif. Nous avons demandé cette adresse à la Ville.",
  texteEn:
    "Projects are told from the decision summaries, the memo the administration writes for each file. Montréal produces these documents but publishes no address for them: neither a citizen nor our robot can open them, so no Montréal project has a recap yet. We have asked the City for that address.",
};


const decisions = await lire('data/decisions.json', null);
if (!decisions?.decisions) {
  console.error('data/decisions.json introuvable : rien à publier.');
  process.exit(1);
}
const themes = decisions.themes ?? {};

// Regroupe des résolutions par numéro de dossier décisionnel ; à défaut, chacune seule.
function grouper(liste) {
  const groupes = new Map();
  for (const d of liste) {
    const k = d.dossier ?? d.id;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }
  for (const g of groupes.values()) g.sort(parDate);
  return groupes;
}

function ficheDossier(groupe) {
  const principal = principalDe(groupe);
  return {
    numero: principal.numero ?? null,
    numeros: numerosDe(groupe),
    date: groupe[0].date ?? null,
    derniere: groupe.at(-1).date ?? null,
    instances: [...new Set(groupe.map((d) => d.instance).filter(Boolean))],
    // Montréal ne publie pas ses sommaires : ni statut, ni étape finale, ni date cible.
    statutDossier: null,
    etapeFinale: null,
    echeance: null,
    theme: principal.theme ?? null,
    objet: principal.objet ?? null,
    puces: [], // aucun résumé en langage clair tant que les sommaires ne sont pas accessibles
    pdf: principal.pdf ?? null,
    resolutions: groupe.map((d) => ({ numero: d.numero ?? null, instance: d.instance, date: d.date ?? null, resultat: d.resultat ?? null })),
  };
}

// ---------- un fichier par sujet, plus l'index ----------

await mkdir(DOSSIER, { recursive: true });
const index = {};
let octets = 0;

for (const [cle, def] of Object.entries(PROJETS)) {
  const siennes = decisions.decisions.filter((d) => EST_DECISION(d) && d.projets?.includes(cle));
  const dossiers = [...grouper(siennes).values()].map(ficheDossier);
  dossiers.sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));

  const derniere = siennes.map((d) => d.date).filter(Boolean).sort().pop() ?? null;
  const annee = Number((derniere ?? decisions.generatedAt ?? new Date().toISOString()).slice(0, 4));
  const parMois = Array(12).fill(0);
  for (const d of siennes) if (d.date?.startsWith(String(annee))) parMois[Number(d.date.slice(5, 7)) - 1]++;
  const parTheme = new Map();
  for (const d of dossiers) if (d.theme) parTheme.set(d.theme, (parTheme.get(d.theme) ?? 0) + 1);

  const chiffres = {
    decisions: siennes.length,
    dossiers: dossiers.length,
    resolutions: siennes.length,
    enAttente: 0, // inconnu sans les sommaires
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
    // Pas de récapitulatif écrit par un modèle : il se nourrit des sommaires, qui manquent.
    recap: null,
    enAttenteDe: EN_ATTENTE_DE,
    dossiers,
  };
  const texte = JSON.stringify(projet);
  octets += texte.length;
  await writeFile(`${DOSSIER}/${cle}.json`, texte, 'utf8');

  // Ce qu'une carte montre sans ouvrir le sujet : la décision la plus récente.
  index[cle] = { titre: def.titre, description: def.description, annee, ...chiffres, enBref: null, enAttenteDe: EN_ATTENTE_DE.titre, plusRecent: dossiers[0]?.objet ?? null };
}

// Un sujet retiré de lib/projets.js ne laisse pas de fichier orphelin.
for (const f of await readdir(DOSSIER)) {
  if (f !== 'index.json' && f.endsWith('.json') && !(f.slice(0, -5) in PROJETS)) await rm(`${DOSSIER}/${f}`);
}
const texteIndex = JSON.stringify({ generatedAt: new Date().toISOString(), legende: LEGENDE, projets: index });
await writeFile(`${DOSSIER}/index.json`, texteIndex, 'utf8');
console.log(`Projets publics : ${Object.keys(index).length} sujets · index ${(texteIndex.length / 1024).toFixed(1)} Ko · fichiers de sujet ${(octets / 1024).toFixed(0)} Ko au total.`);

// ---------- les dossiers de l'année, et ceux qui ont bougé récemment ----------

const groupesAnnee = grouper(decisions.decisions.filter(EST_DECISION));
const tous = [...groupesAnnee.values()].map(ficheDossier).filter((d) => d.numero);
tous.sort((a, b) => (b.derniere ?? '').localeCompare(a.derniere ?? ''));

const RECENT_JOURS = 45;
const plusRecente = decisions.decisions.map((d) => d.date).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10);
const depuisRecent = new Date(Date.parse(plusRecente) - RECENT_JOURS * 864e5).toISOString().slice(0, 10);
const recentes = tous.filter((d) => (d.derniere ?? '') >= depuisRecent);
const texteRecentes = JSON.stringify({ generatedAt: new Date().toISOString(), depuis: depuisRecent, dossiers: recentes });
await writeFile('data/recentes.json', texteRecentes, 'utf8');
console.log(`Décisions récentes : ${recentes.length} dossiers depuis le ${depuisRecent} · ${(texteRecentes.length / 1024).toFixed(0)} Ko.`);

const annee = tous.map((d) => ({
  numero: d.numero,
  numeros: d.numeros,
  date: d.date,
  derniere: d.derniere,
  instances: d.instances,
  statutDossier: null,
  theme: d.theme,
  objet: d.objet,
  puces: [],
  montant: null, // le montant vient du résumé du sommaire ; pas de sommaire, pas de montant
  pdf: d.pdf,
}));
const texteAnnee = JSON.stringify({ generatedAt: new Date().toISOString(), themes, dossiers: annee });
await writeFile('data/dossiers.json', texteAnnee, 'utf8');

// ---------- les organismes qu'on peut suivre ----------
// Des SUGGESTIONS, repérées par la forme juridique (« inc. », « ltée »…) ou par
// « l'organisme X » dans les objets. Le repérage est mécanique et imparfait : l'abonné
// écrit le nom qu'il veut suivre, et on cherche ce nom tel quel.
const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOT_NOM = "(?:[A-ZÀ-Ý0-9][\\p{L}0-9'’&.\\-]*|de|du|des|la|le|les|et|d'|l'|à|en|pour|sur)";
const FORME_JURIDIQUE = new RegExp(`(${MOT_NOM}(?:\\s+${MOT_NOM}){0,8},?\\s+(?:inc\\.|ltée|limitée|s\\.e\\.n\\.c\\.|S\\.E\\.N\\.C\\.|S\\.E\\.C\\.))`, 'gu');
const ORGANISME = /l['’]organisme\s+«?\s*([A-ZÀ-Ý][^,;()«»]{2,80}?)\s*»?(?=\s+(?:relativement|dans le cadre|pour|afin|concernant|visant|en vue)\b|[,;().]|$)/gu;
const candidats = new Map();
const nettoyerNom = (brut) => {
  let nom = brut.replace(/\s+/g, ' ').trim();
  nom = nom.replace(/^.*\p{L}{3,}\.\s+(?=[\p{Lu}0-9])/u, '');
  nom = nom.replace(/^(?:la\s+)?Ville(?:\s+de\s+[\p{Lu}][\p{L}-]+)?\s+et\s+/u, '');
  let avant;
  do { avant = nom; nom = nom.replace(/^(?:\d{4}\.?\s+|(?:de|du|des|la|le|les|et|à|en|pour|sur|par|avec|au|aux)\s+|[dl]['’])/u, ''); } while (nom !== avant);
  nom = nom.replace(/\s+(?:(?:la|le|les|relative|relatif|pour|afin)\s+|l['’])\p{Ll}.*$/u, '');
  return nom.replace(/[ ,]+$/, '').trim();
};
const noter = (brut, numero) => {
  const nom = nettoyerNom(brut);
  const mots = nom.replace(/\b(?:inc|ltée|limitée|s\.e\.n\.c|s\.e\.c)\.?$/i, '').trim().split(/\s+/).filter(Boolean);
  const formeJuridique = /\s(?:inc|ltée|limitée|s\.e\.n\.c|s\.e\.c)\.?$/i.test(nom);
  if (nom.length < 5 || nom.length > 90 || (mots.length < 2 && !/^\d/.test(nom) && !(formeJuridique && mots[0]?.length >= 4)) || /^(?:Québec|Canada|Ville|Montréal)\b.{0,6}$/i.test(nom) || /\$|\d \d{3}/.test(nom) || /\s(?:et|de|du|des)$/i.test(nom)
    || /\s\p{Lu}$/u.test(nom) || /^\S+\s\d$/u.test(nom)) return;
  const cle = sansAccents(nom).replace(/[’']/g, "'").replace(/[.\s]+$/, '');
  if (!candidats.has(cle)) candidats.set(cle, { graphies: new Map(), dossiers: new Set() });
  const c = candidats.get(cle);
  c.graphies.set(nom, (c.graphies.get(nom) ?? 0) + 1);
  c.dossiers.add(numero);
};
for (const d of annee) {
  const texte = d.objet ?? '';
  for (const m of texte.matchAll(FORME_JURIDIQUE)) noter(m[1], d.numero);
  for (const m of texte.matchAll(ORGANISME)) noter(m[1], d.numero);
}
// « Fortier inc. » n'est que la fin de « Charles-Auguste Fortier inc. » : on l'écarte.
const cles = [...candidats.keys()];
const organismes = [...candidats.entries()]
  .filter(([cle]) => !cles.some((autre) => autre !== cle && autre.endsWith(` ${cle}`)))
  .map(([, c]) => ({ nom: [...c.graphies].sort((a, b) => b[1] - a[1])[0][0], dossiers: c.dossiers.size }))
  .sort((a, b) => b.dossiers - a.dossiers || a.nom.localeCompare(b.nom, 'fr'));
await writeFile('data/organismes.json', JSON.stringify({ generatedAt: new Date().toISOString(), avertissement: 'Suggestions repérées automatiquement dans les objets ; imparfaites.', organismes }), 'utf8');
console.log(`Dossiers de l'année : ${annee.length} · ${(texteAnnee.length / 1024).toFixed(0)} Ko · organismes suggérés : ${organismes.length}.`);
