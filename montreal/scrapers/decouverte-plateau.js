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
  // Les liens de la page sont relatifs (« /sel/adi-public/… ») : on les résout contre la
  // page, sans quoi le téléchargeur reçoit un chemin et non une adresse.
  let href = m[1].replace(/&amp;/g, '&');
  try { href = new URL(href, PAGE).href; } catch { continue; }
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
  // Un échec de lecture ne doit pas emporter le rapport : la liste des documents vaut déjà
  // quelque chose, et c'est le journal qui est le livrable.
  let buf = null;
  try { buf = await octets(cible.href); } catch (err) { console.log(`  ⚠ ${err.message ?? err}`); }
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
// L'ordre du jour du Plateau s'intitule « Ordre du jour et documents décisionnels » et pèse
// 3 Mo : contient-il les sommaires décisionnels, que la Ville ne publie nulle part ailleurs ?
// On lit le plus récent et on montre ce qui ressemble à un sommaire.
const odjs = documents.filter((d) => d.genre === 'ODJ' && d.doc).sort((a, b) => Number(b.doc) - Number(a.doc));
if (odjs.length) {
  const cible = odjs[0];
  console.log(`\n=== Ordre du jour ${cible.href} ===`);
  try {
    const buf = await octets(cible.href);
    if (buf && Buffer.from(buf.slice(0, 5)).toString('latin1').startsWith('%PDF')) {
      const lu = await lirePdf(new Uint8Array(buf));
      console.log(`  ${buf.byteLength} octets, ${lu.nombrePages} page(s)`);
      const pages = lu.pages.map((p) => p.lignes.map((l) => l.texte));
      // Les premières lignes de chaque page, pour voir la structure du document.
      for (const [i, p] of pages.entries()) {
        if (i < 6 || i % 10 === 0) console.log(`  --- page ${i + 1} : ${p.slice(0, 4).map((l) => `[${l.slice(0, 70)}]`).join(' ')}`);
      }
      const mots = /sommaire d[ée]cisionnel|SOMMAIRE|Contenu|Justification|Aspect\(s\) financier|ASPECTS FINANCIERS|Recommandation|Numéro de dossier|Identification/i;
      const hits = [];
      for (const [i, p] of pages.entries()) for (const l of p) if (mots.test(l)) hits.push([i + 1, l.slice(0, 100)]);
      console.log(`  ${hits.length} ligne(s) qui ressemblent à un sommaire décisionnel`);
      for (const [n, l] of hits.slice(0, 40)) console.log(`   p.${String(n).padStart(3)} [${l}]`);
      const liens = lu.pages.reduce((a, p) => a + (p.liens?.length ?? 0), 0);
      console.log(`  ${liens} lien(s) dans le document`);
      for (const p of lu.pages.slice(0, 4)) for (const l of (p.liens ?? []).slice(0, 5)) console.log(`   lien p.${p.numero} ${JSON.stringify(l).slice(0, 160)}`);
      rapport.odj = { href: cible.href, pages: lu.nombrePages, ressemblent: hits.slice(0, 40), liens };
    } else console.log('  pas un PDF');
  } catch (err) { console.log(`  ⚠ ${err.message ?? err}`); }
}
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
