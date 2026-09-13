# Reproduire DossierVilleDeQuébec pour une autre ville

Ce document est fait pour être **collé tel quel au début d'une nouvelle session**, avec une
seule phrase en plus : « La ville, c'est ___. » Il dit ce qu'on a construit pour Québec, ce
qui se réutilise sans y toucher, ce qui doit être réécrit pour une autre source, dans quel
ordre travailler, et les pièges déjà rencontrés. Le code de référence est public :
`github.com/GrandFFormat/DossierQuebec`, dossier `quebec/`.

---

## 1. Ce que c'est, et les règles qui ne se discutent pas

Un site citoyen indépendant qui rend lisibles les décisions d'une ville : ce qui a été
décidé, par quelle instance, quand, avec un lien vers le document officiel, un résumé en
langage clair, et — quand la ville les consigne — les votes nominatifs de chaque élu.
Pas de publicité, rien à vendre, aucune revente de données. Même esprit que DossierQuébec
(Assemblée nationale) et DossierCanada (Parlement fédéral).

Trois règles, héritées de DossierQuébec, qui priment sur tout le reste :

1. **Aucune donnée inventée.** Tout ce qui est affiché vient d'un document de la ville, et
   la fiche mène à ce document. Ce qu'on ne sait pas, on ne l'affiche pas ; ce qu'on n'est
   pas sûr d'avoir bien lu, on le signale (`avertissements`, `texteSourceDegrade`) au lieu
   de le corriger en douce.
2. **Aucun verdict sur une vraie personne.** Les présences, les votes, les fonctions sont
   des faits consignés ; on les montre bruts. Pas d'adjectif, pas de palmarès, pas de
   « bon » ou « mauvais » élu. Les résumés IA ont l'interdiction explicite de juger.
3. **La ville d'abord.** Son serveur n'est pas gratuit, son `robots.txt` et son avis de droit
   d'auteur comptent. On s'identifie, on attend entre deux requêtes, on lit le minimum, on
   écrit au greffe avant de rendre le site public, et on reste hors des moteurs de recherche
   tant qu'on n'a pas de réponse.

Le site dit sur chaque page qu'il n'est pas celui de la ville et n'a aucun caractère officiel.

## 2. Ce qui existe pour Québec, et ce qui se réutilise sans y toucher

Six pages HTML statiques, un style et une logique partagés, des données JSON lues à
l'exécution. Aucun framework, aucune dépendance sauf le SDK Anthropic pour les résumés.

