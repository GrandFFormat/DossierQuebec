// Tests hors ligne des lecteurs : procès-verbal, ordre du jour, CSV, thèmes, séances.
// Les textes sont synthétiques mais suivent le gabarit observé dans les procès-verbaux
// publiés par la Ville. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperResolutions, parserVote, nettoyerNoms, parserOrdreDuJour, extraireDissidences, extraireResultat } from '../lib/pv.js';
import { colonnes, texteDeLigne } from '../lib/pdf.js';
import { parserCsv, colonne } from '../lib/csv.js';
import { classer } from '../lib/themes.js';
import { urlDocument, candidatsDocument, heureFichier, idSeance } from '../lib/mtl.js';
import { codeInstance, lireDate, lireHeure, seancesDepuisHtml, seanceDepuisLigne } from '../scrapers/seances.js';
import { normaliserMembre } from '../scrapers/elus.js';
import { cle } from '../lib/noms.js';

const PV = `Procès-verbal de l'assemblée ordinaire du conseil municipal de la Ville de Montréal du 23 mars 2026
____________________________
CM26 0301
Adopter l'ordre du jour de l'assemblée ordinaire du conseil municipal du 23 mars 2026
Il est proposé par Mme Julie Tremblay
appuyé par M. Pierre Lafond
Et résolu :
d'adopter l'ordre du jour de l'assemblée ordinaire du conseil municipal du 23 mars 2026.
Adopté à l'unanimité.
03.01
____________________________
CM26 0355
Approuver un projet de convention entre la Ville de Montréal et l'organisme Exemple inc. et accorder un soutien financier de 250 000 $
pour l'année 2026
Vu la recommandation du comité exécutif en date du 11 mars 2026 par sa résolution CE26 0412 ;
Il est proposé par Mme Julie Tremblay
appuyé par M. Pierre Lafond
Et résolu :
d'approuver un projet de convention...
__________________
Un débat s'engage.
__________________
Le président du conseil met aux voix la proposition. Un vote enregistré est demandé par M. Jean Vote.
Votent en faveur : Mmes et MM. Martinez Ferrada, Bourque, Côté-Tremblay et Tremblay (4)
Votent contre : Mmes et MM. Alneus, Lafond (2)
Résultat : En faveur : 4
Contre : 2
Le président du conseil déclare la proposition adoptée à la majorité des voix, et il est
RÉSOLU
en conséquence.
20.03 1266245003
____________________________
CM26 0356
Adopter le règlement intitulé « Règlement modifiant le Règlement sur le zonage »
Il est proposé par M. Pierre Lafond
appuyé par Mme Julie Tremblay
Et résolu :
d'adopter le règlement.
Adopté à la majorité des voix.
Dissidences : Mme Alneus
M. Lafond
40.12 1266245010
`;

