// Traduction anglaise de la version anglaise du site, volet Montréal : les résumés en langage
// clair ET l'objet de chaque décision — le titre qu'on lit sur la fiche et dans la liste.
//
//   node --env-file=../api.env scrapers/traductions.js --dry-run         estime, n'appelle rien
//   node --env-file=../api.env scrapers/traductions.js --max=5           essai synchrone
//   node --env-file=../api.env scrapers/traductions.js --batch           rattrapage : tout, API Batches (−50 %)
//   node --env-file=../api.env scrapers/traductions.js --plafond=150     routine du matin (refresh.js)
//   node --env-file=../api.env scrapers/traductions.js --refusees        réessaie les refus du garde-fou
//
// Les objets voyagent par paquets de vingt dans un seul appel : ce sont des titres d'une ligne, et
// vingt titres coûtent moins qu'un appel chacun. Le même garde-fou des nombres s'y applique.
//
// On ne relit pas les PDF : on traduit les puces déjà écrites en français (data/resumes.json),
// ce qui coûte peu (mesuré : ~1,6 ¢ US par résumé avec Opus, 0,8 ¢ en lot — 12,04 $ pour les
// 1 495 du rattrapage). Les documents de la Ville restent en français ; le site le dit.
//
// GARDE-FOU : chaque nombre du français doit se retrouver dans l'anglais (montants, dates,
// pourcentages, numéros), une fois retirés les séparateurs de milliers et de décimales — « 5 948 217 $ »
// et « $5,948,217 » donnent tous deux 5948217. Une traduction qui perd, ajoute ou change un chiffre
// est refusée : la page garde alors le résumé français.
//
// Écrit data/resumes-en.json : { generatedAt, modele, traductions: { <id>: { puces, montantPrincipal,
// source, genereLe } } }. « source » est le genereLe du résumé français traduit : un résumé
// français refait est retraduit.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';

