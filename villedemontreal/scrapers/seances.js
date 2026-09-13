// Le calendrier des séances : la clé de tout le reste.
//
//   node scrapers/seances.js [--year=2026] [--ajouter=CM:2026-01-26:13h00:ORDI] [--liste=<url>]
//
// Les procès-verbaux et ordres du jour de Montréal ont une URL prévisible — instance,
// type, date, heure (lib/mtl.js) — mais il faut connaître la date et l'heure de chaque
// séance. Trois sources, cumulées :
//
//   1. Le jeu de données ouvert « Calendrier des séances du comité exécutif, conseil
//      municipal et conseil d'agglomération » (CC-BY 4.0), lu par l'API CKAN. Ses colonnes
//      ne sont pas figées : on les reconnaît par famille (instance, date, heure) et on
//      les affiche, pour qu'un changement de schéma se voie tout de suite.
//   2. Une page de liste de la Ville (--liste=<url>), d'où l'on ne prend que les liens
//      qui ressemblent à Adi_Public/CM/CM_PV_ORDI_2026-01-26_13h00_FR.pdf — insensible à la
//      mise en page. Utile pour rattraper une séance absente du calendrier.
//   3. Des séances ajoutées à la main (--ajouter=CM:2026-01-26:13h00:ORDI), pour tester ou
//      corriger sans attendre.
//
// Le fichier data/seances.json est ensuite lu par decisions.js, votes.js et resumes.js.
// Une séance déjà connue n'est jamais retirée par une exécution qui ne la voit plus :
// le calendrier n'est pas une source d'effacement.

import { writeFile, readFile } from 'node:fs/promises';
import { jeu, ressource, lireCsv, texte, INSTANCES, heureFichier, idSeance, PORTAIL_DONNEES } from '../lib/mtl.js';
import { colonne } from '../lib/csv.js';

export const JEU = 'calendrier-seances-comite-executif-conseil-municipal-conseil-agglomeration';
const OUT = new URL('../data/seances.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key in args) args[key] = [].concat(args[key], value);
    else args[key] = value === undefined ? true : value;
  }
  return args;
}

// « Conseil municipal » -> CM, « Comité exécutif » -> CE, « Conseil d'agglomération » -> CG.
export function codeInstance(libelle) {
  const l = String(libelle ?? '').toLowerCase();
  if (/agglom/.test(l)) return 'CG';
  if (/ex[ée]cutif/.test(l)) return 'CE';
  if (/municipal|conseil de (?:la )?ville|\bcm\b/.test(l)) return 'CM';
  if (/^cg$/.test(l.trim())) return 'CG';
  if (/^ce$/.test(l.trim())) return 'CE';
  return null;
}

