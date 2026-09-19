# Le numéro de dossier est indexé — réponse de la Ville, 19 septembre 2026

Troisième réponse d'Alexis, de l'équipe des Données ouvertes, à la demande d'indexer le
numéro de dossier décisionnel dans le Répertoire des documents officiels.

---

> Bonjour Martin,
>
> Les numéros sont indexés, comme le montre cette requête
> https://mtl.ged.montreal.ca/constellio/?collection=mtlca&portal=REPDOCVDM#!searchResults/s/fda36dc0-b38e-11f1-81fa-a3a1066c3fe9
>
> Cependant il est possible que toutes les résolutions ne soient pas archivées dans les mêmes
> délais. Les règles d'archivages des productions documentaires municipales sont régi par des
> lois provinciales et font l'objet d'un suivi méticuleux de la part des instances.
>
> Malheureusement je ne saurais en dire plus sur les délais de disponibilités dans l'outil de
> gestion électronique de document
>
> Cordialement,
>
> Alexis, équipe des Données ouvertes

---

## Ce que ça change

**La demande est réglée.** C'était la dernière des trois posées le 13 septembre. Le numéro de
dossier que la Ville imprime sous chaque décision mène maintenant à son document dans le
Répertoire.

**Ce que ça n'efface pas.** Un document indexé n'est pas un document déposé : la Ville dit
elle-même que les résolutions n'y arrivent pas toutes au même rythme, et que ces délais
suivent des règles d'archivage provinciales qu'elle ne peut pas détailler. Une décision
récente peut donc être introuvable dans le Répertoire pendant des semaines ou des mois, sans
que personne sache lesquelles ni combien de temps. C'est exactement le trou que la page
Sources annonce.

**Ce qu'on en fait.** Rien à changer dans la chaîne : depuis le 18 septembre, les sommaires
viennent des ordres du jour, qui arrivent le jour même de la séance plutôt qu'au rythme de
l'archivage. Le Répertoire reste le recours pour ce qui manque, en particulier pour
Saint-Laurent, seul conseil à n'annexer aucun sommaire à son ordre du jour.

## Ce que la mesure dit, le 19 septembre 2026

Sonde `npm run sonder:ged`, un vrai navigateur, une recherche à la fois :

| Recherche | Résultats |
|---|---|
| Cinq numéros de dossier de 2026 (janvier à juin) | **0** chacun |
| `1248358013` et `1246723004` (2024), `1256723002` (2025) | **2 à 3** chacun |
| « procès-verbal » | 1 281 |
| « Eurovia Québec Construction » | 25 499 |

Les trois numéros de 2024 et 2025 ont été pris **dans les résultats affichés par le portail
lui-même**, puis recherchés : ils reviennent. L'index par numéro de dossier fonctionne donc,
exactement comme la Ville l'écrit.

Ce qui ne répond pas, c'est **l'année en cours**. Aucun des cinq dossiers de 2026 essayés
n'est dans le Répertoire. C'est le délai d'archivage dont parle Alexis, et il se mesure en
mois, pas en jours : à la mi-septembre 2026, le fonds va jusqu'en 2025.

**Conséquence pour le site.** Le Répertoire est une bonne source pour les années passées et
une mauvaise pour l'actualité, qui est précisément ce que le site montre. Les sommaires du
site continuent donc de venir des ordres du jour, disponibles le jour de la séance.

**Ce qui reste à vérifier.** Le lien donné en exemple est une adresse de session, pas une
adresse de document : elle ne se partage pas. Reste à savoir si une recherche par numéro
rend le sommaire lui-même, et si son adresse peut être citée. C'est ce que la sonde
(`npm run sonder:ged -- <numéro>`) est allée mesurer le 19 septembre.
