// LA SECTION « POUR LES ABONNÉ·E·S » de l'infolettre mensuelle sur l'Assemblée nationale (21 oct. 2026).
// Le « _ » : Vercel n'en fait pas une route. Aucune nouvelle fonction, aucune tâche planifiée.
//
// Trois blocs, calculés pour le mois couvert par le numéro, tous tirés des données officielles déjà
// dans le dépôt : les mémoires déposés en commission (api/consultations-data.json), les votes
// nominaux (data/votes.json), les fichiers CSV du mois (api/export.js?mois=AAAA-MM).
//
// DEUX VERSIONS, choisies au moment de l'envoi, destinataire par destinataire :
//   - abonné·e (abonnement actif à l'envoi) : la section complète ;
//   - les autres : les mêmes titres, un seul chiffre chacun, et le bouton vers /abonnement.
// Les deux versions sont calculées UNE fois, à la fabrication du numéro, et rangées dans son HTML
// entre des balises de commentaire (enrober). api/_infolettre.js (composer) garde l'une ou l'autre :
// l'envoi n'a besoin d'aucune donnée, seulement du statut d'abonnement. Un numéro sans ces balises
// (les comptes rendus des villes) part exactement comme avant.
//
// Un mois sans mémoire ni vote : pas de section du tout.

import { indexOrganismes, idMemoire } from './_organismes.js';

// Les mêmes qu'api/_infolettre.js, recopiés : ce module ne dépend ni de Supabase ni de Resend.
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nomMois = (aaaamm) => { const [a, m] = aaaamm.split('-').map(Number); return `${MOIS[m - 1]} ${a}`; };
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SITE = 'https://dossierquebec.ca';
const POLICE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ENCRE = '#16191D';
const GRIS = '#5B6470';
const OR = '#F5B301';

const ADOPTIONS = ['Adoption', 'Adoption du principe'];
const SANS_PARTI = new Set(['IND', '', null, undefined]);   // les indépendants ne forment pas un parti
const court = (s, n = 110) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const nombre = (n) => n.toLocaleString('fr-CA');
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
// « Loi visant à … » : le titre sans « Loi », pour tenir sur une ligne.
const titreCourt = (t) => court(t, 90);
const dateLongue = (iso) => { const [a, m, j] = String(iso).split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; };

// ---------------------------------------------------------------- les chiffres

