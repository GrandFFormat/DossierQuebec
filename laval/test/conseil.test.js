// Le conseil — élus, districts, présences — hors ligne, sur des extraits au gabarit de la
// Ville : des cartes et une fiche de la page des élus (capture du 17 septembre 2026), l'en-tête
// d'un procès-verbal du comité exécutif, deux polygones, quelques lignes du jeu des présences.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parserListe, parserProfil, fonctionDepuisAlt, lireDistrict, normaliserParti, enteteComite, rolesDepuisEntete, assembler, decoderEntites, texteBrut } from '../scrapers/elus.js';
import { douglasPeucker, arrondir, comparerSources, construire } from '../scrapers/districts.js';
import { normaliserStatut, normaliserType, normaliserHeure, nomPresence, normaliserLigne, compilerAnnee } from '../scrapers/presences.js';

// ---------- les élus ----------

const LISTE = `<section class="listing-wrapper container">
  <div class="listing--municipal-councilor">
<article class="municipal-councilor-item">
  <div class="municipal-councilor-item__img">
    <picture class="attachment-medium-large size-medium-large wp-post-image" decoding="async">
<source type="image/webp" data-lazy-srcset="https://www.laval.ca/wp-content/uploads/2025/12/stephane-boyer-609x350-1.jpg.webp 609w" sizes="(min-width:600px) 500px">
<img width="609" height="350" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20609%20350'%3E%3C/svg%3E" alt="Portrait du maire Stéphane Boyer" data-lazy-src="https://www.laval.ca/wp-content/uploads/2025/12/stephane-boyer-609x350-1.jpg">
</picture>
  </div>
  <div class="municipal-councilor-item__info">
    <h3 class="municipal-councilor-item__title">Stéphane Boyer,
              Maire de Laval          </h3>
                <a href="https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/stephane-boyer/" class="municipal-councilor-item__link">Voir son profil</a>
      </div>
</article>

<article class="municipal-councilor-item">
  <div class="municipal-councilor-item__img">
    <picture>
<img width="609" height="350" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="Portrait de la conseillère municipale Cecilia Macedo" data-lazy-src="https://www.laval.ca/wp-content/uploads/2025/12/cecilia-macedo-609x350-1.jpg">
</picture>
  </div>
  <div class="municipal-councilor-item__info">
    <h3 class="municipal-councilor-item__title">Cecilia Macedo,
              District 05 – Marigot&nbsp;         </h3>
              <a href="mailto:c.macedo@laval.ca" class="municipal-councilor-item__email">c.macedo@laval.ca</a>
                    <span class="municipal-councilor-item__phone">514 944-0020</span>
        <a href="https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/cecilia-macedo/" class="municipal-councilor-item__link">Voir son profil</a>
      </div>
</article>

<article class="municipal-councilor-item">
  <div class="municipal-councilor-item__img">
    <picture>
<img width="609" height="350" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="Portrait du conseiller municipal David De Cotis" data-lazy-src="https://www.laval.ca/wp-content/uploads/2025/12/david-de-cotis-609x350-1.jpg">
</picture>
  </div>
  <div class="municipal-councilor-item__info">
    <h3 class="municipal-councilor-item__title">David De Cotis,
              District 09 – Saint-Bruno          </h3>
              <a href="mailto:d.decotis@laval.ca" class="municipal-councilor-item__email">d.decotis@laval.ca</a>
                    <span class="municipal-councilor-item__phone">514 467-1712</span>
        <a href="https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/david-de-cotis/" class="municipal-councilor-item__link">Voir son profil</a>
      </div>
</article>
  </div>
</section>`;

