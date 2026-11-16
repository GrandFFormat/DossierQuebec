// (Fichier distinct de api/_consultations.js, qui sert les consultations de l'Assemblée.)
// « Vous pouvez encore donner votre avis » dans les courriels de ville (16 nov. 2026). Ajouté à
// l'envoi, juste avant le repère <!--PROJETS--> : les consultations sont lues ce jour-là dans
// <ville>/data/consultations.json (écrit chaque matin par <ville>/scrapers/consultations.js), donc
// un numéro qui part en retard (bienvenue d'un nouvel inscrit) ne montre jamais une date passée.
// Rien à venir : aucun bloc. Le « _ » : Vercel n'en fait pas une route.

import { site } from './_alertes.js';

const VILLES = ['quebec', 'montreal', 'levis'];
const MAX = 5;
const POLICE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (iso, jour = true) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${jour ? JOURS[new Date(Date.UTC(a, m - 1, j)).getUTCDay()] + ' ' : ''}${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
};
const quand = (i) => (i.fin ? `du ${date(i.debut, false)} au ${date(i.fin, false)}` : `${date(i.debut)}${i.heure ? `, ${i.heure}` : ''}`);

const cache = new Map();
export function blocConsultations(ville) {
  if (!VILLES.includes(ville)) return Promise.resolve('');
  if (!cache.has(ville)) cache.set(ville, construire(ville).catch(() => ''));
  return cache.get(ville);
}

async function construire(ville) {
  const r = await fetch(`${site()}/${ville}/data/consultations.json`);
  if (!r.ok) return '';
  const donnees = await r.json();
  const auj = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const items = (donnees.items ?? []).filter((i) => !i.annule && (i.fin || i.debut) >= auj);
  if (!items.length) return '';
  // Un projet par ligne (l'assemblée et sa consultation écrite ensemble).
  const groupes = new Map();
  for (const i of items) (groupes.get(i.url) ?? groupes.set(i.url, []).get(i.url)).push(i);
  const liste = [...groupes.values()];
  const lignes = liste.slice(0, MAX).map((g) => {
    const secteur = g.find((i) => i.secteur)?.secteur;
    return `<li style="margin:0 0 10px"><a href="${echapper(g[0].url)}" style="color:#16191D;font-weight:700">${echapper(g[0].titre)}</a>${secteur ? ` <span style="font-size:12px;color:#5B6470">· ${echapper(secteur)}</span>` : ''}
      <div style="font-size:13px;color:#374151">${g.map((i) => `${echapper(i.type)} : ${echapper(quand(i))}${i.lieu ? ` · ${echapper(i.lieu)}` : ''}`).join('<br>')}</div></li>`;
  }).join('');
  const reste = liste.length - Math.min(liste.length, MAX);
  const page = `${site()}/${ville}/conseil-municipal-de-${ville}#consultations-ville`;
  return `<tr><td style="padding:24px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFF8DC;border:1px solid #F5D77A;border-left:5px solid #F5B301;border-radius:10px;border-collapse:separate"><tr><td style="${POLICE};padding:16px 18px;font-size:15px;line-height:1.5;color:#16191D">
      <div style="font-size:17px;font-weight:800;margin-bottom:8px">🗣️ Vous pouvez encore donner votre avis</div>
      <ul style="margin:0;padding-left:18px">${lignes}</ul>
      <div style="font-size:13px;margin-top:4px"><a href="${page}" style="color:#16191D;font-weight:700">${reste > 0 ? `Les ${liste.length} consultations à venir` : 'Toutes les consultations'} →</a> <span style="color:#5B6470">· source : ${echapper(donnees.source?.nom ?? 'la Ville')}</span></div>
    </td></tr></table>
  </td></tr>`;
}
