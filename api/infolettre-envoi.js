// La tâche planifiée de chaque matin (Vercel Cron, vercel.json) : les alertes sur mesure des
// abonné·e·s (api/_alertes-assemblee.js), PUIS l'infolettre gratuite (api/_infolettre.js). Une seule
// fonction pour les deux : Vercel Hobby n'accepte que 2 tâches planifiées (l'autre est
// api/weekly-digest.js) et 12 fonctions.
//
//   GET  /api/infolettre-envoi                  Authorization: Bearer <CRON_SECRET>   le passage du matin
//   GET  /api/infolettre-envoi?apercu=1         (même en-tête) les alertes qui partiraient, sans rien
//                                               envoyer ni mémoriser ; l'infolettre ne part pas
//   GET  /api/infolettre-envoi?essai=<courriel> (même en-tête) un courriel d'essai des alertes à cet·te
//                                               abonné·e ; l'infolettre ne part pas
//   POST /api/infolettre-envoi?essai=moi        Authorization: Bearer <jeton de session Supabase>
//                                               le même essai, demandé par l'abonné·e depuis Mon
//                                               dossier ; 3 par 24 heures
//
// Resend gratuit, c'est 100 courriels par jour pour tout : les alertes passent d'abord, l'infolettre
// prend ce qui reste (PAR_JOUR). Une panne de l'une n'empêche pas l'autre.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, CRON_SECRET,
// PUBLIC_SITE_URL (facultative).

import { envoyerNumerosEnAttente, PAR_JOUR } from './_infolettre.js';
import { envoyerAlertes, essaiPourSoi } from './_alertes-assemblee.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_FROM', 'CRON_SECRET']) {
    if (!process.env[v]) return res.status(503).json({ erreur: `variable manquante : ${v}` });
  }
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const serveur = jeton === process.env.CRON_SECRET;

  // L'essai demandé depuis Mon dossier : seulement à soi-même, et seulement les alertes.
  if (!serveur) {
    if (req.method !== 'POST' || req.query?.essai !== 'moi' || !jeton) return res.status(401).json({ erreur: 'non autorisé' });
    try {
      const pourSoi = await essaiPourSoi(jeton);
      if (!pourSoi.uid) return res.status(pourSoi.statut).json(pourSoi.corps);
      const alertes = await envoyerAlertes({ essai: pourSoi.email.toLowerCase(), pourSoi });
      return res.status(200).json({ ok: true, envoye: alertes.envoyes > 0, raison: alertes.envoyes ? undefined : 'rien à montrer pour l’instant' });
    } catch (erreur) {
      console.error('alertes (essai) :', erreur);
      return res.status(500).json({ erreur: erreur.message });
    }
  }

  const apercu = req.query?.apercu === '1';
  const essai = String(req.query?.essai ?? '').trim().toLowerCase() || null;
  const rapport = { ok: true };
  try {
    rapport.alertes = await envoyerAlertes({ apercu, essai, plafond: PAR_JOUR });
  } catch (erreur) {
    console.error('alertes (cron) :', erreur);
    rapport.ok = false;
    rapport.alertes = { erreur: erreur.message, envoyes: 0 };
  }
  if (apercu || essai) return res.status(200).json(rapport);
  try {
    rapport.infolettre = await envoyerNumerosEnAttente(Math.max(0, PAR_JOUR - (rapport.alertes.envoyes ?? 0)));
  } catch (erreur) {
    console.error('infolettre (cron) :', erreur);
    return res.status(500).json({ ...rapport, ok: false, erreur: erreur.message });
  }
  return res.status(rapport.ok ? 200 : 500).json(rapport);
}
