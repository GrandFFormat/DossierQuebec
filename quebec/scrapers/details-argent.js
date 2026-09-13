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

// ---------- VÉRIFICATION ----------
// Personne ne relit l'infolettre avant l'envoi. La garantie « rien d'inventé » doit donc venir
// du script, en deux temps, et ce qui ne passe pas est RETIRÉ plutôt que publié :
//
//   1. Contrôle mécanique, sans IA : chaque nombre écrit dans un champ doit exister tel quel
//      dans le texte du document, et chaque nom propre d'un bénéficiaire, d'un payeur ou d'un
//      soumissionnaire aussi. Un chiffre recalculé, un nom déformé : le champ tombe.
//   2. Contre-lecture : un second appel reçoit le document et les champs, et signale ce qui est
//      mal attribué — le piège que le contrôle mécanique ne voit pas, parce que les chiffres
//      existent bien dans le texte (une estimation prise pour une médiane, un total annuel pris
//      pour un total sur cinq ans). Les champs signalés tombent.
//
// Un détail sans `verification.version === VERSION_VERIFICATION` n'est jamais utilisé.
export const VERSION_VERIFICATION = 2;

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const compacter = (s) => sansAccents(String(s)).toLowerCase().replace(/[\s  ]/g, '');
const nombresDe = (s) =>
  (String(s).match(/\d[\d   ]*(?:[,.]\d+)?/g) ?? [])
    .map((t) => t.replace(/[\s  ]/g, '').replace(/[.,]$/, '').replace('.', ','))
    .filter(Boolean);
const nomsPropresDe = (s) => (String(s).match(/[A-ZÀ-Ý][\p{L}'’-]{3,}/gu) ?? []).map((m) => compacter(m).replace(/[’']/g, ''));

function controleMecanique(detail, texte) {
  const tc = compacter(texte);
  const tcNoms = tc.replace(/[’']/g, '');
  const nombresOk = (v) => v == null || nombresDe(v).every((n) => tc.includes(n));
  const nomsOk = (v) => v == null || nomsPropresDe(v).every((n) => tcNoms.includes(n));
  const retires = [];
  const d = structuredClone(detail);

  for (const champ of ['montantPrincipal', 'enUnePhrase', 'duree', 'renouvellements', 'modeAttribution', 'estimationVille', 'ecartEstimation', 'sourceFinancement', 'beneficiaireVille']) {
    if (!nombresOk(d[champ])) { retires.push({ champ, raison: 'nombre absent du document' }); d[champ] = null; }
  }
  for (const champ of ['beneficiaire', 'payeur']) {
    if (!nombresOk(d[champ]) || !nomsOk(d[champ])) { retires.push({ champ, raison: 'nom ou nombre absent du document' }); d[champ] = null; }
  }
  d.soumissions = d.soumissions.filter((s, i) => {
    if (!nomsOk(s.entreprise)) { retires.push({ champ: `soumissions[${i}]`, raison: 'entreprise absente du document' }); return false; }
    if (!nombresOk(s.prix)) { retires.push({ champ: `soumissions[${i}].prix`, raison: 'prix absent du document' }); s.prix = null; }
    return true;
  });
  d.repartitionAnnuelle = d.repartitionAnnuelle.filter((r, i) => {
    const ok = nombresOk(r.annee) && nombresOk(r.montant);
    if (!ok) retires.push({ champ: `repartitionAnnuelle[${i}]`, raison: 'nombre absent du document' });
    return ok;
  });
  for (const champ of ['conditions', 'changementsNotables']) {
    d[champ] = d[champ].filter((c, i) => {
      const ok = nombresOk(c);
      if (!ok) retires.push({ champ: `${champ}[${i}]`, raison: 'nombre absent du document' });
      return ok;
    });
  }
  d.chiffresCles = d.chiffresCles.filter((c, i) => {
    const ok = nombresOk(c.valeur) && nombresOk(c.libelle);
    if (!ok) retires.push({ champ: `chiffresCles[${i}]`, raison: 'nombre absent du document' });
    return ok;
  });
  // Une enUnePhrase qui tombe laisse la fiche sans phrase : le détail entier n'est plus sûr.
  return { detail: d, retires, utilisable: Boolean(d.enUnePhrase) };
}

const CONSIGNE_VERIFICATION = `Tu contre-vérifies des champs extraits d'un sommaire décisionnel de la Ville de Québec.
Ils seront publiés dans une infolettre SANS relecture humaine : chaque erreur que tu laisses
passer sera lue par des citoyens comme un fait.

Pour chaque champ, relis le document et demande-toi : est-ce que le document dit exactement
ça, pour cette chose-là ? Signale un champ quand :
- la valeur n'est pas dans le document, ou le document dit autre chose ;
- la valeur existe mais est attribuée au mauvais libellé (estimation et médiane inversées,
  montant annuel présenté comme un total, lot 1 et lot 2 mélangés, taxes incluses ou non) ;
- une soumission est dite retenue alors qu'elle ne l'est pas, ou l'inverse ;
- un changement notable ou une condition déforme le document ;
- typeMontant ne correspond pas à la nature réelle du montant (dépense, subvention accordée,
  argent reçu, valeur au rôle, investissement privé…).

Les tableaux d'annexe sont aplatis : les valeurs arrivent avant leurs libellés. Refais
l'attribution toi-même et vérifie la cohérence avant de juger.

Ne signale pas le style ni les reformulations fidèles. Désigne chaque champ par son nom exact
(« estimationVille », « soumissions[1].prix », « conditions[0] », « chiffresCles[2] »).
Appelle l'outil verifier_details une seule fois ; liste vide si tout est exact.`;

const OUTIL_VERIFICATION = {
  name: 'verifier_details',
  description: 'Enregistre les champs inexacts ou mal attribués.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      problemes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { champ: { type: 'string' }, raison: { type: 'string' } },
          required: ['champ', 'raison'],
          additionalProperties: false,
        },
      },
      typeMontantExact: { type: 'boolean' },
    },
    required: ['problemes', 'typeMontantExact'],
    additionalProperties: false,
  },
};

