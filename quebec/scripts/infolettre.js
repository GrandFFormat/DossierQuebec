// Brouillon du compte rendu hebdomadaire — l'infolettre municipale.
//
//   npm run infolettre                         la semaine écoulée (7 jours jusqu'à aujourd'hui)
//   npm run infolettre -- --depuis=2026-09-01 --jusqua=2026-09-08
//
// Tout vient des données déjà extraites — aucun appel à la Ville, aucun appel IA : les
// compteurs, les montants, les votes divisés, les subventions, les cinq décisions les plus
// lourdes, chacune avec son lien. On relit, on écrit l'introduction à la main, on envoie.
// Le brouillon est écrit dans infolettres/AAAA-MM-JJ.md et .html (courriel, styles en ligne).
//
// Une même décision traverse plusieurs documents — le sommaire, la résolution du comité
// exécutif, celle du conseil. On regroupe tout par sommaire pour ne la compter qu'une fois,
// et on dit quelles instances l'ont vue passer.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DATA = new URL('../data/', import.meta.url);
const SORTIE = new URL('../infolettres/', import.meta.url);
const SITE = 'https://dossierquebec.ca/quebec/';

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateFr = (iso) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]} ${a}`;
};
const dateCourte = (iso) => {
  const [, m, j] = iso.split('-').map(Number);
  return `${j} ${MOIS[m - 1]}`;
};
const nombreFr = (n) => Number(n).toLocaleString('fr-CA');
const argent = (n) =>
  n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString('fr-CA')} M$` : `${nombreFr(Math.round(n))} $`;

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

