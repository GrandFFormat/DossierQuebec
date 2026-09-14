# Courriel au greffe de la Ville de Lévis — modèle

À envoyer **avant** de retirer les verrous `noindex` (voir README, « Où ce dossier vit »), au
Service du greffe de la Ville de Lévis. Trouver l'adresse ou le formulaire sur
https://levis.ca/fr/ville/decouvrir-levis/nous-joindre — **ne pas deviner une adresse**. Si le
site propose un service des technologies ou de la transformation numérique, le mettre en copie :
le point 2 le concerne. Remplacer les chiffres entre crochets par ceux du dernier `npm run refresh`,
et programmer une relance à 20 jours ouvrables.

---

**Objet : Veille citoyenne des décisions de la Ville — demande de confirmation d'usage**

Bonjour,

Je m'appelle Martin Archambault. Je tiens un site citoyen indépendant, sans publicité et sans
rien à vendre, qui rend lisibles les décisions publiques : DossierQuébec (Assemblée nationale),
DossierCanada (Parlement fédéral) et des volets municipaux pour Québec et Montréal. Je prépare le
même volet pour la Ville de Lévis, et je vous écris avant de le rendre public.

**Ce que le site fait.** Il présente, pour l'année en cours, les résolutions du conseil de la
Ville, du comité exécutif et des trois conseils d'arrondissement — numéro, objet, date, instance,
résultat, et les votes nominatifs tels que consignés — avec, pour chacune, le lien vers le
procès-verbal officiel et, s'il y a lieu, vers le document d'aide à la décision. Il ajoute un
résumé en langage clair de ce document, produit automatiquement et identifié comme tel, sans
jugement de valeur et sans rien ajouter au document. Il présente aussi les membres du conseil,
leurs fonctions et la carte des districts (données ouvertes de la Ville, CC-BY 4.0).

**Comment il lit vos documents.** Un robot identifié (`DossierVille/0.1 (veille citoyenne;
[courriel])`) lit, une fois par jour :

- la page « Archives des séances du conseil municipal » et la liste des séances de l'année, par la
  même interface que cette page utilise elle-même dans le navigateur (`levis.ca/graphql/`) — deux
  ou trois requêtes ;
- le procès-verbal de chaque séance nouvellement publiée, une seule fois ;
- les documents d'aide à la décision des résolutions récentes, au plus [120] par jour, une seule
  fois chacun ;
- le lundi, les pages « Membres du conseil municipal » et « Élections », et le fichier des
  districts électoraux sur Données Québec.

Chaque requête attend au moins 0,6 seconde après la précédente. Un document lu n'est jamais
redemandé. Sur une journée ordinaire, cela représente [quatre ou cinq] requêtes ; les jours de
publication d'un procès-verbal, [quelques] PDF de plus.

**Ce que je m'engage à faire, quoi qu'il arrive.** Citer la source sur chaque fiche ; garder le
lien vers le document officiel ; dire sur chaque page que le site n'est pas celui de la Ville et
n'a aucun caractère officiel ; ne faire aucun usage commercial ; et vous signaler les erreurs que
je trouve — par exemple, quelques procès-verbaux renvoient à des documents d'aide à la décision
par l'adresse de l'ancien site, qui répond aujourd'hui « accès refusé », ou par un lien SharePoint
interne inaccessible au public ; je vous en donne volontiers la liste.

**Deux points à clarifier avec vous.**

1. Le site levis.ca indique « Tous droits réservés ». Les procès-verbaux et les documents d'aide
   à la décision sont des documents publics ; je les cite sans usage commercial et avec mention de
   la source. Pouvez-vous me confirmer que cet usage vous convient, ou me dire ce qu'il faudrait
   changer ?
2. Pour lister les séances, mon robot interroge la même interface que votre page d'archives
   (`levis.ca/graphql/`), avec la clé de lecture publique que la page utilise. Votre robots.txt ne
   l'exclut pas, mais ce n'est pas une interface documentée. Si vous préférez que je lise la
   liste autrement — ou s'il existe un jeu de données ouvert des séances et des procès-verbaux —
   dites-le-moi et je m'y conforme.

**Ce que je demande.** Votre accord pour continuer à lire les documents comme décrit, et pour
rendre le site public. Tant que je n'ai pas votre réponse, les pages restent hors des moteurs de
recherche.

Je reste disponible pour toute question, et pour ajuster ce qui doit l'être.

Merci de votre attention,

Martin Archambault
[courriel] — https://dossierquebec.ca/levis/ (prototype)
