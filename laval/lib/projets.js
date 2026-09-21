// Les projets de Laval qu'on pourrait suivre dans leur ensemble, plutôt qu'une décision à la
// fois.
//
// LA LISTE EST VIDE, ET C'EST VOULU. Même mécanique qu'à Québec et à Lévis (quebec/lib/projets.js,
// levis/lib/projets.js) : chaque projet y est défini À LA MAIN par une règle sur l'objet des
// décisions, relue sur ses résultats avant d'être ajoutée, avec la trace de ce qui a été écarté
// et pourquoi. Ce n'est pas une donnée qu'on dérive : c'est quelqu'un qui lit les décisions
// d'une ville et y reconnaît une histoire.
//
// Sur les 2 892 décisions de Laval relevées le 21 septembre 2026, ce qui revient le plus souvent
// est de la mécanique administrative, pas un projet identifiable :
//
//    160  comité exécutif                  93  prendre acte
//    126  dérogation mineure               64  honoraires supplémentaires
//    125  intégration architecturale       47  comité consultatif
//    115  services professionnels          44  traces québec
//    100  aide financière                  42  soutien technique
//
// Un seul candidat sérieux ressort : « Traces Québec » (44 décisions, contrat DOS-3497), le
// suivi de la traçabilité des sols excavés. L'inscrire suppose de lire ces 44 décisions et de
// vérifier qu'elles racontent bien une même chose — c'est le travail éditorial fait ailleurs,
// pas une règle qu'on pose à la fréquence.
//
// Tant que la liste est vide, le reste fonctionne quand même : data/dossiers.json,
// data/recentes.json et data/organismes.json sont produits à partir des vraies décisions, et
// Mes dossiers y trouve les décisions récentes, la vue par année et les organismes à suivre.
// Seule la section « projets » de Laval reste absente, ce qui est exact.
//
// Pour en ajouter un : reprendre la forme de levis/lib/projets.js
//     'cle-du-projet': { titre, description, regle: /…/i, exclusion?: /…/i }
// puis vérifier ce que la règle attrape avant de committer.
export const PROJETS = {};

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => p.regle.test(objet) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