const PROFIL_MACEDO = `<main class="main">
<div class="page-header-1__image-wrapper"><picture>
<img width="609" height="350" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="Portrait de la conseillère municipale Cecilia Macedo" data-lazy-src="https://www.laval.ca/wp-content/uploads/2025/12/cecilia-macedo-609x350-1.jpg">
</picture></div>
<div class="entry-content"> <section class="sticky-section-group aligndefault"> <div class="sticky-section-main">
<h2 class="wp-block-heading">District 05 – Marigot&nbsp;</h2>
<h4 class="wp-block-heading">Parti politique : Mouvement lavallois</h4>
<p class="wp-block-paragraph">Savez-vous ce qui a poussé votre conseillère municipale vers cet engagement si important dans votre vie quotidienne?</p>
<h3 class="wp-block-heading">Découvrez qui est Cecilia Macedo</h3>
<p class="wp-block-paragraph">Cecilia Macedo, d’origine péruvienne, s’est établie à Laval il y a plus de 30&nbsp;ans.&nbsp;</p>
<p class="wp-block-paragraph">Un second paragraphe qui ne doit pas entrer dans la biographie courte.</p>
</div>
<div class="sidebar-municipal-councilor">
 <span class="sidebar-municipal-councilor__name">Cecilia Macedo</span>
 <p> <span class="sidebar-municipal-councilor__district-name">District 05 – Marigot</span><br>
 <span class="sidebar-municipal-councilor__district-population"> 12 499 habitants </span><br>
 <a href="/cdn-cgi/l/email-protection#abc" class="sidebar-municipal-councilor__email"><span class="__cf_email__">[email&nbsp;protected]</span></a><br>
 <a href="tel:+15149440020" class="sidebar-municipal-councilor__phone">514 944-0020</a> </p>
</div></section></div></main>`;

const PROFIL_MAIRE = `<main class="main">
<img alt="Portrait du maire Stéphane Boyer" data-lazy-src="https://www.laval.ca/wp-content/uploads/2025/12/stephane-boyer-609x350-1.jpg">
<p class="is-style-default wp-block-paragraph">Apprenez-en plus sur le maire de Laval.</p>
<h2 class="wp-block-heading">Découvrez qui est Stéphane Boyer</h2>
<p class="wp-block-paragraph">L’affection de Stéphane Boyer pour sa ville natale…</p>
</main>`;

const ENTETE_CE = `Volume 822
Page 295
PROCÈS-VERBAL D’UNE SÉANCE PUBLIQUE DU COMITÉ
EXÉCUTIF DE LA VILLE DE LAVAL tenue le mercredi 9
septembre 2026 à 9 h en la salle du conseil de l’hôtel de ville, 3131,
boulevard Saint-Martin Ouest, salle 120, Ville de Laval, à laquelle
sont présents:
MM. Ray Khalil, vice-président du comité exécutif, et Nicholas
Borne ainsi que Mmes Christine Poirier et Flavia Alexandra Novac,
sous la présidence de M. Stéphane Boyer, maire et président du
comité exécutif, formant la totalité des membres du comité exécutif;
sont aussi présents:
Mme Scarlett Van Blaeren, directrice générale adjointe,
Me Marie-Christine Lefebvre, greffière.
CE-20260909-2024 VENTE - JOHANNE LEFRANÇOIS
`;

// Le maire absent : le vice-président préside, et « vice- président » est coupé par le PDF.
const ENTETE_CE_SANS_MAIRE = `sont présents:
M. Nicholas Borne ainsi que Mmes Christine Poirier et Flavia Alexandra Novac,
sous la présidence de M. Ray Khalil, vice- président du comité exécutif, formant quorum des membres du comité exécutif;
le conseiller Stéphane Boyer est absent;
sont aussi présents:
`;

const MEMBRES = ['Stéphane Boyer', 'Ray Khalil', 'Nicholas Borne', 'Christine Poirier', 'Flavia Alexandra Novac', 'Cecilia Macedo', 'David De Cotis'].map((nomComplet) => ({ nomComplet, roles: [] }));

