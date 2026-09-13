// Découverte, pas extraction : ce script ne produit aucune donnée de site. Il répond à
// deux questions auxquelles on ne peut pas répondre depuis un poste qui n'atteint pas
// montreal.ca, et il écrit sa réponse dans data/arrondissements-decouverte.json pour que
// le vrai extracteur s'appuie dessus.
//
//   1. Quel CODE la Ville emploie pour chacun des 19 conseils d'arrondissement dans le
//      nom de ses fichiers ? On en connaît quatre par observation (Pmr, Rpp, Sud, Pir),
//      les quinze autres sont à trouver.
//   2. Où sont les DATES de leurs séances ? Le calendrier CKAN des séances ne couvre que
//      CE, CM et CG — son identifiant le dit.
//
// Il procède du moins coûteux au plus coûteux, et s'arrête dès qu'une étape suffit :
//   A. le catalogue CKAN, qui est la source à privilégier si elle existe ;
//   B. le listage du répertoire des documents, qui donnerait tout d'un coup ;
//   C. le sondage d'URL, en dernier recours, borné et journalisé.
//
// À lancer sur GitHub Actions (`npm run decouvrir:arrondissements`), pas sur un poste :
// c'est du trafic vers la Ville, et le bac à sable de développement ne l'atteint pas.

