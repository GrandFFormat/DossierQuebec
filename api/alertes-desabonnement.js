// « Ne plus recevoir ces alertes » — le lien de chaque courriel d'alerte (api/alertes-projets.js).
//
//   GET  /api/alertes-desabonnement?u=<user_id>&s=<signature>   depuis le courriel
//   POST /api/alertes-desabonnement?u=…&s=…                     désabonnement en un clic des
//                                                               messageries (List-Unsubscribe-Post)
//
// Sans connexion (un vrai désabonnement ne demande pas de mot de passe), mais signé : seul le
// serveur sait fabriquer le lien d'une personne. Coupe seulement les alertes : les projets suivis
// et l'abonnement restent. Se réactive dans Mes dossiers.

import { supabase, signatureValide, site } from './_alertes.js';

function page(titre, message) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
    <title>${titre} — DossierQuébec</title>
    <style>body{font-family:Arial,sans-serif;background:#F7F8FA;color:#16191D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .carte{background:#fff;border:1px solid #DDE2E7;border-radius:12px;padding:32px;max-width:440px;text-align:center;line-height:1.55}
    h1{font-size:20px;margin:0 0 12px}a{color:#076338;font-weight:bold}</style>
    </head><body><div class="carte"><h1>${titre}</h1>${message}</div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const u = String(req.query?.u ?? '');
  const s = String(req.query?.s ?? '');
  if (!process.env.CRON_SECRET || !signatureValide(u, s)) {
    return res.status(400).send(page('Lien invalide', "<p>Ce lien de désabonnement n'est pas valide.</p>"));
  }
  try {
    await supabase('/rest/v1/alertes_preferences?on_conflict=user_id', {
      methode: 'POST',
      corps: [{ user_id: u, actif: false, updated_at: new Date().toISOString() }],
      entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return res.status(200).send(page(
      'Alertes arrêtées',
      `<p>Vous ne recevrez plus d'alertes par courriel sur vos projets suivis.</p>
       <p style="font-size:13px;color:#5B6570">Vos projets suivis et votre abonnement restent intacts. Pour reprendre les alertes, cochez « Recevoir les alertes » dans Mes dossiers.</p>
       <p><a href="${site()}/mes-dossiers">Aller à Mes dossiers</a></p>`
    ));
  } catch (erreur) {
    console.error('alertes-desabonnement :', erreur);
    return res.status(500).send(page('Erreur', '<p>Une erreur est survenue. Réessayez dans un moment.</p>'));
  }
}