test('texteBrut / decoderEntites : balises, entités nommées et numériques, insécables', () => {
  assert.equal(texteBrut('<p>Il y a 30&nbsp;ans&nbsp;: l&rsquo;&eacute;lue &#8217; &#x2013; fin</p>'), 'Il y a 30 ans : l’élue ’ – fin');
  assert.equal(decoderEntites('&amp;&lt;&gt;&quot;'), '&<>"');
});

test('fonctionDepuisAlt : le genre vient de l’alt de la photo, jamais deviné', () => {
  assert.equal(fonctionDepuisAlt('Portrait du maire Stéphane Boyer'), 'Maire');
  assert.equal(fonctionDepuisAlt('Portrait de la conseillère municipale Isabelle Piché'), 'Conseillère municipale');
  assert.equal(fonctionDepuisAlt('Portrait du conseiller municipal Martin Vaillancourt'), 'Conseiller municipal');
  assert.equal(fonctionDepuisAlt('Isabelle Piché'), null);
  assert.equal(fonctionDepuisAlt(''), null);
});

test('lireDistrict : « District 05 – Marigot », tirets et insécable', () => {
  assert.deepEqual(lireDistrict('District 05 – Marigot&nbsp;'), { numero: 5, nom: 'Marigot' });
  assert.deepEqual(lireDistrict('District 13 - L’Abord-à-Plouffe'), { numero: 13, nom: 'L’Abord-à-Plouffe' });
  assert.deepEqual(lireDistrict('District 22 — Fabreville-Sud'), { numero: 22, nom: 'Fabreville-Sud' });
  assert.equal(lireDistrict('Maire de Laval'), null);
});

test('normaliserParti : la casse de « Mouvement lavallois » est unifiée, le reste tel quel', () => {
  assert.equal(normaliserParti('Mouvement Lavallois&nbsp;'), 'Mouvement lavallois');
  assert.equal(normaliserParti('Mouvement lavallois'), 'Mouvement lavallois');
  assert.equal(normaliserParti('Action Laval'), 'Action Laval');
  assert.equal(normaliserParti('Indépendante'), 'Indépendante');
  assert.equal(normaliserParti(''), null);
});

test('parserListe : une carte par personne — nom, district, courriel, téléphone, profil, photo différée', () => {
  const l = parserListe(LISTE);
  assert.equal(l.length, 3);
  assert.equal(l[0].nomComplet, 'Stéphane Boyer');
  assert.equal(l[0].fonction, 'Maire');
  assert.equal(l[0].districtNumero, null);
  assert.equal(l[0].courriel, null);
  assert.equal(l[0].photo, 'https://www.laval.ca/wp-content/uploads/2025/12/stephane-boyer-609x350-1.jpg');
  assert.equal(l[1].nomComplet, 'Cecilia Macedo');
  assert.equal(l[1].fonction, 'Conseillère municipale');
  assert.equal(l[1].districtNumero, 5);
  assert.equal(l[1].district, 'Marigot');
  assert.equal(l[1].courriel, 'c.macedo@laval.ca');
  assert.equal(l[1].telephone, '514 944-0020');
  assert.equal(l[1].profil, 'https://www.laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/cecilia-macedo/');
  assert.equal(l[2].fonction, 'Conseiller municipal');
  assert.equal(l[2].districtNumero, 9);
});

test('parserProfil : district, parti, habitants, biographie courte, téléphone ; le maire sans district ni parti', () => {
  const p = parserProfil(PROFIL_MACEDO);
  assert.equal(p.districtNumero, 5);
  assert.equal(p.district, 'Marigot');
  assert.equal(p.parti, 'Mouvement lavallois');
  assert.equal(p.habitants, 12499);
  assert.equal(p.biographie, 'Cecilia Macedo, d’origine péruvienne, s’est établie à Laval il y a plus de 30 ans.');
  assert.equal(p.telephone, '514 944-0020');
  assert.equal(p.fonction, 'Conseillère municipale');
  const m = parserProfil(PROFIL_MAIRE);
  assert.equal(m.districtNumero, null);
  assert.equal(m.parti, null);
  assert.equal(m.habitants, null);
  assert.equal(m.fonction, 'Maire');
});

