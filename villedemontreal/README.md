# DossierVilleDeMontréal

Veille citoyenne des décisions de la **Ville de Montréal**. Même esprit que DossierQuébec et
que le volet Ville de Québec : données publiques seulement, aucune donnée inventée, aucun
verdict sur de vraies personnes.

Ce n'est pas un site de la Ville de Montréal et ça n'a aucun caractère officiel.

Ce volet a été construit en suivant `REPRODUIRE-POUR-UNE-AUTRE-VILLE.md` du volet Québec
(dépôt DossierQuébec, dossier `villedequebec/`), avec une phrase en plus : « La ville, c'est
Montréal. » Le présent README est le journal du projet : ce qui a été trouvé, ce qui a été
construit, ce qui reste à vérifier, et pourquoi.

> **État au 12 septembre 2026 — à lire en premier.** Le code, les pages et l'automatisation
> sont complets et testés hors ligne (`npm test`, un procès-verbal synthétique passé de bout en
> bout). **Aucune donnée réelle n'a encore été extraite** : la session qui a construit le volet
> n'avait pas accès à `montreal.ca` ni à `donnees.montreal.ca` (réseau restreint), et rien n'a
> été inventé pour combler. Le premier `npm run refresh` doit être lancé depuis une machine qui
> voit la Ville ; la section « Premier lancement » dit quoi regarder à ce moment-là.

## Démarrage

**Sans rien taper (Windows)** : double-cliquer sur `LANCER-MONTREAL.cmd`. Il vérifie Node.js et
Git, tient sa propre copie du dépôt dans `Documents\DossierVilleMontreal` ramenée à la dernière
version de la branche à chaque fois, se relance depuis cette version, installe les dépendances,
lance la routine en écrivant tout dans `data/lancement.log`, envoie données et journal sur
GitHub et ouvre le site en local. S'il s'arrête, la fenêtre dit pourquoi.


```bash
npm install            # deux dépendances : le SDK Anthropic (résumés) et pdf.js (lecture des PDF)
npm test               # les lecteurs, hors ligne, sur des textes synthétiques
npm run refresh        # la routine quotidienne : séances, décisions, votes, lexique, résumés
npm run serve          # http://localhost:4321
```

`npm run refresh` est exactement ce que GitHub Actions lance chaque matin. Les extractions
sont gratuites ; seule l'étape des résumés appelle une API payante, plafonnée à 120 documents
par exécution — sautée s'il n'y a pas de clé (`api.env` ici, ou à la racine du dépôt).

```bash
npm run refresh -- --sans-resumes             # sans appel à l'API Claude
npm run refresh -- --complet                  # relit tous les procès-verbaux de l'année (fait d'office le 1er du mois)
npm run refresh -- --elus                     # force les jeux du conseil (sinon : le lundi)
npm run refresh -- --fenetre=30 --plafond=50  # fenêtre des votes et des résumés, plafond de résumés

node scrapers/decisions.js --fichier=CM_PV_ORDI_2026-01-26_13h00_FR.pdf   # un PDF local, sans réseau
node scrapers/votes.js     --fichier=CM_PV_ORDI_2026-01-26_13h00_FR.pdf
node scrapers/seances.js --ajouter=CM:2026-01-26:13h00 --liste=<url d'une page de liste de la Ville>
```

## Étape 1 — L'étude de faisabilité

