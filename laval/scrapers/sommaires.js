// Les sommaires décisionnels : un petit PDF par dossier, lu et mis en fiche.
//
//   node scrapers/sommaires.js [--year=2026] [--max=120] [--depuis=2026-07-13] [--force]
//   node scrapers/sommaires.js --reextraire                relit les champs depuis le cache, sans réseau
//   node scrapers/sommaires.js --fichier=chemin/vers/SD-2026-3136_1.0.pdf     un PDF local, sans réseau
//
// À Laval, le sommaire décisionnel est la note de l'administration qui précède chaque résolution
// du conseil : service, objet, districts touchés, contrat ou règlement, décisions antérieures,
// contexte, aspects financiers, puis le texte de la résolution recommandée. Contrairement à
// Longueuil (un document de séance de mille pages), chaque sommaire est ici UN PDF À PART, de
// 10 à 15 ko et de 1 à 3 pages, sur le stockage ouvert de la Ville, à l'adresse que donne
// l'index (decisions.json : `sommairePdf`, `sommairePublie`). Seuls les sommaires du conseil
// municipal sont publiés ; ceux que citent les procès-verbaux du comité exécutif répondent 404
// en XML sur le stockage — on ne devine aucune adresse, on les compte (`nonPublies`).
//
// LE GABARIT, tel que pdf.js le rend (lib/pdf.js recolle en une ligne tout ce qui est à la même
// hauteur, colonnes comprises) :
//
//   [445]SOMMAIRE DÉCISIONNEL                                   en-tête, répété sur chaque page
//   [28]SERVICE / DIVISION  [142]Service de l'approvisionnement / Achats
//   [497]SD-2025-5913
//   [142]Recommander au conseil d'octroyer le contrat DOS-3245…  l'objet, en colonne à x ≈ 142,
//   [28]OBJET                                                    sur plusieurs lignes ; le libellé
//   [142]…plateforme de diffusion de courriels de masse           est au milieu du bloc
//   [28]No dossier(s) interne(s) :  [156]600722
//   [28]DISTRICT(S) :  [156]01-Saint-François                    parfois plusieurs, un par ligne
//   [32]Actions :  [81]OCTROI
//   [28]Contrat                                                  bloc contrat : libellé à droite,
//   [90]No contrat :  [152]DOS-3245                              valeur en colonne à x ≈ 152
//   [101]Montant :  [152]839 679,72 $
//   [94]No règlement :  [170]L-13021  [363]Type de règlement :  [464]Emprunt   (bloc règlement :
//   [71]Titre du règlement :  [170]décrétant l'emploi…           deux colonnes sur une ligne)
//   [28]DÉCISION(S) ANTÉRIEURE(S)                                sections : titre à x ≈ 28,
//   [28]2020-12-01  [99]CM-20201201-1029  [206]OCTROI - CONTRAT  corps à x ≈ 42
//   [28]CONTEXTE / JUSTIFICATIONS … IMPACTS MAJEURS … ASPECTS FINANCIERS … CULTURE …
//   [28]CALENDRIER / ÉTAPES SUBSÉQUENTES … CADRE NORMATIF … REMARQUE(S)
//   [28]EN CONSÉQUENCE, IL Y AURAIT LIEU                         le texte de la résolution
//   [28]CERTIFICATION                                            recommandée (« resume »)
//   [28]Laval – Sommaire décisionnel   [489]Page 1 de 3          pied, répété
//
// ON LIT PAR FRAGMENTS, PAS PAR TEXTE. Sur une ligne recollée, le libellé est le fragment qui
// finit par « : » et sa valeur, les fragments qui le suivent jusqu'au libellé suivant ; c'est ce
// qui sépare « No règlement : L-13021 » de « Type de règlement : Emprunt » sur la même ligne.
// Quand un libellé n'a rien en face et que la ligne d'en dessous n'a qu'une valeur, on l'attache
// mais on le dit (`incertain`, avertissement) : le montant publié dans l'index n'est que celui lu
// EN FACE de « Montant : ». Rien n'est calculé, tout est recopié tel quel. Le « Résumé » du
// gabarit est celui des décisions antérieures (le texte de leur résolution) ; ce qu'on appelle
// `resume` ici est le bloc « EN CONSÉQUENCE, IL Y AURAIT LIEU », la résolution recommandée.
//
// LE CACHE (data/textes/sommaire_<SD>.json, hors dépôt) garde le texte, les champs et les
// fragments : quand la lecture change (VERSION_LECTURE augmente), les champs sont réextraits du
// cache sans rien redemander à la Ville. Un sommaire n'est retéléchargé que si son adresse change
// (nouvelle version du PDF) ou si son texte manque au cache alors qu'il n'a pas encore de résumé
// (cache perdu en intégration continue). --max borne les téléchargements par exécution.
// L'index publié (data/sommaires.json) est reconstruit à chaque fois : les entrées précédentes
// sont gardées, celles relues sont remplacées.