test('enteteComite : de « sont présents: » à « formant … », totalité ou quorum', () => {
  const e = enteteComite(ENTETE_CE);
  assert.equal(e.totalite, true);
  assert.match(e.passage, /^MM\. Ray Khalil, vice-président du comité exécutif, et Nicholas Borne/);
  assert.match(e.passage, /maire et président du comité exécutif$/);
  const q = enteteComite(ENTETE_CE_SANS_MAIRE);
  assert.equal(q.totalite, false);
  assert.match(q.passage, /Ray Khalil, vice-président/);
  assert.doesNotMatch(q.passage, /est absent/);
  assert.equal(enteteComite('CM-20260901-645 ADOPTION'), null);
});

test('rolesDepuisEntete : président, vice-président, membres — seuls les élus connus', () => {
  const { roles, inconnus } = rolesDepuisEntete(enteteComite(ENTETE_CE).passage, MEMBRES);
  assert.equal(roles.get('stephane-boyer'), 'Président du comité exécutif');
  assert.equal(roles.get('ray-khalil'), 'Vice-président du comité exécutif');
  assert.equal(roles.get('nicholas-borne'), 'Membre du comité exécutif');
  assert.equal(roles.get('christine-poirier'), 'Membre du comité exécutif');
  assert.equal(roles.get('flavia-alexandra-novac'), 'Membre du comité exécutif');
  assert.equal(roles.has('cecilia-macedo'), false);
  assert.deepEqual(inconnus, []);
  // Le maire absent : pas de rôle pour lui ce jour-là, et rien d'inventé.
  const sans = rolesDepuisEntete(enteteComite(ENTETE_CE_SANS_MAIRE).passage, MEMBRES);
  assert.equal(sans.roles.has('stephane-boyer'), false);
  assert.equal(sans.roles.get('ray-khalil'), 'Vice-président du comité exécutif');
  assert.equal(sans.roles.size, 4);
});

test('assembler : liste + fiches + en-tête -> membres au contrat, partis, rôles, avertissements', () => {
  const liste = parserListe(LISTE);
  const profils = new Map([[liste[1].profil, PROFIL_MACEDO], [liste[0].profil, PROFIL_MAIRE]]);
  const entete = { ...enteteComite(ENTETE_CE), seanceId: 'CE-20260909-PUB-09h00', date: '2026-09-09', url: 'https://exemple/CE.pdf' };
  const { membres, partis, rolesSource, avertissements } = assembler(liste, profils, { entete });
  assert.equal(membres.length, 3);
  const maire = membres[0];
  assert.equal(maire.prenom, 'Stéphane');
  assert.equal(maire.nom, 'Boyer');
  assert.equal(maire.fonction, 'Maire');
  assert.equal(maire.districtNumero, null);
  assert.equal(maire.parti, null);
  assert.deepEqual(maire.roles, ['Président du comité exécutif']);
  assert.equal(maire.siegeAuConseilMunicipal, true);
  assert.equal(maire.arrondissement, null);
  assert.equal(maire.formulaireCourriel, null);
  const macedo = membres[1];
  assert.equal(macedo.parti, 'Mouvement lavallois');
  assert.equal(macedo.habitants, 12499);
  assert.equal(macedo.districtNumero, 5);
  assert.deepEqual(macedo.roles, []);
  assert.deepEqual(partis, [{ nom: 'Mouvement lavallois', n: 1 }]);
  assert.equal(rolesSource.seanceId, 'CE-20260909-PUB-09h00');
  assert.equal(rolesSource.compositionComplete, true);
  // Trois élus seulement dans cette liste d'essai : un seul rôle nommé, et les quatre autres
  // noms de l'en-tête sont signalés comme non reconnus, pas inventés.
  assert.equal(rolesSource.membresNommes, 1);
  assert.ok(avertissements.some((a) => /noms non reconnus « Ray Khalil », « Nicholas Borne », « Christine Poirier », « Flavia Alexandra Novac »/.test(a)));
  // La fiche de David De Cotis manque : dit, pas inventé.
  assert.ok(avertissements.some((a) => /David De Cotis : fiche non lue/.test(a)));
  assert.ok(avertissements.some((a) => /David De Cotis : parti non trouvé/.test(a)));
  assert.equal(membres[2].parti, null);
});

