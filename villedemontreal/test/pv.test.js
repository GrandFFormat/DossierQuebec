// Tests hors ligne des lecteurs : procès-verbal, ordre du jour, CSV, thèmes, séances.
// Les textes sont synthétiques mais suivent le gabarit observé dans les procès-verbaux
// publiés par la Ville. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperResolutions, parserVote, nettoyerNoms, parserOrdreDuJour, extraireDissidences } from '../lib/pv.js';
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

test("ordre du jour : rattache le lien du sommaire au numéro de dossier", () => {
  const pages = [
    {
      numero: 1,
      lignes: [
        { y: 700, texte: '20.03 Service de la diversité - 1266245003' },
        { y: 685, texte: "Approuver un projet de convention entre la Ville et l'organisme Exemple inc." },
        { y: 600, texte: '20.04 Service des finances - 1266245004' },
        { y: 585, texte: 'Autoriser une dépense de 1 000 000 $' },
      ],
      liens: [
        { url: 'https://ville.montreal.qc.ca/sel/sypre-consultation/afficherpdf?idDoc=1&typeDoc=1', y: 686 },
        { url: 'https://ville.montreal.qc.ca/sel/sypre-consultation/afficherpdf?idDoc=2&typeDoc=1', y: 586 },
      ],
    },
  ];
  const points = parserOrdreDuJour(pages);
  assert.equal(points.length, 2);
  assert.equal(points[0].article, '20.03');
  assert.equal(points[0].dossier, '1266245003');
  assert.match(points[0].sommairePdf, /idDoc=1&/);
  assert.equal(points[1].dossier, '1266245004');
  assert.match(points[1].sommairePdf, /idDoc=2&/);
  assert.match(points[0].objet, /Approuver un projet/);
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
  assert.equal(candidatsDocument({ instance: 'CE', genre: 'ODJ', variante: 'ORDI', date: '2025-09-17', heure: '09h00' })[2], 'https://ville.montreal.qc.ca/documents/Adi_Public/CE/CE_ODJ_ADOPTE_ORDI_2025-09-17_09h00_FR.pdf');
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
