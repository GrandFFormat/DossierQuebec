// Fonction planifiée (Vercel Cron) — digest hebdomadaire par courriel.
//
// Une fois par semaine : relit les projets de loi depuis Données Québec, détecte
// ceux qui ont changé d'étape depuis la dernière exécution, puis envoie UN seul
// courriel résumé à chaque personne concernée — soit parce qu'elle suit ce projet
// de loi (bouton « Suivre »), soit parce qu'elle a demandé des explications
// dessus (bill_flags). Un courriel par personne, jamais un par changement.
//
// Tous les secrets viennent des variables d'environnement Vercel — RIEN n'est
// codé en dur ici, et ce fichier ne contient aucune clé.
//
// Variables d'environnement attendues (à définir dans Vercel > Settings > Env) :
//   SUPABASE_URL                 ex. https://wfgcqftgtmptfutrbujz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    clé secrète service_role (contourne RLS)
//   RESEND_API_KEY               clé API Resend
//   DIGEST_FROM                  ex. "DossierQuébec <alertes@dossierquebec.com>"
//   CRON_SECRET                  fourni automatiquement par Vercel pour sécuriser le cron
//   PUBLIC_SITE_URL              ex. https://dossierquebec.com (pour les liens du courriel)

import { parse } from 'csv-parse/sync';
import crypto from 'node:crypto';

// Jeton signé pour le lien « Se désabonner » — voir api/unsubscribe.js, qui le
// vérifie avec le même secret. Impossible à forger sans CRON_SECRET.
function unsubscribeToken(userId) {
  const sig = crypto.createHmac('sha256', process.env.CRON_SECRET).update(userId).digest('hex');
  return `${userId}.${sig}`;
}

const CSV_URL = 'https://www.donneesquebec.ca/recherche/dataset/2bde70f9-15ff-455b-b3ea-c6e229b24074/resource/93c74b8c-51d1-49e6-9ab9-1f8d96dbd735/download/projets-de-loi.csv';

const STEP_BY_CODE = {
  presentation: 1,
  depot_commission_consultation: 1,
  adoption_principe: 2,
  depot_commission_etude_detaillee: 3,
  sanction: 5,
};
const STEP_LABEL = {
  1: 'Présentation',
  2: 'Adoption du principe',
  3: 'Étude détaillée',
  4: 'Prise en considération',
  5: 'Adoption / Sanction',
};

function cleanTitle(rawTitle) {
  const match = rawTitle.match(/^\d+-\d+\s+PL\s+\d+\s+(.*)$/);
  return (match ? match[1] : rawTitle).trim();
}

// Étape la plus avancée atteinte par chaque projet de loi (regroupé par Id, la
// vraie clé unique — voir scrapers/bills.js pour pourquoi `num` ne suffit pas).
// Source : le CSV Données Québec, entièrement automatique. Il peut avoir un léger
// retard sur les pages individuelles d'assnat.qc.ca (que bill-details.js scrape
// pour enrichir le site) — donc le digest rattrape toutes les étapes réelles,
// parfois quelques jours après. Limite assumée pour rester 100 % automatique.
function computeCurrentSteps(rows) {
  const currentLeg = Math.max(...rows.map((r) => Number(r.No_legislature)));
  const rowsCurrent = rows.filter((r) => Number(r.No_legislature) === currentLeg);
  const byId = new Map();
  for (const row of rowsCurrent) {
    if (!byId.has(row.Id)) byId.set(row.Id, []);
    byId.get(row.Id).push(row);
  }
  const result = new Map(); // billId -> { step, num, title }
  for (const [id, group] of byId) {
    let bestStep = 0;
    for (const row of group) {
      const s = STEP_BY_CODE[row.Derniere_etape_franchie] ?? 0;
      if (s > bestStep) bestStep = s;
    }
    result.set(Number(id), {
      step: bestStep,
      num: Number(group[0].Numero_projet_loi),
      title: cleanTitle(group[0].Titre_projet_loi),
    });
  }
  return result;
}

async function supaFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${process.env.SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} -> ${res.status} ${await res.text()}`);
  // Certaines écritures (upsert avec return=minimal) renvoient un corps vide —
  // res.json() planterait dessus. On lit le texte et on ne parse que s'il y en a.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getAllUserEmails() {
  // Auth Admin API — associe user_id -> courriel. Première page suffit pour une
  // base d'utilisateurs de départ (per_page max 1000).
  const data = await supaFetch('/auth/v1/admin/users?per_page=1000');
  const map = new Map();
  for (const u of data.users || []) map.set(u.id, u.email);
  return map;
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.DIGEST_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend -> ${res.status} ${await res.text()}`);
  return res.json();
}

