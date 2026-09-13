// Les 21 districts électoraux de la Ville de Québec, en géométrie.
//
//   node scrapers/districts.js [--tolerance=0.00008]
//
// Source : Données Québec, jeu « Districts électoraux » de la Ville de Québec, licence
// CC-BY 4.0 — donc réutilisable librement avec mention de la source, contrairement aux
// documents décisionnels.
//
// Le GeoJSON d'origine fait ~600 ko et descend au dixième de millionième de degré (le
// centimètre). Pour une carte qui tient dans une page web c'est du gaspillage : on
// simplifie les contours (Douglas-Peucker) et on arrondit à cinq décimales (~1 m).
//
// Le fichier porte aussi le nom du conseiller et son parti. On les recoupe avec
// data/elus.json : deux sources de la Ville qui se contredisent, c'est une information,
// pas un détail à écraser en silence.

import { writeFile, readFile } from 'node:fs/promises';

const URL_GEOJSON =
  'https://www.donneesquebec.ca/recherche/dataset/ca1847da-e908-43de-bd8c-588570331650/resource/105b07f0-0b65-49f3-b6e0-f9b74629aa75/download/vdq-districtelectoral.geojson';
const PAGE_JEU = 'https://www.donneesquebec.ca/recherche/dataset/vque_43';
const OUT = new URL('../data/districts.json', import.meta.url);

const UA = process.env.GPD_CONTACT
  ? 'DossierVille/0.1 (veille citoyenne; ' + process.env.GPD_CONTACT + ')'
  : 'Mozilla/5.0 (compatible; DossierVille/0.1)';

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

// À 46,8° de latitude, un degré de longitude vaut ~0,68 degré de latitude en distance
// réelle. Sans cette correction, la simplification rognerait trop dans l'axe est-ouest.
const COS_LAT = Math.cos((46.82 * Math.PI) / 180);

function distancePerpendiculaire(p, a, b) {
  const px = (p[0] - a[0]) * COS_LAT;
  const py = p[1] - a[1];
  const bx = (b[0] - a[0]) * COS_LAT;
  const by = b[1] - a[1];
  const longueur2 = bx * bx + by * by;
  if (longueur2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / longueur2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let indexMax = 0;
  let distanceMax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distancePerpendiculaire(points[i], points[0], points[points.length - 1]);
    if (d > distanceMax) {
      distanceMax = d;
      indexMax = i;
    }
  }
  if (distanceMax <= tolerance) return [points[0], points[points.length - 1]];
  const gauche = douglasPeucker(points.slice(0, indexMax + 1), tolerance);
  const droite = douglasPeucker(points.slice(indexMax), tolerance);
  return [...gauche.slice(0, -1), ...droite];
}

const arrondir = (points) => points.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);

async function chargerElus() {
  try {
    const data = JSON.parse(await readFile(new URL('../data/elus.json', import.meta.url), 'utf8'));
    return new Map((data.membres ?? []).filter((m) => m.districtNumero).map((m) => [m.districtNumero, m]));
  } catch {
    return new Map();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const tolerance = Number(args.tolerance ?? 0.00008);

  console.log('Source : ' + URL_GEOJSON);
  const res = await fetch(URL_GEOJSON, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' sur le GeoJSON des districts');
  const brut = await res.text();
  const geo = JSON.parse(brut);

  const elus = await chargerElus();
  const districts = [];
  const ecarts = [];
  let pointsAvant = 0;
  let pointsApres = 0;

  for (const feature of geo.features) {
    const p = feature.properties ?? {};
    const numero = Number(p.ID);

    // Un Polygon GeoJSON est une liste d'anneaux : l'extérieur d'abord, puis les trous.
    const anneauxBruts = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();

    const anneaux = anneauxBruts
      .map((anneau) => {
        pointsAvant += anneau.length;
        const simplifie = arrondir(douglasPeucker(anneau, tolerance));
        pointsApres += simplifie.length;
        return simplifie;
      })
      .filter((anneau) => anneau.length >= 4); // un anneau valide ferme sur lui-même

    const elu = elus.get(numero);
    // Recoupement entre le GeoJSON de Données Québec et la page des membres du conseil.
    if (elu) {
      if (elu.parti && p.PARTI && elu.parti !== p.PARTI) {
        ecarts.push(`District ${numero} : parti « ${p.PARTI} » (GeoJSON) vs « ${elu.parti} » (page des membres)`);
      }
      const nomGeo = (p.CONSEILLER ?? '').replace(/\s+/g, ' ').trim();
      if (nomGeo && elu.nomComplet && nomGeo !== elu.nomComplet) {
        ecarts.push(`District ${numero} : « ${nomGeo} » (GeoJSON) vs « ${elu.nomComplet} » (page des membres)`);
      }
    } else if (numero) {
      ecarts.push(`District ${numero} : aucun élu correspondant dans data/elus.json`);
    }

    districts.push({
      numero,
      nom: p.NOM ?? null,
      // En cas de désaccord entre les deux sources, on affiche celle de la page des
      // membres du conseil — elle est rescrapée à chaque exécution, et le GeoJSON traîne
      // au moins une coquille (un nom inscrit deux fois). L'écart reste consigné.
      parti: elu?.parti ?? p.PARTI ?? null,
      conseiller: elu?.nomComplet ?? ((p.CONSEILLER ?? '').replace(/\s+/g, ' ').trim() || null),
      arrondissement: elu?.arrondissement ?? null,
      telephone: elu?.telephone ?? null,
      formulaireCourriel: elu?.formulaireCourriel ?? null,
      photo: elu?.photo ?? null,
      roles: elu?.roles ?? [],
      anneaux,
    });
  }

  districts.sort((a, b) => a.numero - b.numero);

  // Cadre englobant, pour que la page n'ait pas à le recalculer au chargement.
  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  for (const d of districts) {
    for (const anneau of d.anneaux) {
      for (const [x, y] of anneau) {
        if (x < ouest) ouest = x;
        if (x > est) est = x;
        if (y < sud) sud = y;
        if (y > nord) nord = y;
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: PAGE_JEU,
    licence: 'CC-BY 4.0 — Ville de Québec, via Données Québec',
    simplification: { methode: 'Douglas-Peucker', tolerance, decimales: 5 },
    cadre: { ouest, est, sud, nord },
    nombre: districts.length,
    ecarts,
    districts,
  };

  await writeFile(OUT, JSON.stringify(payload), 'utf8');

  const tailleAvant = Math.round(brut.length / 1024);
  const tailleApres = Math.round(JSON.stringify(payload).length / 1024);
  console.log(`${districts.length} districts écrits dans data/districts.json`);
  console.log(`Contours : ${pointsAvant} points -> ${pointsApres} (${tailleAvant} ko -> ${tailleApres} ko)`);
  if (ecarts.length) {
    console.log('\n⚠ Écarts entre les deux sources de la Ville :');
    for (const e of ecarts) console.log('  ' + e);
  } else {
    console.log('Aucun écart entre le GeoJSON et la page des membres du conseil.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
