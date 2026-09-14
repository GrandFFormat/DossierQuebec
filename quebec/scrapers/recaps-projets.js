// « Où en est le projet » — un récapitulatif par projet suivable (lib/projets.js), pour la page
// « Mes dossiers ».
//
//   node --env-file=../api.env scrapers/recaps-projets.js                 les projets qui ont bougé
//   node --env-file=../api.env scrapers/recaps-projets.js --projet=tramway --force
//
// Suivre le tramway, c'est une centaine de décisions dans l'année. La liste seule ne dit pas où
// en est le projet : on la fait lire au modèle, qui en tire quelques phrases d'ensemble, une
// ligne du temps des grands mouvements (chacun rattaché aux numéros des décisions qui le
// fondent) et ce qui reste à décider.
//
// Les sources sont ce qui est déjà public dans le volet : l'objet de chaque dossier, son résumé
// en langage clair, ses résolutions et son statut. Pas le détail de l'argent (réservé aux abonnés).
//
// Personne ne relit avant publication. Même garantie que pour le détail de l'argent
// (scrapers/details-argent.js) : un contrôle mécanique — chaque numéro cité doit appartenir au
// projet, chaque nombre écrit doit exister dans les sources des décisions citées — puis une
// contre-lecture par un second appel. Ce qui ne passe pas est retiré.
//
// Un projet n'est refait que si ses dossiers, leurs résumés ou leurs statuts ont changé
// (signature) : les jours sans nouveauté ne coûtent rien.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PROJETS } from '../lib/projets.js';
import { MODELE, appeler, compacter, nombresDe } from './details-argent.js';