test('découpe un procès-verbal en résolutions', () => {
  const r = decouperResolutions(PV, { instance: 'CM' });
  assert.equal(r.length, 3);
  assert.equal(r[0].numero, 'CM26 0301');
  assert.equal(r[0].article, '03.01');
  assert.equal(r[0].dossier, null);
  assert.equal(r[0].resultat, "Adoptée à l'unanimité");
  assert.match(r[0].objet, /^Adopter l'ordre du jour/);
  assert.equal(r[1].numero, 'CM26 0355');
  assert.equal(r[1].article, '20.03');
  assert.equal(r[1].dossier, '1266245003');
  assert.equal(r[1].objet, "Approuver un projet de convention entre la Ville de Montréal et l'organisme Exemple inc. et accorder un soutien financier de 250 000 $ pour l'année 2026");
  assert.equal(r[1].resultat, 'Adoptée à la majorité');
  assert.ok(r[1].vote, 'vote enregistré reconnu');
  assert.equal(r[2].dossier, '1266245010');
  assert.deepEqual(r[2].dissidences, ['Alneus', 'Lafond']);
  assert.equal(r[2].vote, null);
});

test('ne prend pas la résolution du comité exécutif citée dans le corps', () => {
  const r = decouperResolutions(PV, { instance: 'CM' });
  assert.ok(!r.some((x) => x.numero === 'CE26 0412'));
});

test('lit un vote enregistré, noms et décompte', () => {
  const v = parserVote(decouperResolutions(PV, { instance: 'CM' })[1].texte);
  assert.deepEqual(v.pour, ['Martinez Ferrada', 'Bourque', 'Côté-Tremblay', 'Tremblay']);
  assert.deepEqual(v.contre, ['Alneus', 'Lafond']);
  assert.equal(v.decomptePour, 4);
  assert.equal(v.decompteContre, 2);
  assert.deepEqual(v.avertissements, []);
  assert.equal(v.texteSourceDegrade, false);
  assert.match(v.demandeParVote, /Jean Vote/);
  assert.equal(v.resultat, 'Adoptée à la majorité');
});

test('signale un écart entre les noms et le décompte, sans corriger', () => {
  const v = parserVote('Votent en faveur : Mmes et MM. A, B (3)\nVotent contre : aucun\nRésultat : En faveur : 3\nContre : 0\nAdopté à la majorité des voix.');
  assert.deepEqual(v.pour, ['A', 'B']);
  assert.deepEqual(v.contre, []);
  assert.equal(v.decompteContre, 0);
  assert.equal(v.avertissements.length, 1);
  assert.match(v.avertissements[0], /2 nom\(s\) extrait\(s\) en faveur, mais le document en déclare 3/);
});

test('gère le singulier et les civilités', () => {
  const { noms } = nettoyerNoms('Mme Alneus et M. Lafond.');
  assert.deepEqual(noms, ['Alneus', 'Lafond']);
  const { noms: n2, declare } = nettoyerNoms('MM. Untel, Machin (2)');
  assert.deepEqual(n2, ['Untel', 'Machin']);
  assert.equal(declare, 2);
});

test('texte dégradé : pas de noms, un avertissement', () => {
  const v = parserVote('Votent en faveur : M m e s e t M M . M a r t i n e z F e r r a d a , B o u r q u e (2)\nVotent contre : M. X (1)');
  assert.equal(v.texteSourceDegrade, true);
  assert.deepEqual(v.pour, []);
});

test('dissidences sur une ou plusieurs lignes', () => {
  assert.deepEqual(extraireDissidences('Adopté à la majorité des voix.\nDissidences : Mme Alneus, M. Lafond\n\n40.12 1266245010'), ['Alneus', 'Lafond']);
  assert.deepEqual(extraireDissidences('Dissidence : M. Lafond\n40.12'), ['Lafond']);
});

test('CSV : guillemets, retours à la ligne, BOM, point-virgule', () => {
  const { colonnes, cles, lignes } = parserCsv('﻿Prénom;Nom;Rôles\nJulie;Tremblay;"Conseillère de la ville; Membre du comité exécutif"\nPierre;"La\nFond";Maire d\'arrondissement\n');
  assert.deepEqual(colonnes, ['Prénom', 'Nom', 'Rôles']);
  assert.deepEqual(cles, ['prenom', 'nom', 'roles']);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0].roles, 'Conseillère de la ville; Membre du comité exécutif');
  assert.equal(lignes[1].nom, 'La\nFond');
  assert.equal(colonne(cles, 'prenom'), 'prenom');
});

test('élus : rôles, fonction et clés de jointure', () => {
  const { cles, lignes } = parserCsv('Prénom,Nom,Genre,Rôles,Responsabilités,Arrondissement,Nom du district,Nom du parti,Courriel\nSoraya,Martinez Ferrada,Madame,Mairesse de la Ville de Montréal,,Ville-Marie,,Ensemble Montréal,x@y.z\nJulie,Tremblay,Madame,"Conseillère de la ville; Membre du comité exécutif","Responsable de l\'habitation",Le Sud-Ouest,Saint-Paul–Émard–Saint-Henri-Ouest,Ensemble Montréal,\nPierre,Lafond,Monsieur,Conseiller d\'arrondissement,,Anjou,Est,Équipe Anjou,\n');
  const m = lignes.map((l) => normaliserMembre(l, cles));
  assert.equal(m[0].fonction, 'Mairesse ou maire de Montréal');
  assert.equal(m[0].siegeAuConseilMunicipal, true);
  assert.equal(m[1].fonction, 'Conseiller de ville');
  assert.deepEqual(m[1].roles, ['Membre du comité exécutif', "Responsable de l'habitation"]);
  assert.equal(m[1].districtCle, cle('Saint-Paul—Émard—Saint-Henri-Ouest'));
  assert.equal(m[2].siegeAuConseilMunicipal, false);
  assert.equal(m[0].formulaireCourriel, 'mailto:x@y.z');
});

test('thèmes : les sujets avant les véhicules', () => {
  assert.equal(classer({ objet: "Accorder un contrat à X pour la réfection de la chaussée de la rue Y" }).theme, 'travaux');
  assert.equal(classer({ objet: "Accorder un soutien financier de 250 000 $ à un organisme" }).theme, 'subventions');
  assert.equal(classer({ objet: "Adopter le règlement modifiant le Règlement sur le zonage" }).theme, 'urbanisme');
  assert.equal(classer({ objet: "Approuver un projet de convention entre la Ville et Exemple inc." }).theme, 'contrats');
  assert.equal(classer({ objet: "Adopter l'ordre du jour de l'assemblée" }).theme, 'procedure');
  assert.equal(classer({ objet: "Déclaration pour souligner le Mois de l'histoire des Noirs" }).theme, 'honneurs');
  assert.equal(classer({ objet: "Prendre acte du dépôt du rapport" }).themeSource, 'objet');
  assert.equal(classer({ objet: "Zzz", unite: 'Service de l\'urbanisme et de la mobilité' }).theme, 'urbanisme');
  assert.equal(classer({ objet: "Zzz" }).themeSource, 'defaut');
});

