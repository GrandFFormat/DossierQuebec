// Les membres du conseil de la Ville de Lévis, lus sur leur page officielle.
//
//   node scrapers/elus.js
//
// https://levis.ca/fr/ville/conseil-municipal/membres-du-conseil-municipal : une fiche par
// élu (bloc « BlockMediaText » du site) — un titre (« Maire », « Conseiller district 1,
// Saint-Étienne »), le nom en gras, la liste des fonctions (comité exécutif, commissions,
// sociétés), un lien « Contacter » (mailto) et une photo.
//
// La page des membres ne dit ni le parti ni l'arrondissement. Les deux viennent d'une autre
// page de la Ville, « Élections » (https://levis.ca/fr/ville/organisation-municipale/
// elections) : le tableau des résultats de 2025 (district, personne élue, parti politique)
// et celui de la carte électorale (arrondissement, district). Le parti est donc celui SOUS
// LEQUEL la personne a été élue le 2 novembre 2025 — un changement d'allégeance depuis n'y
// serait pas ; `partiSource` le dit.

import { writeFile } from 'node:fs/promises';
import { texte, PAGE_MEMBRES } from '../lib/levis.js';
import { cleNom } from '../lib/pv.js';

const OUT = new URL('../data/elus.json', import.meta.url);
export const PAGE_ELECTIONS = 'https://levis.ca/fr/ville/organisation-municipale/elections';

// Les tableaux de la page Élections, en lignes de cellules texte.
function tableaux(html) {
  return html
    .split('<table')
    .slice(1)
    .map((t) => t.slice(0, t.indexOf('</table>')))
    .map((t) => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) => [...tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((td) => ({ texte: texteBrut(td[2]), rowspan: Number(td[1].match(/rowspan="(\d+)"/)?.[1] ?? 1) }))));
}

export function lireElections(html) {
  const parDistrict = new Map();
  const arrondissements = new Map();
  let maire = null;
  const mMaire = texteBrut(html).match(/Candidat(?:e)? [ée]lue? : ([^:]+?) Parti politique : (.+?) Pourcentage/);
  if (mMaire) maire = { nom: mMaire[1].trim(), parti: mMaire[2].trim() };
  for (const lignes of tableaux(html)) {
    const entete = lignes[0]?.map((c) => c.texte.toLowerCase()) ?? [];
    if (entete.some((c) => c.includes('parti'))) {
      for (const l of lignes.slice(1)) {
        const n = l[0]?.texte.match(/District\s+(\d+)/i)?.[1];
        if (n && l[2]) parDistrict.set(Number(n), { nom: l[1]?.texte ?? null, parti: l[2].texte });
      }
    }
    if (entete[0]?.includes('arrondissement')) {
      let courant = null;
      let reste = 0;
      for (const l of lignes.slice(1)) {
        let cellules = l;
        if (reste === 0) {
          courant = l[0]?.texte ?? null;
          reste = l[0]?.rowspan ?? 1;
          cellules = l.slice(1);
        }
        reste--;
        const n = cellules[0]?.texte.match(/District\s+(\d+)/i)?.[1];
        if (n && courant) arrondissements.set(Number(n), courant);
      }
    }
  }
  return { maire, parDistrict, arrondissements };
}