// ---------- les districts ----------

test('douglasPeucker : garde les extrémités, efface les points alignés, respecte la tolérance', () => {
  const ligne = [[-73.7, 45.5], [-73.69, 45.5], [-73.68, 45.5], [-73.67, 45.5]];
  assert.deepEqual(douglasPeucker(ligne, 0.00006), [[-73.7, 45.5], [-73.67, 45.5]]);
  const coude = [[-73.7, 45.5], [-73.69, 45.51], [-73.68, 45.5]];
  assert.deepEqual(douglasPeucker(coude, 0.00006), coude);
  assert.deepEqual(arrondir([[-73.123456789, 45.987654321]]), [[-73.12346, 45.98765]]);
});

test('comparerSources : les écarts GeoJSON / page des élus sont consignés, pas écrasés', () => {
  const props = { NOM: 'Saint-Bruno', NUMERO: '9', CONSEILLER: 'Davis De Cotis', TEL_CELL: '514 467-1712', COURRIEL: 'd.decotis@laval.ca' };
  const elu = { nomComplet: 'David De Cotis', district: 'Saint-Bruno', districtNumero: 9, telephone: '514 467-1712', courriel: 'd.decotis@laval.ca' };
  const ecarts = comparerSources(props, elu);
  assert.equal(ecarts.length, 1);
  assert.match(ecarts[0], /« Davis De Cotis » dans le GeoJSON, « David De Cotis » sur la page des élus/);
  // Téléphone différent (chiffres), courriel différent, nom de district différent.
  const brunet = comparerSources({ NOM: 'Duvernay', NUMERO: '3', CONSEILLER: 'Anick Brunet', TEL_CELL: '514 827-3093', COURRIEL: 'an.brunet@laval.ca' }, { nomComplet: 'Anick Brunet', district: 'Duvernay', telephone: '450 341-3093', courriel: 'an.brunet@laval.ca' });
  assert.equal(brunet.length, 1);
  assert.match(brunet[0], /téléphone « 514 827-3093 » dans le GeoJSON, « 450 341-3093 »/);
  // Un retour de ligne parasite dans le GeoJSON n'est pas un écart ; un poste en plus, oui.
  assert.deepEqual(comparerSources({ NOM: 'Renaud-Coursol', NUMERO: '7', CONSEILLER: 'Seta Topouzian', TEL_CELL: '514 862-1402\n', COURRIEL: 's.topouzian@laval.ca' }, { nomComplet: 'Seta Topouzian', district: 'Renaud-Coursol', telephone: '514 862-1402', courriel: 's.topouzian@laval.ca' }), []);
  assert.equal(comparerSources({ NOM: 'Laval-les-Îles', NUMERO: '17', CONSEILLER: 'Nicholas Borne', TEL_CELL: '450 978-6888 #4126', COURRIEL: 'n.borne@laval.ca' }, { nomComplet: 'Nicholas Borne', district: 'Laval-les-Îles', telephone: '450 978-6888', courriel: 'n.borne@laval.ca' }).length, 1);
  assert.match(comparerSources(props, null)[0], /aucun élu de ce numéro/);
});

