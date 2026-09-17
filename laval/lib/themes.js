// Classement thématique des décisions — « ça parle de quoi ».
//
// Même méthode qu'à Québec, Montréal et Longueuil, adaptée aux libellés de Laval. Une fiche porte
// ici deux textes :
//
//   - l'OBJET, en casse normale, pris à l'ordre du jour du conseil quand il existe (« Adjuger le
//     contrat DOS-3691 à Béluga Construction inc. pour les travaux d'aqueduc, d'égouts… ») ;
//   - le TITRE du procès-verbal, une formule stable en majuscules qui dit le GESTE plus que le
//     sujet : « ADJUDICATION - CONTRAT DOS-3691 », « DEMANDE DE DÉROGATION MINEURE ACCEPTÉE »,
//     « DÉPÔT - PROJET DE RÈGLEMENT L-13280 », « CERTIFICAT DE REGISTRE », « VENTE - JOHANNE
//     LEFRANÇOIS », « DÉBUT, SURVEILLANCE ET MISE EN PLACE DES MATÉRIAUX - CONTRAT DOS-3574 ».
//
// Au comité exécutif, l'ordre du jour ne donne pas l'objet : la fiche n'a que la formule, remise
// en casse de phrase — trois fiches sur quatre en 2026. C'est pourquoi les formules de la Ville
// sont reconnues une à une ici, en plus des mots du sujet. Une formule sans sujet (« Adjudication
// - contrat DOS-3653 ») sort dans le véhicule qu'elle nomme, Contrats : on ne devine pas ce que
// le contrat achète, c'est le sommaire décisionnel qui le dit.
//
//   1. L'OBJET, par règles de mots-clés, les sujets avant les véhicules (contrats, finances,
//      procédure) — voir l'avertissement plus bas, hérité de Québec.
//   2. À défaut, le TITRE du procès-verbal, avec les mêmes règles : « DÉPENSES - RÈGLEMENT
//      L-13263 - CONTRAT DOS-3523 » dit « finances » quand l'objet de l'ordre du jour, « Financer
//      à même les fonds disponibles… », ne l'avait pas dit.
//   3. À défaut, le CHAPITRE de l'ordre du jour du conseil (« Avis de motion », « Étude et
//      adoption des projets de règlements de zonage… »).
//   4. Faute de mieux, « Administration », avec `themeSource: 'defaut'`.
//
// Recompter à chaque changement de règles (le scraper affiche la répartition) et viser zéro
// « defaut » sur une année complète — sans tout envoyer en « Administration » : le dernier
// filet de ce fichier ne doit attraper que ce qui n'a vraiment pas de sujet.
//
// PIÈGES RENCONTRÉS EN CALIBRANT SUR 2026 (2 892 fiches) — des sous-chaînes qui accrochaient :
//   « développement » contient « velo », « transport » contient « sport », « procéder » contient
//   « céder », « Images » contient « ges », « souterraines » contient « aines », « Industriel »
//   (le boulevard) contient « industriel ». D'où les \b partout où un mot court sert de clé.
//   Et « cadastre du Québec » est dans l'adresse de la moitié des fiches immobilières : « cadastr »
//   n'est PAS un mot d'urbanisme ; « remplacement cadastral » et « correction cadastrale » le sont.

