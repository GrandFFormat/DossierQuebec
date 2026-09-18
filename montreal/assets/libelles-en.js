// Libellés de la Ville et du site en anglais, pour la version anglaise du volet (commun/langue.js).
// Les noms propres restent en français (arrondissements, partis, rues, organismes, personnes) ;
// on traduit ce qui décrit : types de documents, instances, sujets, résultats, rôles.
//
// Le pendant de quebec/assets/libelles-en.js, avec le vocabulaire de Montréal : « Conseil
// municipal » plutôt que « Conseil de la ville », dix-neuf conseils d'arrondissement, et les
// rôles du comité exécutif et des commissions, qui se disent tous « Responsable de… » ou
// « Membre de la Commission sur… ». Un rôle qu'aucune règle ne couvre reste en français : mieux
// vaut un titre français exact qu'une traduction inventée.

const TYPES = {
  'Résolution': 'Resolution',
  'Procès-verbal': 'Minutes',
  'Ordre du jour': 'Agenda',
};

const THEMES = {
  procedure: 'Procedure', urbanisme: 'Urban planning', transport: 'Transportation', immobilier: 'Real estate',
  subventions: 'Grants', contrats: 'Contracts', finances: 'Finance', rh: 'Human resources', environnement: 'Environment',
  culture: 'Culture and heritage', loisirs: 'Recreation and community', securite: 'Public safety',
  economie: 'Economic development', travaux: 'Public works and infrastructure', administration: 'Administration',
  honneurs: 'Motions and tributes', social: 'Housing and social',
};

const RESULTATS = {
  "Adoptée à l'unanimité": 'Carried unanimously',
  'Adoptée à la majorité': 'Carried by majority',
  'Adoptée': 'Carried',
  'Rejetée': 'Defeated',
  'Reportée ou retirée': 'Deferred or withdrawn',
};

// Instances, fonctions et rôles. Le nom du lieu (l'arrondissement, la commission) garde son
// français : « Borough council — Le Plateau-Mont-Royal », « Member, Commission sur les finances ».
const REMPLACEMENTS = [
  [/^\s*Comité exécutif$/, 'Executive Committee'],
  [/^\s*Conseil municipal$/, 'City Council'],
  [/^\s*Conseil d'agglomération$/, 'Urban Agglomeration Council'],
  [/^\s*Conseils? d'arrondissement$/, 'Borough council'],
  // « du Plateau-Mont-Royal » et « du Sud-Ouest » : l'article fait partie du nom, on le rend.
  [/^\s*Conseil d'arrondissement du (.+)$/, (_, lieu) => `Borough council — Le ${lieu}`],
  [/^\s*Conseil d'arrondissement (?:de |des |d')(.+)$/, (_, lieu) => `Borough council — ${lieu}`],
  [/^\s*Arrondissement (?:de |du |des |d')?(.+)$/, (_, lieu) => `Borough of ${lieu}`],
  // Fonctions, telles que le jeu de données des élus les écrit.
  [/^Mairesse ou maire de Montréal$/, 'Mayor of Montréal'],
  [/^Conseill(?:er|ère) de ville$/, 'City councillor'],
  [/^Conseill(?:er|ère) d'arrondissement$/, 'Borough councillor'],
  [/^Mair(?:e|esse) d'arrondissement$/, 'Borough mayor'],
  // Rôles.
  [/^Mair(?:e|esse) de l['’]arrondissement (?:de |du |des |d')(.+)$/, (_, lieu) => `Mayor of the borough of ${lieu}`],
  [/^Mair(?:e|esse) suppléante?$/, 'Deputy Mayor'],
  [/^Membre du comité exécutif$/, 'Member of the executive committee'],
  [/^Membre du conseil d'agglomération$/, 'Member of the urban agglomeration council'],
  [/^(?:Président|Présidente) du conseil$/, 'Chair of the council'],
  [/^(?:Vice-président|Vice-présidente) du conseil$/, 'Vice-chair of the council'],
  [/^(?:Président|Présidente) de la (Commission .+)$/, (_, c) => `Chair, ${c}`],
  [/^(?:Vice-président|Vice-présidente) de la (Commission .+)$/, (_, c) => `Vice-chair, ${c}`],
  [/^Membre (?:de la|sur la) (Commission .+)$/, (_, c) => `Member, ${c}`],
  [/^Conseill(?:er|ère) désignée? pour siéger au conseil d'arrondissement (?:de |du |des |d')(.+)$/, (_, lieu) => `Councillor designated to sit on the borough council of ${lieu}`],
  [/^Conseill(?:er|ère) associée? à (.+)$/, (_, quoi) => `Associate councillor for ${quoi}`],
  [/^Conseill(?:er|ère) associée?$/, 'Associate councillor'],
  [/^Leader de (.+)$/, (_, parti) => `Leader of ${parti}`],
  [/^Chef(?:fe)? de l['’]opposition officielle$/, 'Leader of the Official Opposition'],
  // « Responsable de la propreté et des services aux citoyens » : un portefeuille du comité
  // exécutif, écrit en français par la Ville. On ne le traduit pas à moitié — il reste tel quel.
  // Rôles d'une séance, tels que le procès-verbal les écrit.
  [/^mair(?:e|esse)$/, 'mayor'],
  [/^conseill(?:er|ère)$/, 'councillor'],
  [/^présidence$/, 'chair'],
  [/^vice-présidence$/, 'vice-chair'],
];

export function libelleEn(texte) {
  if (texte == null) return texte;
  const t = String(texte);
  if (TYPES[t]) return TYPES[t];
  if (RESULTATS[t]) return RESULTATS[t];
  for (const [motif, remplacement] of REMPLACEMENTS) if (motif.test(t)) return t.replace(motif, remplacement);
  return t;
}
export const themeEn = (cle, libelle) => THEMES[cle] ?? libelle;
