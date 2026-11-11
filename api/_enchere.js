// Enchère en direct des mois de bannière (Martin, 11 nov. 2026), servie par api/represente.js
// (le « _ » : Vercel n'en fait pas une route).
//
//   GET  /api/represente?enchere=quebec&mois=2026-12-01[&jeton=…]  → classement (montants seulement)
//   POST /api/represente { action: 'offre', ville_cle, mois, montant, nom, entreprise, courriel, langue, page }
//   GET  /api/represente?confirmer=<jeton>                          → confirme l'offre, retour à la page
//
// Une offre compte une fois confirmée par le lien du courriel. Classement : la meilleure offre de
// chaque courriel, du plus haut montant au plus bas, la première confirmée passe devant à égalité.
// Quand une offre confirmée prend la 1re place, l'ancien premier reçoit un courriel. Martin
// (MESSAGES_A) reçoit chaque offre confirmée et, à la fermeture (7 jours avant le début du mois),
// le gagnant, pour lui envoyer la facture GHL.
//
// Table : scripts/supabase-rtv-encheres.sql.
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, MESSAGES_A.

import crypto from 'node:crypto';
import { supabase, site } from './_alertes.js';

// Prix de départ de la bannière, par mois (grille du 6 nov. 2026). Une ville absente : pas d'enchère.
export const VILLES = {
  quebec: { nom: 'Québec', prix: 300, page: '/quebec/' },
  montreal: { nom: 'Montréal', prix: 500, page: '/montreal/' },
  levis: { nom: 'Lévis', prix: 100, page: '/levis/' },
};
export const FERMETURE = 7;
const COURRIEL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const propre = (s, max) => String(s ?? '').trim().slice(0, max);
const jourIso = (d) => d.toISOString().slice(0, 10);
const decaler = (iso, jours) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + jours); return jourIso(d); };
// Fin du mois de bannière : la veille du même jour, le mois suivant (1er déc. → 31 déc., 9 nov. → 8 déc.).
export const finDuMois = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(d.getUTCDate() - 1); return jourIso(d); };
export const fermeture = (iso) => decaler(iso, -FERMETURE);
const aujourdhui = () => jourIso(new Date());

const dollars = (n, L) => (L === 'en' ? '$' + n.toLocaleString('en-CA') : n.toLocaleString('fr-CA') + ' $');
const date = (iso, L) => { const s = new Date(iso + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); return L === 'en' ? s : s.replace(/^1 /, '1er '); };
const rang = (n, L) => (L === 'en' ? n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th') : n === 1 ? '1re' : n + 'e');

async function courriel(a, sujet, html, repondreA) {
  const { RESEND_API_KEY, DIGEST_FROM } = process.env;
  if (!RESEND_API_KEY || !DIGEST_FROM || !a) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: DIGEST_FROM, to: [].concat(a), subject: sujet, html, ...(repondreA ? { reply_to: repondreA } : {}) }),
    });
    if (!r.ok) console.error('Resend :', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('Resend :', e);
    return false;
  }
}
const martin = () => (process.env.MESSAGES_A || '').split(',').map((a) => a.trim()).filter(Boolean);
const gabarit = (corps) => `<div style="font-family:Arial,sans-serif;max-width:560px;color:#16191D;line-height:1.5;font-size:15px">${corps}</div>`;
const bouton = (url, texte) => `<p style="margin:20px 0"><a href="${url}" style="background:#16191D;color:#fff;padding:10px 18px;text-decoration:none;font-weight:bold">${texte}</a></p>`;

// Les offres confirmées d'un mois, la meilleure par courriel, dans l'ordre du classement.
async function classement(ville_cle, mois) {
  const lignes = await supabase(`/rest/v1/rtv_encheres?ville_cle=eq.${encodeURIComponent(ville_cle)}&mois_debut=eq.${mois}`
    + '&confirmee_at=not.is.null&select=id,ville_cle,montant,courriel,nom,entreprise,langue,page,confirmee_at&order=montant.desc,confirmee_at.asc');
  const vus = new Set();
  return (lignes || []).filter((l) => { const c = l.courriel.toLowerCase(); if (vus.has(c)) return false; vus.add(c); return true; });
}

