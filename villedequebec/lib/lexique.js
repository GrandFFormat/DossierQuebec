// Lexique du vocabulaire décisionnel municipal.
//
// Les définitions sont écrites ici, par nous — ce ne sont pas des données de la Ville, et
// la page le dit clairement. Ce qui vient des données, en revanche, c'est la mesure : pour
// chaque terme, `scrapers/lexique.js` compte les documents où il apparaît et en attache un
// exemple réel. Une définition sans exemple, c'est une affirmation ; avec, c'est vérifiable.
//
// `recherche` est la formulation cherchée dans l'index. Quand elle diffère du terme (au
// pluriel, dans une tournure figée), c'est pour coller à ce que les documents écrivent
// vraiment.

export const CATEGORIES = {
  documents: 'Les documents',
  instances: 'Qui décide',
  agglomeration: 'Agglomération et villes reconstituées',
  vote: 'Voter et adopter',
  urbanisme: 'Urbanisme',
  argent: "L'argent et les contrats",
};

export const TERMES = [
  // ---------- Les documents ----------
  {
    terme: 'Résolution',
    categorie: 'documents',
    recherche: '"il est résolu"',
    definition:
      "La décision elle-même. Une fois adoptée, c'est l'acte officiel du conseil : elle porte un numéro (CV-2026-0123, CE-2026-0456…) et engage la Ville.",
    ouVousLeVoyez: "C'est le type de document le plus nombreux du portail.",
  },
  {
    terme: 'Sommaire décisionnel',
    categorie: 'documents',
    recherche: '"sommaire décisionnel"',
    definition:
      "La note que l'administration municipale rédige AVANT la décision, pour l'expliquer aux élus : exposé de la situation, décisions antérieures, analyse des solutions, recommandation, impact financier. C'est le « pourquoi » derrière la résolution.",
    ouVousLeVoyez:
      "C'est à partir de ce document que les résumés en langage clair du site sont produits — le raisonnement y est déjà écrit par la Ville.",
  },
  {
    terme: 'Procès-verbal',
    categorie: 'documents',
    recherche: '"procès-verbal de la séance"',
    definition:
      "Le compte rendu officiel d'une séance : qui était présent, ce qui a été décidé, et — quand quelqu'un l'a demandé — qui a voté quoi.",
    ouVousLeVoyez:
      "C'est la source des votes nominatifs du site, et la seule source qui donne la composition réelle de chaque instance.",
  },
  {
    terme: 'Avis de motion',
    categorie: 'documents',
    recherche: '"avis de motion"',
    definition:
      "L'annonce qu'un règlement sera présenté à une séance suivante. Ça ne décide rien : ça prévient. C'est une étape obligatoire avant d'adopter un règlement.",
    ouVousLeVoyez: 'Souvent suivi, quelques semaines plus tard, de l\'adoption du règlement annoncé.',
  },
  {
    terme: 'Ordonnance',
    categorie: 'documents',
    recherche: 'ordonnance',
    definition:
      "Une décision d'application, prise en vertu d'un règlement déjà en vigueur. Elle ajuste des détails concrets sans qu'on doive rouvrir le règlement lui-même.",
    ouVousLeVoyez:
      'Très fréquente pour le stationnement et la circulation : « Ordonnance numéro O-604 concernant des modifications aux règles portant sur le stationnement ».',
  },
  {
    terme: 'Règlement',
    categorie: 'documents',
    recherche: '"adoption du règlement"',
    definition:
      "La forme la plus contraignante d'une décision municipale : une norme générale qui s'applique à tous. Son adoption suit des étapes obligatoires (avis de motion, projet, adoption).",
    ouVousLeVoyez:
      'Les numéros disent l\'instance : R.V.Q. pour la ville, R.A.V.Q. pour l\'agglomération, R.C.A. pour un arrondissement.',
  },
  {
    terme: 'Tableau des décisions',
    categorie: 'documents',
    recherche: '"tableau des décisions"',
    definition: "Le récapitulatif des décisions prises à une séance, sous forme de liste.",
    ouVousLeVoyez: "Utile pour balayer une séance d'un coup d'œil, sans lire tout le procès-verbal.",
  },

  // ---------- Qui décide ----------
  {
    terme: 'Conseil municipal',
    categorie: 'instances',
    recherche: '"conseil de la ville"',
    definition:
      "Les 22 élus de la Ville de Québec : le maire et 21 conseillères et conseillers, un par district. Il adopte les règlements, le budget, et les décisions les plus importantes.",
    ouVousLeVoyez: 'Ses séances sont publiques et webdiffusées, avec une période de questions des citoyens.',
  },
  {
    terme: 'Comité exécutif',
    categorie: 'instances',
    recherche: '"comité exécutif"',
    definition:
      "Un petit groupe d'élus — 9 à Québec — à qui le conseil a délégué une large part de ses pouvoirs. C'est l'instance qui prend le plus de décisions, et de loin.",
    ouVousLeVoyez:
      "Plus de 70 000 documents du portail viennent du comité exécutif, contre environ 35 000 pour le conseil de la ville.",
  },
  {
    terme: "Conseil d'arrondissement",
    categorie: 'instances',
    recherche: "\"conseil d'arrondissement\"",
    definition:
      "Chacun des six arrondissements de Québec a son conseil, formé des conseillers des districts qui le composent. Il décide de ce qui est local : urbanisme de proximité, loisirs, vie de quartier.",
    ouVousLeVoyez: 'Les six : La Cité-Limoilou, Les Rivières, Sainte-Foy–Sillery–Cap-Rouge, Charlesbourg, Beauport, La Haute-Saint-Charles.',
  },
  {
    terme: "Commission d'urbanisme et de conservation de Québec",
    aussi: 'CUCQ',
    categorie: 'instances',
    recherche: "\"Commission d'urbanisme et de conservation\"",
    definition:
      "Une commission qui rend des décisions contraignantes en urbanisme : apparence architecturale, démolitions, secteurs patrimoniaux. Elle est présidée par des élus, mais la majorité de ses membres ne sont pas élus.",
    ouVousLeVoyez:
      "Un permis peut dépendre de son avis. C'est l'instance la moins connue parmi celles qui décident vraiment.",
  },
  {
    terme: 'Greffier',
    categorie: 'instances',
    recherche: 'greffier',
    definition:
      "L'officier qui garde les documents officiels de la Ville, rédige les procès-verbaux et certifie les décisions. Ce n'est pas un élu.",
    ouVousLeVoyez: "Sa signature clôt les procès-verbaux, avec celle de la présidence d'assemblée.",
  },

  // ---------- Agglomération ----------
  {
    terme: "Conseil d'agglomération",
    categorie: 'agglomeration',
    recherche: "\"conseil d'agglomération\"",
    definition:
      "Neuf sièges où Québec siège avec L'Ancienne-Lorette et Saint-Augustin-de-Desmaures, pour décider des services partagés par les trois villes.",
    ouVousLeVoyez:
      "Selon la Ville : évaluation foncière, transport en commun, réseau artériel, eau potable et traitement, matières résiduelles, sécurité publique (police, incendie, 911), cour municipale, logement social et itinérance, développement économique.",
  },
  {
    terme: 'Ville reconstituée',
    aussi: 'ville défusionnée · municipalité liée',
    categorie: 'agglomeration',
    recherche: '"villes reconstituées"',
    definition:
      "Une ville qui avait été fusionnée à Québec en 2002 et qui a repris son existence propre en 2006 à la suite d'un référendum. Elle a son propre conseil et son propre maire. Dans le texte de loi et dans les documents de la Ville, on lit plus souvent « municipalité liée » — qui désigne les trois villes de l'agglomération, Québec comprise.",
    ouVousLeVoyez:
      "Deux dans l'agglomération de Québec : L'Ancienne-Lorette et Saint-Augustin-de-Desmaures. Leurs élus votent à l'agglomération, mais ne siègent pas au conseil municipal de Québec et ne représentent aucun district de Québec.",
  },
  {
    terme: "Compétence d'agglomération",
    categorie: 'agglomeration',
    recherche: "\"compétence d'agglomération\"",
    definition:
      "Un domaine que la loi confie au conseil d'agglomération plutôt qu'à chaque ville séparément, parce que le service est partagé. Le reste — ce qu'on appelle les compétences de proximité — demeure à chaque ville.",
    ouVousLeVoyez: "C'est ce qui explique qu'un élu d'une autre ville vote sur des dossiers qui touchent Québec.",
  },

  // ---------- Voter et adopter ----------
  {
    terme: 'Demander le vote',
    categorie: 'vote',
    recherche: '"demande le vote"',
    definition:
      "Exiger qu'on compte les voix une à une. Sans cette demande, une décision est adoptée sans appel nominal et personne n'est nommé au procès-verbal.",
    ouVousLeVoyez:
      "C'est la clé du registre des votes du site : les seuls votes dont on connaît le détail sont ceux que quelqu'un a demandés.",
  },
  {
    terme: "Adoptée à l'unanimité",
    categorie: 'vote',
    recherche: "\"adoptée à l'unanimité\"",
    definition: "Personne n'a voté contre.",
    ouVousLeVoyez: "La formule la plus courante, parce que la plupart des décisions passent sans opposition.",
  },
  {
    terme: 'Adoptée à la majorité',
    categorie: 'vote',
    recherche: '"adoptée à la majorité"',
    definition: "Adoptée, mais au moins une personne a voté contre. Le procès-verbal nomme alors qui.",
    ouVousLeVoyez: "C'est le cas de la quasi-totalité des votes nominatifs du site.",
  },
  {
    terme: 'Adoptée sur division',
    categorie: 'vote',
    recherche: '"adoptée sur division"',
    definition:
      "Adoptée malgré une opposition consignée, sans qu'on ait nécessairement compté les voix nominativement.",
    ouVousLeVoyez: "Plus rare que « à la majorité », et moins informatif : on sait qu'il y a eu désaccord, pas toujours de qui.",
  },
  {
    terme: 'Prise d’acte',
    categorie: 'vote',
    recherche: "\"prise d'acte\"",
    definition:
      "Le conseil constate officiellement qu'un document lui a été présenté. Ça ne l'approuve pas : ça l'enregistre.",
    ouVousLeVoyez: "Souvent pour des rapports, des ententes déjà signées ou des dépôts obligatoires.",
  },
  {
    terme: 'Mairesse suppléante',
    aussi: 'maire suppléant',
    categorie: 'vote',
    recherche: 'suppléant',
    definition: "L'élu désigné pour remplacer le maire quand celui-ci est absent ou empêché.",
    ouVousLeVoyez:
      "Aux séances d'agglomération de 2026, le maire de Québec a été remplacé à chacune des douze séances.",
  },

  // ---------- Urbanisme ----------
  {
    terme: 'Dérogation mineure',
    categorie: 'urbanisme',
    recherche: '"dérogation mineure"',
    definition:
      "Une permission d'écarter légèrement une règle du zonage pour un terrain précis — une marge, une hauteur, un nombre de cases de stationnement — sans changer le règlement pour tout le monde.",
    ouVousLeVoyez: "Presque toujours rattachée à une adresse précise, qui est nommée dans l'objet de la décision.",
  },
  {
    terme: "Plan d'implantation et d'intégration architecturale",
    aussi: 'PIIA',
    categorie: 'urbanisme',
    recherche: '"plan d\'implantation"',
    definition:
      "Un mécanisme qui soumet un projet à une évaluation de son apparence et de son insertion dans le milieu, au-delà des règles chiffrées du zonage.",
    ouVousLeVoyez:
      "C'est souvent ce qui amène un dossier devant la Commission d'urbanisme. Le vocabulaire de la Ville a changé en cours de route : l'acronyme pointé « P.I.I.A. » apparaît dans 4 352 documents, surtout entre 2006 et 2017, puis disparaît au profit de la formulation au long.",
  },
  {
    terme: 'Zonage',
    categorie: 'urbanisme',
    recherche: 'zonage',
    definition:
      "Le découpage du territoire en zones, avec pour chacune ce qu'on a le droit d'y construire et d'y faire.",
    ouVousLeVoyez: "La grille de zonage de Québec est publiée en données ouvertes.",
  },

  // ---------- Argent et contrats ----------
  {
    terme: 'Adjudication',
    categorie: 'argent',
    recherche: 'adjudication',
    definition: "L'attribution officielle d'un contrat à un soumissionnaire, au terme d'un appel d'offres.",
    ouVousLeVoyez: "« Adjudication d'un contrat pour… » est l'une des formulations les plus fréquentes du portail.",
  },
  {
    terme: "Appel d'offres",
    categorie: 'argent',
    recherche: "\"appel d'offres\"",
    definition:
      "La mise en concurrence obligatoire avant d'accorder un contrat au-delà d'un certain montant. Public, il est ouvert à tous ; sur invitation, il est réservé à des fournisseurs sollicités.",
    ouVousLeVoyez: "Les contrats municipaux sont publiés sur le SEAO, le système électronique d'appel d'offres du Québec.",
  },
  {
    terme: 'Gré à gré',
    categorie: 'argent',
    recherche: '"de gré à gré"',
    definition:
      "Un contrat conclu directement, sans mise en concurrence. La loi ne le permet que dans des cas précis.",
    ouVousLeVoyez: "Apparaît aussi pour les acquisitions d'immeubles : « de gré à gré ou par expropriation ».",
  },
  {
    terme: 'Appropriation',
    categorie: 'argent',
    recherche: "\"appropriation d'un montant\"",
    definition: "Réserver une somme déjà disponible pour une dépense précise. Ce n'est pas un nouvel emprunt.",
    ouVousLeVoyez: "« Appropriation d'un montant de 2 510 000 $ à même le fonds général ».",
  },
  {
    terme: "Règlement d'emprunt",
    categorie: 'argent',
    recherche: "\"règlement d'emprunt\"",
    definition:
      "Le règlement par lequel la Ville s'autorise à emprunter pour financer un projet, en général un investissement de longue durée.",
    ouVousLeVoyez: "Il précise le montant et la durée du remboursement.",
  },
  {
    terme: 'Expropriation',
    categorie: 'argent',
    recherche: 'expropriation',
    definition:
      "L'acquisition forcée d'un terrain ou d'un droit par la Ville pour un motif d'utilité publique, avec indemnité au propriétaire.",
    ouVousLeVoyez:
      "Souvent suivie d'un « règlement hors tribunal », c'est-à-dire d'une entente sur l'indemnité sans aller devant le juge.",
  },
];
