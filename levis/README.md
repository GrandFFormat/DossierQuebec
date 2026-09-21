# DossierVilleDeLévis

Volet municipal de DossierQuébec pour la Ville de Lévis, servi sous
`https://dossierquebec.ca/levis/`. Même esprit que les volets Québec et Montréal : les décisions
de la Ville, lisibles, chacune reliée à son document officiel ; les votes nominatifs tels que
consignés ; aucune donnée inventée, aucun verdict sur une personne.

Construit le 14 septembre 2026 en suivant `quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`, à partir
du volet Montréal (Lévis publie, comme Montréal, des procès-verbaux en PDF). **En français
seulement** (guide, section 10).

## Démarrage

```
cd levis
npm install
npm run refresh            # la routine complète (résumés sautés sans clé API)
npm run serve              # puis http://localhost:8080/ — ou le serveur de la racine du dépôt
```

Utiles pendant la mise au point :

```
node scripts/essai-pv.js <URL ou chemin d'un PDF> [--tout]   # découpage d'un PV, sans rien écrire
node scrapers/decisions.js --seance=CV_2026-06-16             # relit une séance
node --env-file=../api.env scrapers/resumes.js --dry-run      # estime le coût des résumés
```

## Étape 1 — L'étude de faisabilité (14 septembre 2026)

Ce qui suit a été **vérifié** sur les documents et les pages de la Ville, pas supposé.

### Le gisement

Lévis a changé de site en 2026 : `www.ville.levis.qc.ca` (TYPO3) renvoie maintenant vers
`levis.ca`, un site Nuxt adossé à Craft CMS. La page « Archives des séances du conseil
municipal » n'affiche que quatre séances par année et en charge d'autres par « Voir plus » :
derrière, c'est **l'API GraphQL de Craft** (`https://levis.ca/graphql/`), appelée par le
navigateur avec un **jeton de lecture publique** écrit dans le JavaScript du site
(`X-Craft-Authorization: Bearer …`). `lib/levis.js` fait comme le navigateur : il lit le jeton
dans le module d'entrée du site à chaque exécution (jamais dans le dépôt) et pose la même
question que la page.

Une requête rend toutes les « participations citoyennes » d'une année, avec leur type
(`seance-du-conseil-municipal`, `seance-des-conseils-darrondissement`), leur arrondissement et
les liens vers l'ordre du jour et le procès-verbal. Les procès-verbaux du comité exécutif sont
dans la même section, sans type : on les reconnaît au nom de leur fichier (`PV-CE-…`).

Les PDF sont sur un stockage S3 d'OVH (`levis-website-resources.s3.bhs.io.cloud.ovh.net/pc/…`)
avec des **noms imprévisibles** (`PV-CV-2026-08-25-CV3600-a-CV3637.pdf`,
`PVCV-2025-12-08.pdf`, `07-Proces_verbal_de_la_seance_ordinaire_du_29_juillet_2026.pdf`) : on
ne les construit jamais, on les lit dans l'API.

| Instance | Séances 2026 (au 14 sept.) | Procès-verbaux publiés | Résolutions lues |
|---|---|---|---|
| Conseil de la Ville (CV) | 19 au calendrier | 12 | 564 |
| Comité exécutif (CE) | 17 | 17 | 616 |
| Conseil d'arrondissement de Desjardins (CAD) | 12 | 7 | 273 |
| Chutes-de-la-Chaudière-Est (CACCE) | 12 | 7 | 189 |
| Chutes-de-la-Chaudière-Ouest (CACCO) | 12 | 7 | 135 |

Soit **1 727 résolutions** et 50 procès-verbaux pour 2026 à la mi-septembre ; en 2025, 80
procès-verbaux (20 CV, 33 CE, 27 CA) ; archives en ligne depuis 2001.

### Ce que les procès-verbaux contiennent

