// Les 22 membres du conseil municipal de Québec (le maire + 21 conseillères et conseillers
// de district), depuis la page officielle.
//
//   node scrapers/elus.js
//
// La page est du HTML statique balisé en microdonnées schema.org/Person : nom de famille,
// prénom, district, affiliation, téléphone. On lit ces balises plutôt que la mise en page,
// ce qui rend le scraper beaucoup moins fragile.

import { writeFile } from 'node:fs/promises';

const URL_MEMBRES = 'https://www.ville.quebec.qc.ca/apropos/gouvernance/conseil-municipal/membres.aspx';
const RACINE = 'https://www.ville.quebec.qc.ca';
const OUT = new URL('../data/elus.json', import.meta.url);

const UA =
  process.env.GPD_CONTACT
    ? 'DossierVille/0.1 (veille citoyenne; ' + process.env.GPD_CONTACT + ')'
    : 'Mozilla/5.0 (compatible; DossierVille/0.1)';

function decoderEntites(s) {
  return (s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function premier(bloc, re) {
  const m = bloc.match(re);
  return m ? decoderEntites(m[1]) : null;
}

function tous(bloc, re) {
  return [...bloc.matchAll(re)].map((m) => decoderEntites(m[1])).filter(Boolean);
}

function parserMembre(bloc, arrondissement) {
  const nom = premier(bloc, /<span itemprop="familyName">([^<]*)<\/span>/);
  const prenom = premier(bloc, /<span itemprop="givenName">([^<]*)<\/span>/);
  if (!nom && !prenom) return null;

  // Le lien vers la carte du district porte son numéro : carte-district-07.pdf
  const mDistrict = bloc.match(/carte-district-(\d+)\.pdf"[^>]*>([^<]*)</);
  const districtNumero = mDistrict ? Number(mDistrict[1]) : null;
  const districtLibelle = mDistrict ? decoderEntites(mDistrict[2]) : null;

  // ⚠ La même page balise la même information de TROIS façons différentes selon l'élu :
  //   <p itemprop="affiliation">Mairesse suppléante</p>   (fonction dans affiliation)
  //   <p itemprop="jobTitle">Chef de l’opposition…</p>    (fonction dans jobTitle)
  //   <p>Président de l’Arrondissement de …</p>           (fonction sans aucun itemprop)
  // Et jobTitle sert aussi au district chez la plupart des conseillers. On balaie donc tous
  // les <p> du bloc plutôt que de se fier à un seul balisage.
  let affiliations = tous(bloc, /<p itemprop="affiliation">([^<]*)<\/p>/g);

  // Le maire : <p>Maire<br>Québec forte et fière</p>, les deux sur une seule ligne.
  const mMaire = bloc.match(/<p>([^<]*)<br\s*\/?>([^<]*)<\/p>/);
  if (affiliations.length === 0 && mMaire) {
    affiliations = [decoderEntites(mMaire[1]), decoderEntites(mMaire[2])];
  }

  // Quand il y a plusieurs affiliations, le parti est en dernier.
  const parti = affiliations.length ? affiliations[affiliations.length - 1] : null;
  const roles = affiliations.slice(0, -1);

  for (const m of bloc.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const attributs = m[1];
    const interieur = m[2];
    // On écarte ce qui n'est pas une fonction : liens (district, courriel, biographie),
    // téléphone, le parti déjà retenu, et la ligne combinée du maire.
    if (/<a\b/i.test(interieur) || /itemprop="telephone"/.test(interieur)) continue;
    if (/itemprop="affiliation"/.test(attributs)) continue;
    if (/<br\b/i.test(interieur)) continue;
    const texte = decoderEntites(interieur.replace(/<[^>]*>/g, ' '));
    if (!texte || /^Tél\./i.test(texte) || /^District\b/i.test(texte)) continue;
    if (texte === parti || roles.includes(texte)) continue;
    roles.push(texte);
  }

  const bio = bloc.match(/href="(\/apropos\/gouvernance\/conseil-municipal\/biographie\/[^"]+)"/);
  const photo = bloc.match(/<img[^>]*src="(\/apropos\/gouvernance\/conseil-municipal\/img\/[^"]+)"/);
  const courriel = bloc.match(/href="(\/nous_joindre\/formulaire\.aspx\?NoReference=\d+)"/);

  return {
    nom,
    prenom,
    nomComplet: [prenom, nom].filter(Boolean).join(' '),
    fonction: districtNumero ? 'Conseil municipal' : 'Maire',
    districtNumero,
    district: districtLibelle ? districtLibelle.replace(/\s*\(\d+\)\s*$/, '').trim() : null,
    arrondissement: districtNumero ? arrondissement : null,
    parti,
    roles,
    telephone: premier(bloc, /<span itemprop="telephone">([^<]*)<\/span>/),
    // La Ville ne publie pas d'adresse courriel directe : seulement un formulaire par élu.
    formulaireCourriel: courriel ? RACINE + decoderEntites(courriel[1]) : null,
    biographie: bio ? RACINE + bio[1] : null,
    photo: photo ? RACINE + photo[1] : null,
  };
}

async function main() {
  console.log('Source : ' + URL_MEMBRES);
  const res = await fetch(URL_MEMBRES, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' sur la page des membres');
  const html = await res.text();

  // Position de chaque titre d'arrondissement, pour rattacher les blocs qui suivent.
  const sections = [...html.matchAll(/<h2 id="[^"]*" class="titrebande">([^<]*)<\/h2>/g)].map((m) => ({
    index: m.index,
    titre: decoderEntites(m[1]),
  }));
  const arrondissementPour = (position) => {
    let courant = null;
    for (const s of sections) {
      if (s.index < position) courant = s.titre;
      else break;
    }
    return courant;
  };

  const blocs = [...html.matchAll(/<div itemscope itemtype="http:\/\/schema\.org\/Person"[^>]*>([\s\S]*?)<\/div>/g)];
  const membres = [];
  for (const bloc of blocs) {
    const membre = parserMembre(bloc[1], arrondissementPour(bloc.index));
    if (membre) membres.push(membre);
  }

  const partis = {};
  for (const m of membres) if (m.parti) partis[m.parti] = (partis[m.parti] ?? 0) + 1;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: URL_MEMBRES,
    nombre: membres.length,
    partis,
    membres,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 1), 'utf8');
  console.log(membres.length + ' membres écrits dans data/elus.json');
  for (const [parti, n] of Object.entries(partis).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + parti + ' : ' + n);
  }

  // Le conseil compte 22 membres (1 maire + 21 districts). Si le compte change, c'est soit
  // une vacance réelle, soit la page qui a changé de structure — dans les deux cas on veut le savoir.
  if (membres.length !== 22) {
    console.warn('\n⚠ ' + membres.length + ' membres trouvés au lieu de 22 attendus — à vérifier.');
  }
  const sansDistrict = membres.filter((m) => !m.districtNumero && m.fonction !== 'Maire');
  if (sansDistrict.length) console.warn('⚠ Sans district : ' + sansDistrict.map((m) => m.nomComplet).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
