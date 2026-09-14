// Les élus de la Ville de Longueuil, depuis la page officielle « Élus ».
//
//   node scrapers/elus.js
//
// La page (https://longueuil.quebec/fr/services/elus) tient en un tableau par arrondissement —
// Vieux-Longueuil, Saint-Hubert, Greenfield Park — et, pour chaque siège, la photo, le nom
// (prénom en casse normale, NOM EN CAPITALES), un lien vers la fiche, puis trois lignes :
//
//   Parti: Coalition Longueuil
//   Arrondissement: Vieux-Longueuil
//   District: Georges-Dor
//
// Un siège sans titulaire est écrit « Poste vacant » (Parc-Michel-Chartrand, en attendant
// l'élection partielle de 2026). La mairesse est en tête, hors tableau.
//
// Le conseil de ville compte la mairesse et 18 conseillères et conseillers de ville, un par
// district. Greenfield Park élit en plus deux conseillers D'ARRONDISSEMENT, qui ne siègent qu'à
// leur conseil d'arrondissement : on les garde, marqués `siegeAuConseilMunicipal: false`.
//
// Comme à Québec, la même information peut être balisée de plusieurs façons d'un élu à l'autre
// (lien absolu ou relatif, photo avant ou après le nom) : on travaille sur le texte du bloc,
// siège par siège, pas sur la position d'une balise.

import { writeFile, readFile } from 'node:fs/promises';
import { texte, decoderNuxt, SITE } from '../lib/lgl.js';
import { casseDeNom, cle, normaliserEspaces } from '../lib/noms.js';

export const PAGE = 'https://longueuil.quebec/fr/services/elus';
const OUT = new URL('../data/elus.json', import.meta.url);

function absolue(href) {
  if (!href) return null;
  if (href.startsWith('mailto:')) return href;
  return new URL(href, SITE).href;
}

