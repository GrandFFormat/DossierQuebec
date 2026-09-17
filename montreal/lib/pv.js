// Lecture des procès-verbaux et des ordres du jour de la Ville de Montréal.
//
// Un procès-verbal du conseil municipal (CM), du conseil d'agglomération (CG) ou du
// comité exécutif (CE) est une suite de résolutions, chacune ouverte par son numéro
// sur une ligne à part — « CM26 0355 » — et close par la ligne « article  dossier » :
//
//   CM26 0355
//   Approuver un projet de convention entre la Ville de Montréal et …
//   Vu la recommandation du comité exécutif en date du 11 mars 2026 par sa résolution CE26 0412 ;
//   Il est proposé par    Mme Julie Tremblay
//   appuyé par            M. Pierre Lafond
//   Et résolu :
//   d'approuver …
//   Adopté à l'unanimité.
//   20.03   1266245003
//
// Quand un vote enregistré est demandé, le procès-verbal nomme les votants :
//
//   Votent en faveur : Mmes et MM. Martinez Ferrada, Bourque, Côté-Tremblay, Tremblay (4)
//   Votent contre :    Mmes et MM. Alneus, Lafond (2)
//   Résultat : En faveur : 4
//              Contre : 2
//
// Et quand seule une opposition est consignée sans appel nominal complet :
//
//   Adopté à la majorité des voix.
//   Dissidences : Mme Alneus
//                 M. Lafond
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote garde le passage brut d'où
// les noms ont été tirés ; tout écart entre les noms extraits et le décompte imprimé
// est écrit dans `avertissements`, jamais corrigé en douce ; un PDF aux glyphes
// espacés donne `texteSourceDegrade: true` et pas de noms.
//
// ⚠ Ces formulations sont celles observées dans les procès-verbaux publiés ; un
// procès-verbal qui s'en écarte donne moins de champs, pas des champs faux. Le README
// tient le compte des recoupements exacts et des cas dégradés.

import { texteDegrade } from './pdf.js';

// « CM26 0355 », « CG26 0123 », « CE26 0412 » en début de ligne, à la ville centrale.
//
// Les dix-neuf conseils d'arrondissement y intercalent leur propre numéro, et chacun
// l'écrit à sa façon. Huit graphies relevées dans les procès-verbaux de 2026 :
//
//   CA26 20 0234     LaSalle, Saint-Laurent, Lachine, Rosemont…  (la plus répandue)
//   CA26 12158       Anjou                     — numéro d'arrondissement et séquence collés
//   CA26 170145      Côte-des-Neiges–NDG       — collés, et la ligne dit « RÉSOLUTION » devant
//   CA26 210108      Verdun
//   CA26 240290      Ville-Marie
//   CA26 10 163      Montréal-Nord             — séquence sur trois chiffres
//   CA26 28 109      L'Île-Bizard–Sainte-Geneviève
//   CA26 30 07 0169  Rivière-des-Prairies–PAT  — deux groupes avant la séquence
//   RÉSOLUTION NUMÉRO CA26 29 0132 RESOLUTION NUMBER CA26 29 0132
//                    Pierrefonds-Roxboro       — étiquetée, et doublée en anglais
//
// N'accepter que la première forme, c'était perdre sept conseils sur dix-neuf : leurs
// procès-verbaux de vingt pages ne rendaient aucune décision. On accepte donc tout ce
// qui suit le préfixe et l'année en chiffres et en espaces — à la condition stricte que
// la LIGNE ENTIÈRE ne soit que cela. C'est cette condition qui distingue le numéro qui
// ouvre une résolution du même numéro cité au fil d'une phrase (« d'amender la
// résolution CA25 20 0505 »), qui, lui, ne doit rien déclencher.
const NUMERO_RESOLUTION = /^(C[MGEA])\s?(\d{2})(?:((?:\s+\d{1,4}){1,3})|\s*(\d{5,6}))\s*$/;