test('construire : jointure par numéro, contrat, cadre, écarts', () => {
  const geo = {
    features: [
      { properties: { NOM: 'Marigot', NUMERO: '5', CONSEILLER: 'Cecilia Macedo', TEL_CELL: '514 944-0020', COURRIEL: 'c.macedo@laval.ca' }, geometry: { type: 'Polygon', coordinates: [[[-73.71, 45.56], [-73.7, 45.56], [-73.7, 45.57], [-73.705, 45.57], [-73.71, 45.57], [-73.71, 45.56]]] } },
      { properties: { NOM: 'Saint-Bruno', NUMERO: '9', CONSEILLER: 'Davis De Cotis', TEL_CELL: '514 467-1712', COURRIEL: 'd.decotis@laval.ca' }, geometry: { type: 'MultiPolygon', coordinates: [[[[-73.72, 45.62], [-73.71, 45.62], [-73.71, 45.63], [-73.72, 45.63], [-73.72, 45.62]]]] } },
    ],
  };
  const elus = [
    { nomComplet: 'Cecilia Macedo', district: 'Marigot', districtNumero: 5, parti: 'Mouvement lavallois', telephone: '514 944-0020', courriel: 'c.macedo@laval.ca', photo: 'https://exemple/macedo.jpg', roles: [] },
    { nomComplet: 'David De Cotis', district: 'Saint-Bruno', districtNumero: 9, parti: 'Action Laval', telephone: '514 467-1712', courriel: 'd.decotis@laval.ca', photo: null, roles: [] },
    { nomComplet: 'Stéphane Boyer', district: null, districtNumero: null, parti: null, roles: ['Président du comité exécutif'] },
  ];
  const { districts, ecarts, cadre } = construire(geo, elus, { tolerance: 0.00006 });
  assert.equal(districts.length, 2);
  assert.equal(districts[0].numero, 5);
  assert.equal(districts[0].conseiller, 'Cecilia Macedo');
  assert.equal(districts[0].parti, 'Mouvement lavallois');
  assert.equal(districts[0].courriel, 'c.macedo@laval.ca');
  assert.equal(districts[0].arrondissement, null);
  assert.equal(districts[0].formulaireCourriel, null);
  // Le point aligné [-73.705, 45.57] disparaît ; l'anneau reste fermé.
  assert.deepEqual(districts[0].anneaux, [[[-73.71, 45.56], [-73.7, 45.56], [-73.7, 45.57], [-73.71, 45.57], [-73.71, 45.56]]]);
  assert.equal(districts[1].conseiller, 'David De Cotis');
  assert.equal(ecarts.length, 1);
  assert.match(ecarts[0], /Davis De Cotis/);
  assert.deepEqual(cadre, { ouest: -73.72, est: -73.7, sud: 45.56, nord: 45.63 });
});

// ---------- les présences ----------

test('normaliserStatut : la table explicite, et « inconnu » pour le reste', () => {
  for (const v of ['présent', 'present', 'présente', 'presente', 'prsente', 'présnet', 'présete', 'Présent']) assert.equal(normaliserStatut(v), 'present', v);
  for (const v of ['absent', 'absente', 'adsent', 'asbent', 'absent ']) assert.equal(normaliserStatut(v), 'absent', v);
  assert.equal(normaliserStatut('vacant'), 'vacant');
  assert.equal(normaliserStatut('excusé'), 'inconnu');
  assert.equal(normaliserStatut(''), 'inconnu');
  assert.equal(normaliserStatut(undefined), 'inconnu');
});

test('normaliserType : la table, l’espace final, et hors table signalé', () => {
  assert.deepEqual(normaliserType('ordinaire '), { type: 'ordinaire', connu: true });
  assert.deepEqual(normaliserType('ajournement de la suspension'), { type: 'ajournement de la suspension', connu: true });
  assert.deepEqual(normaliserType('Spéciale'), { type: 'spéciale', connu: false });
});

