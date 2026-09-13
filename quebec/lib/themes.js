// Classement thématique des décisions — « ça parle de quoi ».
//
// Deux bases, dans cet ordre :
//
//   1. L'OBJET du document. Les libellés de la Ville sont très formulaires
//      (« Adjudication d'un contrat… », « Demande de dérogation mineure… »), ce qui rend
//      des règles par mots-clés fiables et vérifiables. C'est ce qui décrit le mieux le
//      sujet, et ça marche pour les 2 000 documents.
//   2. À défaut, l'UNITÉ ADMINISTRATIVE responsable, quand la Ville la publie
//      (environ un tiers des documents, surtout les sommaires décisionnels).
//
//   3. Faute de mieux, « Administration » : le tout-venant de la vie municipale qu'aucune
//      règle ne reconnaît (nominations, missions, participations, bilans…). Une décision
//      sans pastille déroute plus qu'une pastille générique — mais celle-ci s'assume comme
//      telle : `themeSource: 'defaut'`.
//
// Chaque décision garde `themeSource` ('objet', 'unite' ou 'defaut') pour qu'on puisse
// toujours savoir d'où vient le classement, et le vérifier.

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

// L'ordre compte : la première règle qui accroche gagne. Les formulations les plus
// distinctives d'abord, les plus génériques ensuite.
const REGLES = [
  ['procedure', /proc[èe]s-verbal|ordre du jour|d[ée]p[ôo]t des listes|liste hebdomadaire|prise d'acte du d[ée]p[ôo]t|approbation d(?:u|es) proc|tableau des d[ée]cisions|p[ée]riode de questions|calendrier .{0,25}s[ée]ances|r[èe]glement int[ée]rieur|avis de proposition|approbation de la liste|abrogation de la r[ée]solution|approbation de la r[ée]solution/i],
  ['urbanisme', /d[ée]rogations? mineures?|urbanisme|zonage|lotissement|d[ée]molition|P\.?I\.?I\.?A|usages? conditionnels?|plan de construction|permis de construire|architecture et d'insertion|projet majeur|plan d'implantation|projet institutionnel|projet immobilier|requalification|subdivision|cadastral|territoire agricole|CPTAQ/i],
  ['transport', /stationnement|circulation|tramway|autobus|transport en commun|d[ée]neigement|signalisation|voie r[ée]serv[ée]e|piste cyclable|mobilit[ée]|feux de circulation|d[ée]p[ôo]ts? [àa] neige|disposition de la neige|r[ée]seau de transport/i],
  ['immobilier', /expropriation|servitude|acquisition d'un immeuble|acquisition du lot|acquisitions?,? [àa] des fins|affectation au domaine|occupation .{0,20}domaine public|r[èe]glement hors (?:cour|tribunal)|vente du lot|bail|cession .* lot|[ée]change de terrain/i],
  // Le logement social et l'itinérance sont une compétence d'agglomération à part entière :
  // les ranger sous « Loisirs et communauté » aurait été une approximation paresseuse.
  ['social', /logement social|itin[ée]rance|h[ée]bergement d'urgence|banque alimentaire|logement abordable/i],
  // ⚠ TOUS LES SUJETS AVANT LES VÉHICULES. Une entente sur l'eau potable parle d'eau ;
  // une adjudication pour le service d'incendie parle de sécurité publique. « Contrats »
  // dit COMMENT la Ville agit, les autres disent SUR QUOI — et c'est le sur quoi qui
  // intéresse le lecteur. Élargir « contrats » sans appliquer cette règle lui a fait
  // avaler la moitié de Sécurité publique, de Culture et de Loisirs d'un coup.
  ['environnement', /verdissement|d[ée]min[ée]ralisation|arbres|ormes|canop[ée]e|mati[èe]res r[ée]siduelles|eaux us[ée]es|eau potable|fourniture d'eau|aqueduc|[ée]missions|d[ée]veloppement durable|milieux humides|foresterie/i],
  // Le conseil adopte régulièrement des motions cérémonielles — félicitations à un
  // organisme, hommage à une personne, condoléances. Ce n'est pas de la procédure et ça
  // n'engage pas d'argent : c'est une catégorie à part entière, et elle est nombreuse.
  ['honneurs', /f[ée]licitations|hommage|condol[ée]ances|reconnaissance [àa]|anniversaire|t[ée]moignage/i],
  ['culture', /patrimoine|arch[ée]ologi|biblioth[èe]que|mus[ée]e|monument|œuvre d'art|oeuvre d'art|culturel|toponyme/i],
  ['loisirs', /loisir|sportif|sports|parc |piscine|ar[ée]na|terrain de jeu|vie communautaire|camp de jour|collectes? de fonds|conseils? de quartier|centre multifonctionnel|curling/i],
  ['securite', /incendie|service de police|s[ée]curit[ée] publique|premiers r[ée]pondants|mesures d'urgence/i],
  ['economie', /d[ée]veloppement [ée]conomique|entrepreneuriat|incubateur|commerce|zone industrielle|tourisme/i],
  ['travaux', /r[ée]fection|pavage|trottoir|infrastructure|conduite d'eau|[ée]gout|usine de traitement|r[ée]seau routier|ouvrage|prolongement des rues/i],
  ['rh', /nomination|embauche|convention collective|syndicat|mouvement de personnel|r[ée]gime de retraite|d[ée]mission|promotion d'un employ|nomenclature des emplois|classification et traitement des emplois|formation intitul[ée]e|congr[èe]s|colloque|contrat d'engagement|remplacement du directeur|d[ée]part [àa] la retraite/i],
  ['subventions', /subvention|aide financi[èe]re|contribution financi[èe]re|appel de projets|soutien financier|convention de financement|fonds de la r[ée]gion/i],
  ['administration', /adoption de la politique|r[ée]vision de la politique|adoption de la vision|adh[ée]sion de la ville|candidature de la ville|modification [àa] la structure|participation d(?:e|es) (?:madame|monsieur|mesdames|messieurs|membres)|affaires juridiques|bureau des d[ée]l[ée]gu[ée]s|exercer ses pouvoirs|mission [àa] |plan strat[ée]gique|d[ée]l[ée]gation de pouvoirs|armoiries/i],
  // À partir d'ici, les véhicules : ce qui reste quand aucun sujet n'a été reconnu.
  ['contrats', /adjudication|appel d'offres|contrat de services|contrat pour l[ae']|contrat entre la ville|entente entre la ville|entente intermunicipale|entente concernant|protocole d'entente|renouvellement du contrat|avenant|entente de services|entente de confidentialit[ée]|entente de d[ée]l[ée]gation|entente de collaboration|avis de modification|autorisation de contracter|fournisseurs qualifi[ée]s|location de/i],
  ['finances', /appropriation d'un montant|fonds g[ée]n[ée]ral|r[èe]glement d'emprunt|emprunt|budget|taxation|taxe|[ée]tats financiers|virement de cr[ée]dits|autorisation de paiement|quote-part|d[ée]pense mixte|cotisation|paiements? comptant|immobilisations/i],
  // En dernier recours seulement : un avis de motion « sur l'urbanisme » doit sortir en
  // Urbanisme, pas en Procédure. C'est pour ça que cette règle passe après les sujets.
  ['procedure', /avis de motion|modification de la r[ée]solution|d[ée]p[ôo]t du rapport|prise d'acte|adoption du r[èe]glement|r[èe]glement modifiant|d[ée]p[ôo]t de la liste/i],
  // Dernier recours, après tout le reste : des familles que l'année complète a fait
  // apparaître et que rien n'attrapait. En fin de liste pour ne rien voler aux règles
  // ci-dessus — elles ne voient que ce qui serait sinon sans sujet.
  ['honneurs', /remerciements?|donation|don de |d[ée]signation (?:du|de la|de l'|des) (?:hall|pavillon|salle|place|parc)/i],
  ['culture', /œuvres? d'art|oeuvres? d'art|archives|prix (?:de|d')|bourses? pour|inventaire des b[âa]timents/i],
  ['rh', /r[ée]mun[ée]ration|structure administrative|abolition d(?:e la|u) (?:division|poste|service)|cr[ée]ation d(?:e la|u|'un) (?:division|poste)|loi sur la police/i],
  ['social', /accessibilit[ée] universelle|ville inclusive|vivre-ensemble|coh[ée]sion sociale|personnes (?:les plus )?vuln[ée]rables/i],
  ['environnement', /agrile|fr[êe]ne|coupe .{0,20}bois|for[êe]t|milieu naturel|agricole/i],
  ['urbanisme', /sch[ée]ma d'am[ée]nagement|am[ée]nagement|patrimoni|ouverture d(?:e la|'une) (?:nouvelle )?rue|prolongement de la rue|fermeture d'une partie|emprise|avis de conformit[ée]|entretien des b[âa]timents|lot \d|ordonnance/i],
  ['travaux', /taux et tarifs|mat[ée]riaux en vrac|camionneurs|ligne a[ée]rienne|services d'utilit[ée] publique/i],
  ['administration', /d[ée]signation d(?:e|es|'un|'une) (?:repr[ée]sentant|membre|substitut)|renouvellement d(?:u|es) mandats?|remplacement d(?:u|e la) pr[ée]sident|code d'[ée]thique|contribution annuelle|participation (?:de|[àa]) |commission consultative|comit[ée] consultatif|conseil d'administration|cadre d'intervention|plan d'action|d[ée]marche de participation publique|bilan/i],
  ['subventions', /soutien (?:au|[àa]|aux) |contribution (?:au|[àa]|aux) /i],
  ['contrats', /convention|entente|protocole|contrat|mandat de services/i],
];

// La Ville publie l'unité responsable sur une partie des documents. C'est sa propre
// attribution : on s'en sert en second recours, jamais pour écraser ce que dit l'objet.
const PAR_UNITE = {
  'Gestion du territoire': 'urbanisme',
  "Planification de l'aménagement et de l'environnement": 'urbanisme',
  'Transport et mobilité intelligente': 'transport',
  Approvisionnements: 'contrats',
  'Développement économique et grands projets': 'economie',
  'Loisirs, sports et vie communautaire': 'loisirs',
  Finances: 'finances',
  'Ressources humaines': 'rh',
  'Culture et patrimoine': 'culture',
  'Affaires juridiques': 'administration',
  'Direction générale': 'administration',
  'Technologies de information': 'administration',
  "Technologies de l'information": 'administration',
  'Relations citoyennes et communications': 'administration',
  'Greffe et archives': 'administration',
  'Prévention et qualité du milieu': 'environnement',
  'Traitement des eaux': 'environnement',
  'Protection contre l’incendie': 'securite',
  'Protection contre l incendie': 'securite',
  'Protection contre l&#39;incendie': 'securite',
  'Protection contre lincendie': 'securite',
  'Protection contre l’incendie': 'securite',
  "Protection contre l'incendie": 'securite',
  Ingénierie: 'travaux',
  'Travaux publics': 'travaux',
  'Gestion des équipements motorisés': 'travaux',
  Police: 'securite',
  'Coordination stratégique et relations internationales': 'administration',
  ExpoCité: 'economie',
  'Destination Québec cité': 'economie',
  'S.O.M.H.A.C.': 'social', // Société municipale d'habitation et de développement Champlain
};

// Renvoie { theme, themeSource } — toujours un thème, la source dit ce qui a tranché.
export function classer({ objet, unite }) {
  const texte = objet ?? '';
  for (const [theme, regle] of REGLES) {
    if (regle.test(texte)) return { theme, themeSource: 'objet' };
  }
  if (unite && PAR_UNITE[unite]) return { theme: PAR_UNITE[unite], themeSource: 'unite' };
  return { theme: 'administration', themeSource: 'defaut' };
}
