// Lexique du vocabulaire décisionnel de la Ville de Longueuil.
//
// Les définitions sont écrites ici, par nous — ce ne sont pas des textes de la Ville, et la page
// le dit. Ce qui vient des données, c'est la mesure : pour chaque terme, `scrapers/lexique.js`
// compte les procès-verbaux et les résolutions de l'année où la formulation apparaît et en attache
// un exemple réel. Un terme qui tombe à zéro est une formulation que la Ville n'emploie pas : on
// le retire ou on le corrige.
//
// `recherche` est une expression régulière (source) cherchée dans le texte des procès-verbaux.

export const CATEGORIES = {
  documents: 'Les documents',
  instances: 'Qui décide',
  agglomeration: 'Agglomération et villes liées',
  vote: 'Voter et adopter',
  urbanisme: 'Urbanisme',
  argent: "L'argent et les contrats",
};

export const TERMES = [
  // ---------- Les documents ----------
  {
    terme: 'Résolution',
    categorie: 'documents',
    recherche: 'Il est propos[ée]',
    definition:
      "La décision elle-même. Une fois adoptée, c'est l'acte officiel de l'instance. Son numéro dit qui l'a prise, quand, et à quel point de l'ordre du jour : CO-260616-4.3, c'est le conseil de ville (CO), le 16 juin 2026, point 4.3. Le conseil d'agglomération signe CA ; une séance extraordinaire ajoute un X (COX, CAX).",
    ouVousLeVoyez: 'Chaque fiche de la page Décisions est une résolution lue dans le procès-verbal officiel.',
  },
  {
    terme: 'Sommaire décisionnel',
    aussi: 'SD',
    categorie: 'documents',
    recherche: 'SD-\\d{4}-\\d{3,5}',
    definition:
      "La note que l'administration rédige AVANT la décision, pour l'expliquer aux élus : la recommandation, le contexte, la justification, les décisions antérieures, les aspects financiers et juridiques, puis les approbations de la direction. Il porte un numéro — SD-2026-0984 — qui suit le dossier d'une instance à l'autre.",
    ouVousLeVoyez:
      "Le numéro est écrit entre parenthèses à la fin du titre de la résolution. C'est à partir de ce document que les résumés en langage clair du site sont produits.",
  },
  {
    terme: 'Document de séance',
    aussi: '« Global »',
    categorie: 'documents',
    recherche: 'ordre du jour',
    definition:
      "Le document complet que la Ville publie pour chaque séance : l'ordre du jour, puis, point par point, le sommaire décisionnel et ses annexes (contrats, plans, rapports). Plusieurs centaines de pages pour une séance ordinaire du conseil de ville.",
    ouVousLeVoyez: 'Le lien « Global » de chaque séance, sur la page de l\'instance. Les fiches du site y renvoient pour lire le sommaire en entier.',
  },
  {
    terme: 'Procès-verbal',
    categorie: 'documents',
    recherche: 'proc[èe]s-verbal de la s[ée]ance',
    definition:
      "Le compte rendu officiel d'une séance : qui était présent, ce qui a été décidé, et — quand un membre a demandé le vote — qui a voté quoi. Il est adopté à la séance suivante, puis publié.",
    ouVousLeVoyez: "C'est la source de toutes les décisions et de tous les votes du site. Il paraît environ un mois après la séance.",
  },
  {
    terme: 'Ordre du jour',
    categorie: 'documents',
    recherche: 'ordre du jour tel que soumis',
    definition:
      "La liste des points qu'une séance doit traiter. Les points sont rangés en chapitres toujours dans le même ordre : administration et organisation, communications, finances, ressources humaines, biens matériels et services, biens immobiliers, réglementation et affaires juridiques, circulation et transport, aménagement du territoire et urbanisme, affaires diverses.",
    ouVousLeVoyez: 'Le numéro après la date, dans CO-260616-4.3, est celui du point : chapitre 4 (finances), point 3.',
  },
  {
    terme: 'Dépôt',
    categorie: 'documents',
    recherche: 'Il est proc[ée]d[ée] au d[ée]p[ôo]t',
    definition:
      "Un document est présenté officiellement au conseil : un rapport, un procès-verbal de commission, une correspondance. Le conseil n'a rien à approuver ; le dépôt le rend public et le verse aux archives.",
    ouVousLeVoyez: "« Il est procédé au dépôt… » — et pas de mention « adoptée », puisque rien n'est mis aux voix.",
  },
  {
    terme: 'Avis de motion',
    categorie: 'documents',
    recherche: 'avis de motion',
    definition:
      "L'annonce qu'un règlement sera adopté à une séance suivante. Ça ne décide rien : ça prévient. C'est une étape obligatoire, en général accompagnée du dépôt du projet de règlement.",
    ouVousLeVoyez: "Deux fiches qui se suivent : « Avis de motion d'un règlement… », puis « Dépôt du projet de Règlement… ».",
  },
  {
    terme: 'Règlement',
    categorie: 'documents',
    recherche: 'adoption du r[èe]glement',
    definition:
      "La forme la plus contraignante d'une décision municipale : une norme générale qui s'applique à tous. Son adoption suit des étapes obligatoires (avis de motion, dépôt du projet, adoption).",
    ouVousLeVoyez: "Les numéros disent l'instance et l'année : CO-2026-1358 pour un règlement du conseil de ville, CA-2026-468 pour l'agglomération.",
  },

  // ---------- Qui décide ----------
  {
    terme: 'Conseil de ville',
    aussi: 'conseil municipal',
    categorie: 'instances',
    recherche: 'conseil de la Ville de Longueuil',
    definition:
      "Les 19 élus de la Ville de Longueuil : la mairesse et 18 conseillères et conseillers, un par district. Il adopte le budget, les règlements et les grands contrats, et siège en séance ordinaire environ une fois par mois.",
    ouVousLeVoyez: 'Ses séances sont publiques et s\'ouvrent sur une période de questions du public.',
  },
  {
    terme: 'Comité exécutif',
    categorie: 'instances',
    recherche: 'comit[ée] ex[ée]cutif',
    definition:
      "Un petit groupe d'élus autour de la mairesse, qui prépare les dossiers et décide de ce que le conseil lui délègue. Il siège plus souvent que le conseil, à huis clos, et publie aussi ses procès-verbaux.",
    ouVousLeVoyez: "Ce site ne couvre pas encore ses décisions ; son procès-verbal suit le même gabarit que celui du conseil.",
  },
  {
    terme: "Conseil d'arrondissement",
    categorie: 'instances',
    recherche: 'arrondissement (?:du Vieux-Longueuil|de Saint-Hubert|de Greenfield Park)',
    definition:
      "Longueuil a trois arrondissements — Vieux-Longueuil, Saint-Hubert et Greenfield Park —, chacun avec son conseil formé des élus de son territoire. Il décide de ce qui est local : urbanisme de proximité, parcs, loisirs, voirie locale.",
    ouVousLeVoyez: "Greenfield Park élit en plus deux conseillers d'arrondissement, qui ne siègent qu'à ce conseil.",
  },
  {
    terme: 'Greffière',
    aussi: 'greffier',
    categorie: 'instances',
    recherche: 'greffi[èe]re',
    definition:
      "L'officière qui garde les documents officiels de la Ville, rédige les procès-verbaux et certifie les décisions. Ce n'est pas une élue.",
    ouVousLeVoyez: 'Sa signature clôt les procès-verbaux, avec celle de la présidence.',
  },
  {
    terme: "Présidence d'assemblée",
    categorie: 'instances',
    recherche: 'pr[ée]sidente? constate',
    definition:
      "L'élu qui dirige les débats de la séance — ce n'est pas nécessairement la mairesse. La présidence donne la parole, appelle le vote et déclare le résultat.",
    ouVousLeVoyez: "« …sous la présidence de Sylvain Lambert », en tête du procès-verbal ; « La présidente constate que le quorum est atteint et déclare la séance ouverte. »",
  },

  // ---------- Agglomération ----------
  {
    terme: "Conseil d'agglomération",
    categorie: 'agglomeration',
    recherche: "conseil d.agglom[ée]ration",
    definition:
      "L'instance où Longueuil siège avec les quatre villes liées pour décider des services partagés : police, sécurité incendie, transport en commun, eau potable et assainissement, évaluation foncière. Chaque ville y pèse selon sa population.",
    ouVousLeVoyez: "Ses résolutions portent le préfixe CA. La Ville de Longueuil y est représentée par la mairesse et des élus qu'elle désigne.",
  },
  {
    terme: 'Ville liée',
    categorie: 'agglomeration',
    recherche: 'Boucherville|Brossard|Saint-Bruno|Saint-Lambert',
    definition:
      "Une des quatre municipalités de l'agglomération qui avaient été fusionnées à Longueuil en 2002 et qui ont repris leur existence en 2006 : Boucherville, Brossard, Saint-Bruno-de-Montarville et Saint-Lambert. Elles ont leur conseil et leur maire, et siègent à l'agglomération pour les services partagés.",
    ouVousLeVoyez: "Leurs maires figurent sur la liste des présences de chaque procès-verbal du conseil d'agglomération.",
  },
  {
    terme: "Orientation pour le conseil d'agglomération",
    categorie: 'agglomeration',
    recherche: "prendre l.orientation",
    definition:
      "Avant une séance de l'agglomération, le conseil de ville adopte la position que la mairesse y défendra sur un sujet. Ce n'est pas la décision elle-même : celle-ci se prend ensuite à l'agglomération.",
    ouVousLeVoyez: "Au chapitre « Orientations pour le conseil d'agglomération » du procès-verbal du conseil de ville : « Il est proposé de prendre l'orientation… ». Le même sujet revient quelques jours plus tard dans le procès-verbal de l'agglomération.",
  },

  // ---------- Voter et adopter ----------
  {
    terme: 'Demander le vote',
    aussi: 'vote nominal',
    categorie: 'vote',
    recherche: 'demande le vote',
    definition:
      "Un membre demande que la proposition soit mise aux voix. Le procès-verbal nomme alors chacun : qui vote en faveur, qui vote contre, avec le décompte. Sans cette demande, personne n'est nommé.",
    ouVousLeVoyez: "« Votent contre cette proposition : … » — c'est la seule source de la page Votes nominatifs.",
  },
  {
    terme: "Adoptée à l'unanimité",
    categorie: 'vote',
    recherche: "adopt[ée]e? [àa] l.unanimit[ée]",
    definition: "Personne n'a demandé le vote ni exprimé sa dissidence.",
    ouVousLeVoyez: "La formule de presque toutes les décisions — et de toutes celles de 2026 jusqu'ici.",
  },
  {
    terme: 'Adoptée à la majorité',
    categorie: 'vote',
    recherche: 'adopt[ée]e? [àa] la majorit[ée]',
    definition:
      "Adoptée, mais au moins une personne s'y est opposée. Le procès-verbal nomme alors la dissidence, ou tout le monde s'il y a eu vote. À l'agglomération, la formule « à la majorité des 2/3 des voix » compte les voix pondérées selon la population.",
    ouVousLeVoyez: "Toutes les fiches de la page Votes nominatifs portent cette mention ou « Rejetée ».",
  },
  {
    terme: 'Dissidence',
    categorie: 'vote',
    recherche: 'dissidence',
    definition:
      "Un élu fait consigner qu'il s'oppose, sans qu'il y ait eu vote nominal. On sait qui s'est opposé, pas nommément qui a voté pour.",
    ouVousLeVoyez: "« Jean Martel exprime sa dissidence. » Ces noms sont repris sur les fiches de décision.",
  },
  {
    terme: 'Proposition principale',
    aussi: 'proposition technique · amendement',
    categorie: 'vote',
    recherche: 'proposition (?:principale|technique)|amendement',
    definition:
      "La proposition principale est la décision soumise au conseil. Une proposition technique (reporter l'étude, par exemple) ou un amendement se vote d'abord ; la principale ensuite. Une même résolution peut donc porter plusieurs votes.",
    ouVousLeVoyez: "« Vote sur la proposition technique », puis « Vote sur la proposition principale », dans le même point du procès-verbal.",
  },
  {
    terme: 'Prendre acte',
    categorie: 'vote',
    recherche: 'prendre acte|prise d.acte',
    definition: "L'instance constate officiellement qu'une chose lui a été présentée. Ça ne l'approuve pas : ça l'enregistre.",
    ouVousLeVoyez: "« Il est proposé de prendre acte… », souvent pour un rapport ou un remboursement prévu par une entente.",
  },

  // ---------- Urbanisme ----------
  {
    terme: 'Dérogation mineure',
    categorie: 'urbanisme',
    recherche: 'd[ée]rogations? mineures?',
    definition:
      "Une permission d'écarter légèrement une règle du zonage pour un terrain précis — une marge, une hauteur, un nombre de cases de stationnement — sans changer le règlement pour tout le monde.",
    ouVousLeVoyez: "Presque toujours rattachée à une adresse, nommée dans le titre de la décision.",
  },
  {
    terme: 'Projet particulier',
    aussi: 'PPCMOI',
    categorie: 'urbanisme',
    recherche: 'projet particulier',
    definition:
      "Un mécanisme qui autorise un projet précis qui déroge au zonage, à des conditions précises, sans modifier le règlement pour tout le secteur. Le nom au long : projet particulier de construction, de modification ou d'occupation d'un immeuble.",
    ouVousLeVoyez: "Le titre de la résolution donne l'adresse et ce qui est autorisé.",
  },
  {
    terme: "Projet d'habitation autorisé par l'article 93",
    categorie: 'urbanisme',
    recherche: 'article 93',
    definition:
      "Depuis 2024, une loi québécoise permet aux villes d'autoriser un projet de logements qui déroge à leur réglementation d'urbanisme, sans référendum, pour accélérer la construction. Longueuil numérote ces projets PH-2025-002, PH-2026-…, et rend compte chaque année de leur usage.",
    ouVousLeVoyez: "« …conformément à l'article 93 de la Loi modifiant diverses dispositions législatives en matière d'habitation ».",
  },

  // ---------- Argent et contrats ----------
  {
    terme: 'Attribution du contrat',
    aussi: 'adjudication',
    categorie: 'argent',
    recherche: 'attribution du contrat|adjudication du contrat',
    definition: "L'attribution officielle d'un contrat à une entreprise, en général au plus bas soumissionnaire conforme au terme d'un appel d'offres.",
    ouVousLeVoyez: "« Attribution du contrat LONG-26-0150 pour… » : le numéro est celui de l'appel d'offres.",
  },
  {
    terme: 'Plus bas soumissionnaire conforme',
    categorie: 'argent',
    recherche: 'plus bas soumissionnaire',
    definition:
      "L'entreprise qui a offert le prix le plus bas parmi celles dont la soumission respecte toutes les exigences de l'appel d'offres. C'est à elle que la loi oblige, en règle générale, d'attribuer le contrat.",
    ouVousLeVoyez: "« …d'attribuer le contrat au plus bas soumissionnaire conforme, … au montant de … $, taxes incluses ».",
  },
  {
    terme: 'Contrat-cadre',
    categorie: 'argent',
    recherche: 'contrat-cadre',
    definition:
      "Un contrat qui fixe les prix et les conditions pour des services ou des biens dont la Ville aura besoin au fil du temps, sans commande précise au départ. Chaque dépense réelle est ensuite autorisée à part.",
    ouVousLeVoyez: "« Autorisation d'une dépense au contrat-cadre APP-24-007 pour des services professionnels… ».",
  },
  {
    terme: 'Gré à gré',
    categorie: 'argent',
    recherche: 'gr[ée] [àa] gr[ée]',
    definition:
      "Un contrat conclu directement, sans mise en concurrence. La loi ne le permet que dans des cas précis — sous un certain montant, ou avec un organisme public, par exemple.",
    ouVousLeVoyez: "Le rapport annuel sur la gestion contractuelle, déposé au conseil, fait le compte de ces contrats.",
  },
  {
    terme: 'Virement budgétaire',
    categorie: 'argent',
    recherche: 'virements? budg[ée]taires?',
    definition:
      "Un déplacement d'argent d'un poste du budget à un autre, en cours d'année, pour couvrir une dépense. Le total du budget ne change pas.",
    ouVousLeVoyez: "« Autorisation de virements budgétaires », avec une liste jointe au sommaire.",
  },
  {
    terme: "Règlement d'emprunt",
    categorie: 'argent',
    recherche: 'd[ée]cr[ée]tant (?:[àa] cette fin, )?un emprunt',
    definition:
      "Le règlement par lequel la Ville s'autorise à emprunter pour financer un projet, en général un investissement de longue durée. Il précise le montant et l'objet.",
    ouVousLeVoyez: "« Règlement … ordonnant des travaux de … et décrétant, à cette fin, un emprunt ».",
  },
  {
    terme: "Demande d'aide financière",
    categorie: 'argent',
    recherche: "demande d.aide financi[èe]re",
    definition:
      "La Ville demande de l'argent à un gouvernement pour un projet, dans le cadre d'un programme. La résolution autorise la demande ; elle ne garantit pas que l'aide sera accordée.",
    ouVousLeVoyez: "« Autorisation de déposer une demande d'aide financière dans le cadre du programme… ».",
  },
];
