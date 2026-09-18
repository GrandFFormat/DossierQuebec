// « Où en est le projet » — un récapitulatif par sujet suivable (lib/projets.js), pour la
// page « Mes dossiers ».
//
//   node --env-file=api.env scrapers/recaps-projets.js                    les sujets qui ont bougé
//   node --env-file=api.env scrapers/recaps-projets.js --projet=namur-hippodrome --force
//
// Copié de quebec/scrapers/recaps-projets.js. Trois matières nourrissent le modèle, dans cet
// ordre : le RÉSUMÉ DU SOMMAIRE DÉCISIONNEL quand le conseil annexe ce sommaire à son ordre du
// jour — trouvé le 18 septembre 2026, c'est là que vivent le contexte et les options écartées —,
// puis le DISPOSITIF de la résolution (« Et résolu : … », les montants, les parties, les durées)
// et ses MOTIFS (« Vu… », « Attendu que… »), lus dans le procès-verbal. Trois conseils
// d'arrondissement n'annexent pas leurs sommaires (Saint-Laurent, Ahuntsic-Cartierville,
// Pierrefonds-Roxboro) : pour eux il ne reste que les deux derniers, et c'est déjà de quoi dire
// ce que la Ville a fait, quand, pour combien, et par quelles instances c'est passé.
//
// Un dossier, ici, c'est un numéro de dossier décisionnel et les résolutions qui le portent,
// du comité exécutif au conseil municipal puis à l'agglomération. Le même dispositif se
// répète souvent à chaque étape : on garde le plus complet, une fois.
//
// Personne ne relit avant publication. Même garantie qu'à Québec : un contrôle mécanique —
// chaque numéro cité doit appartenir au projet, chaque nombre écrit doit exister dans les
// sources des dossiers cités — puis une contre-lecture par un second appel. Ce qui ne passe
// pas est retiré.
//
// Un sujet n'est refait que si ses dossiers ou leurs textes ont changé (signature) : les jours
// sans nouveauté ne coûtent rien.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PROJETS } from '../lib/projets.js';
import { MODELE, TARIF, appeler, compacter, nombresDe } from '../lib/modele.js';

const OUT = new URL('../data/projets-recaps.json', import.meta.url);
const VERSION = 2; // changer pour tout refaire après une modification des consignes
const MIN_DOSSIERS = 3; // en deçà, la liste se lit très bien seule

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]} ${a}`;
};
const instanceCourte = (i) => String(i ?? '').replace(/^Conseil d'arrondissement (?:de |du |des )/, 'arrondissement ');

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

// ---------- les sources d'un sujet ----------
// Une entrée par dossier décisionnel ; une résolution sans numéro de dossier est un dossier
// à elle seule.
function dossiersDuProjet(decisions, textes, resumes, cle) {
  const groupes = new Map();
  for (const d of decisions) {
    if (d.type !== 'Résolution' || !d.projets?.includes(cle)) continue;
    const k = d.dossier ?? d.id;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }
  return [...groupes.entries()]
    .map(([k, docs]) => {
      docs.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      const principal = docs.at(-1);
      // Le dispositif le plus complet parmi les étapes, et les motifs les plus complets.
      const dispositif = docs.map((d) => textes[d.id]?.dispositif).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? null;
      const motifs = docs.map((d) => textes[d.id]?.motifs).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? null;
      // Le résumé du sommaire décisionnel, quand le conseil l'annexe à son ordre du jour : c'est
      // le « pourquoi » que le procès-verbal ne dit pas. Indexé par numéro de dossier.
      const sommaire = docs.map((d) => (d.sommaireId ? resumes.get(d.sommaireId) : null)).find((r) => r?.source === 'sommaire' && r.puces?.length) ?? null;
      const texte = [
        `[${principal.numero}] dossier ${d10(k) ? k : 'sans numéro'} — ${docs.length > 1 ? `${docs.length} résolutions, du ${dateLongue(docs[0].date)} au ${dateLongue(principal.date)}` : `résolution du ${dateLongue(principal.date)}`}${principal.resultat ? ` — ${principal.resultat}` : ''}`,
        `Objet : ${principal.objet ?? ''}`,
        sommaire ? `Sommaire décisionnel (résumé) : ${sommaire.puces.map((x) => `- ${x}`).join('\n')}` : null,
        dispositif ? `Décidé : ${dispositif}` : null,
        motifs ? `Motifs : ${motifs}` : null,
        `Instances : ${docs.map((r) => `${r.numero} (${instanceCourte(r.instance)}, ${dateLongue(r.date)})`).join(' ; ')}`,
      ]
        .filter(Boolean)
        .join('\n');
      return {
        k,
        date: principal.date,
        numeros: [...new Set(docs.map((d) => d.numero).filter(Boolean))],
        signature: `${k}|${docs.map((r) => r.numero).join(',')}|${dispositif ? compacter(dispositif).length : 0}|${motifs ? compacter(motifs).length : 0}|${sommaire ? compacter(sommaire.puces.join(' ')).length : 0}`,
        texte,
      };
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}
const d10 = (k) => /^\d{10}$/.test(String(k));

// ---------- rédaction ----------
const CONSIGNE = `Tu rédiges, pour des citoyens qui suivent un grand sujet de la Ville de Montréal, le
récapitulatif « Où en est le projet », à partir de la liste de ses dossiers de l'année. Pour chaque
dossier tu as l'objet de la résolution, ce qui a été décidé (le dispositif, tel que le procès-verbal
l'écrit), parfois les motifs, et les instances qui l'ont adopté. Ton lecteur n'a pas le temps de
lire la liste : il veut comprendre en une minute ce que la Ville a fait.

