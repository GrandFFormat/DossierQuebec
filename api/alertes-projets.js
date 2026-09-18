// Alertes par courriel des projets suivis — réservées aux abonnés. Vercel Cron, chaque matin
// après le rafraîchissement des volets (vercel.json).
//
//   GET /api/alertes-projets                      Authorization: Bearer <CRON_SECRET>
//   GET /api/alertes-projets?apercu=1             ce qui partirait, sans rien envoyer ni mémoriser
//   GET /api/alertes-projets?essai=<courriel>     un courriel d'essai à cet abonné : les trois
//                                                 dossiers les plus récents de chaque projet
//                                                 suivi, sans toucher à ce qui a déjà été vu
//   POST /api/alertes-projets?essai=moi           le même essai, demandé par l'abonné lui-même
//                                                 depuis Mes dossiers (Authorization: Bearer
//                                                 <jeton de session>) ; 3 par 24 heures
//
// Pour chaque abonné actif (abonnements) qui suit des projets (dossiers_suivis, « projet:<clé> »)
// et n'a pas coupé ses alertes (alertes_preferences) : on lit le fichier public du projet
// (/<ville>/data/projets/<clé>.json), on le compare à ce qu'on lui a déjà signalé (alertes_etat),
// et on n'écrit que s'il y a du nouveau :
//   - un nouveau dossier dans le projet ;
//   - un dossier qui passe d'« en attente » à « décision finale » ;
//   - une nouvelle résolution sur un dossier encore en attente ;
//   - un dossier récent qui contient un de ses mots-clés (alertes_mots_cles) ou le nom d'un
//     organisme qu'il suit (organismes_suivis).
// Le récapitulatif « Où en est le projet », s'il a été refait, accompagne ces nouvelles.
// Un projet suivi pour la première fois est mémorisé sans courriel : on ne signale que ce qui
// arrive ensuite. Au plus un courriel par personne par exécution, tous projets réunis. Si l'envoi
// échoue, rien n'est mémorisé : ce sera redit le lendemain.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, DIGEST_FROM, CRON_SECRET,
// PUBLIC_SITE_URL. Tables : scripts/supabase-schema-alertes.sql.

import { supabase, signature, site } from './_alertes.js';
import { PAR_JOUR, envoyerNumerosEnAttente } from './_infolettre.js';
import { estActive } from './_stripe.js';

const VILLES = { quebec: 'Québec', montreal: 'Montréal', levis: 'Lévis', longueuil: 'Longueuil', laval: 'Laval' };
const CLE = /^[\w-]{1,60}$/;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- ce qui a changé ----------
// Ce qu'on retient d'un projet : pour chaque dossier, son statut et son nombre de résolutions ;
// et la date du récapitulatif.
export function etatDe(projet) {
  return {
    dossiers: Object.fromEntries(projet.dossiers.filter((d) => d.numero).map((d) => [d.numero, `${d.statutDossier ?? ''}|${d.resolutions?.length ?? 0}`])),
    recap: projet.recap?.genereLe ?? null,
  };
}

export function changements(projet, ancien) {
  const nouveaux = [];
  const decides = [];
  const etapes = [];
  for (const d of projet.dossiers) {
    if (!d.numero) continue;
    const avant = ancien.dossiers?.[d.numero];
    if (avant === undefined) {
      nouveaux.push(d);
      continue;
    }
    const [statutAvant, nAvant] = avant.split('|');
    if (statutAvant === 'en_cours' && d.statutDossier === 'termine') decides.push(d);
    else if ((d.resolutions?.length ?? 0) > Number(nAvant)) etapes.push(d);
  }
  const total = nouveaux.length + decides.length + etapes.length;
  // Le récapitulatif seul (refait après un changement de consignes, par exemple) ne vaut pas un courriel.
  const recap = total && projet.recap && projet.recap.genereLe !== ancien.recap ? projet.recap : null;
  return { nouveaux, decides, etapes, recap, total };
}

