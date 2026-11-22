// CONFIGURATION DU VOLET QUÉBEC pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; la liste complète des clés est
// en tête de montreal/assets/ville.js.
import { libelleEn, themeEn } from './libelles-en.js';

globalThis.VILLE = {
  courriels: true,   // bande d'inscription au bas des pages (22 nov. 2026)
  nom: 'Québec',
  pages: {
    decisions: 'decisions-de-la-ville-de-quebec',
    conseil: 'conseil-municipal-de-quebec',
    contrats: 'contrats-de-la-ville-de-quebec',
  },
  libelles: { libelleEn, themeEn },
  regexMaire: /^maire/i,
  porteeDe(instance, tr) {
    if (instance === 'Conseil de la ville') return tr('Toute la Ville de Québec (conseil de la ville)', 'The whole City of Québec (city council)');
    if (instance === "Conseil d'agglomération de Québec") return tr("L'agglomération : Québec, L'Ancienne-Lorette et Saint-Augustin-de-Desmaures", "The agglomeration: Québec, L'Ancienne-Lorette and Saint-Augustin-de-Desmaures");
    if (instance === 'Comité exécutif') return tr('Ville de Québec, décision du comité exécutif', 'City of Québec, executive committee decision');
    const a = instance.match(/^Conseil de l'Arrondissement (de |du |des |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },

  // Adaptateurs de données
  cleDossier: 'sommaireId',
  typesDocuments: ['Procès-verbaux', 'Tableaux des décisions'],
  sansInstance: { fr: 'Documents préparatoires', en: 'Preparatory documents' },
  instanceConseil: /conseil de la ville/i,
  comparerNoms: 'normalise',
  uniteBrute: true,

  // Drapeaux
  resumeDirectDabord: true,
  enteteResumeCourte: true,
  abonnesEtendu: true,
  compteCharges: true,
  pdfVoteResolution: true,
  appelsNominaux: true,
  elusSimple: true,
  agglomeration: { sieges: 9 },
  cucq: true,
  archives: true,
};
