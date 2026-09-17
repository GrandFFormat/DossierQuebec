// Les lecteurs, hors ligne, sur des textes au gabarit de la Ville (extraits de vrais
// procès-verbaux et ordres du jour de 2026, raccourcis).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperResolutions, parserVotes, nettoyerNoms, parserOrdreDuJour, apparierOrdreDuJour, lireDistricts, extraireResultat } from '../lib/pv.js';
import { lireNomFichier, seancesDepuisIndex, sommairesDepuisIndex, normaliserLigneIndex } from '../lib/lav.js';

const PV_CM = `Volume 149
Page 30
PROCÈS-VERBAL D’UNE SÉANCE ORDINAIRE DU CONSEIL
MUNICIPAL DE LA VILLE DE LAVAL tenue le mardi 3 février
2026 à 18 h 31 en la salle du conseil de l’hôtel de ville, 3131,
boulevard Saint-Martin Ouest, salle 120, Ville de Laval, à laquelle
étaient présents:
M. Stéphane Boyer, maire et président du comité exécutif, Ray
Khalil, vice-président du comité exécutif et les conseillers Christine
Poirier, formant quorum des membres du conseil et siégeant
conformément à la résolution CE-20190320-759;
CM-20260203-60 ADOPTION - ORDRE DU JOUR DE LA SÉANCE
IL EST PROPOSÉ PAR : Seta Topouzian
APPUYÉ PAR : Ray Khalil
et résolu à l'unanimité:
d'adopter l'ordre du jour de la séance tel que présenté.
CM-20260203-62 DÉPÔT - PÉTITION - FERMETTE - CENTRE DE LA NATURE
La conseillère Isabelle Piché dépose une pétition afin de demander à
la Ville de maintenir la fermette du Centre de la nature ouverte.
Séance du 3 février 2026
Volume 149
Page 31
CM-20260203-64 ADOPTION - RÈGLEMENT L-13132
La greffière mentionne les éléments prévus à l'article 356 de la Loi
sur les cités et villes;
IL EST PROPOSÉ PAR : Seta Topouzian
APPUYÉ PAR : Ray Khalil
et résolu:
d'adopter le Règlement numéro L-13132 concernant le Comité
consultatif d'urbanisme de la Ville de Laval.
Un débat s’engage.
La conseillère Louise Lortie demande le vote sur la proposition,
laquelle est adoptée par un compte de 3 en faveur et de 2 contre:
M. Stéphane Boyer, maire, et les conseillers Ray Khalil et Christine
Poirier se prononcent en faveur de la proposition;
les conseillers Martin Vaillancourt et Louise Lortie se prononcent
contre la proposition.
ADOPTÉ
(SD-2025-6270)
CM-20260203-68 RECOMMANDATION AU CONSEIL - ATTRIBUTION -
CONTRAT DOS-3623
RÉSOLU À L’UNANIMITÉ:
de recommander au conseil d'attribuer le contrat DOS-3623.
(CT:1908852)
(SD-2026-3971)
`;

test('decouperResolutions : numéro en marge, titre sur plusieurs lignes, sommaire, résultat, page', () => {
  const pages = PV_CM.split('Séance du 3 février 2026');
  const rs = decouperResolutions(PV_CM, { prefixe: 'CM-20260203', pages });
  assert.equal(rs.length, 4);
  assert.deepEqual(
    rs.map((r) => r.numero),
    ['CM-20260203-60', 'CM-20260203-62', 'CM-20260203-64', 'CM-20260203-68']
  );
  // Le renvoi « CE-20190320-759 » de l'en-tête n'ouvre pas de bloc.
  assert.equal(rs[0].titreMajuscules, 'ADOPTION - ORDRE DU JOUR DE LA SÉANCE');
  assert.equal(rs[0].resultat, "Adoptée à l'unanimité");
  assert.equal(rs[0].proposeur, 'Seta Topouzian');
  assert.equal(rs[0].appuyeur, 'Ray Khalil');
  assert.equal(rs[0].page, 1);
  assert.equal(rs[1].depot, true);
  assert.equal(rs[1].resultat, null);
  assert.equal(rs[2].sommaire, 'SD-2025-6270');
  assert.equal(rs[2].resultat, 'Adoptée');
  assert.equal(rs[2].page, 2);
  assert.equal(rs[3].titreMajuscules, 'RECOMMANDATION AU CONSEIL - ATTRIBUTION - CONTRAT DOS-3623');
  assert.equal(rs[3].ct, '1908852');
  assert.equal(rs[3].sommaire, 'SD-2026-3971');
});

