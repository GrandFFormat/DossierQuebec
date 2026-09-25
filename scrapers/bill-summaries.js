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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

const BILLS_PATH = 'data/bills.json';
const PETITIONS_PATH = 'data/petitions.json';
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

async function downloadPdfRaw(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en téléchargeant le PDF`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return (await pdfParse(buffer)).text;
}
async function downloadPdfText(url) {
  return (await downloadPdfRaw(url)).replace(/\s+/g, ' ').trim();
}

// --- Omnibus (25 sept. 2026) ------------------------------------------------
// Un projet de loi québécois se termine par la liste officielle de ce qu'il touche :
// « LOIS MODIFIÉES PAR CE PROJET DE LOI : », « RÈGLEMENTS MODIFIÉS… », « LOI ABROGÉE… ».
// On la relève pour tous les projets (texte public, aucun coût d'API) : la carte dit
// « Touche N lois ». Presque tout projet modifie quelques lois au passage ; on ne parle
// d'omnibus que quand l'Assemblée l'annonce elle-même dans le titre (« diverses
// dispositions », « d'autres dispositions ») ET que la liste compte au moins 3 textes, ou
// quand elle en compte au moins 10 (un titre « diverses dispositions » sur 2 lois n'en est pas un).
// Pour ceux-là, et pour tout texte trop long pour être lu en entier, le résumé part des
// NOTES EXPLICATIVES, qui décrivent officiellement tout le projet, au lieu d'un texte
// coupé à 60 000 caractères : un résumé tronqué laissait croire au lecteur qu'il avait
// tout le projet (PL 11 : 74 lois touchées, 92 000 caractères).
const ENTETE_LISTE = /(LOIS?|RÈGLEMENTS?|CODES?|CHARTES?|DÉCRETS?)[^\n]{0,40}(MODIFIÉ|ABROGÉ|ÉDICTÉ|REMPLAC)[^\n]*PAR CE PROJET DE LOI\s*:?/g;
const SEUIL_OMNIBUS = 10;
export function analyserTexteLoi(brut, titre) {
  const entetes = [...brut.matchAll(ENTETE_LISTE)];
  const lois = [];
  for (const [i, m] of entetes.entries()) {
    const debut = m.index + m[0].length;
    const fin = i + 1 < entetes.length ? entetes[i + 1].index : Math.min(brut.length, debut + 8000);
    for (const morceau of brut.slice(debut, fin).split(/\n(?=\s*[–—-]\s)/)) {
      const x = morceau.replace(/\s+/g, ' ').trim().replace(/^[–—-]\s*/, '');
      if (/^(Loi|Code|Charte|Règlement|Décret)/.test(x)) lois.push(x.split(/ ?\((chapitre|RLRQ|c\. )/)[0].trim().slice(0, 200));
    }
  }
  const uniques = [...new Set(lois)];
  const d = brut.search(/NOTES? EXPLICATIVES?/i);
  const f = entetes.length ? entetes[0].index : -1;
  const notes = d >= 0 && f > d ? brut.slice(d, f).replace(/\s+/g, ' ').trim() : null;
  const annonce = /diverses dispositions|d[’']autres dispositions/i.test(titre || '');
  return { lois: uniques, notes, omnibus: (annonce && uniques.length >= 3) || uniques.length >= SEUIL_OMNIBUS };
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

// Un omnibus, ou un texte trop long pour être lu en entier : on résume les notes explicatives,
// qui couvrent tout le projet, avec la liste officielle des lois touchées.
const doitPartirDesNotes = (bill, longueur) => (bill.omnibus || longueur > MAX_PDF_CHARS);

// Un omnibus n'a PAS le plafond de 7 puces (Martin, 25 sept. 2026 : « sur ON, les omnibus, on
// met les annexes et on étend le texte passé 10 lignes ») : un aperçu, puis les changements
// regroupés par loi touchée. Chaque puce reste une ligne « - » : l'affichage n'a rien à apprendre.
const SYSTEM_OMNIBUS = SYSTEM_PROMPT
  .replace(/Format obligatoire :[\s\S]*?Pas de phrase d'intro ni de conclusion — seulement les puces\./,
    `Format obligatoire (projet de loi OMNIBUS : il touche plusieurs lois) :
- D'abord 1 ou 2 puces d'aperçu : ce que le projet fait dans l'ensemble.
- Puis, pour chaque loi ou groupe de lois dont le changement compte pour le public, une puce qui commence par le nom court de la loi suivi de « : » (ex. « - Loi sur le bâtiment : … »). Plusieurs puces par loi si nécessaire.
- Pas de plafond de puces : couvre TOUT le projet, pas seulement ce que le titre annonce. Regroupe en une puce les simples ajustements techniques de concordance.
- Chaque ligne = une seule idée concrète, en langage simple, 25 mots au plus.
- Pas de phrase d'intro ni de conclusion — seulement les puces.`);

async function summarizeFromNotes(title, notes, lois, omnibus) {
  const userContent = `Titre : ${title}\n\n[Projet de loi qui touche ${lois.length} lois ou règlements. Tu reçois ses NOTES EXPLICATIVES officielles, qui décrivent tout le projet, et la liste des textes touchés. Couvre l'ensemble du projet, pas seulement son sujet principal : si le titre n'annonce qu'une partie, les puces doivent aussi dire le reste.]\n\nNOTES EXPLICATIVES :\n${notes.slice(0, MAX_PDF_CHARS)}\n\nTEXTES TOUCHÉS :\n${lois.map((l) => `- ${l}`).join('\n')}`;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: omnibus ? 3000 : 700,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: omnibus ? SYSTEM_OMNIBUS : SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : null;
}

// Relève la liste officielle des lois touchées (sans API). Refait seulement si le PDF change.
async function releverLois(bill) {
  if (!bill.presentationPdfUrl) return null;
  if (bill.loisSource === bill.presentationPdfUrl && Array.isArray(bill.loisTouchees)) return null;
  const brut = await downloadPdfRaw(bill.presentationPdfUrl);
  const a = analyserTexteLoi(brut, bill.title);
  bill.loisTouchees = a.lois;
  bill.omnibus = a.omnibus;
  bill.loisSource = bill.presentationPdfUrl;
  return { brut, ...a };
}

async function summarizeBill(bill) {
  if (!bill.presentationPdfUrl) return { skipped: 'pas de PDF trouvé' };

  const brut = await downloadPdfRaw(bill.presentationPdfUrl);
  const pdfText = brut.replace(/\s+/g, ' ').trim();
  if (pdfText.length < 200) return { skipped: 'texte extrait trop court/vide' };
  const a = analyserTexteLoi(brut, bill.title);
  bill.loisTouchees = a.lois;
  bill.omnibus = a.omnibus;
  bill.loisSource = bill.presentationPdfUrl;

  const parNotes = doitPartirDesNotes(bill, pdfText.length) && a.notes && a.notes.length > 300;
  const summary = parNotes ? await summarizeFromNotes(bill.title, a.notes, a.lois, a.omnibus) : await summarizeText(bill.title, pdfText);
  if (!summary) return { skipped: 'réponse vide du modèle' };

  bill.summary = summary;
  bill.summaryAiGenerated = true;
  bill.summaryFrom = parNotes ? 'notes' : (pdfText.length > MAX_PDF_CHARS ? 'texte-tronque' : 'texte');
  bill.summarySource = parNotes
    ? 'notes explicatives du texte tel que présenté (PDF), qui couvrent tout le projet ; peut différer de la version finale amendée'
    : 'texte tel que présenté (PDF), peut différer de la version finale amendée';
  bill.summaryGeneratedAt = new Date().toISOString();
  return { summarized: true };
}

// --- Traduction EN (titre + résumé + note) -------------------------------
// Le titre et la note officiels sont en français ; le résumé est déjà généré
// par IA en français. On les traduit vers l'anglais pour l'affichage bilingue.
// Incrémental : on ne (re)traduit un projet que si son contenu source a changé
// (signature enSource), donc pas de coût ni de churn quotidien inutile.
const TRANSLATE_SYSTEM = `You are a professional French-to-English translator for an independent, non-partisan citizen watchdog site about Québec's National Assembly. Translate faithfully, neutrally and into clear, natural Canadian English. Do NOT add, omit, interpret or editorialize. If the source has bullet lines starting with "- ", keep exactly the same bullets, one idea per line, same order. Return ONLY valid JSON (no code fence, no preamble).`;

function enSignature(bill) {
  return `${bill.title || ''}${bill.summary || ''}${bill.note || ''}`;
}

async function translateBill(bill) {
  const source = enSignature(bill);
  if (bill.enSource === source && bill.titleEn) return { skipped: 'déjà à jour' };

  const parts = [`French title: ${bill.title || ''}`];
  if (bill.summary) parts.push(`French summary (keep the "- " bullets, one idea per line):\n${bill.summary}`);
  if (bill.note) parts.push(`French status note: ${bill.note}`);
  const wanted = ['"titleEn"'];
  if (bill.summary) wanted.push('"summaryEn"');
  if (bill.note) wanted.push('"noteEn"');
  parts.push(`Return a JSON object with exactly these keys: ${wanted.join(', ')}.`);

  const response = await client.messages.create({
    model: MODEL,
    // Un résumé d'omnibus peut compter une trentaine de puces : 700 jetons le coupaient.
    max_tokens: bill.omnibus ? 3500 : 700,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: TRANSLATE_SYSTEM,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return { skipped: 'réponse vide du modèle' };
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    return { skipped: 'JSON invalide' };
  }

  bill.titleEn = (parsed.titleEn && String(parsed.titleEn).trim()) || bill.title;
  bill.summaryEn = bill.summary ? ((parsed.summaryEn && String(parsed.summaryEn).trim()) || null) : null;
  bill.noteEn = bill.note ? ((parsed.noteEn && String(parsed.noteEn).trim()) || null) : null;
  bill.enSource = source;
  return { translated: true };
}

// Traduit le titre d'une pétition (best effort, incrémental via enSource=titre).
async function translatePetitionTitle(p) {
  if (p.enSource === p.title && p.titleEn) return { skipped: 'déjà à jour' };
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: TRANSLATE_SYSTEM,
    messages: [{ role: 'user', content: `French petition title: ${p.title}\n\nReturn a JSON object with exactly this key: "titleEn".` }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return { skipped: 'réponse vide du modèle' };
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { skipped: 'JSON invalide' };
  }
  p.titleEn = (parsed.titleEn && String(parsed.titleEn).trim()) || p.title;
  p.enSource = p.title;
  return { translated: true };
}

// Passe best effort : traduit les titres de pétitions (data/petitions.json).
// Séparée de main() sur les projets de loi ; ne bloque jamais si le fichier
// n'existe pas encore (le scraper petitions.js tourne avant, mais on reste sûr).
async function translatePetitions() {
  if (!existsSync(PETITIONS_PATH)) return;
  const pdata = JSON.parse(readFileSync(PETITIONS_PATH, 'utf-8'));
  const targets = (pdata.petitions || []).filter((p) => p.enSource !== p.title || !p.titleEn);
  if (targets.length === 0) return;
  console.log(`\n${targets.length} titre(s) de pétition à traduire en anglais.`);
  let done = 0;
  for (const p of targets) {
    try {
      const r = await translatePetitionTitle(p);
      if (r.translated) done++;
    } catch (err) {
      console.error(`  ⚠ pétition ${p.id} : ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  writeFileSync(PETITIONS_PATH, JSON.stringify(pdata, null, 2));
  console.log(`Traduction des pétitions terminée. ${done} traduit(s).`);
}

async function main() {
  const data = JSON.parse(readFileSync(BILLS_PATH, 'utf-8'));

  // --- Passe 0 : les lois touchées, pour TOUS les projets (texte public, sans API) ---
  const aRelever = data.bills.filter((b) => b.presentationPdfUrl && !(b.loisSource === b.presentationPdfUrl && Array.isArray(b.loisTouchees)));
  if (aRelever.length) console.log(`${aRelever.length} projet(s) : relevé des lois touchées.`);
  const texteLong = new Set();   // ids dont le texte dépasse ce que le résumé lit
  for (const [i, bill] of aRelever.entries()) {
    try {
      const r = await releverLois(bill);
      if (r && r.brut.replace(/\s+/g, ' ').length > MAX_PDF_CHARS) texteLong.add(bill.id);
    } catch (err) {
      console.error(`  ⚠ lois de PL ${bill.num} (id ${bill.id}) : ${err.message}`);
    }
    if ((i + 1) % 20 === 0) writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));
    await sleep(REQUEST_DELAY_MS);
  }
  if (aRelever.length) writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));

  // Un résumé déjà fait sur un texte coupé, ou sur un omnibus lu en entier au lieu de ses notes :
  // on le refait une fois depuis les notes explicatives (summaryFrom le retient ensuite).
  const aRefaire = (b) => b.summary && b.summaryFrom !== 'notes' && (b.omnibus || texteLong.has(b.id) || b.summaryFrom === 'texte-tronque');
  const targets = data.bills.filter((b) => b.status !== 'laisse_de_cote' && (!b.summary || aRefaire(b)));
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

  // --- Passe 2 : traduction EN (incrémentale) ---
  // Limite propre à cette passe : NE PAS réutiliser `limit` (calculé sur les
  // candidats FR, souvent 0 puisque les résumés existent déjà).
  const trLimit = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : data.bills.length;
  // Contrairement au résumé (qu'on ne génère pas pour les projets « laissés de
  // côté »), on traduit le TITRE de TOUS les projets : ils apparaissent dans la
  // liste « Tous » et afficheraient sinon un titre français en mode anglais.
  const trTargets = data.bills.filter((b) => enSignature(b) !== b.enSource);
  const trBills = trTargets.slice(0, trLimit);
  console.log(`\n${trBills.length} projets de loi à traduire en anglais (titre/résumé/note).`);

  let trDone = 0;
  let trSkipped = 0;
  let trErrors = 0;

  for (const [i, bill] of trBills.entries()) {
    try {
      const result = await translateBill(bill);
      if (result.translated) trDone++;
      else {
        trSkipped++;
        console.log(`  ⏭ PL ${bill.num} (id ${bill.id}) : ${result.skipped}`);
      }
    } catch (err) {
      trErrors++;
      console.error(`  ⚠ PL ${bill.num} (id ${bill.id}) : ${err.message}`);
    }

    if ((i + 1) % 10 === 0) {
      writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));
      console.log(`  ...${i + 1}/${trBills.length} (sauvegardé)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  writeFileSync(BILLS_PATH, JSON.stringify(data, null, 2));
  console.log(`Traduction EN terminée. ${trDone} traduits, ${trSkipped} ignorés, ${trErrors} erreurs.`);

  // --- Passe 3 : titres de pétitions (best effort) ---
  await translatePetitions();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper bill-summaries.js :', err);
    process.exitCode = 1;
  });
}
