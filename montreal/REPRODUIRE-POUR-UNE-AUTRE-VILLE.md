# Reproduire un volet de ville pour une autre ville

> **Version de référence depuis le 24 sept. 2026 :** ce guide vit dans un document Claude,
> <https://claude.ai/code/artifact/3e9746c3-3c92-4271-9bc4-363866a35d3f>. Ce fichier n'est qu'une copie ;
> en cas d'écart, le document fait foi.

Ce document est fait pour être **collé tel quel au début d'une nouvelle session**, avec une
seule phrase en plus : « La ville, c'est ___. » Il dit ce qu'on a construit, ce qui se réutilise
sans y toucher, ce qui doit être réécrit pour une autre source, comment brancher la ville sur la
couche commune, dans quel ordre travailler, et les pièges déjà rencontrés.

**Le modèle à copier est Montréal** (`montreal/`), le volet le plus complet : huit pages, contrats
SEAO, budget et taxes, « Près de chez moi », courriels de ville, version anglaise. Depuis le 20 nov.
2026, Montréal, Québec, Lévis et Longueuil roulent sur un **seul code commun** (section 0). Le code
est public : `github.com/GrandFFormat/DossierQuebec`. Le README de chaque volet est son journal détaillé.

## 0. L'architecture commune (20 nov. 2026)

Toutes les villes ont la même architecture. Seuls changent la configuration, les données, le robot
de lecture et, au besoin, la palette.

- `commun/ville/moteur.js` : tout le code des pages de ville, générique. Il lit `globalThis.VILLE`.
- `commun/ville/style.css` : la feuille de style commune.
- `<ville>/assets/app.js` : 4 lignes, à ne pas modifier (`import './ville.js'` puis
  `export * from '/commun/ville/moteur.js'`). Les pages HTML gardent leur balise `assets/app.js`.
- `<ville>/assets/ville.js` : la configuration de la ville, et rien d'autre. Liste complète des clés
  en tête de `montreal/assets/ville.js`.
- `<ville>/assets/libelles-en.js` : le vocabulaire anglais des instances de la ville.
- `<ville>/assets/ville.css` : seulement ce qui diffère de la feuille commune. Souvent absent.

**Ce que contient `ville.js`**

- Base : `nom`, `pages` (`decisions`, `conseil`, `contrats` ; `contrats: null` = pas de page Contrats),
  `libelles`, `regexMaire`, `libelleMembres`.
- Adaptateurs de données : `cleDossier`, `typesDocuments`, `horsDecisions`, `sansInstance`,
  `instanceConseil`, `comparerNoms`, `uniteBrute`, `ordreArrondissements`, `totalAvec`,
  `paletteArrondissements`, `archivesSeances`.