test('URL des documents de séance', () => {
  assert.equal(urlDocument({ instance: 'CM', genre: 'PV', date: '2026-01-26', heure: '13 h' }), 'https://ville.montreal.qc.ca/documents/Adi_Public/CM/CM_PV_ORDI_2026-01-26_13h00_FR.pdf');
  assert.equal(urlDocument({ instance: 'CM', genre: 'PV', variante: 'EXTRA', date: '2026-01-12', heure: '13:00' }), 'https://ville.montreal.qc.ca/documents/Adi_Public/CM/CM_PV_EXTRA_2026-01-12_13h00_FR.pdf');
  // Les cinq formes d'ordre du jour réellement en usage, quel que soit leur ordre : la
  // Ville en change d'une instance et d'une année à l'autre.
  const odj = candidatsDocument({ instance: 'CE', genre: 'ODJ', variante: 'ORDI', date: '2025-09-17', heure: '09h00' });
  const noms = odj.map((u) => u.split('/').pop());
  for (const attendu of ['CE_ODJ_LPP_ORDI_2025-09-17_09h00_FR.pdf', 'CE_ODJ_LP_ORDI_2025-09-17_09h00_FR.pdf', 'CE_ODJ_ORDI_2025-09-17_09h00_FR.pdf', 'CE_ODJP_ORDI_2025-09-17_09h00_FR.pdf', 'CE_ODJ_ADOPTE_ORDI_2025-09-17_09h00_FR.pdf']) {
    assert.ok(noms.includes(attendu), `forme manquante : ${attendu}`);
  }
  // Celle qui porte les liens vers les pièces publiques passe en premier : c'est la
  // seule qui permette de rattacher un sommaire décisionnel à sa résolution.
  assert.match(noms[0], /_ODJ_LPP_/);
  // Un conseil d'arrondissement se construit pareil, sous son propre répertoire.
  assert.equal(
    urlDocument({ instance: 'CA_Out', genre: 'ODJP', date: '2026-05-05', heure: '19h00' }),
    'https://ville.montreal.qc.ca/documents/Adi_Public/CA_Out/CA_Out_ODJP_ORDI_2026-05-05_19h00_FR.pdf'
  );
  assert.equal(heureFichier('9h'), '09h00');
  assert.equal(idSeance({ instance: 'CG', date: '2026-02-26', heure: '17 h 00' }), 'CG_2026-02-26_17h00');
});

test('calendrier : instance, date, heure, et liens dans une page', () => {
  assert.equal(codeInstance("Séance du conseil d'agglomération"), 'CG');
  assert.equal(codeInstance('Comité exécutif'), 'CE');
  assert.equal(codeInstance('Conseil municipal'), 'CM');
  assert.equal(lireDate('26/01/2026'), '2026-01-26');
  assert.equal(lireDate('2026-01-26T13:00:00'), '2026-01-26');
  assert.equal(lireDate('le lundi 26 janvier 2026'), '2026-01-26');
  assert.equal(lireHeure('2026-01-26T13:00:00'), '13h00');
  assert.equal(lireHeure('9 h 30'), '09h30');
  const { cles, lignes } = parserCsv('Instance,Date,Heure,Type\nConseil municipal,2026-01-26,13:00,Séance ordinaire\nComité exécutif,2026-01-28,,\n');
  const s1 = seanceDepuisLigne(lignes[0], cles);
  assert.equal(s1.id, 'CM_2026-01-26_13h00');
  assert.equal(s1.variante, 'ORDI');
  const s2 = seanceDepuisLigne(lignes[1], cles);
  assert.equal(s2.heure, '09h00');
  assert.equal(s2.heureSupposee, true);
  const html = '<a href="https://ville.montreal.qc.ca/documents/Adi_Public/CM/CM_PV_ORDI_2026-01-26_13h00_FR.pdf">PV</a> <a href="/documents/Adi_Public/CM/CM_ODJ_LPP_ORDI_2026-01-26_13h00_FR.pdf">ODJ</a> <a href="/documents/Adi_Public/CG/CG_PV_EXTRA_2026-02-05_17h00_FR.pdf">x</a>';
  const trouvees = seancesDepuisHtml(html);
  assert.deepEqual(trouvees.map((s) => s.id), ['CM_2026-01-26_13h00', 'CG_2026-02-05_17h00']);
  assert.equal(trouvees[1].variante, 'EXTRA');
});

// ---------- les en-têtes RÉELS des jeux de la Ville (premier lancement, 12 sept. 2026) ----------
import { villeDe } from '../scrapers/agglomeration.js';
import { estArrondissement, cleStricte } from '../lib/noms.js';

test('colonne : la clé exacte gagne sur celle qui contient le fragment', () => {
  const cles = ['appellation', 'prenom', 'nom', 'fonction elective'];
  assert.equal(colonne(cles, 'nom de famille', 'nom'), 'nom');
  assert.equal(colonne(cles, 'prenom'), 'prenom');
  assert.equal(colonne(cles, 'fonction'), 'fonction elective');
});

