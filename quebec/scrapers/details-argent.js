// Le détail de l'argent, extrait des sommaires décisionnels — pour l'infolettre.
//
//   node --env-file=../api.env scrapers/details-argent.js --ids=AP2026-271,DE2026-256
//
// Le résumé en langage clair dit de quoi il s'agit en quelques puces. Ici on va chercher,
// dans le même document, ce que le lecteur ne trouverait qu'en fouillant le PDF : qui reçoit
// l'argent, de quelle nature est le montant (une dépense, un plafond de subvention, une valeur
// au rôle d'évaluation…), les soumissions reçues et l'estimation de la Ville, la répartition
// par année, la source du financement, les conditions, ce qui change par rapport à avant.
//
// Les champs sont structurés (outil en schéma strict) pour que l'infolettre les présente
// toujours de la même façon, et pour qu'elle ne puisse jamais additionner une valeur au rôle
// avec une dépense. Même règle que partout : ce que le document ne dit pas vaut null.
//
// Mis en cache dans data/details.json : un document n'est jamais payé deux fois.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { textesParNumero } from '../lib/textes.js';

const OUT = new URL('../data/details.json', import.meta.url);
export const MODELE = 'claude-opus-5';
const TARIF = { entree: 5, sortie: 25 }; // $ US par million de jetons, claude-opus-5

// Les annexes utiles (analyse des soumissions, répartition budgétaire) sont souvent en fin de
// document, et le cœur de l'entente au début. Au-delà de 40 000 caractères, on garde le début
// et la fin et on le dit au modèle — les documents de 150 000 caractères sont des ententes
// dont le milieu énumère des lots cadastraux.
const MAX_DEBUT = 30000;
const MAX_FIN = 10000;

export const TYPES_MONTANT = {
  depense: 'dépense',
  plafond_subvention: 'subvention maximale',
  subvention_recue: 'reçu par la Ville',
  pret: 'prêt',
  valeur_au_role: 'valeur au rôle d\'évaluation',
  revenu: 'revenu pour la Ville',
  investissement_prive: 'investissement privé',
  fermeture_emprunt: 'fermeture d\'emprunts',
  autre: 'montant',
  aucun: 'aucun montant',
};

const CONSIGNE = `Tu extrais, d'un sommaire décisionnel de la Ville de Québec, le détail de l'argent
en jeu, pour une infolettre citoyenne. Ton lecteur n'ouvrira pas le PDF : tout ce qui l'aide
à comprendre qui reçoit quoi, pour quoi, combien, jusqu'à quand et d'où vient l'argent doit
être dans tes champs.

Règles absolues :
1. N'invente rien. Chaque valeur doit être dans le texte. Ce qui n'y est pas vaut null (ou un
   tableau vide). Pas de calcul, pas de total que le document ne donne pas, pas de contexte
   tiré de ta connaissance générale.
2. Recopie les montants, dates et noms exactement comme ils sont écrits (« 6 100 500 $ »,
   « 1er novembre 2026 », « Hamel Construction inc. »).
3. Aucun jugement : ni « important », ni « avantageux », ni « coûteux ». Des faits.
4. Français simple, phrases courtes, voix active.

Sur typeMontant, lis bien le document :
- depense : la Ville paie (contrat, achat, acquisition, versement).
- plafond_subvention : la Ville accorde une subvention ou une aide « maximale ».
- subvention_recue : la Ville reçoit de l'argent d'un gouvernement ou d'un organisme.
- pret : la Ville prête ou garantit.
- valeur_au_role : le montant cité est la valeur au rôle d'évaluation d'une propriété, pas un
  prix (fréquent dans les acquisitions de gré à gré ou par expropriation).
- revenu : la Ville vend ou encaisse.
- investissement_prive : le montant est investi par un promoteur ou une entreprise, pas par la Ville.
- fermeture_emprunt : fermeture de règlements d'emprunt, annulation de soldes.
- autre ou aucun sinon.

soumissions : seulement si le document ou son annexe les liste, une ligne par entreprise.
repartitionAnnuelle : seulement si le document répartit la somme par année.
changementsNotables : ce qui change par rapport à une entente, un contrat ou une décision
antérieure, tel que le document le dit (un montant qui passe de X à Y, une clause abrogée,
un élément abandonné). Tableau vide s'il n'y en a pas.
chiffresCles : les autres chiffres concrets utiles (superficie, nombre de logements, de
kilomètres, de places, d'arbres…), au plus six. Pas de numéros administratifs (demandes
d'achat, clés budgétaires, codes de classification).

Attention aux tableaux d'annexe (analyse des soumissions, répartitions) : l'extraction du PDF
les aplatit, et les valeurs arrivent souvent AVANT leurs libellés, dans l'ordre des lignes du
tableau. Avant de remplir estimationVille ou ecartEstimation, attribue chaque valeur à son
libellé et vérifie que l'ensemble se tient : la médiane de deux soumissions est leur moyenne,
un total sur cinq ans vaut cinq fois le montant annuel, un écart en pour cent correspond aux
deux montants qu'il compare. Si tu ne peux pas attribuer les valeurs sans ambiguïté, mets null
plutôt que de risquer une inversion.

Appelle l'outil details_argent une seule fois, avec tous les champs.`;

