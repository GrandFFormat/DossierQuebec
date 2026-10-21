// LA VEILLE PAR THÈME (21 oct. 2026), sixième outil de l'abonnement. Le « _ » : Vercel n'en fait pas
// une route. Appelée par api/infolettre-envoi.js, la tâche planifiée de chaque matin (Vercel Hobby :
// 2 tâches planifiées et 12 fonctions au plus), APRÈS les alertes et AVANT l'infolettre.
//
// Une fois par semaine, le lundi, un courriel à chaque abonné·e actif qui a coché des thèmes
// (alertes_preferences.veille_themes, scripts/supabase-veille.sql) : ce qui a bougé à l'Assemblée
// nationale dans ces thèmes depuis le dernier envoi —
//   - les projets de loi présentés, ou qui ont franchi une étape ;
//   - les votes nominaux sur ces projets de loi (/data/votes.json, champ billNum) ;
//   - les consultations en commission sur ces projets (annoncées, ou séances tenues) et les mémoires
//     déposés (api/consultations-data.json).
// Seulement l'Assemblée nationale : rien de municipal derrière le paiement (conditions des Villes).
// Aucune IA : un projet de loi entre dans un thème par le ministère de son parrain, sinon par les
// mots de son titre (THEMES, plus bas). Un projet sans thème trouvé n'apparaît nulle part.
//
// Le rythme : le lundi. Si le courriel d'un lundi n'a pas pu partir (Resend en panne, quota du jour
// atteint), il part un des matins suivants de la même semaine. Rien de neuf : aucun courriel. Un seul
// courriel par personne et par semaine (semaine ISO, heure de Montréal). Ce qui a déjà été dit vit
// dans alertes_etat (ville « assemblee », projet « veille ») ; si l'envoi échoue, rien n'est mémorisé.

import { supabase, signer, site } from './_alertes.js';
import { estActive } from './_stripe.js';
import { chargerConsultations } from './_consultations.js';
import { normaliserTexte, rangLoi, ASSEMBLEE } from './_alertes-assemblee.js';