Règles absolues :
1. N'invente rien. Chaque affirmation doit venir des dossiers fournis. Pas de contexte tiré de ta
   connaissance générale (ni coûts globaux, ni échéancier, ni historique du projet).
2. Aucun total, aucune somme, aucun décompte (« 12 contrats », « plus de 40 millions ») : les
   nombres affichés à côté de ton texte sont calculés ailleurs. Tu peux citer un montant, une
   superficie ou une date tels qu'ils sont écrits dans UN dossier, en citant ce dossier.
3. Aucun jugement ni adjectif d'appréciation : ni « important », « enfin », « retard »,
   « controversé », « majeur ». Des faits.
4. Aucun nom de personne.
5. Français simple, phrases courtes, voix active. Pas de jargon administratif : « acheter un
   terrain » plutôt que « acquisition de gré à gré d'une partie de lot ».
6. Ce volet ne connaît pas l'état d'avancement des dossiers : ne dis jamais qu'une chose est
   « en attente », « à venir » ou « prévue » sauf si une date future est écrite dans un dossier.

Les champs :
- enBref : deux ou trois phrases sur ce que la Ville fait dans ce sujet cette année.
- etapes : de trois à six grands mouvements, du plus ancien au plus récent. Regroupe les dossiers
  de même nature (« Contrats de réfection des conduites ») plutôt que de les énumérer.
  periode : la période couverte, en mois (« Février à juillet 2026 », « Juillet 2026 »).
  titre : trois à huit mots. texte : une ou deux phrases. numeros : les numéros, tels qu'écrits
  entre crochets ou dans « Instances », des dossiers qui fondent l'étape (au plus six).
- aSurveiller : UNIQUEMENT une date future écrite dans un dossier ; liste vide sinon.

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

