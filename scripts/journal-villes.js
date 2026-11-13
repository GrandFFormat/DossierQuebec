// JOURNAL DE CHAQUE VILLE (Martin, 12 nov. 2026). La page Sources de chaque volet de ville reçoit ses
// propres mises à jour (volet = la ville) seulement. Les changements communs à toutes les villes
// (volet = « villes ») restent sur /sources du site principal. Écrites entre <!--JOURNAL-VILLE--> et <!--/JOURNAL-VILLE-->, à la fin du <main> la première fois.
// Le site principal (/sources) ne montre plus ces entrées (scripts/build-section-pages.js, commun/dq.js).
//
//   node scripts/journal-villes.js     (lancé aussi à la fin de scripts/build-section-pages.js)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VILLES = ['quebec', 'montreal', 'levis', 'laval', 'longueuil'];
const MAX = 30;

const h = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// AAAA-MM-JJ lu comme une date locale (new Date('2026-11-12') serait minuit UTC, le 11 au soir ici).
const date = (iso, loc) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }); };

export function journalDesVilles() {
  let tout = [];
  try { tout = JSON.parse(readFileSync('data/journal.json', 'utf8')); } catch { return; }
  for (const v of VILLES) {
    const fichier = `${v}/sources-des-donnees-de-${v}.html`;
    if (!existsSync(fichier)) continue;
    const entrees = tout
      .filter((e) => e && e.fr && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.volet === v)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX);
    const liste = entrees.map((e) => {
      const en = `<span class="pr-meta">${h(date(e.date, 'en-CA'))}</span> <strong>${h(e.en?.titre ?? e.fr.titre)}</strong> ${h(e.en?.texte ?? e.fr.texte)}`;
      return `<li data-en="${en.replace(/"/g, '&quot;')}"><span class="pr-meta">${h(date(e.date, 'fr-CA'))}</span> <strong>${h(e.fr.titre)}</strong> ${h(e.fr.texte)}</li>`;
    }).join('\n    ');
    const bloc = `<!--JOURNAL-VILLE-->
  <h2 data-en="Updates" id="mises-a-jour">Mises à jour</h2>
  <style>.journal-ville { padding-left: 18px; } .journal-ville li { margin: 6px 0; } .journal-ville .pr-meta { color: var(--doux, #5B6570); font-size: .9em; margin-right: 4px; }</style>
  <ul class="journal-ville">
    ${liste || '<li data-en="No update yet.">Aucune mise à jour pour le moment.</li>'}
  </ul>
  <!--/JOURNAL-VILLE-->`;
    const avant = readFileSync(fichier, 'utf8');
    const motif = /<!--JOURNAL-VILLE-->[\s\S]*?<!--\/JOURNAL-VILLE-->/;
    const apres = motif.test(avant) ? avant.replace(motif, () => bloc) : avant.replace('</main>', () => `  ${bloc}\n</main>`);
    if (apres !== avant) writeFileSync(fichier, apres);
    console.log(`✓ journal de ${v} : ${entrees.length} mise(s) à jour sur sa page Sources`);
  }
}

if (/journal-villes\.js$/.test(process.argv[1] ?? '')) journalDesVilles();
