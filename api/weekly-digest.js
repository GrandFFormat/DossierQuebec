// Fonction planifiée (Vercel Cron) — digest « demandes d'explications » aux 2 semaines.
//
// Toutes les 2 semaines, envoie UN courriel par personne qui récapitule les projets
// de loi qu'elle a « challengés » (bouton « Demander une explication » → bill_flags),
// avec, pour chacun : le nombre actuel de demandes, et une note quand un CAP a été
// franchi depuis le dernier envoi (500, 1000, 2500, 5000, 25000), quand le parrain a
// été jugé insuffisant (escalade admin), ou quand le projet est devenu loi sous le
// seuil de pétition. On n'expose JAMAIS qui a demandé quoi — seulement des totaux.
//
// Le cron tourne chaque semaine (vercel.json) ; on n'envoie qu'une semaine sur deux
// (semaines ISO paires), sauf déclenchement manuel avec ?force=1.
//
// Tous les secrets viennent des variables d'environnement Vercel — rien codé en dur.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM,
//   CRON_SECRET, PUBLIC_SITE_URL

import { parse } from 'csv-parse/sync';
import crypto from 'node:crypto';

const CHALLENGE_TIERS = [500, 1000, 2500, 5000, 25000];
const PETITION_THRESHOLD = 1000;

// Jeton signé pour le lien « Se désabonner » — voir api/unsubscribe.js.
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

function cleanTitle(rawTitle) {
  const match = rawTitle.match(/^\d+-\d+\s+PL\s+\d+\s+(.*)$/);
  return (match ? match[1] : rawTitle).trim();
}