const NUL = (type) => ({ type: [type, 'null'] });

const OUTIL = {
  name: 'details_argent',
  description: "Enregistre le détail de l'argent en jeu dans un sommaire décisionnel.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      typeMontant: { type: 'string', enum: Object.keys(TYPES_MONTANT) },
      montantPrincipal: { ...NUL('string'), description: "La somme au cœur de la décision, recopiée telle qu'écrite." },
      enUnePhrase: { type: 'string', description: 'Ce que la décision fait avec cet argent, en une phrase simple.' },
      beneficiaire: { ...NUL('string'), description: "Qui reçoit l'argent ou le contrat." },
      beneficiaireVille: { ...NUL('string'), description: 'Sa ville ou son adresse, si le document la donne.' },
      payeur: { ...NUL('string'), description: "Qui paie (la Ville, un ministère, l'agglomération…)." },
      duree: { ...NUL('string'), description: 'Période couverte, de telle date à telle date.' },
      renouvellements: { ...NUL('string'), description: 'Options de renouvellement ou de prolongation.' },
      modeAttribution: { ...NUL('string'), description: "Appel d'offres public (numéro), gré à gré, programme et volet de subvention…" },
      soumissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entreprise: { type: 'string' },
            ville: NUL('string'),
            prix: { ...NUL('string'), description: 'Tel qu\'écrit, en précisant « par année » ou « total » si le document le dit.' },
            conforme: NUL('boolean'),
            retenue: { type: 'boolean' },
          },
          required: ['entreprise', 'ville', 'prix', 'conforme', 'retenue'],
          additionalProperties: false,
        },
      },
      estimationVille: { ...NUL('string'), description: "L'estimation du service demandeur, si elle est donnée." },
      ecartEstimation: { ...NUL('string'), description: "L'écart entre l'estimation et le prix retenu, tel qu'écrit." },
      repartitionAnnuelle: {
        type: 'array',
        items: {
          type: 'object',
          properties: { annee: { type: 'string' }, montant: { type: 'string' } },
          required: ['annee', 'montant'],
          additionalProperties: false,
        },
      },
      sourceFinancement: { ...NUL('string'), description: "D'où vient l'argent : budget de fonctionnement de tel service, règlement d'emprunt, programme…" },
      conditions: { type: 'array', items: { type: 'string' }, description: 'Conditions et obligations principales, au plus quatre.' },
      changementsNotables: { type: 'array', items: { type: 'string' } },
      chiffresCles: {
        type: 'array',
        items: {
          type: 'object',
          properties: { libelle: { type: 'string' }, valeur: { type: 'string' } },
          required: ['libelle', 'valeur'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'typeMontant', 'montantPrincipal', 'enUnePhrase', 'beneficiaire', 'beneficiaireVille', 'payeur', 'duree',
      'renouvellements', 'modeAttribution', 'soumissions', 'estimationVille', 'ecartEstimation',
      'repartitionAnnuelle', 'sourceFinancement', 'conditions', 'changementsNotables', 'chiffresCles',
    ],
    additionalProperties: false,
  },
};

function preparerTexte(contenu) {
  const t = (contenu ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= MAX_DEBUT + MAX_FIN) return t;
  return t.slice(0, MAX_DEBUT) + '\n\n[… partie centrale du document omise pour la longueur …]\n\n' + t.slice(-MAX_FIN);
}

// Même dérive que pour les résumés : le modèle glisse parfois des \uXXXX littéraux.
function decoder(v) {
  if (typeof v === 'string') return v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (Array.isArray(v)) return v.map(decoder);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decoder(x)]));
  return v;
}

