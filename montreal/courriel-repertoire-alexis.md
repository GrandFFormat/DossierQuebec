# Troisième courriel à Alexis — le Répertoire ne connaît pas le numéro de dossier

> **Envoyé le 17 septembre 2026**, en réponse à son courriel du même jour.
> Rappel de relance : 30 septembre 2026.

## Ce qui a changé entre le deuxième et le troisième

Le 16, nous demandions le moyen de passer du numéro de dossier à l'identifiant interne du
visualiseur de sommaires. Alexis a répondu le 17 qu'il n'existe pas de façon publique
d'atteindre un sommaire par son identifiant — mais que plusieurs sommaires se trouvent dans
l'outil de gestion documentaire de la Ville, avec un exemple :

    https://mtl.ged.montreal.ca/constellio/?collection=mtlca&portal=REPDOCVDM
      #!searchResults/s/46b35cdf-b20b-11f1-81fa-496f41e4c0cd

Information neuve, et elle renverse ce qu'on croyait. Nous sommes allés voir, et voici ce
que la mesure dit — c'est elle qui fait la force de ce courriel-ci.

**Le portail est public.** Il s'appelle « Répertoire des documents officiels », n'exige
aucun compte, et annonce couvrir « la Ville de Montréal et ses 19 arrondissements ». Ce
n'est donc pas un intranet.

**Il est plein.** « procès-verbal » y rend 1 279 documents.

**Et le numéro de dossier n'y donne rien.** `1265298015` — le numéro que le procès-verbal de
la Ville imprime lui-même à la fin de la résolution correspondante — rend **0 résultat**.
C'est la seule des cinq mesures qui soit sans ambiguïté : la recherche du portail est un
« ou » (« CM26 0590 » compte les documents contenant « CM26 » OU « 0590 », d'où ses 8 235
résultats, qui ne prouvent rien), mais un numéro à dix chiffres est un seul mot. Il n'est
pas indexé, point.

**Comment c'est mesuré**, pour que ce soit refaisable : le portail est un Constellio bâti
sur Vaadin 7, où toute l'interface vit sur le serveur — il n'y a aucune adresse de recherche
à appeler, les onze chemins essayés rendant tous la même coquille de 2 148 octets. La seule
façon de l'interroger est de s'en servir comme un humain. Une session de navigateur, cinq
recherches, une capture d'écran, et on s'en va. Le script est `scrapers/sonde-ged.js`, le
journal `data/ged-sonde.log`.

## La demande

Elle change de nature une troisième fois, et elle devient la plus petite des trois : ni un
accès, ni une table à publier, mais **un champ à indexer dans un outil qui existe déjà**. Et
elle ne sert pas que nous : un citoyen qui lit un procès-verbal voit un numéro de dossier
sous chaque décision, et ce numéro ne mène nulle part, pas même dans le répertoire que la
Ville met à sa disposition.

**Objet** : Re: sommaires décisionnels — le Répertoire ne connaît pas le numéro de dossier

---

Bonjour Alexis,

Merci pour le lien vers le Répertoire des documents officiels — je ne le connaissais pas, et
c'est une bonne nouvelle en soi : il est public, sans compte, et il annonce couvrir la Ville
et ses 19 arrondissements.

Je suis allé y voir, à la main, une session, sans rien y récolter. Et j'y ai trouvé la
raison exacte du blocage, que je vous rapporte parce qu'elle vous concerne plus que moi.

**Le Répertoire ne connaît pas le numéro de dossier décisionnel.** J'y ai cherché
`1265298015` — le numéro que votre propre procès-verbal imprime à la fin de la résolution
correspondante. Résultat : **0**. J'ai refait l'essai avec d'autres numéros, même réponse.
Ce n'est pas une question de formulation : un numéro à dix chiffres est un seul mot, il n'y
a pas d'ambiguïté possible. Il n'est simplement pas indexé.

La conséquence est plus large que mon cas. Un citoyen qui lit un procès-verbal de la Ville y
voit, sous chaque décision, un numéro de dossier. S'il veut comprendre **pourquoi** cette
décision a été prise, ce numéro est la seule prise qu'il ait — et il ne mène nulle part, pas
même dans le Répertoire que vous mettez à sa disposition.

**Ma demande tient en une ligne : le numéro de dossier décisionnel pourrait-il devenir une
métadonnée indexée du Répertoire ?** Pour que taper `1265298015` dans votre moteur ramène le
sommaire correspondant.

Ce n'est pas une publication nouvelle : les documents sont déjà là, déjà publics, déjà dans
votre outil. C'est un champ à indexer. Et si ce champ existe déjà sous un autre nom,
dites-le-moi — je chercherai autrement et je n'aurai plus rien à demander.

Sur ma façon de faire, pour lever tout doute : je n'ai pas moissonné le Répertoire et je
n'en ai pas l'intention. C'est un Vaadin, chaque recherche est une session serveur ; y lire
mes 4 088 dossiers demanderait 4 088 sessions de navigateur, ce qui serait exactement le
genre de trafic dont vous m'avez dit qu'il a décuplé cette année. J'ai ouvert une page, tapé
cinq mots, noté ce que j'ai vu, et je suis parti. C'est aussi pour ça que je préfère vous
demander un index plutôt que de me débrouiller.

Merci encore,

Martin Archambault
mart.archambault@gmail.com
https://dossierquebec.ca/montreal/ (prototype)
