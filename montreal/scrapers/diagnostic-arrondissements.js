// Diagnostic, pas extraction : ce script ne produit aucune donnée de site.
//
// Deux trous connus dans le volet Montréal, et une seule façon de les combler : regarder
// les documents eux-mêmes. Comme les PDF de la Ville ne sont pas joignables depuis un
// poste de travail ordinaire, ce script est fait pour tourner dans GitHub Actions et
// IMPRIMER ce qu'il voit — le journal d'exécution est le livrable.
//
//   A. Huit conseils d'arrondissement rendent zéro résolution alors que leurs
//      procès-verbaux font quinze à trente pages. Le découpage échoue : le numéro de
//      résolution n'est pas là où on le croit. On imprime le texte brut des premières
//      pages et toutes les lignes qui ressemblent à un numéro, pour voir la vraie forme.
//
//   B. Le Plateau-Mont-Royal ne rend AUCUNE séance après 565 requêtes, avec les trois
//      heures en usage et du lundi au jeudi. Deux hypothèses : le code d'instance n'est
//      pas « Pmr », ou le conseil siège à une heure ou un jour qu'on n'essaie pas. On
//      teste les deux, en bornant la dépense.
//
//   npm run diagnostic:arrondissements
//
// Aucune écriture dans data/ qui serve au site : seulement un rapport de diagnostic.

import { writeFile, mkdir } from 'node:fs/promises';
import { DOCUMENTS, requete, octets } from '../lib/mtl.js';
import { lirePdf } from '../lib/pdf.js';
import { decouperResolutions, normaliserTexte } from '../lib/pv.js';

const OUT = new URL('../data/arrondissements-diagnostic.json', import.meta.url);

// ---------- A. Les procès-verbaux qui ne rendent rien ----------

// Un procès-verbal récent par conseil muet. Choisis dans data/decisions.json, où chacun
// figure avec « 0 résolution » pour un document de quinze à trente pages.
const MUETS = [
  ['Anjou', 'CA_Anj', 'CA_Anj_PV_ORDI_2026-08-04_19h00_FR.pdf'],
  ['Côte-des-Neiges–Notre-Dame-de-Grâce', 'CA_Cdn', 'CA_Cdn_PV_ORDI_2026-07-06_18h30_FR.pdf'],
  ['Verdun', 'CA_Ver', 'CA_Ver_PV_ORDI_2026-06-02_19h00_FR.pdf'],
  ['Ville-Marie', 'CA_Vma', 'CA_Vma_PV_ORDI_2026-07-07_18h30_FR.pdf'],
  ['Montréal-Nord', 'CA_Mtn', 'CA_Mtn_PV_ORDI_2026-06-08_19h00_FR.pdf'],
  ['Pierrefonds-Roxboro', 'CA_Pir', 'CA_Pir_PV_ORDI_2026-06-01_19h00_FR.pdf'],
  ["L'Île-Bizard–Sainte-Geneviève", 'CA_Ibs', 'CA_Ibs_PV_ORDI_2026-07-07_19h30_FR.pdf'],
  ['Rivière-des-Prairies–Pointe-aux-Trembles', 'CA_Rdp', 'CA_Rdp_PV_ORDI_2026-07-07_19h00_FR.pdf'],
];

// Un conseil qui MARCHE, imprimé dans la foulée : sans point de comparaison, on ne sait
// pas si ce qu'on voit chez les muets est anormal.
const TEMOIN = ['LaSalle', 'CA_Las', 'CA_Las_PV_ORDI_2026-07-06_19h00_FR.pdf'];

// Tout ce qui ressemble de près ou de loin à un numéro de résolution d'arrondissement,
// où qu'il soit dans la ligne — c'est justement l'hypothèse à vérifier : qu'il ne soit
// pas seul sur sa ligne.
const RESSEMBLE = /CA\s?\d{2}\s+\d{1,2}\s+\d{4}|CA\s?\d{2}\s+\d{4}/;

async function examiner([nom, instance, fichier], lignesAImprimer = 70) {
  const url = `${DOCUMENTS}${instance}/${fichier}`;
  console.log(`\n${'='.repeat(78)}\n${nom}  (${instance})\n${url}\n${'='.repeat(78)}`);
  let buf;
  try {
    buf = await octets(url);
  } catch (err) {
    console.log(`  ⚠ ${err.message ?? err}`);
    return { nom, instance, fichier, erreur: String(err.message ?? err) };
  }
  if (!buf) {
    console.log('  ⚠ 404 — le fichier n’est pas là. Le nom essayé est peut-être faux.');
    return { nom, instance, fichier, erreur: '404' };
  }
  const doc = await lirePdf(new Uint8Array(buf));
  const lignes = normaliserTexte(doc.pages.map((p) => p.lignes.map((l) => l.texte).join('\n')).join('\n')).split('\n');
  const resolutions = decouperResolutions(lignes.join('\n'), { instance });

  console.log(`  ${doc.pages.length} page(s), ${lignes.length} ligne(s) — le découpeur en tire ${resolutions.length} résolution(s).`);

  console.log(`\n  --- les ${lignesAImprimer} premières lignes, telles quelles (entre crochets pour voir les blancs) ---`);
  for (const [i, l] of lignes.slice(0, lignesAImprimer).entries()) console.log(`  ${String(i + 1).padStart(4)} [${l}]`);

  const candidates = lignes.map((l, i) => [i + 1, l]).filter(([, l]) => RESSEMBLE.test(l));
  console.log(`\n  --- ${candidates.length} ligne(s) contiennent quelque chose qui ressemble à un numéro ---`);
  for (const [i, l] of candidates.slice(0, 40)) console.log(`  ${String(i).padStart(4)} [${l}]`);

  // La ligne « 20.03  1266245003 » ferme une résolution : si elle est là et que le numéro
  // ne l'est pas, c'est bien le numéro qui se présente autrement.
  const articles = lignes.filter((l) => /^\s*\d{2}\.\d{2,3}(\s+\d{10})?\s*$/.test(l));
  console.log(`\n  --- ${articles.length} ligne(s) « article  dossier » isolées ---`);
  for (const l of articles.slice(0, 12)) console.log(`       [${l.trim()}]`);

  return {
    nom,
    instance,
    fichier,
    pages: doc.pages.length,
    lignes: lignes.length,
    resolutionsDecoupees: resolutions.length,
    lignesRessemblantes: candidates.length,
    echantillonRessemblantes: candidates.slice(0, 20).map(([, l]) => l),
    lignesArticle: articles.length,
    premieresLignes: lignes.slice(0, lignesAImprimer),
  };
}

