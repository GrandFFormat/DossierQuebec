// Version anglaise du lexique (page lexique.html en anglais).
//
//   node --env-file=../api.env scrapers/lexique-en.js          traduit si le lexique français a changé
//   node --env-file=../api.env scrapers/lexique-en.js --force
//
// Le terme reste en français — c'est lui qu'on croise dans les documents de la Ville — et reçoit un
// équivalent anglais ; la définition, « on dit aussi » et « où vous le voyez » sont traduits. Un
// seul appel (30 termes, quelques cents). Refait seulement quand data/lexique.json change
// (empreinte des textes français).
//
// Écrit data/lexique-en.json : { generatedAt, source, categories: { cle: titre }, entrees: { <terme>:
// { equivalent, aussi, definition, ouVousLeVoyez } } }.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = new URL('../data/lexique.json', import.meta.url);
const OUT = new URL('../data/lexique-en.json', import.meta.url);

const OUTIL = {
  name: 'enregistrer_lexique',
  description: 'Enregistre le lexique traduit.',
  input_schema: {
    type: 'object',
    properties: {
      categories: { type: 'object', additionalProperties: { type: 'string' } },
      entrees: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            terme: { type: 'string', description: 'Le terme français, recopié tel quel.' },
            equivalent: { type: 'string' },
            aussi: { type: ['string', 'null'] },
            definition: { type: 'string' },
            ouVousLeVoyez: { type: ['string', 'null'] },
          },
          required: ['terme', 'equivalent', 'aussi', 'definition', 'ouVousLeVoyez'],
          additionalProperties: false,
        },
      },
    },
    required: ['categories', 'entrees'],
    additionalProperties: false,
  },
};

const CONSIGNE = `You translate a glossary of French municipal terms (City of Québec, Canada) into clear, simple
Canadian English for a civic website. The official documents stay in French, so readers need to
recognize the French terms.

For each entry: copy "terme" exactly as given (French); give "equivalent", the usual English term
(e.g. Résolution → Resolution; Sommaire décisionnel → Decision summary; Conseil d'agglomération →
Urban agglomeration council; Avis de motion → Notice of motion; Règlement → By-law). Translate
"definition", "aussi" and "ouVousLeVoyez" faithfully, without adding anything; inside them, keep
French document names or quoted French wording in French when the reader would see them that way
in the documents, with a short English gloss if useful. Keep every number and example code
(CV-2026-0123) exactly. null stays null. Translate the category titles too (same keys).`;

async function main() {
  const lexique = JSON.parse(await readFile(SOURCE, 'utf8'));
  const francais = lexique.entrees.map(({ terme, aussi, definition, ouVousLeVoyez }) => ({ terme, aussi: aussi ?? null, definition, ouVousLeVoyez: ouVousLeVoyez ?? null }));
  const empreinte = createHash('sha256').update(JSON.stringify({ c: lexique.categories, francais })).digest('hex').slice(0, 16);
  let precedent = null;
  try { precedent = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  if (precedent?.source === empreinte && !process.argv.includes('--force')) {
    console.log('Lexique anglais : à jour.');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Lexique anglais : sauté, pas de clé ANTHROPIC_API_KEY.'); return; }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: CONSIGNE,
    tools: [OUTIL],
    tool_choice: { type: 'tool', name: OUTIL.name },
    messages: [{ role: 'user', content: JSON.stringify({ categories: lexique.categories, entrees: francais }) }],
  });
  const sortie = message.content.find((b) => b.type === 'tool_use')?.input;
  const termes = new Set(francais.map((e) => e.terme));
  const entrees = Object.fromEntries((sortie?.entrees ?? []).filter((e) => termes.has(e.terme)).map(({ terme, ...reste }) => [terme, reste]));
  if (Object.keys(entrees).length !== termes.size) throw new Error(`lexique anglais incomplet : ${Object.keys(entrees).length}/${termes.size}`);
  const categories = Object.fromEntries(Object.keys(lexique.categories).map((k) => [k, sortie.categories?.[k] ?? lexique.categories[k]]));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: empreinte, modele: 'claude-opus-5', genereParIA: true, categories, entrees }, null, 1), 'utf8');
  const cout = (message.usage.input_tokens / 1e6) * 5 + (message.usage.output_tokens / 1e6) * 25;
  console.log(`Lexique anglais : ${termes.size} termes traduits — ${cout.toFixed(2)} $ US.`);
}

await main();