- Jeux de données déclarés (sans déclaration, le fichier n'est pas demandé) : `agglomeration`, `cucq`,
  `presences`, `archives`, `textes`.
- Drapeaux de fonctions, à activer seulement si la ville a la donnée.
- Crochets, en dernier recours : `porteeDe`, `titreArrondissement`, `rangComiteExecutif`.

Certaines fonctions s'allument seules quand la donnée existe : « Ce que le conseil décide », « Demande
refusée », avis « Extraction en panne », postes vacants, comité exécutif, « Vote sur… ».

**Les règles**

- Une amélioration se fait dans le moteur, jamais dans une seule ville.
- Ce qui est propre à une ville passe par `ville.js`, jamais par une copie du moteur.
- Le tableau des votes contre est en ordre alphabétique partout, sans « En tête » ni palmarès.
- Après un changement du moteur : `node --check`, relancer le prérendu de Québec
  (`node scripts/prerendre.js` dans `quebec/`) et ouvrir chaque ville.

Laval est sur le moteur depuis le 20 nov. 2026 : ses fonctions propres (séances par identifiant,
fiches tirées de l'ordre du jour, présences du jeu ouvert, carte par parti…) sont des drapeaux du moteur ;
il garde sa feuille de style.

**Pas encore sur le moteur** :
Vancouver, Ottawa et Fredericton (autres dépôts). Pour ces trois-là, le moteur sera copié par un
script de synchro dans chaque dépôt, pas chargé depuis dossierquebec.ca : chaque site doit rouler
seul. Il faut d'abord rendre réglables les liens `/commun/…` et le vocabulaire québécois du moteur.

**Ajouter une ville**

1. Copier `montreal/` sous le nom de la ville, sans `data/`.
2. Renommer les pages HTML selon les slugs de la ville ; garder la balise `assets/app.js`.
3. Laisser `assets/app.js` tel quel.
4. Dans `assets/ville.js`, remplir `nom`, `pages`, `regexMaire` et `porteeDe`.
5. Déclarer seulement les jeux de données qui existent.
6. Choisir adaptateurs et drapeaux dans la liste en tête de `montreal/assets/ville.js`.
7. Ajuster `assets/libelles-en.js` ; un `assets/ville.css` seulement pour ce qui diffère.
8. Brancher les robots de la ville, avec un `node --check` sur `app.js`, `ville.js` et le moteur.
9. Servir le dépôt, ouvrir chaque page en français et avec `?lang=en` : aucune erreur console sauf
   `/_vercel/insights`.
10. Ajouter l'entrée FR+EN dans `data/journal.json`, puis la ville dans la navigation, le sitemap,
    `llms`, l'admin (onglet Villes) et `commun/mesure.js` si elle est sur un autre domaine.

Mis à jour le 15 nov. 2026 d'après Montréal : pages Contrats, Budget, Près de chez moi ; votes
fusionnés dans Décisions ; Mon dossier remplace Mes dossiers ; courriels de ville ; anglais
standard ; un groupe de concurrence par volet ; détail de l'argent arrêté ; commandites ; villes
en pause.

---

## 1. Ce que c'est, et les règles qui ne se discutent pas

Un site citoyen indépendant qui rend lisibles les décisions d'une ville : ce qui a été décidé, par
quelle instance, quand, avec un lien vers le document officiel, un résumé en langage clair, et
— quand la ville les consigne — les votes nominatifs de chaque élu. Gratuit pour le public,
aucune revente de données. Un volet peut être **offert par un commanditaire** (section 9.6) : la
commandite paie le volet, elle ne touche jamais au contenu.

Trois règles, héritées de DossierQuébec, qui priment sur tout le reste :

1. **Aucune donnée inventée.** Tout ce qui est affiché vient d'un document de la ville, et la
   fiche mène à ce document. Ce qu'on ne sait pas, on ne l'affiche pas ; ce qu'on n'est pas sûr
   d'avoir bien lu, on le signale (`avertissements`, `texteSourceDegrade`).
2. **Aucun verdict sur une vraie personne.** Présences, votes, fonctions : des faits consignés,
   montrés bruts. Pas de palmarès. Les résumés IA ont l'interdiction explicite de juger.
3. **La ville d'abord.** On s'identifie, on attend entre deux requêtes, on lit le minimum, on
   écrit au greffe. La page Sources décrit la licence **réelle** de chaque source (ne pas
   recopier « sans usage commercial » si la source est sous CC BY).

Le site dit sur chaque page qu'il n'est pas celui de la ville et n'a aucun caractère officiel.

## 2. Ce qui existe, et ce qui se réutilise sans y toucher

Huit pages HTML statiques par volet, un style et une logique partagés, des données JSON lues à
l'exécution. Pas de framework. Dépendances : le SDK Anthropic, et `pdfjs-dist` (`lib/pdf.js`)
quand la ville publie ses procès-verbaux en PDF (lancer avec `--max-old-space-size=4096`).

| Page (Montréal) | Contenu |
|---|---|
| `index.html` | ce qui a changé depuis la dernière extraction |
| `decisions-de-la-ville-de-montreal.html` | toutes les décisions de l'année par séance ; « En bref » de la séance en tête ; **les votes nominatifs dans la carte de chaque décision** (décompte, barre) ; case « Avec résumé seulement », repli « Sans résumé » |
| `conseil-municipal-de-montreal.html` | carte des districts, membres, instances sans page « membres » |
| `contrats-de-la-ville-de-montreal.html` | contrats SEAO : soumissionnaires, écart au gagnant, modifications, gré à gré, menu A à Z |
| `budget-et-taxes-de-montreal.html` | rapport financier MAMH, taux de taxe par arrondissement |
| `pres-de-chez-moi-a-montreal.html` | une adresse → district, élu, travaux et permis autour (rien n'est envoyé au serveur) |
| `lexique-municipal-de-montreal.html` | vocabulaire décisionnel chiffré sur le corpus |
| `sources-des-donnees-de-montreal.html` | provenance, licences, limites, journal de la ville |

La page « Votes nominatifs » séparée n'existe plus (fusionnée dans Décisions le 12 nov. 2026 :
`scripts/votes-decisions.js` → `data/votes-decisions.json`).

> ⚠️ Ceci vaut pour un **volet de ville** dans le dépôt de DQ. Pour un **site séparé**
> (DossierOntario, DossierCanada…), lire `CHARTE-DOSSIER.md` à la racine.

**À garder tel quel** : `assets/app.js`, `assets/style.css`, `scrapers/resumes.js`,
`recaps-projets.js`, `archive.js`, `traductions.js`, `lexique-en.js`, `projets-en.js`,
`scripts/refresh.js`, `projets-publics.js`, `infolettre.js`, `infolettres-auto.js`,
`retirer-numero.js`, `static-server.js`, le workflow, `.vercelignore`, les tests (`npm test`).

**La couche commune, une fois pour toutes les villes — on s'y branche, on ne la recopie pas :**

| Pièce | Rôle |
|---|---|
| `mon-dossier.html` (`/mon-dossier?ville=<cle>#villes`) | projets suivis, mots-clés, organismes, courriels ; remplace `mes-dossiers.html` |
| `commun/navigation.js`, `entete-volet.js`, `abonnes.js`, `langue.js` | menu des villes, marque, langue |
| `commun/infolettre.js` + `courriels.css` | bloc « Les courriels », une ligne par ville |
| `commun/seances-en-bref.js` + `scripts/resumes-seances.js <ville>` | la phrase « En bref » de chaque séance (Haiku) |
| `commun/imprimer-seance.js` | impression d'une séance |
| `commun/mesure.js`, `commun/consentement.js` | mesure maison (`data-mesure`, lue dans `/admin`), bannière de consentement + GA |
| `commun/apres-vente.js` | bloc de commandite (« Offert par », « Votre publicité ici ») |
| `scripts/prerendu-villes.js <ville>` | 30 décisions récentes pré-rendues dans la page pour Google |
| `scripts/og-villes.js` | image de partage `<ville>/og-<ville>.png` 1200×630 |
| `scripts/journal-villes.js` | journal de la ville sur sa page Sources (`<!--JOURNAL-VILLE-->`), tiré de `data/journal.json` (`volet: "<cle>"`) |
| `scripts/build-section-pages.js`, `build-llms.js`, `gabarit.html` | sitemap généré (jamais à la main), llms.txt, gabarit |
| `api/_infolettre.js`, `api/_projets-suivis.js`, `api/_enchere.js`, `api/represente.js`, `api/message.js` | courriels, projets suivis, enchère de bannière, Représentez votre ville, messages |

**À adapter** : `lib/themes.js`, `lib/lexique.js`, `lib/projets.js` (projets suivables, travail
éditorial), `lib/noms.js` (clés de jointure des noms), les textes des pages, `courriel-greffe.md`.

**À réécrire** : le client de la source (`lib/gpd.js` à Québec, `lib/mtl.js` + `lib/pv.js` à
Montréal) et les scrapers qui lisent la ville : `seances.js`, `decisions.js`, `votes.js`,
`elus.js`, `districts.js`, `agglomeration.js`. Les scrapers de données ouvertes provinciales
(`contrats.js` SEAO, `finances.js` MAMH) se réutilisent en changeant le filtre de la ville.

## 3. Étape 1 — Étude de faisabilité, avant d'écrire une ligne

Elle peut conclure « non ».

1. **Trouver le gisement.** Portail de documents décisionnels, données ouvertes, PDF par séance
   ou HTML. Ouvrir les outils de développement : souvent une API est derrière.
2. **Mesurer.** Documents par an, par type, par instance ; texte extrait ou PDF à parser ;
   **délai de publication** des procès-verbaux (Montréal : plusieurs semaines après la séance).
3. **Lire les conditions.** `robots.txt`, licence, conditions de l'API, mot pour mot.
4. **Échantillonner le texte.** Dix documents : qualité d'extraction, lien résolution ↔ sommaire,
   formule des votes.
5. **Chercher les appels nominaux** (« Ont voté en faveur », « Pour : … Contre : … »). Mesurer
   aussi l'année précédente.
6. **Repérer les pages « membres »**, le GeoJSON des districts et les instances sans page.
7. **Pour une ville à arrondissements**, prévoir le calendrier des conseils d'arrondissement :
   souvent une découverte par essai d'URL, longue (Montréal : `scrapers/decouverte-*.js`,
   `seances-arrondissements.js`, `sonde-*.js`, workflows `decouverte-*.yml`,
   `diagnostic-arrondissements.yml`).
8. **Recenser les données ouvertes utiles** (Données Québec, portail de la ville, CC BY 4.0) :
   SEAO (OCDS) pour les contrats, rapport financier MAMH, taux de taxe, entraves et travaux,
   permis de construction, adresses ponctuelles, quartiers.
9. **Conclure** avec des chiffres. Puis seulement, décider.

## 4. Étape 2 — L'entente avec la ville

- **Le robot s'identifie** : User-Agent `DossierVille/0.1 (veille citoyenne; <contact>)`, contact
  dans une variable GitHub (`MTL_CONTACT` à Montréal), 0,6 s minimum entre deux requêtes.
- **Le courriel au greffe** : modèle `courriel-greffe.md`. Programmer la relance (20 jours ouvrables).
- **Verrous** : `noindex` + `X-Robots-Tag` tant qu'on attend, **sans `Disallow`**. Montréal les a
  levés le 21 sept. 2026 sans attendre la réponse ; c'est une décision de Martin, ville par ville.
- **Checklist de mise en ligne** : copier `montreal/CHECKLIST-PUBLICATION.md` (7 jours de
  rafraîchissement verts, image de partage, sitemap).

## 5. Étape 3 — Le contrat de données (ce que le site attend)

Si les nouveaux scrapers produisent ces formes, le site marche sans modification. Champs de
racine communs : `generatedAt`, `source`, `parametres`. Formats exacts : README de Montréal.

**Le cœur** (décrit en détail au README de Québec) :
- `seances.json` — `id` (`CM_2026-01-26_13h00`), `instance`, `nom`, `parInstance` ;
  `seances-arrondissements.json` s'il y a des arrondissements.
- `decisions.json` — `id`, `numero`, `objet`, `date`, `annee`, `type`, `instance`, `unite`, `pdf`,
  `sommaireId`, `nouveau`, `theme`, `themeSource` ; plus l'encadré de contexte (portée, durée,
  parcours du dossier : `lib/modele.js`) et des montants sans cents.