test('normaliserHeure : toutes les graphies du jeu, l’heure impossible gardée mais dite invalide', () => {
  assert.deepEqual(normaliserHeure('18 h 30'), { heure: '18 h 30', valide: true });
  assert.deepEqual(normaliserHeure('16 h '), { heure: '16 h', valide: true });
  assert.deepEqual(normaliserHeure('16 h 00'), { heure: '16 h', valide: true });
  assert.deepEqual(normaliserHeure('19h'), { heure: '19 h', valide: true });
  assert.deepEqual(normaliserHeure('16h30'), { heure: '16 h 30', valide: true });
  assert.deepEqual(normaliserHeure('10 H 14'), { heure: '10 h 14', valide: true });
  assert.deepEqual(normaliserHeure('9 h 02'), { heure: '9 h 02', valide: true });
  assert.deepEqual(normaliserHeure('38 h 30'), { heure: '38 h 30', valide: false });
  assert.deepEqual(normaliserHeure(undefined), { heure: null, valide: false });
  assert.deepEqual(normaliserHeure('midi'), { heure: 'midi', valide: false });
});

test('nomPresence : « DIB Aline » -> « Aline Dib », le reste intact', () => {
  assert.equal(nomPresence('DIB Aline'), 'Aline Dib');
  assert.equal(nomPresence('DE COTIS David'), 'David De Cotis');
  assert.equal(nomPresence('FREDERIC-GAUTHIER Jocelyne'), 'Jocelyne Frederic-Gauthier');
  assert.equal(nomPresence('Aline Dib'), 'Aline Dib');
  assert.equal(nomPresence('Flavia Alexandra Novac'), 'Flavia Alexandra Novac');
  assert.equal(nomPresence('Mohammed Bâ'), 'Mohammed Bâ');
  assert.equal(nomPresence('District 19'), 'District 19');
});

const LIGNES = [
  { 'DATE_SÉANCE': '2025-11-18', HEURE: '18 h 30', 'TYPE-SÉANCE': 'ordinaire', NOM: 'Stéphane Boyer', 'ABSENT/PRÉSENT': 'présent' },
  { 'DATE_SÉANCE': '2025-11-18', HEURE: '18 h 30', 'TYPE-SÉANCE': 'ordinaire', NOM: 'Cecilia Macedo', 'ABSENT/PRÉSENT': 'présente' },
  { 'DATE_SÉANCE': '2025-11-18', HEURE: '18 h 30', 'TYPE-SÉANCE': 'ordinaire', NOM: 'Mohammed Bâ', 'ABSENT/PRÉSENT': 'présnet' },
  { 'DATE_SÉANCE': '2025-11-10', HEURE: '16 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Stéphane Boyer', 'ABSENT/PRÉSENT': 'présent' },
  { 'DATE_SÉANCE': '2025-11-10', HEURE: '16 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Cecilia Macedo', 'ABSENT/PRÉSENT': 'absent' },
  { 'DATE_SÉANCE': '2025-11-10', HEURE: '16 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Mohammed Bâ', 'ABSENT/PRÉSENT': 'en retard' },
  { 'DATE_SÉANCE': '2025-05-20', HEURE: '17 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Stéphane Boyer', 'ABSENT/PRÉSENT': 'présent' },
  { 'DATE_SÉANCE': '2025-05-20', HEURE: '38 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Cecilia Macedo', 'ABSENT/PRÉSENT': 'présent' },
  { 'DATE_SÉANCE': '2025-05-20', HEURE: '39 h 30', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'Sandra Desmeules', 'ABSENT/PRÉSENT': 'présent' },
  { 'DATE_SÉANCE': '2024-12-04', HEURE: '16 h 31', 'TYPE-SÉANCE': 'extraordinaire', NOM: 'BOYER Stephane', 'ABSENT/PRÉSENT': 'present' },
  { 'DATE_SÉANCE': '2019-11-05', HEURE: '19 h 02', 'TYPE-SÉANCE': 'ordinaire', NOM: 'District 19', 'ABSENT/PRÉSENT': 'vacant' },
];
const ELUS = [
  { nomComplet: 'Stéphane Boyer', fonction: 'Maire', districtNumero: null },
  { nomComplet: 'Cecilia Macedo', fonction: 'Conseillère municipale', districtNumero: 5 },
  { nomComplet: 'Mohamed Bâ', fonction: 'Conseiller municipal', districtNumero: 11 },
];

