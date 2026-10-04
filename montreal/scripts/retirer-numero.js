// Retire de la diffusion un numéro publié par erreur (table infolettre_numeros, Supabase).
//
// Sert quand un courriel est parti alors qu'il n'aurait pas dû — un compte rendu vide, par
// exemple. Le retirer n'annule pas les envois déjà faits : il empêche les envois à venir, et
// surtout il cesse d'être le numéro que reçoit chaque nouvel inscrit.
//
// On ne supprime pas la ligne : on vide publie_le. Les deux requêtes qui servent un numéro
// (api/_infolettre.js) filtrent sur publie_le=not.is.null, donc la ligne disparaît de la
// diffusion tout en gardant son compte d'envois. C'est aussi réversible, et le rôle
// service_role n'a pas le droit DELETE sur cette table (403 du 4 octobre 2026).
//
//   node scripts/retirer-numero.js --mois=2026-09              dit ce qu'il retirerait
//   node scripts/retirer-numero.js --mois=2026-09 --retirer    retire pour de vrai
//   node scripts/retirer-numero.js --seance=2026-08-24 --instance=verdun --retirer
//
// Demande SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (api.env, ou les secrets du workflow).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INSTANCES } from './infolettre.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((r) => {
  const [c, v] = r.replace(/^--/, '').split('=');
  return [c, v === undefined ? true : v];
}));

const VILLE = 'montreal';
if (!args.mois && !args.seance) throw new Error('Il faut --mois=AAAA-MM ou --seance=AAAA-MM-JJ.');
const instance = INSTANCES[args.instance ?? 'conseil'];
if (!instance) throw new Error(`--instance=${args.instance} inconnue.`);
const cle = args.seance
  ? { ville: VILLE, type: instance.type, arrondissement: instance.arrondissement, mois: args.seance }
  : { ville: VILLE, type: 'mensuel', arrondissement: '', mois: args.mois };

if (!process.env.SUPABASE_URL) {
  const racine = fileURLToPath(new URL('../', import.meta.url));
  const f = [`${racine}api.env`, `${racine}../api.env`].find((x) => existsSync(x));
  if (f) process.loadEnvFile(f);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent (api.env).');

const h = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const url = `${SUPABASE_URL}/rest/v1/infolettre_numeros`;
// La clé de la table inclut la langue : les deux éditions d'un même numéro partent ensemble.
const filtre = `ville=eq.${cle.ville}&type=eq.${cle.type}&arrondissement=eq.${cle.arrondissement}&mois=eq.${cle.mois}`;

const trouves = await fetch(`${url}?${filtre}&select=langue,titre,publie_le,envoye_le,envoyes`, { headers: h })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Supabase ${r.status} ${(r.statusText ?? '')}`))));

if (!trouves.length) { console.log(`Aucun numéro publié pour ${cle.type} ${cle.mois}. Rien à retirer.`); process.exit(0); }
for (const n of trouves) {
  console.log(`${n.langue} · ${n.titre}`);
  console.log(`   publié le ${n.publie_le ?? '—'} · envoyé le ${n.envoye_le ?? 'jamais'} · ${n.envoyes ?? 0} personne(s)`);
}
if (!args.retirer) { console.log('\nEssai seulement. Ajouter --retirer pour le faire.'); process.exit(0); }

const r = await fetch(`${url}?${filtre}`, {
  method: 'PATCH',
  headers: { ...h, Prefer: 'return=minimal' },
  // envoye_le et envoyes repartent à zéro : un numéro retiré est un numéro qui n'a jamais paru.
  // Sans ça, infolettre.js refuserait de republier ce mois plus tard (« déjà parti vers N
  // personne(s) : on ne le remplace pas ») — or c'est précisément ce qu'on veut pouvoir faire.
  body: JSON.stringify({ publie_le: null, envoye_le: null, envoyes: 0, updated_at: new Date().toISOString() }),
});
if (!r.ok) throw new Error(`Retrait → ${r.status} ${(await r.text()).slice(0, 200)}`);
console.log(`\nRetiré de la diffusion : ${trouves.length} édition(s) de ${cle.type} ${cle.mois}. Plus aucun nouvel inscrit ne le recevra.`);
