// Les sujets qu'on peut suivre dans leur ensemble — le logement, l'eau, l'itinérance… —
// plutôt qu'une décision à la fois. Même rôle et même forme que quebec/lib/projets.js et
// levis/lib/projets.js, pour que « Mes dossiers » les lise sans rien savoir de la ville.
//
// UNE DIFFÉRENCE DE FOND AVEC QUÉBEC. Là-bas, un projet domine : le tramway, une centaine
// de décisions par an à lui seul, avec un début, un chantier et une fin. Montréal n'a pas
// son équivalent dans ses propres procès-verbaux, et ce n'est pas un défaut de lecture :
// ses grands chantiers appartiennent à d'autres — le REM à CDPQ Infra (4 décisions), la
// ligne bleue et le boulevard Pie-IX à l'ARTM et au gouvernement (2 et 0), le pont de
// l'Île-aux-Tourtes au ministère des Transports (aucune). La Ville n'en décide que les
// abords. Ce que Montréal décide vraiment, et en volume, ce sont des sujets récurrents :
// l'eau, le logement, les déchets, la neige.
//
// Chaque règle est définie À LA MAIN et relue sur ses résultats avant d'être ajoutée. Un
// mot-clé seul ment, et il ment discrètement :
//
//   • « \bREV\b » attrapait REVÊTEMENT, REVÊTEMENTS SCELL-TECH, planage et revêtement
//     bitumineux — parce qu'en JavaScript, sans l'option `u`, un « Ê » compte comme une
//     frontière de mot. D'où le `u` sur chacune des règles ci-dessous.
//   • « Pie-IX » attrapait une propriété située au 10111, boulevard Pie-IX, qui n'a rien
//     à voir avec le service rapide par bus : le sujet a été retiré plutôt que corrigé,
//     puisque la Ville n'en décide presque rien.
//
// `node scripts/verifier-projets.js` affiche, pour chaque sujet, son nombre de décisions
// et un échantillon, pour qu'on puisse relire après chaque modification. Un faux positif
// dans un sujet suivi, c'est un abonné qui reçoit une décision qui ne le concerne pas.
//
// Les chiffres en commentaire sont ceux des 5 244 résolutions de 2026 au 15 septembre.

export const PROJETS = {
  'eau-egouts': {
    titre: 'Eau potable, aqueduc et égouts',
    description: "Conduites, usines de production d'eau potable, station d'épuration Jean-R.-Marcotte, bassins de rétention.",
    regle: /\bconduites? d.eau|\baqueduc|\b[ée]gouts?\b|usine (?:de production )?d.eau|station d.[ée]puration|bassin de r[ée]tention/iu, // 80
  },
  'securite-publique': {
    titre: 'Police et sécurité publique',
    description: 'Le Service de police de la Ville de Montréal : contrats, postes de quartier, motions du conseil.',
    regle: /\bSPVM\b|Service de police de la Ville de Montr[ée]al|poste de quartier/iu, // 55
  },
  logement: {
    titre: 'Logement social et abordable',
    description: "Subventions, terrains et projets de logement social, abordable ou étudiant, dont ceux de la SHDM et de l'OMHM.",
    regle: /logements? (?:sociaux|social|abordables?)|habitation communautaire|Office municipal d.habitation|\bOMHM\b|\bSHDM\b|logement [ée]tudiant/iu, // 37
  },
  'matieres-residuelles': {
    titre: 'Matières résiduelles',
    description: 'Collectes, centres de tri, biométhanisation et écocentres.',
    regle: /mati[èe]res? r[ée]siduelles|centre de tri|biom[ée]thanisation|collecte des (?:ordures|d[ée]chets|mati[èe]res)|[ée]cocentre/iu, // 35
  },
  parcs: {
    titre: 'Parcs et espaces verts',
    description: "Aménagement et réfection de parcs, dont le Grand parc de l'Ouest.",
    regle: /am[ée]nagement du parc|r[ée]fection du parc|nouveau parc|grand parc de l.Ouest/iu, // 33
  },
  'plan-urbanisme': {
    titre: "Plan d'urbanisme et de mobilité",
    description: "Le PUM et les règlements de concordance que chaque arrondissement adopte pour s'y conformer.",
    regle: /plan d.urbanisme et de mobilit[ée]|\bPUM\b(?!\p{L})/iu, // 31
  },
  'transport-collectif': {
    titre: 'Transport collectif',
    description: "Ce que la Ville décide autour du réseau : terrains vendus à la STM, abords des stations, ententes.",
    regle: /\bSTM\b(?!\p{L})|Soci[ée]t[ée] de transport de Montr[ée]al|transport collectif|ligne bleue|R[ée]seau express m[ée]tropolitain/iu, // 29
  },
  itinerance: {
    titre: "Itinérance et hébergement d'urgence",
    description: "Soutien aux organismes, haltes-chaleur et refuges pour les personnes en situation d'itinérance.",
    regle: /itin[ée]ran|sans-abri|halte.chaleur|refuge pour personnes/iu, // 28
  },
  deneigement: {
    titre: 'Déneigement',
    description: "Contrats de déneigement et de chargement de la neige, épandage d'abrasifs, règlements de stationnement.",
    regle: /d[ée]neigement|chargement de la neige|[ée]pandage d.abrasifs/iu, // 25
  },
  velo: {
    titre: 'Vélo : REV, pistes cyclables et BIXI',
    description: 'Le Réseau express vélo, les pistes et voies cyclables, et le vélo en libre-service.',
    // « REV » suivi d'une majuscule accentuée ou non : le nom d'un axe (« REV Lajeunesse »).
    regle: /r[ée]seau express v[ée]lo|\bREV\s+\p{Lu}|pistes? cyclables?|voies? cyclables?|\bBIXI\b/iu, // 18
  },
  pietonnisation: {
    titre: 'Piétonnisation et places publiques',
    description: "Rues piétonnes, places publiques et ordonnances d'animation commerciale.",
    regle: /pi[ée]tonnisation|rues? pi[ée]tonnes?|place publique/iu, // 16
  },
  canopee: {
    titre: 'Canopée et verdissement',
    description: "Plantation d'arbres, verdissement, lutte contre l'agrile du frêne et les îlots de chaleur.",
    regle: /canop[ée]e|plantation d.arbres|verdissement|agrile du fr[êe]ne|[îi]lots de chaleur/iu, // 10
  },
};

// Les projets dont parle un objet de décision (clés), ou un tableau vide.
export function projetsDe(objet) {
  if (!objet) return [];
  return Object.entries(PROJETS)
    .filter(([, p]) => (p.regle.test(objet) || Boolean(p.regleExacte?.test(objet))) && !p.exclusion?.test(objet))
    .map(([cle]) => cle);
}