- `votes.json` et `votes-decisions.json` (les votes rattachés aux décisions, règlement cité).
- `elus.json`, `districts.json`, `agglomeration.json`, `lexique.json`, `archives/index.json`.
- `resumes.json` — les points de procédure **n'ont plus de résumé** : ils vont dans « Sans
  résumé », sont exclus du décompte de l'accueil, et ne portent jamais « nouveau ».
- `resumes-seances.json` (« En bref »), `robots.json` (état des étapes).

**Les ajouts de Montréal** :
- Contrats : `contrats.json`, `contrats-page.json` (`c[]` en tableaux positionnels : date,
  montant, mode, catégorie, fournisseur, objet, ocid… + dictionnaires `modes`, `motifs`,
  `categories`), `contrats-decisions.json`, `contrats-details.json`.
- Budget : `finances.json`, `taux-arrondissements.json`.
- Près de chez moi : `entraves.json`, `permis/index.json` + `permis/<quartier>.json`,
  `adresses/index.json` + `adresses/<lettre>.json` (`{voie: [libellé, [[de, à, district,
  quartier, lat, lon]…]]}` ; `district` = `numeroSource` de `districts.json` ; lat, lon à la fin).
- Projets et Mon dossier : `projets/index.json`, `projets/<cle>.json`, `projets-recaps.json`,
  `dossiers.json`, `recentes.json`, `organismes.json` (section 9.3).