function digestHtml(changes, siteUrl, unsubUrl) {
  const rows = changes.map((c) =>
    `<li style="margin-bottom:10px;"><b>Projet de loi n° ${c.num}</b> — ${c.title}<br>` +
    `<span style="color:#5C6270;">Nouvelle étape : ${STEP_LABEL[c.step] || c.step}</span></li>`
  ).join('');
  return `
    <div style="font-family:Arial,sans-serif; max-width:560px; color:#16213E; line-height:1.5;">
      <h2 style="font-size:18px;">DossierQuébec — résumé de la semaine</h2>
      <p>Voici les projets de loi que vous suivez (ou sur lesquels vous avez demandé des explications) qui ont changé d'étape cette semaine :</p>
      <ul style="padding-left:18px;">${rows}</ul>
      <p style="font-size:13px; color:#5C6270;">Vous recevez ce courriel parce que vous suivez ces projets de loi sur DossierQuébec.
      Gérez vos suivis sur <a href="${siteUrl}" style="color:#A9782E;">${siteUrl}</a>.</p>
      <p style="font-size:12px; color:#8891A8;"><a href="${unsubUrl}" style="color:#8891A8;">Se désabonner de ces courriels</a></p>
    </div>`;
}

export default async function handler(req, res) {
  // Sécurité : seul le cron Vercel (qui envoie CRON_SECRET) peut déclencher ça.
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // 1. État courant des projets de loi.
    const csv = await (await fetch(CSV_URL)).text();
    const rows = parse(csv, { columns: true, skip_empty_lines: true });
    const current = computeCurrentSteps(rows);

    // 2. État précédent mémorisé.
    const stored = await supaFetch('/rest/v1/bill_state?select=bill_id,step');
    const prevStep = new Map(stored.map((r) => [Number(r.bill_id), r.step]));

    // 3. Projets de loi dont l'étape a avancé (jamais d'alerte au premier
    //    passage sur un projet inconnu : on enregistre son état sans alerter).
    const changed = new Map(); // billId -> { num, title, step }
    for (const [billId, info] of current) {
      const before = prevStep.get(billId);
      if (before !== undefined && info.step > before) changed.set(billId, info);
    }

    // 4. Toujours mettre à jour la mémoire (même sans changement) pour la
    //    prochaine comparaison.
    const upsertRows = [...current].map(([billId, info]) => ({ bill_id: billId, step: info.step, updated_at: new Date().toISOString() }));
    if (upsertRows.length) {
      await supaFetch('/rest/v1/bill_state?on_conflict=bill_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: upsertRows,
      });
    }

    if (changed.size === 0) {
      return res.status(200).json({ ok: true, changed: 0, emailsSent: 0 });
    }

    const changedIds = [...changed.keys()];
    const inList = `(${changedIds.join(',')})`;

    // 5. Qui suit ces projets de loi + qui a demandé des explications.
    const follows = await supaFetch(`/rest/v1/follows?select=user_id,person_key&person_type=eq.bill&person_key=in.(${changedIds.map((id) => `"${id}"`).join(',')})`);
    const flags = await supaFetch(`/rest/v1/bill_flags?select=user_id,bill_id&bill_id=in.${inList}`);

    const userBills = new Map(); // user_id -> Set(billId)
    const add = (uid, billId) => {
      if (!userBills.has(uid)) userBills.set(uid, new Set());
      userBills.get(uid).add(billId);
    };
    for (const f of follows) add(f.user_id, Number(f.person_key));
    for (const f of flags) add(f.user_id, Number(f.bill_id));

    if (userBills.size === 0) {
      return res.status(200).json({ ok: true, changed: changed.size, emailsSent: 0 });
    }

    // 6. Retirer les personnes désabonnées (voir api/unsubscribe.js).
    const optedOut = new Set((await supaFetch('/rest/v1/email_optout?select=user_id')).map((r) => r.user_id));

    // 7. Courriels des utilisateurs.
    const emailById = await getAllUserEmails();
    const siteUrl = process.env.PUBLIC_SITE_URL || 'https://dossierquebec.com';

    // 8. Un courriel par personne (sauf désabonnées), avec lien de désabonnement.
    let sent = 0;
    for (const [uid, billIdSet] of userBills) {
      if (optedOut.has(uid)) continue;
      const email = emailById.get(uid);
      if (!email) continue;
      const list = [...billIdSet].map((id) => changed.get(id)).filter(Boolean);
      if (list.length === 0) continue;
      const unsubUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(uid))}`;
      await sendEmail(email, 'DossierQuébec — résumé de la semaine', digestHtml(list, siteUrl, unsubUrl));
      sent++;
    }

    return res.status(200).json({ ok: true, changed: changed.size, emailsSent: sent });
  } catch (err) {
    console.error('weekly-digest failed:', err);
    return res.status(500).json({ error: String(err) });
  }
}
