// Une seule question, posée avec un vrai navigateur : dans le portail documentaire de la
// Ville, un citoyen peut-il trouver un sommaire décisionnel à partir de son numéro de
// dossier ? Et si oui, l'adresse du résultat est-elle partageable ?
//
// Pourquoi un navigateur. Le portail (mtl.ged.montreal.ca) est un Constellio bâti sur
// Vaadin 7 : toute l'interface vit sur le serveur, et le navigateur ne fait que lui parler
// par un tuyau unique, lié à la session. Il n'y a donc aucune adresse de recherche à
// deviner — le sondage du 17 septembre l'a confirmé, chaque chemin essayé renvoyant la même
// coquille de 2 148 octets. La seule façon de savoir ce que le portail sait faire est de
// s'en servir comme un humain s'en sert.
//
//   npm run sonder:ged             cherche un numéro de dossier connu
//   npm run sonder:ged -- 1269902004
//
// CE QUE CE SCRIPT NE FAIT PAS. Il ne récolte rien. Il ouvre une page, tape un numéro,
// regarde le résultat, écrit ce qu'il a vu et s'en va. Une recherche, une session. Lire les
// 4 088 dossiers de cette façon demanderait 4 088 navigateurs sur un serveur dont la Ville
// vient de nous dire que le trafic automatisé a décuplé : ce n'est pas une option, et ce
// n'est pas ce qu'on cherche. Ce qu'on cherche, c'est de savoir quoi demander ensuite.

import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../data/ged-sonde.json', import.meta.url);
const PORTAIL = 'https://mtl.ged.montreal.ca/constellio/?collection=mtlca&portal=REPDOCVDM';
const DOSSIER = process.argv.find((a) => /^\d{10}$/.test(a)) ?? '1265298015';

async function principal() {
  const { chromium } = await import('playwright');
  const rapport = { generatedAt: new Date().toISOString(), portail: PORTAIL, dossier: DOSSIER };
  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({
    userAgent: `Mozilla/5.0 (compatible; DossierVille/0.1; veille citoyenne; ${process.env.MTL_CONTACT ?? 'dossierquebec.ca'})`,
    locale: 'fr-CA',
  });
  const page = await contexte.newPage();

  // Ce que le portail demande au serveur : c'est là qu'on verra s'il existe une adresse
  // utilisable, ou seulement le tuyau de Vaadin.
  const appels = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://mtl.ged.montreal.ca') && !/\.(css|js|png|gif|svg|woff2?)(\?|$)/i.test(r.url())) {
      appels.push({ methode: r.method(), url: r.url().replace('https://mtl.ged.montreal.ca', '') });
    }
  });

  console.log(`Ouverture du portail…`);
  await page.goto(PORTAIL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  rapport.titre = await page.title();
  console.log(`  titre de la page : « ${rapport.titre} »`);

  // Le champ de recherche, quel qu'il s'appelle. Vaadin ne met pas de noms stables sur ses
  // champs : on prend le premier champ de texte visible.
  const champs = page.locator('input[type="text"]:visible, input:not([type]):visible');
  const nombreChamps = await champs.count();
  console.log(`  ${nombreChamps} champ(s) de saisie visible(s)`);
  rapport.champs = nombreChamps;

  if (!nombreChamps) {
    console.log("  Aucun champ : le portail demande peut-être une authentification.");
    rapport.conclusion = 'aucun champ de recherche visible';
  } else {
    console.log(`  Recherche de « ${DOSSIER} »…`);
    await champs.first().fill(DOSSIER);
    await champs.first().press('Enter');
    await page.waitForTimeout(6000);
    rapport.urlApres = page.url();
    const corps = await page.locator('body').innerText().catch(() => '');
    rapport.trouveLeDossier = corps.includes(DOSSIER);
    // Combien de résultats, si la page le dit.
    rapport.mentionResultats = corps.match(/(\d[\d\s]*)\s*(r[ée]sultats?|documents?)/i)?.[0] ?? null;
    rapport.extrait = corps.replace(/\s+/g, ' ').slice(0, 900);
    console.log(`  adresse après recherche : ${rapport.urlApres}`);
    console.log(`  le numéro apparaît dans la page : ${rapport.trouveLeDossier ? 'OUI' : 'non'}`);
    if (rapport.mentionResultats) console.log(`  ${rapport.mentionResultats}`);
    console.log(`\n  --- ce que la page affiche ---\n  ${rapport.extrait.slice(0, 700)}`);
    await page.screenshot({ path: new URL('../data/ged-sonde.png', import.meta.url).pathname, fullPage: false });
  }

  rapport.appels = appels.slice(0, 25);
  console.log(`\n  --- ce que le portail demande au serveur (${appels.length} appels) ---`);
  for (const a of rapport.appels) console.log(`  ${a.methode.padEnd(5)} ${a.url.slice(0, 120)}`);

  await navigateur.close();
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(rapport, null, 1) + '\n');
  console.log('\nRapport écrit dans data/ged-sonde.json');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