- Anglais : `resumes-en.json` (`traductions`, `nombre`, `nombreObjets`, `nombreCategories`),
  `lexique-en.json`.
- Commandite : `file-commandite.json`.

## 6. Étape 4 — Les scrapers

Vanilla Node (ESM), `fetch`, regex. Un client de source qui centralise throttle, réessais sur
429/5xx, User-Agent, pagination déterministe (**toujours un départage**).

**Décisions, en deux temps** : métadonnées de toute l'année, puis texte intégral des seules
résolutions jamais lues. `nouveau` = inconnu de l'extraction précédente **et** daté de moins de
45 jours avant le plus récent connu. Fenêtre de 60 jours au quotidien, année complète le 1er
(`--complet`, `--fenetre`, `--plafond`).

**Titres** : nettoyer signatures et en-têtes ; un titre ne doit jamais avaler le sommaire qui suit ;
remettre le « er » du 1er à sa place. Tests : `test/pv.test.js`, `textes.test.js`.

**Votes** : formule d'appel nominal, listes recollées, singulier, liste vide légitime, PDF
dégradés marqués. **Garde-fou** : recouper avec le décompte imprimé. Les noms ne correspondent pas
toujours à la liste des élus : `lib/noms.js`.

**Contrats SEAO** (`scrapers/contrats.js`) : lit les JSON mensuels OCDS (70 à 95 Mo), aucune
requête à la ville. Filtre de l'acheteur par regex (Montréal : ~40 noms ; Montréal-Est et
Montréal-Ouest sont d'autres villes). Soumissions dans `r.bids`, repli `r.bids.details`.
Jumelage décision ↔ contrat par numéro d'appel d'offres, de résolution **et de dossier**
(Montréal : 42 → 641 jumelés). « 1 seule soumission » est repris dans les courriels.

