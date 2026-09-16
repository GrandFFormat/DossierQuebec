# Courriel à la Ville de Montréal — demander ce qui manque

> **Envoyé le 13 septembre 2026** à donneesouvertes@montreal.ca.
> **Réponse reçue le 16 septembre 2026** — voir à la fin du fichier. Aucune des trois demandes
> n'est refusée sur le fond ; deux sont « pas pour l'instant », une est en travaux.

Court, précis, et il ne demande aucune faveur : les trois choses demandées servent tout le
monde, pas seulement nous. C'est ce qui rend une demande facile à accepter.

**À** : donneesouvertes@montreal.ca
**Copie** : le Service du greffe — voir la note ci-dessous

> ⚠ `greffe@montreal.ca` N'EXISTE PAS : un envoi à cette adresse rebondit (vérifié le
> 13 septembre 2026). La Ville ne publie pas d'adresse courriel pour son Service du greffe.
> Les voies vérifiées sont la page du service, https://montreal.ca/unites/service-du-greffe,
> et la démarche d'accès aux documents,
> https://montreal.ca/demarches/demander-lacces-aux-documents-dun-arrondissement
> (Division du greffe, 555 rue Chabanel Ouest, bureau 600, Montréal H2N 2H8).
> Envoyer à donneesouvertes@montreal.ca seul fonctionne.
**Objet** : Calendrier des séances des conseils d'arrondissement — demande de publication

Remplacer `[courriel]` par votre adresse avant d'envoyer. Ce courriel est indépendant de
`courriel-greffe.md`, qui porte sur les droits d'usage : les deux peuvent partir le même jour.

---

Bonjour,

Je tiens un site citoyen indépendant, sans publicité et sans rien à vendre, qui rend lisibles
les décisions publiques. J'y ai ajouté un volet pour la Ville de Montréal, qui présente les
résolutions du conseil municipal, du conseil d'agglomération et du comité exécutif, avec le
lien vers le procès-verbal officiel de chacune.

Vos documents sont bien faits et leurs adresses sont prévisibles, ce qui m'a permis d'aller
loin. Trois choses me manquent, et je pense qu'elles manquent aussi à d'autres.

**1. Le calendrier des séances des conseils d'arrondissement.** Votre jeu de données
« Calendrier des instances politiques » couvre le comité exécutif, le conseil municipal et le
conseil d'agglomération, mais pas les 19 conseils d'arrondissement. Je n'ai trouvé aucun jeu
équivalent pour eux, sauf, semble-t-il, une publication isolée par un arrondissement.

Faute de source, je reconstitue leur calendrier en cherchant les documents : puisque le nom
d'un fichier contient sa date, l'existence du fichier prouve la séance. Cela marche, mais
c'est absurde — cela m'oblige à essayer des centaines d'adresses qui n'existent pas, donc à
vous envoyer des centaines de requêtes inutiles, et cela rate complètement les séances
extraordinaires, dont l'heure ne se devine pas.

Publier les dates des séances d'arrondissement, dans le jeu existant ou dans un nouveau, ferait
disparaître tout cela d'un coup, pour vous comme pour moi.

**2. Un index des documents de séance.** Vos procès-verbaux et ordres du jour sont servis
sous `ville.montreal.qc.ca/documents/Adi_Public/`, avec des noms de fichiers construits. La
même application les sert aussi par numéro (`/sel/adi-public/afficherpdf/…?doc=N`), ce qui
suppose qu'un index existe quelque part. Si cet index est consultable, ou peut le devenir, il
répondrait à la question précédente et à plusieurs autres.

Question simple : existe-t-il une façon d'obtenir la LISTE des documents publiés, plutôt que
de deviner leurs adresses une à une ?

**3. Les décisions en données structurées.** C'est la plus grande demande, et la moins
urgente. Aujourd'hui je lis vos PDF et j'en extrais les résolutions, ce qui marche bien mais
reste fragile : une mise en page qui change et une lecture se casse. La Ville de Québec publie
ses décisions dans un portail interrogeable ; si Montréal le faisait, la qualité de ce que
tout le monde peut en faire changerait d'un cran.

