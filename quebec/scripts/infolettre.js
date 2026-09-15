// Brouillon du compte rendu mensuel — l'infolettre municipale.
//
//   npm run infolettre                           le mois précédent (complet)
//   npm run infolettre -- --mois=2026-08
//   npm run infolettre -- --depuis=2026-08-16 --jusqua=2026-09-14
//   npm run infolettre -- --mois=2026-08 --details   fait d'abord lire le détail des plus gros montants (API)
//
// Tout vient des données déjà extraites : aucun appel à la Ville, aucun appel IA. Écrit
// infolettres/AAAA-MM.html (le courriel, en couleur, styles en ligne) et AAAA-MM.md (la version
// texte). Les brouillons ne sont pas versionnés : ils se relisent, puis partent.
//
// Le mot du mois, facultatif : un fichier infolettres/AAAA-MM-mot.md écrit à la main (paragraphes
// séparés par une ligne vide) s'ajoute sous le titre.
//
// Le contenu : le mois en chiffres, les plus gros montants (avec les puces du résumé), toutes les
// subventions et tous les contrats avec un montant, les votes divisés, les sujets. Le détail de
// l'argent (soumissions, estimation de la Ville, répartition par année) reste aux abonnés : il
// sert seulement ici à reconnaître la nature d'un montant — une valeur au rôle ou une fermeture
// d'emprunt n'a rien à faire parmi les plus gros montants.
//
// Une même décision traverse plusieurs documents — le sommaire, la résolution du comité
// exécutif, celle du conseil. On regroupe tout par sommaire pour ne la compter qu'une fois,
// et on dit quelles instances l'ont vue passer.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chargerDetails, extraireDetails, TYPES_MONTANT, VERSION_VERIFICATION } from '../scrapers/details-argent.js';

