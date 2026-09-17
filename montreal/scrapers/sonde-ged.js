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
  await page.waitForTimeout(4000);
  rapport.titre = await page.title();
  rapport.urlArrivee = page.url();
  console.log(`  titre de la page : « ${rapport.titre} »`);
  console.log(`  adresse à l'arrivée : ${rapport.urlArrivee}`);

  // REGARDER D'ABORD, ESSAYER ENSUITE. La première sonde est morte sur un champ qui
  // refusait la saisie, sans rien écrire de ce qu'elle avait sous les yeux : on ne savait
  // même pas si le portail demandait un mot de passe. On note donc ce que la page montre
  // avant de toucher à quoi que ce soit, et plus rien ensuite ne peut faire perdre ça.
  const vu = async () => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  rapport.pageArrivee = (await vu()).slice(0, 1200);
  console.log(`\n  --- ce que la page affiche en arrivant ---\n  ${rapport.pageArrivee.slice(0, 800)}\n`);
  await page.screenshot({ path: new URL('../data/ged-arrivee.png', import.meta.url).pathname }).catch(() => {});

  // Une page de connexion se reconnaît à ses mots, et elle règle la question.
  rapport.demandeUneConnexion = /connexion|s.identifier|mot de passe|nom d.utilisateur|authentification/i.test(rapport.pageArrivee);
  if (rapport.demandeUneConnexion) console.log('  ⚠ La page parle de connexion : le portail est probablement fermé au public.');

  // Tous les champs, éditables ou non : c'est la différence qui renseigne.
  const champs = page.locator('input:visible, textarea:visible');
  const n = await champs.count();
  rapport.champs = [];
  for (let i = 0; i < Math.min(n, 8); i++) {
    const c = champs.nth(i);
    rapport.champs.push({
      type: await c.getAttribute('type'),
      placeholder: await c.getAttribute('placeholder'),
      editable: await c.isEditable().catch(() => false),
      actif: await c.isEnabled().catch(() => false),
    });
  }
  console.log(`  ${n} champ(s) visible(s) :`);
  for (const c of rapport.champs) console.log(`    type=${c.type ?? '—'} placeholder=${c.placeholder ?? '—'} éditable=${c.editable} actif=${c.actif}`);

  // La recherche, si un champ veut bien d'elle. Tout échec est noté, jamais fatal.
  const editable = rapport.champs.findIndex((c) => c.editable);
  if (editable < 0) {
    rapport.conclusion = n ? 'aucun champ éditable' : 'aucun champ de saisie';
    console.log(`\n  ${rapport.conclusion} — la recherche ne peut pas être essayée.`);
  } else {
    try {
      console.log(`\n  Recherche de « ${DOSSIER} » dans le champ ${editable + 1}…`);
      await champs.nth(editable).fill(DOSSIER, { timeout: 15000 });
      // La touche Entrée ne lance rien : le portail a un bouton « Rechercher », et c'est lui
      // qui parle au serveur. La première sonde avait bien tapé le numéro et cru que la
      // recherche ne trouvait rien, alors qu'elle n'avait pas eu lieu — la capture d'écran
      // montrait le numéro dans la boîte et la page d'accueil intacte derrière.
      const bouton = page.getByRole('button', { name: /rechercher/i }).first();
      if (await bouton.count()) {
        await bouton.click({ timeout: 15000 });
        rapport.lanceePar = 'bouton Rechercher';
      } else {
        await champs.nth(editable).press('Enter');
        rapport.lanceePar = 'touche Entrée';
      }
      await page.waitForTimeout(9000);
      rapport.urlApres = page.url();
      const corps = await vu();
      rapport.trouveLeDossier = corps.includes(DOSSIER);
      rapport.mentionResultats = corps.match(/(\d[\d\s]*)\s*(r[ée]sultats?|documents?)/i)?.[0] ?? null;
      rapport.pageApres = corps.slice(0, 1200);
      rapport.conclusion = rapport.trouveLeDossier ? 'le numéro apparaît dans les résultats' : 'recherche faite, le numéro n’apparaît pas';
      console.log(`  adresse après recherche : ${rapport.urlApres}`);
      console.log(`  le numéro apparaît : ${rapport.trouveLeDossier ? 'OUI' : 'non'}`);
      if (rapport.mentionResultats) console.log(`  ${rapport.mentionResultats}`);
      console.log(`\n  --- après la recherche ---\n  ${rapport.pageApres.slice(0, 800)}`);
      await page.screenshot({ path: new URL('../data/ged-sonde.png', import.meta.url).pathname, fullPage: true }).catch(() => {});

      // S'il y a des résultats, en ouvrir un : c'est la seule façon de savoir si un document
      // porte une adresse qu'on peut donner à quelqu'un, ou seulement un état de session.
      const liens = page.locator('a:visible');
      const nLiens = await liens.count();
      rapport.liensResultats = [];
      for (let i = 0; i < Math.min(nLiens, 12); i++) {
        const t = (await liens.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const href = await liens.nth(i).getAttribute('href').catch(() => null);
        if (t) rapport.liensResultats.push({ texte: t.slice(0, 80), href });
      }
      if (rapport.liensResultats.length) {
        console.log('\n  --- liens visibles après la recherche ---');
        for (const l of rapport.liensResultats) console.log(`    « ${l.texte} » -> ${l.href ?? '(pas d’adresse)'}`);
      }
    } catch (err) {
      rapport.conclusion = `la recherche a échoué : ${String(err.message ?? err).split('\n')[0]}`;
      console.log(`  ${rapport.conclusion}`);
      await page.screenshot({ path: new URL('../data/ged-sonde.png', import.meta.url).pathname }).catch(() => {});
    }
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
