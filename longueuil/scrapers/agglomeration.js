// Les membres du conseil d'agglomération de Longueuil, reconstitués depuis les procès-verbaux.
//
//   node scrapers/agglomeration.js [--year=2026]
//
// Comme à Québec, et contrairement à Montréal, la Ville ne publie pas de liste des membres de ce
// conseil. Chaque procès-verbal s'ouvre pourtant sur une liste nominative :
//
//   Présences :
//   Loïc Blancquaert, maire de la Ville de Saint-Lambert
//   Lyette Bouchard, conseillère municipale de la Ville de Longueuil
//   Nancy Cormier, conseillère municipale de la Ville de Saint-Bruno-de-
//   Montarville, en remplacement de Ludovic Grisé Farand, maire de la Ville de
//   Saint-Bruno-de-Montarville
//   Présences par l'intermédiaire d'un moyen électronique de communication, … :
//   Catherine Fournier, mairesse de la Ville de Longueuil
//   Absence :
//   Doreen Assaad, mairesse de la Ville de Brossard
//   Autres présences :            <- les fonctionnaires : exclus
//
// Le conseil réunit la mairesse de Longueuil, des élus de Longueuil qu'elle désigne, et les maires
// des quatre villes liées — Boucherville, Brossard, Saint-Bruno-de-Montarville et Saint-Lambert.
// On lit toutes les séances de l'année (texte en cache écrit par decisions.js, sinon le PDF) : une personne par
// séance, présences et absences comptées. Un remplaçant est compté à part, avec la personne qu'il
// remplace ; la personne remplacée est comptée absente. La composition affichée est celle de la
// dernière séance.

import { writeFile } from 'node:fs/promises';
import { documentDeSeance, lireJson } from './decisions.js';
import { normaliserEspaces, cle } from '../lib/noms.js';
import { recoller } from '../lib/pv.js';

const OUT = new URL('../data/agglomeration.json', import.meta.url);
const SEANCES = new URL('../data/seances.json', import.meta.url);