// Deux conseils écrivent le mot devant le numéro, et Pierrefonds-Roxboro répète toute la
// ligne en anglais — ses procès-verbaux sont sur deux colonnes, que la lecture du PDF
// remet bout à bout. On enlève l'étiquette, puis tout ce qui suit un second « RÉSOLUTION ».
const ETIQUETTE_NUMERO = /^(?:R[ÉE]SOLUTION|RESOLUTION)(?:\s+(?:NUM[ÉE]ROS?|NUMBER|N[°ºo]s?\.?))?\s*:?\s*/i;
const DOUBLON_ANGLAIS = /\s*(?:R[ÉE]SOLUTION|RESOLUTION)\b.*$/i;

// Le numéro tel que la Ville l'écrit, et, à part, le numéro d'arrondissement qu'il porte.
// Jamais de réécriture : « CA26 12158 » reste « CA26 12158 », c'est ce qui est imprimé
// dans le procès-verbal et c'est ce qu'un lecteur cherchera.
function lireNumero(ligne) {
  const nu = ligne.replace(ETIQUETTE_NUMERO, '').replace(DOUBLON_ANGLAIS, '').trim();
  const m = nu.match(NUMERO_RESOLUTION);
  if (!m) return null;
  const [, prefixe, an, espaces, colles] = m;
  const reste = (espaces ?? colles).trim().replace(/\s+/g, ' ');
  // Deux groupes ou plus : le premier est le numéro d'arrondissement. Un seul groupe de
  // cinq ou six chiffres : les deux premiers le sont. Un seul groupe de quatre : la ville
  // centrale, qui n'en a pas.
  const groupes = reste.split(' ');
  const numeroArrondissement =
    groupes.length > 1 ? groupes[0] : reste.length >= 5 ? reste.slice(0, 2) : null;
  return { numero: `${prefixe}${an} ${reste}`, prefixe, numeroArrondissement };
}
// « 20.03   1266245003 » (article + dossier) ; « 03.01 » seul pour les points sans dossier.
const LIGNE_ARTICLE = /^(\d{2}\.\d{2,3})(?:\s+(\d{10}))?\s*$/;

export function normaliserTexte(texte) {
  return String(texte ?? '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n');
}

// ---------- résolutions ----------

// L'objet : les premières lignes après le numéro, jusqu'au premier « Vu », « Attendu »,
// « Il est proposé », « Et résolu », etc. La Ville écrit l'objet d'une traite, parfois sur
// deux ou trois lignes de PDF.
// « Adopté à l'unanimité » ferme l'objet ; « Adopter le règlement… » EST l'objet — d'où le
// participe passé suivi de « à / sur / par », jamais l'infinitif.
// Au comité exécutif, la résolution n'a pas de ligne d'objet : elle commence par « Il est »
// puis « RÉSOLU : » — l'objet vient alors de l'ordre du jour (voir parserOrdreDuJour).
// « Levée de la séance » et « Nombre d'articles de niveau décisionnel » ouvrent l'annexe que
// le comité exécutif attache à ses procès-verbaux — l'ordre du jour complet des trois
// instances, des dizaines de milliers de caractères. La dernière résolution de la séance
// l'avalait tout entière : onze objets allaient jusqu'à 155 769 caractères, et c'est ce que
// la fiche affichait. « /mt Caroline BOURGEOIS Domenico ZAMBITO ____ » est le bloc de
// signature qui ferme le procès-verbal, et qui avalait la même chose.
const FIN_OBJET = /^(?:Vu\b|Attendu\b|Consid[ée]rant\b|Il est\s*$|Il est propos[ée]|Il est r[ée]solu|Et r[ée]solu|R[ÉE]SOLU\s*:|L['’][ée]tude de ce dossier|Après avoir|Le conseil\b|Le comité\b|Un débat|Le président|La présidente|Adopt[ée]e?\s+(?:à|sur|par)\b|Rejet[ée]e?\s*\.?\s*$|_{3,}|Lev[ée]e de la s[ée]ance\b|Nombre d['’]articles de niveau d[ée]cisionnel|\/\p{L}{2,3}\s+\p{Lu})/iu;

