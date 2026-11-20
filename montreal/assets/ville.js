// CONFIGURATION DU VOLET MONTRÉAL pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; le code est dans le moteur.
//
// Clés lues par le moteur :
//   nom          nom de la ville tel qu'écrit dans les données (m.ville des élus d'agglomération)
//   pages        slugs des pages du volet, sans extension
//   libelles     { libelleEn, themeEn } : traductions des libellés des données (./libelles-en.js)
//   regexMaire   reconnaît la fonction du maire ou de la mairesse de la ville
//   porteeDe(instance, tr)  crochet : la portée d'une instance (ligne « Portée » d'une fiche), ou null
import { libelleEn, themeEn } from './libelles-en.js';

globalThis.VILLE = {
  nom: 'Montréal',
  pages: {
    decisions: 'decisions-de-la-ville-de-montreal',
    conseil: 'conseil-municipal-de-montreal',
    contrats: 'contrats-de-la-ville-de-montreal',
  },
  libelles: { libelleEn, themeEn },
  regexMaire: /mairesse ou maire de montr/i,
  porteeDe(instance, tr) {
    if (instance === 'Conseil municipal') return tr('Toute la Ville de Montréal (conseil municipal)', 'The whole City of Montréal (city council)');
    if (instance === "Conseil d'agglomération") return tr("L'agglomération : Montréal et les 15 villes liées de l'île", 'The agglomeration: Montréal and the 15 linked cities on the island');
    if (instance === 'Comité exécutif') return tr('Ville de Montréal, décision du comité exécutif', 'City of Montréal, executive committee decision');
    const a = instance.match(/^Conseil d'arrondissement (de |du |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },
};
