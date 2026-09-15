// Lecture des procès-verbaux de la Ville de Lévis.
//
// Trois gabarits, observés sur les procès-verbaux de 2026 :
//
//   CONSEIL DE LA VILLE (CV) et COMITÉ EXÉCUTIF (CE)          CONSEIL D'ARRONDISSEMENT
//
//   CV3490                                  (gras)            CACCO-2026-0117             (gras)
//   Cadre financier 2026-2030               (gras)            Demande de dérogation mineure – …
//   Document d’aide à la décision FIN-2026-035                ATTENDU que …
//   Il est proposé par le membre du conseil de la Ville …     Il est proposé par la conseillère …
//   Appuyé par …                                              Appuyé par …
//   D’adopter le cadre financier 2026-2030, joint au …        D’ACCORDER la dérogation mineure …
//   Adoptée à l’unanimité                                     Adoptée à l’unanimité
//
// Au comité exécutif, pas de proposeur : « Il est résolu d’attribuer le contrat … ».
//
// Le numéro et l'OBJET sont en gras, le corps ne l'est pas : lib/pdf.js marque les lignes
// grasses, et l'objet est la suite de lignes grasses qui suit le numéro — exact, sans règle
// sur la façon dont la Ville tourne ses titres. La ligne « Document d’aide à la décision
// FIN-2026-035 » donne l'identifiant du SOMMAIRE DÉCISIONNEL, et le PDF de ce sommaire est un
// hyperlien du procès-verbal lui-même (…/pc/SD/2026/FIN-2026-035.pdf) : on le rattache par
// l'identifiant écrit dans le nom du fichier.
//
// Les votes. La plupart des décisions sont « Adoptée à l’unanimité ». Quand un membre le
// demande, le président appelle le vote et le procès-verbal nomme chacun :
//
//   À la demande du membre du conseil de la Ville Éric Nadeau, le président du conseil
//   appelle le vote sur la proposition.
//   Les membres du conseil de la Ville Erik Bilodeau, Olivier Biron, …, le président du
//   conseil Jean Leblond et le maire Steven Blaney votent en faveur de la proposition.
//   Les membres du conseil de la Ville Audrey Bédard, Anthony Dufour, Isabelle Lefebvre et
//   Éric Nadeau votent en défaveur de la proposition.
//   Le président du conseil déclare la proposition adoptée à la majorité.
//
// Une même résolution peut porter deux votes (« la proposition d’amendement », puis « la
// proposition principale »). Lévis n'imprime PAS de décompte : le garde-fou est la liste des
// présences de la séance — tout nom qui n'y figure pas, et tout écart entre le résultat
// déclaré et les listes, va dans `avertissements`. Les conseils d'arrondissement écrivent
// « Adoptée à la majorité » sans nommer personne : on garde le résultat, pas de noms.
//
// RÈGLE DU PROJET : jamais de donnée inventée. Un procès-verbal qui s'écarte de ces gabarits
// donne moins de champs, pas des champs faux ; chaque vote garde son passage brut.

import { texteDegrade } from './pdf.js';

// « CV3490 », « CE3295 » ; « CAD-2026-0218 », « CACCE-2026-0101 », « CACCO-2026-0117 ».
// Le numéro peut porter une annotation de la greffe, en gras sur la même ligne : « CV3384
// modifiée par CV3432 », « CE2709 modifié par CE2803 » (5 cas en 2026 — sans elle, ces
// résolutions disparaissaient sans erreur).
export const NUMERO_RESOLUTION = /^(?:(CV|CE)(\d{3,5})|(CAD|CACCE|CACCO)-(\d{4})-(\d{3,5}))(?:\s+((?:modifi[ée]e?|abrog[ée]e?|remplac[ée]e?|corrig[ée]e?|annul[ée]e?)\s+par\s+.{3,40}))?$/i;