// Un objet tient en quelques lignes. Au-delà, ce n'est plus un objet : c'est une lecture
// qui a débordé. On coupe au dernier mot entier — le PDF reste là pour le texte complet.
const OBJET_MAX = 700;

// Un objet démesuré n'est jamais un objet : c'est une lecture qui a débordé. La coupe tombe
// au dernier mot entier, et le PDF reste là pour le texte complet. Le procès-verbal et
// l'ordre du jour passent tous les deux par ici : le défaut s'était d'abord montré du côté
// du procès-verbal, la borne n'y avait été posée que là, et les objets de 300 000 caractères
// ont continué d'arriver par l'autre porte.
export function bornerObjet(texte) {
  const objet = String(texte ?? '').replace(/\s+/g, ' ').trim();
  if (!objet) return null;
  if (objet.length <= OBJET_MAX) return objet;
  const coupe = objet.lastIndexOf(' ', OBJET_MAX);
  return objet.slice(0, coupe > OBJET_MAX * 0.6 ? coupe : OBJET_MAX).trim();
}

function extraireObjet(lignes) {
  const morceaux = [];
  for (const l of lignes) {
    const t = l.trim();
    if (!t) {
      if (morceaux.length) break;
      continue;
    }
    if (FIN_OBJET.test(t) || LIGNE_ARTICLE.test(t)) break;
    morceaux.push(t);
    // La borne se vérifie APRÈS l'ajout, donc une seule ligne démesurée passait entière :
    // d'où la coupe ci-dessous, qui ne se fie pas au nombre de lignes.
    if (morceaux.join(' ').length > OBJET_MAX) break;
  }
  return bornerObjet(morceaux.join(' '));
}

// ---------- ce que la décision dit vraiment ----------
//
// Faute des sommaires décisionnels, dont la Ville ne publie pas l'index, il reste ceci :
// une résolution N'EST PAS seulement son titre. Le procès-verbal en donne deux morceaux
// qu'on écartait, et ce sont précisément les deux qu'on allait chercher dans le sommaire.
//
//   Le DISPOSITIF — ce qui suit « Et résolu : » — est le texte qui fait foi. C'est lui qui
//   porte les montants, les parties, les durées, les conditions, les imputations
//   budgétaires. Le titre dit « Approuver un projet de convention » ; le dispositif dit
//   avec qui, pour combien et jusqu'à quand.
//
//   Les MOTIFS — les « Vu », « Attendu que », « Considérant que » qui précèdent — disent
//   sur quoi le conseil s'appuie : la recommandation du comité exécutif, un règlement, un
//   avis, une résolution antérieure. C'est le « pourquoi » le plus proche que le
//   procès-verbal contienne.
//
// Ni l'un ni l'autre ne remplace le sommaire : il y manquera toujours les options
// écartées et le contexte que l'administration écrit pour elle-même. Mais les deux
// arrivent chaque matin dans des PDF qu'on lit déjà, et les jeter était du gaspillage.

// Le dispositif s'ouvre à « Et résolu : » (ou « Il est résolu », « RÉSOLU : ») et se ferme
// au résultat du vote, à la ligne d'article, ou au trait de séparation.
const DEBUT_DISPOSITIF = /(?:^|\n)\s*(?:Et\s+r[ée]solu|Il\s+est\s+r[ée]solu|(?:et\s+)?unanimement\s+r[ée]solu|R[ÉE]SOLU)\s*:?\s*\n?/i;
//
// ⚠ Pas de `\b` après un mot accentué. En JavaScript, « é » n'est pas un caractère de mot :
// après « Adopté », il n'y a donc PAS de frontière de mot, et « Adopt[ée]e?\b » ne
// reconnaît jamais « Adopté à l'unanimité ». C'est le même piège que « \bREV\b », qui
// attrapait « REVÊTEMENT ». On regarde donc ce qui suit, pas une frontière.
const FIN_DISPOSITIF = /\n\s*(?:Adopt[ée]e?(?!\p{L})|Rejet[ée]e?(?!\p{L})|Vot(?:ent|e)\s|Ont\s+vot[ée]|R[ée]sultat\s*:|Dissidences?\s*:|_{3,}|\d{2}\.\d{2,3}(?:\s+\d{10})?\s*$)/iu;