const RESUMES = new URL('../data/resumes.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
const OUT = new URL('../data/resumes-en.json', import.meta.url);
const MODELE = 'claude-opus-5';
const TARIF = { entree: 5, sortie: 25 };
const CONCURRENCE = 4;

const CONSIGNE = `You translate plain-language summaries of City of Montréal (Canada) municipal decisions
from French into clear, simple Canadian English, for a civic information website. Your reader has no
training in municipal administration.

Translate faithfully, bullet by bullet: same number of bullets, same order, same meaning. Do not add,
remove, explain, soften or judge anything. No context from your general knowledge.

Numbers: keep every figure. Use Canadian English formatting ($5,948,217; $175M; 6.5%; June 30, 2027).
Never change, round, add or drop a number. Keep figures in digits as in the French, even where an
English idiom would merge them ("24 heures sur 24, 7 jours sur 7" = "24 hours a day, 7 days a week").
Québec apartment sizes stay in digits ("4 ½" = "4½ unit"); a "5 à 7" is a "5-to-7 cocktail event".
Do not repeat a figure in an added translation or explanation.

Names: keep proper names in French exactly as written — streets (rue, avenue, boulevard: "rue
Sherbrooke Est", "avenue du Mont-Royal"), neighbourhoods, boroughs, parks, buildings, organizations,
companies and people. Montréal borough names stay in French ("Le Plateau-Mont-Royal",
"Rosemont–La Petite-Patrie", "Villeray–Saint-Michel–Parc-Extension"). Use these usual English terms:
conseil municipal = city council; conseil d'agglomération = urban agglomeration council; comité
exécutif = executive committee; conseil d'arrondissement = borough council; arrondissement = borough;
sommaire décisionnel = decision summary; règlement = by-law; règlement d'emprunt = loan by-law;
Programme décennal d'immobilisations = Ten-Year Capital Works Program; ville centre = central city.

Fill in the tool. montantPrincipal is the translated main amount (or null if the French one is null).`;

const OUTIL = {
  name: 'enregistrer_traduction',
  description: 'Enregistre la traduction anglaise du résumé.',
  input_schema: {
    type: 'object',
    properties: {
      puces: { type: 'array', items: { type: 'string' }, description: 'Les puces traduites, même nombre et même ordre.' },
      montantPrincipal: { type: ['string', 'null'] },
    },
    required: ['puces', 'montantPrincipal'],
    additionalProperties: false,
  },
};

// Les objets : le titre officiel d'une décision, tel que le procès-verbal l'écrit. Même exigence
// sur les nombres et les noms propres ; on ne résume pas, on traduit.
const CONSIGNE_OBJETS = `You translate the official titles of City of Montréal (Canada) council
decisions from French into clear Canadian English, for a civic information website. These are the
titles as written in the minutes, not summaries: translate each one faithfully, keeping its meaning,
its register and its length. Do not explain, shorten, soften or judge.

Numbers: keep every figure exactly, in Canadian English formatting ($302,955.90; 6.5%; June 30, 2027).
Never add, drop, round or change a number.

Names: keep proper names in French exactly as written — streets ("rue Sherbrooke Est", "avenue du
Mont-Royal"), boroughs ("Le Plateau-Mont-Royal", "Rosemont–La Petite-Patrie"), parks, buildings,
companies, organizations and people. Usual English terms: conseil municipal = city council; comité
exécutif = executive committee; conseil d'arrondissement = borough council; arrondissement = borough;
sommaire décisionnel = decision summary; règlement = by-law; appel d'offres = call for tenders;
soumissionnaire = bidder; contingences = contingencies; majorer = increase; octroyer = grant.

You are given a numbered list. Fill in the tool with one translation per number, same count, same order.`;

const OUTIL_OBJETS = {
  name: 'enregistrer_objets',
  description: 'Enregistre la traduction anglaise de chaque objet, dans le même ordre.',
  input_schema: {
    type: 'object',
    properties: {
      objets: { type: 'array', items: { type: 'string' }, description: 'Un titre traduit par titre reçu, même nombre et même ordre.' },
    },
    required: ['objets'],
    additionalProperties: false,
  },
};
const PAR_PAQUET = 20;

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

function requete(r) {
  return {
    model: MODELE,
    max_tokens: 1500,
    system: CONSIGNE,
    tools: [OUTIL],
    tool_choice: { type: 'tool', name: OUTIL.name },
    messages: [{ role: 'user', content: JSON.stringify({ puces: r.puces, montantPrincipal: r.montantPrincipal ?? null }) }],
  };
}

// Tous les nombres d'un texte, séparateurs de milliers et décimales retirés, triés. Avant ça, les
// tournures qui changent le compte sans changer le sens prennent une seule forme : « 6:30 p.m. » =
// « 18 h 30 », « noon » = « midi » = 12, « midnight » = « minuit » = 0, « 24 heures sur 24 » = « 24 hours
// a day ». Le reste (« 3 ½ » écrit en lettres, un nombre ajouté entre parenthèses) est refusé.
const heure24 = (_, h, min, ap) => `${(Number(h) % 12) + (ap.toLowerCase() === 'p' ? 12 : 0)}${min ? ` h ${min}` : ''}`;
const FORMES = [
  [/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?/gi, heure24],
  [/\b(?:noon|(?<![-\w])midi)\b/gi, () => '12 h'],
  [/\b(?:midnight|minuit)\b/gi, () => '0 h'],
  [/\b(\d+) (heures|jours) sur \1\b/gi, (_, n, mot) => `${n} ${mot}`],
];
export function nombres(texte) {
  const uniforme = FORMES.reduce((t, [motif, forme]) => t.replace(motif, forme), String(texte ?? ''));
  return (uniforme.replace(/(\d)(?:[\s\u00a0\u202f]+|[.,])(?=\d)/g, '$1').match(/\d+/g) ?? []).sort();
}
const memesNombres = (fr, en) => nombres(fr).join(' ') === nombres(en).join(' ');

const CONTROLE = /[\x00-\x09\x0b-\x1f\x7f]/;
const decoder = (v) => (typeof v === 'string' ? v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).split('\\"').join('"') : v);

