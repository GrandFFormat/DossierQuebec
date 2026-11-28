// LA RUBRIQUE « À LA UNE » — /a-la-une et /a-la-une/<slug> (25 nov. 2026).
//
// Des pages de référence liées à l'actualité, chaque fait relié à sa source officielle. Bâties sur
// a-la-une.html (fait par scripts/build-section-pages.js depuis gabarit.html) : même en-tête, même pied
// de page, même noindex. Le contenu vit ici, dans PAGES et CARTES_A_VENIR.
//
// PUBLIÉE le 25 nov. 2026 après la relecture de Hugo : les pages sont indexées et entrent au sitemap.
// Toute nouvelle page passe par Hugo avant le push (consigne de Martin).
//
// RÈGLE : aucune donnée sans source officielle lue (LégisQuébec, communiqués des villes, MAMH,
// Assemblée nationale). Une ville sans date publiée l'affiche telle quelle, « non publiée ».

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SITE = 'https://dossierquebec.ca';
const DOSSIER = 'a-la-une';
const MAJ = { fr: '27 novembre 2026', en: 'November 27, 2026' };
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
  levisMaire: 'https://levis.ca/fr/ville/decouvrir-levis/nos-actualites/assermentation-du-nouveau-maire-de-levis-monsieur-steven-blaney',
  levisPv: 'https://levis-website-resources.s3.bhs.io.cloud.ovh.net/pc/Proces-verbaux/PVCV-2025-11-24.pdf',
  lan: 'https://www.legisquebec.gouv.qc.ca/fr/document/lc/A-23.1',
  lc1867: 'https://laws-lois.justice.gc.ca/fra/const/page-4.html',
  lc1867ann: 'https://laws-lois.justice.gc.ca/fra/const/page-9.html',
  chrono2022: 'https://www.assnat.qc.ca/fr/patrimoine/chronologie/chrono112.html',
  loi2022: 'https://www.publicationsduquebec.gouv.qc.ca/fileadmin/Fichiers_client/lois_et_reglements/LoisAnnuelles/fr/2022/2022C30F.PDF',
  pl4: 'https://www.assnat.qc.ca/fr/travaux-parlementaires/projets-loi/projet-loi-4-43-1.html',
  communes: 'https://www.noscommunes.ca/procedure-and-practice-4/ch04-6-f.html',
  sjsr: 'https://sjsr.ca/communiques-2025/ceremonie-dassermentation-debut-officiel-du-mandat-pour-le-nouveau-conseil-municipal/',
  biblio: 'https://premierelecture.bibliotheque.assnat.qc.ca/2026/10/14/les-premiers-pas-dune-legislature-lassermentation-des-parlementaires/',
  o1: 'https://laws-lois.justice.gc.ca/fra/lois/o-1/page-1.html',
  bc: 'https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96066_01',
  art45: 'https://laws-lois.justice.gc.ca/fra/const/page-13.html',
  jd6: 'https://www.assnat.qc.ca/Media/Process.aspx?MediaId=ANQ.Vigie.Bll.DocumentGenerique_186243&process=Original&token=ZyMoxNwUn8ikQ+TRKYwPCjWrKwg+vIv9rjij7p3xLGTZDmLVSmJLoqe%2FvG7%2FYWzz',
  debats9: 'https://www.assnat.qc.ca/fr/travaux-parlementaires/assemblee-nationale/43-1/journal-debats/20221209/338871.html',
  ab: 'https://kings-printer.alberta.ca/1266.cfm?display=html&isbncln=9780779753659&leg_type=Acts&page=L09.cfm',
  mb: 'https://web2.gov.mb.ca/laws/statutes/ccsm/l110.php',
  ipe: 'https://www.princeedwardisland.ca/sites/default/files/legislation/l-7-1-legislative_assembly_act.pdf',
  tnl: 'https://www.assembly.nl.ca/legislation/sr/statutes/h10-1.htm',
  on: 'https://www.ontario.ca/laws/statute/90l10',
  nb: 'https://laws.gnb.ca/en/showfulldoc/cs/2014-c.116/',
  ne: 'https://nslegislature.ca/about/legislative-ceremonies/swearing-in',
  sk: 'https://www.legassembly.sk.ca/about/how-the-legislative-assembly-works/election-of-a-member/',
};

// Les villes suivies par DossierQuébec. `date` = null : aucune date publiée par la Ville (demande au greffe en cours).
const VILLES = [
  { ville: 'Montréal', date: '13 novembre 2025', dateEn: 'November 13, 2025', jours: 11, note: deux('Communiqué de la Ville du 13 nov. 2025', 'City news release, Nov. 13, 2025'), src: S.montreal },
  { ville: 'Laval', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('Au Collège Letendre. Communiqué de la Ville du 11 nov. 2025', 'At Collège Letendre. City news release, Nov. 11, 2025'), src: S.laval },
  { ville: 'Longueuil', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('« Assermentés dimanche » : communiqué du lundi 10 nov. 2025', '“Sworn in on Sunday”: news release of Monday, Nov. 10, 2025'), src: S.longueuil },
  { ville: 'Drummondville', date: '7 novembre 2025', dateEn: 'November 7, 2025', jours: 5, note: deux('À l’hôtel de ville. Communiqué de la Ville du 7 nov. 2025', 'At City Hall. City news release, Nov. 7, 2025'), src: 'https://www.drummondville.ca/entree-en-poste-officielle-des-membres-du-nouveau-conseil-municipal-2/' },
  { ville: 'Repentigny', date: '8 novembre 2025', dateEn: 'November 8, 2025', jours: 6, note: deux('À l’hôtel de ville. Communiqué de la Ville du 12 nov. 2025', 'At City Hall. City news release, Nov. 12, 2025'), src: 'https://repentigny.ca/actualites-publications/assermentation-du-conseil-municipal-de-repentigny-nicolas-dufour-et-son' },
  { ville: 'Brossard', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('Au centre socioculturel Alphonse-Lepage. Communiqué de la Ville du 10 nov. 2025', 'At the Alphonse-Lepage community centre. City news release, Nov. 10, 2025'), src: 'https://brossard.ca/actualites/le-nouveau-conseil-de-brossard-entre-officiellement-en-fonction/' },
  { ville: 'Saint-Jean-sur-Richelieu', date: '10 novembre 2025', dateEn: 'November 10, 2025', jours: 8, note: deux('11 élus sur 13 ce soir-là. Les deux autres devaient prêter serment plus tard. Communiqué du 11 nov. 2025', '11 of 13 members that evening. The other two were to be sworn in later. News release, Nov. 11, 2025'), src: 'https://sjsr.ca/communiques-2025/ceremonie-dassermentation-debut-officiel-du-mandat-pour-le-nouveau-conseil-municipal/' },
  { ville: 'Trois-Rivières', date: '13 novembre 2025', dateEn: 'November 13, 2025', jours: 11, note: deux('« Les 15 membres du nouveau conseil » : page des membres du conseil', '“The 15 members of the new council”: council members page'), src: 'https://www.v3r.net/a-propos-de-la-ville/vie-democratique/conseil-municipal/maire-et-conseillers-municipaux' },
  { ville: 'Victoriaville', date: '7 novembre 2025', dateEn: 'November 7, 2025', jours: 5, note: deux('Communiqué de la Ville du 7 nov. 2025', 'City news release, Nov. 7, 2025'), src: 'https://d16k40le270owi.cloudfront.net/Nouvelles/communiques/2025-11-07-Assermentation.pdf' },
  { ville: 'Saint-Hyacinthe', date: 'Au plus tard le 17 novembre 2025', dateEn: 'By November 17, 2025', jours: null, note: deux('Jour exact non publié. Procès-verbal du 17 nov. 2025 : « tous les membres du Conseil ont dûment été assermentés »', 'Exact day not published. Minutes of Nov. 17, 2025: all council members had been duly sworn in'), src: 'https://www.st-hyacinthe.ca/medias/ville/vie-democratique/seances-publiques/2025/PVSE251117.pdf' },
  { ville: 'Saguenay', date: null, note: deux('Le 7 nov. 2025, la date était « encore à déterminer ». Aucune confirmation publiée depuis.', 'On Nov. 7, 2025, the date was still to be determined. No confirmation published since.'), src: 'https://elections.saguenay.ca/files/documents/avis_publics/%C3%89lection-Saguenay-communiqu%C3%A9-de-presse-2025-11-07.pdf' },
  { ville: 'Gatineau', date: null, note: deux('Prévue le 10 nov. 2025 dans un communiqué de juin 2025. Aucune confirmation publiée depuis.', 'Scheduled for Nov. 10, 2025 in a June 2025 release. No confirmation published since.'), src: 'https://www.gatineau.ca/portail/default.aspx?p=nouvelles_annonces%2Fcommuniques%2Fcommunique_2015&id=200531233' },
  { ville: 'Québec', date: '9 novembre 2025', dateEn: 'November 9, 2025', jours: 7, note: deux('Confirmé par le greffier de la Ville, courriel du 26 nov. 2026. La Ville ne l’a pas publié sur son site.', 'Confirmed by the City Clerk, email of Nov. 26, 2026. The City has not published it on its website.'), src: null },
  { ville: 'Lévis', date: '16 novembre 2025', dateEn: 'November 16, 2025', jours: 14, note: deux('Les conseillers le 16 nov., le maire le 10 nov. 2025. Communiqué de la Ville du 11 nov. 2025, confirmé par le greffe le 27 nov. 2026', 'Councillors on Nov. 16, the mayor on Nov. 10, 2025. City news release, Nov. 11, 2025, confirmed by the clerk on Nov. 27, 2026'), src: S.levisMaire },
];

// ---------------------------------------------------------------- les pages
const SERMENT_TEXTE = 'Je, (nom de la personne élue), déclare sous serment que j’exercerai mes fonctions de (maire ou conseiller) avec honnêteté et justice dans le respect de la loi et du Code d’éthique et de déontologie des élus municipaux de (nom de la municipalité) et que je m’engage à respecter les règles de ce code applicables après la fin de mon mandat.';

