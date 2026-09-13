# Courriel au greffe de la Ville de Montréal — modèle

À envoyer **avant** de retirer les verrous `noindex` (voir README, « Les pages »), au
Service du greffe (greffe@montreal.ca ou le formulaire d'accès à l'information) et, en
copie, à l'équipe des données ouvertes (donneesouvertes@montreal.ca). Remplacer les
chiffres entre crochets par ceux du dernier `npm run refresh`.

---

**Objet : Veille citoyenne des décisions de la Ville — demande de confirmation d'usage**

Bonjour,

Je m'appelle Martin Archambault. Je tiens un site citoyen indépendant, sans publicité et sans
rien à vendre, qui rend lisibles les décisions publiques : DossierQuébec (Assemblée nationale),
DossierCanada (Parlement fédéral) et un volet municipal pour la Ville de Québec. Je prépare le
même volet pour la Ville de Montréal, et je vous écris avant de le rendre public.

**Ce que le site fait.** Il présente, pour l'année en cours, les résolutions du conseil
municipal, du conseil d'agglomération et du comité exécutif — numéro, objet, date, instance,
résultat, et les votes enregistrés tels que consignés — avec, pour chacune, le lien vers le
procès-verbal officiel. Il ajoute un résumé en langage clair du sommaire décisionnel, produit
automatiquement et identifié comme tel, sans jugement de valeur et sans rien ajouter au document.
Il présente aussi les membres du conseil, du comité exécutif et du conseil d'agglomération, et
la carte des districts, à partir de vos jeux de données ouverts (licence CC-BY 4.0).

**Comment il lit vos documents.** Un robot identifié (`DossierVille/0.1 (veille citoyenne;
[courriel])`) lit, une fois par jour :

- le calendrier des séances, sur le portail de données ouvertes (une ou deux requêtes) ;
- pour chaque séance passée dont le procès-verbal n'a pas encore été lu, l'URL prévisible du
  procès-verbal sous `ville.montreal.qc.ca/documents/Adi_Public/` (un essai par jour tant qu'il
  n'est pas publié, un téléchargement le jour où il l'est), puis l'ordre du jour ;
- les sommaires décisionnels des décisions récentes, au plus [120] par jour ;
- le lundi, les jeux « Liste des élus », « Liste des élus du Conseil d'agglomération » et
  « Districts électoraux ».

Chaque requête attend au moins 0,6 seconde après la précédente. Un document lu n'est jamais
redemandé. Sur une journée ordinaire, cela représente [une dizaine] de requêtes ; les jours de
publication d'un procès-verbal, [deux ou trois] PDF de plus.

**Ce que je m'engage à faire, quoi qu'il arrive.** Citer la source sur chaque fiche ; garder
le lien vers le document officiel ; dire sur chaque page que le site n'est pas celui de la
Ville et n'a aucun caractère officiel ; ne faire aucun usage commercial ; et vous signaler les
erreurs que je trouve dans vos données — il y en a toujours, et je vous les décris volontiers.

**Deux points à clarifier avec vous.**

1. Les mentions légales de montreal.ca réservent tous les droits sur le contenu du site et
   interdisent la reproduction d'images à des fins commerciales. Les procès-verbaux sont des
   documents publics ; je les reproduis sans usage commercial et avec mention de la source.
   Pouvez-vous me confirmer que cet usage vous convient, ou me dire ce qu'il faudrait changer ?
2. Le fichier robots.txt de vos sites : si l'un d'eux exclut les robots des chemins que je lis,
   je préfère vous le demander plutôt que de passer outre. Le débit décrit ci-dessus est
   volontairement faible, et je peux le réduire encore si vous le souhaitez.

**Ce que je demande.** Votre accord pour continuer à lire les documents comme décrit, et pour
rendre le site public. Tant que je n'ai pas votre réponse, les pages restent hors des moteurs
de recherche.

Je reste disponible pour toute question, et pour ajuster ce qui doit l'être.

Merci de votre attention,

Martin Archambault
[courriel] — https://dossierquebec.ca/villedemontreal/ (prototype)
