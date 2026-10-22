// L'EXPORT DES DONNÉES, premier outil de l'abonnement (21 oct. 2026). Réservé aux abonné·e·s : la
// vérification se fait ICI, côté serveur, avant de fabriquer le fichier (l'ancien export, retiré le
// 27 sept., fabriquait le fichier dans le navigateur : rien n'empêchait de s'en passer).
//
//   GET /api/export?jeu=votes|votes-deputes|presences|projets      Authorization: Bearer <jeton de session Supabase>
//   → un fichier CSV (séparateur « ; », encodé UTF-8 avec BOM : Excel en français l'ouvre tel quel)
//   &mois=AAAA-MM (votes, votes-deputes, presences) : seulement les votes de ce mois-là ; les présences
//   sont alors recomptées sur ces votes. Sert aux liens « Les fichiers du mois » de l'infolettre
//   (api/_section-abonnes.js), qui passent par Mon dossier (/mon-dossier?mois=AAAA-MM#mdExport).
//
//   GET /api/export?jeu=consultations[&pl=id,id…]                  (même en-tête)
//   → du JSON pour Mon dossier et la carte d'un projet de loi (quatrième et cinquième outils, 21 oct.
//     2026) : les consultations à venir, et pour chaque projet demandé, ses mémoires déposés. Vient de
//     api/consultations-data.json (api/_consultations.js), un fichier que Vercel ne sert pas.
//
//   GET /api/export?jeu=organismes&q=texte                          (même en-tête)
//   GET /api/export?jeu=organismes&c=clé&c=clé…
//   → du JSON pour Mon dossier (septième outil, 21 oct. 2026, api/_organismes.js) : chercher parmi les
//     auteurs de mémoires (au plus 20 résultats), ou les mémoires des organismes suivis (au plus 10).
//
// Seulement des données de l'Assemblée nationale (aucune donnée municipale : conditions des Villes).
// Les fichiers viennent des données publiques du site lui-même (dossierquebec.ca/data/…), la source
// est rappelée dans le nom du fichier et dans la première colonne d'adresse.

import { utilisateurDe, ligneAbonnement, estActive } from './_stripe.js';
import { chargerConsultations, consultationsAVenir, memoiresDe } from './_consultations.js';
import { indexOrganismes, chercherOrganismes, organisme, ORGANISMES_MAX, CLE_MAX } from './_organismes.js';