export const THEMES = {
  procedure: { libelle: 'Procédure', couleur: '#8b8577' },
  urbanisme: { libelle: 'Urbanisme', couleur: '#8a6b8f' },
  transport: { libelle: 'Transport', couleur: '#4f7288' },
  immobilier: { libelle: 'Immobilier', couleur: '#7d6a55' },
  subventions: { libelle: 'Subventions', couleur: '#2f6b4f' },
  contrats: { libelle: 'Contrats', couleur: '#a3705c' },
  finances: { libelle: 'Finances', couleur: '#96741a' },
  rh: { libelle: 'Ressources humaines', couleur: '#6f7a52' },
  environnement: { libelle: 'Environnement', couleur: '#5f7f6b' },
  culture: { libelle: 'Culture et patrimoine', couleur: '#9c5f6b' },
  loisirs: { libelle: 'Loisirs et communauté', couleur: '#4e7f7a' },
  securite: { libelle: 'Sécurité publique', couleur: '#a33a2c' },
  economie: { libelle: 'Développement économique', couleur: '#7a6aa0' },
  travaux: { libelle: 'Travaux et infrastructures', couleur: '#6b7280' },
  administration: { libelle: 'Administration', couleur: '#7c7468' },
  honneurs: { libelle: 'Motions et hommages', couleur: '#9F1239' },
  social: { libelle: 'Logement et social', couleur: '#0D9488' },
};