const OUT = new URL('../data/projets-recaps.json', import.meta.url);
const TARIF = { entree: 5, sortie: 25 }; // $ US par million de jetons, claude-opus-5
const VERSION = 1; // changer pour tout refaire après une modification des consignes
const MIN_DOSSIERS = 3; // en deçà, la liste se lit très bien seule
const PAS_UN_DOSSIER = new Set(['Procès-verbaux', 'Tableaux des décisions']);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]} ${a}`;
};

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// ---------- les sources d'un projet ----------
// Une entrée par dossier : le sommaire et ses résolutions ne comptent qu'une fois.
function dossiersDuProjet(decisions, resumes, cle) {
  const resumeDe = new Map(resumes.map((r) => [r.id, r]));
  const groupes = new Map();
  for (const d of decisions) {
    if (!d.projets?.includes(cle) || PAS_UN_DOSSIER.has(d.type)) continue;
    const k = d.sommaireId ?? d.id;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }
  return [...groupes.entries()]
    .map(([k, docs]) => {
      docs.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      const principal = docs.find((d) => d.id === k) ?? docs[0];
      const resolutions = docs.filter((d) => d.instance);
      const resume = resumeDe.get(k);
      const statut =
        principal.statutDossier === 'en_cours'
          ? `en cours — décision attendue${principal.etapeFinale ? ` : ${principal.etapeFinale}` : ''}${principal.echeance ? `, date cible ${dateLongue(principal.echeance)}` : ''}`
          : 'décision finale prise';
      const texte = [
        `[${principal.numero}] dossier du ${dateLongue(docs[0].date)} — ${statut}`,
        `Objet : ${principal.objet ?? ''}`,
        resume?.puces?.length && !resume.sansContenuSubstantiel ? `Résumé :\n${resume.puces.map((p) => `- ${p}`).join('\n')}` : null,
        resolutions.length ? `Résolutions : ${resolutions.map((r) => `${r.numero} (${r.instance}, ${dateLongue(r.date)})`).join(' ; ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      return {
        k,
        date: docs.at(-1).date,
        numeros: [...new Set(docs.map((d) => d.numero).filter(Boolean))],
        signature: `${k}|${resume?.genereLe ?? ''}|${principal.statutDossier ?? ''}|${resolutions.map((r) => r.numero).join(',')}`,
        texte,
      };
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

// ---------- rédaction ----------
const CONSIGNE = `Tu rédiges, pour des citoyens qui suivent un grand projet de la Ville de Québec, le
récapitulatif « Où en est le projet », à partir de la liste de ses dossiers de l'année (objet,
résumé en langage clair, résolutions, statut). Ton lecteur n'a pas le temps de lire la liste :
il veut comprendre en une minute ce que la Ville a fait et ce qui reste à décider.

Règles absolues :
1. N'invente rien. Chaque affirmation doit venir des dossiers fournis. Pas de contexte tiré de
   ta connaissance générale (ni coûts globaux, ni échéancier, ni historique du projet).
2. Aucun total, aucune somme, aucun décompte (« 41 acquisitions », « plus de 20 millions ») :
   les nombres affichés à côté de ton texte sont calculés ailleurs. Tu peux citer un montant,
   une superficie ou une date tels qu'ils sont écrits dans UN dossier, en citant ce dossier.
3. Aucun jugement ni adjectif d'appréciation : ni « important », « enfin », « retard »,
   « controversé », « majeur ». Des faits.
4. Aucun nom de personne.
5. Français simple, phrases courtes, voix active. Pas de jargon administratif : « acheter un
   terrain » plutôt que « acquisition de gré à gré ou par expropriation d'une partie de lot ».

Les champs :
- enBref : deux ou trois phrases sur ce que la Ville fait dans ce projet cette année.
- etapes : de trois à six grands mouvements, du plus ancien au plus récent. Regroupe les
  dossiers de même nature (« Achat de terrains le long du tracé ») plutôt que de les énumérer.
  periode : la période couverte, en mois (« Février à juillet 2026 », « Juillet 2026 »).
  titre : trois à huit mots. texte : une ou deux phrases. numeros : les numéros, tels
  qu'écrits entre crochets ou dans « Résolutions », des dossiers qui fondent l'étape (au plus six).
- aSurveiller : de zéro à quatre éléments, UNIQUEMENT tirés des dossiers marqués « en cours »
  ou d'une date future écrite dans un résumé. Liste vide sinon.

Appelle l'outil recap_projet une seule fois.`;

const ITEM = (proprietes) => ({
  type: 'object',
  properties: { ...proprietes, numeros: { type: 'array', items: { type: 'string' } } },
  required: [...Object.keys(proprietes), 'numeros'],
  additionalProperties: false,
});

const OUTIL = {
  name: 'recap_projet',
  description: "Enregistre le récapitulatif « Où en est le projet ».",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      enBref: { type: 'string' },
      etapes: { type: 'array', items: ITEM({ periode: { type: 'string' }, titre: { type: 'string' }, texte: { type: 'string' } }) },
      aSurveiller: { type: 'array', items: ITEM({ texte: { type: 'string' } }) },
    },
    required: ['enBref', 'etapes', 'aSurveiller'],
    additionalProperties: false,
  },
};

const CONSIGNE_VERIFICATION = `Tu contre-vérifies le récapitulatif d'un projet de la Ville de Québec, rédigé à partir
de la liste de ses dossiers. Il sera publié SANS relecture humaine : chaque erreur que tu laisses
passer sera lue par des citoyens comme un fait.

Pour chaque élément, relis les dossiers qu'il cite et signale-le quand :
- il affirme quelque chose que ces dossiers ne disent pas, ou le déforme ;
- il attribue un fait, un montant, un lieu ou une date au mauvais dossier ;
- il contient un total, un décompte ou une estimation que les dossiers ne donnent pas ;
- il porte un jugement ou nomme une personne ;
- pour aSurveiller : il ne repose ni sur un dossier « en cours » ni sur une date future écrite.

Ne signale pas le style ni les regroupements fidèles. Désigne chaque élément par son nom exact
(« enBref », « etapes[2] », « aSurveiller[0] »). Appelle l'outil verifier_recap une seule fois ;
liste vide si tout est exact.`;