// ---------- les thèmes ----------
// La table thème → ministères → mots. LA MÊME LISTE DE CODES vit dans commun/dq.js (VEILLE_THEMES,
// l'écran de Mon dossier) et dans scripts/supabase-veille.sql (la contrainte de la colonne) : un code
// ajouté ou retiré ici doit l'être aux trois endroits.
//
//   ministeres  cherchés dans le RÔLE du parrain (data/bills.json, « Nom — Ministre des Finances »),
//               texte sans accents ni majuscules. Un rôle peut tomber dans plusieurs thèmes.
//   mots        cherchés dans le TITRE, seulement si le rôle du parrain ne donne aucun thème (projets
//               de député·e·s, projets d'intérêt privé, ministère absent de la table). Débuts de mots :
//               « hopita » trouve « hôpital » et « hôpitaux ».
// On préfère manquer un projet que le classer au mauvais endroit : des mots précis, pas de mots
// passe-partout (« services », « protection », « sécurité » seul…).
export const THEMES = [
  { code: 'sante', fr: 'Santé', en: 'Health',
    ministeres: ['ministre de la sante'],
    mots: ['sante', 'soins', 'hopita', 'medecin', 'medical', 'medicale', 'infirmi', 'pharmac', 'medicament', 'maladie', 'fin de vie', 'aide medicale a mourir', 'cancer', 'don d\'organes'] },
  { code: 'education', fr: 'Éducation', en: 'Education',
    ministeres: ['education', 'enseignement superieur'],
    mots: ['ecole', 'scolaire', 'eleve', 'enseignant', 'enseignement', 'education', 'cegep', 'universit', 'etudiant', 'aide financiere aux etudes'] },
  { code: 'logement', fr: 'Logement et habitation', en: 'Housing',
    ministeres: ['habitation'],
    mots: ['logement', 'locataire', 'habitation', 'loyer', 'bail', 'copropriete', 'residence privee pour aines'] },
  { code: 'environnement', fr: 'Environnement et énergie', en: 'Environment and energy',
    ministeres: ['environnement', 'changements climatiques', 'faune', 'parcs', 'energie', 'ressources naturelles'],
    mots: ['environnement', 'climat', 'climatique', 'energie', 'energetique', 'hydro-quebec', 'eau potable', 'ressources en eau', 'pollution', 'faune', 'aires protegees', 'hydrocarbure', 'mines', 'minier', 'miniere', 'carbone', 'gaz a effet de serre', 'qualite de l\'air', 'polluant', 'milieux naturels'] },
  { code: 'economie', fr: 'Économie et finances publiques', en: 'Economy and public finances',
    ministeres: ['finances', 'economie', 'petites et moyennes entreprises', 'conseil du tresor', 'revenu', 'tourisme'],
    mots: ['budget', 'budgetaire', 'fiscal', 'fiscale', 'impot', 'taxe', 'finances', 'economie', 'economique', 'entreprise', 'consommateur', 'mutuelle', 'touristique', 'valeurs mobilieres', 'banque', 'dette'] },
  { code: 'travail', fr: 'Travail', en: 'Labour',
    ministeres: ['travail', 'emploi'],
    mots: ['travail', 'travailleu', 'emploi', 'salari', 'syndica', 'greve', 'conventions collectives', 'relations de travail', 'normes du travail', 'retraite', 'main-d\''] },
  { code: 'justice', fr: 'Justice et sécurité publique', en: 'Justice and public safety',
    ministeres: ['justice', 'securite publique', 'securite interieure', 'procureur'],
    mots: ['justice', 'tribuna', 'judiciaire', 'cour du quebec', 'code civil', 'code de procedure', 'criminel', 'policier', 'police', 'carcera', 'detention', 'victimes', 'violence', 'notari', 'avocat', 'incendie'] },
  { code: 'immigration', fr: 'Immigration et langue française', en: 'Immigration and French language',
    ministeres: ['immigration', 'francisation', 'langue francaise'],
    mots: ['immigration', 'immigrant', 'integration', 'francisation', 'langue francaise', 'charte de la langue'] },
  { code: 'transports', fr: 'Transports', en: 'Transportation',
    ministeres: ['transports', 'mobilite durable'],
    mots: ['transport', 'routier', 'routiere', 'route', 'vehicule', 'autoroute', 'circulation', 'taxi', 'automobile', 'covoiturage', 'mobilite', 'ferroviaire', 'aerien', 'tramway'] },
  { code: 'agriculture', fr: 'Agriculture et territoire', en: 'Agriculture and land',
    ministeres: ['agriculture', 'pecheries', 'alimentation', 'forets', 'territoire'],
    mots: ['agricole', 'agriculture', 'aliment', 'alimentaire', 'pecheries', 'peche', 'foret', 'forestier', 'forestiere', 'terres agricoles', 'cadastre', 'chasse'] },
  { code: 'culture', fr: 'Culture et communications', en: 'Culture and communications',
    ministeres: ['culture', 'communications'],
    mots: ['culture', 'culturel', 'culturelle', 'patrimoine', 'artiste', 'musee', 'bibliotheque', 'cinema', 'livre', 'medias', 'communications', 'telecommunication'] },
  { code: 'municipal', fr: 'Affaires municipales et régions', en: 'Municipal affairs and regions',
    ministeres: ['affaires municipales', 'regions', 'metropole'],
    mots: ['municipal', 'municipale', 'municipalite', 'ville de', 'village', 'paroisse', 'mrc', 'communaute metropolitaine', 'agglomeration', 'regions', 'regional'] },
  { code: 'famille', fr: 'Famille et services sociaux', en: 'Family and social services',
    ministeres: ['famille', 'services sociaux', 'solidarite sociale', 'aines', 'proches aidants', 'condition feminine'],
    mots: ['famille', 'familial', 'enfant', 'enfance', 'jeunesse', 'service de garde', 'services de garde', 'protection de la jeunesse', 'aines', 'ainee', 'proches aidants', 'solidarite sociale', 'aide sociale', 'pauvrete', 'handicap', 'itinerance', 'conjoint'] },
  { code: 'gouvernance', fr: 'Gouvernance et institutions', en: 'Governance and institutions',
    ministeres: ['institutions democratiques', 'laicite', 'administration gouvernementale', 'efficacite de l\'etat', 'cybersecurite', 'numerique', 'relations canadiennes', 'relations internationales', 'francophonie', 'affaires autochtones', 'leader parlementaire', 'acces a l\'information'],
    mots: ['electora', 'election', 'circonscription', 'assemblee nationale', 'depute', 'serment', 'laicite', 'acces aux documents', 'acces a l\'information', 'renseignements personnels', 'ethique', 'lobbyisme', 'fonction publique', 'organismes publics', 'constitution', 'autochtone', 'numerique', 'cybersecurite', 'scrutin', 'verificateur general', 'premieres nations', 'contrats des organismes publics', 'marches publics'] },
];
export const CODES = THEMES.map((t) => t.code);
const PAR_CODE = new Map(THEMES.map((t) => [t.code, t]));

