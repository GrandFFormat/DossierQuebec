// Le calendrier des séances des 19 conseils d'arrondissement.
//
// Il n'y a pas de source toute faite. Le jeu de données ouvert « calendrier des instances
// politiques » ne couvre que la ville centrale — son titre le dit —, et les arrondissements
// ne publient pas tous le leur. Restent les documents eux-mêmes : le nom d'un fichier
// contient la date et l'heure, donc l'existence du fichier PROUVE la séance.
//
// CE SCRIPT A UNE DATE DE PÉREMPTION, et c'est une bonne nouvelle. Interrogée le 13 septembre
// 2026, la Ville a répondu le 16 : les horaires ne sont pas dans le calendrier central parce
// que les dix-neuf conseils sont autonomes et gérés par d'autres équipes, et elle cherche une
// façon de réunir ces dix-neuf sources. Le jour où elle publiera, tout ce fichier devient
// inutile — il suffira de lire le calendrier comme on lit celui des instances centrales.
//
// D'où la méthode : on cherche les fichiers. L'heure est stable et connue par
// arrondissement (voir ARRONDISSEMENTS_CODES), la date ne l'est pas — « le premier mardi
// du mois » est une bonne approximation qui se trompe souvent, et les relâches d'été et
// de janvier varient d'un conseil à l'autre. On procède donc ainsi, par arrondissement :
//
//   1. les deux premières semaines d'un mois sont balayées, du lundi au jeudi et sur les
//      cinq formes de nom, jusqu'à la première séance trouvée. On y APPREND deux choses :
//      le rythme du conseil (« deuxième mardi ») et la forme sous laquelle il publie ;
//   2. les autres mois sont sondés au rythme appris et sur cette seule forme — une
//      requête quand ça tombe juste —, puis sur le même jour de semaine des autres
//      semaines, puis sur tout le mois avec toutes les formes, au cas où le conseil
//      aurait changé d'habitude.
//
// Un balayage aveugle coûterait un millier de requêtes par arrondissement ; celui-ci en
// coûte quelques dizaines, et bien moins aux exécutions suivantes puisqu'une séance déjà
// connue n'est jamais re-sondée. Un budget par arrondissement borne les dégâts si un code
// ou une heure se révélait faux.
//
// Ce que ce script NE FAIT PAS : deviner les séances extraordinaires. Elles se tiennent à
// des heures imprévisibles (8 h 30, 9 h 15, 13 h 30…) et rien dans leur nom ne se déduit.
// Elles entreront le jour où la Ville publiera un calendrier, ou par une autre porte.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import {
  ARRONDISSEMENTS_CODES,
  DOCUMENTS,
  heuresArrondissement,
  instanceArrondissement,
  nomConseil,
  corrigerNomConseil,
  requete,
} from '../lib/mtl.js';
import { seancesPlateau, documentsDeLArrondissement } from '../lib/plateau.js';

const OUT = new URL('../data/seances-arrondissements.json', import.meta.url);

// Les conseils d'arrondissement siègent en soirée de semaine. Le vendredi, le samedi et
// le dimanche ne sont jamais sondés : la Ville n'y tient pas de séance ordinaire.
const JOURS_UTILES = [1, 2, 3, 4]; // lundi..jeudi

// ---------- Dates ----------