export function calculerSection(mois, { consultations, votes }) {
  if (!/^\d{4}-\d{2}$/.test(String(mois))) throw new Error(`mois invalide : ${mois}`);
  const dans = (d) => String(d ?? '').startsWith(mois);

  // 1. Les mémoires du mois.
  const parProjet = new Map();
  const listeDe = new Map();   // id de mémoire → adresse de la liste des mémoires de son mandat
  let totalMemoires = 0;
  for (const [id, p] of Object.entries(consultations?.projets ?? {})) {
    for (const m of p.mandats ?? []) {
      for (const x of m.memoires ?? []) {
        if (!dans(x.date)) continue;
        totalMemoires++;
        listeDe.set(idMemoire(x), m.urlMemoires || m.url || null);
        if (!parProjet.has(id)) parProjet.set(id, { id, num: p.num, legislature: p.legislature, session: p.session, titre: p.titre, n: 0, commissions: new Map(), url: null });
        const q = parProjet.get(id);
        q.n++;
        q.commissions.set(m.commission, (q.commissions.get(m.commission) ?? 0) + 1);
        q.url ??= m.urlMemoires || m.url || null;
      }
    }
  }
  const projets = [...parProjet.values()]
    .map((q) => ({ ...q, commission: [...q.commissions].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '', commissions: undefined }))
    .sort((a, b) => b.n - a.n || Number(a.num) - Number(b.num))
    .slice(0, 4);

  // La règle de regroupement d'api/_organismes.js, sur toutes les données (un mémoire commun compte
  // pour un organisme qui a déjà déposé seul, même avant ce mois-ci), puis seulement les mémoires du mois.
  const index = indexOrganismes(consultations);
  const organismes = [...(index?.organismes.values() ?? [])]
    .map((o) => {
      const duMois = o.memoires.filter((x) => dans(x.date));
      return { nom: o.nom, n: duMois.length, url: duMois.length ? listeDe.get(idMemoire(duMois[0])) ?? duMois[0].url ?? null : null };
    })
    .filter((o) => o.n > 0)
    .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, 6);

  // 2. Les votes du mois.
  const duMois = (votes?.votes ?? []).filter((v) => dans(v.date)).sort((a, b) => a.date.localeCompare(b.date) || a.num - b.num);
  const tot = (v) => ({ pour: v.totals?.pour ?? (v.pour ?? []).length, contre: v.totals?.contre ?? (v.contre ?? []).length, abstentions: v.totals?.abstentions ?? (v.abstentions ?? []).length });
  const parParti = (v) => {
    const t = {};
    for (const [choix, liste] of [['pour', v.pour], ['contre', v.contre], ['abstentions', v.abstentions]]) {
      for (const d of liste ?? []) {
        const p = d.party || 'IND';
        t[p] ??= { pour: 0, contre: 0, abstentions: 0 };
        t[p][choix]++;
      }
    }
    return Object.entries(t).sort((a, b) => (b[1].pour + b[1].contre + b[1].abstentions) - (a[1].pour + a[1].contre + a[1].abstentions));
  };
  const fiche = (v) => ({ num: v.num, date: v.date, stage: v.stage, billNum: v.billNum ?? null, sujet: String(v.subject || v.title || '').replace(/^Projet de loi n° ?\d+,\s*/, ''), url: v.url, ...tot(v) });

  // L'adoption à retenir : une adoption ou une adoption du principe ; la plus contestée (le plus de
  // « contre »), puis l'adoption finale avant le principe, puis la plus récente.
  const adoption = duMois
    .filter((v) => ADOPTIONS.includes(v.stage))
    .sort((a, b) => tot(b).contre - tot(a).contre || ADOPTIONS.indexOf(a.stage) - ADOPTIONS.indexOf(b.stage) || b.date.localeCompare(a.date))[0] ?? null;

  // Les moins larges : plus petit écart pour/contre, seulement s'il y a eu des « contre ».
  const moinsLarges = duMois
    .filter((v) => tot(v).contre > 0)
    .sort((a, b) => Math.abs(tot(a).pour - tot(a).contre) - Math.abs(tot(b).pour - tot(b).contre) || a.date.localeCompare(b.date))
    .slice(0, 3)
    .map(fiche);

  // Les votes où des député·e·s d'un même parti ont voté différemment (indépendants exclus).
  const divises = [];
  for (const v of duMois) {
    const partis = parParti(v).filter(([p, t]) => !SANS_PARTI.has(p) && [t.pour, t.contre, t.abstentions].filter(Boolean).length > 1);
    if (partis.length) divises.push({ ...fiche(v), partis: partis.map(([parti, t]) => ({ parti, ...t })) });
  }

  const lignesDeputes = duMois.reduce((s, v) => s + (v.pour ?? []).length + (v.contre ?? []).length + (v.abstentions ?? []).length, 0);

  return {
    mois,
    vide: totalMemoires === 0 && duMois.length === 0,
    memoires: { total: totalMemoires, projets, organismes },
    votes: {
      total: duMois.length,
      adoption: adoption ? { ...fiche(adoption), partis: parParti(adoption).map(([parti, t]) => ({ parti, ...t })) } : null,
      moinsLarges,
      divises,
    },
    fichiers: { votes: duMois.length, lignesDeputes },
  };
}

// ---------------------------------------------------------------- le courriel

const lien = (url, texte) => (url ? `<a href="${e(url)}" style="color:#0B5CAD;text-decoration:underline">${texte}</a>` : texte);
const pl = (num) => `projet de loi n° ${e(num)}`;
const nomVote = (v) => {
  const quoi = v.billNum ? `${e(v.stage)} — ${pl(v.billNum)}` : e(v.stage);
  return `${quoi}<br><span style="color:${GRIS};font-size:13px">${e(court(v.sujet, 120))} · ${e(dateLongue(v.date))}</span>`;
};
const decompte = (v) => `${nombre(v.pour)} pour, ${nombre(v.contre)} contre${v.abstentions ? `, ${nombre(v.abstentions)} abst.` : ''}`;
const repartition = (t) => [t.pour && `${t.pour} pour`, t.contre && `${t.contre} contre`, t.abstentions && `${t.abstentions} abst.`].filter(Boolean).join(', ');

