// Lecture des procès-verbaux de la Ville de Longueuil.
//
// Un procès-verbal du conseil de ville (CO) ou du conseil d'agglomération (CA) est découpé en
// chapitres fixes — « 2. ADMINISTRATION ET ORGANISATION », « 4. FINANCES », « 7. BIENS
// IMMOBILIERS », « 10. AMÉNAGEMENT DU TERRITOIRE ET URBANISME »… — et chaque résolution s'ouvre
// par son numéro sur une ligne à part, puis son titre EN MAJUSCULES, qui se termine souvent par
// le numéro du sommaire décisionnel :
//
//   4. FINANCES
//   CO-260616-4.3
//   AUTORISATION DE VIREMENTS BUDGÉTAIRES (SD-2026-1367)
//   Il est proposé par Jonathan Tabarah, appuyé par Nathalie Delisle :
//   1° d'autoriser …
//                                ADOPTÉE À L’UNANIMITÉ
//
// Quand un membre demande le vote, le procès-verbal nomme chacun, en toutes lettres :
//
//   Vote sur la proposition technique
//   Vote en faveur de cette proposition : Jacques Lemire.
//   Votent contre cette proposition : Catherine Fournier, Jonathan Tabarah, … et Alvaro Cueto.
//   En faveur : 1 Contre : 14
//                                REJETÉE À LA MAJORITÉ
//
// Une même résolution peut porter plusieurs votes (une proposition technique ou un amendement,
// puis la proposition principale). Au conseil d'agglomération, où les voix sont pondérées par
// population, le décompte « En faveur : N Contre : N » n'est pas imprimé ; la formule dit
// « ADOPTÉE À LA MAJORITÉ DES 2/3 DES VOIX ».
//
// Sans appel nominal, une opposition peut être consignée : « Jean Martel exprime sa
// dissidence. », « Pascale Mongrain et Ludovic Grisé Farand expriment leur dissidence. »
//
// RÈGLE DU PROJET : jamais de donnée inventée. Chaque vote garde le passage brut ; tout écart
// entre les noms extraits et le décompte imprimé va dans `avertissements`, jamais corrigé en
// douce ; un texte aux glyphes espacés donne `texteSourceDegrade: true` et pas de noms.

import { texteDegrade } from './pdf.js';

