// Publie tout seuls les courriels de Montréal (1er oct. 2026), comme quebec/scripts/infolettres-auto.js.
//
// La différence avec Québec : Montréal publie ses procès-verbaux des SEMAINES après la séance. Une
// fenêtre « séances des 14 derniers jours » ne trouverait rien. On publie donc le courriel d'une
// séance quand son procès-verbal ARRIVE : les décisions marquées « nouveau » par la collecte du
// jour (scrapers/decisions.js), quelle que soit la date de la séance. Plus le compte rendu du mois
// précédent, à partir du 2 du mois. Chacun une seule fois (--si-nouveau) ; l'envoi aux inscrits suit
// par le cron du site (api/infolettre-envoi.js). Sans clés Supabase, l'étape ne fait rien.
//
//   node scripts/infolettres-auto.js           publie
//   node scripts/infolettres-auto.js --essai   dit seulement ce qu'il publierait

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INSTANCES } from './infolettre.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const essai = process.argv.includes('--essai');

if (!essai && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.log('Courriels automatiques : clés Supabase absentes, étape sautée.');
  process.exit(0);
}

const cleDe = new Map(Object.entries(INSTANCES).map(([cle, v]) => [v.instance, cle]));
const { decisions } = JSON.parse(readFileSync('data/decisions.json', 'utf8'));
const seances = new Map();
for (const d of decisions) {
  const cle = cleDe.get(d.instance);
  if (!d.nouveau || !cle || !d.date) continue;
  seances.set(`${cle}|${d.date}`, { cle, date: d.date });
}

const travaux = [...seances.values()].sort((a, b) => a.date.localeCompare(b.date))
  .map(({ cle, date }) => [`--seance=${date}`, ...(cle === 'conseil' ? [] : [`--instance=${cle}`])]);
const auj = new Date();
if (auj.getUTCDate() >= 2) {
  const prec = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth() - 1, 1));
  travaux.push([`--mois=${prec.toISOString().slice(0, 7)}`]);
}

let echecs = 0;
for (const argv of travaux) {
  if (essai) { console.log(`publierait : ${argv.join(' ')}`); continue; }
  const r = spawnSync(process.execPath, ['scripts/infolettre.js', ...argv, '--publier', '--si-nouveau'], { encoding: 'utf8' });
  const fin = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter((l) => !/^\s+at /.test(l)).slice(-1)[0] ?? '';
  console.log(`${argv.join(' ')} → ${fin}`);
  if (r.status !== 0) echecs++;
}
if (echecs) {
  console.error(`${echecs} courriel(s) non publié(s).`);
  process.exit(1);
}
