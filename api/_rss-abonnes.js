// LES FLUX RSS DES ABONNÉ·E·S, troisième outil de l'abonnement (21 oct. 2026). Le « _ » : Vercel n'en
// fait pas une route. Servis par api/feed.js ; les adresses sont données par api/abonnement.js
// (GET ?action=flux), jamais fabriquées dans le navigateur.
//
// Un lecteur RSS ne peut pas se connecter à un compte : chaque abonné·e a UNE adresse personnelle,
//   /api/feed?u=<user_id>&s=<signature « rss: »>
// signée avec CRON_SECRET (signer('rss', …) de _alertes.js : un jeton des alertes ou du résumé ne vaut
// pas ici). Le paramètre « type » choisit le flux et n'est pas signé : il ne fait que filtrer, c'est
// l'identité qui ouvre l'accès. À chaque lecture, api/feed.js revérifie que l'abonnement est actif.
//
//   type=tout (défaut)          le flux général complet (api/feed-data.xml)
//   type=mots                   UN flux qui réunit tous ses mots-clés (alertes_mots_cles, portée
//                               « assemblee ») : une seule adresse à coller, qui suit l'ajout ou le
//                               retrait d'un mot dans Mon dossier sans changer d'adresse
//   type=elus                   projets de loi présentés par ses élus suivis (follows) et leurs votes
//   type=ministere&m=<rôle>     projets de loi parrainés par « Ministre des Finances », etc.
//
// Assemblée nationale seulement (aucune donnée municipale derrière le paiement). Données : les
// fichiers publics du site (/data/bills.json, /data/bills-resumes-fr.json, /data/votes.json,
// /data/site/deputesRaw.json). Au plus MAX_ELEMENTS éléments, les plus récents.

import { signer, site } from './_alertes.js';
import { contientMot, normaliserTexte, personneSuivie, numeroAssemblee } from './_alertes-assemblee.js';

export const MAX_ELEMENTS = 50;
export const USAGE = 'rss';
export const TYPES = ['tout', 'mots', 'elus', 'ministere'];
// Le jour où le flux général est passé derrière l'abonnement (Martin, 21 oct. 2026).
export const DATE_FERMETURE = '2026-10-21T12:00:00Z';

