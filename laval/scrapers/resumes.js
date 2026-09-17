// Résumés en langage clair des sommaires décisionnels.
//
//   npm run scrape:resumes -- --dry-run          estime le coût, n'appelle rien de payant
//   npm run scrape:resumes -- --max=50           génère 50 résumés (synchrone)
//   npm run scrape:resumes -- --max=700 --batch  passe par l'API Batches (50 % moins cher)
//   npm run scrape:resumes -- --depuis=2026-07-13 --plafond=120
//                                   routine quotidienne : les sommaires récents sans résumé
//   node --env-file=../api.env scrapers/resumes.js --dry-run --year=2026
//                                   la clé est dans api.env à la racine du dépôt, jamais dans le code
//
// Le sommaire décisionnel est la note que l'administration rédige avant chaque décision du
// conseil : objet, districts touchés, contrat ou règlement, décisions antérieures, contexte et
// justifications, aspects financiers, puis le texte de la résolution recommandée. Le « pourquoi »
// y est déjà écrit — on ne fait que le rendre lisible en trois à sept puces.
//
// À Laval, chaque sommaire est un petit PDF à part : scrapers/sommaires.js l'a lu et mis en
// fiche dans data/textes/sommaire_SD-….json (champs sûrs + texte entier). Ce script ne
// télécharge rien ; un sommaire dont le texte manque attend la prochaine lecture. La matière
// donnée au modèle, ce sont les CHAMPS (objet, districts, contrat ou règlement, décisions
// antérieures, contexte, impacts, aspects financiers, résolution recommandée) plutôt que le PDF
// entier : l'en-tête répété, la certification du trésorier et les résolutions antérieures
// recopiées in extenso ne feraient que coûter. Sans champs (lecture d'une version plus
// ancienne), le texte entier, tronqué à MAX_CARACTERES.
//
// Le résumé est indexé par NUMÉRO DE SOMMAIRE : un même dossier passe au comité exécutif, qui
// recommande, puis au conseil, qui décide — un seul résumé, que les fiches des deux décisions
// retrouvent par `sommaireId`.
//
// RÈGLES DU PROJET, appliquées ici :
//   - jamais de donnée inventée : le résumé ne porte que sur ce que le document dit ;
//   - jamais de jugement de valeur sur une décision ou sur une personne ;
//   - honnêteté sur les limites : si le document est purement procédural, le modèle doit
//     le dire plutôt que de meubler ;
//   - chaque résumé est marqué comme généré par IA, daté, avec le modèle utilisé, et
//     la fiche renvoie toujours au PDF officiel ;
//   - jamais repayer : le cache (data/resumes.json) fait foi, --dry-run avant tout lot.

import Anthropic from '@anthropic-ai/sdk';
import { writeFile, readFile } from 'node:fs/promises';
import { lireCache } from './decisions.js';