test('parserVotes : noms, décompte, demandeur, résultat', () => {
  const rs = decouperResolutions(PV_CM, { prefixe: 'CM-20260203' });
  const v = rs[2].votes;
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].pour, ['Stéphane Boyer', 'Ray Khalil', 'Christine Poirier']);
  assert.deepEqual(v[0].contre, ['Martin Vaillancourt', 'Louise Lortie']);
  assert.equal(v[0].decomptePour, 3);
  assert.equal(v[0].decompteContre, 2);
  assert.equal(v[0].resultat, 'Adoptée');
  assert.equal(v[0].demandeParVote, 'Louise Lortie');
  assert.equal(v[0].etiquette, null);
  assert.deepEqual(v[0].avertissements, []);
});

test('parserVotes : amendement rejeté, listes inversées, singulier', () => {
  const corps = `Un débat s'engage.
Le conseiller David De Cotis demande le vote sur l'amendement, lequel est rejeté par un compte de 1 en faveur et de 3 contre:
le conseiller David De Cotis se prononce en faveur de l'amendement;
M. Stéphane Boyer, maire, et les conseillers Ray Khalil et Christine Poirier se prononcent contre l'amendement.
REJETÉ
(SD-2026-1)`;
  const v = parserVotes(corps);
  assert.equal(v.length, 1);
  assert.equal(v[0].etiquette, "L'amendement");
  assert.equal(v[0].resultat, 'Rejetée');
  assert.deepEqual(v[0].pour, ['David De Cotis']);
  assert.deepEqual(v[0].contre, ['Stéphane Boyer', 'Ray Khalil', 'Christine Poirier']);
  assert.deepEqual(v[0].avertissements, []);
});

test('parserVotes : deux votes dans un bloc, et un vote corrigé (« compte final »)', () => {
  const corps = `Le conseiller A demande le vote sur l'amendement, lequel est rejeté par un compte de 1 en faveur et de 2 contre:
le conseiller Martin Vaillancourt se prononce en faveur de l'amendement;
les conseillers Ray Khalil et Christine Poirier se prononcent contre l'amendement.
Le conseiller B demande le vote sur la proposition, laquelle est acceptée par un compte de 2 en faveur et de 1 contre;
Le conseiller David De Cotis, ayant indiqué s'être trompé, corrige son vote avec l'autorisation de la présidente. Le compte final est de 1 en faveur et de 2 contre:
le conseiller Ray Khalil se prononce en faveur de la proposition;
les conseillers Christine Poirier et David De Cotis se prononcent contre la proposition.
ADOPTÉ
(SD-2026-2)`;
  const v = parserVotes(corps);
  assert.equal(v.length, 2);
  assert.equal(v[0].resultat, 'Rejetée');
  assert.deepEqual(v[0].contre, ['Ray Khalil', 'Christine Poirier']);
  assert.equal(v[1].decomptePour, 1);
  assert.equal(v[1].decompteContre, 2);
  assert.deepEqual(v[1].pour, ['Ray Khalil']);
  assert.deepEqual(v[1].contre, ['Christine Poirier', 'David De Cotis']);
  assert.deepEqual(v[1].avertissements, []);
});

test('parserVotes : un vote demandé mais unanime ne donne pas de noms, donc pas de vote', () => {
  assert.deepEqual(parserVotes("Le conseiller David De Cotis demande le vote sur la proposition, laquelle est adoptée à l'unanimité.\nADOPTÉ"), []);
});

test('nettoyerNoms : civilités, fonction du maire, « les conseillers », écart signalé', () => {
  const r = nettoyerNoms('M. Stéphane Boyer, maire, et les conseillers Ray Khalil, Christine Poirier et Sylvain Yelle');
  assert.deepEqual(r.noms, ['Stéphane Boyer', 'Ray Khalil', 'Christine Poirier', 'Sylvain Yelle']);
  assert.deepEqual(nettoyerNoms('la conseillère Louise Lortie').noms, ['Louise Lortie']);
  assert.deepEqual(nettoyerNoms('Mme Aline Dib et M. Mohamed Bâ').noms, ['Aline Dib', 'Mohamed Bâ']);
});

