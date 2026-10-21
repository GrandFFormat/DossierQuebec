// LES ALERTES SUR MESURE, deuxième outil de l'abonnement (21 oct. 2026). Le « _ » : Vercel n'en fait
// pas une route. Appelé par api/infolettre-envoi.js, la tâche planifiée de chaque matin, qui fait
// partir les alertes PUIS l'infolettre (Vercel Hobby : 2 tâches planifiées et 12 fonctions au plus).
//
// Reprise de l'ancien api/alertes-projets.js (retiré le 27 sept. 2026, commit 2be7f8c), réduite à
// l'Assemblée nationale : AUCUNE donnée municipale derrière le paiement (conditions des Villes).
// Pour chaque abonné·e actif (abonnements) qui n'a pas coupé ses alertes (alertes_preferences) :
//   - un projet de loi suivi (dossiers_suivis, ville « assemblee », dossier_id « pl:<id> ») qui passe
//     à une étape plus avancée ;
//   - un projet de loi qui contient un de ses mots-clés (alertes_mots_cles, portee « assemblee »),
//     dans le titre officiel ou le résumé ;
//   - un ministre ou un·e député·e suivi (follows) qui présente un projet de loi, ou qui vote à un
//     vote nominal (/data/votes.json) ;
//   - (21 oct. 2026) la date limite d'une consultation en commission sur un projet suivi ou touché par
//     un mot-clé, dans les 7 jours (api/_consultations.js) — seulement si l'Assemblée l'a publiée ;
//   - (21 oct. 2026) un nouveau mémoire déposé en commission par un organisme suivi
//     (organismes_suivis, portee « assemblee » ; api/_organismes.js).
// Un suivi tout neuf est mémorisé sans courriel : on ne signale que ce qui arrive ensuite. Au plus un
// courriel par personne par exécution. Si l'envoi échoue, rien n'est mémorisé : ce sera redit le
// lendemain. Ce qui a déjà été signalé vit dans alertes_etat (ville « assemblee »).
//
// Tables : scripts/supabase-schema-alertes.sql, supabase-schema-mots-cles.sql,
// supabase-schema-mots-cles-portee.sql, puis scripts/supabase-alertes-retour.sql (plafond des mots-clés)
// et scripts/supabase-organismes-retour.sql (organismes suivis).

import crypto from 'node:crypto';
import { supabase, signature, site } from './_alertes.js';
import { estActive } from './_stripe.js';
import { chargerConsultations, rappelsEcheance, RAPPEL_JOURS } from './_consultations.js';
import { indexOrganismes, cleEtatOrganisme, idMemoire, ORGANISMES_MAX } from './_organismes.js';

export const ASSEMBLEE = 'assemblee';
export const LOI = /^pl:(\d{1,9})$/;
const UUID = /^[0-9a-f-]{36}$/;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- les mots-clés ----------
// Cherché mot entier, sans tenir compte des accents ni des majuscules.
export const normaliserTexte = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
export function contientMot(texte, mot) {
  const m = normaliserTexte(mot).trim();
  if (m.length < 2) return false;
  return new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(normaliserTexte(texte));
}
export const cleMot = (id) => `mot_${String(id).replace(/[^0-9a-f]/gi, '')}`;
// Le résumé arrive en HTML (data/bills-resumes-fr.json) : on n'en garde que le texte.
const texteResume = (html) => {
  const t = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z]+|#\d+);/gi, ' ');
  return /r[ée]sum[ée] non disponible/i.test(t) ? '' : t;
};
export const loiContientMot = (b, resume, mot) => contientMot(`${b.title ?? ''} ${texteResume(resume)}`, mot);

// ---------- les étapes ----------
// L'ordre des étapes (libellés du CSV et des fiches du site : scrapers/bills.js et
// scrapers/bill-details.js). Seule une étape PLUS AVANCÉE vaut un courriel : un recul vient des
// données (bill-details en panne), une nouvelle date à la même étape n'est pas une étape, et
// « laissé de côté » non plus.
const RANGS = [
  [/sanction/i, 50],
  [/^adoption\b(?! du principe)/i, 45],
  [/prise en considération/i, 40],
  [/dépôt du rapport de commission\s*-\s*étude détaillée|étude détaillée entreprise/i, 33],
  [/étude détaillée/i, 30],
  [/adoption du principe/i, 20],
  [/dépôt du rapport de commission\s*-\s*consultation|déposé en commission pour consultations/i, 17],
  [/consultation/i, 15],
  [/présent/i, 10],
];
export const rangLoi = (b) => {
  const note = String(b.note ?? '');
  for (const [motif, rang] of RANGS) if (motif.test(note)) return rang;
  return (Number(b.step) || 0) * 10;
};
export const etatLoi = (b) => ({ statut: b.status ?? '', note: b.note ?? '', rang: rangLoi(b) });
const rangMemorise = (a) => Math.max(typeof a?.rang === 'number' ? a.rang : 0, rangLoi({ note: a?.note }));
export const loiARecule = (b, a) => Boolean(a) && (rangLoi(b) < rangMemorise(a) || (a.statut === 'sanctionne' && b.status !== 'sanctionne'));
export const loiABouge = (b, a) => Boolean(a) && (rangLoi(b) > rangMemorise(a) || (b.status === 'sanctionne' && a.statut !== 'sanctionne'));
export const cleLoi = (id) => `pl-${id}`;

