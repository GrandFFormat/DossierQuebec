// Partagé par api/infolettre.js (inscription, confirmation, désinscription) et api/alertes-projets.js
// (l'envoi du mois, au passage du cron quotidien). Le « _ » : Vercel n'en fait pas une route.
//
// Le compte rendu est préparé et relu à la main (quebec/scripts/infolettre.js), puis publié dans
// la table infolettre_numeros avec --publier. Publié, il part aux inscrits confirmés de sa ville au
// prochain passage du cron (11 h UTC), 90 courriels au plus par jour (forfait gratuit de Resend :
// 100 par jour, alertes comprises) ; le reste part les jours suivants.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, CRON_SECRET.

import crypto from 'node:crypto';
import { supabase, site } from './_alertes.js';

// Les villes qui ont un compte rendu mensuel. Une ville s'ajoute ici le jour où son volet en produit un.
export const VILLES_INFOLETTRE = { quebec: 'Québec' };

export const COURRIEL = /^[^@\s]{1,100}@[^@\s]{1,100}\.[^@\s]{2,40}$/;
export const PAR_JOUR = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const nomMois = (aaaamm) => { const [a, m] = aaaamm.split('-').map(Number); return `${MOIS[m - 1]} ${a}`; };
// « d'août 2026 », « de septembre 2026 »
export const deMois = (aaaamm) => { const nom = nomMois(aaaamm); return `${/^[aeiou]/.test(nom) ? "d'" : 'de '}${nom}`; };
// « au début d'octobre », « au début de novembre » : le mois qui suit aujourd'hui.
export function prochainEnvoi(maintenant = new Date()) {
  const nom = MOIS[(maintenant.getUTCMonth() + 1) % 12];
  return `au début ${/^[aeiou]/.test(nom) ? "d'" : 'de '}${nom}`;
}
export const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Liens signés : seul le serveur sait fabriquer le lien de confirmation ou de désinscription d'une
// inscription. Préfixe propre à chaque usage.
const signature = (usage, ids) => crypto.createHmac('sha256', process.env.CRON_SECRET).update(`infolettre-${usage}:${[...ids].sort().join(',')}`).digest('hex');
export const lienSigne = (usage, ids, extra = '') => `${site()}/api/infolettre?action=${usage}&ids=${ids.join(',')}&s=${signature(usage, ids)}${extra}`;
export function idsSignes(usage, idsTexte, s) {
  const ids = String(idsTexte ?? '').split(',').filter(Boolean);
  if (!ids.length || ids.length > 20 || !ids.every((id) => UUID.test(id)) || !/^[0-9a-f]{64}$/.test(String(s ?? ''))) return null;
  const a = Buffer.from(String(s));
  const b = Buffer.from(signature(usage, ids));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? ids : null;
}

