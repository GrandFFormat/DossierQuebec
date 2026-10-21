// Scraper — Consultations en commission et mémoires déposés (21 oct. 2026)
//
// Deux outils de l'abonnement lisent ce fichier : « Échéances des consultations » et « Qui a déposé
// un mémoire sur quoi ». Source : assnat.qc.ca, trois sortes de pages HTML statiques, vérifiées à la
// main le 21 oct. 2026 sur les projets de loi de la 43e législature :
//   1. la fiche du projet de loi (`bill.url`) : chaque étape faite en commission renvoie à son mandat,
//      /fr/travaux-parlementaires/mandats/Mandat-NNNNN/index.html ;
//   2. la page du mandat (redirigée vers /commissions/<sigle>/mandats/Mandat-NNNNN/index.html) : le
//      nom de la commission (h1), le titre du mandat (h2.titre2TravauxParl), les dates des séances
//      (h4 « Le mardi 10 février 2026 ») et, s'il y en a, un lien « memoires-deposes.html » ;
//   3. la page des mémoires : un tableau #ListeMemoires (date, déposé par, titre avec lien PDF, numéro).
//
// LA DATE LIMITE : aucune page lue ne la publiait (ni consultations particulières, sur invitation, ni
// la consultation générale du PL 1, dont l'avis paraît à la Gazette officielle et dans les journaux).
// On la cherche quand même sur la page du mandat (« date limite », « au plus tard le ») : si elle est
// écrite un jour, elle est prise ; sinon `dateLimite` reste null et le site le dit. Rien d'inventé.
//
// PAS DANS data/ : la liste est réservée aux abonné·e·s. Le fichier est écrit dans
// api/consultations-data.json, un chemin que Vercel ne sert pas (comme api/feed-data.xml) ; les
// fonctions export.js et infolettre-envoi.js l'embarquent par « includeFiles » (vercel.json). Seul le
// NOMBRE de mémoires par projet de loi devient public (case de la carte, build-frontend-data.js).
//
// POLITESSE : une requête à la fois, 1,1 s entre deux, User-Agent « DossierQuebec (dossierquebec.ca) »,
// rien de ce que robots.txt exclut. Le fichier précédent sert de cache : une fiche n'est relue que si
// le projet a bougé (lastActivity), jamais lue, ou relue il y a plus de 7 jours (projets encore en
// cours seulement). Budget de temps par passage : ce qui reste est fait le lendemain.
//
// La 44e législature : data/bills.json ne garde que la législature la plus récente (scrapers/bills.js),
// ses projets arrivent donc ici tout seuls. Le cache garde les projets d'avant (les mémoires de la 43e
// restent consultables).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const BILLS_PATH = 'data/bills.json';
export const SORTIE = 'api/consultations-data.json';
const BASE = 'https://www.assnat.qc.ca';
const USER_AGENT = 'DossierQuebec (dossierquebec.ca)';
const PAUSE_MS = 1100;
const RELIRE_APRES_JOURS = 7;
const BUDGET_MS = Number(process.env.CONSULTATIONS_BUDGET_MS || 8 * 60e3);