test('extraireResultat', () => {
  assert.equal(extraireResultat("et résolu à l'unanimité:\nd'adopter"), "Adoptée à l'unanimité");
  assert.equal(extraireResultat("RÉSOLU À L’UNANIMITÉ:\nde recommander"), "Adoptée à l'unanimité");
  assert.equal(extraireResultat('laquelle est rejetée par un compte de 2 en faveur et de 18 contre'), 'Rejetée');
  assert.equal(extraireResultat('La conseillère dépose une pétition.'), null);
});

const ODJ = `Service du Greffe
ORDRE DU JOUR
SÉANCE ORDINAIRE du conseil municipal de la Ville de Laval à être tenue le mardi 3 février 2026
8. ÉTUDE ET ADOPTION DES RÈGLEMENTS SUIVANTS
8.1 Règlement numéro L-13132 concernant le Comité consultatif d'urbanisme
de la Ville de Laval
SD-2025-6270
District(s) : 00 Tous les districts
9. ÉTUDE ET ADOPTION DES PROJETS DE RÈGLEMENTS DE ZONAGE
SUIVANTS et fixation de la date de l'assemblée de consultation
11. PRÉSENTATION DES RECOMMANDATIONS DU COMITÉ EXÉCUTIF
11.12 adjuger le contrat DOS-3236 à Lachapelle Logistique concernant une
entente-cadre pour des services de déménagement, pour une période de 3
ans
SD-2025-6415 - CT : 1876662
District(s) : 01 Saint-François, 02 Saint-Vincent-de-Paul, 03 Val-des-
Brises, 15 Saint-Martin
Montants(s) : 689 850,00 $
11.13 avis de motion — Règlement L-13280
SD-2026-3971
11.14 dépôt du projet de Règlement L-13280
SD-2026-3971
Généré le vendredi 30 janvier 2026 à 12 h 08
`;

test('parserOrdreDuJour : points, chapitres, renvois, districts coupés, montant', () => {
  const pts = parserOrdreDuJour(ODJ);
  assert.equal(pts.length, 4);
  assert.equal(pts[0].numero, '8.1');
  assert.equal(pts[0].objet, "Règlement numéro L-13132 concernant le Comité consultatif d'urbanisme de la Ville de Laval");
  assert.equal(pts[0].chapitre, 'Étude et adoption des règlements suivants');
  assert.equal(pts[0].sommaire, 'SD-2025-6270');
  assert.deepEqual(pts[0].districts, [{ numero: 0, nom: 'Tous les districts' }]);
  assert.equal(pts[1].chapitre, 'Présentation des recommandations du comité exécutif');
  assert.equal(pts[1].ct, '1876662');
  assert.equal(pts[1].montant, '689 850,00 $');
  assert.deepEqual(
    pts[1].districts.map((d) => `${d.numero} ${d.nom}`),
    ['1 Saint-François', '2 Saint-Vincent-de-Paul', '3 Val-des-Brises', '15 Saint-Martin']
  );
});

test('apparierOrdreDuJour : par sommaire, dans l’ordre quand un sommaire revient deux fois', () => {
  const pts = parserOrdreDuJour(ODJ);
  const rs = [
    { numero: 'CM-1', sommaire: 'SD-2025-6270' },
    { numero: 'CM-2', sommaire: 'SD-2026-3971' },
    { numero: 'CM-3', sommaire: 'SD-2026-3971' },
    { numero: 'CM-4', sommaire: 'SD-9999-1' },
  ];
  const app = apparierOrdreDuJour(rs, pts);
  assert.equal(app.get('CM-1').numero, '8.1');
  assert.equal(app.get('CM-2').numero, '11.13');
  assert.equal(app.get('CM-3').numero, '11.14');
  assert.equal(app.has('CM-4'), false);
});

test('lireDistricts', () => {
  assert.deepEqual(lireDistricts('07 Renaud-Coursol, 15 Saint-Martin'), [
    { numero: 7, nom: 'Renaud-Coursol' },
    { numero: 15, nom: 'Saint-Martin' },
  ]);
  assert.deepEqual(lireDistricts("13 L'Abord-à-Plouffe"), [{ numero: 13, nom: "L'Abord-à-Plouffe" }]);
});