// Un bout de texte normalisé, en début de mot (la fin est libre : pluriels, féminins).
const trouveDebut = (texte, bout) => {
  const b = normaliserTexte(bout).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${b}`).test(texte);
};
// Le rôle du parrain, après le « — » de data/bills.json (« Roberge, Jean-François — Ministre … »).
export const roleParrain = (sponsorBrut) => String(sponsorBrut ?? '').split(' — ')[1] ?? '';

// Les thèmes d'un projet de loi : { codes: [...], par: 'ministere' | 'titre' | null }.
export function themesDeLoi(titre, role) {
  const r = normaliserTexte(role);
  // Seul un rôle de MINISTRE (ou de leader) dit un ministère ; « Députée de Verdun » ne dit rien.
  if (/\bministre\b|\bleader\b|\bpresidente? du conseil\b/.test(r)) {
    const codes = THEMES.filter((t) => t.ministeres.some((m) => trouveDebut(r, m))).map((t) => t.code);
    if (codes.length) return { codes, par: 'ministere' };
  }
  const t = normaliserTexte(titre);
  const codes = THEMES.filter((th) => th.mots.some((m) => trouveDebut(t, m))).map((th) => th.code);
  return { codes, par: codes.length ? 'titre' : null };
}

// ---------- les dates ----------
const JOUR = 864e5;
const plusJours = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * JOUR).toISOString().slice(0, 10);
// La date du jour à Montréal (le cron tourne à 11 h UTC, 6 h ou 7 h à Montréal).
export const aujourdhuiMontreal = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
// La semaine ISO d'une date AAAA-MM-JJ : « 2026-W47 ».
export function semaineIso(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour + 3); // le jeudi de la semaine
  const annee = d.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(annee, 0, 4));
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - ((premierJeudi.getUTCDay() + 6) % 7) + 3);
  return `${annee}-W${String(1 + Math.round((d - premierJeudi) / (7 * JOUR))).padStart(2, '0')}`;
}
export const estLundi = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 1;

// Les données de l'Assemblée arrivent parfois avec quelques jours de retard (une étape du mardi lue
// le jeudi) : on regarde RETARD_JOURS en arrière du dernier envoi, et on écarte ce qui a déjà été dit.
export const RETARD_JOURS = 14;
// Un premier envoi remonte à la semaine qui vient de passer, pas plus.
export const PREMIER_JOURS = 7;

// ---------- les nouvelles ----------
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lienLoi = (b) => b.legislature && b.introSession
  ? `${site()}/projets-de-loi/${b.num}-${b.legislature}-${b.introSession}`
  : `${site()}/projets-de-loi?pl=${encodeURIComponent(b.num)}&id=${encodeURIComponent(b.id)}`;

// Le projet de loi d'un vote nominal : même législature, même numéro ; d'abord celui présenté à la
// session du vote, sinon le plus récent présenté avant. Rien de sûr : null (le vote est tu).
export function loiDuVote(v, lois) {
  if (!v.billNum) return null;
  const memes = lois.filter((b) => Number(b.legislature) === Number(v.legislature) && Number(b.num) === Number(v.billNum));
  const exact = memes.find((b) => Number(b.introSession) === Number(v.session));
  if (exact) return exact;
  const avant = memes.filter((b) => Number(b.introSession) <= Number(v.session)).sort((a, b) => b.introSession - a.introSession);
  return avant.length === 1 ? avant[0] : null;
}

// Toutes les nouvelles possibles, par projet de loi thématisé. Pur (scripts/test-veille-theme.js).
//   lois           /data/site/bills.json
//   roles          Map id → rôle du parrain (data/bills.json)
//   votes          le tableau de /data/votes.json, ou null
//   consultations  api/consultations-data.json, ou null
//   depuis, jusqua AAAA-MM-JJ, bornes comprises
// Rend [{ cle, date, themes, genre, html }] : cle sert à ne jamais redire la même nouvelle.
export function nouvelles({ lois, roles, votes = null, consultations = null, depuis, jusqua }) {
  const dans = (d) => d && d >= depuis && d <= jusqua;
  const themesDe = new Map();
  for (const b of lois) {
    const { codes } = themesDeLoi(b.title, roles?.get(String(b.id)) ?? '');
    if (codes.length) themesDe.set(String(b.id), codes);
  }
  const liste = [];
  const tete = (b) => `<a href="${echapper(lienLoi(b))}" style="font-family:Consolas,monospace;font-size:13px;font-weight:bold;color:#076338;text-decoration:none">PL ${echapper(b.num)}</a>`;
  for (const b of lois) {
    const themes = themesDe.get(String(b.id));
    if (!themes || b.status === 'laisse_de_cote') continue;
    // Présenté.
    if (dans(b.presentedOn)) {
      liste.push({ cle: `pres_${b.id}`, date: b.presentedOn, themes, genre: 'loi',
        html: `${tete(b)} <span style="font-size:13px;color:#5B6570">· présenté le ${echapper(dateFr(b.presentedOn))}</span><br><span style="font-size:15px">${echapper(b.title)}</span>` });
    }
    // Une étape plus loin que la présentation, datée dans la fenêtre.
    const rang = rangLoi(b);
    if (rang > 10 && dans(b.lastActivity)) {
      const etape = String(b.note ?? '').replace(/\d{4}-\d{2}-\d{2}/g, (d) => dateFr(d)) || 'nouvelle étape';
      liste.push({ cle: `eta_${b.id}_${rang}`, date: b.lastActivity, themes, genre: 'loi',
        html: `${tete(b)} <span style="font-size:13px;color:#5B6570">· ${echapper(etape)}</span><br><span style="font-size:15px">${echapper(b.title)}</span>` });
    }
  }
  for (const v of votes ?? []) {
    if (!dans(v.date)) continue;
    const b = loiDuVote(v, lois);
    const themes = b && themesDe.get(String(b.id));
    if (!themes) continue;
    const t = v.totals ?? {};
    liste.push({ cle: `vot_${v.legislature}_${v.session}_${v.num}`, date: v.date, themes, genre: 'vote',
      html: `<a href="${echapper(v.url)}" style="font-size:13px;font-weight:bold;color:#076338;text-decoration:none">Vote ${echapper(`${v.legislature}-${v.session}-${v.num}`)}</a>
        <span style="font-size:13px;color:#5B6570">· ${echapper([dateFr(v.date), v.stage].filter(Boolean).join(' · '))} · PL ${echapper(b.num)} · pour ${Number(t.pour) || 0}, contre ${Number(t.contre) || 0}, abstentions ${Number(t.abstentions) || 0}</span><br>
        <span style="font-size:15px">${echapper(b.title)}</span>` });
  }
  for (const [id, p] of Object.entries(consultations?.projets ?? {})) {
    const themes = themesDe.get(String(id));
    if (!themes) continue;
    const b = lois.find((x) => String(x.id) === String(id));
    const num = b?.num ?? p.num;
    for (const m of p.mandats ?? []) {
      const mandat = String(m.id ?? '').replace(/\D/g, '');
      if (!mandat) continue;
      if (m.type === 'particulieres' || m.type === 'generale') {
        // Annoncée : une séance ou une date limite à venir. La clé ne porte pas de date : dite une fois.
        const prochaine = (m.seances ?? []).find((d) => d > jusqua) ?? (m.dateLimite && m.dateLimite > jusqua ? m.dateLimite : null);
        const tenues = (m.seances ?? []).filter(dans);
        if (prochaine) {
          liste.push({ cle: `con_${mandat}`, date: jusqua, themes, genre: 'consultation',
            html: `<a href="${echapper(m.url)}" style="color:#0B5CAD;font-weight:bold">${echapper(m.titre)}</a><br><span style="font-size:13px;color:#5B6570">${echapper(m.commission)} · PL ${echapper(num)}${m.dateLimite ? ` · date limite des mémoires : ${echapper(dateFr(m.dateLimite))}` : ''}${(m.seances ?? []).length ? ` · séances : ${echapper(m.seances.map(dateFr).join(', '))}` : ''}</span>` });
        } else if (tenues.length) {
          liste.push({ cle: `sea_${mandat}_${tenues.at(-1).replace(/-/g, '')}`, date: tenues.at(-1), themes, genre: 'consultation',
            html: `<a href="${echapper(m.url)}" style="color:#0B5CAD;font-weight:bold">${echapper(m.titre)}</a><br><span style="font-size:13px;color:#5B6570">${echapper(m.commission)} · PL ${echapper(num)} · séances tenues : ${echapper(tenues.map(dateFr).join(', '))}</span>` });
        }
      }
      const deposes = (m.memoires ?? []).filter((x) => dans(x.date));
      if (deposes.length) {
        // Un seul article par mandat et par semaine : la liste des organismes, pas un article chacun.
        const noms = deposes.map((x) => x.depose || x.titre).filter(Boolean);
        const montres = noms.slice(0, 12);
        const derniere = deposes.map((x) => x.date).sort().at(-1);
        liste.push({ cle: `mem_${mandat}_${derniere.replace(/-/g, '')}_${deposes.length}`, date: derniere, themes, genre: 'memoire',
          html: `<a href="${echapper(m.urlMemoires || m.url)}" style="color:#0B5CAD;font-weight:bold">${deposes.length} mémoire${deposes.length > 1 ? 's' : ''} déposé${deposes.length > 1 ? 's' : ''} · PL ${echapper(num)}</a><br><span style="font-size:13px;color:#5B6570">${echapper(m.commission)} · ${echapper(montres.join(' ; '))}${noms.length > montres.length ? ` ; et ${noms.length - montres.length} autres` : ''}</span>` });
      }
    }
  }
  return liste.sort((a, b) => b.date.localeCompare(a.date));
}

// Le courriel d'UN abonné : les nouvelles de ses thèmes, pas encore dites. Pur.
//   toutes   le résultat de nouvelles()
//   themes   ses codes cochés
//   vus      Set des clés déjà dites (son état), ou null au premier envoi
//   essai    true : les éléments les plus récents de chaque thème, sans regarder ce qui a été dit
// Rend { sections: [{ code, titre, lignes, total }], aMemoriser: [clés] }.
export const PAR_THEME_MAX = 25;
export function veillePour({ toutes, themes, vus = null, essai = false }) {
  const choisis = THEMES.filter((t) => themes.includes(t.code));
  const deja = new Set(); // une nouvelle n'apparaît qu'une fois, sous le premier thème coché
  const sections = [];
  const aMemoriser = new Set();
  for (const t of choisis) {
    const siennes = toutes.filter((n) => n.themes.includes(t.code));
    for (const n of siennes) aMemoriser.add(n.cle);
    const aDire = siennes.filter((n) => !deja.has(n.cle) && (essai || !vus?.has(n.cle))).slice(0, essai ? 3 : Infinity);
    for (const n of aDire) deja.add(n.cle);
    if (!aDire.length) continue;
    const montres = aDire.slice(0, PAR_THEME_MAX);
    sections.push({ code: t.code, titre: t.fr, lignes: montres.map((n) => n.html), total: aDire.length,
      note: aDire.length > montres.length ? `…et ${aDire.length - montres.length} autres, sur le site.` : '' });
  }
  return { sections, aMemoriser: [...aMemoriser] };
}

// ---------- le courriel ----------
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
export const signatureVeille = (userId) => signer('veille', userId);
export function courrielVeille(sections, userId, { depuis, jusqua, essai = false } = {}) {
  const total = sections.reduce((n, s) => n + s.total, 0);
  const sujet = `${essai ? '[Essai] ' : ''}Votre veille de l'Assemblée : ${pluriel(total, 'nouveauté')} — ${sections.map((s) => s.titre).join(', ')}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const desabonnement = `${site()}/api/unsubscribe?u=${userId}&v=${signatureVeille(userId)}`;
  const cadre = (s) => `<div style="margin:26px 0 0;padding:14px 16px;border:1px solid #DDE2E7;border-left:4px solid #0B8A4B;border-radius:8px">
    <h2 style="margin:0 0 10px;font-size:18px">${echapper(s.titre)} (${s.total})</h2>
    <ul style="margin:0;padding-left:18px">${s.lignes.map((l) => `<li style="margin:0 0 12px">${l}</li>`).join('')}</ul>
    ${s.note ? `<p style="margin:8px 0 0;font-size:14px">${echapper(s.note)}</p>` : ''}
  </div>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#16191D;line-height:1.5">
    <p style="margin:0;font-size:13px;color:#5B6570">DossierQuébec · Veille par thème</p>
    <h1 style="margin:4px 0 0;font-size:22px">La semaine à l'Assemblée nationale</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#5B6570">${essai ? 'Courriel d\'essai : les éléments les plus récents de chaque thème, pas seulement ceux de la semaine.' : `Du ${echapper(dateFr(depuis))} au ${echapper(dateFr(jusqua))}.`}</p>
    ${sections.map(cadre).join('')}
    <p style="margin:22px 0 0"><a href="${site()}/mon-dossier" style="display:inline-block;padding:9px 16px;background:#0B8A4B;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Choisir mes thèmes</a></p>
    <p style="margin:22px 0 0;font-size:12px;color:#5B6570">Un projet de loi entre dans un thème par le ministère qui le présente ou, pour les autres, par les mots de son titre ; un projet sans thème clair n'est classé nulle part. Les votes, les consultations et les mémoires suivent leur projet de loi. Les données viennent de l'Assemblée nationale (ses données ouvertes et son site). DossierQuébec est un site citoyen indépendant, sans lien avec l'Assemblée nationale.<br>
    Vous recevez ce courriel parce que vous avez choisi ces thèmes avec votre abonnement. <a href="${echapper(desabonnement)}" style="color:#5B6570">Ne plus recevoir la veille par thème</a></p>
  </div>`;
  return { sujet, html, desabonnement, total };
}