const DATA = new URL('../data/', import.meta.url);
const SORTIE = new URL('../infolettres/', import.meta.url);
const SITE = 'https://dossierquebec.ca/quebec/';
const RACINE = 'https://dossierquebec.ca';

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]} ${a}`;
};
const jourMois = (iso) => {
  const [, m, j] = iso.split('-').map(Number);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]}`;
};
const nombreFr = (n) => Number(n).toLocaleString('fr-CA');
const argent = (n) =>
  n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString('fr-CA')} M$` : `${nombreFr(Math.round(n))} $`;
const pluriel = (n, un, plusieurs) => `${nombreFr(n)} ${n > 1 ? plusieurs : un}`;

// « 1 000 000 $ », « 6782,20 $ », « 3,4 M$ » — tel qu'écrit dans le résumé, qui le recopie
// du document. Espaces insécables comprises.
function lireMontant(s) {
  if (!s) return null;
  const m = String(s).replace(/\s/g, ' ').match(/([0-9][0-9 ]*(?:[,.][0-9]+)?)\s*(M\$|millions?|G\$|milliards?)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/ /g, '').replace(',', '.'));
  const u = (m[2] ?? '').toLowerCase();
  if (u.startsWith('milliard') || u.startsWith('g')) n *= 1e9;
  else if (u.startsWith('m')) n *= 1e6;
  return Number.isFinite(n) ? n : null;
}

const INSTANCE_COURTE = (i) =>
  (i ?? '')
    .replace("Conseil de l'Arrondissement de ", 'Arr. ')
    .replace("Conseil de l'Arrondissement des ", 'Arr. des ')
    .replace("Conseil d'agglomération de Québec", 'Agglomération')
    .replace("Commission d'urbanisme et de conservation de Québec", "Commission d'urbanisme")
    .trim();

async function lire(nom) {
  return JSON.parse(await readFile(new URL(nom + '.json', DATA), 'utf8'));
}

// La période : le mois demandé, sinon le mois précédent au complet.
function periode(args) {
  if (args.depuis || args.jusqua) {
    const jusqua = args.jusqua ?? new Date().toISOString().slice(0, 10);
    const depuis = args.depuis ?? new Date(new Date(jusqua + 'T00:00:00Z').getTime() - 29 * 864e5).toISOString().slice(0, 10);
    return { depuis, jusqua, nom: `du ${dateFr(depuis)} au ${dateFr(jusqua)}`, fichier: jusqua };
  }
  let a, m;
  if (/^\d{4}-\d{2}$/.test(args.mois ?? '')) [a, m] = args.mois.split('-').map(Number);
  else {
    const auj = new Date();
    a = auj.getUTCMonth() === 0 ? auj.getUTCFullYear() - 1 : auj.getUTCFullYear();
    m = auj.getUTCMonth() === 0 ? 12 : auj.getUTCMonth();
  }
  const mm = String(m).padStart(2, '0');
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { depuis: `${a}-${mm}-01`, jusqua: `${a}-${mm}-${dernier}`, nom: `en ${MOIS_LONGS[m - 1]} ${a}`, fichier: `${a}-${mm}` };
}

async function main() {
  const args = parseArgs(process.argv);
  const { depuis, jusqua, nom: nomPeriode, fichier } = periode(args);

  const [decisions, resumes, votes, attendues] = await Promise.all([lire('decisions'), lire('resumes'), lire('votes'), lire('attendues').catch(() => ({ decisions: [] }))]);
  const THEMES = decisions.themes;
  const resumeParId = new Map(resumes.resumes.map((r) => [r.id, r]));
  const dansFenetre = (d) => d.date >= depuis && d.date <= jusqua;
  const court = (s, n = 150) => ((s ?? '').length > n ? (s ?? '').slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s ?? '');

  // Les documents du mois. Les procès-verbaux et tableaux des décisions signalent une séance
  // mais ne sont pas des décisions : on s'en sert pour les séances, pas pour les dossiers.
  const tous = decisions.decisions.filter(dansFenetre);
  const docs = tous.filter((d) => d.type !== 'Procès-verbaux' && d.type !== 'Tableaux des décisions');

  // Les séances, par instance : les dates de chacune ; les arrondissements ensemble.
  const datesParInstance = new Map();
  for (const d of tous) {
    if (!d.instance) continue;
    // (Le portail écrit parfois l'instance avec une espace devant.)
    const i = /^\s*Conseil de l'Arrondissement/i.test(d.instance) ? "Conseils d'arrondissement" : INSTANCE_COURTE(d.instance);
    if (!datesParInstance.has(i)) datesParInstance.set(i, new Set());
    datesParInstance.get(i).add(`${d.instance}|${d.date}`);
  }
  const nbSeances = [...datesParInstance.values()].reduce((n, s) => n + s.size, 0);
  const ORDRE = ['Conseil de la ville', 'Agglomération', 'Comité exécutif', "Conseils d'arrondissement"];
  const seances = [...datesParInstance.entries()]
    .sort((a, b) => (ORDRE.indexOf(a[0]) + 1 || 99) - (ORDRE.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]))
    .map(([i, s]) => {
      const dates = [...new Set([...s].map((x) => x.split('|')[1]))].sort();
      return i === "Conseils d'arrondissement" ? `${i} (${pluriel(s.size, 'séance', 'séances')})` : `${i} (${dates.map(jourMois).join(', ')})`;
    });

  // Regroupement par dossier (le sommaire, ou le document lui-même s'il n'en a pas).
  const dossiers = new Map();
  for (const d of docs) {
    const cle = d.type === 'Sommaires et mémoires' ? d.id : d.sommaireId ?? d.id;
    if (!dossiers.has(cle)) dossiers.set(cle, { cle, objet: d.objet, theme: d.theme, instances: new Set(), dates: [], pdf: d.pdf, numero: d.numero });
    const f = dossiers.get(cle);
    if (d.type === 'Sommaires et mémoires') Object.assign(f, { objet: d.objet, theme: d.theme, pdf: d.pdf, numero: d.numero });
    if (d.instance) f.instances.add(INSTANCE_COURTE(d.instance));
    f.dates.push(d.date);
    const r = resumeParId.get(cle);
    if (r) f.resume = r;
  }
  const liste = [...dossiers.values()].map((f) => ({ ...f, montant: lireMontant(f.resume?.montantPrincipal) }));

  // Les montants : on écarte les dépôts de rapports et de listes, qui parlent d'argent sans rien décider.
  const decidant = (f) => f.theme !== 'procedure' && !/prise d'acte|d[ée]p[ôo]t (?:de la|des|du)/i.test(f.objet ?? '');
  const parMontant = (a, b) => (b.montant ?? 0) - (a.montant ?? 0);

  // --details : fait lire le détail de l'argent des plus gros montants qui ne l'ont pas encore
  // (≈ 0,28 $ US chacun, mis en cache et publié pour les abonnés comme celui du matin). Sans
  // l'option, on prend ce qui est déjà lu.
  if (args.details) {
    if (!process.env.ANTHROPIC_API_KEY) {
      const racine = fileURLToPath(new URL('../', import.meta.url));
      const cle = [racine + 'api.env', racine + '../api.env'].find((f) => existsSync(f));
      if (cle) process.loadEnvFile(cle);
    }
    // Les plus gros montants, puis toutes les subventions et tous les contrats du mois : l'édition
    // abonnés résume leur détail sous chaque ligne.
    const lisible = (f) => f.montant > 0 && decidant(f) && f.cle.endsWith('.pdf') && f.resume;
    const candidats = [...new Set([
      ...liste.filter(lisible).sort(parMontant).slice(0, 8),
      ...liste.filter((f) => lisible(f) && ['subventions', 'contrats'].includes(f.theme)),
    ])];
    await extraireDetails(candidats.map((f) => f.cle.replace(/\.pdf$/, '')));
  }

  // Le détail de l'argent vérifié : sa nature partout, et son contenu dans l'édition abonnés.
  const natureParId = new Map(
    (await chargerDetails()).details
      .filter((d) => d.verification?.version === VERSION_VERIFICATION && d.verification.utilisable)
      .map((d) => [d.id, d])
  );
  const PAS_UNE_DEPENSE = new Set(['valeur_au_role', 'fermeture_emprunt', 'aucun']);
  for (const f of liste) {
    const d = natureParId.get(f.cle);
    if (!d) continue;
    f.typeMontant = d.typeMontant;
    f.montant = lireMontant(d.verification.montantResume) ?? f.montant ?? lireMontant(d.montantPrincipal);
  }
  // Un « 0 $ » est une autorisation sans somme : pas un montant.
  const compteParmiLesMontants = (f) => f.montant > 0 && decidant(f) && !PAS_UNE_DEPENSE.has(f.typeMontant);

  const lourdes = liste.filter(compteParmiLesMontants).sort(parMontant).slice(0, 6);
  const dejaVues = new Set(lourdes.map((f) => f.cle));
  const subventions = liste.filter((f) => f.theme === 'subventions' && decidant(f)).sort(parMontant);
  // Un « contrat » dont la lecture dit que c'est une subvention ou un prêt n'est pas un contrat.
  const contrats = liste.filter((f) => f.theme === 'contrats' && compteParmiLesMontants(f) && ['depense', 'autre', undefined].includes(f.typeMontant)).sort(parMontant);
  // Le total ne compte que ce que la Ville accorde — pas ce qu'elle reçoit d'un gouvernement.
  const accordees = subventions.filter((f) => !['subvention_recue', 'revenu', ...PAS_UNE_DEPENSE].includes(f.typeMontant));
  const totalSubventions = accordees.reduce((n, f) => n + (f.montant ?? 0), 0);

  // Les votes divisés, regroupés par séance et par groupe d'élus minoritaire : trois élus qui
  // votent contre dix résolutions d'une même séance, c'est un bloc, pas dix.
  const sommaireDeResolution = new Map(decisions.decisions.filter((d) => d.type === 'Résolutions' && d.sommaireId).map((d) => [d.id, d.sommaireId]));
  const blocsVotes = new Map();
  for (const v of votes.votes.filter((v) => dansFenetre(v) && v.contre?.length && v.pour?.length)) {
    const cote = v.contre.length <= v.pour.length ? 'contre' : 'pour';
    const noms = v[cote];
    const cle = `${v.instance}|${v.date}|${cote}|${noms.join(',')}`;
    if (!blocsVotes.has(cle)) blocsVotes.set(cle, { instance: INSTANCE_COURTE(v.instance), date: v.date, cote, noms, resolutions: [] });
    const resume = resumeParId.get(sommaireDeResolution.get(v.id));
    blocsVotes.get(cle).resolutions.push({ numero: v.numero, pdf: v.pdf, resultat: v.resultat, pour: v.decomptePour ?? v.pour.length, contre: v.decompteContre ?? v.contre.length, phrase: resume?.puces?.[0] ?? court(v.objet) });
  }
  const votesDivises = [...blocsVotes.values()].sort((a, b) => a.date.localeCompare(b.date) || b.resolutions.length - a.resolutions.length);
  const nbVotesDivises = votesDivises.reduce((n, b) => n + b.resolutions.length, 0);

  const parTheme = new Map();
  for (const f of liste) if (f.theme) parTheme.set(f.theme, (parTheme.get(f.theme) ?? 0) + 1);
  const sujets = [...parTheme.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ libelle: THEMES[t]?.libelle ?? t, couleur: THEMES[t]?.couleur ?? '#6b7280', n }));

  // L'agenda : ce qui attend un vote au moment où le compte rendu est préparé (attendues.json), et
  // ce qui a une date cible dans les 45 prochains jours.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dans45 = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  const agendaTotal = attendues.decisions.length;
  const agendaProchain = attendues.decisions.filter((d) => d.echeance && d.echeance >= aujourdhui && d.echeance <= dans45).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const parGroupe = new Map();
  for (const d of attendues.decisions) parGroupe.set(d.groupe ?? d.instance, (parGroupe.get(d.groupe ?? d.instance) ?? 0) + 1);
  const agendaInstances = [...parGroupe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, n]) => `${INSTANCE_COURTE(g)} (${n})`).join(' · ');

  const phraseDe = (f) => f.resume?.puces?.[0] ?? court(f.objet, 170);
  const natureDe = (f) => (f.typeMontant && !['depense', 'autre'].includes(f.typeMontant) ? TYPES_MONTANT[f.typeMontant] : null);
  const ouVu = (f) => ([...f.instances].length ? [...f.instances].join(', ') : `sommaire du ${jourMois(f.dates[0])}`);

  const introduction =
    `${nomPeriode[0].toUpperCase()}${nomPeriode.slice(1)}, ${pluriel(liste.length, 'dossier a', 'dossiers ont')} passé devant les instances de la Ville de Québec, en ${pluriel(nbSeances, 'séance', 'séances')}` +
    (accordees.length ? `, dont ${pluriel(accordees.length, 'subvention accordée', 'subventions accordées')}${totalSubventions ? ` pour ${argent(totalSubventions)} au total` : ''}` : '') +
    (contrats.length ? ` et ${pluriel(contrats.length, 'contrat', 'contrats')} avec un montant` : '') +
    (lourdes[0] ? `. Le plus gros montant : ${argent(lourdes[0].montant)} — ${phraseDe(lourdes[0]).replace(/^La Ville (?:de Québec )?/, 'la Ville ').replace(/\.$/, '')}` : '') +
    '.';

  const fichierMot = new URL(`${fichier}-mot.md`, SORTIE);
  const mot = existsSync(fichierMot) ? (await readFile(fichierMot, 'utf8')).trim().split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean) : [];

  const SECTIONS = {
    montants: {
      titre: 'Les plus gros montants', icone: '💰', couleur: '#EA580C',
      chapeau: 'Des plafonds et des estimations tirés des documents, pas des factures.',
    },
    subventions: {
      titre: 'Les subventions', icone: '🤝', couleur: '#0B8A4B',
      chapeau: `Ce que la Ville accorde à des organismes et à des entreprises — du gros projet au petit événement de quartier.${totalSubventions ? ` ${argent(totalSubventions)} accordés au total ; l'aide reçue d'un gouvernement n'y est pas comptée.` : ''}`,
      note: "« Subvention maximale » : le montant est un plafond. La Ville peut verser moins, selon les dépenses réelles et les conditions de l'entente.",
    },
    contrats: {
      titre: 'Les contrats', icone: '📝', couleur: '#2563EB',
      chapeau: 'Les achats et les services confiés à des entreprises, du plus gros au plus petit. Montants avant taxes quand le document le précise.',
    },
    votes: {
      titre: 'Les votes divisés', icone: '🗳️', couleur: '#7C3AED',
      chapeau: "La plupart des résolutions passent sans opposition. Voici celles où des élus ont voté autrement que la majorité, regroupées quand ce sont les mêmes élus à la même séance.",
    },
    agenda: {
      titre: "À l'agenda des conseils", icone: '🗓️', couleur: '#B7791F',
      chapeau: "Les dossiers qui attendent encore un vote et dont la date cible arrive. Ils passeront probablement à la prochaine séance, mais ce n'est pas l'ordre du jour officiel : un dossier peut être reporté.",
    },
    sujets: {
      titre: 'De quoi on a parlé', icone: '🏷️', couleur: '#DB2777',
      chapeau: 'Le nombre de dossiers du mois, par sujet.',
    },
  };

  // ---------- Markdown ----------
  const L = [];
  L.push(`# Ce que la Ville de Québec a décidé ${nomPeriode}`, '');
  for (const p of mot) L.push(p, '');
  L.push(introduction, '');
  L.push(`**Séances :** ${seances.join(' · ')}.`, '');
  const titreMd = (s, n) => { L.push(`## ${s.icone} ${s.titre}${n != null ? ` (${nombreFr(n)})` : ''}`, '', `*${s.chapeau}*`, ''); };
  titreMd(SECTIONS.montants);
  for (const f of lourdes) {
    L.push(`- **${argent(f.montant)}**${natureDe(f) ? ` *(${natureDe(f)})*` : ''} — ${phraseDe(f)} *(${ouVu(f)})* [${f.numero}](${f.pdf})`);
    for (const p of (f.resume?.puces ?? []).slice(1, 3)) L.push(`  - ${p}`);
  }
  if (!lourdes.length) L.push('Aucun montant relevé dans les résumés du mois.');
  L.push('');
  const ligneMd = (f) => L.push(`- **${f.montant != null ? argent(f.montant) : 'Montant non précisé'}**${natureDe(f) ? ` *(${natureDe(f)})*` : ''} — ${phraseDe(f)} [${f.numero}](${f.pdf})`);
  const autresSub = subventions.filter((f) => !dejaVues.has(f.cle));
  titreMd(SECTIONS.subventions, subventions.length);
  autresSub.forEach(ligneMd);
  if (!subventions.length) L.push('Aucune ce mois-ci.');
  L.push('');
  const autresCon = contrats.filter((f) => !dejaVues.has(f.cle));
  titreMd(SECTIONS.contrats, contrats.length);
  autresCon.forEach(ligneMd);
  if (!contrats.length) L.push('Aucun ce mois-ci.');
  L.push('');
  titreMd(SECTIONS.votes, nbVotesDivises);
  for (const b of votesDivises) {
    L.push(`- **${b.instance}, ${jourMois(b.date)}** — ont voté ${b.cote} : ${b.noms.join(', ')}`);
    for (const r of b.resolutions) L.push(`  - ${r.phrase} *(${r.resultat ?? ''}, ${r.pour} pour, ${r.contre} contre)* [${r.numero}](${r.pdf})`);
  }
  if (!votesDivises.length) L.push('Aucun vote divisé publié pour ce mois.');
  L.push('');
  titreMd(SECTIONS.sujets);
  L.push(sujets.map((s) => `${s.libelle} (${s.n})`).join(' · '), '');
  L.push('---', '');
  L.push(`Le détail de l'argent de chaque dossier — qui a soumissionné, l'estimation de la Ville, la répartition par année — et les alertes quand vos projets bougent : ${RACINE}/abonnement`, '');
  L.push(`Les montants sont ceux des documents. Les résumés sont générés par IA à partir des sommaires décisionnels ; chaque lien mène au PDF officiel de la Ville, qui fait foi. Toutes les décisions : ${SITE}decisions.html — site indépendant, sans publicité, aucun caractère officiel.`);
  const md = L.join('\n');

  // ---------- HTML pour le courriel ----------
  // Styles en ligne et tableaux : c'est ce que les logiciels de courriel affichent partout
  // (pas de variables CSS, pas de flex, pas de color-mix — les teintes claires sont calculées ici).
  const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const teinte = (hex, part) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const m = (c) => Math.round(255 - (255 - c) * part).toString(16).padStart(2, '0');
    return `#${m(r)}${m(g)}${m(b)}`;
  };
  const ENCRE = '#16191D';
  const DOUX = '#5B6470';
  const POLICE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const lien = (texte, url, couleur) => `<a href="${echapper(url)}" style="color:${couleur};font-weight:600;text-decoration:none;white-space:nowrap">${echapper(texte)}&nbsp;↗</a>`;
  const pastille = (texte, couleur) => `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${teinte(couleur, 0.14)};color:${couleur};font-size:12px;font-weight:700;white-space:nowrap">${echapper(texte)}</span>`;
  const montant = (f, couleur) => `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${couleur};color:#fff;font-weight:800;font-size:14px;white-space:nowrap">${f.montant != null ? echapper(argent(f.montant)) : 'Montant non précisé'}</span>`;
  const sujetDe = (f) => (THEMES[f.theme] ? pastille(THEMES[f.theme].libelle, THEMES[f.theme].couleur) : '');

  const enTete = (s, n, apres = '') => `
    <tr><td style="padding:30px 0 6px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td width="44" valign="middle"><div style="width:36px;height:36px;line-height:36px;border-radius:50%;background:${teinte(s.couleur, 0.16)};text-align:center;font-size:19px">${s.icone}</div></td>
        <td valign="middle" style="${POLICE};font-size:20px;font-weight:800;color:${s.couleur}">${echapper(s.titre)}${n != null ? ` <span style="display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:${s.couleur};color:#fff;font-size:13px;vertical-align:middle">${nombreFr(n)}</span>` : ''}${apres ? ` ${apres}` : ''}</td>
      </tr></table>
      <p style="${POLICE};margin:8px 0 ${s.note ? '6px' : '12px'};font-size:14px;line-height:1.5;color:${DOUX}">${echapper(s.chapeau)}</p>
      ${s.note ? `<p style="${POLICE};margin:0 0 12px;font-size:13px;line-height:1.5;color:${DOUX}"><strong style="color:${ENCRE}">ℹ️</strong> ${echapper(s.note)}</p>` : ''}
    </td></tr>`;
  const carte = (couleur, contenu) => `
    <tr><td style="padding:0 0 10px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:#ffffff;border:1px solid ${teinte(couleur, 0.22)};border-left:5px solid ${couleur};border-radius:8px"><tr>
        <td style="${POLICE};padding:12px 14px;font-size:15px;line-height:1.5;color:${ENCRE}">${contenu}</td>
      </tr></table>
    </td></tr>`;

  // Deux éditions du même compte rendu : gratuite (avec l'invitation à s'abonner) et abonnés
  // (sans publicité, et un lien vers le détail de l'argent sous chaque montant — le détail
  // lui-même reste dans sa fiche, derrière la connexion).
  // Ce qui est réservé aux abonnés est DORÉ dans les deux éditions, avec la marque « ★ ABONNÉS » :
  // rempli pour l'abonné, fermé (🔒, ce qu'on y trouverait, sans les chiffres) pour les autres.
  // Même mise en page ; la différence se voit d'un coup d'œil.
  const pageHtml = (abonne) => {
  const OR = '#B7791F';
  const marque = `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#D99A06;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.04em;white-space:nowrap;vertical-align:middle">★ ABONNÉS</span>`;
  const boiteOr = (contenu, marge = '10px 0 0') => `<div style="${POLICE};margin:${marge};padding:10px 12px;border-radius:8px;background:#FFF7E0;border:1px dashed #E9B949;font-size:14px;line-height:1.55;color:${ENCRE}">${contenu}</div>`;
  const lienOr = (texte, url) => `<a href="${echapper(url)}" style="color:${OR};font-weight:700;text-decoration:none;white-space:nowrap">${texte}&nbsp;↗</a>`;
  const fiche = (numero) => `${SITE}decisions.html?q=${encodeURIComponent(numero)}`;
  // Le détail de l'argent d'un gros montant : quelques lignes pour l'abonné, ce qu'il contient pour les
  // autres (sans les chiffres). Rien, dans les deux éditions, s'il n'est pas lu.
  // Sous une subvention ou un contrat, l'essentiel du détail en une ligne dorée (abonnés seulement) :
  // « 2 soumissions · plus basse 22,8 % sous l'estimation de la Ville · jusqu'au 31 août 2028 ».
  // Dans l'édition gratuite, la même ligne est fermée : ce que le détail contient, sans les chiffres
  // (« 🔒 ★ Abonnés : 4 soumissions comparées à l'estimation de la Ville · 3 conditions »).
  const styleLigneOr = 'margin-top:6px;padding:5px 9px;border-left:3px solid #D99A06;border-radius:4px;background:#FFF7E0;font-size:12.5px;line-height:1.5;color:#7A4E00';
  // « 1200, rue Bergar, Laval (Québec) H7L 5A2 » → « Laval » ; « Mississauga (Ontario) » reste tel quel.
  const villeSeule = (v) => (v ?? '').replace(/\s*[A-Z]\d[A-Z]\s?\d[A-Z]\d\s*$/, '').split(',').pop().replace(/\s*\(Québec\)\s*$/, '').trim() || null;
  const prixCourt = (p) => court(String(p ?? '').split(';')[0].replace(/\s*\(avant taxes\)/i, ' avant taxes').trim(), 70);
  // Un contrat : qui a gagné et à quel prix, contre qui, l'estimation de la Ville, comment et pour combien de temps.
  const blocContrat = (f, d) => {
    const soumissions = d.soumissions ?? [];
    const retenues = soumissions.filter((s) => s.retenue);
    const autres = soumissions.filter((s) => !s.retenue && s.entreprise);
    const entreprise = (s) => `${s.entreprise}${villeSeule(s.ville) ? ` (${villeSeule(s.ville)})` : ''}`;
    if (!abonne) {
      const morceaux = [
        retenues.length ? `l'entreprise retenue et son prix` : null,
        autres.length ? pluriel(autres.length, 'autre soumission', 'autres soumissions') : null,
        d.estimationVille ? "l'estimation de la Ville" : null,
        d.duree ? 'la durée' : null,
        d.conditions?.length ? pluriel(d.conditions.length, 'condition', 'conditions') : null,
      ].filter(Boolean);
      return morceaux.length ? `<div style="${styleLigneOr}">🔒 <strong>★ Abonnés :</strong> ${echapper(morceaux.join(' · '))}</div>` : '';
    }
    const ecart = [...String(d.ecartEstimation ?? '').matchAll(/plus basse[^:]*:\s*([-+−]?\s?\d+(?:,\d+)?)\s*%/gi)].map((m) => Number(m[1].replace(/[\s−]/g, (c) => (c === '−' ? '-' : '')).replace(',', '.')));
    const mode = /gr[ée] à gr[ée]/i.test(d.modeAttribution ?? '') ? 'gré à gré, sans appel d\'offres' : /appel d'offres (?:public|sur invitation)\s*\d*/i.exec(d.modeAttribution ?? '')?.[0];
    const lignes = [
      ...retenues.slice(0, 2).map((s) => `<strong>Retenue :</strong> ${echapper(entreprise(s))}${s.prix ? ` — ${echapper(prixCourt(s.prix))}` : ''}`),
      autres.length ? `<strong>${autres.length > 1 ? 'Les autres soumissions' : "L'autre soumission"} :</strong> ${echapper(autres.slice(0, 3).map((s) => `${s.entreprise}${s.prix ? ` (${prixCourt(s.prix)})` : ''}${s.conforme === false ? ', non conforme' : ''}`).join(' · '))}${autres.length > 3 ? ` · et ${autres.length - 3} autre${autres.length - 3 > 1 ? 's' : ''}` : ''}` : null,
      d.estimationVille ? `<strong>Estimation de la Ville :</strong> ${echapper(prixCourt(d.estimationVille))}${ecart.length === 1 && Number.isFinite(ecart[0]) && ecart[0] !== 0 ? ` — la plus basse soumission conforme est ${nombreFr(Math.abs(ecart[0]))} % ${ecart[0] < 0 ? 'sous' : 'au-dessus de'} l'estimation` : ''}` : null,
      mode ? `<strong>Attribué par :</strong> ${echapper(mode.charAt(0).toLowerCase() + mode.slice(1))}` : null,
      d.duree ? `<strong>Durée :</strong> ${echapper(court(d.duree.charAt(0).toLowerCase() + d.duree.slice(1), 90))}${d.renouvellements ? ` · renouvellement : ${echapper(court(d.renouvellements, 60))}` : ''}` : null,
    ].filter(Boolean);
    return lignes.length ? `<div style="${styleLigneOr}"><strong>★</strong> ${lignes.join('<br>')}</div>` : '';
  };
  const ligneOr = (f) => {
    const d = natureParId.get(f.cle);
    if (!d) return '';
    if (f.theme === 'contrats') return blocContrat(f, d);
    const morceaux = [];
    const entreprises = new Set((d.soumissions ?? []).map((s) => s.entreprise)).size;
    if (!abonne) {
      if (entreprises) morceaux.push(`${pluriel(entreprises, 'soumission', 'soumissions')}${d.estimationVille ? ` comparée${entreprises > 1 ? 's' : ''} à l'estimation de la Ville` : ''}`);
      else if (d.chiffresCles?.some((c) => /co[uû]t|budget|pr[ée]vision/i.test(c.libelle ?? ''))) morceaux.push('le coût total du projet');
      if (/(?:payable|vers[ée]e?s?)\s+en\s+(?:deux|trois|quatre|cinq|six|\d+)\s+(?:versements|tranches)/i.test((d.conditions ?? []).join(' '))) morceaux.push('le calendrier des versements');
      else if (d.duree) morceaux.push('la durée');
      if (d.conditions?.length) morceaux.push(pluriel(d.conditions.length, 'condition', 'conditions'));
      if (!morceaux.length) return '';
      return `<div style="margin-top:6px;padding:4px 9px;border-left:3px solid #D99A06;border-radius:4px;background:#FFF7E0;font-size:12.5px;line-height:1.45;color:#7A4E00">🔒 <strong>★ Abonnés :</strong> ${echapper(morceaux.slice(0, 3).join(' · '))}</div>`;
    }
    // Chaque morceau est une phrase qui se comprend seule : une date dit à quoi elle s'applique,
    // un chiffre dit ce qu'il mesure (Martin : « Deuxième versement : 50 % · au plus tard le
    // 31 mars 2027 » laissait croire que la date était celle du deuxième versement).
    const contrat = f.theme === 'contrats';
    if (entreprises) morceaux.push(`${pluriel(entreprises, 'entreprise a soumissionné', 'entreprises ont soumissionné')}`);
    // L'écart avec la plus basse soumission conforme ; un seul lot, sinon on ne résume pas.
    const ecarts = [...String(d.ecartEstimation ?? '').matchAll(/plus basse[^:]*:\s*([-+−]?\s?\d+(?:,\d+)?)\s*%/gi)].map((m) => m[1]);
    if (ecarts.length === 1 && !/lot/i.test(d.ecartEstimation)) {
      const n = Number(ecarts[0].replace(/[\s−]/g, (c) => (c === '−' ? '-' : '')).replace(',', '.'));
      if (Number.isFinite(n) && n !== 0) morceaux.push(`la plus basse soumission est ${nombreFr(Math.abs(n))} % ${n < 0 ? 'sous' : 'au-dessus de'} l'estimation de la Ville`);
    }
    // Sans appel d'offres (une subvention, une entente) : le coût ou le budget du projet que l'aide
    // finance. Pas un pourcentage de versement ni une durée, qui ne se comprennent pas seuls.
    const utile = (d.chiffresCles ?? []).filter((c) => c.libelle && c.valeur && `${c.libelle} ${c.valeur}`.length <= 80 && !/dur[ée]e|versement|tranche/i.test(c.libelle) && lireMontant(c.valeur) !== Math.round(f.montant ?? -1) && Math.abs((lireMontant(c.valeur) ?? 0) - (f.montant ?? 0)) > 1);
    const cle = utile.find((c) => /co[uû]t|budget|pr[ée]vision/i.test(c.libelle));
    if (!entreprises && cle) morceaux.push(`${cle.libelle.replace(/\s*:$/, '')} : ${cle.valeur}`);
    const versements = /(?:payable|vers[ée]e?s?)\s+en\s+(deux|trois|quatre|cinq|six|\d+)\s+(versements|tranches)/i.exec((d.conditions ?? []).join(' '));
    if (versements) morceaux.push(`${contrat ? 'payé' : 'aide versée'} en ${versements[1].toLowerCase()} ${versements[2].toLowerCase()}`);
    const JOUR = '(\\d{1,2}(?:er)?\\s+[a-zéû]+\\s+\\d{4})';
    const trouver = (motif) => new RegExp(motif, 'i').exec(d.duree ?? '');
    const periode = trouver(`\\bdu\\s+(\\d{1,2}(?:er)?(?:\\s+[a-zéû]+(?:\\s+\\d{4})?)?)\\s+au\\s+${JOUR}`);
    const jusqua = trouver(`jusqu'au\\s+${JOUR}`);
    const aVerser = trouver(`verser[^;.]*?au plus tard le\\s+${JOUR}`);
    const aTerminer = trouver(`terminer[^;.]*?au plus tard le\\s+${JOUR}`);
    if (periode) morceaux.push(`${contrat ? 'contrat' : 'période'} du ${periode[1]} au ${periode[2]}`);
    else if (jusqua) morceaux.push(`${contrat ? 'contrat' : 'entente'} en vigueur jusqu'au ${jusqua[1]}`);
    else if (aVerser) morceaux.push(`aide versée au complet au plus tard le ${aVerser[1]}`);
    else if (aTerminer) morceaux.push(`projet à terminer au plus tard le ${aTerminer[1]}`);
    if (!morceaux.length) return '';
    return `<div style="margin-top:6px;padding:4px 9px;border-left:3px solid #D99A06;border-radius:4px;background:#FFF7E0;font-size:12.5px;line-height:1.45;color:#7A4E00"><strong>★</strong> ${echapper(morceaux.slice(0, 3).join(' · '))}</div>`;
  };
  const detailOr = (f) => {
    const d = natureParId.get(f.cle);
    if (!d) return '';
    const entreprises = new Set((d.soumissions ?? []).map((s) => s.entreprise)).size;
    if (!abonne) {
      const contenu = [d.beneficiaire ? 'qui reçoit' : null, d.payeur ? 'qui paie' : null, entreprises ? pluriel(entreprises, 'soumissionnaire comparé', 'soumissionnaires comparés') : null, d.estimationVille ? "l'estimation de la Ville" : null, d.repartitionAnnuelle?.length ? 'la répartition par année' : null].filter(Boolean);
      return boiteOr(`🔒 <strong>Détail de l'argent</strong> ${marque}<br>${contenu.length ? `Dans ce dossier : ${echapper(contenu.join(', '))}.` : "Lu et vérifié dans le document."} ${lienOr("S'abonner", `${RACINE}/abonnement`)}`);
    }
    const retenue = (d.soumissions ?? []).find((s) => s.retenue);
    const lignes = [
      d.beneficiaire ? `<strong>Qui reçoit :</strong> ${echapper(d.beneficiaire)}${d.payeur ? ` · payé par ${echapper(d.payeur)}` : ''}` : null,
      entreprises ? `<strong>Soumissions :</strong> ${pluriel(entreprises, 'entreprise', 'entreprises')}${retenue ? ` · retenue : ${echapper(retenue.entreprise)}, ${echapper(court(retenue.prix, 90))}` : ''}` : null,
      d.estimationVille ? `<strong>Estimation de la Ville :</strong> ${echapper(court(d.estimationVille, 160))}` : null,
      d.repartitionAnnuelle?.length ? `<strong>Par année :</strong> ${echapper(d.repartitionAnnuelle.slice(0, 4).map((r) => `${r.annee} : ${r.montant.replace(/\s*\(taxes nettes\)/i, '')}`).join(' · '))}${d.repartitionAnnuelle.length > 4 ? ' …' : ''}` : null,
      d.duree ? `<strong>Durée :</strong> ${echapper(court(d.duree.charAt(0).toLowerCase() + d.duree.slice(1), 120))}` : null,
      d.sourceFinancement ? `<strong>D'où vient l'argent :</strong> ${echapper(court(d.sourceFinancement.replace(/\s*\(clé [^)]*\)/i, ''), 140))}` : null,
      d.chiffresCles?.length ? `<strong>En chiffres :</strong> ${echapper(d.chiffresCles.slice(0, 2).map((c) => `${c.libelle} : ${c.valeur}`).join(' · '))}` : null,
      // La première clause du document, en entier : coupée, elle ne disait rien.
      d.conditions?.length ? `<strong>À savoir :</strong> ${echapper(court(d.conditions[0], 320))}` : null,
    ].filter(Boolean).slice(0, 5);
    return boiteOr(`💵 <strong>Détail de l'argent</strong> ${marque}${lignes.map((l) => `<br>${l}`).join('')}<br>${lienOr('Toute la fiche', fiche(f.numero))}`);
  };
  const H = [];
  // Bandeau
  H.push(`
    <tr><td style="background:#0B8A4B;border-radius:12px 12px 0 0;padding:26px 24px 22px">
      <div style="${POLICE};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#CFF5DE">DossierVilleDeQuébec · Compte rendu mensuel${abonne ? ' · édition abonnés' : ''}</div>
      <h1 style="${POLICE};margin:8px 0 0;font-size:27px;line-height:1.2;color:#ffffff">Ce que la Ville de Québec a décidé ${echapper(nomPeriode)}</h1>
    </td></tr>
    <tr><td style="height:6px;line-height:6px;font-size:0;background:#F5B301">&nbsp;</td></tr>`);
  // Le mot du mois, puis l'introduction
  const paragraphes = [...mot.map((p) => `<p style="${POLICE};margin:0 0 12px;font-size:16px;line-height:1.6;color:${ENCRE}">${echapper(p)}</p>`)];
  H.push(`<tr><td style="padding:22px 4px 4px">${paragraphes.join('')}<p style="${POLICE};margin:0;font-size:16px;line-height:1.6;color:${ENCRE}">${echapper(introduction)}</p>${abonne
    ? boiteOr(`${marque} <strong>Votre édition abonnés.</strong> Merci : c'est votre abonnement qui garde le reste gratuit pour tout le monde.`, '14px 0 0')
    : boiteOr(`${marque} <strong>Les encadrés dorés sont réservés aux abonnés :</strong> le détail de l'argent de chaque montant — qui reçoit, les soumissions, l'estimation de la Ville — et l'agenda des conseils du mois qui vient. ${lienOr("Voir l'abonnement", `${RACINE}/abonnement`)}`, '14px 0 0')}</td></tr>`);

  // Le mois en chiffres : quatre tuiles de couleur, deux par rangée (lisible sur cellulaire).
  const tuile = (n, libelle, couleur) => `<td width="50%" valign="top" style="padding:6px">
      <div style="background:${teinte(couleur, 0.12)};border-radius:10px;padding:14px 14px 12px;border-top:4px solid ${couleur}">
        <div style="${POLICE};font-size:26px;font-weight:800;color:${couleur};line-height:1.1">${echapper(n)}</div>
        <div style="${POLICE};font-size:13px;color:${ENCRE};margin-top:4px;line-height:1.35">${echapper(libelle)}</div>
      </div></td>`;
  H.push(`<tr><td style="padding:16px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>${tuile(nombreFr(liste.length), 'dossiers devant les instances', '#0B8A4B')}${tuile(nombreFr(nbSeances), 'séances', '#2563EB')}</tr>
      <tr>${tuile(totalSubventions ? argent(totalSubventions) : nombreFr(accordees.length), `en ${pluriel(accordees.length, 'subvention accordée', 'subventions accordées')}`, '#EA580C')}${tuile(nombreFr(nbVotesDivises), nbVotesDivises > 1 ? 'votes divisés' : 'vote divisé', '#7C3AED')}</tr>
    </table>
    <p style="${POLICE};margin:10px 6px 0;font-size:13px;line-height:1.5;color:${DOUX}"><strong style="color:${ENCRE}">Séances :</strong> ${echapper(seances.join(' · '))}.</p>
  </td></tr>`);

  // Les plus gros montants, avec les puces du résumé
  H.push(enTete(SECTIONS.montants));
  for (const f of lourdes) {
    const puces = (f.resume?.puces ?? []).slice(1, 3);
    H.push(carte(SECTIONS.montants.couleur, `
      <div style="margin:0 0 6px">${montant(f, SECTIONS.montants.couleur)} ${natureDe(f) ? pastille(natureDe(f), SECTIONS.montants.couleur) : ''} ${sujetDe(f)}</div>
      <div style="font-weight:600">${echapper(phraseDe(f))}</div>
      ${puces.length ? `<ul style="margin:6px 0 0;padding-left:18px;color:#374151;font-size:14px">${puces.map((p) => `<li style="margin:0 0 3px">${echapper(p)}</li>`).join('')}</ul>` : ''}
      <div style="margin-top:8px;font-size:13px;color:${DOUX}">${echapper(ouVu(f))} · ${lien(f.numero, f.pdf, SECTIONS.montants.couleur)}</div>
      ${detailOr(f)}`));
  }
  if (!lourdes.length) H.push(`<tr><td style="${POLICE};color:${DOUX}">Aucun montant relevé dans les résumés du mois.</td></tr>`);

  // Subventions et contrats : une ligne par dossier, tous, du plus gros au plus petit.
  const liste2 = (s, dossiers, total, vide) => {
    H.push(enTete(s, total));
    if (!dossiers.length) { H.push(`<tr><td style="${POLICE};color:${DOUX};padding:0 0 8px">${vide}</td></tr>`); return; }
    const lignes = dossiers.map((f, i) => `<tr style="background:${i % 2 ? teinte(s.couleur, 0.05) : '#ffffff'}">
        <td valign="top" width="1" style="${POLICE};padding:10px 10px 10px 12px;white-space:nowrap">${montant(f, s.couleur)}</td>
        <td valign="top" style="${POLICE};padding:10px 12px 10px 0;font-size:14px;line-height:1.5;color:${ENCRE}">${echapper(phraseDe(f))}${natureDe(f) ? ` ${pastille(natureDe(f), s.couleur)}` : ''}<div style="margin-top:3px;font-size:12px">${lien(f.numero, f.pdf, s.couleur)}</div>${ligneOr(f)}</td>
      </tr>`).join('');
    H.push(`<tr><td style="padding:0 0 6px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${teinte(s.couleur, 0.25)};border-top:4px solid ${s.couleur};border-radius:8px;border-collapse:separate;overflow:hidden">${lignes}</table></td></tr>`);
  };
  liste2(SECTIONS.subventions, autresSub, subventions.length, 'Aucune ce mois-ci.');
  if (subventions.length !== autresSub.length) H.push(`<tr><td style="${POLICE};font-size:12px;color:${DOUX};padding:0 4px 4px">Plus ${subventions.length - autresSub.length} déjà dans les plus gros montants.</td></tr>`);
  liste2(SECTIONS.contrats, autresCon, contrats.length, 'Aucun ce mois-ci.');
  if (contrats.length !== autresCon.length) H.push(`<tr><td style="${POLICE};font-size:12px;color:${DOUX};padding:0 4px 4px">Plus ${contrats.length - autresCon.length} déjà dans les plus gros montants.</td></tr>`);

  // Les votes divisés
  H.push(enTete(SECTIONS.votes, nbVotesDivises));
  for (const b of votesDivises) {
    H.push(carte(SECTIONS.votes.couleur, `
      <div style="margin:0 0 6px">${pastille(`${b.instance} · ${jourMois(b.date)}`, SECTIONS.votes.couleur)} ${pastille(pluriel(b.resolutions.length, 'résolution', 'résolutions'), '#6b7280')}</div>
      <div style="font-size:14px"><strong>Ont voté ${b.cote} :</strong> ${echapper(b.noms.join(', '))}</div>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:14px;color:#374151">${b.resolutions.map((r) => `<li style="margin:0 0 6px">${echapper(r.phrase)} <span style="color:${DOUX};font-size:13px">— ${echapper(r.resultat ?? '')}, ${r.pour} pour, ${r.contre} contre</span> ${lien(r.numero, r.pdf, SECTIONS.votes.couleur)}</li>`).join('')}</ul>`));
  }
  if (!votesDivises.length) H.push(`<tr><td style="${POLICE};color:${DOUX};padding:0 0 8px">Aucun vote divisé publié pour ce mois.</td></tr>`);

  // L'agenda des conseils du mois qui vient : rempli pour l'abonné, fermé pour les autres.
  H.push(enTete(SECTIONS.agenda, null, marque));
  if (abonne) {
    const lignes = agendaProchain.slice(0, 8).map((d, i) => `<tr style="background:${i % 2 ? '#FFFBEF' : '#ffffff'}">
        <td valign="top" width="1" style="${POLICE};padding:10px 10px 10px 12px;white-space:nowrap"><span style="display:inline-block;padding:3px 9px;border-radius:6px;background:#D99A06;color:#fff;font-weight:800;font-size:13px">${echapper(jourMois(d.echeance))}</span></td>
        <td valign="top" style="${POLICE};padding:10px 12px 10px 0;font-size:14px;line-height:1.5;color:${ENCRE}">${echapper(d.phrase ?? court(d.objet))}<div style="margin-top:3px;font-size:12px;color:${DOUX}">${echapper(INSTANCE_COURTE(d.groupe ?? d.instance))} · ${lienOr(d.numero, fiche(d.numero))}</div></td>
      </tr>`).join('');
    H.push(agendaProchain.length
      ? `<tr><td style="padding:0 0 6px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px dashed #E9B949;border-top:4px solid #D99A06;border-radius:8px;border-collapse:separate;overflow:hidden">${lignes}</table>
          <p style="${POLICE};margin:8px 4px 0;font-size:13px;color:${DOUX}"><em><strong><u>Approximatif</u></strong></em> : tiré des dates cibles écrites dans les sommaires. ${pluriel(agendaTotal, 'dossier attend', 'dossiers attendent')} un vote en tout : ${lienOr("tout l'agenda dans Mes dossiers", `${RACINE}/mes-dossiers`)}</p></td></tr>`
      : `<tr><td>${boiteOr(`Aucune date cible à venir dans les sommaires pour l'instant. ${pluriel(agendaTotal, 'dossier attend', 'dossiers attendent')} un vote : ${lienOr("l'agenda dans Mes dossiers", `${RACINE}/mes-dossiers`)}`, '0')}</td></tr>`);
  } else {
    H.push(`<tr><td>${boiteOr(`🔒 <strong>${pluriel(agendaTotal, 'dossier attend', 'dossiers attendent')} un vote</strong>${agendaProchain.length ? `, dont ${pluriel(agendaProchain.length, 'avec une date cible dans les prochaines semaines', 'avec une date cible dans les prochaines semaines')}` : ''}${agendaInstances ? ` — ${echapper(agendaInstances)}` : ''}. Leur résumé et leur date cible sont réservés aux abonnés. ${lienOr("S'abonner", `${RACINE}/abonnement`)}`, '0')}</td></tr>`);
  }

  // Les sujets, dans leurs couleurs du site
  H.push(enTete(SECTIONS.sujets));
  H.push(`<tr><td style="padding:0 0 6px;line-height:2.1">${sujets.map((s) => `<span style="${POLICE};display:inline-block;margin:0 6px 6px 0;padding:4px 11px;border-radius:999px;background:${s.couleur};color:#fff;font-size:13px;font-weight:700;white-space:nowrap">${echapper(s.libelle)} <span style="opacity:.85">${s.n}</span></span>`).join('')}</td></tr>`);

  // L'invitation (gratuit) ou le rappel de ce que l'abonnement donne (abonnés), puis le pied
  if (abonne) H.push(`<tr><td style="padding:26px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E8F6EE;border:1px solid #9FD9B6;border-radius:10px;border-collapse:separate"><tr><td style="${POLICE};padding:16px 18px;font-size:15px;line-height:1.55;color:${ENCRE}">
      <div style="font-size:17px;font-weight:800;color:#0B8A4B;margin-bottom:4px">📂 Dans vos dossiers</div>
      Vos alertes du matin continuent chaque jour où vos projets, vos mots-clés ou vos organismes bougent. Dans <a href="${RACINE}/mes-dossiers" style="color:#0B8A4B;font-weight:700">Mes dossiers</a> : l'agenda des conseils, l'export en tableur ou en PDF, et le détail de l'argent de chaque dossier.
      <div style="margin-top:12px"><a href="${RACINE}/mes-dossiers" style="display:inline-block;padding:9px 16px;border-radius:6px;background:#0B8A4B;color:#ffffff;font-weight:700;text-decoration:none">Ouvrir Mes dossiers</a> <a href="${RACINE}/abonnement" style="margin-left:10px;color:${DOUX};font-size:13px">Gérer mon abonnement</a></div>
    </td></tr></table>
  </td></tr>`);
  else H.push(`<tr><td style="padding:26px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FFF7E0;border:1px solid #F5D78A;border-radius:10px;border-collapse:separate"><tr><td style="${POLICE};padding:16px 18px;font-size:15px;line-height:1.55;color:${ENCRE}">
      <div style="font-size:17px;font-weight:800;color:#B7791F;margin-bottom:4px">🔔 Aller plus loin</div>
      Suivez un projet, une rue ou une entreprise dans <a href="${RACINE}/mes-dossiers" style="color:#0B8A4B;font-weight:700">Mes dossiers</a>. L'abonnement ajoute les alertes quand ils bougent et le détail de l'argent de chaque dossier : qui a soumissionné, l'estimation de la Ville, la répartition par année.
      <div style="margin-top:12px"><a href="${RACINE}/abonnement" style="display:inline-block;padding:9px 16px;border-radius:6px;background:#0B8A4B;color:#ffffff;font-weight:700;text-decoration:none">Voir l'abonnement</a></div>
    </td></tr></table>
  </td></tr>`);
  H.push(`<tr><td style="${POLICE};padding:22px 4px 0;font-size:12px;line-height:1.55;color:${DOUX}">
    Les montants sont ceux des documents. Les résumés sont générés par IA à partir des sommaires décisionnels ; chaque lien mène au PDF officiel de la Ville, qui fait foi.
    <a href="${SITE}decisions.html" style="color:${DOUX}">Toutes les décisions</a> · site indépendant, sans publicité, aucun caractère officiel.
  </td></tr>`);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ce que la Ville de Québec a décidé ${echapper(nomPeriode)}</title></head>` +
    `<body style="margin:0;padding:0;background:#EEF1F4"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#EEF1F4"><tr><td align="center" style="padding:20px 10px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:660px;background:#F8FAFB;border-radius:12px"><tr><td style="padding:0 0 26px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${H[0]}</table>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:0 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${H.slice(1).join('')}</table></td></tr></table>` +
    `</td></tr></table></td></tr></table></body></html>`;
  };
  const page = pageHtml(false);
  const pageAbonnes = pageHtml(true);

  await mkdir(SORTIE, { recursive: true });
  await writeFile(new URL(`${fichier}.md`, SORTIE), md, 'utf8');
  await writeFile(new URL(`${fichier}.html`, SORTIE), page, 'utf8');
  await writeFile(new URL(`${fichier}-abonnes.html`, SORTIE), pageAbonnes, 'utf8');
  console.log(`${nomPeriode} : ${liste.length} dossiers, ${nbSeances} séances, ${subventions.length} subventions, ${contrats.length} contrats, ${nbVotesDivises} votes divisés${mot.length ? ', mot du mois inclus' : ''}.`);
  console.log(`→ infolettres/${fichier}.html (gratuit), ${fichier}-abonnes.html et ${fichier}.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
