// Les sommaires décisionnels, tirés du document de séance (« Global »).
//
//   node scrapers/sommaires.js [--year=2026] [--seance=CO-260707] [--max-seances=4] [--force]
//
// À Longueuil, le sommaire décisionnel n'est pas un fichier à part : pour chaque séance du conseil
// de ville et du conseil d'agglomération, la Ville publie sur SharePoint un document unique — l'ordre
// du jour, puis, point par point, le sommaire et ses annexes. Près de mille pages pour une séance
// ordinaire du conseil de ville. Chaque sommaire s'y reconnaît à son en-tête :
//
//   SD-2026-0984
//   No PTI  Titre PTI
//   Direction  Aménagement et urbanisme
//   Sommaire décisionnel  Coûts et revenus (taxes incl.)
//   Page 1 de 1
//   Titre
//   Dépôt du procès-verbal de la réunion du Conseil local du patrimoine tenue le 21 mai 2026
//   Recommandation … Contexte … Justification … Aspects financiers …
//
// On lit le document page par page (lib/pdf.js, parcourirPdf), on garde les N pages de chaque
// sommaire (« Page 1 de N ») et rien des annexes. Le texte va dans data/textes/ (hors dépôt),
// pour scrapers/resumes.js ; l'index — quel sommaire, quelle séance, quelle page, quel titre —
// va dans data/sommaires.json, publié.
//
// UNE FOIS PAR SÉANCE. Le document est relu seulement si son adresse change (la Ville publie des
// mises à jour avant la séance), ou si le texte d'un sommaire encore sans résumé manque au cache
// (un cache perdu en intégration continue). Le fichier est servi par SharePoint (Microsoft), pas
// par le serveur de la Ville.

import { writeFile } from 'node:fs/promises';
import { INSTANCES_ACTIVES, pdf as telechargerPdf } from '../lib/lgl.js';
import { parcourirPdf } from '../lib/pdf.js';
import { lireJson, ecrireCache, lireCache } from './decisions.js';

