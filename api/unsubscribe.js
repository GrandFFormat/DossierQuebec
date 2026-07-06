// Désabonnement en un clic du digest hebdomadaire (lien dans chaque courriel).
//
// Le lien contient un jeton signé (HMAC du user_id avec CRON_SECRET) : personne
// ne peut désabonner quelqu'un d'autre sans connaître le secret serveur, et on
// n'a pas besoin de stocker de jeton en base. Aucun login requis (exigence d'un
// vrai désabonnement). N'efface PAS les suivis ni les demandes d'explications —
// ajoute juste la personne à email_optout, que le digest respecte.

import crypto from 'node:crypto';

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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
      '<p><a href="https://dossierquebec.com">Retour à DossierQuébec</a></p>'
    ));
  } catch (err) {
    console.error('unsubscribe failed:', err);
    return res.status(500).send(page('<h1>Erreur</h1><p>Une erreur est survenue. Réessayez dans un moment.</p>'));
  }
}
