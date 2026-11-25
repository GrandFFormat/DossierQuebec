// LA RUBRIQUE « À LA UNE » — /a-la-une et /a-la-une/<slug> (25 nov. 2026).
//
// Des pages de référence liées à l'actualité, chaque fait relié à sa source officielle. Bâties sur
// a-la-une.html (fait par scripts/build-section-pages.js depuis gabarit.html) : même en-tête, même pied
// de page, même noindex. Le contenu vit ici, dans PAGES et CARTES_A_VENIR.
//
// VERROU : tout reste en noindex (la page modèle est `prive` dans build-section-pages.js) tant que
// Hugo n'a pas relu le lot. Pour publier : enlever `prive: true` de l'entrée a-la-une.html.
//
// RÈGLE : aucune donnée sans source officielle lue (LégisQuébec, communiqués des villes, MAMH,
// Assemblée nationale). Une ville sans date publiée l'affiche telle quelle, « non publiée ».

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SITE = 'https://dossierquebec.ca';
const DOSSIER = 'a-la-une';
const MAJ = { fr: '25 novembre 2026', en: 'November 25, 2026' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const deux = (fr, en) => `<span class="fr-txt">${fr}</span><span class="en-txt">${en}</span>`;
const lien = (url, texte) => `<a href="${url}" rel="noopener" target="_blank">${texte}</a>`;

// ---------------------------------------------------------------- les sources
const S = {
  lerm: 'https://www.legisquebec.gouv.qc.ca/fr/document/lc/E-2.2',
  muni: 'https://www.quebec.ca/gouvernement/ministeres-organismes/affaires-municipales/publications/bulletin-muni-express/2025/n-19-3-octobre-2025',
  guide: 'https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/affaires-municipales/publications/elections/guide_accueil_elus_municipaux.pdf',
  montreal: 'https://montreal.ca/communiques-de-presse/la-mairesse-soraya-martinez-ferrada-et-les-elus-de-la-ville-de-montreal-sont-assermentees-pour-un',
  laval: 'https://www.laval.ca/organisation-municipale/salle-presse/communiques-presse/election-municipale-2025-nomination-membres-comite-executif/',
  longueuil: 'https://longueuil.quebec/fr/nouvelles/cabinet-de-la-mairesse-catherine-fournier-assermentee-avec-son-nouveau-conseil-municipal',
  levisPv: 'https://levis-website-resources.s3.bhs.io.cloud.ovh.net/pc/Proces-verbaux/PVCV-2025-11-24.pdf',
  lan: 'https://www.legisquebec.gouv.qc.ca/fr/document/lc/A-23.1',
  lc1867: 'https://laws-lois.justice.gc.ca/fra/const/page-4.html',
  lc1867ann: 'https://laws-lois.justice.gc.ca/fra/const/page-9.html',
  chrono2022: 'https://www.assnat.qc.ca/fr/patrimoine/chronologie/chrono112.html',
  loi2022: 'https://www.publicationsduquebec.gouv.qc.ca/fileadmin/Fichiers_client/lois_et_reglements/LoisAnnuelles/fr/2022/2022C30F.PDF',
  pl4: 'https://www.assnat.qc.ca/fr/travaux-parlementaires/projets-loi/projet-loi-4-43-1.html',
  communes: 'https://www.ourcommons.ca/procedure-and-practice-4/ch04-6-e.html',
};

// Les villes suivies par DossierQuébec. `date` = null : aucune date publiée par la Ville (demande au greffe en cours).
const VILLES = [
  { ville: 'Montréal', date: '13 novembre 2025', dateEn: 'November 13, 2025', jours: 11, note: deux('Communiqué de la Ville du 13 nov. 2025', 'City news release, Nov. 13, 2025'), src: S.montreal },
  { ville: 'Laval', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('Au Collège Letendre. Communiqué de la Ville du 11 nov. 2025', 'At Collège Letendre. City news release, Nov. 11, 2025'), src: S.laval },
  { ville: 'Longueuil', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('« Assermentés dimanche » : communiqué du lundi 10 nov. 2025', '“Sworn in on Sunday”: news release of Monday, Nov. 10, 2025'), src: S.longueuil },
  { ville: 'Québec', date: null, note: deux('Aucune date publiée par la Ville. Demande faite au greffe le 25 nov. 2026.', 'No date published by the City. Request sent to the clerk on Nov. 25, 2026.'), src: null },
  { ville: 'Lévis', date: null, note: deux('Aucune date publiée. Le procès-verbal de la première séance (24 nov. 2025) n’en parle pas.', 'No date published. The minutes of the first sitting (Nov. 24, 2025) do not mention it.'), src: S.levisPv },
];

// ---------------------------------------------------------------- les pages
const SERMENT_TEXTE = 'Je, (nom de la personne élue), déclare sous serment que j’exercerai mes fonctions de (maire ou conseiller) avec honnêteté et justice dans le respect de la loi et du Code d’éthique et de déontologie des élus municipaux de (nom de la municipalité) et que je m’engage à respecter les règles de ce code applicables après la fin de mon mandat.';

const tableauVilles = () => `
    <div class="une-table-wrap"><table class="fin-table une-table">
      <thead><tr><th>${deux('Ville', 'City')}</th><th>${deux('Serment prêté le', 'Oath taken on')}</th><th>${deux('Jours après le scrutin', 'Days after election day')}</th><th>${deux('Source', 'Source')}</th></tr></thead>
      <tbody>
${VILLES.map((v) => `        <tr><td><b>${v.ville}</b></td><td>${v.date ? deux(v.date, v.dateEn) : `<span class="une-attente">${deux('Non publiée', 'Not published')}</span>`}</td><td>${v.jours ?? '—'}</td><td>${v.src ? lien(v.src, v.note) : v.note}</td></tr>`).join('\n')}
      </tbody>
    </table></div>`;

const sources = (liste) => `
    <h2 class="une-h2">${deux('Sources', 'Sources')}</h2>
    <ul class="une-sources">
${liste.map(([url, fr, en]) => `      <li>${lien(url, deux(fr, en))}</li>`).join('\n')}
    </ul>`;

const PAGES = [
  {
    slug: 'serment-des-elus-municipaux',
    titre: 'Le serment des élus municipaux, ville par ville — DossierQuébec',
    titreEn: 'The oath of municipal councillors, city by city — DossierQuébec',
    desc: "Le texte exact du serment des élus municipaux du Québec, ce qu'il ne dit pas (le roi) et la date où chaque conseil a prêté serment en 2025, avec ses sources.",
    fil: deux('Le serment des élus municipaux', 'Municipal oath of office'),
    h1: [deux('Le serment des élus', 'The oath of'), deux('ville par ville.', 'city by city.')],
    sujet: deux('Le serment des élus municipaux', 'Municipal oath of office'),
    chapeau: deux(
      'Pendant que l’Assemblée nationale se déchire sur le serment au roi, les maires et les conseillers du Québec prêtent un serment qui ne le nomme pas. Voici son texte exact, ce que la loi exige, et la date où chaque conseil l’a prêté après l’élection du 2 novembre 2025.',
      'While the National Assembly fights over the oath to the King, Quebec’s mayors and councillors take an oath that does not mention him. Here is its exact wording, what the law requires, and the date each council took it after the November 2, 2025 election.'),
    corps: () => `
    <h2 class="une-h2">${deux('Le texte exact', 'The exact wording')}</h2>
    <blockquote class="une-citation">« ${SERMENT_TEXTE} »</blockquote>
    <p class="une-p">${deux(
      `Loi sur les élections et les référendums dans les municipalités, ${lien(S.lerm, 'annexe II')} (article 313). Ce texte est en vigueur depuis 2010 (2010, c. 27, a. 43)..`,
      `Act respecting elections and referendums in municipalities, ${lien(S.lerm, 'Schedule II')} (section 313). This wording has been in force since 2010 (2010, c. 27, s. 43). The French text is the one that counts.`)}</p>

    <h2 class="une-h2">${deux('Ce qu’il dit, et ce qu’il ne dit pas', 'What it says, and what it does not')}</h2>
    <ul class="une-liste">
      <li>${deux('<b>Pas de roi.</b> Le serment ne nomme ni le souverain, ni la Couronne, ni le Canada.', '<b>No King.</b> The oath names neither the sovereign, nor the Crown, nor Canada.')}</li>
      <li>${deux('<b>Le code d’éthique de la ville</b> y est nommé, et l’élu s’engage à en respecter certaines règles même après la fin de son mandat.', '<b>The city’s code of ethics</b> is named, and the councillor promises to follow some of its rules even after leaving office.')}</li>
      <li>${deux('<b>Honnêteté, justice, respect de la loi</b> : c’est tout.', '<b>Honesty, justice, respect for the law</b>: that is all.')}</li>
    </ul>

    <h2 class="une-h2">${deux('Ce que la loi exige', 'What the law requires')}</h2>
    <ul class="une-liste">
      <li>${deux(`<b>30 jours</b> pour prêter serment après la proclamation de son élection (${lien(S.lerm, 'art. 313')}).`, `<b>30 days</b> to take the oath after being declared elected (${lien(S.lerm, 's. 313')}).`)}</li>
      <li>${deux(`<b>Pas de serment, pas de mandat</b> : « Son mandat de membre du conseil commence au moment où elle prête le serment » (${lien(S.lerm, 'art. 313')}).`, `<b>No oath, no term</b>: the term of office begins when the oath is taken (${lien(S.lerm, 's. 313')}).`)}</li>
      <li>${deux(`<b>Poste vacant</b> si l’élu ne prête pas serment à temps (${lien(S.lerm, 'art. 330')}).`, `<b>Seat vacated</b> if the oath is not taken in time (${lien(S.lerm, 's. 330')}).`)}</li>
      <li>${deux(`<b>Le conseil ne peut presque pas siéger</b> tant que la majorité des conseillers n’a pas prêté serment (${lien(S.lerm, 'art. 314.2')}). <a href="/a-la-une/conseil-sans-serment">Lire l’explication</a>.`, `<b>Council can barely sit</b> until a majority of councillors have taken the oath (${lien(S.lerm, 's. 314.2')}). <a href="/a-la-une/conseil-sans-serment">Read the explainer</a>.`)}</li>
    </ul>

    <h2 class="une-h2">${deux('Quand chaque conseil a prêté serment (élection du 2 novembre 2025)', 'When each council took the oath (November 2, 2025 election)')}</h2>
${tableauVilles()}
    <p class="une-note">${deux('Une ville sans date n’a rien publié à ce sujet sur son site. Nous avons écrit à son greffe et ajouterons la date dès sa réponse.', 'A city without a date has published nothing on its website. We have written to its clerk and will add the date as soon as we hear back.')}</p>
${sources([
      [S.lerm, 'LégisQuébec, chapitre E-2.2 : art. 313, 314.2, 330 et annexe II', 'LégisQuébec, chapter E-2.2: ss. 313, 314.2, 330 and Schedule II'],
      [S.guide, 'MAMH, Guide d’accueil et de référence pour les élues et élus municipaux (oct. 2026)', 'MAMH, welcome guide for municipal councillors (Oct. 2026)'],
      [S.montreal, 'Ville de Montréal, communiqué du 13 nov. 2025', 'City of Montréal, news release, Nov. 13, 2025'],
      [S.laval, 'Ville de Laval, communiqué du 11 nov. 2025', 'City of Laval, news release, Nov. 11, 2025'],
      [S.longueuil, 'Ville de Longueuil, communiqué du 10 nov. 2025', 'City of Longueuil, news release, Nov. 10, 2025'],
      [S.levisPv, 'Ville de Lévis, procès-verbal de la séance du 24 nov. 2025', 'City of Lévis, minutes of the Nov. 24, 2025 sitting'],
    ])}`,
  },
  {
    slug: 'conseil-sans-serment',
    titre: 'Pas de serment, pas de séance au conseil municipal — DossierQuébec',
    titreEn: 'No oath, no sitting: section 314.2 explained — DossierQuébec',
    desc: "Autour de chaque élection municipale, le conseil ne siège qu'en cas de force majeure tant que ses élus n'ont pas prêté serment. La loi et les dates de 2025.",
    fil: deux('Pas de serment, pas de séance', 'No oath, no sitting'),
    h1: [deux('Pas de serment,', 'No oath,'), deux('pas de séance.', 'no sitting.')],
    sujet: deux('Le conseil municipal sans serment', 'A council without an oath'),
    chapeau: deux(
      'À chaque élection municipale, votre conseil de ville tombe en veille pendant plus d’un mois. Il ne peut siéger que pour une urgence, et seulement pour en parler. C’est l’article 314.2 de la loi électorale municipale.',
      'At every municipal election, your city council goes on standby for more than a month. It may sit only for an emergency, and only to deal with it. That is section 314.2 of Quebec’s municipal election act.'),
    corps: () => `
    <h2 class="une-h2">${deux('Ce que dit la loi', 'What the law says')}</h2>
    <blockquote class="une-citation">« Au cours de la période qui commence à 16 h 30 le trentième jour précédant celui fixé pour le scrutin d’une élection générale et qui se termine au moment où la majorité des candidats élus à un poste de conseiller a prêté le serment, le conseil ne peut siéger que si survient un cas de force majeure nécessitant son intervention. Les délibérations lors de cette séance ne peuvent porter que sur ce cas. »</blockquote>
    <p class="une-p">${deux(`Loi sur les élections et les référendums dans les municipalités, ${lien(S.lerm, 'art. 314.2')}, premier alinéa.`, `Act respecting elections and referendums in municipalities, ${lien(S.lerm, 's. 314.2')}, first paragraph (French text quoted).`)}</p>

    <h2 class="une-h2">${deux('En clair', 'In plain terms')}</h2>
    <ul class="une-liste">
      <li>${deux('<b>Ça commence 30 jours avant le vote</b>, à 16 h 30. Le conseil sortant ne peut plus se réunir, sauf urgence.', '<b>It starts 30 days before election day</b>, at 4:30 p.m. The outgoing council can no longer meet, except in an emergency.')}</li>
      <li>${deux('<b>Ça finit quand la majorité des nouveaux conseillers a prêté serment.</b> C’est le serment qui rend le nouveau conseil capable de siéger.', '<b>It ends when a majority of the new councillors have taken the oath.</b> The oath is what lets the new council sit.')}</li>
      <li>${deux('<b>Une soupape de 35 jours</b> : si la majorité n’a pas prêté serment avant le 35e jour après le scrutin, la règle cesse au début de ce jour (deuxième alinéa).', '<b>A 35-day safety valve</b>: if a majority has not taken the oath before the 35th day after election day, the rule stops applying at the start of that day (second paragraph).')}</li>
      <li>${deux('<b>En cas d’urgence</b>, le conseil peut siéger, mais il ne peut parler que de cette urgence.', '<b>In an emergency</b>, council may sit, but only to deal with that emergency.')}</li>
    </ul>

    <h2 class="une-h2">${deux('Les dates de 2025', 'The 2025 dates')}</h2>
    <ul class="une-liste">
      <li>${deux(`<b>3 octobre 2025, 16 h 30</b> : début de la période, pour le scrutin du 2 novembre. Le ministère des Affaires municipales l’a rappelé aux villes dans son ${lien(S.muni, 'bulletin Muni-Express du 3 octobre 2025')}.`, `<b>October 3, 2025, 4:30 p.m.</b>: the period begins, for the November 2 election. The Municipal Affairs ministry reminded cities in its ${lien(S.muni, 'Muni-Express bulletin of October 3, 2025')}.`)}</li>
      <li>${deux('<b>2 novembre 2025</b> : jour du scrutin.', '<b>November 2, 2025</b>: election day.')}</li>
      <li>${deux('<b>7 décembre 2025</b> : 35e jour après le scrutin. Au plus tard ce jour-là, la règle tombait d’elle-même.', '<b>December 7, 2025</b>: 35th day after election day. By that day at the latest, the rule lapsed on its own.')}</li>
    </ul>
    <p class="une-p">${deux('Dans les villes que nous suivons, les conseils ont prêté serment entre 7 et 11 jours après le scrutin :', 'In the cities we follow, councils took the oath 7 to 11 days after election day:')}</p>
${tableauVilles()}
    <p class="une-p">${deux(`À Laval, le conseil a prêté serment le dimanche 9 novembre et s’est réuni dès le lendemain, en séance extraordinaire, pour nommer son comité exécutif (${lien(S.laval, 'communiqué de la Ville')}).`, `In Laval, council took the oath on Sunday, November 9 and met the very next day, in a special sitting, to appoint its executive committee (${lien(S.laval, 'City news release')}).`)}</p>
    <p class="une-p">${deux('Pour le texte du serment lui-même, voir <a href="/a-la-une/serment-des-elus-municipaux">Le serment des élus, ville par ville</a>.', 'For the wording of the oath itself, see <a href="/a-la-une/serment-des-elus-municipaux">The oath of office, city by city</a>.')}</p>
${sources([
      [S.lerm, 'LégisQuébec, chapitre E-2.2 : art. 313 et 314.2', 'LégisQuébec, chapter E-2.2: ss. 313 and 314.2'],
      [S.muni, 'MAMH, Muni-Express n° 19 du 3 octobre 2025', 'MAMH, Muni-Express no. 19, October 3, 2025'],
      [S.laval, 'Ville de Laval, communiqué du 11 nov. 2025', 'City of Laval, news release, Nov. 11, 2025'],
      [S.montreal, 'Ville de Montréal, communiqué du 13 nov. 2025', 'City of Montréal, news release, Nov. 13, 2025'],
      [S.longueuil, 'Ville de Longueuil, communiqué du 10 nov. 2025', 'City of Longueuil, news release, Nov. 10, 2025'],
    ])}`,
  },
  {
    slug: 'serment-au-roi-chronologie',
    titre: 'Le serment au roi au Québec, de 1867 à aujourd’hui — DossierQuébec',
    titreEn: 'The oath to the King in Quebec, 1867 to today — DossierQuébec',
    desc: "La chronologie du serment des députés du Québec : allégeance au roi en 1867, loyauté au peuple en 1982, crise de 2022 et serment au roi devenu facultatif.",
    fil: deux('Chronologie du serment au roi', 'Oath to the King timeline'),
    h1: [deux('Le serment au roi,', 'The oath to the King,'), deux('de 1867 à aujourd’hui.', '1867 to today.')],
    sujet: deux('Chronologie du serment au roi', 'Oath to the King timeline'),
    chapeau: deux(
      'Pendant 155 ans, aucun député du Québec n’a pu siéger sans jurer fidélité au souverain britannique. Voici comment c’est devenu facultatif, étape par étape, chaque date avec sa source officielle.',
      'For 155 years, no Quebec member could sit without swearing allegiance to the British sovereign. Here is how it became optional, step by step, each date with its official source.'),
    corps: () => `
    <ol class="une-chrono">
      <li><b>1867</b> ${deux(`L’article 128 de la Loi constitutionnelle de 1867 oblige les membres du Parlement fédéral et des assemblées provinciales à prêter le serment d’allégeance avant de siéger : « Je, A.B., jure que je serai fidèle et porterai vraie allégeance à Sa Majesté la Reine Victoria » (cinquième annexe). ${lien(S.lc1867, 'Art. 128')} · ${lien(S.lc1867ann, 'cinquième annexe')}`, `Section 128 of the Constitution Act, 1867 requires members of Parliament and of provincial legislatures to take the oath of allegiance before sitting (Fifth Schedule). ${lien(S.lc1867, 's. 128')} · ${lien(S.lc1867ann, 'Fifth Schedule')}`)}</li>
      <li><b>1982</b> ${deux(`La Loi sur l’Assemblée nationale ajoute un second serment, envers le peuple du Québec : « Je, (nom du député), déclare sous serment que je serai loyal envers le peuple du Québec et que j’exercerai mes fonctions de député avec honnêteté et justice dans le respect de la constitution du Québec. » Sans lui, pas de siège (art. 15). ${lien(S.lan, 'Loi sur l’Assemblée nationale, art. 15 et annexe I (1982, c. 62)')}`, `The National Assembly Act adds a second oath, of loyalty to the people of Quebec. Without it, no seat (s. 15). ${lien(S.lan, 'National Assembly Act, s. 15 and Schedule I (1982, c. 62)')}`)}</li>
      <li><b>${deux('19 octobre 2022', 'October 19, 2022')}</b> ${deux(`Les élus de Québec solidaire prêtent serment « envers le peuple québécois », sans faire allégeance au roi Charles III. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `Québec solidaire members take the oath to the people of Quebec only, without swearing allegiance to King Charles III. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('21 octobre 2022', 'October 21, 2022')}</b> ${deux(`Les trois élus du Parti québécois font de même et refusent l’allégeance au roi. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `The three Parti Québécois members do the same and refuse allegiance to the King. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('1er novembre 2022', 'November 1, 2022')}</b> ${deux(`Le président sortant, François Paradis, décide que les élus qui refusent l’allégeance au roi ne peuvent pas siéger. Les élus de Québec solidaire prêtent alors le serment au roi. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `Outgoing Speaker François Paradis rules that members who refuse allegiance to the King cannot sit. Québec solidaire members then take the oath to the King. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('1er décembre 2022', 'December 1, 2022')}</b> ${deux(`Les trois élus du Parti québécois se voient refuser l’entrée de la Salle de l’Assemblée par la sergente d’armes. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `The three Parti Québécois members are refused entry to the Assembly Chamber by the Sergeant-at-Arms. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('6 décembre 2022', 'December 6, 2022')}</b> ${deux(`Le ministre Jean-François Roberge présente le projet de loi n° 4, Loi visant à reconnaître le serment prévu par la Loi sur l’Assemblée nationale comme seul serment obligatoire pour y siéger. ${lien(S.pl4, 'Fiche du projet de loi')}`, `Minister Jean-François Roberge introduces Bill 4, making the National Assembly Act oath the only mandatory oath to sit. ${lien(S.pl4, 'Bill page')}`)}</li>
      <li><b>${deux('9 décembre 2022', 'December 9, 2022')}</b> ${deux(`Le projet de loi est adopté et sanctionné le même jour (L.Q. 2022, c. 30). Il ajoute à la Loi constitutionnelle de 1867 : « 128Q.1. L’article 128 ne s’applique pas au Québec. » Le serment au roi devient facultatif. ${lien(S.loi2022, 'Loi de 2022, chapitre 30 (PDF officiel)')}`, `The bill is passed and assented to the same day (S.Q. 2022, c. 30). It adds to the Constitution Act, 1867: “128Q.1. Section 128 does not apply to Quebec.” The oath to the King becomes optional. ${lien(S.loi2022, '2022 Act, chapter 30 (official PDF)')}`)}</li>
      <li><b>2026</b> ${deux('La loi de 2022 est contestée devant les tribunaux. Au 25 novembre 2026, aucun jugement n’est publié sur CanLII ni sur SOQUIJ. Nous l’expliquerons à partir de son texte dès sa publication.', 'The 2022 Act is being challenged in court. As of November 25, 2026, no ruling has been published on CanLII or SOQUIJ. We will explain it from its text once it is published.')}</li>
    </ol>
${sources([
      [S.lc1867, 'Justice Canada, Loi constitutionnelle de 1867, art. 128', 'Justice Canada, Constitution Act, 1867, s. 128'],
      [S.lc1867ann, 'Justice Canada, Loi constitutionnelle de 1867, cinquième annexe', 'Justice Canada, Constitution Act, 1867, Fifth Schedule'],
      [S.lan, 'LégisQuébec, Loi sur l’Assemblée nationale (A-23.1), art. 15 et annexe I', 'LégisQuébec, National Assembly Act (A-23.1), s. 15 and Schedule I'],
      [S.chrono2022, 'Assemblée nationale, Chronologie parlementaire (2022)', 'National Assembly, parliamentary timeline (2022)'],
      [S.pl4, 'Assemblée nationale, projet de loi n° 4 (43-1)', 'National Assembly, Bill 4 (43-1)'],
      [S.loi2022, 'Publications du Québec, Lois du Québec 2022, chapitre 30', 'Publications du Québec, Statutes of Quebec 2022, chapter 30'],
    ])}`,
  },
  {
    slug: 'qui-jure-quoi',
    titre: 'Qui jure fidélité au roi au Canada? — DossierQuébec',
    titreEn: 'Who swears allegiance to the King in Canada? — DossierQuébec',
    desc: "Députés fédéraux, sénateurs, députés des provinces, élus municipaux du Québec : à qui chacun jure fidélité et si le serment au roi est obligatoire, avec la loi.",
    fil: deux('Qui jure quoi?', 'Who swears what?'),
    h1: [deux('Qui jure quoi', 'Who swears what'), deux('au Canada?', 'in Canada?')],
    sujet: deux('Les serments, côte à côte', 'Oaths side by side'),
    chapeau: deux(
      'Le Québec est la seule province où un député peut siéger sans jurer fidélité au roi. Ses élus municipaux, eux, n’ont pas à le faire. Le portrait, assemblée par assemblée.',
      'Quebec is the only province where a member may sit without swearing allegiance to the King. Its municipal councillors do not have to. The picture, legislature by legislature.'),
    corps: () => `
    <div class="une-table-wrap"><table class="fin-table une-table">
      <thead><tr><th>${deux('Élus', 'Elected officials')}</th><th>${deux('À qui ils jurent', 'Sworn to')}</th><th>${deux('Serment au roi', 'Oath to the King')}</th><th>${deux('Loi', 'Law')}</th></tr></thead>
      <tbody>
        <tr><td><b>${deux('Députés fédéraux', 'Members of Parliament')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire (serment ou affirmation solennelle) : sans lui, pas de siège', 'Mandatory (oath or solemn affirmation): no seat without it')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))} · ${lien(S.communes, deux('Procédure de la Chambre', 'House procedure'))}</td></tr>
        <tr><td><b>${deux('Sénateurs', 'Senators')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire', 'Mandatory')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))}</td></tr>
        <tr><td><b>${deux('Députés des 9 autres provinces', 'Members in the 9 other provinces')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire : l’art. 128 vise aussi les assemblées provinciales', 'Mandatory: s. 128 also covers provincial legislatures')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))}</td></tr>
        <tr><td><b>${deux('Députés du Québec', 'Quebec MNAs')}</b></td><td>${deux('Au peuple du Québec', 'The people of Quebec')}</td><td>${deux('Facultatif depuis le 9 déc. 2022', 'Optional since Dec. 9, 2022')}</td><td>${lien(S.lan, deux('Loi sur l’Assemblée nationale, art. 15', 'National Assembly Act, s. 15'))} · ${lien(S.loi2022, deux('LC 1867, art. 128Q.1', 'CA 1867, s. 128Q.1'))}</td></tr>
        <tr><td><b>${deux('Élus municipaux du Québec', 'Quebec municipal councillors')}</b></td><td>${deux('À exercer leurs fonctions avec honnêteté et justice, dans le respect de la loi et du code d’éthique', 'To serve with honesty and justice, respecting the law and the code of ethics')}</td><td>${deux('Absent : le serment ne nomme pas le roi', 'None: the oath does not name the King')}</td><td>${lien(S.lerm, deux('LERM, art. 313 et annexe II', 'AERM, s. 313 and Schedule II'))}</td></tr>
      </tbody>
    </table></div>
    <p class="une-note">${deux('Ce tableau s’en tient à l’article 128, qui s’applique partout sauf au Québec. Certaines provinces peuvent exiger un serment de plus par leur propre loi ; nous ne les avons pas encore toutes lues et le dirons ici quand ce sera fait.', 'This table sticks to section 128, which applies everywhere except Quebec. Some provinces may require an additional oath under their own law; we have not read them all yet and will say so here when we have.')}</p>
    <p class="une-p">${deux('Voir aussi : <a href="/a-la-une/serment-des-elus-municipaux">le serment des élus municipaux, ville par ville</a> et <a href="/a-la-une/serment-au-roi-chronologie">la chronologie du serment au roi</a>.', 'See also: <a href="/a-la-une/serment-des-elus-municipaux">the municipal oath, city by city</a> and <a href="/a-la-une/serment-au-roi-chronologie">the oath to the King timeline</a>.')}</p>
${sources([
      [S.lc1867, 'Justice Canada, Loi constitutionnelle de 1867, art. 128', 'Justice Canada, Constitution Act, 1867, s. 128'],
      [S.communes, 'Chambre des communes, La procédure et les usages, ch. 4', 'House of Commons Procedure and Practice, ch. 4'],
      [S.lan, 'LégisQuébec, Loi sur l’Assemblée nationale, art. 15', 'LégisQuébec, National Assembly Act, s. 15'],
      [S.loi2022, 'Lois du Québec 2022, chapitre 30', 'Statutes of Quebec 2022, chapter 30'],
      [S.lerm, 'LégisQuébec, Loi sur les élections et les référendums dans les municipalités, art. 313 et annexe II', 'LégisQuébec, municipal elections act, s. 313 and Schedule II'],
    ])}`,
  },
];

// Les sujets annoncés, pas encore écrits : une carte sans lien, avec la raison.
const CARTES_A_VENIR = [
  { titre: deux('Le jugement de la Cour supérieure, expliqué', 'The Superior Court ruling, explained'), texte: deux('Nous attendons que le jugement soit publié (CanLII, SOQUIJ) pour l’expliquer à partir du texte, pas des manchettes.', 'We are waiting for the ruling to be published (CanLII, SOQUIJ) so we can explain it from the text, not the headlines.') },
];

// ---------------------------------------------------------------- l'assemblage
function remplacer(h, motif, valeur) {
  if (!motif.test(h)) throw new Error(`build-a-la-une : ${motif} introuvable dans a-la-une.html`);
  return h.replace(motif, () => valeur);
}

function enTete(p) {
  return `<p class="une-maj">${deux(`Mis à jour le ${MAJ.fr}`, `Updated ${MAJ.en}`)}</p>`;
}

function sectionPage(p) {
  return `<section class="view active" id="view-alaune" data-titre-en="${esc(p.titreEn)}">
    <nav class="fil-ariane" aria-label="Fil d'Ariane"><a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><a href="/a-la-une" data-i18n="fil.alaune">À la une</a><span class="sep" aria-hidden="true">›</span><span aria-current="page">${p.fil}</span></nav>
    <div class="view-hero">
      <h1 class="hero-h1 hero-h1-md">
        <span class="hero-sujet">${p.sujet}</span>
        <span>${p.h1[0]}</span>
        <span class="hero-outline">${p.h1[1]}</span>
      </h1>
      <p class="view-hero-sub">${p.chapeau}</p>
      ${enTete(p)}
    </div>
    <article class="une-article">${p.corps()}
    </article>
  </section>`;
}

function sectionHub() {
  const cartes = PAGES.map((p) => `      <li class="regle">
        <h2 class="regle-titre"><a href="/${DOSSIER}/${p.slug}">${p.sujet}</a></h2>
        <p>${p.chapeau}</p>
      </li>`).join('\n');
  const avenir = CARTES_A_VENIR.map((c) => `      <li class="regle une-avenir">
        <h2 class="regle-titre">${c.titre} <span class="une-attente">${deux('À venir', 'Coming')}</span></h2>
        <p>${c.texte}</p>
      </li>`).join('\n');
  return `<section class="view active" id="view-alaune">
    <nav class="fil-ariane" aria-label="Fil d'Ariane"><a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><span aria-current="page" data-i18n="fil.alaune">À la une</span></nav>
    <div class="view-hero">
      <h1 class="hero-h1 hero-h1-md">
        <span class="hero-sujet" data-i18n="sujet.alaune">À la une</span>
        <span data-i18n="unehero.l1">L'actualité,</span>
        <span class="hero-outline" data-i18n="unehero.l2">avec ses sources.</span>
      </h1>
      <p class="view-hero-sub">${deux('Des pages de référence sur les sujets du moment, chaque fait relié à sa source officielle. Ce mois-ci : <b>à qui nos élus jurent-ils fidélité?</b>', 'Reference pages on current topics, every fact linked to its official source. This month: <b>who do our elected officials swear allegiance to?</b>')}</p>
    </div>
    <ol class="regles-liste">
${cartes}
${avenir}
    </ol>
  </section>`;
}

export function construireALaUne() {
  if (!existsSync('a-la-une.html')) { console.log('– pas de a-la-une.html : rubrique À la une non bâtie'); return; }
  let modele = readFileSync('a-la-une.html', 'utf8').replace(/\r\n/g, '\n');
  const motifSection = /<section class="view active" id="view-alaune"[\s\S]*?<\/section>/;
  // Le hub d'abord : on remplace la page d'attente par la liste des sujets.
  modele = remplacer(modele, motifSection, sectionHub());
  writeFileSync('a-la-une.html', modele, 'utf8');

  mkdirSync(DOSSIER, { recursive: true });
  for (const p of PAGES) {
    const url = `${SITE}/${DOSSIER}/${p.slug}`;
    if (p.titre.length > 70) throw new Error(`build-a-la-une : titre trop long (${p.titre.length}) : ${p.titre}`);
    if (p.desc.length < 120 || p.desc.length > 165) throw new Error(`build-a-la-une : description de ${p.desc.length} caractères (${p.slug})`);
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.titre.replace(/ — DossierQuébec$/, ''), description: p.desc, inLanguage: 'fr-CA', dateModified: '2026-11-25', url, publisher: { '@type': 'Organization', name: 'DossierQuébec', url: SITE } }, null, 2);
    let h = modele;
    h = remplacer(h, /<title>[^<]*<\/title>/, `<title>${esc(p.titre)}</title>`);
    h = remplacer(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(p.desc)}">`);
    h = remplacer(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
    h = remplacer(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(p.titre)}">`);
    h = remplacer(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(p.desc)}">`);
    h = remplacer(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
    h = remplacer(h, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(p.titre)}">`);
    h = remplacer(h, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(p.desc)}">`);
    h = remplacer(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
    h = remplacer(h, motifSection, sectionPage(p));
    if (!/<meta name="robots" content="noindex/.test(h)) throw new Error(`build-a-la-une : ${p.slug} sans noindex alors que la rubrique n'est pas relue`);
    if ((h.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`build-a-la-une : ${p.slug} n'a pas exactement un <h1>`);
    writeFileSync(`${DOSSIER}/${p.slug}.html`, h, 'utf8');
  }
  console.log(`✓ À la une : le hub et ${PAGES.length} page(s) (/${DOSSIER}/…), en noindex jusqu'à la relecture.`);
}

// Lancé seul : node scripts/build-a-la-une.js
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-a-la-une.js')) construireALaUne();