// ---------- les mots-clés ----------
// Un mot-clé (« 1re Avenue », « Limoilou », « déneigement ») est cherché, mot entier, sans tenir
// compte des accents ni des majuscules, dans l'objet et le résumé des dossiers récents
// (/<ville>/data/recentes.json). Même mécanique que les projets : ce qu'on a déjà signalé est
// retenu dans alertes_etat sous « mot_<id> », et un mot tout juste ajouté part d'ici, sans courriel.
export const normaliserTexte = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
export function contientMot(dossier, mot) {
  const m = normaliserTexte(mot).trim();
  if (m.length < 2) return false;
  const texte = normaliserTexte([dossier.objet, ...(dossier.puces ?? [])].join(' '));
  return new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(texte);
}
export const cleMot = (id) => `mot_${String(id).replace(/[^0-9a-f]/gi, '')}`;
export const cleOrganisme = (id) => `org_${String(id).replace(/[^0-9a-f]/gi, '')}`;
// Un organisme suivi (« Loisirs Montcalm inc. ») est cherché sans sa forme juridique : les documents
// l'écrivent tantôt avec, tantôt sans.
export const sansFormeJuridique = (nom) => String(nom ?? '').trim().replace(/[\s,]+(?:inc|ltée|limitée|s\.?e\.?n\.?c|s\.?e\.?c|enr|coop)\.?$/i, '').trim();

// ---------- le courriel ----------
const statut = (d) =>
  d.statutDossier === 'termine'
    ? `Décision finale${d.etapeFinale ? ` — ${d.etapeFinale}` : ''}`
    : d.statutDossier === 'en_cours'
      ? `En attente${d.etapeFinale ? ` — décision attendue : ${d.etapeFinale}` : ''}${d.echeance ? `, date cible ${dateFr(d.echeance)}` : ''}`
      : '';

function ligne(ville, d, precision) {
  const lien = `${site()}/${ville}/decisions.html?q=${encodeURIComponent(d.numero)}`;
  const phrase = d.puces?.[0] ?? d.objet ?? '';
  return `<li style="margin:0 0 12px">
    <a href="${echapper(lien)}" style="font-family:Consolas,monospace;font-size:13px;font-weight:bold;color:#076338;text-decoration:none">${echapper(d.numero)}</a>
    <span style="font-size:13px;color:#5B6570"> · ${echapper(precision)}</span><br>
    <span style="font-size:15px">${echapper(phrase)}</span>
  </li>`;
}

function bloc(titre, lignes) {
  return lignes.length
    ? `<p style="margin:14px 0 6px;font-size:12px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;color:#5B6570">${titre}</p><ul style="margin:0;padding-left:18px">${lignes.join('')}</ul>`
    : '';
}

// Plafond de taille du courriel. Gmail coupe un message au-delà d'environ 102 Ko (« [Message
// tronqué] ») et cache alors tout le bas, y compris le lien de désabonnement. À 80 Ko, on garde
// de la marge : les projets entrent en entier tant qu'il y a de la place ; celui qui déborde est
// coupé (« …et N autres ») ; les suivants tiennent sur une ligne chacun. Tout reste dans Mes dossiers.
export const PLAFOND_OCTETS = 80 * 1024;
const octets = (s) => Buffer.byteLength(s, 'utf8');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function cadreProjet(ville, projet, contenu) {
  return `<div style="margin:26px 0 0;padding:14px 16px;border:1px solid #DDE2E7;border-left:4px solid #0B8A4B;border-radius:8px">
    <h2 style="margin:0;font-size:18px">${echapper(projet.titre)} <span style="font-size:13px;font-weight:normal;color:#5B6570">· ${echapper(VILLES[ville] ?? ville)}</span></h2>
    ${contenu}
  </div>`;
}

// Les trois sections d'un projet, chacune avec ses lignes toutes prêtes (pour pouvoir couper).
function blocsDe(ville, c, mot = false) {
  const derniere = (d) => d.resolutions?.at(-1);
  return [
    { titre: mot ? 'Décisions récentes qui le mentionnent' : 'Nouveaux dossiers', lignes: c.nouveaux.map((d) => ligne(ville, d, [dateFr(d.derniere), statut(d)].filter(Boolean).join(' · '))) },
    { titre: 'Décision finale prise', lignes: c.decides.map((d) => ligne(ville, d, [derniere(d)?.instance, dateFr(derniere(d)?.date)].filter(Boolean).join(', '))) },
    { titre: 'Nouvelle étape', lignes: c.etapes.map((d) => ligne(ville, d, [derniere(d)?.instance, dateFr(derniere(d)?.date), statut(d)].filter(Boolean).join(' · '))) },
  ];
}

