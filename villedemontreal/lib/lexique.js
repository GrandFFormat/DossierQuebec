// Lexique du vocabulaire décisionnel de la Ville de Montréal.
//
// Les définitions sont écrites ici, par nous — ce ne sont pas des textes de la Ville, et
// la page le dit clairement. Ce qui vient des données, en revanche, c'est la mesure :
// pour chaque terme, `scrapers/lexique.js` compte les documents de l'année où la
// formulation apparaît et en attache un exemple réel. Une définition sans exemple, c'est
// une affirmation ; avec, c'est vérifiable.
//
// `recherche` est une expression régulière (source) cherchée dans le texte des documents.

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
    recherche: "(?:Et|Il est) r[ée]solu",
    definition:
      "La décision elle-même. Une fois adoptée, c'est l'acte officiel de l'instance : elle porte un numéro qui dit qui l'a prise et quand — CM26 0355 pour le conseil municipal en 2026, CE26 0412 pour le comité exécutif, CG26 0123 pour le conseil d'agglomération, CA26 pour un conseil d'arrondissement.",
    ouVousLeVoyez: "Chaque fiche de la page Décisions est une résolution lue dans le procès-verbal officiel.",
  },
  {
    terme: 'Sommaire décisionnel',
    categorie: 'documents',
    recherche: 'sommaire d[ée]cisionnel',
    definition:
      "La note que l'administration rédige AVANT la décision, pour l'expliquer aux élus : contexte, décisions antérieures, description, justification, aspects financiers, calendrier. À Montréal, il vit dans le « système de gestion des décisions des instances » (GDD) et porte un numéro de dossier à dix chiffres.",
    ouVousLeVoyez:
      "C'est à partir de ce document que les résumés en langage clair du site sont produits. Le numéro de dossier — 1266245003, par exemple — est écrit à la fin de chaque résolution, à côté du numéro d'article.",
  },
  {
    terme: 'Dossier décisionnel',
    aussi: 'numéro de dossier · GDD',
    categorie: 'documents',
    recherche: '\\b1\\d{9}\\b',
    definition:
      "Le dossier complet d'une décision dans le système de la Ville : le sommaire, ses pièces jointes, les interventions des services, puis la ou les résolutions. Son numéro à dix chiffres suit la décision d'une instance à l'autre — du comité exécutif au conseil municipal, puis à l'agglomération.",
    ouVousLeVoyez: "Un même dossier peut donc apparaître trois fois sur la page Décisions, une par instance qui s'est prononcée.",
  },
  {
    terme: 'Procès-verbal',
    categorie: 'documents',
    recherche: 'proc[èe]s-verbal de (?:la s[ée]ance|l.assembl[ée]e)',
    definition:
      "Le compte rendu officiel d'une séance : qui était présent, ce qui a été décidé, et — quand un vote enregistré a été demandé — qui a voté quoi.",
    ouVousLeVoyez: "C'est la source de toutes les décisions et de tous les votes du site. Un par séance, en PDF, sur le site de la Ville.",
  },
  {
    terme: 'Ordre du jour',
    categorie: 'documents',
    recherche: 'ordre du jour',
    definition:
      "La liste des points qu'une séance doit traiter, publiée le vendredi précédant l'assemblée du conseil municipal. Les points sont numérotés par chapitre : 20 pour les contrats et ententes, 30 pour l'administration et les finances, 40 pour les règlements, 50 pour les nominations, 60 pour les motions.",
    ouVousLeVoyez: "Le numéro d'article d'une résolution (20.03, 40.12) est celui de son point à l'ordre du jour.",
  },
  {
    terme: 'Avis de motion',
    categorie: 'documents',
    recherche: 'avis de motion',
    definition:
      "L'annonce qu'un règlement sera présenté à une séance suivante. Ça ne décide rien : ça prévient. C'est une étape obligatoire avant d'adopter un règlement.",
    ouVousLeVoyez: "Souvent accompagné du dépôt du projet de règlement, puis suivi de son adoption à la séance suivante.",
  },
  {
    terme: 'Règlement',
    categorie: 'documents',
    recherche: 'adopt(?:er|ion du) (?:le |sans changement le )?r[èe]glement',
    definition:
      "La forme la plus contraignante d'une décision municipale : une norme générale qui s'applique à tous. Son adoption suit des étapes obligatoires (avis de motion, projet, adoption).",
    ouVousLeVoyez: "Les numéros disent l'instance et l'année : 26-012 pour le conseil municipal, RCG 26-005 pour l'agglomération, RCA pour un arrondissement.",
  },

  // ---------- Qui décide ----------
  {
    terme: 'Conseil municipal',
    aussi: 'conseil de ville',
    categorie: 'instances',
    recherche: 'conseil municipal',
    definition:
      "Les 65 élus de la Ville de Montréal : la mairesse ou le maire, les 18 maires d'arrondissement et 46 conseillères et conseillers de ville. Il adopte le budget, les règlements, les motions, et siège en assemblée ordinaire une fois par mois, le lundi.",
    ouVousLeVoyez: "Ses séances sont publiques, webdiffusées, et s'ouvrent sur une période de questions du public.",
  },
  {
    terme: 'Comité exécutif',
    categorie: 'instances',
    recherche: 'comit[ée] ex[ée]cutif',
    definition:
      "Le gouvernement de la Ville au quotidien : la mairesse ou le maire, sa présidence et une dizaine de membres choisis parmi les élus, chacun responsable de dossiers. Il prépare ce que les conseils adoptent et décide seul de ce qui lui est délégué. Il siège chaque semaine, le mercredi.",
    ouVousLeVoyez: "La formule « Vu la recommandation du comité exécutif… » ouvre la plupart des résolutions du conseil municipal.",
  },
  {
    terme: "Conseil d'arrondissement",
    categorie: 'instances',
    recherche: "conseil d.arrondissement",
    definition:
      "Chacun des 19 arrondissements de Montréal a son conseil, présidé par son maire d'arrondissement, avec les conseillers de ville et d'arrondissement élus sur son territoire. Il décide de ce qui est local : urbanisme de proximité, parcs, loisirs, voirie locale, déneigement.",
    ouVousLeVoyez: "Ce site couvre les trois instances centrales ; les 19 conseils d'arrondissement suivent le même schéma de publication et sont l'étape suivante.",
  },
  {
    terme: "Conseiller d'arrondissement",
    aussi: "conseillère d'arrondissement",
    categorie: 'instances',
    recherche: "conseill[èe]re? d.arrondissement",
    definition:
      "Un élu qui siège au conseil de son arrondissement seulement, pas au conseil municipal. Il n'existe que dans certains arrondissements, pour que chaque conseil d'arrondissement compte au moins cinq membres.",
    ouVousLeVoyez: "La liste des élus de la Ville en compte 38 en plus des 65 membres du conseil municipal ; ils sont dans le jeu de données ouvert, mais pas sur la carte des districts.",
  },
  {
    terme: 'Greffier',
    aussi: 'greffière',
    categorie: 'instances',
    recherche: 'greffi[èe]re?',
    definition:
      "L'officier qui garde les documents officiels de la Ville, rédige les procès-verbaux et certifie les décisions. Ce n'est pas un élu. À Montréal, le greffier fait aussi l'appel des membres lors d'un vote enregistré.",
    ouVousLeVoyez: "Sa signature clôt les procès-verbaux, avec celle de la présidence.",
  },
  {
    terme: 'Présidence du conseil',
    categorie: 'instances',
    recherche: 'pr[ée]sident(?:e)? du conseil',
    definition:
      "L'élu qui dirige les débats du conseil municipal — ce n'est pas la mairesse. La présidence donne la parole, met les propositions aux voix et déclare le résultat.",
    ouVousLeVoyez: "« Le président du conseil déclare la proposition adoptée à la majorité des voix. »",
  },

  // ---------- Agglomération ----------
  {
    terme: "Conseil d'agglomération",
    categorie: 'agglomeration',
    recherche: "conseil d.agglom[ée]ration",
    definition:
      "L'instance où Montréal siège avec les 15 villes liées de l'île pour décider des services partagés : police, incendie, transport en commun, eau, évaluation foncière, logement social, grands parcs. Montréal y détient la majorité des voix ; les maires des villes liées y votent aussi.",
    ouVousLeVoyez: "Ses résolutions portent le préfixe CG. Beaucoup passent d'abord par le conseil municipal sous la forme « recommander au conseil d'agglomération ».",
  },
  {
    terme: 'Ville liée',
    aussi: 'ville reconstituée · ville défusionnée',
    categorie: 'agglomeration',
    recherche: 'villes? (?:li[ée]es?|reconstitu[ée]es?)',
    definition:
      "Une des quinze municipalités de l'île de Montréal qui avaient été fusionnées à Montréal en 2002 et qui ont repris leur existence propre en 2006, à la suite d'un référendum. Elles ont leur conseil et leur maire, et siègent à l'agglomération pour les services partagés.",
    ouVousLeVoyez:
      "Baie-D'Urfé, Beaconsfield, Côte-Saint-Luc, Dollard-Des Ormeaux, Dorval, Hampstead, Kirkland, L'Île-Dorval, Montréal-Est, Montréal-Ouest, Mont-Royal, Pointe-Claire, Sainte-Anne-de-Bellevue, Senneville, Westmount.",
  },
  {
    terme: "Compétence d'agglomération",
    categorie: 'agglomeration',
    recherche: "comp[ée]tence d.agglom[ée]ration",
    definition:
      "Un domaine que la loi confie au conseil d'agglomération plutôt qu'à chaque ville séparément, parce que le service est partagé. Le reste — les compétences de proximité — demeure à chaque ville ou arrondissement.",
    ouVousLeVoyez: "La mention « Compétence d'agglomération : … » figure sur les ordres du jour, sous chaque point concerné.",
  },

  // ---------- Voter et adopter ----------
  {
    terme: 'Vote enregistré',
    aussi: 'appel nominal',
    categorie: 'vote',
    recherche: 'vote enregistr[ée]|Votent en faveur',
    definition:
      "Un vote où le greffier fait l'appel des membres et où le procès-verbal nomme qui a voté pour et qui a voté contre. Il faut qu'un membre le demande ; sans ça, la décision est adoptée à main levée et personne n'est nommé.",
    ouVousLeVoyez: "C'est la clé du registre des votes du site : les seuls votes dont on connaît le détail sont ceux qui ont été enregistrés.",
  },
  {
    terme: "Adoptée à l'unanimité",
    categorie: 'vote',
    recherche: "adopt[ée]e? à l.unanimit[ée]",
    definition: "Personne n'a voté contre.",
    ouVousLeVoyez: "La formule la plus courante, parce que la plupart des décisions passent sans opposition.",
  },
  {
    terme: 'Adoptée à la majorité des voix',
    categorie: 'vote',
    recherche: 'adopt[ée]e? à la majorit[ée]',
    definition: "Adoptée, mais au moins une personne a voté contre. Le procès-verbal nomme alors les dissidences, ou tout le monde s'il y a eu vote enregistré.",
    ouVousLeVoyez: "C'est le cas de la quasi-totalité des votes nominatifs du site.",
  },
  {
    terme: 'Dissidence',
    categorie: 'vote',
    recherche: 'dissidences?\\s*:',
    definition:
      "Le nom des élus qui ont voté contre, consigné au procès-verbal sans qu'il y ait eu appel nominal complet. On sait qui s'est opposé, pas nommément qui a voté pour.",
    ouVousLeVoyez: "« Adopté à la majorité des voix. Dissidences : Mme X, M. Y. » Ces noms sont repris sur les fiches de décision.",
  },
  {
    terme: 'Prise d’acte',
    categorie: 'vote',
    recherche: "prendre acte|prise d.acte",
    definition:
      "L'instance constate officiellement qu'un document lui a été présenté. Ça ne l'approuve pas : ça l'enregistre.",
    ouVousLeVoyez: "Souvent pour des rapports, des réponses du comité exécutif ou des dépôts obligatoires.",
  },
  {
    terme: 'Mairesse suppléante',
    aussi: 'maire suppléant',
    categorie: 'vote',
    recherche: 'suppl[ée]ante?',
    definition: "L'élu désigné pour remplacer la mairesse ou le maire en cas d'absence ou d'empêchement. Au conseil municipal de Montréal, la fonction tourne entre élus pour des périodes fixées par résolution.",
    ouVousLeVoyez: "La désignation est elle-même une résolution du conseil municipal, sous le chapitre 51.",
  },

  // ---------- Urbanisme ----------
  {
    terme: 'Dérogation mineure',
    categorie: 'urbanisme',
    recherche: 'd[ée]rogations? mineures?',
    definition:
      "Une permission d'écarter légèrement une règle du zonage pour un terrain précis — une marge, une hauteur, un nombre de cases de stationnement — sans changer le règlement pour tout le monde. À Montréal, c'est surtout une affaire d'arrondissement.",
    ouVousLeVoyez: "Presque toujours rattachée à une adresse précise, nommée dans l'objet de la décision.",
  },
  {
    terme: 'Projet particulier',
    aussi: 'PPCMOI',
    categorie: 'urbanisme',
    recherche: 'projet particulier|PPCMOI',
    definition:
      "Un mécanisme qui autorise un projet précis qui déroge au zonage, à des conditions précises, sans modifier le règlement pour tout le secteur. Le nom au long : projet particulier de construction, de modification ou d'occupation d'un immeuble.",
    ouVousLeVoyez: "Fréquent dans les résolutions d'arrondissement et, pour les grands projets, au conseil municipal.",
  },
  {
    terme: 'Article 89',
    categorie: 'urbanisme',
    recherche: "article 89",
    definition:
      "L'article de la Charte de la Ville de Montréal qui permet au conseil municipal d'autoriser un grand projet — un hôpital, un campus, un ensemble immobilier d'envergure — par règlement, par-dessus les règles d'urbanisme de l'arrondissement, avec consultation publique.",
    ouVousLeVoyez: "« Adopter le règlement … en vertu du paragraphe … de l'article 89 de la Charte ».",
  },
  {
    terme: 'Zonage',
    categorie: 'urbanisme',
    recherche: 'zonage',
    definition:
      "Le découpage du territoire en zones, avec pour chacune ce qu'on a le droit d'y construire et d'y faire. À Montréal, chaque arrondissement a son règlement d'urbanisme.",
    ouVousLeVoyez: "Le plan d'urbanisme de la Ville chapeaute les 19 règlements d'arrondissement.",
  },

  // ---------- Argent et contrats ----------
  {
    terme: 'Accorder un contrat',
    aussi: 'octroyer un contrat',
    categorie: 'argent',
    recherche: 'accorder (?:un|le) contrat',
    definition: "L'attribution officielle d'un contrat à une entreprise, en général au plus bas soumissionnaire conforme au terme d'un appel d'offres.",
    ouVousLeVoyez: "« Accorder un contrat à … pour … — Dépense totale de … $, taxes incluses — Appel d'offres public … (3 soumissionnaires) ». L'objet dit tout : qui, quoi, combien, combien de concurrents.",
  },
  {
    terme: "Appel d'offres",
    categorie: 'argent',
    recherche: "appel d.offres",
    definition:
      "La mise en concurrence obligatoire avant d'accorder un contrat au-delà d'un certain montant. Public, il est ouvert à tous ; sur invitation, il est réservé à des fournisseurs sollicités.",
    ouVousLeVoyez: "Les contrats de Montréal sont aussi publiés en données ouvertes, avec le numéro de la résolution qui les accorde.",
  },
  {
    terme: 'Gré à gré',
    categorie: 'argent',
    recherche: 'gr[ée] à gr[ée]',
    definition:
      "Un contrat conclu directement, sans mise en concurrence. La loi ne le permet que dans des cas précis, et la Ville doit le dire dans la résolution.",
    ouVousLeVoyez: "« contrat de gré à gré », « fournisseur unique ».",
  },
  {
    terme: 'Contribution financière',
    aussi: 'soutien financier',
    categorie: 'argent',
    recherche: 'contribution financi[èe]re|soutien financier',
    definition: "Une somme que la Ville verse à un organisme pour un projet ou une mission, encadrée par une convention qui dit à quoi elle sert et ce que l'organisme doit rendre compte.",
    ouVousLeVoyez: "« Accorder un soutien financier de 250 000 $ à … et approuver un projet de convention à cet effet ».",
  },
  {
    terme: "Programme décennal d'immobilisations",
    aussi: 'PDI',
    categorie: 'argent',
    recherche: 'programme d[ée]cennal d.immobilisations|PDI\\b',
    definition:
      "Le plan des investissements de la Ville sur dix ans — bâtiments, conduites, rues, parcs — adopté chaque année avec le budget. C'est là qu'on voit ce que la Ville compte construire, et quand.",
    ouVousLeVoyez: "Beaucoup de contrats de travaux renvoient au PDI comme source de financement.",
  },
  {
    terme: "Règlement d'emprunt",
    categorie: 'argent',
    recherche: "r[èe]glement (?:d.emprunt|autorisant un emprunt)",
    definition:
      "Le règlement par lequel la Ville s'autorise à emprunter pour financer un projet, en général un investissement de longue durée. Il précise le montant et l'objet.",
    ouVousLeVoyez: "« Adopter le règlement autorisant un emprunt de 12 000 000 $ afin de financer … ».",
  },
  {
    terme: 'Expropriation',
    categorie: 'argent',
    recherche: 'expropri',
    definition:
      "L'acquisition forcée d'un terrain ou d'un droit par la Ville pour un motif d'utilité publique, avec indemnité au propriétaire.",
    ouVousLeVoyez: "« Décréter l'acquisition, de gré à gré ou par expropriation, … ».",
  },
];
