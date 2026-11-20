// CONFIGURATION DU VOLET MONTRÉAL pour le moteur commun (commun/ville/moteur.js, 20 nov. 2026).
// Ce fichier ne contient QUE ce qui change d'une ville à l'autre ; le code est dans le moteur.
//
// Clés lues par le moteur :
//   nom          nom de la ville tel qu'écrit dans les données (m.ville des élus d'agglomération)
//   pages        slugs des pages du volet, sans extension
//   libelles     { libelleEn, themeEn } : traductions des libellés des données (./libelles-en.js)
//   regexMaire   reconnaît la fonction du maire ou de la mairesse de la ville
//   porteeDe(instance, tr, etat, EN)  crochet : la portée d'une instance (ligne « Portée » d'une fiche), ou null
//   chemins      { langue, imprimer } : modules de langue et d'impression (défaut : /commun/langue.js,
//                /commun/imprimer-seance.js ; les volets des autres dépôts pointent vers leurs copies)
//   langueDefaut 'en' : la page est en anglais par défaut, les liens n'ajoutent pas ?lang=en
//   vocabulaire  { cle: [fr, en] } : les mots propres à une ville (volets anglophones, fin du moteur)
//   anglophone   volets écrits en anglais (Vancouver, Ottawa, Fredericton) : voir « VOLETS ANGLOPHONES »
//                à la fin de commun/ville/moteur.js pour leurs clés
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
//   agglomeration       { reconstituee: true } : liste tirée des procès-verbaux (Longueuil) : « à la
//                       dernière séance », présences de l'année et remplacements consignés
//   votesDetailles      data/votes.json sur la page Décisions : tous les votes d'un même numéro sur la
//                       fiche, et les votes d'avant l'année chargée sous la liste (?vote=1)
//   dossierEstSommaire  « Sommaire décisionnel N — pas encore résumé » et « Sommaire, dans le document
//                       de séance (page N) »
//   abonnesMontant      data-montant="1" sur la fiche d'abonné quand le résumé a un montant
//   ficheEluSobre       fiche d'élu « District N — nom », sans téléphone, votes contre « depuis »
//   ordreArrondissements  ordre des groupes d'élus ; avec totalAvec et les postes vacants
//   paletteArrondissements { arrondissement: couleur } pour la carte
//   libelleMembres      [fr, en] : « membres du conseil de ville »
//   accesVille          { reactiver } : bandeau « Mise à jour interrompue » si data/acces-ville.json le dit
//
// Crochets (fonctions facultatives) :
//   titreArrondissement(nom)   titre d'un groupe d'élus (Lévis : « Arrondissement de Desjardins »)
//   rangComiteExecutif(m)      ordre des membres du comité exécutif
//
//   comparerNoms 'complet' : nom complet sans accents, espaces et tirets confondus (Lévis) ;
//                'sansAccents' : nom complet sans accents ni casse (Longueuil)
//   pages.contrats null : pas de page Contrats, pas de contrats SEAO sur les fiches
//
// Venues de Laval (20 nov. 2026), pour toute ville qui a la donnée :
//   resumes false         pas de data/resumes.json (résumés éteints) : le fichier n'est pas demandé
//   sommaires             data/sommaires.json : service responsable et montant lus dans le PDF du sommaire
//   presencesOuvertes     data/presences.json au format du jeu ouvert (parAnnee) : présences sur la fiche d'élu
//   resumeParSommaire     résumés indexés par numéro de sommaire (d.sommaireId, sinon d.dossier)
//   seancesParId          séances groupées par d.seanceId (deux séances le même jour, huis clos), en-tête
//                         « séance ordinaire du 3 févr. 2026, 18 h 30 », titre des documents réécrit
//   ficheFaits            fiche tirée du procès-verbal et de l'ordre du jour : montant et districts touchés
//                         (d.montant, d.districts), « Au procès-verbal », proposeur, certificat de trésorerie,
//                         sommaire non publié, PDF avec page ; compte « fiches, décisions et documents de séance »
//   votesDecompteImprime  carte de vote avec le décompte imprimé, la page du PDF, le vote de procédure ;
//                         « Votes nominatifs sans décision dans l'année » sous ?vote=1
//   tableauPourContre     tableau des votes contre à 4 colonnes (contre, pour, nommée), ordre alphabétique
//   elusDistrictsNumerotes  la mairie puis « Les N districts » par numéro ; fiche avec initiales sous la photo,
//                         habitants, présences, lien ?district= ; domaineVille ('laval.ca') pour le profil
//   carteParParti         { palette: { parti sans accents: couleur }, reserve: [couleurs] } : carte par parti
//   lexiqueExemples       l'exemple tiré des documents (e.exemple) sous chaque terme du lexique
//   accueilProcesVerbaux  chiffres de l'accueil « lues dans les procès-verbaux de 2026 »
//   etatDetaille          page Sources : sommaires, présences, lexique, avertissements des robots, index
// Détectés sans drapeau : filtre ?district=N (d.districts) et sa pastille, initiales quand une photo
// .portrait ne charge pas, liens ?type= et ?theme= sur la page Décisions.
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
