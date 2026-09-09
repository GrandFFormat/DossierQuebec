// Scraper — Promesses électorales des partis (extraction IA + vérification stricte)
//
// Remplace la saisie à la main. Pour chaque parti dont la source est accessible :
// on télécharge la plateforme (PDF ou page), on en extrait le texte, on demande à
// Claude d'en tirer des engagements CONCRETS, puis — étape essentielle — on
// VÉRIFIE QUE CHAQUE CITATION EXISTE LITTÉRALEMENT DANS LE DOCUMENT SOURCE.
// Toute citation introuvable est rejetée.
//
// Pourquoi ce garde-fou : une extraction IA non vérifiée invente des promesses.
// C'est arrivé lors de la première saisie de ce projet — 2 promesses sur 4
// étaient fausses (attribuées au mauvais parti, ou absentes de la source citée).
// Sur un site de veille, publier une promesse inventée en pleine campagne coûte
// tout. La vérification mot pour mot rend l'invention impossible à publier.
//
// La CAQ est ABSENTE de ce scraper : son site répond 403 aux accès automatisés
// et n'a publié aucune plateforme consolidée. On ne contourne pas une protection
// anti-automatisation (règle du projet) ; son entrée reste saisie à la main.
//
// Incrémental : on ne réinterroge l'IA que si le texte source a changé (empreinte
// stockée), donc pas de coût ni de churn à chaque exécution.
//
// Nécessite ANTHROPIC_API_KEY (api.env en local, secret GitHub en CI).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';

const OUT_PATH = 'data/promises.json';
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';
const MODEL = 'claude-sonnet-5';
const MAX_CHARS = 60000;
const PAR_PARTI = 6;

// Sources accessibles seulement. Ajouter la CAQ ici le jour où elle publie une
// plateforme lisible sans contourner de protection.
const SOURCES = [
  { party:'QS',  type:'pdf',  url:'https://cdn.prod.website-files.com/6a58006e8d06c0d8d7cc521d/6a9c07ae1aa790d59dc5ccee_Cestpossible_PlateformeQs2026-WEB.pdf',
    label:'Québec solidaire — Plateforme électorale 2026 (PDF officiel)', page:'https://quebecsolidaire.net/' },
  { party:'PLQ', type:'html', url:'https://plq.org/engagements/',
    label:'Parti libéral du Québec — page « Engagements » (site officiel)', page:'https://plq.org/engagements/' },
  { party:'PCQ', type:'pdf',  url:'https://www.pcqorg.ca/wp-content/uploads/2026/08/Plateforme-eelectorale_version-finale-1-1.pdf',
    label:'Parti conservateur du Québec — Plateforme électorale 2026 (PDF officiel)', page:'https://conservateur.quebec/documents-officiels/' },
  { party:'PQ',  type:'html', url:'https://pq.org/',
    label:'Parti Québécois — site officiel', page:'https://pq.org/' },
];

const SYSTEM = `Tu extrais des ENGAGEMENTS ÉLECTORAUX d'un document de parti politique québécois, pour un site citoyen de veille non partisan.

Règles absolues :
- Chaque engagement doit être une CITATION LITTÉRALE du document, copiée mot pour mot. N'invente rien, ne reformule rien, ne résume rien.
- Choisis des engagements CONCRETS : montants, cibles chiffrées, créations ou abolitions, obligations. Évite les énoncés de principe et les phrases de vision.
- Une phrase complète et autonome par engagement (30 à 220 caractères).
- Attribue un thème court parmi : Santé, Logement, Transport, Éducation, Environnement, Économie, Fiscalité, Finances publiques, Famille, Immigration, Culture, Aînés, Énergie, Infrastructures, Justice, Agriculture.
- Neutralité : aucun commentaire, aucun jugement, aucune mise en contexte.

Réponds UNIQUEMENT avec un tableau JSON : [{"quote":"...","theme":"..."}]`;

