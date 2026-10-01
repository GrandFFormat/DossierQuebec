// Publie tout seul les courriels de la Ville (Martin, 30 sept. 2026 : « B »). Avant, chaque numéro
// se préparait et se publiait à la main (scripts/infolettre.js --publier) ; personne ne l'a fait
// après le 31 août, et les inscrits n'ont rien reçu pendant un mois.
//
// Chaque matin, après le rafraîchissement (scripts/refresh.js) :
//   - chaque séance du conseil de la ville ou d'un conseil d'arrondissement tenue entre 2 et 14 jours
//     plus tôt (2 jours : le temps que ses documents arrivent) ;
//   - le compte rendu du mois précédent, à partir du 2 du mois.
// Chacun n'est publié qu'une fois (--si-nouveau) ; l'envoi aux inscrits se fait ensuite par le cron
// du site (api/infolettre-envoi.js, 11 h UTC). Sans SUPABASE_URL ni SUPABASE_SERVICE_ROLE_KEY,
// l'étape ne fait rien.
//
//   node scripts/infolettres-auto.js           publie
//   node scripts/infolettres-auto.js --essai   dit seulement ce qu'il publierait

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const essai = process.argv.includes('--essai');

// Les instances que connaît scripts/infolettre.js (INSTANCES), par leur nom dans decisions.json.
const CLES = {
  'Conseil de la ville': 'conseil',
  "Conseil de l'Arrondissement de La Cité-Limoilou": 'la-cite-limoilou',
  "Conseil de l'Arrondissement des Rivières": 'les-rivieres',
  "Conseil de l'Arrondissement de Sainte-Foy - Sillery - Cap-Rouge": 'sainte-foy-sillery-cap-rouge',
  "Conseil de l'Arrondissement de Charlesbourg": 'charlesbourg',
  "Conseil de l'Arrondissement de Beauport": 'beauport',
  "Conseil de l'Arrondissement de La Haute-Saint-Charles": 'la-haute-saint-charles',
};

if (!essai && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.log('Courriels automatiques : clés Supabase absentes, étape sautée.');
  process.exit(0);
}

const jour = (decalage) => new Date(Date.now() - decalage * 864e5).toISOString().slice(0, 10);
const { decisions } = JSON.parse(readFileSync('data/decisions.json', 'utf8'));
const seances = new Map();
for (const d of decisions) {
  const cle = CLES[(d.instance ?? '').trim()];
  if (!cle || !d.date || d.date > jour(2) || d.date < jour(14)) continue;
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
