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

// Les villes qui ont des courriels. Une ville s'ajoute ici le jour où son volet en produit.
export const VILLES_INFOLETTRE = { quebec: 'Québec', montreal: 'Montréal' };
// Une ligne propre à une ville, affichée sous son nom partout où on s'inscrit (accueil du volet,
// Mes dossiers). Montréal : à retirer le jour où son premier compte rendu du mois est publié
// (Martin, 18 septembre 2026 : « cette légende tu l'enlèveras quand la newsletter sera créée »).
export const NOTES_INFOLETTRE = {
  montreal: "<strong>Montréal commence :</strong> le premier compte rendu du mois arrive à la fin de septembre 2026. Il n'y en a pas encore pour août. Les courriels après chaque séance partent à compter des prochaines séances.",
};

// Langues offertes par ville. Montréal : FR et EN (chaque combo type×langue = un envoi).
// Québec : FR seulement pour l'instant.
export const LANGUES_PAR_VILLE = { quebec: ['fr'], montreal: ['fr', 'en'] };
export const NOM_LANGUE = { fr: 'Français', en: 'English' };


// Les trois sortes de courriels. Chacune s'inscrit à part : on peut vouloir seulement son
// arrondissement, ou seulement le gros compte rendu du mois.
export const TYPES_INFOLETTRE = {
  mensuel: {
    nom: 'Le compte rendu du mois',
    quoi: 'Tout ce que la Ville a décidé dans le mois : les plus gros montants, toutes les subventions et tous les contrats, les votes divisés.',
    rythme: 'une fois par mois',
  },
  conseil: {
    nom: 'Après chaque séance du conseil de la ville',
    quoi: 'Ce que le conseil a décidé à sa séance : les montants, les votes divisés, ce qui a été reporté.',
    rythme: 'environ aux deux semaines',
  },
  arrondissement: {
    nom: 'Mon arrondissement',
    quoi: "Ce que le conseil de votre arrondissement a décidé à sa séance : permis, travaux, subventions de quartier, circulation.",
    rythme: 'après chaque séance de l’arrondissement',
    parArrondissement: true,
  },
};

// Les arrondissements de chaque ville : la clé sert à l'inscription, `instance` à retrouver leurs
// décisions dans les données du volet. Une ville sans arrondissements n'offre pas cette sorte.
export const ARRONDISSEMENTS = {
  quebec: [
    { cle: 'la-cite-limoilou', nom: 'La Cité-Limoilou', instance: "Conseil de l'Arrondissement de La Cité-Limoilou" },
    { cle: 'les-rivieres', nom: 'Les Rivières', instance: "Conseil de l'Arrondissement des Rivières" },
    { cle: 'sainte-foy-sillery-cap-rouge', nom: 'Sainte-Foy–Sillery–Cap-Rouge', instance: "Conseil de l'Arrondissement de Sainte-Foy - Sillery - Cap-Rouge" },
    { cle: 'charlesbourg', nom: 'Charlesbourg', instance: "Conseil de l'Arrondissement de Charlesbourg" },
    { cle: 'beauport', nom: 'Beauport', instance: "Conseil de l'Arrondissement de Beauport" },
    { cle: 'la-haute-saint-charles', nom: 'La Haute-Saint-Charles', instance: "Conseil de l'Arrondissement de La Haute-Saint-Charles" },
  ],
  // Les 19 de Montréal, tels que montreal/data/decisions.json les nomme (lib/mtl.js, nomConseil).
  montreal: [
    ['ahuntsic-cartierville', 'Ahuntsic-Cartierville'],
    ['anjou', 'Anjou'],
    ['cote-des-neiges-notre-dame-de-grace', 'Côte-des-Neiges–Notre-Dame-de-Grâce'],
    ['lachine', 'Lachine'],
    ['lasalle', 'LaSalle'],
    ['ile-bizard-sainte-genevieve', "L'Île-Bizard–Sainte-Geneviève"],
    ['mercier-hochelaga-maisonneuve', 'Mercier–Hochelaga-Maisonneuve'],
    ['montreal-nord', 'Montréal-Nord'],
    ['outremont', 'Outremont'],
    ['pierrefonds-roxboro', 'Pierrefonds-Roxboro'],
    ['plateau-mont-royal', 'Le Plateau-Mont-Royal'],
    ['riviere-des-prairies-pointe-aux-trembles', 'Rivière-des-Prairies–Pointe-aux-Trembles'],
    ['rosemont-la-petite-patrie', 'Rosemont–La Petite-Patrie'],
    ['saint-laurent', 'Saint-Laurent'],
    ['saint-leonard', 'Saint-Léonard'],
    ['sud-ouest', 'Le Sud-Ouest'],
    ['verdun', 'Verdun'],
    ['ville-marie', 'Ville-Marie'],
    ['villeray-saint-michel-parc-extension', 'Villeray–Saint-Michel–Parc-Extension'],
  ].map(([cle, nom]) => ({ cle, nom: nom.replace(/^Le /, ''), instance: `Conseil d'arrondissement ${/^Le /.test(nom) ? `du ${nom.slice(3)}` : `de ${nom}`}` })),
};

