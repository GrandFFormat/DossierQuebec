// Consultations publiques de la Ville de Québec (16 nov. 2026) → data/consultations.json.
//
// Source : la page « Participation citoyenne — Prochaines activités » (HTML complet, sans
// JavaScript). Une requête par jour, sans IA. On garde des faits (sujet, type, date, heure) et
// le lien vers la fiche officielle ; aucune description recopiée.
//
// Format commun aux trois volets (lu par commun/consultations.js) :
//   { generatedAt, source: { nom, url }, items: [{ id, titre, type, debut, fin, heure, lieu, secteur, url, annule }] }

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const PAGE = 'https://www.ville.quebec.qc.ca/citoyens/participation-citoyenne/activites/index.aspx';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const entites = (s) => s
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
  .replace(/&([a-z]+);/gi, (m, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ugrave: 'ù', ucirc: 'û', Eacute: 'É', Egrave: 'È', Agrave: 'À', rsquo: '’', laquo: '«', raquo: '»' }[n] ?? m));
const texte = (s) => entites(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// L'année n'est pas écrite : le mois le plus proche à venir (une activité de janvier lue en décembre est l'an prochain).
const aujourdhui = new Date();
function iso(jour, mois) {
  const m = MOIS.indexOf(mois.toLowerCase());
  if (m < 0) return null;
  let a = aujourdhui.getFullYear();
  if (m < aujourdhui.getMonth() - 2) a += 1;
  return `${a}-${String(m + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

const res = await fetch(PAGE, { headers: { 'User-Agent': 'DossierQuebec/1.0 (+https://dossierquebec.ca)' } });
if (!res.ok) throw new Error(`Participation citoyenne : HTTP ${res.status}`);
const html = await res.text();
const debutTable = html.indexOf('Prochaines activités');
if (debutTable < 0) throw new Error('Participation citoyenne : section « Prochaines activités » introuvable (la page a changé ?)');
const zone = html.slice(debutTable, html.indexOf('</table>', debutTable));

const items = [];
for (const [, th, td] of zone.matchAll(/<tr>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
  const quand = texte(th);
  const lien = /<a href="([^"]+)">([\s\S]*?)<\/a>/.exec(td);
  if (!lien) continue;
  const type = texte(td.replace(/<h3>[\s\S]*?<\/h3>/, ''));
  let debut = null, fin = null, heure = null;
  const plage = /Du (\d{1,2}) (\p{L}+) au (\d{1,2}) (\p{L}+)/u.exec(quand);
  if (plage) { debut = iso(plage[1], plage[2]); fin = iso(plage[3], plage[4]); }
  else {
    const un = /(\d{1,2}) (\p{L}+)(?: (\d{1,2} h(?: \d{2})?))?/u.exec(quand);
    if (un) { debut = iso(un[1], un[2]); heure = un[3] || null; }
  }
  if (!debut) continue;
  const url = new URL(entites(lien[1]), PAGE).href;
  items.push({
    id: `${url}|${debut}|${type}`,
    titre: texte(lien[2]),
    type: type.replace(/\s*-\s*\d{1,2} \p{L}+ \d{4}/u, '').replace(/\s*-\s*ANNUL[ÉE]+E?$/i, '').trim(),
    debut, fin: fin && fin !== debut ? fin : null, heure, lieu: null, secteur: null, url,
    annule: /annul/i.test(type),
  });
}

mkdirSync('data', { recursive: true });
writeFileSync('data/consultations.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: { nom: 'Ville de Québec', url: PAGE }, items }, null, 1));
console.log(`Consultations : ${items.length} activités à venir.`);
