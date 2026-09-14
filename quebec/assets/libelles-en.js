// Libellés de la Ville et du site en anglais, pour la version anglaise du volet (commun/langue.js).
// Les noms propres restent en français (arrondissements, partis, rues, organismes, personnes) ;
// on traduit ce qui décrit : types de documents, instances, sujets, résultats, rôles.

const TYPES = {
  'Résolutions': 'Resolutions',
  'Sommaires et mémoires': 'Decision summaries',
  'Procès-verbaux': 'Minutes',
  'Tableaux des décisions': 'Decision tables',
  'Documents préparatoires': 'Preparatory documents',
};

const THEMES = {
  procedure: 'Procedure', urbanisme: 'Urban planning', transport: 'Transportation', immobilier: 'Real estate',
  subventions: 'Grants', contrats: 'Contracts', finances: 'Finance', rh: 'Human resources', environnement: 'Environment',
  culture: 'Culture and heritage', loisirs: 'Recreation and community', securite: 'Public safety',
  economie: 'Economic development', travaux: 'Public works and infrastructure', administration: 'Administration',
  honneurs: 'Motions and tributes', social: 'Housing and social',
};

const RESULTATS = {
  'Adoptée à la majorité': 'Carried by majority',
  "Adoptée à l'unanimité": 'Carried unanimously',
  'Rejetée': 'Defeated',
};

// Instances et rôles : quelques formules, le reste (noms de lieux) garde son français.
const REMPLACEMENTS = [
  [/^\s*Comité exécutif$/, 'Executive Committee'],
  [/^\s*Conseil de la ville$/, 'City Council'],
  [/^\s*Conseil d'agglomération de Québec$/, 'Québec Urban Agglomeration Council'],
  [/^\s*Conseil d'agglomération$/, 'Urban Agglomeration Council'],
  [/^\s*Conseils d'arrondissement$/, 'Borough councils'],
  [/^\s*Commission d'urbanisme et de conservation de Québec$/, 'Québec Urban Planning and Heritage Commission'],
  [/^\s*Conseil de l'Arrondissement (?:de |des |du |d')?(.+)$/, (_, lieu) => `Borough Council — ${lieu}`],
  [/^\s*Arrondissement (?:de |des |du |d')?(.+)$/, (_, lieu) => `Borough of ${lieu}`],
  [/^Maire$/, 'Mayor'],
  [/^Mairesse suppléante$/, 'Deputy Mayor'],
  [/^Maire suppléant$/, 'Deputy Mayor'],
  [/^Présidente? du conseil municipal$/, 'Chair of City Council'],
  [/^Première vice-présidente du conseil municipal$/, 'First Vice-Chair of City Council'],
  [/^Premier vice-président du conseil municipal$/, 'First Vice-Chair of City Council'],
  [/^Deuxième vice-présidente? du conseil municipal$/, 'Second Vice-Chair of City Council'],
  [/^Présidente? de l['’]Arrondissement (?:de |des |du |d')?(.+)$/, (_, lieu) => `Chair, Borough of ${lieu}`],
  [/^Chef de l['’]opposition officielle$/, 'Leader of the Official Opposition'],
  [/^maire$/, 'mayor'],
  [/^conseill(?:er|ère)$/, 'councillor'],
  [/^président d'assemblée$/, 'meeting chair'],
  [/^vice-président d'assemblée(.*)$/, (_, reste) => `meeting vice-chair${reste.replace('partie de séance', 'part of the meeting').replace('par visioconférence', 'by videoconference')}`],
  [/^présidence$/, 'chair'],
  [/^vice-présidence$/, 'vice-chair'],
  [/^Mairie$/, "Mayor's office"],
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