const srcVille = (nom) => { const v = VILLES.find((x) => x.ville === nom); if (!v?.src) throw new Error(`build-a-la-une : ville sans source : ${nom}`); return v.src; };

const tableauVilles = () => `
    <div class="une-table-wrap"><table class="fin-table une-table une-table-villes">
      <thead><tr><th>${deux('Ville', 'City')}</th><th>${deux('Serment prêté le', 'Oath taken on')}</th><th>${deux('Jours après le scrutin', 'Days after election day')}</th><th>${deux('Source', 'Source')}</th></tr></thead>
      <tbody>
${[...VILLES].sort((a, b) => (a.jours ?? 99) - (b.jours ?? 99)).map((v) => `        <tr><td><b>${v.ville}</b></td><td>${v.date ? deux(v.date, v.dateEn) : `<span class="une-attente">${deux('Non publiée', 'Not published')}</span>`}</td><td>${v.jours ?? '—'}</td><td>${v.src ? lien(v.src, v.note) : v.note}</td></tr>`).join('\n')}
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
      'Les députés du Québec ont deux serments. Celui au roi n’est plus exigé. Les maires et les conseillers, eux, prêtent un serment qui ne nomme pas le roi. Voici son texte exact, ce que la loi exige et la date où chaque conseil l’a prêté après l’élection du 2 novembre 2025.',
      'Quebec MNAs have two oaths. The one to the King is no longer required. Mayors and councillors take an oath that does not name the King. Here is its exact wording, what the law requires and the date each council took it after the November 2, 2025 election.'),
    corps: () => `
    <h2 class="une-h2">${deux('Le texte exact, en une phrase', 'The exact wording, in one sentence')}</h2>
    <blockquote class="une-citation">« ${SERMENT_TEXTE} »</blockquote>
    <p class="une-p">${deux(
      `Source : Loi sur les élections et les référendums dans les municipalités, ${lien(S.lerm, 'annexe II')} (article 313).`,
      `Source: Act respecting elections and referendums in municipalities, ${lien(S.lerm, 'Schedule II')} (section 313).`)}</p>
    <p class="une-p">${deux('En vigueur depuis 2010 (2010, c. 27, a. 43).', 'In force since 2010 (2010, c. 27, s. 43).')}</p>

    <h2 class="une-h2">${deux('Aucun roi, mais un code d’éthique', 'No King, but a code of ethics')}</h2>
    <p class="une-p">${deux('Relisez-le. Le roi n’y est pas.', 'Read it again. The King is not in it.')}</p>
    <ul class="une-liste">
      <li>${deux('<b>Pas de roi.</b> Le serment ne nomme ni le souverain, ni la Couronne, ni le Canada.', '<b>No King.</b> The oath names neither the sovereign, nor the Crown, nor Canada.')}</li>
      <li>${deux('<b>Le code d’éthique de la ville</b> y est nommé. L’élu s’engage à en respecter certaines règles même après la fin de son mandat.', '<b>The city’s code of ethics</b> is named. The councillor promises to follow some of its rules even after leaving office.')}</li>
      <li>${deux('<b>Honnêteté, justice, respect de la loi.</b> C’est tout.', '<b>Honesty, justice, respect for the law.</b> That is all.')}</li>
    </ul>

    <h2 class="une-h2">${deux('Pas de serment dans les 30 jours, pas de siège', 'No oath within 30 days, no seat')}</h2>
    <p class="une-p">${deux('Voici ce que la loi prévoit :', 'Here is what the law provides:')}</p>
    <ul class="une-liste">
      <li>${deux(`<b>30 jours</b> pour prêter serment après la proclamation de son élection (${lien(S.lerm, 'art. 313')}).`, `<b>30 days</b> to take the oath after being declared elected (${lien(S.lerm, 's. 313')}).`)}</li>
      <li>${deux(`<b>Pas de serment, pas de mandat</b> : « Son mandat de membre du conseil commence au moment où elle prête le serment » (${lien(S.lerm, 'art. 313')}).`, `<b>No oath, no term</b>: the term of office begins when the oath is taken (${lien(S.lerm, 's. 313')}).`)}</li>
      <li>${deux(`<b>Poste vacant</b> si l’élu ne prête pas serment à temps (${lien(S.lerm, 'art. 330')}).`, `<b>Seat vacated</b> if the oath is not taken in time (${lien(S.lerm, 's. 330')}).`)}</li>
      <li>${deux(`<b>Le conseil ne peut presque pas siéger</b> à partir de 30 jours avant le scrutin et tant que la majorité des conseillers n’a pas prêté serment (${lien(S.lerm, 'art. 314.2')}). <a href="/a-la-une/conseil-sans-serment">Lire l’explication</a>.`, `<b>Council can barely sit</b> from 30 days before election day until a majority of councillors have taken the oath (${lien(S.lerm, 's. 314.2')}). <a href="/a-la-une/conseil-sans-serment">Read the explainer</a>.`)}</li>
    </ul>

    <h2 class="une-h2">${deux('Devant qui on jure : le maire, le greffier ou toute personne autorisée', 'Who administers the oath: the mayor, the clerk or any authorized person')}</h2>
    <p class="une-p">${deux('La liste est plus longue qu’on le pense.', 'The list is longer than you might think.')}</p>
    <p class="une-p">${deux(`La loi la donne en une phrase : « Le serment requis par la présente loi peut être fait devant le maire ou le greffier ou greffier-trésorier de la municipalité, un membre du personnel électoral ou référendaire, un responsable du registre visé au chapitre IV du titre II ou toute autre personne autorisée par la loi à faire prêter un serment. » (${lien(S.lerm, 'art. 653')})`, `The law gives it in one sentence: the oath may be taken before the mayor, the clerk or secretary-treasurer of the municipality, a member of the election or referendum staff, a person in charge of a register under the act, or anyone else authorized by law to administer an oath (${lien(S.lerm, 's. 653')}, French text).`)}</p>
    <p class="une-p">${deux(`Cette personne doit aussi, « sur demande et sans frais, faire prêter le serment et délivrer un certificat attestant la prestation » (${lien(S.lerm, 'art. 653')}).`, `That person must also, on request and free of charge, administer the oath and issue a certificate showing it was taken (${lien(S.lerm, 's. 653')}).`)}</p>
    <p class="une-p">${deux('Dans les faits, les villes ont pris des chemins différents :', 'In practice, cities took different routes:')}</p>
    <ul class="une-liste">
      <li>${deux('<b>Drummondville et Repentigny</b> : devant le président ou la présidente d’élection.', '<b>Drummondville and Repentigny</b>: before the returning officer.')}</li>
      <li>${deux('<b>Brossard</b> : devant la greffière, Me Joanne Skelling, au centre socioculturel Alphonse-Lepage.', '<b>Brossard</b>: before the clerk, Joanne Skelling, at the Alphonse-Lepage community centre.')}</li>
    </ul>
    <p class="une-note">${deux('Sources : les communiqués des villes, liés dans le tableau plus bas.', 'Sources: the city news releases, linked in the table below.')}</p>

    <h2 class="une-h2">${deux('Et si un élu ne jure pas? Le poste devient vacant et une nouvelle élection suit', 'What if a councillor does not take the oath? The seat is vacated and a new election follows')}</h2>
    <p class="une-p">${deux(`Le guide du ministère aux nouveaux élus le dit sans détour : « À défaut de prêter serment dans le délai de 30 jours, il y a vacance à ce poste et une nouvelle élection doit avoir lieu. » (${lien(S.guide, 'Guide d’accueil des élus municipaux, oct. 2026')})`, `The ministry’s guide for new councillors puts it plainly: if the oath is not taken within 30 days, the seat becomes vacant and a new election must be held (${lien(S.guide, 'MAMH welcome guide for municipal councillors, Oct. 2026')}, in French).`)}</p>
    <p class="une-p">${deux('Voici la suite, étape par étape :', 'Here is what happens next, step by step:')}</p>
    <ol class="une-liste">
      <li>${deux(`<b>Le poste devient vacant</b> le jour où l’élu est en défaut de prêter serment (${lien(S.lerm, 'art. 330')}).`, `<b>The seat becomes vacant</b> on the day the councillor fails to take the oath (${lien(S.lerm, 's. 330')}).`)}</li>
      <li>${deux(`<b>Vacance constatée plus de 12 mois avant la prochaine élection générale</b> : elle est comblée par une élection partielle (${lien(S.lerm, 'art. 335')}).`, `<b>Vacancy noted more than 12 months before the next general election</b>: it is filled by a by-election (${lien(S.lerm, 's. 335')}).`)}</li>
      <li>${deux(`<b>La date du vote</b> : le président d’élection la fixe dans les 30 jours de l’avis de vacance, « parmi les dimanches compris dans les quatre mois » de cet avis (${lien(S.lerm, 'art. 339')}).`, `<b>The voting date</b>: the returning officer sets it within 30 days of the notice of vacancy, on a Sunday within four months of that notice (${lien(S.lerm, 's. 339')}).`)}</li>
      <li>${deux(`<b>Dans les 12 derniers mois</b> avant l’élection générale : le conseil peut, dans les 15 jours de l’avis, décréter une élection partielle (${lien(S.lerm, 'art. 335')}). Sans élection partielle décrétée, un poste de conseiller est comblé seulement à l’élection générale, sous réserve du pouvoir du ministre (${lien(S.lerm, 'art. 337')}).`, `<b>In the last 12 months</b> before the general election: council may, within 15 days of the notice, order a by-election (${lien(S.lerm, 's. 335')}). If no by-election is ordered, a councillor’s seat is filled only at the general election, subject to the minister’s power (${lien(S.lerm, 's. 337')}).`)}</li>
    </ol>
    <p class="une-p">${deux('Autrement dit, un serment oublié peut mener à une élection partielle, un dimanche.', 'In other words, one missed oath can lead to a by-election, on a Sunday.')}</p>

    <h2 class="une-h2">${deux('Le code d’éthique nommé dans le serment : 5 valeurs, des interdits et une formation obligatoire', 'The code of ethics named in the oath: 5 values, prohibitions and mandatory training')}</h2>
    <p class="une-p">${deux('Le serment renvoie au code. Alors, qu’est-ce qu’il contient?', 'The oath points to the code. So what is in it?')}</p>
    <p class="une-p">${deux(`Le ${lien(S.guide, 'guide du ministère')} résume la Loi sur l’éthique et la déontologie en matière municipale (chapitre E-15.1.0.1) :`, `The ${lien(S.guide, 'ministry’s guide')} (in French) sums up the Municipal Ethics and Good Conduct Act (chapter E-15.1.0.1):`)}</p>
    <ul class="une-liste">
      <li>${deux('<b>Les valeurs (art. 4)</b> : « l’intégrité, l’honneur, le respect, la civilité et l’équité ».', '<b>The values (s. 4)</b>: integrity, honour, respect, civility and fairness.')}</li>
      <li>${deux('<b>Les règles obligatoires (art. 6)</b> : elles interdisent notamment les comportements irrespectueux, les conflits d’intérêts, le favoritisme, l’utilisation des ressources de la municipalité et la violation de la confidentialité.', '<b>The mandatory rules (s. 6)</b>: among other things, they prohibit disrespectful conduct, conflicts of interest, favouritism, use of municipal resources and breaches of confidentiality.')}</li>
      <li>${deux('<b>Une révision après chaque élection générale (art. 13)</b> : le code doit être adopté « avant le 1er mai suivant une élection générale ».', '<b>A review after every general election (s. 13)</b>: the code must be adopted before May 1 following a general election.')}</li>
      <li>${deux('<b>Une formation obligatoire (art. 15)</b> : « dans les six mois suivant le début de chaque mandat » (9 mois pour les personnes réélues).', '<b>Mandatory training (s. 15)</b>: within six months of the start of each term (9 months for re-elected members).')}</li>
    </ul>

    <h2 class="une-h2">${deux('Quand chaque conseil a prêté serment (élection du 2 novembre 2025)', 'When each council took the oath (November 2, 2025 election)')}</h2>