// ---------- B. Où sont les séances du Plateau-Mont-Royal ? ----------

async function existePdf(url) {
  let rep;
  try {
    rep = await requete(url, { accept: 'application/pdf' });
  } catch {
    return false;
  }
  if (!rep) return false;
  const type = rep.headers.get('content-type') ?? '';
  try {
    await rep.body?.cancel();
  } catch {
    /* corps déjà consommé ou vide */
  }
  return /pdf/i.test(type);
}

// Les dates à essayer : tous les jours de semaine, vendredi compris, de trois mois où
// TOUS les autres conseils ont siégé. Si le Plateau siège, il a siégé là aussi.
function datesDeMois(annee, mois) {
  const out = [];
  const d = new Date(Date.UTC(annee, mois - 1, 1));
  while (d.getUTCMonth() === mois - 1) {
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Hypothèse 1 : le code n'est pas « Pmr ». Les candidats sont les abréviations qu'un
// service du greffe écrirait pour « Le Plateau-Mont-Royal ».
const CODES_CANDIDATS = ['Pmr', 'Plt', 'Pla', 'Lpm', 'Pmt', 'Plm'];
// Hypothèse 2 : l'heure n'est pas dans les trois qu'on connaît.
const HEURES_CANDIDATES = ['19h00', '18h30', '19h30', '18h00', '19h15', '18h45', '13h00', '17h00'];

async function chercherPlateau(compteur, budget = 900) {
  const dates = [...datesDeMois(2026, 5), ...datesDeMois(2026, 6), ...datesDeMois(2026, 3)];
  const trouvees = [];
  const reste = () => budget - compteur.n;

  // Passe 1 : les codes candidats, à l'heure la plus répandue, sur les deux formes les
  // plus répandues. Le but n'est pas de bâtir un calendrier, mais d'obtenir UN seul
  // fichier : il nous donnera d'un coup le code, l'heure, le jour et la forme.
  console.log(`\n--- Passe 1 : ${CODES_CANDIDATS.length} codes × ${dates.length} dates × 2 formes, à 19h00 ---`);
  for (const code of CODES_CANDIDATS) {
    let vus = 0;
    for (const date of dates) {
      for (const forme of ['PV_ORDI', 'ODJ_ORDI']) {
        if (reste() <= 0) break;
        compteur.n++;
        const nom = `CA_${code}_${forme}_${date}_19h00_FR.pdf`;
        if (await existePdf(`${DOCUMENTS}CA_${code}/${nom}`)) {
          console.log(`  ✔ TROUVÉ ${nom}`);
          trouvees.push(nom);
          vus++;
        }
      }
    }
    console.log(`  CA_${code} : ${vus} document(s) — ${compteur.n} requête(s) au total`);
    if (vus) return trouvees; // un seul suffit : on tient le code
  }

  // Passe 2 : le code « Pmr » tenu pour bon, on ratisse les heures inhabituelles sur un
  // seul mois. Si rien ici non plus, le conseil ne publie pas sous ce nom, point.
  console.log(`\n--- Passe 2 : CA_Pmr, ${HEURES_CANDIDATES.length} heures, mai 2026, forme PV_ORDI ---`);
  for (const heure of HEURES_CANDIDATES) {
    for (const date of datesDeMois(2026, 5)) {
      if (reste() <= 0) break;
      compteur.n++;
      const nom = `CA_Pmr_PV_ORDI_${date}_${heure}_FR.pdf`;
      if (await existePdf(`${DOCUMENTS}CA_Pmr/${nom}`)) {
        console.log(`  ✔ TROUVÉ ${nom}`);
        trouvees.push(nom);
      }
    }
    console.log(`  ${heure} : ${trouvees.length} trouvé(s) — ${compteur.n} requête(s)`);
    if (trouvees.length) return trouvees;
  }
  return trouvees;
}

// ---------- Programme ----------

async function principal() {
  const rapport = { generatedAt: new Date().toISOString(), a: [], b: null };

  console.log('\n\n########## A. Les procès-verbaux qui ne rendent aucune résolution ##########');
  console.log('\n>>> Témoin : un conseil dont la lecture marche, pour comparer.');
  rapport.a.push(await examiner(TEMOIN, 45));
  for (const m of MUETS) rapport.a.push(await examiner(m));

  console.log('\n\n########## B. Les séances du Plateau-Mont-Royal ##########');
  const compteur = { n: 0 };
  const trouvees = await chercherPlateau(compteur);
  rapport.b = { requetes: compteur.n, trouvees };
  console.log(
    trouvees.length
      ? `\n${trouvees.length} document(s) trouvé(s) en ${compteur.n} requêtes.`
      : `\nRien en ${compteur.n} requêtes : ni les six codes candidats, ni les huit heures. Le Plateau ne publie pas sous Adi_Public.`
  );

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
  console.log('\nRapport écrit dans data/arrondissements-diagnostic.json');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
