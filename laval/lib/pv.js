// Lecture des procès-verbaux et des ordres du jour de la Ville de Laval.
//
// Le texte vient de lib/pdf.js (pdf.js, une ligne par hauteur). Chaque résolution ouvre sur une
// ligne où son numéro, écrit dans la marge de gauche, précède la première ligne du titre en
// majuscules — c'est pdf.js qui les réunit ; pdftotext, lui, empilait les numéros en haut de la
// page, et c'est le piège noté au README :
//
//   CM-20260203-64 ADOPTION - RÈGLEMENT L-13132
//   La greffière mentionne les éléments prévus à l'article 356 de la Loi
//   sur les cités et villes;
//   sur recommandation du comité exécutif,
//   IL EST PROPOSÉ PAR : Pierre Brabant
//   APPUYÉ PAR : Yannick Langlois
//   et résolu:
//   d'adopter le Règlement numéro L-13132 …
//   Un débat s'engage.
//   La conseillère Louise Lortie demande le vote sur la proposition,
//   laquelle est adoptée par un compte de 17 en faveur et de 4 contre:
//   M. Stéphane Boyer, maire, et les conseillers Ray Khalil, … et Sylvain Yelle se prononcent en
//   faveur de la proposition;
//   les conseillers Martin Vaillancourt, Louise Lortie, David De Cotis et
//   Isabelle Piché se prononcent contre la proposition.
//   ADOPTÉ
//   (SD-2025-6270)
//
// Au comité exécutif, même gabarit, plus court :
//
//   CE-20260909-2028 RECOMMANDATION AU CONSEIL - ATTRIBUTION -
//   CONTRAT DOS-3623
//   RÉSOLU À L'UNANIMITÉ:
//   de recommander au conseil d'attribuer le contrat DOS-3623, …
//   (CT:1908852)
//   (SD-2026-3971)
//
// Le renvoi « (SD-AAAA-N) » clôt chaque résolution : c'est la clé vers le sommaire décisionnel,
// et vers le point correspondant de l'ordre du jour, qui écrit le même objet en casse normale
// avec les districts touchés et le montant.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote garde le passage brut ; tout écart
// entre les noms extraits et le décompte imprimé va dans `avertissements`, jamais corrigé en
// douce ; un texte aux glyphes espacés donne `texteSourceDegrade: true` et pas de noms.

import { texteDegrade } from './pdf.js';