${tableauVilles()}
    <p class="une-p">${deux('Dix villes ont publié le jour exact. Québec nous l’a donné par son greffier. Une autre confirme seulement que c’était fait au 17 novembre. Deux, rien.', 'Ten cities published the exact day. Québec City gave it to us through its clerk. One more only confirms it was done by November 17. Two published nothing.')}</p>
    <p class="une-p">${deux('Parmi les villes qui ont publié le jour exact, les premières : Drummondville et Victoriaville, le 7 novembre. Cinq jours après le scrutin.', 'Among cities that published the exact day, the first: Drummondville and Victoriaville, on November 7. Five days after the vote.')}</p>
    <p class="une-p">${deux('Saint-Hyacinthe est un cas à part. Le procès-verbal du 17 novembre dit seulement que « tous les membres du Conseil ont dûment été assermentés ». Le jour exact n’y est pas, d’où le « au plus tard ».', 'Saint-Hyacinthe is a special case. The November 17 minutes only say that all council members had been duly sworn in (French text). The exact day is not given, hence “by”.')}</p>
    <p class="une-note">${deux('Une ville sans date n’a rien publié à ce sujet sur son site.', 'A city without a date has published nothing on its website.')}</p>
${sources([
      [S.lerm, 'LégisQuébec, chapitre E-2.2 : art. 313, 314.2, 330, 335, 337, 339, 653 et annexe II', 'LégisQuébec, chapter E-2.2: ss. 313, 314.2, 330, 335, 337, 339, 653 and Schedule II'],
      [S.guide, 'MAMH, Guide d’accueil des élus municipaux, oct. 2026 (PDF)', 'MAMH, welcome guide for municipal councillors, Oct. 2026 (PDF, French)'],
      [S.montreal, 'Ville de Montréal, communiqué du 13 nov. 2025', 'City of Montréal, news release, Nov. 13, 2025'],
      [S.laval, 'Ville de Laval, communiqué du 11 nov. 2025', 'City of Laval, news release, Nov. 11, 2025'],
      [S.longueuil, 'Ville de Longueuil, communiqué du 10 nov. 2025', 'City of Longueuil, news release, Nov. 10, 2025'],
      [S.levisMaire, 'Ville de Lévis, communiqué du 11 nov. 2025', 'City of Lévis, news release, Nov. 11, 2025'],
      [srcVille('Drummondville'), 'Ville de Drummondville, communiqué du 7 nov. 2025', 'City of Drummondville, news release, Nov. 7, 2025'],
      [srcVille('Repentigny'), 'Ville de Repentigny, communiqué du 12 nov. 2025', 'City of Repentigny, news release, Nov. 12, 2025'],
      [srcVille('Brossard'), 'Ville de Brossard, communiqué du 10 nov. 2025', 'City of Brossard, news release, Nov. 10, 2025'],
      [srcVille('Saint-Jean-sur-Richelieu'), 'Ville de Saint-Jean-sur-Richelieu, communiqué du 11 nov. 2025', 'City of Saint-Jean-sur-Richelieu, news release, Nov. 11, 2025'],
      [srcVille('Trois-Rivières'), 'Ville de Trois-Rivières, page des membres du conseil', 'City of Trois-Rivières, council members page'],
      [srcVille('Gatineau'), 'Ville de Gatineau, communiqué de juin 2025', 'City of Gatineau, June 2025 news release'],
      [srcVille('Victoriaville'), 'Ville de Victoriaville, communiqué du 7 nov. 2025 (PDF)', 'City of Victoriaville, news release, Nov. 7, 2025 (PDF)'],
      [srcVille('Saint-Hyacinthe'), 'Ville de Saint-Hyacinthe, procès-verbal du 17 nov. 2025 (PDF)', 'City of Saint-Hyacinthe, minutes of Nov. 17, 2025 (PDF)'],
      [srcVille('Saguenay'), 'Ville de Saguenay, communiqué du 7 nov. 2025 (PDF)', 'City of Saguenay, news release, Nov. 7, 2025 (PDF)'],
    ])}`,
  },
  {
    slug: 'conseil-sans-serment',
    titre: 'Pas de serment, pas de séance au conseil municipal — DossierQuébec',
    titreEn: 'No oath, no municipal council sitting — DossierQuébec',
    desc: "Autour de chaque élection générale, le conseil ne siège qu'en cas de force majeure tant que ses élus n'ont pas prêté serment. La loi et les dates de 2025.",
    fil: deux('Pas de serment, pas de séance', 'No oath, no sitting'),
    h1: [deux('Pas de serment,', 'No oath,'), deux('pas de séance.', 'no sitting.')],
    sujet: deux('Le conseil municipal sans serment', 'A council without an oath'),
    chapeau: deux(
      'À chaque élection générale municipale, votre conseil de ville ne peut presque plus siéger pendant plus d’un mois. Une exception : l’urgence. Et même là, il ne peut parler que d’elle. C’est l’article 314.2 de la loi électorale municipale.',
      'At every general municipal election, your city council can barely sit for more than a month. One exception: an emergency. Even then, it may deal only with that. That is section 314.2 of Quebec’s municipal election act.'),
    corps: () => `
    <h2 class="une-h2">${deux('La règle tient en deux phrases', 'The rule fits in two sentences')}</h2>
    <blockquote class="une-citation">« Au cours de la période qui commence à 16 h 30 le trentième jour précédant celui fixé pour le scrutin d’une élection générale et qui se termine au moment où la majorité des candidats élus à un poste de conseiller a prêté le serment, le conseil ne peut siéger que si survient un cas de force majeure nécessitant son intervention. Les délibérations lors de cette séance ne peuvent porter que sur ce cas. »</blockquote>
    <p class="une-p">${deux(`Loi sur les élections et les référendums dans les municipalités, ${lien(S.lerm, 'art. 314.2')}, premier alinéa.`, `Act respecting elections and referendums in municipalities, ${lien(S.lerm, 's. 314.2')}, first paragraph (French text quoted).`)}</p>

    <h2 class="une-h2">${deux('En clair : un début, une fin, une soupape', 'In plain terms: a start, an end, a safety valve')}</h2>
    <ul class="une-liste">
      <li>${deux('<b>Le début : 30 jours avant le vote</b>, à 16 h 30. Le conseil sortant ne peut plus se réunir, sauf urgence.', '<b>The start: 30 days before election day</b>, at 4:30 p.m. The outgoing council can no longer meet, except in an emergency.')}</li>
      <li>${deux('<b>La fin : quand la majorité des nouveaux conseillers a prêté serment.</b> C’est le serment qui rend le nouveau conseil capable de siéger.', '<b>The end: when a majority of the new councillors have taken the oath.</b> The oath is what lets the new council sit.')}</li>
      <li>${deux('<b>La soupape : 35 jours.</b> Si la majorité n’a pas prêté serment avant le 35e jour après le scrutin, la règle cesse au début de ce jour (deuxième alinéa).', '<b>The safety valve: 35 days.</b> If a majority has not taken the oath before the 35th day after election day, the rule stops applying at the start of that day (second paragraph).')}</li>
      <li>${deux('<b>L’urgence</b> : le conseil peut siéger, mais il ne peut parler que de cette urgence.', '<b>An emergency</b>: council may sit, but only to deal with that emergency.')}</li>
    </ul>
    <p class="une-p">${deux('Autrement dit, le serment n’est pas qu’une cérémonie. C’est l’interrupteur.', 'In other words, the oath is not just a ceremony. It is the switch.')}</p>

    <h2 class="une-h2">${deux('En 2025 : du 3 octobre au 7 décembre au plus tard', 'In 2025: October 3 to December 7 at the latest')}</h2>
    <ul class="une-liste">
      <li>${deux(`<b>3 octobre 2025, 16 h 30</b> : début de la période, pour le scrutin du 2 novembre. Le ministère des Affaires municipales l’a rappelé aux villes dans son ${lien(S.muni, 'bulletin Muni-Express du 3 octobre 2025')}.`, `<b>October 3, 2025, 4:30 p.m.</b>: the period begins, for the November 2 election. The Municipal Affairs ministry reminded cities in its ${lien(S.muni, 'Muni-Express bulletin of October 3, 2025')}.`)}</li>
      <li>${deux('<b>2 novembre 2025</b> : jour du scrutin.', '<b>November 2, 2025</b>: election day.')}</li>
      <li>${deux('<b>7 décembre 2025</b> : 35e jour après le scrutin. Au plus tard ce jour-là, la règle tombait d’elle-même.', '<b>December 7, 2025</b>: 35th day after election day. By that day at the latest, the rule lapsed on its own.')}</li>
    </ul>
    <p class="une-p">${deux('Combien de jours après le scrutin?', 'How many days after election day?')}</p>
    <p class="une-p">${deux('Entre 5 et 14 jours après le scrutin, dans les onze villes dont on connaît le jour :', 'Between 5 and 14 days after election day, in the eleven cities where the day is known:')}</p>