import { writeFile, mkdir } from 'node:fs/promises';
import { API_CKAN, DOCUMENTS, json, texte, requete } from '../lib/mtl.js';
import { ARRONDISSEMENTS } from '../lib/noms.js';

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
  for (const chemin of ['', 'CE/', 'CA_Pmr/']) {
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

// ---------- C. Le sondage d'URL ----------

// Les codes possibles pour un arrondissement, du plus probable au moins probable. La
// Ville n'a pas de règle unique : « Pmr » et « Rpp » sont les initiales des mots
// significatifs, « Sud » et « Pir » sont les trois premières lettres d'un mot. On propose
// les deux formes, plus quelques variantes.
export function candidatsCode(nom) {
  const sansAccent = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // « Le », « La », « L' », « des », « de », « du », « aux », « et » ne comptent pas.
  const VIDES = new Set(['le', 'la', 'les', 'l', 'de', 'des', 'du', 'aux', 'au', 'et', 'sainte', 'saint', 'st', 'ste']);
  const mots = sansAccent(nom)
    .split(/[\s\-–—'']+/)
    .map((m) => m.trim())
    .filter(Boolean);
  const forts = mots.filter((m) => !VIDES.has(m.toLowerCase()));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  const propositions = [];
  const ajouter = (c) => {
    if (c && c.length >= 2 && !propositions.includes(c)) propositions.push(c);
  };

  // Initiales des mots significatifs, coupées à trois puis à quatre lettres.
  const initialesFortes = forts.map((m) => m[0]).join('');
  ajouter(cap(initialesFortes.slice(0, 3)));
  ajouter(cap(initialesFortes.slice(0, 4)));
  ajouter(cap(initialesFortes.slice(0, 2)));
  // Initiales de TOUS les mots, « Saint » compris (Saint-Laurent -> Sl, Stl).
  const initialesToutes = mots.map((m) => m[0]).join('');
  ajouter(cap(initialesToutes.slice(0, 3)));
  ajouter(cap(initialesToutes.slice(0, 2)));
  // Trois premières lettres du premier mot significatif, et du dernier.
  ajouter(cap(forts[0]?.slice(0, 3)));
  ajouter(cap(forts.at(-1)?.slice(0, 3)));
  // « Saint-Laurent » -> « Sla » : initiale du premier mot, début du second.
  if (forts.length >= 2) ajouter(cap(forts[0][0] + forts[1].slice(0, 2)));
  // Squelette consonantique du premier mot : « Pierrefonds » -> « Pir », qui est
  // justement la forme qu'aucune des règles précédentes ne produit.
  const premier = forts[0] ?? '';
  const squelette = premier[0] + [...premier.slice(1)].filter((c) => !'aeiouy'.includes(c.toLowerCase())).join('');
  ajouter(cap(squelette.slice(0, 3)));
  // Première et troisième lettre du premier mot, plus l'initiale du second.
  if (premier.length >= 3 && forts.length >= 2) ajouter(cap(premier[0] + premier[2] + forts[1][0]));
  return propositions;
}

// Une séance de conseil d'arrondissement a lieu en général une fois par mois, en soirée.
// On sonde un ordre du jour, pas un procès-verbal : l'ODJ paraît avant la séance et reste
// en ligne, alors que le PV n'existe qu'une fois approuvé.
const HEURES = ['19h00', '18h30', '19h30', '18h00'];

function joursDuMois(annee, mois, jourSemaine) {
  const out = [];
  const d = new Date(Date.UTC(annee, mois - 1, 1));
  while (d.getUTCMonth() === mois - 1) {
    if (d.getUTCDay() === jourSemaine) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Existe-t-il un PDF à cette URL ? On ne télécharge pas le corps : un GET suffit, mais on
// s'arrête à l'en-tête. `requete` rend null sur 404, ce qui est la réponse normale ici.
async function existe(url) {
  try {
    const rep = await requete(url, { accept: 'application/pdf' });
    if (!rep) return false;
    const type = rep.headers.get('content-type') ?? '';
    // La Ville sert une page « 404 introuvable » avec un code 200 : le type le trahit.
    return /pdf/i.test(type);
  } catch {
    return false;
  }
}

// Cherche la grille de dates d'un code dont on SAIT qu'il est bon. Le résultat sert à
// resserrer le sondage des codes inconnus : inutile d'essayer 200 dates par code si les
// arrondissements siègent tous le même mardi soir.
async function grilleDuTemoin(code, annee, budget) {
  const trouves = [];
  let essais = 0;
  for (const mois of [2, 3, 4]) {
    for (const jourSemaine of [1, 2, 3]) {
      for (const date of joursDuMois(annee, mois, jourSemaine)) {
        for (const heure of HEURES) {
          if (essais >= budget) return { trouves, essais, epuise: true };
          essais++;
          const url = `${DOCUMENTS}CA_${code}/CA_${code}_ODJ_LPP_ORDI_${date}_${heure}_FR.pdf`;
          if (await existe(url)) {
            trouves.push({ date, heure, jourSemaine, url });
            console.log(`    ✓ ${date} ${heure}`);
            break; // une séance par jour suffit
          }
        }
      }
    }
  }
  return { trouves, essais, epuise: false };
}

// ---------- Programme ----------

async function principal() {
  const annee = Number(process.argv.find((a) => /^\d{4}$/.test(a)) ?? new Date().getUTCFullYear());
  const rapport = { generatedAt: new Date().toISOString(), annee, etapes: {} };

  console.log('=== A. Le catalogue de données ouvertes ===');
  console.log('(10 s entre deux requêtes : le robots.txt du portail le demande)');
  try {
    rapport.etapes.catalogue = await chercherCalendriers();
    console.log(`\n  ${rapport.etapes.catalogue.length} jeu(x) distinct(s). Les cinq mieux classés :`);
    for (const j of rapport.etapes.catalogue.slice(0, 5)) {
      console.log(`   • ${j.id}`);
      console.log(`     ${j.titre}`);
      for (const r of j.ressources.slice(0, 4)) console.log(`       - [${r.format}] ${r.nom}`);
    }
  } catch (err) {
    rapport.etapes.catalogue = { erreur: String(err.message ?? err) };
    console.warn(`  ⚠ ${err.message ?? err}`);
  }

  console.log('\n=== B. Le répertoire des documents se laisse-t-il lister ? ===');
  rapport.etapes.listage = await listerRepertoires();

  console.log('\n=== C. Sondage : la grille de dates du témoin CA_Pmr ===');
  const temoin = await grilleDuTemoin('Pmr', annee, 220);
  rapport.etapes.temoin = { code: 'Pmr', ...temoin };
  console.log(`  ${temoin.trouves.length} séance(s) trouvée(s) en ${temoin.essais} essai(s)${temoin.epuise ? ' (budget épuisé)' : ''}`);
  const heuresVues = [...new Set(temoin.trouves.map((t) => t.heure))];
  const joursVus = [...new Set(temoin.trouves.map((t) => t.jourSemaine))];
  if (temoin.trouves.length) console.log(`  heures : ${heuresVues.join(', ')} — jours de semaine : ${joursVus.join(', ')}`);

  console.log('\n=== D. Les codes candidats des 19 arrondissements ===');
  const codes = {};
  for (const nom of ARRONDISSEMENTS) {
    codes[nom] = { connu: CODES_ATTRIBUES[nom] ?? null, candidats: candidatsCode(nom) };
    const marque = CODES_ATTRIBUES[nom] ? `  (vu : ${CODES_ATTRIBUES[nom]})` : '';
    console.log(`  ${nom}${marque}`);
    console.log(`    ${codes[nom].candidats.join(', ')}`);
  }
  rapport.etapes.codes = codes;
  // La règle de génération est-elle bonne ? Elle doit retrouver les quatre témoins.
  const manques = Object.entries(CODES_ATTRIBUES).filter(([nom, c]) => !codes[nom].candidats.includes(c));
  rapport.etapes.temoinsManques = manques.map(([nom, c]) => ({ nom, code: c, candidats: codes[nom].candidats }));
  if (manques.length) {
    console.log(`\n  ⚠ la règle ne retrouve pas ${manques.length} code(s) attribué(s) :`);
    for (const [nom, c] of manques) console.log(`    ${nom} : ${c} absent de [${codes[nom].candidats.join(', ')}]`);
  } else {
    console.log('\n  ✓ la règle retrouve les codes déjà attribués.');
  }

  // Sondage des codes inconnus, sur les dates où le témoin a effectivement siégé : si les
  // conseils suivent des calendriers différents, ce sondage échouera et le dira.
  if (temoin.trouves.length) {
    console.log('\n=== E. Sondage des codes inconnus ===');
    const dates = temoin.trouves.slice(0, 4);
    const resultats = {};
    for (const nom of ARRONDISSEMENTS) {
      if (CODES_ATTRIBUES[nom]) continue;
      resultats[nom] = null;
      // Les codes vus dans une URL mais pas encore attribués passent en tête : ils
      // existent pour sûr, il ne manque que leur propriétaire.
      const libres = CODES_VUS.filter((c) => !Object.values(CODES_ATTRIBUES).includes(c) && !Object.values(resultats).some((r) => r?.code === c));
      for (const code of [...libres, ...codes[nom].candidats]) {
        let trouve = null;
        for (const { date } of dates) {
          for (const heure of HEURES) {
            const url = `${DOCUMENTS}CA_${code}/CA_${code}_ODJ_LPP_ORDI_${date}_${heure}_FR.pdf`;
            if (await existe(url)) {
              trouve = { code, date, heure, url };
              break;
            }
          }
          if (trouve) break;
        }
        if (trouve) {
          resultats[nom] = trouve;
          console.log(`  ✓ ${nom} -> CA_${code}  (${trouve.date} ${trouve.heure})`);
          break;
        }
      }
      if (!resultats[nom]) console.log(`  ✗ ${nom} : aucun candidat n'a répondu`);
    }
    rapport.etapes.sondage = resultats;
    const ok = Object.values(resultats).filter(Boolean).length;
    console.log(`\n  ${ok} / ${ARRONDISSEMENTS.length - Object.keys(CODES_ATTRIBUES).length} code(s) inconnu(s) résolu(s)`);
  } else {
    console.log('\n=== E. Sondage des codes inconnus : sauté ===');
    console.log('  Le témoin CA_Pmr n\'a donné aucune date : la forme d\'URL ou la grille');
    console.log('  de dates est fausse, sonder les autres codes ne prouverait rien.');
    rapport.etapes.sondage = null;
  }

  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
  console.log(`\nRapport écrit dans data/arrondissements-decouverte.json`);
}

// Comme les autres extracteurs : importer ce fichier ne doit pas le lancer (les tests
// se servent de candidatsCode).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
