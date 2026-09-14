// Résumés en langage clair des sommaires décisionnels.
//
//   npm run scrape:resumes -- --dry-run          estime le coût, n'appelle rien
//   npm run scrape:resumes -- --max=50           génère 50 résumés (synchrone)
//   npm run scrape:resumes -- --max=1500 --batch passe par l'API Batches (50 % moins cher)
//   npm run scrape:resumes -- --depuis=2026-07-13 --plafond=120
//                                   routine quotidienne : les sommaires récents sans résumé,
//                                   texte lu par lots (voir chargerSommairesDepuis)
//
// Le sommaire décisionnel est la note que l'administration municipale rédige avant chaque
// décision : exposé de la situation, décisions antérieures, analyse, recommandation. Le
// « pourquoi » y est déjà écrit — on ne fait que le rendre lisible en trois à sept puces.
//
// RÈGLES DU PROJET, appliquées ici :
//   - jamais de donnée inventée : le résumé ne porte que sur ce que le document dit ;
//   - jamais de jugement de valeur sur une décision ou sur une personne ;
//   - honnêteté sur les limites : si le document est purement procédural et n'a rien à
//     résumer, le modèle doit le dire plutôt que de meubler ;
//   - chaque résumé est marqué comme généré par IA, daté, avec le modèle utilisé, et
//     la fiche renvoie toujours au PDF officiel.

import Anthropic from '@anthropic-ai/sdk';
import { writeFile, readFile } from 'node:fs/promises';
import { searchAll, search, decode, encodeFieldValue, PDF_BASE } from '../lib/gpd.js';
import { textesParNumero, normaliserObjet } from '../lib/textes.js';

const OUT = new URL('../data/resumes.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);

// Tarifs $ US par million de jetons, pour l'estimation de coût.
const TARIFS = {
  'claude-opus-5': { entree: 5, sortie: 25 },
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-haiku-4-5': { entree: 1, sortie: 5 },
};
const MODELE_DEFAUT = 'claude-opus-5';

// Un sommaire dépasse rarement 12 000 caractères ; au-delà on tronque par la fin en le
// disant, plutôt que de payer pour des annexes répétitives.
const MAX_CARACTERES = 14000;

const CONSIGNE = `Tu résumes des sommaires décisionnels de la Ville de Québec pour un site
d'information citoyenne. Ton lecteur est une personne pressée qui n'a aucune formation en
administration municipale.

Écris de 3 à 7 puces courtes, en français simple, à la voix active. Chaque puce tient sur
une ou deux lignes.

Concentre-toi sur ce qui change concrètement pour du monde : les montants, les obligations,
les interdictions, les échéances, les secteurs ou quartiers touchés, ce que la Ville
s'engage à faire, avec qui elle contracte. Laisse tomber le vocabulaire de procédure
(« il est résolu que », les numéros de règlement seuls, les renvois d'articles) sauf quand
c'est le cœur de la décision.

Trois interdits absolus :
1. N'invente rien. Si une information n'est pas dans le texte, elle n'existe pas. Pas de
   contexte ajouté de ta connaissance générale, pas de chiffre déduit.
2. Aucun jugement. Ni « important », ni « ambitieux », ni « coûteux », ni « modeste ».
   Tu rapportes ce que le document dit, point. Pas d'opinion sur la décision, jamais rien
   sur les personnes.
3. Si le document est purement procédural et ne contient rien de substantiel à résumer
   (une simple prise d'acte, un dépôt de document, une correction de forme), mets
   sansContenuSubstantiel à true et explique en une seule puce ce que le document fait,
   sans meubler.

Pour montantPrincipal : s'il y a une somme d'argent au cœur de la décision, recopie-la
exactement comme elle est écrite dans le document (par exemple « 28 700 $ »). S'il n'y en a
pas, ou si tu hésites entre plusieurs, mets null.`;

const OUTIL = {
  name: 'resume_decision',
  description: "Enregistre le résumé en langage clair d'un sommaire décisionnel.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      puces: {
        type: 'array',
        description: 'De 3 à 7 puces courtes en français simple.',
        items: { type: 'string' },
      },
      sansContenuSubstantiel: {
        type: 'boolean',
        description: "true si le document est purement procédural et n'a rien de substantiel à résumer.",
      },
      montantPrincipal: {
        type: ['string', 'null'],
        description: "La somme au cœur de la décision, recopiée telle qu'écrite, ou null.",
      },
    },
    required: ['puces', 'sansContenuSubstantiel', 'montantPrincipal'],
    additionalProperties: false,
  },
};

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function requete(modele, texte, numero, objet) {
  return {
    model: modele,
    max_tokens: 2000,
    system: CONSIGNE,
    tools: [OUTIL],
    tool_choice: { type: 'tool', name: OUTIL.name },
    messages: [
      {
        role: 'user',
        content:
          `Sommaire décisionnel ${numero ?? ''}\nObjet : ${objet ?? '(non précisé)'}\n\n` +
          `--- texte du document ---\n${texte}`,
      },
    ],
  };
}