export async function chargerDetails() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { generatedAt: null, modele: MODELE, genereParIA: true, details: [] };
  }
}

// numeros : ['AP2026-271', …]. Renvoie la Map id → détail, cache compris.
export async function extraireDetails(numeros, { concurrence = 4, force = false } = {}) {
  const cache = await chargerDetails();
  const parId = new Map(cache.details.map((d) => [d.id, d]));
  if (force) for (const n of numeros) parId.delete(n + '.pdf');
  const aFaire = [...new Set(numeros)].filter((n) => !parId.has(n + '.pdf'));
  if (!aFaire.length) return parId;

  console.log(`Détail de l'argent : ${aFaire.length} document(s) à lire (${parId.size} en cache).`);
  const docs = [];
  for await (const row of textesParNumero(aFaire, { select: 'Numero,Date,metadata_storage_name,content', lot: 5 })) {
    if (aFaire.includes(row.Numero) && row.metadata_storage_name === row.Numero + '.pdf') {
      docs.push({ id: row.metadata_storage_name, numero: row.Numero, date: row.Date, texte: preparerTexte(row.content) });
    }
  }

  const client = new Anthropic();
  let entree = 0;
  let sortie = 0;
  const echecs = [];
  for (let i = 0; i < docs.length; i += concurrence) {
    const lot = docs.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(
      lot.map(async (doc) => {
        const message = await client.beta.messages.create({
          model: MODELE,
          max_tokens: 16000,
          // Repli côté serveur si le modèle décline : il n'y a rien de sensible dans un sommaire
          // décisionnel, mais un refus ne doit pas faire tomber l'infolettre.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: CONSIGNE,
          tools: [OUTIL],
          // Pas d'appel forcé : un outil imposé désactive la réflexion, et c'est justement elle
          // qui permet de relire un tableau d'annexe aplati sans inverser une estimation et une
          // médiane (erreur observée sur AP2026-271). Le schéma strict garantit les champs ;
          // la consigne demande l'appel.
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          tool_choice: { type: 'auto' },
          messages: [{ role: 'user', content: `Sommaire décisionnel ${doc.numero}\n\n--- texte du document ---\n${doc.texte}` }],
        });
        if (message.stop_reason === 'refusal') throw new Error('refus du modèle');
        const bloc = message.content.find((b) => b.type === 'tool_use' && b.name === OUTIL.name);
        if (!bloc) throw new Error("le modèle n'a pas rempli l'outil");
        entree += message.usage.input_tokens;
        sortie += message.usage.output_tokens;
        return { id: doc.id, numero: doc.numero, date: doc.date, ...decoder(bloc.input), modele: message.model, genereLe: new Date().toISOString() };
      })
    );
    resultats.forEach((r, j) => {
      if (r.status === 'fulfilled') parId.set(r.value.id, r.value);
      else echecs.push(`${lot[j].numero} : ${r.reason?.message ?? r.reason}`);
    });
    console.log(`  … ${Math.min(i + concurrence, docs.length)}/${docs.length}`);
  }

  const cout = (entree / 1e6) * TARIF.entree + (sortie / 1e6) * TARIF.sortie;
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modele: MODELE,
        genereParIA: true,
        avertissement:
          "Champs extraits automatiquement du texte des sommaires décisionnels, sans ajout ni jugement. " +
          'Ce que le document ne dit pas vaut null. En cas d\'écart, le PDF officiel fait foi.',
        nombre: parId.size,
        details: [...parId.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`Détail extrait pour ${docs.length - echecs.length} document(s) — coût ≈ ${cout.toFixed(2)} $ US.`);
  if (docs.length < aFaire.length) console.warn(`⚠ ${aFaire.length - docs.length} document(s) introuvable(s) par numéro.`);
  for (const e of echecs) console.warn(`⚠ ${e}`);
  return parId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = (process.argv.find((a) => a.startsWith('--ids=')) ?? '').slice(6).split(',').map((s) => s.replace(/\.pdf$/, '').trim()).filter(Boolean);
  if (!ids.length) {
    console.error('Usage : node --env-file=../api.env scrapers/details-argent.js --ids=AP2026-271,DE2026-256');
    process.exit(1);
  }
  const details = await extraireDetails(ids, { force: process.argv.includes('--force') });
  for (const id of ids) console.log(JSON.stringify(details.get(id + '.pdf') ?? { id, absent: true }, null, 1));
}