${tableauVilles()}
    <p class="une-p">${deux(`À Laval, le conseil a prêté serment le dimanche 9 novembre. Dès le lendemain, il siégeait en séance extraordinaire pour nommer son comité exécutif (${lien(S.laval, 'communiqué de la Ville')}).`, `In Laval, council took the oath on Sunday, November 9. The very next day, it met in a special sitting to appoint its executive committee (${lien(S.laval, 'City news release')}).`)}</p>

    <h2 class="une-h2">${deux('Un vrai cas : 11 élus sur 13 à Saint-Jean-sur-Richelieu', 'A real case: 11 of 13 members in Saint-Jean-sur-Richelieu')}</h2>
    <p class="une-p">${deux('Un conseil ne jure pas toujours d’un seul bloc.', 'A council does not always swear in all at once.')}</p>
    <p class="une-p">${deux(`Le soir du 10 novembre 2025, 11 des 13 élus de Saint-Jean-sur-Richelieu ont prêté serment. Les deux autres devaient le faire plus tard (${lien(S.sjsr, 'communiqué de la Ville du 11 nov. 2025')}).`, `On the evening of November 10, 2025, 11 of Saint-Jean-sur-Richelieu’s 13 members took the oath. The other two were to do so later (${lien(S.sjsr, 'City news release, Nov. 11, 2025')}).`)}</p>
    <p class="une-p">${deux('Pourquoi deux temps? Le communiqué ne le dit pas.', 'Why two steps? The release does not say.')}</p>
    <p class="une-p">${deux('Pour l’article 314.2, ce qui compte est la majorité des conseillers élus, pas l’unanimité.', 'For section 314.2, what counts is a majority of the elected councillors, not all of them.')}</p>

    <h2 class="une-h2">${deux('Quand le conseil change de forme, le serment fixe aussi le début du mandat', 'When council changes shape, the oath also sets when the term begins')}</h2>
    <p class="une-p">${deux(`Un cas plus rare, prévu à l’${lien(S.lerm, 'article 314.1')} :`, `A rarer case, covered by ${lien(S.lerm, 'section 314.1')}:`)}</p>
    <ul class="une-liste">
      <li>${deux('<b>La situation</b> : la composition du conseil change à une élection générale (moins de postes, nouveau découpage, etc.).', '<b>The situation</b>: council’s composition changes at a general election (fewer seats, new boundaries, etc.).')}</li>
      <li>${deux('<b>La règle</b> : le mandat des conseillers commence quand la majorité des élus a prêté serment.', '<b>The rule</b>: councillors’ terms begin when a majority of those elected have taken the oath.')}</li>
      <li>${deux('<b>Le filet</b> : si la majorité ne l’a pas fait avant le 35e jour après le scrutin, le mandat commence ce jour-là.', '<b>The backstop</b>: if a majority has not done so before the 35th day after election day, the term begins on that day.')}</li>
    </ul>
    <p class="une-p">${deux('Encore le 35e jour. Les articles 314.1 et 314.2 fixent la même limite.', 'The 35th day again. Sections 314.1 and 314.2 set the same limit.')}</p>
    <p class="une-note">${deux('La loi ne définit pas la « force majeure » de l’article 314.2. Nous n’en proposons donc pas de définition.', 'The act does not define the “force majeure” of section 314.2. So we do not offer a definition.')}</p>
    <p class="une-p">${deux('Pour le texte du serment lui-même, voir <a href="/a-la-une/serment-des-elus-municipaux">Le serment des élus, ville par ville</a>.', 'For the wording of the oath itself, see <a href="/a-la-une/serment-des-elus-municipaux">The oath of office, city by city</a>.')}</p>