Sur ma façon de faire, pour que vous sachiez à qui vous avez affaire : mon robot s'identifie
(`DossierVille/0.1`), attend au moins 0,6 seconde entre deux requêtes, respecte le délai de
10 secondes que demande le robots.txt du portail de données ouvertes, et ne redemande jamais
un document déjà lu. Si mon trafic vous dérange à un moment, écrivez-moi et je l'ajuste le
jour même.

Je ne demande aucun accès privilégié et je n'en veux pas : tout ce que je lis est déjà public.
Je demande seulement que ce qui est public soit trouvable.

Merci de votre temps,

Martin Archambault
[courriel] — https://dossierquebec.ca/montreal/ (prototype)

---

## La réponse de la Ville, le 16 septembre 2026

Reçue d'Alexis, équipe des Données ouvertes. Reproduite telle quelle, parce qu'une réponse
qu'on résume est une réponse qu'on déforme.

> Bonjour Martin,
>
> Merci de votre intérêt pour les données ouvertes,
>
> Pour répondre à vos questions, voici au meilleur de nos connaissances quelques éléments de
> réponse,
>
> Les horaires des conseils d'arrondissement ne sont pas intégrés au calendrier des séances,
> car ils ne sont pas gérés par les mêmes équipes. Le fonctionnement des arrondissements,
> surtout dans l'aspect politique, est en grande partie autonome. Trouver une solution
> technologique pour réunir les 19 sources différentes de données est un travail complexe sur
> lequel nous travaillons.
>
> Pour ce qui est des index, je comprends votre besoin, mais, comme les documents sont déjà
> publiés sur le site officiel de la ville, un index complet n'est pas priorisé pour l'instant
> par les équipes responsables.
>
> Les décisions en format structurées seraient, je l'accorde d'une grande valeur, mais la
> complexité liée à leur extraction automatisée sur des systèmes relativement âgés et sécurisés
> représente un défi important que nous allons considérer, mais qui ne sera pas réglé
> prochainement.
>
> Merci pour respect des consignes du fichier robot.txt, c'est très apprécié en ces temps-ci.
> Les agents IA créent un trafic qui a décuplé dans l'année courante.
>
> Cordialement,
>
> Alexis, équipe des Données ouvertes

### Ce que ça change pour nous

**1. Le calendrier des arrondissements — en travaux.** C'est la meilleure nouvelle des trois,
et elle était la moins attendue : la Ville dit y travailler. La raison du manque est
organisationnelle et non technique — dix-neuf conseils autonomes, gérés par d'autres équipes que
le calendrier central. Notre reconstitution par sondage d'adresses reste donc la seule voie
aujourd'hui, mais elle a une date de péremption, et c'est exactement ce qu'on voulait.

**2. L'index des documents — non, pour l'instant.** Le motif est clair : les documents sont déjà
publiés, un index n'est pas prioritaire. Rien à redire, et rien à relancer avant longtemps.

**3. Les décisions en données structurées — reconnu, mais pas bientôt.** La valeur est admise ;
l'obstacle est l'âge des systèmes. C'est la demande la plus lourde et on le savait. Elle reste
posée.

**4. Le robot.txt.** Le remerciement n'est pas de la politesse creuse : la Ville dit voir son
trafic décupler à cause des agents IA. Notre throttle, notre User-Agent identifiable et le
délai de 10 secondes ne sont pas seulement corrects — ils sont ce qui nous distingue, et c'est
pour cela qu'on ne les touche pas.

**Ce que cette réponse ne couvre pas.** L'adresse des sommaires décisionnels, qui fait l'objet du
second courriel (`courriel-sommaires.md`), envoyé après celui-ci. C'est la demande la moins
coûteuse des quatre — le document existe, il est public, il ne manque que son chemin — et c'est
la seule qui débloquerait les résumés en langage clair. Elle reste sans réponse.
