// UNE PAGE PAR PROJET DE LOI — /projets-de-loi/3-43-3 (numéro-législature-session, comme l'adresse
// de l'Assemblée : projet-loi-3-43-3). Martin, 1er oct. 2026, d'après DossierCanada
// (/projets-de-loi/c-12) : que chaque NOUVEAU projet de la 44e législature puisse être indexé
// par Google dès son dépôt. Le numéro seul ne suffit pas : il recommence à 1 à chaque session.
//
// Chaque page est la page « Projets de loi » à l'identique (le site s'y comporte normalement :
// commun/dq.js lit le chemin et ouvre ce projet), avec son propre <head> (titre, description tirée
// du résumé en clair, canonical, Open Graph, fil d'Ariane) et, écrit dans la page, le titre et le
// résumé du projet, pour qu'un moteur les lise sans exécuter le code. Les pages entrent au sitemap.
//
// Lancé par scripts/build-section-pages.js, à la fin (il lit projets-de-loi.html qu'il vient
// d'écrire). Un projet qui disparaît de data/bills.json perd sa page : le dossier est refait à neuf.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';

const SITE = 'https://dossierquebec.ca';
const DOSSIER = 'projets-de-loi';
const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const texte = (html) => String(html ?? '').replace(/<details[\s\S]*?<\/details>/g, '').replace(/([^.!?])\s*<\/li>/g, '$1. ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export const slugProjet = (b) => (b.legislature && b.introSession ? `${b.num}-${b.legislature}-${b.introSession}` : null);

export function construirePagesProjets() {
  const modele = readFileSync(`${DOSSIER}.html`, 'utf8');
  const { bills } = JSON.parse(readFileSync('data/bills.json', 'utf8'));
  const resumes = existsSync('data/bills-resumes-fr.json') ? JSON.parse(readFileSync('data/bills-resumes-fr.json', 'utf8')) : {};

  // On refait le dossier à neuf : aucune page orpheline d'un projet retiré.
  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html')) rmSync(`${DOSSIER}/${f}`);
  mkdirSync(DOSSIER, { recursive: true });

  const vues = new Set();
  const adresses = [];
  for (const b of bills) {
    const slug = slugProjet(b);
    if (!slug || vues.has(slug)) continue;
    vues.add(slug);
    const url = `${SITE}/${DOSSIER}/${slug}`;
    const resumeHtml = resumes[b.id] ?? '';
    const resume = texte(resumeHtml);
    const titreLong = `Projet de loi no ${b.num} — ${b.title}`;
    const titreCourt = b.title.length > 60 ? `${b.title.slice(0, 57).replace(/\s+\S*$/, '')}…` : b.title;
    const titre = `PL ${b.num} — ${titreCourt} — DossierQuébec`;
    const base = resume || `${b.title}. Son étape à l'Assemblée nationale, expliquée en langage clair.`;
    const desc = `PL ${b.num} : ${base.length > 150 ? `${base.slice(0, 147).replace(/\s+\S*$/, '')}…` : base}`;
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Projets de loi', item: `${SITE}/${DOSSIER}` },
        { '@type': 'ListItem', position: 3, name: `PL ${b.num}`, item: url },
      ],
    }, null, 2).replace(/</g, '\\u003c');

    let h = modele;
    const remplacer = (motif, valeur) => {
      if (!motif.test(h)) throw new Error(`build-bill-pages : ${motif} introuvable dans ${DOSSIER}.html`);
      h = h.replace(motif, valeur);
    };
    remplacer(/<title>[^<]*<\/title>/, `<title>${echapper(titre)}</title>`);
    remplacer(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${echapper(desc)}">`);
    remplacer(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
    remplacer(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${echapper(titre)}">`);
    remplacer(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${echapper(desc)}">`);
    remplacer(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
    h = h.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${echapper(titre)}">`)
      .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${echapper(desc)}">`);
    remplacer(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
    // Le projet, écrit dans la page. commun/dq.js remplace le contenu de #billsList au chargement,
    // puis ouvre la carte de ce projet (openBillFromQuery lit le chemin).
    const fiche = `<article class="bill-prerendu">
<h2>${echapper(titreLong)}</h2>
<p>${echapper(b.note ?? '')}${b.sponsor ? ` · Parrain : ${echapper(b.sponsor)}` : ''}</p>
${resumeHtml}
<p><a href="${echapper(b.url)}" rel="noopener">Le projet de loi sur le site de l'Assemblée nationale</a></p>
</article>`;
    remplacer(/<div id="billsList"><\/div>/, `<div id="billsList">${fiche}</div>`);
    writeFileSync(`${DOSSIER}/${slug}.html`, h, 'utf8');
    adresses.push({ url, lastmod: b.lastActivity ?? null });
  }

  // Au sitemap, à la suite des pages du site (build-section-pages.js vient de l'écrire).
  const plan = readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n');
  const entrees = adresses.map((a) => `  <url>\n    <loc>${a.url}</loc>\n${a.lastmod ? `    <lastmod>${a.lastmod}</lastmod>\n` : ''}    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  const nouveau = plan.replace(/\n<\/urlset>/, `\n${entrees}\n</urlset>`);
  if (nouveau !== plan) writeFileSync('sitemap.xml', nouveau, 'utf8');
  console.log(`✓ ${adresses.length} pages de projets de loi (/${DOSSIER}/numéro-législature-session), au sitemap.`);
}