const client = new Anthropic();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalisation pour la vérification : on ignore espaces, ponctuation et casse,
// car l'extraction PDF introduit des césures et des espaces parasites.
function normaliser(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç]/gi, '');
}

async function texteSource(src) {
  const res = await fetch(src.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (src.type === 'pdf') {
    const { text } = await pdfParse(Buffer.from(await res.arrayBuffer()));
    return text.replace(/\s+/g, ' ').trim();
  }
  const $ = cheerio.load(await res.text());
  $('script, style, nav, footer').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function extraire(src, texte) {
  const clip = texte.length > MAX_CHARS ? texte.slice(0, MAX_CHARS) : texte;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Parti : ${src.party}\nExtrais jusqu'à ${PAR_PARTI} engagements.\n\n${clip}` }],
  });
  const bloc = res.content.find((b) => b.type === 'text');
  if (!bloc) return [];
  try {
    const parsed = JSON.parse(bloc.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function traiterParti(src, ancien) {
  const texte = await texteSource(src);
  const empreinte = createHash('sha256').update(texte).digest('hex').slice(0, 16);
  const dejaVu = ancien.filter((p) => p.party === src.party);
  if (dejaVu.length && dejaVu[0].sourceHash === empreinte) {
    console.log(`  = ${src.party} : source inchangée, ${dejaVu.length} promesse(s) conservée(s).`);
    return dejaVu;
  }
  const brut = await extraire(src, texte);
  const gardes = [];
  let rejets = 0;
  const texteNorm = normaliser(texte);
  for (const p of brut) {
    const q = String(p.quote || '').trim();
    if (q.length < 30 || q.length > 260) { rejets++; continue; }
    // ⚠️ LE GARDE-FOU : la citation doit exister littéralement dans la source.
    if (!texteNorm.includes(normaliser(q))) { rejets++; continue; }
    gardes.push({
      id: `${src.party.toLowerCase()}-${createHash('sha256').update(q).digest('hex').slice(0, 8)}`,
      party: src.party,
      theme: String(p.theme || 'Économie').trim(),
      quote: q,
      sourceLabel: src.label,
      sourceUrl: src.page,
      sourceType: 'primaire',
      capturedAt: new Date().toISOString().slice(0, 10),
      sourceHash: empreinte,
    });
  }
  console.log(`  + ${src.party} : ${gardes.length} retenue(s), ${rejets} rejetée(s) (citation introuvable dans la source).`);
  return gardes;
}

async function main() {
  const ancien = existsSync(OUT_PATH) ? (JSON.parse(readFileSync(OUT_PATH, 'utf-8')).promises || []) : [];
  const manuelles = ancien.filter((p) => p.manual); // entrées saisies à la main (CAQ)
  const resultat = [];
  let echecs = 0;

  for (const src of SOURCES) {
    try {
      resultat.push(...(await traiterParti(src, ancien)));
    } catch (e) {
      echecs++;
      console.error(`  ⚠ ${src.party} : ${e.message} — anciennes promesses conservées.`);
      resultat.push(...ancien.filter((p) => p.party === src.party));
    }
    await sleep(600);
  }

  const toutes = [...resultat, ...manuelles];
  if (toutes.length === 0) throw new Error('aucune promesse — rien écrit, données précédentes conservées.');

  const data = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : {};
  data.election = data.election || '2026-10-05';
  data.note = "Promesses extraites automatiquement des plateformes officielles par scrapers/promises.js, PUIS vérifiées : toute citation introuvable mot pour mot dans le document source est rejetée. Les entrées marquées \"manual\": true sont saisies à la main (la CAQ bloque l'accès automatisé et n'a publié aucune plateforme consolidée). Règle du projet : jamais de verdict « tenue / brisée » — la promesse et l'action côte à côte, chacune sourcée.";
  data.promises = toutes;
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  console.log(`\n${toutes.length} promesse(s) écrite(s) dans ${OUT_PATH} (${echecs} source(s) en échec).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper promises.js :', err.message);
    process.exitCode = 1;
  });
}