test('élus 2025 : Appellation, Prénom, Nom, Fonction élective, Fonctions additionnelles, Responsabilités CE…', () => {
  const csv = 'Appellation,Prénom,Nom,Fonction élective,Fonctions additionnelles,Responsabilités CE,Arrondissement,District,Parti,Bureau,Téléphone,Courriel officiel,Historique des changements d\'allégeance,Historique des fonctions terminées\n' +
    'Madame,Soraya,Martinez Ferrada,Mairesse de la Ville de Montréal,Présidente du comité exécutif,"Responsable du développement de l\'Est",Ville-Marie,,Ensemble Montréal,Hôtel de ville,Tél. :,soraya@montreal.ca,,\n' +
    'Madame,Ericka,Alneus,Conseiller(ère) de la Ville,Cheffe de l\'opposition officielle,,Rosemont–La Petite-Patrie,Étienne-Desmarteau,Projet Montréal,,Tél. : 514 872-0000,ericka@montreal.ca,,\n' +
    'Monsieur,Alan,DeSousa,Maire(sse) d\'arrondissement,Membre du comité exécutif,Responsable des finances,Saint-Laurent,,Ensemble Montréal,,,alan@montreal.ca,,\n' +
    'Monsieur,Pierre,Lafond,Conseiller(ère) d\'arrondissement,,,Anjou,Est,Équipe Anjou,,,,,\n';
  const { cles, lignes } = parserCsv(csv);
  const m = lignes.map((l) => normaliserMembre(l, cles));
  assert.equal(m[0].nomComplet, 'Soraya Martinez Ferrada');
  assert.equal(m[0].fonction, 'Mairesse ou maire de Montréal');
  assert.equal(m[0].comiteExecutif, true);
  assert.equal(m[0].telephone, null);
  assert.equal(m[1].nomComplet, 'Ericka Alneus');
  assert.equal(m[1].fonction, 'Conseiller de ville');
  assert.equal(m[1].siegeAuConseilMunicipal, true);
  assert.equal(m[1].telephone, '514 872-0000');
  assert.deepEqual(m[1].roles, ["Cheffe de l'opposition officielle"]);
  assert.equal(m[1].comiteExecutif, false);
  assert.equal(m[2].fonction, "Maire d'arrondissement");
  assert.equal(m[2].comiteExecutif, true);
  assert.deepEqual(m[2].roles, ['Membre du comité exécutif', 'Responsable des finances']);
  assert.equal(m[3].siegeAuConseilMunicipal, false);
  assert.equal(m[0].genre, 'Madame');
});

test('agglomération 2025 : « Arrondissement / Ville liée » tranche entre Montréal et ville liée', () => {
  assert.equal(villeDe('Conseiller(ère) de la Ville', 'Ville-Marie'), 'Montréal');
  assert.equal(villeDe('Conseiller(ère) de la Ville', 'Côte-des-Neiges - Notre-Dame-de-Grâce'), 'Montréal');
  assert.equal(villeDe('Maire(sse)', 'Dorval'), 'Dorval');
  assert.equal(villeDe('Maire(sse)', 'Ville de Mont-Royal'), 'Mont-Royal');
  assert.equal(estArrondissement("L'Ile-Bizard - Sainte-Geneviève"), true);
  assert.equal(estArrondissement('Westmount'), false);
});

test('calendrier 2026 : seance, lien_site_ville, date, heure_debut, heure_fin, lien_video_seance', () => {
  const { cles, lignes } = parserCsv('seance,lien_site_ville,date,heure_debut,heure_fin,lien_video_seance\n' +
    'Conseil municipal,https://montreal.ca/evenements/seance-du-conseil-municipal-102468,2026-01-26,13:00,23:00,\n' +
    "Séance extraordinaire du conseil d'agglomération,,2026-02-05,17:00,,\n" +
    'Comité exécutif,,2026-01-28,09:30,,\n');
  const s = lignes.map((l) => seanceDepuisLigne(l, cles));
  assert.equal(s[0].id, 'CM_2026-01-26_13h00');
  assert.equal(s[0].variante, 'ORDI');
  assert.match(s[0].lien, /montreal\.ca/);
  assert.equal(s[1].id, 'CG_2026-02-05_17h00');
  assert.equal(s[1].variante, 'EXTRA');
  assert.equal(s[2].id, 'CE_2026-01-28_09h30');
  assert.equal(s[2].heureSupposee, false);
});

test('clé stricte : De Lorimier = DeLorimier', () => {
  assert.equal(cleStricte('De Lorimier'), cleStricte('DeLorimier'));
  assert.equal(cleStricte('Saint-Paul–Émard'), cleStricte('Saint-Paul—Émard'));
});

