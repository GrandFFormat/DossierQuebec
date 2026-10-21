// CONSULTATIONS ET MÉMOIRES (21 oct. 2026), quatrième et cinquième outils de l'abonnement. Le « _ » :
// Vercel n'en fait pas une route. Lit api/consultations-data.json (scrapers/consultations.js), un
// fichier que Vercel ne sert pas, embarqué par « includeFiles » dans export.js et infolettre-envoi.js.
//
// Servi par api/export.js (?jeu=consultations, JSON, abonné·e·s seulement) et par les alertes du matin
// (api/_alertes-assemblee.js, les rappels d'échéance).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHEMIN = join(process.cwd(), 'api', 'consultations-data.json');
export const RAPPEL_JOURS = 7;   // un rappel quand la date limite tombe dans les 7 jours qui viennent
const CONSULTATION = new Set(['particulieres', 'generale']);

export function chargerConsultations(chemin = CHEMIN) {
  try { return JSON.parse(readFileSync(chemin, 'utf8')); } catch { return null; }
}

const jour = (d) => new Date(d).toISOString().slice(0, 10);
const plusJours = (iso, n) => jour(Date.parse(`${iso}T12:00:00Z`) + n * 864e5);

// Une consultation, telle que le navigateur et le courriel la voient.
const fiche = (p, id, m) => ({
  pl: String(id), num: p.num, legislature: p.legislature, titrePl: p.titre,
  mandat: m.id, titre: m.titre, commission: m.commission, type: m.type,
  seances: m.seances ?? [], dateLimite: m.dateLimite ?? null, url: m.url, urlMemoires: m.urlMemoires ?? null,
  memoires: (m.memoires ?? []).length,
});

// Les consultations à venir ou en cours : une date limite pas encore passée, ou une séance
// aujourd'hui ou plus tard. Triées par la première échéance.
export function consultationsAVenir(donnees, aujourdhui = jour(Date.now())) {
  const liste = [];
  for (const [id, p] of Object.entries(donnees?.projets ?? {})) {
    for (const m of p.mandats ?? []) {
      if (!CONSULTATION.has(m.type)) continue;
      const prochaine = (m.seances ?? []).find((d) => d >= aujourdhui) ?? null;
      const limite = m.dateLimite && m.dateLimite >= aujourdhui ? m.dateLimite : null;
      if (!prochaine && !limite) continue;
      liste.push({ ...fiche(p, id, m), prochaineSeance: prochaine });
    }
  }
  const cle = (c) => c.dateLimite ?? c.prochaineSeance ?? '9';
  return liste.sort((a, b) => cle(a).localeCompare(cle(b)));
}

// Les mémoires d'un projet de loi, tous mandats confondus, du plus récent au plus ancien.
export function memoiresDe(donnees, id) {
  const p = donnees?.projets?.[String(id)];
  if (!p) return null;
  const memoires = (p.mandats ?? []).flatMap((m) => (m.memoires ?? []).map((x) => ({ ...x, mandat: m.titre, commission: m.commission })));
  memoires.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return {
    pl: String(id), num: p.num, legislature: p.legislature, titre: p.titre,
    consultations: (p.mandats ?? []).filter((m) => CONSULTATION.has(m.type)).map((m) => fiche(p, id, m)),
    memoires,
  };
}

// Le nombre de mémoires par projet de loi : la seule donnée qui devient publique.
export function comptes(donnees) {
  const n = {};
  for (const [id, p] of Object.entries(donnees?.projets ?? {})) {
    const t = (p.mandats ?? []).reduce((s, m) => s + (m.memoires ?? []).length, 0);
    if (t) n[id] = t;
  }
  return n;
}

// Les rappels d'un·e abonné·e : les consultations des projets de loi qu'il suit (ou qui touchent un
// de ses mots-clés) dont la date limite PUBLIÉE tombe dans les RAPPEL_JOURS jours. Sans date limite
// publiée, aucun rappel : on ne devine pas.
export function rappelsEcheance(donnees, idsProjets, aujourdhui = jour(Date.now())) {
  const ids = new Set([...idsProjets].map(String));
  const fin = plusJours(aujourdhui, RAPPEL_JOURS);
  return consultationsAVenir(donnees, aujourdhui).filter((c) => ids.has(c.pl) && c.dateLimite && c.dateLimite <= fin);
}
