// La section « Pour les abonné·e·s » d'un numéro de l'infolettre de l'Assemblée nationale
// (api/_section-abonnes.js), fabriquée à partir des données du dépôt, sans aucun appel réseau.
//
//   node scripts/section-abonnes.js --mois=2026-12                     écrit le bloc (deux versions) à l'écran
//   node scripts/section-abonnes.js --mois=2026-12 --dans=numero.html  le glisse dans le HTML du numéro, à la
//                                                                     place de <!--ABONNES--> (ou avant
//                                                                     <!--DESINSCRIPTION--> s'il n'y est pas)
//
// Le HTML qui en sort se publie dans infolettre_numeros comme les autres numéros ; à l'envoi,
// api/_infolettre.js (composer) garde la version complète pour les abonné·e·s, l'aperçu pour les autres.
// Un mois sans mémoire ni vote : rien n'est ajouté.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculerSection, enrober, aUneSection } from '../api/_section-abonnes.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const arg = (nom) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? null;
const mois = arg('mois');
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois ?? '')) { console.error('Usage : --mois=AAAA-MM [--dans=numero.html]'); process.exit(1); }

const lire = (chemin) => JSON.parse(readFileSync(`${racine}${chemin}`, 'utf8'));
const section = calculerSection(mois, { consultations: lire('api/consultations-data.json'), votes: lire('data/votes.json') });
const bloc = enrober(section);
console.error(section.vide
  ? `${mois} : ni mémoire ni vote, pas de section.`
  : `${mois} : ${section.memoires.total} mémoires, ${section.votes.total} votes nominaux.`);

const dans = arg('dans');
if (!dans) { process.stdout.write(bloc); process.exit(0); }
const html = readFileSync(dans, 'utf8');
if (aUneSection(html)) { console.error(`${dans} a déjà sa section : rien changé.`); process.exit(1); }
if (!bloc) process.exit(0);
const sortie = html.includes('<!--ABONNES-->') ? html.replace('<!--ABONNES-->', bloc)
  : html.includes('<!--DESINSCRIPTION-->') ? html.replace('<!--DESINSCRIPTION-->', `${bloc}<!--DESINSCRIPTION-->`) : null;
if (!sortie) { console.error(`${dans} n'a ni <!--ABONNES--> ni <!--DESINSCRIPTION--> : rien changé.`); process.exit(1); }
writeFileSync(dans, sortie);
console.error(`Section ajoutée à ${dans}.`);