Ce qui suit distingue ce qui a été **vérifié** (sur les pages de la Ville, via un moteur de
recherche, ou dans le code d'autres projets civiques qui lisent Montréal depuis des années) de
ce qui est **supposé** et sera confirmé au premier lancement.

### Le gisement

Montréal n'a **pas** d'index de recherche plein texte ouvert comme le portail AzSearch de
Québec. Ses décisions sortent par deux portes :

| Porte | Ce qu'on y trouve | Statut |
|---|---|---|
| **Portail de données ouvertes** `donnees.montreal.ca` (CKAN, CC-BY 4.0) | Liste des élus (CSV) · Liste des élus du conseil d'agglomération (CSV) · Districts électoraux 2025-2029 (GeoJSON, 58 districts) · Calendrier des séances CE/CM/CG (CSV) · Contrats du CM/CG et du CE (avec le **numéro de résolution**) · Nominations par les instances centrales · Règlements municipaux | vérifié : jeux, formats, licence ; **colonnes vérifiées pour les élus** (via le scraper `ca_qc_montreal` d'OpenCivicData, qui lit ce CSV) ; colonnes du calendrier **supposées** |
| **Documents des séances** `ville.montreal.qc.ca/documents/Adi_Public/` | Procès-verbaux (PV) et ordres du jour (ODJ) en PDF, un par séance, pour CM, CG, CE et les 19 conseils d'arrondissement (`CA_Pmr`, `CA_Rpp`, `CA_Sud`, `CA_Pir`…) | vérifié : URL **entièrement prévisibles** — `CM_PV_ORDI_2026-01-26_13h00_FR.pdf`, `CM_PV_EXTRA_2026-01-12_13h00_FR.pdf`, `CE_PV_ORDI_2026-02-25_09h00_FR.pdf`, `CM_ODJ_ORDI_…`, `CE_ODJ_ADOPTE_ORDI_…`, `CA_Pmr_ODJ_LPP_ORDI_…` |
| Viewer `ville.montreal.qc.ca/sel/adi-public/afficherpdf/fichier.pdf?typeDoc=pv&doc=N` | Les mêmes documents, par identifiant séquentiel (`typeDoc` = `pv`, `odj`, `da`) | vérifié, **pas utilisé** : on ne peut pas deviner N |
| Sommaires décisionnels `ville.montreal.qc.ca/sel/sypre-consultation/afficherpdf?idDoc=N&typeDoc=…` | Le sommaire d'un dossier (système GDD, numéro de dossier à 10 chiffres) | vérifié comme forme d'URL ; le rattachement dossier → lien passe par l'ODJ « LPP » (**supposé**, voir plus bas) |

C'est la découverte qui rend le projet faisable sans page de liste à gratter : **le
calendrier des séances (porte 1) donne la date et l'heure, et le nom du fichier PDF (porte 2)
s'en déduit.** `lib/mtl.js` construit les URL ; `scrapers/seances.js` lit le calendrier ;
`scrapers/decisions.js` essaie les URL et lit ce qui répond.

### Ce que les procès-verbaux contiennent

Un PV du conseil municipal fait de 100 à 200 pages et enchaîne les résolutions, chacune
ouverte par son numéro sur une ligne — `CM26 0355` — et close par la ligne `article dossier`
(`20.03  1266245003`). Le comité exécutif suit le même gabarit (`CE26 0412`), l'agglomération
aussi (`CG26 0123`). Le texte est du vrai texte (pas du scan) : pdf.js l'extrait ligne par
ligne (`lib/pdf.js`) et `lib/pv.js` le découpe.

Les votes : la plupart des décisions sont adoptées à main levée. Quand un membre demande un
**vote enregistré**, le greffier fait l'appel et le PV écrit « Votent en faveur : Mmes et MM. …
(N) / Votent contre : … (M) / Résultat : En faveur : N, Contre : M ». Quand seule une
opposition est notée, le PV écrit « Adopté à la majorité des voix. Dissidences : … ». Les deux
formes sont lues ; les votants sont nommés **par leur nom de famille seulement** (« Martinez
Ferrada, Bourque… »), ce que la page Conseil sait pour compter les votes contre par personne.

⚠ Ces formulations viennent de la lecture de PV publiés et de ce qu'en disent les documents
qui les citent, pas d'un passage automatisé sur un corpus : le premier lancement mesure le taux
de recoupement exact (noms extraits = décompte imprimé) et le README le consignera ici.

### Les conditions

- **Données ouvertes** : licence Creative Commons **CC-BY 4.0**, adoptée par la résolution
  CG14 0091 — réutilisation libre, y compris commerciale, avec attribution. Vérifié.
- **montreal.ca** : « tous droits réservés » sur le contenu ; reproduction des **images**
  interdite à des fins commerciales ; usage non commercial permis avec la source indiquée.
  Vérifié (mentions légales). Les PV sont des documents publics ; on les reproduit sans usage
  commercial, avec la source, et on le confirme par écrit — c'est le point 1 de
  `courriel-greffe.md`.
- **robots.txt** de `montreal.ca` et de `ville.montreal.qc.ca` : **non vérifié** (inaccessibles
  depuis la session). À lire au premier lancement, avant tout volume, et à mentionner au greffe
  (point 2 du courriel). Le robot s'identifie de toute façon et attend 0,6 s entre deux requêtes.

### Les pages « membres »