function joursDuMois(annee, mois) {
  const out = [];
  const d = new Date(Date.UTC(annee, mois - 1, 1));
  while (d.getUTCMonth() === mois - 1) {
    if (JOURS_UTILES.includes(d.getUTCDay())) {
      out.push({
        date: d.toISOString().slice(0, 10),
        jourSemaine: d.getUTCDay(),
        rang: Math.ceil(d.getUTCDate() / 7), // 1re, 2e, 3e… occurrence de ce jour dans le mois
      });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ---------- Un document existe-t-il ? ----------

// On ne veut savoir qu'une chose : y a-t-il un PDF là. La Ville répond parfois 200 avec
// une page « 404 introuvable » en HTML — le type de contenu la trahit. On ne lit jamais
// le corps : la réponse est annulée aussitôt, pour ne pas transporter des mégaoctets de
// PDF pendant une phase qui ne fait que compter.
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

// Les cinq formes de nom, dans l'ordre où elles valent la peine d'être essayées. Un PV
// n'existe qu'après approbation, un ODJ existe dès avant la séance : les deux ensemble
// couvrent l'année entière. Les quatre formes d'ODJ coexistent réellement, et un même
// conseil passe de l'une à l'autre d'une année à l'autre.
const FORMES = ['PV_ORDI', 'ODJ_LPP_ORDI', 'ODJP_ORDI', 'ODJ_LP_ORDI', 'ODJ_ORDI'];

// Une séance a-t-elle eu lieu ce jour-là ? `formes` permet de restreindre l'essai à ce
// qu'on a appris de cet arrondissement : une fois qu'on sait qu'il publie des « ODJP »,
// sonder les quatre autres formes à chaque date sans séance coûte cinq fois trop cher.
async function sonder(instance, date, heures, compteur, formes = FORMES) {
  for (const heure of heures) {
    for (const forme of formes) {
      const nom = `${instance}_${forme}_${date}_${heure}_FR.pdf`;
      compteur.n++;
      if (await existePdf(`${DOCUMENTS}${instance}/${nom}`)) return { heure, forme, preuve: nom };
    }
  }
  return null;
}

// ---------- Le calendrier d'un arrondissement ----------

// Les trois heures en usage chez l'ensemble des conseils. Quand celle qu'on croit connaître
// ne donne rien, c'est qu'elle a changé : on essaie les autres avant de conclure.
const HEURES_CONNUES = ['19h00', '18h30', '19h30'];

async function calendrierDe(nom, annee, connues, compteur, budget = 400, heuresForcees = null) {
  const instance = instanceArrondissement(nom);
  const heures = heuresForcees ?? heuresArrondissement(nom);
  const trouvees = [];
  // Ce qu'on sait déjà : on ne re-sonde jamais une date confirmée.
  const dejaVues = new Map(connues.filter((s) => s.instance === instance).map((s) => [s.date, s]));
  const depart = compteur.n;
  const reste = () => budget - (compteur.n - depart);

  // Ce qu'on apprend en chemin, et qui rend la suite bon marché : à quel rythme ce
  // conseil siège, et sous quelle forme il publie.
  let rythme = null; // { jourSemaine, rang }
  let forme = null; // « ODJP_ORDI », « ODJ_LPP_ORDI »…
  for (const s of dejaVues.values()) {
    const m = String(s.preuve ?? '').match(/^CA_\w+_(.+)_\d{4}-\d\d-\d\d_/);
    if (m) forme = m[1];
  }

  // Les formes à essayer : celle qu'on connaît d'abord, les autres ensuite. `courtes`
  // sert aux dates ordinaires, `toutes` aux vérifications de fin de mois.
  const toutes = () => (forme ? [forme, ...FORMES.filter((f) => f !== forme)] : FORMES);
  const courtes = () => (forme ? [forme] : FORMES);

  // On ne sonde pas l'avenir. Les documents d'une séance qui n'a pas eu lieu n'existent
  // pas, et c'est là que tout le budget partait : les journaux du premier vrai passage
  // montrent chaque arrondissement épuisant ses 260 requêtes sur octobre, novembre et
  // décembre, APRÈS avoir déjà trouvé toutes ses séances de l'année.
  const auj = new Date().toISOString().slice(0, 10);
  const dernierMois = annee < Number(auj.slice(0, 4)) ? 12 : Number(auj.slice(5, 7));

  for (let mois = 1; mois <= dernierMois; mois++) {
    if (reste() <= 0) {
      console.warn(`    ⚠ budget de requêtes épuisé pour ${nom} au mois ${mois}`);
      break;
    }
    const jours = joursDuMois(annee, mois).filter((j) => j.date <= auj);
    if (!jours.length) continue;

    // Une séance déjà connue ce mois-ci : on la garde, on en apprend le rythme, on passe.
    const connueCeMois = jours.map((j) => dejaVues.get(j.date)).find(Boolean);
    if (connueCeMois) {
      trouvees.push({ ...connueCeMois, nomInstance: corrigerNomConseil(connueCeMois.nomInstance) });
      const j = jours.find((x) => x.date === connueCeMois.date);
      if (j) rythme = { jourSemaine: j.jourSemaine, rang: j.rang };
      continue;
    }

    // L'ordre de sondage : le rythme appris d'abord, puis le même jour de semaine les
    // autres semaines, puis le reste du mois. Sans rythme (premier mois), les deux
    // premières semaines d'abord : c'est là que siègent la plupart des conseils.
    let ordre;
    if (rythme) {
      const exact = jours.filter((j) => j.jourSemaine === rythme.jourSemaine && j.rang === rythme.rang);
      const memeJour = jours.filter((j) => j.jourSemaine === rythme.jourSemaine && j.rang !== rythme.rang);
      ordre = [...exact, ...memeJour, ...jours.filter((j) => j.jourSemaine !== rythme.jourSemaine)];
    } else {
      ordre = [...jours.filter((j) => j.rang <= 2), ...jours.filter((j) => j.rang > 2)];
    }

    let trouvee = null;
    // Deux passes. La première essaie la forme apprise sur tout le mois : une requête par
    // date. La seconde essaie toutes les formes, mais SEULEMENT sur les dates du rythme —
    // un conseil qui change de forme ne change pas de jour le même mois, et rebalayer les
    // seize dates sur cinq formes coûtait quatre-vingts requêtes à chaque mois de relâche.
    const passes = forme ? [{ formes: courtes(), dates: ordre }, { formes: toutes(), dates: ordre.slice(0, 4) }] : [{ formes: toutes(), dates: ordre }];
    for (const { formes, dates: ordreDeLaPasse } of passes) {
      for (const j of ordreDeLaPasse) {
        if (reste() <= 0) break;
        const hit = await sonder(instance, j.date, heures, compteur, formes);
        if (!hit) continue;
        forme = hit.forme;
        rythme = { jourSemaine: j.jourSemaine, rang: j.rang };
        trouvee = {
          id: `${instance}_${j.date}_${hit.heure}`,
          instance,
          arrondissement: nom,
          nomInstance: nomConseil(nom),
          date: j.date,
          heure: hit.heure,
          variante: 'ORDI',
          source: 'sondage des documents publiés',
          preuve: hit.preuve,
        };
        break;
      }
      if (trouvee) break;
    }
    if (trouvee) trouvees.push(trouvee);
  }
  return trouvees;
}

// ---------- Programme ----------

async function principal() {
  const annee = Number(process.argv.find((a) => /^\d{4}$/.test(a)) ?? new Date().getUTCFullYear());
  const seulement = process.argv.find((a) => a.startsWith('--arrondissement='))?.split('=')[1];

  // Ce qui est déjà connu n'est jamais redemandé à la Ville.
  let precedent = { seances: [] };
  try {
    precedent = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    /* première exécution */
  }
  const connues = (precedent.seances ?? []).filter((s) => String(s.date).startsWith(String(annee)));
  console.log(`${connues.length} séance(s) de ${annee} déjà connue(s).`);

  const noms = Object.keys(ARRONDISSEMENTS_CODES).filter((n) => !seulement || n === seulement);
  const compteur = { n: 0 };
  const toutes = [];
  const bilan = [];

  for (const nom of noms) {
    const avant = compteur.n;
    // Un conseil qui publie par sa page plutôt que sous Adi_Public (Le Plateau-Mont-Royal,
    // voir lib/plateau.js) : on lit sa page et la date dans chacun de ses documents. Le
    // sondage du répertoire n'a aucun sens pour lui — 900 requêtes en septembre 2026 pour rien.
    const { budget, publieParPage, page } = ARRONDISSEMENTS_CODES[nom] ?? {};
    let s;
    if (publieParPage) {
      try {
        s = await seancesPlateau(annee, compteur);
      } catch (err) {
        console.warn(`    ⚠ ${nom} : ${err.message ?? err}`);
        s = connues.filter((x) => x.instance === instanceArrondissement(nom));
      }
    } else {
      s = await calendrierDe(nom, annee, connues, compteur, budget ?? 400);
      // Rien du tout : l'heure que l'on croit connaître a changé. On réessaie sur les trois
      // heures en usage avant de déclarer forfait.
      if (!s.length) {
        console.log(`    ${nom} : rien à l'heure habituelle, essai des autres heures…`);
        s = await calendrierDe(nom, annee, connues, compteur, 160, HEURES_CONNUES);
        if (s.length) console.log(`    ✓ trouvé à ${[...new Set(s.map((x) => x.heure))].join(', ')} — à corriger dans ARRONDISSEMENTS_CODES`);
      }
    }
    // Un arrondissement qui publie sur sa page un ordre du jour plus complet que celui
    // d'Adi_Public : on attache cette adresse à la séance du même jour, et decisions.js la
    // préfère (c'est là que sont les sommaires décisionnels).
    if (page && !publieParPage && s.length) {
      try {
        const parDate = await documentsDeLArrondissement(nom, page, compteur);
        let attaches = 0;
        for (const seance of s) {
          const trouve = parDate[seance.date];
          if (!trouve?.ODJ) continue;
          seance.documents = { ...(seance.documents ?? {}), ODJ: trouve.ODJ };
          seance.sourceOdj = 'page de l’arrondissement (sommaires décisionnels annexés)';
          attaches++;
        }
        if (attaches) console.log(`    ${nom} : ${attaches} ordre(s) du jour repris de sa page, sommaires compris.`);
      } catch (err) {
        console.warn(`    ⚠ ${nom} : sa page n'a rien donné — ${err.message ?? err}`);
      }
    }
    toutes.push(...s);
    const nouvelles = s.filter((x) => !connues.some((c) => c.id === x.id)).length;
    bilan.push({ arrondissement: nom, seances: s.length, nouvelles, requetes: compteur.n - avant });
    console.log(
      `  ${nom.padEnd(42)} ${String(s.length).padStart(2)} séance(s)` +
        (nouvelles ? `, ${nouvelles} nouvelle(s)` : '') +
        `  (${compteur.n - avant} requêtes)`
    );
    // Sauvegarde après chaque arrondissement : un run interrompu ne perd pas son travail.
    await ecrire(annee, toutes, precedent, bilan, compteur, false);
  }

  await ecrire(annee, toutes, precedent, bilan, compteur, true);

  const total = toutes.length;
  const sans = bilan.filter((b) => b.seances === 0);
  console.log(`\n${total} séance(s) d'arrondissement pour ${annee}, en ${compteur.n} requête(s).`);
  if (sans.length) {
    console.warn(`⚠ ${sans.length} arrondissement(s) sans aucune séance trouvée :`);
    for (const b of sans) console.warn(`   ${b.arrondissement} — code ou heure à revoir`);
  }
  const moyenne = total / Math.max(1, noms.length - sans.length);
  if (moyenne < 6) console.warn(`⚠ ${moyenne.toFixed(1)} séance(s) par conseil en moyenne : c'est peu pour une année, le sondage rate probablement des dates.`);
}

async function ecrire(annee, seances, precedent, bilan, compteur, definitif) {
  // Les séances des autres années restent : ce fichier s'enrichit, il ne se remplace pas.
  const autresAnnees = (precedent.seances ?? []).filter((s) => !String(s.date).startsWith(String(annee)));
  const parId = new Map([...autresAnnees, ...seances].map((s) => [s.id, s]));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: DOCUMENTS,
    licence: 'Documents publics de la Ville de Montréal — reproduction avec mention de la source, usage non commercial (voir README).',
    methode:
      "Sondage des noms de fichiers publiés : l'existence du document prouve la séance. Les séances extraordinaires, dont l'heure est imprévisible, ne sont pas couvertes. Le Plateau-Mont-Royal, qui publie par sa page et non sous Adi_Public, est lu depuis cette page : la date vient du document lui-même (voir lib/plateau.js).",
    annee,
    partiel: !definitif,
    nombre: parId.size,
    requetes: compteur.n,
    parArrondissement: bilan,
    seances: [...parId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.instance.localeCompare(b.instance)),
  };
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { joursDuMois, calendrierDe };