const recapHtml = (c) =>
  c.recap?.enBref
    ? `<p style="margin:14px 0 0;font-size:14px;color:#16191D"><b>Où en est le projet</b> <span style="color:#5B6570">(récapitulatif mis à jour, généré par IA)</span><br>${echapper(c.recap.enBref)}</p>`
    : '';

export function courriel(sections, userId, essai = false) {
  const total = sections.reduce((n, s) => n + s.c.total, 0);
  const titres = sections.map((s) => s.projet.titre);
  const avecMots = sections.some((x) => x.mot);
  const sujet = `${essai ? '[Essai] ' : ''}${avecMots ? 'Vos alertes' : 'Vos projets'} : ${total} nouveauté${total > 1 ? 's' : ''} — ${titres[0]}${titres.length > 1 ? ` et ${titres.length - 1} autre${titres.length > 2 ? 's' : ''}` : ''}`.replace(/[\r\n]+/g, ' ');
  const desabonnement = `${site()}/api/alertes-desabonnement?u=${userId}&s=${signature(userId)}`;
  const mesDossiers = `${site()}/mes-dossiers`;

  const debut = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#16191D;line-height:1.5">
    <p style="margin:0;font-size:13px;color:#5B6570">DossierQuébec · Mes dossiers</p>
    <h1 style="margin:4px 0 0;font-size:22px">${avecMots ? 'Du nouveau dans vos alertes' : 'Du nouveau dans vos projets'}</h1>
    ${essai ? '<p style="margin:8px 0 0;padding:8px 10px;background:#FFF6D6;border-radius:6px;font-size:13px">Courriel d\'essai : il reprend les dossiers les plus récents de chaque projet, pas seulement les nouveautés.</p>' : ''}`;
  const fin = `<p style="margin:22px 0 0"><a href="${mesDossiers}" style="display:inline-block;padding:9px 16px;background:#0B8A4B;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Voir mes dossiers</a></p>
    <p style="margin:22px 0 0;font-size:12px;color:#5B6570">Les phrases sous chaque numéro sont des résumés générés par IA à partir des documents de la Ville ; en cas d'écart, les documents officiels font foi. DossierQuébec n'est pas un site de la Ville.<br>
    Vous recevez ce courriel parce que vous suivez ces projets, mots-clés ou organismes avec votre abonnement. <a href="${echapper(desabonnement)}" style="color:#5B6570">Ne plus recevoir ces alertes</a></p>
  </div>`;

  // Réserve pour la liste « Aussi du nouveau » des projets qui n'entreront pas : ~250 octets chacun.
  let budget = PLAFOND_OCTETS - octets(debut) - octets(fin) - 600 - sections.length * 250;
  const parties = [];
  const enUneLigne = [];
  let coupe = false;
  for (const { ville, projet, c, mot } of sections) {
    const blocs = blocsDe(ville, c, mot);
    if (!coupe) {
      const complet = cadreProjet(ville, projet, blocs.map((b) => bloc(`${b.titre} (${b.lignes.length})`, b.lignes)).join('') + recapHtml(c));
      if (octets(complet) <= budget) {
        parties.push(complet);
        budget -= octets(complet);
        continue;
      }
      coupe = true;
      // Le projet qui déborde : autant de dossiers que la place le permet, puis « …et N autres ».
      let place = budget - octets(cadreProjet(ville, projet, '')) - 500;
      if (place > 1500) {
        let omis = 0;
        const html = [];
        for (const b of blocs) {
          const gardees = [];
          for (const l of b.lignes) {
            const cout = octets(l) + (gardees.length ? 0 : 250); // la première ligne paie le titre de la section
            if (cout <= place) {
              gardees.push(l);
              place -= cout;
            } else omis++;
          }
          if (gardees.length) html.push(bloc(`${b.titre} (${b.lignes.length})`, gardees));
        }
        const note = omis
          ? `<p style="margin:10px 0 0;font-size:14px">…et ${pluriel(omis, 'autre nouveauté')} dans ce projet — <a href="${mesDossiers}" style="color:#076338;font-weight:bold">voir dans Mes dossiers</a></p>`
          : '';
        const partiel = cadreProjet(ville, projet, html.join('') + note);
        parties.push(partiel);
        budget -= octets(partiel);
        continue;
      }
    }
    enUneLigne.push({ ville, projet, c });
  }
  const autres = enUneLigne.length
    ? `<div style="margin:26px 0 0;padding:14px 16px;border:1px solid #DDE2E7;border-radius:8px">
        <p style="margin:0 0 6px;font-weight:bold">Aussi du nouveau dans vos autres projets</p>
        <ul style="margin:0;padding-left:18px">${enUneLigne.map(({ ville, projet, c }) => `<li style="margin:0 0 4px">${echapper(projet.titre)} <span style="color:#5B6570">(${echapper(VILLES[ville] ?? ville)})</span> : ${pluriel(c.total, 'nouveauté')}</li>`).join('')}</ul>
        <p style="margin:8px 0 0;font-size:14px"><a href="${mesDossiers}" style="color:#076338;font-weight:bold">Tout voir dans Mes dossiers</a></p>
      </div>`
    : '';

  return { sujet, html: debut + parties.join('') + autres + fin, desabonnement, total, coupe };
}

async function envoyer(a, { sujet, html, desabonnement }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM,
      to: a,
      subject: sujet,
      html,
      headers: { 'List-Unsubscribe': `<${desabonnement}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new Error(`Resend → ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const masquer = (email) => email.replace(/^(.).*?(@.*)$/, '$1***$2');

// « M'envoyer un courriel d'essai », depuis Mes dossiers : seulement à soi-même, abonné, 3 par 24 h.
async function essaiPourSoi(jeton) {
  const utilisateur = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jeton}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const uid = utilisateur?.id;
  if (!uid || !/^[0-9a-f-]{36}$/.test(uid) || !utilisateur.email) return { statut: 401, corps: { erreur: 'connexion requise' } };
  const [abonnement] = await supabase(`/rest/v1/abonnements?user_id=eq.${uid}&select=statut,fin`);
  if (!estActive(abonnement)) {
    return { statut: 403, corps: { erreur: 'réservé aux abonnés' } };
  }
  const depuis = new Date(Date.now() - 24 * 3600e3).toISOString();
  const essais = await supabase(`/rest/v1/alertes_envois?user_id=eq.${uid}&essai=eq.true&envoye_le=gte.${encodeURIComponent(depuis)}&select=id&limit=3`);
  if (essais.length >= 3) return { statut: 429, corps: { erreur: 'limite de 3 essais par 24 heures' } };
  return { uid, email: utilisateur.email };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_FROM', 'CRON_SECRET']) {
    if (!process.env[v]) return res.status(503).json({ erreur: `variable manquante : ${v}` });
  }
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const serveur = jeton === process.env.CRON_SECRET;
  let pourSoi = null;
  if (!serveur) {
    if (req.method !== 'POST' || req.query?.essai !== 'moi' || !jeton) return res.status(401).json({ erreur: 'non autorisé' });
    try {
      pourSoi = await essaiPourSoi(jeton);
    } catch (erreur) {
      console.error('alertes-projets (essai) :', erreur);
      return res.status(500).json({ erreur: erreur.message });
    }
    if (!pourSoi.uid) return res.status(pourSoi.statut).json(pourSoi.corps);
  }
  const apercu = serveur && req.query?.apercu === '1';
  const essai = pourSoi ? pourSoi.email.toLowerCase() : String(req.query?.essai ?? '').trim().toLowerCase() || null;
  const rapport = { abonnes: 0, personnes: 0, envoyes: 0, projetsMemorises: 0, erreurs: [], ...(apercu ? { apercu: [] } : {}) };

  // Les infolettres publiées (api/_infolettre.js) partent au même passage, APRÈS les alertes : Resend
  // gratuit, c'est 100 courriels par jour pour tout, et les abonnés payants passent d'abord.
  // L'infolettre prend ce qui reste. Une panne de l'une n'empêche pas l'autre. (Jusqu'au 18 sept.
  // 2026 l'infolettre partait avant et pouvait prendre 90 envois sur 100.)
  const puisInfolettre = async () => {
    if (!serveur || apercu || essai) return;
    try {
      rapport.infolettre = await envoyerNumerosEnAttente(Math.max(0, PAR_JOUR - rapport.envoyes));
    } catch (erreur) {
      console.error('infolettre (cron) :', erreur);
      rapport.erreurs.push(`infolettre : ${erreur.message}`);
    }
  };

  try {
    const maintenant = new Date();
    const abonnes = pourSoi
      ? [pourSoi.uid]
      : (await supabase('/rest/v1/abonnements?statut=eq.actif&select=user_id,fin'))
          .filter((a) => !a.fin || new Date(a.fin) > maintenant)
          .map((a) => a.user_id)
          .filter((id) => /^[0-9a-f-]{36}$/.test(id));
    rapport.abonnes = abonnes.length;
    if (!abonnes.length) {
      await puisInfolettre();
      return res.status(200).json({ ok: true, ...rapport, raison: 'aucun abonné actif' });
    }

    const liste = abonnes.join(',');
    const [suivis, preferences, etats, mots, organismes] = await Promise.all([
      supabase(`/rest/v1/dossiers_suivis?select=user_id,ville,dossier_id&user_id=in.(${liste})&dossier_id=like.projet:*`),
      supabase(`/rest/v1/alertes_preferences?select=user_id,actif&user_id=in.(${liste})`),
      supabase(`/rest/v1/alertes_etat?select=user_id,ville,projet,etat&user_id=in.(${liste})`),
      // Table des mots-clés absente (SQL pas encore exécuté) : les alertes de projets partent quand même.
      supabase(`/rest/v1/alertes_mots_cles?select=id,user_id,mot&user_id=in.(${liste})&order=created_at`).catch((e) => {
        rapport.erreurs.push(`mots-clés ignorés : ${e.message}`);
        return [];
      }),
      supabase(`/rest/v1/organismes_suivis?select=id,user_id,nom&user_id=in.(${liste})&order=created_at`).catch((e) => {
        rapport.erreurs.push(`organismes ignorés : ${e.message}`);
        return [];
      }),
    ]);
    const coupees = new Set(preferences.filter((p) => p.actif === false).map((p) => p.user_id));
    const dejaVu = new Map(etats.map((e) => [`${e.user_id}|${e.ville}|${e.projet}`, e.etat]));

    // Chaque fichier de projet est lu une seule fois, quel que soit le nombre d'abonnés.
    const fichiers = new Map();
    const lireProjet = (ville, cle) => {
      const k = `${ville}/${cle}`;
      if (!fichiers.has(k)) {
        fichiers.set(k, fetch(`${site()}/${ville}/data/projets/${cle}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
      }
      return fichiers.get(k);
    };

    const recentes = new Map();
    const lireRecentes = (ville) => {
      if (!recentes.has(ville)) {
        recentes.set(ville, fetch(`${site()}/${ville}/data/recentes.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
      }
      return recentes.get(ville);
    };

    const projetsDe = new Map();
    for (const s of suivis) {
      const cle = s.dossier_id.slice('projet:'.length);
      if (!Object.hasOwn(VILLES, s.ville) || !CLE.test(cle)) continue;
      if (!projetsDe.has(s.user_id)) projetsDe.set(s.user_id, []);
      projetsDe.get(s.user_id).push({ ville: s.ville, cle });
    }
    // Les mots-clés et les organismes suivis : même mécanique, sur les dossiers récents.
    const ciblesDe = new Map();
    const ajouterCible = (userId, cible) => {
      if (!ciblesDe.has(userId)) ciblesDe.set(userId, []);
      ciblesDe.get(userId).push(cible);
    };
    for (const m of mots) {
      if (m.mot && /^[0-9a-f-]{36}$/.test(m.id ?? '')) ajouterCible(m.user_id, { cle: cleMot(m.id), cherche: m.mot, titre: `Mot-clé « ${m.mot} »` });
    }
    for (const o of organismes) {
      const cherche = sansFormeJuridique(o.nom);
      if (cherche.length >= 3 && /^[0-9a-f-]{36}$/.test(o.id ?? '')) ajouterCible(o.user_id, { cle: cleOrganisme(o.id), cherche, titre: `Organisme « ${o.nom} »` });
    }
    rapport.motsMemorises = 0;

    for (const uid of new Set([...projetsDe.keys(), ...ciblesDe.keys()])) {
      const projets = projetsDe.get(uid) ?? [];
      if (coupees.has(uid) && !essai) continue;
      try {
        const utilisateur = await supabase(`/auth/v1/admin/users/${uid}`);
        const email = utilisateur?.email;
        if (!email) continue;
        if (essai && email.toLowerCase() !== essai) continue;
        rapport.personnes++;

        const sections = [];
        const aMemoriser = [];
        for (const { ville, cle } of projets) {
          const projet = await lireProjet(ville, cle);
          if (!projet?.dossiers) continue;
          if (essai) {
            const recents = projet.dossiers.slice(0, 3);
            if (recents.length) sections.push({ ville, projet, c: { nouveaux: recents, decides: [], etapes: [], recap: projet.recap, total: recents.length } });
            continue;
          }
          aMemoriser.push({ user_id: uid, ville, projet: cle, etat: etatDe(projet), mis_a_jour: maintenant.toISOString() });
          const ancien = dejaVu.get(`${uid}|${ville}|${cle}`);
          if (!ancien) continue; // suivi depuis la dernière exécution : on part d'ici, sans courriel
          const c = changements(projet, ancien);
          if (c.total) sections.push({ ville, projet, c });
        }

        // Les mots-clés : les dossiers récents qui les contiennent et qu'on n'a pas encore signalés
        // (ni pour ce mot, ni plus haut dans ce même courriel pour un projet).
        const dejaDansCeCourriel = new Set(sections.flatMap((s) => [...s.c.nouveaux, ...s.c.decides, ...s.c.etapes].map((d) => d.numero)));
        for (const m of ciblesDe.get(uid) ?? []) {
          for (const ville of Object.keys(VILLES)) {
            const fichier = await lireRecentes(ville);
            if (!fichier?.dossiers) continue;
            const trouves = fichier.dossiers.filter((d) => contientMot(d, m.cherche));
            const cle = m.cle;
            const titre = { titre: m.titre };
            if (essai) {
              const recents = trouves.slice(0, 3);
              if (recents.length) sections.push({ ville, projet: titre, mot: true, c: { nouveaux: recents, decides: [], etapes: [], recap: null, total: recents.length } });
              continue;
            }
            aMemoriser.push({ user_id: uid, ville, projet: cle, etat: { vus: trouves.map((d) => d.numero) }, mis_a_jour: maintenant.toISOString() });
            const ancien = dejaVu.get(`${uid}|${ville}|${cle}`);
            if (!ancien) continue; // mot ajouté depuis la dernière exécution : on part d'ici
            const vus = new Set(ancien.vus ?? []);
            const nouveaux = trouves.filter((d) => !vus.has(d.numero) && !dejaDansCeCourriel.has(d.numero));
            for (const d of nouveaux) dejaDansCeCourriel.add(d.numero);
            if (nouveaux.length) sections.push({ ville, projet: titre, mot: true, c: { nouveaux, decides: [], etapes: [], recap: null, total: nouveaux.length } });
          }
        }

        if (sections.length) {
          const message = courriel(sections, uid, Boolean(essai));
          if (apercu) {
            rapport.apercu.push({ a: masquer(email), sujet: message.sujet, projets: sections.map((s) => ({ titre: s.projet.titre, nouveaux: s.c.nouveaux.length, decides: s.c.decides.length, etapes: s.c.etapes.length })) });
          } else {
            await envoyer(email, message);
            rapport.envoyes++;
            await supabase('/rest/v1/alertes_envois', {
              methode: 'POST',
              corps: { user_id: uid, projets: sections.length, changements: message.total, essai: Boolean(essai) },
              entetes: { Prefer: 'return=minimal' },
            }).catch((e) => rapport.erreurs.push(`journal ${uid.slice(0, 8)} : ${e.message}`));
          }
        }
        // Seulement après un envoi réussi (ou s'il n'y avait rien à envoyer) : sinon on redira demain.
        if (!apercu && !essai && aMemoriser.length) {
          await supabase('/rest/v1/alertes_etat?on_conflict=user_id,ville,projet', {
            methode: 'POST',
            corps: aMemoriser,
            entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          });
          rapport.projetsMemorises += aMemoriser.filter((a) => !/^(?:mot|org)_/.test(a.projet)).length;
          rapport.motsMemorises += aMemoriser.filter((a) => /^(?:mot|org)_/.test(a.projet)).length;
        }
      } catch (erreur) {
        console.error('alertes-projets :', uid, erreur);
        rapport.erreurs.push(`${uid.slice(0, 8)} : ${erreur.message}`);
      }
    }
    await puisInfolettre();
    return res.status(200).json({ ok: true, ...rapport });
  } catch (erreur) {
    console.error('alertes-projets :', erreur);
    await puisInfolettre();
    return res.status(500).json({ ok: false, erreur: erreur.message, ...rapport });
  }
}