export function normaliserTexte(texte) {
  return String(texte ?? '')
    .replace(/ /g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n');
}

// « CM-20260203-64 ADOPTION - … » : le numéro de la journée, puis le début du titre.
export function reNumero(prefixe) {
  return new RegExp(`^(${prefixe}-\\d{1,5})\\s+(\\S.*)$`);
}

// En-têtes et pieds de page répétés : « Volume 149 », « Page 31 », « Séance du 3 février 2026 ».
const ENTETE = /^(?:Volume\s+\d+|Page\s+\d+|Séance\s+du\s+\d{1,2}(?:er)?\s+\S+\s+\d{4}(?:\s+Page\s+\d+)?)\s*$/i;
const SD = /\(\s*(SD-\d{4}-\d{1,6})\s*\)/g;
const CT = /\(\s*CT\s*:?\s*(\d+)\s*\)/g;

// Une ligne de titre : des lettres, et presque toutes en majuscules.
export function estMajuscules(l) {
  const lettres = l.replace(/[^\p{L}]/gu, '');
  if (lettres.length < 2) return false;
  const minuscules = lettres.replace(/[^\p{Ll}]/gu, '').length;
  return minuscules / lettres.length < 0.12;
}

// Des lignes en une phrase. Un trait d'union en fin de ligne colle à la suite (« PROCÈS- /
// VERBAL »), sauf quand il sépare deux membres d'un titre (« ATTRIBUTION - / CONTRAT »).
export function recoller(lignes) {
  return lignes
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((acc, l) => (!acc ? l : /\S-$/.test(acc) ? acc + l : acc + ' ' + l), '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extraireResultat(corps) {
  const t = String(corps ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  const vote = t.match(/(adopt|rejet|accept)[ée]e?\s+par\s+un\s+compte\s+de/i);
  if (vote) return /^rejet/i.test(vote[1]) ? 'Rejetée' : 'Adoptée';
  if (/r[ée]solu\s+[àa]\s+l'unanimit[ée]/i.test(t)) return "Adoptée à l'unanimité";
  if (/\bREJET[ÉE]E?\b/.test(t) || /\bproposition\s+rejet[ée]e/i.test(t)) return 'Rejetée';
  if (/\bADOPT[ÉE]E?\b/.test(t) || /(?:demande le vote[^.]*?),\s*laquelle\s+est\s+adopt[ée]e/i.test(t)) return 'Adoptée';
  return null;
}

// Découpe le texte d'un procès-verbal en résolutions. `prefixe` : « CM-20260203 », ce qui ouvre
// chaque numéro de la journée ; un renvoi vers une résolution d'une autre date (« conformément à
// la résolution CE-20190320-759 ») n'ouvre donc jamais de bloc. `pages` (facultatif, textes des
// pages) donne la page de chaque résolution.
export function decouperResolutions(texte, { prefixe, pages = null }) {
  const re = reNumero(prefixe);
  const lignes = normaliserTexte(texte).split('\n');
  const blocs = [];
  let courant = null;
  for (const brut of lignes) {
    const l = brut.trim();
    if (!l || ENTETE.test(l)) continue;
    const m = l.match(re);
    if (m) {
      if (courant) blocs.push(courant);
      courant = { numero: m[1], lignes: [m[2]] };
      continue;
    }
    if (courant) courant.lignes.push(l);
  }
  if (courant) blocs.push(courant);

  const pageDe = (numero) => {
    if (!pages) return null;
    const r = new RegExp('^\\s*' + numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s', 'm');
    const i = pages.findIndex((p) => r.test(normaliserTexte(p)));
    return i >= 0 ? i + 1 : null;
  };

  return blocs.map((b) => {
    // Le titre : la première ligne, puis les suivantes tant qu'elles sont en majuscules et
    // qu'elles ne sont pas déjà le corps (« RÉSOLU À L'UNANIMITÉ: », « ATTENDU QUE… »).
    const titre = [b.lignes[0]];
    let i = 1;
    for (; i < b.lignes.length; i++) {
      const l = b.lignes[i];
      if (!estMajuscules(l) || /^(?:R[ÉE]SOLU|ADOPT|REJET|IL EST PROPOS|APPUY|ATTENDU|CONSID[ÉE]RANT)/.test(l)) break;
      titre.push(l);
    }
    const titreMajuscules = recoller(titre).replace(/[.\s]+$/, '');
    const corps = b.lignes.slice(i).join('\n');
    const sommaires = [...corps.matchAll(SD)].map((x) => x[1]);
    const cts = [...corps.matchAll(CT)].map((x) => x[1]);
    const votes = parserVotes(corps);
    const proposeur = corps.match(/IL EST PROPOS[ÉE] PAR\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    const appuyeur = corps.match(/APPUY[ÉE] PAR\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    return {
      numero: b.numero,
      page: pageDe(b.numero),
      titreMajuscules: titreMajuscules || null,
      // Le dernier renvoi : une résolution qui en cite plusieurs (« conformément au SD… ») se
      // clôt toujours par le sien.
      sommaire: sommaires.length ? sommaires[sommaires.length - 1] : null,
      ct: cts.length ? cts[cts.length - 1] : null,
      proposeur,
      appuyeur,
      resultat: votes.length ? votes[votes.length - 1].resultat : extraireResultat(corps),
      depot: /^D[ÉE]P[ÔO]T\b/.test(titreMajuscules),
      votes,
      texte: corps,
    };
  });
}

// ---------- votes ----------

// « M. Stéphane Boyer, maire, et les conseillers Ray Khalil, Christine Poirier, … et Sylvain
// Yelle » -> noms. Les civilités, la fonction du maire et les mots « les conseillers » /
// « la conseillère » tombent ; ce qui reste se sépare sur les virgules et les « et ».
export function nettoyerNoms(segment) {
  if (!segment) return { noms: [], avertissements: [], degrade: false };
  const avertissements = [];
  let t = segment
    .replace(/(\p{L})-\s+(\p{L})/gu, '$1-$2')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:aucun|aucune|personne)\b/i.test(t) || t === '') return { noms: [], avertissements, degrade: false };
  if (texteDegrade(t)) {
    return { noms: [], degrade: true, avertissements: ['Texte source dégradé (PDF aux glyphes espacés) — noms non extraits, voir le champ « brut ».'] };
  }
  t = t
    .replace(/\b(?:MM?\.|Mmes?|Me)\s+/g, '')
    .replace(/,\s*(?:maire(?:sse)?|mairesse suppléante|maire suppléant)(?:\s+et\s+pr[ée]sident[e]?\s+du\s+comit[ée]\s+ex[ée]cutif)?\s*,?/gi, ',')
    .replace(/\b(?:les|la|le)\s+conseill(?:ers?|[èe]res?)\s+/gi, '')
    .replace(/\bet\s+(?:les|la|le)\s+conseill(?:ers?|[èe]res?)\s+/gi, 'et ');
  const noms = t
    .replace(/[.;:]\s*$/, '')
    .split(/,|\s+et\s+|\s+ainsi que\s+|;/)
    .map((s) => s.replace(/[.;:]+$/, '').trim())
    .filter(Boolean)
    .filter((nom) => {
      const plausible = /^[A-ZÀ-Ÿ]/.test(nom) && nom.length <= 60 && nom.split(' ').length <= 5;
      if (!plausible) avertissements.push('Fragment ignoré : « ' + nom + ' »');
      return plausible;
    });
  return { noms, avertissements, degrade: false };
}

// Tous les votes nominaux d'un bloc. Un vote s'étend de « demande le vote » à la fin du passage
// « se prononcent contre la proposition. » — ou à la ligne de résultat, ou au vote suivant. Un
// vote demandé mais unanime (« laquelle est adoptée à l'unanimité ») n'a pas de noms : il n'entre
// pas au registre, faute de fait nominatif à consigner.
// PIÈGE : quand la même personne demande un deuxième vote dans le même bloc, le greffier écrit
// « La conseillère demande ENSUITE le vote sur la demande de report du point » (CM-20260901-650,
// où trois votes se suivent : l'amendement, le report, puis la proposition). Sans tolérer cet
// adverbe, le vote du milieu disparaissait du registre. Même tolérance dans reFin, pour que la
// borne de fin d'un vote reste le vote suivant.
const DEBUT_VOTE = "demande\\s+(?:ensuite\\s+|alors\\s+|de\\s+nouveau\\s+|à\\s+nouveau\\s+)?le\\s+vote\\s+sur\\s+";
export function parserVotes(corps) {
  const texte = normaliserTexte(corps);
  const votes = [];
  const reDebut = new RegExp(DEBUT_VOTE, 'g');
  const reFin = new RegExp('\\n\\s*(?:ADOPT[ÉE]E?|REJET[ÉE]E?)\\b|\\n\\s*\\(SD-|' + DEBUT_VOTE, 'g');
  let m;
  while ((m = reDebut.exec(texte))) {
    // La fin : le prochain marqueur APRÈS ce début (le vote suivant, la ligne de résultat ou le
    // renvoi au sommaire), sinon la fin du bloc.
    reFin.lastIndex = m.index + m[0].length;
    const f = reFin.exec(texte);
    const bout = f ? f.index : texte.length;
    const passage = texte.slice(m.index, bout);
    const debutLigne = texte.lastIndexOf('\n', m.index) + 1;
    const ligne = texte.slice(debutLigne, m.index);
    const lu = lireVote(passage, ligne);
    if (lu) votes.push(lu);
    reDebut.lastIndex = m.index + m[0].length;
  }
  return votes;
}

function lireVote(passage, avant) {
  const t = passage.replace(/\s+/g, ' ').trim();
  // « adoptée », « rejetée », parfois « acceptée » : le décompte imprimé, notre garde-fou.
  // PIÈGE : on vote aussi sur une décision de la présidence, et le procès-verbal écrit alors
  // « laquelle est MAINTENUE par un compte de 18 en faveur et de 4 contre » (CM-20260414, avis de
  // proposition jugé irrecevable). Ce verbe-là manquait : le vote, pourtant nominal, était perdu.
  // On garde le mot de la Ville comme résultat (« Maintenue ») plutôt que de le traduire en
  // « Adoptée », qui dirait autre chose que le document.
  const mDecompte = t.match(/(adopt|rejet|accept|maintenu)(?:[ée]e?|e)?\s+par\s+un\s+compte\s+de\s+(\d+)\s+en\s+faveur\s+et\s+de\s+(\d+)\s+contre\s*:?/i);
  if (!mDecompte) return null;
  let apres = t.slice(mDecompte.index + mDecompte[0].length);
  // Un membre qui corrige son vote : « Le compte final est de 16 en faveur et de 4 contre: » —
  // c'est ce décompte-là qui vaut, et les listes le suivent.
  const mFinal = apres.match(/compte\s+final\s+est\s+de\s+(\d+)\s+en\s+faveur\s+et\s+de\s+(\d+)\s+contre\s*:?/i);
  const compte = mFinal ? [Number(mFinal[1]), Number(mFinal[2])] : [Number(mDecompte[2]), Number(mDecompte[3])];
  if (mFinal) apres = apres.slice(mFinal.index + mFinal[0].length);
  // Les deux listes sont séparées par un point-virgule ; chacune s'arrête à « se prononce(nt)
  // en faveur / contre » — de la proposition, de l'amendement, de la demande, de celle-ci…
  const segPour = apres.match(/(?:^|;)\s*([^;]+?),?\s+se\s+prononce(?:nt)?\s+en\s+faveur\b/i)?.[1] ?? null;
  const segContre = apres.match(/(?:^|;)\s*([^;]+?),?\s+se\s+prononce(?:nt)?\s+contre\b/i)?.[1] ?? null;
  const pour = nettoyerNoms(segPour);
  const contre = nettoyerNoms(segContre);
  const [decomptePour, decompteContre] = compte;
  const degrade = pour.degrade || contre.degrade;
  const avertissements = [...pour.avertissements, ...contre.avertissements];
  if (!degrade && pour.noms.length !== decomptePour) avertissements.push(`${pour.noms.length} nom(s) extrait(s) en faveur, mais le document en déclare ${decomptePour}`);
  if (!degrade && contre.noms.length !== decompteContre) avertissements.push(`${contre.noms.length} nom(s) extrait(s) contre, mais le document en déclare ${decompteContre}`);
  // Sur quoi porte le vote : la proposition (le cas ordinaire, sans étiquette), un amendement, la
  // demande d'en discuter immédiatement, la proposition amendée…
  const objetVote = t.match(new RegExp(DEBUT_VOTE + '([^,:]{1,80}?)\\s*(?:,|\\s+(?:laquelle|lequel)\\b)', 'i'))?.[1]?.trim() ?? null;
  // « demande le vote sur celui-ci » : le pronom renvoie à ce dont les listes parlent juste après
  // (« se prononcent en faveur de l'amendement »). Sans ça, deux votes de la même résolution
  // s'affichaient tous deux « Rejetée », sans dire que le premier portait sur l'amendement.
  const pronom = /^celui-ci$|^celle-ci$/i.test(objetVote ?? '');
  const vise = pronom ? apres.match(/se\s+prononce(?:nt)?\s+(?:en\s+faveur|contre)\s+(?:de\s+|d')?(l'amendement|la\s+proposition[^,.;]{0,30}|la\s+demande[^,.;]{0,30})/i)?.[1] ?? null : objetVote;
  const etiquette = vise && !/^la\s+proposition$/i.test(vise.trim()) && !/^celui-ci$|^celle-ci$/i.test(vise.trim()) ? vise.trim().charAt(0).toUpperCase() + vise.trim().slice(1) : null;
  const demandeur = avant.replace(/\s+/g, ' ').match(/(?:M\.|Mme|Le\s+maire|La\s+mairesse|Le\s+conseiller|La\s+conseillère)\s+([A-ZÀ-Ö][\p{L}'\-]+(?:\s+[A-ZÀ-Ö][\p{L}'\-]+){1,3})/u)?.[1] ?? null;
  return {
    etiquette,
    resultat: /^rejet/i.test(mDecompte[1]) ? 'Rejetée' : /^maintenu/i.test(mDecompte[1]) ? 'Maintenue' : 'Adoptée',
    pour: pour.noms,
    contre: contre.noms,
    decomptePour,
    decompteContre,
    abstention: null,
    demandeParVote: demandeur,
    texteSourceDegrade: degrade,
    avertissements,
    brut: t,
  };
}

// ---------- ordre du jour ----------

// L'ordre du jour écrit chaque point en casse normale, suivi de ses renvois :
//
//   11. PRÉSENTATION DES RECOMMANDATIONS DU COMITÉ EXÉCUTIF
//   11.12 adjuger le contrat DOS-3236 à Lachapelle Logistique concernant une
//   entente-cadre pour des services de déménagement, pour une période de 3
//   ans
//   SD-2025-6415 - CT : 1876662
//   District(s) : 00 Tous les districts
//   Montants(s) : 689 850,00 $
//
// Les points ne portent pas le numéro de résolution : c'est le numéro de sommaire qui relie le
// point à la résolution du procès-verbal (decisions.js apparie le k-ième point citant un SD au
// k-ième bloc qui le cite, parce qu'un règlement passe deux fois à la même séance — dépôt du
// projet, puis avis de motion — avec le même sommaire).
//
// Le comité exécutif n'a pas le même gabarit. Ses chapitres sont les services, numérotés par
// leur code (11 à 70, dans l'ordre), et ses points portent ce code suivi d'un tiret ; l'objet est
// un infinitif avec sa capitale (« Autoriser », « Recommander au conseil de… »), le renvoi est le
// même, la ligne des districts colle le deux-points au numéro, et il n'y a jamais de Montant(s) :
//
//   43 - Service de l'urbanisme
//   43-1 Approuver la correction des lots 1 068 596, 1 068 662, 1 642 092, 1 642 100, 4 202 501,
//   4 202 502 … du cadastre du Québec et autoriser la greffière ou la greffière adjointe à signer
//   SD-2026-3939
//   District(s) :05 Marigot
//   36-1 Recommander au conseil d'attribuer le contrat DOS-3623 pour des services d'hydro-
//   excavation et de disposition des matières résiduelles
//   SD-2026-3971 - CT: 1908852
//
// Pièges vus sur les 36 ordres du jour du CE de 2026 (1 315 points) :
//  - la numérotation a des trous (« 50-6 » puis « 50-8 » : un point retiré garde son numéro) et
//    commence parfois à zéro (« 36-0 ») — on ne vérifie donc pas la suite, seulement le chapitre ;
//  - une suite d'objet peut ressembler à un point : « … située aux / 317-325 boulevard Goineau »
//    (d'où le chapitre à un ou deux chiffres, et le garde-fou : un point n'ouvre que sous son
//    chapitre) ; l'inverse existe au conseil (« 1-18 modifiant le Règlement CDU-1 »), d'où un
//    gabarit choisi une fois pour tout le document, jamais ligne à ligne ;
//  - un objet commence une fois en minuscule (« 28-1 d'autoriser une affectation… ») : pas de
//    garde-fou sur la casse ;
//  - l'en-tête de page revient à chaque page, au milieu d'un point coupé : « Service du Greffe »,
//    « Ordre du jour », « de la séance publique du Comité exécutif », « du mercredi 9 septembre
//    2026 à 9 h 00 », et le pied « Généré le … » / « Version 1 Page 1 de 4 ». Ce dernier existe
//    aussi au conseil : sans le filtrer, il s'ajoutait au dernier district de la page
//    (« Saint-Bruno Version 1 Page 1 de 8 »).
const GABARITS_ODJ = {
  // « 8. ÉTUDE ET ADOPTION… » puis « 8.1 Règlement… » ; le numéro de point garde son point.
  CM: { chapitre: /^(\d{1,2})\.\s+(\S.*)$/, point: /^(\d{1,2})\.(\d{1,3})\s+(\S.*)$/, separateur: '.', sousChapitre: false },
  // « 43 - Service de l'urbanisme » puis « 43-1 Approuver… » ; un point n'ouvre que sous son chapitre.
  CE: { chapitre: /^(\d{1,2})\s+-\s+(\S.*)$/, point: /^(\d{1,2})-(\d{1,3})\s+(\S.*)$/, separateur: '-', sousChapitre: true },
};
const RENVOI_ODJ = /^(SD-\d{4}-\d{1,6})(?:\s*-\s*CT\s*:?\s*(\d+))?\s*$/i;
const DISTRICTS_ODJ = /^Districts?\(s\)?\s*:\s*(.*)$/i;
const MONTANT_ODJ = /^Montants?\(s\)?\s*:\s*(.*)$/i;
// La suite d'une liste de montants coupée par la mise en page : une ligne qui ne contient que des
// sommes. Voir le piège documenté sous MONTANT_ODJ, dans parserOrdreDuJour.
const MONTANT_SUITE = /^[\d\s  ]+,\d{2}\s*\$(?:\s*;\s*[\d\s  ]+,\d{2}\s*\$)*\s*;?\s*$/;
const HORS_ODJ = /^(?:Service du Greffe|ORDRE DU JOUR|Généré le\b|Page\s+\d+|Version\s+\d+\s+Page\s+\d+)/i;
// Les deux autres lignes de l'en-tête du CE ne sont écartées qu'à leur place, l'une après
// « Ordre du jour », l'autre après la première : seules, « du lundi 27 avril 2026 à 12 h 30 » ou
// « de la séance publique du comité exécutif » pourraient être la fin d'un objet.
const ENTETE_CE_SEANCE = /^de la séance .{0,40}du Comité exécutif$/i;
const ENTETE_CE_DATE = /^du (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2}(?:er)? \S+ \d{4} à \d{1,2} h \d{2}$/i;

// Le gabarit d'un ordre du jour : celui dont la numérotation des points revient le plus souvent
// dans le document. À égalité (aucun point reconnu), celui du conseil, le gabarit d'origine.
export function detecterGabaritOdj(lignes) {
  const n = { CM: 0, CE: 0 };
  for (const l of lignes) for (const g of Object.keys(GABARITS_ODJ)) if (GABARITS_ODJ[g].point.test(l)) n[g]++;
  return n.CE > n.CM ? 'CE' : 'CM';
}

// « 07 Renaud-Coursol, 15 Saint-Martin » / « 00 Tous les districts » -> [{numero, nom}].
export function lireDistricts(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  for (const m of t.matchAll(/(\d{2})\s*[-–]?\s*([^,;]+?)(?=\s*(?:[,;]|\s-\s)?\s*\d{2}\s*[-–]?\s*\p{Lu}|$)/gu)) {
    out.push({ numero: Number(m[1]), nom: m[2].trim().replace(/[,;\s-]+$/, '') });
  }
  return out.length ? out : [{ numero: null, nom: t }];
}

// Les points d'un ordre du jour, quelle que soit l'instance : `instance` (« CM » ou « CE ») impose
// le gabarit ; sans elle, on le détecte sur le document entier. Chaque point : {numero '8.1' ou
// '43-1', chapitre, chapitreNumero, objet, sommaire, ct, districts, districtsTexte, montant} — au
// CE, le chapitre est le service qui porte le dossier, et le montant reste null (jamais imprimé).
export function parserOrdreDuJour(texte, { instance = null } = {}) {
  const lignes = normaliserTexte(texte).split('\n').map((l) => l.trim());
  const gabarit = GABARITS_ODJ[instance] ?? GABARITS_ODJ[detecterGabaritOdj(lignes)];
  const points = [];
  let chapitre = null;
  let chapitreOuvert = false;
  let courant = null;
  const fermer = () => {
    if (!courant) return;
    courant.objet = recoller(courant.morceaux) || null;
    delete courant.morceaux;
    points.push(courant);
    courant = null;
  };
  let precedente = null; // la ligne lue juste avant, en-têtes compris
  for (const l of lignes) {
    if (!l) continue;
    const avant = precedente;
    precedente = l;
    if (HORS_ODJ.test(l)) continue;
    if (ENTETE_CE_SEANCE.test(l) && /^ORDRE DU JOUR$/i.test(avant ?? '')) continue;
    if (ENTETE_CE_DATE.test(l) && ENTETE_CE_SEANCE.test(avant ?? '')) continue;
    const mp = l.match(gabarit.point);
    // Le garde-fou du CE : « 43-17 … située aux / 14-16 rue X » n'ouvre pas un point sous le
    // chapitre 43. Sans chapitre ouvert (document tronqué), on accepte quand même.
    if (mp && (!gabarit.sousChapitre || !chapitre || Number(mp[1]) === chapitre.numero)) {
      fermer();
      chapitreOuvert = false;
      courant = { numero: mp[1] + gabarit.separateur + mp[2], chapitre: chapitre?.libelle ?? null, chapitreNumero: chapitre?.numero ?? null, morceaux: [mp[3]], sommaire: null, ct: null, districts: [], montant: null };
      continue;
    }
    const mc = l.match(gabarit.chapitre);
    if (mc && /^\p{Lu}/u.test(mc[2])) {
      fermer();
      chapitre = { numero: Number(mc[1]), libelle: mc[2].trim() };
      chapitreOuvert = true;
      continue;
    }
    if (!courant) {
      // Un libellé de chapitre qui continue sur la ligne suivante (« … DE ZONAGE / SUIVANTS et
      // fixation de la date… »).
      if (chapitreOuvert && chapitre) chapitre.libelle = (chapitre.libelle + ' ' + l).replace(/\s+/g, ' ');
      continue;
    }
    const mr = l.match(RENVOI_ODJ);
    if (mr) {
      courant.sommaire = mr[1].toUpperCase();
      if (mr[2]) courant.ct = mr[2];
      continue;
    }
    const md = l.match(DISTRICTS_ODJ);
    if (md) {
      courant.districtsTexte = md[1].trim();
      courant.districts = lireDistricts(courant.districtsTexte);
      courant.enDistricts = true;
      courant.enMontant = false;
      continue;
    }
    const mm = l.match(MONTANT_ODJ);
    if (mm) {
      courant.montant = mm[1].trim();
      courant.enDistricts = false;
      courant.enMontant = true;
      continue;
    }
    // Une ligne après les renvois n'est plus le titre. Si la liste des districts est ouverte,
    // elle continue (la mise en page coupe « 03 Val-des- / Brises, 04 Pont-Viau ») ; sinon c'est
    // du bruit de mise en page.
    if (courant.sommaire || courant.districts.length) {
      if (courant.enDistricts) {
        courant.districtsTexte = recoller([courant.districtsTexte, l]);
        courant.districts = lireDistricts(courant.districtsTexte);
      } else if (courant.enMontant && /;\s*$/.test(courant.montant ?? '') && MONTANT_SUITE.test(l)) {
        // PIÈGE : un contrat à plusieurs lots aligne jusqu'à huit sommes, et la mise en page les
        // coupe (SD-2025-5933, au conseil du 10 mars 2026 : trois lignes, huit montants). Seule la
        // première ligne était gardée — la fiche affichait trois sommes sur huit, avec le
        // point-virgule en trop qui trahissait la coupure. Ce point-virgule final est justement la
        // marque de la coupure : sans lui, la ligne suivante n'appartient pas à la liste.
        courant.montant = recoller([courant.montant, l]);
      }
      continue;
    }
    courant.morceaux.push(l);
    if (courant.morceaux.join(' ').length > 1200) fermer();
  }
  fermer();
  for (const p of points) {
    delete p.enDistricts;
    // Le libellé de chapitre est en majuscules : on le remet en casse de phrase pour les pastilles.
    if (p.chapitre) p.chapitre = libelleChapitre(p.chapitre);
  }
  return points;
}

// « PRÉSENTATION DES RECOMMANDATIONS DU COMITÉ EXÉCUTIF » -> « Présentation des recommandations
// du comité exécutif ». Seul le premier mot garde sa capitale ; ces libellés n'ont pas de nom propre.
export function libelleChapitre(l) {
  const t = String(l ?? '').replace(/\s+/g, ' ').trim();
  if (!estMajuscules(t.split(/\s+(?:et|de|des|du|la|le|les)\s+/)[0] ?? t)) return t;
  const bas = t.toLocaleLowerCase('fr-CA');
  return bas.charAt(0).toLocaleUpperCase('fr-CA') + bas.slice(1);
}

// Apparie les résolutions d'un procès-verbal aux points de l'ordre du jour, par numéro de
// sommaire et dans l'ordre : le k-ième bloc citant SD-X reçoit le k-ième point citant SD-X.
//
// Quand les points d'un sommaire sont épuisés, les résolutions suivantes qui le citent reçoivent
// une copie du dernier point servi, marquée `partage: true` et SANS objet (l'objet du point reste
// dans `objetDuPoint`). C'est le cas ordinaire au comité exécutif : l'ordre du jour écrit un point
// par dossier (« Recommander au conseil d'adjuger le contrat DOS-3279… »), et le procès-verbal le
// décline en deux, trois ou quatre résolutions (adjudication, début des travaux, paiement,
// dépenses) — 35 des 70 résolutions du 7 janvier 2026, 65 des 114 du 4 mars. Le chapitre, les
// districts et le CT sont ceux du dossier, donc de chacune ; l'objet du point, lui, ne décrit que
// le dossier, pas la résolution « DÉPENSES - RÈGLEMENT L-13083-F » : la fiche garde alors son titre
// du procès-verbal, plutôt que trois fiches consécutives au même objet.
export function apparierOrdreDuJour(resolutions, points) {
  const parSommaire = new Map();
  for (const p of points) {
    if (!p.sommaire) continue;
    const file = parSommaire.get(p.sommaire) ?? [];
    file.push(p);
    parSommaire.set(p.sommaire, file);
  }
  const resultat = new Map();
  const dernier = new Map();
  for (const r of resolutions) {
    if (!r.sommaire) continue;
    const file = parSommaire.get(r.sommaire);
    if (file?.length) {
      const p = file.shift();
      dernier.set(r.sommaire, p);
      resultat.set(r.numero, p);
    } else if (dernier.has(r.sommaire)) {
      const p = dernier.get(r.sommaire);
      resultat.set(r.numero, { ...p, objet: null, objetDuPoint: p.objet, partage: true });
    }
  }
  return resultat;
}