// Un dispositif tient en quelques paragraphes ; au-delà, c'est une lecture qui a débordé.
const DISPOSITIF_MAX = 2000;
const MOTIFS_MAX = 1200;

// Trois conseils — Côte-des-Neiges–Notre-Dame-de-Grâce, Outremont, Ville-Marie — n'écrivent
// jamais « Et résolu : ». Chez eux, le dispositif suit directement le second nom :
//
//   Il est proposé par Sonny Moroz
//   appuyé par Milany Thiagarajah
//   D'adopter l'ordre du jour de la séance ordinaire du 6 juillet 2026…
//   ADOPTÉE À L'UNANIMITÉ
//
// Sans cette forme, ils rendaient 1 % de dispositifs contre 93 % ailleurs. On part donc
// après la PREMIÈRE ligne « appuyé par » : Côte-des-Neiges ajoute parfois un bloc
// « EN AMENDEMENT » avec un second proposeur, et c'est bien tout ce qui suit le premier
// qui a été décidé.
const LIGNE_APPUYE = /(?:^|\n)\s*appuy[ée]e?\s+par\b[^\n]*\n?/i;

export function extraireDispositif(bloc) {
  const m = DEBUT_DISPOSITIF.exec(bloc ?? '') ?? LIGNE_APPUYE.exec(bloc ?? '');
  if (!m) return null;
  let reste = bloc.slice(m.index + m[0].length);
  const fin = FIN_DISPOSITIF.exec(reste);
  if (fin) reste = reste.slice(0, fin.index);
  const texte = reste.replace(/\s+/g, ' ').trim();
  if (texte.length < 12) return null; // « de le faire » n'apprend rien
  return texte.length <= DISPOSITIF_MAX ? texte : texte.slice(0, texte.lastIndexOf(' ', DISPOSITIF_MAX)).trim();
}

// Les motifs : les lignes « Vu / Attendu / Considérant » jusqu'à la proposition.
const LIGNE_MOTIF = /^(?:Vu\b|Attendu\b|Consid[ée]rant\b)/i;
const FIN_MOTIFS = /^(?:Il\s+est\s+propos[ée]|Il\s+est\s+r[ée]solu|Et\s+r[ée]solu|R[ÉE]SOLU\s*:|appuy[ée]\s+par)/i;

export function extraireMotifs(bloc) {
  const morceaux = [];
  let dedans = false;
  for (const brut of String(bloc ?? '').split('\n')) {
    const t = brut.trim();
    if (!t) continue;
    if (LIGNE_MOTIF.test(t)) dedans = true;
    else if (dedans && FIN_MOTIFS.test(t)) break;
    if (dedans) morceaux.push(t);
    if (morceaux.join(' ').length > MOTIFS_MAX) break;
  }
  const texte = morceaux.join(' ').replace(/\s+/g, ' ').trim();
  if (!texte) return null;
  return texte.length <= MOTIFS_MAX ? texte : texte.slice(0, texte.lastIndexOf(' ', MOTIFS_MAX)).trim();
}

