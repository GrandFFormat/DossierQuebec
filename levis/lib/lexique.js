// Lexique du vocabulaire décisionnel de la Ville de Lévis.
//
// Les définitions sont écrites ici, par nous — ce ne sont pas des textes de la Ville, et la
// page le dit clairement. Ce qui vient des données, c'est la mesure : pour chaque terme,
// `scrapers/lexique.js` compte les procès-verbaux et les résolutions de l'année où la
// formulation apparaît et en attache un exemple réel. Un terme à zéro occurrence est une
// formulation que la Ville n'emploie pas : on corrige la recherche ou on retire le terme.
//
// Les formulations cherchées sont celles relevées dans les procès-verbaux de Lévis de 2026
// (voir README, « Ce que les procès-verbaux contiennent »).
//
// `recherche` est une expression régulière (source) cherchée dans le texte des documents.

export const CATEGORIES = {
  documents: 'Les documents',
  instances: 'Qui décide',
  vote: 'Voter et adopter',
  urbanisme: 'Urbanisme',
  argent: "L'argent et les contrats",
};

export const TERMES = [
  // ---------- Les documents ----------
  {
    terme: 'Résolution',
    categorie: 'documents',
    recherche: '\\b(?:CV|CE)\\d{4}\\b|\\bCA(?:D|CCE|CCO)-\\d{4}-\\d{4}\\b',
    definition:
      "La décision elle-même, consignée au procès-verbal. À Lévis, son numéro dit quelle instance l'a prise : CV3490 pour le conseil de la Ville, CE3302 pour le comité exécutif, CAD-2026-0218, CACCE-2026-… ou CACCO-2026-… pour les trois conseils d'arrondissement.",
    ouVousLeVoyez: 'Chaque fiche de la page Décisions est une résolution lue dans le procès-verbal officiel.',
  },
  {
    terme: 'Document d’aide à la décision',
    aussi: 'sommaire décisionnel',
    categorie: 'documents',
    recherche: "document d['’]aide à la d[ée]cision|sommaire d[ée]cisionnel",
    definition:
      "La note que l'administration rédige avant la décision, pour l'expliquer aux élus : la situation, la recommandation, l'analyse, l'échéancier, les incidences financières. Son identifiant nomme la direction qui l'a préparé et l'année : FIN-2026-035 pour les Finances, URBA-SAT-2026-086 pour l'urbanisme.",
    ouVousLeVoyez:
      "Écrit sous le titre de la résolution (« Document d'aide à la décision FIN-2026-035 ») et relié au PDF du sommaire. Les résumés en langage clair du site sont produits à partir de ce document.",
  },
  {
    terme: 'Procès-verbal',
    categorie: 'documents',
    recherche: 'proc[èe]s-verbal',
    definition:
      "Le compte rendu officiel d'une séance : qui était présent, ce qui a été décidé et, quand le vote a été appelé, qui a voté quoi. Il est approuvé à la séance suivante, puis publié.",
    ouVousLeVoyez: "C'est la source de toutes les décisions et de tous les votes du site. Un par séance, en PDF, sur le site de la Ville.",
  },
  {
    terme: 'Ordre du jour',
    categorie: 'documents',
    recherche: 'ordre du jour',
    definition: "La liste des sujets qu'une séance doit traiter. Il est adopté en ouverture de séance, et la période de questions du conseil porte sur ses sujets.",
    ouVousLeVoyez: "« Adoption de l'ordre du jour » est presque toujours la deuxième résolution d'une séance.",
  },
  {
    terme: 'Avis de motion',
    categorie: 'documents',
    recherche: 'avis de motion',
    definition:
      "L'annonce qu'un règlement sera adopté à une séance suivante. Ça ne décide rien : ça prévient. C'est une étape obligatoire avant d'adopter un règlement, souvent accompagnée du dépôt du projet de règlement.",
    ouVousLeVoyez: 'Sur la page Décisions, le type « Avis de motion ».',
  },
  {
    terme: 'Règlement',
    categorie: 'documents',
    recherche: '\\bR[èe]glement RV',
    definition:
      "La forme la plus contraignante d'une décision municipale : une norme générale qui s'applique à tous. À Lévis, les règlements sont numérotés RV (RV3590) ou, pour les plus anciens, RV-année-… (RV-2011-11-23 sur le zonage et le lotissement).",
    ouVousLeVoyez: "« Adoption du Règlement RV… » : type « Règlement » sur la page Décisions. Un « projet de règlement » en est l'étape précédente.",
  },
  {
    terme: 'Dépôt',
    categorie: 'documents',
    recherche: '\\bd[ée]pos[ée]e?s?\\b',
    definition:
      "Un document présenté à l'instance pour information ou pour rendre des comptes (listes de contrats, virements de fonds, rapports de commissions). Rien n'est décidé : il est « déposé ».",
    ouVousLeVoyez: "« …est déposé, à titre de reddition de compte et d'information » : type « Dépôt » sur la page Décisions.",
  },

  // ---------- Qui décide ----------
  {
    terme: 'Conseil de la Ville',
    aussi: 'conseil municipal',
    categorie: 'instances',
    recherche: 'conseil de la Ville',
    definition:
      "L'instance qui adopte les règlements, le budget et les décisions les plus importantes. À Lévis : le maire et 15 conseillères et conseillers, un par district. Ses séances sont publiques.",
    ouVousLeVoyez: "Ses résolutions portent le préfixe CV. C'est la seule instance dont les votes sont nommés sur la page Votes.",
  },
  {
    terme: 'Comité exécutif',
    categorie: 'instances',
    recherche: 'comit[ée] ex[ée]cutif',
    definition:
      "Un petit groupe d'élus présidé par le maire, qui prépare les dossiers du conseil et décide de ce qui lui est délégué (contrats, aides financières, gestion courante). Beaucoup de dossiers passent par lui avant d'aller au conseil de la Ville.",
    ouVousLeVoyez: "Préfixe CE. « Il est résolu de recommander au conseil de la Ville… » : le dossier poursuit sa route au conseil.",
  },
  {
    terme: "Conseil d'arrondissement",
    categorie: 'instances',
    recherche: "conseil d['’]arrondissement",
    definition:
      "Lévis compte trois arrondissements — Desjardins, Chutes-de-la-Chaudière-Est et Chutes-de-la-Chaudière-Ouest — et chacun a son conseil, formé des élus de ses districts. Il tranche surtout des questions d'urbanisme de proximité.",
    ouVousLeVoyez: 'Préfixes CAD, CACCE et CACCO. Page Conseil municipal : leur composition, lue dans les listes de présences.',
  },
  {
    terme: 'Président du conseil',
    categorie: 'instances',
    recherche: 'pr[ée]sident du conseil',
    definition:
      "L'élu qui dirige les séances du conseil de la Ville : il donne la parole, appelle le vote et déclare les résultats. Ce n'est pas le maire.",
    ouVousLeVoyez: "« Le président du conseil appelle le vote sur la proposition » : c'est à ce moment qu'un vote nominatif commence.",
  },
  {
    terme: 'Greffière',
    aussi: 'greffier',
    categorie: 'instances',
    recherche: 'greffi[èe]re?',
    definition: "La fonctionnaire qui tient les registres officiels de la Ville : elle rédige et signe les procès-verbaux, et certifie les documents.",
    ouVousLeVoyez: "Nommée dans la liste « Assistent à la séance » de chaque procès-verbal du conseil.",
  },
  {
    terme: 'Commission',
    categorie: 'instances',
    recherche: 'commission (?:des|de la|de l[’\']|sur)',
    definition:
      "Un groupe d'élus qui étudie un domaine (finances, eau et environnement, planification du territoire, sécurité urbaine…) et fait des recommandations. Une commission ne décide pas : le comité exécutif ou le conseil tranche.",
    ouVousLeVoyez: "« Recommandation formulée par la commission… » dans l'objet d'une résolution.",
  },

  // ---------- Voter et adopter ----------
  {
    terme: 'Il est proposé par… Appuyé par…',
    categorie: 'vote',
    recherche: 'Il est propos[ée] par',
    definition:
      "Au conseil, une proposition doit être présentée par un membre et appuyée par un second avant d'être mise aux voix. Ça ne dit pas comment les autres ont voté.",
    ouVousLeVoyez: 'En tête du dispositif de chaque résolution du conseil de la Ville et des conseils d’arrondissement.',
  },
  {
    terme: 'Appeler le vote',
    aussi: 'vote nominatif',
    categorie: 'vote',
    recherche: 'appelle le vote',
    definition:
      "À la demande d'un membre, le président du conseil fait voter nommément : le procès-verbal consigne alors qui vote en faveur et qui vote en défaveur. Sans cette demande, personne n'est nommé.",
    ouVousLeVoyez: "La page Votes nominatifs reprend chacun de ces votes. L'absence de vote appelé ne veut pas dire qu'il y a eu consensus.",
  },
  {
    terme: "Adoptée à l'unanimité",
    categorie: 'vote',
    recherche: "adopt[ée]e? à l['’]unanimit[ée]",
    definition: "Aucun membre présent ne s'y est opposé. C'est la formule de la très grande majorité des résolutions.",
    ouVousLeVoyez: 'Le résultat affiché sur la plupart des fiches de la page Décisions.',
  },
  {
    terme: 'Adoptée à la majorité',
    categorie: 'vote',
    recherche: 'adopt[ée]e? à la majorit[ée]',
    definition:
      "Au moins un membre a voté contre. Au conseil de la Ville, ça suit un vote appelé, avec les noms. En conseil d'arrondissement, la formule est souvent écrite seule, sans noms.",
    ouVousLeVoyez: 'Sur la fiche de la décision ; au conseil de la Ville, le détail est sur la page Votes.',
  },
  {
    terme: 'Proposition d’amendement',
    categorie: 'vote',
    recherche: "proposition d['’]amendement|proposition principale",
    definition:
      "Une modification proposée en séance au texte d'une résolution. On vote d'abord sur l'amendement, puis sur la proposition principale, telle qu'amendée ou non.",
    ouVousLeVoyez: 'Une même résolution peut alors porter deux votes nominatifs sur la page Votes.',
  },
  {
    terme: "Conflit d'intérêts",
    categorie: 'vote',
    recherche: "conflit d['’]int[ée]r[êe]ts",
    definition:
      "Un élu qui a un intérêt personnel dans un dossier doit le déclarer et s'abstenir de participer aux discussions et au vote sur ce dossier.",
    ouVousLeVoyez: "« …annonce qu'il considère se trouver en conflit d'intérêts concernant ce sujet » dans le procès-verbal.",
  },

  // ---------- Urbanisme ----------
  {
    terme: 'Dérogation mineure',
    categorie: 'urbanisme',
    recherche: 'd[ée]rogations? mineures?',
    definition:
      "Une permission d'écart léger au règlement de zonage pour un terrain précis (une marge de recul, une hauteur), accordée par le conseil d'arrondissement quand l'application stricte causerait un préjudice sérieux au propriétaire sans nuire aux voisins.",
    ouVousLeVoyez: "« Demande de dérogation mineure – … » : de loin l'objet le plus fréquent en conseil d'arrondissement.",
  },
  {
    terme: 'PIIA',
    aussi: "plan d'implantation et d'intégration architecturale",
    categorie: 'urbanisme',
    recherche: "\\bPIIA\\b|plans? d['’]implantation et d['’]int[ée]gration architecturale",
    definition:
      "Un règlement qui soumet certains travaux (enseignes, rénovations, constructions dans un secteur patrimonial) à l'approbation de leurs plans, selon des objectifs d'apparence et d'intégration au milieu.",
    ouVousLeVoyez: "« PIIA - Installation d'une enseigne… » en conseil d'arrondissement.",
  },
  {
    terme: 'Usage conditionnel',
    categorie: 'urbanisme',
    recherche: 'usages? conditionnels?',
    definition:
      "Un usage que le zonage n'autorise pas d'emblée dans une zone, mais que le conseil peut permettre à un endroit précis, à certaines conditions.",
    ouVousLeVoyez: "La résolution énumère les conditions ; le droit peut se perdre si elles cessent d'être respectées.",
  },
  {
    terme: 'Zonage et lotissement',
    categorie: 'urbanisme',
    recherche: 'zonage et (?:le )?lotissement',
    definition:
      "Le règlement qui découpe le territoire en zones et dit ce qu'on peut y construire et y faire, et comment les terrains peuvent être divisés. À Lévis, c'est le Règlement RV-2011-11-23, modifié à répétition.",
    ouVousLeVoyez: '« Règlement RV… modifiant le Règlement RV-2011-11-23 sur le zonage et le lotissement » dans les objets du conseil.',
  },
  {
    terme: 'Consultation écrite',
    aussi: 'assemblée publique de consultation',
    categorie: 'urbanisme',
    recherche: 'consultation [ée]crite|assembl[ée]es? publiques? de consultation',
    definition: "L'étape où la population peut commenter un projet de règlement d'urbanisme ou une demande (par écrit ou en assemblée) avant que l'instance ne décide.",
    ouVousLeVoyez: "« Rapport sur la consultation écrite » en ouverture des séances d'arrondissement.",
  },

  // ---------- L'argent et les contrats ----------
  {
    terme: 'Attribution du contrat',
    categorie: 'argent',
    recherche: 'attribu(?:tion|er) (?:du|le|d[’\']un) contrat',
    definition:
      "La décision de confier un contrat à une entreprise, habituellement le plus bas soumissionnaire conforme à la suite d'un appel d'offres. Le montant est écrit avant taxes.",
    ouVousLeVoyez: "« Il est résolu d'attribuer le contrat… pour une dépense estimée à … $, avant TPS et TVQ ».",
  },
  {
    terme: "Appel d'offres",
    categorie: 'argent',
    recherche: "appel d['’]offres",
    definition: "La mise en concurrence publique des entreprises pour un contrat, obligatoire au-delà de certains montants. Il porte un numéro (2026-50-84).",
    ouVousLeVoyez: "Entre parenthèses dans la résolution qui attribue le contrat.",
  },
  {
    terme: 'Aide financière',
    categorie: 'argent',
    recherche: 'aide financi[èe]re',
    definition: "Une somme versée par la Ville à un organisme ou à un projet, souvent dans le cadre d'un programme, avec un montant maximum.",
    ouVousLeVoyez: '« Aide financière à … » dans l’objet ; le montant et le programme dans le dispositif.',
  },
  {
    terme: 'Réserve financière',
    categorie: 'argent',
    recherche: 'r[ée]serve financi[èe]re',
    definition: "Une somme mise de côté par règlement pour une fin précise (logement abordable, développement du territoire…), dans laquelle la Ville puise par résolution.",
    ouVousLeVoyez: '« …à même la réserve financière pour… » dans le dispositif.',
  },
  {
    terme: 'Virement de fonds',
    categorie: 'argent',
    recherche: 'virements? de fonds',
    definition: "Le déplacement de crédits d'un poste budgétaire à un autre en cours d'année. Les listes sont déposées au conseil, pour information.",
    ouVousLeVoyez: '« Dépôt des listes de virements de fonds pour la période du… ».',
  },
];
