// Essai du lecteur de procès-verbaux sur un PDF, local ou en ligne, sans rien écrire.
//
//   node scripts/essai-pv.js <chemin ou URL d'un PDF> [--tout]
//
// Affiche les présences, chaque résolution (numéro, nature, sommaire, résultat, objet) et le
// détail des votes. C'est l'outil pour vérifier le découpage sur un vrai document avant de
// laisser tourner la routine.

import { readFile } from 'node:fs/promises';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, extrairePresences } from '../lib/pv.js';
import { pdf } from '../lib/levis.js';

const cible = process.argv[2];
const tout = process.argv.includes('--tout');
if (!cible) {
  console.error('Usage : node scripts/essai-pv.js <chemin ou URL du PDF> [--tout]');
  process.exitCode = 1;
} else {
  const data = /^https?:/.test(cible) ? await pdf(cible) : new Uint8Array(await readFile(cible));
  const lu = await lirePdf(data);
  const presences = extrairePresences(lu.pages);
  console.log(`${lu.nombrePages} pages, ${lu.liens.length} hyperliens`);
  console.log('Présences :', JSON.stringify(presences && { ...presences, brut: undefined }));
  const resolutions = decouperResolutions(lu.pages, { liens: lu.liens, presences });
  const liste = tout ? resolutions : resolutions.slice(0, 25);
  for (const r of liste) {
    console.log(`\n${r.numero.padEnd(16)} p.${r.page}  ${r.nature.padEnd(20)} ${(r.sommaireId ?? '').padEnd(20)} ${r.sommairePdf ? 'PDF' : '   '}  ${r.resultat ?? '?'}`);
    console.log(`   ${(r.objet ?? '(objet non lu)').slice(0, 160)}`);
    for (const v of r.votes) {
      console.log(`   VOTE sur ${v.sur} : ${v.resultat} — pour ${v.pour.length}, contre ${v.contre.length}, demandé par ${v.demandeParVote}`);
      console.log(`     pour : ${v.pour.join(', ')}`);
      console.log(`     contre : ${v.contre.join(', ')}`);
      if (v.avertissements.length) console.log(`     ⚠ ${v.avertissements.join(' · ')}`);
      if (v.notes.length) console.log(`     note : ${v.notes.join(' · ')}`);
    }
  }
  const n = resolutions.length;
  console.log(`\n${n} résolutions — ${resolutions.filter((r) => !r.objet).length} sans objet, ${resolutions.filter((r) => r.sommaireId).length} avec sommaire (${resolutions.filter((r) => r.sommairePdf).length} liés à un PDF), ${resolutions.reduce((s, r) => s + r.votes.length, 0)} vote(s) nominal(aux).`);
}
