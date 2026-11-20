// CONFIGURATION DU VOLET LAVAL pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; la liste complète des clés est
// en tête de montreal/assets/ville.js. Laval n'est pas dans VOLETS_EN : français seulement.
// Volet en pause (robot arrêté) : l'avis de pause est dans les pages HTML.
import { libelleEn, themeEn } from './libelles-en.js';

const PORTEE = {
  'Conseil municipal': ['Toute la Ville de Laval (conseil municipal)', 'The whole City of Laval (city council)'],
  'Comité exécutif': ['Ville de Laval, décision du comité exécutif', 'City of Laval, executive committee decision'],
};

globalThis.VILLE = {
  nom: 'Laval',
  // Pas de page Contrats : pas de contrats SEAO sur les fiches.
  pages: { decisions: 'decisions-de-la-ville-de-laval', conseil: 'conseil-municipal-de-laval', contrats: null },
  libelles: { libelleEn, themeEn },
  regexMaire: /^maire/i,
  domaineVille: 'laval.ca',
  porteeDe(instance, tr) {
    const p = PORTEE[instance];
    if (p) return tr(p[0], p[1]);
    const a = instance.match(/^Conseil d'arrondissement (de |du |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },

  // Jeux de données déclarés
  resumes: false, // résumés éteints : pas de data/resumes.json
  sommaires: true, // data/sommaires.json : service responsable et montant lus dans le PDF du sommaire
  presencesOuvertes: true, // data/presences.json : le jeu ouvert des présences de la Ville, par année

  // Adaptateurs de données
  // Le numéro de sommaire (SD-2026-1234) relie la résolution, l'ordre du jour, le sommaire et le résumé.
  resumeParSommaire: true,
  // Une séance a un identifiant : le comité exécutif siège parfois deux fois le même jour (huis clos).
  seancesParId: true,
  // La carte est colorée par parti, en teintes neutres ; la clé est le nom du parti sans accents ni casse.
  carteParParti: {
    palette: {
      'mouvement lavallois': '#6B7A8A', // gris-bleu
      'action laval': '#8B7355', // brun clair
      'parti laval': '#6F7A52', // olive
      independante: '#8A6B8F', // mauve
    },
    reserve: ['#4E7F7A', '#96741A', '#7D6A55', '#5F7F6B'],
  },

  // Drapeaux
  ficheFaits: true,
  votesDetailles: true,
  votesDecompteImprime: true,
  tableauPourContre: true,
  elusDistrictsNumerotes: true,
  lexiqueExemples: true,
  accueilProcesVerbaux: true,
  etatDetaille: true,
};
