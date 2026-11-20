// SYNCHRO DU MOTEUR COMMUN DES VILLES (20 nov. 2026). Les volets de ville des autres dépôts
// (Vancouver dans dossierBC, Ottawa dans dossierontario, Fredericton dans dossiernbrunswick) roulent
// sur le même moteur que les villes du Québec, mais chaque site doit rouler seul : le moteur n'y est
// pas chargé depuis dossierquebec.ca (CORS, pannes croisées), il y est COPIÉ par ce script.
//
// Copie commun/ville/moteur.js et commun/ville/style.css de ce dépôt vers <dépôt cible>/commun/ville/,
// avec en tête le commit d'origine. On ne modifie jamais la copie : on corrige ici, puis on resynchronise.
//
//   node scripts/synchro-moteur.js ../dossierBC                 copie (ou met à jour) le moteur
//   node scripts/synchro-moteur.js ../dossierBC --verifier      échoue (code 1) si la copie est en retard
//   node scripts/synchro-moteur.js ../dossierBC ../dossierontario ../dossiernbrunswick --verifier
//
// Le commit inscrit est le dernier qui a touché commun/ville/ ; si ces fichiers ont des changements pas
// encore commités, l'en-tête le dit (« + modifications locales ») : on synchronise après le commit.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FICHIERS = ['commun/ville/moteur.js', 'commun/ville/style.css'];

const git = (...args) => execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' }).trim();
const commit = git('log', '-1', '--format=%h %cs', '--', 'commun/ville');
const modifie = git('status', '--porcelain', '--', 'commun/ville') !== '';
const origine = `dossierquebec ${commit}${modifie ? ' + modifications locales' : ''}`;

// En-tête : un commentaire de la langue du fichier, suivi du fichier source tel quel. Les fins de ligne
// suivent la source.
function copie(fichier) {
  const source = readFileSync(join(RACINE, fichier), 'utf8');
  const fin = source.includes('\r\n') ? '\r\n' : '\n';
  const texte = `COPIE de ${fichier} (${origine}). Ne pas modifier ici : corriger dans dossierquebec, puis node scripts/synchro-moteur.js <ce dépôt>.`;
  const entete = fichier.endsWith('.css') ? `/* ${texte} */` : `// ${texte}`;
  return entete + fin + source;
}

const args = process.argv.slice(2);
const verifier = args.includes('--verifier');
const cibles = args.filter((a) => !a.startsWith('--'));
if (!cibles.length) {
  console.error('Usage : node scripts/synchro-moteur.js <dépôt cible> [<autre dépôt>…] [--verifier]');
  process.exit(2);
}

let enRetard = 0;
for (const cible of cibles) {
  const racineCible = resolve(cible);
  if (!existsSync(racineCible)) {
    console.error(`${cible} : dossier introuvable`);
    process.exit(2);
  }
  for (const fichier of FICHIERS) {
    const attendu = copie(fichier);
    const chemin = join(racineCible, fichier);
    const actuel = existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
    // La ligne d'en-tête seule peut différer (un commit qui ne change pas le fichier) : on compare le corps.
    const corps = (t) => t?.slice(t.search(/\r?\n/) + 1);
    if (verifier) {
      if (corps(actuel) !== corps(attendu)) {
        enRetard++;
        console.error(`EN RETARD : ${chemin}${actuel ? '' : ' (absent)'} — relancer node scripts/synchro-moteur.js ${cible}`);
      } else console.log(`à jour : ${chemin}`);
      continue;
    }
    if (actuel === attendu) { console.log(`inchangé : ${chemin}`); continue; }
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, attendu);
    console.log(`copié : ${chemin} (${origine})`);
  }
}
if (enRetard) process.exit(1);
