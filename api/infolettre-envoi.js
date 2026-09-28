// L'envoi quotidien de l'infolettre gratuite (Vercel Cron, vercel.json). Il partait avant avec les
// alertes des abonnés (api/alertes-projets.js), retirées avec l'abonnement payant le 27 sept. 2026.
//
//   GET /api/infolettre-envoi      Authorization: Bearer <CRON_SECRET>
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, CRON_SECRET.

import { envoyerNumerosEnAttente } from './_infolettre.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_FROM', 'CRON_SECRET']) {
    if (!process.env[v]) return res.status(503).json({ erreur: `variable manquante : ${v}` });
  }
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (jeton !== process.env.CRON_SECRET) return res.status(401).json({ erreur: 'non autorisé' });
  try {
    return res.status(200).json({ ok: true, infolettre: await envoyerNumerosEnAttente() });
  } catch (erreur) {
    console.error('infolettre (cron) :', erreur);
    return res.status(500).json({ erreur: erreur.message });
  }
}