export function verifier(r, sortie) {
  const puces = (sortie?.puces ?? []).map(decoder).map((p) => String(p).trim());
  const montant = sortie?.montantPrincipal == null ? null : decoder(String(sortie.montantPrincipal)).trim();
  if (puces.length !== r.puces.length) return { raison: `${puces.length} puces au lieu de ${r.puces.length}` };
  if (puces.some((p) => !p || CONTROLE.test(p))) return { raison: 'puce vide ou caractère de contrôle' };
  for (let i = 0; i < puces.length; i++) {
    if (!memesNombres(r.puces[i], puces[i])) return { raison: `nombres différents dans la puce ${i + 1} : ${nombres(r.puces[i]).join(',')} ≠ ${nombres(puces[i]).join(',')}` };
  }
  if ((r.montantPrincipal == null) !== (montant == null)) return { raison: 'montant principal ajouté ou perdu' };
  if (r.montantPrincipal != null && !memesNombres(r.montantPrincipal, montant)) return { raison: 'montant principal différent' };
  return { puces, montantPrincipal: montant };
}

const lireSortie = (message, outil = OUTIL) => message.content.find((b) => b.type === 'tool_use' && b.name === outil.name)?.input ?? null;

// Un paquet d'objets : la requête, et la vérification. Un titre dont les nombres ne correspondent
// pas est refusé tout seul ; les dix-neuf autres du paquet sont gardés.
function requeteObjets(paquet) {
  return {
    model: MODELE,
    max_tokens: 4000,
    system: CONSIGNE_OBJETS,
    tools: [OUTIL_OBJETS],
    tool_choice: { type: 'tool', name: OUTIL_OBJETS.name },
    messages: [{ role: 'user', content: paquet.map((d, i) => `${i + 1}. ${d.objet}`).join('\n') }],
  };
}
export function verifierObjets(paquet, sortie) {
  const objets = (sortie?.objets ?? []).map(decoder).map((o) => String(o ?? '').trim());
  if (objets.length !== paquet.length) return { raison: `${objets.length} titres au lieu de ${paquet.length}` };
  return {
    gardes: paquet.map((d, i) => ({ d, en: objets[i] })).filter(({ d, en }) => en && !CONTROLE.test(en) && memesNombres(d.objet, en)),
    refuses: paquet.filter((d, i) => !objets[i] || CONTROLE.test(objets[i]) || !memesNombres(d.objet, objets[i])),
  };
}

