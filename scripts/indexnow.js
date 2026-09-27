// Avertit Bing (et les autres moteurs du protocole IndexNow : Yandex, Seznam, Naver…) que les
// pages de DossierQuébec ont changé, pour qu'il repasse sans attendre sa tournée. Ajouté le
// 27 sept. 2026 : Bing montrait encore le titre « Dossier » et un bout de résumé de projet de loi,
// d'avant le chantier du référencement du 21 septembre.
//
//   node scripts/indexnow.js            envoie toutes les adresses du sitemap
//   node scripts/indexnow.js --essai    affiche ce qui partirait, sans rien envoyer
//
// La clé n'est PAS un secret : IndexNow la veut publique, dans un fichier à la racine du site
// (<clé>.txt, qui contient la clé), pour prouver qu'on parle bien au nom de dossierquebec.ca.
// Lancé par .github/workflows/indexnow.yml.

import { readFileSync } from 'node:fs';

const HOTE = 'dossierquebec.ca';
const CLE = '11c9d53816cf182c6f38b2604d6d8444';

const adresses = [...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (!adresses.length) throw new Error('sitemap.xml ne contient aucune adresse');

const corps = { host: HOTE, key: CLE, keyLocation: `https://${HOTE}/${CLE}.txt`, urlList: adresses };
if (process.argv.includes('--essai')) {
  console.log(`${adresses.length} adresses, rien d'envoyé :`);
  for (const a of adresses) console.log(`  ${a}`);
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(corps),
});
// 200 : reçu ; 202 : reçu, clé en cours de vérification. Le reste est une vraie erreur.
console.log(`IndexNow : ${res.status} pour ${adresses.length} adresses.`);
if (![200, 202].includes(res.status)) {
  console.error(await res.text());
  process.exit(1);
}