// Retire d'un détail les champs désignés par la contre-lecture.
function retirerChamps(detail, problemes) {
  const d = structuredClone(detail);
  const aRetirer = new Map(); // tableau → indices à retirer
  for (const { champ } of problemes) {
    const m = champ.match(/^(\w+)(?:\[(\d+)\](?:\.(\w+))?)?$/);
    if (!m || !(m[1] in d)) continue;
    const [, nom, index, sousChamp] = m;
    if (index == null) {
      d[nom] = Array.isArray(d[nom]) ? [] : null;
    } else if (sousChamp && sousChamp !== 'entreprise' && d[nom][index]) {
      d[nom][index][sousChamp] = null;
    } else {
      if (!aRetirer.has(nom)) aRetirer.set(nom, new Set());
      aRetirer.get(nom).add(Number(index));
    }
  }
  for (const [nom, indices] of aRetirer) d[nom] = d[nom].filter((_, i) => !indices.has(i));
  return d;
}

export async function chargerDetails() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { generatedAt: null, modele: MODELE, genereParIA: true, details: [] };
  }
}

// Un appel en streaming : à effort maximal la réflexion peut être longue, et la réponse
// complète ne doit pas se heurter au délai d'une requête simple.
async function appeler(client, { system, outil, effort, texte }) {
  const flux = client.beta.messages.stream({
    model: MODELE,
    max_tokens: 64000,
    // Repli côté serveur si le modèle décline : il n'y a rien de sensible dans un sommaire
    // décisionnel, mais un refus ne doit pas faire tomber l'infolettre.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    tools: [outil],
    // Pas d'appel forcé : un outil imposé désactive la réflexion, et c'est justement elle qui
    // permet de relire un tableau d'annexe aplati sans inverser une estimation et une médiane
    // (erreur observée sur AP2026-271). Le schéma strict garantit les champs.
    thinking: { type: 'adaptive' },
    output_config: { effort },
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: texte }],
  });
  const message = await flux.finalMessage();
  if (message.stop_reason === 'refusal') throw new Error('refus du modèle');
  const bloc = message.content.find((b) => b.type === 'tool_use' && b.name === outil.name);
  if (!bloc) throw new Error(`le modèle n'a pas appelé ${outil.name} (${message.stop_reason})`);
  return { entree: decoder(bloc.input), usage: message.usage, modele: message.model };
}

