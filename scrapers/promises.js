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
// ⚠️ PLAFOND ÉGAL POUR TOUS LES PARTIS — c'est une décision éditoriale, pas une
// limite technique. Les partis ne publient pas au même rythme : QS et le PCQ ont
// une plateforme de 100 pages, le PQ sort une annonce tous les deux jours. Sans
// plafond commun, le premier essai a donné PQ 25 contre QS 5 — un déséquilibre
// entièrement fabriqué par notre méthode, que le lecteur aurait mis au compte
// des partis. On retient donc au plus PAR_PARTI engagements par parti, les plus
// récents d'abord pour les fils d'annonces.
const PAR_PARTI = 8;

// Sources accessibles seulement.
//
// ⚠️ La CAQ est absente et ne doit PAS être ajoutée telle quelle : le robots.txt
// de coalitionavenirquebec.org nomme `ClaudeBot` et lui interdit tout le site.
// Notre User-Agent est différent, donc techniquement on passerait — c'est
// précisément pour ça qu'on s'abstient. Ne l'ajouter ici que si le parti publie
// un document ouvert ou accorde une autorisation explicite.
//
// Deux formes de source, parce que les partis ne publient pas de la même façon :
//   - `pdf` / `html` : un document consolidé, lu d'un coup (QS, PCQ, PLQ) ;
//   - `sitemap`      : un fil d'annonces, lu page par page (PQ).
// Cette deuxième forme n'est pas un luxe. Le PQ ne publie pas de plateforme :
// ses engagements sortent une annonce à la fois. En lisant seulement sa page
// d'accueil, on n'attrapait que ce qui traînait en vitrine le jour du passage —
// d'où 2 promesses au PQ contre 6 aux partis à plateforme. Cet écart venait de
// NOTRE méthode, pas des partis, et sur un site qui se veut non partisan c'est
// exactement le genre de biais qu'un lecteur attribuerait au parti.
const SOURCES = [
  { party:'QS',  type:'pdf',  url:'https://cdn.prod.website-files.com/6a58006e8d06c0d8d7cc521d/6a9c07ae1aa790d59dc5ccee_Cestpossible_PlateformeQs2026-WEB.pdf',
    label:'Québec solidaire — Plateforme électorale 2026 (PDF officiel)', page:'https://quebecsolidaire.net/' },
  { party:'PLQ', type:'html', url:'https://plq.org/engagements/',
    label:'Parti libéral du Québec — page « Engagements » (site officiel)', page:'https://plq.org/engagements/' },
  { party:'PCQ', type:'pdf',  url:'https://www.pcqorg.ca/wp-content/uploads/2026/08/Plateforme-eelectorale_version-finale-1-1.pdf',
    label:'Parti conservateur du Québec — Plateforme électorale 2026 (PDF officiel)', page:'https://conservateur.quebec/documents-officiels/' },
  { party:'PQ',  type:'sitemap', sitemap:'https://pq.org/nouvelles-sitemap.xml',
    depuis:'2026-08-27',                              // dissolution = début de la campagne
    exclure:/candidat|candidatur|investiture/i,       // investitures : pas des engagements
    parPage:1, maxPages:20,
    label:'Parti Québécois — annonce de campagne (site officiel)', page:'https://pq.org/nouvelles/' },
];