const CONSIGNE_VERIFICATION = `Tu contre-vérifies le récapitulatif d'un sujet de la Ville de Montréal, rédigé à partir de
la liste de ses dossiers. Il sera publié SANS relecture humaine : chaque erreur que tu laisses
passer sera lue par des citoyens comme un fait.

Pour chaque élément, relis les dossiers qu'il cite et signale-le quand :
- il affirme quelque chose que ces dossiers ne disent pas, ou le déforme ;
- il attribue un fait, un montant, un lieu ou une date au mauvais dossier ;
- il contient un total, un décompte ou une estimation que les dossiers ne donnent pas ;
- il porte un jugement ou nomme une personne ;
- il annonce une suite (« en attente », « prévu ») qu'aucune date écrite ne fonde.

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

// Chaque numéro cité appartient au sujet ; chaque nombre écrit existe dans les dossiers cités
// (ou, pour enBref qui n'en cite pas, dans l'un des dossiers du sujet).
function controleMecanique(recap, dossiers) {
  const sourceDe = new Map();
  for (const d of dossiers) for (const n of d.numeros) sourceDe.set(n, d);
  const tout = compacter(dossiers.map((d) => d.texte).join('\n'));
  const retires = [];
  const verifierItem = (item, nom, champs) => {
    const cites = [...new Set(item.numeros.map((n) => n.trim()))];
    const inconnus = cites.filter((n) => !sourceDe.has(n));
    if (!cites.length || inconnus.length) {
      retires.push({ element: nom, raison: inconnus.length ? `numéro hors du sujet : ${inconnus.join(', ')}` : 'aucun numéro cité' });
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
  r.etapes = r.etapes.map((e, i) => {
    if (e && !nombresDe(e.periode).every((n) => tout.includes(n))) {
      retires.push({ element: `etapes[${i}]`, raison: 'période hors des dates du sujet' });
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
  const [{ decisions = [], projets: resumeProjets = {} }, { textes = {} }, { resumes: listeResumes = [] }, existant] = await Promise.all([
    lireJson(new URL('../data/decisions.json', import.meta.url), {}),
    lireJson(new URL('../data/textes.json', import.meta.url), {}),
    lireJson(new URL('../data/resumes.json', import.meta.url), { resumes: [] }),
    lireJson(OUT, { recaps: {} }),
  ]);
  const resumes = new Map(listeResumes.map((r) => [r.id, r]));
  const recaps = existant.recaps ?? {};
  const client = new Anthropic();
  let entree = 0;
  let sortie = 0;
  const echecs = [];

  const aFaire = [];
  for (const cle of Object.keys(PROJETS)) {
    if (seulement && cle !== seulement) continue;
    const dossiers = dossiersDuProjet(decisions, textes, resumes, cle);
    const signature = createHash('sha256').update(`${VERSION}\n${dossiers.map((d) => d.signature).join('\n')}`).digest('hex').slice(0, 16);
    if (dossiers.length < MIN_DOSSIERS) {
      delete recaps[cle];
      continue;
    }
    if (!force && recaps[cle]?.signature === signature) continue;
    aFaire.push({ cle, dossiers, signature });
  }
  if (!aFaire.length) {
    console.log('Récapitulatifs des sujets : rien de nouveau.');
    return recaps;
  }
  console.log(`Récapitulatifs des sujets : ${aFaire.map((p) => `${p.cle} (${p.dossiers.length} dossiers)`).join(', ')}`);

  const resultats = await Promise.allSettled(
    aFaire.map(async ({ cle, dossiers, signature }) => {
      const titre = resumeProjets[cle]?.titre ?? PROJETS[cle].titre;
      const document = `Sujet : ${titre}\n${PROJETS[cle].description}\n\nDossiers de l'année, du plus ancien au plus récent :\n\n${dossiers.map((d) => d.texte).join('\n\n')}`;
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
          // Ce que Mes dossiers écrit sous le récapitulatif : d'où il vient, et ce qui lui
          // manque par rapport à ceux des autres villes.
          source: `Rédigé automatiquement à partir des ${dossiers.length} dossiers du sujet : leur sommaire décisionnel quand le conseil l'annexe à son ordre du jour, et le texte décidé et les motifs lus dans les procès-verbaux. Puis vérifié automatiquement : ce qui ne se vérifiait pas a été retiré. Les documents officiels font foi.`,
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
          "Récapitulatifs rédigés automatiquement à partir de l'objet, du dispositif et des motifs des résolutions de chaque sujet, lus dans les procès-verbaux, " +
          'puis vérifiés automatiquement (numéros et nombres contre les dossiers cités, contre-lecture). Ce qui ne passe pas est retiré. ' +
          "En cas d'écart, les documents officiels font foi.",
        recaps,
      },
      null,
      1
    ),
    'utf8'
  );
  const cout = (entree / 1e6) * TARIF.entree + (sortie / 1e6) * TARIF.sortie;
  for (const { cle, signature } of aFaire) {
    const r = recaps[cle];
    if (!r || r.signature !== signature) continue;
    const v = r.verification;
    console.log(`  ${cle.padEnd(24)} ${r.etapes.length} étape(s), ${r.aSurveiller.length} à surveiller · retirés : ${v.retiresMecanique.length} mécanique, ${v.retiresContreLecture.length} contre-lecture${r.utilisable ? '' : ' · INUTILISABLE'}`);
  }
  console.log(`  coût ≈ ${cout.toFixed(2)} $ US`);
  for (const e of echecs) console.warn(`⚠ ${e}`);
  if (echecs.length === aFaire.length) process.exitCode = 1;
  return recaps;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rediger({ seulement: args.get('projet') ?? null, force: args.has('force') });
}