async function main() {
  const { resumes = [] } = JSON.parse(await readFile(RESUMES, 'utf8'));
  const { decisions = [] } = JSON.parse(await readFile(DECISIONS, 'utf8'));
  let precedent = {};
  let objetsPrecedents = {};
  // Les refus du garde-fou, gardés pour ne pas repayer chaque matin une traduction qui échouera
  // encore : on réessaie quand le résumé français est refait, ou avec --refusees.
  let refusPrecedents = {};
  try { ({ traductions: precedent = {}, refus: refusPrecedents = {}, objets: objetsPrecedents = {} } = JSON.parse(await readFile(OUT, 'utf8'))); } catch {}

  // Seuls les résumés qu'une fiche affiche vraiment. Une décision qui a le résumé de son sommaire
  // ne montre plus celui écrit d'après le texte de la résolution : le traduire serait payer pour
  // du texte que personne ne lira (1 400 résumés, ici).
  const affiches = new Set();
  for (const d of decisions) {
    if (d.type !== 'Résolution') continue;
    affiches.add(d.sommaireId && resumes.some((r) => r.id === d.sommaireId) ? d.sommaireId : d.id);
  }
  const candidats = resumes
    .filter((r) => affiches.has(r.id))
    .filter((r) => r.puces?.length && !r.sansContenuSubstantiel)
    .filter((r) => args.has('force') || precedent[r.id]?.source !== (r.genereLe ?? null))
    .filter((r) => args.has('force') || args.has('refusees') || refusPrecedents[r.id]?.source !== (r.genereLe ?? null))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const plafond = args.has('batch') ? Infinity : Number(args.get('max') ?? args.get('plafond') ?? 150);
  const aFaire = candidats.slice(0, plafond);
  // Les titres : toutes les résolutions dont l'objet n'est pas déjà traduit (le français sert de
  // clé de fraîcheur : un objet réécrit est retraduit).
  const objetsCandidats = decisions
    .filter((d) => d.type === 'Résolution' && d.objet)
    .filter((d) => args.has('force') || objetsPrecedents[d.id]?.source !== d.objet)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const objetsAFaire = objetsCandidats.slice(0, args.has('batch') ? Infinity : Number(args.get('max-objets') ?? args.get('plafond') ?? 400));
  const paquets = [];
  for (let i = 0; i < objetsAFaire.length; i += PAR_PAQUET) paquets.push(objetsAFaire.slice(i, i + PAR_PAQUET));

  const jetonsEstimes = aFaire.reduce((n, r) => n + Math.round(JSON.stringify(r.puces).length / 3.6), 0);
  const cout = aFaire.length ? ((jetonsEstimes + aFaire.length * 330) / 1e6) * TARIF.entree + (jetonsEstimes / 1e6) * TARIF.sortie : 0;
  const jetonsObjets = objetsAFaire.reduce((n, d) => n + Math.round(d.objet.length / 3.6), 0);
  const coutObjets = paquets.length ? ((jetonsObjets + paquets.length * 400) / 1e6) * TARIF.entree + (jetonsObjets / 1e6) * TARIF.sortie : 0;
  const total = args.has('batch') ? (cout + coutObjets) / 2 : cout + coutObjets;
  console.log(`Résumés : ${Object.keys(precedent).length} déjà traduits, ${candidats.length} à faire, ${aFaire.length} cette fois.`);
  console.log(`Titres  : ${Object.keys(objetsPrecedents).length} déjà traduits, ${objetsCandidats.length} à faire, ${objetsAFaire.length} cette fois en ${paquets.length} paquet(s).`);
  console.log(`~${total.toFixed(2)} $ US estimés${args.has('batch') ? ' (lot, moitié prix)' : ''}.`);
  if ((!aFaire.length && !paquets.length) || args.has('dry-run')) return;
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Traductions : sautées, pas de clé ANTHROPIC_API_KEY.'); return; }

  const client = new Anthropic();
  const objetsFaits = {};
  const faites = {};
  const refus = {};
  const echecs = [];
  let entree = 0;
  let sortie = 0;
  const garder = (r, message) => {
    entree += message.usage?.input_tokens ?? 0;
    sortie += message.usage?.output_tokens ?? 0;
    const v = verifier(r, lireSortie(message));
    if (v.raison) {
      echecs.push(`${r.numero ?? r.id} : ${v.raison}`);
      refus[r.id] = { source: r.genereLe ?? null, raison: v.raison, le: new Date().toISOString() };
      return false;
    }
    delete refus[r.id];
    faites[r.id] = { puces: v.puces, montantPrincipal: v.montantPrincipal, source: r.genereLe ?? null, genereLe: new Date().toISOString() };
    return true;
  };

  // Un paquet de titres traduit : ce qu'on garde, ce qu'on refuse.
  const garderObjets = (paquet, message) => {
    entree += message.usage?.input_tokens ?? 0;
    sortie += message.usage?.output_tokens ?? 0;
    const v = verifierObjets(paquet, lireSortie(message, OUTIL_OBJETS));
    if (v.raison) { echecs.push(`paquet de titres : ${v.raison}`); return; }
    for (const { d, en } of v.gardes) objetsFaits[d.id] = { en, source: d.objet, genereLe: new Date().toISOString() };
    for (const d of v.refuses) echecs.push(`titre ${d.numero ?? d.id} : nombres différents`);
  };

  if (args.has('batch')) {
    const cle = (r) => r.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    const parCle = new Map(aFaire.map((r) => [cle(r), r]));
    const parPaquet = new Map(paquets.map((p, i) => [`objets_${i}`, p]));
    const lot = await client.messages.batches.create({
      requests: [
        ...aFaire.map((r) => ({ custom_id: cle(r), params: requete(r) })),
        ...paquets.map((p, i) => ({ custom_id: `objets_${i}`, params: requeteObjets(p) })),
      ],
    });
    console.log(`Lot ${lot.id} envoyé (${aFaire.length} résumés, ${paquets.length} paquets de titres).`);
    let etat = lot;
    while (etat.processing_status !== 'ended') {
      await new Promise((ok) => setTimeout(ok, 30_000));
      etat = await client.messages.batches.retrieve(lot.id);
      const c = etat.request_counts;
      console.log(`  ${etat.processing_status} — ${c.succeeded} réussis, ${c.processing} en cours, ${c.errored} en erreur`);
    }
    for await (const res of await client.messages.batches.results(lot.id)) {
      const paquet = parPaquet.get(res.custom_id);
      if (paquet) {
        if (res.result.type !== 'succeeded') { echecs.push(`${res.custom_id} : ${res.result.type}`); continue; }
        garderObjets(paquet, res.result.message);
        continue;
      }
      const r = parCle.get(res.custom_id);
      if (!r) continue;
      if (res.result.type !== 'succeeded') { echecs.push(`${r.numero ?? r.id} : ${res.result.type}`); continue; }
      garder(r, res.result.message);
    }
  } else {
    for (let i = 0; i < aFaire.length; i += CONCURRENCE) {
      await Promise.all(aFaire.slice(i, i + CONCURRENCE).map(async (r) => {
        try {
          // Un refus du garde-fou est retenté une fois.
          if (!garder(r, await client.messages.create(requete(r)))) {
            echecs.pop();
            garder(r, await client.messages.create(requete(r)));
          }
        } catch (e) {
          echecs.push(`${r.numero ?? r.id} : ${e.message}`);
        }
      }));
    }
    for (let i = 0; i < paquets.length; i += CONCURRENCE) {
      await Promise.all(paquets.slice(i, i + CONCURRENCE).map(async (p) => {
        try {
          garderObjets(p, await client.messages.create(requeteObjets(p)));
        } catch (e) {
          echecs.push(`paquet de titres : ${e.message}`);
        }
      }));
    }
  }

  // Les traductions d'un résumé disparu ne sont plus utiles.
  const idsDecisions = new Set(decisions.map((d) => d.id));
  const objets = Object.fromEntries(Object.entries({ ...objetsPrecedents, ...objetsFaits }).filter(([id]) => idsDecisions.has(id)));
  const ids = new Set(resumes.map((r) => r.id));
  const traductions = Object.fromEntries(Object.entries({ ...precedent, ...faites }).filter(([id]) => ids.has(id)));
  const refusGardes = Object.fromEntries(Object.entries({ ...refusPrecedents, ...refus }).filter(([id]) => ids.has(id) && !faites[id]));
  const coutReel = ((entree / 1e6) * TARIF.entree + (sortie / 1e6) * TARIF.sortie) * (args.has('batch') ? 0.5 : 1);
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    modele: MODELE,
    genereParIA: true,
    avertissement: "Traductions automatiques des résumés et des titres français ; chaque nombre a été vérifié contre le français. Les documents de la Ville sont en français et font foi.",
    nombre: Object.keys(traductions).length,
    nombreObjets: Object.keys(objets).length,
    traductions,
    objets,
    refus: refusGardes,
  }), 'utf8');
  console.log(`Traductions : ${Object.keys(faites).length} résumés et ${Object.keys(objetsFaits).length} titres faits (${echecs.length} refusés ou en échec) — ${Object.keys(traductions).length} résumés et ${Object.keys(objets).length} titres au total, ${coutReel.toFixed(2)} $ US.`);
  for (const e of echecs.slice(0, 15)) console.warn(`  ⚠ ${e}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) await main();
