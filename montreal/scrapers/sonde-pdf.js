// Lire un PDF quelconque et dire ce qu'il contient : combien de pages, ses premières lignes, et
// ce que nos découpeurs actuels en tirent. C'est le premier regard sur les documents d'une
// municipalité qu'on ne lit pas encore — le gabarit d'un village n'a rien à voir avec celui de
// Montréal, et on ne saura qu'en regardant.
//
//   MTL_URLS="<url> <url>" node scrapers/sonde-pdf.js
//   node scrapers/sonde-pdf.js <url> [<url> …]

import { writeFile, mkdir } from 'node:fs/promises';
import { octets } from '../lib/mtl.js';
import { lirePdf, estPdf } from '../lib/pdf.js';
import { decouperResolutions, normaliserTexte } from '../lib/pv.js';

const urls = [...process.argv.slice(2), ...String(process.env.MTL_URLS ?? '').split(/\s+/)].filter((a) => /^https?:/i.test(a));
if (!urls.length) {
  console.error('usage : MTL_URLS="<url> …" node scrapers/sonde-pdf.js');
  process.exit(2);
}
const OUT = new URL('../data/sonde-pdf.json', import.meta.url);
const rapport = { generatedAt: new Date().toISOString(), documents: [] };

for (const url of urls) {
  console.log(`\n=== ${url} ===`);
  try {
    const buf = await octets(url, { accept: 'application/pdf' });
    if (!buf || !estPdf(buf)) {
      console.log(buf ? `  pas un PDF (${buf.byteLength} octets)` : '  rien reçu');
      rapport.documents.push({ url, erreur: buf ? 'pas un PDF' : 'rien reçu' });
      continue;
    }
    const lu = await lirePdf(buf);
    const lignes = normaliserTexte(lu.pages.map((p) => p.lignes.map((l) => l.texte).join('\n')).join('\n')).split('\n');
    const res = decouperResolutions(lignes.join('\n'), { instance: 'CONS' });
    console.log(`  ${buf.byteLength} octets, ${lu.nombrePages} page(s), ${lignes.length} ligne(s)`);
    console.log(`  le découpeur de Montréal en tire ${res.length} résolution(s)`);
    console.log('\n  --- les 45 premières lignes ---');
    for (const [i, l] of lignes.slice(0, 45).entries()) console.log(`  ${String(i + 1).padStart(4)} [${l}]`);
    // Ce qui ressemble à un numéro de résolution, quelle que soit la graphie.
    const numeros = lignes.map((l, i) => [i + 1, l.trim()]).filter(([, l]) => /^\d{2,4}[-–.\s]\d{1,4}([-–.\s]\d{1,4})?$/.test(l) || /^(?:R[ÉE]SOLUTION|R[ée]s\.?)\s*(n[°o]\s*)?\d/i.test(l) || /^\d{4}-\d{2,3}\b/.test(l));
    console.log(`\n  --- ${numeros.length} ligne(s) qui ressemblent à un numéro de résolution ---`);
    for (const [i, l] of numeros.slice(0, 20)) console.log(`  ${String(i).padStart(4)} [${l}]`);
    // Les formules d'adoption : c'est sur elles que se cale un découpeur.
    const formules = lignes.map((l, i) => [i + 1, l.trim()]).filter(([, l]) => /il est (?:propos[ée]|r[ée]solu)|propos[ée] par|appuy[ée] par|adopt[ée]e?\b|unanimit[ée]/i.test(l));
    console.log(`\n  --- ${formules.length} ligne(s) de formule (« proposé par », « adoptée »…) ---`);
    for (const [i, l] of formules.slice(0, 12)) console.log(`  ${String(i).padStart(4)} [${l.slice(0, 110)}]`);
    rapport.documents.push({ url, octets: buf.byteLength, pages: lu.nombrePages, lignes: lignes.length, resolutionsMontreal: res.length, premieresLignes: lignes.slice(0, 45), numeros: numeros.slice(0, 20).map(([, l]) => l), formules: formules.slice(0, 12).map(([, l]) => l.slice(0, 120)) });
  } catch (err) {
    console.log(`  ⚠ ${err.message ?? err}`);
    rapport.documents.push({ url, erreur: String(err.message ?? err) });
  }
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
console.log('\n→ data/sonde-pdf.json');
