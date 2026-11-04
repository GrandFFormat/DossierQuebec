// Biographies et photos des ministres, tirées de Wikipédia (fr), Wikidata et Wikimedia Commons.
// Écrit data/site/ministresWiki.json et ministres/photos/<slug>.jpg. À relancer à chaque
// remaniement (ou quand un article change) : node scripts/ministres-wiki.js
//
// LA BIO n'est PAS le texte de Wikipédia (CC BY-SA) : elle est composée ici, phrase par phrase, à
// partir des FAITS de Wikidata (naissance, lieu, formation, métiers). Chaque page affiche le lien
// « Source : Wikipédia » vers l'article.
//
// LA PHOTO est l'image de l'infobox de l'article (pageimages). Gardée SEULEMENT si sa licence sur
// Commons est CC0, domaine public, CC BY ou CC BY-SA ; la vignette de 400 px que Commons fabrique
// est copiée telle quelle (aucune retouche), avec l'auteur, la licence et la fiche Commons.
//
// L'article vient de data/site/deputesRaw.json (colonne Wikipédia). Sans article connu, on cherche
// le nom exact, et on ne garde le résultat que si son texte parle de l'Assemblée nationale.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { slugMinistre } from './build-minister-pages.js';

const UA = 'DossierQuebec/1.0 (https://dossierquebec.ca; ministres-wiki.js)';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url) {
  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await attendre(2000 * (essai + 1));
  }
  throw new Error(`${url} : échec`);
}
const api = (hote, params) => json(`https://${hote}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params }));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const texte = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// --chefs : les chefs de l'opposition (data/site/chefsOpposition.json -> data/site/chefsWiki.json),
// faits de Wikidata seulement : leur photo vient du site de leur parti (deputes/photos/).
const CHEFS = process.argv.includes('--chefs');
const SORTIE = CHEFS ? 'data/site/chefsWiki.json' : 'data/site/ministresWiki.json';
const ministres = JSON.parse(readFileSync(CHEFS ? 'data/site/chefsOpposition.json' : 'data/site/ministers.json', 'utf8'));
const deputes = JSON.parse(readFileSync('data/site/deputesRaw.json', 'utf8'));
mkdirSync('ministres/photos', { recursive: true });

const LICENCES_OK = /^(cc0|public domain|domaine public|pd\b|cc[- ]by(-sa)?[- ]\d)/i;

async function trouverArticle(nom) {
  const d = deputes.find((x) => norm(x[0]) === norm(nom));
  if (d?.[6]) return decodeURIComponent(d[6].split('/wiki/')[1]).replace(/_/g, ' ');
  const r = await api('fr.wikipedia.org', { action: 'query', list: 'search', srsearch: `"${nom}" Assemblée nationale du Québec`, srlimit: '3' });
  const hit = (r.query?.search ?? []).find((s) => norm(s.title.replace(/\s*\(.*\)$/, '')) === norm(nom));
  return hit?.title ?? null;
}

// Un fait Wikidata : la date (P569) ou les étiquettes des éléments cités.
function valeurs(entite, prop) {
  return (entite.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated').map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
}

const sortie = {};
for (const m of ministres) {
  const slug = slugMinistre(m.name);
  const fiche = { nom: m.name, article: null, url: null, wikidata: null, naissance: null, lieu: null, lieuEn: null, formation: [], formationEn: [], metiers: [], metiersEn: [], photo: null, raison: null };
  try {
    const titre = await trouverArticle(m.name);
    if (!titre) { fiche.raison = 'aucun article Wikipédia trouvé'; sortie[slug] = fiche; console.log(`– ${m.name} : ${fiche.raison}`); continue; }
    const q = await api('fr.wikipedia.org', { action: 'query', titles: titre, redirects: '1', prop: 'pageprops|pageimages|info', piprop: 'name', inprop: 'url' });
    const page = q.query.pages[0];
    if (page.missing) { fiche.raison = `article « ${titre} » introuvable`; sortie[slug] = fiche; continue; }
    fiche.article = page.title;
    fiche.url = page.fullurl;
    fiche.wikidata = page.pageprops?.wikibase_item ?? null;

    let p18 = null;
    if (fiche.wikidata) {
      const e = (await api('www.wikidata.org', { action: 'wbgetentities', ids: fiche.wikidata, props: 'claims' })).entities[fiche.wikidata];
      p18 = valeurs(e, 'P18')[0] ?? null;
      const naiss = valeurs(e, 'P569')[0];
      if (naiss) fiche.naissance = naiss.precision >= 11 ? naiss.time.slice(1, 11) : naiss.precision === 9 ? naiss.time.slice(1, 5) : null;
      const ids = { lieu: valeurs(e, 'P19').map((v) => v.id).slice(0, 1), formation: valeurs(e, 'P69').map((v) => v.id).slice(0, 3), metiers: valeurs(e, 'P106').map((v) => v.id).slice(0, 4) };
      const tous = [...new Set(Object.values(ids).flat())];
      const etiq = {};
      for (let i = 0; i < tous.length; i += 40) {
        const r = await api('www.wikidata.org', { action: 'wbgetentities', ids: tous.slice(i, i + 40).join('|'), props: 'labels', languages: 'fr|en' });
        for (const [id, x] of Object.entries(r.entities)) etiq[id] = { fr: x.labels?.fr?.value, en: x.labels?.en?.value };
      }
      const fr = (id) => etiq[id]?.fr, en = (id) => etiq[id]?.en || etiq[id]?.fr;
      fiche.lieu = ids.lieu.map(fr).filter(Boolean)[0] ?? null;
      fiche.lieuEn = ids.lieu.map(en).filter(Boolean)[0] ?? null;
      fiche.formation = ids.formation.map(fr).filter(Boolean);
      fiche.formationEn = ids.formation.map(en).filter(Boolean);
      // « homme politique » / « femme politique » : c'est déjà dit par la page.
      const garder = (id) => fr(id) && !/politi/i.test(fr(id));
      fiche.metiers = ids.metiers.filter(garder).map(fr);
      fiche.metiersEn = ids.metiers.filter(garder).map(en);
    }

    // L'image de l'infobox ; à défaut, l'image (P18) de Wikidata, que l'infobox affiche aussi.
    const image = CHEFS ? null : page.pageimage ?? p18;
    if (image) {
      const fichier = `File:${image}`;
      const ii = (await api('commons.wikimedia.org', { action: 'query', titles: fichier, prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '400' })).query.pages[0];
      const info = ii?.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const licence = texte(meta.LicenseShortName?.value);
      const auteur = texte(meta.Artist?.value) || texte(meta.Credit?.value);
      if (!info) fiche.raison = "l'image de l'infobox n'est pas sur Commons";
      else if (!LICENCES_OK.test(licence)) fiche.raison = `licence de la photo non acceptée (${licence || 'introuvable'})`;
      else if (!auteur) fiche.raison = 'auteur de la photo introuvable';
      else {
        const ext = /png/.test(info.mime) ? 'png' : 'jpg';
        const chemin = `ministres/photos/${slug}.${ext}`;
        const r = await fetch(info.thumburl, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`vignette ${r.status}`);
        writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
        fiche.photo = { src: `/${chemin}`, largeur: info.thumbwidth, hauteur: info.thumbheight, auteur: auteur.slice(0, 120), licence, licenceUrl: meta.LicenseUrl?.value ?? null, fiche: info.descriptionurl };
      }
    } else fiche.raison = "pas d'image dans l'article";
    console.log(`✓ ${m.name} : ${fiche.article}${fiche.photo ? ` — photo (${fiche.photo.licence})` : ` — sans photo (${fiche.raison})`}`);
  } catch (err) {
    fiche.raison = `erreur : ${err.message}`;
    console.log(`✖ ${m.name} : ${fiche.raison}`);
  }
  sortie[slug] = fiche;
  await attendre(300);
}
writeFileSync(SORTIE, JSON.stringify(sortie, null, 1) + '\n', 'utf8');
console.log(`\n${Object.values(sortie).filter((f) => f.url).length} articles, ${Object.values(sortie).filter((f) => f.photo).length} photos → ${SORTIE}`);
if (!existsSync('ministres/photos')) process.exit(1);
