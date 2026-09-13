// Découverte, pas extraction : ce script ne produit aucune donnée de site.
//
// Il ne reste qu'une question ouverte sur les conseils d'arrondissement. Les codes que la
// Ville emploie dans ses noms de fichiers sont connus — les dix-neuf sont dans
// lib/mtl.js, chacun relevé dans une URL réellement publiée — et le calendrier de leurs
// séances est reconstitué en cherchant les documents (seances-arrondissements.js).
// Reste à savoir s'il existe une VRAIE source de dates, qui rendrait ce sondage inutile :
// un jeu de données ouvert par arrondissement, ou le jeu « événements publics » filtré
// sur les séances publiques. Ce script interroge le catalogue et écrit ce qu'il trouve.
//
// Quelques requêtes, une minute : le portail impose dix secondes entre deux appels.
//
//   npm run decouvrir:arrondissements

import { writeFile, mkdir } from 'node:fs/promises';
import { API_CKAN, DOCUMENTS, json, texte, requete } from '../lib/mtl.js';

const OUT = new URL('../data/arrondissements-decouverte.json', import.meta.url);

// Ce qu'on a VU dans de vraies URL, et ce qu'on en DÉDUIT : deux choses différentes.
// Pmr, Rpp et Sud se lisent sans effort. « Pir » a été vu lui aussi, mais rien ne dit à
// quel arrondissement il appartient — « Pierrefonds-Roxboro » n'est qu'une supposition,
// et le sondage tranchera. On ne code jamais une supposition comme un fait.
const CODES_VUS = ['Pmr', 'Rpp', 'Sud', 'Pir'];
const CODES_ATTRIBUES = {
  'Le Plateau-Mont-Royal': 'Pmr',
  'Rosemont–La Petite-Patrie': 'Rpp',
  'Le Sud-Ouest': 'Sud',
};

// ---------- A. Le catalogue de données ouvertes ----------

// Ce qu'on cherche : un jeu qui donne les dates de séance des arrondissements. On
// interroge le catalogue plutôt que de deviner des identifiants.
async function chercherCalendriers() {
  const requetes = [
    'calendrier seances arrondissement',
    'seances conseil arrondissement',
    'calendrier arrondissement',
    'assemblees arrondissement',
    'ordre du jour arrondissement',
  ];
  const vus = new Map();
  for (const q of requetes) {
    const url = `${API_CKAN}package_search?q=${encodeURIComponent(q)}&rows=25`;
    let rep;
    try {
      rep = await json(url);
    } catch (err) {
      console.warn(`  ⚠ recherche « ${q} » : ${err.message ?? err}`);
      continue;
    }
    const trouves = rep?.result?.results ?? [];
    console.log(`  « ${q} » : ${trouves.length} jeu(x)`);
    for (const j of trouves) {
      if (vus.has(j.name)) continue;
      vus.set(j.name, {
        id: j.name,
        titre: j.title,
        notes: (j.notes ?? '').replace(/\s+/g, ' ').slice(0, 300),
        ressources: (j.resources ?? []).map((r) => ({ nom: r.name, format: r.format, url: r.url })),
      });
    }
  }
  // Le tri met devant ce qui parle d'arrondissement ET de séance : c'est ce qu'on veut.
  const score = (j) => {
    const t = `${j.id} ${j.titre} ${j.notes}`.toLowerCase();
    return (/arrondissement/.test(t) ? 2 : 0) + (/s[ée]ance|assembl[ée]e|calendrier/.test(t) ? 1 : 0);
  };
  return [...vus.values()].sort((a, b) => score(b) - score(a));
}

// ---------- B. Le répertoire des documents ----------

// Si le serveur liste ses répertoires, la liste des instances tombe d'un coup. On teste
// d'abord sur la racine, puis sur un répertoire dont on sait qu'il existe (CE), pour
// distinguer « pas de listage » de « répertoire absent ».
async function listerRepertoires() {
  const essais = [];
  for (const chemin of ['', 'CE/', 'CA_Mhm/']) {
    const url = `${DOCUMENTS}${chemin}`;
    try {
      const html = await texte(url, { notFoundIsNull: true });
      if (html == null) {
        essais.push({ url, resultat: '404' });
        continue;
      }
      const liens = [...html.matchAll(/href="([^"?][^"]*)"/gi)].map((m) => m[1]).slice(0, 200);
      const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
      essais.push({
        url,
        resultat: liens.length ? `${liens.length} lien(s)` : `pas de listage — page « ${titre ?? '?'} »`,
        liens: liens.slice(0, 60),
      });
      console.log(`  ${url} -> ${essais.at(-1).resultat}`);
    } catch (err) {
      essais.push({ url, resultat: String(err.message ?? err) });
      console.log(`  ${url} -> ${essais.at(-1).resultat}`);
    }
  }
  return essais;
}

// ---------- Programme ----------

async function principal() {
  const rapport = { generatedAt: new Date().toISOString(), etapes: {} };

  console.log('=== A. Le catalogue de données ouvertes ===');
  console.log('(dix secondes entre deux requêtes : le robots.txt du portail le demande)');
  try {
    rapport.etapes.catalogue = await chercherCalendriers();
    console.log(`\n  ${rapport.etapes.catalogue.length} jeu(x) distinct(s). Les huit mieux classés :`);
    for (const j of rapport.etapes.catalogue.slice(0, 8)) {
      console.log(`   • ${j.id}`);
      console.log(`     ${j.titre}`);
      for (const r of j.ressources.slice(0, 4)) console.log(`       - [${r.format}] ${r.nom}`);
    }
  } catch (err) {
    rapport.etapes.catalogue = { erreur: String(err.message ?? err) };
    console.warn(`  ⚠ ${err.message ?? err}`);
  }

  console.log('\n=== B. Le répertoire des documents se laisse-t-il lister ? ===');
  console.log('(un listage rendrait tout sondage inutile)');
  rapport.etapes.listage = await listerRepertoires();

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
  console.log('\nRapport écrit dans data/arrondissements-decouverte.json');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