async function envoyer(a, { sujet, html, desabonnement }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM, to: a, subject: sujet, html,
      headers: { 'List-Unsubscribe': `<${desabonnement}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new Error(`Resend → ${res.status} ${(await res.text()).slice(0, 200)}`);
}
const masquer = (email) => email.replace(/^(.).*?(@.*)$/, '$1***$2');
export const CLE_ETAT = 'veille';

// Le passage du matin.
//   apercu      true : ce qui partirait, sans rien envoyer ni mémoriser (calculé comme un lundi)
//   essai       une adresse (minuscules) : un courriel d'essai à cet·te abonné·e, rien de mémorisé
//   plafond     le nombre de courriels permis à ce passage (le quota du jour partagé, PAR_JOUR)
//   aujourdhui  AAAA-MM-JJ, heure de Montréal (les essais hors ligne fixent la date)
export async function envoyerVeille({ apercu = false, essai = null, plafond = Infinity, aujourdhui = aujourdhuiMontreal() } = {}) {
  const rapport = { abonnes: 0, personnes: 0, envoyes: 0, rienDeNeuf: 0, erreurs: [], ...(apercu ? { apercu: [] } : {}) };
  const semaine = semaineIso(aujourdhui);
  const lundi = estLundi(aujourdhui);
  const toutLire = async (chemin, ordre) => {
    const lignes = [];
    for (;;) {
      const page = await supabase(`${chemin}&order=${ordre}&limit=1000&offset=${lignes.length}`);
      if (!page?.length) return lignes;
      lignes.push(...page);
    }
  };
  const abonnes = (await toutLire('/rest/v1/abonnements?statut=eq.actif&select=user_id,statut,fin', 'user_id'))
    .filter(estActive).map((a) => a.user_id).filter((id) => /^[0-9a-f-]{36}$/.test(id ?? ''));
  rapport.abonnes = abonnes.length;
  if (!abonnes.length) return { ...rapport, raison: 'aucun abonné actif' };
  const liste = abonnes.join(',');
  // Avant scripts/supabase-veille.sql, la colonne n'existe pas : la veille se tait sans faire
  // échouer le passage du matin (les alertes et l'infolettre partent quand même).
  let colonneAbsente = null;
  const [preferences, etats] = await Promise.all([
    toutLire(`/rest/v1/alertes_preferences?select=user_id,veille_themes&user_id=in.(${liste})&veille_themes=neq.{}`, 'user_id')
      .catch((e) => { colonneAbsente = e.message; return []; }),
    toutLire(`/rest/v1/alertes_etat?select=user_id,etat&user_id=in.(${liste})&ville=eq.${ASSEMBLEE}&projet=eq.${CLE_ETAT}`, 'user_id'),
  ]);
  if (colonneAbsente) return { ...rapport, raison: `thèmes illisibles (scripts/supabase-veille.sql exécuté ?) : ${colonneAbsente}` };
  const etatDe = new Map(etats.map((e) => [e.user_id, e.etat]));
  // Qui est dû aujourd'hui : pas encore servi cette semaine, et c'est lundi — ou un lundi raté
  // (déjà servi une semaine précédente). Un tout nouveau choix attend le lundi.
  const actifs = new Set(abonnes);
  const dus = preferences
    .filter((p) => actifs.has(p.user_id))
    .map((p) => ({ uid: p.user_id, themes: (p.veille_themes ?? []).filter((c) => PAR_CODE.has(c)) }))
    .filter((p) => p.themes.length)
    .filter((p) => essai || apercu || (etatDe.get(p.uid)?.semaine !== semaine && (lundi || etatDe.has(p.uid))));
  if (!dus.length) return { ...rapport, raison: lundi ? 'personne à servir' : 'pas lundi' };

  const lireJson = (chemin) => fetch(`${site()}${chemin}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [lois, brut, fichierVotes] = await Promise.all([lireJson('/data/site/bills.json'), lireJson('/data/bills.json'), lireJson('/data/votes.json')]);
  // Sans les projets de loi ou les rôles des parrains, aucun thème n'est fiable : on saute SANS rien
  // mémoriser, ce sera pour le lendemain.
  if (!Array.isArray(lois) || !lois.length || !Array.isArray(brut?.bills)) {
    rapport.erreurs.push('projets de loi illisibles : veille sautée ce matin');
    return rapport;
  }
  const roles = new Map(brut.bills.map((b) => [String(b.id), roleParrain(b.sponsor)]));
  const votes = Array.isArray(fichierVotes?.votes) ? fichierVotes.votes : null;
  if (!votes) rapport.erreurs.push('votes illisibles : votes sautés cette semaine');
  const consultations = chargerConsultations();
  if (!consultations) rapport.erreurs.push('consultations illisibles : consultations et mémoires sautés cette semaine');
  // Le plus loin qu'on puisse avoir à regarder ; chaque personne a ensuite sa propre fenêtre.
  const plusTot = dus.reduce((m, p) => {
    const e = etatDe.get(p.uid);
    const d = e?.jusqua ? plusJours(e.jusqua, -RETARD_JOURS) : plusJours(aujourdhui, -PREMIER_JOURS);
    return d < m ? d : m;
  }, plusJours(aujourdhui, -PREMIER_JOURS));
  const toutes = nouvelles({ lois, roles, votes, consultations, depuis: essai ? '0000-00-00' : plusTot, jusqua: aujourdhui });

  for (const p of dus) {
    if (!apercu && rapport.envoyes >= plafond) { rapport.reportes = (rapport.reportes ?? 0) + 1; continue; } // un autre matin de la semaine
    try {
      const utilisateur = await supabase(`/auth/v1/admin/users/${p.uid}`);
      const email = utilisateur?.email;
      if (!email) continue;
      if (essai && email.toLowerCase() !== essai) continue;
      rapport.personnes++;
      const e = etatDe.get(p.uid);
      const depuis = e?.jusqua ? plusJours(e.jusqua, -RETARD_JOURS) : plusJours(aujourdhui, -PREMIER_JOURS);
      const siennes = essai ? toutes : toutes.filter((n) => n.date >= depuis);
      const v = veillePour({ toutes: siennes, themes: p.themes, vus: new Set(e?.vus ?? []), essai: Boolean(essai) });
      const affiche = e?.jusqua ? plusJours(e.jusqua, 1) : depuis;
      if (v.sections.length) {
        const message = courrielVeille(v.sections, p.uid, { depuis: affiche, jusqua: aujourdhui, essai: Boolean(essai) });
        if (apercu) {
          rapport.apercu.push({ a: masquer(email), sujet: message.sujet, themes: v.sections.map((s) => ({ theme: s.titre, nombre: s.total })) });
          continue;
        }
        await envoyer(email, message);
        rapport.envoyes++;
      } else {
        rapport.rienDeNeuf++;
        if (apercu) continue;
      }
      // Seulement après un envoi réussi, ou s'il n'y avait rien à dire. Les clés gardées : celles de
      // la fenêtre (les plus vieilles en sortent d'elles-mêmes la semaine suivante).
      if (!essai) {
        await supabase('/rest/v1/alertes_etat?on_conflict=user_id,ville,projet', {
          methode: 'POST',
          corps: [{ user_id: p.uid, ville: ASSEMBLEE, projet: CLE_ETAT, etat: { semaine, jusqua: aujourdhui, vus: v.aMemoriser }, mis_a_jour: new Date().toISOString() }],
          entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });
      }
    } catch (erreur) {
      console.error('veille :', p.uid, erreur);
      rapport.erreurs.push(`${p.uid.slice(0, 8)} : ${erreur.message}`);
    }
  }
  return rapport;
}