// ---------- les personnes ----------
// « Nom » ou « Nom (Circonscription) » pour un ministre (homonymes), « Nom|Circonscription » pour
// un·e député·e (commun/dq.js, upsertFollow). Les parrains de projets de loi sont écrits « Nom ».
export const personneSuivie = (f) => {
  const cle = String(f.person_key ?? '').trim();
  const [avant, circoBarre] = cle.split('|');
  const circoParenthese = /\(([^)]+)\)\s*$/.exec(avant)?.[1];
  const nom = avant.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { nom, circo: (circoBarre ?? circoParenthese ?? '').trim(), titre: circoBarre ? `${nom} (${circoBarre.trim()})` : avant.trim() };
};
export const clePersonne = (cle) => `per_${crypto.createHash('sha1').update(normaliserTexte(cle)).digest('hex').slice(0, 20)}`;
export const cleVotes = (clePer) => `vot_${clePer.slice(4)}`;
// Le numéro de l'Assemblée d'une personne (deputesRaw : [nom, circonscription, région, parti, id]),
// ou null si on ne peut pas trancher (homonymes sans circonscription) : ses votes sont alors tus.
export function numeroAssemblee(p, deputes) {
  const n = normaliserTexte(p.nom).trim();
  let trouves = (deputes ?? []).filter((d) => normaliserTexte(d?.[0]).trim() === n);
  if (p.circo) trouves = trouves.filter((d) => normaliserTexte(d?.[1]).trim() === normaliserTexte(p.circo).trim());
  return trouves.length === 1 && Number.isFinite(Number(trouves[0][4])) ? Number(trouves[0][4]) : null;
}
// Un vote nominal se repère par législature, session, numéro : le registre est numéroté dans l'ordre.
const rangVote = (v) => [Number(v.legislature) || 0, Number(v.session) || 0, Number(v.num) || 0];
const apres = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
const CHOIX = [['pour', 'pour'], ['contre', 'contre'], ['abstentions', 'abstention']];
const choixDe = (v, id) => CHOIX.find(([champ]) => (v[champ] ?? []).some((x) => Number(x.assnatId) === id))?.[1] ?? null;

// ---------- les lignes du courriel ----------
const lienLoi = (b) => b.legislature && b.introSession
  ? `${site()}/projets-de-loi/${b.num}-${b.legislature}-${b.introSession}`
  : `${site()}/projets-de-loi?pl=${encodeURIComponent(b.num)}&id=${encodeURIComponent(b.id)}`;
const etapeFr = (b) => String(b.note ?? '').replace(/\d{4}-\d{2}-\d{2}/g, (d) => dateFr(d));
const ligneLoi = (b, precision) => `<li style="margin:0 0 12px">
    <a href="${echapper(lienLoi(b))}" style="font-family:Consolas,monospace;font-size:13px;font-weight:bold;color:#076338;text-decoration:none">PL ${echapper(b.num)}</a>
    <span style="font-size:13px;color:#5B6570"> · ${echapper(precision)}</span><br>
    <span style="font-size:15px">${echapper(b.title)}</span>
  </li>`;
const ligneVote = (v, choix) => `<li style="margin:0 0 12px">
    <a href="${echapper(v.url)}" style="font-size:13px;font-weight:bold;color:#076338;text-decoration:none">Vote ${echapper(`${v.legislature}-${v.session}-${v.num}`)}</a>
    <span style="font-size:13px;color:#5B6570"> · ${echapper([dateFr(v.date), v.stage].filter(Boolean).join(' · '))} · a voté <b>${echapper(choix)}</b></span><br>
    <span style="font-size:15px">${echapper(v.subject || v.title)}</span>
  </li>`;
// Les votes d'une personne sont nombreux (toute l'Assemblée vote) : au plus VOTES_MAX par courriel,
// le reste est dit en une phrase.
export const VOTES_MAX = 15;
const recentesD = (lois) => [...lois].sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));

