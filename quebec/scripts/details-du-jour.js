// Le détail de l'argent pour les nouveaux dossiers — l'étape du matin (scripts/refresh.js).
//
//   node --env-file=../api.env scripts/details-du-jour.js                 les nouveaux du jour
//   node --env-file=../api.env scripts/details-du-jour.js --projets       + les dossiers des projets
//   node --env-file=../api.env scripts/details-du-jour.js --plafond=60 --essai
//
// Ce qui est lu : les sommaires dont le résumé en langage clair a trouvé un montant
// (montantPrincipal), et
//   - dont le résumé a été produit depuis --genere-depuis (par défaut : les trois derniers jours,
//     jamais avant DEBUT) — ce sont les nouveaux dossiers de la Ville ;
//   - avec --projets : tous les dossiers des projets suivables (data/projets/), quelle que soit
//     leur date.
// Ce qui est sauté : ce qui est déjà dans Supabase (details_argent, utilisable ou non) ou dans le
// cache local. Au plus --plafond documents par exécution (30 par défaut, ~8 $ US au pire) : un
// jour chargé se rattrape le lendemain.
//
// EN PREMIER : les demandes des abonnés (table demandes_details, « Demander ce détail » sur une
// fiche), les plus anciennes d'abord, dans le même plafond. Une demande est notée traitée
// (traite_le, resultat) quand le détail est lu (« lu »), l'était déjà (« deja-lu ») ou que le
// résumé n'a pas de montant (« sans-montant ») ; une lecture qui échoue reste en attente.
//
// Décidé le 14 sept. 2026 : les projets suivis tout de suite, puis les nouveaux chaque matin. Le
// reste de 2026 (~845 dossiers, ~235 $) attend qu'il y ait des abonnés pour le financer — ne pas
// élargir la fenêtre sans en reparler.
//
// Sans clé Anthropic ou sans clés Supabase, l'étape est sautée : sans Supabase, on ne saurait pas
// ce qui a déjà été lu, et on repaierait tout.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chargerCles } from './publier-details.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const VILLE = 'quebec';
const DEBUT = '2026-09-15'; // avant : l'échantillon de l'infolettre et le lot initial des résumés
const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const plafond = Number(args.get('plafond') ?? 30);
const troisJours = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
const genereDepuis = String(args.get('genere-depuis') ?? (troisJours > DEBUT ? troisJours : DEBUT));

const lire = async (f, repli) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return repli;
  }
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Détail de l'argent : sauté, pas de clé ANTHROPIC_API_KEY.");
    return;
  }
  if (!chargerCles()) {
    console.log("Détail de l'argent : sauté, SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent (on ne saurait pas ce qui est déjà lu).");
    return;
  }

  // Déjà lus : Supabase (la référence, aussi en CI) et le cache local.
  const deja = new Set();
  for (let debut = 0; ; debut += 1000) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/details_argent?ville=eq.${VILLE}&select=dossier_id`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Range: `${debut}-${debut + 999}` },
    });
    if (!res.ok) throw new Error(`details_argent → ${res.status} ${await res.text()}`);
    const lot = await res.json();
    for (const r of lot) deja.add(r.dossier_id);
    if (lot.length < 1000) break;
  }
  const { details: cache = [] } = await lire('data/details.json', {});
  for (const d of cache) if (d.verification?.version >= 2) deja.add(d.id);

  const { resumes = [] } = await lire('data/resumes.json', {});
  const avecMontant = new Map(resumes.filter((r) => r.montantPrincipal && !r.sansContenuSubstantiel).map((r) => [r.id, r]));

  const candidats = new Map(); // id → date, pour lire les plus récents d'abord
  for (const r of avecMontant.values()) {
    if ((r.genereLe ?? '') >= genereDepuis) candidats.set(r.id, r.date ?? '');
  }
  if (args.has('projets')) {
    for (const f of (await readdir('data/projets').catch(() => [])).filter((f) => f !== 'index.json')) {
      const projet = await lire(`data/projets/${f}`, { dossiers: [] });
      for (const d of projet.dossiers) {
        const id = `${d.numero}.pdf`;
        if (avecMontant.has(id)) candidats.set(id, avecMontant.get(id).date ?? '');
      }
    }
  }

  // Les demandes des abonnés, avant tout le reste.
  const demandes = await demandesEnAttente();
  const demandees = [...new Set(demandes.map((d) => d.dossier_id))];
  const traiter = async (ids, resultat) => {
    if (!ids.length || args.has('essai')) return;
    await marquerTraitees(ids, resultat).catch((err) => console.warn(`⚠ Demandes non marquées (${resultat}) : ${err.message}`));
  };
  await traiter(demandees.filter((id) => deja.has(id)), 'deja-lu');
  await traiter(demandees.filter((id) => !deja.has(id) && !avecMontant.has(id)), 'sans-montant');
  const prioritaires = demandees.filter((id) => !deja.has(id) && avecMontant.has(id));

  const aFaire = [...candidats].filter(([id]) => !deja.has(id) && !prioritaires.includes(id)).sort((a, b) => b[1].localeCompare(a[1]));
  const lot = [...prioritaires, ...aFaire.map(([id]) => id)].slice(0, plafond).map((id) => id.replace(/\.pdf$/, ''));
  console.log(`Détail de l'argent : ${demandes.length} demande(s) d'abonnés (${prioritaires.length} à lire), ${candidats.size} candidat(s) (résumés depuis ${genereDepuis}${args.has('projets') ? ' + projets' : ''}), ${deja.size} déjà lu(s), ${aFaire.length} à faire, ${lot.length} cette fois (plafond ${plafond}).`);
  if (!lot.length || args.has('essai')) {
    if (args.has('essai')) console.log(`--essai : rien d'extrait. Premiers : ${lot.slice(0, 10).join(', ')}`);
    return;
  }

  const { extraireDetails, VERSION_VERIFICATION } = await import('../scrapers/details-argent.js');
  const parId = await extraireDetails(lot);
  await traiter(prioritaires.filter((id) => lot.includes(id.replace(/\.pdf$/, '')) && parId.get(id)?.verification?.version === VERSION_VERIFICATION), 'lu');
}

const entetesSupabase = () => ({ apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` });

// Sans la table (SQL pas encore exécuté), aucune demande : l'étape continue comme avant.
async function demandesEnAttente() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes_details?ville=eq.${VILLE}&traite_le=is.null&select=dossier_id,created_at&order=created_at`, { headers: entetesSupabase() });
  if (!res.ok) {
    console.warn(`⚠ Demandes d'abonnés ignorées : demandes_details → ${res.status}`);
    return [];
  }
  return res.json();
}

async function marquerTraitees(ids, resultat) {
  const liste = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/demandes_details?ville=eq.${VILLE}&traite_le=is.null&dossier_id=in.(${encodeURIComponent(liste)})`, {
    method: 'PATCH',
    headers: { ...entetesSupabase(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ traite_le: new Date().toISOString(), resultat }),
  });
  if (!res.ok) throw new Error(`demandes_details → ${res.status} ${await res.text()}`);
  console.log(`Demandes d'abonnés « ${resultat} » : ${ids.length}.`);
}

await main();