const titreBloc = (t) => `<tr><td style="padding:22px 0 8px;${POLICE};font-size:17px;font-weight:700;color:${ENCRE}">${t}</td></tr>`;
const phrase = (t) => `<tr><td style="padding:0 0 8px;${POLICE};font-size:15px;line-height:1.55;color:${ENCRE}">${t}</td></tr>`;
const sousTitre = (t) => `<tr><td style="padding:10px 0 4px;${POLICE};font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:${GRIS}">${t}</td></tr>`;
// Un tableau à deux colonnes : libellé, nombre.
const tableau = (lignes) => `<tr><td style="padding:0 0 6px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">${lignes
  .map(([libelle, n]) => `<tr><td style="padding:8px 10px 8px 0;border-top:1px solid #E3E7EB;${POLICE};font-size:14px;line-height:1.45;color:${ENCRE};vertical-align:top">${libelle}</td><td style="padding:8px 0;border-top:1px solid #E3E7EB;${POLICE};font-size:14px;font-weight:700;color:${ENCRE};text-align:right;vertical-align:top;white-space:nowrap">${n}</td></tr>`)
  .join('')}</table></td></tr>`;

function entete(mois) {
  return `<tr><td style="padding:26px 0 0;border-top:3px solid ${OR}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="${POLICE};font-size:21px;font-weight:800;color:${ENCRE};padding:0 10px 0 0">Pour les abonné·e·s</td>
    <td style="${POLICE};font-size:12px;font-weight:700;color:${ENCRE};background:${OR};border-radius:999px;padding:3px 10px;white-space:nowrap">Abonné·e</td>
  </tr></table></td></tr>
  ${phrase(`<span style="color:${GRIS}">Ce que ${e(nomMois(mois))} a apporté à l'Assemblée nationale, en chiffres et en liens. Source : Assemblée nationale du Québec.</span>`)}`;
}
// Un tableau autonome (pas une rangée) : il se glisse aussi bien dans une cellule que dans un div.
const enveloppe = (contenu) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:660px;margin:8px 0 18px;text-align:left">${contenu}</table>`;

const lienExport = (mois) => `${SITE}/mon-dossier?mois=${mois}#mdExport`;

// La section complète (abonné·e). Une chaîne vide si le mois n'a rien.
export function sectionComplete(s) {
  if (s.vide) return '';
  const m = s.memoires;
  const v = s.votes;
  const blocs = [entete(s.mois)];

  if (m.total) {
    blocs.push(titreBloc('Les mémoires du mois'));
    blocs.push(phrase(`<strong>${pluriel(m.total, 'mémoire déposé', 'mémoires déposés')}</strong> en commission.`));
    if (m.projets.length) {
      blocs.push(sousTitre('Les projets de loi qui en ont reçu le plus'));
      blocs.push(tableau(m.projets.map((p) => [`${lien(p.url, `Projet de loi n° ${e(p.num)}`)} — ${e(titreCourt(p.titre))}<br><span style="color:${GRIS};font-size:13px">${e(p.commission)}</span>`, nombre(p.n)])));
    }
    if (m.organismes.length) {
      blocs.push(sousTitre('Les organismes les plus actifs'));
      blocs.push(tableau(m.organismes.map((o) => [lien(o.url, e(o.nom)), nombre(o.n)])));
      blocs.push(phrase(`<span style="font-size:13px;color:${GRIS}">Les personnes qui déposent en leur nom ne sont pas comptées ici. Chaque nom mène à la liste des mémoires chez l'Assemblée ; suivez un organisme dans ${lien(`${SITE}/mon-dossier`, 'Mon dossier')}.</span>`));
    }
  }

  if (v.total) {
    blocs.push(titreBloc('Les votes à surveiller'));
    blocs.push(phrase(`<strong>${pluriel(v.total, 'vote nominal', 'votes nominaux')}</strong> ce mois-ci.`));
    if (v.adoption) {
      const a = v.adoption;
      blocs.push(sousTitre(a.stage === 'Adoption' ? 'L’adoption à retenir' : 'L’adoption du principe à retenir'));
      blocs.push(phrase(`${lien(a.url, a.billNum ? `${e(a.stage)} du ${pl(a.billNum)}` : e(a.stage))} — ${e(court(a.sujet, 140))}, le ${e(dateLongue(a.date))} : <strong>${decompte(a)}</strong>.`));
      blocs.push(tableau(a.partis.map((p) => [e(p.parti), repartition(p)])));
    }
    if (v.moinsLarges.length) {
      blocs.push(sousTitre('Les votes les moins larges'));
      blocs.push(tableau(v.moinsLarges.map((x) => [lien(x.url, nomVote(x)), `${nombre(x.pour)} – ${nombre(x.contre)}`])));
    }
    blocs.push(sousTitre('Un parti, plusieurs votes'));
    if (v.divises.length) {
      blocs.push(tableau(v.divises.map((x) => [lien(x.url, nomVote(x)), x.partis.map((p) => `${e(p.parti)} : ${repartition(p)}`).join('<br>')])));
    } else {
      blocs.push(phrase('Aucun député n’a voté autrement que son parti ce mois-ci.'));
    }
  }

  if (s.fichiers.votes) {
    blocs.push(titreBloc('Les fichiers du mois'));
    blocs.push(phrase(`Les données ${e(dePhrase(s.mois))} en CSV, prêtes pour Excel ou Google Sheets. Connectez-vous : les boutons de ${lien(lienExport(s.mois), 'Mon dossier')} téléchargent ce mois-ci seulement.`));
    blocs.push(tableau([
      [lien(lienExport(s.mois), 'Votes nominaux'), pluriel(s.fichiers.votes, 'ligne', 'lignes')],
      [lien(lienExport(s.mois), 'Qui a voté quoi'), pluriel(s.fichiers.lignesDeputes, 'ligne', 'lignes')],
      [lien(lienExport(s.mois), 'Présences aux votes'), 'par député·e'],
    ]));
  }
  return enveloppe(blocs.join('\n'));
}