async function main() {
  const args = parseArgs(process.argv);
  const jusqua = args.jusqua ?? new Date().toISOString().slice(0, 10);
  const depuis = args.depuis ?? new Date(new Date(jusqua + 'T00:00:00Z').getTime() - 6 * 864e5).toISOString().slice(0, 10);

  const [decisions, resumes] = await Promise.all([lire('decisions'), lire('resumes')]);
  const THEMES = decisions.themes;
  const resumeParId = new Map(resumes.resumes.map((r) => [r.id, r]));
  const dansFenetre = (d) => d.date >= depuis && d.date <= jusqua;

  // Les documents de la semaine. Les procès-verbaux et tableaux des décisions signalent une
  // séance mais ne sont pas des décisions : on s'en sert pour la liste des séances, pas pour
  // les dossiers.
  const tous = decisions.decisions.filter(dansFenetre);
  const docs = tous.filter((d) => d.type !== 'Procès-verbaux' && d.type !== 'Tableaux des décisions');

  // Les séances : une par instance et par date, avec le nombre de résolutions publiées. Le
  // portail publie les résolutions du comité exécutif quelques jours après la séance : il
  // arrive qu'on n'ait encore que le tableau des décisions.
  const seances = new Map();
  for (const d of tous) {
    if (!d.instance) continue;
    const cle = d.instance + '|' + d.date;
    if (!seances.has(cle)) seances.set(cle, 0);
    if (d.type === 'Résolutions') seances.set(cle, seances.get(cle) + 1);
  }
  const court = (s, n = 130) => (s ?? '').length > n ? (s ?? '').slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s ?? '';

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

  // Les montants : on écarte les dépôts de rapports et de listes, qui parlent d'argent sans
  // rien décider.
  const decidant = (f) => f.theme !== 'procedure' && !/prise d'acte|d[ée]p[ôo]t (?:de la|des|du)/i.test(f.objet ?? '');
  const parMontant = (a, b) => (b.montant ?? 0) - (a.montant ?? 0);
  const lourdes = liste.filter((f) => f.montant != null && decidant(f)).sort(parMontant).slice(0, 6);
  const subventions = liste.filter((f) => f.theme === 'subventions' && decidant(f)).sort(parMontant);
  const contrats = liste.filter((f) => f.theme === 'contrats' && f.montant != null && decidant(f)).sort(parMontant);
  const totalSubventions = subventions.reduce((n, f) => n + (f.montant ?? 0), 0);
  const parTheme = new Map();
  for (const f of liste) if (f.theme) parTheme.set(f.theme, (parTheme.get(f.theme) ?? 0) + 1);

  // ---------- Markdown ----------
  const L = [];
  L.push(`# Ce que la Ville de Québec a décidé — semaine du ${dateFr(depuis)} au ${dateFr(jusqua)}`);
  L.push('');
  L.push(`*[Introduction à écrire à la main : deux ou trois phrases sur ce qui ressort.]*`);
  L.push('');
  L.push(`**${nombreFr(liste.length)} dossiers** cette semaine, dans ${nombreFr(docs.length)} documents : ` +
    [...seances.entries()]
      .sort((a, b) => a[0].split('|')[1].localeCompare(b[0].split('|')[1]))
      .map(([cle, n]) => { const [i, date] = cle.split('|'); return `${INSTANCE_COURTE(i)} (${dateCourte(date)}, ${n ? n + ' résolutions' : 'résolutions à venir'})`; })
      .join(' · ') + '.');
  L.push('');

  // L'ARGENT, EN DÉTAIL. C'est là que le lecteur se perd dans un PDF : qui reçoit, pour
  // quoi, d'où vient l'argent, jusqu'à quand. Le résumé en langage clair le dit déjà en
  // quelques puces — on les donne, plutôt que le seul titre administratif. La première puce
  // sert de phrase principale, les suivantes de détail.
  const ouVu = (f) => ([...f.instances].length ? [...f.instances].join(', ') : `sommaire du ${dateCourte(f.dates[0])}`);
  const detailler = (f, nPuces) => {
    const puces = f.resume?.puces ?? [];
    const principale = puces[0] ?? court(f.objet, 160);
    L.push(`- **${f.montant != null ? argent(f.montant) : 'Montant non précisé'}** — ${principale} *(${ouVu(f)})* [${f.numero}](${f.pdf})`);
    for (const p of puces.slice(1, 1 + nPuces)) L.push(`  - ${p}`);
  };

  L.push('## Les plus gros montants de la semaine');
  L.push('');
  for (const f of lourdes) detailler(f, 3);
  if (!lourdes.length) L.push('Aucun montant relevé dans les résumés de la semaine.');
  L.push('');

  L.push(`## Les subventions (${subventions.length}${totalSubventions ? `, ${argent(totalSubventions)} au total` : ''})`);
  L.push('');
  // Ce qui figure déjà parmi les plus gros montants n'est pas répété.
  const dejaVues = new Set(lourdes.map((f) => f.cle));
  for (const f of subventions.filter((f) => !dejaVues.has(f.cle)).slice(0, 10)) detailler(f, 2);
  const resteSub = subventions.filter((f) => !dejaVues.has(f.cle)).length - 10;
  if (resteSub > 0) L.push(`- … et ${resteSub} autre${resteSub > 1 ? 's' : ''} : [toutes les décisions de la semaine](${SITE}decisions.html)`);
  if (!subventions.length) L.push('Aucune cette semaine.');
  L.push('');

  L.push(`## Les contrats (${contrats.length} avec un montant)`);
  L.push('');
  for (const f of contrats.filter((f) => !dejaVues.has(f.cle)).slice(0, 8)) detailler(f, 2);
  const resteCon = contrats.filter((f) => !dejaVues.has(f.cle)).length - 8;
  if (resteCon > 0) L.push(`- … et ${resteCon} autre${resteCon > 1 ? 's' : ''} : [toutes les décisions de la semaine](${SITE}decisions.html)`);
  if (!contrats.length) L.push('Aucun cette semaine.');
  L.push('');

  L.push('## De quoi on a parlé');
  L.push('');
  L.push([...parTheme.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${THEMES[t]?.libelle ?? t} (${n})`).join(' · '));
  L.push('');
  L.push('---');
  L.push('');
  L.push(`Les montants sont ceux des documents — des plafonds et des estimations, pas des factures. Chaque lien mène au PDF officiel de la Ville. Site : ${SITE} — indépendant, sans publicité, aucun caractère officiel.`);

  const md = L.join('\n');

  // ---------- HTML pour le courriel (styles en ligne, rien d'externe) ----------
  const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const enLigne = (s) =>
    echapper(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0B8A4B">$1</a>');
  // Listes à deux niveaux : « - » puis « (deux espaces)- » pour le détail sous un montant.
  const html = [];
  const lignes = md.split('\n');
  for (let i = 0; i < lignes.length; ) {
    const ligne = lignes[i];
    if (ligne.startsWith('- ')) {
      html.push('<ul style="padding-left:20px;margin:0 0 16px">');
      while (i < lignes.length && lignes[i].startsWith('- ')) {
        let item = `<li style="margin:0 0 10px;line-height:1.5">${enLigne(lignes[i].slice(2))}`;
        i++;
        const sous = [];
        while (i < lignes.length && lignes[i].startsWith('  - ')) {
          sous.push(`<li style="margin:0 0 4px;line-height:1.45">${enLigne(lignes[i].slice(4))}</li>`);
          i++;
        }
        if (sous.length) item += `<ul style="padding-left:18px;margin:6px 0 0;color:#4b5563;font-size:14px">${sous.join('')}</ul>`;
        html.push(item + '</li>');
      }
      html.push('</ul>');
      continue;
    }
    if (ligne.startsWith('# ')) html.push(`<h1 style="font-size:22px;margin:0 0 12px">${enLigne(ligne.slice(2))}</h1>`);
    else if (ligne.startsWith('## ')) html.push(`<h2 style="font-size:17px;margin:22px 0 8px">${enLigne(ligne.slice(3))}</h2>`);
    else if (ligne === '---') html.push('<hr style="border:0;border-top:1px solid #ddd;margin:20px 0">');
    else if (ligne.trim()) html.push(`<p style="margin:0 0 12px;line-height:1.55">${enLigne(ligne)}</p>`);
    i++;
  }
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Infolettre — semaine du ${dateFr(depuis)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#fff;color:#16191D;font-family:system-ui,-apple-system,sans-serif;font-size:15px"><div style="max-width:640px;margin:0 auto">${html.join('\n')}</div></body></html>`;

  await mkdir(SORTIE, { recursive: true });
  await writeFile(new URL(`${jusqua}.md`, SORTIE), md, 'utf8');
  await writeFile(new URL(`${jusqua}.html`, SORTIE), page, 'utf8');
  console.log(md);
  console.log(`\n→ infolettres/${jusqua}.md et .html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