const OUTIL_VERIFICATION = {
  name: 'verifier_recap',
  description: 'Enregistre les éléments inexacts du récapitulatif.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      problemes: {
        type: 'array',
        items: { type: 'object', properties: { element: { type: 'string' }, raison: { type: 'string' } }, required: ['element', 'raison'], additionalProperties: false },
      },
    },
    required: ['problemes'],
    additionalProperties: false,
  },
};

// Chaque numéro cité appartient au projet ; chaque nombre écrit existe dans les dossiers cités
// (ou, pour enBref qui n'en cite pas, dans l'un des dossiers du projet).
function controleMecanique(recap, dossiers) {
  const sourceDe = new Map();
  for (const d of dossiers) for (const n of d.numeros) sourceDe.set(n, d);
  const tout = compacter(dossiers.map((d) => d.texte).join('\n'));
  const retires = [];
  const verifierItem = (item, nom, champs) => {
    const cites = [...new Set(item.numeros.map((n) => n.trim()))];
    const inconnus = cites.filter((n) => !sourceDe.has(n));
    if (!cites.length || inconnus.length) {
      retires.push({ element: nom, raison: inconnus.length ? `numéro hors du projet : ${inconnus.join(', ')}` : 'aucun numéro cité' });
      return null;
    }
    const sources = compacter(cites.map((n) => sourceDe.get(n).texte).join('\n'));
    const absents = champs.flatMap((c) => nombresDe(item[c])).filter((n) => !sources.includes(n));
    if (absents.length) {
      retires.push({ element: nom, raison: `nombre absent des dossiers cités : ${absents.join(', ')}` });
      return null;
    }
    return { ...item, numeros: cites };
  };
  const r = {
    enBref: nombresDe(recap.enBref).every((n) => tout.includes(n)) ? recap.enBref : null,
    etapes: recap.etapes.map((e, i) => verifierItem(e, `etapes[${i}]`, ['texte', 'titre'])),
    aSurveiller: recap.aSurveiller.map((e, i) => verifierItem(e, `aSurveiller[${i}]`, ['texte'])),
  };
  if (!r.enBref) retires.push({ element: 'enBref', raison: 'nombre absent des dossiers' });
  // La période se vérifie à part : ses années doivent exister quelque part dans le projet.
  r.etapes = r.etapes.map((e, i) => {
    if (e && !nombresDe(e.periode).every((n) => tout.includes(n))) {
      retires.push({ element: `etapes[${i}]`, raison: 'période hors des dates du projet' });
      return null;
    }
    return e;
  });
  return { recap: r, retires };
}

function retirer(recap, problemes) {
  const r = structuredClone(recap);
  for (const { element } of problemes) {
    const m = element.match(/^(enBref|etapes|aSurveiller)(?:\[(\d+)\])?$/);
    if (!m) continue;
    if (m[1] === 'enBref') r.enBref = null;
    else if (m[2] != null && r[m[1]][m[2]] !== undefined) r[m[1]][m[2]] = null;
  }
  return r;
}

async function lireJson(url, repli) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return repli;
  }
}

