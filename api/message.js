// « Nous écrire » et « Signaler une erreur » — pour « Mes dossiers » et tous les volets municipaux.
//
//   POST /api/message
//   Authorization: Bearer <jeton de session Supabase>   (obligatoire : il faut être connecté)
//   { sujet: 'idee' | 'suggestion' | 'probleme' | 'erreur', message, ville?, numero?, page? }
//
// Réponses : 200 { ok: true } · 400 message invalide · 401 pas connecté · 429 plus de 5 messages
// en 24 heures · 502/503 service indisponible.
//
// Le message est gardé dans la table Supabase `messages_utilisateurs` (voir
// scripts/supabase-schema-messages.sql) et une copie part par courriel (Resend) à MESSAGES_A ;
// « Répondre » dans la boîte courriel écrit directement à la personne. L'adresse de réception
// reste dans les variables Vercel : le dépôt est public.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, MESSAGES_A
// (une adresse, ou plusieurs séparées par des virgules).

const SUJETS = { idee: 'Idée', suggestion: 'Suggestion', probleme: 'Problème sur le site', erreur: 'Erreur dans une donnée' };
const VILLES = { quebec: 'Québec', montreal: 'Montréal', levis: 'Lévis', longueuil: 'Longueuil', laval: 'Laval' };
const PAR_JOUR = 5;
const SITE = 'https://dossierquebec.ca';

const NUMERO = /^[\p{L}\p{N} ._\-/]{1,80}$/u;
const PAGE = /^\/[\w\-./?=&%+~]{0,299}$/;

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function supabase(chemin, { methode = 'GET', corps, jeton, entetes = {} } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}${chemin}`, {
      method: methode,
      headers: { apikey: cle, Authorization: `Bearer ${jeton ?? cle}`, 'Content-Type': 'application/json', ...entetes },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    if (!res.ok) return { ok: false, statut: res.status };
    const texte = await res.text();
    return { ok: true, donnees: texte ? JSON.parse(texte) : null };
  } catch {
    return { ok: false, statut: 0 };
  }
}

async function estAbonne(id) {
  const r = await supabase(`/rest/v1/abonnements?user_id=eq.${id}&select=statut,fin`);
  const ligne = r.ok ? r.donnees?.[0] : null;
  return Boolean(ligne && ligne.statut === 'actif' && (!ligne.fin || new Date(ligne.fin) > new Date()));
}

async function envoyerCourriel(m) {
  const { RESEND_API_KEY, DIGEST_FROM, MESSAGES_A } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM || !MESSAGES_A) return false;
  const lieu = [VILLES[m.ville], m.numero].filter(Boolean).join(' ');
  const sujet = `[DossierQuébec] ${SUJETS[m.sujet]}${lieu ? ` — ${lieu}` : ''}${m.abonne ? ' (abonné)' : ''}`;
  const ligne = (etiquette, valeur) => (valeur ? `<tr><td style="padding:2px 12px 2px 0;vertical-align:top">${etiquette}</td><td style="padding:2px 0">${valeur}</td></tr>` : '');
  const fiche = m.ville && m.numero ? `${SITE}/${m.ville}/decisions.html?q=${encodeURIComponent(m.numero)}` : null;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.5">
    <p style="white-space:pre-wrap;margin:0 0 16px;font-size:15px">${echapper(m.message)}</p>
    <table style="font-size:13px;color:#5B6570;border-collapse:collapse">
      ${ligne('De', `${echapper(m.email)} · ${m.abonne ? '<b style="color:#076338">abonné</b>' : 'pas abonné'}`)}
      ${ligne('Sujet', SUJETS[m.sujet])}
      ${ligne('Décision', fiche ? `<a href="${echapper(fiche)}">${echapper(lieu)}</a>` : '')}
      ${ligne('Page', m.page ? `<a href="${echapper(SITE + m.page)}">${echapper(m.page)}</a>` : '')}
    </table>
    <p style="font-size:12px;color:#5B6570;margin-top:16px">Répondre à ce courriel écrit directement à la personne. Le message est aussi dans Supabase, table messages_utilisateurs.</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: DIGEST_FROM, to: MESSAGES_A.split(',').map((a) => a.trim()).filter(Boolean), reply_to: m.email, subject: sujet, html }),
    });
    if (!res.ok) console.error('Resend :', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error('Resend :', e);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erreur: 'POST seulement' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ erreur: 'service non configuré' });

  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
  const utilisateur = jeton ? await supabase('/auth/v1/user', { jeton }) : { ok: false };
  const id = utilisateur.ok ? utilisateur.donnees?.id : null;
  const email = utilisateur.ok ? utilisateur.donnees?.email : null;
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !email) return res.status(401).json({ erreur: 'connexion requise' });

  let corps = req.body;
  if (typeof corps === 'string') {
    try {
      corps = JSON.parse(corps);
    } catch {
      corps = null;
    }
  }
  const sujet = String(corps?.sujet ?? '');
  const message = String(corps?.message ?? '').trim();
  if (!Object.hasOwn(SUJETS, sujet) || message.length < 3 || message.length > 4000) return res.status(400).json({ erreur: 'message invalide' });
  const ville = Object.hasOwn(VILLES, String(corps?.ville)) ? corps.ville : null;
  const numero = NUMERO.test(String(corps?.numero ?? '')) ? String(corps.numero).trim() : null;
  const page = PAGE.test(String(corps?.page ?? '')) ? corps.page : null;

  const depuis = new Date(Date.now() - 24 * 3600e3).toISOString();
  const recents = await supabase(`/rest/v1/messages_utilisateurs?user_id=eq.${id}&created_at=gte.${encodeURIComponent(depuis)}&select=id&limit=${PAR_JOUR}`);
  if (!recents.ok) return res.status(503).json({ erreur: 'service indisponible' });
  if (recents.donnees.length >= PAR_JOUR) return res.status(429).json({ erreur: 'limite atteinte' });

  const m = { user_id: id, email, abonne: await estAbonne(id), sujet, message, ville, numero, page };
  const courrielEnvoye = await envoyerCourriel(m);
  let insertion = await supabase('/rest/v1/messages_utilisateurs', {
    methode: 'POST',
    corps: { ...m, courriel_envoye: courrielEnvoye },
    entetes: { Prefer: 'return=minimal' },
  });
  // Tant que la contrainte de la table ne connaît pas « suggestion » (scripts/supabase-schema-messages.sql),
  // on garde le message comme une idée, marqué « [Suggestion] », plutôt que de le perdre.
  if (!insertion.ok && sujet === 'suggestion') {
    insertion = await supabase('/rest/v1/messages_utilisateurs', {
      methode: 'POST',
      corps: { ...m, sujet: 'idee', message: `[Suggestion] ${message}`, courriel_envoye: courrielEnvoye },
      entetes: { Prefer: 'return=minimal' },
    });
  }
  if (!insertion.ok) {
    console.error('messages_utilisateurs :', insertion.statut);
    if (!courrielEnvoye) return res.status(502).json({ erreur: "le message n'a pas pu être enregistré" });
  }
  return res.status(200).json({ ok: true });
}
