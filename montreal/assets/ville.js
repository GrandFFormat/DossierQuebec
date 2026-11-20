// CONFIGURATION DU VOLET MONTRÉAL pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; le code est dans le moteur.
//
// Clés lues par le moteur :
//   nom          nom de la ville tel qu'écrit dans les données (m.ville des élus d'agglomération)
//   pages        slugs des pages du volet, sans extension
//   libelles     { libelleEn, themeEn } : traductions des libellés des données (./libelles-en.js)
//   regexMaire   reconnaît la fonction du maire ou de la mairesse de la ville
//   porteeDe(instance, tr)  crochet : la portée d'une instance (ligne « Portée » d'une fiche), ou null
//
// Adaptateurs de données (facultatifs ; défaut = Montréal) :
//   cleDossier       champ qui suit un dossier d'une instance à l'autre ('dossier' ; Québec 'sommaireId')
//   typesDocuments   types qui sont des documents de séance, pas des dossiers à suivre
//   sansInstance     { fr, en } : titre du groupe des documents sans instance
//   instanceConseil  regex de l'instance « conseil » pour la phrase « qui demande le vote » (#qui-demande)
//   comparerNoms     'famille' (défaut) ou 'normalise' (nom complet sans accents ni tirets) pour les votes contre
//   uniteBrute       true : l'unité administrative s'affiche telle quelle, sans traduction
//
// Drapeaux (facultatifs ; absents = comportement de Montréal) :
//   archives            data/archives/index.json existe : recherche dans les années passées, tableau des Sources
//   textes              data/textes.json existe : « Texte exact de la résolution » sur la fiche
//   resumeDirectDabord  le résumé du document passe avant celui du sommaire
//   enteteResumeCourte  en-tête du résumé « — sommaire NUMÉRO » seulement
//   abonnesEtendu       data-statut, data-etape, data-projets, data-montant pour l'espace abonnés
//   compteCharges       décompte « N affichées sur N chargées, la Ville en a publié N » (totalDisponible)
//   pdfVoteResolution   lien du vote : « Résolution officielle (PDF) »
//   appelsNominaux      « appel(s) nominal(aux) » au lieu de « vote(s) enregistré(s) »
//   palmaresVotesContre tableau des votes contre trié par nombre, avec « En tête » (sinon alphabétique)
//   elusSimple          fiches d'élus « District (n°) », groupées par arrondissement dans l'ordre des données
//   agglomeration       {} : data/agglomeration.json existe (conseil d'agglomération sur Conseil et Sources) ;
//                       { sieges } en plus : le compte dit les sièges et les remplaçants (Québec)
//   cucq                data/cucq.json : la commission d'urbanisme sur la page Conseil et les Sources
//   presences           { arrondissements: [[code, instance], …] } et data/presences.json : les conseils
//                       d'arrondissement reconstitués par les présences aux séances (Lévis)
//   horsDecisions       Set des types qui ne sont pas des décisions (défaut : tout sauf « Résolution »)
//   pdfSelonNumero      « Procès-verbal officiel » quand la fiche a un numéro (défaut : quand c'est une Résolution)
//   elusParDistrict     élus triés par numéro de district dans chaque arrondissement
//   comiteSelonFonctions  phrase du comité exécutif : « d'après les fonctions publiées… »
//   archivesSeances     URL citée par l'avis « Extraction en panne »
//
// Crochets (fonctions facultatives) :
//   titreArrondissement(nom)   titre d'un groupe d'élus (Lévis : « Arrondissement de Desjardins »)
//   rangComiteExecutif(m)      ordre des membres du comité exécutif
//
//   comparerNoms 'complet' : nom complet sans accents, espaces et tirets confondus (Lévis)
//
// Détectés dans les données, sans drapeau : « Ce que le conseil décide » (d.dispositif), pastilles
// « Demande refusée » (d.refus), numéro de résolution (d.annotation), sommaires cités et cherchables
// (d.sommaires), avis « Extraction en panne » (procès-verbaux publiés sans décision lue), légende et pastilles du comité exécutif (m.executif),
// comité exécutif par rôles (#liste-ce), pré-rendu (body[data-prerendu]), contrats SEAO, votes sur la fiche.
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
  textes: true,
  agglomeration: {},
  porteeDe(instance, tr) {
    if (instance === 'Conseil municipal') return tr('Toute la Ville de Montréal (conseil municipal)', 'The whole City of Montréal (city council)');
    if (instance === "Conseil d'agglomération") return tr("L'agglomération : Montréal et les 15 villes liées de l'île", 'The agglomeration: Montréal and the 15 linked cities on the island');
    if (instance === 'Comité exécutif') return tr('Ville de Montréal, décision du comité exécutif', 'City of Montréal, executive committee decision');
    const a = instance.match(/^Conseil d'arrondissement (de |du |d')(.+)$/);
    if (a) return tr(`L'arrondissement ${a[1]}${a[2]} seulement`, `The ${a[2]} borough only`);
    return null;
  },
};