| Page | Contenu |
|---|---|
| `index.html` | ce qui a changé depuis la dernière extraction (5 fiches, bouton « de plus ») |
| `decisions.html` | toutes les décisions de l'année, groupées par séance, repliées ; recherche, filtres par type / sujet / instance |
| `votes.html` | les appels nominaux : qui vote pour, qui vote contre, décompte des votes contre par personne |
| `conseil.html` | carte SVG des districts, membres du conseil, puis les instances sans page « membres » (agglomération, commission d'urbanisme) |
| `lexique.html` | 30 termes du vocabulaire décisionnel, avec décompte réel et un exemple vivant |
| `sources.html` | provenance, méthode, limites, état des données, archive |

**À garder tel quel** (ça ne dépend pas de la ville) : les six pages et `assets/app.js`,
`assets/style.css` (deux thèmes, pastilles, accordéon `<details name="fiches">`, taille du
texte A− / A+, étiquette Prototype, bouton retour vers DQ), `scrapers/resumes.js` (résumés
IA avec cache, estimation, plafond, lots), `scrapers/archive.js` (rotation annuelle),
`scripts/refresh.js` (routine quotidienne tolérante), `scripts/static-server.js`, le
workflow GitHub Actions, `.vercelignore`.

**À adapter** : `lib/themes.js` (règles de classement — les libellés d'objet changent d'une
ville à l'autre), `lib/lexique.js` (définitions), les textes des pages (noms d'instances,
chapeaux), `courriel-greffe.md`.

**À réécrire** : `lib/gpd.js` (le client de la source) et tous les scrapers qui lisent la
ville : `decisions.js`, `votes.js`, `elus.js`, `districts.js`, `agglomeration.js`, `cucq.js`.
Le site ne s'en aperçoit pas tant que les JSON gardent la même forme (section 5).

## 3. Étape 1 — Étude de faisabilité, avant d'écrire une ligne

C'est la première chose à faire dans la nouvelle session, et elle peut conclure « non ».

1. **Trouver le gisement.** Où la ville publie-t-elle résolutions, procès-verbaux, sommaires
   décisionnels ? Regarder : un portail de documents décisionnels (Québec : une application
   AzSearch dont la configuration est en clair dans le JavaScript de la page), un jeu de
   données ouvertes (Données Québec, portail municipal), un dépôt de PDF par séance, ou
   seulement des pages HTML. Ouvrir les outils de développement du navigateur sur le portail
   et regarder les requêtes réseau : souvent une API est derrière.
2. **Mesurer.** Combien de documents par an, par type, par instance ? Depuis quelle année ?
   Le texte intégral est-il déjà extrait (champ texte dans l'API) ou faut-il parser les PDF ?
3. **Lire les conditions.** `robots.txt` du portail, avis de droit d'auteur ou licence,
   conditions d'utilisation de l'API. Noter mot pour mot ce qui est interdit (usage
   commercial ? reproduction ? accès automatisé ?). Ça décide du ton du courriel au greffe.
4. **Échantillonner le texte.** Prendre dix documents et regarder : la qualité de
   l'extraction (glyphes espacés `Ca the r ine` = PDF dégradé), la présence d'un lien de la
   résolution vers son sommaire, la formule des votes.
5. **Chercher les appels nominaux.** Chercher « Ont voté en faveur », « A voté contre »,
   « demande le vote », « Pour : … Contre : … ». Sans ça, pas de page Votes — et c'est la
   page la plus intéressante. Compter combien de documents en contiennent.
6. **Repérer les pages « membres ».** Page officielle des élus (photos, districts, partis,
   fonctions), GeoJSON des districts (souvent en données ouvertes sous CC-BY), et les
   instances qui n'ont pas de page (agglomération, commissions) mais dont les procès-verbaux
   s'ouvrent sur une liste de présences.
7. **Conclure** avec des chiffres : X documents/an, texte extrait ou non, Y votes nominaux
   en 2026, pages membres oui/non, GeoJSON oui/non, conditions. Puis seulement, décider.

## 4. Étape 2 — L'entente avec la ville

Avant tout usage en volume, et avant de rendre le site public :

- **Le robot s'identifie** : User-Agent `DossierVille/0.1 (veille citoyenne; <contact>)`,
  0,6 s minimum entre deux requêtes, jamais de re-téléchargement complet.
- **Le courriel au greffe** (ou au service des données ouvertes, ou aux deux). Modèle dans
  `courriel-greffe.md` de Québec : ce qu'on fait, comment on lit (chiffres réels : requêtes
  par jour, délai), ce qu'on s'engage à faire quoi qu'il arrive (source citée, lien vers le
  PDF, avertissement « pas la ville »), les deux points à clarifier (robots.txt, droit
  d'auteur), et ce qu'on demande (continuer, et rendre public). Offrir en échange les
  erreurs trouvées dans leurs données — il y en a toujours.
- **Verrous en attendant la réponse** : `<meta name="robots" content="noindex, nofollow">`
  sur chaque page, `X-Robots-Tag` dans `vercel.json` sur le sous-dossier, `rel="nofollow"`
  sur le lien depuis DQ, pages absentes du sitemap. **Pas de `Disallow` dans robots.txt** :
  il empêcherait les robots de lire le `noindex`, c'est contradictoire.
- **Rappel** : programmer une relance à la date limite de réponse (loi sur l'accès : 20
  jours ouvrables au Québec).

## 5. Étape 3 — Le contrat de données (ce que le site attend)

Neuf fichiers dans `data/`. Si les nouveaux scrapers produisent ces formes, le site marche
sans modification. Champs de racine communs : `generatedAt`, `source`, `parametres`.

**`decisions.json`** — racine : `totalDisponible`, `nombre`, `nouveauxDepuisDerniereExecution`,
`themes` (copie de `THEMES`), `sansTheme`, `facettes` {type, instance, unite, theme : [{valeur, n}]}, `decisions[]` :
`id` (nom de fichier, clé stable), `numero`, `objet`, `date` (AAAA-MM-JJ), `annee`, `type`,
`instance`, `unite`, `pdf`, `sommaireId` (renvoi vers le sommaire, null sinon), `nouveau`
(bool, null à la première extraction), `theme`, `themeSource` ('objet' | 'unite' | 'defaut').

**`votes.json`** — racine : `methode`, `totalDisponible`, `documentsAnalyses`, `nombre`,
`avecAvertissement`, `themes`, `votes[]` : `id`, `numero`, `objet`, `date`, `annee`, `instance`,
`pdf`, `resultat`, `pour[]`, `contre[]`, `decomptePour`, `decompteContre`, `abstention`,
`demandeParVote`, `texteSourceDegrade`, `avertissements[]`, `brut` (le passage source),
`nouveau`, `theme`, `themeSource`.

**`elus.json`** — `nombre`, `partis`, `membres[]` : `nom`, `prenom`, `nomComplet`, `fonction`,
`districtNumero`, `district`, `arrondissement`, `parti`, `roles[]`, `telephone`,
`formulaireCourriel`, `biographie`, `photo`.

**`districts.json`** — `licence`, `simplification`, `cadre`, `nombre`, `ecarts[]` (les
contradictions entre GeoJSON et page des membres, consignées), `districts[]` : `numero`,
`nom`, `parti`, `conseiller`, `arrondissement`, `telephone`, `formulaireCourriel`, `photo`,
`roles[]`, `anneaux[]` (polygones [lon, lat] simplifiés).

**`resumes.json`** — `modele`, `genereParIA`, `avertissement`, `nombre`, `genereCetteFois`,
`echecs`, `cout`, `resumes[]` : `id`, `numero`, `date`, `unite`, `objet`, `pdf`, `puces[]`,
`sansContenuSubstantiel`, `montantPrincipal`, `genereParIA`, `modele`, `genereLe`, `jetons`.

**`agglomeration.json`** et **`cucq.json`** — instances sans page « membres » :
`methode`, `seancesAnalysees`, `nombre`, `membres[]` avec `nom`, `civilite`, `presences`,
`absences`, `seances`, `roles[]`, plus `fonction`/`ville`/`remplace[]` (agglomération) ou
`categorie`/`elu`/`partielles` (commission).

**`lexique.json`** — `categories`, `entrees[]` : `terme`, `categorie`, `recherche`,
`definition`, `ouVousLeVoyez`, `occurrences` {total, annee, pourAnnee}, `exemple`.

**`archives/index.json`** — `annees[]` : `annee`, `fichier`, `nombre`, `totalDisponible`,
`octets`, `octetsCompresses`, `archiveLe`, `types`. Les années sont dans
`archives/AAAA.json.gz`, métadonnées seulement, jamais lues par le site.

## 6. Étape 4 — Les scrapers

Vanilla Node (ESM), `fetch`, regex. Un client de source (`lib/gpd.js` à Québec) qui
centralise : throttle, réessais avec recul sur 429/5xx, User-Agent, encodage/décodage des
valeurs, pagination déterministe (**toujours un départage** : `Date desc, Numero asc` — trier
sur la seule date fait sauter ou répéter des lignes entre deux pages).

**Décisions, en deux temps** — c'est ce qui rend la routine quotidienne légère : d'abord les
métadonnées de toute l'année (1 000 par requête), ensuite le texte intégral des seules
résolutions jamais lues, par lots (à Québec : `search.in(Numero, 'a|b|c', '|')`, parce que
le nom de fichier n'est pas filtrable mais le numéro l'est). Le texte n'est jamais conservé ;
on y lit le renvoi vers le sommaire. `nouveau` = inconnu de l'extraction précédente **et**
daté de moins de 45 jours avant le plus récent connu (sinon c'est un rattrapage, pas une
nouveauté). Le fichier porte l'année en cours ; `archive.js --rotate` range l'année révolue
en janvier.

**Votes** — chercher les documents contenant la formule d'appel nominal, extraire le
segment, recoller les listes coupées par les pages, séparer sur virgules / « et » / « ainsi
que », retirer les hyperliens tombés au milieu des noms, gérer le singulier (« A voté
contre »), « aucun membre du conseil » (liste vide légitime), les PDF dégradés (ne pas
extraire, marquer `texteSourceDegrade`). **Garde-fou** : recouper avec le décompte imprimé
(`En faveur : 7 Contre : 1`) et écrire tout écart dans `avertissements`. Fenêtre glissante
de 60 jours au quotidien, année complète le 1er du mois.

**Élus** — la page officielle. À Québec, la même information était balisée de trois façons
selon l'élu ; balayer tous les paragraphes du bloc, ne pas se fier à un seul attribut.

**Districts** — GeoJSON en données ouvertes, simplifié (Douglas-Peucker avec correction
`cos(latitude)`, cinq décimales : 586 ko → 46 ko), joint aux élus par numéro de district ;
les contradictions entre les deux sources sont consignées, pas écrasées.

**Instances sans page « membres »** — lire les listes de présences des procès-verbaux
(présents, absents, fonction, ville, remplacement), et exclure les fonctionnaires qui
« assistent également ». Une personne par séance, compter présences et absences.

## 7. Étape 5 — Les résumés en langage clair

Sur les sommaires décisionnels (la note de l'administration : situation, analyse,
recommandation), jamais sur les procès-verbaux. Modèle `claude-opus-5`, sortie par outil en
schéma strict avec `tool_choice` forcé, cache dans `resumes.json` (jamais repayer), estimation
gratuite par `countTokens` avant de dépenser, API Batches à moitié prix pour les gros lots,
plafond de 120 par exécution en routine. La consigne interdit : ajouter quoi que ce soit
d'absent du document, juger, meubler un document procédural (lever
`sansContenuSubstantiel`), recalculer un montant. Décoder les `\uXXXX` que le modèle glisse
parfois littéralement dans ses chaînes.