const SITE = process.env.PUBLIC_SITE_URL || 'https://dossierquebec.ca';
const lire = async (chemin) => {
  const r = await fetch(`${SITE}${chemin}`);
  if (!r.ok) throw new Error(`${chemin} → ${r.status}`);
  return r.json();
};
const cellule = (v) => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (entetes, lignes) => '﻿' + [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n') + '\r\n';

// UN MOIS À LA FOIS (Martin, 22 oct. 2026 : « je veux pas qu'ils partent avec toute la base de
// données au complet »). Le serveur n'accepte que le mois en cours ou le précédent (heure de
// Montréal) ; sans mois, c'est le mois en cours. Les projets de loi : ceux présentés ou qui ont
// bougé ce mois-là. `mois = null` (toute la base) ne sert plus qu'aux essais hors ligne.
export function moisPermis(maintenant = new Date()) {
  const [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', year: 'numeric', month: '2-digit' }).format(maintenant).split('-').map(Number);
  const courant = `${a}-${String(m).padStart(2, '0')}`;
  const precedent = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  return [courant, precedent];
}
export async function fabriquer(jeu, mois = null) {
  const duMois = (votes) => (mois ? votes.filter((v) => String(v.date ?? '').startsWith(mois)) : votes);
  if (jeu === 'projets') {
    const { bills } = await lire('/data/bills.json');
    return csv(
      ['numero', 'legislature', 'session', 'titre', 'statut', 'etape', 'parrain', 'presente_le', 'derniere_activite', 'adresse_assemblee'],
      bills.filter((b) => !mois || String(b.presentedOn ?? '').startsWith(mois) || String(b.lastActivity ?? '').startsWith(mois))
        .map((b) => [b.num, b.legislature, b.introSession, b.title, b.status, b.note, b.sponsor, b.presentedOn, b.lastActivity, b.url]),
    );
  }
  // Les votes en DEUX fichiers, reliés par « vote » (législature-session-numéro) : une ligne par
  // député·e et par vote avec le sujet et l'adresse répétés pesait 24 Mo, au-delà de ce qu'une
  // fonction Vercel peut renvoyer (4,5 Mo).
  if (jeu === 'votes') {
    const votes = duMois((await lire('/data/votes.json')).votes);
    return csv(
      ['vote', 'date', 'etape', 'projet_de_loi', 'sujet', 'pour', 'contre', 'abstentions', 'adresse_assemblee'],
      votes.map((v) => [`${v.legislature}-${v.session}-${v.num}`, v.date, v.stage, v.billNum, v.subject, (v.pour || []).length, (v.contre || []).length, (v.abstentions || []).length, v.url]),
    );
  }
  if (jeu === 'votes-deputes') {
    const [{ votes: tous }, histo] = await Promise.all([lire('/data/votes.json'), lire('/data/elus-historique.json').catch(() => ({ elus: {} }))]);
    const votes = duMois(tous);
    const lignes = [];
    for (const v of votes) {
      for (const [choix, liste] of [['pour', v.pour], ['contre', v.contre], ['abstention', v.abstentions]]) {
        for (const p of liste || []) {
          const h = histo.elus?.[p.assnatId];
          lignes.push([`${v.legislature}-${v.session}-${v.num}`, h ? h.name : p.lastName, p.party, choix]);
        }
      }
    }
    return csv(['vote', 'depute', 'parti', 'choix'], lignes);
  }
  if (jeu === 'presences') {
    const [toutes, histo, { votes }] = await Promise.all([lire('/data/site/presences.json'), lire('/data/elus-historique.json').catch(() => ({ elus: {} })), mois ? lire('/data/votes.json') : { votes: [] }]);
    let presences = toutes;
    if (mois) {
      // Recomptées sur les votes du mois : présent·e = a voté pour, contre ou s'est abstenu·e.
      const duMoisV = duMois(votes);
      const n = {};
      for (const id of Object.keys(toutes)) n[id] = 0;
      for (const v of duMoisV) for (const p of [...(v.pour || []), ...(v.contre || []), ...(v.abstentions || [])]) n[p.assnatId] = (n[p.assnatId] ?? 0) + 1;
      presences = Object.fromEntries(Object.entries(n).map(([id, k]) => [id, { participated: k, total: duMoisV.length, rate: duMoisV.length ? Math.round((100 * k) / duMoisV.length) : 0 }]));
    }
    return csv(
      ['depute', 'parti', 'votes_participes', 'votes_total', 'taux_presence_pct', 'numero_assemblee'],
      Object.entries(presences).map(([id, p]) => {
        const h = histo.elus?.[id];
        return [h ? h.name : '', h ? h.party : '', p.participated, p.total, p.rate, id];
      }),
    );
  }
  return null;
}

export default async function handler(req, res) {
  const jeu = String(req.query?.jeu || '');
  if (!['votes', 'votes-deputes', 'presences', 'projets', 'consultations', 'organismes'].includes(jeu)) return res.status(400).json({ erreur: 'jeu inconnu' });
  const jeton = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  const utilisateur = await utilisateurDe(jeton);
  if (!utilisateur) return res.status(401).json({ erreur: 'connexion requise' });
  const ligne = await ligneAbonnement(utilisateur.id).catch(() => null);
  if (!estActive(ligne)) return res.status(403).json({ erreur: 'réservé aux abonné·e·s' });
  if (jeu === 'consultations') {
    const donnees = chargerConsultations();
    if (!donnees) return res.status(500).json({ erreur: 'données indisponibles' });
    // Au plus 200 projets par demande (Mon dossier : les projets suivis ; la carte : un seul).
    const ids = String(req.query?.pl || '').split(',').filter((x) => /^\d{1,9}$/.test(x)).slice(0, 200);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      misAJour: donnees.misAJour,
      aVenir: consultationsAVenir(donnees),
      projets: Object.fromEntries(ids.map((id) => [id, memoiresDe(donnees, id)]).filter(([, v]) => v)),
    });
  }
  if (jeu === 'organismes') {
    const index = indexOrganismes(chargerConsultations());
    if (!index) return res.status(500).json({ erreur: 'données indisponibles' });
    res.setHeader('Cache-Control', 'no-store');
    const q = String(req.query?.q ?? '').slice(0, 120);
    if (q) return res.status(200).json({ misAJour: index.misAJour, resultats: chercherOrganismes(index, q) });
    const c = req.query?.c;
    const cles = [...new Set((Array.isArray(c) ? c : c ? [c] : []).map(String).filter((x) => x.length <= CLE_MAX))].slice(0, ORGANISMES_MAX);
    return res.status(200).json({ misAJour: index.misAJour, organismes: Object.fromEntries(cles.map((k) => [k, organisme(index, k)])) });
  }
  try {
    const permis = moisPermis();
    const demande = String(req.query?.mois ?? '');
    // N'importe quel mois, du début de la 43e législature (novembre 2022) au mois en cours, mais UN
    // seul par fichier (Martin : « tu sélectionnes janvier, tu télécharges les présences de janvier »).
    if (demande && !(/^\d{4}-(0[1-9]|1[0-2])$/.test(demande) && demande >= '2022-11' && demande <= permis[0])) return res.status(400).json({ erreur: 'mois non permis' });
    const mois = demande || permis[0];
    const fichier = await fabriquer(jeu, mois);
    const jour = mois;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dossierquebec-${jeu}-${jour}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(fichier);
  } catch (e) {
    console.error('export :', e.message);
    return res.status(500).json({ erreur: 'fichier indisponible' });
  }
}