// Retour à la page de la ville ; avec le jeton, la page montre la place de cette offre.
const lienPage = (l, jeton) => {
  const base = l.page && l.page.startsWith(site() + '/') ? l.page.split(/[?#]/)[0] : site() + (VILLES[l.ville_cle]?.page || '/represente-ta-ville');
  const q = [jeton ? 'enchere=' + encodeURIComponent(jeton) : '', l.langue === 'en' ? 'lang=en' : ''].filter(Boolean).join('&');
  return base + (q ? '?' + q : '') + '#enchere';
};

// À la fermeture : un seul courriel à Martin, avec le gagnant.
async function fermer(ville_cle, mois, liste) {
  if (!liste.length) return;
  const f = await supabase('/rest/v1/rtv_encheres_fermees?on_conflict=ville_cle,mois_debut', {
    methode: 'POST', corps: { ville_cle, mois_debut: mois }, entetes: { Prefer: 'resolution=ignore-duplicates,return=representation' },
  });
  if (!f || !f.length) return; // déjà fermée et annoncée
  const g = liste[0], v = VILLES[ville_cle];
  await courriel(martin(), `[Enchère fermée] ${v.nom}, ${date(mois, 'fr')} : ${dollars(g.montant, 'fr')}`, gabarit(
    `<p>L’enchère de la bannière de <b>${v.nom}</b> pour le mois du ${date(mois, 'fr')} au ${date(finDuMois(mois), 'fr')} est fermée.</p>
     <p><b>Gagnant :</b> ${echapper(g.entreprise)} (${echapper(g.nom)}), <a href="mailto:${echapper(g.courriel)}">${echapper(g.courriel)}</a><br>
     <b>Montant :</b> ${dollars(g.montant, 'fr')} pour le mois<br><b>Offres :</b> ${liste.length}</p>
     <p>À faire : envoyer la facture GHL, puis ajouter la période (affichage « banniere », prix ${g.montant}) dans ${ville_cle}/data/file-commandite.json.</p>`), g.courriel);
}

// GET : le classement public d'un mois, et la place d'une offre si le jeton est donné.
export async function voir(q) {
  const v = VILLES[q.enchere], mois = String(q.mois || '');
  if (!v || !ISO.test(mois)) return { statut: 400, corps: { ok: false } };
  const liste = await classement(q.enchere, mois);
  const ferme = aujourdhui() > fermeture(mois);
  if (ferme) await fermer(q.enchere, mois, liste).catch((e) => console.error('fermeture :', e));
  const corps = { ok: true, minimum: v.prix, fermeture: fermeture(mois), ferme, offres: liste.map((l) => l.montant) };
  if (q.jeton) {
    const [mien] = await supabase(`/rest/v1/rtv_encheres?jeton=eq.${encodeURIComponent(q.jeton)}&select=courriel,montant,confirmee_at,mois_debut,ville_cle`) || [];
    if (mien && mien.ville_cle === q.enchere && mien.mois_debut === mois) {
      const i = liste.findIndex((l) => l.courriel.toLowerCase() === mien.courriel.toLowerCase());
      corps.mien = { montant: mien.montant, confirmee: !!mien.confirmee_at, position: i + 1, meilleur: i > -1 ? liste[i].montant : null };
    }
  }
  return { statut: 200, corps };
}

// POST : une nouvelle offre, en attente de confirmation par courriel.
export async function offrir(b) {
  const v = VILLES[b.ville_cle], mois = String(b.mois || ''), L = b.langue === 'en' ? 'en' : 'fr';
  const o = {
    ville: v ? v.nom : '', ville_cle: b.ville_cle, mois_debut: mois, montant: Math.round(Number(b.montant)),
    nom: propre(b.nom, 120), entreprise: propre(b.entreprise, 120), courriel: propre(b.courriel, 200).toLowerCase(),
    langue: L, page: propre(b.page, 300),
  };
  if (!v || !ISO.test(mois) || !o.nom || !o.entreprise || !COURRIEL.test(o.courriel)) return { statut: 400, corps: { ok: false, erreur: 'champs' } };
  if (aujourdhui() > fermeture(mois) || mois > decaler(aujourdhui(), 400)) return { statut: 400, corps: { ok: false, erreur: 'ferme' } };
  if (!Number.isFinite(o.montant) || o.montant < v.prix || o.montant > 100000) return { statut: 400, corps: { ok: false, erreur: 'montant', minimum: v.prix } };
  o.mois_fin = finDuMois(mois);
  o.jeton = crypto.randomBytes(24).toString('base64url');
  await supabase('/rest/v1/rtv_encheres', { methode: 'POST', corps: o, entetes: { Prefer: 'return=minimal' } });
  const lien = `${site()}/api/represente?confirmer=${o.jeton}`;
  const envoye = await courriel(o.courriel, L === 'en'
    ? `Confirm your ${dollars(o.montant, L)} bid for ${v.nom}`
    : `Confirmez votre offre de ${dollars(o.montant, L)} pour ${v.nom}`, gabarit(L === 'en'
    ? `<p>You bid <b>${dollars(o.montant, L)}</b> for the banner month of ${v.nom}, from ${date(mois, L)} to ${date(o.mois_fin, L)}.</p>
       <p>Your bid counts once you confirm it. Nothing is charged now: only the winning bid receives an invoice when the auction closes, on ${date(fermeture(mois), L)}.</p>
       ${bouton(lien, 'Confirm my bid')}<p style="font-size:13px;color:#555">You did not bid? Ignore this email: nothing will be recorded.</p>`
    : `<p>Vous offrez <b>${dollars(o.montant, L)}</b> pour le mois de bannière de ${v.nom}, du ${date(mois, L)} au ${date(o.mois_fin, L)}.</p>
       <p>Votre offre compte une fois confirmée. Rien n’est facturé maintenant : seule l’offre gagnante reçoit une facture à la fermeture de l’enchère, le ${date(fermeture(mois), L)}.</p>
       ${bouton(lien, 'Confirmer mon offre')}<p style="font-size:13px;color:#555">Vous n’avez rien offert ? Ignorez ce courriel : rien ne sera enregistré.</p>`));
  return { statut: envoye ? 200 : 502, corps: { ok: envoye } };
}

// GET ?confirmer= : l'offre compte, l'ancien premier est prévenu, retour à la page de la ville.
export async function confirmer(jeton) {
  const [l] = await supabase(`/rest/v1/rtv_encheres?jeton=eq.${encodeURIComponent(jeton)}&select=*`) || [];
  if (!l) return { redirection: site() + '/represente-ta-ville' };
  if (l.confirmee_at || aujourdhui() > fermeture(l.mois_debut)) return { redirection: lienPage(l, jeton) };
  const avant = await classement(l.ville_cle, l.mois_debut);
  await supabase(`/rest/v1/rtv_encheres?jeton=eq.${encodeURIComponent(jeton)}`, {
    methode: 'PATCH', corps: { confirmee_at: new Date().toISOString() }, entetes: { Prefer: 'return=minimal' },
  });
  const apres = await classement(l.ville_cle, l.mois_debut);
  const v = VILLES[l.ville_cle], i = apres.findIndex((x) => x.courriel === l.courriel);
  const ancien = avant[0];
  if (ancien && apres[0].courriel !== ancien.courriel) {
    const L = ancien.langue, p = apres.findIndex((x) => x.courriel === ancien.courriel) + 1;
    await courriel(ancien.courriel, L === 'en'
      ? `You have been outbid for ${v.nom}: ${dollars(apres[0].montant, L)}`
      : `On vous a dépassé pour ${v.nom} : ${dollars(apres[0].montant, L)}`, gabarit(L === 'en'
      ? `<p>A bid of <b>${dollars(apres[0].montant, L)}</b> now leads the banner month of ${v.nom} (${date(l.mois_debut, L)} to ${date(l.mois_fin, L)}). Your bid of ${dollars(ancien.montant, L)} is now <b>${rang(p, L)}</b> out of ${apres.length}.</p>
         <p>The auction closes on ${date(fermeture(l.mois_debut), L)}.</p>${bouton(lienPage(ancien), 'Raise my bid')}`
      : `<p>Une offre de <b>${dollars(apres[0].montant, L)}</b> mène maintenant pour le mois de bannière de ${v.nom} (du ${date(l.mois_debut, L)} au ${date(l.mois_fin, L)}). Votre offre de ${dollars(ancien.montant, L)} est maintenant <b>${rang(p, L)}</b> sur ${apres.length}.</p>
         <p>L’enchère ferme le ${date(fermeture(l.mois_debut), L)}.</p>${bouton(lienPage(ancien), 'Remonter mon offre')}`));
  }
  await courriel(martin(), `[Enchère] ${v.nom}, ${date(l.mois_debut, 'fr')} : ${dollars(l.montant, 'fr')} (${rang(i + 1, 'fr')} sur ${apres.length})`, gabarit(
    `<p><b>${echapper(l.entreprise)}</b> (${echapper(l.nom)}, ${echapper(l.courriel)}) offre <b>${dollars(l.montant, 'fr')}</b> pour la bannière de ${v.nom}, du ${date(l.mois_debut, 'fr')} au ${date(l.mois_fin, 'fr')}.</p>
     <p>Classement : ${apres.map((x) => dollars(x.montant, 'fr')).join(', ')}. Fermeture le ${date(fermeture(l.mois_debut), 'fr')}.</p>`), l.courriel);
  return { redirection: lienPage(l, jeton) };
}