// Tout ce qui concerne UN abonné. Pur : aucune lecture ni écriture, pour l'essayer sur des données
// simulées (scripts/test-alertes-assemblee.js).
//   lois           /data/site/bills.json
//   resumes        { id: html } de /data/bills-resumes-fr.json, ou null : les mots-clés sont alors
//                  sautés (ni signalés ni mémorisés)
//   votes          le tableau de /data/votes.json, ou null : les votes sont sautés
//   suivies        ids des projets de loi suivis, en texte
//   mots           [{ cle, cherche }]
//   personnes      [{ cle, nom, titre, roles, assnatId }] — roles : null si le nom est sans ambiguïté ;
//                  sinon les rôles ministériels de CETTE personne, [] si on ne peut pas trancher
//   rolesParrains  Map id → rôle du parrain (« Ministre des Finances »), de /data/bills.json
//   vusEnDirect    Set des ids dont l'étape a été relue ce matin (liveStage), ou null
//   dejaVu         (cle) => l'état déjà mémorisé, ou undefined
//   consultations  le contenu de api/consultations-data.json, ou null : rappels d'échéance sautés
//   aujourdhui     AAAA-MM-JJ (les essais hors ligne fixent la date)
//   organismes     [{ cle, titre, memoires }] — les organismes suivis et TOUS leurs mémoires
//                  (api/_organismes.js), ou [] : rien à dire
// Rend { sections: [{ titre, sousTitre, lignes, total, note? }], aMemoriser: [{ projet, etat }] }.
export function alertesAssemblee({ lois, resumes = null, votes = null, suivies = [], mots = [], personnes = [], rolesParrains = null, vusEnDirect = null, dejaVu, essai = false, consultations = null, organismes = [], aujourdhui = new Date().toISOString().slice(0, 10) }) {
  const sections = [];
  const aMemoriser = [];
  const parId = new Map(lois.map((b) => [String(b.id), b]));
  const deja = new Set(); // un projet de loi n'apparaît qu'une fois par courriel

  // 1. Les projets de loi suivis qui changent d'étape.
  const bouges = [];
  for (const id of suivies) {
    const b = parId.get(String(id));
    if (!b) continue; // plus dans les données (nouvelle législature) : rien à dire
    if (essai) { bouges.push(b); continue; }
    // Sans étape relue en direct ce matin (bill-details en panne), on ne mémorise ni ne signale
    // rien : un état mémorisé ce jour-là ferait paraître neuve, le lendemain, une étape déjà franchie.
    if (b.status !== 'laisse_de_cote' && (!vusEnDirect || !vusEnDirect.has(String(b.id)))) continue;
    const ancien = dejaVu(cleLoi(b.id));
    if (loiARecule(b, ancien)) continue; // on garde l'état le plus avancé, sans courriel
    aMemoriser.push({ projet: cleLoi(b.id), etat: etatLoi(b) });
    if (loiABouge(b, ancien)) bouges.push(b);
  }
  if (bouges.length) {
    for (const b of bouges) deja.add(b.id);
    sections.push({ titre: 'Projets de loi suivis', sousTitre: essai ? 'Où ils en sont' : 'Nouvelle étape', lignes: bouges.map((b) => ligneLoi(b, etapeFr(b) || 'étape non précisée')), total: bouges.length });
  }

  // 2. Les mots-clés, et 3. les projets présentés par une personne suivie.
  const memeNom = (b, nom) => b.sponsor && normaliserTexte(b.sponsor).trim() === normaliserTexte(nom).trim();
  const roleDe = (b) => normaliserTexte(rolesParrains?.get(String(b.id)) ?? '').trim();
  const cibles = [
    ...(resumes ? mots : []).map((m) => ({ cle: m.cle, titre: `Mot-clé « ${m.cherche} »`, sousTitre: 'Projets de loi qui le mentionnent', trouve: (b) => loiContientMot(b, resumes[b.id], m.cherche) })),
    ...personnes.map((p) => ({
      cle: p.cle,
      titre: p.titre ?? p.nom,
      sousTitre: 'Projets de loi présentés',
      // Un homonyme : il faut que le rôle du parrain soit un rôle de CETTE personne. Sans rôle pour
      // trancher, on ne dit rien et on ne mémorise rien.
      indisponible: Array.isArray(p.roles) && (!p.roles.length || !rolesParrains),
      trouve: (b) => memeNom(b, p.nom) && (!Array.isArray(p.roles) || p.roles.includes(roleDe(b))),
    })),
  ];
  for (const cible of cibles) {
    if (cible.indisponible) continue;
    const trouves = recentesD(lois.filter(cible.trouve));
    let aDire;
    if (essai) {
      aDire = trouves.slice(0, 3);
    } else {
      const ancien = dejaVu(cible.cle);
      // La liste des projets déjà vus ne fait que grandir : un matin où une donnée manque, de vieux
      // projets ne doivent pas repasser pour neufs le lendemain.
      aMemoriser.push({ projet: cible.cle, etat: { vus: [...new Set([...(ancien?.vus ?? []), ...trouves.map((b) => b.id)])] } });
      if (!ancien) continue; // ajouté depuis la dernière exécution : on part d'ici
      const vus = new Set(ancien.vus ?? []);
      aDire = trouves.filter((b) => !vus.has(b.id) && !deja.has(b.id));
    }
    for (const b of aDire) deja.add(b.id);
    if (aDire.length) sections.push({ titre: cible.titre, sousTitre: cible.sousTitre, lignes: aDire.map((b) => ligneLoi(b, etapeFr(b) || 'présenté')), total: aDire.length });
  }

  // 4. Les votes nominaux des personnes suivies. On retient le dernier vote du registre déjà
  //    regardé ([législature, session, numéro]) : tout vote plus récent où la personne a voté est neuf.
  if (Array.isArray(votes) && votes.length) {
    const dernier = votes.map(rangVote).reduce((a, b) => (apres(b, a) ? b : a));
    for (const p of personnes) {
      if (!Number.isFinite(p.assnatId)) continue; // homonymes sans circonscription : on se tait
      const cle = cleVotes(p.cle);
      const siens = votes.map((v) => ({ v, choix: choixDe(v, p.assnatId) })).filter((x) => x.choix);
      let aDire;
      if (essai) {
        aDire = siens.sort((a, b) => (apres(rangVote(a.v), rangVote(b.v)) ? -1 : 1)).slice(0, 3);
      } else {
        const ancien = dejaVu(cle);
        const avant = Array.isArray(ancien?.dernier) ? ancien.dernier : null;
        // Jamais en arrière : un fichier de votes incomplet ce matin ne fait pas reculer le repère.
        aMemoriser.push({ projet: cle, etat: { dernier: avant && apres(avant, dernier) ? avant : dernier } });
        if (!avant) continue;
        aDire = siens.filter((x) => apres(rangVote(x.v), avant)).sort((a, b) => (apres(rangVote(a.v), rangVote(b.v)) ? -1 : 1));
      }
      if (!aDire.length) continue;
      const montres = aDire.slice(0, VOTES_MAX);
      sections.push({
        titre: p.titre ?? p.nom,
        sousTitre: 'Votes nominaux',
        lignes: montres.map((x) => ligneVote(x.v, x.choix)),
        total: aDire.length,
        note: aDire.length > montres.length ? `…et ${aDire.length - montres.length} autres votes, dans l'onglet Votes du site.` : '',
      });
    }
  }
  // 5. Les rappels d'échéance des consultations (21 oct. 2026) : un projet suivi, ou qui contient un
  //    mot-clé, dont la date limite PUBLIÉE tombe dans les RAPPEL_JOURS jours. Un rappel par mandat et
  //    par date limite (si l'Assemblée repousse la date, on le redit).
  if (consultations) {
    const touches = new Set(suivies.map(String));
    if (resumes) for (const b of lois) if (mots.some((m) => loiContientMot(b, resumes[b.id], m.cherche))) touches.add(String(b.id));
    const aRappeler = rappelsEcheance(consultations, touches, aujourdhui).filter((c) => {
      if (essai) return true;
      const cle = cleEcheance(c.mandat);
      if (dejaVu(cle)?.dateLimite === c.dateLimite) return false;
      aMemoriser.push({ projet: cle, etat: { dateLimite: c.dateLimite } });
      return true;
    });
    if (aRappeler.length) sections.push({ titre: 'Échéances des consultations', sousTitre: `Date limite dans les ${RAPPEL_JOURS} jours`, lignes: aRappeler.map(ligneEcheance), total: aRappeler.length });
  }
  // 6. Les nouveaux mémoires des organismes suivis (21 oct. 2026). Comme les mots-clés : la liste des
  //    mémoires déjà vus ne fait que grandir ; un suivi tout neuf est mémorisé sans courriel.
  for (const o of organismes) {
    const ids = o.memoires.map(idMemoire);
    let aDire;
    if (essai) {
      aDire = o.memoires.slice(0, 3);
    } else {
      const ancien = dejaVu(o.cle);
      aMemoriser.push({ projet: o.cle, etat: { vus: [...new Set([...(ancien?.vus ?? []), ...ids])] } });
      if (!ancien) continue;
      const vus = new Set(ancien.vus ?? []);
      aDire = o.memoires.filter((m) => !vus.has(idMemoire(m)));
    }
    if (aDire.length) sections.push({ titre: o.titre, sousTitre: 'Nouveaux mémoires en commission', lignes: aDire.map(ligneMemoire), total: aDire.length });
  }
  return { sections, aMemoriser };
}
const ligneMemoire = (m) => `<li style="margin:0 0 12px">
    ${m.url ? `<a href="${echapper(m.url)}" style="color:#0B5CAD;font-weight:bold">${echapper(m.titre || m.depose)}</a>` : `<b>${echapper(m.titre || m.depose)}</b>`}
    <span style="font-size:13px;color:#5B6570"> · ${echapper([dateFr(m.date), m.commission].filter(Boolean).join(' · '))}</span><br>
    <span style="font-size:15px">PL ${echapper(m.num)} — ${echapper(m.titrePl)}</span>
  </li>`;