test("ordre du jour de Montréal : article, catégorie, service, dossier, objet — sans hyperlien", () => {
  const lignes = (arr) => arr.map((texte, i) => ({ y: 700 - i * 12, texte }));
  const pages = [{ numero: 2, liens: [], lignes: lignes([
    '20 – Affaires contractuelles',
    "20.001 Contrat d'approvisionnement et de services autres que professionnels",
    'CE Service de police de Montréal , Direction des services organisationnels - 1267026004',
    'Conclure une entente-cadre avec SB joints et peinture inc., pour les services de peintre en bâtiment pour',
    "les besoins du Service de police - Appel d'offres public 26-21327 (7 soumissionnaires)",
    "Compétence d’agglomération : Éléments de la sécurité publique",
    '20.003 Subvention - Contribution financière',
    'CE Service de la diversité et de l\'inclusion sociale , Direction stratégies et programmes -',
    '1268122001',
    'Réaffecter un soutien financier totalisant 69 196 $, pour 2026 et 2027',
    'Page 2',
  ]) }, { numero: 3, liens: [], lignes: lignes(['à différents organismes', '20.004 Subvention - Soutien financier avec convention', 'CG Service de la culture , Direction des sports - 1261204001', 'Accorder un soutien financier de 150 000 $']) }];
  const p = parserOrdreDuJour(pages);
  assert.equal(p.length, 3);
  assert.equal(p[0].article, '20.001');
  assert.equal(p[0].categorie, "Contrat d'approvisionnement et de services autres que professionnels");
  assert.equal(p[0].unite, 'Service de police de Montréal, Direction des services organisationnels');
  assert.equal(p[0].dossier, '1267026004');
  assert.match(p[0].objet, /^Conclure une entente-cadre .* \(7 soumissionnaires\)$/);
  assert.equal(p[1].dossier, '1268122001');
  assert.equal(p[1].objet, 'Réaffecter un soutien financier totalisant 69 196 $, pour 2026 et 2027 à différents organismes');
  assert.equal(p[2].instanceFinale, 'CG');
});

test("comité exécutif : la résolution sans ligne d'objet prend celui de l'ordre du jour", () => {
  const r = decouperResolutions('CE26 1015\nIl est\nRÉSOLU :\n1- de conclure une entente-cadre…\nAdopté à l\'unanimité.\n20.001 1267026004\n', { instance: 'CE' });
  assert.equal(r[0].objet, null);
  assert.equal(r[0].dossier, '1267026004');
  assert.equal(r[0].resultat, "Adoptée à l'unanimité");
});

test('thèmes : la catégorie de la Ville tranche après l\'objet', () => {
  assert.equal(classer({ objet: 'Zzz', categorie: 'Subvention - Contribution financière' }).theme, 'subventions');
  assert.equal(classer({ objet: 'Zzz', categorie: 'Immeuble - Location' }).themeSource, 'categorie');
});

test('votes : « Mesdames et messieurs », « et » en tête, nom coupé par la ligne', () => {
  const { noms, declare } = nettoyerNoms('Mesdames et messieurs Soraya Martinez Ferrada, Pinard, Hénault- Ratelle, V. Doyon et Beauregard (5)');
  assert.deepEqual(noms, ['Soraya Martinez Ferrada', 'Pinard', 'Hénault-Ratelle', 'V. Doyon', 'Beauregard']);
  assert.equal(declare, 5);
});

test("ordre du jour du conseil municipal : le service sur la ligne de l'article, « huis clos » ignoré", () => {
  const lignes = (arr) => arr.map((texte, i) => ({ y: 700 - i * 12, texte }));
  const p = parserOrdreDuJour([{ numero: 1, liens: [], lignes: lignes([
    '20.01 Service du greffe , Direction des affaires juridiques - 1261234001',
    "Approuver un projet d'acte",
    "20.02 L'étude de ce dossier se fera à huis clos",
    'CE Service des finances , Direction du budget - 1261234002',
    'Autoriser une dépense',
  ]) }]);
  assert.equal(p[0].categorie, null);
  assert.equal(p[0].unite, 'Service du greffe, Direction des affaires juridiques');
  assert.equal(p[0].dossier, '1261234001');
  assert.equal(p[0].objet, "Approuver un projet d'acte");
  assert.equal(p[1].categorie, null);
  assert.equal(p[1].unite, 'Service des finances, Direction du budget');
});

test('un vote enregistré tient son résultat de ses décomptes', () => {
  const bloc = 'Amendement adopté à l\'unanimité.\nVotent en faveur : Mmes et MM. A, B (2)\nVotent contre : Mmes et MM. C, D, E (3)\nRésultat : En faveur : 2\nContre : 3\n';
  assert.equal(parserVote(bloc).resultat, 'Rejetée');
  assert.equal(decouperResolutions('CM26 0001\nObjet\n' + bloc + '20.01', { instance: 'CM' })[0].resultat, 'Rejetée');
  assert.equal(parserVote('Votent en faveur : A, B (2)\nVotent contre : aucun\nRésultat : En faveur : 2\nContre : 0').resultat, "Adoptée à l'unanimité");
});

