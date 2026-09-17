// Lexique du vocabulaire décisionnel de la Ville de Laval.
//
// Les définitions sont écrites ici, par nous — ce ne sont pas des textes de la Ville, et la page
// le dit. Ce qui vient des données, c'est la mesure : pour chaque terme, `scrapers/lexique.js`
// compte les procès-verbaux et les résolutions de l'année où la formulation apparaît et en attache
// un exemple réel. Un terme qui tombe à zéro est une formulation que la Ville n'emploie pas : on
// le retire ou on le corrige.
//
// `recherche` est une expression régulière (source) cherchée dans le texte des procès-verbaux,
// normalisé par le scraper (apostrophes droites, une seule espace entre les mots). Elle est
// écrite en s'appuyant sur ce qui a été lu dans les 87 procès-verbaux de 2026, et rien d'autre :
// Laval n'écrit jamais « plus bas soumissionnaire conforme » ni « certificat de trésorerie » en
// toutes lettres, alors ces mots ne sont pas ici. Deux pièges de rédaction : `\b` de JavaScript
// ne voit pas les lettres accentuées (pas de `\b` après un « é »), et le texte extrait du PDF
// coupe parfois un mot d'une ligne à l'autre — préférer les formules courtes.

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
    recherche: "r[ée]solu(?: [àa] l'unanimit[ée])?\\s*:",
    definition:
      "La décision elle-même, telle que l'instance l'a adoptée. Son numéro dit qui l'a prise, quand, et son rang dans l'année : CM-20260901-658, c'est le conseil municipal (CM), le 1er septembre 2026, 658e résolution du conseil cette année-là ; CE-20260909-2024, c'est le comité exécutif (CE), le 9 septembre.",
    ouVousLeVoyez: "Chaque fiche de la page Décisions est une résolution lue dans le procès-verbal officiel. Au conseil, la mention ADOPTÉ clôt le texte ; au comité exécutif, tout commence par « RÉSOLU À L'UNANIMITÉ : ».",
  },
  {
    terme: 'Sommaire décisionnel',
    aussi: 'SD',
    categorie: 'documents',
    recherche: '\\(SD-\\d{4}-\\d+\\)',
    definition:
      "La note que le service concerné rédige AVANT la décision, pour l'expliquer aux élus : la recommandation, le contexte, les numéros de contrat, le montant, les districts touchés, les décisions antérieures. Il porte un numéro — SD-2026-4237 — qui suit le dossier du comité exécutif au conseil.",
    ouVousLeVoyez:
      "Entre parenthèses, à la toute fin de chaque résolution : (SD-2026-3971). La Ville publie le PDF des sommaires qui vont au conseil municipal ; ceux du comité exécutif sont cités mais ne sont pas en ligne, et la fiche le dit.",
  },
  {
    terme: 'Procès-verbal',
    categorie: 'documents',
    recherche: "PROC[ÈE]S-VERBAL D'UNE S[ÉE]ANCE|proc[èe]s-verbal de la s[ée]ance|APPROBATION - PROC[ÈE]S-VERBAL",
    definition:
      "Le compte rendu officiel d'une séance : qui était présent, chaque résolution avec son numéro, et — quand un membre a demandé le vote — qui a voté quoi. Il est approuvé à une séance suivante (« APPROBATION - PROCÈS-VERBAL »), puis publié.",
    ouVousLeVoyez:
      "C'est la source de toutes les décisions et de tous les votes du site. Le nom du fichier porte l'heure réelle d'ouverture (CM_PV_ORD_18h33_…), pas l'heure prévue.",
  },
  {
    terme: 'Ordre du jour',
    categorie: 'documents',
    recherche: 'ordre du jour',
    definition:
      "La liste des points qu'une séance doit traiter, publiée avant la séance. Celui du conseil municipal écrit chaque point en langage courant, avec le numéro de sommaire, le certificat de trésorerie, les districts touchés et le montant ; ses chapitres reviennent toujours dans le même ordre : approbation des procès-verbaux, présentation des recommandations du comité exécutif, étude et adoption des règlements, avis de motion, dépôt de documents administratifs, discussions sur les propositions des membres du conseil.",
    ouVousLeVoyez:
      "Quand l'ordre du jour existe, la fiche reprend son texte en casse normale, avec les districts et le montant. Le comité exécutif publie aussi le sien, rangé par service (« 43 - Service de l'urbanisme »), avec le numéro de sommaire et les districts, mais jamais de montant ; et il n'y écrit qu'un point par dossier, que le procès-verbal décline ensuite en plusieurs résolutions — celles-là gardent le titre du procès-verbal.",
  },
  {
    terme: 'Dépôt',
    categorie: 'documents',
    recherche: 'd[ée]pose (?:un|une|le|la|les|des) |D[ÉE]P[ÔO]T - ',
    definition:
      "Un document est remis officiellement à l'instance : une pétition, un rapport, un projet de règlement, un certificat de registre. Rien n'est mis aux voix ; le dépôt le rend public et le verse aux archives.",
    ouVousLeVoyez:
      "« Le conseiller Nicholas Borne dépose une pétition des résidents de la 7e Avenue… », « M. Stéphane Boyer, maire, dépose le rapport annuel de la vérificatrice générale ». Le titre commence par « DÉPÔT - » et la fiche porte le type « Dépôt », sans résultat de vote.",
  },
  {
    terme: 'Avis de motion',
    categorie: 'documents',
    recherche: 'avis de motion',
    definition:
      "L'annonce qu'un règlement sera adopté à une séance suivante. Ça ne décide rien : ça prévient. C'est une étape obligatoire, accompagnée du dépôt du projet de règlement à la même séance.",
    ouVousLeVoyez:
      "« Le conseiller Pierre Brabant donne un avis de motion qu'à une séance subséquente de ce conseil, il sera présenté pour lecture et adoption un règlement portant le numéro L-13280… » Le même numéro de sommaire revient au dépôt du projet, à l'avis de motion, puis à l'adoption.",
  },
  {
    terme: 'Règlement',
    categorie: 'documents',
    recherche: 'R[èe]glement (?:num[ée]ro )?(?:L-\\d+|CDU-1)',
    definition:
      "La forme la plus contraignante d'une décision municipale : une norme générale qui s'applique à tous. Son adoption suit des étapes obligatoires — dépôt du projet, avis de motion, adoption — et, pour un règlement d'emprunt, l'ouverture d'un registre.",
    ouVousLeVoyez:
      "Les règlements de Laval sont numérotés L-13281 ; les modifications au Code de l'urbanisme, CDU-1-20. Avant l'adoption, « la greffière mentionne les éléments prévus à l'article 356 de la Loi sur les cités et villes » : l'objet du règlement, sa portée, son coût et son mode de financement.",
  },
  {
    terme: 'Certificat de trésorerie',
    aussi: 'CT',
    categorie: 'documents',
    recherche: '\\(CT:\\s?\\d+\\)',
    definition:
      "Le numéro du certificat par lequel la trésorerie de la Ville atteste que les fonds d'une dépense sont disponibles. Il accompagne les résolutions qui engagent de l'argent — un contrat, des honoraires, des crédits — et pas les autres.",
    ouVousLeVoyez:
      "Entre parenthèses, juste avant le numéro de sommaire, dans les procès-verbaux du comité exécutif : (CT:1908852) (SD-2026-3971). À l'ordre du jour du conseil, la mention « CT : 1876662 » sous le point. La fiche l'affiche quand il existe.",
  },

  // ---------- Qui décide ----------
  {
    terme: 'Conseil municipal',
    categorie: 'instances',
    recherche: 'S[ÉE]ANCE (?:ORDINAIRE|EXTRAORDINAIRE) DU CONSEIL MUNICIPAL',
    definition:
      "Les 23 élus de la Ville de Laval : le maire et 22 conseillères et conseillers, un par district. Il adopte les règlements, le budget et les contrats que lui recommande le comité exécutif, et siège en séance ordinaire une fois par mois, un mardi soir à 18 h 30, à l'hôtel de ville.",
    ouVousLeVoyez:
      "Ses séances sont présidées par une membre du conseil désignée à cette fin, pas par le maire : « siégeant sous la présidence de Mme Cecilia Macedo ». Elles s'ouvrent sur l'adoption de l'ordre du jour et comprennent une période de questions du public.",
  },
  {
    terme: 'Comité exécutif',
    categorie: 'instances',
    recherche: 'comit[ée] ex[ée]cutif',
    definition:
      "Le maire, qui le préside, et quatre membres du conseil (cinq membres en tout en 2026) : ils prennent les décisions courantes que les règlements leur délèguent (contrats, dérogations mineures, embauches, subventions) et préparent tout ce qui va au conseil. Il siège chaque mercredi matin, en séance publique puis à huis clos, et publie les deux procès-verbaux.",
    ouVousLeVoyez:
      "Trois fiches sur quatre en 2026 viennent de lui. Son procès-verbal ne nomme ni proposeur ni appuyeur : chaque résolution commence par « RÉSOLU À L'UNANIMITÉ : ».",
  },
  {
    terme: 'Séance publique et séance à huis clos',
    aussi: 'huis clos',
    categorie: 'instances',
    recherche: 'huis clos',
    definition:
      "Le comité exécutif tient deux séances à la suite le même matin : une séance publique, à 9 h, puis une séance à huis clos, quelques minutes plus tard, sans public. Les deux ont un procès-verbal publié ; celui du huis clos est plus court et porte notamment les dossiers de personnel (terminaisons d'emploi, congédiements) et certaines dépenses.",
    ouVousLeVoyez:
      "« PROCÈS-VERBAL D'UNE SÉANCE À HUIS CLOS DU COMITÉ EXÉCUTIF … tenue le mercredi 9 septembre 2026 à 9 h 11 ». Sur le site, le sous-type de séance dit « Publique » ou « Huis clos ».",
  },
  {
    terme: 'Maire et président du comité exécutif',
    aussi: 'vice-président du comité exécutif',
    categorie: 'instances',
    recherche: 'maire et pr[ée]sident du comit[ée] ex[ée]cutif',
    definition:
      "À Laval, le maire préside le comité exécutif ; un vice-président le remplace au besoin. C'est le maire (ou le vice-président) et la greffière qui signent les actes au nom de la Ville une fois la décision prise.",
    ouVousLeVoyez:
      "« M. Stéphane Boyer, maire et président du comité exécutif », « Ray Khalil, vice-président du comité exécutif », en tête de chaque procès-verbal ; et la formule « d'autoriser le maire et président du comité exécutif ou le vice-président du comité exécutif et la greffière ou la greffière adjointe à signer… ».",
  },
  {
    terme: 'Greffière',
    aussi: 'greffier · greffière adjointe',
    categorie: 'instances',
    recherche: 'greffi[èe]re',
    definition:
      "L'officière qui garde les documents officiels de la Ville, rédige les procès-verbaux, tient les registres et signe les actes avec le maire. Ce n'est pas une élue.",
    ouVousLeVoyez:
      "« Me Marie-Christine Lefebvre, greffière », dans la liste des présences de chaque séance ; et « la greffière ou la greffière adjointe à signer pour et au nom de la Ville ».",
  },
  {
    terme: 'Recommandation au conseil',
    categorie: 'instances',
    recherche: 'recommander au conseil|recommandation au conseil|sur recommandation du comit[ée] ex[ée]cutif',
    definition:
      "Ce qui dépasse les pouvoirs du comité exécutif passe deux fois : le comité recommande, le conseil décide. Le même dossier a donc deux résolutions, à deux dates, avec le même numéro de sommaire.",
    ouVousLeVoyez:
      "Au comité exécutif : « RECOMMANDATION AU CONSEIL - ATTRIBUTION - CONTRAT DOS-3623 … de recommander au conseil d'attribuer… ». Au conseil, la semaine suivante : « Sur recommandation du comité exécutif, IL EST PROPOSÉ PAR… ».",
  },
  {
    terme: "Comité consultatif d'urbanisme",
    aussi: 'CCU · comités consultatifs',
    categorie: 'instances',
    recherche: "comit[ée] consultatif d'urbanisme|CCU-\\d{4}-\\d+",
    definition:
      "Un comité de citoyens et d'élus qui étudie les demandes de dérogation mineure, de PIIA et d'usage conditionnel, puis recommande. C'est le comité exécutif qui décide, en citant la recommandation. D'autres comités consultatifs donnent leur avis dans leur domaine : le Comité consultatif agricole (CCA), le Comité sur le patrimoine et la toponymie (CPT), le Comité consultatif en environnement (CCE).",
    ouVousLeVoyez:
      "« …et ce, conformément à la résolution du Comité consultatif d'urbanisme numéro CCU-2026-272 ». Les nominations de leurs membres passent au conseil.",
  },

  // ---------- Voter et adopter ----------
  {
    terme: '« IL EST PROPOSÉ PAR … APPUYÉ PAR … »',
    aussi: 'proposeur · appuyeur',
    categorie: 'vote',
    recherche: 'IL EST PROPOS[ÉE] PAR',
    definition:
      "Au conseil municipal, chaque résolution est proposée par un membre et appuyée par un autre avant d'être mise aux voix. Le procès-verbal nomme les deux.",
    ouVousLeVoyez:
      "« IL EST PROPOSÉ PAR : Pierre Brabant APPUYÉ PAR : Yannick Langlois et résolu à l'unanimité : ». La fiche porte les deux noms. Le comité exécutif ne les écrit pas.",
  },
  {
    terme: "Résolu à l'unanimité",
    categorie: 'vote',
    recherche: "r[ée]solu [àa] l'unanimit[ée]",
    definition: "Personne n'a demandé le vote ni fait inscrire sa dissidence. Quand le vote a été demandé, la formule devient « et résolu : », suivie du décompte.",
    ouVousLeVoyez: "La formule de presque toutes les décisions — et de toutes celles du comité exécutif en 2026, sans exception.",
  },
  {
    terme: 'Demander le vote',
    aussi: 'vote nominal · décompte',
    categorie: 'vote',
    recherche: 'demande le vote',
    definition:
      "Un membre demande que la proposition soit mise aux voix. Le procès-verbal donne alors le décompte et nomme chacun : qui se prononce en faveur, qui se prononce contre. Sans cette demande, personne n'est nommé.",
    ouVousLeVoyez:
      "« La conseillère Louise Lortie demande le vote sur la proposition, laquelle est adoptée par un compte de 17 en faveur et de 4 contre : M. Stéphane Boyer, maire, et les conseillers …, se prononcent en faveur de la proposition ; les conseillers … se prononcent contre la proposition. » C'est la seule source de la page Votes ; le décompte imprimé sert à vérifier les noms.",
  },
  {
    terme: 'Dissidence',
    categorie: 'vote',
    recherche: 'dissidence',
    definition:
      "Un ou plusieurs élus font inscrire qu'ils s'opposent, sans demander le vote. La résolution est adoptée, on sait qui s'y est opposé, mais personne n'est nommé pour le pour.",
    ouVousLeVoyez: "« Les conseillers Louise Lortie et Martin Vaillancourt demandent que le procès-verbal fasse mention de leur dissidence. ADOPTÉ »",
  },
  {
    terme: 'Amendement',
    aussi: 'proposition amendée',
    categorie: 'vote',
    recherche: "propose un amendement|proposition amend[ée]e|vote sur l'amendement",
    definition:
      "Une modification proposée en séance au texte soumis. L'amendement se vote d'abord ; la proposition, amendée ou non, ensuite. Une même résolution peut donc porter plusieurs votes.",
    ouVousLeVoyez:
      "« La conseillère Louise Lortie propose un amendement afin que le règlement soit amendé de la façon suivante… » Ne pas confondre avec le titre « RÉSOLUTION AMENDÉE », qui désigne une résolution corrigeant une résolution antérieure.",
  },
  {
    terme: 'Avis de proposition',
    categorie: 'vote',
    recherche: 'avis de proposition',
    definition:
      "Le moyen, pour un membre du conseil, de mettre lui-même un sujet à l'ordre du jour : il dépose un avis de proposition, et la proposition est discutée à la séance suivante, sous le chapitre « Discussions sur les propositions déposées par les membres du conseil ». Le conseil peut aussi accepter d'en discuter immédiatement.",
    ouVousLeVoyez:
      "« Le conseiller David De Cotis dépose un avis de proposition afin que le comité exécutif mandate la Direction générale… » puis, un mois plus tard, « PROPOSITION ACCEPTÉE », « PROPOSITION REJETÉE » ou « PROPOSITION AMENDÉE ACCEPTÉE ». La fiche porte le type « Avis de proposition ».",
  },
  {
    terme: 'Prendre acte',
    aussi: "prise d'acte",
    categorie: 'vote',
    recherche: 'prendre acte',
    definition: "L'instance constate officiellement qu'une chose lui a été présentée. Ça ne l'approuve pas : ça l'enregistre.",
    ouVousLeVoyez:
      "« de prendre acte du rapport mensuel déposé en vertu de l'article 45 du Règlement L-CE-1 », « de prendre acte de la liste des contrats pour le mois de mars 2026 ». La fiche porte le type « Prise d'acte » quand c'est tout ce que dit la résolution.",
  },
  {
    terme: 'Certificat de registre',
    aussi: 'personnes habiles à voter · approbation référendaire',
    categorie: 'vote',
    recherche: 'certificat concernant le registre',
    definition:
      "Un règlement d'emprunt (et certains règlements d'urbanisme) doit être approuvé par les personnes habiles à voter : un registre est ouvert quelques jours au greffe, où qui s'y oppose vient signer. Si le nombre de signatures requis est atteint, il faut tenir un référendum ; sinon le règlement est réputé approuvé. La greffière dresse le certificat qui donne le résultat, et le conseil en prend acte.",
    ouVousLeVoyez:
      "« CERTIFICAT DE REGISTRE - RÈGLEMENT L-13274 : de prendre acte du certificat concernant le registre tenu les 15, 16, 17, 18 et 19 juin 2026 pour l'enregistrement des personnes habiles à voter sur le Règlement numéro L-13274 ».",
  },
  {
    terme: 'Ratification',
    categorie: 'vote',
    recherche: 'RATIFICATION - |de ratifier',
    definition: "L'instance approuve après coup un geste déjà posé — une entente signée, une activité tenue — pour lui donner sa valeur officielle.",
    ouVousLeVoyez: "« RATIFICATION - ENTENTE - MINISTRE DE LA SÉCURITÉ PUBLIQUE », « RATIFICATION - PRÊT À USAGE - … », au comité exécutif.",
  },
  {
    terme: 'Prolongation de la séance',
    categorie: 'vote',
    recherche: 'prolongation de la s[ée]ance|ajourn[ée]e automatiquement',
    definition:
      "Les règles de régie du conseil arrêtent la séance à 23 h. Pour continuer, il faut un vote des deux tiers des membres présents, par blocs de 30 minutes ; sinon la séance est ajournée automatiquement.",
    ouVousLeVoyez:
      "« À 23 h, la présidente Cecilia Macedo constate l'heure et précise qu'à moins que le conseil, par un vote du 2/3 des membres présents, adopte une résolution afin de prolonger la séance du conseil, celle-ci est ajournée automatiquement à 23 h, et ce, conformément à l'article 7 du Règlement numéro L-12968. »",
  },
  {
    terme: 'Période de questions du public',
    categorie: 'vote',
    recherche: 'P[ÉE]RIODE DE QUESTIONS DU PUBLIC',
    definition:
      "Le moment de la séance du conseil où les citoyens prennent la parole. Le procès-verbal note le nom de chaque personne et le sujet en quelques mots ; il ne rapporte ni la question ni la réponse.",
    ouVousLeVoyez: "« PÉRIODE DE QUESTIONS DU PUBLIC — Christian Veilleux : Parc Pie X – entretien – passages urbains – éclairage ». Le site ne reprend pas ces noms.",
  },

  // ---------- Urbanisme ----------
  {
    terme: "Code de l'urbanisme",
    aussi: 'CDU-1',
    categorie: 'urbanisme',
    recherche: 'CDU-1',
    definition:
      "Le règlement CDU-1 réunit en un seul texte les règles d'urbanisme de Laval : zonage, lotissement, construction, plans d'implantation, usages conditionnels, frais de parcs. Ses modifications sont numérotées CDU-1-18, CDU-1-20… et suivent la procédure des règlements de zonage : premier projet, assemblée publique de consultation, second projet, adoption.",
    ouVousLeVoyez:
      "« Règlement numéro CDU-1-20 modifiant le Règlement CDU-1 concernant le Code de l'urbanisme de la Ville de Laval pour un territoire situé en bordure du boulevard René-Laennec ». Les dérogations mineures, les PIIA et les exemptions de stationnement s'y réfèrent.",
  },
  {
    terme: 'Dérogation mineure',
    categorie: 'urbanisme',
    recherche: 'd[ée]rogation mineure',
    definition:
      "Une permission d'écarter légèrement une règle du Code de l'urbanisme pour un terrain précis — une marge, une hauteur, un nombre de cases — sans changer le règlement pour tout le monde. Le comité exécutif l'accepte ou la refuse sur recommandation du comité consultatif d'urbanisme.",
    ouVousLeVoyez:
      "« DEMANDE DE DÉROGATION MINEURE ACCEPTÉE - … : d'accepter la demande de dérogation mineure au Règlement numéro CDU-1 concernant le Code de l'urbanisme DM-2026-50 de …, propriétaire, à l'effet d'autoriser, pour l'immeuble sur le lot … : une hauteur … au lieu de … ».",
  },
  {
    terme: "Plan d'implantation et d'intégration architecturale",
    aussi: 'PIIA',
    categorie: 'urbanisme',
    recherche: "PIIA|plan d'implantation et d'int[ée]gration architecturale",
    definition:
      "Dans certains secteurs, un projet de construction ou de transformation doit d'abord faire approuver son apparence et son implantation — volumes, matériaux, façades — au-delà des règles chiffrées du zonage. C'est le comité exécutif qui approuve, sur recommandation du comité consultatif d'urbanisme.",
    ouVousLeVoyez:
      "« DEMANDE D'APPROBATION D'UN PIIA ACCEPTÉE : d'accepter la demande d'approbation d'un plan d'implantation et d'intégration architecturale IA-2026-0117, à l'effet de permettre la construction… ».",
  },
  {
    terme: 'Projet particulier',
    aussi: 'PPCMOI',
    categorie: 'urbanisme',
    recherche: 'PPCMOI|projet particulier de construction',
    definition:
      "Un mécanisme qui autorise un projet précis qui déroge au zonage, à des conditions précises, sans modifier le règlement pour tout le secteur. Le nom au long : projet particulier de construction, de modification ou d'occupation d'un immeuble. Il s'adopte par résolution, avec consultation publique.",
    ouVousLeVoyez: "« ADOPTION - PROJET DE RÉSOLUTION AUTORISANT UN PPCMOI - LOT 1 374 173 », au comité exécutif, avec ses attendus.",
  },
  {
    terme: 'Exemption de cases de stationnement',
    categorie: 'urbanisme',
    recherche: 'exemption de (?:cases|l.obligation)',
    definition:
      "Le Code de l'urbanisme exige un nombre de cases de stationnement par bâtiment. Un propriétaire qui ne peut pas les fournir demande d'en être exempté et verse une compensation à la Ville. Le comité exécutif accepte sur recommandation du comité consultatif d'urbanisme.",
    ouVousLeVoyez:
      "« DEMANDE D'EXEMPTION DE CASES DE STATIONNEMENT ACCEPTÉE : d'accepter la demande d'exemption de l'obligation de fournir et de maintenir les cases de stationnement requises au Règlement numéro CDU-1 … en retour d'une compensation d'un montant de 559 $ ».",
  },
  {
    terme: 'Frais de parcs',
    aussi: 'fonds de parcs et terrains de jeux',
    categorie: 'urbanisme',
    recherche: 'frais de parcs?',
    definition:
      "Quand un terrain est loti ou qu'un permis de construction est délivré, le propriétaire doit céder une partie du terrain à la Ville pour des parcs, ou payer l'équivalent. L'argent va au fonds de parcs et terrains de jeux, qui finance ensuite des aménagements.",
    ouVousLeVoyez:
      "« APPROBATION - PAIEMENT - FRAIS DE PARCS - LOT 1 627 752 - PN-2026-0120 : d'approuver, conformément au chapitre 7 du titre 10 du Code de l'urbanisme, le paiement des frais de parcs par le versement de la somme de 83 840 $ ». Et de l'autre côté : « Dépenses - fonds de parcs et terrains de jeux - contrat DOS-3700 ».",
  },
  {
    terme: 'Lot du cadastre du Québec',
    aussi: 'lot projeté · partie de lot (P.)',
    categorie: 'urbanisme',
    recherche: 'du cadastre du Qu[ée]bec',
    definition:
      "Chaque terrain a un numéro unique au cadastre du Québec, à sept chiffres écrits par groupes de trois : 1 857 109. Un « lot projeté » est un numéro réservé pour un terrain qui n'existe pas encore (une subdivision à venir) ; « P. » devant un numéro veut dire une partie du lot.",
    ouVousLeVoyez:
      "Dans presque toutes les résolutions immobilières et d'urbanisme : « le lot 1 857 109 du cadastre du Québec, d'une superficie de 26 mètres carrés ». Un remplacement ou une correction cadastrale change ces numéros.",
  },
  {
    terme: 'Servitude',
    categorie: 'urbanisme',
    recherche: 'servitude',
    definition:
      "Un droit sur le terrain d'autrui : la Ville en acquiert pour protéger et entretenir une conduite enfouie, Hydro-Québec pour ses lignes. Elle s'achète de gré à gré ou, à défaut, par expropriation.",
    ouVousLeVoyez:
      "« d'autoriser l'acquisition de gré à gré ou par voie d'expropriation d'une servitude permanente sur une partie du lot 6 330 988 du cadastre du Québec, nécessaire pour protéger, maintenir et entretenir une conduite municipale enfouie ».",
  },
  {
    terme: 'Assemblée publique de consultation',
    categorie: 'urbanisme',
    recherche: 'assembl[ée]e publique de consultation|lettre aux citoyens',
    definition:
      "Avant d'adopter un règlement de zonage, la Ville doit consulter : le conseil adopte un premier projet et fixe la date de l'assemblée, où le projet est expliqué et où le public peut s'exprimer ; le second projet vient ensuite.",
    ouVousLeVoyez:
      "« …et de fixer l'assemblée publique de consultation au jeudi 17 septembre 2026 à 19 h, en la salle du conseil de l'hôtel de ville et par voie de visioconférence ». Le comité exécutif approuve la « lettre aux citoyens » qui annonce l'assemblée.",
  },
  {
    terme: 'Domaine public',
    aussi: 'exclusion du domaine public · ouverture de rue',
    categorie: 'urbanisme',
    recherche: 'domaine public|ouverture de (?:la )?rue',
    definition:
      "Les rues, les parcs et les terrains affectés à l'usage de tous font partie du domaine public de la Ville : ils ne se vendent pas. Pour aliéner un tel lot, le conseil doit d'abord l'exclure du domaine public ; à l'inverse, « ouvrir » une rue verse des lots au domaine public et au réseau routier.",
    ouVousLeVoyez:
      "« EXCLUSION DU DOMAINE PUBLIC - LOTS 1 784 706, 1 784 707 ET 1 784 708 : d'exclure les lots … du domaine public », « OUVERTURE DE RUE - LOTS … afin qu'elle fasse dorénavant partie du domaine public et du réseau routier ».",
  },

  // ---------- L'argent et les contrats ----------
  {
    terme: 'Adjudication de contrat',
    aussi: 'attribution · octroi · DOS-…',
    categorie: 'argent',
    recherche: 'adjuger le contrat|ADJUDICATION - CONTRAT|attribuer le contrat|octroyer le contrat',
    definition:
      "L'attribution officielle d'un contrat à une entreprise, au prix de sa soumission, après un appel d'offres ou une demande de prix. Le numéro DOS-3623 est celui du dossier d'approvisionnement ; les contrats plus anciens portent OS-SP-29554 ou SP-30190. Selon la résolution, la Ville « adjuge », « attribue » ou « octroie » le contrat.",
    ouVousLeVoyez:
      "« d'adjuger le contrat DOS-3705 à l'entreprise et au montant ci-dessous mentionnés, pour …, le tout selon les termes et conditions de sa soumission et des documents d'appel d'offres : Brault Maxtech inc. 1 888 989,07 $ ». Les plus gros passent au conseil sur recommandation du comité exécutif.",
  },
  {
    terme: "Appel d'offres et demande de prix",
    categorie: 'argent',
    recherche: "appel d'offres|demande de prix",
    definition:
      "Les deux façons de mettre les fournisseurs en concurrence : l'appel d'offres, public, pour les contrats importants ; la demande de prix, adressée à quelques fournisseurs invités, pour les plus petits. La résolution renvoie aux « documents d'appel d'offres » ou aux « documents de demande de prix ». La Ville vend aussi ses terrains excédentaires par appel d'offres public.",
    ouVousLeVoyez: "« …le tout selon les termes et conditions de sa soumission et des documents d'appel d'offres », « ALIÉNATION PAR APPEL D'OFFRES PUBLIC - LOT 1 289 937 ».",
  },
  {
    terme: 'Honoraires supplémentaires',
    categorie: 'argent',
    recherche: 'honoraires suppl[ée]mentaires',
    definition:
      "Des honoraires ajoutés à un contrat de services professionnels déjà accordé — ingénieurs, architectes — parce que le mandat s'est allongé ou étendu. Chaque ajout est autorisé par résolution, avec son montant.",
    ouVousLeVoyez: "« HONORAIRES SUPPLÉMENTAIRES - CONTRAT DOS-332 », « d'autoriser des honoraires supplémentaires au montant de 56 832,14 $ à Les Services EXP inc. … ».",
  },
  {
    terme: 'Contingence',
    aussi: 'crédits supplémentaires · quantités supplémentaires · reddition de comptes',
    categorie: 'argent',
    recherche: 'contingences?|quantit[ée]s suppl[ée]mentaires',
    definition:
      "La réserve prévue dans un contrat de travaux pour les imprévus. Quand elle est épuisée, l'instance autorise des crédits supplémentaires ; quand ce sont les quantités qui dépassent le devis, des quantités supplémentaires. Le service rend compte de ce qu'il a dépensé dans des rapports intérimaires puis un rapport final, dont le comité exécutif prend acte.",
    ouVousLeVoyez:
      "« CRÉDITS SUPPLÉMENTAIRES - CONTINGENCE DU CONTRAT DOS-2872 : d'autoriser des crédits supplémentaires au montant de 352 327,89 $ pour la contingence du contrat… », « RAPPORT INTÉRIMAIRE UNIQUE - REDDITION DE COMPTES - CONTINGENCES - CONTRAT DOS-3178 ».",
  },
  {
    terme: 'Cession de contrat',
    categorie: 'argent',
    recherche: 'cession (?:du|de) contrat',
    definition:
      "Une entreprise qui a un contrat avec la Ville le transfère à une autre — souvent la même sous un nouveau numéro d'entreprise, après une réorganisation. La Ville doit approuver la cession, aux mêmes conditions et jusqu'à la fin prévue du contrat.",
    ouVousLeVoyez: "« d'approuver la cession du contrat OS-SP-29554 par Lemay CO inc. (NEQ 1149007115) à Lemay CO inc. (NEQ 1180667447), et ce, jusqu'à la fin prévue dudit contrat ».",
  },
  {
    terme: 'Début des travaux, surveillance et mise en place des matériaux',
    categorie: 'argent',
    recherche: 'd[ée]but des travaux|mise en place des mat[ée]riaux',
    definition:
      "Une fois le contrat de travaux adjugé, le comité exécutif autorise l'entrepreneur à commencer, dès que ses garanties sont reçues, et confie en même temps la surveillance du chantier à une firme et le contrôle des matériaux à un laboratoire. Ces mandats sont payés selon des contrats à exécution sur demande déjà en place.",
    ouVousLeVoyez:
      "« DÉBUT, SURVEILLANCE ET MISE EN PLACE DES MATÉRIAUX - CONTRAT DOS-3574 : d'autoriser le début des travaux par …, et ce, sur réception des garanties exigées par les documents d'appel d'offres ; d'autoriser … à effectuer le contrôle de la mise en place des matériaux ainsi que les essais sur les matériaux au chantier et au laboratoire, au montant de 51 520,99 $ ».",
  },
  {
    terme: "Règlement d'emprunt",
    categorie: 'argent',
    recherche: 'emprunt de [\\d ]+ \\$|fonds disponibles au R[èe]glement',
    definition:
      "Le règlement par lequel la Ville s'autorise à emprunter pour des travaux ou un achat de longue durée. Il précise l'objet et le montant, passe par le registre des personnes habiles à voter, puis sert de caisse : les contrats sont ensuite financés « à même les fonds disponibles » au règlement.",
    ouVousLeVoyez:
      "« Règlement numéro L-13274 décrétant l'exécution de travaux … et décrétant un emprunt de 47 381 500 $ à cette fin » ; puis « DÉPENSES - RÈGLEMENT L-13248-F - CONTRAT DOS-3485 : de financer, à même les fonds disponibles au Règlement L-13248-F, un montant de … ».",
  },
  {
    terme: 'Crédits',
    aussi: 'virement de crédits',
    categorie: 'argent',
    recherche: 'cr[ée]dits',
    definition:
      "L'autorisation de dépenser une somme prévue au budget. Un virement de crédits déplace de l'argent d'un poste budgétaire à un autre en cours d'année, sans changer le total.",
    ouVousLeVoyez: "« d'autoriser des crédits au montant de 312 488 $ à Pre Labs inc. … », « VIREMENT DE CRÉDITS - POLICE ».",
  },
  {
    terme: 'Excédent de fonctionnement et réserves financières',
    aussi: 'affectation · appropriation',
    categorie: 'argent',
    recherche: 'exc[ée]dent de fonctionnement|r[ée]serve financi[èe]re|R[ée]serve bleue',
    definition:
      "L'excédent de fonctionnement est le surplus des années passées ; une partie est « affectée » à des fins précises (le logement social, par exemple), le reste est « non affecté ». Les réserves financières sont créées par règlement pour un usage donné. Y puiser demande une résolution : une affectation ou une appropriation.",
    ouVousLeVoyez:
      "« d'autoriser une affectation de l'excédent de fonctionnement non affecté au montant de 1 069 000 $ pour assurer le financement du contrat DOS-3523 », « d'autoriser le Service des finances à approprier un montant de 150 000 $, pris à même la réserve financière créée par le Règlement numéro L-12846 ».",
  },
  {
    terme: 'Aide financière',
    aussi: "entente d'aide financière · demande d'aide financière",
    categorie: 'argent',
    recherche: 'aide financi[èe]re',
    definition:
      "Dans un sens, la Ville subventionne un organisme : elle approuve une entente d'aide financière qui fixe le montant et les conditions. Dans l'autre, la Ville demande de l'argent à un gouvernement pour un projet : la résolution autorise le dépôt de la demande, elle ne garantit pas que l'aide sera accordée.",
    ouVousLeVoyez: "« APPROBATION - ENTENTE D'AIDE FINANCIÈRE - PERSPECTIVE FAMILLE », « AUTORISATION - DÉPÔT - DEMANDE D'AIDE FINANCIÈRE - MINISTÈRE DE L'EMPLOI ET DE LA SOLIDARITÉ SOCIALE ».",
  },
  {
    terme: 'Déboursés et liste des contrats',
    categorie: 'argent',
    recherche: 'rapports? des d[ée]bours[ée]s|liste des contrats',
    definition:
      "Deux redditions de comptes régulières dont les instances prennent acte : chaque semaine, le rapport des déboursés (les paiements faits) et le rapport des salaires, produits par la trésorière adjointe ; chaque mois, la liste des contrats préparée par le Service de l'approvisionnement, que la loi oblige à déposer au conseil.",
    ouVousLeVoyez:
      "« DÉPÔT - DÉBOURSÉS : de prendre acte des rapports des déboursés produits par la trésorière adjointe datés des 19 et 26 août 2026 au montant de 39 040 507,15 $ », « LISTE DES CONTRATS - MARS 2026 … conformément à l'article 477.3 de la Loi sur les cités et villes ».",
  },
  {
    terme: 'Taxes nettes incluses',
    categorie: 'argent',
    recherche: 'taxes nettes incluses',
    definition:
      "Les montants des résolutions sont souvent donnés « taxes nettes incluses » : ils comprennent la part des taxes de vente que la Ville ne récupère pas. Les municipalités se font rembourser une partie de la TPS et de la TVQ qu'elles paient ; le montant net est ce que coûte vraiment la dépense.",
    ouVousLeVoyez: "« un montant de 221 600 $, taxes nettes incluses ». Le montant de la soumission, lui, est écrit avec les taxes : « 832 131,56 $ ».",
  },
  {
    terme: 'Traces Québec',
    categorie: 'argent',
    recherche: 'Traces Qu[ée]bec',
    definition:
      "Le système gouvernemental qui suit les sols contaminés excavés d'un chantier jusqu'au lieu où ils sont traités. Pour chaque contrat de travaux qui creuse, la Ville autorise à part le paiement des frais de traçabilité et d'une redevance au ministre des Finances, et cela apparaît comme une résolution distincte.",
    ouVousLeVoyez:
      "« AUTORISATION - PAIEMENT - TRACES QUÉBEC - CONTRAT DOS-3574 : d'autoriser le paiement des frais prévus au Règlement concernant la traçabilité des sols contaminés excavés, suivis par le biais du système gouvernemental de traçabilité Traces Québec … au montant estimé de 11 399,40 $ ».",
  },
];
