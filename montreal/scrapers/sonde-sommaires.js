// Trois arrondissements n'annexent pas leurs sommaires décisionnels à l'ordre du jour qu'on lit
// sous Adi_Public : Saint-Laurent, Ahuntsic-Cartierville, Pierrefonds-Roxboro. Publient-ils
// AILLEURS un ordre du jour qui, lui, les contient ?
//
//   node scrapers/sonde-sommaires.js <url> [<url> …]
//   MTL_URLS="<url> <url>" node scrapers/sonde-sommaires.js
//
// Les adresses du portail de la Ville contiennent des « & » : passées en argument de shell,
// elles se coupent en tâches de fond et le script ne reçoit rien. D'où MTL_URLS, lue telle
// quelle depuis l'environnement — c'est ce qu'utilise le workflow.
//
// Pour chaque page donnée : la liste des documents du visualiseur qu'elle porte (comme la page
// du Plateau), puis, pour le plus récent ordre du jour et le plus récent procès-verbal, le
// nombre de pages, le nombre de sommaires décisionnels qu'on y découpe (lib/pv.js) et le nombre
// de résolutions. C'est la seule façon de savoir si la Ville publie ces sommaires quelque part.

import { writeFile, mkdir } from 'node:fs/promises';
import { texte, octets } from '../lib/mtl.js';
import { lirePdf, estPdf } from '../lib/pdf.js';
import { decouperSommaires, decouperResolutions, normaliserTexte } from '../lib/pv.js';
import { documentsDePage, dateDuDocument } from '../lib/plateau.js';

const urls = [...process.argv.slice(2), ...String(process.env.MTL_URLS ?? '').split(/\s+/)].filter((a) => /^https?:/i.test(a));
if (!urls.length) {
  console.error('usage : node scrapers/sonde-sommaires.js <url> [<url> …]');
  process.exit(2);
}
const OUT = new URL('../data/sonde-sommaires.json', import.meta.url);
const rapport = { generatedAt: new Date().toISOString(), pages: [] };

for (const url of urls) {
  console.log(`\n=== ${url} ===`);
  const html = await texte(url, { notFoundIsNull: true });
  if (html == null) {
    console.log('  404');
    rapport.pages.push({ url, erreur: '404' });
    continue;
  }
  const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '(sans titre)';
  const docs = documentsDePage(html, url);
  console.log(`  « ${titre} » — ${docs.length} document(s) du visualiseur`);
  const page = { url, titre, documents: docs.length, essais: [] };

  // Les trois ordres du jour les plus récents, et le dernier procès-verbal. Trois plutôt qu'un :
  // le document le plus récent est parfois un simple avis de convocation d'une seule page, et
  // conclure là-dessus ferait dire « pas de sommaires » à un arrondissement qui en publie.
  const cibles = [
    ...docs.filter((d) => d.genre === 'ODJ').sort((a, b) => Number(b.doc) - Number(a.doc)).slice(0, 3),
    ...docs.filter((d) => d.genre === 'PV').sort((a, b) => Number(b.doc) - Number(a.doc)).slice(0, 1),
  ];
  for (const cible of cibles) {
    const genre = cible.genre;
    let essai = { genre, doc: cible.doc, url: cible.url };
    try {
      const buf = await octets(cible.url, { accept: 'application/pdf' });
      if (!buf || !estPdf(buf)) {
        essai.resultat = buf ? 'pas un PDF' : 'rien reçu';
      } else {
        const lu = await lirePdf(buf);
        const sommaires = decouperSommaires(lu.pages);
        const lignes = normaliserTexte(lu.pages.map((p) => p.lignes.map((l) => l.texte).join('\n')).join('\n'));
        const resolutions = genre === 'PV' ? decouperResolutions(lignes, { instance: 'CA' }).length : 0;
        const date = dateDuDocument(lu.pages.flatMap((p) => p.lignes.map((l) => l.texte)));
        essai = { ...essai, octets: buf.byteLength, pages: lu.nombrePages, sommaires: sommaires.length, dossiers: sommaires.slice(0, 5).map((s) => s.dossier), resolutions, date: date?.date ?? null };
        console.log(`  ${genre} doc=${cible.doc} : ${lu.nombrePages} pages, ${sommaires.length} sommaire(s) décisionnel(s)${resolutions ? `, ${resolutions} résolutions` : ''}${date?.date ? `, séance du ${date.date}` : ''}`);
        if (sommaires.length) console.log(`      dossiers : ${sommaires.slice(0, 5).map((s) => s.dossier).join(', ')}…`);
      }
    } catch (err) {
      essai.resultat = String(err.message ?? err);
      console.log(`  ⚠ ${genre} : ${essai.resultat}`);
    }
    page.essais.push(essai);
  }
  rapport.pages.push(page);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
console.log('\n→ data/sonde-sommaires.json');