const OUT = new URL('../data/resumes.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);

// Tarifs $ US par million de jetons, pour l'estimation de coût (API Anthropic, septembre 2026 ;
// l'API Batches est à moitié prix).
const TARIFS = {
  'claude-opus-5': { entree: 5, sortie: 25 },
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-haiku-4-5': { entree: 1, sortie: 5 },
};
const MODELE_DEFAUT = 'claude-opus-5';

// Un sommaire dépasse rarement 12 000 caractères ; au-delà on tronque par la fin en le
// disant, plutôt que de payer pour des annexes répétitives.
const MAX_CARACTERES = 14000;

const CONSIGNE = `Tu résumes des sommaires décisionnels de la Ville de Laval pour un site
d'information citoyenne. Ton lecteur est une personne pressée qui n'a aucune formation en
administration municipale.

Écris de 3 à 7 puces courtes, en français simple, à la voix active. Chaque puce tient sur
une ou deux lignes.

Concentre-toi sur ce qui change concrètement pour du monde : les montants, les obligations,
les interdictions, les échéances, les districts, secteurs ou quartiers touchés, ce que la
Ville s'engage à faire, avec qui elle contracte. Le sommaire nomme des élus (qui propose, qui
appuie) et le trésorier qui certifie les crédits : ne reprends aucun nom de personne. Laisse
tomber le vocabulaire de procédure (« il est résolu que », « il y aurait lieu de », les numéros
de règlement seuls, les renvois d'articles) sauf quand c'est le cœur de la décision.

Trois interdits absolus :
1. N'invente rien. Si une information n'est pas dans le texte, elle n'existe pas. Pas de
   contexte ajouté de ta connaissance générale, pas de chiffre déduit.
2. Aucun jugement. Ni « important », ni « ambitieux », ni « coûteux », ni « modeste ».
   Tu rapportes ce que le document dit, point. Pas d'opinion sur la décision, jamais rien
   sur les personnes.
3. Si le document est purement procédural et ne contient rien de substantiel à résumer
   (une simple prise d'acte, un dépôt de document, une nomination sans autre portée, une
   correction de forme), mets sansContenuSubstantiel à true et explique en une seule puce
   ce que le document fait, sans meubler.

Pour montantPrincipal : s'il y a une somme d'argent au cœur de la décision, recopie-la
exactement comme elle est écrite dans le document (par exemple « 839 679,72 $ »). S'il n'y en
a pas, ou si tu hésites entre plusieurs, mets null.`;

const OUTIL = {
  name: 'resume_decision',
  description: "Enregistre le résumé en langage clair d'un sommaire décisionnel.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      puces: { type: 'array', description: 'De 3 à 7 puces courtes en français simple.', items: { type: 'string' } },
      sansContenuSubstantiel: { type: 'boolean', description: "true si le document est purement procédural et n'a rien de substantiel à résumer." },
      montantPrincipal: { type: ['string', 'null'], description: "La somme au cœur de la décision, recopiée telle qu'écrite, ou null." },
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
        content: `Sommaire décisionnel — dossier ${numero ?? ''}\nObjet : ${objet ?? '(non précisé)'}\n\n--- texte du document ---\n${texte}`,
      },
    ],
  };
}