test('lireNomFichier', () => {
  assert.deepEqual(lireNomFichier('CM_PV_ORD_18h33_2026_07_07_2.0.pdf'), { instance: 'CM', genre: 'PV', sousType: 'ORD', heure: '18h33', minutes: 1113, date: '2026-07-07', version: 2 });
  assert.equal(lireNomFichier('CM_ODJ_ORD_18h30_2026_08_11.pdf').version, 0);
  assert.deepEqual(lireNomFichier('SD-2026-4237_1.0.pdf'), { genre: 'SD', numero: 'SD-2026-4237', version: 1 });
  assert.equal(lireNomFichier('autre.pdf'), null);
});

test('seancesDepuisIndex : appariement par heure la plus proche, version la plus haute, deux séances le même jour', () => {
  const docs = [
    ['1', 'CM_ODJ_ORD_18h30_2026_07_07_2.0.pdf', 'Conseil municipal', 'Ordinaire', 'Ordre du jour', '07/07/2026', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_ODJ_ORD_18h30_2026_07_07_2.0.pdf">x</a>'],
    ['2', 'CM_PV_ORD_18h33_2026_07_07_2.0.pdf', 'Conseil municipal', 'Ordinaire', 'Proces verbal', '07/07/2026', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_PV_ORD_18h33_2026_07_07_2.0.pdf">x</a>'],
    ['3', 'CM_ODJ_ORD_18h30_2026_08_11.pdf', 'Conseil municipal', 'Ordinaire', 'Ordre du jour', '11/08/2026', '', '', '1,00', '<a href="https://www.laval.ca/wp-content/uploads/2026/08/CM_ODJ_ORD_18h30_2026_08_11-1.pdf">x</a>'],
    ['4', 'CM_ODJ_ORD_18h30_2026_08_11_2.0.pdf', 'Conseil municipal', 'Ordinaire', 'Ordre du jour', '11/08/2026', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_ODJ_ORD_18h30_2026_08_11_2.0.pdf">x</a>'],
    ['5', 'CM_PV_EXT_16h00_2025_12_15_2.0.pdf', 'Conseil municipal', 'Extraordinaire', 'Procès verbal', '15/12/2025', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_PV_EXT_16h00_2025_12_15_2.0.pdf">x</a>'],
    ['6', 'CM_PV_EXT_17h30_2025_12_15_2.0.pdf', 'Conseil municipal', 'Extraordinaire', 'Procès verbal', '15/12/2025', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_PV_EXT_17h30_2025_12_15_2.0.pdf">x</a>'],
    ['7', 'CM_ODJ_EXT_17h30_2025_12_15_2.0.pdf', 'Conseil municipal', 'Extraordinaire', 'Ordre du jour', '15/12/2025', '', '', '2,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/CM_ODJ_EXT_17h30_2025_12_15_2.0.pdf">x</a>'],
    ['8', 'SD-2026-3971_1.0.pdf', 'Conseil municipal', '', 'Sommaire décisionnel', '11/08/2026', 'SD-2026-3971', 'AVIS DE MOTION - RÈGLEMENT L-13280', '1,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/SD-2026-3971_1.0.pdf">x</a>'],
    ['9', 'SD-2026-3971_1.0.pdf', 'Conseil municipal', '', 'Sommaire décisionnel', '01/09/2026', 'SD-2026-3971', 'ADOPTION - RÈGLEMENT L-13280', '1,00', '<a href="https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/SD-2026-3971_1.0.pdf">x</a>'],
  ].map(normaliserLigneIndex);
  const s = seancesDepuisIndex(docs);
  assert.deepEqual(
    s.map((x) => x.id),
    ['CM-20260811-ORD-18h30', 'CM-20260707-ORD-18h30', 'CM-20251215-EXT-16h00', 'CM-20251215-EXT-17h30']
  );
  assert.equal(s[1].pv.fichier, 'CM_PV_ORD_18h33_2026_07_07_2.0.pdf');
  assert.equal(s[1].prefixe, 'CM-20260707');
  assert.equal(s[0].odj.fichier, 'CM_ODJ_ORD_18h30_2026_08_11_2.0.pdf');
  assert.equal(s[0].pv, null);
  assert.equal(s[2].odj, null);
  assert.equal(s[3].odj.heure, '17h30');
  const som = sommairesDepuisIndex(docs);
  assert.equal(som.get('SD-2026-3971').passages.length, 2);
  assert.equal(som.get('SD-2026-3971').url, 'https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/SD-2026-3971_1.0.pdf');
});