## 8. Étape 6 — Le site

- Servi comme **sous-dossier de dossierquebec.ca** (`/quebec/`), dans le dépôt de DQ :
  mêmes déploiements Vercel, même analytics (pages vues, événement de clic sur l'icône),
  même workflow. **La barre oblique finale est obligatoire** : sans elle, `assets/` et
  `data/` se résolvent depuis la racine du site. Les liens « accueil » pointent vers `./`,
  jamais vers `index.html` (Vercel `cleanUrls` le réécrit sans barre), et `vercel.json`
  redirige `/quebec` vers `/quebec/`.
- Icône dans l'en-tête de DQ vers le volet municipal ; bouton « ← Retour à DossierQuébec »
  à côté du logo du volet ; étiquette « Prototype » tant qu'on n'a pas tranché.
- Pastilles de sujet : règles par mots-clés sur l'objet, **les sujets avant les véhicules**
  (contrats, finances), puis l'unité administrative, puis « Administration » faute de mieux
  — chaque décision a une pastille, et `themeSource` dit ce qui a tranché. Recompter à
  chaque changement de règles.
- Fiches repliées par défaut, une seule ouverte à la fois (`<details name="fiches">`),
  séances repliées, « Tout déplier » qui retire le `name` le temps de l'ouverture.
- Thème clair et sombre (`data-theme`, appliqué avant le premier rendu), taille du texte
  mémorisée (`zoom` 80–150 %).

## 9. Étape 7 — L'automatisation

Un workflow GitHub Actions par volet, dans le dépôt de DQ, même groupe de concurrence que le
rafraîchissement de DQ (jamais deux pushes en même temps), `permissions: contents: write`,
`npm run refresh` dans le sous-dossier, commit + push de `data/` s'il y a du nouveau.
`.vercelignore` garde `lib/`, `scrapers/`, `scripts/`, README et `package.json` hors du site
servi. Secret `ANTHROPIC_API_KEY` (déjà là) ; sans lui, les résumés sont sautés, le reste
tourne. Les échecs d'étapes secondaires sont des avertissements ; une extraction principale
en échec rend le run rouge après avoir publié ce qui a marché.

**Aucune clé dans le dépôt.** GitHub bloque le push s'il reconnaît une clé (même une clé de
lecture que la ville publie elle-même) : la lire à l'exécution dans le code du portail, comme
un navigateur, ou la mettre en secret.