const SYSTEM = `Tu extrais des ENGAGEMENTS ÉLECTORAUX d'un document de parti politique québécois, pour un site citoyen de veille non partisan.

Règles absolues :
- Chaque engagement doit être une CITATION LITTÉRALE du document, copiée mot pour mot. N'invente rien, ne reformule rien, ne résume rien.
- Choisis des engagements CONCRETS : montants, cibles chiffrées, créations ou abolitions, obligations. Évite les énoncés de principe et les phrases de vision.
- Une phrase complète et AUTONOME par engagement (30 à 220 caractères). Elle sera affichée seule sur une carte, sans le texte autour : le lecteur doit comprendre QUI s'engage à QUOI sans rien d'autre. Ne commence donc JAMAIS une citation au milieu d'une phrase. Interdits : commencer par un pronom (« il portera… »), par un verbe sans sujet (« réduira les coûts… »), par une subordonnée (« En encourageant nos entreprises… ») ou par un groupe nominal sans verbe (« un remboursement de TVQ pour les acheteurs… »). Si la phrase source est trop longue ou mal découpable, choisis un AUTRE engagement plutôt que de la tronquer.
- Attribue un thème court parmi : Santé, Logement, Transport, Éducation, Environnement, Économie, Fiscalité, Finances publiques, Famille, Immigration, Culture, Aînés, Énergie, Infrastructures, Justice, Agriculture.
- Neutralité : aucun commentaire, aucun jugement, aucune mise en contexte.

Réponds UNIQUEMENT avec un tableau JSON : [{"quote":"...","theme":"..."}]`;

const client = new Anthropic();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Aides de mise au point : PROMISES_DEBUG=1 affiche chaque citation rejetée et
// pourquoi ; PROMISES_ONLY=QS ne traite qu'un parti. Sans elles, un rejet massif
// est invisible — on voit « 0 retenue » sans savoir ce qui a été jeté.
const DEBUG = process.env.PROMISES_DEBUG === '1';
const SEUL = process.env.PROMISES_ONLY || '';

// Une citation doit tenir debout seule sur une carte. Une phrase tronquée en son
// milieu (« un remboursement de TVQ pour… », « il portera aussi les crédits… »)
// est exacte mais illisible hors de son paragraphe.
// ⚠️ Ne PAS exiger une majuscule initiale : les plateformes sont souvent écrites
// en puces commençant par un verbe à l'infinitif en minuscule (« instaurer une
// assurance dentaire… »). Exiger la majuscule a fait tomber Québec solidaire de
// 8 promesses à 0 d'un coup. On rejette donc les DÉBUTS DE CONTINUATION plutôt
// que d'imposer une forme.
// Deux tests, dans cet ordre :
//   1. un début de continuation (pronom, conjonction) = fragment, quoi qu'il suive ;
//   2. sinon, une majuscule ou un chiffre = début de phrase, on accepte ;
//   3. sinon, on exige un verbe conjugué — ce qui distingue « un gouvernement
//      solidaire AUGMENTERA le salaire minimum » (phrase entière) de « un
//      remboursement de TVQ pour les premiers acheteurs » (groupe nominal).
// ⚠️ Ne PAS écrire \w dans VERBE : en JavaScript, \w exclut les lettres
// accentuées, et « créera » passait alors inaperçu.
const CONTINUATION = /^(et|ou|mais|car|donc|or|ni|ainsi|puis|aussi|qui|que|qu[’']|dont|il|elle|ils|elles|on|ce|cet|cette|ces|cela|ça|celui|celle|ceux|leur|leurs)\s/i;
const VERBE = /[a-zà-ÿ]{2,}(ra|ront|rons|rait|raient)\b|\b(est|sont|sera|seront|ont|aura|auront|va|vont|doit|doivent|peut|peuvent|veut|veulent|met|mettent|fait|font)\b/i;
// Un verbe conjugué en tête, sans sujet, est aussi un fragment : « réduira de
// manière récurrente les coûts… » — on ne sait pas qui réduit.
const VERBE_EN_TETE = /^[a-zà-ÿ]{2,}(ra|ront|rons|rait|raient)\s/i;
// Une subordonnée en tête aussi : « En encourageant fiscalement nos entreprises… »
const SUBORDONNEE = /^(en|afin|pour|dans le but|grâce|malgré|selon|parce|puisque|lorsque|quand|si)\s+\w+(ant|er|ir)\b/i;
function autonome(q) {
  if (CONTINUATION.test(q)) return false;
  if (VERBE_EN_TETE.test(q)) return false;
  if (SUBORDONNEE.test(q)) return false;
  if (/^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9]/.test(q)) return true;
  return VERBE.test(q);
}

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

// Liste les pages d'un fil d'annonces, filtrées par date et débarrassées du
// bruit (annonces de candidatures). Les plus récentes d'abord.
async function pagesDuFil(src) {
  const res = await fetch(src.sitemap, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} (sitemap)`);
  const xml = await res.text();
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map((m) => ({ url: m[1], date: (m[2] || '').slice(0, 10) }))
    .filter((p) => !src.depuis || p.date >= src.depuis)
    .filter((p) => !src.exclure || !src.exclure.test(p.url))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, src.maxPages || 20);
}

async function textePage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());
  $('script, style, nav, footer, header, aside').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function extraire(src, texte, combien = PAR_PARTI) {
  const clip = texte.length > MAX_CHARS ? texte.slice(0, MAX_CHARS) : texte;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Parti : ${src.party}\nExtrais jusqu'à ${combien} engagements.\n\n${clip}` }],
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
  const { gardes, rejets } = await verifier(src, texte, empreinte, src.page, src.label);
  console.log(`  + ${src.party} : ${gardes.length} retenue(s), ${rejets} rejetée(s) (citation introuvable dans la source).`);
  return gardes;
}