function preparerTexte(contenu) {
  const texte = (contenu ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (texte.length <= MAX_CARACTERES) return texte;
  return texte.slice(0, MAX_CARACTERES) + '\n\n[…document tronqué pour le résumé…]';
}

// Le modèle rend parfois les accents sous forme d'échappement JSON À L'INTÉRIEUR de la
// valeur de chaîne : on reçoit les six caractères d'une séquence é au lieu du seul
// « é ». Le décodage JSON ne les défait pas — pour lui, l'antislash fait partie du texte.
// C'est irrégulier, jusqu'à l'intérieur d'une même phrase, et ça a touché 102 des 1 500
// premiers résumés. Le même décodage existe dans scripts/reparer-echappements.js pour
// rattraper les données déjà écrites.
function decoderEchappements(valeur) {
  if (typeof valeur !== 'string') return valeur;
  return valeur
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Même dérive, sans l'antislash : « Quu00e9bec », « ru00e8gles » (vu sur 4 résumés sur 1 500).
    // Seulement les plages des accents latins et de la ponctuation typographique : aucun mot
    // français ne contient « u00e9 » ou « u2019 ».
    .replace(/u(00[89a-fA-F][0-9a-fA-F]|20[0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .split('\\n')
    .join('\n')
    .split('\\"')
    .join('"');
}

function lireResultat(message) {
  for (const bloc of message.content) {
    if (bloc.type === 'tool_use' && bloc.name === OUTIL.name) return bloc.input;
  }
  return null;
}

async function chargerCache() {
  try {
    const precedent = JSON.parse(await readFile(OUT, 'utf8'));
    return new Map((precedent.resumes ?? []).map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

// Récupère les sommaires décisionnels avec leur texte intégral.
async function chargerSommaires(year, max) {
  const filter =
    `Type eq '${encodeFieldValue('Sommaires et mémoires')}'` + (year ? ` and Annee eq '${year}'` : '');
  const total = (await search({ filter, top: 0, count: true }))['@odata.count'] ?? 0;

  const docs = [];
  for await (const row of searchAll(
    { filter, select: 'content,Objet,Numero,Date,Annee,Uniteadministrative,metadata_storage_name', orderby: 'Date desc' },
    { pageSize: 100, max }
  )) {
    docs.push({
      id: row.metadata_storage_name,
      numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
      objet: (decode(row.Objet) ?? '').replace(/\s+/g, ' ').trim() || null,
      date: row.Date ?? null,
      unite: decode(row.Uniteadministrative) === 'null' ? null : decode(row.Uniteadministrative),
      pdf: row.metadata_storage_name ? PDF_BASE + row.metadata_storage_name : null,
      texte: preparerTexte(row.content),
    });
  }
  return { docs, total };
}

// Routine quotidienne. Les candidats viennent de data/decisions.json, déjà à jour : les
// sommaires datés de la fenêtre qui n'ont pas de résumé. On ne demande à la Ville que leur
// texte, par lots de cinquante numéros (un sommaire fait souvent 50 ko). Les plus récents
// d'abord ; le plafond borne ce qu'une exécution peut dépenser, le reste attend la suivante.
async function chargerSommairesDepuis(depuis, plafond, cache) {
  const { decisions } = JSON.parse(await readFile(DECISIONS, 'utf8'));
  const candidats = (decisions ?? [])
    .filter((d) => d.type === 'Sommaires et mémoires' && d.numero && (d.date ?? '') >= depuis && !cache.has(d.id))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, plafond);
  const parNom = new Map(candidats.map((d) => [d.id, d]));
  const docs = [];
  for await (const row of textesParNumero(
    candidats.map((d) => d.numero),
    { select: 'content,Objet,Numero,Date,Annee,Uniteadministrative,metadata_storage_name', lot: 50 }
  )) {
    if (!parNom.has(row.metadata_storage_name)) continue;
    docs.push({
      id: row.metadata_storage_name,
      numero: decode(row.Numero) === 'null' ? null : decode(row.Numero),
      objet: normaliserObjet(decode(row.Objet)),
      date: row.Date ?? null,
      unite: decode(row.Uniteadministrative) === 'null' ? null : decode(row.Uniteadministrative),
      pdf: PDF_BASE + row.metadata_storage_name,
      texte: preparerTexte(row.content),
    });
  }
  if (docs.length < candidats.length) {
    console.warn(`⚠ ${candidats.length - docs.length} sommaire(s) introuvable(s) par numéro — on réessaiera demain.`);
  }
  return docs;
}

// Estimation : on mesure vraiment quelques documents avec l'API de comptage, puis on
// extrapole au ratio caractères/jetons observé. Gratuit, et bien plus honnête qu'une
// règle de trois sur « 4 caractères par jeton ».
async function estimer(client, docs, modele) {
  const echantillon = docs.slice(0, Math.min(12, docs.length));
  let jetonsEchantillon = 0;
  let caracteresEchantillon = 0;
  for (const doc of echantillon) {
    const { model, max_tokens, ...params } = requete(modele, doc.texte, doc.numero, doc.objet);
    const compte = await client.messages.countTokens({ model, ...params });
    jetonsEchantillon += compte.input_tokens;
    caracteresEchantillon += doc.texte.length;
  }
  const ratio = caracteresEchantillon / jetonsEchantillon; // caractères par jeton
  const caracteresTotal = docs.reduce((n, d) => n + d.texte.length, 0);
  const entree = Math.round(caracteresTotal / ratio);
  const sortie = docs.length * 320; // ~5 puces courtes + les champs de l'outil
  const tarif = TARIFS[modele];
  const cout = tarif ? (entree / 1e6) * tarif.entree + (sortie / 1e6) * tarif.sortie : null;
  return { ratio, entree, sortie, cout, mesuresSur: echantillon.length };
}

function afficherEstimation(estimation, docs, modele, batch) {
  const { entree, sortie, cout, ratio, mesuresSur } = estimation;
  console.log('\n--- Estimation ---');
  console.log(`Documents à résumer  : ${docs.length}`);
  console.log(`Modèle               : ${modele}`);
  console.log(`Ratio mesuré         : ${ratio.toFixed(2)} caractères/jeton (sur ${mesuresSur} documents)`);
  console.log(`Jetons d'entrée      : ~${entree.toLocaleString('fr-CA')}`);
  console.log(`Jetons de sortie     : ~${sortie.toLocaleString('fr-CA')}`);
  if (cout != null) {
    console.log(`Coût estimé          : ~${cout.toFixed(2)} $ US` + (batch ? ` (${(cout / 2).toFixed(2)} $ via l'API Batches)` : ''));
    if (!batch) console.log("                       (moitié moins avec --batch, résultats en moins d'une heure)");
  } else {
    console.log(`Coût estimé          : tarif inconnu pour ce modèle`);
  }
}

function ficheResume(doc, sortie, modele, usage) {
  return {
    id: doc.id,
    numero: doc.numero,
    date: doc.date,
    unite: doc.unite,
    objet: doc.objet,
    pdf: doc.pdf,
    puces: (sortie.puces ?? []).map(decoderEchappements),
    sansContenuSubstantiel: sortie.sansContenuSubstantiel,
    montantPrincipal: decoderEchappements(sortie.montantPrincipal ?? null),
    genereParIA: true,
    modele,
    genereLe: new Date().toISOString(),
    jetons: usage ? { entree: usage.input_tokens, sortie: usage.output_tokens } : null,
  };
}

async function genererSynchrone(client, docs, modele) {
  const resumes = [];
  const echecs = [];
  const CONCURRENCE = 4;

  for (let i = 0; i < docs.length; i += CONCURRENCE) {
    const lot = docs.slice(i, i + CONCURRENCE);
    const resultats = await Promise.allSettled(
      lot.map(async (doc) => {
        const message = await client.messages.create(requete(modele, doc.texte, doc.numero, doc.objet));
        const sortie = lireResultat(message);
        if (!sortie) throw new Error("le modèle n'a pas rempli l'outil");
        return ficheResume(doc, sortie, modele, message.usage);
      })
    );
    resultats.forEach((r, j) => {
      if (r.status === 'fulfilled') resumes.push(r.value);
      else echecs.push({ id: lot[j].id, raison: String(r.reason?.message ?? r.reason) });
    });
    console.log(`  … ${Math.min(i + CONCURRENCE, docs.length)}/${docs.length}`);
  }
  return { resumes, echecs };
}

async function genererParLot(client, docs, modele) {
  console.log("Envoi à l'API Batches (50 % du tarif, résultats en moins d'une heure en général)…");
  const lot = await client.messages.batches.create({
    requests: docs.map((doc) => ({
      custom_id: doc.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64),
      params: requete(modele, doc.texte, doc.numero, doc.objet),
    })),
  });
  console.log(`Lot ${lot.id} — statut ${lot.processing_status}`);

  let etat = lot;
  while (etat.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000));
    etat = await client.messages.batches.retrieve(lot.id);
    const c = etat.request_counts;
    console.log(`  ${etat.processing_status} — ${c.succeeded} réussis, ${c.processing} en cours, ${c.errored} en erreur`);
  }

  // Les résultats reviennent dans n'importe quel ordre : on rappariement par custom_id.
  const parCustomId = new Map(
    docs.map((doc) => [doc.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64), doc])
  );
  const resumes = [];
  const echecs = [];
  for await (const resultat of await client.messages.batches.results(lot.id)) {
    const doc = parCustomId.get(resultat.custom_id);
    if (!doc) continue;
    if (resultat.result.type !== 'succeeded') {
      echecs.push({ id: doc.id, raison: resultat.result.type });
      continue;
    }
    const sortie = lireResultat(resultat.result.message);
    if (!sortie) {
      echecs.push({ id: doc.id, raison: "le modèle n'a pas rempli l'outil" });
      continue;
    }
    resumes.push(ficheResume(doc, sortie, modele, resultat.result.message.usage));
  }
  return { resumes, echecs };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args['all-years'] ? null : args.year ?? String(new Date().getFullYear());
  const max = Number(args.max ?? 40);
  const modele = args.model ?? MODELE_DEFAUT;
  const dryRun = Boolean(args['dry-run']);
  const batch = Boolean(args.batch);
  const depuis = args.depuis ?? null;
  const plafond = Number(args.plafond ?? 120);

  const cache = args.force ? new Map() : await chargerCache();

  let docs;
  if (depuis) {
    console.log(`Sommaires décisionnels depuis ${depuis} pas encore résumés (plafond : ${plafond})…`);
    docs = await chargerSommairesDepuis(depuis, plafond, cache);
  } else {
    console.log(`Chargement des sommaires décisionnels${year ? ` de ${year}` : ''}…`);
    const charges = await chargerSommaires(year, max);
    console.log(`${charges.docs.length} chargés (la Ville en a publié ${charges.total}${year ? ` en ${year}` : ''}).`);
    docs = charges.docs;
  }

  const aFaire = docs.filter((d) => !cache.has(d.id));
  console.log(`${cache.size} déjà résumés, ${aFaire.length} à faire.`);

  if (aFaire.length === 0) {
    console.log('Rien à générer. (--force pour tout regénérer.)');
    return;
  }

  const client = new Anthropic();
  const estimation = await estimer(client, aFaire, modele);
  afficherEstimation(estimation, aFaire, modele, batch);

  if (dryRun) {
    console.log('\n--dry-run : aucun appel de génération effectué.');
    return;
  }

  console.log('\nGénération…');
  const { resumes, echecs } = batch
    ? await genererParLot(client, aFaire, modele)
    : await genererSynchrone(client, aFaire, modele);

  const tous = [...cache.values(), ...resumes].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const jetonsEntree = resumes.reduce((n, r) => n + (r.jetons?.entree ?? 0), 0);
  const jetonsSortie = resumes.reduce((n, r) => n + (r.jetons?.sortie ?? 0), 0);
  const tarif = TARIFS[modele];
  const coutReel = tarif
    ? ((jetonsEntree / 1e6) * tarif.entree + (jetonsSortie / 1e6) * tarif.sortie) * (batch ? 0.5 : 1)
    : null;

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modele,
        genereParIA: true,
        avertissement:
          "Résumés produits automatiquement à partir du texte du sommaire décisionnel, sans " +
          'jugement de valeur et sans ajout extérieur au document. En cas d\'écart, le PDF officiel fait foi.',
        parametres: { annee: year, max, batch, depuis, plafond },
        nombre: tous.length,
        genereCetteFois: resumes.length,
        echecs,
        cout: coutReel != null ? { devise: 'USD', montant: Number(coutReel.toFixed(4)), jetonsEntree, jetonsSortie } : null,
        resumes: tous,
      },
      null,
      1
    ),
    'utf8'
  );

  console.log(`\n${resumes.length} résumés générés, ${tous.length} au total dans data/resumes.json`);
  if (coutReel != null) console.log(`Coût réel : ${coutReel.toFixed(2)} $ US`);
  if (echecs.length) console.log(`${echecs.length} échec(s) — relancer la commande les reprendra.`);
}

main().catch((err) => {
  if (err?.status === 401 || /api[_ -]?key/i.test(String(err?.message))) {
    console.error(
      "\nClé API manquante. Crée un fichier api.env à la racine du projet avec :\n" +
        '  ANTHROPIC_API_KEY=sk-ant-…\n' +
        '(ou exporte ANTHROPIC_API_KEY dans ton environnement).\n'
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
