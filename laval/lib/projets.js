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
// « Traces Québec » (44 décisions) avait l'air d'un candidat. Les 48 décisions qui le
// mentionnent ont été lues le 21 septembre 2026 : ce n'en est pas un. Ce sont 44 autorisations
// de paiement identiques — « Autorisation - paiement - traces québec - contrat DOS-XXXX » —
// une par contrat de construction, pour le service de traçabilité des sols excavés. Les 44
// contrats n'ont rien à voir entre eux, et DOS-3497, qui revient le plus, est la construction
// d'un chalet et de jeux d'eau dans un parc. C'est une ligne de frais récurrente, pas une
// histoire. En faire un projet suivable enverrait le lecteur vers 44 paiements sans rapport.
//
// Longueuil, lui, a bien un projet (voir longueuil/lib/projets.js) : ses décisions sur l'eau
// se tiennent parce qu'un règlement de contrôle provisoire y limite la construction là où les
// réseaux sont saturés. Rien d'équivalent ne ressort à Laval pour 2026.
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