test('votes : la liste s\'arrête au décompte « (N) », le reste de la page est ignoré', () => {
  const v = parserVote(
    'Votent en faveur : Mesdames et messieurs Alneus, Plourde et Beauregard (3)\n' +
    'Votent contre : Mesdames et messieurs Pinard, Hénault- Ratelle et Hénault (3) Ouverture des portes : À l’ouverture des portes, ' +
    'la conseillère Elvira Carhuallanqui déclare que si elle avait été présente au moment du vote elle se serait prononcée en faveur.\n' +
    'Résultat : En faveur : 4\nContre : 3\n'
  );
  assert.deepEqual(v.pour, ['Alneus', 'Plourde', 'Beauregard']);
  assert.deepEqual(v.contre, ['Pinard', 'Hénault-Ratelle', 'Hénault']);
  assert.deepEqual(v.avertissements, []);
  assert.equal(v.notes.length, 1);
  assert.match(v.notes[0], /Décompte final en faveur : 4, liste nominale : 3/);
  assert.equal(v.decomptePour, 4);
  assert.equal(v.resultat, 'Adoptée à la majorité');

  const w = parserVote('Votent en faveur : A, B (2)\nVotent contre : C et D (2) Séance ordinaire du conseil municipal du lundi 23 mars 2026 à 19 h 111\nRésultat : En faveur : 2\nContre : 2');
  assert.deepEqual(w.contre, ['C', 'D']);
  assert.deepEqual(w.avertissements, []);
});

test("résolutions d'arrondissement : le numéro porte celui de l'arrondissement", () => {
  const PV_CA = [
    "PROCÈS-VERBAL de la séance ordinaire du conseil d'arrondissement",
    'CA26 12 0123',
    "Accorder un contrat de déneigement à Les Entreprises Untel inc.",
    '20.01 1267026004',
    "Adopté à l'unanimité.",
    'CA26 12 0124',
    "Approuver la programmation d'événements publics",
    '40.02',
    'Adopté à la majorité des voix.',
  ].join('\n');
  const r = decouperResolutions(PV_CA, { instance: 'CA_Mhm' });
  assert.equal(r.length, 2);
  assert.equal(r[0].numero, 'CA26 12 0123');
  assert.equal(r[0].numeroArrondissement, '12');
  assert.match(r[0].objet, /contrat de déneigement/);
  assert.equal(r[0].article, '20.01');
  assert.equal(r[0].dossier, '1267026004');
  assert.equal(r[0].resultat, "Adoptée à l'unanimité");
  assert.equal(r[1].numero, 'CA26 12 0124');

  // La forme courte, sans numéro d'arrondissement, reste lisible.
  const court = decouperResolutions('CA26 0456\nObjet quelconque\n30.01', { instance: 'CA_Sud' });
  assert.equal(court[0].numero, 'CA26 0456');
  assert.equal(court[0].numeroArrondissement, null);

  // Et un PV d'arrondissement ne doit pas happer les résolutions du conseil municipal
  // qu'il cite en référence.
  const melange = decouperResolutions('CM26 0570\nRésolution du conseil\n20.01\nCA26 12 0125\nCelle-ci est à nous\n20.02', { instance: 'CA_Mhm' });
  assert.equal(melange.length, 1);
  assert.equal(melange[0].numero, 'CA26 12 0125');
});

// Chaque conseil d'arrondissement écrit son numéro de résolution à sa façon. Les huit
// graphies ci-dessous sont relevées telles quelles dans les procès-verbaux de 2026 — le
// journal de scrapers/diagnostic-arrondissements.js les donne toutes. Sept d'entre elles
// n'étaient pas reconnues, et sept conseils rendaient donc zéro décision sur des
// procès-verbaux de vingt pages. Ce test est là pour qu'on ne les reperde pas.
test("résolutions d'arrondissement : les huit graphies de numéro publiées par la Ville", () => {
  const graphies = [
    ['CA_Las', 'CA26 20 0234', 'CA26 20 0234', '20'], // LaSalle et la plupart
    ['CA_Anj', 'CA26 12158', 'CA26 12158', '12'], // Anjou : collés
    ['CA_Cdn', 'RÉSOLUTION CA26 170145', 'CA26 170145', '17'], // Côte-des-Neiges–NDG
    ['CA_Ver', 'CA26 210108', 'CA26 210108', '21'], // Verdun
    ['CA_Vma', 'CA26 240290', 'CA26 240290', '24'], // Ville-Marie
    ['CA_Mtn', 'CA26 10 163', 'CA26 10 163', '10'], // Montréal-Nord : séquence à 3 chiffres
    ['CA_Ibs', 'CA26 28 109', 'CA26 28 109', '28'], // L'Île-Bizard–Sainte-Geneviève
    ['CA_Rdp', 'CA26 30 07 0169', 'CA26 30 07 0169', '30'], // Rivière-des-Prairies–PAT
    // Pierrefonds-Roxboro : procès-verbal sur deux colonnes, français puis anglais.
    ['CA_Pir', 'RÉSOLUTION NUMÉRO CA26 29 0132 RESOLUTION NUMBER CA26 29 0132', 'CA26 29 0132', '29'],
  ];
  for (const [instance, ligne, attendu, arrondissement] of graphies) {
    const r = decouperResolutions(`${ligne}\nUn objet quelconque\n20.01 1267026004`, { instance });
    assert.equal(r.length, 1, `${instance} : ${ligne}`);
    assert.equal(r[0].numero, attendu, `${instance} : ${ligne}`);
    assert.equal(r[0].numeroArrondissement, arrondissement, `${instance} : ${ligne}`);
    assert.equal(r[0].dossier, '1267026004');
  }
});

