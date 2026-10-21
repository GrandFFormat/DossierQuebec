// Désabonnement en un clic du digest hebdomadaire (lien dans chaque courriel).
//
// Le lien contient un jeton signé (HMAC du user_id avec CRON_SECRET) : personne
// ne peut désabonner quelqu'un d'autre sans connaître le secret serveur, et on
// n'a pas besoin de stocker de jeton en base. Aucun login requis (exigence d'un
// vrai désabonnement). N'efface PAS les suivis ni les demandes d'explications —
// ajoute juste la personne à email_optout, que le digest respecte.
//
// Sert aussi, depuis le 21 oct. 2026, le lien « Ne plus recevoir ces alertes » des alertes sur mesure
// (api/_alertes-assemblee.js) : ?u=<user_id>&s=<signature « alertes: »>, en GET depuis le courriel ou
// en POST (désabonnement en un clic des messageries, List-Unsubscribe-Post). Une fonction de moins
// que l'ancien api/alertes-desabonnement.js (Vercel Hobby : 12 au plus). Coupe seulement les
// alertes (alertes_preferences.actif = false) : les suivis et l'abonnement restent.

import crypto from 'node:crypto';
import { supabase, signatureValide, site } from './_alertes.js';

function verifyToken(token) {
  const [userId, sig] = (token || '').split('.');
  if (!userId || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.CRON_SECRET).update(userId).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

function page(message) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DossierQuébec</title>
    <style>body{font-family:Arial,sans-serif;background:#EDEEE8;color:#16213E;display:flex;
      align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
      .card{background:#fff;border:1px solid #e0e0da;border-radius:12px;padding:32px;max-width:440px;
      text-align:center;line-height:1.55;} a{color:#A9782E;} h1{font-size:20px;margin:0 0 12px;}</style>
    </head><body><div class="card">${message}</div></body></html>`;
}

async function optOut(userId) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/email_optout?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      // ignore-duplicates : si la personne est déjà désabonnée, ne rien faire.
      // Génère INSERT ... ON CONFLICT DO NOTHING, qui n'exige que le privilège
      // INSERT (contrairement à merge-duplicates qui exigerait aussi UPDATE).
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify([{ user_id: userId }]),
  });
  if (!res.ok) throw new Error(`optout -> ${res.status} ${await res.text()}`);
}

// Le lien « Ne plus recevoir la veille par thème » (api/_veille-theme.js, 21 oct. 2026) :
// ?u=<user_id>&v=<signature « veille: »>. Vide les thèmes cochés ; les alertes, les suivis et
// l'abonnement restent.
async function couperVeille(req, res) {
  const u = String(req.query?.u ?? '');
  const v = String(req.query?.v ?? '');
  if (!process.env.CRON_SECRET || !signatureValide(u, v, 'veille')) {
    return res.status(400).send(page("<h1>Lien invalide</h1><p>Ce lien de désabonnement n'est pas valide.</p>"));
  }
  try {
    await supabase(`/rest/v1/alertes_preferences?user_id=eq.${u}`, {
      methode: 'PATCH',
      corps: { veille_themes: [], updated_at: new Date().toISOString() },
      entetes: { Prefer: 'return=minimal' },
    });
    return res.status(200).send(page(
      '<h1>Veille arrêtée</h1>' +
      '<p>Vous ne recevrez plus la veille par thème.</p>' +
      '<p style="font-size:13px;color:#5C6270;">Vos alertes, vos suivis et votre abonnement restent intacts. Pour la reprendre, cochez de nouveau vos thèmes dans Mon dossier.</p>' +
      `<p><a href="${site()}/mon-dossier">Aller à Mon dossier</a></p>`
    ));
  } catch (err) {
    console.error('veille (désabonnement) :', err);
    return res.status(500).send(page('<h1>Erreur</h1><p>Une erreur est survenue. Réessayez dans un moment.</p>'));
  }
}

async function couperAlertes(req, res) {
  const u = String(req.query?.u ?? '');
  const s = String(req.query?.s ?? '');
  if (!process.env.CRON_SECRET || !signatureValide(u, s)) {
    return res.status(400).send(page("<h1>Lien invalide</h1><p>Ce lien de désabonnement n'est pas valide.</p>"));
  }
  try {
    await supabase('/rest/v1/alertes_preferences?on_conflict=user_id', {
      methode: 'POST',
      corps: [{ user_id: u, actif: false, updated_at: new Date().toISOString() }],
      entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return res.status(200).send(page(
      '<h1>Alertes arrêtées</h1>' +
      '<p>Vous ne recevrez plus les alertes sur mesure par courriel.</p>' +
      '<p style="font-size:13px;color:#5C6270;">Vos suivis, vos mots-clés et votre abonnement restent intacts. Pour reprendre les alertes, rétablissez-les dans Mon dossier.</p>' +
      `<p><a href="${site()}/mon-dossier">Aller à Mon dossier</a></p>`
    ));
  } catch (err) {
    console.error('alertes (désabonnement) :', err);
    return res.status(500).send(page('<h1>Erreur</h1><p>Une erreur est survenue. Réessayez dans un moment.</p>'));
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.u && req.query?.v) return couperVeille(req, res);
  if (req.query?.u) return couperAlertes(req, res);
  const userId = verifyToken(req.query.token);
  if (!userId) {
    return res.status(400).send(page('<h1>Lien invalide</h1><p>Ce lien de désabonnement n\'est pas valide ou a expiré.</p>'));
  }
  try {
    await optOut(userId);
    return res.status(200).send(page(
      '<h1>Désabonnement confirmé</h1>' +
      '<p>Vous ne recevrez plus le résumé hebdomadaire par courriel.</p>' +
      '<p style="font-size:13px;color:#5C6270;">Vos suivis et demandes d\'explications restent intacts sur le site — seuls les courriels s\'arrêtent. ' +
      'Pour reprendre les alertes plus tard, écrivez-nous ou re-suivez un projet de loi une fois cette option rétablie.</p>' +
      '<p><a href="https://dossierquebec.ca">Retour à DossierQuébec</a></p>'
    ));
  } catch (err) {
    console.error('unsubscribe failed:', err);
    return res.status(500).send(page('<h1>Erreur</h1><p>Une erreur est survenue. Réessayez dans un moment.</p>'));
  }
}
