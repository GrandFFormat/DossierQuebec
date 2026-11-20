// CONFIGURATION DU VOLET LONGUEUIL pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; la liste complète des clés est
// en tête de montreal/assets/ville.js. Longueuil n'est pas dans VOLETS_EN : français seulement.
import { libelleEn, themeEn } from './libelles-en.js';

const PORTEE = {
  'Conseil de ville': ['Toute la Ville de Longueuil (conseil de ville)', 'The whole City of Longueuil (city council)'],
  "Conseil d'agglomération": ["L'agglomération : Longueuil et les 4 villes liées (Boucherville, Brossard, Saint-Bruno-de-Montarville, Saint-Lambert)", 'The agglomeration: Longueuil and its 4 linked cities'],
  'Comité exécutif': ['Ville de Longueuil, décision du comité exécutif', 'City of Longueuil, executive committee decision'],
};

globalThis.VILLE = {
  nom: 'Longueuil',
  // Pas de page Contrats ni Budget : pas de contrats SEAO sur les fiches.
  pages: { decisions: 'decisions-de-la-ville-de-longueuil', conseil: 'conseil-de-ville-de-longueuil', contrats: null },
  libelles: { libelleEn, themeEn },
  libelleMembres: ['membres du conseil de ville', 'members of City Council'],
  regexMaire: /^mairesse$/i,
  porteeDe(instance, tr) {
    const p = PORTEE[instance];
    if (p) return tr(p[0], p[1]);
    const a = instance.match(/^Conseil d'arrondissement (de |du |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },

  // Adaptateurs de données
  typesDocuments: ['Procès-verbal', 'Ordre du jour', 'Document de séance'],
  comparerNoms: 'sansAccents',
  ordreArrondissements: ['Vieux-Longueuil', 'Saint-Hubert', 'Greenfield Park'],
  totalAvec: "les conseillers d'arrondissement de Greenfield Park",
  titreArrondissement: (a) => `Arrondissement ${/^Vieux/.test(a) ? 'du' : 'de'} ${a}`,
  // Trois arrondissements, trois teintes. Pas de coloriage par parti : un seul parti occupe tous les
  // sièges depuis novembre 2025.
  paletteArrondissements: { 'Vieux-Longueuil': '#0E4FC1', 'Saint-Hubert': '#1E6A3C', 'Greenfield Park': '#D97706' },

  // Drapeaux
  agglomeration: { reconstituee: true },
  votesDetailles: true,
  dossierEstSommaire: true,
  abonnesMontant: true,
  palmaresVotesContre: true,
  ficheEluSobre: true,
  // Robot en pause depuis le 11 nov. 2026 : le bandeau « Mise à jour interrompue » offre la réactivation.
  accesVille: { reactiver: 'https://promo.dafrsolution.com/payment-link/6af4eaec906a8b62055d5b71' },
};
