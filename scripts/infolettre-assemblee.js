// L'infolettre mensuelle de DossierQuébec sur l'Assemblée nationale (21 oct. 2026), sur le modèle du
// compte rendu municipal (quebec/scripts/infolettre.js).
//
//   node scripts/infolettre-assemblee.js                      le mois précédent
//   node scripts/infolettre-assemblee.js --mois=2026-11
//   node scripts/infolettre-assemblee.js --mois=2026-11 --publier       publié, il part aux inscrits
//   node scripts/infolettre-assemblee.js --publier --si-nouveau         publication automatique : ne fait
//                                                                       rien si ce numéro existe déjà
//   --sortie=dossier : où écrire le brouillon (par défaut, un dossier temporaire : rien dans le dépôt)
//
// Tout vient des données déjà dans le dépôt, publiées par l'Assemblée nationale : data/bills.json
// (projets de loi présentés, lois sanctionnées), data/votes.json (votes nominaux et étapes franchies
// par un vote), api/consultations-data.json (mémoires). Aucun appel réseau sauf la publication,
// aucun appel IA, aucun verdict. Un mois sans rien : pas de numéro.
//
// Le numéro porte la section « Pour les abonné·e·s » (api/_section-abonnes.js) en deux versions ;
// l'envoi (api/_infolettre.js, cron quotidien de 11 h UTC) garde celle du destinataire.
// Publication automatique : .github/workflows/refresh.yml, chaque matin, --publier --si-nouveau.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculerSection, enrober } from '../api/_section-abonnes.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://dossierquebec.ca';
const VILLE = 'assemblee';
const POLICE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ENCRE = '#131313';
const DOUX = '#5B6470';
const BLEU = '#0E4FC1';
const BLEU_PALE = '#D6E4FF';
const OR = '#F5B301';
// Le premier jour de séance d'une législature : un numéro qui commence au milieu du mois le dit.
const DEBUTS = { 44: '2026-11-17' };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nomMois = (m) => { const [a, n] = m.split('-').map(Number); return `${MOIS[n - 1]} ${a}`; };
const dateLongue = (iso) => { const [a, m, j] = String(iso).split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; };
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nombre = (n) => n.toLocaleString('fr-CA');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
export const moisPrecedent = (maintenant = new Date()) => { const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1)); return d.toISOString().slice(0, 7); };

// La page d'un projet de loi sur le site (/projets-de-loi/NUM-LEG-SESSION), sinon celle de l'Assemblée.
const pageExiste = (cle) => existsSync(join(RACINE, 'projets-de-loi', `${cle}.html`));
const lienProjet = (b, existe = pageExiste) => {
  const cle = `${b.num}-${b.legislature}-${b.introSession}`;
  return existe(cle) ? `${SITE}/projets-de-loi/${cle}` : b.url;
};

