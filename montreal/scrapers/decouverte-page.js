// Découverte, pas extraction : lire UNE page de la Ville et dire ce qu'elle contient.
//
//   node scrapers/decouverte-page.js <url>
//
// Le poste de travail n'atteint pas ville.montreal.qc.ca ; ce script tourne dans le runner
// et imprime ce qu'un humain verrait en survolant les liens : le titre, puis chaque lien
// qui parle de séance, d'ordre du jour, de procès-verbal, ou qui mène à un PDF ou à
// Adi_Public. C'est ce qu'il faut pour savoir si une page cache une source de documents
// qu'on ne lit pas encore — Le Plateau-Mont-Royal, par exemple, dont Adi_Public ne rend rien.

import { writeFile, mkdir } from 'node:fs/promises';
import { texte } from '../lib/mtl.js';

const url = process.argv[2];
if (!url) {
  console.error('usage : node scrapers/decouverte-page.js <url>');
  process.exit(2);
}
const OUT = new URL('../data/page-decouverte.json', import.meta.url);
const INTERESSANT = /s[ée]ance|ordre du jour|proc[èe]s-verbal|conseil|\.pdf|Adi_Public|afficherpdf|calendrier|assembl[ée]e/i;

const html = await texte(url, { notFoundIsNull: true });
if (html == null) {
  console.log(`404 : ${url}`);
  process.exit(0);
}
const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '(sans titre)';
console.log(`=== ${titre} ===\n${url}\n${html.length} caractères\n`);

// Chaque lien avec son texte visible, résolu en adresse absolue.
const liens = [];
for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
  let href = m[1].replace(/&amp;/g, '&');
  try { href = new URL(href, url).href; } catch { continue; }
  const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  liens.push({ label, href });
}
const retenus = liens.filter((l) => INTERESSANT.test(l.label) || INTERESSANT.test(l.href));
console.log(`${liens.length} lien(s), ${retenus.length} qui parlent de séances, de documents ou de PDF :\n`);
for (const l of retenus.slice(0, 80)) console.log(`  « ${l.label.slice(0, 70)} »\n      ${l.href}`);

// Les hôtes vers lesquels la page envoie : c'est là qu'une nouvelle source se voit.
const hotes = {};
for (const l of liens) { try { const h = new URL(l.href).host; hotes[h] = (hotes[h] ?? 0) + 1; } catch {} }
console.log('\nhôtes liés :', Object.entries(hotes).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} (${n})`).join(', '));

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), url, titre, liens: retenus, hotes }, null, 1) + '\n');
