// Classement thématique des décisions — « ça parle de quoi ».
//
// Même méthode qu'à Québec (lib/themes.js du volet villedequebec), réécrite pour les
// libellés de Montréal. Ici l'objet d'une résolution commence presque toujours par un
// verbe à l'infinitif — « Accorder un contrat à… », « Approuver un projet d'entente… »,
// « Adopter le règlement… », « Nommer… » — et la Ville n'accompagne pas ses
// résolutions d'une unité administrative dans les procès-verbaux. Le service émetteur
// est parfois lisible sur l'ordre du jour ; quand on l'a, il sert de second recours.
//
//   1. L'OBJET, par règles de mots-clés, les sujets avant les véhicules (contrats,
//      finances) — voir l'avertissement plus bas, hérité de Québec.
//   2. À défaut, l'UNITÉ (le service) quand l'ordre du jour la donne.
//   3. Faute de mieux, « Administration », avec `themeSource: 'defaut'`.
//
// Recompter à chaque changement de règles (le scraper affiche la répartition) et viser
// zéro « defaut » sur une année complète.

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
  ['procedure', /proc[èe]s-verbal|ordre du jour|p[ée]riode de questions|annonces et d[ée]p[ôo]t|d[ée]p[ôo]t de p[ée]titions|d[ée]p[ôo]t de la r[ée]ponse|d[ée]p[ôo]t des rapports|prise en consid[ée]ration|calendrier des (?:s[ée]ances|assembl[ée]es)|r[èe]gles de r[ée]gie|ajournement|lev[ée]e de la s[ée]ance|prochaine s[ée]ance|adoption de l'ordre|prendre acte du d[ée]p[ôo]t/i],
  ['urbanisme', /urbanisme|zonage|d[ée]rogations? mineures?|projet particulier|PPCMOI|usage conditionnel|plan d'implantation|PIIA|d[ée]molition|lotissement|cadastr|construction, de transformation|r[èe]glement (?:d')?(?:urbanisme|zonage)|article 89|sch[ée]ma d'am[ée]nagement|plan d'urbanisme|plan particulier d'urbanisme|PPU\b|densit[ée]|hauteur|marge de recul|op[ée]ration cadastrale|CPTAQ|patrimoine b[âa]ti|site patrimonial/i],
  ['transport', /stationnement|circulation|transport (?:en commun|collectif|actif)|STM\b|REM\b|ARTM|autobus|m[ée]tro|piste cyclable|voie cyclable|v[ée]lo|mobilit[ée]|d[ée]neigement|feux de circulation|signalisation|sens unique|limite de vitesse|s[ée]curit[ée] routi[èe]re|taxi|autopartage|BIXI|rue pi[ée]tonne|voie r[ée]serv[ée]e/i],
  ['immobilier', /expropriation|servitude|acqui(?:sition|érir) (?:d'un|de l'|des|du) (?:immeuble|terrain|lot|emplacement)|acquisition .{0,30}(?:lot|immeuble|terrain)|vente (?:d'un|de l'|du|des) (?:immeuble|terrain|lot)|projet d'acte|bail|louer|location d'(?:un|espace)|c[ée]der|cession|[ée]change de terrain|occupation du domaine public|r[ée]serve fonci[èe]re|emphyt[ée]o/i],
  ['social', /logement social|logements? abordables?|logement communautaire|itin[ée]rance|OMHM|Office municipal d'habitation|AccèsLogis|h[ée]bergement|banque alimentaire|s[ée]curit[ée] alimentaire|personnes vuln[ée]rables|inclusion|accessibilit[ée] universelle|lutte contre la pauvret[ée]|salubrit[ée]|a[îi]n[ée]s|jeunes en difficult[ée]/i],
  // ⚠ TOUS LES SUJETS AVANT LES VÉHICULES. « Contrats » dit COMMENT la Ville agit, les
  // autres disent SUR QUOI — et c'est le sur quoi qui intéresse le lecteur.
  ['environnement', /environnement|verdissement|canop[ée]e|arbres?|plantation|mati[èe]res r[ée]siduelles|collecte des (?:d[ée]chets|mati[èe]res|ordures)|recyclage|compost|eau potable|eaux us[ée]es|aqueduc|[ée]gout|usine (?:de production|d'[ée]puration)|bassin|milieux? (?:humide|naturel)|biodiversit[ée]|climat|[ée]cologique|GES\b|transition [ée]cologique|d[ée]veloppement durable|d[ée]min[ée]ralisation|[îi]lots? de chaleur|pesticides|contamin/i],
  ['honneurs', /f[ée]licitations|hommage|condol[ée]ances|reconnaissance [àa]|anniversaire|comm[ée]mor|d[ée]claration (?:pour|visant|soulignant|reconnaissant|de solidarit[ée]|d'appui)|motion (?:de|pour|visant)|journ[ée]e (?:internationale|mondiale|nationale)|mois de l'histoire|semaine (?:de|nationale|qu[ée]b[ée]coise)|souligner|citoyenne? d'honneur/i],
  ['culture', /culturel|culture\b|biblioth[èe]que|mus[ée]e|patrimoine|arch[ée]ologi|œuvre d'art|oeuvre d'art|art public|monument|toponym|d[ée]signation (?:d'une|de la|du) (?:rue|place|parc|ruelle|voie)|nommer (?:la|le|une?) (?:rue|place|parc|ruelle)|festival|th[ée][âa]tre|artistes?|Conseil des arts|salle de spectacle|cin[ée]ma|langue fran[çc]aise/i],
  ['loisirs', /loisirs?|sportifs?|sports?\b|parcs?\b|piscine|ar[ée]na|patinoire|terrain de (?:jeu|soccer|baseball|tennis)|camp de jour|centre communautaire|vie communautaire|organismes? communautaires?|jardins? communautaires?|plein air|activit[ée]s physiques|installations? r[ée]cr[ée]atives?/i],
  ['securite', /incendie|SIM\b|SPVM|service de police|s[ée]curit[ée] (?:publique|civile|urbaine)|mesures d'urgence|premiers r[ée]pondants|pompiers|cour municipale|constats? d'infraction|cam[ée]ras? corporelles|911|centre d'urgence/i],
  ['economie', /d[ée]veloppement [ée]conomique|[ée]conomi(?:e|que)|entrepreneur|incubateur|commerce|commer[çc]ants?|soci[ée]t[ée]s? de d[ée]veloppement commercial|SDC\b|zone industrielle|tourisme|PME\b|innovation|centre-ville|artère commerciale|march[ée] public|industriel/i],
  ['travaux', /r[ée]fection|reconstruction|pavage|trottoir|chauss[ée]e|infrastructures?|conduites? d'eau|conduites? (?:principale|secondaire)|r[ée]seau routier|travaux (?:de|d')|viaduc|pont\b|tunnel|[ée]clairage|feux|r[ée]am[ée]nagement de (?:la|l'|du) (?:rue|avenue|boulevard|intersection)|ouvrage|surveillance des travaux|services professionnels .{0,30}(?:ing[ée]nierie|travaux)/i],
  ['rh', /nomination|nommer|embauche|convention collective|syndicat|r[ée]gime de retraite|d[ée]mission|structure (?:administrative|organisationnelle)|abolition (?:de|du) (?:poste|division)|cr[ée]ation (?:de|du|d'un) poste|conditions? de travail|effectifs|ressources humaines|dotation|griefs?|r[ée]mun[ée]ration|traitement (?:des|du) (?:cadres|employ)|congr[èe]s|mission [àa] l'[ée]tranger|d[ée]placement/i],
  ['subventions', /subventions?|soutien financier|contribution financi[èe]re|aide financi[èe]re|appel de projets|programme de (?:soutien|financement|subvention)|convention de contribution|verser (?:une|un) (?:somme|montant|contribution)|accorder (?:une|un) (?:soutien|contribution|aide)|financement (?:de|d'un|des) (?:projet|organisme)/i],
  ['administration', /code d'[ée]thique|politique (?:de|d'|sur)|plan d'action|plan strat[ée]gique|d[ée]l[ée]gation de pouvoirs|comit[ée] consultatif|commission (?:permanente|sur)|conseil d'administration|d[ée]signer (?:un|une|des) (?:repr[ée]sentant|membre|substitut)|renouveler le mandat|mandat de|rapport (?:annuel|de la|du v[ée]rificateur|de l'ombudsman)|v[ée]rificateur g[ée]n[ée]ral|ombudsman|acc[èe]s [àa] l'information|gouvernance|organigramme|Bureau de|Direction g[ée]n[ée]rale/i],
  // À partir d'ici, les véhicules : ce qui reste quand aucun sujet n'a été reconnu.
  ['contrats', /accorder (?:un|une|le|les|des) contrats?|contrat (?:de|d'|pour|à)|appel d'offres|soumission|adjudication|gr[ée] [àa] gr[ée]|entente(?:-cadre)?|convention|protocole|avenant|renouvel(?:er|lement) (?:du|de la|de l'|le|la) (?:contrat|entente|convention)|fournisseur|services professionnels|approuver (?:le|un) projet (?:d'entente|de convention|de protocole)|autoriser (?:une|la) d[ée]pense/i],
  ['finances', /budget|programme (?:d[ée]cennal|triennal) d'immobilisations|PDI\b|PTI\b|emprunt|r[èe]glement autorisant un emprunt|taxes?\b|taxation|tarif|[ée]tats financiers|virement|cr[ée]dits|affectation (?:de|du) (?:surplus|fonds)|surplus|r[ée]serve financi[èe]re|quote-part|dotation budg[ée]taire|d[ée]pense|paiement|radiation|comptes? rendus? financier/i],
  // En dernier recours : un avis de motion portant sur l'urbanisme doit sortir en
  // Urbanisme, pas en Procédure. C'est pour ça que cette règle passe après les sujets.
  ['procedure', /avis de motion|adoption du r[èe]glement|adopter (?:le|un|sans changement) r[èe]glement|r[èe]glement modifiant|r[èe]glement intitul[ée]|prendre acte|d[ée]p[ôo]t|correction|abroger|modifier la r[ée]solution|approuver le proc[èe]s-verbal|recommander au conseil d'agglom[ée]ration/i],
  // Dernier recours, après tout le reste.
  ['honneurs', /remerciements?|don de |donation|prix (?:de|d')|bourses?/i],
  ['urbanisme', /am[ée]nagement|requalification|projet immobilier|secteur|quartier|rue |avenue |boulevard |ruelle/i],
  ['economie', /march[ée]|[ée]v[ée]nement|activit[ée] (?:promotionnelle|commerciale)/i],
  ['administration', /participation|repr[ée]senter la ville|autoriser (?:la|le) (?:greffier|greffi[èe]re|maire|mairesse)|signer|signature|proc[ée]dure|demande au gouvernement|d[ée]cret|projet de loi|f[ée]d[ée]ral|provincial|CMM\b|Communaut[ée] m[ée]tropolitaine/i],
  ['contrats', /mandat|services?\b|fourniture|acquisition|location|achat/i],
];

// L'unité administrative (le service), quand l'ordre du jour la donne. Second recours.
const PAR_UNITE = [
  [/urbanisme|am[ée]nagement|habitation/i, 'urbanisme'],
  [/infrastructures? du r[ée]seau routier|travaux publics|infrastructures?/i, 'travaux'],
  [/mobilit[ée]|transport/i, 'transport'],
  [/eau\b|environnement/i, 'environnement'],
  [/culture|patrimoine|biblioth/i, 'culture'],
  [/sports|loisirs|grands parcs|parcs/i, 'loisirs'],
  [/police|incendie|s[ée]curit[ée]/i, 'securite'],
  [/d[ée]veloppement [ée]conomique/i, 'economie'],
  [/finances/i, 'finances'],
  [/ressources humaines/i, 'rh'],
  [/diversit[ée]|inclusion sociale|habitation sociale|logement/i, 'social'],
  [/approvisionnement/i, 'contrats'],
  [/gestion et planification (?:des|immobili)|immobilier/i, 'immobilier'],
  [/greffe|affaires juridiques|direction g[ée]n[ée]rale|technologies|communications|performance/i, 'administration'],
];

// Renvoie { theme, themeSource } — toujours un thème, la source dit ce qui a tranché.
export function classer({ objet, unite }) {
  const texte = objet ?? '';
  for (const [theme, regle] of REGLES) {
    if (regle.test(texte)) return { theme, themeSource: 'objet' };
  }
  if (unite) {
    for (const [regle, theme] of PAR_UNITE) {
      if (regle.test(unite)) return { theme, themeSource: 'unite' };
    }
  }
  return { theme: 'administration', themeSource: 'defaut' };
}
