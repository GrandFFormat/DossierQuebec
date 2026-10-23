// Scraper — Conseil des ministres (liste officielle)
//
// Source : quebec.ca/premiere-ministre/equipe/conseil-des-ministres — HTML
// statique normal, un seul fetch (pas besoin de Playwright). Contient un
// <div class="ministre-item"> par personne, avec son nom et un ou plusieurs
// <p> listant chaque portefeuille/fonction.
//
// Cette page liste aussi 2 rôles qui ne sont PAS des ministres (Président du
// caucus du gouvernement, Whip en chef du gouvernement) — exclus ici, ce ne
// sont pas des sièges au Conseil des ministres.
//
// Le parti n'est pas indiqué sur cette page (gouvernement à parti unique
// actuellement) : résolu par recoupement avec data/deputes.json (vraie
// source), jamais supposé.
//
// Homonymie connue : deux personnes nommées "Eric Girard" siègent toutes les
// deux au Conseil des ministres (Finances, à Groulx ; Développement
// économique régional, à Lac-Saint-Jean — vérifié par recherche externe, voir
// contexte-pour-claude-code.md). La page ne donne pas la circonscription ;
// on applique donc ici la correspondance déjà vérifiée plutôt que de deviner.
//
// L'anglais (roleEn) n'existe pas sur cette page (site officiel FR/EN séparé,
// pas scrapé ici) : préservé depuis l'ancien tableau `ministers` par
// correspondance de nom quand disponible ; sinon, traduit manuellement dans
// MANUAL_EN_OVERRIDES ci-dessous (2 nouveaux ministres non couverts avant).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// Les anciens élus et leur parti (vote box, 22 oct. 2026).
const historique = (() => { try { return JSON.parse(readFileSync('data/elus-historique.json', 'utf8')).elus ?? {}; } catch { return {}; } })();
import * as cheerio from 'cheerio';

const PAGE_URL = 'https://www.quebec.ca/premier-ministre/equipe/conseil-des-ministres';   // l'adresse suit le titre (première → premier ministre, oct. 2026)
const HTML_PATH = 'gabarit.html';   // le MODÈLE, jamais servi : les pages en sont tirées
const OUT_PATH = 'data/ministers.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const START_MARKER = '/* MINISTERS_DATA_START';
const END_MARKER = '/* MINISTERS_DATA_END */';

// Rôles réels mais qui ne sont pas des postes de ministre — exclus du Conseil.
const NON_MINISTER_ROLES = ['président du caucus', 'whip en chef'];

// Vérifié par recherche externe (pas dans la page source) : voir le
// commentaire en tête de fichier.
const KNOWN_RIDING_BY_NAME_AND_ROLE = {
  'eric girard|ministre des finances': 'Groulx',
  'eric girard|ministre délégué au développement économique régional': 'Lac-Saint-Jean',
};

function foldName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-–—']/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadExistingRoleEn() {
  // Clé par nom COMPLET (avec suffixe "(Circonscription)" s'il est présent) en
  // priorité — deux personnes homonymes (les deux "Eric Girard") ont chacune
  // leur propre traduction, et les confondre via une clé par nom nu écraserait
  // silencieusement l'une des deux. Le nom nu ne sert de repli que si un seul
  // ministre porte ce nom (donc pas d'ambiguïté possible).
  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf('const ministers = [');
  const endIdx = html.indexOf('\n];', startIdx);
  const block = html.slice(startIdx, endIdx);
  const rows = [...block.matchAll(/\{name:'([^']+)', role:'((?:[^'\\]|\\.)*)', party:'([^']+)', roleEn:'((?:[^'\\]|\\.)*)'\}/g)];
  const bareNameCounts = new Map();
  for (const [, rawName] of rows) {
    const bareName = foldName(rawName.replace(/\s*\([^)]*\)\s*/g, '').trim());
    bareNameCounts.set(bareName, (bareNameCounts.get(bareName) ?? 0) + 1);
  }
  const roleEnByName = new Map();
  for (const [, rawName, , , rawRoleEn] of rows) {
    const roleEn = rawRoleEn.replace(/\\'/g, "'");
    roleEnByName.set(foldName(rawName), roleEn);
    const bareName = foldName(rawName.replace(/\s*\([^)]*\)\s*/g, '').trim());
    if (bareNameCounts.get(bareName) === 1) roleEnByName.set(bareName, roleEn);
  }
  return roleEnByName;
}

const MANUAL_EN_OVERRIDES = {
  'mathieu lacombe': 'Minister of Culture and Communications',
  'amelie dionne': 'Minister of Tourism',
};

