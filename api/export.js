// L'EXPORT DES DONNÉES, premier outil de l'abonnement (21 oct. 2026). Réservé aux abonné·e·s : la
// vérification se fait ICI, côté serveur, avant de fabriquer le fichier (l'ancien export, retiré le
// 27 sept., fabriquait le fichier dans le navigateur : rien n'empêchait de s'en passer).
//
//   GET /api/export?jeu=votes|presences|projets      Authorization: Bearer <jeton de session Supabase>
//   → un fichier CSV (séparateur « ; », encodé UTF-8 avec BOM : Excel en français l'ouvre tel quel)
//
// Seulement des données de l'Assemblée nationale (aucune donnée municipale : conditions des Villes).
// Les fichiers viennent des données publiques du site lui-même (dossierquebec.ca/data/…), la source
// est rappelée dans le nom du fichier et dans la première colonne d'adresse.

import { utilisateurDe, ligneAbonnement, estActive } from './_stripe.js';

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

async function fabriquer(jeu) {
  if (jeu === 'projets') {
    const { bills } = await lire('/data/bills.json');
    return csv(
      ['numero', 'legislature', 'session', 'titre', 'statut', 'etape', 'parrain', 'presente_le', 'derniere_activite', 'adresse_assemblee'],
      bills.map((b) => [b.num, b.legislature, b.introSession, b.title, b.status, b.note, b.sponsor, b.presentedOn, b.lastActivity, b.url]),
    );
  }
  if (jeu === 'votes') {
    // Une ligne par député·e et par vote nominal : ce qui se croise le mieux dans un tableur.
    const [{ votes }, histo] = await Promise.all([lire('/data/votes.json'), lire('/data/elus-historique.json').catch(() => ({ elus: {} }))]);
    const lignes = [];
    for (const v of votes) {
      for (const [choix, liste] of [['pour', v.pour], ['contre', v.contre], ['abstention', v.abstentions]]) {
        for (const p of liste || []) {
          const h = histo.elus?.[p.assnatId];
          lignes.push([v.legislature, v.session, v.num, v.date, v.stage, v.billNum, v.subject, h ? h.name : p.lastName, p.party, choix, v.url]);
        }
      }
    }
    return csv(['legislature', 'session', 'numero_vote', 'date', 'etape', 'projet_de_loi', 'sujet', 'depute', 'parti', 'vote', 'adresse_assemblee'], lignes);
  }
  if (jeu === 'presences') {
    const [presences, histo] = await Promise.all([lire('/data/site/presences.json'), lire('/data/elus-historique.json').catch(() => ({ elus: {} }))]);
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
  if (!['votes', 'presences', 'projets'].includes(jeu)) return res.status(400).json({ erreur: 'jeu inconnu' });
  const jeton = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  const utilisateur = await utilisateurDe(jeton);
  if (!utilisateur) return res.status(401).json({ erreur: 'connexion requise' });
  const ligne = await ligneAbonnement(utilisateur.id).catch(() => null);
  if (!estActive(ligne)) return res.status(403).json({ erreur: 'réservé aux abonné·e·s' });
  try {
    const fichier = await fabriquer(jeu);
    const jour = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dossierquebec-${jeu}-${jour}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(fichier);
  } catch (e) {
    console.error('export :', e.message);
    return res.status(500).json({ erreur: 'fichier indisponible' });
  }
}