## 10. Pièges déjà rencontrés (ne pas les refaire)

- `\w` ne couvre pas les accents : `conseill\w+` attrape « conseiller » et jamais
  « conseillère » — toutes les femmes disparaissent sans erreur. Écrire `conseill[a-zà-ÿ]*`.
- Un champ listé dans le code du portail peut ne pas exister dans l'index (HTTP 400).
- Les valeurs de facettes peuvent être stockées URL-encodées : double encodage dans les filtres.
- Pagination sans départage = documents perdus ou dupliqués d'une page à l'autre.
- Le modèle émet parfois `é` littéralement dans un outil : décoder à la source, et
  garder un script de réparation.
- Élargir une règle générique (« contrats ») avale les sujets : les sujets d'abord.
- Les pluriels (« dérogations mineures », « usages conditionnels ») cassent les regex au singulier.
- `Disallow` + `noindex` se contredisent.
- Un scalaire YAML nu contenant « : » casse le workflow (« Invalid workflow file ») — bloc `|`.
- Un tableau des décisions ou un procès-verbal cite des dizaines de sommaires : ne jamais lui
  attacher le résumé du premier trouvé.
- Un document daté de longtemps avant ce qu'on connaît n'est pas une « nouveauté » : sinon
  le premier rattrapage remplit le fil de 2 800 « nouveautés ».
