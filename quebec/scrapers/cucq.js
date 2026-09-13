// Les membres de la Commission d'urbanisme et de conservation de Québec (CUCQ).
//
//   node scrapers/cucq.js [--year=2026]
//
// Même méthode que pour le conseil d'agglomération : la Ville ne publie pas de page
// « membres » pour cette commission, mais chaque procès-verbal s'ouvre sur une liste de
// présences en trois blocs — « Membres votant », « Membres substituts », « Assistent
// également » — avec, pour les élus, leur fonction (conseiller municipal, président,
// vice-présidente). On ne retient que les deux premiers blocs : le troisième, ce sont les
// fonctionnaires qui assistent la commission, pas ses membres.
//
// La commission siège à peu près chaque semaine ; ses décisions sont les résolutions
// « C.U. » qu'on trouve dans la page Décisions sous son nom.

import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { search, searchAll, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';

const OUT = new URL('../data/cucq.json', import.meta.url);
export const INSTANCE = "Commission d'urbanisme et de conservation de Québec";

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// Les marqueurs de statut, au singulier comme au pluriel, au masculin comme au féminin —
// « Est absente : Mme Marylou Boulianne » est une liste d'une personne, pas un titre.
const STATUT = /(?:Sont|Est)\s+(pr[ée]sente?s?|absente?s?)\s*:/gi;

// « M. Alexandre Laprise, partiellement (à partir de 13 h 45) »
// « Mme Marylou Boulianne, conseillère municipale et vice-présidente »
function parserEntree(entree) {
  const m = entree.match(/^(M\.|Mme)\s+([^,]+?)\s*(?:,\s*(.*))?$/);
  if (!m) return null;
  const [, civilite, nom, reste = ''] = m;
  // ⚠ `\w` ne couvre pas les accents : « conseillère » et « présidente » demandent une
  // classe explicite (voir scrapers/agglomeration.js, où l'oubli effaçait les femmes).
  return {
    civilite,
    nom: nom.trim(),
    elu: /conseill[a-zà-ÿ]*\s+municipal/i.test(reste),
    roles: [
      /\bvice-pr[ée]sident/i.test(reste) ? 'vice-présidence' : null,
      /(?:^|\s|et\s)pr[ée]sident/i.test(reste.replace(/vice-pr[ée]sidente?/gi, '')) ? 'présidence' : null,
    ].filter(Boolean),
    partiel: /partiellement/i.test(reste),
  };
}

// Découpe la liste de présences d'un procès-verbal en entrées, chacune avec sa catégorie
// (votant ou substitut) et son statut (présent ou absent).
export function analyserPresences(contenu) {
  const texte = (contenu ?? '').replace(/ /g, ' ');
  const debut = texte.search(/Membres\s+votant/i);
  if (debut < 0) return null;
  let fin = texte.search(/Assistent\s+[ée]galement/i);
  if (fin < debut) fin = texte.search(/1\.\s*Ouverture/i);
  if (fin < debut) fin = texte.length;
  const bloc = texte.slice(debut, fin);

  const entrees = [];
  const categories = bloc.split(/Membres\s+substituts/i);
  categories.forEach((partie, i) => {
    const categorie = i === 0 ? 'votant' : 'substitut';
    // Chaque statut court jusqu'au statut suivant.
    const morceaux = partie.split(STATUT);
    // split avec un groupe capturant : [avant, statut1, liste1, statut2, liste2, …]
    for (let j = 1; j < morceaux.length; j += 2) {
      const statut = /^pr/i.test(morceaux[j]) ? 'present' : 'absent';
      const lignes = morceaux[j + 1]
        .replace(/\r/g, '')
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => /^(M\.|Mme)\s/.test(l));
      for (const ligne of lignes) {
        const e = parserEntree(ligne);
        if (e) entrees.push({ ...e, categorie, statut });
      }
    }
  });
  return entrees;
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year ?? String(new Date().getFullYear());

  const filter =
    `Annee eq '${year}' and Instance eq '${encodeFieldValue(INSTANCE)}' and Type eq '${encodeFieldValue('Procès-verbaux')}'`;
  const total = (await search({ filter, top: 0, count: true }))['@odata.count'] ?? 0;
  console.log(`Procès-verbaux de la CUCQ ${year} : ${total}`);

  const gens = new Map();
  let seances = 0;
  let derniere = null;
  const select = 'content,Date,Numero,metadata_storage_name';
  for await (const row of searchAll({ filter, select, orderby: 'Date desc, Numero asc' }, { pageSize: 50, max: Infinity })) {
    const entrees = analyserPresences(row.content);
    if (!entrees) {
      console.warn(`⚠ ${row.metadata_storage_name} : pas de liste de présences reconnue.`);
      continue;
    }
    seances++;
    derniere ??= { date: row.Date, pdf: PDF_BASE + row.metadata_storage_name };

    for (const e of entrees) {
      if (!gens.has(e.nom)) {
        // Les procès-verbaux arrivent du plus récent au plus ancien : la catégorie et la
        // civilité retenues sont celles de la dernière séance où la personne figure.
        gens.set(e.nom, { nom: e.nom, civilite: e.civilite, categorie: e.categorie, elu: false, roles: new Set(), presences: 0, absences: 0, partielles: 0 });
      }
      const fiche = gens.get(e.nom);
      if (e.elu) fiche.elu = true;
      for (const r of e.roles) fiche.roles.add(r);
      if (e.statut === 'present') {
        fiche.presences++;
        if (e.partiel) fiche.partielles++;
      } else fiche.absences++;
    }
  }

  // Votants avant substituts ; présidence, puis vice-présidence, puis les autres par assiduité.
  const ORDRE_ROLE = { présidence: 0, 'vice-présidence': 1 };
  const rang = (m) => Math.min(9, ...m.roles.map((r) => ORDRE_ROLE[r]));
  const membres = [...gens.values()]
    .map((m) => ({ ...m, roles: [...m.roles].sort((a, b) => ORDRE_ROLE[a] - ORDRE_ROLE[b]), seances: m.presences + m.absences }))
    .sort(
      (a, b) =>
        (a.categorie === 'substitut') - (b.categorie === 'substitut') ||
        rang(a) - rang(b) ||
        b.presences - a.presences ||
        a.nom.localeCompare(b.nom)
    );

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    instance: INSTANCE,
    methode:
      'Reconstitué à partir des listes de présences des procès-verbaux de la commission (blocs « Membres votant » et ' +
      '« Membres substituts »). La Ville ne publie pas de page « membres » pour cette commission ; ' +
      'les fonctionnaires qui « assistent également » aux séances ne sont pas comptés.',
    parametres: { annee: year },
    seancesAnalysees: seances,
    derniereSeance: derniere,
    nombre: membres.length,
    votants: membres.filter((m) => m.categorie === 'votant').length,
    substituts: membres.filter((m) => m.categorie === 'substitut').length,
    membres,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${seances} séances analysées, ${membres.length} membres identifiés (${payload.votants} votants, ${payload.substituts} substituts).\n`);
  for (const m of membres) {
    const etiquettes = [m.elu ? 'élu·e' : null, ...m.roles].filter(Boolean).join(', ');
    console.log(
      `  ${String(m.presences).padStart(2)}/${String(m.seances).padStart(2)}  ${m.nom.padEnd(28)} ${m.categorie.padEnd(9)} ${etiquettes}`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