- **Conseil municipal** : 65 membres — la mairesse (Soraya Martinez Ferrada, Ensemble Montréal,
  depuis novembre 2025), 18 maires d'arrondissement, 46 conseillers de ville. Composition
  2025-2029 : Ensemble Montréal 34, Projet Montréal 25, Équipe LaSalle 3, Équipe Anjou 2,
  Équipe St-Léonard 1. Le CSV des élus contient aussi les 38 conseillers **d'arrondissement**
  (qui ne siègent pas au conseil municipal) : gardés, marqués comme tels.
- **Comité exécutif** : pas de jeu à part ; ses membres sont les élus dont les rôles publiés
  disent « comité exécutif ». La page Conseil les extrait de la liste des élus.
- **Conseil d'agglomération** : 32 sièges — Montréal (la mairesse + 15 élus désignés) et les
  maires des 15 villes liées (Dollard-Des Ormeaux en a deux). Jeu de données ouvert dédié, avec
  appellation, fonction, ville, parti, courriel, responsabilités. Pas besoin de reconstituer
  depuis les présences comme à Québec.
- **Districts** : GeoJSON 2025-2029, 58 districts, mais **pas de numéro de district** dans les
  jeux : la jointure élus ↔ carte se fait par une **clé de nom** (`lib/noms.js`) qui absorbe les
  variations de tirets, d'articles et d'accents entre les deux fichiers de la Ville. Les
  noms des propriétés du GeoJSON sont **supposés** (`NOM`, `ARROND`, …) : le scraper les
  reconnaît par famille et les affiche.

### Conclusion

Faisable, avec une dépendance de plus qu'à Québec (pdf.js) et une routine un peu plus
coûteuse les jours de publication (un PV de 150 pages plutôt qu'une requête d'index). Ce qui
change par rapport à Québec :

| | Québec | Montréal |
|---|---|---|
| Texte des documents | déjà extrait dans un index | PDF à lire (pdf.js) |
| Découverte des documents | requêtes à l'index | calendrier + URL prévisibles |
| Sommaire décisionnel | lien dans le texte de la résolution | lien dans l'ordre du jour « LPP », par numéro de dossier |
| Élus | page HTML (microdonnées) | CSV ouvert |
| Agglomération | présences des PV | CSV ouvert (composition, pas de présences) |
| Votes | « Ont voté en faveur », noms complets | « Votent en faveur », noms de famille, décompte entre parenthèses + « Résultat » ; et les « Dissidences » |
| Archive | relue depuis l'index | figée depuis `decisions.json` à la rotation |

## Premier lancement — quoi regarder

1. `npm run scrape:seances` : le script affiche **les colonnes du calendrier**. S'il ne
   reconnaît aucune séance, adapter `seanceDepuisLigne()` dans `scrapers/seances.js` aux noms
   réels (instance, date, heure). En attendant, `--ajouter=CM:2026-01-26:13h00` ou `--liste=<url>`
   (la page « Ordres du jour et procès-verbaux » de la Ville) remplissent le calendrier.
2. `node scrapers/decisions.js --seance=CM_2026-01-26_13h00` sur une seule séance : vérifier le
   nombre de résolutions, la proportion avec objet et numéro de dossier, et le nombre de liens
   vers un sommaire. Zéro lien = l'ordre du jour trouvé n'est pas la version « LPP », ou les
   liens ne sont pas des annotations PDF : regarder `data/textes/<id>_ODJ.json`.
3. `node scrapers/votes.js --complet` : lire les `avertissements`. Viser 95 % de recoupements
   exacts, comme à Québec ; chaque écart est une formulation à ajouter dans `lib/pv.js`.
4. `npm run scrape:elus` : 65 membres attendus (+ 38 d'arrondissement) ; le script avertit sinon.
   Puis `scrape:districts` : 58 districts et zéro `ecarts` idéalement — chaque écart est une
   différence réelle entre deux fichiers de la Ville, à garder tel quel.
5. Lire `robots.txt` des deux domaines, remplir les chiffres de `courriel-greffe.md`, envoyer.
6. Recompter les pastilles (`lib/themes.js`) sur une année : viser zéro « défaut ».

## Rafraîchissement automatique

`.github/workflows/refresh-villedemontreal.yml`, à la racine du dépôt, lance `npm run refresh`
chaque matin à 09 h 00 UTC — après le rafraîchissement fédéral (08 h 00), jamais en même temps
(même groupe de concurrence) — puis pousse `data/` s'il y a du nouveau ; Vercel redéploie.

Ce que ça demande à la Ville, par jour, à 0,6 s d'écart : le calendrier (une ou deux requêtes
au portail de données ouvertes) ; pour chaque séance passée dont le PV n'a pas été lu, un essai
d'URL (404 tant qu'il n'est pas publié) puis, le jour venu, le PV et l'ordre du jour ; les
sommaires à résumer, plafonnés à 120. Le lundi, les trois jeux du conseil. **Une poignée de
requêtes les jours calmes, quelques PDF les jours de publication.** C'est ce que décrit le
courriel au greffe — ne pas l'alourdir sans le mettre à jour.