- Les résumés grossissent d'une année à l'autre : prévoir leur archivage avant que ça pèse.

## 11. Ordre de travail conseillé

1. Étude de faisabilité (section 3), avec chiffres. Décider.
2. Client de source + `decisions.js` : d'abord un échantillon, puis l'année.
3. `themes.js` adapté aux libellés de la ville, jusqu'à zéro sans pastille.
4. Site local (`npm run serve`) avec les seules décisions ; valider la lecture.
5. `votes.js` avec le garde-fou du décompte ; viser 95 % de recoupements exacts.
6. Élus, districts, instances sans page « membres ».
7. Lexique, chiffré sur le corpus (il corrige les définitions écrites de tête).
8. Résumés : `--dry-run` d'abord, un échantillon de 50, puis le lot en Batches.
9. Courriel au greffe ; verrous `noindex` ; publication sous DQ ; icône et bouton retour.
10. `refresh.js` + workflow ; vérifier un run planifié le lendemain.
11. README à jour à chaque étape : chaque décision technique y a sa raison.
12. Le jour de la réponse de la ville : retirer les trois verrous, sitemap, retirer « Prototype ».

## 12. Conventions de travail

- Le terminal de Martin est **PowerShell 5.1** : pas de `&&`, une commande par ligne. Quand
  une commande doit tourner, Claude la lance lui-même et pousse lui-même ; on ne demande pas
  « veux-tu que je… », on fait, on vérifie en ligne, on rend compte en une phrase.
- Les domaines sont **dossierquebec.ca** et **dossiercanada.ca** — jamais `.com`.
- Commits en français, message qui explique le pourquoi, signés
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Le README du volet est le journal du projet : ce qui a été mesuré, corrigé, et pourquoi.