export const echapperXml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Les caractères de contrôle sont interdits en XML 1.0 : un titre mal copié ne doit pas casser le flux.
const propre = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const dateRss = (iso) => {
  const d = new Date(String(iso ?? '').length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
};

export const adresseFlux = (userId) => `${site()}/api/feed?u=${userId}&s=${signer(USAGE, userId)}`;

export function canal({ titre, description, elements }) {
  const items = elements.slice(0, MAX_ELEMENTS).map((e) => `    <item>
      <title>${echapperXml(propre(e.titre))}</title>
      <link>${echapperXml(e.lien)}</link>
      <guid isPermaLink="false">${echapperXml(e.guid)}</guid>
${e.date && dateRss(e.date) ? `      <pubDate>${dateRss(e.date)}</pubDate>\n` : ''}      <description>${echapperXml(propre(e.description))}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${echapperXml(titre)}</title>
    <link>${site()}/</link>
    <description>${echapperXml(description)}</description>
    <language>fr-CA</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// Un flux d'une seule entrée : les lecteurs RSS gèrent mal les erreurs HTTP, ils affichent une entrée.
export const avis = (guid, titre, texte, lien = `${site()}/abonnement`, date = new Date().toISOString()) =>
  canal({ titre: 'DossierQuébec', description: texte, elements: [{ titre, lien, guid, date, description: texte }] });

export const avisPublic = () => avis('flux-reserve-abonnes-2026-10-21',
  'Le flux RSS de DossierQuébec est maintenant réservé aux abonné·e·s',
  'Depuis le 21 octobre 2026, le flux de toutes les nouvelles de l’Assemblée nationale et les flux personnalisés (par mot-clé, par député·e, par ministère) font partie de l’abonnement facultatif. Le site lui-même reste gratuit. Les abonné·e·s trouvent leur adresse de flux personnelle dans Mon dossier.',
  `${site()}/abonnement`, DATE_FERMETURE);
export const avisInactif = (userId) => avis(`abonnement-inactif-${userId}`,
  'Votre abonnement n’est plus actif',
  'Ce flux RSS personnel fait partie de l’abonnement facultatif de DossierQuébec. Réabonnez-vous pour le recevoir de nouveau : la même adresse fonctionnera.');
export const avisInvalide = () => avis('adresse-flux-invalide',
  'Cette adresse de flux n’est pas valide',
  'L’adresse de ce flux RSS est incomplète ou erronée. Les abonné·e·s trouvent leur adresse personnelle dans Mon dossier.');

// ---------- les éléments ----------
// « Girard, Eric — Ministre des Finances » → { nom: « Eric Girard », role: « Ministre des Finances » }
export function parrain(b) {
  const [qui, role = ''] = String(b.sponsor ?? '').split(' — ');
  const [famille, prenom] = qui.split(',').map((x) => x.trim());
  return { nom: prenom ? `${prenom} ${famille}` : famille ?? '', role: role.trim() };
}
const estMinistere = (role) => /^ministre\b/i.test(role);
// Les ministères présents dans les données, pour la liste de Mon dossier.
export const ministeres = (bills) => [...new Set(bills.map((b) => parrain(b).role).filter(estMinistere))].sort((a, b) => a.localeCompare(b, 'fr'));

const lienLoi = (b) => b.legislature && b.introSession
  ? `${site()}/projets-de-loi/${b.num}-${b.legislature}-${b.introSession}`
  : `${site()}/projets-de-loi?pl=${encodeURIComponent(b.num)}`;
const SOURCE = 'Source : Assemblée nationale du Québec.';
const texteResume = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z]+|#\d+);/gi, ' ');
const elementLoi = (b, precision) => {
  const p = parrain(b);
  return {
    titre: `Projet de loi n° ${b.num} — ${b.title}`,
    lien: lienLoi(b),
    guid: `pl-${b.id}-${b.status ?? ''}-${b.lastActivity ?? ''}`,
    date: b.lastActivity || b.presentedOn,
    description: [precision, b.note, p.nom && `Présenté par ${p.nom}${p.role ? ` (${p.role})` : ''}.`, SOURCE].filter(Boolean).join(' · '),
  };
};
const recentes = (lois) => [...lois].sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));

// Pur : aucune lecture, pour l'essai hors ligne (scripts/test-rss-abonnes.js).
//   type       mots | elus | ministere
//   bills      le tableau de /data/bills.json
//   resumes    { id: html } de /data/bills-resumes-fr.json (ou null)
//   votes      le tableau de /data/votes.json (ou null)
//   deputes    /data/site/deputesRaw.json (ou [])
//   mots       ['logement', …]      follows  [{ person_type, person_key }]      ministere  « Ministre des Finances »
export function fluxAbonne({ type, bills, resumes = null, votes = null, deputes = [], mots = [], follows = [], ministere = '' }) {
  if (type === 'mots') {
    const elements = recentes(bills).flatMap((b) => {
      const texte = `${b.title ?? ''} ${texteResume(resumes?.[b.id])}`;
      const trouves = mots.filter((m) => contientMot(texte, m));
      return trouves.length ? [elementLoi(b, `Mot${trouves.length > 1 ? 's' : ''}-clé${trouves.length > 1 ? 's' : ''} : ${trouves.join(', ')}`)] : [];
    });
    return canal({
      titre: 'DossierQuébec — Vos mots-clés',
      description: mots.length ? `Projets de loi de l’Assemblée nationale qui contiennent : ${mots.join(', ')}.` : 'Aucun mot-clé pour l’instant : ajoutez-en dans Mon dossier.',
      elements,
    });
  }
  if (type === 'ministere') {
    const cible = normaliserTexte(ministere).trim();
    const elements = recentes(bills.filter((b) => cible && normaliserTexte(parrain(b).role).trim() === cible)).map((b) => elementLoi(b, ''));
    return canal({ titre: `DossierQuébec — ${ministere || 'Ministère'}`, description: `Projets de loi de l’Assemblée nationale parrainés par : ${ministere}.`, elements });
  }
  // type === 'elus'
  const personnes = [];
  for (const f of follows) {
    const p = personneSuivie(f);
    if (p.nom.length < 3 || personnes.some((x) => x.titre === p.titre)) continue;
    personnes.push({ ...p, assnatId: numeroAssemblee(p, deputes) });
  }
  const elements = [];
  for (const b of bills) {
    const p = personnes.find((x) => normaliserTexte(parrain(b).nom).trim() === normaliserTexte(x.nom).trim());
    if (p) elements.push(elementLoi(b, `Présenté par ${p.titre}`));
  }
  for (const v of votes ?? []) {
    for (const p of personnes) {
      if (!Number.isFinite(p.assnatId)) continue; // homonymes sans circonscription : on se tait
      const choix = [['pour', 'pour'], ['contre', 'contre'], ['abstentions', 'abstention']].find(([c]) => (v[c] ?? []).some((x) => Number(x.assnatId) === p.assnatId))?.[1];
      if (!choix) continue;
      elements.push({
        titre: `${p.titre} a voté ${choix} — ${v.subject || v.title}`,
        // La page du projet de loi sur le site si le vote en porte un (même numéro, même législature,
        // présenté au plus tard à la session du vote) ; sinon la page du vote à l'Assemblée.
        lien: (() => {
          const b = v.billNum != null && bills.filter((x) => String(x.num) === String(v.billNum) && Number(x.legislature) === Number(v.legislature) && Number(x.introSession) <= Number(v.session))
            .sort((x, y) => Number(y.introSession) - Number(x.introSession))[0];
          return b ? lienLoi(b) : v.url;
        })(),
        guid: `vote-${v.legislature}-${v.session}-${v.num}-${p.assnatId}`,
        date: v.date,
        description: [v.stage, `Vote nominal ${v.legislature}-${v.session}-${v.num}`, SOURCE, v.url].filter(Boolean).join(' · '),
      });
    }
  }
  elements.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return canal({
    titre: 'DossierQuébec — Vos élus suivis',
    description: personnes.length ? `Projets de loi présentés et votes nominaux de : ${personnes.map((p) => p.titre).join(', ')}.` : 'Aucun élu suivi pour l’instant : suivez-en depuis les pages des ministres et des député·e·s.',
    elements,
  });
}
