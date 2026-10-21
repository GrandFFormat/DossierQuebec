// Sert le flux RSS ET compte chaque lecture — la seule façon de savoir si le
// flux est utilisé. Un flux est du XML lu par des machines : aucun JavaScript
// ne s'y exécute, donc Vercel Analytics ne le voit jamais.
//
// RÉSERVÉ AUX ABONNÉ·E·S depuis le 21 oct. 2026 (décision de Martin). /feed.xml
// sans jeton renvoie un flux d'UNE entrée qui le dit, avec un lien vers
// /abonnement : les lecteurs déjà abonnés voient le message (une erreur HTTP,
// ils la cacheraient). Les abonné·e·s lisent leur adresse personnelle signée,
// /api/feed?u=<id>&s=<signature>&type=tout|mots|elus|ministere — voir
// api/_rss-abonnes.js. L'abonnement est revérifié à CHAQUE lecture.
//
// Pourquoi une fonction et non le fichier statique : Vercel sert d'abord le
// système de fichiers ; une réécriture /feed.xml -> /api/feed serait ignorée
// tant qu'un /feed.xml statique existe. Le XML est donc généré par
// scrapers/build-news-data.js dans api/feed-data.xml — un chemin que Vercel ne
// sert pas — et embarqué ici par « includeFiles » (vercel.json).
//
// CE QU'ON ENREGISTRE : la date, le User-Agent, et rien d'autre. Ni adresse IP,
// ni cookie, ni identifiant (même pas celui de l'abonné·e d'une adresse
// personnelle). Les lecteurs RSS s'annoncent dans le User-Agent, et Feedly
// comme Inoreader y inscrivent même le NOMBRE D'ABONNÉS
// (« Feedly/1.0 (+http://www.feedly.com/fetcher.html; 12 subscribers) »).
//
// LE COMPTAGE NE DOIT JAMAIS CASSER LE FLUX. Variables absentes, Supabase lent
// ou en erreur : on sert quand même le XML.
//
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et CRON_SECRET (signature
// des adresses), variables d'environnement Vercel déjà en place. Rien codé en dur.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signatureValide, supabase, site } from './_alertes.js';
import { ligneAbonnement, estActive } from './_stripe.js';
import { USAGE, avisPublic, avisInactif, avisInvalide, avis, fluxAbonne } from './_rss-abonnes.js';

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

const lireJson = (chemin) => fetch(`${site()}${chemin}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// Le flux d'un·e abonné·e dont l'adresse est déjà vérifiée.
// `precis` (21 oct. 2026, le + de Mon dossier) : { mot } ou { elu } pour UN mot-clé ou UN élu, au lieu
// de tous ceux du compte. Le filtre n'a pas besoin d'être signé : c'est l'identité qui ouvre l'accès.
async function fluxPersonnel(uid, type, ministere, precis = {}) {
  if (type === 'tout') return readFileSync(XML_PATH, 'utf8');
  const brut = await lireJson('/data/bills.json');
  if (!Array.isArray(brut?.bills)) return avis('flux-indisponible', 'Flux momentanément indisponible', 'Les données des projets de loi n’ont pas pu être lues. Votre lecteur réessaiera tout seul.', `${site()}/projets-de-loi`);
  if (type === 'mots') {
    const [lignes, resumes] = await Promise.all([
      supabase(`/rest/v1/alertes_mots_cles?select=mot&user_id=eq.${uid}&portee=eq.assemblee&order=created_at`),
      lireJson('/data/bills-resumes-fr.json'),
    ]);
    return fluxAbonne({ type, bills: brut.bills, resumes, mots: precis.mot ? [precis.mot] : (lignes ?? []).map((l) => l.mot).filter(Boolean) });
  }
  if (type === 'elus') {
    const [follows, votes, deputes] = await Promise.all([
      supabase(`/rest/v1/follows?select=person_type,person_key&user_id=eq.${uid}&person_type=in.(minister,depute)`),
      lireJson('/data/votes.json'),
      lireJson('/data/site/deputesRaw.json'),
    ]);
    return fluxAbonne({ type, bills: brut.bills, votes: votes?.votes ?? null, deputes: Array.isArray(deputes) ? deputes : [], follows: precis.elu ? [{ person_type: 'depute', person_key: precis.elu }] : (follows ?? []) });
  }
  return fluxAbonne({ type, bills: brut.bills, ministere });
}

export default async function handler(req, res) {
  const q = req.query ?? {};
  let xml;
  try {
    if (!q.u && !q.s) {
      xml = avisPublic();
    } else if (!process.env.CRON_SECRET || !signatureValide(String(q.u ?? ''), String(q.s ?? ''), USAGE)) {
      xml = avisInvalide();
    } else {
      const uid = String(q.u);
      const type = ['tout', 'mots', 'elus', 'ministere'].includes(String(q.type ?? 'tout')) ? String(q.type ?? 'tout') : 'tout';
      // Abonnement illisible (Supabase en panne) : on ne dit pas « plus actif » à un abonné payant.
      let ligne;
      try {
        ligne = await ligneAbonnement(uid);
      } catch {
        ligne = undefined;
      }
      if (ligne === undefined) xml = avis('abonnement-non-verifiable', 'Flux momentanément indisponible', 'Votre abonnement n’a pas pu être vérifié pour l’instant. Votre lecteur réessaiera tout seul.');
      else if (!estActive(ligne)) xml = avisInactif(uid);
      else xml = await fluxPersonnel(uid, type, String(q.m ?? '').slice(0, 200), { mot: String(q.q ?? '').trim().slice(0, 60), elu: String(q.e ?? '').trim().slice(0, 160) });
    }
  } catch (e) {
    console.error('feed :', e.message);
    return res.status(500).send('Flux indisponible.');
  }
  try { await compter(req); } catch { /* volontairement silencieux */ }
  // no-store : chaque interrogation d'un lecteur atteint la fonction, donc est
  // comptée, et un abonnement terminé se voit à la lecture suivante.
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(xml);
}
