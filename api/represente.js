// « Représente ta ville » (6 nov. 2026) — formulaire d'intérêt de /represente-ta-ville.
//
//   POST /api/represente
//   { ville, nom, courriel, profil: 'citoyen' | 'organisme' | 'entreprise', message?, site_web? }
//
// Pas de compte requis : on mesure la demande. Le champ site_web est un piège à robots (caché) :
// rempli, on répond 200 sans rien envoyer. Depuis le 7 nov. 2026, la demande est gardée dans la
// table rtv_demandes (scripts/supabase-rtv-demandes.sql) ; Martin la lit sur la page Lexique (admin).
// Si l'insertion échoue (table absente, Supabase en panne), on retombe sur le courriel (Resend) à
// MESSAGES_A pour ne rien perdre ; « Répondre » écrit directement à la personne.
//
// La provenance (site d'origine, page de DQ, campagne) vient de la page : voir rtv_visites.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ; secours : RESEND_API_KEY, DIGEST_FROM, MESSAGES_A.
//
// Depuis le 11 nov. 2026, la même route sert l'enchère en direct des mois de bannière (api/_enchere.js) :
// GET ?enchere=<ville>&mois=<AAAA-MM-JJ>, POST { action: 'offre', … }, GET ?confirmer=<jeton>.

import { voir, offrir, confirmer } from './_enchere.js';

const PROFILS = { citoyen: 'Citoyen·ne', organisme: 'Organisme', entreprise: 'Entreprise (commandite)' };
const COURRIEL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,}$/;

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const propre = (s, max) => String(s ?? '').trim().slice(0, max);
// La clé de regroupement : sans accents, en minuscules, espaces simples (« Lévis » = « levis »).
const cleVille = (v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

async function garder(m) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: cle } = process.env;
  if (!SUPABASE_URL || !cle) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rtv_demandes`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...m, ville_cle: cleVille(m.ville) }),
    });
    if (!r.ok) console.error('rtv_demandes :', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('rtv_demandes :', e);
    return false;
  }
}

export default async function handler(req, res) {
  const q = req.query || {};
  if (req.method === 'GET' && q.confirmer) {
    try {
      const r = await confirmer(String(q.confirmer));
      res.setHeader('Location', r.redirection);
      return res.status(302).end();
    } catch (e) {
      console.error('enchère, confirmation :', e);
      return res.status(500).send('Erreur, réessayez plus tard.');
    }
  }
  if (req.method === 'GET' && q.enchere) {
    try {
      const r = await voir(q);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(r.statut).json(r.corps);
    } catch (e) {
      console.error('enchère, classement :', e);
      return res.status(500).json({ ok: false });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  // L'enchère a son propre piège (av_laisser_vide) : le navigateur remplissait « site_web » tout seul (11 nov. 2026).
  if (b.action === 'offre') {
    if (b.av_laisser_vide) return res.status(200).json({ ok: true });
    try {
      const r = await offrir(b);
      return res.status(r.statut).json(r.corps);
    } catch (e) {
      console.error('enchère, offre :', e);
      return res.status(500).json({ ok: false });
    }
  }
  if (b.site_web) return res.status(200).json({ ok: true });

  const m = {
    ville: propre(b.ville, 80),
    nom: propre(b.nom, 120),
    courriel: propre(b.courriel, 200),
    profil: PROFILS[b.profil] ? b.profil : 'citoyen',
    message: propre(b.message, 2000),
    provenance: propre(b.provenance, 200),
  };
  if (!m.ville || !m.nom || !COURRIEL.test(m.courriel)) return res.status(400).json({ ok: false });

  if (await garder(m)) return res.status(200).json({ ok: true });

  const { RESEND_API_KEY, DIGEST_FROM, MESSAGES_A } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM || !MESSAGES_A) return res.status(503).json({ ok: false });

  const ligne = (e, v) => (v ? `<tr><td style="padding:2px 12px 2px 0;vertical-align:top">${e}</td><td style="padding:2px 0">${v}</td></tr>` : '');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.5">
    <table style="font-size:14px;border-collapse:collapse">
      ${ligne('Ville', `<b>${echapper(m.ville)}</b>`)}
      ${ligne('Nom', echapper(m.nom))}
      ${ligne('Courriel', echapper(m.courriel))}
      ${ligne('Profil', PROFILS[m.profil])}
      ${ligne('Provenance', echapper(m.provenance))}
    </table>
    ${m.message ? `<p style="white-space:pre-wrap;margin:16px 0 0">${echapper(m.message)}</p>` : ''}
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: DIGEST_FROM,
        to: MESSAGES_A.split(',').map((a) => a.trim()).filter(Boolean),
        reply_to: m.courriel,
        subject: `[Représentez votre ville] ${m.ville} — ${PROFILS[m.profil]}`,
        html,
      }),
    });
    if (!r.ok) {
      console.error('Resend :', r.status, await r.text());
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend :', e);
    return res.status(502).json({ ok: false });
  }
}
