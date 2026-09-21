// Les projets de Laval qu'on peut suivre dans leur ensemble, plutôt qu'une décision à la fois.
//
// Même mécanique qu'à Québec, Montréal et Lévis : chaque projet est défini À LA MAIN par une
// règle sur l'objet des décisions, relue sur ses résultats avant d'être ajoutée. Relevé du
// 21 septembre 2026 sur les 2 892 décisions de 2026, avec ce qui a été écarté et pourquoi.

export const PROJETS = {
  eau: {
    titre: 'Eau potable, égouts et drainage',
    description:
      "Les réseaux d'eau de Laval : la mise à jour du plan directeur, la réhabilitation sans tranchée des conduites d'égout, les travaux d'aqueduc et de drainage, les stations de pompage et de traitement, les réservoirs, et la Stratégie municipale d'économie d'eau potable.",
    // 128 décisions, 66 dossiers. Laval a un Service de la gestion de l'eau, et ses décisions
    // le montrent : plan directeur, réhabilitation d'égouts, prolongements d'aqueduc,
    // dispositifs anti-refoulement, chlore gazeux pour les stations, bilan annuel de l'usage
    // de l'eau déposé au MAMH. La Ville elle-même regroupe presque toujours « aqueduc, égouts
    // et drainage » dans un même objet : le pluvial fait donc partie de l'histoire ici,
    // contrairement à Longueuil où « gestion des eaux » ne désignait qu'un réaménagement de parc.
    regle: /eaux us[ée]es|eaux pluviales|eau potable|assainissement des eaux|[ée]gout|aqueduc|conduite d.eau|stations? de pompage|usine de filtration|r[ée]servoir|compteurs d.eau|gestion de l.eau|usage de l.eau|[ée]conomie d.eau/i,
    // Écarté — le mandat de génie conseil pour « le remplacement des réservoirs pétroliers au
    // garage municipal du secteur 4 » : un réservoir, mais de carburant. C'est la seule raison
    // d'être de l'exclusion sur les réservoirs ; sans elle, `réservoir` attrape le garage en
    // même temps que le réservoir Cartier et celui de silicate de la station Pont-Viau.
    //
    // NE PAS reprendre ici l'exclusion « ponceau » de Longueuil. Elle y vise un ponceau de
    // voirie sur un ruisseau ; à Laval, les ponceaux n'apparaissent qu'à l'intérieur de vrais
    // chantiers d'aqueduc (rang Saint-Elzéar, montée Rouville), et l'exclusion en rejetait
    // quatre à tort. Une exclusion écrite pour une ville n'est pas transposable à une autre.
    //
    // Restent dehors, sans exclusion parce que la règle ne les attrape pas : les jeux d'eau et
    // le chalet du contrat DOS-3497, les conteneurs de Waste Connections, une exemption de
    // stationnement au 1323, chemin du Bord-de-l'Eau, et l'aide à l'Équipe aquatique unifiée.
    exclusion: /r[ée]servoirs? p[ée]troliers?|jeux d.eau|chaudi[èe]res? [àa] eau|[ée]quipements motoris[ée]s ou roulants/i,
  },
};

// « Traces Québec » (44 décisions) avait l'air d'un second candidat. Les 48 décisions qui le
// mentionnent ont été lues le 21 septembre 2026 : ce n'en est pas un. Ce sont 44 autorisations
// de paiement identiques — « Autorisation - paiement - traces québec - contrat DOS-XXXX » — une
// par contrat de construction, pour le service de traçabilité des sols excavés. Les 44 contrats
// n'ont rien à voir entre eux, et DOS-3497, qui revient le plus, est la construction d'un chalet
// et de jeux d'eau dans un parc. C'est une ligne de frais récurrente, pas une histoire : en
// faire un projet suivable enverrait le lecteur vers 44 paiements sans rapport.
//
// Le reste de ce que Laval décide en 2026 est de la mécanique administrative qui ne raconte pas
// d'histoire suivable : « comité exécutif » (160), « dérogation mineure » (126), « intégration
// architecturale » (125). Poser une règle sur une fréquence, ce serait inventer un projet.

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => p.regle.test(objet) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