test('normaliserLigne : clés accentuées du jeu, statut, heure, type, nom remis dans l’ordre', () => {
  const l = normaliserLigne(LIGNES[9]);
  assert.equal(l.date, '2024-12-04');
  assert.equal(l.annee, '2024');
  assert.equal(l.heure, '16 h 31');
  assert.equal(l.type, 'extraordinaire');
  assert.equal(l.nom, 'Stephane Boyer');
  assert.equal(l.cle, 'stephane-boyer');
  assert.equal(l.statut, 'present');
  assert.equal(l.statutBrut, 'present');
  // Les mêmes colonnes sans accents passent aussi.
  const sans = normaliserLigne({ DATE_SEANCE: '2025-01-14', HEURE: '18 h 30', 'TYPE-SEANCE': 'ordinaire', NOM: 'Aline Dib', 'ABSENT/PRESENT': 'absente' });
  assert.equal(sans.date, '2025-01-14');
  assert.equal(sans.statut, 'absent');
});

test('compilerAnnee : séances, membres joints par clé, inconnu compté à part, anomalies signalées', () => {
  const lignes = LIGNES.map(normaliserLigne);
  const b = compilerAnnee(lignes, 2025, ELUS, { derniereSeanceDuJeu: '2025-11-18' });
  assert.equal(b.annee, '2025');
  assert.equal(b.nombreLignes, 9);
  // 18 nov., 10 nov., et les trois « séances » du 20 mai telles que le jeu les écrit.
  assert.equal(b.nombreSeances, 5);
  assert.equal(b.premiereSeance, '2025-05-20');
  assert.equal(b.derniereSeance, '2025-11-18');
  const boyer = b.membres.find((m) => m.cle === 'stephane-boyer');
  assert.equal(boyer.presences, 3);
  assert.equal(boyer.absences, 0);
  assert.equal(boyer.seances, 3);
  assert.equal(boyer.fonction, 'Maire');
  assert.equal(boyer.surLaPageDesElus, true);
  const macedo = b.membres.find((m) => m.cle === 'cecilia-macedo');
  assert.equal(macedo.presences, 2);
  assert.equal(macedo.absences, 1);
  assert.equal(macedo.districtNumero, 5);
  // « Mohammed Bâ » ne rejoint pas « Mohamed Bâ » : pas de district, et c'est dit.
  const ba = b.membres.find((m) => m.cle === 'mohammed-ba');
  assert.equal(ba.districtNumero, null);
  assert.equal(ba.surLaPageDesElus, false);
  assert.equal(ba.presences, 1);
  assert.equal(ba.inconnu, 1);
  assert.ok(b.avertissements.some((a) => /Noms absents de la page des élus.*Mohammed Bâ/.test(a)));
  assert.ok(b.avertissements.some((a) => /statut non reconnu.*« en retard »/.test(a)));
  assert.ok(b.avertissements.some((a) => /2025-05-20 : 3 séance\(s\).*2 invalide\(s\)/.test(a)));
  assert.equal(b.valeursBrutes.statuts['présnet'], 1);
  assert.equal(b.valeursBrutes.heures['38 h 30'], 1);
  // Une année sans ligne le dit.
  const vide = compilerAnnee(lignes, 2026, ELUS, { derniereSeanceDuJeu: '2025-11-18' });
  assert.equal(vide.nombreSeances, 0);
  assert.equal(vide.membres.length, 0);
  assert.match(vide.avertissements[0], /aucune séance de 2026 \(dernière séance couverte : 2025-11-18\)/);
  // Le siège vacant de 2019 : compté « vacant », jamais présent ni absent.
  const v = compilerAnnee(lignes, 2019, ELUS);
  assert.equal(v.membres[0].vacant, 1);
  assert.equal(v.membres[0].presences + v.membres[0].absences, 0);
});