// Étape/num/titre par projet, depuis le CSV Données Québec (clé = Id).
function computeCurrentBills(rows) {
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
  const res = await fetch(`${process.env.SUPABASE_URL}${path}`, {
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
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getAllUserEmails() {
  const data = await supaFetch('/auth/v1/admin/users?per_page=1000');
  const map = new Map();
  for (const u of data.users || []) map.set(u.id, u.email);
  return map;
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.DIGEST_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend -> ${res.status} ${await res.text()}`);
  return res.json();
}

const fr = (n) => n.toLocaleString('fr-CA');

// Note affichée pour un projet dans le digest, selon ce qui a changé.
function billNote(r) {
  if (r.becameLaw) {
    return `Ce projet est <b>devenu loi</b> (sanctionné), sous le seuil de pétition de ${fr(PETITION_THRESHOLD)} demandes.`;
  }
  if (r.escalation) {
    return `Le parrain a répondu, mais c'est jugé <b>insuffisant</b> : la campagne continue — nouveau seuil de <b>${fr(r.threshold)}</b> demandes. Continuez de partager !`;
  }
  if (r.crossed === 500) {
    return `🔥 On a passé le <b>cap des 500</b> — on est rendu à <b>${fr(r.count)}</b> demandes. À ${fr(PETITION_THRESHOLD)}, on lance une pétition.`;
  }
  if (r.crossed === PETITION_THRESHOLD) {
    return `🔥 <b>Cap des ${fr(PETITION_THRESHOLD)} franchi</b> — ${fr(r.count)} demandes ! On passe à l'action : démarche pour une <b>pétition</b> à l'Assemblée nationale.`;
  }
  if (r.crossed) {
    return `🔥 <b>Cap des ${fr(r.crossed)} franchi</b> — ${fr(r.count)} demandes. La pression monte !`;
  }
  return `${fr(r.count)} demandes.`;
}

function digestHtml(reports, siteUrl, unsubUrl) {
  const rows = reports.map((r) =>
    `<li style="margin-bottom:12px;"><b>Projet de loi n° ${r.num}</b> — ${r.title}<br>` +
    `<span style="color:#5C6270;">${billNote(r)}</span></li>`
  ).join('');
  return `
    <div style="font-family:Arial,sans-serif; max-width:560px; color:#16213E; line-height:1.5;">
      <h2 style="font-size:18px;">DossierQuébec — des nouvelles de vos demandes</h2>
      <p>Voici où en sont les projets de loi sur lesquels vous avez demandé une explication :</p>
      <ul style="padding-left:18px;">${rows}</ul>
      <p style="font-size:13px; color:#5C6270;">Vous recevez ce courriel parce que vous avez demandé des explications sur ces projets de loi.
      Consultez le palmarès sur <a href="${siteUrl}" style="color:#A9782E;">${siteUrl}</a>.</p>
      <p style="font-size:12px; color:#8891A8;"><a href="${unsubUrl}" style="color:#8891A8;">Se désabonner de ces courriels</a></p>
    </div>`;
}

// Numéro de semaine ISO (pour n'envoyer qu'une semaine sur deux).
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fdDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdDay + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Aux 2 semaines : on n'envoie que les semaines ISO paires (sauf ?force=1).
  const force = req.query && (req.query.force === '1' || req.query.force === 'true');
  if (!force && isoWeek(new Date()) % 2 !== 0) {
    return res.status(200).json({ ok: true, skipped: 'off-week', emailsSent: 0 });
  }

  try {
    // 1. Comptes actuels par projet + état des projets (CSV) + état de campagne.
    const counts = new Map(
      (await supaFetch('/rest/v1/rpc/flag_counts_all', { method: 'POST', body: {} }))
        .map((r) => [Number(r.bill_id), Number(r.cnt)])
    );
    if (counts.size === 0) return res.status(200).json({ ok: true, emailsSent: 0, reason: 'no flags' });

    const csv = await (await fetch(CSV_URL)).text();
    const billInfo = computeCurrentBills(parse(csv, { columns: true, skip_empty_lines: true }));

    const campaignRows = await supaFetch('/rest/v1/bill_campaign?select=bill_id,last_count,threshold,escalation_pending,terminal_notified');
    const campaign = new Map(campaignRows.map((r) => [Number(r.bill_id), r]));

    // 2. Pour chaque projet flaggé : y a-t-il une « nouvelle » depuis le dernier digest ?
    const reportByBill = new Map(); // billId -> report
    for (const [billId, count] of counts) {
      const info = billInfo.get(billId);
      const c = campaign.get(billId) || { last_count: 0, threshold: PETITION_THRESHOLD, escalation_pending: false, terminal_notified: false };
      const last = c.last_count ?? 0;
      const crossed = [...CHALLENGE_TIERS].reverse().find((t) => last < t && t <= count) ?? null;
      const becameLaw = !!info && info.step === 5 && count < (c.threshold ?? PETITION_THRESHOLD) && !c.terminal_notified;
      const escalation = !!c.escalation_pending;
      if (crossed || becameLaw || escalation) {
        reportByBill.set(billId, {
          num: info ? info.num : billId,
          title: info ? info.title : `#${billId}`,
          count, crossed, becameLaw, escalation,
          threshold: c.threshold ?? PETITION_THRESHOLD,
        });
      }
    }

    // 3. Toujours mémoriser le compte courant (et solder escalade/terminal notifiés),
    //    même si personne n'est notifié, pour la prochaine comparaison.
    const upsert = [...counts].map(([billId, count]) => {
      const r = reportByBill.get(billId);
      const c = campaign.get(billId);
      return {
        bill_id: billId,
        last_count: count,
        threshold: c ? c.threshold : PETITION_THRESHOLD,
        escalation_pending: false,
        terminal_notified: (c && c.terminal_notified) || (r ? r.becameLaw : false),
        updated_at: new Date().toISOString(),
      };
    });
    if (upsert.length) {
      await supaFetch('/rest/v1/bill_campaign?on_conflict=bill_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: upsert,
      });
    }

    if (reportByBill.size === 0) return res.status(200).json({ ok: true, emailsSent: 0, reason: 'no news' });

    // 4. Qui a demandé quoi (bill_flags) — seulement les projets avec une nouvelle.
    const newsIds = [...reportByBill.keys()];
    const flags = await supaFetch(`/rest/v1/bill_flags?select=user_id,bill_id&bill_id=in.(${newsIds.join(',')})`);
    const userBills = new Map(); // user_id -> [billId]
    for (const f of flags) {
      if (!userBills.has(f.user_id)) userBills.set(f.user_id, []);
      userBills.get(f.user_id).push(Number(f.bill_id));
    }
    if (userBills.size === 0) return res.status(200).json({ ok: true, emailsSent: 0 });

    // 5. Désabonnées + courriels.
    const optedOut = new Set((await supaFetch('/rest/v1/email_optout?select=user_id')).map((r) => r.user_id));
    const emailById = await getAllUserEmails();
    const siteUrl = process.env.PUBLIC_SITE_URL || 'https://dossierquebec.ca';

    let sent = 0;
    for (const [uid, billIds] of userBills) {
      if (optedOut.has(uid)) continue;
      const email = emailById.get(uid);
      if (!email) continue;
      const reports = billIds.map((id) => reportByBill.get(id)).filter(Boolean);
      if (reports.length === 0) continue;
      const unsubUrl = `${siteUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(uid))}`;
      await sendEmail(email, 'DossierQuébec — des nouvelles de vos demandes', digestHtml(reports, siteUrl, unsubUrl));
      sent++;
    }

    return res.status(200).json({ ok: true, billsWithNews: reportByBill.size, emailsSent: sent });
  } catch (err) {
    console.error('weekly-digest failed:', err);
    return res.status(500).json({ error: String(err) });
  }
}
