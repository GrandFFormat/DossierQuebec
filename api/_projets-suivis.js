// « Vos projets » dans les courriels d'une ville (14 nov. 2026). Suivre un projet de ville, c'est
// recevoir ses nouvelles : au moment d'envoyer un compte rendu (du mois ou après une séance), on
// ajoute à chaque inscrit·e qui a un compte un bloc avec ses projets suivis dans cette ville et ce
// qui y a bougé pendant la période du numéro. Le reste du courriel est le même pour tout le monde.
//
// Les projets sont les fichiers publics du volet (<ville>/data/projets/<cle>.json, écrits par
// scripts/projets-publics.js) : rien n'est lu en plus, rien n'est généré. Un numéro écrit avant ce
// jour n'a pas le repère <!--PROJETS--> : il part sans le bloc. Le « _ » : Vercel n'en fait pas une route.

import { supabase, site } from './_alertes.js';

const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourMois = (iso) => { const [, m, j] = String(iso).split('-').map(Number); return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]}`; };
const UUID = /^[0-9a-f-]{36}$/;
const CLE = /^[\w-]{1,60}$/;
const PAR_PROJET = 5;
const PROJETS_MAX = 10;

// Les fichiers des projets, lus une fois par envoi.
const cache = new Map();
function projet(ville, cle) {
  const k = `${ville}/${cle}`;
  if (!cache.has(k)) cache.set(k, fetch(`${site()}/${ville}/data/projets/${cle}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(k);
}

// La période d'un numéro : « 2026-10 » (le mois) ou « 2026-10-27 » (la séance de ce jour).
const periode = (mois) => (String(mois).length === 7 ? [`${mois}-01`, `${mois}-31`] : [mois, mois]);

// Pour chaque inscrit·e qui a un compte : le bloc HTML de ses projets suivis dans la ville du numéro,
// ou rien. Renvoie une Map user_id → html.
export async function blocsProjetsSuivis(numero, inscrits) {
  const ids = [...new Set((inscrits ?? []).map((i) => i.user_id).filter((x) => UUID.test(String(x ?? ''))))];
  if (!ids.length || !numero?.ville || !numero?.mois) return new Map();
  let lignes = [];
  try {
    lignes = (await supabase(`/rest/v1/dossiers_suivis?user_id=in.(${ids.join(',')})&ville=eq.${numero.ville}&dossier_id=like.projet:*&select=user_id,dossier_id&order=created_at`)) ?? [];
  } catch (e) {
    console.error('projets suivis :', e.message);
    return new Map();
  }
  const parCompte = new Map();
  for (const l of lignes) {
    const cle = String(l.dossier_id).slice(7);
    if (!CLE.test(cle)) continue;
    if (!parCompte.has(l.user_id)) parCompte.set(l.user_id, []);
    parCompte.get(l.user_id).push(cle);
  }
  const [de, a] = periode(numero.mois);
  const blocs = new Map();
  for (const [uid, cles] of parCompte) {
    const projets = [];
    for (const cle of cles.slice(0, PROJETS_MAX)) {
      const p = await projet(numero.ville, cle);
      if (!p?.titre) continue;
      const dansLaPeriode = (p.dossiers ?? []).filter((d) => { const j = d.derniere ?? d.date; return j && j >= de && j <= a; });
      projets.push({ cle, titre: p.titre, neufs: dansLaPeriode, derniere: p.chiffres?.derniere ?? null });
    }
    if (projets.length) blocs.set(uid, sectionProjets(numero, projets));
  }
  return blocs;
}

// Le bloc, dans la mise en page du courriel (styles en ligne, tableaux : ce que les logiciels de
// courriel affichent partout). Vert comme l'invitation « Suivre un projet », qu'il remplace de fait.
export function sectionProjets(numero, projets) {
  const POLICE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const ville = numero.ville;
  const seance = String(numero.mois).length > 7;
  const ficheProjet = (cle) => `${site()}/${ville}/decisions-de-la-ville-de-${ville}?projet=${encodeURIComponent(cle)}`;
  const phrase = (d) => d.puces?.[0] ?? d.objet ?? '';
  const court = (s, n = 190) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
  const bloc = (p) => {
    const lignes = p.neufs.slice(0, PAR_PROJET).map((d) => `<li style="margin:0 0 6px"><span style="color:#5B6470;font-size:13px">${echapper(jourMois(d.derniere ?? d.date))}</span> — ${echapper(court(phrase(d)))}${d.numero ? ` <a href="${site()}/${ville}/decisions-de-la-ville-de-${ville}?q=${encodeURIComponent(d.numero)}" style="color:#0B8A4B;font-weight:600;text-decoration:none;white-space:nowrap">${echapper(d.numero)}&nbsp;→</a>` : ''}</li>`).join('');
    const reste = p.neufs.length - PAR_PROJET;
    const rien = seance ? 'Rien à cette séance.' : 'Rien de nouveau ce mois-ci.';
    return `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #9FD9B6">
      <div style="font-size:16px;font-weight:800;color:#16191D">${echapper(p.titre)} <span style="font-weight:400;font-size:13px;color:#5B6470">· ${p.neufs.length ? `${p.neufs.length} ${p.neufs.length > 1 ? 'nouvelles décisions' : 'nouvelle décision'}` : rien}</span></div>
      ${lignes ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.5;color:#16191D">${lignes}</ul>` : ''}
      ${reste > 0 ? `<div style="margin-top:4px;font-size:13px;color:#5B6470">et ${reste} autre${reste > 1 ? 's' : ''}.</div>` : ''}
      <div style="margin-top:6px;font-size:13px"><a href="${ficheProjet(p.cle)}" style="color:#0B8A4B;font-weight:700;text-decoration:none">Voir le projet&nbsp;→</a></div>
    </div>`;
  };
  return `<tr><td style="padding:26px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E8F6EE;border:1px solid #9FD9B6;border-radius:10px;border-collapse:separate"><tr><td style="${POLICE};padding:16px 18px;font-size:15px;line-height:1.55;color:#16191D">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0B8A4B">📂 Vos projets suivis</div>
      <div style="margin-top:2px;font-size:13.5px;color:#5B6470">${seance ? 'Ce que cette séance a décidé dans les projets que vous suivez.' : 'Ce qui a bougé ce mois-ci dans les projets que vous suivez.'} <a href="${site()}/mon-dossier#villes" style="color:#0B8A4B;font-weight:700">Gérer mes projets</a></div>
      ${projets.map(bloc).join('')}
    </td></tr></table>
  </td></tr>`;
}