// numeros : ['AP2026-271', …]. Renvoie la Map id → détail, cache compris.
export async function extraireDetails(numeros, { concurrence = 3, force = false } = {}) {
  const cache = await chargerDetails();
  const parId = new Map(cache.details.map((d) => [d.id, d]));
  if (force) for (const n of numeros) parId.delete(n + '.pdf');
  // Un détail d'une version antérieure de la vérification est refait.
  const aFaire = [...new Set(numeros)].filter((n) => parId.get(n + '.pdf')?.verification?.version !== VERSION_VERIFICATION);
  if (!aFaire.length) return parId;

  console.log(`Détail de l'argent : ${aFaire.length} document(s) à lire (${parId.size} en cache).`);
  const docs = [];
  for await (const row of textesParNumero(aFaire, { select: 'Numero,Date,metadata_storage_name,content', lot: 5 })) {
    if (aFaire.includes(row.Numero) && row.metadata_storage_name === row.Numero + '.pdf') {
      docs.push({ id: row.metadata_storage_name, numero: row.Numero, date: row.Date, texte: preparerTexte(row.content), texteIntegral: row.content ?? '' });
    }
  }

  // Le montant du résumé en langage clair sert de titre dans l'infolettre (il donne souvent la
  // dépense nette, là où le détail énumère des lots) : on vérifie aussi qu'il existe dans le texte.
  let montantsResumes = new Map();
  try {
    const r = JSON.parse(await readFile(new URL('../data/resumes.json', import.meta.url), 'utf8'));
    montantsResumes = new Map(r.resumes.map((x) => [x.id, x.montantPrincipal]));
  } catch {}

  const client = new Anthropic();
  let entree = 0;
  let sortie = 0;
  const echecs = [];
  for (let i = 0; i < docs.length; i += concurrence) {
    const lot = docs.slice(i, i + concurrence);
    const resultats = await Promise.allSettled(
      lot.map(async (doc) => {
        const document = `Sommaire décisionnel ${doc.numero}\n\n--- texte du document ---\n${doc.texte}`;
        // 1. Extraction, à effort maximal : personne ne relira.
        const extraction = await appeler(client, { system: CONSIGNE, outil: OUTIL, effort: 'max', texte: document });
        entree += extraction.usage.input_tokens;
        sortie += extraction.usage.output_tokens;
        // 2. Contrôle mécanique contre le texte (on vérifie sur le texte intégral, pas l'extrait).
        const mecanique = controleMecanique(extraction.entree, doc.texteIntegral);
        // 3. Contre-lecture des champs qui restent.
        const verification = await appeler(client, {
          system: CONSIGNE_VERIFICATION,
          outil: OUTIL_VERIFICATION,
          effort: 'high',
          texte: `${document}\n\n--- champs extraits à vérifier ---\n${JSON.stringify(mecanique.detail, null, 1)}`,
        });
        entree += verification.usage.input_tokens;
        sortie += verification.usage.output_tokens;
        let final = retirerChamps(mecanique.detail, verification.entree.problemes);
        if (!verification.entree.typeMontantExact) final.typeMontant = 'autre';
        const utilisable = mecanique.utilisable && Boolean(final.enUnePhrase);
        const montantResume = montantsResumes.get(doc.id) ?? null;
        const tc = compacter(doc.texteIntegral);
        const montantResumeVerifie = Boolean(montantResume) && nombresDe(montantResume).length > 0 && nombresDe(montantResume).every((n) => tc.includes(n));
        return {
          id: doc.id,
          numero: doc.numero,
          date: doc.date,
          ...final,
          modele: extraction.modele,
          genereLe: new Date().toISOString(),
          verification: {
            version: VERSION_VERIFICATION,
            utilisable,
            montantResume: montantResumeVerifie ? montantResume : null,
            retiresMecanique: mecanique.retires,
            retiresContreLecture: verification.entree.problemes,
            typeMontantCorrige: !verification.entree.typeMontantExact,
          },
        };
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
          "Champs extraits automatiquement du texte des sommaires décisionnels, sans ajout ni jugement, puis vérifiés " +
          'automatiquement (nombres et noms contre le texte, contre-lecture). Ce qui ne passe pas est retiré. ' +
          'Ce que le document ne dit pas vaut null. En cas d\'écart, le PDF officiel fait foi.',
        nombre: parId.size,
        details: [...parId.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`Détail extrait et vérifié pour ${docs.length - echecs.length} document(s) — coût ≈ ${cout.toFixed(2)} $ US.`);
  const nouveaux = [...parId.values()].filter((d) => aFaire.includes(d.numero) && d.verification?.version === VERSION_VERIFICATION);
  const retires = nouveaux.reduce((n, d) => n + d.verification.retiresMecanique.length + d.verification.retiresContreLecture.length, 0);
  console.log(`  champs retirés par la vérification : ${retires} · types corrigés : ${nouveaux.filter((d) => d.verification.typeMontantCorrige).length} · fiches inutilisables : ${nouveaux.filter((d) => !d.verification.utilisable).length}`);
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
