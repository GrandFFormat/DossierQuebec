// Les membres du conseil d'agglomération de Québec.
//
//   node scrapers/agglomeration.js [--year=2026]
//
// Pourquoi un scraper séparé : la Ville ne publie pas de page « membres » pour ce conseil,
// contrairement au conseil municipal. Mais chaque procès-verbal s'ouvre sur la liste des
// présences, avec pour chacun sa fonction, SA VILLE, et le cas échéant la personne qu'il
// remplace. C'est la seule source structurée qui existe, et elle est officielle.
//
// Ce conseil réunit une délégation de la Ville de Québec et les villes reconstituées de
// l'agglomération — L'Ancienne-Lorette et Saint-Augustin-de-Desmaures. Ses membres ne
// siègent PAS au conseil municipal de Québec : ce sont deux instances distinctes.

import { writeFile } from 'node:fs/promises';
import { search, searchAll, decode, encodeFieldValue, PDF_BASE, PORTAL } from '../lib/gpd.js';

const OUT = new URL('../data/agglomeration.json', import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// Les entrées sont coupées en plein milieu par la mise en page du PDF, y compris à
// l'intérieur d'un nom composé (« Saint-Augustin-\nde-Desmaures »). On recolle avant
// toute analyse.
function recoller(bloc) {
  return bloc
    .replace(/ /g, ' ')
    .replace(/-\s*\n\s*/g, '-') // trait d'union en fin de ligne
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraireBloc(texte, debut) {
  // `debut` peut contenir une alternation : on la groupe, sinon le numéro du groupe
  // capturant se décale et on récupère `undefined`.
  const re = new RegExp(
    '(?:' + debut + ')\\s*:?\\s*([\\s\\S]*?)(?=Sont\\s+(?:également\\s+)?(?:présents|absentes?|absents)|Ouverture de la séance|$)',
    'i'
  );
  const m = texte.match(re);
  return m ? recoller(m[1]) : null;
}

// « M. Richard Levesque, conseiller de la Ville de Saint-Augustin-de-Desmaures,
//   en remplacement du maire Sylvain Juneau »
function parserEntrees(bloc) {
  if (!bloc) return [];
  return bloc
    .split(/(?=\b(?:M\.|Mme)\s)/)
    .map((s) => s.trim())
    .filter((s) => /^(M\.|Mme)\s/.test(s))
    .map((entree) => {
      // ⚠ Piège : `\w` ne couvre PAS les lettres accentuées. Écrire `conseill\w+` attrape
      // « conseiller » mais jamais « conseillère » — ce qui revient à effacer toutes les
      // femmes de la liste. D'où la classe explicite avec la plage accentuée.
      const m = entree.match(
        /^(M\.|Mme)\s+(.+?),\s*(conseill[a-zà-ÿ]*|mairesse|maire|greffi[a-zà-ÿ]*|directeur[a-zà-ÿ]*|directrice|assistante?-greffi[a-zà-ÿ]*)\b\s*(?:de la Ville d[eu']?\s*(.+?))?(?:,\s*(.*))?$/i
      );
      if (!m) return { brut: entree, nom: null, fonction: null, ville: null, roles: [] };

      const [, civilite, nom, fonction, ville, reste] = m;
      const roles = (reste ?? '')
        .split(/,\s*/)
        .map((r) => r.replace(/\.$/, '').trim())
        .filter(Boolean)
        // Filtre positif : après la liste, certains procès-verbaux glissent une note sur
        // la participation par visioconférence, dont les fragments ressemblent à des noms.
        // On ne retient donc que ce qui EST une fonction connue, plutôt que d'essayer
        // d'exclure tout ce qui n'en est pas.
        .filter(
          (r) =>
            r.length <= 70 &&
            /pr[ée]sident|vice-pr[ée]sident|suppl[ée]ant|opposition|visioconf[ée]rence|partie de s[ée]ance|en remplacement/i.test(r)
        );

      const remplacement = roles.find((r) => /^en remplacement/i.test(r)) ?? null;
      return {
        civilite,
        nom: nom.trim(),
        fonction: fonction.toLowerCase(),
        ville: ville ? ville.replace(/\.$/, '').trim() : null,
        roles: roles.filter((r) => !/^en remplacement/i.test(r)),
        remplace: remplacement
          ? remplacement.replace(/^en remplacement (?:du|de la|de)\s*(?:maire|mairesse|conseill[a-zà-ÿ]*)?\s*/i, '').trim()
          : null,
        brut: entree,
      };
    });
}

async function main() {
  const args = parseArgs(process.argv);
  const year = args.year ?? String(new Date().getFullYear());

  const filter =
    `Annee eq '${year}' and Type eq '${encodeFieldValue('Procès-verbaux')}'`;
  const requete = '"conseil d\'agglomération"';
  const total = (await search({ search: requete, searchMode: 'all', filter, top: 0, count: true }))['@odata.count'] ?? 0;
  console.log(`Procès-verbaux d'agglomération ${year} : ${total}`);

  const select = 'content,Date,Numero,Instance,metadata_storage_name';
  // Chaque personne est comptée une fois par séance : présences, absences, villes,
  // fonctions et remplacements observés.
  const gens = new Map();
  let seances = 0;

  for await (const row of searchAll({ search: requete, searchMode: 'all', filter, select, orderby: 'Date desc' }, { pageSize: 50, max: Infinity })) {
    const texte = (row.content ?? '').replace(/ /g, ' ');
    if (!/Sont\s+présents/i.test(texte)) continue;
    // Le seul vrai test : l'en-tête du document. Beaucoup de procès-verbaux d'autres
    // conseils mentionnent « conseil d'agglomération » dans le titre d'une résolution.
    if (!/CONSEIL D'AGGLOM/i.test(texte.slice(0, 300))) continue;
    seances++;

    const presents = parserEntrees(extraireBloc(texte, 'Sont\\s+présents'));
    const absents = parserEntrees(extraireBloc(texte, 'Sont\\s+absentes?|Sont\\s+absents'));

    for (const [liste, statut] of [
      [presents, 'present'],
      [absents, 'absent'],
    ]) {
      for (const p of liste) {
        if (!p.nom || !p.fonction) continue;
        // On ne garde que les élus : le greffe et la direction générale assistent aux
        // séances mais ne siègent pas.
        if (!/^(conseill|maire)/i.test(p.fonction)) continue;

        if (!gens.has(p.nom)) {
          gens.set(p.nom, {
            nom: p.nom,
            civilite: p.civilite,
            fonction: p.fonction,
            ville: p.ville,
            presences: 0,
            absences: 0,
            roles: new Set(),
            remplace: new Set(),
          });
        }
        const fiche = gens.get(p.nom);
        if (statut === 'present') fiche.presences++;
        else fiche.absences++;
        if (p.ville) fiche.ville = p.ville;
        for (const r of p.roles) fiche.roles.add(r);
        if (p.remplace) fiche.remplace.add(p.remplace);
      }
    }
  }

  const membres = [...gens.values()]
    .map((m) => ({
      ...m,
      roles: [...m.roles],
      remplace: [...m.remplace],
      seances: m.presences + m.absences,
    }))
    .sort((a, b) => b.presences - a.presences || a.nom.localeCompare(b.nom));

  const villes = {};
  for (const m of membres) if (m.ville) villes[m.ville] = (villes[m.ville] ?? 0) + 1;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PORTAL,
    methode:
      "Reconstitué à partir des listes de présences des procès-verbaux du conseil d'agglomération. " +
      "La Ville ne publie pas de page « membres » pour ce conseil ; la liste de présences en est la seule source structurée.",
    avertissement:
      "Le conseil d'agglomération est distinct du conseil municipal de Québec. Les élus des villes " +
      'reconstituées (L\'Ancienne-Lorette, Saint-Augustin-de-Desmaures) y siègent, mais ne siègent pas ' +
      'au conseil municipal de Québec et ne représentent aucun district de la Ville de Québec.',
    parametres: { annee: year },
    seancesAnalysees: seances,
    nombre: membres.length,
    villes,
    membres,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`\n${seances} séances analysées, ${membres.length} élus identifiés.\n`);
  for (const m of membres) {
    const r = m.remplace.length ? ` — en remplacement de ${m.remplace.join(', ')}` : '';
    const roles = m.roles.length ? ` [${m.roles.join(' / ')}]` : '';
    console.log(
      `  ${String(m.presences).padStart(2)}/${String(m.seances).padStart(2)}  ${m.nom.padEnd(26)} ${m.fonction.padEnd(12)} ${(m.ville ?? '?').padEnd(30)}${roles}${r}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