// Resend, par lots de 100 (l'API /emails/batch).
export async function envoyerCourriels(messages) {
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({
        from: process.env.DIGEST_FROM,
        to: m.a,
        subject: m.sujet,
        html: m.html,
        ...(m.desinscription ? { headers: { 'List-Unsubscribe': `<${m.desinscription}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
      }))),
    });
    if (!res.ok) throw new Error(`Resend → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// Les adresses des abonnés payants actifs : elles reçoivent l'édition abonnés.
export async function courrielsAbonnes() {
  const maintenant = new Date();
  const actifs = (await supabase('/rest/v1/abonnements?statut=eq.actif&select=user_id,fin')).filter((a) => (!a.fin || new Date(a.fin) > maintenant) && UUID.test(a.user_id));
  const courriels = new Set();
  await Promise.all(actifs.map(async ({ user_id: id }) => {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    }).catch(() => null);
    const u = r?.ok ? await r.json() : null;
    if (u?.email) courriels.add(u.email.toLowerCase());
  }));
  return courriels;
}

export const dernierNumero = async (ville) =>
  (await supabase(`/rest/v1/infolettre_numeros?ville=eq.${ville}&publie_le=not.is.null&select=ville,mois,titre,html,html_abonnes&order=mois.desc&limit=1`))[0] ?? null;

// Le compte rendu, prêt à partir : le bandeau de bienvenue (s'il y a lieu) et les liens de désinscription.
export function composer(numero, { id, abonne, bienvenue }) {
  const ville = VILLES_INFOLETTRE[numero.ville] ?? numero.ville;
  const bandeau = bienvenue
    ? `<tr><td style="padding:18px 0 0"><div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:14px 16px;border-radius:10px;background:#E8F6EE;border:1px solid #9FD9B6;font-size:15px;line-height:1.55;color:#16191D">👋 <strong>Bienvenue !</strong> Voici le plus récent compte rendu de la Ville de ${echapper(ville)}, celui ${echapper(deMois(numero.mois))}. <strong>Le prochain arrive ${prochainEnvoi()}</strong>, puis un par mois.</div></td></tr>`
    : '';
  const pied = `<br><br>Vous recevez ce compte rendu parce que vous vous y êtes inscrit sur dossierquebec.ca.
    <a href="${lienSigne('desinscrire', [id])}" style="color:#5B6470">Ne plus recevoir celui de ${echapper(ville)}</a> ·
    <a href="${lienSigne('desinscrire', [id], '&tout=1')}" style="color:#5B6470">me désinscrire de tous les comptes rendus</a>`;
  return (abonne ? numero.html_abonnes : numero.html).replace('<!--BANDEAU-->', bandeau).replace('<!--DESINSCRIPTION-->', pied);
}

// À la confirmation (ou à la case cochée dans Mes dossiers) : le plus récent compte rendu de chaque
// ville, avec le bandeau de bienvenue. Sans compte rendu publié, un court mot qui dit quand il arrive.
export async function envoyerBienvenue(inscriptions) {
  if (!inscriptions.length) return 0;
  const abonnes = await courrielsAbonnes();
  const messages = [];
  const envoyesPour = new Map(); // mois → ids
  for (const i of inscriptions) {
    const numero = await dernierNumero(i.ville);
    const ville = VILLES_INFOLETTRE[i.ville] ?? i.ville;
    if (numero) {
      messages.push({ a: i.email, sujet: `Bienvenue — ${numero.titre}`, html: composer(numero, { id: i.id, abonne: abonnes.has(i.email), bienvenue: true }), desinscription: lienSigne('desinscrire', [i.id]) });
      envoyesPour.set(numero.mois, [...(envoyesPour.get(numero.mois) ?? []), i.id]);
    } else {
      messages.push({
        a: i.email,
        sujet: `Inscription confirmée — le compte rendu de la Ville de ${ville}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16191D;line-height:1.55"><h1 style="font-size:20px;color:#0B8A4B">📬 C'est confirmé</h1><p>Vous recevrez le compte rendu mensuel de la Ville de ${echapper(ville)}. <strong>Le premier arrive ${prochainEnvoi()}.</strong></p><p style="font-size:13px;color:#5B6470">En attendant : <a href="${site()}/${i.ville}/" style="color:#0B8A4B">les décisions de la Ville</a>. <a href="${lienSigne('desinscrire', [i.id])}" style="color:#5B6470">Me désinscrire</a></p></div>`,
        desinscription: lienSigne('desinscrire', [i.id]),
      });
    }
  }
  await envoyerCourriels(messages);
  for (const [mois, ids] of envoyesPour) {
    await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${ids.join(',')})`, { methode: 'PATCH', corps: { dernier_mois: mois }, entetes: { Prefer: 'return=minimal' } });
  }
  return messages.length;
}

// Le cron : chaque compte rendu publié et pas encore parti, aux inscrits confirmés qui ne l'ont pas
// reçu (ceux qui l'ont eu en bienvenue sont sautés), PAR_JOUR au plus.
export async function envoyerNumerosEnAttente() {
  const rapport = { numeros: 0, envoyes: 0, termines: 0 };
  const numeros = await supabase('/rest/v1/infolettre_numeros?publie_le=not.is.null&envoye_le=is.null&select=ville,mois,titre,html,html_abonnes,envoyes&order=mois');
  if (!numeros.length) return rapport;
  const abonnes = await courrielsAbonnes();
  let reste = PAR_JOUR;
  for (const numero of numeros) {
    if (reste <= 0) break;
    rapport.numeros++;
    const inscrits = await supabase(`/rest/v1/infolettre_inscriptions?ville=eq.${numero.ville}&statut=eq.confirme&or=(dernier_mois.is.null,dernier_mois.lt.${numero.mois})&select=id,email&order=confirme_le&limit=${reste + 1}`);
    const lot = inscrits.slice(0, reste);
    if (lot.length) {
      await envoyerCourriels(lot.map((i) => ({ a: i.email, sujet: numero.titre, html: composer(numero, { id: i.id, abonne: abonnes.has(i.email), bienvenue: false }), desinscription: lienSigne('desinscrire', [i.id]) })));
      await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${lot.map((i) => i.id).join(',')})`, { methode: 'PATCH', corps: { dernier_mois: numero.mois }, entetes: { Prefer: 'return=minimal' } });
      reste -= lot.length;
      rapport.envoyes += lot.length;
    }
    const termine = inscrits.length <= lot.length;
    await supabase(`/rest/v1/infolettre_numeros?ville=eq.${numero.ville}&mois=eq.${numero.mois}`, {
      methode: 'PATCH',
      corps: { envoyes: (numero.envoyes ?? 0) + lot.length, updated_at: new Date().toISOString(), ...(termine ? { envoye_le: new Date().toISOString() } : {}) },
      entetes: { Prefer: 'return=minimal' },
    });
    if (termine) rapport.termines++;
  }
  return rapport;
}