// En-têtes et pieds de page, répétés sur chaque page.
const ENTETE_TOUJOURS = [
  // « Séance du conseil de la Ville de Lévis du 16 juin 2026 », « Séance du conseil de la Ville
  // du 19 mai 2026 », « Séance extraordinaire du comité exécutif du 31 juillet 2026 ».
  /^S[ée]ance (?:ordinaire |extraordinaire |sp[ée]ciale )?du (?:conseil de la Ville|comit[ée] ex[ée]cutif)(?: de (?:la Ville de )?L[ée]vis)? du \d{1,2}(?:er)? [a-zéû]+ \d{4}$/i,
  /^Page \d+(?: (?:de|sur) \d+)?$/i,
  /^(?:er|re|e|es|ers|res)\s*$/, // l'exposant de « 1er », « 64e », sorti sur sa propre ligne
  /^[-_]{8,}$/,
  /^-\s*\d{1,3}\s*-$/, // « - 3 - »
];
const ENTETE_HAUT_DE_PAGE = [
  /^PROC[ÈE]S-?\s?VERBAL(?: DU CONSEIL D[’']ARRONDISSEMENT)?$/i,
  /^Arrondissement (?:de|des|du) [A-ZÉ].{2,60}$/,
  /^S[ée]ance (?:ordinaire|extraordinaire|sp[ée]ciale)? ?du \d{1,2}(?:er)? [a-zéû]+ \d{4}$/i,
  /^\d{3,5}$/, // folio des arrondissements
];

export function normaliserTexte(texte) {
  return String(texte ?? '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n');
}

// Les lignes utiles d'un document, en ordre, sans en-têtes ni pieds de page. Accepte les
// pages de lib/pdf.js ({ numero, lignes: [{ texte, gras }] }) ou, à défaut, un texte brut.
export function lignesUtiles(source) {
  const pages = Array.isArray(source)
    ? source
    : normaliserTexte(source)
        .split(/\n\n(?=\S)/)
        .map((bloc, i) => ({ numero: i + 1, lignes: bloc.split('\n').map((texte) => ({ texte, gras: null })) }));
  const sortie = [];
  for (const page of pages) {
    const lignes = page.lignes.map((l) => ({ texte: normaliserTexte(l.texte).trim(), gras: l.gras ?? null, page: page.numero })).filter((l) => l.texte);
    lignes.forEach((l, i) => {
      if (ENTETE_TOUJOURS.some((re) => re.test(l.texte))) return;
      const pres = i < 4 || i >= lignes.length - 2;
      if (pres && ENTETE_HAUT_DE_PAGE.some((re) => re.test(l.texte))) return;
      sortie.push(l);
    });
  }
  return sortie;
}

// Recolle les coupures de ligne : « Anne-\nMarie » -> « Anne-Marie », le reste en espaces.
export function recoller(lignes) {
  return lignes
    .map((l) => (typeof l === 'string' ? l : l.texte))
    .join('\n')
    .replace(/(\p{L})-\n(\p{Lu})/gu, '$1-$2')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------- résolutions ----------

// Quand le document n'a pas d'information de graisse (vieux cache, PDF sans polices
// nommées), l'objet s'arrête à la première ligne qui ouvre le corps.
const DEBUT_CORPS = /^(?:Documents? d[’']aide|ATTENDU|CONSID[ÉE]RANT|En cons[ée]quence|Il est |Appuy[ée]|Le pr[ée]sident|La pr[ée]sidente|Le vice-pr[ée]sident|Le maire |La mairesse |La greffi[èe]re|Le greffier|Environ |Aucune? |\S+ (?:personnes?|questions?) |Adopt[ée]e|Rejet[ée]e|À la demande|Les? membres?|D[’'][A-ZÀ-Ÿa-zà-ÿ]+er\b|DE |D[’']AUTORISER|[A-ZÀ-Ÿ][\p{L}-]+ [A-ZÀ-Ÿ][\p{L}-]+, conseill)/u;

// Renvoie l'objet et le nombre de lignes qu'il occupe (pour lire ce qui le suit).
function extraireObjet(lignes) {
  const avecGraisse = lignes.some((l) => l.gras !== null);
  const morceaux = [];
  for (const l of lignes) {
    if (avecGraisse) {
      if (!l.gras) break;
    } else if (DEBUT_CORPS.test(l.texte) || morceaux.length >= 3) break;
    morceaux.push(l);
    if (morceaux.length >= 16) break;
  }
  // « Proposition principale » : une étiquette en gras au-dessus du titre quand la résolution
  // a été amendée en séance, pas une partie de l'objet.
  return { objet: recoller(morceaux).replace(/^Proposition (?:principale|amend[ée]e)\s+/i, '') || null, lignes: morceaux.length };
}

// Le « Document d'aide à la décision » d'une résolution est la ligne qui suit immédiatement
// son objet. Plus bas dans le corps, c'est une CITATION : l'adoption de l'ordre du jour cite
// ainsi le point qu'elle retire (« …avec le retrait de l'affaire prévue au point 29 : …
// Document d'aide à la décision DEV-2026-035 »), et ce sommaire n'est pas le sien.
function lignesDuSommaire(lignes, debut) {
  const suite = [];
  for (let i = debut; i < Math.min(lignes.length, debut + 3); i++) {
    const t = lignes[i].texte;
    if (suite.length === 0 ? !/^Documents? d[’']aide à la d[ée]cision/i.test(t) : !/^[A-Z0-9][A-Z0-9\-,\s]*(?:et\s+[A-Z0-9\-]+)?$/.test(t)) break;
    suite.push(lignes[i]);
  }
  return recoller(suite);
}

// « FIN-2026-035 », « APGI-APP-2026-061 », « URBA-CUMB-2026-020 ».
const ID_SOMMAIRE = /\b([A-Z]{2,6}(?:-[A-Z]{2,6})*-\d{4}-\d{2,4})\b/g;

export function extraireSommaires(bloc) {
  const m = bloc.match(/Documents? d[’']aide à la d[ée]cision\s*:?\s*/);
  if (!m) return [];
  // Les identifiants suivent, séparés par des virgules ou « et » ; la phrase suivante commence
  // au premier mot qui contient une minuscule (« Il », « D’adopter », « Les »).
  let apres = bloc.slice(m.index + m[0].length, m.index + m[0].length + 200);
  const finListe = apres.search(/(?:^|\s)(?!et\s)[\p{L}’']*\p{Ll}/u);
  if (finListe >= 0) apres = apres.slice(0, finListe);
  return [...new Set([...apres.matchAll(ID_SOMMAIRE)].map((x) => x[1]))];
}

export function extraireResultat(bloc) {
  if (/Adopt[ée]e?s?\s+à\s+l['’]unanimit[ée]/i.test(bloc)) return "Adoptée à l'unanimité";
  if (/Adopt[ée]e?s?\s+à\s+la\s+majorit[ée]/i.test(bloc)) return 'Adoptée à la majorité';
  if (/\bRejet[ée]e?\b/i.test(bloc)) return 'Rejetée';
  if (/\b(?:Report[ée]e?|Retir[ée]e?)\b/.test(bloc)) return 'Reportée ou retirée';
  if (/\bIl est r[ée]solu\b/i.test(bloc)) return 'Résolue';
  if (/\bAdopt[ée]e?\b/.test(bloc)) return 'Adoptée';
  return null;
}

// Les hyperliens des procès-verbaux vers les sommaires ont trois formes (relevé de 2026) :
//   - https://levis-website-resources.s3.bhs.io.cloud.ovh.net/pc/SD/2026/FIN-2026-035.pdf  (le site actuel)
//   - https://www.ville.levis.qc.ca/fileadmin/documents/fpd/2026/FIN-2026-029.pdf           (l'ancien site, répond encore)
//   - https://www.ville.levis.qc.ca/fileadmin/documents/SD/2026/…                           (l'ancien site, 403 : le
//     même fichier est sur le stockage actuel, sous /pc/SD/)
// Et quelques-uns pointent vers le SharePoint INTERNE de la Ville (villedelevis.sharepoint.com),
// inaccessible au public : on ne les garde pas, la résolution garde l'identifiant sans lien.
export function urlSommaire(url) {
  if (!url) return null;
  if (/sharepoint\.com/i.test(url)) return null;
  return url.replace(/^https?:\/\/www\.ville\.levis\.qc\.ca\/fileadmin\/documents\/SD\//i, 'https://levis-website-resources.s3.bhs.io.cloud.ovh.net/pc/SD/');
}

// La nature du point, d'après les premiers mots de son objet.
export function natureDuPoint(objet) {
  const o = String(objet ?? '');
  if (/^Avis de motion/i.test(o)) return 'Avis de motion';
  if (/^(?:Adoption|Adoption finale) du (?:second |premier )?projet de r[èe]glement/i.test(o)) return 'Projet de règlement';
  if (/^Adoption (?:du|des) R[èe]glements?/i.test(o)) return 'Règlement';
  if (/^D[ée]p[ôo]t/i.test(o)) return 'Dépôt';
  if (/^(?:Ouverture|Lev[ée]e|Cl[ôo]ture) de la s[ée]ance|^P[ée]riode (?:de questions|d[’']intervention)|^Mot de bienvenue|^Adoption de l[’']ordre du jour|^Approbation (?:du|des) proc[èe]s-verbal/i.test(o)) return 'Procédure';
  return 'Résolution';
}

// Découpe un document en résolutions. `liens` : les hyperliens du PDF (pour rattacher les
// sommaires). `presences` : la liste de la séance, pour vérifier les noms des votes.
export function decouperResolutions(source, { liens = [], presences = null } = {}) {
  const lignes = lignesUtiles(source);
  const blocs = [];
  let courant = null;
  for (const l of lignes) {
    const m = l.texte.match(NUMERO_RESOLUTION);
    // Un numéro seul sur sa ligne, en gras quand la graisse est connue : une référence dans le
    // corps (« résolution CV3412 ») n'est jamais seule sur sa ligne.
    if (m && l.gras !== false) {
      if (courant) blocs.push(courant);
      const numero = m[1] ? m[1] + m[2] : `${m[3]}-${m[4]}-${m[5]}`;
      courant = { numero, prefixe: m[1] ?? m[3], annotation: m[6] ?? null, page: l.page, lignes: [] };
      continue;
    }
    if (courant) courant.lignes.push(l);
  }
  if (courant) blocs.push(courant);

  const urlsSommaires = liens
    .map((u) => urlSommaire(typeof u === 'string' ? u : u.url))
    .filter(Boolean)
    .filter((u) => /\.pdf(?:$|[?#])/i.test(u));
  return blocs.map((b) => {
    const texte = recoller(b.lignes);
    const { objet, lignes: lignesObjet } = extraireObjet(b.lignes);
    const sommaires = extraireSommaires(lignesDuSommaire(b.lignes, lignesObjet));
    const sommairePdf =
      sommaires
        .map((id) => urlsSommaires.find((u) => decodeURIComponent(u.split('/').pop()).toUpperCase().startsWith(id.toUpperCase())))
        .find(Boolean) ?? null;
    const votes = parserVotes(texte, { presences });
    return {
      numero: b.numero,
      prefixe: b.prefixe,
      annotation: b.annotation,
      page: b.page,
      objet,
      nature: natureDuPoint(objet),
      sommaires,
      sommaireId: sommaires[0] ?? null,
      sommairePdf,
      // Le résultat d'une résolution votée est celui de son dernier vote (la proposition
      // principale vient après l'amendement).
      resultat: votes.length ? votes[votes.length - 1].resultat : extraireResultat(texte),
      votes,
      texte,
    };
  });
}

// ---------- présences ----------

const ROLES = /(?:\b(?:le|la|les|du|des)|\bde\s+la)\s+(?:(?:vice-)?pr[ée]sidente?s?\s+du\s+(?:pr[ée]sident\s+du\s+)?(?:conseil|comit[ée] ex[ée]cutif)|(?:vice-)?pr[ée]sidente?|maire|mairesse|membres?\s+du\s+(?:conseil\s+de\s+la\s+Ville|comit[ée]\s+ex[ée]cutif|conseil\s+d[’']arrondissement|conseil)|conseill[èe]re?s?)\b,?\s*/giu;

export function nettoyerNoms(segment) {
  const avertissements = [];
  if (!segment) return { noms: [], partiels: [], avertissements, degrade: false };
  if (texteDegrade(segment)) {
    return { noms: [], partiels: [], degrade: true, avertissements: ['Texte source dégradé (PDF aux glyphes espacés) — noms non extraits, voir le champ « brut ».'] };
  }
  const partiels = [];
  const noms = segment
    .replace(/(\p{L})-\s+(\p{Lu})/gu, '$1-$2')
    .replace(ROLES, '')
    .split(/,\s*|\s+et\s+|\s+ainsi que\s+/)
    .map((s) => s.replace(/^\s*(?:et|de|du|des|le|la|les)\s+/i, '').replace(/[.;:]+$/, '').trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*\(partiellement\)$/i);
      if (m) {
        partiels.push(m[1]);
        return m[1];
      }
      return s;
    })
    .filter((nom) => {
      const plausible = /^\p{Lu}/u.test(nom) && nom.length <= 60 && nom.split(' ').length >= 2 && nom.split(' ').length <= 5;
      if (!plausible) avertissements.push('Fragment ignoré : « ' + nom + ' »');
      return plausible;
    });
  return { noms, partiels, avertissements, degrade: false };
}

// Qui était là. CV/CE : « Sont présents : le maire X et les membres du conseil de la Ville A,
// B (partiellement) et C formant quorum sous la présidence du président du conseil D. » puis
// « Est absent : … » / « Sont absents : … ». Arrondissements : « SONT PRÉSENTS / Les membres du
// conseil, A, B et C formant quorum sous la présidence de A » puis « SONT EXCUSÉS / … ».
export function extrairePresences(source) {
  const texte = recoller(lignesUtiles(source).slice(0, 60));
  const mPresents = texte.match(/Sont\s+pr[ée]sents?\s*:?\s*([\s\S]*?)\s*,?\s*formant\s+quorum\s+sous\s+la\s+pr[ée]sidence\s+(?:du|de\s+la|de)\s+([\s\S]*?)(?:\.|\s+(?:Est|Sont|SONT|AUSSI|Assist)\b)/i);
  if (!mPresents) return null;
  const presents = nettoyerNoms(mPresents[1]);
  // « sous la présidence du président du conseil Jean Leblond » : la capture commence après
  // « du », on remet un article pour que le rôle soit reconnu et retiré.
  const president = nettoyerNoms('le ' + mPresents[2]).noms[0] ?? null;
  const mAbsents = texte.match(/(?:Est|Sont)\s+(?:absents?|absentes?|excus[ée]e?s?)\s*:?\s*([\s\S]*?)(?:\.|\s+(?:AUSSI|Assist|Est également)|\s+(?:CV|CE)\d{3,5}\b|\s+CA[A-Z]*-\d{4})/i);
  const absents = mAbsents ? nettoyerNoms(mAbsents[1]).noms : [];
  const noms = [...presents.noms];
  if (president && !noms.includes(president)) noms.push(president);
  const mMaire = mPresents[1].match(/\ble\s+maire\s+([\p{Lu}][\p{L}'’\-]+(?:\s+[\p{Lu}][\p{L}'’\-]+){1,3})/u);
  return {
    presents: noms,
    partiels: presents.partiels,
    absents,
    president,
    maire: mMaire ? mMaire[1] : null,
    brut: mPresents[0].slice(0, 800),
  };
}

// ---------- votes ----------

const APPEL = /appelle\s+le\s+vote\s+sur\s+(la\s+proposition(?:\s+(?:d[’']amendement|principale|accessoire|de\s+[^.]{1,60}))?|l[’']amendement|[^.]{1,80}?)\s*\./gi;
const PHRASE_VOTE = /([^.]*?)\s+vote(?:nt)?\s+(en\s+faveur|en\s+d[ée]faveur|contre)\s+(?:de\s+)?(?:la|l[’']|le)\s*([^.]{0,80})\./gi;

export function parserVotes(texte, { presences = null } = {}) {
  const t = normaliserTexte(texte).replace(/\s+/g, ' ');
  const appels = [...t.matchAll(APPEL)];
  const votes = [];
  appels.forEach((appel, i) => {
    const debut = appel.index + appel[0].length;
    const fin = i + 1 < appels.length ? appels[i + 1].index : t.length;
    // Le passage s'arrête à la déclaration du résultat, ou à la demande de vote suivante.
    let segment = t.slice(debut, fin);
    const coupe = segment.search(/(?:À la demande d|Adopt[ée]e?\s+à\s+la\s+majorit|Adopt[ée]e?\s+à\s+l['’]unanim|Rejet[ée]e?\s*$)/);
    const declaration = segment.match(/d[ée]clare\s+(?:la\s+proposition|l[’']amendement)[^.]*?\b(adopt[ée]e?|rejet[ée]e?)(?:\s+à\s+(la\s+majorit[ée]|l['’]unanimit[ée]))?/i);
    const avantDeclaration = declaration ? segment.slice(0, declaration.index) : coupe > 0 ? segment.slice(0, coupe) : segment;
    const pour = [];
    const contre = [];
    const brut = [];
    const avertissements = [];
    let degrade = false;
    for (const p of avantDeclaration.matchAll(PHRASE_VOTE)) {
      const lu = nettoyerNoms(p[1]);
      degrade ||= lu.degrade;
      avertissements.push(...lu.avertissements);
      (/faveur/i.test(p[2]) && !/d[ée]faveur/i.test(p[2]) ? pour : contre).push(...lu.noms);
      brut.push(p[0].trim());
    }
    const avant = t.slice(Math.max(0, appel.index - 220), appel.index);
    const mDemande = avant.match(/À\s+la\s+demande\s+d(?:u|e\s+la|e)\s+(?:membre\s+du\s+conseil\s+de\s+la\s+Ville\s+|conseill[èe]re?\s+|maire\s+)?([\p{Lu}][^,]{2,60}?),\s+(?:le|la)\s+pr[ée]sidente?/u);

    // Le résultat se lit dans les listes ; la déclaration du président sert de recoupement.
    let resultat = null;
    if (!degrade && (pour.length || contre.length)) {
      if (contre.length === 0) resultat = "Adoptée à l'unanimité";
      else if (pour.length > contre.length) resultat = 'Adoptée à la majorité';
      else if (pour.length < contre.length) resultat = 'Rejetée';
      else resultat = 'Égalité';
    }
    const declare = declaration ? (/rejet/i.test(declaration[1]) ? 'Rejetée' : declaration[2] && /unanim/i.test(declaration[2]) ? "Adoptée à l'unanimité" : 'Adoptée à la majorité') : null;
    if (!resultat) resultat = declare ?? extraireResultat(segment);
    if (declare && resultat && declare !== resultat && !degrade) avertissements.push(`Résultat déclaré « ${declare} », mais les listes nominales donnent « ${resultat} » (${pour.length} pour, ${contre.length} contre).`);
    if (!pour.length && !contre.length && !degrade) avertissements.push('Vote appelé, mais aucune liste nominale reconnue — voir le procès-verbal.');

    const notes = [];
    if (presences?.presents?.length) {
      const connus = new Set(presences.presents.map(cleNom));
      for (const nom of [...pour, ...contre]) if (!connus.has(cleNom(nom))) avertissements.push(`« ${nom} » ne figure pas dans la liste des présences de la séance.`);
      const doublons = pour.filter((n) => contre.some((c) => cleNom(c) === cleNom(n)));
      for (const nom of doublons) avertissements.push(`« ${nom} » est nommé à la fois pour et contre.`);
      const votants = pour.length + contre.length;
      if (votants !== presences.presents.length) notes.push(`${votants} votant(s) nommé(s) pour ${presences.presents.length} membre(s) présent(s) à la séance${presences.partiels?.length ? ' (dont ' + presences.partiels.length + ' partiellement)' : ''}.`);
    }

    votes.push({
      sur: appel[1].replace(/\s+/g, ' ').trim(),
      resultat,
      pour,
      contre,
      decomptePour: pour.length,
      decompteContre: contre.length,
      abstention: null,
      demandeParVote: mDemande ? mDemande[1].trim() : null,
      texteSourceDegrade: degrade,
      avertissements,
      notes,
      brut: brut.join(' | ') || segment.slice(0, 600),
    });
  });
  return votes;
}

// Clé de comparaison des noms : sans accents, sans casse, tirets et espaces unifiés.
export function cleNom(nom) {
  return String(nom ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[\s\-]+/g, ' ')
    .trim();
}
