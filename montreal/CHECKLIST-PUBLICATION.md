# Avant d'enlever l'étiquette « Prototype » — volet Montréal

Une case cochée = vérifié à la date indiquée, par qui. On ne coche pas de mémoire : on
regarde. Quand tout est coché, la dernière section dit quoi changer pour publier.

## 1. Le droit de le faire

- [ ] Courriel au Service du greffe (droits d'usage des documents) **envoyé** — date : ______
- [ ] Réponse reçue, ou 30 jours passés sans objection — date : ______
- [ ] Réponse (ou silence) consignée dans README.md, section « Ce qu'on a demandé »
- [ ] Le robot se présente avec un vrai contact : variable `MTL_CONTACT` posée dans GitHub
      (Settings › Secrets and variables › Actions › Variables), pas l'adresse du site par défaut

## 2. Même site que les autres villes

- [x] Thème clair/sombre et zoom partagés avec Mes dossiers et les autres volets *(18 sept. 2026)*
- [ ] La pastille « EN » traduit les six pages, ou n'apparaît pas — pas de page à moitié traduite
- [ ] En anglais : les résumés IA et les titres des décisions sont traduits (data/resumes-en.json), et un résumé pas encore traduit le dit au lieu de mentir
- [ ] En anglais : le lexique (data/lexique-en.json) et les libellés des filtres sont traduits ; les noms propres, les numéros et les documents de la Ville restent en français
- [ ] Les mêmes filtres et boutons qu'à Québec sur la page Décisions : recherche, type, sujet, affichage, instance, « Avec résumé seulement », « Tout déplier » — et rien de plus *(case « Avec résumé seulement » révélée le 18 sept. 2026)*
- [ ] Le menu des villes mène à Montréal et en revient, depuis chaque volet
- [ ] Le favicon (la petite icône de l'onglet) s'affiche sur les six pages, en clair et en sombre, et se distingue de celui de Québec
- [ ] Mes dossiers : les 16 sujets de Montréal s'affichent, avec leur récapitulatif, en clair et en sombre
- [ ] S'abonner à un sujet de Montréal fonctionne de bout en bout (abonnement.html → courriel reçu)
- [x] Le bloc « Les courriels » au bas de l'accueil ne montre que ceux de Montréal *(18 sept. 2026)*
- [x] Dans Mes dossiers, ouvert depuis Montréal, la boîte « Mes courriels de Montréal » ne montre que ceux de Montréal ; les autres villes s'inscrivent chez elles, sans lien ni mention *(18 sept. 2026)*
- [ ] Même règle vérifiée sur chaque volet : Québec, Lévis, Laval, Longueuil (bloc caché tant que la ville n'a pas de courriels)
- [ ] S'inscrire au compte rendu du mois de Montréal depuis l'accueil, avec une vraie adresse : courriel de confirmation reçu, puis le plus récent numéro

## 3. Les données tiennent toutes seules

- [ ] Le rafraîchissement du matin est vert **7 jours de suite** (Actions › Rafraîchissement quotidien — volet Montréal)
- [ ] Aucune « étape secondaire en échec » dans ces 7 journaux (data/lancement.log)
- [ ] Les résumés arrivent par lots chaque matin : data/resumes.json grossit les jours de séance
- [ ] data/textes.json n'est jamais retombé à zéro
- [ ] Les 19 conseils ont des séances de l'année en cours (page Sources › État des données)
- [ ] Le coût mensuel de l'API est celui attendu : ~25 $ US par mois en session (résumés sur Opus, traductions sur Sonnet), vérifié sur la facture

## 4. Chaque page, à l'œil

Pour chacune de : Accueil, Décisions, Votes nominatifs, Conseil municipal, Lexique, Sources —

- [ ] en thème clair et en thème sombre
- [ ] sur téléphone (largeur 390 px) : rien ne déborde, tout se lit
- [ ] au zoom 150 %
- [ ] aucun texte qui promet encore quelque chose de faux (« pas encore accessible », « en attente », « prototype »)
- [ ] chaque lien « PDF officiel » ouvre le bon document, à la bonne page (en tester 5 au hasard, dont un sommaire)
- [ ] la carte des districts charge et chaque district mène à ses décisions
- [ ] le bouton « retour en haut » (la flèche ↑, en bas à droite) apparaît dès qu'on a descendu de 600 px, sur toutes les pages assez longues, en clair comme en sombre, et sur téléphone
- [ ] aucune étiquette ni aucun titre ne reste en français quand la page est en anglais (catégories, types, instances, titres de procès-verbal et d'ordre du jour)

## 5. Ce qu'on dit à la Ville et au lecteur

- [ ] Sources › « Ce qu'on a demandé à la Ville » est à jour (dernier échange, dernière date)
- [ ] Le lexique n'a pas de terme vide
- [ ] Le pied de page dit « site citoyen indépendant, aucun caractère officiel »
- [ ] La légende « Montréal commence… » (api/_infolettre.js, NOTES_INFOLETTRE) est retirée dès que le premier compte rendu du mois est publié (`npm run infolettre -- --mois=2026-09 --publier`) — elle s'affiche sur l'accueil et dans Mes dossiers

## 6. Publier (à faire d'un coup, une fois tout coché)

- [ ] Retirer `<meta name="robots" content="noindex, nofollow">` des six pages de montreal/
- [ ] Retirer l'en-tête `X-Robots-Tag` sur `/montreal/` dans vercel.json
- [ ] Ajouter les six pages à sitemap.xml
- [ ] Retirer l'étiquette « Prototype » (index.html et les cinq autres en-têtes)
- [ ] Image de partage (og-image) propre à Montréal, testée sur un lien partagé
- [ ] Une dernière capture de chaque page, clair et sombre, jointe au commit de publication
