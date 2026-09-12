// Sert le flux RSS ET compte chaque lecture — la seule façon de savoir si le
// flux est utilisé. Un flux est du XML lu par des machines : aucun JavaScript
// ne s'y exécute, donc Vercel Analytics ne le voit jamais.
//
// Pourquoi une fonction et non le fichier statique : Vercel sert d'abord le
// système de fichiers ; une réécriture /feed.xml -> /api/feed serait ignorée
// tant qu'un /feed.xml statique existe. Le XML est donc généré par
// scrapers/build-news-data.js dans api/feed-data.xml — un chemin que Vercel ne
// sert pas — et embarqué ici par « includeFiles » (vercel.json).
//
// CE QU'ON ENREGISTRE : la date, le User-Agent, et rien d'autre. Ni adresse IP,
// ni cookie, ni identifiant. Les lecteurs RSS s'annoncent dans le User-Agent, et
// Feedly comme Inoreader y inscrivent même le NOMBRE D'ABONNÉS
// (« Feedly/1.0 (+http://www.feedly.com/fetcher.html; 12 subscribers) ») :
// c'est la réponse directe à « est-ce que quelqu'un s'en sert ? ».
//
// LE COMPTAGE NE DOIT JAMAIS CASSER LE FLUX. Variables absentes, Supabase lent
// ou en erreur : on sert quand même le XML. La mesure est un à-côté, pas la
// fonction.
//
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, variables d'environnement
// Vercel — les mêmes que api/weekly-digest.js. Rien codé en dur.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const XML_PATH = join(process.cwd(), 'api', 'feed-data.xml');

async function compter(req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return; // en local ou sans config : on ne compte pas, on sert
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);
  const m = ua.match(/(\d+)\s+subscribers?/i);
  await fetch(`${url}/rest/v1/feed_hits`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ua, abonnes: m ? Number(m[1]) : null }),
    // Borne dure : un lecteur RSS ne doit pas attendre notre base de données.
    signal: AbortSignal.timeout(800),
  });
}

export default async function handler(req, res) {
  let xml;
  try {
    xml = readFileSync(XML_PATH, 'utf8');
  } catch {
    return res.status(500).send('Flux indisponible.');
  }
  try { await compter(req); } catch { /* volontairement silencieux */ }
  // no-store : chaque interrogation d'un lecteur atteint la fonction, donc est
  // comptée. Un cache CDN devant compterait 1 pour 60 lecteurs. Le fichier
  // fait ~35 ko ; les lecteurs interrogent toutes les 15 à 60 minutes.
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(xml);
}