// Les chiffres du mois, sans mise en page.
export function chiffresDuMois(mois, { bills, votes, consultations }) {
  const dans = (d) => String(d ?? '').startsWith(mois);
  const liste = bills?.bills ?? [];
  const presentes = liste.filter((b) => dans(b.presentedOn)).sort((a, b) => a.presentedOn.localeCompare(b.presentedOn) || a.num - b.num);
  const sanctionnes = liste
    .map((b) => ({ b, date: /Sanctionné le (\d{4}-\d{2}-\d{2})/.exec(b.note ?? '')?.[1] ?? null }))
    .filter((x) => dans(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const duMois = (votes?.votes ?? []).filter((v) => dans(v.date)).sort((a, b) => a.date.localeCompare(b.date) || a.num - b.num);
  // Le projet de loi d'un vote : même numéro et législature, la session de présentation la plus
  // récente qui ne dépasse pas celle du vote.
  const projetDe = (v) => liste.filter((b) => b.num === v.billNum && b.legislature === v.legislature && b.introSession <= v.session).sort((a, b) => b.introSession - a.introSession)[0] ?? null;
  const vus = new Set();
  const etapes = [];
  for (const v of duMois) {
    if (v.billNum == null || v.stage === 'Présentation') continue;
    const cle = `${v.legislature}-${v.billNum}-${v.stage}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    etapes.push({ v, b: projetDe(v) });
  }
  const section = calculerSection(mois, { consultations, votes });
  const debut = Object.values(DEBUTS).find((d) => dans(d)) ?? null;
  return {
    mois, debut, presentes, sanctionnes, etapes, votes: duMois, section,
    vide: !presentes.length && !sanctionnes.length && !duMois.length && !section.memoires.total,
  };
}

// Le courriel. null si le mois n'a rien.
export function fabriquerNumero(mois, donnees, { existe = pageExiste } = {}) {
  const c = chiffresDuMois(mois, donnees);
  if (c.vide) return null;
  const titre = `L'Assemblée nationale en ${nomMois(mois)}`;
  const H = [];
  const p = (t, taille = 16) => `<p style="${POLICE};margin:0 0 12px;font-size:${taille}px;line-height:1.6;color:${ENCRE}">${t}</p>`;
  const titreSection = (t, n) => `<tr><td style="padding:26px 0 8px;${POLICE};font-size:20px;font-weight:800;color:${BLEU}">${e(t)}${n != null ? ` <span style="display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:${BLEU};color:#fff;font-size:13px;vertical-align:middle">${nombre(n)}</span>` : ''}</td></tr>`;
  const carte = (contenu) => `<tr><td style="padding:0 0 10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:#ffffff;border:1px solid ${BLEU_PALE};border-left:5px solid ${BLEU};border-radius:8px"><tr><td style="${POLICE};padding:12px 14px;font-size:15px;line-height:1.5;color:${ENCRE}">${contenu}</td></tr></table></td></tr>`;
  const lien = (texte, url) => `<a href="${e(url)}" style="color:${BLEU};font-weight:600;text-decoration:none">${texte}&nbsp;→</a>`;
  const petit = (t) => `<br><span style="font-size:13px;color:${DOUX}">${t}</span>`;

  // L'introduction : la période couverte, en clair.
  const periode = c.debut
    ? `La nouvelle législature a commencé à siéger le ${dateLongue(c.debut)} : ce numéro couvre du ${dateLongue(c.debut)} à la fin du mois.`
    : `Ce numéro couvre tout le mois ${/^[aeiou]/.test(nomMois(mois)) ? "d'" : 'de '}${nomMois(mois)}.`;
  H.push(`<tr><td style="padding:22px 4px 4px">${p(`Ce qui a bougé à l'Assemblée nationale : les projets de loi présentés, les étapes franchies, les lois sanctionnées et les votes nominaux. ${periode}`)}${p(`<span style="color:${DOUX}">Source : Assemblée nationale du Québec. Chaque lien mène à la fiche du projet de loi ou au registre officiel.</span>`, 14)}</td></tr>`);

  // Le mois en chiffres : quatre tuiles, deux par rangée.
  const tuile = (n, libelle) => `<td width="50%" valign="top" style="padding:6px"><div style="background:#ffffff;border-radius:10px;padding:14px 14px 12px;border-top:4px solid ${BLEU}"><div style="${POLICE};font-size:26px;font-weight:800;color:${BLEU};line-height:1.1">${nombre(n)}</div><div style="${POLICE};font-size:13px;color:${ENCRE};margin-top:4px;line-height:1.35">${e(libelle)}</div></div></td>`;
  H.push(`<tr><td style="padding:8px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>${tuile(c.presentes.length, c.presentes.length > 1 ? 'projets de loi présentés' : 'projet de loi présenté')}${tuile(c.sanctionnes.length, c.sanctionnes.length > 1 ? 'lois sanctionnées' : 'loi sanctionnée')}</tr>
    <tr>${tuile(c.votes.length, c.votes.length > 1 ? 'votes nominaux' : 'vote nominal')}${tuile(c.section.memoires.total, c.section.memoires.total > 1 ? 'mémoires déposés en commission' : 'mémoire déposé en commission')}</tr>
  </table></td></tr>`);

  if (c.presentes.length) {
    H.push(titreSection('Les projets de loi présentés', c.presentes.length));
    for (const b of c.presentes) H.push(carte(`<strong>Projet de loi n° ${e(b.num)}</strong> — ${e(b.title)}${petit(`${b.sponsor ? `${e(b.sponsor)} · ` : ''}présenté le ${e(dateLongue(b.presentedOn))}`)}<br>${lien('La fiche', lienProjet(b, existe))}`));
  }
  if (c.etapes.length) {
    H.push(titreSection('Les étapes franchies par un vote', c.etapes.length));
    for (const { v, b } of c.etapes) {
      const t = v.totals ?? {};
      H.push(carte(`<strong>${e(v.stage)}</strong> — projet de loi n° ${e(v.billNum)}${b ? `, ${e(b.title)}` : ''}${petit(`${e(dateLongue(v.date))} · ${nombre(t.pour ?? 0)} pour, ${nombre(t.contre ?? 0)} contre${t.abstentions ? `, ${nombre(t.abstentions)} abstention${t.abstentions > 1 ? 's' : ''}` : ''}`)}<br>${b ? `${lien('La fiche', lienProjet(b, existe))} · ` : ''}${lien('Le vote au registre', v.url)}`));
    }
  }
  if (c.sanctionnes.length) {
    H.push(titreSection('Les lois sanctionnées', c.sanctionnes.length));
    for (const { b, date } of c.sanctionnes) H.push(carte(`<strong>Projet de loi n° ${e(b.num)}</strong> — ${e(b.title)}${petit(`sanctionné le ${e(dateLongue(date))}`)}<br>${lien('La fiche', lienProjet(b, existe))}`));
  }
  if (c.votes.length) {
    H.push(titreSection('Les votes nominaux', c.votes.length));
    H.push(`<tr><td style="padding:0 4px">${p(`${pluriel(c.votes.length, 'vote nominal a eu lieu', 'votes nominaux ont eu lieu')} ce mois-ci. Qui a voté quoi, député par député : ${lien('les votes', `${SITE}/votes`)}`, 15)}</td></tr>`);
  }

  // La section abonnés : les deux versions entre balises (api/_section-abonnes.js).
  const section = enrober(c.section);
  if (section) H.push(`<tr><td style="padding:10px 0 0">${section}</td></tr>`);

  H.push(`<tr><td style="${POLICE};padding:22px 4px 0;font-size:12px;line-height:1.55;color:${DOUX}">
    Source : Assemblée nationale du Québec ; ses documents font foi. <a href="${SITE}/" style="color:${DOUX}">DossierQuébec</a> · site indépendant, aucun caractère officiel.<!--DESINSCRIPTION-->
  </td></tr>`);

  const bandeau = `<tr><td style="background:${BLEU};border-radius:12px 12px 0 0;padding:26px 24px 22px">
      <div style="${POLICE};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BLEU_PALE}">DossierQuébec · L'infolettre de l'Assemblée nationale</div>
      <h1 style="${POLICE};margin:8px 0 0;font-size:27px;line-height:1.2;color:#ffffff">${e(titre)}</h1>
    </td></tr>
    <tr><td style="height:6px;line-height:6px;font-size:0;background:${OR}">&nbsp;</td></tr>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titre)}</title></head>` +
    `<body style="margin:0;padding:0;background:#EEF1F4"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#EEF1F4"><tr><td align="center" style="padding:20px 10px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:660px;background:#F8FAFB;border-radius:12px"><tr><td style="padding:0 0 26px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bandeau}</table>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:0 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><!--BANDEAU-->${H.join('')}</table></td></tr></table>` +
    `</td></tr></table></td></tr></table></body></html>`;
  return { titre, html, chiffres: c };
}

const lireDonnees = () => {
  const lire = (chemin) => JSON.parse(readFileSync(join(RACINE, chemin), 'utf8'));
  return { bills: lire('data/bills.json'), votes: lire('data/votes.json'), consultations: lire('api/consultations-data.json') };
};

// La publication dans infolettre_numeros (même clé que les villes). --si-nouveau : un numéro déjà là
// (même retiré) n'est jamais remplacé. Renvoie ce qui a été fait.
export async function publier(mois, numero, { siNouveau = false } = {}) {
  const h = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const url = `${process.env.SUPABASE_URL}/rest/v1/infolettre_numeros`;
  const cle = { ville: VILLE, type: 'mensuel', arrondissement: '', mois, langue: 'fr' };
  const r0 = await fetch(`${url}?ville=eq.${VILLE}&type=eq.mensuel&arrondissement=eq.&mois=eq.${mois}&langue=eq.fr&select=envoye_le,envoyes`, { headers: h });
  if (!r0.ok) throw new Error(`Supabase ${r0.status}`);
  const existant = await r0.json();
  if (siNouveau && existant.length) return 'deja';
  if (existant[0]?.envoyes > 0) throw new Error(`Le numéro ${mois} est déjà parti vers ${existant[0].envoyes} personne(s) : on ne le remplace pas.`);
  const r = await fetch(`${url}?on_conflict=ville,type,arrondissement,mois,langue`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ ...cle, titre: numero.titre, html: numero.html, html_abonnes: numero.html, publie_le: new Date().toISOString(), updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Publication → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return 'publie';
}

async function main() {
  const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? null;
  const drapeau = (nom) => process.argv.includes(`--${nom}`);
  const mois = arg('mois') ?? moisPrecedent();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new Error('--mois=AAAA-MM');
  const numero = fabriquerNumero(mois, lireDonnees());
  if (!numero) { console.log(`${mois} : aucun projet de loi, vote ni mémoire. Pas de numéro.`); return; }
  const c = numero.chiffres;
  console.log(`${mois} : ${c.presentes.length} présentés, ${c.etapes.length} étapes, ${c.sanctionnes.length} sanctionnés, ${c.votes.length} votes, ${c.section.memoires.total} mémoires.`);
  const sortie = arg('sortie') ?? join(tmpdir(), 'infolettre-assemblee');
  mkdirSync(sortie, { recursive: true });
  writeFileSync(join(sortie, `${mois}.html`), numero.html);
  console.log(`→ ${join(sortie, `${mois}.html`)}`);
  if (!drapeau('publier')) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (drapeau('si-nouveau')) { console.log('Sans SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY : rien de publié.'); return; }
    throw new Error('--publier : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent.');
  }
  const fait = await publier(mois, numero, { siNouveau: drapeau('si-nouveau') });
  console.log(fait === 'deja' ? `Déjà publié : ${mois}. Rien à faire.` : `Publié : ${mois}. Il part aux inscrits au prochain passage du cron (11 h UTC), et à chaque nouvel inscrit.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