// L'ordre compte : la première règle qui accroche gagne.
const REGLES = [
  // ---- La séance elle-même : ce qui ne parle de rien d'autre.
  ['procedure', /^(?:proc[èe]s-verbal|ordre du jour)\b|approbation - proc[èe]s-verbal|approuver le proc[èe]s-verbal|proc[èe]s-verba(?:l|ux) des s[ée]ances|prolongation de la s[ée]ance|p[ée]riode de questions|calendrier des s[ée]ances|lev[ée]e de la s[ée]ance|ajournement|adoption (?:de l'|[–-] )ordre du jour|r[èe]gles de r[ée]gie|questions? [ée]crites?|certificat de registre|personnes habiles [àa] voter/i],

  // ---- Les ressources humaines quand la formule ne laisse aucun doute. Une lettre d'entente avec
  // le syndicat des loisirs parle du syndicat, pas des loisirs ; « structure organisationnelle -
  // police » est un organigramme ; « nomination - directeur(trice) - immeubles, parcs… » est une
  // embauche. Ces formules passent donc avant les sujets. « Nomination » toute seule, non : à Laval
  // elle sert autant aux membres de comités qu'aux cadres (voir la règle Administration plus bas).
  ['rh', /convention collective|lettre d'entente|syndicat|terminaison d'emploi|cong[ée]diement|activit[ée] de perfectionnement|rapport d'engagement|rapport de nominations?|structure organisationnelle|r[ée]gime de retraite|comit[ée] de retraite|embauche|cr[ée]ation (?:de|du|d'un) poste|abolition (?:de|du|d'un) poste|nominations? - directeur|directeur\(trice\)|nommer (?:le|la|un|une) (?:directeur|directrice|tr[ée]sori|greffi|chef)|\bgriefs?\b|conditions? de travail|harc[èe]lement|\bdotation\b|\beffectifs\b|[ée]chelles? salariales?|membre de cabinet|ressources humaines|assurance collective|\bpaie\b|campagne de souscription|r[ée]mun[ée]ration(?! du maire| des membres| des [ée]lus)/i],

  // ---- La toponymie avant l'urbanisme : « Nommer la future voie de communication située sur les
  // lots… » parle d'un nom, pas d'un lotissement.
  ['culture', /toponym|nommer (?:la |le |l'|une? )(?:[\p{L}'\u2019-]+ ){0,2}?(?:voie|rue|place|parc|ruelle|sentier|boulevard|avenue|[ée]cole|centre|berge|bois|lac|pont|biblioth[èe]que|ar[ée]na|pavillon|salle|b[âa]timent|immeuble)\b/i],

  // ---- Une liste de bénéficiaires d'aide à la rénovation est une liste de subventions, même si
  // les programmes s'appellent « bâtiments patrimoniaux » et « adaptation de domicile ».
  ['subventions', /liste - programmes?|programmes? de revitalisation des b[âa]timents|maisons l[ée]zard[ée]es|b[ée]n[ée]ficiaires ayant re[çc]u/i],

  // ---- Les sujets.
  ['urbanisme', /urbanisme|\bCDU-1\b|zonage|d[ée]rogations? mineures?|projet particulier|PPCMOI|usage conditionnel|plan d'implantation|PIIA|cases? de stationnement|d[ée]molition|lotissement|cadastrale?s?\b|remplacement cadastral|sch[ée]ma d'am[ée]nagement|plan d'urbanisme|plan particulier d'urbanisme|\bPPU\b|densit[ée]|hauteur|marge de recul|CPTAQ|zone agricole|autres? qu'agricoles?|comit[ée] consultatif agricole|patrimoine b[âa]ti|site patrimonial|comit[ée] consultatif d'urbanisme|\bCCU\b|lettre aux citoyens|assembl[ée]e (?:publique )?de consultation|changement de zonage|frais de parcs?|projet int[ée]gr[ée]|certificat et permis|permis de construction|d[ée]livrance - certificat|projets? de r[èe]glements? de zonage|usages? d[ée]rogatoires?|construction, de transformation|comit[ée] d'examen technique|code de construction|milieux humides et hydriques/i],
  ['immobilier', /expropriation|servitude|emphyt[ée]o|acqui(?:sition|érir) (?:d'un |de l'|des |du |de )?(?:immeuble|terrain|lot|emplacement|parcelle|propri[ée]t[ée])|acquisition .{0,60}\blots?\b|\bvendre\b|^vente\b|- vente\b|\bvente\b.{0,40}\blots?\b|offre de vente|promesse d'achat|exclusion du domaine public|inclusion - lots?|inclure les? lots?|ouverture de rue|fermeture de rue|\bbail\b|\bbaux\b|\blouer\b|location (?:d'un |d'|de l'|du )?(?:immeuble|local|espace|terrain|b[âa]timent)|pr[êe]t [àa] usage|convention d'occupation|permission d'acc[èe]s|droit de pr[ée]emption|acte de cession|engagement [àa] c[ée]der|cession de bail|cession (?:d'un |de l'|du |des |de )?(?:terrain|lot|immeuble|emplacement|parcelle)|^[ée]change\b|- [ée]change -|[ée]change (?:de |d'une partie )?(?:terrains?|lots?|immeubles?)|occupation du domaine public|r[ée]serve fonci[èe]re|ali[ée]nation|r[ée]trocession|droit de passage|immeuble exc[ée]dentaire|transactions et des investissements immobiliers/i],
  ['transport', /\bSTL\b|soci[ée]t[ée] de transport de laval|\bARTM\b|autorit[ée] r[ée]gionale de transport|\bREM\b|\bexo\b|stationnement|circulation|transport (?:en commun|collectif|actif|adapt[ée])|transports et (?:de )?la mobilit[ée]|autobus|m[ée]tro\b|piste cyclable|voie cyclable|\bv[ée]los?\b|cyclistes?|mobilit[ée](?! cellulaire)|d[ée]neigement|feux de circulation|signalisation|marquage|sens unique|limite de vitesse|s[ée]curit[ée] routi[èe]re|\btaxis?\b|autopartage|BIXI|rue pi[ée]tonne|voie r[ée]serv[ée]e|remorquage|fourri[èe]re|dos d'[âa]ne|ralentisseurs?|passages? pi[ée]tonniers?|travers(?:e|es) (?:pi[ée]tonni[èe]res?|scolaires?)|ferroviaire|voies ferr[ée]es|autoroute|apaisement de la circulation|brigadi/i],
  ['social', /logement social|logements? (?:abordables?|sociaux|communautaires?)|logement communautaire|itin[ée]rance|\bOMH\b|office municipal d'habitation|corporation d'habitation|Acc[èe]sLogis|habitation et du logement|projet d'habitation|habitation (?:multifamiliale|sociale)|h[ée]bergement|banque alimentaire|s[ée]curit[ée] alimentaire|moisson laval|personnes vuln[ée]rables|inclusion sociale|accessibilit[ée] universelle|personnes handicap[ée]es|lutte contre la pauvret[ée]|milieux d[ée]favoris[ée]s|salubrit[ée]|\ba[îi]n[ée]e?s\b|jeunes en difficult[ée]|conseil des lavalloises|condition f[ée]minine|interculturel|immigra|nouveaux arrivants|diversit[ée]|d[ée]veloppement social|adaptation de domicile|\bfamilles?\b|\bjeunesse\b|centre de b[ée]n[ée]volat|violence conjugale|racisme|r[ée]ussite [ée]ducative|r[ée]novation qu[ée]bec|plan d'action en habitation|politique d'habitation|commission de l'habitation|menstruel|croix-rouge/i],
  // ⚠ TOUS LES SUJETS AVANT LES VÉHICULES. « Contrats » dit COMMENT la Ville agit, les
  // autres disent SUR QUOI — et c'est le sur quoi qui intéresse le lecteur.
  ['environnement', /environnement(?! inc)|[ée]cocitoyennet[ée]|verdissement|canop[ée]e|(?<!val-des-)\barbres?\b|plantation|mati[èe]res r[ée]siduelles|collecte des (?:d[ée]chets|mati[èe]res|ordures)|recyclage|compost|[ée]cocentre|eau potable|eaux us[ée]es|usine (?:de production|d'[ée]puration|de filtration)|station (?:d'[ée]puration|de pompage)|gestion de l'eau|StaRRE|station de r[ée]cup[ée]ration des ressources de l'eau|ressources de l'eau|fili[èe]re solide|bassins? de r[ée]tention|milieux? (?:humides?|naturels?|hydriques?)|biodiversit[ée]|climatiques?|propri[ée]t[ée] [ée]ponge|[ée]cologique|\bGES\b|transition [ée]cologique|d[ée]veloppement durable|d[ée]carbonation|d[ée]min[ée]ralisation|[îi]lots? de chaleur|pesticides|contamin|sols? excav[ée]s|traces qu[ée]bec|\bberges?\b|rivi[èe]re des (?:mille [îi]les|prairies)|bois (?:de |d')|bois lavallois|for[êe]t|\bfaune\b|inondations?|plaine inondable|zone inondable|\bradon\b|nuisances|v[ée]hicules? [ée]lectriques?|[ée]lectrification|[ée]nerg[ée]tique|\bagrile\b|\banimaux\b|animalier|cours d'eau|d[ée]p[ôo]t [àa] neige|neiges us[ée]es|qualit[ée] de l'air|analyses? de l'air/i],
  ['honneurs', /f[ée]licitations|hommage|condol[ée]ances|reconnaissance [àa]|comm[ée]mor|d[ée]claration (?:pour|visant|soulignant|reconnaissant|de solidarit[ée]|d'appui)|journ[ée]e (?:internationale|mondiale|nationale|de la)|mois de l'histoire|semaine (?:de|nationale|qu[ée]b[ée]coise)|souligner|citoyenne? d'honneur|drapeau|minute de silence|m[ée]daille/i],
  ['culture', /culturel|\bculture\b|biblioth[èe]ques?|mus[ée]e|patrimoi|arch[ée]ologi|[oœ]uvres? d'art|art public|monument|festival|th[ée][âa]tre|artistes?|artistique|conseil des arts|salle (?:de spectacle|andr[ée]-mathieu|alfred-pellan)|maison des arts|cin[ée]ma|langue fran[çc]aise|soci[ée]t[ée] d'histoire|g[ée]n[ée]alogie|arthist|\barchives\b|centrale des artistes|lieux de cr[ée]ation|lecture publique|cit[ée] de la culture|cosmod[ôo]me|mus[ée]e armand-frappier|\blivres?\b/i],
  ['loisirs', /loisirs?|\bsportifs?\b|\bsportives?\b|\bsports?\b|\bparcs?\b(?! industriel)|piscine|ar[ée]na|patinoire|terrains? de (?:jeux?|soccer|baseball|tennis|balle)|aires? de jeux|jeux d'eau|camps? de jour|centre communautaire|vie communautaire|organismes? communautaires?|jardins? communautaires?|plein air|activit[ée]s? physiques?|installations? r[ée]cr[ée]atives?|r[ée]cr[ée]atives?|plateaux sportifs|place bell|centre de la nature|heures de glace|centre sportif|complexe (?:sportif|aquatique)|gymnase|pratique religieuse collective|f[êe]tes? (?:de quartier|nationale|des voisins)|b[ée]n[ée]volat|b[ée]n[ée]voles|\btennis\b|\bsoccer\b|\bhockey\b|natation|aquatique|jeux du qu[ée]bec|glissade|pistes? de ski|bois papineau|marina|espaces? verts|espaces publics|clubs? (?:de|sportif)|p[ôo]le communautaire|stade\b|chalet\b/i],
  ['securite', /incendie|service de police|\bpolice\b|polici[èe]re?s?\b|s[ée]curit[ée] (?:publique|civile|urbaine)|mesures d'urgence|premiers r[ée]pondants|pompiers|cour municipale|constats? d'infraction|cam[ée]ras? corporelles|\b911\b|centre d'urgence|s[ûu]ret[ée] du qu[ée]bec|balistiques?|comit[ée] mixte municipal-industriel|\bCMMI\b|syst[èe]me d'alarme|surveillance de quartier|d[ée]tecteurs? de fum[ée]e|gicleurs|criminalit[ée]|s[ée]curit[ée] des personnes|s[ée]curit[ée] - boulevard|am[ée]lioration - s[ée]curit[ée]|9-1-1/i],
  ['economie', /d[ée]veloppement [ée]conomique|[ée]conomi(?:e|ques?)\b|entrepreneuria|soutien aux entrepr|incubateur|\bcommerces?\b|commer[çc]ants?|soci[ée]t[ée]s? de d[ée]veloppement commercial|\bSDC\b|zone industrielle|parc industriel|secteur industriel|tourisme|touristique|\bPME\b|innovation(?! et (?:des )?technologies)|centre-ville|art[èe]re commerciale|march[ée] public|fonds local d'investissement|fonds local de solidarit[ée]|investissement conjoint|fonds entrepreneuriat|laval [ée]conomique|relance [ée]conomique|zone d'innovation|biotech|main-d'[oœ]uvre|laval technopole/i],
  ['travaux', /r[ée]fection|t[ée]l[ée]communications?|accord d'acc[èe]s municipal|reconstruction|pavage|resurfa[çc]age|trottoirs?|chauss[ée]e|infrastructures?|conduites? (?:d'eau|principale|secondaire|d'aqueduc|municipale)|aqueduc|[ée]gouts?\b|puisards?|drainage|pluviales?|r[ée]seau routier|travaux (?:de|d')|d[ée]but des travaux|d[ée]but(?:,| et) (?:surveillance|assistance|soutien|mise en place|revues)|mise en place des mat[ée]riaux|contr[ôo]le (?:qualit[ée]|des mat[ée]riaux)|surveillance des travaux|viaduc|\bponts?\b|tunnel|[ée]clairage|r[ée]am[ée]nagement de (?:la|l'|du) (?:rue|avenue|boulevard|intersection)|\bouvrages?\b|services professionnels .{0,40}(?:ing[ée]nierie|ing[ée]nieurs|travaux|architect)|plans et devis|r[ée]servoir|toiture|enveloppe|[ée]lectrom[ée]canique|r[ée]novation|hydro-qu[ée]bec|[ée]nergir|b[âa]timents? municipa|garage (?:municipal|du secteur)|entretien m[ée]nager|travaux publics|ing[ée]nierie|g[ée]nie[ -]conseil|enfouissement|utilit[ée]s publiques|pompes?\b|fondations?|structure du/i],

  // Une nomination à un comité, une commission ou un conseil d'administration relève de la
  // gouvernance, pas des ressources humaines : la personne n'est pas une employée. Les comités
  // qui ont un sujet (environnement, patrimoine, jeunesse…) sont déjà partis plus haut.
  ['administration', /(?:nominations?|nommer|d[ée]signer|d[ée]signations?|renouvellement|reconduction|reconduire).{0,90}(?:\bmembres?\b|comit[ée]|commission|conseil d'administration|repr[ée]sentante?s?\b|substituts?\b|pr[ée]sidente?\b|d[ée]l[ée]gu[ée])|maire suppl[ée]ant|r[ée]mun[ée]ration (?:du maire|des membres|des [ée]lus)/i],
  // La gouvernance et le juridique avant les mots d'emploi : « Code d'éthique… des personnes élues
  // et de leurs employés » parle d'éthique, pas d'employés.
  ['administration', /code d'[ée]thique|d[ée]ontologie|politique (?:de|d'|sur|familiale|municipale)|plan d'action|plan strat[ée]gique|plans? (?:directeur|global)|d[ée]l[ée]gation de pouvoirs|pouvoirs d[ée]l[ée]gu[ée]s|r[èe]glement l-ce-1|comit[ée] consultatif|comit[ée] (?:de|sur|d')|commission (?:permanente|sur|de la|des|d')|conseil d'administration|renouveler le mandat|mandat (?:r[ée]vis[ée]|de la commission|du comit[ée])|rapport (?:annuel|d'activit[ée]s|de la|du v[ée]rificateur|de l'ombudsman)|v[ée]rificateur g[ée]n[ée]ral|v[ée]rificatrice g[ée]n[ée]rale|ombudsman|acc[èe]s [àa] l'information|gouvernance|organigramme|direction g[ée]n[ée]rale|adh[ée]sion|\bUMQ\b|\bFQM\b|union des municipalit[ée]s|\bCMM\b|communaut[ée] m[ée]tropolitaine|assurances?\b|r[èe]glement hors cour|transaction et quittance|r[ée]clamations?|poursuite|litige|\brecours\b|jugement|cour sup[ée]rieure|affaires juridiques|\bgreffe\b|greffi[èe]re|[ée]lections?|partis politiques|int[ée]r[êe]ts p[ée]cuniaires|technologies de l'information|innovation et (?:des )?technologies|informatique|logiciels?|licences? d'utilisation|licence d'abonnement|infonuagique|cybers[ée]curit[ée]|archivage|gestion documentaire|traitement documentaire|renseignements personnels|avis publics|communications?\b|contr[ôo]le financier|saine gestion|redressement|proximit[ée]|\bENAP\b|[ée]cole nationale d'administration|regroupement d'achats|centre d'acquisitions gouvernementales|entente de collaboration|entente sectorielle|entente de recherche/i],
  ['rh', /nominations?\b|\bnommer\b|d[ée]mission|structure administrative|abolition (?:de|du) (?:poste|division)|\bposte\b|traitement (?:des|du) (?:cadres|employ)|congr[èe]s|colloque|mission [àa] l'[ée]tranger|d[ée]placement|\bformations?\b|\bretraite\b|\bpersonnel\b|employ[ée]e?s?(?![a-zà-ÿ])|\bcadres?\b|d[ée]signations?\b|d[ée]signer\b/i],
  ['subventions', /subventions?|soutien financier|contribution financi[èe]re|aide financi[èe]re|appel de projets|programmes? de (?:soutien|financement|subvention)|convention (?:de contribution|d'aide)|entente d'aide|verser (?:une|un) (?:somme|montant|contribution)|accorder (?:une|un) (?:soutien|contribution|aide)|financement (?:de|d'un|des) (?:projet|organisme)|commandite|\bdons?\b|fonds pour b[âa]tir|f[ée]d[ée]ration canadienne des municipalit[ée]s|programme d'aide|b[ée]n[ée]ficiaires|\bbourses?\b/i],
  // À partir d'ici, les véhicules : ce qui reste quand aucun sujet n'a été reconnu. Ici « contrat
  // DOS-3159 » tout seul ne tranche pas : « Dépenses - règlement L-13086-F - contrat DOS-3159 »
  // est une affaire d'argent, « Début des travaux - contrat DOS-3159 » une affaire de travaux ;
  // seul le GESTE contractuel (adjuger, attribuer, céder, reconduire, modifier) fait Contrats.
  ['contrats', /adjudication|adjuger|adjudicataire|attribution|attribuer|octroi - contrat|octroyer le contrat|contrats? [àa] ex[ée]cution|contrat-cadre|accorder (?:un|une|le|les|des) contrats?|contrat (?:de|d'|pour|à)|appel d'offres|soumission|gr[ée] [àa] gr[ée]|entente(?:-cadre)?|convention|protocole|avenant|renouvel(?:er|lement) (?:du|de la|de l'|le|la|des|- )?(?:contrat|entente|convention)|reconduction|reconduire|r[ée]sili|fournisseur|services professionnels|approuver (?:le|un) projet (?:d'entente|de convention|de protocole)|cession de contrats?|cession du contrat|honoraires suppl[ée]mentaires|quantit[ée]s? suppl[ée]mentaires|travaux suppl[ée]mentaires|modification (?:de|du|au) contrat|liste des contrats|gestion contractuelle|rapports? (?:int[ée]rimaires?|finals?|finaux)|reddition de comptes|demande de prix|approvisionnement|offre de services|prolongation (?:du|de) contrat|contrat d'ex[ée]cution|contrats? adjug[ée]s/i],
  ['finances', /budget|programme (?:d[ée]cennal|triennal) d'immobilisations|\bPDI\b|\bPTI\b|emprunt|obligations|r[ée]solution de concordance|r[ée]solution de courte [ée]ch[ée]ance|\btaxes?\b|taxation|imposition|tarif|[ée]tats financiers|rapport financier|rapport p[ée]riodique|r[ée]sultats pr[ée]visionnels|exercice financier|\bfinances\b|financi[èe]re?s?\b|virement|cr[ée]dits|affectation|appropriation|surplus|exc[ée]dent|r[ée]serve bleue|fonds (?:g[ée]n[ée]ral|de parcs|de roulement)|quote-part|d[ée]penses?\b|paiement|radiation|comptes? rendus? financier|\bdette\b|amnistie|remboursement|financement|financer|contingences?|deniers|tr[ée]sorerie|factures?|d[ée]bours[ée]s|indemnit[ée]|comptabilit[ée]|fiscal|r[ôo]le d'[ée]valuation|[ée]valuation fonci[èe]re|immobilisations|r[èe]glement l-\d+-f\b|amortissement|fonds disponibles|sommes disponibles/i],
  // En dernier recours : un avis de motion portant sur l'urbanisme doit sortir en Urbanisme,
  // pas en Procédure. C'est pour ça que cette règle passe après les sujets.
  ['procedure', /avis de motion|adoption (?:du|-|–) (?:projet de |second projet de )?r[èe]glement|adopter (?:le|un|sans changement) (?:projet de )?r[èe]glement|r[èe]glement (?:modifiant|num[ée]ro|intitul[ée])|projet de r[èe]glement|prendre acte|prise d'acte|d[ée]p[ôo]ts?\b|correction|abroger|abrog[ée]e|modifier la r[ée]solution|amender la r[ée]solution|r[ée]solution (?:amend[ée]e|abrog[ée]e|modifi[ée]e)|certificat de registre|\bregistre\b|approbation r[ée]f[ée]rendaire|personnes habiles [àa] voter|recommander au conseil|recommandation au conseil|ratifi|proc[èe]s-verbal|s[ée]ance\b|huis clos/i],
  // Dernier recours, après tout le reste.
  ['honneurs', /remerciements?|donation|prix (?:de|d')|troph[ée]e/i],
  ['urbanisme', /am[ée]nagement|requalification|projet immobilier|\bsecteur\b|\bquartier\b|\brues?\b|\bavenue\b|\bboulevard\b|\bruelle\b|\blots?\b|immeubles?|b[âa]timents?|\bterrains?\b/i],
  ['economie', /march[ée]|[ée]v[ée]nement|activit[ée] (?:promotionnelle|commerciale)/i],
  // « Autorisation - mandat - contrat DOS-2125 », « Autorisation - acquisition - contrat DOS-1949 » :
  // un contrat, avant que « autorisation » n'envoie tout en Administration.
  ['contrats', /\bacquisition\b|\bachat\b|fourniture|\bcontrats?\b|\blocation\b|\bmandat\b/i],
  ['administration', /participation|repr[ée]senter la ville|autoriser (?:la|le) (?:greffier|greffi[èe]re|maire|mairesse)|signer|signature|proc[ée]dure|demande au gouvernement|d[ée]cret|projet de loi|f[ée]d[ée]ral|provincial|minist[èe]re|ministre|gouvernement|loi sur les cit[ée]s et villes|avis de proposition|proposition|autorisation|approbation|acceptation|\bappui\b|d[ée]l[ée]gation|\brapports?\b|\bliste\b|mise en [oœ]uvre|r[ée]alisation|d[ée]livrance|certificat|permis|renouvellement|modifications?|retrait|inclusion|exclusion|programme/i],
  ['contrats', /services?\b/i],
];

// Le CHAPITRE de l'ordre du jour du conseil, où la Ville range elle-même chaque point. Troisième
// recours, après l'objet et le titre. « Présentation des recommandations du comité exécutif »
// mêle tout : il ne tranche pas et laisse la place au défaut. Les libellés arrivent parfois avec
// un bout de pied de page (« … Version 1 Page 7 de 10 ») ou en majuscules : on n'ancre que le
// début, sans tenir compte de la casse.
const PAR_CHAPITRE = [
  [/^avis de motion/i, 'procedure'],
  [/^approbation des proc[èe]s-verbaux/i, 'procedure'],
  [/^[ée]tude et adoption des (?:projets de |seconds projets de )?r[èe]glements de zonage/i, 'urbanisme'],
  [/^[ée]tude et adoption des r[èe]glements/i, 'procedure'],
  [/^d[ée]p[ôo]t de documents administratifs/i, 'administration'],
  [/^discussions sur les propositions/i, 'administration'],
];

// L'apostrophe courbe de la Ville (« code d’éthique », « RÉSOLU À L’UNANIMITÉ ») et ses espaces
// insécables ne doivent pas faire rater une règle.
function normaliser(s) {
  return String(s ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Renvoie { theme, themeSource } — toujours un thème, la source dit ce qui a tranché :
// 'objet', 'titre' (la formule du procès-verbal), 'chapitre' (l'ordre du jour) ou 'defaut'.
export function classer({ objet, titre, chapitre, type }) {
  // Le procès-verbal et l'ordre du jour eux-mêmes, quand ils ont leur fiche.
  if (type === 'Procès-verbal' || type === 'Ordre du jour') return { theme: 'procedure', themeSource: 'objet' };
  const texte = normaliser(objet);
  for (const [theme, regle] of REGLES) {
    if (regle.test(texte)) return { theme, themeSource: 'objet' };
  }
  // Le titre du procès-verbal ne dit pas le sujet, mais il dit le geste — et le geste a un
  // thème. Au comité exécutif, l'objet EST le titre (remis en casse de phrase) : rejouer les
  // règles ne change rien, mais ne coûte rien non plus.
  const formule = normaliser(titre);
  if (formule && formule.toLocaleLowerCase('fr-CA') !== texte.toLocaleLowerCase('fr-CA')) {
    for (const [theme, regle] of REGLES) {
      if (regle.test(formule)) return { theme, themeSource: 'titre' };
    }
  }
  if (chapitre) {
    const chap = normaliser(chapitre);
    for (const [regle, theme] of PAR_CHAPITRE) {
      if (regle.test(chap)) return { theme, themeSource: 'chapitre' };
    }
  }
  return { theme: 'administration', themeSource: 'defaut' };
}