export function normaliserTexte(texte) {
  return String(texte ?? '')
    .replace(/ /g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n');
}

// « CO-260616-4.3 », « COX1-221213-2.1 », « CA-251120-6.13 ».
export function reNumero(prefixe) {
  return new RegExp(`^(${prefixe}X?\\d?-\\d{6}-\\d{1,2}\\.\\d{1,3})\\s*$`);
}

// Le pied de page répété : « Procès-verbal – Séance ordinaire du conseil … – 20 janvier 2026 page 1 ».
const PIED_DE_PAGE = /^Proc[èe]s-verbal\s+[–-].*\bpage\s+\d+\s*$/i;
// Un chapitre : numéro, point, libellé tout en majuscules.
const CHAPITRE = /^(\d{1,2})\.\s+([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ’'\-, ]{3,})$/;
const SD = /\(?\s*(SD-\d{4}-\d{3,5})\s*\)?/;

// Libellé de chapitre lisible : « AMÉNAGEMENT DU TERRITOIRE ET URBANISME » -> « Aménagement du
// territoire et urbanisme ». Seul le premier mot garde sa capitale ; les chapitres n'ont pas
// de nom propre, sauf l'agglomération qu'on remet à la main.
export function libelleChapitre(majuscules) {
  const bas = majuscules.toLocaleLowerCase('fr-CA').replace(/’/g, "'");
  return (bas.charAt(0).toLocaleUpperCase('fr-CA') + bas.slice(1)).replace(/\s+/g, ' ').trim();
}

// Des lignes de PDF en une phrase. Un trait d'union en fin de ligne colle à la suite : la mise en
// page coupe « Parc-Michel- / Chartrand » et « (SD-2026- / 1223) ».
export function recoller(lignes) {
  return lignes
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((acc, l) => (!acc ? l : acc.endsWith('-') ? acc + l : acc + ' ' + l), '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Une ligne de titre : des lettres, et presque toutes en majuscules.
function estMajuscules(l) {
  const lettres = l.replace(/[^\p{L}]/gu, '');
  if (lettres.length < 3) return false;
  const minuscules = lettres.replace(/[^\p{Ll}]/gu, '').length;
  return minuscules / lettres.length < 0.12;
}

export function extraireResultat(bloc) {
  const t = bloc.replace(/’/g, "'");
  if (/ADOPT[ÉE]E?\s+[ÀA]\s+L'UNANIMIT[ÉE]/i.test(t)) return "Adoptée à l'unanimité";
  if (/ADOPT[ÉE]E?\s+[ÀA]\s+LA\s+MAJORIT[ÉE]\s+DES\s+2\/3/i.test(t)) return 'Adoptée à la majorité des 2/3 des voix';
  if (/ADOPT[ÉE]E?\s+[ÀA]\s+LA\s+MAJORIT[ÉE]/i.test(t)) return 'Adoptée à la majorité';
  if (/REJET[ÉE]E?\b/.test(t)) return 'Rejetée';
  if (/\bADOPT[ÉE]E?\b/.test(t)) return 'Adoptée';
  return null;
}

// « Jean Martel exprime sa dissidence. » / « A et B expriment leur dissidence. »
export function extraireDissidences(bloc) {
  const noms = [];
  const phrases = bloc.replace(/\s+/g, ' ').split(/(?<=[.;:])\s+/);
  for (const p of phrases) {
    const m = p.match(/^(.+?)\s+exprim(?:e|ent)\s+(?:sa|leur)\s+dissidence/);
    if (m) noms.push(...nettoyerNoms(m[1]).noms);
  }
  return [...new Set(noms)];
}

// Découpe le texte d'un procès-verbal en résolutions. `prefixe` : celui de l'instance (« CO »).
// Les renvois à d'autres résolutions (« la résolution CO-251209-7.2 ») sont au milieu d'une
// phrase, jamais seuls sur leur ligne : ils n'ouvrent pas de bloc.
//
// `seanceId` (« CO-260707 ») restreint aux résolutions de la séance lue. Une résolution modifiée
// plus tard porte en marge, seul sur sa ligne, le numéro de celle qui la modifie :
//   CO-260707-4.4
//   Modifiée par
//   CO-260818-1.4
// Sans cette restriction, ce renvoi ouvrait un faux bloc au nom de la séance d'août.
export function decouperResolutions(texte, { prefixe, seanceId = null }) {
  const reAutre = reNumero(prefixe);
  const re = seanceId ? new RegExp(`^(${seanceId}-\\d{1,2}\\.\\d{1,3})\\s*$`) : reAutre;
  const lignes = normaliserTexte(texte).split('\n');
  const blocs = [];
  let chapitre = null;
  let courant = null;
  for (const brut of lignes) {
    const l = brut.trim();
    if (!l || PIED_DE_PAGE.test(l)) continue;
    const mc = l.match(CHAPITRE);
    if (mc && estMajuscules(mc[2])) {
      chapitre = { numero: Number(mc[1]), libelle: libelleChapitre(mc[2]) };
      continue;
    }
    if (/^(?:PREMI[ÈE]RE|DEUXI[ÈE]ME)\s+PARTIE$/.test(l)) continue;
    const m = l.match(re);
    if (m) {
      if (courant) blocs.push(courant);
      courant = { numero: m[1], chapitre, lignes: [], modifieePar: [] };
      continue;
    }
    const autre = l.match(reAutre);
    if (autre && courant) {
      if (/^Modifi[ée]e?s?\s+par$/i.test(courant.lignes.at(-1) ?? '')) {
        courant.lignes.pop();
        courant.modifieePar.push(autre[1]);
      }
      continue;
    }
    if (courant) courant.lignes.push(l);
  }
  if (courant) blocs.push(courant);

  return blocs.map((b) => {
    // Le titre : les lignes en majuscules qui suivent le numéro.
    const titre = [];
    let i = 0;
    for (; i < b.lignes.length; i++) {
      if (!estMajuscules(b.lignes[i]) || /^(?:ADOPT|REJET)[ÉE]E?(?:\s|$)/.test(b.lignes[i])) break;
      titre.push(b.lignes[i]);
    }
    let titreMaj = recoller(titre);
    const sd = titreMaj.match(SD)?.[1] ?? null;
    titreMaj = titreMaj.replace(/\s*\(\s*SD-\d{4}-\d{3,5}\s*\)\s*/, ' ').replace(/[.\s]+$/, '').trim();
    const corps = b.lignes.slice(i).join('\n');
    const votes = parserVotes(corps);
    return {
      numero: b.numero,
      chapitre: b.chapitre?.libelle ?? null,
      chapitreNumero: b.chapitre?.numero ?? null,
      titreMajuscules: titreMaj || null,
      sommaire: sd,
      modifieePar: b.modifieePar,
      nonUtilise: /^NUM[ÉE]RO NON UTILIS[ÉE]/.test(titreMaj),
      // Le dernier résultat du bloc : quand il y a eu un vote sur une proposition technique
      // puis sur la principale, c'est la principale qui décide du sort de la résolution.
      resultat: votes.length ? votes[votes.length - 1].resultat : extraireResultat(corps),
      dissidences: votes.length ? [] : extraireDissidences(corps),
      votes,
      texte: corps,
    };
  });
}

// ---------- votes ----------

// « Catherine Fournier, Jonathan Tabarah, … et Alvaro Cueto. » -> noms.
export function nettoyerNoms(segment) {
  if (!segment) return { noms: [], avertissements: [], degrade: false };
  const avertissements = [];
  // Un nom coupé en fin de ligne par la mise en page (« Marie- / Michèle ») est recollé.
  let t = segment.replace(/(\p{L})-\s+(\p{L})/gu, '$1-$2').replace(/\s+/g, ' ').trim();
  if (/^(?:aucun|aucune|personne)\b/i.test(t) || t === '') return { noms: [], avertissements, degrade: false };
  if (texteDegrade(t)) {
    return { noms: [], degrade: true, avertissements: ['Texte source dégradé (PDF aux glyphes espacés) — noms non extraits, voir le champ « brut ».'] };
  }
  const noms = t
    .replace(/\.\s*$/, '')
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

// Tous les votes nominaux d'un bloc. Chaque vote s'étend du premier « Vote(nt) en faveur /
// contre de cette proposition » jusqu'à la ligne de résultat qui le ferme.
export function parserVotes(corps) {
  const texte = normaliserTexte(corps);
  const votes = [];
  const reDebut = /(?:^|\n)(?:Vote(?:nt)?\s+(?:en\s+faveur\s+de|contre)\s+cette\s+proposition\s*:)/g;
  const reResultat = /(?:^|\n)\s*((?:ADOPT|REJET)[ÉE]E?\b[^\n]*)/g;
  let position = 0;
  while (true) {
    reDebut.lastIndex = position;
    const debut = reDebut.exec(texte);
    if (!debut) break;
    reResultat.lastIndex = debut.index;
    const fin = reResultat.exec(texte);
    const bout = fin ? fin.index + fin[0].length : texte.length;
    const passage = texte.slice(debut.index, bout);
    // Ce qui précède le vote, jusqu'au vote précédent : l'étiquette (« Vote sur la proposition
    // technique ») et le nom de qui a demandé le vote.
    const avant = texte.slice(position, debut.index);
    votes.push(lireVote(passage, avant));
    position = bout;
  }
  return votes;
}

function segment(passage, etiquette) {
  const m = passage.match(new RegExp(`Vote(?:nt)?\\s+${etiquette}\\s+cette\\s+proposition\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*Vote(?:nt)?\\s+(?:en\\s+faveur|contre)|\\n\\s*En\\s+faveur\\s*:|\\n\\s*(?:ADOPT|REJET)|$)`));
  return m ? m[1].trim() : null;
}

function lireVote(passage, avant) {
  const segPour = segment(passage, 'en\\s+faveur\\s+de');
  const segContre = segment(passage, 'contre');
  const pour = nettoyerNoms(segPour);
  const contre = nettoyerNoms(segContre);
  const mDecompte = passage.match(/En\s+faveur\s*:\s*(\d+)\s+Contre\s*:\s*(\d+)/i);
  const decomptePour = mDecompte ? Number(mDecompte[1]) : null;
  const decompteContre = mDecompte ? Number(mDecompte[2]) : null;
  const degrade = pour.degrade || contre.degrade;
  const avertissements = [...pour.avertissements, ...contre.avertissements];
  if (!degrade && decomptePour != null && pour.noms.length !== decomptePour) {
    avertissements.push(`${pour.noms.length} nom(s) extrait(s) en faveur, mais le document en déclare ${decomptePour}`);
  }
  if (!degrade && decompteContre != null && contre.noms.length !== decompteContre) {
    avertissements.push(`${contre.noms.length} nom(s) extrait(s) contre, mais le document en déclare ${decompteContre}`);
  }
  const ligneResultat = passage.match(/(?:ADOPT|REJET)[ÉE]E?\b[^\n]*/)?.[0] ?? '';
  const etiquette = [...avant.matchAll(/Vote\s+sur\s+(l['’](?:amendement|[^\n]{0,60})|la\s+proposition[^\n]{0,40})/gi)].pop()?.[1]?.trim() ?? null;
  const demandeur = [...avant.matchAll(/([A-ZÀ-Ö][\p{L}'’\-]+(?:\s+[A-ZÀ-Ö][\p{L}'’\-]+){1,3}),\s+appuy[ée]e?\s+par\s+[^,]+,\s+demande\s+le\s+vote/gu)].pop()?.[1] ?? null;
  return {
    etiquette: etiquette ? etiquette.charAt(0).toUpperCase() + etiquette.slice(1) : null,
    resultat: extraireResultat(ligneResultat),
    pour: pour.noms,
    contre: contre.noms,
    decomptePour,
    decompteContre,
    abstention: null,
    demandeParVote: demandeur,
    texteSourceDegrade: degrade,
    avertissements,
    brut: passage.replace(/\s+/g, ' ').trim(),
  };
}

// ---------- ordre du jour ----------

// L'ordre du jour écrit les mêmes numéros avec le titre en casse normale, bien plus lisible
// que les majuscules du procès-verbal :
//
//   CO-260818-2.2  Dépôt du procès-verbal de la réunion du Conseil local du patrimoine
//                  tenue le 11 juin 2026 (SD-2026-1120)
//
// On le lit pour l'objet, rattaché par numéro — et vérifié par le numéro de sommaire quand
// les deux en ont un, parce que la version publiée de l'ordre du jour peut précéder un
// renumérotage.
export function parserOrdreDuJour(texte, { prefixe }) {
  const re = new RegExp(`^(${prefixe}X?\\d?-\\d{6}-\\d{1,2}\\.\\d{1,3})\\s+(.*)$`);
  const points = new Map();
  let courant = null;
  const fermer = () => {
    if (!courant) return;
    let objet = recoller(courant.morceaux);
    const sd = objet.match(SD)?.[1] ?? null;
    objet = objet.replace(/\s*\(\s*SD-\d{4}-\d{3,5}\s*\)\s*/, ' ').trim();
    points.set(courant.numero, { numero: courant.numero, objet: objet || null, sommaire: sd });
    courant = null;
  };
  for (const brut of normaliserTexte(texte).split('\n')) {
    const l = brut.trim();
    if (!l) continue;
    const m = l.match(re);
    if (m) {
      fermer();
      courant = { numero: m[1], morceaux: [m[2]] };
      continue;
    }
    if (!courant) continue;
    // Fin du point : un chapitre, un pied de page, ou une ligne qui ne continue manifestement
    // pas le titre.
    if (CHAPITRE.test(l) || /^Projet d['’]ordre du jour|^Ordre du jour|\bpage\s+\d+\s*$/i.test(l) || /^(?:PREMI|DEUXI)[ÈE]ME PARTIE/.test(l)) {
      fermer();
      continue;
    }
    courant.morceaux.push(l);
    if (courant.morceaux.join(' ').length > 600) fermer();
  }
  fermer();
  return points;
}
