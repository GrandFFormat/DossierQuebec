# Courriel à la Ville de Longueuil — modèle

À envoyer **avant** de retirer les verrous `noindex` (voir README, « Où ce volet vit »).
Programmer une relance à 20 jours ouvrables.

**À qui.** `accesinformation@longueuil.quebec` — l'adresse publiée sur la page
[« Demande d'accès à l'information »](https://www.longueuil.quebec/fr/services/demande-acces-information)
(vérifiée le 14 septembre 2026), celle de **Me Audrey Paquet**, responsable de l'accès aux documents
et de la protection des renseignements personnels, en lui demandant de transmettre à **Me Sophie
Deslauriers**, directrice du greffe et greffière (nommée en tête de chaque procès-verbal). Aucune
adresse courriel du greffe lui-même n'est publiée : **ne pas en deviner une**.

Autres voies vérifiées : le **Centre de services aux citoyens**, que
l'[avis juridique](https://longueuil.quebec/fr/avis-juridique) désigne pour les demandes
d'autorisation (311 ou 450 463-7311) ; le formulaire
[« Communiquez avec nous »](https://longueuil.quebec/fr/communiquez-avec-nous) ; la poste, 4250,
chemin de la Savane, Longueuil (Québec) J3Y 9G4.

Remplacer les chiffres entre crochets par ceux du dernier `npm run refresh`.

---

**Objet : Veille citoyenne des décisions de la Ville — demande d'autorisation et de confirmation d'usage**

À l'attention de Me Audrey Paquet, responsable de l'accès aux documents — et, pour transmission, de
Me Sophie Deslauriers, directrice du greffe

Bonjour,

Je m'appelle Martin Archambault. Je tiens un site citoyen indépendant, sans publicité, qui rend
lisibles les décisions publiques : DossierQuébec (Assemblée nationale), DossierCanada (Parlement
fédéral) et des volets municipaux pour Québec, Montréal et Lévis. Je prépare le même volet pour la
Ville de Longueuil, et je vous écris avant de le rendre public.

**Ce que le site fait.** Il présente, pour l'année en cours, les résolutions du conseil de ville et
du conseil d'agglomération — numéro, titre, date, résultat, et les votes nominatifs tels que
consignés — avec, pour chacune, le lien vers le procès-verbal officiel. Il ajoute un résumé en
langage clair du sommaire décisionnel, produit automatiquement et identifié comme tel, sans
jugement de valeur et sans rien ajouter au document. Il présente aussi les membres du conseil, la
carte des districts électoraux et la composition du conseil d'agglomération.

**Comment il lit vos documents.** Un robot identifié (`DossierVille/0.1 (veille citoyenne;
[courriel])`) lit, une fois par jour :

- les pages « Conseil de ville » et « Conseil d'agglomération » de longueuil.quebec, qui listent
  les séances — deux requêtes ;
- le procès-verbal et l'ordre du jour de chaque séance nouvellement publiée, une seule fois ;
- le document de séance (« Global ») de chaque séance, une seule fois, pour y lire les pages des
  sommaires décisionnels ; il est servi par votre espace SharePoint ;
- le lundi, la page « Élus » et la couche « Districts électoraux (2025-2029) » de votre carte en
  ligne.

Chaque requête attend au moins 0,6 seconde après la précédente. Un document lu n'est jamais
redemandé. Sur une journée ordinaire, cela représente [deux] requêtes à longueuil.quebec ; les
jours de publication d'un procès-verbal, [deux] PDF de plus.

**Ce que je m'engage à faire, quoi qu'il arrive.** Citer la source sur chaque fiche ; garder le lien
vers le document officiel ; dire sur chaque page que le site n'est pas celui de la Ville et n'a
aucun caractère officiel ; et vous signaler les erreurs que je trouve dans vos données. Par
exemple : [17] résolutions de 2026 citent un sommaire décisionnel qui ne figure pas dans le document
de séance, et le jeu « Districts électoraux » de Données Québec a encore les 15 districts et les
élus d'avant 2021 ; je vous en donne volontiers le détail.

**Deux points à clarifier avec vous.**

1. **L'avis juridique.** Il demande une autorisation préalable pour reproduire, stocker ou
   communiquer le contenu du site « à des fins de commercialisation ». Je préfère être transparent
   là-dessus : les décisions, les résumés, les votes et les liens vers vos documents sont
   **gratuits pour tout le monde** sur mon site ; il existe par ailleurs un abonnement de 3 $ par
   mois, commun à toutes les villes couvertes, qui ajoute des outils de suivi (alertes par courriel,
   suivi de dossiers, export). Je ne vends pas vos documents, mais je ne veux pas présumer de votre
   lecture. Pouvez-vous me dire si cet usage demande votre autorisation et, le cas échéant, me
   l'accorder ou m'indiquer ce qu'il faudrait changer ?
2. **Les sommaires décisionnels.** Je les lis dans le document de séance, qui peut dépasser
   150 Mo. Existe-t-il une façon plus légère de les obtenir un par un — une adresse par numéro de
   sommaire, par exemple ? Ce serait moins lourd pour vos serveurs comme pour les miens.

**Ce que je demande.** Votre accord pour continuer à lire les documents comme décrit, et pour rendre
le site public. Tant que je n'ai pas votre réponse, les pages restent hors des moteurs de recherche.

Je reste disponible pour toute question, et pour ajuster ce qui doit l'être.

Merci de votre attention,

Martin Archambault
[courriel] — https://dossierquebec.ca/longueuil/ (prototype)