**Près de chez moi** : `scrapers/adresses.js` (point dans polygone, tout se fait dans le
navigateur), `scrapers/permis-travaux.js` (permis CO et DE, travaux liés au SEAO), `lib/plateau.js`.

**Filtres, standard aussi (15 nov. 2026)** : dans le cadre, deux boutons seulement. « Filtres ▾ »
déplie Routes, Permis et une pastille par type (couleur de la bulle, nombre dans le rayon) ; tout est
actif au départ, la carte montre tout ; le nombre de types masqués s'affiche en orange sur le bouton.
« 🚧 Impact sur la circulation » ne garde que ce qui ferme une rue ou des voies (élément
`circulation: true`) et fait disparaître les autres boutons ; il n'apparaît que si la source le
distingue (Québec : `all-lanes-closed` / `some-lanes-closed` ; Vancouver : « road closures » ;
Montréal : non, ses entraves ne le disent pas). Une page donne `libelle` et, si elle le sait,
`circulation` à chaque élément.

**Standard de toute ville (15 nov. 2026)** : le cadre « Autour de votre adresse − 1 km + »
(rayons 0,25 / 0,5 / 1 / 2 / 3 / 5 km, 1 km par défaut, mémorisé en localStorage avec une clé
propre à la ville), chantiers et permis de TOUS les quartiers à portée triés du plus proche, la
distance sur chaque ligne, les 25 plus proches ; la carte Leaflet 1.9.4 + tuiles OpenStreetMap
(chargée seulement à la recherche, un point par élément de la couleur de sa bulle) ; la bulle de
genre/statut devient le lien Google Maps avec la maison dedans (32 px au doigt). Tout est dans
`/commun/pres-rayon.js` (`bulle`, `afficherRayon`) : la page prépare ses éléments
`{lat, lon, classe, popup, html(distance)}` et l'appelle. **Condition** : le robot des adresses
ajoute `lat, lon` (5 décimales) À LA FIN de chaque entrée, sans déplacer les champs existants ;
sans position, la page garde l'ancien affichage par quartier. Modèle d'origine :
`dossierBC/vancouver/near-me-in-vancouver.html` ; appliqué à Québec et Montréal.

**Budget** : `scrapers/finances.js` (MAMH, le lundi), `scrapers/taux-taxes.js` (février).

**Élus, districts, instances sans page « membres »** : comme à Québec (README de Québec).

## 7. Étape 5 — Les résumés en langage clair

Sur les sommaires décisionnels, jamais sur les procès-verbaux, et **jamais sur les points de
procédure**. Modèle `claude-opus-5`, sortie par outil en schéma strict, cache dans `resumes.json`,
estimation par `countTokens`, **toujours en `--batch`** (moitié prix : ~20 $ US/mois à Montréal
au lieu de 35), plafond par exécution, rattrapage par `--resumes-complets`. Traductions anglaises
sur Sonnet, « En bref » sur Haiku. La consigne interdit d'ajouter, de juger, de meubler, de
recalculer. Valider le type de chaque champ reçu : une liste de puces arrivée en texte a bloqué
les traductions de Montréal du 3 oct. au 12 nov.

## 8. Étape 6 — Le site

- Servi comme **sous-dossier de dossierquebec.ca** (`/<cle>/`), barre oblique finale obligatoire,
  liens « accueil » vers `./`, redirection dans `vercel.json`.
- En-tête : bouton fleur de lys à droite du logo, dans la couleur du volet ; titre de page
  terminé par « | DossierQuébec » ; fil d'Ariane et un vrai H1 ; le premier paragraphe nomme la
  page et renvoie vers Décisions.