export function extraireResultat(bloc) {
  // « et unanimement résolu : » est la formule de plusieurs arrondissements ; elle dit
  // exactement ce que « Adopté à l'unanimité » dit ailleurs.
  if (/Adopt[ée]e?\s+à\s+l['’]unanimit[ée]|unanimement\s+r[ée]solu/i.test(bloc)) return "Adoptée à l'unanimité";
  if (/Adopt[ée]e?\s+à\s+la\s+majorit[ée]/i.test(bloc)) return 'Adoptée à la majorité';
  if (/Adopt[ée]e?\s+sur\s+division/i.test(bloc)) return 'Adoptée sur division';
  if (/\bRejet[ée]e?\b/i.test(bloc)) return 'Rejetée';
  if (/\bReport[ée]e?\b|\bRetir[ée]e?\b/i.test(bloc)) return 'Reportée ou retirée';
  if (/\bAdopt[ée]e?\b/i.test(bloc)) return 'Adoptée';
  return null;
}

// « Dissidences : Mme Alneus, M. Lafond » ou une personne par ligne.
export function extraireDissidences(bloc) {
  const m = bloc.match(/Dissidences?\s*:\s*([\s\S]{0,600}?)(?=\n\s*\n|\n\d{2}\.\d{2}|Adopt|_{3,}|$)/i);
  if (!m) return [];
  // Une personne par ligne ou toutes sur une ligne : la fin de ligne vaut une virgule.
  return nettoyerNoms(m[1].split('\n').map((l) => l.trim()).filter(Boolean).join(', ')).noms;
}

// Découpe un procès-verbal en résolutions. `instance` sert à ne garder que les numéros de
// l'instance lue : un procès-verbal du conseil municipal cite les résolutions du comité
// exécutif (« par sa résolution CE26 0412 »), mais celles-là ne sont pas sur une ligne à
// part, donc ne déclenchent pas de bloc.
export function decouperResolutions(texte, { instance } = {}) {
  const prefixeAttendu = instance?.startsWith('CA_') ? 'CA' : instance;
  const lignes = normaliserTexte(texte).split('\n');
  const blocs = [];
  let courant = null;
  for (const brut of lignes) {
    const l = brut.trim();
    const lu = lireNumero(l);
    // Une séance d'arrondissement s'appelle « CA_Mhm » mais ses résolutions sont
    // préfixées « CA » tout court : on compare sur le préfixe.
    if (lu && (!instance || lu.prefixe === prefixeAttendu)) {
      if (courant) blocs.push(courant);
      courant = { numero: lu.numero, numeroArrondissement: lu.numeroArrondissement, lignes: [] };
      continue;
    }
    if (courant) courant.lignes.push(l);
  }
  if (courant) blocs.push(courant);

  return blocs.map((b) => {
    const bloc = b.lignes.join('\n');
    let article = null;
    let dossier = null;
    for (const l of b.lignes) {
      const ma = l.match(LIGNE_ARTICLE);
      if (ma) {
        article = ma[1];
        dossier = ma[2] ?? dossier;
      }
    }
    const vote = parserVote(bloc);
    return {
      numero: b.numero,
      numeroArrondissement: b.numeroArrondissement ?? null,
      objet: extraireObjet(b.lignes),
      article,
      dossier,
      // Une résolution votée nommément porte le résultat de son vote.
      resultat: vote?.resultat ?? extraireResultat(bloc),
      dissidences: vote ? [] : extraireDissidences(bloc),
      vote,
      // Le texte qui fait foi, et ce sur quoi le conseil s'appuie.
      dispositif: extraireDispositif(bloc),
      motifs: extraireMotifs(bloc),
      texte: bloc,
    };
  });
}

// ---------- votes ----------

// Fin d'un segment de noms : le marqueur suivant, jamais une simple ligne vide.
const FIN_SEGMENT = "(?=Vot(?:ent|e)\\s+(?:en\\s+faveur|contre|pour)|Ont\\s+vot[ée]|A\\s+vot[ée]|R[ée]sultat\\s*:|En\\s+faveur\\s*:|Contre\\s*:\\s*\\d|Abstention|Adopt[ée]|Rejet[ée]|Le pr[ée]sident|La pr[ée]sidente|_{3,}|$)";

function extraireSegment(texte, etiquette) {
  const re = new RegExp(
    '(?:Vot(?:ent|e)|Ont\\s+vot[ée]s?|A\\s+vot[ée])\\s+' + etiquette + '\\s*:?\\s*([\\s\\S]{0,2500}?)' + FIN_SEGMENT,
    'i'
  );
  const m = texte.match(re);
  return m ? m[1].trim() : null;
}

// « Mmes et MM. Martinez Ferrada, Bourque, Côté-Tremblay et Tremblay (4) » -> 4 noms
export function nettoyerNoms(segment) {
  if (!segment) return { noms: [], avertissements: [], degrade: false, declare: null };
  const avertissements = [];
  // Un nom coupé par la mise en page (« Hénault- Ratelle ») est recollé avant tout.
  let t = segment.replace(/(\p{L})-\s+(\p{L})/gu, '$1-$2').replace(/\s+/g, ' ').trim();

  // « Votent contre : aucun » — liste vide légitime.
  if (/^(?:aucun|aucune|personne|—|-)\b/i.test(t) || t === '') return { noms: [], avertissements, degrade: false, declare: 0 };

  if (texteDegrade(t)) {
    return {
      noms: [],
      degrade: true,
      declare: null,
      avertissements: ['Texte source dégradé (PDF aux glyphes espacés) — noms non extraits, voir le champ « brut ».'],
    };
  }

  // Le décompte que la Ville imprime entre parenthèses à la fin de la liste. Tout ce
  // qui suit n'est plus la liste : un en-tête de page ou une remarque (« Ouverture des
  // portes : … ») collés au dernier nom par la mise en page.
  let declare = null;
  const mDeclare = t.match(/\((\d+)\)/);
  if (mDeclare) {
    declare = Number(mDeclare[1]);
    t = t.slice(0, mDeclare.index);
  }

  // Civilités, au singulier et au pluriel, groupées ou non : « Mmes et MM. », « MM. »,
  // « Mmes », « Mme », « M. », « madame la mairesse », etc.
  t = t
    .replace(/\b(?:Mmes|Mme|MM\.|M\.)\s*(?:et\s+(?:Mmes|MM\.|Mme|M\.))?\s*/g, '')
    // « Mesdames et messieurs … » en un seul bloc, sinon il en restait « et … » collé au premier nom.
    .replace(/\b(?:mesdames|messieurs|madame|monsieur)(?:\s+et\s+(?:mesdames|messieurs))?\s+(?:les?\s+|la\s+)?(?:conseill(?:ères|ers|ère|er)|mairesses?|maires?|président(?:es|s|e)?)?\s*(?:d['’]arrondissement\s*)?/gi, '')
    .replace(/^\s*(?:et|,)\s+/i, '');

  const noms = t
    .split(/,|\s+et\s+|\s+ainsi que\s+|;/i)
    .map((s) => s.replace(/[.;:]+$/, '').trim())
    .filter(Boolean)
    .filter((nom) => {
      const plausible = /^[A-ZÀ-Ÿ]/.test(nom) && nom.length <= 60 && nom.split(' ').length <= 6;
      if (!plausible) avertissements.push('Fragment ignoré : « ' + nom + ' »');
      return plausible;
    });

  return { noms, avertissements, degrade: false, declare };
}

function extraireDecompte(texte, etiquette) {
  const m = texte.match(new RegExp(etiquette + '\\s*:\\s*(\\d+)', 'i'));
  return m ? Number(m[1]) : null;
}

// Renvoie null si le bloc ne contient pas d'appel nominal.
export function parserVote(bloc) {
  const texte = normaliserTexte(bloc);
  if (!/(?:Vot(?:ent|e)|Ont\s+vot[ée]s?|A\s+vot[ée])\s+(?:en\s+faveur|pour|contre)/i.test(texte)) return null;

  const segFaveur = extraireSegment(texte, '(?:en\\s+faveur|pour)');
  const segContre = extraireSegment(texte, 'contre');
  const faveur = nettoyerNoms(segFaveur);
  const contre = nettoyerNoms(segContre);

  // Le décompte : « Résultat : En faveur : 36 / Contre : 23 », ou à défaut celui entre
  // parenthèses après chaque liste.
  const apresResultat = texte.slice(Math.max(0, texte.search(/R[ée]sultat/i)));
  const nFaveur = extraireDecompte(apresResultat, 'En\\s+faveur') ?? faveur.declare;
  const nContre = extraireDecompte(apresResultat, 'Contre') ?? contre.declare;

  const degrade = faveur.degrade || contre.degrade;
  const avertissements = [...faveur.avertissements, ...contre.avertissements];
  // Les noms se comparent au décompte imprimé au bout de leur liste ; le « Résultat »
  // final peut légitimement en différer (un élu absent au moment du vote qui déclare
  // ensuite son intention est compté par la Ville, mais pas nommé dans la liste).
  const verifier = (etiquette, lu, nResultat) => {
    if (degrade) return;
    const nListe = lu.declare ?? nResultat;
    if (nListe != null && lu.noms.length !== nListe) {
      avertissements.push(lu.noms.length + ' nom(s) extrait(s) ' + etiquette + ', mais le document en déclare ' + nListe);
    }
    if (lu.declare != null && nResultat != null && lu.declare !== nResultat) {
      notes.push('Décompte final ' + etiquette + ' : ' + nResultat + ', liste nominale : ' + lu.declare + ' — un élu absent au moment du vote a pu déclarer son intention ensuite.');
    }
  };
  const notes = [];
  verifier('en faveur', faveur, nFaveur);
  verifier('contre', contre, nContre);

  const demandeur = texte.match(/vote\s+(?:enregistr[ée]\s+)?(?:est\s+)?demand[ée]\s+par\s+((?:Mme|M\.|Mmes|MM\.)?\s*[A-ZÀ-Ÿ][^\n.;]{1,60}?)(?:[.;\n]|\s+sur\b|$)/i);
  const mAbst = texte.match(/((?:Mme|M\.)\s+[A-ZÀ-Ÿ][^\n.]{1,50}?)\s+s['’](?:est\s+)?abst(?:ient|enue?)/i);
  const abstention = mAbst ? mAbst[1].replace(/\s+/g, ' ').trim() : /\babstention\b/i.test(texte) ? 'oui' : null;

  // Le résultat d'un vote enregistré se lit dans ses chiffres, pas dans une formule
  // attrapée ailleurs dans le bloc (un amendement « adopté à l'unanimité » juste avant
  // faisait dire « unanimité » à un vote de 37 contre 23). Sans décompte, la formule.
  let resultat = extraireResultat(texte);
  if (nFaveur != null && nContre != null) {
    if (nContre === 0) resultat = "Adoptée à l'unanimité";
    else if (nFaveur > nContre) resultat = 'Adoptée à la majorité';
    else if (nFaveur < nContre) resultat = 'Rejetée';
    else resultat = 'Égalité';
  }

  return {
    resultat,
    pour: faveur.noms,
    contre: contre.noms,
    decomptePour: nFaveur,
    decompteContre: nContre,
    abstention,
    demandeParVote: demandeur ? demandeur[1].replace(/\s+/g, ' ').trim() : null,
    texteSourceDegrade: degrade,
    avertissements,
    notes,
    brut: [segFaveur && 'Votent en faveur : ' + segFaveur, segContre && 'Votent contre : ' + segContre]
      .filter(Boolean)
      .join(' | ')
      .replace(/\s+/g, ' '),
  };
}

// ---------- ordres du jour ----------

// Un ordre du jour de Montréal (version « LPP », la seule publiée) n'a AUCUN hyperlien :
// le rattachement au sommaire décisionnel par lien n'existe pas. En revanche chaque point
// est écrit sur un gabarit fixe, et c'est une mine :
//
//   20.001 Contrat d'approvisionnement et de services autres que professionnels
//   CE Service de police de Montréal , Direction des services organisationnels - 1267026004
//   Conclure une entente-cadre avec SB joints et peinture inc., pour les services de peintre …
//   Compétence d'agglomération : Éléments de la sécurité publique …
//
// Ligne 1 : l'article et la CATÉGORIE de la Ville. Ligne 2 : l'instance qui tranchera en
// dernier, le SERVICE responsable, et le numéro de dossier (qui déborde parfois sur la ligne
// suivante). Puis l'objet, jusqu'à la mention de compétence ou au point suivant. Les
// chapitres (« 20 – Affaires contractuelles ») et « Page N » sont ignorés.
const LIGNE_POINT = /^(\d{2}\.\d{2,3})\s+(.*)$/;
const LIGNE_SERVICE = /^(CM|CG|CE|CA)\s+(.+?)(?:\s+-\s*(\d{10})?)?\s*$/;
// « Levée de la séance » ferme le dernier point de l'ordre du jour. Sans elle, ce point
// avalait tout ce qui suit — l'ordre du jour complet des trois instances, annexé au
// document : six objets dépassaient 240 000 caractères, le pire 318 571.
const FIN_POINT = /^(?:Comp[ée]tence d['’]agglom[ée]ration|Page\s+\d+|\d{2}\s+[–-]\s+|Lev[ée]e de la s[ée]ance\b|Nombre d['’]articles de niveau d[ée]cisionnel)/i;

export function parserOrdreDuJour(pages) {
  const points = [];
  let courant = null;
  const fermer = () => {
    if (!courant) return;
    courant.objet = bornerObjet(courant.objet.join(' '));
    points.push(courant);
    courant = null;
  };
  for (const page of pages) {
    for (const l of page.lignes) {
      const t = l.texte.trim();
      if (!t) continue;
      const mp = t.match(LIGNE_POINT);
      if (mp) {
        fermer();
        courant = { article: mp[1], categorie: mp[2].trim() || null, instanceFinale: null, unite: null, dossier: null, objet: [], sommairePdf: null, page: page.numero, attendDossier: false };
        // Au comité exécutif, la ligne de l'article porte la catégorie ; au conseil municipal
        // et à l'agglomération, elle porte directement le service et le dossier
        // (« 20.01  Service du greffe , Direction … - 1261234001 »). Et « L'étude de ce
        // dossier se fera à huis clos » n'est pas une catégorie.
        const reste = courant.categorie ?? '';
        const ms = reste.match(/^(?:(CM|CG|CE|CA)\s+)?((?:Service|Direction|Bureau|Arrondissement|Commission|Office|Soci[ée]t[ée]|Conseil|Cabinet|Secr[ée]tariat|Greffe|Ombudsman|V[ée]rificateur)\b.+?)(?:\s+-\s*(\d{10})?)?\s*$/);
        if (ms) {
          courant.categorie = null;
          courant.instanceFinale = ms[1] ?? null;
          courant.unite = ms[2].replace(/\s+,/g, ',').replace(/\s+-\s*$/, '').trim();
          courant.dossier = ms[3] ?? null;
          courant.attendDossier = !ms[3];
        } else if (/huis clos/i.test(reste)) courant.categorie = null;
        continue;
      }
      if (!courant) continue;
      if (FIN_POINT.test(t)) {
        if (/^Page\s+\d+/i.test(t)) continue; // pied de page : le point continue sur la page suivante
        fermer();
        continue;
      }
      if (!courant.unite) {
        const ms = t.match(LIGNE_SERVICE);
        if (ms) {
          courant.instanceFinale = ms[1];
          courant.unite = ms[2].replace(/\s+,/g, ',').replace(/\s+-\s*$/, '').trim();
          courant.dossier = ms[3] ?? null;
          courant.attendDossier = !ms[3];
          continue;
        }
      }
      if (courant.attendDossier) {
        const md = t.match(/^(\d{10})\s*$/);
        courant.attendDossier = false;
        if (md) {
          courant.dossier = md[1];
          continue;
        }
      }
      courant.objet.push(t);
    }
  }
  fermer();
  for (const p of points) delete p.attendDossier;
  return points;
}
