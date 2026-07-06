// Scraper — Résumés IA des projets de loi (texte intégral)
//
// Contrairement aux autres scrapers, celui-ci ne fait pas que lire des pages :
// il télécharge le PDF du texte "tel que présenté" de chaque projet de loi actif
// (URL captée par bill-details.js dans `presentationPdfUrl`), en extrait le texte,
// puis demande à Claude (API payante, clé séparée de tout abonnement Claude Code/
// Claude Pro) un résumé factuel en 2-4 phrases.
//
// ⚠️ Le résumé porte sur le texte TEL QUE PRÉSENTÉ, pas nécessairement la version
// finale (des amendements peuvent avoir été adoptés en commission depuis). Chaque
// résumé est marqué `summaryAiGenerated: true` et daté — jamais présenté comme
// une donnée officielle, conformément à la règle du projet : jamais de donnée
// inventée, toujours transparent sur les limites.
//
// Ne touche pas aux projets `laisse_de_cote` : ce sont des dossiers morts, hors du
// champ "affaires en cours" que ce site couvre en priorité.
//
// Nécessite la variable d'environnement ANTHROPIC_API_KEY (clé API, PAS un
// abonnement Claude Pro/Code — voir la conversation pour le pourquoi).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

const BILLS_PATH = 'data/bills.json';
const REQUEST_DELAY_MS = 500;
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';
const MAX_PDF_CHARS = 60000; // ~15k tokens — au-delà, on tronque (projets de loi omnibus)
const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Tu résumes des projets de loi de l'Assemblée nationale du Québec pour un site citoyen indépendant de veille parlementaire, pensé pour des lecteurs pressés ou ayant de la difficulté à lire de longs blocs de texte.

Format obligatoire :
- JAMAIS plus de 7 puces (« - »), peu importe la complexité du projet de loi. Si le texte contient plus de 7 changements importants, garde seulement les 7 plus significatifs pour le public et laisse tomber le reste.
- Minimum 3 puces.
- Chaque ligne = une seule idée concrète, en langage simple, une quinzaine de mots maximum.
- Pas de phrase d'intro ni de conclusion — seulement les puces.

Règles de fond :
- Résume UNIQUEMENT ce que le texte fourni dit réellement. N'invente et ne suppose jamais de contenu absent du texte.
- Reste neutre : jamais de jugement de valeur (bon/mauvais, positif/négatif), jamais d'opinion.
- Ne mentionne pas le processus législatif (ça, c'est déjà affiché ailleurs sur le site) — concentre-toi sur CE QUE FAIT la loi.
- Priorise les changements concrets qui affectent les gens (chiffres, obligations, interdictions, nouveaux organismes) plutôt que le jargon juridique.
- Si le texte est trop technique ou tronqué pour permettre un résumé fiable, dis-le en une seule ligne plutôt que d'inventer.

Réponds uniquement avec les puces, sans préambule.`;

const client = new Anthropic();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadPdfText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en téléchargeant le PDF`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const parsed = await pdfParse(buffer);
  return parsed.text.replace(/\s+/g, ' ').trim();
}

async function summarizeText(title, text) {
  const truncated = text.length > MAX_PDF_CHARS;
  const clipped = truncated ? text.slice(0, MAX_PDF_CHARS) : text;

  const userContent = truncated
    ? `Titre : ${title}\n\n[Texte tronqué aux ${MAX_PDF_CHARS} premiers caractères — le projet de loi est plus long que ça]\n\n${clipped}`
    : `Titre : ${title}\n\n${clipped}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : null;
}

async function summarizeBill(bill) {
  if (!bill.presentationPdfUrl) return { skipped: 'pas de PDF trouvé' };

  const pdfText = await downloadPdfText(bill.presentationPdfUrl);
  if (pdfText.length < 200) return { skipped: 'texte extrait trop court/vide' };

  const summary = await summarizeText(bill.title, pdfText);
  if (!summary) return { skipped: 'réponse vide du modèle' };

  bill.summary = summary;
  bill.summaryAiGenerated = true;
  bill.summarySource = 'texte tel que présenté (PDF), peut différer de la version finale amendée';
  bill.summaryGeneratedAt = new Date().toISOString();
  return { summarized: true };
}

async function main() {
  const data = JSON.parse(readFileSync(BILLS_PATH, 'utf-8'));

  const targets = data.bills.filter((b) => b.status !== 'laisse_de_cote' && !b.summary);
  const limit = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : targets.length;
  const bills = targets.slice(0, limit);

  console.log(`${bills.length} projets de loi à résumer (sur ${targets.length} candidats, ${data.bills.length} au total).`);

  let done = 0;
  let skipped = 0;
  let errors = 0;

  for (const [i, bill] of bills.entries()) {
    try {
      const result = await summarizeBill(bill);
      if (result.summarized) done++;
      else {
        skipped++;
        console.log(`  ⏭ PL ${bill.num} (id ${bill.id}) : ${result.skipped}`);
      }
    } catch (err) {
      errors++;
      console.error(`  ⚠ PL ${bill.num} (id ${bill.id}) : ${err.message}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));
      console.log(`  ...${i + 1}/${bills.length} (sauvegardé)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));
  console.log(`Terminé. ${done} résumés générés, ${skipped} ignorés, ${errors} erreurs.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper bill-summaries.js :', err);
    process.exitCode = 1;
  });
}