const OUT = new URL('../data/sommaires.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);
const DECISIONS = new URL('../data/decisions.json', import.meta.url);
const RESUMES = new URL('../data/resumes.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// Une page de sommaire : le numéro SD tout en haut, « Page k de N » tout en bas. La première page
// porte en plus l'étiquette « Sommaire décisionnel » dans son en-tête ; les suivantes, seulement
// le numéro. Une annexe qui cite un SD dans son texte n'a ni l'un ni l'autre à ces places.
export function enteteSommaire(lignes) {
  // Dix lignes : un projet du programme d'immobilisations allonge l'en-tête de son numéro et de
  // son titre PTI (« 452-0148 Parc Belcourt - Réaménagement des aires / de jeu… »).
  const haut = lignes.slice(0, 10).map((l) => l.texte.trim()).join('\n');
  const bas = lignes.slice(-3).map((l) => l.texte.trim()).join('\n');
  const sd = haut.match(/^\s*(SD-\d{4}-\d{3,5})\s*$/m)?.[1];
  const pagination = bas.match(/Page\s+(\d+)\s+de\s+(\d+)/i);
  if (!sd || !pagination) return null;
  const page = Number(pagination[1]);
  if (page === 1 && !/Sommaire d[ée]cisionnel/i.test(haut)) return null;
  return { sd, page, sur: Number(pagination[2]) };
}

// Titre, direction, projet du programme d'immobilisations et « Coûts et revenus », lus dans
// l'en-tête de la première page :
//   No PTI Titre PTI
//   452-0148 Parc Belcourt - Réaménagement des aires
//   de jeu et aménagements connexes
//   Direction Infrastructures urbaines et mobilité
//   durable
//   Coûts et revenus 365 507,56 $
//   Sommaire décisionnel (taxes incl.)
// Le montant est recopié tel qu'écrit, jamais recalculé.
export function champsSommaire(texte) {
  const t = texte.replace(/\r/g, '');
  const entete = t.split(/\nTitre\s*\n/)[0];
  const titre = t.match(/\nTitre\s*\n([\s\S]*?)\n\s*Recommandation\b/)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const direction = entete.match(/\nDirection\s+([\s\S]*?)\n\s*(?:Coûts et revenus|Sommaire d[ée]cisionnel)/)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  const pti = entete.match(/No PTI\s+Titre PTI\s*\n([\s\S]*?)\n\s*Direction\b/)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  const coutsEtRevenus = entete.match(/Coûts et revenus\s+(-?[\d  ]+(?:,\d{2})?\s*\$)/)?.[1]?.replace(/[  ]+/g, ' ').trim() ?? null;
  // « Joseph- William-Gendron », « Sud- Est » : le trait d'union coupé en fin de ligne se recolle.
  const recoller = (v) => v?.replace(/(\p{L})-\s+(\p{L})/gu, '$1-$2') ?? null;
  return { titre: recoller(titre), direction, pti: recoller(pti), coutsEtRevenus };
}

async function lireDocumentDeSeance(seance) {
  const data = await telechargerPdf(seance.global);
  if (!data) throw new Error('le lien du document de séance ne donne pas de PDF');
  // pdf.js s'approprie le tampon en le lisant : la taille se note avant.
  const octets = data.length;
  const trouves = [];
  let courant = null;
  const fermer = () => {
    if (courant) trouves.push(courant);
    courant = null;
  };
  const { nombrePages } = await parcourirPdf(data, ({ numero, lignes, texte }) => {
    const e = enteteSommaire(lignes);
    if (e && e.page === 1) {
      fermer();
      courant = { sd: e.sd, page: numero, sur: e.sur, pages: [texte] };
    } else if (courant && e && e.sd === courant.sd && e.page === courant.pages.length + 1) {
      courant.pages.push(texte);
    } else if (courant) {
      // Une page qui ne continue pas le sommaire : ses annexes commencent.
      fermer();
    }
    if (courant && courant.pages.length >= courant.sur) fermer();
  });
  fermer();
  return { nombrePages, octets, trouves };
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());
  const maxSeances = Number(args['max-seances'] ?? Infinity);
  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");
  const index = (await lireJson(OUT)) ?? { seances: {}, sommaires: {} };
  const decisions = (await lireJson(DECISIONS))?.decisions ?? [];
  const resumes = new Set(((await lireJson(RESUMES))?.resumes ?? []).map((r) => r.id));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const candidates = [];
  for (const s of calendrier.seances) {
    if (!INSTANCES_ACTIVES.includes(s.instance) || !s.global || !s.date.startsWith(year) || s.date > aujourdhui) continue;
    if (args.seance && s.id !== args.seance) continue;
    const deja = index.seances[s.id];
    let raison = null;
    if (args.force || args.seance) raison = 'demandé';
    else if (!deja) raison = 'jamais lu';
    else if (deja.global !== s.global) raison = 'document mis à jour';
    else {
      // Un sommaire connu, encore sans résumé, dont le texte n'est plus dans le cache.
      for (const sd of deja.sommaires) {
        if (!resumes.has(sd) && !(await lireCache(`sommaire_${sd}`))) {
          raison = 'texte absent du cache';
          break;
        }
      }
    }
    if (raison) candidates.push({ seance: s, raison });
  }
  console.log(`${candidates.length} document(s) de séance à lire${Number.isFinite(maxSeances) ? ` (au plus ${maxSeances} cette fois)` : ''}.`);

  let lus = 0;
  for (const { seance, raison } of candidates.slice(0, maxSeances)) {
    const debut = Date.now();
    try {
      const { nombrePages, octets, trouves } = await lireDocumentDeSeance(seance);
      for (const t of trouves) {
        const texte = t.pages.join('\n\f\n');
        const champs = champsSommaire(t.pages[0]);
        await ecrireCache(`sommaire_${t.sd}`, { sd: t.sd, seanceId: seance.id, url: seance.global, page: t.page, nombrePages: t.pages.length, ...champs, texte });
        index.sommaires[t.sd] = { seanceId: seance.id, page: t.page, nombrePages: t.pages.length, incomplet: t.pages.length < t.sur, ...champs };
      }
      // Les sommaires que le procès-verbal cite pour cette séance mais que le document ne contient pas.
      const cites = new Set(decisions.filter((d) => d.seanceId === seance.id && d.sommaireId).map((d) => d.sommaireId));
      const absents = [...cites].filter((sd) => !trouves.some((t) => t.sd === sd));
      index.seances[seance.id] = { global: seance.global, luLe: aujourdhui, nombrePages, octets, sommaires: trouves.map((t) => t.sd), citesAbsents: absents };
      lus++;
      console.log(`${seance.id} (${raison}) : ${nombrePages} pages, ${Math.round(octets / 1e6)} Mo, ${trouves.length} sommaires${trouves.some((t) => t.pages.length < t.sur) ? ` (${trouves.filter((t) => t.pages.length < t.sur).length} incomplets)` : ''} ; ${absents.length} cité(s) au procès-verbal mais absent(s) du document — ${Math.round((Date.now() - debut) / 1000)} s`);
    } catch (err) {
      console.warn(`⚠ ${seance.id} : ${err.message}`);
    }
    await ecrire(index);
  }
  await ecrire(index);
  console.log(`\n${lus} document(s) lu(s) ; ${Object.keys(index.sommaires).length} sommaires indexés dans data/sommaires.json.`);
}

async function ecrire(index) {
  const sommaires = Object.fromEntries(Object.entries(index.sommaires).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), nombre: Object.keys(sommaires).length, seances: index.seances, sommaires }, null, 1), 'utf8');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
