// Partagé par api/alertes-projets.js et api/alertes-desabonnement.js (le « _ » : Vercel n'en fait
// pas une route).

import crypto from 'node:crypto';

export async function supabase(chemin, { methode = 'GET', corps, entetes = {} } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}${chemin}`, {
    method: methode,
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${methode} ${chemin.split('?')[0]} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const texte = await res.text();
  return texte ? JSON.parse(texte) : null;
}

// Le lien « Ne plus recevoir ces alertes » : signé avec CRON_SECRET, pour que personne ne puisse
// couper les alertes de quelqu'un d'autre. Préfixe « alertes: » : un jeton du résumé de
// DossierQuébec (api/unsubscribe.js) ne vaut pas ici, et inversement.
// signer(usage, …) : un préfixe par usage, pour qu'un jeton signé pour l'un ne vaille pas pour l'autre.
export const signer = (usage, userId) => crypto.createHmac('sha256', process.env.CRON_SECRET).update(`${usage}:${userId}`).digest('hex');
export const signature = (userId) => signer('alertes', userId);

export function signatureValide(userId, sig, usage = 'alertes') {
  if (!/^[0-9a-f-]{36}$/.test(userId ?? '') || !/^[0-9a-f]{64}$/.test(sig ?? '')) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signer(usage, userId));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const site = () => (process.env.PUBLIC_SITE_URL || 'https://dossierquebec.ca').replace(/\/$/, '');