${sources([
      [S.lerm, 'LégisQuébec, chapitre E-2.2 : art. 313, 314.1 et 314.2', 'LégisQuébec, chapter E-2.2: ss. 313, 314.1 and 314.2'],
      [S.sjsr, 'Ville de Saint-Jean-sur-Richelieu, communiqué du 11 nov. 2025', 'City of Saint-Jean-sur-Richelieu, news release, Nov. 11, 2025'],
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
    desc: "La chronologie du serment des députés du Québec : allégeance au roi en 1867, loyauté au peuple en 1982, crise de 2022 et serment au roi qui n’est plus exigé.",
    fil: deux('Chronologie du serment au roi', 'Oath to the King timeline'),
    h1: [deux('Le serment au roi,', 'The oath to the King,'), deux('de 1867 à aujourd’hui.', '1867 to today.')],
    sujet: deux('Chronologie du serment au roi', 'Oath to the King timeline'),
    chapeau: deux(
      'Pendant 155 ans, aucun député du Québec n’a pu siéger sans jurer fidélité au souverain. Puis, à l’automne 2022, la règle a changé. Voici les étapes, chaque date avec sa source officielle.',
      'For 155 years, no Quebec member could sit without swearing allegiance to the sovereign. Then, in the fall of 2022, the rule changed. Here are the steps, each date with its official source.'),
    corps: () => `
    <p class="une-p">${deux('Deux dates fixent le décor : 1867 et 1982. Les sept autres tiennent dans l’automne 2022.', 'Two dates set the stage: 1867 and 1982. The other seven fit in the fall of 2022.')}</p>
    <ol class="une-chrono">
      <li><b>1867</b> ${deux(`L’article 128 de la Loi constitutionnelle de 1867 oblige les membres du Parlement fédéral et des assemblées provinciales à prêter le serment d’allégeance avant de siéger : « Je, A.B., jure que je serai fidèle et porterai vraie allégeance à Sa Majesté la Reine Victoria » (cinquième annexe). ${lien(S.lc1867, 'Art. 128')} · ${lien(S.lc1867ann, 'cinquième annexe')}`, `Section 128 of the Constitution Act, 1867 requires members of Parliament and of provincial legislatures to take the oath of allegiance before sitting: “I A.B. do swear, That I will be faithful and bear true Allegiance to Her Majesty Queen Victoria” (Fifth Schedule). ${lien(S.lc1867, 's. 128')} · ${lien(S.lc1867ann, 'Fifth Schedule')}`)}</li>
      <li><b>1982</b> ${deux(`La Loi sur l’Assemblée nationale ajoute un second serment, envers le peuple du Québec : « Je, (nom du député), déclare sous serment que je serai loyal envers le peuple du Québec et que j’exercerai mes fonctions de député avec honnêteté et justice dans le respect de la constitution du Québec. » Sans lui, pas de siège (art. 15). ${lien(S.lan, 'Loi sur l’Assemblée nationale, art. 15 et annexe I (1982, c. 62)')}`, `The National Assembly Act adds a second oath: the member swears to be loyal to the people of Quebec and to serve with honesty and justice, respecting Quebec’s constitution. Without it, no seat (s. 15). ${lien(S.lan, 'National Assembly Act, s. 15 and Schedule I (1982, c. 62)')}`)}</li>
      <li><b>${deux('19 octobre 2022', 'October 19, 2022')}</b> ${deux(`Les élus de Québec solidaire prêtent serment « envers le peuple québécois », sans faire allégeance au roi Charles III. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `Québec solidaire members take the oath to the people of Quebec only, without swearing allegiance to King Charles III. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('21 octobre 2022', 'October 21, 2022')}</b> ${deux(`Les trois élus du Parti québécois font de même et refusent l’allégeance au roi. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `The three Parti Québécois members do the same and refuse allegiance to the King. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('1er novembre 2022', 'November 1, 2022')}</b> ${deux(`Le président sortant, François Paradis, décide que les élus qui refusent l’allégeance au roi ne peuvent pas siéger. Les élus de Québec solidaire prêtent alors le serment au roi. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `Outgoing Speaker François Paradis rules that members who refuse allegiance to the King cannot sit. Québec solidaire members then take the oath to the King. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('1er décembre 2022', 'December 1, 2022')}</b> ${deux(`Les trois élus du Parti québécois se voient refuser l’entrée de la Salle de l’Assemblée par la sergente d’armes. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `The three Parti Québécois members are refused entry to the Assembly Chamber by the Sergeant-at-Arms. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('1er décembre 2022', 'December 1, 2022')}</b> ${deux(`Sol Zanetti, député de Jean-Lesage, dépose le projet de loi n° 190, Loi visant à reconnaître le serment des députés envers le peuple du Québec comme seul serment obligatoire à leur entrée en fonction. ${lien(S.chrono2022, 'Chronologie de l’Assemblée nationale')}`, `Sol Zanetti, member for Jean-Lesage, introduces Bill 190, An Act to recognize the members’ oath to the people of Quebec as the only mandatory oath on taking office. ${lien(S.chrono2022, 'National Assembly timeline')}`)}</li>
      <li><b>${deux('6 décembre 2022', 'December 6, 2022')}</b> ${deux(`Le ministre Jean-François Roberge présente le projet de loi n° 4, Loi visant à reconnaître le serment prévu par la Loi sur l’Assemblée nationale comme seul serment obligatoire pour y siéger. L’Assemblée accepte d’en être saisie. ${lien(S.pl4, 'Fiche du projet de loi')} · ${lien(S.jd6, 'Journal des débats, 6 déc. 2022')}`, `Minister Jean-François Roberge introduces Bill 4, making the National Assembly Act oath the only mandatory oath to sit. The Assembly agrees to take it up. ${lien(S.pl4, 'Bill page')} · ${lien(S.jd6, 'Journal des débats, Dec. 6, 2022')}`)}</li>
      <li><b>${deux('9 décembre 2022', 'December 9, 2022')}</b> ${deux(`Le projet de loi est adopté sans vote nominal et sanctionné le même jour (L.Q. 2022, c. 30). Il ajoute à la Loi constitutionnelle de 1867 : « 128Q.1. L’article 128 ne s’applique pas au Québec. » Le serment au roi n’est plus exigé pour siéger. ${lien(S.loi2022, 'Loi de 2022, chapitre 30 (PDF officiel)')}`, `The bill is passed without a recorded division and assented to the same day (S.Q. 2022, c. 30). It adds to the Constitution Act, 1867: “128Q.1. Section 128 does not apply to Quebec.” The oath to the King is no longer required to sit. ${lien(S.loi2022, '2022 Act, chapter 30 (official PDF)')}`)}</li>
    </ol>

    <h2 class="une-h2">${deux('La voie invoquée par le gouvernement : l’article 45 de 1982', 'The route the government invoked: section 45 of 1982')}</h2>
    <p class="une-p">${deux('Le serment au roi est écrit dans la Constitution du Canada. Pourtant, Québec l’a retiré par sa propre loi, en 2022.', 'The oath to the King is written in Canada’s Constitution. Yet Quebec removed it through its own act, in 2022.')}</p>
    <p class="une-p">${deux('Sur quelle base?', 'On what basis?')}</p>
    <p class="une-p">${deux(`Le gouvernement s’appuie sur une phrase de la Loi constitutionnelle de 1982 : « Sous réserve de l’article 41, une législature a compétence exclusive pour modifier la constitution de sa province. » (${lien(S.art45, 'art. 45')})`, `The government relies on one sentence of the Constitution Act, 1982: subject to section 41, a legislature has exclusive power to amend the constitution of its province (${lien(S.art45, 's. 45')}, French text paraphrased).`)}</p>
    <p class="une-p">${deux('La loi de 2022, elle, ne nomme pas cet article.', 'The 2022 act itself does not name that section.')}</p>
    <p class="une-p">${deux(`Elle n’a pas de préambule. Ses notes explicatives disent seulement qu’elle a pour objet « d’abolir l’obligation de prêter et de souscrire le serment d’allégeance au roi prévue par la Loi constitutionnelle de 1867 » pour siéger à l’Assemblée nationale (${lien(S.loi2022, 'loi de 2022, notes explicatives')}).`, `It has no preamble. Its explanatory notes only say its purpose is to abolish the obligation, set out in the Constitution Act, 1867, to take and subscribe the oath of allegiance to the King in order to sit in the National Assembly (${lien(S.loi2022, '2022 act, explanatory notes')}, French text paraphrased).`)}</p>
    <p class="une-p">${deux(`C’est le ministre qui l’a nommé, en Chambre, le jour de l’adoption. Il disait agir « en invoquant l’article 45 de la Loi constitutionnelle de 1982, laquelle nous permet, dans certaines circonstances, circonstances qu’on rencontre aujourd’hui, de modifier unilatéralement la section de la Constitution » en cause. Il citait aussi la loi n° 96 comme exemple de la même voie (${lien(S.debats9, 'Journal des débats, 9 déc. 2022')}).`, `The minister named it, in the Chamber, on the day the bill passed. He said he was acting by invoking section 45 of the Constitution Act, 1982, which in certain circumstances, met that day, allows that part of the Constitution to be amended unilaterally. He also cited Bill 96 as following the same route (${lien(S.debats9, 'Journal des débats, Dec. 9, 2022')}, French text paraphrased).`)}</p>

    <h2 class="une-h2">${deux('Ce qu’ils ont dit en Chambre le 9 décembre 2022', 'What they said in the Chamber on December 9, 2022')}</h2>
    <p class="une-p">${deux('Voici ce qu’ont dit trois élus, tels que leurs mots figurent au Journal des débats.', 'Here is what three members said, as recorded in the Journal des débats (French text, paraphrased in English).')}</p>
    <p class="une-p"><b>${deux('Le gouvernement (CAQ), par le ministre Jean-François Roberge', 'The government (CAQ), through Minister Jean-François Roberge')}</b></p>
    <blockquote class="une-citation">${deux('« au Québec nous sommes des démocrates, nous ne sommes pas un peuple de monarchistes. »', 'In Quebec, we are democrats, we are not a people of monarchists (French text paraphrased).')}</blockquote>
    <p class="une-p">${deux('Les députés, ajoutait-il, « n’auront plus à prêter serment au roi d’un autre pays. » Il y voyait « un geste d’affirmation nationale, un geste de modernité ».', 'Members, he added, would no longer have to swear an oath to the king of another country. He called it an act of national affirmation and of modernity.')}</p>
    <p class="une-p"><b>${deux('L’opposition officielle (PLQ), par Monsef Derraji', 'The Official Opposition (Quebec Liberal Party), through Monsef Derraji')}</b></p>
    <blockquote class="une-citation">${deux('« nous sommes d’accord qu’il est temps de passer à autre chose. Toutefois, nous déplorons, nous déplorons l’approche juridique du gouvernement d’amender unilatéralement la Constitution sans consultation. »', 'We agree it is time to move on. However, we deplore the government’s legal approach of amending the Constitution unilaterally without consultation (French text paraphrased).')}</blockquote>
    <p class="une-p">${deux('Il ajoutait : « Le gouvernement n’est pas à l’abri de contestations judiciaires. » Puis : « le Parti libéral du Québec va appuyer ce projet de loi. »', 'He added that the government was not shielded from court challenges. Then: the Quebec Liberal Party would back the bill.')}</p>
    <p class="une-p"><b>${deux('Québec solidaire, par Sol Zanetti', 'Québec solidaire, through Sol Zanetti')}</b></p>
    <blockquote class="une-citation">${deux('« c’est un grand pas pour la liberté de conscience. Ce n’est pas normal et c’est antidémocratique de forcer des gens, qui ont été élus par leurs concitoyens pour porter certaines valeurs, de se piler sur le coeur pour devoir les exprimer. »', 'It is a big step for freedom of conscience. It is not normal and it is undemocratic to force people elected to carry certain values to go against their conscience in order to express them (French text paraphrased).')}</blockquote>
    <p class="une-p">${deux('Et pour finir : « C’était une journée d’unité nationale, et je suis vraiment content de vivre ça avec vous. »', 'And to close: it was a day of national unity, and he was truly glad to share it with them.')}</p>
    <p class="une-p">${deux('Et le vote?', 'And the vote?')}</p>
    <p class="une-p">${deux(`À chaque étape (principe, commission plénière, adoption), le Journal note « Des voix : Adopté. » Le projet de loi a donc été adopté sans vote nominal (${lien(S.debats9, 'Journal des débats, 9 déc. 2022')}).`, `At each stage (principle, committee of the whole, passage), the Journal records voices saying “Adopté.” The bill was therefore passed without a recorded division (${lien(S.debats9, 'Journal des débats, Dec. 9, 2022')}).`)}</p>

    <h2 class="une-h2">${deux('Aujourd’hui : un seul serment obligatoire pour siéger', 'Today: one mandatory oath to sit')}</h2>
    <p class="une-p">${deux('Deux serments exigés pendant 40 ans. Un seul aujourd’hui.', 'Two oaths required for 40 years. Only one today.')}</p>
    <p class="une-p">${deux(`La Bibliothèque de l’Assemblée nationale le résume dans un billet du 14 octobre 2026 (mis à jour le 5 novembre 2026) : jusqu’en 2022, tous les parlementaires devaient prêter le serment d’allégeance. Le projet de loi n° 4 a retiré cette obligation. Le serment de loyauté envers le peuple du Québec demeure le « seul serment obligatoire pour y siéger » (${lien(S.biblio, 'billet de la Bibliothèque')}).`, `The National Assembly Library sums it up in a post dated October 14, 2026 (updated November 5, 2026): until 2022, all members had to take the oath of allegiance. Bill 4 removed that obligation. The oath of loyalty to the people of Quebec remains the only mandatory oath to sit (${lien(S.biblio, 'Library post')}, in French).`)}</p>
    <p class="une-note">${deux('Le billet ne donne ni les dates d’assermentation ni le nombre d’élus de la 44e législature. Nous ne les donnons donc pas ici.', 'The post gives neither the swearing-in dates nor the number of members of the 44th legislature. So we do not give them here.')}</p>
${sources([
      [S.lc1867, 'Justice Canada, Loi constitutionnelle de 1867, art. 128', 'Justice Canada, Constitution Act, 1867, s. 128'],
      [S.lc1867ann, 'Justice Canada, Loi constitutionnelle de 1867, cinquième annexe', 'Justice Canada, Constitution Act, 1867, Fifth Schedule'],
      [S.lan, 'LégisQuébec, Loi sur l’Assemblée nationale (A-23.1), art. 15 et annexe I', 'LégisQuébec, National Assembly Act (A-23.1), s. 15 and Schedule I'],
      [S.chrono2022, 'Assemblée nationale, Chronologie parlementaire (2022)', 'National Assembly, parliamentary timeline (2022)'],
      [S.pl4, 'Assemblée nationale, projet de loi n° 4 (43-1)', 'National Assembly, Bill 4 (43-1)'],
      [S.loi2022, 'Publications du Québec, Lois du Québec 2022, chapitre 30', 'Publications du Québec, Statutes of Quebec 2022, chapter 30'],
      [S.art45, 'Justice Canada, Loi constitutionnelle de 1982, art. 45', 'Justice Canada, Constitution Act, 1982, s. 45'],
      [S.jd6, 'Assemblée nationale, Journal des débats du 6 déc. 2022', 'National Assembly, Journal des débats, Dec. 6, 2022'],
      [S.debats9, 'Assemblée nationale, Journal des débats du 9 déc. 2022', 'National Assembly, Journal des débats, Dec. 9, 2022'],
      [S.biblio, 'Bibliothèque de l’Assemblée nationale, billet du 14 oct. 2026 (mis à jour le 5 nov. 2026)', 'National Assembly Library, post of Oct. 14, 2026 (updated Nov. 5, 2026)'],
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
      'Une province sur dix. C’est la seule où un député peut siéger sans jurer fidélité au roi : le Québec. Ses élus municipaux n’ont pas à le faire non plus. Le portrait, assemblée par assemblée.',
      'One province out of ten. Quebec is the only one where a member may sit without swearing allegiance to the King. Its municipal councillors do not have to either. The picture, legislature by legislature.'),
    corps: () => `
    <p class="une-p">${deux('Cinq groupes d’élus. Pour trois d’entre eux, tout part du même article : le 128.', 'Five groups of elected officials. For three of them, it all comes down to the same section: 128.')}</p>
    <div class="une-table-wrap"><table class="fin-table une-table">
      <thead><tr><th>${deux('Élus', 'Elected officials')}</th><th>${deux('À qui ils jurent', 'Sworn to')}</th><th>${deux('Serment au roi', 'Oath to the King')}</th><th>${deux('Loi', 'Law')}</th></tr></thead>
      <tbody>
        <tr><td><b>${deux('Députés fédéraux', 'Members of Parliament')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire (serment ou affirmation solennelle) : sans lui, pas de siège', 'Mandatory (oath or solemn affirmation): no seat without it')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))} · ${lien(S.communes, deux('Procédure de la Chambre', 'House procedure'))}</td></tr>
        <tr><td><b>${deux('Sénateurs', 'Senators')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire', 'Mandatory')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))}</td></tr>
        <tr><td><b>${deux('Députés des 9 autres provinces', 'Members in the 9 other provinces')}</b></td><td>${deux('Au roi', 'The King')}</td><td>${deux('Obligatoire : l’art. 128 vise aussi les assemblées provinciales', 'Mandatory: s. 128 also covers provincial legislatures')}</td><td>${lien(S.lc1867, deux('LC 1867, art. 128', 'CA 1867, s. 128'))}</td></tr>
        <tr><td><b>${deux('Députés du Québec', 'Quebec MNAs')}</b></td><td>${deux('Au peuple du Québec', 'The people of Quebec')}</td><td>${deux('Plus exigé depuis le 9 déc. 2022', 'No longer required since Dec. 9, 2022')}</td><td>${lien(S.lan, deux('Loi sur l’Assemblée nationale, art. 15', 'National Assembly Act, s. 15'))} · ${lien(S.loi2022, deux('LC 1867, art. 128Q.1', 'CA 1867, s. 128Q.1'))}</td></tr>
        <tr><td><b>${deux('Élus municipaux du Québec', 'Quebec municipal councillors')}</b></td><td>${deux('À personne : ils jurent d’exercer leurs fonctions avec honnêteté et justice, dans le respect de la loi et du code d’éthique', 'No one: they swear to serve with honesty and justice, respecting the law and the code of ethics')}</td><td>${deux('Absent : le serment ne nomme pas le roi', 'None: the oath does not name the King')}</td><td>${lien(S.lerm, deux('LERM, art. 313 et annexe II', 'Municipal elections act, s. 313 and Schedule II'))}</td></tr>
      </tbody>
    </table></div>
    <p class="une-note">${deux('Ce tableau s’en tient à l’article 128, qui s’applique partout sauf au Québec. Certaines provinces peuvent exiger un serment de plus par leur propre loi. Le détail, province par province, suit plus bas.', 'This table sticks to section 128, which applies everywhere except Quebec. Some provinces may require an additional oath under their own law. The province-by-province detail follows below.')}</p>

    <h2 class="une-h2">${deux('Le texte exact du serment fédéral nomme encore Elizabeth II', 'The exact wording of the federal oath still names Elizabeth II')}</h2>
    <p class="une-p">${deux('Le voici, tel qu’il est codifié :', 'Here it is, as codified:')}</p>
    <blockquote class="une-citation">« Je, ..., jure fidélité et sincère allégeance à Sa Majesté la Reine Elizabeth Deux, Reine du Canada, à ses héritiers et successeurs. Ainsi Dieu me soit en aide. »</blockquote>
    <p class="une-p">${deux(`Loi sur les serments d’allégeance, L.R.C. 1985, ch. O-1, ${lien(S.o1, 'art. 2(1)')}, version à jour au 29 octobre 2026.`, `Oaths of Allegiance Act, R.S.C. 1985, c. O-1, ${lien(S.o1, 's. 2(1)')} (French text quoted), current to October 29, 2026.`)}</p>
    <p class="une-p">${deux('Oui, Elizabeth II.', 'Yes, Elizabeth II.')}</p>
    <p class="une-p">${deux('Le texte codifié nomme encore la reine. Nous n’avons pas vérifié pourquoi, donc nous ne l’expliquons pas ici.', 'The codified text still names the Queen. We have not verified why, so we do not explain it here.')}</p>
    <p class="une-p">${deux(`Et si on ne veut pas jurer? La même loi prévoit une affirmation solennelle : elle reprend les mots du serment en les adaptant et a le même effet (${lien(S.o1, 'art. 3')}).`, `What if you would rather not swear? The same act provides for a solemn affirmation: it adapts the words of the oath and has the same effect (${lien(S.o1, 's. 3')}).`)}</p>

    <h2 class="une-h2">${deux('Un exemple de province : en Colombie-Britannique, un seul serment, au souverain', 'One provincial example: in British Columbia, a single oath, to the sovereign')}</h2>
    <p class="une-p">${deux(`Le député prête serment devant le lieutenant-gouverneur ou une personne qu’il autorise, avant de siéger ou de voter (${lien(S.bc, 'Constitution Act, RSBC 1996, c. 66, art. 24(1)')}). Le texte, en anglais :`, `The member takes the oath before the Lieutenant Governor or a person the Lieutenant Governor authorizes, before sitting or voting (${lien(S.bc, 'Constitution Act, RSBC 1996, c. 66, s. 24(1)')}). The wording:`)}</p>
    <blockquote class="une-citation">${deux('« I, A.B., swear that I will be faithful and bear true allegiance to Her Majesty Queen Elizabeth II [or her successor], her heirs and successors, according to law. So help me God. »', '“I, A.B., swear that I will be faithful and bear true allegiance to Her Majesty Queen Elizabeth II [or her successor], her heirs and successors, according to law. So help me God.”')}</blockquote>
    <ul class="une-liste">
      <li>${deux(`<b>Affirmation solennelle permise</b> (${lien(S.bc, 'art. 24(2)')}).`, `<b>Solemn affirmation allowed</b> (${lien(S.bc, 's. 24(2)')}).`)}</li>
      <li>${deux('<b>Aucun autre serment de député</b> dans cette loi.', '<b>No other member’s oath</b> in this act.')}</li>
    </ul>

    <h2 class="une-h2">${deux('Province par province : Terre-Neuve-et-Labrador ajoute un serment d’office', 'Province by province: Newfoundland and Labrador adds an oath of office')}</h2>
    <p class="une-p">${deux('On a ouvert la loi de chaque province (ou, à défaut, la page de son assemblée). Voici ce qu’on y trouve :', 'We opened each province’s act (or, failing that, its legislature’s page). Here is what we found:')}</p>
    <div class="une-table-wrap"><table class="fin-table une-table">
      <thead><tr><th>${deux('Province', 'Province')}</th><th>${deux('Loi et article', 'Act and section')}</th><th>${deux('Serment', 'Oath')}</th><th>${deux('Affirmation permise', 'Affirmation allowed')}</th></tr></thead>
      <tbody>
        <tr><td><b>Alberta</b></td><td>${lien(S.ab, deux('Legislative Assembly Act, RSA 2000, c. L-9, art. 23', 'Legislative Assembly Act, RSA 2000, c. L-9, s. 23'))}</td><td>« I, _____, do swear that I will be faithful and bear true allegiance to His Majesty King Charles III »</td><td>${deux('Oui (art. 23(2))', 'Yes (s. 23(2))')}</td></tr>
        <tr><td><b>${deux('Colombie-Britannique', 'British Columbia')}</b></td><td>${lien(S.bc, deux('Constitution Act, RSBC 1996, c. 66, art. 24', 'Constitution Act, RSBC 1996, c. 66, s. 24'))}</td><td>« ... to Her Majesty Queen Elizabeth II [or her successor] »</td><td>${deux('Oui (art. 24(2))', 'Yes (s. 24(2))')}</td></tr>
        <tr><td><b>Manitoba</b></td><td>${lien(S.mb, deux('Loi sur l’Assemblée législative, C.P.L.M. c. L110, art. 10', 'Legislative Assembly Act, C.C.S.M. c. L110, s. 10'))}</td><td>« I, A.B., do swear (or affirm) that I will be faithful and bear true allegiance to His Majesty King Charles the Third »</td><td>${deux('Oui (« or affirm »)', 'Yes (“or affirm”)')}</td></tr>
        <tr><td><b>${deux('Île-du-Prince-Édouard', 'Prince Edward Island')}</b></td><td>${lien(S.ipe, deux('Legislative Assembly Act, RSPEI c. L-7.1, art. 25', 'Legislative Assembly Act, RSPEI c. L-7.1, s. 25'))}</td><td>« I, A.B., swear that I will be faithful and bear true allegiance to His Majesty King Charles III »</td><td>${deux('Oui (art. 25 b))', 'Yes (s. 25(b))')}</td></tr>
        <tr><td><b>${deux('Terre-Neuve-et-Labrador', 'Newfoundland and Labrador')}</b></td><td>${lien(S.tnl, deux('SNL 2007, c. H-10.1, art. 5', 'SNL 2007, c. H-10.1, s. 5'))}</td><td>${deux('Allégeance au roi, plus un serment d’office : « I affirm, ascribe to and agree to follow the Code of Conduct of Members »', 'Allegiance to the King, plus an oath of office: “I affirm, ascribe to and agree to follow the Code of Conduct of Members”')}</td><td>${deux('Non vérifié', 'Not checked')}</td></tr>
        <tr><td><b>Ontario</b></td><td>${lien(S.on, deux('Loi sur l’Assemblée législative, L.R.O. 1990, chap. L.10', 'Legislative Assembly Act, R.S.O. 1990, c. L.10'))}</td><td>${deux('Aucun serment de député écrit dans cette loi (l’art. 101 vise les employés du Bureau de l’Assemblée). Le serment vient alors de l’art. 128 de 1867 (voir le tableau plus haut).', 'No member’s oath written in this act (s. 101 covers employees of the Office of the Assembly). The oath then comes from s. 128 of 1867 (see the table above).')}</td><td>${deux('Sans objet dans cette loi', 'Not addressed in this act')}</td></tr>
        <tr><td><b>${deux('Nouveau-Brunswick', 'New Brunswick')}</b></td><td>${lien(S.nb, deux('Loi sur l’Assemblée législative, L.R.N.-B. 2014, chap. 116', 'Legislative Assembly Act, R.S.N.B. 2014, c. 116'))}</td><td>${deux('Aucun serment d’allégeance des députés dans cette loi. Le serment vient alors de l’art. 128 de 1867 (voir le tableau plus haut).', 'No members’ oath of allegiance in this act. The oath then comes from s. 128 of 1867 (see the table above).')}</td><td>${deux('Sans objet dans cette loi', 'Not addressed in this act')}</td></tr>
        <tr><td><b>${deux('Nouvelle-Écosse', 'Nova Scotia')}</b></td><td>${lien(S.ne, deux('Page de l’Assemblée sur l’assermentation (cite l’art. 128 de 1867)', 'Legislature page on swearing-in (cites s. 128 of 1867)'))}</td><td>« I, (Member’s full name), do swear that I will be faithful and bear true allegiance to His Majesty King Charles the Third »</td><td>${deux('Loi provinciale non lue', 'Provincial act not read')}</td></tr>
        <tr><td><b>Saskatchewan</b></td><td>${lien(S.sk, deux('Page de l’Assemblée législative (loi non lue)', 'Legislative Assembly page (act not read)'))}</td><td>${deux('Selon l’Assemblée, les députés sont « sworn in by taking an oath or making an affirmation of allegiance »', 'According to the Assembly, members are “sworn in by taking an oath or making an affirmation of allegiance”')}</td><td>${deux('Oui, selon l’Assemblée', 'Yes, according to the Assembly')}</td></tr>
      </tbody>
    </table></div>
    <p class="une-p">${deux('Ce qui saute aux yeux : Terre-Neuve-et-Labrador.', 'What stands out: Newfoundland and Labrador.')}</p>
    <p class="une-p">${deux(`Parmi les lois lues, c’est la seule où le député prête aussi un serment d’office. Il y affirme qu’il suivra le Code de conduite des membres (${lien(S.tnl, 'SNL 2007, c. H-10.1, art. 5')}).`, `Among the acts we read, it is the only one where members also take an oath of office. They affirm they will follow the Code of Conduct of Members (${lien(S.tnl, 'SNL 2007, c. H-10.1, s. 5')}).`)}</p>
    <p class="une-p">${deux('Autre détail : le nom du souverain change d’une loi à l’autre.', 'Another detail: the sovereign’s name varies from one act to another.')}</p>
    <p class="une-p">${deux(`Les lois de l’Alberta, du Manitoba et de l’Île-du-Prince-Édouard nomment Charles III. Celle de la Colombie-Britannique et la loi fédérale O-1 nomment encore Elizabeth II (${lien(S.bc, 'RSBC c. 66')} · ${lien(S.o1, 'O-1')}).`, `The Alberta, Manitoba and Prince Edward Island acts name Charles III. The British Columbia act and the federal O-1 act still name Elizabeth II (${lien(S.bc, 'RSBC c. 66')} · ${lien(S.o1, 'O-1')}).`)}</p>
    <p class="une-note">${deux('À garder en tête : ce sont des versions codifiées, sans valeur officielle (l’Île-du-Prince-Édouard l’écrit dans son PDF). Les lois de l’Ontario et du Nouveau-Brunswick, lues, n’écrivent pas le serment des députés. Pour la Nouvelle-Écosse et la Saskatchewan, nous n’avons pas lu la loi, seulement la page de l’Assemblée.', 'Keep in mind: these are consolidated versions with no official status (Prince Edward Island says so in its PDF). The Ontario and New Brunswick acts, which we read, do not set out the members’ oath. For Nova Scotia and Saskatchewan, we read only the legislature’s page, not the act.')}</p>

    <p class="une-p">${deux('Voir aussi : <a href="/a-la-une/serment-des-elus-municipaux">le serment des élus municipaux, ville par ville</a> et <a href="/a-la-une/serment-au-roi-chronologie">la chronologie du serment au roi</a>.', 'See also: <a href="/a-la-une/serment-des-elus-municipaux">the municipal oath, city by city</a> and <a href="/a-la-une/serment-au-roi-chronologie">the oath to the King timeline</a>.')}</p>
${sources([
      [S.lc1867, 'Justice Canada, Loi constitutionnelle de 1867, art. 128', 'Justice Canada, Constitution Act, 1867, s. 128'],
      [S.communes, 'Chambre des communes, La procédure et les usages, ch. 4', 'House of Commons Procedure and Practice, ch. 4'],
      [S.lan, 'LégisQuébec, Loi sur l’Assemblée nationale, art. 15', 'LégisQuébec, National Assembly Act, s. 15'],
      [S.loi2022, 'Lois du Québec 2022, chapitre 30', 'Statutes of Quebec 2022, chapter 30'],
      [S.lerm, 'LégisQuébec, Loi sur les élections et les référendums dans les municipalités, art. 313 et annexe II', 'LégisQuébec, municipal elections act, s. 313 and Schedule II'],
      [S.o1, 'Justice Canada, Loi sur les serments d’allégeance (O-1), art. 2(1) et 3, à jour au 29 oct. 2026', 'Justice Canada, Oaths of Allegiance Act (O-1), ss. 2(1) and 3, current to Oct. 29, 2026'],
      [S.bc, 'BC Laws, Constitution Act, RSBC 1996, c. 66, art. 24', 'BC Laws, Constitution Act, RSBC 1996, c. 66, s. 24'],
      [S.ab, 'Alberta King’s Printer, Legislative Assembly Act, RSA 2000, c. L-9, art. 23 (à jour au 11 déc. 2025)', 'Alberta King’s Printer, Legislative Assembly Act, RSA 2000, c. L-9, s. 23 (current to Dec. 11, 2025)'],
      [S.mb, 'Manitoba, Loi sur l’Assemblée législative, C.P.L.M. c. L110, art. 10 (à jour au 23 nov. 2026)', 'Manitoba, Legislative Assembly Act, C.C.S.M. c. L110, s. 10 (current to Nov. 23, 2026)'],
      [S.ipe, 'Île-du-Prince-Édouard, Legislative Assembly Act, RSPEI c. L-7.1, art. 25 (PDF)', 'Prince Edward Island, Legislative Assembly Act, RSPEI c. L-7.1, s. 25 (PDF)'],
      [S.tnl, 'Terre-Neuve-et-Labrador, SNL 2007, c. H-10.1, art. 5', 'Newfoundland and Labrador, SNL 2007, c. H-10.1, s. 5'],
      [S.on, 'Ontario, Loi sur l’Assemblée législative, L.R.O. 1990, chap. L.10', 'Ontario, Legislative Assembly Act, R.S.O. 1990, c. L.10'],
      [S.nb, 'Nouveau-Brunswick, Loi sur l’Assemblée législative, L.R.N.-B. 2014, chap. 116', 'New Brunswick, Legislative Assembly Act, R.S.N.B. 2014, c. 116'],
      [S.ne, 'Assemblée de la Nouvelle-Écosse, page sur l’assermentation', 'Nova Scotia Legislature, swearing-in page'],
      [S.sk, 'Assemblée législative de la Saskatchewan, page sur l’élection d’un député', 'Legislative Assembly of Saskatchewan, election of a member page'],
    ])}`,
  },
];

// Les sujets annoncés, pas encore écrits : une carte sans lien, avec la raison.
const CARTES_A_VENIR = [
];

// ---------------------------------------------------------------- l'assemblage
function remplacer(h, motif, valeur) {
  if (!motif.test(h)) throw new Error(`build-a-la-une : ${motif} introuvable dans a-la-une.html`);
  return h.replace(motif, () => valeur);
}

// Boutons de partage, copiés de ceux des projets de loi (commun/dq.js, shareCtrls) le 25 nov. 2026.
const BOUTONS_PARTAGE = [
  ['x', 'X', `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"/></svg>`],
  ['fb', 'Facebook', `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 24V13.1h3.7l.55-4.3H13.6V6.1c0-1.24.35-2.09 2.13-2.09H18V.17A30 30 0 0 0 14.7 0C11.4 0 9.2 2 9.2 5.66v3.14H5.5v4.3h3.7V24z"/></svg>`],
  ['li', 'LinkedIn', `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.34 7.43a2.47 2.47 0 1 1 0-4.94 2.47 2.47 0 0 1 0 4.94zM7.48 20.45H3.2V9h4.28zM20.45 20.45h-4.26v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H7.94V9h4.1v1.56h.06c.57-1.08 1.96-2.22 4.04-2.22 4.32 0 5.12 2.84 5.12 6.54z"/></svg>`],
  ['reddit', 'Reddit', `<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="11.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.6" cy="11" r="1.1" fill="currentColor"/><circle cx="12.4" cy="11" r="1.1" fill="currentColor"/><path d="M7.4 13.7c1.5 1 3.7 1 5.2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 5l1-3.3 3 .8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="15.3" cy="2.8" r="1.3" fill="currentColor"/></svg>`],
  ['threads', 'Threads', `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.2 11.2c-.4-3-2.3-4.4-5-4.4-2 0-3.5.9-4.3 2.3M16.8 11.3c-2.6-.6-7.3-.5-7.3 2.2 0 2.6 4.6 2.7 6 .3 1-1.6 1.1-4 .6-5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17 11.4c3.2 1.3 3.6 5 1.2 7.3-2.6 2.5-8.9 2.7-11.7-.9C4 14.7 4.2 7.6 7.3 4.6c2.6-2.6 8.3-2.8 11.2.3 1 1 1.6 2.2 1.9 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`],
  ['bsky', 'Bluesky', `<svg width="15" height="14" viewBox="0 0 24 22" aria-hidden="true"><path fill="currentColor" d="M12 9.6C10.6 6.9 6.8 1.9 3.6 1.3 1.3.9 1 3 1 4.4c0 1.3.8 6.2 1.3 7.1 1 1.9 3.5 2.4 5.9 2-4 .8-5.6 3-3 5.4 3.6 3.3 5.6-.6 6.8-3.2.1.2 0 0 0 0 1.2 2.6 3.2 6.5 6.8 3.2 2.6-2.4 1-4.6-3-5.4 2.4.4 4.9-.1 5.9-2 .5-.9 1.3-5.8 1.3-7.1 0-1.4-.3-3.5-2.6-3.1-3.2.6-7 5.6-8.4 8.3z"/></svg>`],
];

// La rangée de partage d'un article : même allure que celle des projets de loi (.bill-share-row).
// partagerPage() (commun/dq.js) prend l'adresse canonique et le titre de la page.
function rangeePartage() {
  const btn = ([r, nom, svg]) => `<button class="bill-share-btn ic" onclick="partagerPage('${r}', event)" aria-label="Partager sur ${nom}" data-reseau="${r}">${svg}</button>`;
  return `<div class="bill-share-row une-partage">
      <span class="bill-share-label">${deux('Partager :', 'Share:')}</span>
      ${BOUTONS_PARTAGE.map(btn).join('')}<button class="bill-share-btn ic" onclick="partagerPage('copy', event)" aria-label="Copier le lien">⧉</button>
    </div>`;
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
      ${rangeePartage()}
    </div>
    ${imageDe(p.slug) ? `<figure class="une-banniere"><img src="${imageDe(p.slug)}" alt="" width="1536" height="1024" fetchpriority="high"></figure>` : ''}
    <article class="une-article">${p.corps()}
    ${rangeePartage()}
    </article>
  </section>`;
}

// Les boîtes du hub (25 nov. 2026, sur le modèle des sites Agent) : image en haut avec son
// étiquette, mot-clic, titre, résumé (la description) et date. Image dans a-la-une/images/<slug>.webp
// (ou .jpg / .png) ; sans image, un bloc de couleur prend sa place.
const BOITES = {
  'serment-des-elus-municipaux': { etiquette: deux('Municipal', 'Municipal'), tag: '#serment', fond: '#1c1c1c', rond: '#0E4FC1' },
  'conseil-sans-serment': { etiquette: deux('Loi électorale', 'Election law'), tag: '#serment', fond: '#6f6c66', rond: '#e0915a' },
  'serment-au-roi-chronologie': { etiquette: deux('Chronologie', 'Timeline'), tag: '#roi', fond: '#1c1c1c', rond: '#c8102e' },
  'qui-jure-quoi': { etiquette: deux('Comparatif', 'Comparison'), tag: '#roi', fond: '#0E4FC1', rond: '#f4c542' },
};
const NOUVEAU_JOURS = 21;
const MAJ_ISO = '2026-11-27';

function imageDe(slug) {
  for (const ext of ['webp', 'jpg', 'png']) if (existsSync(`${DOSSIER}/images/${slug}.${ext}`)) return `/${DOSSIER}/images/${slug}.${ext}`;
  return null;
}

function boite(p) {
  const b = BOITES[p.slug] || { etiquette: deux('À la une', 'Featured'), tag: '#alaune', fond: '#1c1c1c', rond: '#0E4FC1' };
  const img = imageDe(p.slug);
  const nouveau = (Date.now() - Date.parse(MAJ_ISO)) / 864e5 < NOUVEAU_JOURS;
  const titreCourt = p.titre.replace(/ — DossierQuébec$/, '');
  return `      <li class="une-boite">
        <a class="une-boite-lien" href="/${DOSSIER}/${p.slug}">
          <div class="une-boite-visuel" style="--fond:${b.fond}; --rond:${b.rond}">
            ${img ? `<img src="${img}" alt="" loading="lazy" width="1200" height="630">` : ''}
            ${nouveau ? `<span class="une-boite-nouveau">${deux('Nouveau', 'New')}</span>` : ''}
            <span class="une-boite-etiquette">${b.etiquette}</span>
          </div>
          <div class="une-boite-corps">
            <span class="une-boite-tag">${b.tag}</span>
            <h2 class="une-boite-titre">${deux(esc(titreCourt), esc(p.titreEn.replace(/ — DossierQuébec$/, '')))}</h2>
            <p class="une-boite-resume">${deux(esc(p.desc), '')}</p>
            <p class="une-boite-date">${deux(MAJ.fr, MAJ.en)}</p>
          </div>
        </a>
      </li>`;
}

// La 5e boîte (25 nov. 2026) : le jugement n'est pas publié, alors on le confie aux bénévoles.
// Elle mène à /benevoles. On n'affirme rien sur le jugement, sauf qu'il n'est pas publié (vérifiable).
function boiteBenevoles() {
  const img = imageDe('jugement-cour-superieure');
  return `      <li class="une-boite">
        <a class="une-boite-lien" href="/benevoles">
          <div class="une-boite-visuel" style="--fond:#1c1c1c; --rond:#c64a00">
            ${img ? `<img src="${img}" alt="" loading="lazy" width="1200" height="630">` : ''}
            <span class="une-boite-etiquette">${deux('Bénévoles', 'Volunteers')}</span>
          </div>
          <div class="une-boite-corps">
            <span class="une-boite-tag">#benevoles</span>
            <h2 class="une-boite-titre">${deux('Le jugement de la Cour supérieure : à vous de jouer', 'The Superior Court ruling: your turn')}</h2>
            <p class="une-boite-resume">${deux('Le jugement n’est pas publié sur CanLII ni sur SOQUIJ. Vous le voyez passer? Signalez-le sur r/DossierCanada avec le lien officiel. Nous l’expliquons et votre nom figure dans l’article.', 'The ruling is not published on CanLII or SOQUIJ. Seen it? Flag it on r/DossierCanada with the official link. We explain it and your name appears in the article.')}</p>
            <p class="une-boite-date">${deux(MAJ.fr, MAJ.en)}</p>
          </div>
        </a>
      </li>`;
}

function sectionHub() {
  const cartes = PAGES.map(boite).join('\n') + '\n' + boiteBenevoles();
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
    <ol class="une-boites">
${cartes}
    </ol>
${avenir ? `    <ol class="regles-liste">\n${avenir}\n    </ol>` : ''}
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
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.titre.replace(/ — DossierQuébec$/, ''), description: p.desc, inLanguage: 'fr-CA', dateModified: '2026-11-27', url, publisher: { '@type': 'Organization', name: 'DossierQuébec', url: SITE } }, null, 2);
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
    if (imageDe(p.slug)) {
      h = h.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${SITE}${imageDe(p.slug)}">`)
        .replace(/<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="1536">')
        .replace(/<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="1024">')
        .replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${SITE}${imageDe(p.slug)}">`);
    }
    if (/<meta name="robots" content="[^"]*noindex/.test(h)) throw new Error(`build-a-la-une : ${p.slug} porte un noindex alors que la rubrique est publiée`);
    if ((h.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`build-a-la-une : ${p.slug} n'a pas exactement un <h1>`);
    writeFileSync(`${DOSSIER}/${p.slug}.html`, h, 'utf8');
  }
  // Au sitemap, à la suite des pages du site (build-section-pages.js vient de l'écrire).
  const plan = readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n');
  const entrees = PAGES.map((p) => `  <url>\n    <loc>${SITE}/${DOSSIER}/${p.slug}</loc>\n    <lastmod>${MAJ_ISO}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`).filter((e) => !plan.includes(e.split('\n')[1])).join('\n');
  const nouveau = entrees ? plan.replace(/\n<\/urlset>/, `\n${entrees}\n</urlset>`) : plan;
  if (nouveau !== plan) writeFileSync('sitemap.xml', nouveau, 'utf8');
  console.log(`✓ À la une : le hub et ${PAGES.length} page(s) (/${DOSSIER}/…), publiées et au sitemap.`);
}

// Lancé seul : node scripts/build-a-la-une.js
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-a-la-une.js')) construireALaUne();