function preparerTexte(contenu) {
  const texte = (contenu ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (texte.length <= MAX_CARACTERES) return texte;
  return texte.slice(0, MAX_CARACTERES) + '\n\n[…document tronqué pour le résumé…]';
}

// La matière donnée au modèle, depuis les champs que sommaires.js a lus : le service, la fiche
// telle qu'écrite (districts, actions, contrat ou règlement lot par lot, sous-tableaux de
// financement ou de mandataires — rien de reconstruit), les décisions antérieures, puis les
// sections de fond. Une section qui dit « NE S'APPLIQUE PAS » n'apprend rien : on la saute. Si
// aucune section de fond n'a été lue (gabarit inattendu), le texte entier fait l'affaire.
export function matiereDuSommaire(cache) {
  const c = cache?.champs;
  const utile = (t) => (t && !/^ne s'applique pas\.?$/i.test(String(t).trim()) ? String(t).trim() : null);
  if (!c || ![c.contexte, c.impacts, c.aspectsFinanciers, c.resume].some(utile)) return preparerTexte(cache?.texte);
  const parties = [];
  if (c.service) parties.push(`Service : ${c.service}${c.division ? ' / ' + c.division : ''}`);
  if (utile(c.fiche)) parties.push(`Fiche :\n${c.fiche.trim()}`);
  else {
    if (c.districts?.length) parties.push(`District(s) : ${c.districts.map((d) => d.nom).join(', ')}`);
    if (c.actions?.length) parties.push(`Actions : ${c.actions.join(', ')}`);
  }
  if (c.decisionsAnterieures?.length) parties.push('Décisions antérieures :\n' + c.decisionsAnterieures.map((d) => `${d.date} ${d.numero} ${d.objet ?? ''}`.trim()).join('\n'));
  for (const [titre, cle] of [
    ['Contexte et justifications', 'contexte'],
    ['Impacts majeurs', 'impacts'],
    ['Aspects financiers', 'aspectsFinanciers'],
    ['Calendrier et étapes subséquentes', 'calendrier'],
    ['Remarques', 'remarques'],
    ['Résolution recommandée', 'resume'],
  ]) {
    const t = utile(c[cle]);
    if (t) parties.push(`${titre} :\n${t}`);
  }
  return preparerTexte(parties.join('\n\n'));
}

// Le modèle rend parfois les accents sous forme d'échappement JSON à l'intérieur de la
// valeur de chaîne. Même décodage qu'à Longueuil (scripts/reparer-echappements.js).
function decoderEchappements(valeur) {
  if (typeof valeur !== 'string') return valeur;
  return valeur
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
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

// Les candidats : les décisions de l'année qui citent un sommaire publié, une fois par sommaire
// (le comité exécutif recommande, le conseil décide : deux résolutions, un sommaire, un résumé).
// Tous les genres de fiche y passent — une résolution, mais aussi un avis de motion ou un dépôt
// de projet de règlement, dont le sommaire dit ce que le règlement fera. `id` = « SD-2026-3136 »,
// et les fiches de décision retrouvent le résumé par `sommaireId`.
//
// Le plafond compte les sommaires DONT ON A LE TEXTE : un sommaire cité mais pas encore lu ne
// doit pas occuper une place à chaque exécution.
async function candidats({ year = null, depuis = null, plafond = Infinity, cache }) {
  const { decisions } = JSON.parse(await readFile(DECISIONS, 'utf8'));
  const parDossier = new Map();
  for (const d of decisions ?? []) {
    if (!d.sommaireId || !d.sommairePublie || !d.sommairePdf) continue;
    if (year && String(d.annee) !== String(year)) continue;
    if (depuis && (d.date ?? '') < depuis) continue;
    if (cache.has(d.sommaireId)) continue;
    const deja = parDossier.get(d.sommaireId);
    if (!deja) parDossier.set(d.sommaireId, { ...d, resolutions: [d.numero] });
    else {
      deja.resolutions.push(d.numero);
      // La fiche la plus récente porte la date et le numéro du résumé (l'adoption vient en dernier).
      if ((d.date ?? '') > (deja.date ?? '')) Object.assign(deja, d, { resolutions: deja.resolutions });
    }
  }
  const liste = [...parDossier.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const docs = [];
  let sansTexte = 0;
  for (const d of liste) {
    if (docs.length >= plafond) break;
    const sommaire = await lireCache(`sommaire_${d.sommaireId}`);
    if (!sommaire?.texte) {
      sansTexte++;
      continue;
    }
    docs.push({
      id: d.sommaireId,
      numero: d.sommaireId,
      resolution: d.numero,
      resolutions: d.resolutions,
      date: d.date,
      unite: sommaire.champs?.service ?? null,
      objet: sommaire.champs?.objet ?? d.objet,
      pdf: d.sommairePdf,
      texte: matiereDuSommaire(sommaire),
    });
  }
  if (sansTexte) console.log(`${sansTexte} sommaire(s) publié(s) sans texte extrait (pas encore lus par scrapers/sommaires.js).`);
  return docs;
}

// L'estimation ne coûte rien : countTokens est gratuit. Chaque requête a une part FIXE (la
// consigne, le schéma de l'outil, l'en-tête du message), mesurée une fois sur une requête sans
// texte, et une part qui dépend du document, dont on mesure le ratio caractères/jeton sur un
// échantillon pris d'un bout à l'autre de la liste. Mesurer le ratio requête entière sur les
// seuls sommaires récents (courts) surestimait l'entrée d'un tiers.
async function estimer(client, docs, modele) {
  const compter = async (texte, doc) => {
    const { model, max_tokens, ...params } = requete(modele, texte, doc.numero, doc.objet);
    return (await client.messages.countTokens({ model, ...params })).input_tokens;
  };
  const fixe = await compter('', docs[0]);
  const pas = Math.max(1, Math.floor(docs.length / 12));
  const echantillon = docs.filter((_, i) => i % pas === 0).slice(0, 12);
  let jetonsTexte = 0;
  let caracteresEchantillon = 0;
  for (const doc of echantillon) {
    jetonsTexte += Math.max(1, (await compter(doc.texte, doc)) - fixe);
    caracteresEchantillon += doc.texte.length;
  }
  const ratio = caracteresEchantillon / jetonsTexte;
  const caracteresTotal = docs.reduce((n, d) => n + d.texte.length, 0);
  const entree = Math.round(docs.length * fixe + caracteresTotal / ratio);
  const sortie = docs.length * 320;
  const cout = (m) => (TARIFS[m] ? (entree / 1e6) * TARIFS[m].entree + (sortie / 1e6) * TARIFS[m].sortie : null);
  return { ratio, fixe, entree, sortie, cout: cout(modele), parModele: Object.fromEntries(Object.keys(TARIFS).map((m) => [m, cout(m)])), mesuresSur: echantillon.length, caracteres: caracteresTotal };
}

function afficherEstimation(estimation, docs, modele, batch) {
  const { entree, sortie, cout, ratio, fixe, mesuresSur, parModele, caracteres } = estimation;
  console.log('\n--- Estimation ---');
  console.log(`Documents à résumer  : ${docs.length} (${caracteres.toLocaleString('fr-CA')} caractères de matière, ${Math.round(caracteres / docs.length).toLocaleString('fr-CA')} par sommaire)`);
  console.log(`Modèle               : ${modele}`);
  console.log(`Part fixe            : ${fixe.toLocaleString('fr-CA')} jetons par requête (consigne + outil)`);
  console.log(`Ratio mesuré         : ${ratio.toFixed(2)} caractères/jeton sur le texte (${mesuresSur} documents répartis)`);
  console.log(`Jetons d'entrée      : ~${entree.toLocaleString('fr-CA')}`);
  console.log(`Jetons de sortie     : ~${sortie.toLocaleString('fr-CA')}`);
  if (cout != null) {
    console.log(`Coût estimé          : ~${cout.toFixed(2)} $ US en synchrone, ~${(cout / 2).toFixed(2)} $ US via l'API Batches${batch ? ' (demandé)' : ''}`);
    console.log('Selon le modèle      : ' + Object.entries(parModele).map(([m, c]) => `${m} ${c.toFixed(2)} $ (${(c / 2).toFixed(2)} $ en lot)`).join(' · '));
    if (!batch) console.log("                       (moitié moins avec --batch, résultats en moins d'une heure)");
  } else console.log('Coût estimé          : tarif inconnu pour ce modèle');
}

function ficheResume(doc, sortie, modele, usage) {
  return {
    id: doc.id,
    numero: doc.numero,
    resolution: doc.resolution,
    resolutions: doc.resolutions,
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
  const customId = (doc) => doc.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const lot = await client.messages.batches.create({
    requests: docs.map((doc) => ({ custom_id: customId(doc), params: requete(modele, doc.texte, doc.numero, doc.objet) })),
  });
  console.log(`Lot ${lot.id} — statut ${lot.processing_status}`);
  let etat = lot;
  while (etat.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000));
    etat = await client.messages.batches.retrieve(lot.id);
    const c = etat.request_counts;
    console.log(`  ${etat.processing_status} — ${c.succeeded} réussis, ${c.processing} en cours, ${c.errored} en erreur`);
  }
  // Les résultats arrivent dans n'importe quel ordre : on les rattache par custom_id, jamais par rang.
  const parCustomId = new Map(docs.map((doc) => [customId(doc), doc]));
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
  const year = String(args.year ?? new Date().getFullYear());
  const max = Number(args.max ?? 40);
  const modele = args.model ?? MODELE_DEFAUT;
  const dryRun = Boolean(args['dry-run']);
  const batch = Boolean(args.batch);
  const depuis = args.depuis ?? null;
  const plafond = Number(args.plafond ?? 120);

  const cache = args.force ? new Map() : await chargerCache();
  console.log(depuis ? `Sommaires depuis ${depuis} pas encore résumés (plafond : ${plafond})…` : `Sommaires de ${year} pas encore résumés (au plus ${max})…`);
  const aFaire = await candidats({ year: depuis ? null : year, depuis, plafond: depuis ? plafond : max, cache });
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
  const { resumes, echecs } = batch ? await genererParLot(client, aFaire, modele) : await genererSynchrone(client, aFaire, modele);

  const tous = [...cache.values(), ...resumes].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const jetonsEntree = resumes.reduce((n, r) => n + (r.jetons?.entree ?? 0), 0);
  const jetonsSortie = resumes.reduce((n, r) => n + (r.jetons?.sortie ?? 0), 0);
  const tarif = TARIFS[modele];
  const coutReel = tarif ? ((jetonsEntree / 1e6) * tarif.entree + (jetonsSortie / 1e6) * tarif.sortie) * (batch ? 0.5 : 1) : null;

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modele,
        genereParIA: true,
        avertissement:
          'Résumés produits automatiquement à partir du texte du sommaire décisionnel, sans ' +
          "jugement de valeur et sans ajout extérieur au document. En cas d'écart, le PDF officiel fait foi.",
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    if (err?.status === 401 || /api[_ -]?key/i.test(String(err?.message))) {
      console.error("\nClé API manquante ou refusée. La clé est dans api.env à la racine du dépôt :\n  node --env-file=../api.env scrapers/resumes.js --dry-run\n(ou exporte ANTHROPIC_API_KEY dans ton environnement).\n");
    } else console.error(err);
    process.exitCode = 1;
  });
}
