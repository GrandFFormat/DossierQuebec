// Répare les séquences d'échappement laissées littérales dans les résumés.
//
//   node scripts/reparer-echappements.js [--dry-run]
//
// LE PROBLÈME. Le modèle rend parfois les accents sous forme d'échappement JSON à
// l'intérieur même de la valeur de chaîne — on reçoit les six caractères « é » au
// lieu de « é ». Le décodage JSON normal ne les défait pas : pour lui, l'antislash est
// un caractère ordinaire du texte. Le phénomène est irrégulier, jusqu'à l'intérieur
// d'une même phrase : « La Ville de Québec confie à la firme… ».
//
// Ce script décode ces séquences dans data/resumes.json. Le même décodage est appliqué
// à la source dans scrapers/resumes.js, pour que le problème ne revienne pas.

import { readFile, writeFile } from 'node:fs/promises';

const FICHIER = new URL('../data/resumes.json', import.meta.url);

// \uXXXX, y compris les paires de substitution pour les caractères hors du plan de base.
const ECHAPPEMENT_UNICODE = /\\u([0-9a-fA-F]{4})/g;
// Les échappements simples que le modèle produit aussi à l'occasion.
const ECHAPPEMENTS_SIMPLES = { '\\n': '\n', '\\t': '\t', '\\"': '"', "\\'": "'", '\\\\': '\\', '\\/': '/' };

export function decoderEchappements(valeur) {
  if (typeof valeur !== 'string') return valeur;
  let s = valeur.replace(ECHAPPEMENT_UNICODE, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  for (const [avant, apres] of Object.entries(ECHAPPEMENTS_SIMPLES)) s = s.split(avant).join(apres);
  return s;
}

function compterSequences(texte) {
  const compte = new Map();
  for (const m of texte.matchAll(/\\u[0-9a-fA-F]{4}|\\[nt"'\\/]/g)) {
    const cle = m[0].startsWith('\\u') ? '\\uXXXX' : m[0];
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  return compte;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const data = JSON.parse(await readFile(FICHIER, 'utf8'));

  const avant = compterSequences(data.resumes.map((r) => [...r.puces, r.montantPrincipal ?? ''].join(' ')).join(' '));
  if (avant.size === 0) {
    console.log('Aucune séquence échappée — rien à réparer.');
    return;
  }

  console.log('Séquences trouvées :');
  for (const [cle, n] of [...avant].sort((a, b) => b[1] - a[1])) console.log(`  ${cle.padEnd(10)} ${n}`);

  let touches = 0;
  for (const r of data.resumes) {
    const puces = r.puces.map(decoderEchappements);
    const montant = decoderEchappements(r.montantPrincipal);
    const change = puces.some((p, i) => p !== r.puces[i]) || montant !== r.montantPrincipal;
    if (!change) continue;
    touches++;
    r.puces = puces;
    r.montantPrincipal = montant;
  }

  console.log(`\n${touches} résumé(s) sur ${data.resumes.length} contenaient des séquences littérales.`);
  if (dryRun) {
    console.log('--dry-run : fichier non modifié.');
    return;
  }
  await writeFile(FICHIER, JSON.stringify(data, null, 1), 'utf8');

  const apres = compterSequences(data.resumes.map((r) => [...r.puces, r.montantPrincipal ?? ''].join(' ')).join(' '));
  console.log(apres.size === 0 ? 'Réparé : plus aucune séquence échappée.' : `⚠ Il en reste ${apres.size} type(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
