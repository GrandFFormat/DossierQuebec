// CONFIGURATION DU VOLET LÉVIS pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; la liste complète des clés est
// en tête de montreal/assets/ville.js. Lévis n'est pas dans VOLETS_EN (commun/langue.js) : le
// volet est en français seulement.
import { libelleEn, themeEn } from './libelles-en.js';

globalThis.VILLE = {
  nom: 'Lévis',
  pages: {
    decisions: 'decisions-de-la-ville-de-levis',
    conseil: 'conseil-municipal-de-levis',
    contrats: 'contrats-de-la-ville-de-levis',
  },
  libelles: { libelleEn, themeEn },
  regexMaire: /^maire/i,
  porteeDe(instance, tr) {
    if (instance === 'Conseil de la Ville') return tr('Toute la Ville de Lévis (conseil de la ville)', 'The whole City of Lévis (city council)');
    if (instance === 'Comité exécutif') return tr('Ville de Lévis, décision du comité exécutif', 'City of Lévis, executive committee decision');
    const a = instance.match(/^Conseil d'arrondissement (de |du |des |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },
  // Les archives des séances, citées quand une extraction n'a lu aucun procès-verbal.
  archivesSeances: 'https://levis.ca/fr/ville/conseil-municipal/seances-du-conseil-municipal/archives-des-seances-du-conseil-municipal',

  // Adaptateurs de données
  // Le procès-verbal d'une séance (un document) et les points de procédure (ouverture de séance,
  // période de questions…) ne sont pas des décisions : ni comptés ni dans le fil.
  horsDecisions: new Set(['Procès-verbal', 'Procédure']),
  comparerNoms: 'complet',
  titreArrondissement: (a) => `Arrondissement ${/^[AEIOUÉ]/.test(a) ? "d'" : a.startsWith('Chutes') ? 'des ' : 'de '}${a}`,
  // Le maire préside le comité exécutif, puis la vice-présidence, puis les membres.
  rangComiteExecutif: (m) => (/^maire/i.test(m.fonction ?? '') ? 0 : /vice-pr[ée]siden[^,]*comit[ée] ex[ée]cutif/i.test(m.roles.join(' ')) ? 1 : 2),
  // La composition des conseils d'arrondissement se lit dans les présences aux séances (data/presences.json).
  presences: {
    arrondissements: [
      ['CAD', "Conseil d'arrondissement de Desjardins"],
      ['CACCE', "Conseil d'arrondissement des Chutes-de-la-Chaudière-Est"],
      ['CACCO', "Conseil d'arrondissement des Chutes-de-la-Chaudière-Ouest"],
    ],
  },

  // Drapeaux
  abonnesEtendu: true,
  pdfSelonNumero: true,
  elusParDistrict: true,
  comiteSelonFonctions: true,
};