// La version courte (non abonné·e) : les mêmes titres, un chiffre chacun, le bouton.
export function sectionApercu(s) {
  if (s.vide) return '';
  const m = s.memoires;
  const v = s.votes;
  const blocs = [entete(s.mois)];
  if (m.total) {
    blocs.push(titreBloc('Les mémoires du mois'));
    const p = m.projets[0];
    blocs.push(phrase(`${pluriel(m.total, 'mémoire déposé', 'mémoires déposés')} en commission${p && m.projets.length > 1 ? `, dont ${nombre(p.n)} sur le ${pl(p.num)}` : ''}.`));
  }
  if (v.total) {
    blocs.push(titreBloc('Les votes à surveiller'));
    const a = v.adoption;
    const quoi = a ? (a.billNum ? `${a.stage === 'Adoption' ? 'l’adoption' : 'l’adoption du principe'} du ${pl(a.billNum)}` : null) : null;
    blocs.push(phrase(`${pluriel(v.total, 'vote nominal', 'votes nominaux')}${quoi ? `, dont ${quoi}` : ''}.`));
  }
  if (s.fichiers.votes) {
    blocs.push(titreBloc('Les fichiers du mois'));
    blocs.push(phrase(`${pluriel(s.fichiers.lignesDeputes, 'ligne', 'lignes')} « qui a voté quoi » en CSV.`));
  }
  blocs.push(`<tr><td style="padding:18px 0 4px"><a href="${SITE}/abonnement" style="display:inline-block;${POLICE};font-size:15px;font-weight:700;color:${ENCRE};background:${OR};border-radius:8px;padding:11px 18px;text-decoration:none">Voir l’abonnement — dès 9,99 $ par mois</a></td></tr>`);
  return enveloppe(blocs.join('\n'));
}

// « de février 2026 », « d'avril 2026 »
const dePhrase = (mois) => { const n = nomMois(mois); return `${/^[aeiou]/.test(n) ? "d'" : 'de '}${n}`; };

// ---------------------------------------------------------------- les balises

export const DEBUT_COMPLET = '<!--ABONNES:COMPLET-->';
export const FIN_COMPLET = '<!--/ABONNES:COMPLET-->';
export const DEBUT_APERCU = '<!--ABONNES:APERCU-->';
export const FIN_APERCU = '<!--/ABONNES:APERCU-->';

// Les deux versions, à glisser dans le HTML du numéro (à la place de <!--ABONNES--> s'il y est :
// scripts/section-abonnes.js). Vide si le mois n'a rien.
export function enrober(s) {
  const complet = sectionComplete(s);
  if (!complet) return '';
  return `${DEBUT_COMPLET}${complet}${FIN_COMPLET}${DEBUT_APERCU}${sectionApercu(s)}${FIN_APERCU}`;
}
export const aUneSection = (html) => String(html ?? '').includes(DEBUT_COMPLET);

// Garde la version du destinataire et retire l'autre.
export function choisirVersion(html, abonne) {
  const [garder, jeter] = abonne ? [[DEBUT_COMPLET, FIN_COMPLET], [DEBUT_APERCU, FIN_APERCU]] : [[DEBUT_APERCU, FIN_APERCU], [DEBUT_COMPLET, FIN_COMPLET]];
  const retirer = (h, [d, f]) => { const i = h.indexOf(d); const j = h.indexOf(f); return i < 0 || j < i ? h : h.slice(0, i) + h.slice(j + f.length); };
  return retirer(String(html), jeter).replace(garder[0], '').replace(garder[1], '');
}