// L'autre moitié du travail : une graphie permissive ne doit pas happer les numéros
// cités au fil d'une phrase. Toutes ces lignes sont tirées de procès-verbaux réels.
test("résolutions d'arrondissement : un numéro cité dans une phrase n'ouvre pas de résolution", () => {
  const phrases = [
    "D'amender la résolution CA25 20 0505 afin d'apporter une modification au calendrier",
    'ATTENDU QUE le second projet de résolution CA26 20 0220 (PP-38) a été adopté le 1 juin 2026;',
    'Règlement numéro CA28 0023-54 modifiant le Règlement de zonage CA28 0023',
    "CONSIDÉRANT QUE l'avis de motion CA26 12134 du règlement intitulé",
    'en vertu du règlement CA28 0074.',
  ];
  for (const phrase of phrases) {
    assert.equal(decouperResolutions(`${phrase}\nsuite du texte`, { instance: 'CA_Las' }).length, 0, phrase);
  }
});

// « et unanimement résolu : » est la formule de plusieurs arrondissements ; elle dit ce
// que « Adopté à l'unanimité » dit ailleurs, et doit donner le même résultat.
test("« unanimement résolu » vaut l'unanimité", () => {
  assert.equal(extraireResultat('Il est proposé par X\net unanimement résolu :\nADOPTÉE'), "Adoptée à l'unanimité");
  assert.equal(extraireResultat("ADOPTÉE À L'UNANIMITÉ."), "Adoptée à l'unanimité");
});

// ---------- Les deux colonnes de Pierrefonds-Roxboro ----------

// Positions relevées telles quelles dans CA_Pir_PV_ORDI_2026-06-01_19h00_FR.pdf, page
// par page — [x, largeur, texte] pour chaque fragment. Le procès-verbal est sur deux
// colonnes, le français à gauche et sa traduction anglaise à droite ; recollées, ses
// lignes étaient illisibles. Ces six-là sont les cas qui ont fait échouer trois versions
// successives de la détection, et c'est pour cela qu'elles sont ici.
const LIGNES_PIERREFONDS = [
  // La page de garde : la gouttière ne fait que 17 unités, MOINS qu'un espace entre deux
  // mots français ailleurs dans le même document (jusqu'à 25). Aucun seuil ne les sépare ;
  // seule la position apprise, x=315, y arrive.
  [[92, 201, 'Procès-verbal de la séance ordinaire du'], [311, 53, 'Minutes of'], [365, 6, ' '], [371, 15, 'the'], [386, 6, ' '], [392, 34, 'regular'], [426, 6, ' '], [432, 30, 'sitting'], [462, 6, ' '], [468, 9, 'of'], [478, 6, ' '], [484, 15, 'the']],
  // La gouttière comblée par un fragment de 117 blancs : mesuré entre fragments voisins,
  // l'écart vaut zéro.
  [[95, 103, 'Signature du livre d’or'], [198, 117, ' '], [315, 117, 'Signing of the guestbook']],
  // Un titre de résolution, et le numéro qui l'ouvre — les deux étaient doublés en anglais.
  [[72, 180, 'RÉSOLUTION NUMÉRO CA26 29 0132'], [252, 61, ' '], [313, 179, 'RESOLUTION NUMBER CA26 29 0132']],
  [[72, 81, 'PROLONGATION'], [152, 10, ' '], [162, 14, 'DE'], [176, 10, ' '], [186, 12, 'LA'], [198, 10, ' '], [207, 45, 'PÉRIODE'], [252, 10, ' '], [262, 14, 'DE'], [315, 154, 'QUESTION PERIOD EXTENSION']],
  // Une ligne française seule : elle doit rester entière.
  [[143, 142, 'encore la possibilité aux citoyens']],
  // Une ligne entièrement dans la colonne anglaise : elle doit disparaître.
  [[363, 94, 'Mrs. Zahra Ghassemi']],
];

const ligne = (fragments) => ({ y: 0, fragments: fragments.map(([x, largeur, str]) => ({ x, largeur, str })) });

test('deux colonnes : la moitié anglaise est écartée, la française reste entière', () => {
  // Les positions de colonne s'apprennent sur tout le document. Ici on les fournit :
  // x=315 est celle que le vrai procès-verbal donne, à côté de 334 et 357.
  const centres = [315, 334, 357];
  const rendu = LIGNES_PIERREFONDS.map((f) => texteDeLigne(ligne(f), 612, centres));
  assert.equal(rendu[0], 'Procès-verbal de la séance ordinaire du');
  assert.equal(rendu[1], 'Signature du livre d’or');
  assert.equal(rendu[2], 'RÉSOLUTION NUMÉRO CA26 29 0132');
  assert.equal(rendu[3], 'PROLONGATION DE LA PÉRIODE DE');
  assert.equal(rendu[4], 'encore la possibilité aux citoyens');
  assert.equal(rendu[5], '', 'une ligne entièrement anglaise disparaît');
});