const ENTITES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&rsquo;': '’' };
function texteBrut(html) {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#\w]+;/g, (e) => ENTITES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

// Découpe la page en fiches et lit chacune.
export function lireMembres(html) {
  const blocs = html.split(/<div class="flexible-block BlockMediaText">/).slice(1);
  const membres = [];
  for (const bloc of blocs) {
    const titre = texteBrut(bloc.match(/<h3 class="BlockMediaText__title">([\s\S]*?)<\/h3>/)?.[1]);
    const nom = texteBrut(bloc.match(/<strong>([\s\S]*?)<\/strong>/)?.[1]);
    if (!titre || !nom) continue;
    const mDistrict = titre.match(/^(Conseill[eè]re?)\s+district\s+(\d+)\s*,\s*(.+)$/i);
    const estMaire = /^Maire(?:sse)?$/i.test(titre);
    if (!mDistrict && !estMaire) continue;
    const roles = [...bloc.matchAll(/<div class="Wysiwyg__li-content">([\s\S]*?)<\/div>/g)].map((m) => texteBrut(m[1]).replace(/;$/, '')).filter(Boolean);
    const courriel = bloc.match(/href="mailto:([^"]+)"/)?.[1] ?? null;
    const photo = bloc.match(/<picture class="picture" url="([^"]+)"/)?.[1] ?? null;
    const morceaux = nom.split(' ');
    membres.push({
      nom: morceaux.slice(1).join(' ') || nom,
      prenom: morceaux.length > 1 ? morceaux[0] : null,
      nomComplet: nom,
      fonction: estMaire ? titre : mDistrict[1],
      districtNumero: mDistrict ? Number(mDistrict[2]) : null,
      district: mDistrict ? mDistrict[3].trim() : null,
      arrondissement: null,
      parti: null,
      roles,
      comiteExecutif: roles.some((r) => /comit[ée] ex[ée]cutif/i.test(r)),
      telephone: null,
      formulaireCourriel: courriel ? `mailto:${courriel}` : null,
      courriel,
      biographie: null,
      photo,
    });
  }
  return membres;
}

async function main() {
  const html = await texte(PAGE_MEMBRES, { notFoundIsNull: false });
  const membres = lireMembres(html);
  if (membres.length < 10) throw new Error(`Seulement ${membres.length} membre(s) reconnu(s) sur la page — le gabarit du site a peut-être changé.`);
  membres.sort((a, b) => (a.districtNumero ?? 0) - (b.districtNumero ?? 0));

  // Parti et arrondissement, depuis la page Élections. Un nom qui ne correspond pas entre les
  // deux pages est consigné, pas corrigé.
  const ecarts = [];
  try {
    const elections = lireElections(await texte(PAGE_ELECTIONS, { notFoundIsNull: false }));
    for (const m of membres) {
      const ligne = m.districtNumero ? elections.parDistrict.get(m.districtNumero) : elections.maire;
      if (ligne && cleNom(ligne.nom) === cleNom(m.nomComplet)) {
        m.parti = ligne.parti;
        m.partiSource = 'Résultats officiels de l’élection du 2 novembre 2025 (page Élections de la Ville)';
      } else if (ligne) ecarts.push(`${m.districtNumero ? 'District ' + m.districtNumero : 'Mairie'} : « ${m.nomComplet} » (page des membres) vs « ${ligne.nom} » (résultats 2025)`);
      if (m.districtNumero) m.arrondissement = elections.arrondissements.get(m.districtNumero) ?? null;
    }
  } catch (err) {
    ecarts.push(`Page Élections illisible : ${err.message}`);
  }
  const partis = {};
  for (const m of membres) if (m.parti) partis[m.parti] = (partis[m.parti] ?? 0) + 1;

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: PAGE_MEMBRES,
        sourcePartis: PAGE_ELECTIONS,
        licence: 'Pages publiques de la Ville de Lévis — faits repris avec la source ; photos affichées depuis le site de la Ville.',
        nombre: membres.length,
        partis,
        remarque: "Le parti est celui sous lequel la personne a été élue le 2 novembre 2025, d'après les résultats publiés par la Ville.",
        ecarts,
        membres,
      },
      null,
      1
    ),
    'utf8'
  );
  console.log(`${membres.length} membres écrits dans data/elus.json :`);
  for (const m of membres) console.log(`  ${m.districtNumero ? 'district ' + String(m.districtNumero).padStart(2) : 'maire      '}  ${m.nomComplet.padEnd(26)} ${(m.district ?? '').padEnd(18)} ${(m.arrondissement ?? '').padEnd(30)} ${m.parti ?? '(parti ?)'}`);
  console.log(`Partis : ${JSON.stringify(partis)}`);
  if (ecarts.length) console.warn(`⚠ Écarts : ${ecarts.join(' | ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