// « Nom, fonction de la Ville de X » -> { nom, fonction, ville }.
export function lirePersonne(s) {
  const m = normaliserEspaces(s).match(/^([^,]+),\s*(.+)$/);
  if (!m) return null;
  const fonction = m[2].replace(/[.;]$/, '').trim();
  const ville = fonction.match(/(?:Ville de|de la Ville de|de)\s+([A-ZÀ-Ö][\p{L}'’\- ]+)$/u)?.[1]?.trim() ?? null;
  return { nom: m[1].trim(), fonction, ville };
}

// L'en-tête d'un procès-verbal -> { presents, absents, remplacements }.
export function listesDePresence(texte) {
  const entete = texte.split(/_{5,}/)[0];
  const lignes = entete.split('\n').map((l) => l.trim()).filter(Boolean);
  const sections = { presents: [], absents: [] };
  let courante = null;
  let tampon = [];
  const vider = () => {
    if (courante && tampon.length) sections[courante].push(recoller(tampon));
    tampon = [];
  };
  for (const l of lignes) {
    if (/^Pr[ée]sences?\s*:/i.test(l)) {
      vider();
      courante = 'presents';
      continue;
    }
    if (/^Pr[ée]sences? par l/i.test(l)) {
      vider();
      courante = 'enAttente';
      continue;
    }
    if (courante === 'enAttente') {
      // La phrase d'introduction des présences à distance court jusqu'au deux-points.
      if (/:\s*$/.test(l)) courante = 'presents';
      continue;
    }
    if (/^Absences?\s*:/i.test(l)) {
      vider();
      courante = 'absents';
      continue;
    }
    if (/^Autres pr[ée]sences/i.test(l)) {
      vider();
      courante = null;
      continue;
    }
    if (!courante) continue;
    // Une nouvelle personne : « Prénom Nom, maire… / conseill… / mairesse… ». Pas une ligne qui
    // continue la précédente : après un trait d'union de fin de ligne (« Saint-Bruno-de- /
    // Montarville en remplacement de … »), ni une ligne qui porte le remplacement.
    // Ni après « …, en remplacement de » coupé en fin de ligne : la personne remplacée suit.
    const continue_ = tampon.length && /-$|\bremplacement(?: de)?$/.test(tampon.at(-1));
    if (!continue_ && /^(?![^,]*\ben remplacement\b)[A-ZÀ-Ö][^,]{2,60},\s*(?:maire|mairesse|conseill|pr[ée]sident|repr[ée]sentant)/.test(l)) vider();
    tampon.push(l);
  }
  vider();

  const presents = [];
  const absents = [];
  const remplacements = [];
  for (const entree of sections.presents) {
    const [titulaire, remplace] = entree.split(/,?\s+en remplacement de\s+/i);
    const p = lirePersonne(titulaire);
    if (!p) continue;
    if (remplace) {
      const r = lirePersonne(remplace);
      remplacements.push({ ...p, remplace: r?.nom ?? normaliserEspaces(remplace) });
      if (r) absents.push(r);
    } else presents.push(p);
  }
  for (const entree of sections.absents) {
    const p = lirePersonne(entree);
    if (p) absents.push(p);
  }
  const unique = (liste) => [...new Map(liste.map((p) => [cle(p.nom), p])).values()];
  return { presents: unique(presents), absents: unique(absents), remplacements: unique(remplacements) };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const year = String(args.year ?? new Date().getFullYear());
  const calendrier = await lireJson(SEANCES);
  if (!calendrier) throw new Error("data/seances.json manquant — lancez d'abord scrapers/seances.js");
  const seances = calendrier.seances.filter((s) => s.instance === 'CA' && s.pv && s.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const personnes = new Map();
  const fiche = (p) => {
    const k = cle(p.nom);
    if (!personnes.has(k)) personnes.set(k, { nom: p.nom, fonction: p.fonction, ville: p.ville, presences: 0, absences: 0, seances: 0, remplacements: 0, remplace: [], derniereSeance: null });
    const f = personnes.get(k);
    f.fonction = p.fonction;
    f.ville = p.ville ?? f.ville;
    return f;
  };
  let analysees = 0;
  let derniere = null;
  for (const s of seances) {
    const pv = await documentDeSeance(s, 'PV').catch((err) => (console.warn(`⚠ ${s.id} : ${err.message}`), null));
    if (!pv?.texte) {
      console.warn(`⚠ ${s.id} : procès-verbal illisible`);
      continue;
    }
    const { presents, absents, remplacements } = listesDePresence(pv.texte);
    if (!presents.length) {
      console.warn(`⚠ ${s.id} : aucune présence reconnue`);
      continue;
    }
    analysees++;
    derniere = s.id;
    for (const p of presents) Object.assign(fiche(p), { derniereSeance: s.id }).presences++;
    for (const p of absents) Object.assign(fiche(p), { derniereSeance: s.id }).absences++;
    for (const p of remplacements) {
      const f = fiche(p);
      f.remplacements++;
      f.derniereSeance = s.id;
      if (!f.remplace.includes(p.remplace)) f.remplace.push(p.remplace);
    }
    for (const p of [...presents, ...absents]) fiche(p).seances++;
    console.log(`${s.id} : ${presents.length} présent(s), ${absents.length} absent(s), ${remplacements.length} remplacement(s)`);
  }

  // Membres : les titulaires de la dernière séance. Les remplaçants restent dans `remplacants`.
  const tous = [...personnes.values()];
  const membres = tous
    .filter((p) => p.seances > 0 && p.derniereSeance === derniere)
    .map((p) => ({ nom: p.nom, fonction: p.fonction, fonctionTelleQuelle: p.fonction, ville: p.ville, parti: null, roles: [], presences: p.presences, absences: p.absences, seances: p.seances, remplace: [] }));
  const anciens = tous.filter((p) => p.seances > 0 && p.derniereSeance !== derniere).map((p) => ({ nom: p.nom, fonction: p.fonction, ville: p.ville, presences: p.presences, seances: p.seances, derniereSeance: p.derniereSeance }));
  const remplacants = tous.filter((p) => p.remplacements > 0).map((p) => ({ nom: p.nom, fonction: p.fonction, ville: p.ville, remplacements: p.remplacements, remplace: p.remplace }));
  const villes = {};
  for (const m of membres) if (m.ville) villes[m.ville] = (villes[m.ville] ?? 0) + 1;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: calendrier.source?.CA ?? null,
    methode:
      "Reconstitué à partir des listes de présences des procès-verbaux du conseil d'agglomération de l'année " +
      '(fonctionnaires exclus). La composition est celle de la dernière séance ; les présences comptent toutes les séances.',
    parametres: { annee: year },
    seancesAnalysees: analysees,
    derniereSeance: derniere,
    nombre: membres.length,
    villes,
    membres: membres.sort((a, b) => (a.ville === 'Longueuil') - (b.ville === 'Longueuil') || (a.ville ?? '').localeCompare(b.ville ?? '') || a.nom.localeCompare(b.nom)),
    remplacants,
    anciensMembres: anciens,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${membres.length} membres (dernière séance ${derniere}) écrits dans data/agglomeration.json — ${analysees} séance(s) analysée(s).`);
  for (const [v, n] of Object.entries(villes)) console.log(`  ${v} : ${n}`);
  if (anciens.length) console.log(`Ne siègent plus : ${anciens.map((a) => `${a.nom} (dernière séance ${a.derniereSeance})`).join(', ')}`);
  if (remplacants.length) console.log(`Remplaçants : ${remplacants.map((r) => `${r.nom} pour ${r.remplace.join(', ')} (${r.remplacements})`).join(' ; ')}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