// Le bloc utile : de « Mairesse de Longueuil » à la carte interactive qui suit les tableaux.
// La page le contient deux fois (le HTML servi et sa copie dans la charge utile Nuxt) : on lit
// la première.
export function parserPageElus(html) {
  const h = decoderNuxt(html).replace(/&nbsp;/g, ' ').replace(/\\n|\\t/g, ' ');
  const debut = h.indexOf('Mairesse de Longueuil');
  if (debut < 0) throw new Error('« Mairesse de Longueuil » introuvable — la page des élus a changé');
  const suite = h.indexOf('Mairesse de Longueuil', debut + 50);
  const bloc = h.slice(debut, suite > 0 ? suite : debut + 60000);

  // Le texte à plat, où photos et liens restent visibles comme des marqueurs.
  const plat = normaliserEspaces(
    bloc
      .replace(/<img[^>]*?alt="([^"]*)"[^>]*?src="([^"]*)"[^>]*>/g, ' ⟦IMG|$1|$2⟧ ')
      .replace(/<a\s[^>]*?href="([^"]*)"[^>]*>/g, ' ⟦A|$1⟧ ')
      .replace(/<h3[^>]*>/g, ' ⟦H3⟧ ')
      .replace(/<[^>]+>/g, ' ')
  );

  const photos = [...plat.matchAll(/⟦IMG\|([^|]*)\|([^⟧]*)⟧/g)].map((m) => ({ alt: normaliserEspaces(m[1]), src: absolue(m[2]) }));
  const photoDe = (nomComplet) => photos.find((p) => cle(p.alt) === cle(nomComplet))?.src ?? null;

  const membres = [];
  const vacants = [];

  // La mairesse.
  const mMaire = plat.match(/Mairesse de Longueuil\s*:\s*⟦A\|([^⟧]*)⟧\s*([^⟦]+?)\s*⟦/);
  if (mMaire) {
    const nomComplet = casseDeNom(mMaire[2]);
    const courriel = plat.match(/Pour rejoindre la mairesse\s*:\s*⟦A\|mailto:([^⟧]+)⟧/)?.[1] ?? null;
    membres.push(membre({ nomComplet, fonction: 'Mairesse', parti: null, arrondissement: null, district: null, fiche: absolue(mMaire[1]), photo: photoDe(nomComplet), courriel }));
  }

  // Chaque siège : « ⟦A|fiche⟧ Prénom NOM Parti: … Arrondissement: … District: … ».
  for (const m of plat.matchAll(/⟦A\|([^⟧]*)⟧\s*([^⟦]+?)\s*Parti\s*:\s*([^⟦]+?)\s*Arrondissement\s*:\s*([^⟦]+?)\s*District\s*:\s*([^⟦]+?)\s*(?=⟦|Arrondissement\s*:|Voici\b|$)/g)) {
    const [, fiche, nomBrut, parti, arrondissement, districtBrut] = m;
    const nomComplet = casseDeNom(nomBrut);
    const dArr = districtBrut.match(/^(.*?)\s*\(conseill[a-zà-ÿ]* d[’']arrondissement\s*n\s*o?\s*(\d+)\)/i);
    membres.push(
      membre({
        nomComplet,
        fonction: dArr ? "Conseil d'arrondissement" : 'Conseil de ville',
        parti: normaliserEspaces(parti),
        arrondissement: normaliserEspaces(arrondissement),
        district: normaliserEspaces(dArr ? dArr[1] : districtBrut),
        siegeArrondissement: dArr ? Number(dArr[2]) : null,
        fiche: absolue(fiche),
        photo: photoDe(nomComplet),
      })
    );
  }

  // Les postes vacants : « Arrondissement: … District: … Poste vacant ».
  for (const m of plat.matchAll(/Arrondissement\s*:\s*([^:⟦]+?)\s*District\s*:\s*([^:⟦]+?)\s*Poste vacant/g)) {
    vacants.push({ arrondissement: normaliserEspaces(m[1]), district: normaliserEspaces(m[2]) });
  }
  return { membres, vacants };
}

function membre({ nomComplet, fonction, parti, arrondissement, district, siegeArrondissement = null, fiche, photo, courriel = null }) {
  const morceaux = nomComplet.split(' ');
  return {
    nom: morceaux.slice(1).join(' ') || nomComplet,
    prenom: morceaux[0],
    nomComplet,
    fonction,
    districtNumero: null,
    district,
    arrondissement,
    parti,
    siegeAuConseilMunicipal: fonction !== "Conseil d'arrondissement",
    siegeArrondissement,
    roles: [],
    telephone: null,
    courriel,
    formulaireCourriel: null,
    biographie: fiche,
    photo,
  };
}

async function main() {
  const html = await texte(PAGE, { notFoundIsNull: false });
  const { membres, vacants } = parserPageElus(html);

  // Les numéros officiels des districts viennent de data/districts.json quand il existe.
  try {
    const d = JSON.parse(await readFile(new URL('../data/districts.json', import.meta.url), 'utf8'));
    // Les conseillers d'arrondissement de Greenfield Park partagent le district de leur conseiller
    // de ville : le numéro, qui sert d'ancre à la carte, reste à ce dernier.
    for (const m of membres) m.districtNumero = m.siegeAuConseilMunicipal ? d.districts.find((x) => cle(x.nom) === cle(m.district))?.numero ?? null : null;
  } catch {
    // pas encore de districts : les numéros viendront au prochain passage
  }

  const conseil = membres.filter((m) => m.siegeAuConseilMunicipal);
  const partis = {};
  for (const m of conseil) if (m.parti) partis[m.parti] = (partis[m.parti] ?? 0) + 1;
  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE,
    nombre: conseil.length,
    nombreTotal: membres.length,
    partis,
    postesVacants: vacants,
    membres,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`${conseil.length} membres du conseil de ville (${membres.length} avec les conseillers d'arrondissement) écrits dans data/elus.json`);
  console.log('Partis : ' + Object.entries(partis).map(([p, n]) => `${p} ${n}`).join(' · '));
  if (vacants.length) console.log('Postes vacants : ' + vacants.map((v) => `${v.district} (${v.arrondissement})`).join(', '));
  const sansPhoto = membres.filter((m) => !m.photo).map((m) => m.nomComplet);
  if (sansPhoto.length) console.log('Sans photo : ' + sansPhoto.join(', '));
  if (conseil.length + vacants.length !== 19) console.warn(`⚠ ${conseil.length} sièges occupés + ${vacants.length} vacant(s) au lieu de 19 (mairesse et 18 districts) — la page a peut-être changé.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