export const cleEcheance = (mandat) => `ech_${String(mandat).replace(/\D/g, '')}`;
const ligneEcheance = (c) => `<li style="margin:0 0 12px">
    <a href="${echapper(c.url)}" style="color:#0B5CAD;font-weight:bold">${echapper(c.titre)}</a><br>
    <span style="color:#5B6570">${echapper(c.commission)} · date limite : ${echapper(dateFr(c.dateLimite))}</span>
  </li>`;

// ---------- le courriel ----------
// Gmail coupe un message au-delà d'environ 102 Ko et cache alors le lien de désabonnement : à 80 Ko,
// les sections entrent en entier tant qu'il y a de la place ; les suivantes tiennent sur une ligne.
export const PLAFOND_OCTETS = 80 * 1024;
const octets = (s) => Buffer.byteLength(s, 'utf8');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function courriel(sections, userId, essai = false) {
  const total = sections.reduce((n, s) => n + s.total, 0);
  const titres = sections.map((s) => s.titre);
  const sujet = `${essai ? '[Essai] ' : ''}Vos alertes de l'Assemblée : ${pluriel(total, 'nouveauté')} — ${titres[0]}${titres.length > 1 ? ` et ${titres.length - 1} autre${titres.length > 2 ? 's' : ''}` : ''}`.replace(/[\r\n]+/g, ' ');
  const desabonnement = `${site()}/api/unsubscribe?u=${userId}&s=${signature(userId)}`;
  const monDossier = `${site()}/mon-dossier`;
  const debut = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#16191D;line-height:1.5">
    <p style="margin:0;font-size:13px;color:#5B6570">DossierQuébec · Alertes sur mesure</p>
    <h1 style="margin:4px 0 0;font-size:22px">Du nouveau à l'Assemblée nationale</h1>
    ${essai ? '<p style="margin:8px 0 0;padding:8px 10px;background:#FFF6D6;border-radius:6px;font-size:13px">Courriel d\'essai : il reprend les éléments les plus récents de chaque suivi, pas seulement les nouveautés.</p>' : ''}`;
  const fin = `<p style="margin:22px 0 0"><a href="${monDossier}" style="display:inline-block;padding:9px 16px;background:#0B8A4B;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Voir Mon dossier</a></p>
    <p style="margin:22px 0 0;font-size:12px;color:#5B6570">Les titres, les étapes et les votes viennent des données de l'Assemblée nationale (ses données ouvertes et son site), relues chaque matin. DossierQuébec est un site citoyen indépendant, sans lien avec l'Assemblée nationale.<br>
    Vous recevez ce courriel parce que vous suivez ces projets de loi, mots-clés, élus ou organismes avec votre abonnement. <a href="${echapper(desabonnement)}" style="color:#5B6570">Ne plus recevoir ces alertes</a></p>
  </div>`;
  const cadre = (s) => `<div style="margin:26px 0 0;padding:14px 16px;border:1px solid #DDE2E7;border-left:4px solid #0B8A4B;border-radius:8px">
    <h2 style="margin:0;font-size:18px">${echapper(s.titre)}</h2>
    <p style="margin:14px 0 6px;font-size:12px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;color:#5B6570">${echapper(s.sousTitre)} (${s.total})</p>
    <ul style="margin:0;padding-left:18px">${s.lignes.join('')}</ul>
    ${s.note ? `<p style="margin:8px 0 0;font-size:14px">${echapper(s.note)}</p>` : ''}
  </div>`;
  let budget = PLAFOND_OCTETS - octets(debut) - octets(fin) - 600 - sections.length * 250;
  const parties = [];
  const enUneLigne = [];
  for (const s of sections) {
    const html = cadre(s);
    if (!enUneLigne.length && octets(html) <= budget) { parties.push(html); budget -= octets(html); }
    else enUneLigne.push(s);
  }
  const autres = enUneLigne.length
    ? `<div style="margin:26px 0 0;padding:14px 16px;border:1px solid #DDE2E7;border-radius:8px">
        <p style="margin:0 0 6px;font-weight:bold">Aussi du nouveau</p>
        <ul style="margin:0;padding-left:18px">${enUneLigne.map((s) => `<li style="margin:0 0 4px">${echapper(s.titre)} : ${pluriel(s.total, 'nouveauté')}</li>`).join('')}</ul>
      </div>`
    : '';
  return { sujet, html: debut + parties.join('') + autres + fin, desabonnement, total, coupe: enUneLigne.length > 0 };
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

// « M'envoyer un courriel d'essai », depuis Mon dossier : seulement à soi-même, abonné·e, 3 par 24 h.
// Rend { uid, email } ou { statut, corps } (refus).
export async function essaiPourSoi(jeton) {
  const utilisateur = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jeton}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const uid = utilisateur?.id;
  if (!uid || !UUID.test(uid) || !utilisateur.email) return { statut: 401, corps: { erreur: 'connexion requise' } };
  const [abonnement] = (await supabase(`/rest/v1/abonnements?user_id=eq.${uid}&select=statut,fin`)) ?? [];
  if (!estActive(abonnement)) return { statut: 403, corps: { erreur: 'réservé aux abonnés' } };
  const depuis = new Date(Date.now() - 24 * 3600e3).toISOString();
  const essais = await supabase(`/rest/v1/alertes_envois?user_id=eq.${uid}&essai=eq.true&envoye_le=gte.${encodeURIComponent(depuis)}&select=id&limit=3`);
  if ((essais ?? []).length >= 3) return { statut: 429, corps: { erreur: 'limite de 3 essais par 24 heures' } };
  return { uid, email: utilisateur.email };
}

// Le passage complet.
//   apercu   true : ce qui partirait, sans rien envoyer ni mémoriser
//   essai    une adresse (en minuscules) : un courriel d'essai à cet·te abonné·e seulement, avec les
//            éléments les plus récents de chaque suivi, sans toucher à ce qui a déjà été vu
//   pourSoi  { uid, email } : l'essai demandé depuis Mon dossier
//   plafond  le nombre de courriels permis à ce passage (Resend gratuit : 100 par jour pour tout)
export async function envoyerAlertes({ apercu = false, essai = null, pourSoi = null, plafond = Infinity } = {}) {
  const rapport = { abonnes: 0, personnes: 0, envoyes: 0, memorises: 0, erreurs: [], ...(apercu ? { apercu: [] } : {}) };
  const maintenant = new Date();
  // Supabase coupe toute réponse à « Max rows » SANS le signaler : un état manquant se lirait « suivi
  // tout neuf » et la nouveauté du jour serait perdue. Chaque liste est lue page par page.
  const toutLire = async (chemin, ordre) => {
    const lignes = [];
    for (;;) {
      const page = await supabase(`${chemin}&order=${ordre}&limit=1000&offset=${lignes.length}`);
      if (!page?.length) return lignes;
      lignes.push(...page);
    }
  };
  const abonnes = pourSoi
    ? [pourSoi.uid]
    : (await toutLire('/rest/v1/abonnements?statut=eq.actif&select=user_id,statut,fin', 'user_id'))
        .filter(estActive).map((a) => a.user_id).filter((id) => UUID.test(id ?? ''));
  rapport.abonnes = abonnes.length;
  if (!abonnes.length) return { ...rapport, raison: 'aucun abonné actif' };

  const liste = abonnes.join(',');
  const [suivisLois, personnesSuivies, preferences, etats, mots, orgSuivis] = await Promise.all([
    toutLire(`/rest/v1/dossiers_suivis?select=user_id,dossier_id&user_id=in.(${liste})&ville=eq.${ASSEMBLEE}&dossier_id=like.pl:*`, 'user_id,dossier_id'),
    toutLire(`/rest/v1/follows?select=user_id,person_type,person_key&user_id=in.(${liste})&person_type=in.(minister,depute)`, 'user_id,person_type,person_key').catch((e) => {
      rapport.erreurs.push(`personnes suivies ignorées : ${e.message}`);
      return [];
    }),
    toutLire(`/rest/v1/alertes_preferences?select=user_id,actif&user_id=in.(${liste})`, 'user_id'),
    toutLire(`/rest/v1/alertes_etat?select=user_id,projet,etat&user_id=in.(${liste})&ville=eq.${ASSEMBLEE}`, 'user_id,projet'),
    toutLire(`/rest/v1/alertes_mots_cles?select=id,user_id,mot&user_id=in.(${liste})&portee=eq.${ASSEMBLEE}`, 'created_at,id').catch((e) => {
      rapport.erreurs.push(`mots-clés ignorés : ${e.message}`);
      return [];
    }),
    // Seulement la portée « assemblee » : les anciennes lignes (noms cherchés dans les décisions des
    // villes, avant le 27 sept. 2026) ne déclenchent rien.
    toutLire(`/rest/v1/organismes_suivis?select=user_id,nom&user_id=in.(${liste})&portee=eq.${ASSEMBLEE}`, 'user_id,nom').catch((e) => {
      rapport.erreurs.push(`organismes ignorés : ${e.message}`);
      return [];
    }),
  ]);
  const coupees = new Set(preferences.filter((p) => p.actif === false).map((p) => p.user_id));
  const dejaVu = new Map(etats.map((e) => [`${e.user_id}|${e.projet}`, e.etat]));

  const loisDe = new Map();
  for (const s of suivisLois) {
    const id = LOI.exec(s.dossier_id)?.[1];
    if (!id) continue;
    if (!loisDe.has(s.user_id)) loisDe.set(s.user_id, []);
    loisDe.get(s.user_id).push(id);
  }
  const motsDe = new Map();
  for (const m of mots) {
    if (!m.mot || !UUID.test(m.id ?? '')) continue;
    if (!motsDe.has(m.user_id)) motsDe.set(m.user_id, []);
    motsDe.get(m.user_id).push({ cle: cleMot(m.id), cherche: m.mot });
  }
  // Une personne par clé suivie ; la même suivie comme ministre ET comme député·e n'en garde qu'une.
  // Au plus PERSONNES_MAX par compte (l'Assemblée compte 125 sièges).
  const PERSONNES_MAX = 200;
  const personnesDe = new Map();
  for (const f of personnesSuivies) {
    const p = personneSuivie(f);
    if (p.nom.length < 3) continue;
    const cle = clePersonne(p.circo ? `${p.nom}|${p.circo}` : p.nom);
    if (!personnesDe.has(f.user_id)) personnesDe.set(f.user_id, []);
    const l = personnesDe.get(f.user_id);
    if (l.some((x) => x.cle === cle)) continue;
    if (l.length >= PERSONNES_MAX) { rapport.personnesIgnorees = (rapport.personnesIgnorees ?? 0) + 1; continue; }
    l.push({ ...p, cle });
  }

  // Les fichiers publics du site, lus une seule fois. Projets de loi illisibles : l'Assemblée est
  // sautée ce matin SANS rien mémoriser. Résumés illisibles : seuls les mots-clés sont sautés ;
  // votes illisibles : seuls les votes.
  const lireJson = (chemin) => fetch(`${site()}${chemin}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [lois, resumes, brut, ministres, deputes, fichierVotes] = await Promise.all([
    lireJson('/data/site/bills.json'),
    lireJson('/data/bills-resumes-fr.json'),
    lireJson('/data/bills.json'),
    lireJson('/data/site/ministers.json'),
    lireJson('/data/site/deputesRaw.json'),
    lireJson('/data/votes.json'),
  ]);
  if (!Array.isArray(lois) || !lois.length) {
    rapport.erreurs.push('projets de loi illisibles : alertes sautées ce matin');
    return rapport;
  }
  const resumesLisibles = resumes && typeof resumes === 'object' && !Array.isArray(resumes) && Object.keys(resumes).length ? resumes : null;
  if (!resumesLisibles) rapport.erreurs.push('résumés des projets de loi illisibles : mots-clés sautés ce matin');
  const votes = Array.isArray(fichierVotes?.votes) && fichierVotes.votes.length ? fichierVotes.votes : null;
  if (!votes) rapport.erreurs.push('votes illisibles ou vides : votes sautés ce matin');
  const rolesParrains = Array.isArray(brut?.bills)
    ? new Map(brut.bills.map((b) => [String(b.id), String(b.sponsor ?? '').split(' — ')[1] ?? '']))
    : null;
  const vusEnDirect = Array.isArray(brut?.bills)
    ? new Set(brut.bills.filter((b) => b.status !== 'laisse_de_cote' && b.liveStage).map((b) => String(b.id)))
    : null;
  const consultations = chargerConsultations();
  if (!consultations) rapport.erreurs.push('consultations illisibles : rappels d\'échéance sautés ce matin');
  // Les organismes suivis, d'après les mémoires (api/_organismes.js). Un organisme qui n'est plus dans
  // les données est sauté sans rien mémoriser. Données illisibles : sautés ce matin.
  const index = indexOrganismes(consultations);
  const organismesDe = new Map();
  for (const s of orgSuivis) {
    const o = index?.organismes.get(String(s.nom));
    if (!o) continue;
    if (!organismesDe.has(s.user_id)) organismesDe.set(s.user_id, []);
    const l = organismesDe.get(s.user_id);
    if (l.length < ORGANISMES_MAX) l.push({ cle: cleEtatOrganisme(o.cle), titre: o.nom, memoires: o.memoires });
  }
  const listeDeputes = Array.isArray(deputes) ? deputes : [];
  const listeMinistres = Array.isArray(ministres) ? ministres : [];
  const compte = new Map();
  for (const d of listeDeputes) {
    const n = normaliserTexte(d?.[0]).trim();
    compte.set(n, (compte.get(n) ?? 0) + 1);
  }
  for (const m of listeMinistres) {
    if (/\([^)]+\)\s*$/.test(m.name ?? '')) compte.set(normaliserTexte(m.name.replace(/\s*\([^)]*\)\s*$/, '')).trim(), 2);
  }
  const rolesDe = (p) => {
    const n = normaliserTexte(p.nom).trim();
    if ((compte.get(n) ?? 0) < 2) return null; // sans ambiguïté : le nom suffit
    const m = p.circo && listeMinistres.find((x) => normaliserTexte(x.name).trim() === normaliserTexte(`${p.nom} (${p.circo})`).trim());
    return m ? String(m.role ?? '').split('·').map((r) => normaliserTexte(r).trim()).filter(Boolean) : [];
  };

  for (const uid of new Set([...loisDe.keys(), ...personnesDe.keys(), ...motsDe.keys(), ...organismesDe.keys()])) {
    if (coupees.has(uid) && !essai) continue;
    if (!apercu && rapport.envoyes >= plafond) { rapport.reportes = (rapport.reportes ?? 0) + 1; continue; } // ce sera pour demain
    try {
      const utilisateur = await supabase(`/auth/v1/admin/users/${uid}`);
      const email = utilisateur?.email;
      if (!email) continue;
      if (essai && email.toLowerCase() !== essai) continue;
      rapport.personnes++;

      const a = alertesAssemblee({
        lois,
        resumes: resumesLisibles,
        votes,
        rolesParrains,
        vusEnDirect,
        suivies: loisDe.get(uid) ?? [],
        mots: motsDe.get(uid) ?? [],
        personnes: (personnesDe.get(uid) ?? []).map((p) => ({ ...p, roles: rolesDe(p), assnatId: numeroAssemblee(p, listeDeputes) })),
        dejaVu: (cle) => dejaVu.get(`${uid}|${cle}`),
        essai: Boolean(essai),
        consultations,
        organismes: organismesDe.get(uid) ?? [],
      });

      if (a.sections.length) {
        const message = courriel(a.sections, uid, Boolean(essai));
        if (apercu) {
          rapport.apercu.push({ a: masquer(email), sujet: message.sujet, sections: a.sections.map((s) => ({ titre: s.titre, quoi: s.sousTitre, nombre: s.total })) });
        } else {
          await envoyer(email, message);
          rapport.envoyes++;
          await supabase('/rest/v1/alertes_envois', {
            methode: 'POST',
            corps: { user_id: uid, projets: a.sections.length, changements: message.total, essai: Boolean(essai) },
            entetes: { Prefer: 'return=minimal' },
          }).catch((e) => rapport.erreurs.push(`journal ${uid.slice(0, 8)} : ${e.message}`));
        }
      }
      // Seulement après un envoi réussi (ou s'il n'y avait rien à envoyer) : sinon on redira demain.
      if (!apercu && !essai && a.aMemoriser.length) {
        await supabase('/rest/v1/alertes_etat?on_conflict=user_id,ville,projet', {
          methode: 'POST',
          corps: a.aMemoriser.map((m) => ({ user_id: uid, ville: ASSEMBLEE, ...m, mis_a_jour: maintenant.toISOString() })),
          entetes: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        });
        rapport.memorises += a.aMemoriser.length;
      }
    } catch (erreur) {
      console.error('alertes :', uid, erreur);
      rapport.erreurs.push(`${uid.slice(0, 8)} : ${erreur.message}`);
    }
  }
  return rapport;
}