- Dans le `<head>` de chaque page : consentement + GA, `/commun/mesure.js` ; les boutons clés
  portent `data-mesure`. Rien n'est mesuré en local, sauf avec `?mesure=1`.
- Pastilles de sujet : **les sujets avant les véhicules** ; chaque décision a une pastille. Les
  numéros de dossier ne sont pas une catégorie.
- Fiches repliées, une seule ouverte à la fois ; « Tout ouvrir » **par séance**, une séance à la
  fois ; plus de « Tout déplier » global.
- Partager (courriel, lien, X, Facebook) seulement sur les décisions résumées. Pas de « Soutenez
  la cause » ni « Offre-moi un café ».
- Thème clair et sombre, taille du texte mémorisée. Menu « Ville : … » rempli par
  `/commun/entete-volet.js`.

## 9. Étape 7 — Brancher la ville sur la couche commune

Une nouvelle ville s'y branche avec des attributs dans ses pages, sa clé dans des listes, et des
fichiers publiés au bon format. Tant qu'un fichier manque, la boîte n'affiche rien : on branche
morceau par morceau.

**1. Les pages du volet.** `<body data-page="…" data-ville="<cle>">`, scripts
`/commun/entete-volet.js` et `/commun/abonnes.js` ; chaque fiche porte
`<div class="ab-fiche" data-dossier data-numero data-objet data-montant data-statut data-etape data-echeance data-projets>`.

**2. Les listes de villes à allonger** (même clé partout) :

| Fichier | Liste |
|---|---|
| `commun/navigation.js` | `VILLES`, `VILLES_PROJETS`, `VILLES_ATTENDUES` (si la ville publie `attendues.json`), `VILLES_EN_PAUSE` |
| `commun/langue.js` | `VOLETS_EN` (si la ville a l'anglais) |
| `commun/mesure.js` | la ville |
| `api/detail.js`, `api/message.js` | `VILLES` |
| `api/_infolettre.js` | `VILLES_INFOLETTRE`, `NOTES_INFOLETTRE` (légende, ex. délai des PV) |
| `api/_enchere.js` | `VILLES` (si commanditée) |
| `scripts/build-section-pages.js`, `build-llms.js`, `journal-villes.js`, `og-villes.js` | la ville |
| `gabarit.html` | les deux listes |

**3. Les fichiers pour Mon dossier**, écrits par `scripts/projets-publics.js` : `projets/index.json`,
`projets/<cle>.json`, `recentes.json` (format commun, lu aussi par le serveur), `dossiers.json`,
`organismes.json`, et `attendues.json` si la ville a un agenda (Québec, Lévis). Projets définis à
la main dans `lib/projets.js`, vérifiés par `scripts/verifier-projets.js`.

**4. Les courriels de ville.** `scripts/infolettre.js` et `scripts/infolettres-auto.js`
(`INSTANCES`) publient seuls : compte rendu du mois (à partir du 2), un courriel après chaque PV,
un par arrondissement, FR et EN. Un compte rendu vide ne part pas. Suivre un projet ajoute le bloc
« Vos projets suivis » à l'envoi (`api/_projets-suivis.js` lit `<ville>/data/projets/<cle>.json`,
repère `<!--PROJETS-->`). Un numéro parti par erreur se retire par `scripts/retirer-numero.js`
(workflow `retirer-numero.yml`). Secrets du workflow : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**5. Le détail de l'argent : arrêté.** Plus aucune lecture IA des montants pour les volets ; ne pas
copier `details-du-jour.js` ni `publier-details.js`, ne pas relancer sans Martin.

**6. La commandite** (si la ville est offerte) : bloc `commun/apres-vente.js` (« Offert par… »,
remerciement avant les séances), `data/file-commandite.json`, enchère du mois de bannière
(`api/_enchere.js`), page « Représentez votre ville » (`api/represente.js`, tables `rtv_demandes`,
`rtv_visites`, `rtv_encheres`). Prix : voir la grille des commandites.

**7. Vérifier** avec un compte connecté : suivre un projet, mot-clé, organisme, courriel d'essai
avec le bloc « Vos projets suivis ».

**8. Mettre une ville en pause** : la retirer de `VILLES` et la mettre dans `VILLES_EN_PAUSE`
(avec `depuis`), retirer le `schedule` de son workflow. Ses pages restent en ligne avec un avis,
hors des menus, de Mon dossier et du sitemap. Rallumer : procédure en commentaire de
`commun/navigation.js`.