export async function rediger({ seulement = null, force = false } = {}) {
  const [{ decisions = [], projets: resumeProjets = {} }, { resumes = [] }, existant] = await Promise.all([
    lireJson(new URL('../data/decisions.json', import.meta.url), {}),
    lireJson(new URL('../data/resumes.json', import.meta.url), {}),
    lireJson(OUT, { recaps: {} }),
  ]);
  const recaps = existant.recaps ?? {};
  const client = new Anthropic();
  let entree = 0;
  let sortie = 0;
  const echecs = [];

  const aFaire = [];
  for (const cle of Object.keys(PROJETS)) {
    if (seulement && cle !== seulement) continue;
    const dossiers = dossiersDuProjet(decisions, resumes, cle);
    const signature = createHash('sha256').update(`${VERSION}\n${dossiers.map((d) => d.signature).join('\n')}`).digest('hex').slice(0, 16);
    if (dossiers.length < MIN_DOSSIERS) {
      delete recaps[cle];
      continue;
    }
    if (!force && recaps[cle]?.signature === signature) continue;
    aFaire.push({ cle, dossiers, signature });
  }
  if (!aFaire.length) {
    console.log('Récapitulatifs des projets : rien de nouveau.');
    return recaps;
  }
  console.log(`Récapitulatifs des projets : ${aFaire.map((p) => `${p.cle} (${p.dossiers.length} dossiers)`).join(', ')}`);

  const resultats = await Promise.allSettled(
    aFaire.map(async ({ cle, dossiers, signature }) => {
      const titre = resumeProjets[cle]?.titre ?? PROJETS[cle].titre;
      const document = `Projet : ${titre}\n${PROJETS[cle].description}\n\nDossiers de l'année, du plus ancien au plus récent :\n\n${dossiers.map((d) => d.texte).join('\n\n')}`;
      const redaction = await appeler(client, { system: CONSIGNE, outil: OUTIL, effort: 'high', texte: document });
      entree += redaction.usage.input_tokens;
      sortie += redaction.usage.output_tokens;
      const mecanique = controleMecanique(redaction.entree, dossiers);
      const verification = await appeler(client, {
        system: CONSIGNE_VERIFICATION,
        outil: OUTIL_VERIFICATION,
        effort: 'high',
        texte: `${document}\n\n--- récapitulatif à vérifier ---\n${JSON.stringify(mecanique.recap, null, 1)}`,
      });
      entree += verification.usage.input_tokens;
      sortie += verification.usage.output_tokens;
      const final = retirer(mecanique.recap, verification.entree.problemes);
      const etapes = final.etapes.filter(Boolean);
      return {
        cle,
        recap: {
          titre,
          signature,
          genereLe: new Date().toISOString(),
          modele: redaction.modele,
          dossiers: dossiers.length,
          enBref: final.enBref,
          etapes,
          aSurveiller: final.aSurveiller.filter(Boolean),
          utilisable: Boolean(final.enBref) || etapes.length >= 2,
          verification: { version: VERSION, retiresMecanique: mecanique.retires, retiresContreLecture: verification.entree.problemes },
        },
      };
    })
  );
  resultats.forEach((r, i) => {
    if (r.status === 'fulfilled') recaps[r.value.cle] = r.value.recap;
    else echecs.push(`${aFaire[i].cle} : ${r.reason?.message ?? r.reason}`);
  });

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modele: MODELE,
        genereParIA: true,
        avertissement:
          "Récapitulatifs rédigés automatiquement à partir de l'objet, du résumé et des résolutions des dossiers de chaque projet, " +
          'puis vérifiés automatiquement (numéros et nombres contre les dossiers cités, contre-lecture). Ce qui ne passe pas est retiré. ' +
          'En cas d\'écart, les documents officiels font foi.',
        recaps,
      },
      null,
      1
    ),
    'utf8'
  );
  const cout = (entree / 1e6) * TARIF.entree + (sortie / 1e6) * TARIF.sortie;
  for (const { cle } of aFaire) {
    const r = recaps[cle];
    if (!r || r.signature !== aFaire.find((p) => p.cle === cle).signature) continue;
    const v = r.verification;
    console.log(`  ${cle.padEnd(28)} ${r.etapes.length} étape(s), ${r.aSurveiller.length} à surveiller · retirés : ${v.retiresMecanique.length} mécanique, ${v.retiresContreLecture.length} contre-lecture${r.utilisable ? '' : ' · INUTILISABLE'}`);
  }
  console.log(`  coût ≈ ${cout.toFixed(2)} $ US`);
  for (const e of echecs) console.warn(`⚠ ${e}`);
  if (echecs.length === aFaire.length) process.exitCode = 1;
  return recaps;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rediger({ seulement: args.get('projet') ?? null, force: args.has('force') });
}