// Ce qu'une ville offre : les sortes valides, et ses arrondissements s'il y en a.
export const offreDe = (ville) => {
  const langues = LANGUES_PAR_VILLE[ville] ?? ['fr'];
  return Object.entries(TYPES_INFOLETTRE)
    .filter(([, t]) => !t.parArrondissement || (ARRONDISSEMENTS[ville] ?? []).length)
    .map(([cle, t]) => ({
      cle, nom: t.nom, quoi: t.quoi, rythme: t.rythme,
      arrondissements: t.parArrondissement ? ARRONDISSEMENTS[ville].map(({ cle: c, nom }) => ({ cle: c, nom })) : null,
      langues,
    }));
};

// Un choix valide : { ville, type, arrondissement } — l'arrondissement vaut '' quand la sorte n'en
// demande pas, et doit exister quand elle en demande un.
export function choixValide(choix) {
  const ville = String(choix?.ville ?? '');
  const type = String(choix?.type ?? 'mensuel');
  if (!Object.hasOwn(VILLES_INFOLETTRE, ville) || !Object.hasOwn(TYPES_INFOLETTRE, type)) return null;
  const arrondissement = String(choix?.arrondissement ?? '');
  if (TYPES_INFOLETTRE[type].parArrondissement) {
    if (!(ARRONDISSEMENTS[ville] ?? []).some((a) => a.cle === arrondissement)) return null;
  } else if (arrondissement) return null;
  const langue = String(choix?.langue ?? 'fr');
  if (!(LANGUES_PAR_VILLE[ville] ?? ['fr']).includes(langue)) return null;
  return { ville, type, arrondissement, langue };
}

export function nomComplet({ ville, type, arrondissement, langue = 'fr' }) {
  const nomVille = VILLES_INFOLETTRE[ville] ?? ville;
  const nomType = TYPES_INFOLETTRE[type]?.nom ?? type;
  const nomArr = (ARRONDISSEMENTS[ville] ?? []).find((a) => a.cle === arrondissement)?.nom;
  const base = `${nomVille} — ${nomArr ? `${nomType} : ${nomArr}` : nomType}`;
  return langue === 'en' ? `${base} (English)` : base;
}

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

// Le plus récent numéro publié d'une sorte (et d'un arrondissement, s'il y a lieu).
export const dernierNumero = async ({ ville, type = 'mensuel', arrondissement = '', langue = 'fr' }) => {
  const q = (lang) => supabase(`/rest/v1/infolettre_numeros?ville=eq.${ville}&type=eq.${type}&arrondissement=eq.${arrondissement}&langue=eq.${lang}&publie_le=not.is.null&select=ville,type,arrondissement,langue,mois,titre,html,html_abonnes&order=mois.desc&limit=1`);
  return (await q(langue))[0] ?? (langue !== 'fr' ? (await q('fr'))[0] : null) ?? null;
};

