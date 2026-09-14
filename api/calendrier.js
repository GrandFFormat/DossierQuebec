// Le calendrier des décisions attendues, dans l'agenda de l'abonné (Google Agenda, Apple, Outlook).
//
//   GET /api/calendrier?lien=1          Authorization: Bearer <jeton de session> → { url }
//                                       le lien d'abonnement personnel de l'abonné (Mes dossiers)
//   GET /api/calendrier?u=…&s=…         le calendrier (text/calendar), relu par l'agenda chaque jour
//   GET /api/calendrier?u=…&s=…&tout=1  toutes les décisions attendues des villes couvertes, pas
//                                       seulement celles des projets suivis
//
// Un événement d'une journée par dossier en attente qui a une date cible, à cette date. La date
// cible est celle que la Ville écrit dans son sommaire : pas un ordre du jour, le dossier peut être
// reporté — chaque événement le dit. Source : /<ville>/data/attendues.json (projets-publics.js).
// Le lien est signé (CRON_SECRET, préfixe « calendrier: ») et l'abonnement est revérifié à chaque
// lecture : un abonnement terminé vide le calendrier.

import { supabase, signer, signatureValide, estAbonne, site } from './_alertes.js';

const VILLES = { quebec: 'Québec', montreal: 'Montréal' };

// Texte d'iCalendar (RFC 5545) : antislash, point-virgule, virgule et saut de ligne échappés ;
// lignes pliées à 75 octets.
const texteIcs = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function plier(ligne) {
  const morceaux = [];
  let courant = '';
  for (const c of ligne) {
    if (Buffer.byteLength(courant + c) > (morceaux.length ? 74 : 75)) {
      morceaux.push(courant);
      courant = '';
    }
    courant += c;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}
const jourIcs = (iso) => iso.slice(0, 10).replace(/-/g, '');
const lendemain = (iso) => new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);

export function calendrierIcs(evenements, { tout = false } = {}) {
  const maintenant = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DossierQuébec//Décisions attendues//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${texteIcs(tout ? 'Décisions attendues — toutes les villes' : 'Décisions attendues — mes projets')}`,
    `X-WR-CALDESC:${texteIcs("Dates cibles écrites par la Ville dans ses sommaires décisionnels. Un dossier peut être reporté. DossierQuébec n'est pas un site de la Ville.")}`,
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
  ];
  for (const { ville, d } of evenements) {
    const lien = `${site()}/${ville}/decisions.html?q=${encodeURIComponent(d.numero)}`;
    lignes.push(
      'BEGIN:VEVENT',
      `UID:${d.numero}-${ville}@dossierquebec.ca`,
      `DTSTAMP:${maintenant}`,
      `DTSTART;VALUE=DATE:${jourIcs(d.echeance)}`,
      `DTEND;VALUE=DATE:${jourIcs(lendemain(d.echeance))}`,
      `SUMMARY:${texteIcs(`Décision attendue${d.instance ? ` — ${d.instance}` : ''} (${d.numero})`)}`,
      `DESCRIPTION:${texteIcs(`${d.phrase}\n\nDate cible indiquée par la Ville de ${VILLES[ville] ?? ville} dans le sommaire ${d.numero} : ce n'est pas un ordre du jour, le dossier peut être reporté.\n${lien}`)}`,
      `URL:${lien}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }
  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) {
    if (!process.env[v]) return res.status(503).json({ erreur: `variable manquante : ${v}` });
  }

  try {
    // 1. Mes dossiers demande le lien personnel.
    if (req.query?.lien === '1') {
      const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const utilisateur = jeton
        ? await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jeton}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : null;
      const uid = utilisateur?.id;
      if (!uid || !/^[0-9a-f-]{36}$/.test(uid)) return res.status(401).json({ erreur: 'connexion requise' });
      if (!(await estAbonne(uid))) return res.status(403).json({ erreur: 'réservé aux abonnés' });
      const base = `${site()}/api/calendrier?u=${uid}&s=${signer('calendrier', uid)}`;
      return res.status(200).json({ url: base, urlTout: `${base}&tout=1` });
    }

    // 2. L'agenda lit le calendrier.
    const u = String(req.query?.u ?? '');
    const s = String(req.query?.s ?? '');
    if (!signatureValide(u, s, 'calendrier')) return res.status(400).send('Lien de calendrier invalide.');
    const tout = req.query?.tout === '1';
    const abonne = await estAbonne(u);

    let suivis = new Set();
    if (abonne && !tout) {
      const lignes = await supabase(`/rest/v1/dossiers_suivis?select=ville,dossier_id&user_id=eq.${u}&dossier_id=like.projet:*`);
      suivis = new Set(lignes.map((l) => `${l.ville}|${l.dossier_id.slice('projet:'.length)}`));
    }
    const evenements = [];
    if (abonne) {
      for (const ville of Object.keys(VILLES)) {
        const fichier = await fetch(`${site()}/${ville}/data/attendues.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        for (const d of fichier?.decisions ?? []) {
          if (!d.echeance || !/^\d{4}-\d{2}-\d{2}/.test(d.echeance)) continue;
          if (!tout && !d.projets?.some((cle) => suivis.has(`${ville}|${cle}`))) continue;
          evenements.push({ ville, d });
        }
      }
    }
    // Abonnement terminé : un calendrier vide, plutôt qu'une erreur que l'agenda réessaierait sans fin.
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="decisions-attendues.ics"');
    return res.status(200).send(calendrierIcs(evenements, { tout }));
  } catch (erreur) {
    console.error('calendrier :', erreur);
    return res.status(500).json({ erreur: erreur.message });
  }
}