// Extraction PUIS vérification. Séparé pour être partagé entre un document
// consolidé et une page de fil d'annonces — le garde-fou doit être le même.
async function verifier(src, texte, empreinte, url, label, combien) {
  const brut = await extraire(src, texte, combien);
  const gardes = [];
  let rejets = 0;
  const texteNorm = normaliser(texte);
  for (const p of brut) {
    const q = String(p.quote || '').trim();
    const jeter = (raison) => { rejets++; if (DEBUG) console.log(`      ✗ [${raison}] ${q.slice(0, 90)}`); };
    if (q.length < 30 || q.length > 260) { jeter('longueur'); continue; }
    // La citation doit tenir debout seule. Une phrase tronquée en son milieu
    // (« un remboursement de TVQ pour… », « il portera aussi les crédits… ») est
    // exacte mais illisible sortie de son paragraphe : sur une carte, le lecteur
    // ne sait plus de quoi ni de qui on parle. Test simple : commencer par une
    // majuscule ou un chiffre. Ça n'attrape pas tout — une subordonnée comme
    // « En encourageant… » passe — mais ça élimine les pires.
    if (!autonome(q)) { jeter('fragment'); continue; }
    // ⚠️ LE GARDE-FOU : la citation doit exister littéralement dans la source.
    if (!texteNorm.includes(normaliser(q))) { jeter('introuvable dans la source'); continue; }
    gardes.push({
      id: `${src.party.toLowerCase()}-${createHash('sha256').update(q).digest('hex').slice(0, 8)}`,
      party: src.party,
      theme: String(p.theme || 'Économie').trim(),
      quote: q,
      sourceLabel: label,
      sourceUrl: url,
      sourceType: 'primaire',
      capturedAt: new Date().toISOString().slice(0, 10),
      sourceHash: empreinte,
    });
  }
  return { gardes, rejets };
}

