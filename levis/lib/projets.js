// Les projets de Lévis qu'on peut suivre dans leur ensemble, plutôt qu'une décision à la fois.
//
// Même mécanique qu'à Québec (quebec/lib/projets.js) : chaque projet est défini À LA MAIN par
// une règle sur l'objet des décisions, relue sur ses résultats avant d'être ajoutée
// (`node scripts/verifier-projets.js [cle]`). Relevé du 14 septembre 2026 sur les décisions de
// 2026, avec ce qui a été écarté et pourquoi.

export const PROJETS = {
  'stations-epuration': {
    titre: "Stations d'épuration de Saint-Nicolas et de Desjardins",
    description:
      "Les deux stations de traitement des eaux usées n'ont plus de capacité : règlements provisoires qui limitent la construction, agrandissements, aide demandée à Québec (FIERH).",
    // Écartés : les postes de pompage (PP-2, PP-3, Atkinson), entretien courant du réseau, et les
    // règlements d'emprunt RV3580 et RV3581 (« travaux permanents de traitement des eaux et
    // d'aqueduc ») dont l'objet ne rattache pas l'emprunt aux deux stations.
    regle: /FIERH|capacit[ée] de la station de traitement|station de traitement des eaux us[ée]es|caract[èe]re provisoire afin d.interdire certaines interventions susceptibles de cr[ée]er des besoins/i,
  },
  logement: {
    titre: 'Logement social et abordable',
    description: "Contributions de la Ville aux projets de logements abordables, programme d'habitation abordable Québec (PHAQ), Office municipal d'habitation.",
    regle: /logements? (?:sociaux|social|abordables?|hors march[ée]|communautaires?)|habitation abordable|\bPHAQ\b|Office municipal d.habitation/i,
  },
  'jeux-du-quebec-2030': {
    titre: 'Lévis 2030 — Finale des Jeux du Québec',
    description: "La candidature de Lévis pour accueillir la Finale des Jeux du Québec d'hiver 2030.",
    regle: /Jeux du Qu[ée]bec|L[ée]vis 2030/i,
  },
  'guillaume-couture': {
    titre: 'Projet Guillaume-Couture',
    description: 'Le réaménagement du boulevard Guillaume-Couture : études et financement de la phase 2.',
    // « boulevard Guillaume-Couture » seul ramène 44 PIIA et enseignes de commerces qui ont une
    // adresse sur le boulevard : on ne garde que « projet Guillaume-Couture ».
    regle: /projet Guillaume-Couture/i,
  },
};

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => p.regle.test(objet) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