Le texte extrait de chaque PDF est mis en cache dans `data/textes/` (ignoré par git) : dans un
même run, `votes.js`, `lexique.js` et `resumes.js` relisent le cache et ne redemandent rien.

Une étape qui échoue ne bloque pas les autres : la source en panne garde ses données de la
veille, le reste est publié, et le run est marqué rouge si c'est une extraction principale
(calendrier, décisions, votes) ou reçoit un avertissement si c'est une étape secondaire.

Secrets et variables : `ANTHROPIC_API_KEY` (secret) ; `MTL_CONTACT` (variable, facultative)
pour laisser une adresse de contact dans le User-Agent.

## Ce que le volet contient

| Jeu | Source | Ce qu'on en tire |
|---|---|---|
| `data/seances.json` | calendrier des séances (données ouvertes) | les séances de l'année : instance, date, heure, ordinaire ou extraordinaire |
| `data/decisions.json` | PV et ODJ des séances | les résolutions : numéro, objet, article, dossier, résultat, dissidences, page du PV, lien vers le sommaire ; l'état de chaque séance (lue, en attente de PV, à venir) |
| `data/votes.json` | les mêmes PV | les votes enregistrés : qui vote pour, qui vote contre, décomptes, résultat, avertissements |
| `data/elus.json` | « Liste des élus de la Ville de Montréal » | 65 membres du conseil + 38 conseillers d'arrondissement, avec rôles, responsabilités, parti, coordonnées |
| `data/agglomeration.json` | « Liste des élus du Conseil d'agglomération » | les 32 membres, ville, fonction, parti |
| `data/districts.json` | « Districts électoraux » (GeoJSON) | les 58 contours simplifiés, joints aux élus par clé de nom |
| `data/resumes.json` | API Claude, sur le texte des sommaires | 3 à 7 puces par dossier, montant en jeu ; indexés par numéro de dossier |
| `data/lexique.json` | les PV en cache | 33 termes, comptés sur les PV de l'année, avec un exemple réel |

## Les pages

Les six pages du volet Québec, reprises telles quelles avec leurs textes adaptés, et le même
`assets/app.js` / `assets/style.css` (clés `dvm:` au lieu de `dvq:` dans le stockage local).
Ce qui a changé dans `app.js`, et pourquoi :

- **Fiche de décision** : le résultat, la mention « vote enregistré », les **dissidences**, le
  numéro de dossier et d'article, et deux liens — le PV ouvert à la bonne page (`#page=N`) et le
  sommaire décisionnel.
