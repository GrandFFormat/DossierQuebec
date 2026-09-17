// Le Plateau-Mont-Royal, enfin. Découverte, pas extraction.
//
// Adi_Public n'a jamais rendu un seul document pour ce conseil — 900 requêtes, six codes,
// huit heures. La raison, trouvée le 17 septembre 2026 sur la page « Ordres du jour et
// procès-verbaux » de l'arrondissement : le Plateau ne publie pas sous des noms de fichiers
// prévisibles, mais par le visualiseur, avec un numéro de document qu'on ne peut pas
// deviner — et que la page donne :
//
//   https://ville.montreal.qc.ca/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&doc=8483
//
// Ce script relit la page en gardant, pour chaque lien, la DATE qui l'accompagne dans le
// tableau (le libellé du lien ne la dit pas), puis télécharge le procès-verbal le plus
// récent et le passe au découpeur pour voir s'il le comprend — un conseil de plus, une
// graphie de numéro de plus, peut-être.

import { writeFile, mkdir } from 'node:fs/promises';
import { texte, octets } from '../lib/mtl.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, normaliserTexte } from '../lib/pv.js';

const PAGE = 'https://ville.montreal.qc.ca/portal/page?_pageid=7297,74659590&_dad=portal&_schema=PORTAL';
const OUT = new URL('../data/plateau-decouverte.json', import.meta.url);

const html = await texte(PAGE, { notFoundIsNull: true });
if (html == null) { console.log('404'); process.exit(0); }

// Chaque lien de visualiseur, avec le texte brut des ~300 caractères qui le précèdent :
// c'est là que le tableau écrit la date de la séance.
const MOIS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const DATE = new RegExp(`(\\d{1,2}(?:er)?\\s+(?:${MOIS})\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i');
const documents = [];
for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*afficherpdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
  const href = m[1].replace(/&amp;/g, '&');
  const avant = html.slice(Math.max(0, m.index - 600), m.index).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const dates = [...avant.matchAll(new RegExp(DATE.source, 'gi'))].map((x) => x[1]);
  const genre = /typeDoc=pv/i.test(href) ? 'PV' : /typeDoc=odj/i.test(href) ? 'ODJ' : 'autre';
  const doc = href.match(/doc=(\d+)/)?.[1] ?? null;
  documents.push({ genre, doc, href, dateProche: dates.at(-1) ?? null, contexte: avant.slice(-160) });
}
console.log(`=== Le Plateau-Mont-Royal : ${documents.length} document(s) sur la page ===`);
for (const d of documents) console.log(`  ${d.genre.padEnd(4)} doc=${String(d.doc).padEnd(6)} date proche : ${d.dateProche ?? '(aucune)'}   …${d.contexte.slice(-90)}`);

// Le procès-verbal le plus récent : est-ce un PDF, et le découpeur en tire-t-il quelque chose ?
const pvs = documents.filter((d) => d.genre === 'PV' && d.doc).sort((a, b) => Number(b.doc) - Number(a.doc));
const rapport = { generatedAt: new Date().toISOString(), page: PAGE, documents, essai: null };
if (pvs.length) {
  const cible = pvs[0];
  console.log(`\n=== Lecture de ${cible.href} ===`);
  const buf = await octets(cible.href);
  if (!buf) console.log('  rien reçu');
  else {
    const entete = Buffer.from(buf.slice(0, 5)).toString('latin1');
    console.log(`  ${buf.byteLength} octets, en-tête « ${entete} » ${entete.startsWith('%PDF') ? '— un vrai PDF' : '— PAS un PDF'}`);
    if (entete.startsWith('%PDF')) {
      const lu = await lirePdf(new Uint8Array(buf));
      const lignes = normaliserTexte(lu.pages.map((p) => p.lignes.map((l) => l.texte).join('\n')).join('\n')).split('\n');
      const res = decouperResolutions(lignes.join('\n'), { instance: 'CA_Pmr' });
      console.log(`  ${lu.nombrePages} page(s), ${lignes.length} ligne(s) — le découpeur en tire ${res.length} résolution(s)`);
      console.log('\n  --- les 40 premières lignes ---');
      for (const [i, l] of lignes.slice(0, 40).entries()) console.log(`  ${String(i + 1).padStart(4)} [${l}]`);
      const nums = lignes.map((l, i) => [i + 1, l]).filter(([, l]) => /CA\s?\d{2}\s?\d/.test(l));
      console.log(`\n  --- ${nums.length} ligne(s) qui ressemblent à un numéro ---`);
      for (const [i, l] of nums.slice(0, 15)) console.log(`  ${String(i).padStart(4)} [${l}]`);
      for (const r of res.slice(0, 3)) console.log(`\n  ${r.numero} | ${(r.objet ?? '').slice(0, 90)} | ${r.resultat} | ${r.dossier ?? '—'}`);
      rapport.essai = { href: cible.href, pages: lu.nombrePages, resolutions: res.length, premieresLignes: lignes.slice(0, 40), ressemblent: nums.slice(0, 15).map(([, l]) => l) };
    }
  }
}
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