import { writeFile, readFile } from 'node:fs/promises';
import { pdf as telechargerPdf, lireNomFichier, STOCKAGE } from '../lib/lav.js';
import { lirePdf } from '../lib/pdf.js';
import { lireJson, ecrireCache, lireCache } from './decisions.js';

const OUT = new URL('../data/sommaires.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
const RESUMES = new URL('../data/resumes.json', import.meta.url);

// Quand l'extraction des champs change (ce numéro augmente), les sommaires en cache sont relus
// depuis leurs fragments à la prochaine exécution, sans téléchargement.
export const VERSION_LECTURE = 2;

// Les titres de section et les libellés de la fiche commencent dans la marge (x ≈ 28-35) ; les
// valeurs et l'objet sont en colonne (x ≥ 141). Dans le bloc contrat, les libellés sont alignés à
// droite sur x ≈ 146 et les valeurs commencent à 151,7 : ce qui commence après 146 est une valeur
// même s'il finit par deux-points (« Résultat : Lot 1 - Acquisition des bacs roulants : »).
const X_MARGE = 36;
const X_COLONNE = 100;
const X_VALEUR = 146;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// ---------- la lecture d'un sommaire ----------

// Sans accents ni casse, pour reconnaître un titre de section ou un libellé quelle que soit la
// police (« DÉCISION(S) ANTÉRIEURE(S) » ou « DECISION(S) ANTERIEURE(S) »).
function plat(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Les sections du sommaire, par leur titre exact (à plat). L'ordre n'importe pas : chaque titre
// ouvre sa section, qui court jusqu'au titre suivant.
const SECTIONS = [
  ['unites', /^unite\(s\) administrative\(s\) concernee\(s\)$/],
  ['decisionsAnterieures', /^decision\(s\) anterieure\(s\)$/],
  ['contexte', /^contexte(?: \/ justifications?)?$/],
  ['justifications', /^justifications?$/],
  ['impacts', /^impacts? majeurs?$/],
  ['aspectsFinanciers', /^aspects? financiers?$/],
  ['culture', /^culture$/],
  ['calendrier', /^calendrier(?: \/ etapes subsequentes)?$/],
  ['cadreNormatif', /^cadre normatif$/],
  ['remarques', /^remarque\(s\)$/],
  ['resume', /^en consequence, il y aurait lieu$/],
  ['certification', /^certification$/],
];

// Les libellés de la fiche (la partie structurée, entre l'objet et la première section) et le
// champ où va leur valeur. Un libellé inconnu est gardé dans `autres`, jamais perdu.
const LIBELLES = new Map(
  Object.entries({
    'no dossier(s) interne(s)': 'dossierInterne',
    'no lv': 'lv',
    'district(s)': 'districts',
    actions: 'actions',
    "demande d'achat": 'demandeAchat',
    'ct requis': 'ctRequis',
    'date ce souhaitee': 'dateCE',
    'date cm souhaitee': 'dateCM',
    requerant: 'requerant',
    'annee du budget': 'anneeBudget',
    'resolution du ccu': 'resolutionCCU',
    'no contrat': 'contrat.numero',
    montant: 'contrat.montant',
    estimation: 'contrat.estimation',
    'mode de sollicitation': 'contrat.mode',
    'type de contrat': 'contrat.type',
    'duree du contrat': 'contrat.duree',
    recurrence: 'contrat.recurrence',
    reconduction: 'contrat.reconduction',
    "nombre d'addendas": 'contrat.addendas',
    resultat: 'contrat.resultat',
    'no reglement': 'reglement.numero',
    'type de reglement': 'reglement.type',
    'titre du reglement': 'reglement.titre',
    'consultation publique': 'reglement.consultationPublique',
    'dispo. susceptible approb. referendaire': 'reglement.approbationReferendaire',
    "lettre d'invitation": 'reglement.lettreInvitation',
    'approbation externe': 'reglement.approbationExterne',
  })
);

const NUMERO_SD = /^SD-\d{4}-\d+$/;
const MONTANT = /^-?\d[\d  ]*(?:[.,]\d{2})?\s*\$/u;

function titreDeSection(ligne) {
  const f = ligne.fragments;
  if (f.length !== 1 || f[0].x >= X_MARGE) return null;
  const t = plat(f[0].str);
  for (const [cle, re] of SECTIONS) if (re.test(t)) return cle;
  return null;
}

// Les lignes utiles de toutes les pages, à la suite : sans l'en-tête répété (tout ce qui est à la
// hauteur du numéro SD ou au-dessus, plus `coupe` points en dessous quand le service déborde)
// ni le pied de page. Les fragments vides (les espaces que pdf.js met entre les colonnes) sont
// retirés.
export function lignesUtiles(pages, coupe = 2) {
  const lignes = [];
  for (const p of pages) {
    const ligneSD = p.lignes.find((l) => l.fragments.some((f) => f.x > 400 && NUMERO_SD.test(f.str.trim())));
    for (const l of p.lignes) {
      if (ligneSD && l.y >= ligneSD.y - coupe) continue;
      const texte = l.texte.trim();
      if (/^page \d+ de \d+$/i.test(texte) || /^laval\s*[–-]\s*sommaire decisionnel$/.test(plat(texte))) continue;
      const fragments = l.fragments.filter((f) => f.str.trim() !== '').map((f) => ({ x: f.x, str: f.str.trim() }));
      if (!fragments.length) continue;
      lignes.push({ page: p.numero, y: l.y, texte, fragments });
    }
  }
  return lignes;
}

// L'en-tête de la première page : le numéro SD (colonne de droite) et « SERVICE / DIVISION »,
// dont la valeur est en colonne, sur la même ligne que le libellé ou sur celle du dessus quand
// elle est longue — et qui DÉBORDE parfois sous la ligne du numéro SD (« Bureau des transactions
// et des investissements immobiliers / » puis « Transactions immobilières », 12,7 points plus
// bas), là où on attendrait l'objet. L'objet, lui, commence toujours 30 points ou plus sous le
// numéro : une ligne en colonne à moins de 16 points de la précédente continue le service.
// `coupe` dit de combien descendre sous le numéro SD pour retirer cet en-tête de chaque page.
export function enTeteSommaire(page1) {
  const ligneSD = page1?.lignes.find((l) => l.fragments.some((f) => f.x > 400 && NUMERO_SD.test(f.str.trim())));
  const numero = ligneSD?.fragments.find((f) => NUMERO_SD.test(f.str.trim()))?.str.trim() ?? null;
  const enColonne = (l) => l.fragments.filter((f) => f.str.trim() && f.x >= X_COLONNE && f.x < 480 && !/^(?:sommaire decisionnel|no sd)$/.test(plat(f.str)));
  const morceaux = [];
  let yBas = ligneSD?.y ?? Infinity;
  for (const l of page1?.lignes ?? []) {
    if (ligneSD && l.y < ligneSD.y - 2) continue;
    const frags = enColonne(l);
    if (frags.length) yBas = Math.min(yBas, l.y);
    morceaux.push(...frags.map((f) => f.str.trim()));
  }
  if (ligneSD) {
    const dessous = page1.lignes.filter((l) => l.y < ligneSD.y - 2).sort((a, b) => b.y - a.y);
    for (const l of dessous) {
      const frags = enColonne(l);
      if (!frags.length || frags.length !== l.fragments.filter((f) => f.str.trim()).length || yBas - l.y > 16) break;
      morceaux.push(...frags.map((f) => f.str.trim()));
      yBas = l.y;
    }
  }
  const serviceDivision = morceaux.join(' ').replace(/\s+/g, ' ').trim() || null;
  const [service, ...division] = serviceDivision ? serviceDivision.split(/\s+\/\s+/) : [null];
  return { numero, service: service || null, division: division.length ? division.join(' / ') : null, coupe: ligneSD ? Math.max(2, ligneSD.y - yBas + 1) : 2 };
}

// « 01-Saint-François, 02-Saint-Vincent-de-Paul » ou un district par ligne -> [{ numero, nom }],
// la même forme que les districts de decisions.json (lib/pv.js, lireDistricts).
export function lireDistrictsSommaire(valeurs) {
  const out = [];
  for (const v of valeurs) {
    for (const part of String(v).split(/,\s*(?=\d{2}\s*-)/)) {
      const m = part.trim().match(/^(\d{2})\s*[-–]\s*(.+)$/);
      if (m) out.push({ numero: Number(m[1]), nom: m[2].trim().replace(/[,;\s]+$/, '') });
      else if (part.trim()) out.push({ numero: null, nom: part.trim() });
    }
  }
  return out;
}

// La fiche : les paires libellé/valeur lues par fragments. Une ligne peut porter deux paires
// (« No règlement : L-13021 » et « Type de règlement : Emprunt »). Une ligne sans libellé dont
// les fragments sont en colonne continue la valeur précédente (titre de règlement sur quatre
// lignes, districts un par ligne, résultat d'un lot sur deux lignes). Une ligne qui commence
// dans la marge sans deux-points — un sous-tableau (« Requérant(s) | Représentant(s) »,
// « No Règlement | Titre », « Mandataire(s) »), ou le sous-titre « Contrat » — ferme la valeur
// en cours : ce qui suit n'en est pas la suite. Chaque paire dit si sa valeur était en face du
// libellé (`memeLigne`) : c'est la seule lecture qu'on tient pour sûre.
export function lirePaires(lignes) {
  const paires = [];
  let derniere = null;
  for (const l of lignes) {
    let ouverte = null;
    let surCetteLigne = false;
    for (const f of l.fragments) {
      const m = f.str.match(/^(.*?)\s*:\s*(.*)$/);
      const estLibelle = m && LIBELLES.has(plat(m[1]));
      if (estLibelle || (m && m[2] === '' && f.x < X_VALEUR)) {
        ouverte = { libelle: m[1].trim(), cle: LIBELLES.get(plat(m[1])) ?? null, valeurs: [], memeLigne: true, page: l.page };
        paires.push(ouverte);
        surCetteLigne = true;
        if (m[2]) ouverte.valeurs.push(m[2].trim());
      } else if (ouverte) {
        ouverte.valeurs.push(f.str);
      } else if (!surCetteLigne && f.x < X_COLONNE) {
        derniere = null;
        break;
      } else if (!surCetteLigne && derniere) {
        // Continuation de la valeur précédente, sur la ligne d'en dessous.
        if (derniere.valeurs.length === 0) derniere.memeLigne = false;
        derniere.valeurs.push(f.str);
      }
    }
    if (ouverte) derniere = ouverte;
  }
  for (const p of paires) {
    p.valeur = p.valeurs.join(' ').replace(/\s+/g, ' ').trim() || null;
    p.lignes = p.valeurs.slice();
    delete p.valeurs;
  }
  return paires;
}

// Les décisions antérieures : un tableau Date / No résolution / Objet, l'objet pouvant continuer
// sur la ligne suivante (colonne à x ≈ 206). Le « Résumé » de chaque décision, qui suit chaque
// rangée, n'est pas repris ici — il est dans le texte.
export function lireDecisionsAnterieures(lignes) {
  const rangees = [];
  for (const l of lignes) {
    const [a, b, ...reste] = l.fragments;
    if (a && b && a.x < X_MARGE && /^\d{4}-\d{2}-\d{2}$/.test(a.str) && /^C[EM]-\d{8}-\d+$/i.test(b.str)) {
      rangees.push({ date: a.str, numero: b.str.toUpperCase(), objet: reste.map((f) => f.str).join(' ').trim() || null });
    } else if (rangees.length && l.fragments.every((f) => f.x >= 200) && !/^(?:date|no resolution|objet)$/.test(plat(l.texte))) {
      const r = rangees[rangees.length - 1];
      if (r.objet && !/^(?:resume|sur recommandation)/.test(plat(l.texte))) r.objet = recoller(`${r.objet} ${l.texte}`.replace(/\s+/g, ' '));
    }
  }
  return rangees;
}

// « DSM- 004 », « PLACE- DU-SOUVENIR » : le trait d'union coupé en fin de ligne se recolle.
function recoller(s) {
  return s ? s.replace(/([\p{L}\d])-\s+([\p{L}\d])/gu, '$1-$2') : s;
}

function texteDeSection(lignes) {
  const t = lignes.map((l) => l.texte).join('\n').trim();
  return t || null;
}

// Les champs d'un sommaire, depuis les pages rendues par lib/pdf.js. Rend { champs, avertissements }.
export function champsSommaire(pages) {
  const avertissements = [];
  const entete = enTeteSommaire(pages[0]);
  if (!entete.numero) avertissements.push("numéro SD absent de l'en-tête");
  if (!entete.service) avertissements.push('service / division non lu');
  if (entete.service && /\/$/.test(entete.service)) avertissements.push(`service sans division après la barre : « ${entete.service} »`);
  const lignes = lignesUtiles(pages, entete.coupe);

  // 1. L'objet : les lignes en colonne avant le premier libellé de la fiche ou la première section.
  const estLibelleFiche = (l) => l.fragments[0].x < X_MARGE && LIBELLES.has(plat(l.fragments[0].str.replace(/\s*:.*$/, '')));
  let i = 0;
  const objetMorceaux = [];
  while (i < lignes.length && !estLibelleFiche(lignes[i]) && !titreDeSection(lignes[i])) {
    for (const f of lignes[i].fragments) if (f.x >= X_COLONNE) objetMorceaux.push(f.str);
    i++;
  }
  const objet = recoller(objetMorceaux.join(' ').replace(/\s+/g, ' ').trim()) || null;
  if (!objet) avertissements.push('objet non lu');

  // 2. La fiche : jusqu'à la première section.
  const debutFiche = i;
  while (i < lignes.length && !titreDeSection(lignes[i])) i++;
  const finFiche = i;
  const paires = lirePaires(lignes.slice(debutFiche, finFiche));

  // 3. Les sections.
  const sections = {};
  let courante = null;
  for (; i < lignes.length; i++) {
    const titre = titreDeSection(lignes[i]);
    if (titre) {
      courante = titre;
      sections[titre] ??= [];
    } else if (courante) sections[courante].push(lignes[i]);
  }

  // Les champs, à partir des paires.
  const champs = {
    numero: entete.numero,
    service: entete.service,
    division: entete.division,
    objet,
    dossierInterne: null,
    lv: null,
    districts: [],
    districtsTexte: null,
    actions: [],
    demandeAchat: null,
    ctRequis: null,
    dateCE: null,
    dateCM: null,
    requerant: null,
    anneeBudget: null,
    resolutionCCU: null,
    // `contrat` et `reglement` : le bloc, quand il n'y en a qu'un. Un sommaire multi-lots répète
    // le bloc contrat lot par lot (SD-2025-5933 : huit « Montant : » différents) — ils sont tous
    // dans `contrats`, et aucun n'est LE montant du sommaire.
    contrat: null,
    contrats: [],
    reglement: null,
    reglements: [],
    // Le texte brut de la fiche, sous-tableaux compris (mandataires, financement, requérants),
    // pour le résumeur : ce que les champs ne nomment pas n'est pas perdu pour autant.
    fiche: lignes.slice(debutFiche, finFiche).map((l) => l.texte).join('\n') || null,
    unites: sections.unites ? sections.unites.map((l) => l.texte) : [],
    decisionsAnterieures: sections.decisionsAnterieures ? lireDecisionsAnterieures(sections.decisionsAnterieures) : [],
    contexte: texteDeSection([...(sections.contexte ?? []), ...(sections.justifications ?? [])]),
    impacts: texteDeSection(sections.impacts ?? []),
    aspectsFinanciers: texteDeSection(sections.aspectsFinanciers ?? []),
    culture: texteDeSection(sections.culture ?? []),
    calendrier: texteDeSection(sections.calendrier ?? []),
    cadreNormatif: texteDeSection(sections.cadreNormatif ?? []),
    remarques: texteDeSection(sections.remarques ?? []),
    resume: texteDeSection(sections.resume ?? []),
    autres: {},
    incertains: [],
  };
  const BLOCS = {
    contrat: () => ({ numero: null, montant: null, estimation: null, mode: null, type: null, duree: null, recurrence: null, reconduction: null, addendas: null, resultat: null }),
    reglement: () => ({ numero: null, type: null, titre: null, consultationPublique: null, approbationReferendaire: null, lettreInvitation: null, approbationExterne: null }),
  };
  for (const p of paires) {
    if (!p.cle) {
      champs.autres[p.libelle] = p.valeur;
      continue;
    }
    if (!p.memeLigne) {
      champs.incertains.push(p.cle);
      avertissements.push(`« ${p.libelle} » : valeur lue sur la ligne suivante, pas en face du libellé (p. ${p.page})`);
    }
    const [bloc, sous] = p.cle.includes('.') ? p.cle.split('.') : [null, null];
    if (p.cle === 'districts') {
      champs.districts = lireDistrictsSommaire(p.lignes);
      champs.districtsTexte = p.valeur;
    } else if (p.cle === 'actions') {
      champs.actions = (p.valeur ?? '').split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    } else if (bloc) {
      // Un libellé qui revient alors que le bloc courant l'a déjà : un nouveau bloc (un lot de plus).
      const liste = champs[bloc + 's'];
      if (!liste.length || liste[liste.length - 1][sous] != null) liste.push(BLOCS[bloc]());
      const courant = liste[liste.length - 1];
      if (sous === 'montant' && p.valeur && !MONTANT.test(p.valeur)) {
        avertissements.push(`« Montant » ne ressemble pas à une somme : « ${p.valeur} » (p. ${p.page})`);
        champs.autres[p.libelle] = p.valeur;
      } else courant[sous] = p.valeur;
    } else champs[p.cle] = p.valeur;
  }
  champs.contrat = champs.contrats.length === 1 ? champs.contrats[0] : null;
  champs.reglement = champs.reglements.length === 1 ? champs.reglements[0] : null;
  if (!Object.keys(sections).length) avertissements.push('aucune section reconnue — le gabarit a peut-être changé');
  return { champs, avertissements };
}

// ---------- le cache ----------

// Les fragments, compacts, pour réextraire sans retélécharger : par page, [y, texte, [[x, str]…]].
export function lignesCompactes(pages) {
  return pages.map((p) => p.lignes.map((l) => [Math.round(l.y * 10) / 10, l.texte, l.fragments.map((f) => [f.x, f.str])]));
}
export function pagesDepuisCache(lignes) {
  return (lignes ?? []).map((page, i) => ({ numero: i + 1, lignes: page.map(([y, texte, fragments]) => ({ y, texte, fragments: fragments.map(([x, str]) => ({ x, str })) })) }));
}

async function lireSommaire(numero, url) {
  const data = await telechargerPdf(url);
  if (!data) return null;
  const lu = await lirePdf(data);
  const { champs, avertissements } = champsSommaire(lu.pages);
  if (champs.numero && champs.numero !== numero) avertissements.push(`le PDF porte le numéro ${champs.numero}, pas ${numero}`);
  const contenu = {
    numero,
    url,
    fichier: url.split('/').pop(),
    nombrePages: lu.nombrePages,
    texte: lu.texte,
    lignes: lignesCompactes(lu.pages),
    champs,
    avertissements,
    luLe: new Date().toISOString().slice(0, 10),
    versionLecture: VERSION_LECTURE,
  };
  await ecrireCache(`sommaire_${numero}`, contenu);
  return contenu;
}

// Une entrée de l'index publié, depuis le cache. Le montant n'y est que s'il a été lu en face
// de son libellé ET que le sommaire n'a qu'un bloc contrat (un multi-lots en a plusieurs, aucun
// n'est le montant du sommaire) ; les champs incertains restent dans le cache avec leur
// avertissement.
export function entreeIndex(cache, citations) {
  const c = cache.champs ?? {};
  const sur = (cle) => !(c.incertains ?? []).includes(cle);
  const contrats = c.contrats ?? (c.contrat ? [c.contrat] : []);
  const reglements = c.reglements ?? (c.reglement ? [c.reglement] : []);
  return {
    numero: cache.numero,
    url: cache.url,
    pages: cache.nombrePages,
    service: c.service ?? null,
    division: c.division ?? null,
    objet: c.objet ?? null,
    districts: sur('districts') ? c.districts ?? [] : [],
    actions: sur('actions') ? c.actions ?? [] : [],
    montant: contrats.length === 1 && sur('contrat.montant') ? contrats[0].montant ?? null : null,
    contrat: contrats.length === 1 ? { numero: contrats[0].numero, type: contrats[0].type, mode: contrats[0].mode, duree: contrats[0].duree, resultat: contrats[0].resultat } : null,
    contrats: contrats.length,
    reglement: reglements.length === 1 ? { numero: reglements[0].numero, type: reglements[0].type } : null,
    reglements: reglements.length,
    decisionsAnterieures: (c.decisionsAnterieures ?? []).length,
    decisions: citations.decisions,
    derniereDecision: citations.date,
    avertissements: cache.avertissements ?? [],
    luLe: cache.luLe,
  };
}

// ---------- le programme ----------

async function main() {
  const args = parseArgs(process.argv);

  // Mode local : un PDF, pas de réseau.
  if (args.fichier) {
    const nom = String(args.fichier).split(/[\\/]/).pop();
    const lu = await lirePdf(new Uint8Array(await readFile(args.fichier)));
    const { champs, avertissements } = champsSommaire(lu.pages);
    console.log(`${nom} : ${lu.nombrePages} page(s), ${lireNomFichier(nom)?.numero ?? '?'}`);
    console.log(JSON.stringify(champs, null, 1));
    for (const a of avertissements) console.warn(`⚠ ${a}`);
    return;
  }

  const year = String(args.year ?? new Date().getFullYear());
  const max = Number(args.max ?? 120);
  const depuis = args.depuis ?? null;
  const decisions = await lireJson(DECISIONS);
  if (!decisions) throw new Error("data/decisions.json manquant — lancez d'abord scrapers/decisions.js");
  const precedent = await lireJson(OUT);
  const index = new Map((precedent?.sommaires ?? []).map((s) => [s.numero, s]));
  const resumes = new Set(((await lireJson(RESUMES))?.resumes ?? []).map((r) => r.id));

  // Les sommaires cités par les décisions de l'année, un par numéro : publiés (une adresse) ou non.
  const candidats = new Map();
  const nonPublies = new Map();
  for (const d of decisions.decisions ?? []) {
    if (!d.sommaireId || String(d.annee) !== year) continue;
    if (!d.sommairePublie || !d.sommairePdf) {
      const np = nonPublies.get(d.sommaireId) ?? { numero: d.sommaireId, instances: new Set() };
      np.instances.add(d.instance);
      nonPublies.set(d.sommaireId, np);
      continue;
    }
    if (depuis && (d.date ?? '') < depuis) continue;
    const c = candidats.get(d.sommaireId) ?? { numero: d.sommaireId, url: d.sommairePdf, decisions: [], date: '' };
    if (d.numero && !c.decisions.includes(d.numero)) c.decisions.push(d.numero);
    if ((d.date ?? '') > c.date) c.date = d.date;
    // Une nouvelle version du PDF change l'adresse : c'est elle qui fait foi.
    if (lireNomFichier(d.sommairePdf.split('/').pop())?.version > (lireNomFichier(c.url.split('/').pop())?.version ?? -1)) c.url = d.sommairePdf;
    candidats.set(d.sommaireId, c);
  }
  const liste = [...candidats.values()].sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
  console.log(`${liste.length} sommaire(s) publié(s) cité(s) par les décisions de ${year}${depuis ? ` depuis ${depuis}` : ''} ; ${nonPublies.size} cité(s) mais non publié(s).`);

  // Ce qu'il y a à faire pour chacun : rien, réextraire du cache, ou télécharger.
  const aTelecharger = [];
  let enCache = 0;
  let reextraits = 0;
  for (const c of liste) {
    const cache = await lireCache(`sommaire_${c.numero}`);
    if (cache && cache.url === c.url && !args.force) {
      if ((args.reextraire || cache.versionLecture !== VERSION_LECTURE) && cache.lignes) {
        const { champs, avertissements } = champsSommaire(pagesDepuisCache(cache.lignes));
        Object.assign(cache, { champs, avertissements, versionLecture: VERSION_LECTURE });
        await ecrireCache(`sommaire_${c.numero}`, cache);
        reextraits++;
      } else enCache++;
      index.set(c.numero, entreeIndex(cache, c));
      continue;
    }
    // Sans cache mais déjà indexé et résumé : le texte ne manque à personne, on ne redemande rien.
    const deja = index.get(c.numero);
    if (!cache && !args.force && deja && deja.url === c.url && resumes.has(c.numero)) {
      index.set(c.numero, { ...deja, decisions: c.decisions, derniereDecision: c.date });
      enCache++;
      continue;
    }
    aTelecharger.push({ ...c, raison: args.force ? 'demandé' : cache ? 'nouvelle version' : 'jamais lu' });
  }
  console.log(`${enCache} déjà en cache, ${reextraits} réextrait(s) du cache, ${aTelecharger.length} à télécharger${aTelecharger.length > max ? ` (au plus ${max} cette fois)` : ''}.`);

  const introuvables = [];
  const echecs = [];
  let telecharges = 0;
  const debut = Date.now();
  const ecrire = () => ecrireIndex(index, { year, depuis, max, nonPublies, introuvables, echecs, precedent });
  for (const c of aTelecharger.slice(0, max)) {
    try {
      const cache = await lireSommaire(c.numero, c.url);
      if (!cache) {
        // Publié selon l'index, mais le stockage répond 404 : on le dit, on n'invente pas d'adresse.
        introuvables.push({ numero: c.numero, url: c.url });
        console.warn(`⚠ ${c.numero} : le stockage ne rend pas de PDF (${c.url})`);
        // On NE retire PAS une fiche déjà publiée : un 404 passager, ou un cache perdu en
        // intégration continue, effacerait jusqu'à --max sommaires correctement lus, sans échec
        // visible. La fiche reste avec la date de sa dernière lecture ; seul un index qui ne cite
        // plus le sommaire le fait disparaître.
        continue;
      }
      telecharges++;
      index.set(c.numero, entreeIndex(cache, c));
      for (const a of cache.avertissements) console.warn(`⚠ ${c.numero} : ${a}`);
      if (telecharges % 25 === 0) {
        console.log(`  … ${telecharges}/${Math.min(aTelecharger.length, max)} (${Math.round((Date.now() - debut) / 1000)} s)`);
        await ecrire();
      }
    } catch (err) {
      // Un PDF illisible ou une panne réseau n'emporte pas les autres.
      echecs.push({ numero: c.numero, raison: String(err.message ?? err) });
      console.warn(`⚠ ${c.numero} : ${err.message}`);
    }
  }
  const payload = await ecrire();
  console.log(`\n${telecharges} sommaire(s) téléchargé(s) et lu(s) en ${Math.round((Date.now() - debut) / 1000)} s, ${introuvables.length} introuvable(s), ${echecs.length} échec(s) ; ${payload.nombre} sommaires dans data/sommaires.json.`);
  console.log(`Champs lus : ${payload.lus.service} avec un service, ${payload.lus.districts} avec des districts, ${payload.lus.montant} avec un montant sûr, ${payload.lus.contrat} avec un bloc contrat, ${payload.lus.reglement} avec un bloc règlement, ${payload.lus.avertissements} avec au moins un avertissement.`);
  if (aTelecharger.length > max) console.log(`${aTelecharger.length - max} sommaire(s) attendent la prochaine exécution.`);
  const tentes = Math.min(aTelecharger.length, max);
  if (tentes > 0 && telecharges === 0 && echecs.length === tentes) {
    console.error("Aucun sommaire n'a pu être lu : le fichier précédent est conservé tel quel.");
    process.exitCode = 1;
  }
}

async function ecrireIndex(index, { year, depuis, max, nonPublies, introuvables, echecs, precedent }) {
  const sommaires = [...index.values()].sort((a, b) => (b.derniereDecision ?? '').localeCompare(a.derniereDecision ?? '') || b.numero.localeCompare(a.numero));
  const parInstance = {};
  for (const np of nonPublies.values()) for (const inst of np.instances) parInstance[inst] = (parInstance[inst] ?? 0) + 1;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: `Sommaires décisionnels publiés par la Ville de Laval sur son stockage de documents (${STOCKAGE}), un PDF par dossier, à l'adresse que donne l'index des documents décisionnels.`,
    licence: 'Documents publics de la Ville de Laval — reproduits avec mention de la source et lien vers le document officiel (voir README).',
    parametres: { annee: year, depuis, max, versionLecture: VERSION_LECTURE },
    nombre: sommaires.length,
    lus: {
      service: sommaires.filter((s) => s.service).length,
      objet: sommaires.filter((s) => s.objet).length,
      districts: sommaires.filter((s) => s.districts.length).length,
      montant: sommaires.filter((s) => s.montant).length,
      contrat: sommaires.filter((s) => s.contrat).length,
      reglement: sommaires.filter((s) => s.reglement).length,
      avertissements: sommaires.filter((s) => s.avertissements.length).length,
    },
    nonPublies: {
      nombre: nonPublies.size,
      parInstance,
      note: "Sommaires cités par un procès-verbal de l'année mais absents de l'index des documents de la Ville — ceux du comité exécutif, surtout. Le stockage répond 404 ; aucune adresse n'est devinée.",
      numeros: [...nonPublies.keys()].sort(),
    },
    introuvables: introuvables.length ? introuvables : (precedent?.introuvables ?? []).filter((i) => !index.has(i.numero)),
    echecs,
    sommaires,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  return payload;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
