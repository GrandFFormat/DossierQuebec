// Les projets qu'on peut suivre dans leur ensemble — le tramway, le logement… — plutôt qu'une
// décision à la fois.
//
// Chaque projet est défini À LA MAIN et vérifié sur les données : une règle sur l'objet des
// décisions, et au besoin une exclusion. Un mot-clé seul ne suffit pas (« Chauveau » ramène un
// parc, un organisme jeunesse et des refoulements d'égouts ; « tram » ramène « Trame
// d'actions ») : chaque règle ci-dessous a été relue sur ses résultats avant d'être ajoutée.
// `node scripts/verifier-projets.js` affiche, pour chaque projet, le nombre de décisions et un
// échantillon, pour qu'on puisse la relire encore après une modification.

export const PROJETS = {
  tramway: {
    titre: 'Tramway (TramCité)',
    description: "Le réseau structurant de transport en commun : financement, terrains et servitudes, arbres, chantiers.",
    // Les objets sont souvent tronqués par la Ville (« … relativement au projet de Réseau
    // structurant », « projet TramC ») : la règle vise les débuts de mots. À Québec, « réseau
    // structurant » ne désigne que ce projet (vérifié sur 2025 et 2026).
    regle: /\btramway\b|\bTramC|r[ée]seau structurant/i,
  },
  logement: {
    titre: 'Logement social et abordable',
    description: 'Programmes, réserves, subventions et prêts aux organismes, terrains pour du logement social ou abordable.',
    regle: /logements? (?:sociaux|social|abordables?|hors march[ée])|projets durables en habitation|Un toit en r[ée]serve|Office municipal d'habitation/i,
    // L'organisme UTILE, en majuscules seulement : sans respecter la casse, « utile » attrapait
    // « s'il n'existe pas d'autre remède utile » (une poursuite pour un bâtiment dangereux).
    regleExacte: /\bUTILE\b/,
  },
  'matieres-residuelles': {
    titre: 'Matières résiduelles',
    description: "Collectes, incinérateur (Complexe de valorisation énergétique), biométhanisation et centre de tri.",
    regle: /biom[ée]thanisation|mati[èe]res? r[ée]siduelles|centre de tri|valorisation [ée]nerg[ée]tique|incin[ée]rateur|mati[èe]re organique|collectes? des? (?:ordures|d[ée]chets|feuilles|r[ée]sidus verts|encombrants)/i,
  },
  expocite: {
    titre: 'ExpoCité et Centre Vidéotron',
    description: "Le site d'ExpoCité, le Centre Vidéotron et le pavillon Guy-Lafleur : entretien, contrats, événements.",
    regle: /ExpoCit[ée]|Centre Vid[ée]otron|pavillon Guy.Lafleur/i,
  },
  'milieux-humides': {
    titre: 'Milieux humides et hydriques',
    description: 'Règles sur les rives et zones inondables, restauration et création de milieux humides.',
    regle: /milieux humides|milieux hydriques|humides et hydriques/i,
  },
  'galeries-charlesbourg': {
    titre: 'Requalification des Galeries Charlesbourg',
    description: 'Le redéveloppement du site des Galeries Charlesbourg, par phases jusqu’en 2035.',
    regle: /Galeries Charlesbourg/i,
  },
  // La clé garde l'ancien nom : elle est enregistrée dans les suivis (« projet:interconnexion-quebec-levis »).
  // Le titre dit ce que la Ville de Québec décide, sur son territoire : ce n'est pas un suivi de Lévis.
  'interconnexion-quebec-levis': {
    titre: "Corridor de l'avenue des Hôtels (lien avec Lévis)",
    description: "Le corridor de transport collectif de l'avenue des Hôtels, qui relie les autobus de Lévis au tramway.",
    regle: /interconnexion des r[ée]seaux de transport en commun|avenue des H[ôo]tels/i,
  },
};

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => (p.regle.test(objet) || Boolean(p.regleExacte?.test(objet))) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