// Le courriel, prêt à partir : le bandeau de bienvenue (s'il y a lieu) et les liens de désinscription.
export function composer(numero, { id, abonne, bienvenue }) {
  const mensuel = (numero.type ?? 'mensuel') === 'mensuel';
  const quoi = nomComplet({ ville: numero.ville, type: numero.type ?? 'mensuel', arrondissement: numero.arrondissement ?? '' });
  const bandeau = bienvenue
    ? `<tr><td style="padding:18px 0 0"><div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:14px 16px;border-radius:10px;background:#E8F6EE;border:1px solid #9FD9B6;font-size:15px;line-height:1.55;color:#16191D">👋 <strong>Bienvenue !</strong> Voici le plus récent courriel de « ${echapper(quoi)} »${mensuel ? `, celui ${echapper(deMois(numero.mois))}` : ''}. <strong>Le prochain arrive ${mensuel ? echapper(prochainEnvoi()) : 'après la prochaine séance'}.</strong></div></td></tr>`
    : '';
  const pied = `<br><br>Vous recevez ce courriel parce que vous vous y êtes inscrit sur dossierquebec.ca.
    <a href="${lienSigne('desinscrire', [id])}" style="color:#5B6470">Ne plus recevoir « ${echapper(quoi)} »</a> ·
    <a href="${lienSigne('desinscrire', [id], '&tout=1')}" style="color:#5B6470">me désinscrire de tout</a>`;
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
    const numero = await dernierNumero(i);
    const quoi = nomComplet(i);
    if (numero) {
      messages.push({ a: i.email, sujet: `Bienvenue — ${numero.titre}`, html: composer(numero, { id: i.id, abonne: abonnes.has(i.email), bienvenue: true }), desinscription: lienSigne('desinscrire', [i.id]) });
      envoyesPour.set(numero.mois, [...(envoyesPour.get(numero.mois) ?? []), i.id]);
    } else {
      const quand = (i.type ?? 'mensuel') === 'mensuel' ? prochainEnvoi() : 'après la prochaine séance';
      messages.push({
        a: i.email,
        sujet: `Inscription confirmée — ${quoi}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16191D;line-height:1.55"><h1 style="font-size:20px;color:#0B8A4B">📬 C'est confirmé</h1><p>Vous recevrez « ${echapper(quoi)} ». <strong>Le premier arrive ${echapper(quand)}.</strong></p><p style="font-size:13px;color:#5B6470">En attendant : <a href="${site()}/${i.ville}/" style="color:#0B8A4B">les décisions de la Ville</a>. <a href="${lienSigne('desinscrire', [i.id])}" style="color:#5B6470">Me désinscrire</a></p></div>`,
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
// reçu (ceux qui l'ont eu en bienvenue sont sautés), `plafond` au plus — ce que les alertes des
// abonnés payants, parties avant, ont laissé du quota quotidien.
export async function envoyerNumerosEnAttente(plafond = PAR_JOUR) {
  const rapport = { numeros: 0, envoyes: 0, termines: 0, plafond };
  if (plafond <= 0) return rapport;
  const numeros = await supabase('/rest/v1/infolettre_numeros?publie_le=not.is.null&envoye_le=is.null&select=ville,type,arrondissement,mois,titre,html,html_abonnes,envoyes&order=mois');
  if (!numeros.length) return rapport;
  const abonnes = await courrielsAbonnes();
  let reste = Math.min(plafond, PAR_JOUR);
  for (const numero of numeros) {
    if (reste <= 0) break;
    rapport.numeros++;
    const inscrits = await supabase(`/rest/v1/infolettre_inscriptions?ville=eq.${numero.ville}&type=eq.${numero.type ?? 'mensuel'}&arrondissement=eq.${numero.arrondissement ?? ''}&statut=eq.confirme&or=(dernier_mois.is.null,dernier_mois.lt.${numero.mois})&select=id,email&order=confirme_le&limit=${reste + 1}`);
    const lot = inscrits.slice(0, reste);
    if (lot.length) {
      await envoyerCourriels(lot.map((i) => ({ a: i.email, sujet: numero.titre, html: composer(numero, { id: i.id, abonne: abonnes.has(i.email), bienvenue: false }), desinscription: lienSigne('desinscrire', [i.id]) })));
      await supabase(`/rest/v1/infolettre_inscriptions?id=in.(${lot.map((i) => i.id).join(',')})`, { methode: 'PATCH', corps: { dernier_mois: numero.mois }, entetes: { Prefer: 'return=minimal' } });
      reste -= lot.length;
      rapport.envoyes += lot.length;
    }
    const termine = inscrits.length <= lot.length;
    await supabase(`/rest/v1/infolettre_numeros?ville=eq.${numero.ville}&type=eq.${numero.type ?? 'mensuel'}&arrondissement=eq.${numero.arrondissement ?? ''}&mois=eq.${numero.mois}`, {
      methode: 'PATCH',
      corps: { envoyes: (numero.envoyes ?? 0) + lot.length, updated_at: new Date().toISOString(), ...(termine ? { envoye_le: new Date().toISOString() } : {}) },
      entetes: { Prefer: 'return=minimal' },
    });
    if (termine) rapport.termines++;
  }
  return rapport;
}