## 10. Étape 8 — La campagne « demander une explication »

Elle n'existe que sur DossierQuébec (projets de loi). Une personne connectée demande des
explications ; le total par projet est public, **qui** a demandé ne l'est jamais. Tables :
`scripts/supabase-schema-flags.sql`, `supabase-schema-campaign.sql` (`bill_flags`, `admins`,
`bill_campaign`). Limite de 10 demandes / 30 jours dans la **policy d'insertion**, via
`my_recent_flag_count()` en `security definer` (sinon récursion infinie). Agrégats :
`flag_counts()` public (bill_id + cnt), `flag_counts_all()` pour `service_role` seulement
(révoquer `execute` à PUBLIC). Digest : `api/weekly-digest.js`, une semaine sur deux.

➜ **Règle à retenir : ne jamais faire dépendre un palmarès public de ce que la page a chargé.**
Publier une liste maigre (`data/site/challengeBills.json`) et ne la charger que si l'agrégat
renvoie au moins une ligne.

Une ville qui reprend le mécanisme : `bill_id` → clé de dossier, colonne `ville`, listes VILLES,
et ne rien promettre à 1000 demandes qu'on ne puisse tenir.

## 11. La version anglaise : standard depuis Montréal

Montréal a une version anglaise complète ; une nouvelle ville la reprend si Martin le décide.
Pièces : `scrapers/traductions.js` (résumés et titres, Sonnet), `scrapers/lexique-en.js`,
`scrapers/projets-en.js`, `assets/libelles-en.js`, `data/resumes-en.json`, `data/lexique-en.json`,
la ville dans `VOLETS_EN` (`commun/langue.js`), `data-en` sur les textes propres à la ville. Les
étapes anglaises sont dans `refresh.js`. Chantiers, permis, contrats et motifs de gré à gré se
traduisent aussi. Langue : `?lang=en` et `dvq:langue`. Rattrapage d'un coup possible (Montréal,
12 nov. : 952 résumés et 1 031 titres).

## 12. Étape 9 — L'automatisation

Un workflow par volet : `.github/workflows/refresh-villede<ville>.yml`, **son propre groupe de
concurrence** (`refresh-<ville>`), car un job de plusieurs heures annulait les autres ; les outils
de découverte partagent ce groupe. Cron décalé (Montréal 09 h UTC), `timeout-minutes: 300`,
`permissions: contents: write`. Inputs `workflow_dispatch` : `resumes_complets`, `retirer_numero`.

Étapes à copier : vérification de présence du volet (`if:` sur chaque étape) ;
`actions/cache/restore` + `save` séparé de `data/textes` (le job rouge ne sauvegarde pas) ;
journal `tee data/lancement.log` ; push avec 3 tentatives et `git pull --rebase` ; `!cancelled()`
sur les alertes ; texte d'erreur passé en variable d'environnement, jamais en `${{ }}` dans le
script. Le push porte `data/` **et** la page Décisions pré-rendue.

Ordre de `scripts/refresh.js` (Montréal) : archive → élus, agglomération, districts (lundi) →
robots → séances → séances d'arrondissement → décisions → votes → votes-décisions → contrats SEAO
→ finances, adresses (lundi) → permis-travaux → taux (février) → lexique → récaps projets →
projets-publics → projets-en → lexique-en → traductions → résumés → En bref → prérendu → courriels.

Une source en panne ne doit jamais effacer ce qui était publié. Étapes secondaires en
avertissement ; séances, décisions et votes en échec rendent le run rouge. **Aucune clé dans le
dépôt.**

## 13. Pièges déjà rencontrés (ne pas les refaire)

- `\w` ne couvre pas les accents : écrire `conseill[a-zà-ÿ]*`.
- Un champ listé dans le code du portail peut ne pas exister dans l'index (HTTP 400).
- Facettes URL-encodées : double encodage dans les filtres.
- Pagination sans départage = documents perdus ou dupliqués.
- Le modèle émet parfois des `\uXXXX` littéraux : décoder, garder un script de réparation
  (`scripts/reparer-echappements.js`).