Du **vrai texte** (aucun PDF dégradé sur les 50 de 2026). Chaque résolution s'ouvre par son
numéro **en gras**, seul sur sa ligne (`CV3490`, `CE3302`, `CAD-2026-0218`), suivi de son objet
**en gras**, puis du corps en romain. `lib/pdf.js` (repris de Montréal) marque maintenant la
graisse de chaque ligne à partir du vrai nom de la police (`TimesNewRomanPS-BoldMT`,
`Calibri-Bold`) : l'objet est exactement la suite des lignes grasses, sans règle de texte.

Sous l'objet, au conseil de la Ville et au comité exécutif : `Document d’aide à la décision
FIN-2026-035`, l'identifiant du **sommaire décisionnel** — et le procès-verbal porte un
**hyperlien** vers ce sommaire. En 2026 : 895 résolutions citent un sommaire, 868 sont reliées
à son PDF (494 sommaires distincts). Les sommaires sont du texte propre (identifiant, direction,
date, objet, état de la situation, recommandation, analyse, échéancier) : c'est la matière des
résumés. Les conseils d'arrondissement ne citent pas de sommaire.

**Votes.** La plupart des résolutions sont « Adoptée à l’unanimité ». Au conseil de la Ville,
quand un membre le demande :

> À la demande du membre du conseil de la Ville Éric Nadeau, le président du conseil appelle le
> vote sur la proposition. Les membres du conseil de la Ville Erik Bilodeau, Olivier Biron, …, le
> président du conseil Jean Leblond et le maire Steven Blaney votent en faveur de la proposition.
> Les membres du conseil de la Ville Audrey Bédard, … et Éric Nadeau votent en défaveur de la
> proposition. Le président du conseil déclare la proposition adoptée à la majorité.

Noms **complets**, parfois « votent contre » au lieu de « en défaveur », deux votes par
résolution quand il y a un amendement (« proposition d’amendement » puis « proposition
principale »). **Aucun décompte imprimé** : le garde-fou est la **liste des présences** en tête
du procès-verbal (chaque nom extrait doit y figurer) et la **déclaration du président**
(le résultat tiré des listes doit la confirmer). **15 votes nominaux en 2026, 15 recoupements
exacts, 0 avertissement.** Les conseils d'arrondissement écrivent « Adoptée à la majorité »
sans nommer personne ; le comité exécutif « Il est résolu », sans vote.

### Les conditions

- `levis.ca/robots.txt` n'exclut que `/cpresources/`, `/vendor/`, `/.env`, `/cache/` : rien de ce
  qu'on lit. Le stockage S3 n'a pas de robots.txt (403 à la racine). `www.donneesquebec.ca`
  exclut `/recherche/api/` : on n'y passe pas, on lit le fichier GeoJSON à son adresse de
  téléchargement. Relevés conservés dans `data/robots.json`.
- Pied de page de levis.ca : « © 2026, Ville de Lévis. Tous droits réservés. » Pas d'avis
  d'utilisation propre aux documents décisionnels trouvé. Les procès-verbaux sont des documents
  publics ; on les reprend sans usage commercial, avec la source et le lien — c'est le point 1 du
  courriel au greffe.
- L'API GraphQL est publique mais **non documentée** : son jeton peut changer à chaque
  déploiement (on le relit chaque fois) et son schéma aussi. C'est le point 2 du courriel.

### Les pages « membres »

- **Conseil de la Ville** : 16 membres — le maire (Steven Blaney) et 15 conseillers, un par
  district — sur la page « Membres du conseil municipal » (nom, district, fonctions, courriel,
  photo). Le **parti** et l'**arrondissement** n'y sont pas : ils viennent des tableaux de la page
  « Élections » (résultats du 2 novembre 2025 et carte électorale). Composition : Prospérité
  Lévis — Équipe Steven Blaney 10, Repensons Lévis — Équipe Serge Bonin 4, Lévis Force 10 —
  Équipe Isabelle Demers 2 (parti d'élection ; un changement d'allégeance depuis n'y serait pas).
- **Comité exécutif** : ses membres sont les élus dont les fonctions publiées disent « comité
  exécutif » (6).
- **Conseils d'arrondissement** : pas de page de composition ; elle est lue dans les listes
  « SONT PRÉSENTS / SONT EXCUSÉS » des procès-verbaux (`data/presences.json`).
- **Districts** : GeoJSON sur Données Québec (CC-BY 4.0), 15 districts numérotés 1 à 15 — mais
  **mis à jour pour la dernière fois le 21 juillet 2022** (il porte encore les conseillers de
  2021). La Ville a adopté depuis le Règlement RV-2024-34-65 et annoncé des « ajustements mineurs
  à la cartographie de certains districts ». Noms et numéros concordent avec 2025 ; la carte est
  affichée comme **indicative**, et c'est écrit sous la carte. La carte interactive de levis.ca
  (`/fr/carte-interactive?category=districts`) a peut-être les contours à jour : pas trouvé
  comment elle les charge, piste à reprendre.

### Conclusion

**Faisable, et plus propre que Montréal** : découverte des documents par une seule requête,
objets exacts grâce à la graisse, sommaires reliés par hyperlien, votes nommés en noms complets.
Deux fragilités : l'API non documentée, et la carte des districts datée.

| | Québec | Montréal | Lévis |
|---|---|---|---|
| Texte des documents | index de la Ville | PDF (pdf.js) | PDF (pdf.js, avec graisse) |
| Découverte | requêtes à l'index | calendrier + URL prévisibles | API GraphQL du site, URL lues |
| Sommaire décisionnel | lien dans la résolution | ordre du jour « LPP » | hyperlien dans le procès-verbal |
| Élus | page HTML | CSV ouvert | page HTML + page Élections |
| Votes | « Ont voté en faveur » | « Votent en faveur », noms de famille | « votent en faveur / en défaveur », noms complets, pas de décompte |
| Garde-fou des votes | décompte imprimé | décompte imprimé | présences + déclaration du président |

## Ce que le volet contient

| Fichier | Contenu | Écrit par |
|---|---|---|
| `data/seances.json` | les séances de l'année, avec liens PV/ODJ (non servi) | `scrapers/seances.js` |
| `data/decisions.json` | résolutions + un document « Procès-verbal » par séance | `scrapers/decisions.js` |
| `data/presences.json` | présents, excusés, président, par séance | `scrapers/decisions.js` |
| `data/votes.json` | votes nominaux | `scrapers/votes.js` |
| `data/resumes.json` | résumés des sommaires, par identifiant de sommaire | `scrapers/resumes.js` |
| `data/elus.json`, `data/districts.json` | conseil et carte | `scrapers/elus.js`, `scrapers/districts.js` |
| `data/lexique.json` | 29 termes mesurés sur les PV | `scrapers/lexique.js` |
| `data/robots.json` | robots.txt des sites lus | `scrapers/robots.js` |
| `data/textes/` | cache du texte des PDF (hors dépôt, cache GitHub Actions) | `decisions.js`, `resumes.js` |

Le contrat de données est celui du guide (section 5), avec ces écarts : `type` est la nature du
point lue dans l'objet (Résolution, Procédure, Dépôt, Avis de motion, Règlement, Projet de
règlement, Procès-verbal) ; `dossier` = `sommaireId` = l'identifiant du sommaire
(`FIN-2026-035`), clé de suivi des abonnés ; `sommaires[]` quand une résolution en cite
plusieurs ; `unite` est vide dans les décisions et renseignée dans les résumés (la direction
écrite sur le sommaire). Pas d'`agglomeration.json` ni de `cucq.json` : `presences.json` les
remplace pour les conseils d'arrondissement.

## Les résumés

`scrapers/resumes.js` (repris de Montréal) : sommaire téléchargé une fois et mis en cache,
`claude-opus-5`, sortie par outil en schéma strict, plafond de 120 par jour en routine.
Échantillon de 50 le 14 septembre 2026 : 1,82 $ US, 0 échec, relu (fidèle, sans jugement,
montants recopiés). Le reste de l'année (~445 sommaires) passé en Batches le même jour.

Liens vers les sommaires : trois formes coexistent dans les PV (`lib/pv.js`, `urlSommaire`).
`…/pc/SD/2026/…` sur le stockage actuel ; `www.ville.levis.qc.ca/fileadmin/documents/fpd/…`
(ancien site, répond encore) ; `www.ville.levis.qc.ca/fileadmin/documents/SD/…` (ancien site,
**403** — le même fichier est sur le stockage actuel sous `/pc/SD/`, on réécrit l'adresse).
Trois liens pointaient vers le **SharePoint interne** de la Ville : écartés, la résolution garde
l'identifiant sans lien.

## Pièges rencontrés

- **La page des archives ment par omission** : quatre séances par année dans le HTML, le reste
  par l'API. Le `_payload.json` de Nuxt n'en contient que cinq.
- **L'adoption de l'ordre du jour cite les points retirés**, avec leur « Document d'aide à la
  décision » : le premier lancement a rattaché le sommaire DEV-2026-035 à « Adoption de l'ordre du
  jour ». Le sommaire d'une résolution est la ligne qui suit **immédiatement** son objet.
- **Un objet peut faire 10 lignes** (modification d'une résolution qui cite une autre résolution
  au long) : le plafond de 8 lignes coupait l'objet et faisait perdre le sommaire.
- **Exposants** : le « e » de « 64e » et le « er » de « 1er » sortent sur leur propre ligne.
- **En-têtes de page variables** : « Séance du conseil de la Ville de Lévis du… », « Séance du
  conseil de la Ville du… », folio seul en arrondissement, « - 3 - ».
- **« sous la présidence du président du conseil Jean Leblond »** : sans article devant, le rôle
  n'était pas retiré et le président disparaissait des présences — et tous ses votes sortaient
  en avertissement.
- **`dateModified` des PDF ≠ date de publication** : la migration du site a réécrit les fichiers
  (délais apparents de 3 à 168 jours). Ne rien afficher qui en dépende.
- **Fichiers copiés de Montréal** : quelques remplacements scriptés en PowerShell n'ont pas pris
  (fins de ligne) — vérifier chaque remplacement, le guide le dit (section 12).

## Où ce dossier vit

> **21 sept. 2026 : verrous levés.** Martin a ouvert les cinq volets aux moteurs de recherche,
> avant la réponse de la Ville. Plus de `noindex` ni d'en-tête `X-Robots-Tag` sur `/levis/`, plus
> de `rel="nofollow"` vers le volet ; ses six pages sont dans `sitemap.xml`, que
> `scripts/build-section-pages.js` écrit lui-même (liste `VILLES`). Pour reverrouiller, remettre la
> balise et l'en-tête : le build sort alors la page du sitemap, avec un avertissement, sans bloquer
> la publication quotidienne. Le passage qui suit décrit l'état d'avant.

Sous-dossier de dossierquebec.ca, même dépôt, même Vercel, même analytics. Verrous en place
jusqu'à la réponse de la Ville : `noindex` sur chaque page, `X-Robots-Tag` sur `/levis/` dans
`vercel.json`, absent du sitemap, pas de lien depuis l'accueil de DQ (le menu « Ville : … » des
volets le montre). Workflow : `.github/workflows/refresh-villedelevis.yml`, 09:30 UTC, même
groupe de concurrence que les autres.

## L'espace abonnés

Branché le 14 septembre 2026 (guide, section 9). Les fiches portent `data-dossier` (l'identifiant
du sommaire, sinon le numéro de résolution), `data-montant`, `data-statut`, `data-etape` et
`data-projets` ; Lévis est dans les quatre listes `VILLES`.

**Les projets suivables** (`lib/projets.js`, relus avec `node scripts/verifier-projets.js`) :

| Projet | Décisions 2026 | Ce qui a été écarté |
|---|---|---|
| Stations d'épuration de Saint-Nicolas et de Desjardins | 17 | postes de pompage ; emprunts RV3580/RV3581 (objet général « traitement des eaux et aqueduc ») |
| Logement social et abordable | 14 | — |
| Lévis 2030 — Finale des Jeux du Québec | 2 | — |
| Projet Guillaume-Couture | 2 | 44 PIIA et enseignes qui ont seulement une adresse sur le boulevard |

**Où en est un dossier.** Le sommaire de Lévis ne donne pas d'instance décisionnelle ni de date
cible lisibles d'un coup : `statutsDesDossiers` (`scrapers/decisions.js`) déduit l'état des
résolutions. Décision finale quand le conseil de la Ville a tranché (hors avis de motion et
projet de règlement) ; en attente quand le comité exécutif « recommande au conseil de la Ville »
ou qu'un règlement n'en est qu'à ses étapes préliminaires ; sinon, décidé par le comité exécutif.
2026 : 470 dossiers terminés, 34 en attente. `echeance` reste vide : pas de date cible.

**Les fichiers de Mes dossiers** : `scripts/projets-publics.js` (copié de Québec, adapté : un
dossier = un sommaire et ses résolutions, présenté par sa résolution la plus récente, `numeros[]`
avec l'identifiant du sommaire) et `scripts/travail-public.js`, appelés par `refresh.js`.
La recherche du volet trouve aussi l'identifiant du sommaire (`decisions.html?q=FIN-2026-035`).

**Résumés abîmés.** 13 des 492 résumés du lot Batches portaient des débris d'échappement
illisibles (« L\tévis », « r\nde9glement ») : retirés et régénérés (0,38 $). `resumes.js` refuse
maintenant un résumé de ce genre, compté comme échec et redemandé à l'exécution suivante.

**« Où en est le projet »** (`scrapers/recaps-projets.js`, copié de Québec). Il dépendait du module
du détail de l'argent pour quatre outils (`appeler`, `compacter`, `nombresDe`, `decoder`) : ils
sont dans `lib/ia.js`. Même garantie qu'à Québec, sans relecture humaine : chaque numéro cité
appartient au projet, chaque nombre existe dans les dossiers cités, puis une contre-lecture retire
ce qui est faux. Au moins trois dossiers par projet : les stations d'épuration (7) et le logement
(9) ont un récapitulatif ; Lévis 2030 et Guillaume-Couture (1 dossier chacun) s'en passent. Premier
passage : 0,63 $ en tout. Refait seulement quand un dossier du projet change.

**Ce que la contre-lecture a attrapé.** Le premier récapitulatif du logement disait que la
contribution au projet de la rue des Fines-Herbes « restait à trancher au conseil ». Cause : la
décision du conseil (CV3384) manquait — son numéro était annoté « CV3384 modifiée par CV3432 » et le
lecteur n'attendait qu'un numéro seul sur sa ligne. Cinq résolutions de 2026 étaient perdues ainsi,
sans erreur ; `NUMERO_RESOLUTION` accepte maintenant l'annotation (« modifié(e) par »,
« abrogé(e) par »…) et la fiche l'affiche.

## Ce qui n'est pas encore là

- **Détail de l'argent** (section 9, point 4).
- **Vérification avec un compte abonné** : suivre un projet de Lévis dans Mes dossiers, ouvrir son
  récapitulatif, recevoir un courriel d'essai des alertes.
- **Courriel au greffe** : modèle dans `courriel-greffe.md`, à envoyer par Martin.
- **Contours à jour des districts** (voir plus haut).
- **Années antérieures** : l'API rend 2001-2025 ; seule 2026 est lue.
