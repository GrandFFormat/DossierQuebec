// Traduction anglaise des résumés en langage clair (version anglaise du site).
//
//   node --env-file=../api.env scrapers/traductions.js --dry-run         estime, n'appelle rien
//   node --env-file=../api.env scrapers/traductions.js --max=5           essai synchrone
//   node --env-file=../api.env scrapers/traductions.js --batch           rattrapage : tout, API Batches (−50 %)
//   node --env-file=../api.env scrapers/traductions.js --plafond=150     routine du matin (refresh.js)
//
// On ne relit pas les PDF : on traduit les puces déjà écrites en français (data/resumes.json),
// ce qui coûte peu (~0,007 $ US par résumé avec Opus, moitié moins en lot). Les documents de la
// Ville restent en français ; le site le dit.
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
const OUT = new URL('../data/resumes-en.json', import.meta.url);
const MODELE = 'claude-opus-5';
const TARIF = { entree: 5, sortie: 25 };
const CONCURRENCE = 4;

const CONSIGNE = `You translate plain-language summaries of City of Québec (Canada) municipal decisions
from French into clear, simple Canadian English, for a civic information website. Your reader has no
training in municipal administration.

Translate faithfully, bullet by bullet: same number of bullets, same order, same meaning. Do not add,
remove, explain, soften or judge anything. No context from your general knowledge.

Numbers: keep every figure. Use Canadian English formatting ($5,948,217; $175M; 6.5%; June 30, 2027).
Never change, round, add or drop a number.

Names: keep proper names in French exactly as written — streets (rue, avenue, boulevard: "1re Avenue",
"boulevard Wilfrid-Hamel"), neighbourhoods, arrondissements, parks, buildings, organizations,
companies and people. Use these usual English terms: conseil de la ville = city council; conseil
d'agglomération = urban agglomeration council; comité exécutif = executive committee; conseil
d'arrondissement = borough council; sommaire décisionnel = decision summary; règlement = by-law;
règlement d'emprunt = loan by-law; Programme décennal d'immobilisations = Ten-Year Capital Works Program.

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

// Tous les nombres d'un texte, séparateurs de milliers et décimales retirés, triés.
export function nombres(texte) {
  return (String(texte ?? '').replace(/(\d)[\s  .,](?=\d)/g, '$1').match(/\d+/g) ?? []).sort();
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

const lireSortie = (message) => message.content.find((b) => b.type === 'tool_use' && b.name === OUTIL.name)?.input ?? null;

async function main() {
  const { resumes = [] } = JSON.parse(await readFile(RESUMES, 'utf8'));
  let precedent = {};
  try { precedent = JSON.parse(await readFile(OUT, 'utf8')).traductions ?? {}; } catch {}

  const candidats = resumes
    .filter((r) => r.puces?.length && !r.sansContenuSubstantiel)
    .filter((r) => args.has('force') || precedent[r.id]?.source !== (r.genereLe ?? null))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const plafond = args.has('batch') ? Infinity : Number(args.get('max') ?? args.get('plafond') ?? 150);
  const aFaire = candidats.slice(0, plafond);
  const jetonsEstimes = aFaire.reduce((n, r) => n + Math.round(JSON.stringify(r.puces).length / 3.6), 0);
  const cout = aFaire.length ? ((jetonsEstimes + aFaire.length * 330) / 1e6) * TARIF.entree + (jetonsEstimes / 1e6) * TARIF.sortie : 0;
  console.log(`Traductions anglaises : ${Object.keys(precedent).length} déjà faites, ${candidats.length} à faire, ${aFaire.length} cette fois — ~${(args.has('batch') ? cout / 2 : cout).toFixed(2)} $ US estimés${args.has('batch') ? ' (lot)' : ''}.`);
  if (!aFaire.length || args.has('dry-run')) return;
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Traductions : sautées, pas de clé ANTHROPIC_API_KEY.'); return; }

  const client = new Anthropic();
  const faites = {};
  const echecs = [];
  let entree = 0;
  let sortie = 0;
  const garder = (r, message) => {
    entree += message.usage?.input_tokens ?? 0;
    sortie += message.usage?.output_tokens ?? 0;
    const v = verifier(r, lireSortie(message));
    if (v.raison) { echecs.push(`${r.numero ?? r.id} : ${v.raison}`); return false; }
    faites[r.id] = { puces: v.puces, montantPrincipal: v.montantPrincipal, source: r.genereLe ?? null, genereLe: new Date().toISOString() };
    return true;
  };

  if (args.has('batch')) {
    const cle = (r) => r.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    const parCle = new Map(aFaire.map((r) => [cle(r), r]));
    const lot = await client.messages.batches.create({ requests: aFaire.map((r) => ({ custom_id: cle(r), params: requete(r) })) });
    console.log(`Lot ${lot.id} envoyé (${aFaire.length} résumés).`);
    let etat = lot;
    while (etat.processing_status !== 'ended') {
      await new Promise((ok) => setTimeout(ok, 30_000));
      etat = await client.messages.batches.retrieve(lot.id);
      const c = etat.request_counts;
      console.log(`  ${etat.processing_status} — ${c.succeeded} réussis, ${c.processing} en cours, ${c.errored} en erreur`);
    }
    for await (const res of await client.messages.batches.results(lot.id)) {
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
  }

  // Les traductions d'un résumé disparu ne sont plus utiles.
  const ids = new Set(resumes.map((r) => r.id));
  const traductions = Object.fromEntries(Object.entries({ ...precedent, ...faites }).filter(([id]) => ids.has(id)));
  const coutReel = ((entree / 1e6) * TARIF.entree + (sortie / 1e6) * TARIF.sortie) * (args.has('batch') ? 0.5 : 1);
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    modele: MODELE,
    genereParIA: true,
    avertissement: 'Traductions automatiques des résumés français ; chaque nombre a été vérifié contre le français. Les documents de la Ville sont en français et font foi.',
    nombre: Object.keys(traductions).length,
    traductions,
  }), 'utf8');
  console.log(`Traductions : ${Object.keys(faites).length} faites (${echecs.length} refusées ou en échec), ${Object.keys(traductions).length} au total — ${coutReel.toFixed(2)} $ US.`);
  for (const e of echecs.slice(0, 15)) console.warn(`  ⚠ ${e}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) await main();