// Dates telles que les exports les écrivent : 2026-01-26, 26/01/2026, 2026-01-26T13:00:00, 26 janvier 2026.
const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
export function lireDate(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/);
  if (m && MOIS[m[2]]) return `${m[3]}-${String(MOIS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function lireHeure(s, defaut = null) {
  const t = String(s ?? '');
  const m = t.match(/T(\d{2}):(\d{2})/) ?? t.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return defaut;
  return `${m[1].padStart(2, '0')}h${(m[2] ?? '00').padStart(2, '0')}`;
}

// Heures habituelles quand le calendrier ne les donne pas : le conseil municipal siège à
// 13 h, l'agglomération à 17 h, le comité exécutif à 9 h. Une hypothèse, notée comme
// telle (`heureSupposee`) — le scraper de décisions essaie de toute façon l'URL.
const HEURES_HABITUELLES = { CM: '13h00', CG: '17h00', CE: '09h00' };

export function seanceDepuisLigne(ligne, cles) {
  const col = (...frags) => {
    const c = colonne(cles, ...frags);
    return c ? ligne[c] : '';
  };
  const instance = codeInstance(col('instance', 'conseil', 'comite', 'type', 'organisme', 'titre', 'nom'));
  const date = lireDate(col('date de la seance', 'date debut', 'date', 'debut'));
  if (!instance || !date) return null;
  const heureLue = lireHeure(col('heure de debut', 'heure', 'debut', 'date'));
  const titre = [col('titre'), col('type de seance', 'type')].filter(Boolean).join(' — ') || null;
  const variante = /extra/i.test([titre, col('type')].join(' ')) ? 'EXTRA' : 'ORDI';
  const heure = heureLue ?? HEURES_HABITUELLES[instance];
  return {
    id: idSeance({ instance, date, heure }),
    instance,
    nom: INSTANCES[instance].nom,
    date,
    heure,
    heureSupposee: !heureLue,
    variante,
    titre,
    source: 'calendrier',
  };
}

// Les liens de documents dans n'importe quel HTML.
const LIEN_DOCUMENT = /Adi_Public\/(CM|CG|CE)\/\1_(PV|ODJ)(?:_[A-Z]+)?_(ORDI|EXTRA)_(\d{4}-\d{2}-\d{2})_(\d{2}h\d{2})_FR\.pdf/g;
export function seancesDepuisHtml(html) {
  const trouvees = new Map();
  for (const m of String(html ?? '').matchAll(LIEN_DOCUMENT)) {
    const [, instance, , variante, date, heure] = m;
    const id = idSeance({ instance, date, heure });
    if (!trouvees.has(id)) trouvees.set(id, { id, instance, nom: INSTANCES[instance].nom, date, heure, heureSupposee: false, variante, titre: null, source: 'liste' });
  }
  return [...trouvees.values()];
}

async function chargerExistant() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const year = String(args.year ?? new Date().getFullYear());
  const precedent = await chargerExistant();
  const seances = new Map((precedent?.seances ?? []).filter((s) => s.date?.startsWith(year)).map((s) => [s.id, s]));
  const avant = seances.size;

  // 1. Le calendrier.
  let sourceCalendrier = null;
  let colonnes = [];
  try {
    const j = await jeu(JEU);
    const r = ressource(j, 'CSV', year) ?? ressource(j, 'CSV');
    if (!r) throw new Error('aucune ressource CSV');
    sourceCalendrier = r.url;
    console.log(`Calendrier : ${r.url} (modifié ${r.last_modified ?? '?'})`);
    const csv = await lireCsv(r.url);
    colonnes = csv.colonnes;
    console.log(`Colonnes : ${colonnes.join(' | ')}`);
    let lues = 0;
    for (const ligne of csv.lignes) {
      const s = seanceDepuisLigne(ligne, csv.cles);
      if (!s || !s.date.startsWith(year)) continue;
      lues++;
      if (!seances.has(s.id)) seances.set(s.id, s);
      else Object.assign(seances.get(s.id), { titre: s.titre ?? seances.get(s.id).titre });
    }
    console.log(`${lues} séance(s) de ${year} lue(s) dans le calendrier.`);
    if (lues === 0) console.warn('⚠ Aucune séance reconnue : les colonnes du calendrier ont probablement changé (voir la liste ci-dessus).');
  } catch (err) {
    console.warn(`⚠ Calendrier illisible (${err.message}) — on garde les séances déjà connues.`);
  }

  // 2. Une page de liste, si demandé.
  for (const url of [].concat(args.liste ?? [])) {
    const html = await texte(url);
    const trouvees = html ? seancesDepuisHtml(html) : [];
    console.log(`${trouvees.length} séance(s) trouvée(s) dans ${url}`);
    for (const s of trouvees) if (s.date.startsWith(year) && !seances.has(s.id)) seances.set(s.id, s);
  }

  // 3. À la main.
  for (const spec of [].concat(args.ajouter ?? [])) {
    const [instance, date, heure, variante = 'ORDI'] = String(spec).split(':');
    if (!INSTANCES[instance] || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !heureFichier(heure)) {
      console.warn(`⚠ --ajouter ignoré, forme attendue CM:2026-01-26:13h00[:ORDI|EXTRA] : ${spec}`);
      continue;
    }
    const s = { id: idSeance({ instance, date, heure }), instance, nom: INSTANCES[instance].nom, date, heure: heureFichier(heure), heureSupposee: false, variante, titre: null, source: 'manuel' };
    seances.set(s.id, s);
  }

  const liste = [...seances.values()].sort((a, b) => b.date.localeCompare(a.date) || a.instance.localeCompare(b.instance));
  const parInstance = {};
  for (const s of liste) parInstance[s.instance] = (parInstance[s.instance] ?? 0) + 1;

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: sourceCalendrier ?? `${PORTAIL_DONNEES}dataset/${JEU}`,
        colonnesSource: colonnes,
        parametres: { annee: year },
        nombre: liste.length,
        parInstance,
        seances: liste,
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`\n${liste.length} séance(s) de ${year} dans data/seances.json (${liste.length - avant} de plus qu'avant) — ` + Object.entries(parInstance).map(([k, n]) => `${k} : ${n}`).join(', '));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