const MOIS = { janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12' };
const nettoyer = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// « Le mardi 10 février 2026 », « 1er mars 2026 » → 2026-02-10
export function dateFr(texte) {
  const m = /(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i.exec(nettoyer(texte));
  if (!m) return null;
  return `${m[3]}-${MOIS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
}

export function typeMandat(titre) {
  const t = nettoyer(titre).toLowerCase();
  if (t.startsWith('consultations particulières')) return 'particulieres';
  if (t.startsWith('consultation générale')) return 'generale';
  if (t.startsWith('étude détaillée')) return 'etude';
  return 'autre';
}

// La fiche d'un projet de loi → les numéros de mandat (dans l'ordre, sans doublon).
export function mandatsDeFiche(html) {
  return [...new Set([...String(html).matchAll(/\/mandats\/Mandat-(\d{3,7})\//g)].map((m) => m[1]))];
}

export function consultationsDeFiche(html) {
  return [...new Set([...String(html).matchAll(/\/fr\/travaux-parlementaires\/consultations\/consultation-\d+-\d+\.html/g)].map((m) => m[0]))];
}

// La page d'un mandat (ou d'une consultation générale).
export function lireMandat(html, url) {
  const $ = cheerio.load(html);
  const titre = nettoyer($('h2.titre2TravauxParl').first().text());
  const commission = nettoyer($('h1').first().text());
  const seances = [...new Set($('h4').map((_, e) => dateFr($(e).text())).get().filter(Boolean))].sort();
  const lienMem = $('a[href*="memoires-deposes"]').attr('href') || null;
  // La date limite, seulement si elle est écrite en toutes lettres sur la page.
  const texte = nettoyer($('#contenu, .contenu, body').first().text());
  const dl = /(?:date limite[^.]{0,80}?|au plus tard le\s+)((?:\d{1,2}(?:er)?\s+\S+\s+\d{4}))/i.exec(texte);
  return {
    titre,
    commission,
    type: typeMandat(titre),
    seances,
    dateLimite: dl ? dateFr(dl[1]) : null,
    url: url || null,
    urlMemoires: lienMem ? new URL(lienMem, BASE).href : null,
  };
}

// La page des mémoires → [{ date, depose, titre, url, numero }]
export function lireMemoires(html) {
  const $ = cheerio.load(html);
  const lignes = [];
  $('#ListeMemoires tbody tr').each((_, tr) => {
    const td = $(tr).find('td');
    if (td.length < 3) return;
    const a = $(td[2]).find('a').first();
    lignes.push({
      date: nettoyer($(td[0]).text()).slice(0, 10) || null,
      depose: nettoyer($(td[1]).text()),
      titre: nettoyer(a.text() || $(td[2]).text()).replace(/\s*\((?:PDF|DOC|DOCX)[^)]*\)\s*$/i, ''),
      url: a.attr('href') ? new URL(a.attr('href'), BASE).href : null,
      numero: nettoyer($(td[3]).text()) || null,
    });
  });
  return lignes.filter((l) => l.depose);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let derniere = 0;
async function lire(url) {
  const attente = derniere + PAUSE_MS - Date.now();
  if (attente > 0) await dormir(attente);
  derniere = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  const html = await r.text();
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  // Au moindre signe d'anti-robot, on s'arrête : rien n'est réessayé.
  if (/captcha|cf-chl|radware|access denied/i.test(html.slice(0, 20000))) throw Object.assign(new Error(`anti-robot sur ${url}`), { arret: true });
  return { html, url: r.url || url };
}

const doitRelire = (b, avant, maintenant) => {
  if (!avant) return true;
  if (avant.lastActivity !== (b.lastActivity ?? null)) return true;
  if (b.status === 'sanctionne' || b.status === 'laisse_de_cote') return false;
  return maintenant - Date.parse(avant.lu || 0) > RELIRE_APRES_JOURS * 864e5;
};

export async function relever({ bills, avant, maintenant = Date.now(), lireUrl = lire, budget = BUDGET_MS }) {
  const depart = Date.now();
  const projets = { ...(avant?.projets ?? {}) };
  const rapport = { relus: 0, reportes: 0, erreurs: [] };
  for (const b of bills) {
    const ancien = projets[b.id];
    if (!doitRelire(b, ancien, maintenant)) continue;
    if (Date.now() - depart > budget) { rapport.reportes++; continue; }
    try {
      const fiche = await lireUrl(b.url);
      const mandats = [];
      // Une consultation générale renvoie à sa page « consultation-NNN-AAAAMMJJ.html » (même gabarit) et
      // non au mandat : vu sur le PL 1 (43-2). Son numéro de mandat se lit dans le lien des mémoires.
      const adresses = [
        ...mandatsDeFiche(fiche.html).map((id) => ({ id, url: `${BASE}/fr/travaux-parlementaires/mandats/Mandat-${id}/index.html` })),
        ...consultationsDeFiche(fiche.html).map((chemin) => ({ id: null, url: `${BASE}${chemin}` })),
      ];
      const vus = new Set();
      for (const { id: idFiche, url } of adresses) {
        const page = await lireUrl(url);
        const lu = lireMandat(page.html, page.url);
        const id = idFiche ?? /Mandat-(\d+)/.exec(lu.urlMemoires ?? page.html)?.[1] ?? url;
        if (vus.has(id)) continue;
        vus.add(id);
        const m = { id, ...lu };
        m.memoires = m.urlMemoires ? lireMemoires((await lireUrl(m.urlMemoires)).html) : [];
        mandats.push(m);
      }
      projets[b.id] = {
        num: b.num, legislature: b.legislature, session: b.introSession, titre: b.title,
        lastActivity: b.lastActivity ?? null, lu: new Date(maintenant).toISOString(), mandats,
      };
      rapport.relus++;
    } catch (e) {
      rapport.erreurs.push(`${b.id} : ${e.message}`);
      if (e.arret) break;
    }
  }
  return { donnees: { source: BASE, misAJour: new Date(maintenant).toISOString(), projets }, rapport };
}

async function main() {
  const { bills } = JSON.parse(readFileSync(BILLS_PATH, 'utf-8'));
  const avant = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf-8')) : null;
  const { donnees, rapport } = await relever({ bills, avant });
  const memoires = Object.values(donnees.projets).flatMap((p) => p.mandats.flatMap((m) => m.memoires)).length;
  const consultations = Object.values(donnees.projets).flatMap((p) => p.mandats.filter((m) => m.type === 'particulieres' || m.type === 'generale')).length;
  writeFileSync(SORTIE, JSON.stringify(donnees));
  console.log(`consultations : ${rapport.relus} fiches relues, ${rapport.reportes} reportées ; ${consultations} consultations, ${memoires} mémoires au total`);
  if (rapport.erreurs.length) {
    console.error(rapport.erreurs.join('\n'));
    if (!rapport.relus) process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