- **Conseil** : les fiches sont reliées à la carte par la clé du district, pas par un numéro
  (Montréal n'en publie pas) ; les conseillers d'arrondissement sont affichés en retrait ; une
  section **Comité exécutif** remplace la commission d'urbanisme de Québec ; la section
  Agglomération n'affiche plus de présences (le jeu ne les donne pas) mais la ville, le parti et
  un lien courriel. Dix-neuf teintes pour dix-neuf arrondissements.
- **Votes contre par élu** : comparaison sur le nom de famille, parce que c'est ainsi que les PV
  nomment les votants.

Tant que la Ville n'a pas répondu, les pages portent `<meta name="robots" content="noindex,
nofollow">`, le `vercel.json` du dépôt ajoute `X-Robots-Tag` sur `/villedemontreal/`, et le
volet n'est pas dans le sitemap. Le jour où ça débloque : retirer ces verrous, ajouter les pages
au sitemap, retirer l'étiquette « Prototype ».

## Où ce dossier vit

Comme le volet Québec : dans le dépôt de DossierQuébec, sous `villedemontreal/`, servi à
**https://dossierquebec.ca/villedemontreal/** — mêmes déploiements Vercel, même tableau de
bord, même mécanique de rafraîchissement. Le workflow `.github/workflows/refresh-villedemontreal.yml`,
les entrées `headers`/`redirects` de `vercel.json`, les lignes de `.vercelignore` et de `.gitignore`
et l'icône « VDM » de l'en-tête de DossierQuébec sont ses seules attaches au dépôt hôte.

## Pièges rencontrés en construisant (sans données réelles)

- **« Adopter » n'est pas « Adopté ».** La règle qui ferme l'objet d'une résolution au premier
  « Adopté à… » avalait les objets qui commencent par « Adopter le règlement… » — et à Montréal,
  l'objet commence presque toujours par un verbe à l'infinitif. La règle exige maintenant le
  participe passé suivi de « à / sur / par ». Attrapé par le test, pas par la relecture.
- **Les dissidences sur plusieurs lignes** (« Dissidences : Mme X » puis « M. Y » à la ligne)
  ressortaient comme une seule personne. La fin de ligne vaut une virgule dans ce bloc.
- **Le numéro de résolution du comité exécutif cité dans une résolution du conseil** (« par sa
  résolution CE26 0412 ») ne doit pas ouvrir un bloc : seul un numéro seul sur sa ligne compte,
  et seulement celui de l'instance qu'on lit.
- **pdf.js 6** : c'est la tâche de chargement qu'on détruit, pas le document ; `useSystemFonts`
  et `disableFontFace` pour que Node n'aille pas chercher des polices.
- Hérités de Québec et toujours vrais : `\w` ne couvre pas les accents ; les pluriels cassent
  les regex au singulier ; un document daté de longtemps avant ce qu'on connaît n'est pas une
  nouveauté ; `Disallow` + `noindex` se contredisent.

## Ce qui n'est pas encore là

- **Les 19 conseils d'arrondissement.** Même schéma d'URL (`CA_<code>_PV_ORDI_…`) et même
  gabarit ; il manque le calendrier de leurs séances et la table des codes (`Pmr`, `Rpp`, `Sud`,
  `Pir`…). `INSTANCES` dans `lib/mtl.js` est fait pour les recevoir.
- **Les contrats et les nominations**, pourtant en données ouvertes avec le numéro de résolution :
  une jointure toute prête pour enrichir les fiches (fournisseur, montant, nombre de
  soumissionnaires). À faire dès que les résolutions sont là.
- **Les présences aux séances**, lisibles en tête de chaque PV (« Sont présents : … »).
- **Consulter l'archive depuis le site**, **les alertes et le suivi** — comme à Québec.

## Structure

```
lib/mtl.js               client de source : throttle, User-Agent, réessais, API CKAN, URL des documents de séance
lib/csv.js               lecteur CSV sans dépendance, en-têtes normalisés
lib/pdf.js               texte et hyperliens d'un PDF (pdf.js), ligne par ligne
lib/pv.js                lecture des procès-verbaux (résolutions, votes, dissidences) et des ordres du jour
lib/noms.js              clés de jointure (districts, arrondissements, noms)
lib/themes.js            règles de classement thématique, réécrites pour les libellés de Montréal
lib/lexique.js           définitions du lexique (écrites à la main)
scrapers/seances.js      le calendrier des séances (données ouvertes, page de liste, ou à la main)
scrapers/decisions.js    PV + ODJ de chaque séance -> résolutions ; cache de texte dans data/textes/
scrapers/votes.js        votes enregistrés, depuis le cache
scrapers/elus.js         les élus (CSV ouvert)
scrapers/agglomeration.js le conseil d'agglomération (CSV ouvert)
scrapers/districts.js    les 58 districts (GeoJSON ouvert), simplifiés et joints aux élus
scrapers/resumes.js      résumés en langage clair (API Claude), par numéro de dossier
scrapers/lexique.js      mesure chaque terme sur les PV en cache
scrapers/archive.js      rotation annuelle
scripts/refresh.js       la routine quotidienne, tolérante aux pannes
scripts/static-server.js serveur statique local
scripts/reparer-echappements.js  répare les accents échappés dans les résumés
test/pv.test.js          les lecteurs, hors ligne (npm test)
assets/style.css assets/app.js
index.html decisions.html votes.html conseil.html lexique.html sources.html
courriel-greffe.md       le modèle du courriel à envoyer avant de rendre le site public
data/                    sorties JSON (data/textes/ = cache, hors dépôt)
../.github/workflows/refresh-villedemontreal.yml   le workflow quotidien
../.vercelignore         garde lib/, scrapers/, scripts/, test/ hors du site servi
```
