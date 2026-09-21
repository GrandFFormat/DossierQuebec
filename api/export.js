// Le compteur d'exports du palier citoyen : 10 fichiers par mois civil, réservé aux abonnés.
//
//   GET    /api/export  → { limite: 10, faits, reste }   ce qu'il reste ce mois-ci
//   POST   /api/export  → { limite: 10, faits, reste }   réserve un export (à appeler AVANT de
//                         fabriquer le fichier), corps { format: 'xlsx' | 'csv' | 'pdf' }
//   DELETE /api/export  → { limite: 10, faits, reste }   rend la dernière réservation si le
//                         fichier n'est jamais sorti (moins de 10 minutes) : on ne décompte pas
//                         un export que le lecteur n'a pas eu
//   Authorization: Bearer <jeton de session Supabase>
//
//   429 { erreur: 'limite atteinte', limite, faits, reste: 0, reprise } quand le mois est épuisé ;
//   `reprise` est le premier jour du mois suivant, en ISO, pour l'afficher au lecteur.
//   403 { erreur: 'réservé aux abonnés' } sans session, { erreur: 'abonnement inactif' } pour un
//   compte sans abonnement actif, 503 { erreur: 'abonnement non vérifiable' } si Supabase ne
//   répond pas — une panne n'est pas « pas abonné ».
//
// Le fichier lui-même se fabrique dans le navigateur (commun/tableur.js) : le serveur ne compte
// que les départs. Un compteur posé dans le navigateur se viderait en vidant le cache ; celui-ci
// vit dans la table `exports` (scripts/supabase-schema-limites.sql), écrite avec la clé
// service_role. Aucune donnée du fichier n'est conservée : la date et le format suffisent.

import { estActive } from './_stripe.js';

export const LIMITE_MOIS = 10;
const FORMATS = new Set(['xlsx', 'csv', 'pdf']);

async function supabase(chemin, { jeton, methode = 'GET', corps, entetes = {} } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}${chemin}`, {
    method: methode,
    headers: { apikey: cle, Authorization: `Bearer ${jeton ?? cle}`, ...(corps ? { 'Content-Type': 'application/json' } : {}), ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!res.ok) return { ok: false, statut: res.status };
  const texte = await res.text();
  return { ok: true, donnees: texte ? JSON.parse(texte) : null, entetes: res.headers };
}

// Le même contrat que api/detail.js : { id, abonne }, null sans session valable, ou
// { indisponible: true } quand Supabase ne répond pas.
async function abonneDe(jeton) {
  if (!jeton) return null;
  const utilisateur = await supabase('/auth/v1/user', { jeton });
  if (!utilisateur.ok && ![401, 403].includes(utilisateur.statut)) return { indisponible: true };
  const id = utilisateur.ok ? utilisateur.donnees?.id : null;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = await supabase(`/rest/v1/abonnements?user_id=eq.${id}&select=statut,fin,lecture_seule`);
  if (!r.ok) return { id, indisponible: true };
  return { id, abonne: estActive(r.donnees?.[0]), lectureSeule: r.donnees?.[0]?.lecture_seule === true };
}

const refus = (res, qui) => (qui?.indisponible
  ? res.status(503).json({ erreur: 'abonnement non vérifiable' })
  : res.status(403).json({ erreur: qui ? 'abonnement inactif' : 'réservé aux abonnés' }));

// Le mois civil courant, en UTC : même frontière pour tout le monde, et la même que celle que
// PostgreSQL comparera. Le 1er du mois suivant sert à dire quand le compteur repart.
function mois(maintenant = new Date()) {
  const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  const suivant = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 1));
  return { debut: debut.toISOString(), suivant: suivant.toISOString() };
}

// Combien d'exports ce mois-ci. `Prefer: count=exact` évite de rapatrier les lignes.
async function faitsCeMois(userId, debut) {
  const r = await supabase(
    `/rest/v1/exports?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(debut)}&select=id`,
    { entetes: { Prefer: 'count=exact', Range: '0-0' } },
  );
  if (!r.ok) return null;
  const total = Number(r.entetes?.get('content-range')?.split('/')?.[1]);
  return Number.isFinite(total) ? total : (r.donnees?.length ?? 0);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ erreur: 'méthode non permise' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erreur: 'service non configuré' });

  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
  const qui = await abonneDe(jeton);
  if (!qui?.abonne) return refus(res, qui);

  // Compte de consultation (une bibliothèque, ouvert sur un poste public) : il peut voir ce
  // qu'il reste, mais pas consommer le quota de l'abonnement. GET et DELETE ne réservent rien,
  // donc seul POST est refusé.
  if (qui.lectureSeule && req.method === 'POST') {
    return res.status(403).json({ erreur: 'compte de consultation' });
  }

  const { debut, suivant } = mois();
  const faits = await faitsCeMois(qui.id, debut);
  if (faits === null) return res.status(502).json({ erreur: 'compteur indisponible' });

  if (req.method === 'GET') {
    return res.status(200).json({ limite: LIMITE_MOIS, faits, reste: Math.max(0, LIMITE_MOIS - faits) });
  }

  // Rendre la dernière réservation : le navigateur l'appelle quand le fichier n'est jamais sorti
  // (import raté, fenêtre fermée, panne en cours de route). Bornée à dix minutes et à la dernière
  // ligne, pour qu'elle ne serve pas à effacer l'historique du mois.
  if (req.method === 'DELETE') {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const r = await supabase(`/rest/v1/exports?user_id=eq.${qui.id}&created_at=gte.${encodeURIComponent(recent)}&select=id&order=created_at.desc&limit=1`);
    const id = r.ok ? r.donnees?.[0]?.id : null;
    if (!id) return res.status(200).json({ limite: LIMITE_MOIS, faits, reste: Math.max(0, LIMITE_MOIS - faits) });
    const efface = await supabase(`/rest/v1/exports?id=eq.${id}`, { methode: 'DELETE', entetes: { Prefer: 'return=minimal' } });
    const total = efface.ok ? Math.max(0, faits - 1) : faits;
    return res.status(200).json({ limite: LIMITE_MOIS, faits: total, reste: Math.max(0, LIMITE_MOIS - total) });
  }

  if (faits >= LIMITE_MOIS) {
    return res.status(429).json({ erreur: 'limite atteinte', limite: LIMITE_MOIS, faits, reste: 0, reprise: suivant });
  }

  // Le corps arrive déjà décodé sur Vercel, mais pas toujours (même précaution qu'api/message.js).
  let corps = req.body;
  if (typeof corps === 'string') { try { corps = JSON.parse(corps); } catch { corps = null; } }
  const format = String(corps?.format ?? '').trim();
  if (!FORMATS.has(format)) return res.status(400).json({ erreur: 'format invalide' });

  const ecrit = await supabase('/rest/v1/exports', {
    methode: 'POST',
    corps: { user_id: qui.id, format },
    entetes: { Prefer: 'return=minimal' },
  });
  if (!ecrit.ok) return res.status(502).json({ erreur: 'compteur indisponible' });

  const total = faits + 1;
  return res.status(200).json({ limite: LIMITE_MOIS, faits: total, reste: Math.max(0, LIMITE_MOIS - total) });
}
