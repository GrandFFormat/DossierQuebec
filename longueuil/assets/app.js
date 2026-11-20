// Point d'entrée du volet Longueuil : la configuration de la ville, puis le moteur commun.
// Le code est dans commun/ville/moteur.js ; ce qui est propre à Longueuil, dans ville.js.
// La feuille de style reste assets/style.css (voir le rapport du 20 nov. 2026 : l'aligner sur la
// feuille commune changerait l'apparence de la page Sources et du bouton de retour en haut).
import './ville.js';
export * from '/commun/ville/moteur.js';
