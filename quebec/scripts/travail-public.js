// « Le travail derrière le site » — les chiffres de la page /abonnement, pour cette ville.
//
//   node scripts/travail-public.js   → data/travail.json (quelques centaines d'octets)
//
// La page Abonnement est commune à toutes les villes : venue d'un volet (?ville=quebec), elle
// n'affiche que les chiffres de cette ville ; sinon, ceux de toutes les villes. Elle ne lit
// que ce petit fichier, jamais les décisions complètes.
//
// Que des comptes tirés des données publiées, rien d'estimé. FORMAT COMMUN À TOUTES LES VILLES :
//   { generatedAt, ville, nom, annee,
//     documents: { total, resolutions, sommaires, procesVerbaux, autres },
//     parMois: [12],               documents datés de l'année, par mois
//     resumes,                     documents expliqués en langage clair
//     votes,                       votes nominatifs recensés
//     dossiers: { termines, enCours },
//     projets: { n },              projets suivables définis et relus à la main
//     retiresAvantPublication }    éléments retirés des récapitulatifs de projets par la vérification

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const lire = async (f, repli) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return repli;
  }
};

const decisions = await lire('data/decisions.json', null);
if (!decisions?.decisions) {
  console.error('data/decisions.json introuvable.');
  process.exit(1);
}
const [resumes, votes, recaps, projets] = await Promise.all([
  lire('data/resumes.json', {}),
  lire('data/votes.json', {}),
  lire('data/projets-recaps.json', {}),
  lire('data/projets/index.json', {}),
]);

const docs = decisions.decisions;
const annee = Number((docs.map((d) => d.date).filter(Boolean).sort().pop() ?? new Date().toISOString()).slice(0, 4));
const compter = (type) => docs.filter((d) => d.type === type).length;
const parMois = Array(12).fill(0);
for (const d of docs) if (d.date?.startsWith(String(annee))) parMois[Number(d.date.slice(5, 7)) - 1]++;
const sommaires = docs.filter((d) => d.type === 'Sommaires et mémoires');

const travail = {
  generatedAt: new Date().toISOString(),
  ville: 'quebec',
  nom: 'Québec',
  annee,
  documents: {
    total: docs.length,
    resolutions: compter('Résolutions'),
    sommaires: sommaires.length,
    procesVerbaux: compter('Procès-verbaux'),
    autres: docs.length - compter('Résolutions') - sommaires.length - compter('Procès-verbaux'),
  },
  parMois,
  resumes: (resumes.resumes ?? []).filter((r) => r.puces?.length && !r.sansContenuSubstantiel).length,
  votes: votes.nombre ?? (votes.votes ?? []).length,
  dossiers: {
    termines: sommaires.filter((d) => d.statutDossier === 'termine').length,
    enCours: sommaires.filter((d) => d.statutDossier === 'en_cours').length,
  },
  projets: { n: Object.values(projets.projets ?? {}).filter((p) => p.dossiers > 0).length },
  retiresAvantPublication: Object.values(recaps.recaps ?? {}).reduce(
    (n, r) => n + (r.verification?.retiresMecanique?.length ?? 0) + (r.verification?.retiresContreLecture?.length ?? 0),
    0
  ),
};

await writeFile('data/travail.json', JSON.stringify(travail, null, 1), 'utf8');
console.log(`Travail public : ${travail.documents.total} documents, ${travail.resumes} résumés, ${travail.votes} votes, ${travail.projets.n} projets.`);
