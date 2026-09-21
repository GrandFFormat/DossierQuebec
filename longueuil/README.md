# DossierVilleDeLongueuil

Volet municipal de DossierQuébec pour la Ville de Longueuil, servi sous
`https://dossierquebec.ca/longueuil/`. Même esprit que les volets Québec, Montréal et Lévis : les
décisions de la Ville, lisibles, chacune reliée à son document officiel ; les votes nominatifs tels
que consignés ; aucune donnée inventée, aucun verdict sur une personne.

Construit le 14 septembre 2026 en suivant `quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`, à partir du
volet Montréal (Longueuil publie, comme Montréal, des procès-verbaux en PDF). **En français
seulement** (guide, section 10).

## Démarrage

```
cd longueuil
npm install
npm run refresh            # la routine complète (résumés sautés sans clé API)
npm run serve              # puis http://localhost:8080/ — ou le serveur de la racine du dépôt
```

Utiles pendant la mise au point :

```
node scrapers/decisions.js --fichier=chemin/CO-260616-PV.pdf    # découpage d'un PV, sans réseau
node scrapers/votes.js --fichier=chemin/CO-250121-PV.pdf        # les votes d'un PV
node scrapers/sommaires.js --seance=CO-260707                   # relit un document de séance
node --env-file=../api.env scrapers/resumes.js --dry-run        # estime le coût des résumés
```

## Étape 1 — L'étude de faisabilité (14 septembre 2026)

Ce qui suit a été **vérifié** sur les documents et les pages de la Ville, pas supposé.

### Le gisement