- Les sujets avant les véhicules ; les pluriels cassent les regex au singulier.
- `Disallow` + `noindex` se contredisent.
- Un scalaire YAML nu contenant « : » casse le workflow.
- Un PV cite des dizaines de sommaires : ne jamais lui attacher le premier résumé trouvé.
- Un vieux document n'est pas une « nouveauté ».
- « Adopter » ≠ « Adopté » (seul le second ferme l'objet) ; les dissidences tiennent sur
  plusieurs lignes ; un numéro de résolution du CE cité dans une résolution du CM n'ouvre pas de
  bloc.
- pdf.js 6 : détruire la tâche de chargement, `useSystemFonts` et `disableFontFace`.
- Les noms d'acheteur SEAO se déclinent : regex, et attention aux villes voisines homonymes.
- SEAO-2022 : les soumissions sont dans `r.bids` (0 soumission lue sinon).
- Les PV arrivent des semaines après la séance : le dire dans la légende du courriel.
- Une liste reçue en texte du modèle fait planter tout le lot : valider les types.
- Fins de ligne CRLF ; `String.replace` interprète `$&`, `$'`, `$$` (passer une fonction) ;
  `process.exit()` pendant un `fetch` plante Node sous Windows.
- Supabase : `grant` explicites sur chaque nouvelle table (même SQL) ; révoquer `EXECUTE` à
  PUBLIC ; préfixe de table propre au site.
- Sommaires cachés dans un document de séance (Longueuil) ; jeu de données ouvertes périmé
  (Longueuil) ; année sans vote divisé (Longueuil).
- Ce qui ne se voit qu'une fois connecté se teste avec un faux client Supabase, puis en ligne.

## 14. Ordre de travail conseillé

1. Faisabilité (section 3), avec chiffres. Décider.
2. Découverte des conseils d'arrondissement s'il y en a : la lancer tôt, elle est longue.
3. Client de source + séances + décisions : un échantillon, puis l'année.
4. `themes.js` jusqu'à zéro sans pastille ; site local (`npm run serve`).
5. Votes avec garde-fou ; votes-décisions.
6. Élus, districts, instances sans page « membres ».
7. Lexique chiffré.
8. Résumés : `--dry-run`, échantillon de 50, puis le lot en Batches ; En bref.
9. Contrats SEAO (jumelage par dossier), budget et taxes, Près de chez moi.
10. Courriel au greffe ; publication sous DQ ; prérendu et image OG ; entrée dans `data/journal.json`.
11. `refresh.js` + workflow ; vérifier un run planifié le lendemain.
12. Couche commune (section 9) : listes, Mon dossier, courriels de ville.
13. Version anglaise, si retenue.
14. README à jour à chaque étape.

## 15. Conventions de travail

- Terminal de Martin : **PowerShell 5.1**. Claude lance et pousse lui-même, vérifie en ligne,
  rend compte en une phrase.
- Domaines : **dossierquebec.ca**, **dossiercanada.ca** — jamais `.com`.
- Commits en français, avec la ligne `Co-Authored-By` indiquée par la session ; jamais
  `git add` d'un dossier entier.
- Tout changement visible ajoute son entrée FR+EN à `data/journal.json`.
- Le README du volet est son journal.
- Martin décide du produit : montrer, recommander, rester consistant d'une page à l'autre.
- Les clés ne passent jamais dans la conversation ; le SQL est donné prêt à coller.

## 16. Liste de vérification de fin de mise en place

- [ ] `https://dossierquebec.ca/<cle>/` s'ouvre ; les huit pages aussi (Contrats, Budget, Près de
      chez moi compris).
- [ ] Courriel au greffe envoyé, relance programmée.
- [ ] Le menu « Ville : … » montre la ville, depuis les volets et depuis Mon dossier.
- [ ] Un run planifié a réussi le lendemain et poussé `data/` et la page pré-rendue.
- [ ] Une carte de contrat montre ses soumissionnaires ; une décision montre son vote.
- [ ] Mon dossier : projet suivi, mot-clé, organisme ; courriel d'essai avec « Vos projets suivis » ;
      le compte rendu du mois n'est pas vide.
- [ ] `og-<ville>.png` 1200×630 testée ; `mesure.js` présent ; ville dans le sitemap.
- [ ] `data/journal.json` a une entrée de la ville ; elle paraît sur sa page Sources.
- [ ] Anglais : bascule FR/EN sur chaque page (si retenu).
- [ ] Cellulaire 375 px : aucun débordement ; thème clair et sombre.
- [ ] README du volet à jour ; ce guide aussi, s'il a appris quelque chose.