// Le conseil lu sur l'Assemblée : la liste des député·e·s, puis la fiche de chacun·e. Une fonction
// ministérielle = « Premier ministre », « Vice-première ministre », « Ministre … » ou « Ministre
// délégué·e … » suivi de « depuis le <date> » dans « Fonctions actuelles ». Le nom passe de
// « Nom, Prénom » à « Prénom Nom » ; le parti vient de deputes.json. Ordre : premier ministre,
// vice-premier·ère ministre, puis l'ordre de la liste de l'Assemblée.
async function ministresAssnat(deputes) {
  const BASE = 'https://www.assnat.qc.ca';
  const lire = async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
    return r.text();
  };
  const $ = cheerio.load(await lire(`${BASE}/fr/deputes/index.html`));
  const fiches = [];
  $('a[href*="/fr/deputes/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/\/fr\/deputes\/[^/]+-(\d+)\/index\.html$/);
    if (m && !fiches.some((f) => f.id === Number(m[1]))) fiches.push({ id: Number(m[1]), url: href.startsWith('http') ? href : BASE + href, nom: $(a).text().replace(/\s+/g, ' ').trim() });
  });
  const lus = [];
  for (const f of fiches) {
    const texte = cheerio.load(await lire(f.url))('body').text().replace(/\s+/g, ' ');
    const i = texte.indexOf('Fonctions actuelles');
    if (i < 0) continue;
    const bloc = texte.slice(i + 'Fonctions actuelles'.length, i + 3000).split(/ (?:Réélue?|Élue?) députée? /)[0];
    const roles = [...bloc.matchAll(/((?:Premier|Première|Vice-premier|Vice-première)? ?[Mm]inistre[^]*?) depuis le \d+(?:er)? \S+ \d{4}/g)]
      .map((m) => m[1].trim())
      .filter((r) => !NON_MINISTER_ROLES.some((x) => r.toLowerCase().includes(x)));
    if (!roles.length) continue;
    const [nomFamille, prenom] = f.nom.split(',').map((x) => x.trim());
    const name = prenom ? `${prenom} ${nomFamille}` : f.nom;
    const dep = deputes.find((d) => d.assnatId === f.id) ?? deputes.find((d) => foldName(d.name) === foldName(name));
    lus.push({ name, role: roles.join(' · '), roleEn: null, party: dep?.party ?? null });
    await new Promise((r) => setTimeout(r, 250));
  }
  const rang = (m) => (/^Premi(er|ère) ministre/.test(m.role) ? 0 : /^Vice-premi/.test(m.role) ? 1 : 2);
  return lus.map((m, i) => ({ m, i })).sort((a, b) => rang(a.m) - rang(b.m) || a.i - b.i).map(({ m }) => m);
}

async function main() {
  const roleEnByName = loadExistingRoleEn();
  const { deputes } = JSON.parse(readFileSync('data/deputes.json', 'utf-8'));

  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const ministers = [];
  const warnings = [];

  $('.ministre-item').each((_, el) => {
    const name = $(el).find('h3').first().text().replace(/\s+/g, ' ').trim();
    const roles = $(el).find('.description-ministre p').map((_, p) => $(p).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
    if (roles.length === 0) return;

    const isNonMinister = roles.every((r) => NON_MINISTER_ROLES.some((nm) => r.toLowerCase().includes(nm)));
    if (isNonMinister) return;

    const ridingHint = KNOWN_RIDING_BY_NAME_AND_ROLE[`${foldName(name)}|${roles[0].toLowerCase()}`] ?? null;
    const candidates = deputes.filter((d) => foldName(d.name) === foldName(name));
    const dep = ridingHint ? candidates.find((d) => d.riding === ridingHint) : (candidates.length === 1 ? candidates[0] : null);
    if (!dep) warnings.push(`${name} : aucune correspondance fiable dans deputes.json (parti laissé à null)`);

    const displayName = ridingHint ? `${name} (${ridingHint})` : name;
    const role = roles.join(' · ');
    const roleEn = roleEnByName.get(foldName(displayName)) ?? roleEnByName.get(foldName(name)) ?? MANUAL_EN_OVERRIDES[foldName(name)] ?? null;
    if (!roleEn) warnings.push(`${name} : pas de traduction anglaise connue (ni ancienne, ni manuelle) — laissé à null`);

    // Un·e ministre sortant·e qui n'a pas été réélu·e n'est plus dans deputes.json : son parti vient
    // alors de data/elus-historique.json (le parti sous lequel la personne a siégé), si tous les homonymes
    // nom y est unique. Sans ça, la pastille du parti restait vide (22 oct. 2026).
    let parti = dep ? dep.party : null;
    if (!parti) {
      const histo = Object.values(historique).filter((e) => foldName(e.name) === foldName(name));
      const partis = [...new Set(histo.map((e) => e.party).filter(Boolean))];
      if (partis.length === 1) parti = partis[0];   // un seul parti possible, même pour des homonymes
    }
    ministers.push({ name: displayName, role, roleEn, party: parti });
  });

  // Entre deux gouvernements, la page se vide (22 oct. 2026 : nouveau premier ministre, conseil pas
  // encore nommé). On garde alors la liste précédente plutôt que d'écrire 0 ministre, qui ferait
  // échouer toute la tournée ; elle sera remplacée dès que la page affichera le nouveau conseil.
  // Page de quebec.ca vide : le conseil peut être nommé quand même (21 oct. 2026). On le lit alors
  // sur les fiches des député·e·s de l'Assemblée (« Fonctions actuelles », chaque « Ministre … depuis
  // le … »). Rien sur l'Assemblée non plus : la liste précédente est gardée.
  let source = PAGE_URL;
  if (ministers.length === 0) {
    const lus = await ministresAssnat(deputes);
    if (lus.length) {
      ministers.push(...lus);
      source = 'https://www.assnat.qc.ca/fr/deputes/index.html (fonctions actuelles de chaque député·e)';
      console.log(`Page de quebec.ca vide : ${lus.length} ministres lus sur les fiches de l'Assemblée.`);
    }
  }
  if (ministers.length === 0) {
    console.log(`⚠ Aucun ministre sur ${PAGE_URL} ni sur l'Assemblée : ${OUT_PATH} gardé tel quel.`);
    return;
  }
  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ source, scrapedAt: new Date().toISOString(), count: ministers.length, ministers }, null, 2));

  console.log(`${ministers.length} ministres écrits dans ${OUT_PATH}`);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
}

main().catch((err) => {
  console.error('Échec du scraper ministers.js :', err);
  process.exitCode = 1;
});