// Parti sans plateforme consolidée : on lit son fil d'annonces, une page à la
// fois. Chaque promesse pointe alors vers L'ANNONCE PRÉCISE d'où elle sort, et
// non vers l'accueil du parti — le lecteur peut vérifier en un clic.
// Incrémental page par page : une page déjà lue n'est jamais repayée, même si
// elle n'avait donné aucune promesse (`pagesVues`).
async function traiterFil(src, ancien, pagesVues) {
  const pages = await pagesDuFil(src);
  const gardes = [];
  let rejets = 0, reutilisees = 0, nouvelles = 0, ignorees = 0;

  for (const p of pages) {
    let texte;
    try { texte = await textePage(p.url); }
    catch (e) { console.error(`    ⚠ ${p.url} : ${e.message} — page ignorée.`); continue; }
    const empreinte = createHash('sha256').update(texte).digest('hex').slice(0, 16);

    const deja = ancien.filter((x) => x.party === src.party && x.sourceHash === empreinte);
    if (deja.length) { gardes.push(...deja); reutilisees += deja.length; continue; }
    if (pagesVues.includes(empreinte)) { ignorees++; continue; } // lue, sans engagement retenu

    const label = `${src.label} — ${p.date}`;
    const r = await verifier(src, texte, empreinte, p.url, label, src.parPage || 2);
    gardes.push(...r.gardes);
    rejets += r.rejets;
    nouvelles += r.gardes.length;
    pagesVues.push(empreinte);
    await sleep(600);
  }

  // Plafond commun : les annonces sont triées de la plus récente à la plus
  // ancienne, donc on garde les plus récentes.
  const retenues = gardes.slice(0, PAR_PARTI);
  console.log(`  + ${src.party} : ${pages.length} annonce(s) depuis le ${src.depuis} — ${nouvelles} nouvelle(s), ${reutilisees} conservée(s), ${ignorees} page(s) déjà vue(s) sans engagement, ${rejets} rejetée(s) → ${retenues.length} publiée(s) (plafond ${PAR_PARTI}).`);
  return retenues;
}

async function main() {
  const avant = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : {};
  const ancien = avant.promises || [];
  const pagesVues = Array.isArray(avant.pagesVues) ? [...avant.pagesVues] : [];
  // ⚠️ Plus aucune entrée manuelle depuis le 2026-09-09. Le mécanisme reste, mais
  // une entrée `manual` échappe au garde-fou ET survit à toutes les exécutions :
  // elle n'est donc jamais réexaminée. N'en ajouter qu'en toute connaissance de
  // cause — c'est comme ça qu'une citation de presse non autorisée a survécu à
  // une dizaine de rafraîchissements sans que personne ne la revoie.
  const manuelles = ancien.filter((p) => p.manual);
  const resultat = [];
  let echecs = 0;

  for (const src of SOURCES) {
    if (SEUL && src.party !== SEUL) { resultat.push(...ancien.filter((p) => p.party === src.party)); continue; }
    try {
      resultat.push(...(src.type === 'sitemap'
        ? await traiterFil(src, ancien, pagesVues)
        : await traiterParti(src, ancien)));
    } catch (e) {
      echecs++;
      console.error(`  ⚠ ${src.party} : ${e.message} — anciennes promesses conservées.`);
      resultat.push(...ancien.filter((p) => p.party === src.party));
    }
    await sleep(600);
  }

  const toutes = [...resultat, ...manuelles];
  if (toutes.length === 0) throw new Error('aucune promesse — rien écrit, données précédentes conservées.');

  const data = { ...avant };
  data.election = data.election || '2026-10-05';
  data.note = "Promesses extraites automatiquement des documents officiels des partis par scrapers/promises.js, PUIS vérifiées : toute citation introuvable mot pour mot dans la source est rejetée. UNIQUEMENT des sources primaires. Aucune citation de presse : les médias québécois ont retiré leur contenu de l'usage par IA et les demandes d'autorisation sont restées sans réponse. La CAQ est absente : son robots.txt interdit nommément ClaudeBot, et on ne contourne pas un refus explicite. Les partis sans plateforme consolidée (PQ) sont lus via leur fil d'annonces, chaque promesse pointant vers l'annonce d'où elle sort. Règle du projet : jamais de verdict « tenue / brisée » — la promesse et l'action côte à côte, chacune sourcée.";
  data.promises = toutes;
  data.pagesVues = pagesVues.slice(-400); // évite de repayer une page déjà lue
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  console.log(`\n${toutes.length} promesse(s) écrite(s) dans ${OUT_PATH} (${echecs} source(s) en échec).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Échec du scraper promises.js :', err.message);
    process.exitCode = 1;
  });
}