test('une seule colonne : le texte est rendu tel quel', () => {
  const rendu = LIGNES_PIERREFONDS.map((f) => texteDeLigne(ligne(f), 612, []));
  assert.match(rendu[0], /Minutes of the regular sitting of the$/);
  assert.equal(rendu[5], 'Mrs. Zahra Ghassemi');
});

// L'autre moitié du travail : ne JAMAIS couper un document ordinaire. Se tromper ici
// coûterait la moitié de chaque ligne de chaque procès-verbal du conseil municipal.
test("un document sur une colonne n'a pas de colonne apprise", () => {
  const prose = Array.from({ length: 60 }, (_, i) =>
    ligne([[92, 200, `Une ligne ordinaire de procès-verbal, numéro ${i}`], [300, 150, 'et sa suite immédiate']])
  );
  assert.deepEqual(colonnes(prose, 612), [], 'de la prose serrée ne fait pas deux colonnes');

  // « 20.03      1266245003 » : un grand blanc, mais tout à droite, hors de la bande.
  const articles = Array.from({ length: 60 }, (_, i) => ligne([[92, 20, `20.0${i % 9}`], [480, 60, `126624500${i % 9}`]]));
  assert.deepEqual(colonnes(articles, 612), [], 'un numéro de dossier en marge ne fait pas deux colonnes');

  // Trop peu de lignes pour conclure quoi que ce soit.
  assert.deepEqual(colonnes([ligne([[92, 100, 'a'], [315, 100, 'b']])], 612), []);
});

// Le comité exécutif attache à ses procès-verbaux l'ordre du jour complet des trois
// instances. La dernière résolution de la séance l'avalait tout entier : onze objets
// allaient jusqu'à 155 769 caractères — 450 Ko de bruit dans le fichier des décisions, et
// c'est ce que la fiche affichait au lecteur.
test("un objet ne déborde pas sur l'annexe qui suit la séance", () => {
  const annexe = 'Levée de la séance ____________ Nombre d’articles de niveau décisionnel CE : 14 ' + 'CE : 20.001 2026/04/08 09:00 '.repeat(500);
  assert.equal(decouperResolutions(`CE26 0577\n${annexe}`, { instance: 'CE' })[0].objet, null);

  // Le bloc de signature qui ferme le procès-verbal ferme aussi l'objet.
  const signature = '/mt Caroline BOURGEOIS Domenico ZAMBITO ' + 'suite de l’annexe '.repeat(500);
  assert.equal(decouperResolutions(`CE26 0160\n${signature}`, { instance: 'CE' })[0].objet, null);

  // Et quoi qu'il arrive, un objet reste borné — coupé au dernier mot entier.
  const tresLong = 'Accorder un soutien financier à un organisme montréalais '.repeat(40);
  const objet = decouperResolutions(`CM26 0001\n${tresLong}\nIl est proposé par X`, { instance: 'CM' })[0].objet;
  assert.ok(objet.length <= 700, `objet de ${objet.length} caractères`);
  assert.match(objet, /\S$/, 'la coupe tombe sur un mot entier');

  // Un objet ordinaire n'est pas touché.
  assert.equal(
    decouperResolutions('CM26 0002\nAccorder un contrat de déneigement\n20.01 1267026004', { instance: 'CM' })[0].objet,
    'Accorder un contrat de déneigement'
  );
});

// La borne sur l'objet avait d'abord été posée du seul côté du procès-verbal, et les objets
// de 300 000 caractères ont continué d'arriver par l'autre porte : l'ordre du jour, d'où
// vient l'objet des résolutions qui n'en portent pas. Six dépassaient 240 000 caractères,
// le pire 318 571 — le dernier point avalait l'ordre du jour des trois instances, annexé au
// document.
test("un point d'ordre du jour ne déborde pas non plus", () => {
  const pages = [
    {
      numero: 1,
      lignes: [
        { texte: '20.01 CE Service du greffe, Direction - 1261234001' },
        { texte: 'Accorder un contrat de déneigement à Les Entreprises Untel inc.' },
        { texte: 'Levée de la séance ______________________ Nombre d’articles de niveau décisionnel CE : 14' },
        { texte: 'CE : 20.001 2026/04/08 09:00 '.repeat(2000) },
      ],
    },
  ];
  const points = parserOrdreDuJour(pages);
  assert.equal(points.length, 1);
  assert.equal(points[0].objet, 'Accorder un contrat de déneigement à Les Entreprises Untel inc.');

  // Et si rien ne ferme le point, la borne le fait.
  const sansFin = [{ numero: 1, lignes: [{ texte: '30.02 CM Service X - 1261234002' }, { texte: 'Un objet interminable '.repeat(400) }] }];
  const objet = parserOrdreDuJour(sansFin)[0].objet;
  assert.ok(objet.length <= 700, `objet de ${objet.length} caractères`);
  assert.match(objet, /\S$/);
});
