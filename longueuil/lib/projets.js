// Les projets de Longueuil qu'on peut suivre dans leur ensemble, plutôt qu'une décision à la fois.
//
// Même mécanique qu'à Québec et à Lévis (quebec/lib/projets.js, levis/lib/projets.js) : chaque
// projet est défini À LA MAIN par une règle sur l'objet des décisions, relue sur ses résultats
// avant d'être ajoutée. Relevé du 21 septembre 2026 sur les 901 décisions de 2026, avec ce qui a
// été écarté et pourquoi.
//
// Un seul projet pour l'instant. Le reste de ce que Longueuil décide en 2026 est de la mécanique
// administrative qui ne raconte pas d'histoire suivable : « services professionnels » (56),
// « honoraires professionnels » (37), « aide financière » (36). Poser une règle sur une
// fréquence, ce serait inventer un projet là où il n'y en a pas.

export const PROJETS = {
  eau: {
    titre: 'Eau potable et eaux usées',
    description:
      "Les réseaux d'eau de l'agglomération et leur capacité : le Centre d'épuration Rive-Sud, la mise à niveau des stations de pompage, le prolongement du collecteur Sud-Est, les conduites et les compteurs — et le contrôle provisoire qui limite les nouvelles constructions là où les réseaux ne suivent plus.",
    // 72 décisions, 43 dossiers. Elles se tiennent : les travaux au centre d'épuration, les
    // stations de pompage locales et d'agglomération, l'aqueduc et l'égout sanitaire, les
    // compteurs d'eau, et le règlement CO-2025-1311 de contrôle provisoire — qui dit noir sur
    // blanc que certaines interventions créeraient « des besoins excédant la capacité des
    // réseaux municipaux d'aqueduc ou d'égout ». C'est la même histoire que les stations
    // d'épuration de Lévis : un réseau à bout de souffle et ce que la Ville fait avec.
    regle: /eaux us[ée]es|eau potable|assainissement des eaux|[Cc]entre d.[ée]puration|conduite d.eau|[ée]gout sanitaire|aqueduc|stations? de pompage|instruments de mesure de quantit[ée] d.eau|compteurs d.eau|capacit[ée] d.alimentation|gestion de l.eau/i,
    // Écarté — le Règlement CA-2026-458 et ses quatre étapes : il achète des « équipements
    // motorisés ou roulants relevant de la compétence en matière d'assainissement des eaux
    // usées ». C'est du parc de véhicules, pas les réseaux. (Lévis écarte de même l'entretien
    // courant de son réseau.)
    //
    // Écartés aussi, sans avoir besoin d'exclusion parce que la règle ne les attrape pas :
    //   • les « jeux d'eau » des parcs Immaculée-Conception et Jean-Louis, et la « gestion des
    //     eaux » du parc Mégantic — des aires de jeu et du pluvial, pas les réseaux ;
    //   • le ponceau Maricourt sur le ruisseau Daigneault — de la voirie ;
    //   • les chaudières à eau chaude des bâtiments municipaux ;
    //   • l'appui à l'organisme de bassin versant SCABRIC sur les pénuries d'eau souterraine —
    //     la Ville appuie la démarche d'un tiers, elle ne décide pas de ses réseaux.
    // Les trois premiers figurent quand même dans l'exclusion : « jeux d'eau », « chaudière à
    // eau » et « ponceau » sont assez proches du vocabulaire de la règle pour qu'un objet
    // futur les y fasse entrer par accident.
    //
    // « ponceau » NE SE TRANSPOSE PAS. Essayée telle quelle sur Laval, cette exclusion y
    // rejetait quatre vrais chantiers d'aqueduc (rang Saint-Elzéar, montée Rouville) où un
    // ponceau est remplacé en passant. Ici elle est juste parce que le seul ponceau de
    // Longueuil en 2026 est un ouvrage de voirie sur un ruisseau. Une exclusion se relit sur
    // les décisions de SA ville.
    exclusion: /[ée]quipements motoris[ée]s ou roulants|jeux d.eau|chaudi[èe]res? [àa] eau|ponceau/i,
  },
};

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => p.regle.test(objet) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
