// LES ANCIENS MINISTRES DE LA 43e LÉGISLATURE (gouvernement Legault, 2022-2026) — 3 nov. 2026.
// Écrit data/archives/43/ministres.json et archives/43/ministres/photos/<slug>.webp (+ @2x).
// Lancé à la main, une fois : node scripts/anciens-ministres-wiki.js
// (photos : sharp, pris dans le dossier donné par SHARP_DIR, p. ex. ...\photos-eric-bilodeau\outils).
//
// LA LISTE vient des deux tableaux de l'article fr.wikipedia « Gouvernement Legault » (deuxième
// cabinet) : composition du 20 octobre 2022 et remaniement du 10 septembre 2025. On n'en garde que
// les noms et les intitulés des fonctions (des faits), jamais le texte de l'article.
// LA BIO est composée à partir des faits de Wikidata, comme scripts/ministres-wiki.js.
// LA PHOTO : image de l'infobox, gardée seulement sous CC0 / domaine public / CC BY / CC BY-SA,
// recadrée en carré 200 px et 400 px (WebP), avec auteur, licence et fiche Commons.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { slugMinistre } from './build-minister-pages.js';

const UA = 'DossierQuebec/1.0 (https://dossierquebec.ca; anciens-ministres-wiki.js)';
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
const texte = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const LICENCES_OK = /^(cc0|public domain|domaine public|pd\b|cc[- ]by(-sa)?[- ]\d)/i;
const valeurs = (e, p) => (e.claims?.[p] ?? []).filter((c) => c.rank !== 'deprecated');
const sharp = process.env.SHARP_DIR ? createRequire(process.env.SHARP_DIR.replace(/[\\/]?$/, '/'))('sharp') : null;

const DOSSIER_PHOTOS = 'archives/43/ministres/photos';
mkdirSync(DOSSIER_PHOTOS, { recursive: true });

// 1. Les deux tableaux du deuxième cabinet.
const wt = (await api('fr.wikipedia.org', { action: 'parse', page: 'Gouvernement Legault', prop: 'wikitext' })).parse.wikitext;
const lien = (s) => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/''+/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').trim();
function tableau(debut, fin) {
  const bloc = wt.slice(wt.indexOf(debut), wt.indexOf(fin, wt.indexOf(debut)));
  const tab = bloc.slice(bloc.indexOf('{|'), bloc.indexOf('|}'));
  const rangs = tab.split(/\n\|-[^\n]*/).slice(1);
  const out = [];
  for (const r of rangs) {
    const cellules = r.split('\n').filter((l) => l.startsWith('|')).map((l) => l.slice(1));
    if (cellules.length < 2) continue;
    const fonctions = cellules[0].split(/<br\s*\/?>/i).map(lien).filter(Boolean);
    const m = cellules[1].match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (!m) continue;
    out.push({ article: m[1].trim(), nom: (m[2] || m[1]).trim(), fonctions });
  }
  return out;
}
const t2022 = tableau('Composition initiale (20 octobre 2022)', '=== Ajustements (2022-2025)');
const t2025 = tableau('Remaniement majeur (10 septembre 2025)', '=== Ajustements (2025-2026)');
const personnes = new Map();
for (const [annee, t] of [['2022', t2022], ['2025', t2025]]) for (const x of t) {
  const p = personnes.get(x.article) ?? { nom: x.nom, article: x.article, fonctions2022: [], fonctions2025: [] };
  p[`fonctions${annee}`].push(...x.fonctions);
  personnes.set(x.article, p);
}
// Le whip et le président du caucus sont dans les tableaux, mais ne sont pas ministres.
for (const [k, p] of personnes) if (![...p.fonctions2022, ...p.fonctions2025].some((f) => /ministre/i.test(f))) personnes.delete(k);
console.log(`${t2022.length} rangs en 2022, ${t2025.length} en 2025, ${personnes.size} ministres`);
// Circonscription de la 43e quand Wikidata ne la donne pas (relevé sur assnat.qc.ca, 3 nov. 2026).
const CIRC = { 'Pascale Déry': 'Repentigny', 'Andrée Laforest': 'Chicoutimi', 'Kateri Champagne Jourdain': 'Duplessis', 'Caroline Proulx': 'Berthier', 'Lionel Carmant': 'Taillon', 'France-Élaine Duranceau': 'Bertrand', 'Ian Lafrenière': 'Vachon', 'Isabelle Charest': 'Brome-Missisquoi', 'Chantal Rouleau': 'Pointe-aux-Trembles', 'Christopher Skeete': 'Sainte-Rose', 'Jean-François Simard': 'Montmorency', 'Gilles Bélanger': 'Orford', 'Samuel Poulin': 'Beauce-Sud' };

