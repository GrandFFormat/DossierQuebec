// La lecture des sommaires décisionnels, hors ligne, sur des extraits au gabarit de la Ville
// (de vrais sommaires de 2025-2026, raccourcis). Les fixtures sont écrites comme lib/pdf.js rend
// une page — une ligne par hauteur, avec la position x de chaque fragment — parce que c'est par
// fragments qu'on lit : « No règlement : L-13021 » et « Type de règlement : Emprunt » sont sur la
// même ligne recollée.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { champsSommaire, enTeteSommaire, lignesUtiles, lirePaires, lireDistrictsSommaire, lireDecisionsAnterieures, entreeIndex, lignesCompactes, pagesDepuisCache } from '../scrapers/sommaires.js';
import { matiereDuSommaire } from '../scrapers/resumes.js';

// « 987 | [445.2]SOMMAIRE DÉCISIONNEL [516]No SD » -> { y, texte, fragments: [{ x, str }] }.
// Une ligne « ---- » sépare les pages.
function pages(dessin) {
  const out = [[]];
  for (const brut of dessin.trim().split('\n')) {
    if (/^-{3,}$/.test(brut.trim())) {
      out.push([]);
      continue;
    }
    const [y, reste] = brut.split(' | ');
    const fragments = [...reste.matchAll(/\[(\d+(?:\.\d+)?)\]([^[]*)/g)].map((m) => ({ x: Number(m[1]), str: m[2].replace(/\s+$/, '') }));
    out[out.length - 1].push({ y: Number(y), fragments, texte: fragments.map((f) => f.str).join(' ').replace(/\s+/g, ' ').trim() });
  }
  return out.map((lignes, i) => ({ numero: i + 1, lignes }));
}

const CONTRAT = `
987 | [445.2]SOMMAIRE DÉCISIONNEL
955 | [516.2]No SD
946 | [28.4]SERVICE / DIVISION [124.5]  [141.8]Service de l'approvisionnement / Achats [337.1]
942 | [497]SD-2025-5913
909 | [141.8]Recommander au conseil d'octroyer le contrat DOS-3245 pour l'acquisition de licences pour la
903 | [28.4]OBJET [61.7]
898 | [141.8]plateforme production et service de diffusion de courriels de masse - avis importants et infolettres
871 | [28.4]No dossier(s) interne(s) :
854 | [28.4]No LV : [63.4]  [156]NE S'APPLIQUE PAS
838 | [28.4]DISTRICT(S) : [93.9]  [156]00-Tous les districts
803 | [32.4]Actions : [75.1]  [80.9]OCTROI
765 | [57.5]Demande d'achat : [146]  [151.7]Oui
752 | [93.8]CT requis : [146]  [151.7]Oui
727 | [28.4]Contrat
714 | [89.9]No contrat : [146]  [151.7]DOS-3245
701 | [101]Montant : [146]  [151.7]839 679,72 $
687 | [41]Mode de sollicitation : [146]  [151.7]EXE-Exemption
674 | [65.4]Type de contrat : [146]  [151.7]Acquisition de biens
661 | [59.9]Durée du contrat : [146]  [151.7]5 ans
647 | [84.9]Récurrence : [146]  [151.7]Oui
634 | [100.4]Résultat : [146]  [151.7]REP Solution interactive inc. [277.9]  [286.2]839 679,72 $ (incluant TPS et TVQ)
614 | [28.4]Unité(s) administrative(s) concernée(s)
601 | [28.4]Service des communications et du marketing
539 | [28.4]DÉCISION(S) ANTÉRIEURE(S)
525 | [28.4]Date [49.5]  [99.3]No résolution [158.2]  [205.6]Objet
513 | [28.4]2020-12-01 [79.5]  [99.3]CM-20201201-1029 [188.2]  [205.6]OCTROI - CONTRAT EXE-0420
495 | [28.4]Résumé
483 | [28.4]Sur recommandation du comité exécutif,
460 | [28.4]IL EST PROPOSÉ PAR : [140.1]  [151.2]Jocelyne Frédéric-Gauthier
425 | [28.4]et résolu à l'unanimité:
402 | [28.4]d'octroyer le contrat EXE-0420, à l'entreprise et au montant ci-dessous mentionnés
321 | [142.3]ADOPTÉ
310 | [28.4](SD-2020-4491)
41 | [28.4]Laval [54.6]  [57.7]– [63.2]  [66.3]Sommaire décisionnel
28 | [489.2]Page 1 de 2
----
987 | [445.2]SOMMAIRE DÉCISIONNEL
955 | [516.2]No SD
946 | [28.4]SERVICE / DIVISION [124.5]  [141.8]Service de l'approvisionnement / Achats [337.1]
942 | [497]SD-2025-5913
911 | [28.4]CONTEXTE / JUSTIFICATIONS
894 | [42.5]Le présent contrat a pour objet l'acquisition de licences pour la plateforme production et service de diffusion de courriels
882 | [42.5]de masse - avis importants et infolettres.
663 | [42.5]REP Solution interactive inc. [168.7]  [177]839 679,72 $ (incluant TPS et TVQ) (recommandé) (révisé)
556 | [28.4]IMPACTS MAJEURS
538 | [42.5]NE S'APPLIQUE PAS
512 | [28.4]ASPECTS FINANCIERS
494 | [42.5]Montant et nature de la dépense prévus au compte 1-68101-1651-00-114140-00000.
256 | [28.4]REMARQUE(S)
239 | [42.5]B/C 839 679,72 $ (incluant TPS et TVQ)
213 | [28.4]EN CONSÉQUENCE, IL Y AURAIT LIEU
188 | [47.9]de recommander au conseil d'octroyer le contrat DOS-3245 à l'entreprise et au montant ci-dessous mentionnés, pour
142 | [47.9]REP Solution interactive inc. [174.1]  [182.4]839 679,72 $ (incluant TPS et TVQ).
119 | [47.9](CT:1873603)
41 | [28.4]Laval [54.6]  [57.7]– [63.2]  [66.3]Sommaire décisionnel
28 | [489.2]Page 2 de 2
`;

const REGLEMENT = `
987 | [445.2]SOMMAIRE DÉCISIONNEL
955 | [516.2]No SD
952 | [141.8]Service de l'ingénierie / Développement et projets partenaires [441.6]
946 | [28.4]SERVICE / DIVISION [124.5]
942 | [497]SD-2026-3136
919 | [141.8]Recommander au conseil qu'un avis de motion soit donné pour le Règlement L-13021 décrétant
907 | [141.8]l'emploi de deniers du fonds général pour le secteur à l'ouest de la DSM-
889 | [28.4]OBJET
884 | [141.8]004 prévus au projet 600722
844 | [28.4]No dossier(s) interne(s) : [146.7]  [156]600722
827 | [28.4]No LV : [63.4]  [156]NE S'APPLIQUE PAS
810 | [28.4]DISTRICT(S) : [93.9]  [156]01-Saint-François
798 | [156]02-Saint-Vincent-de-Paul
775 | [32.4]Actions : [75.1]  [80.9]ADOPTION DE RÈGLEMENT, AVIS DE MOTION, PRÉSENTATION DE PROJET DE RÈGLEMENT
757 | [93.9]No règlement : [164]  [169.7]L-13021 [206.3]  [363.4]Type de règlement : [457.8]  [463.6]Emprunt
742 | [70.6]Titre du règlement : [164]  [169.7]décrétant l'emploi de deniers du fonds général pour défrayer le coût excédentaire pour le
731 | [169.7]surdimensionnement d'une conduite d'égout pluvial pour desservir le secteur au nord ainsi
719 | [169.7]que le surdimensionnement et la construction des conduites d'égout pluvial
681 | [52.3]Consultation publique : [164]  [169.7]Non [188]  [263.4]Dispo. susceptible approb. référendaire : [457.9]  [463.6]Non
608 | [28.4]DÉCISION(S) ANTÉRIEURE(S)
582 | [28.4]CONTEXTE / JUSTIFICATIONS
565 | [42.5]Le Service de l'ingénierie a procédé à la rédaction du projet de règlement suivant:
250 | [28.4]IMPACTS MAJEURS
232 | [42.5]NE S'APPLIQUE PAS
206 | [28.4]ASPECTS FINANCIERS
188 | [42.5]Le présent règlement prévoit un investissement de 405 100 $ (taxes nettes incluses).
41 | [28.4]Laval [54.6]  [57.7]– [63.2]  [66.3]Sommaire décisionnel
28 | [489.2]Page 1 de 1
`;

// La division déborde sous la ligne du numéro SD, là où l'objet commence d'habitude.
const DEBORDE = `
986.9 | [445.2]SOMMAIRE DÉCISIONNEL
954.6 | [516.2]No SD
952.3 | [141.8]Bureau des transactions et des investissements immobiliers /
946.1 | [28.4]SERVICE / DIVISION [124.5]
941.9 | [497]SD-2026-4396
939.6 | [141.8]Transactions immobilières
903.1 | [28.4]OBJET [61.7]  [141.8]Recommander au conseil d'exclure le lot 1 190 966 du cadastre du Québec du domaine public
871.1 | [28.4]No dossier(s) interne(s) : [146.7]  [156]DE-21-227
837.7 | [28.4]DISTRICT(S) : [93.9]  [156]13-L'Abord-à-Plouffe
815.9 | [28.4]Date CE souhaitée : [122.3]  [156]2026-08-26
770 | [28.4]DÉCISION(S) ANTÉRIEURE(S)
755 | [28.4]Date [49.5]  [99.3]No résolution [158.2]  [205.6]Objet
743 | [28.4]2024-10-01 [79.5]  [99.3]CM-20241001-1000 [188.2]  [205.6]RENOUVELLEMENT - NOMINATION - COMITÉ CONSULTATIF FONDS PLACE-
732 | [205.6]DU-SOUVENIR
714 | [28.4]Résumé
702 | [28.4]Sur recommandation du comité exécutif,
586 | [159]ADOPTÉ
560 | [28.4]Date [49.5]  [99.3]No résolution [158.2]  [205.6]Objet
549 | [28.4]2022-10-04 [79.5]  [99.3]CM-20221004-920 [182.6]  [205.6]NOMINATIONS - COMITÉ CONSULTATIF FONDS PLACE-DU-SOUVENIR
41 | [28.4]Laval [54.6]  [57.7]– [63.2]  [66.3]Sommaire décisionnel
28 | [489.2]Page 1 de 2
----
986.9 | [445.2]SOMMAIRE DÉCISIONNEL
954.6 | [516.2]No SD
952.3 | [141.8]Bureau des transactions et des investissements immobiliers /
946.1 | [28.4]SERVICE / DIVISION [124.5]
941.9 | [497]SD-2026-4396
939.6 | [141.8]Transactions immobilières
911 | [28.4]CONTEXTE / JUSTIFICATIONS
894 | [42.5]ATTENDU QUE par sa résolution CE-20260729-1702, le comité exécutif autorisait la vente.
41 | [28.4]Laval [54.6]  [57.7]– [63.2]  [66.3]Sommaire décisionnel
28 | [489.2]Page 2 de 2
`;

test('lignesUtiles : en-tête et pied de page retirés sur chaque page, fragments vides retirés', () => {
  const lignes = lignesUtiles(pages(CONTRAT));
  assert.equal(lignes[0].texte, "Recommander au conseil d'octroyer le contrat DOS-3245 pour l'acquisition de licences pour la");
  assert.ok(!lignes.some((l) => /SOMMAIRE DÉCISIONNEL|No SD|SERVICE \/ DIVISION|Page \d de|Sommaire décisionnel$/.test(l.texte)));
  assert.ok(lignes.every((l) => l.fragments.every((f) => f.str !== '')));
  assert.equal(lignes.find((l) => l.page === 2).texte, 'CONTEXTE / JUSTIFICATIONS');
});

test('enTeteSommaire : numéro, service et division — sur la ligne du libellé ou au-dessus', () => {
  assert.deepEqual(enTeteSommaire(pages(CONTRAT)[0]), { numero: 'SD-2025-5913', service: "Service de l'approvisionnement", division: 'Achats', coupe: 2 });
  const e = enTeteSommaire(pages(REGLEMENT)[0]);
  assert.equal(e.service, "Service de l'ingénierie");
  assert.equal(e.division, 'Développement et projets partenaires');
});

test('enTeteSommaire : la division qui déborde sous le numéro SD est reprise, et la coupe descend avec elle', () => {
  const e = enTeteSommaire(pages(DEBORDE)[0]);
  assert.equal(e.service, 'Bureau des transactions et des investissements immobiliers');
  assert.equal(e.division, 'Transactions immobilières');
  assert.ok(e.coupe > 2 && e.coupe < 5, `coupe = ${e.coupe}`);
  const { champs } = champsSommaire(pages(DEBORDE));
  assert.equal(champs.objet, "Recommander au conseil d'exclure le lot 1 190 966 du cadastre du Québec du domaine public");
  // Sur la page 2, la même ligne débordante n'est pas tombée dans le contexte.
  assert.equal(champs.contexte, 'ATTENDU QUE par sa résolution CE-20260729-1702, le comité exécutif autorisait la vente.');
});

test('champsSommaire (contrat) : objet sur deux lignes, fiche, bloc contrat, unités, sections', () => {
  const { champs, avertissements } = champsSommaire(pages(CONTRAT));
  assert.deepEqual(avertissements, []);
  assert.equal(champs.numero, 'SD-2025-5913');
  assert.equal(champs.objet, "Recommander au conseil d'octroyer le contrat DOS-3245 pour l'acquisition de licences pour la plateforme production et service de diffusion de courriels de masse - avis importants et infolettres");
  assert.equal(champs.dossierInterne, null);
  assert.equal(champs.lv, "NE S'APPLIQUE PAS");
  assert.deepEqual(champs.districts, [{ numero: 0, nom: 'Tous les districts' }]);
  assert.deepEqual(champs.actions, ['OCTROI']);
  assert.equal(champs.demandeAchat, 'Oui');
  assert.deepEqual(champs.contrat, {
    numero: 'DOS-3245',
    montant: '839 679,72 $',
    estimation: null,
    mode: 'EXE-Exemption',
    type: 'Acquisition de biens',
    duree: '5 ans',
    recurrence: 'Oui',
    reconduction: null,
    addendas: null,
    resultat: 'REP Solution interactive inc. 839 679,72 $ (incluant TPS et TVQ)',
  });
  assert.equal(champs.contrats.length, 1);
  assert.equal(champs.reglement, null);
  assert.deepEqual(champs.reglements, []);
  assert.equal(champs.fiche.split('\n')[0], 'No dossier(s) interne(s) :');
  assert.equal(champs.fiche.split('\n').pop(), 'Résultat : REP Solution interactive inc. 839 679,72 $ (incluant TPS et TVQ)');
  assert.deepEqual(champs.unites, ['Service des communications et du marketing']);
  assert.deepEqual(champs.decisionsAnterieures, [{ date: '2020-12-01', numero: 'CM-20201201-1029', objet: 'OCTROI - CONTRAT EXE-0420' }]);
  assert.ok(champs.contexte.startsWith("Le présent contrat a pour objet"));
  assert.ok(champs.contexte.includes('839 679,72 $ (incluant TPS et TVQ) (recommandé) (révisé)'));
  assert.equal(champs.impacts, "NE S'APPLIQUE PAS");
  assert.equal(champs.aspectsFinanciers, 'Montant et nature de la dépense prévus au compte 1-68101-1651-00-114140-00000.');
  assert.equal(champs.remarques, 'B/C 839 679,72 $ (incluant TPS et TVQ)');
  assert.ok(champs.resume.startsWith("de recommander au conseil d'octroyer le contrat DOS-3245"));
  assert.ok(champs.resume.endsWith('(CT:1873603)'));
  assert.deepEqual(champs.incertains, []);
});

test('champsSommaire (règlement) : deux paires sur une ligne, titre sur trois lignes, districts un par ligne, trait d’union recollé', () => {
  const { champs, avertissements } = champsSommaire(pages(REGLEMENT));
  assert.deepEqual(avertissements, []);
  assert.equal(champs.objet, "Recommander au conseil qu'un avis de motion soit donné pour le Règlement L-13021 décrétant l'emploi de deniers du fonds général pour le secteur à l'ouest de la DSM-004 prévus au projet 600722");
  assert.equal(champs.dossierInterne, '600722');
  assert.deepEqual(champs.districts, [
    { numero: 1, nom: 'Saint-François' },
    { numero: 2, nom: 'Saint-Vincent-de-Paul' },
  ]);
  assert.deepEqual(champs.actions, ['ADOPTION DE RÈGLEMENT', 'AVIS DE MOTION', 'PRÉSENTATION DE PROJET DE RÈGLEMENT']);
  assert.equal(champs.contrat, null);
  assert.equal(champs.reglement.numero, 'L-13021');
  assert.equal(champs.reglement.type, 'Emprunt');
  assert.equal(champs.reglement.titre, "décrétant l'emploi de deniers du fonds général pour défrayer le coût excédentaire pour le surdimensionnement d'une conduite d'égout pluvial pour desservir le secteur au nord ainsi que le surdimensionnement et la construction des conduites d'égout pluvial");
  assert.equal(champs.reglement.consultationPublique, 'Non');
  assert.equal(champs.reglement.approbationReferendaire, 'Non');
  assert.deepEqual(champs.decisionsAnterieures, []);
  assert.equal(champs.aspectsFinanciers, 'Le présent règlement prévoit un investissement de 405 100 $ (taxes nettes incluses).');
});

test('lirePaires : une valeur sur la ligne d’en dessous, pas en face du libellé, est gardée mais dite incertaine', () => {
  const dessin = CONTRAT.replace('701 | [101]Montant : [146]  [151.7]839 679,72 $', '701 | [101]Montant :\n695 | [151.7]2 378 578,66 $');
  const { champs, avertissements } = champsSommaire(pages(dessin));
  assert.equal(champs.contrat.montant, '2 378 578,66 $');
  assert.deepEqual(champs.incertains, ['contrat.montant']);
  assert.equal(avertissements.length, 1);
  assert.match(avertissements[0], /« Montant » : valeur lue sur la ligne suivante/);
  // L'index publié ne reprend pas ce montant-là.
  const entree = entreeIndex({ numero: 'SD-2025-5913', url: 'u', nombrePages: 2, champs, avertissements, luLe: '2026-09-17' }, { decisions: ['CM-20260203-64'], date: '2026-02-03' });
  assert.equal(entree.montant, null);
  assert.equal(entree.contrat.numero, 'DOS-3245');
  assert.deepEqual(entree.decisions, ['CM-20260203-64']);
});

test('champsSommaire : un « Montant » qui n’est pas une somme est signalé, jamais recopié comme montant', () => {
  const dessin = CONTRAT.replace('[151.7]839 679,72 $', '[151.7]Selon bordereau');
  const { champs, avertissements } = champsSommaire(pages(dessin));
  assert.equal(champs.contrat.montant, null);
  assert.equal(champs.autres.Montant, 'Selon bordereau');
  assert.ok(avertissements.some((a) => /ne ressemble pas à une somme/.test(a)));
});

test('champsSommaire (multi-lots) : le bloc contrat répété donne plusieurs blocs, aucun montant unique', () => {
  const lot = (y, no, montant, resultat) => `${y} | [89.9]No contrat : [146]  [151.7]${no}
${y - 13} | [101]Montant : [146]  [151.7]${montant}
${y - 26} | [41]Mode de sollicitation : [146]  [151.7]SP-Soumission publique
${y - 39} | [73.2]Reconduction : [146]  [151.7]2
${y - 52} | [100.4]Résultat : [146]  [151.7]${resultat} :
${y - 63} | [151.7]Entreprise T.R.A. (2011) inc. ${montant} (incluant TPS et TVQ)`;
  const dessin = CONTRAT.replace(/714 \| [\s\S]*?634 \|[^\n]*\n/, lot(714, 'DOS-2039', '2 261 443,28 $', 'Lot 1 : Marquage longitudinal (Tous les secteurs)') + '\n' + lot(640, 'DOS-2039', '1 996 866,25 $', 'Lot 2 : Marquage ponctuel (Secteurs 1 et 6)') + '\n');
  const { champs, avertissements } = champsSommaire(pages(dessin));
  assert.deepEqual(avertissements, []);
  assert.equal(champs.contrats.length, 2);
  assert.equal(champs.contrat, null);
  assert.equal(champs.contrats[0].montant, '2 261 443,28 $');
  assert.equal(champs.contrats[0].reconduction, '2');
  // « Lot 1 : … : » finit par deux-points mais commence dans la colonne des valeurs : c'est une valeur.
  assert.equal(champs.contrats[0].resultat, 'Lot 1 : Marquage longitudinal (Tous les secteurs) : Entreprise T.R.A. (2011) inc. 2 261 443,28 $ (incluant TPS et TVQ)');
  assert.equal(champs.contrats[1].montant, '1 996 866,25 $');
  assert.deepEqual(Object.keys(champs.autres), []);
  const entree = entreeIndex({ numero: 'SD-2025-5933', url: 'u', nombrePages: 3, champs, avertissements, luLe: '2026-09-17' }, { decisions: [], date: '2026-01-13' });
  assert.equal(entree.montant, null);
  assert.equal(entree.contrat, null);
  assert.equal(entree.contrats, 2);
  assert.ok(champs.fiche.includes('Montant : 2 261 443,28 $') && champs.fiche.includes('Montant : 1 996 866,25 $'));
});

test('lirePaires : un sous-tableau sans deux-points ferme la valeur en cours (rien ne fuit dans Actions ni dans le type de contrat)', () => {
  const dessin = CONTRAT.replace(
    '803 | [32.4]Actions : [75.1]  [80.9]OCTROI',
    `803 | [32.4]Actions : [75.1]  [80.9]TOPONYMIE
790 | [28.4]Requérant(s) [90]  [305.3]Représentant(s)
779 | [28.4]Ville de Laval [87.8]  [305.3]1) Philippe de Montgaillard, superviseur, division Vie de
768 | [305.3]quartier, Service de la culture`
  ).replace('674 | [65.4]Type de contrat : [146]  [151.7]Acquisition de biens', `674 | [65.4]Type de contrat : [146]  [151.7]Service(s) professionnel(s)
668 | [28.4]Financement
662 | [28.4]No Règlement [95.6]  [305.3]Titre
656 | [28.4]L-13010 [65]  [305.3]Décrétant l'acquisition d'une solution`);
  const { champs } = champsSommaire(pages(dessin));
  assert.deepEqual(champs.actions, ['TOPONYMIE']);
  assert.equal(champs.contrat.type, 'Service(s) professionnel(s)');
  assert.deepEqual(champs.autres, {});
  assert.ok(champs.fiche.includes('Requérant(s) Représentant(s)') && champs.fiche.includes('L-13010 Décrétant'));
});

test('lireDecisionsAnterieures : deux tableaux, un objet coupé sur deux lignes, les résumés ignorés', () => {
  const { champs } = champsSommaire(pages(DEBORDE));
  assert.deepEqual(champs.decisionsAnterieures, [
    { date: '2024-10-01', numero: 'CM-20241001-1000', objet: 'RENOUVELLEMENT - NOMINATION - COMITÉ CONSULTATIF FONDS PLACE-DU-SOUVENIR' },
    { date: '2022-10-04', numero: 'CM-20221004-920', objet: 'NOMINATIONS - COMITÉ CONSULTATIF FONDS PLACE-DU-SOUVENIR' },
  ]);
  assert.deepEqual(lireDecisionsAnterieures([]), []);
});

test('lireDistrictsSommaire : sur une ligne ou un par ligne, même forme que decisions.json', () => {
  assert.deepEqual(lireDistrictsSommaire(['01-Saint-François, 02-Saint-Vincent-de-Paul']), [
    { numero: 1, nom: 'Saint-François' },
    { numero: 2, nom: 'Saint-Vincent-de-Paul' },
  ]);
  assert.deepEqual(lireDistrictsSommaire(['13-L\'Abord-à-Plouffe', '00-Tous les districts']), [
    { numero: 13, nom: "L'Abord-à-Plouffe" },
    { numero: 0, nom: 'Tous les districts' },
  ]);
  assert.deepEqual(lireDistrictsSommaire(['Secteur non précisé']), [{ numero: null, nom: 'Secteur non précisé' }]);
});

test('lirePaires : un libellé inconnu est gardé dans « autres », rien n’est perdu', () => {
  const dessin = CONTRAT.replace('752 | [93.8]CT requis : [146]  [151.7]Oui', '752 | [93.8]Champ nouveau : [146]  [151.7]Valeur');
  const { champs } = champsSommaire(pages(dessin));
  assert.equal(champs.ctRequis, null);
  assert.equal(champs.autres['Champ nouveau'], 'Valeur');
  const paires = lirePaires(lignesUtiles(pages(REGLEMENT)).slice(3, 12));
  assert.ok(paires.every((p) => p.memeLigne));
});

test('cache : les fragments compacts redonnent les mêmes champs (réextraction sans réseau)', () => {
  const p = pages(CONTRAT);
  const direct = champsSommaire(p).champs;
  const rejoue = champsSommaire(pagesDepuisCache(lignesCompactes(p))).champs;
  assert.deepEqual(rejoue, direct);
});

test('matiereDuSommaire : les champs sûrs, sans les « NE S’APPLIQUE PAS » ; le texte entier à défaut', () => {
  const { champs } = champsSommaire(pages(CONTRAT));
  const m = matiereDuSommaire({ champs, texte: 'TEXTE ENTIER' });
  assert.ok(m.startsWith("Service : Service de l'approvisionnement / Achats\n\nFiche :\nNo dossier(s) interne(s) :\nNo LV : NE S'APPLIQUE PAS\nDISTRICT(S) : 00-Tous les districts\nActions : OCTROI"));
  assert.ok(m.includes('\nMontant : 839 679,72 $\n'));
  assert.ok(m.includes('Décisions antérieures :\n2020-12-01 CM-20201201-1029 OCTROI - CONTRAT EXE-0420'));
  assert.ok(m.includes('Contexte et justifications :\nLe présent contrat'));
  assert.ok(m.includes('Résolution recommandée :\nde recommander au conseil'));
  assert.ok(!m.includes('Impacts majeurs'), 'une section « NE S’APPLIQUE PAS » ne va pas au modèle');
  assert.ok(!m.includes('TEXTE ENTIER'));
  // Sans champs de fond (gabarit inattendu, ou cache d'une lecture plus ancienne) : le texte.
  assert.equal(matiereDuSommaire({ champs: { ...champs, contexte: null, impacts: null, aspectsFinanciers: null, resume: null }, texte: 'TEXTE ENTIER' }), 'TEXTE ENTIER');
  assert.equal(matiereDuSommaire({ texte: 'TEXTE ENTIER' }), 'TEXTE ENTIER');
});

test('champsSommaire : un PDF hors gabarit ne plante pas, il avertit', () => {
  const { champs, avertissements } = champsSommaire(pages('700 | [42.5]Un document quelconque\n600 | [42.5]sans en-tête ni sections'));
  assert.equal(champs.numero, null);
  assert.equal(champs.contexte, null);
  assert.ok(avertissements.includes("numéro SD absent de l'en-tête"));
  assert.ok(avertissements.some((a) => /aucune section reconnue/.test(a)));
});