Chaque instance a sa page sur `longueuil.quebec` (un site Nuxt adossé à un Drupal,
`cms.longueuil.quebec`), avec **un tableau de toutes ses séances depuis 2021** : date, ordre du jour
(OJ), procès-verbal (PV) et « Global ». Le tableau est dans le HTML servi (la charge utile Nuxt, où
« / » s'écrit `\u002F`) : une requête par instance donne toute l'année. Les noms de fichiers varient
(`CO-230516-PV_0.pdf`, `VL-260708-PV_modifie.pdf`, `CO-260818-OJ_projet_MAJ2_Noir.pdf`) mais **le texte
du lien reste au gabarit** (`CO-260707-PV`) : `lib/lgl.js` lit les liens par leur texte.

| Instance | Séances 2026 avec PV (au 14 sept.) | « Global » | Couvert |
|---|---|---|---|
| Conseil de ville (CO) | 8 | oui | ✔ |
| Conseil d'agglomération (CA) | 8 | oui | ✔ |
| Comité exécutif (CE) | 21 | non | plus tard |
| Comité exécutif d'agglomération (CEA) | 18 | non | plus tard |
| Arrondissement du Vieux-Longueuil (VL) | 7 | oui | plus tard |
| Arrondissement de Saint-Hubert (SH) | 7 | oui | plus tard |
| Arrondissement de Greenfield Park (GP) | 14 | non | plus tard |

Le PV paraît environ un mois après la séance, une fois adopté. Celui du conseil du 18 août 2026 n'est
pas encore en ligne ; son document de séance, oui.

### Ce que les procès-verbaux contiennent

Du **vrai texte**, sans glyphes dégradés. Chaque résolution s'ouvre par son numéro seul sur sa ligne
(`CO-260616-4.3` : instance, date, chapitre et point), puis son titre en capitales, qui se termine par
le **numéro du sommaire décisionnel** (`(SD-2026-1367)`). Les résolutions sont rangées dans des
**chapitres fixes** (1. Ouverture, 2. Administration et organisation, … 10. Aménagement du territoire
et urbanisme, 11. Affaires diverses, 12. Orientations pour le conseil d'agglomération, 13. Clôture) :
c'est le second recours des pastilles de sujet.

**Les votes.** Quand un membre « demande le vote », le PV nomme chacun en toutes lettres :
« Votent contre cette proposition : Jacques Lemire et Karl Ferraro. » puis « En faveur : 14 Contre : 2 ».
Au conseil d'agglomération, où les voix sont pondérées, les noms sont là mais **pas le décompte**
(« ADOPTÉE À LA MAJORITÉ DES 2/3 DES VOIX »). Une opposition sans vote : « Jean Martel exprime sa
dissidence. »

Mesuré sur les PV du conseil de ville et de l'agglomération :

| | Résolutions | Votes nominaux | Dissidences seules |
|---|---|---|---|
| 2025 | 1 533 | 22 (tous recoupés avec le décompte imprimé, aucun avertissement) | 5 |
| 2026 (janv.-juill.) | 870 | **0** | 0 |

**Depuis l'élection de novembre 2025, tout a été adopté à l'unanimité.** Une page Votes limitée à
2026 serait vide : le registre couvre l'année en cours et la précédente, et la page le dit.

### Les sommaires décisionnels : dans le « Global »

Les ordres du jour citent les numéros SD sans lien. Mais la troisième colonne du tableau des séances,
« Global », est un **lien de partage SharePoint** (`longueuilqc.sharepoint.com`, site
« Documentsdeseance ») vers le document de séance complet : l'ordre du jour, puis, point par point,
l'extrait de résolution, le **sommaire décisionnel** et ses annexes. De 14 à 1 425 pages, jusqu'à 155 Mo.
Chaque sommaire s'y reconnaît à son en-tête (numéro SD en haut, « Sommaire décisionnel », « Page 1 de N »
en bas) et donne : titre, direction, projet du PTI, « Coûts et revenus », recommandation, contexte,
justification, décisions antérieures, aspects financiers et juridiques.

Sur les 16 documents de séance de 2026 lus : **556 sommaires** extraits, 17 sommaires cités par un PV
mais absents du document. C'est la même matière que les sommaires de Québec : **les résumés sont
possibles**, contrairement à Montréal.

### Les conditions

- `robots.txt` de `longueuil.quebec` et de `cms.longueuil.quebec` : rien d'interdit hors `/admin/`,
  `/search/`, `/user/…` ; aucun Crawl-delay.
- [Avis juridique](https://longueuil.quebec/fr/avis-juridique) : les documents sont la propriété de la
  Ville ; « à des fins de commercialisation », reproduire, stocker, télécharger ou communiquer le
  contenu demande son **autorisation préalable**. Comme DossierQuébec a un abonnement payant (les
  décisions restant gratuites), le courriel le dit franchement et demande l'autorisation
  (`courriel-greffe.md`).
- Aucune adresse courriel publiée pour le greffe : le courriel va à `accesinformation@longueuil.quebec`
  (Me Audrey Paquet, responsable de l'accès aux documents, page « Demande d'accès à l'information »),
  pour transmission à la greffière.

### Les pages « membres »

- **Élus** : la page officielle (`/fr/services/elus`) — mairesse, 18 districts répartis dans trois
  arrondissements, deux conseillers d'arrondissement à Greenfield Park, photo, parti, lien vers la
  fiche. Au 14 septembre 2026 : 17 sièges de district occupés, tous Coalition Longueuil, et
  **Parc-Michel-Chartrand vacant** (élection partielle annoncée au conseil du 18 août).
- **Districts** : ⚠ le jeu « Districts électoraux » de Données Québec (CC-BY 4.0) a encore **15
  districts et les élus d'avant 2021**. Le découpage 2025-2029 (18 districts numérotés, avec l'origine
  de chaque nom) est dans la couche ArcGIS publique de la Ville (`Elections2025_Districts`), celle de
  sa carte en ligne ; aucune licence n'y est affichée, la source est citée.
- **Conseil d'agglomération** : pas de liste publiée. Reconstitué depuis les listes de présences des PV
  (mairesse et élus de Longueuil désignés, maires de Boucherville, Brossard, Saint-Bruno-de-Montarville
  et Saint-Lambert, remplacements consignés).

### Conclusion

Faisable, et dans de bonnes conditions : texte propre, gabarit stable, sommaires publics, votes
nominatifs recoupables. Deux particularités à assumer : aucun vote divisé en 2026, et des sommaires
enfouis dans de très gros documents. On commence par le conseil de ville et l'agglomération.

## Ce que le volet contient

| Fichier | Écrit par | Contenu |
|---|---|---|
| `data/seances.json` | `scrapers/seances.js` | les séances des instances actives, avec les liens OJ, PV et Global (non servi) |
| `data/decisions.json` | `scrapers/decisions.js` | résolutions de l'année, PV et documents de séance ; objet pris à l'ordre du jour (casse normale), vérifié par le numéro SD |
| `data/votes.json` | `scrapers/votes.js` | votes nominatifs de l'année et de la précédente, avec le passage brut |
| `data/sommaires.json` | `scrapers/sommaires.js` | index des sommaires : séance, page dans le document, titre, direction, PTI, coûts et revenus |
| `data/resumes.json` | `scrapers/resumes.js` | résumés en langage clair, indexés par numéro SD |
| `data/elus.json`, `data/districts.json` | `scrapers/elus.js`, `scrapers/districts.js` | le conseil de ville et la carte |
| `data/agglomeration.json` | `scrapers/agglomeration.js` | composition et présences au conseil d'agglomération |
| `data/lexique.json` | `scrapers/lexique.js` | 32 termes, mesurés sur les PV de 2025 et 2026 |
| `data/textes/` | les scrapers | texte extrait des PDF (cache, hors dépôt) |

Premier lancement, 14 septembre 2026 : 16 séances de 2026, **870 résolutions** (901 fiches avec les PV
et documents de séance), 0 sans pastille de sujet ; 22 votes nominatifs (2025) ; 18 districts ; 10
membres de l'agglomération.

Les pages : `index.html`, `decisions.html`, `votes.html`, `conseil.html` (carte, élus, agglomération —
pas de section comité exécutif : aucune donnée pour l'instant), `lexique.html`, `sources.html`.
`assets/app.js` vient de Montréal, adapté : lien vers le sommaire dans le document de séance (avec la
page), résolutions modifiées plus tard, votes sur deux années et étiquette du vote (proposition
technique, principale), poste vacant, carte colorée par arrondissement (pas par parti : un seul parti).

## Les résumés

Même consigne et mêmes garde-fous qu'ailleurs (`claude-opus-5`, outil en schéma strict, rien
d'inventé, aucun jugement, montants recopiés). La matière vient de `data/textes/sommaire_SD-….json`,
extraite par `sommaires.js` ; `resumes.js` ne télécharge rien. Le résumé est indexé par numéro SD : un
dossier passé par le conseil de ville (orientation) puis par l'agglomération (décision) a un seul
résumé, affiché sur les deux fiches.

Premier lot, 14 septembre 2026 : échantillon de 8 en synchrone (0,17 $), relu, puis **459 par l'API
Batches (6,08 $ US)** — 467 résumés, 0 échec, 43 marqués « document de procédure », 272 avec un montant.
686 résolutions sur 870 portent un résumé ; les autres n'ont pas de sommaire (ouverture, dépôts sans
SD…) ou un sommaire absent du document de séance. Un résumé est ressorti avec des accents abîmés sous
une forme que le décodeur ne connaissait pas (`s\ru00e9ance`) : retiré et régénéré seul.

En routine : les sommaires des 60 derniers jours, plafond de 120, et au plus 4 documents de séance lus
par exécution.

## Pièges rencontrés

- **SharePoint répond 401 à `fetch`**, alors que le même lien marche dans curl. Le lien de partage
  (`…/:b:/s/Documentsdeseance/…?download=1`) répond par une redirection **et** un cookie d'accès invité
  (`FedAuth`) ; `fetch` ne rejoue pas les cookies d'une redirection à l'autre. `lib/lgl.js` suit la
  redirection à la main, cookie compris.
- **pdf.js s'approprie le tampon qu'on lui donne** : après la lecture, `data.length` vaut 0. Noter la
  taille avant.
- **Le document de séance est énorme**, mais pdf.js le lit page par page en 6 à 25 secondes et 600 Mo
  de mémoire au plus (`parcourirPdf`, sans garder les pages).
- **« Page 1 de N » est en bas de la page**, et un sommaire lié au PTI allonge son en-tête (numéro et
  titre du projet) : la détection regarde les dix premières lignes et les trois dernières. Avec six
  lignes, 14 sommaires sur 66 passaient à côté.
- **Un renvoi « Modifiée par / CO-260818-1.4 »** est écrit en marge, seul sur sa ligne, dans le PV de la
  résolution modifiée : sans restreindre les numéros à la séance lue, il ouvrait une fausse résolution
  datée d'août dans le PV de juillet. Il est maintenant noté (`modifieePar`).
- **« exprime sa dissidence »** : une première regex `expriment?` exigeait « exprimen… » et ne
  trouvait jamais le singulier.
- **Les titres du PV sont en capitales** ; l'ordre du jour écrit les mêmes en casse normale. On prend
  celui de l'ordre du jour, seulement s'il cite le même numéro SD.
- **« climatisation »** faisait passer des contrats de ventilation en Environnement ; **l'apostrophe
  courbe** (« code d’éthique ») faisait rater une règle. Normalisée avant le classement.
- **Listes de présences** coupées en fin de ligne (« Saint-Bruno-de- / Montarville en remplacement de
  … », « …, en remplacement de / Doreen Assaad, mairesse… ») : une ligne qui continue la précédente
  n'ouvre pas une nouvelle personne.
- **Le lexique mesuré sur 2026 seulement** mettait les termes du vote à zéro : mesuré sur deux ans,
  comme la page des votes.

## Où ce volet vit

> **21 sept. 2026 : verrous levés.** Martin a ouvert les cinq volets aux moteurs de recherche,
> avant la réponse de la Ville. Plus de `noindex` ni d'en-tête `X-Robots-Tag` sur `/longueuil/`, plus
> de `rel="nofollow"` vers le volet ; ses six pages sont dans `sitemap.xml`, que
> `scripts/build-section-pages.js` écrit lui-même (liste `VILLES`). Pour reverrouiller, remettre la
> balise et l'en-tête : le build sort alors la page du sitemap, avec un avertissement, sans bloquer
> la publication quotidienne. Le passage qui suit décrit l'état d'avant.

Sous-dossier du dépôt de DossierQuébec, servi par Vercel sous `/longueuil/` (redirection de
`/longueuil` dans `vercel.json`). Verrous en attendant la réponse de la Ville : `noindex` sur chaque
page, `X-Robots-Tag` dans `vercel.json`, mention dans `robots.txt` (sans `Disallow`). Longueuil est dans
les listes de villes communes (`commun/navigation.js`, `api/detail.js`, `api/message.js`,
`api/alertes-projets.js`). Workflow : `.github/workflows/refresh-villedelongueuil.yml`, chaque jour à
10 h UTC, même groupe de concurrence que les autres volets ; `.vercelignore` garde l'outillage hors du
site servi.

## Ce qui n'est pas encore là

- **Le courriel à la Ville** (`courriel-greffe.md`) : à envoyer à accesinformation@longueuil.quebec (Me Audrey Paquet, pour transmission à la greffière), relance à 20 jours ouvrables. Les
  verrous `noindex` ont été levés le 21 sept. 2026, avant la réponse (décision de Martin).
- **Le comité exécutif, le comité exécutif d'agglomération et les trois arrondissements** : même
  gabarit de PV ; il suffit de passer `actif: true` dans `lib/lgl.js` et de vérifier le découpage. Seuls
  Vieux-Longueuil et Saint-Hubert ont un document de séance, donc des sommaires.
- **Les séances dont le PV n'est pas encore publié** (18 et 20 août 2026) ont déjà leurs sommaires dans
  le document de séance : un agenda « à venir » pourrait les montrer avant le PV, comme les attendues
  de Québec.
- **L'espace abonnés** (guide, section 9) : les pages portent `data-ville="longueuil"` et chaque fiche
  sa boîte `ab-fiche` (clé = numéro SD, `data-montant` quand le résumé a trouvé un montant), mais les
  fichiers de Mes dossiers (`data/projets/`, `recentes.json`, `dossiers.json`, `attendues.json`,
  `organismes.json`, `travail.json`) et le détail de l'argent restent à écrire — comme pour Montréal et
  Lévis.
- **Vérifier le premier run planifié** du workflow le lendemain (cache de textes vide : il retélécharge
  les PV des deux années une fois).