// 2. Wikidata (faits) et Commons (photo).
const sortie = [];
for (const p of personnes.values()) {
  const slug = slugMinistre(p.nom);
  const f = { slug, ...p, url: null, wikidata: null, naissance: null, lieu: null, lieuEn: null, formation: [], formationEn: [], metiers: [], metiersEn: [], circonscription: null, photo: null, raison: null };
  try {
    const page = (await api('fr.wikipedia.org', { action: 'query', titles: p.article, redirects: '1', prop: 'pageprops|pageimages|info', piprop: 'name', inprop: 'url' })).query.pages[0];
    f.url = page.fullurl ?? null;
    f.wikidata = page.pageprops?.wikibase_item ?? null;
    let p18 = null;
    if (f.wikidata) {
      const e = (await api('www.wikidata.org', { action: 'wbgetentities', ids: f.wikidata, props: 'claims' })).entities[f.wikidata];
      // Numéro de l'Assemblée (P3055, « girard-eric-17929 ») : c'est lui qui relie aux votes.
      f.assnatId = Number(String(valeurs(e, 'P3055')[0]?.mainsnak?.datavalue?.value ?? '').match(/(\d+)$/)?.[1]) || null;
      p18 = valeurs(e, 'P18')[0]?.mainsnak?.datavalue?.value ?? null;
      const naiss = valeurs(e, 'P569')[0]?.mainsnak?.datavalue?.value;
      if (naiss) f.naissance = naiss.precision >= 11 ? naiss.time.slice(1, 11) : naiss.precision === 9 ? naiss.time.slice(1, 5) : null;
      const id = (c) => c.mainsnak?.datavalue?.value?.id;
      // Circonscription : le mandat de député (P39) qui porte une circonscription (P768) et couvre 2022-2026.
      const mandats = valeurs(e, 'P39').filter((c) => c.qualifiers?.P768).map((c) => ({
        circ: c.qualifiers.P768[0].datavalue?.value?.id,
        debut: c.qualifiers.P580?.[0]?.datavalue?.value?.time?.slice(1, 11) ?? '0000',
        fin: c.qualifiers.P582?.[0]?.datavalue?.value?.time?.slice(1, 11) ?? '9999',
      })).filter((m) => m.circ && m.debut <= '2026-10-01' && m.fin >= '2022-10-03').sort((a, b) => b.debut.localeCompare(a.debut));
      const ids = { lieu: valeurs(e, 'P19').map(id).slice(0, 1), formation: valeurs(e, 'P69').map(id).slice(0, 3), metiers: valeurs(e, 'P106').map(id).slice(0, 4), circ: mandats.slice(0, 1).map((m) => m.circ) };
      const tous = [...new Set(Object.values(ids).flat().filter(Boolean))];
      const etiq = {};
      if (tous.length) {
        const r = await api('www.wikidata.org', { action: 'wbgetentities', ids: tous.join('|'), props: 'labels', languages: 'fr|en' });
        for (const [k, x] of Object.entries(r.entities)) etiq[k] = { fr: x.labels?.fr?.value, en: x.labels?.en?.value };
      }
      const fr = (k) => etiq[k]?.fr, en = (k) => etiq[k]?.en || etiq[k]?.fr;
      f.lieu = ids.lieu.map(fr).filter(Boolean)[0] ?? null;
      f.lieuEn = ids.lieu.map(en).filter(Boolean)[0] ?? null;
      f.formation = ids.formation.map(fr).filter(Boolean);
      f.formationEn = ids.formation.map(en).filter(Boolean);
      const garder = (k) => fr(k) && !/politi/i.test(fr(k));
      f.metiers = ids.metiers.filter(garder).map(fr);
      f.metiersEn = ids.metiers.filter(garder).map(en);
      f.circonscription = ids.circ.map(fr).filter(Boolean)[0]?.replace(/\s*\((circonscription provinciale|Québec)\)\s*$/i, '') ?? null;
    }
    f.circonscription ??= CIRC[p.nom] ?? null;
    const image = page.pageimage ?? p18;
    if (!image) f.raison = "pas d'image dans l'article";
    else {
      const ii = (await api('commons.wikimedia.org', { action: 'query', titles: `File:${image}`, prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '800' })).query.pages[0];
      const info = ii?.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const licence = texte(meta.LicenseShortName?.value);
      const auteur = texte(meta.Artist?.value) || texte(meta.Credit?.value);
      if (!info) f.raison = "l'image de l'infobox n'est pas sur Commons";
      else if (!LICENCES_OK.test(licence)) f.raison = `licence non acceptée (${licence || 'introuvable'})`;
      else if (!auteur) f.raison = 'auteur introuvable';
      else if (!sharp) f.raison = 'SHARP_DIR absent : photo non convertie';
      else {
        const r = await fetch(info.thumburl, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`vignette ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        for (const [taille, suffixe] of [[200, ''], [400, '@2x']]) {
          await sharp(buf).resize(taille, taille, { fit: 'cover', position: 'north' }).webp({ quality: 80 }).toFile(`${DOSSIER_PHOTOS}/${slug}${suffixe}.webp`);
        }
        f.photo = { src: `/${DOSSIER_PHOTOS}/${slug}.webp`, src2x: `/${DOSSIER_PHOTOS}/${slug}@2x.webp`, auteur: auteur.slice(0, 120), licence, licenceUrl: meta.LicenseUrl?.value ?? null, fiche: info.descriptionurl };
      }
    }
    console.log(`✓ ${p.nom}${f.circonscription ? ` (${f.circonscription})` : ''}${f.photo ? ` — photo ${f.photo.licence}` : ` — sans photo (${f.raison})`}`);
  } catch (err) {
    f.raison = `erreur : ${err.message}`;
    console.log(`✖ ${p.nom} : ${f.raison}`);
  }
  sortie.push(f);
  await attendre(300);
}
writeFileSync('data/archives/43/ministres.json', JSON.stringify({ source: 'https://fr.wikipedia.org/wiki/Gouvernement_Legault', releve: new Date().toISOString().slice(0, 10), ministres: sortie }, null, 1) + '\n', 'utf8');
console.log(`\n${sortie.length} anciens ministres, ${sortie.filter((f) => f.photo).length} photos → data/archives/43/ministres.json`);
