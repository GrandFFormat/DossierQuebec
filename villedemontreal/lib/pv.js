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

// « CM26 0355 », « CG26 0123 », « CE26 0412 » en début de ligne.
const NUMERO_RESOLUTION = /^(C[MGEA])\s?(\d{2})\s+(\d{4})\s*$/;
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
const FIN_OBJET = /^(?:Vu\b|Attendu\b|Consid[ée]rant\b|Il est propos[ée]|Il est r[ée]solu|Et r[ée]solu|Après avoir|Le conseil\b|Le comité\b|Un débat|Le président|La présidente|Adopt[ée]e?\s+(?:à|sur|par)\b|Rejet[ée]e?\s*\.?\s*$|_{3,})/i;

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
    if (morceaux.join(' ').length > 700) break;
  }
  return morceaux.join(' ').replace(/\s+/g, ' ').trim() || null;
}

export function extraireResultat(bloc) {
  if (/Adopt[ée]e?\s+à\s+l['’]unanimit[ée]/i.test(bloc)) return "Adoptée à l'unanimité";
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
  const lignes = normaliserTexte(texte).split('\n');
  const blocs = [];
  let courant = null;
  for (const brut of lignes) {
    const l = brut.trim();
    const m = l.match(NUMERO_RESOLUTION);
    if (m && (!instance || m[1] === instance)) {
      if (courant) blocs.push(courant);
      courant = { numero: `${m[1]}${m[2]} ${m[3]}`, lignes: [] };
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
      objet: extraireObjet(b.lignes),
      article,
      dossier,
      resultat: extraireResultat(bloc),
      dissidences: vote ? [] : extraireDissidences(bloc),
      vote,
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
  let t = segment.replace(/\s+/g, ' ').trim();

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

  // Le décompte que la Ville imprime entre parenthèses à la fin de la liste.
  let declare = null;
  const mDeclare = t.match(/\((\d+)\)\s*\.?\s*$/);
  if (mDeclare) {
    declare = Number(mDeclare[1]);
    t = t.slice(0, mDeclare.index);
  }

  // Civilités, au singulier et au pluriel, groupées ou non : « Mmes et MM. », « MM. »,
  // « Mmes », « Mme », « M. », « madame la mairesse », etc.
  t = t
    .replace(/\b(?:Mmes|Mme|MM\.|M\.)\s*(?:et\s+(?:Mmes|MM\.|Mme|M\.))?\s*/g, '')
    .replace(/\b(?:mesdames|messieurs|madame|monsieur)\s+(?:les?\s+|la\s+)?(?:conseill(?:ères|ers|ère|er)|mairesses?|maires?|président(?:es|s|e)?)?\s*(?:d['’]arrondissement\s*)?/gi, '');

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
  if (!degrade && nFaveur != null && faveur.noms.length !== nFaveur) {
    avertissements.push(faveur.noms.length + ' nom(s) extrait(s) en faveur, mais le document en déclare ' + nFaveur);
  }
  if (!degrade && nContre != null && contre.noms.length !== nContre) {
    avertissements.push(contre.noms.length + ' nom(s) extrait(s) contre, mais le document en déclare ' + nContre);
  }

  const demandeur = texte.match(/vote\s+(?:enregistr[ée]\s+)?(?:est\s+)?demand[ée]\s+par\s+((?:Mme|M\.|Mmes|MM\.)?\s*[A-ZÀ-Ÿ][^\n.;]{1,60}?)(?:[.;\n]|\s+sur\b|$)/i);
  const mAbst = texte.match(/((?:Mme|M\.)\s+[A-ZÀ-Ÿ][^\n.]{1,50}?)\s+s['’](?:est\s+)?abst(?:ient|enue?)/i);
  const abstention = mAbst ? mAbst[1].replace(/\s+/g, ' ').trim() : /\babstention\b/i.test(texte) ? 'oui' : null;

  return {
    resultat: extraireResultat(texte),
    pour: faveur.noms,
    contre: contre.noms,
    decomptePour: nFaveur,
    decompteContre: nContre,
    abstention,
    demandeParVote: demandeur ? demandeur[1].replace(/\s+/g, ' ').trim() : null,
    texteSourceDegrade: degrade,
    avertissements,
    brut: [segFaveur && 'Votent en faveur : ' + segFaveur, segContre && 'Votent contre : ' + segContre]
      .filter(Boolean)
      .join(' | ')
      .replace(/\s+/g, ' '),
  };
}

// ---------- ordres du jour ----------

// Un ordre du jour « LPP » (avec liens vers les pièces publiques) liste les points de la
// séance — « 20.03 » — avec le numéro de dossier à dix chiffres et, en hyperlien, le
// sommaire décisionnel. On rattache chaque lien au numéro de dossier écrit sur la même
// ligne ou juste au-dessus, page par page. `pages` vient de lib/pdf.js.
export function parserOrdreDuJour(pages) {
  const points = [];
  for (const page of pages) {
    const lignesDossier = [];
    for (const l of page.lignes) {
      const m = l.texte.match(/\b(\d{10})\b/);
      if (m) lignesDossier.push({ y: l.y, dossier: m[1] });
    }
    // Pour chaque lien : le dossier le plus proche verticalement, en privilégiant la ligne
    // au-dessus (le lien est souvent posé sur l'objet, écrit sous le numéro).
    const liens = new Map();
    for (const lien of page.liens) {
      if (lien.y == null || !lignesDossier.length) continue;
      let meilleur = null;
      for (const ld of lignesDossier) {
        const d = Math.abs(ld.y - lien.y);
        if (!meilleur || d < meilleur.d) meilleur = { d, dossier: ld.dossier };
      }
      if (meilleur && meilleur.d < 80 && !liens.has(meilleur.dossier)) liens.set(meilleur.dossier, lien.url);
    }
    // Les points : article, dossier, et l'objet qui suit.
    const lignes = page.lignes.map((l) => l.texte.trim());
    for (let i = 0; i < lignes.length; i++) {
      const m = lignes[i].match(/^(\d{2}\.\d{2,3})\b\s*(.*)$/);
      if (!m) continue;
      const suite = [m[2], ...lignes.slice(i + 1, i + 6).filter((l) => !/^\d{2}\.\d{2,3}\b/.test(l))].join(' ');
      const dossier = suite.match(/\b(\d{10})\b/)?.[1] ?? null;
      points.push({
        article: m[1],
        dossier,
        objet: suite.replace(/\b\d{10}\b/, '').replace(/\s+/g, ' ').trim() || null,
        sommairePdf: dossier ? (liens.get(dossier) ?? null) : null,
        page: page.numero,
      });
    }
  }
  return points;
}
