# Reproduire DossierVilleDeQuébec pour une autre ville

> **Version de référence depuis le 24 sept. 2026 :** ce guide vit désormais dans un document Claude,
> <https://claude.ai/code/artifact/3e9746c3-3c92-4271-9bc4-363866a35d3f>. Ce fichier n'est qu'une copie ;
> en cas d'écart, le document fait foi.

Ce document est fait pour être **collé tel quel au début d'une nouvelle session**, avec une
seule phrase en plus : « La ville, c'est ___. » Il dit ce qu'on a construit pour Québec, ce
qui se réutilise sans y toucher, ce qui doit être réécrit pour une autre source, comment
brancher la ville sur l'espace abonnés, dans quel ordre travailler, et
les pièges déjà rencontrés. Le code de référence est public :
`github.com/GrandFFormat/DossierQuebec`, dossier `quebec/` (le volet) et la racine (la couche
commune : `commun/`, `api/`, `mes-dossiers.html`, `abonnement.html`). Le README de `quebec/` est le
journal détaillé : ce guide y renvoie pour les formats exacts.

Mis à jour le 14 sept. 2026 : espace abonnés (alertes, mots-clés, organismes, agenda, export,
détail de l'argent et demandes). La version anglaise n'est **pas** à reproduire (section 11).

Mis à jour le 24 sept. 2026 : la campagne « demander une explication » (section 10) — tables,
agrégats publics, digest, et ce que le découpage multipage y avait cassé.

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

> ⚠️ Ceci vaut pour un **volet de ville** à l'intérieur du dépôt de DQ. Pour un **site séparé**
> (DossierOntario, DossierCanada…), ne pas partir d'ici ni de `assets/style.css` — c'est le design
> des volets, vert et arrondi, pas celui de DQ. Lire `CHARTE-DOSSIER.md` à la racine.

**À garder tel quel** (ça ne dépend pas de la ville) : les six pages et `assets/app.js`,
`assets/style.css` (deux thèmes, pastilles, accordéon `<details name="fiches">`, taille du
texte A− / A+, bouton fleur de lys vers DQ), `scrapers/resumes.js` (résumés IA avec cache,
estimation, plafond, lots), `scrapers/recaps-projets.js`, `scrapers/details-argent.js`, `scrapers/archive.js`
(rotation annuelle), `scripts/refresh.js` (routine quotidienne tolérante),
`scripts/projets-publics.js` et `scripts/travail-public.js` (fichiers de Mes dossiers et de la
page Abonnement), `scripts/static-server.js`, le workflow GitHub Actions, `.vercelignore`.

**Et une couche commune, qui existe une fois pour toutes les villes** — on ne la recopie
jamais, on s'y branche (section 9) : `mes-dossiers.html` et `abonnement.html`, `commun/`
(navigation et menu des villes, client Supabase, styles de l'espace abonnés, tableur Excel/CSV,
langue), `api/` (détail de l'argent et demandes, alertes du matin, messages, désabonnement) et
les tables Supabase (suivis, abonnements, alertes, mots-clés, organismes, détail de l'argent,
demandes, messages), qui ont toutes une colonne `ville` quand c'est utile.

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

À ces neuf fichiers s'ajoutent ceux de l'espace abonnés (section 9), tirés des précédents par
des scripts qui se réutilisent.

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
- Icône dans l'en-tête de DQ vers le volet municipal ; bouton fleur de lys + « DQ » (retour à
  DossierQuébec, bleu en clair, jaune en sombre) à côté du logo du volet ; étiquette « Prototype » pendant la construction (retirée de Québec
  le 14 sept. 2026, une fois le volet jugé stable).
- Pastilles de sujet : règles par mots-clés sur l'objet, **les sujets avant les véhicules**
  (contrats, finances), puis l'unité administrative, puis « Administration » faute de mieux
  — chaque décision a une pastille, et `themeSource` dit ce qui a tranché. Recompter à
  chaque changement de règles.
- Fiches repliées par défaut, une seule ouverte à la fois (`<details name="fiches">`),
  séances repliées, « Tout déplier » qui retire le `name` le temps de l'ouverture.
- Thème clair et sombre (`data-theme`, appliqué avant le premier rendu), taille du texte
  mémorisée (`zoom` 80–150 %).
- **En-tête** : dans `<nav>`, les onglets du volet puis `<div class="outils">` avec la taille du
  texte et le thème — `/commun/abonnes.js` y ajoute « Mes dossiers » et « Abonnement », et
  mémorise la ville pour que Mes dossiers et Abonnement prennent la marque du volet (logo qui y
  ramène). Le menu déroulant « Ville : … » est en haut à droite de chaque page : dans
  `.titre-ligne`, un `<details class="ab-villes" id="villes">` rempli par
  `/commun/entete-volet.js`. Sur cellulaire, le sous-titre ne reste que sur l'accueil et les
  outils tiennent sur une ligne.
- **Espace abonnés** : section 9. **Version anglaise** : pas pour l'instant, section 11.

## 9. Étape 7 — Brancher la ville sur l'espace abonnés

L'espace abonnés n'appartient à aucune ville : Mes dossiers, Abonnement, `commun/`, `api/` et
Supabase servent toutes les villes à la fois. Une nouvelle ville s'y branche avec des attributs
dans ses pages, sa clé dans quelques listes, et des fichiers publiés au bon format. Tant qu'un
fichier manque, la boîte correspondante n'affiche simplement rien pour cette ville : rien ne
casse, ce qui permet de brancher morceau par morceau.

**1. Les pages du volet.**
- `<body data-page="…" data-ville="<cle>">` (la clé = le nom du sous-dossier), et les scripts
  `/commun/entete-volet.js` et `/commun/abonnes.js`.
- En-tête : `<details class="ab-villes" id="villes"></details>` dans `.titre-ligne`, et
  `<div class="outils">` dans `<nav>` (voir la section 8).
- Chaque fiche de dossier contient
  `<div class="ab-fiche" data-dossier data-numero data-objet data-montant data-statut data-etape data-echeance data-projets>`
  (voir `carteDecision` dans `quebec/assets/app.js`). `data-dossier` est la clé qui suit la
  décision d'une instance à l'autre (le sommaire à Québec, le numéro de dossier à Montréal) ;
  `data-montant="1"` quand le résumé a trouvé un montant (ça offre « Demander le détail de
  l'argent »).

**2. Les listes de villes à allonger** (partout la même clé) :

| Fichier | Ce que la liste commande |
|---|---|
| `commun/navigation.js` — `VILLES` | le menu des villes, la marque des pages communes, toutes les boucles de Mes dossiers et d'Abonnement |
| `api/detail.js` — `VILLES` | le détail de l'argent, les demandes et l'export |
| `api/message.js` — `VILLES` | « Nous écrire » et « Signaler une erreur » |
| `api/alertes-projets.js` — `VILLES` | les alertes du matin (projets, mots-clés, organismes) |

**3. Les fichiers que la ville publie pour Mes dossiers**, écrits par son
`scripts/projets-publics.js` (celui de Québec se réutilise tel quel si `decisions.json` et
`resumes.json` ont la forme de la section 5). Formats exacts : README de Québec, section
« L'espace abonnés ». Mes dossiers ne lit que ces fichiers, jamais les décisions complètes : c'est
ce qui la garde légère quand les villes s'additionnent.

| Fichier | Ce qu'il nourrit |
|---|---|
| `data/projets/index.json`, `data/projets/<cle>.json` | projets suivis, « Où en est le projet », suggestions, export. Projets définis à la main dans `lib/projets.js` (relus sur leurs résultats), récapitulatifs par `scrapers/recaps-projets.js` |
| `data/attendues.json` | l'agenda des conseils (dossiers en attente, instance regroupée, date cible) |
| `data/recentes.json` | les mots-clés et les alertes du matin (45 derniers jours) — **format commun à toutes les villes**, lu aussi par le serveur |
| `data/dossiers.json` | les organismes suivis et l'export (toute l'année, avec `numeros[]` pour retrouver les dossiers d'un projet) |
| `data/organismes.json` | les suggestions de noms d'organismes et d'entreprises |
| `data/travail.json` | « Le travail derrière le volet… » de la page Abonnement (`scripts/travail-public.js`) |

**4. Le détail de l'argent.** Les tables `details_argent` et `demandes_details` ont une colonne
`ville` : rien à créer dans Supabase. `scripts/details-du-jour.js` et `scripts/publier-details.js`
portent `const VILLE = 'quebec'` : les copier dans le volet avec la clé de la ville ;
`scrapers/details-argent.js` doit savoir obtenir le texte d'un sommaire de cette source. Le
workflow de la ville demande les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (sans eux,
l'étape est sautée, le reste tourne). Garder les règles : jamais le détail dans le dépôt public,
montants jamais additionnés, chaque nombre vérifié contre le texte.

**5. Vérifier avec un compte abonné** (une ligne dans `abonnements`, statut `actif`) : suivre un
projet, ajouter un mot-clé et un organisme, ouvrir l'agenda, exporter en Excel et en PDF,
s'envoyer un courriel d'essai d'alerte, demander un détail de l'argent.

## 10. Étape 8 — La campagne « demander une explication »

Sur DossierQuébec, une personne connectée demande des explications sur un projet de loi actif.
Le total par projet est public ; **qui** a demandé quoi ne l'est jamais. À 1000 demandes sur un
même projet, on pousse pour une pétition. Cette chaîne n'existe **pas** dans les volets de ville :
elle est décrite ici parce qu'une ville qui la reprend part de là, et parce qu'elle se confond
facilement avec « Demander le détail de l'argent » (section 9.4), qui est réservé aux abonnés et
porte sur un montant. Le challenge, lui, est gratuit, public en total, et porte sur une décision.

**Les tables** — `scripts/supabase-schema-flags.sql` et `scripts/supabase-schema-campaign.sql`.

- `bill_flags` : une ligne = une personne + un projet, `unique (user_id, bill_id)`. RLS : chacun
  ne voit que ses propres lignes ; les admins voient tout, parce qu'il faut bien compter.
- La limite anti-troll (10 demandes par compte par 30 jours) est dans la **policy d'insertion**,
  pas dans le navigateur — sinon elle se contourne. ⚠️ Elle passe par `my_recent_flag_count()`
  en `security definer` : une sous-requête directe sur `bill_flags` à l'intérieur d'une policy
  de `bill_flags` déclenche « infinite recursion detected in policy » dès qu'il y a des lignes.
- `admins (user_id)` : les seuls comptes autorisés à voir les vrais chiffres.
- `bill_campaign` : la mémoire du digest — `last_count` (compte au dernier envoi, pour détecter
  les paliers franchis), `threshold` (seuil de pétition courant), `escalation_pending` (posé par
  le bouton admin), `terminal_notified`.

**Les agrégats, et pourquoi il en faut deux.** `flag_counts()` est ouverte à `anon` et
`authenticated`, mais ne renvoie que `bill_id` et `cnt` (`having count(*) >= 1`) : c'est ce qui
permet un palmarès public sans trahir personne. `flag_counts_all()` fait la même chose sans seuil
et n'est donnée qu'à `service_role`, pour le cron — Postgres accorde `execute` à PUBLIC à la
création, il faut le révoquer explicitement.

**Le site.** Un bouton sur chaque carte, trois états en bascule : se connecter / ✋ Demander une
explication / ✓ Challengé — retirer. Une section « Projets challengés » sur l'accueil : bande
jaune, grille de trois cartes, « Voir plus » qui remplace les trois visibles et reboucle, partage
direct 𝕏 / Facebook / copier. Un badge « 🔥 N demandes » sur les cartes, un filtre rapide
« 🔥 Challengés », et un panneau admin (Resend ↑ / Reset) sur la page du compte. Paliers
`[500, 1000, 2500, 5000, 25000]`, affichage dès la **première** demande (montrer l'élan plutôt
qu'une liste vide), seuil de pétition à 1000.

**Le digest.** `api/weekly-digest.js`, cron Vercel hebdomadaire qui n'envoie qu'une semaine sur
deux (semaines ISO paires ; `?force=1` pour forcer) : un courriel par personne, ses projets
challengés, le total actuel de chacun, et une note quand un palier a été franchi depuis le
dernier envoi, quand l'admin a déclenché une escalade, ou quand le projet est devenu loi sous le
seuil. Secrets : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `DIGEST_FROM`,
`CRON_SECRET`, `PUBLIC_SITE_URL`. Le lien de désabonnement est un jeton HMAC signé avec
`CRON_SECRET`.

**⚠️ Ce que le découpage multipage avait cassé — corrigé le 24 septembre 2026.** Le palmarès ne
renvoie que des `bill_id` : il faut les rejoindre à des titres, et cette jointure se faisait sur
la variable `bills` de la page. Or l'accueil n'en charge que 4 (`apercuBills` remplit la même
variable que la liste complète). **Neuf** projets challengés, treize demandes, étaient jetés en
silence pendant que l'accueil affirmait « Personne n'a encore demandé d'explication » — une
phrase que le site n'était pas en mesure de savoir vraie. Deux effets du même enfermement : sur
la page des projets, la fonction sortait faute de son conteneur, donc `flag_counts()` n'y était
jamais appelée (filtre « 🔥 Challengés » toujours vide, aucun badge sur les cartes) ; et le
panneau admin, sur une page qui ne charge aucun projet, n'affichait que des « #27053 ». Depuis,
le chargement du palmarès est séparé du rendu, et les titres viennent d'un
`data/site/challengeBills.json` maigre (sept champs, 12,5 ko compressés) chargé à la demande.

**Reste ouvert.** Aucune page ne porte plus `id="flagBox"` : la demande par NUMÉRO, avec le
compteur de demandes restantes du mois, ne s'affiche donc nulle part. Le bouton des cartes fait
le même travail — reste à décider si la boîte revient sur la page du compte ou si la fonction
part.

➜ **La règle à retenir pour toute reproduction : ne jamais faire dépendre un palmarès public de
ce que la page a chargé.** Publier une liste maigre (id, numéro, titre, statut, étape) et l'aller
chercher seulement si l'agrégat renvoie au moins une ligne — une page où rien n'est challengé ne
paie rien.

**Si une ville reprend le mécanisme.** Remplacer `bill_id` par la clé de dossier
(`data-dossier`, section 9.1), ajouter une colonne `ville` comme aux autres tables, allonger les
listes VILLES (section 9.2) — et décider ce qu'on promet à 1000 demandes : au municipal, la
pétition n'a pas le statut qu'elle a à l'Assemblée. Ne rien promettre sur le site qu'on ne puisse
tenir.

## 11. La version anglaise : pas pour une nouvelle ville (pour l'instant)

La version anglaise est un essai, sur Québec seulement : on attend de voir dans Vercel Analytics
si des gens s'en servent (événements `langue_choisie` et `page_en`) avant de la reproduire
ailleurs. C'est Martin qui décidera, chiffres en main. D'ici là, une nouvelle ville est **en
français seulement** :

- Ne pas copier `scrapers/traductions.js` ni `scrapers/lexique-en.js`, et retirer du `refresh.js`
  copié les deux étapes « Traductions anglaises des résumés » et « Lexique anglais » (elles
  coûtent de l'argent chaque matin).
- Ne pas ajouter la ville à `VOLETS_EN` dans `commun/langue.js` : la ville reste en français et
  n'a pas de pastille EN, même pour quelqu'un qui a choisi l'anglais sur Québec.
- Ce qui vient avec la copie des fichiers de Québec (`tr(…)` et `import` de `libelles-en.js`
  dans `app.js`, attributs `data-en` dans les pages) est sans effet hors de `VOLETS_EN` : le
  laisser tel quel, ne pas le compléter pour les textes propres à la ville, ne rien traduire.

Si l'anglais est retenu un jour, la mécanique et ses coûts sont dans le README de Québec
(« La version anglaise »).

## 12. Étape 9 — L'automatisation

Un workflow GitHub Actions par volet, dans le dépôt de DQ, même groupe de concurrence que le
rafraîchissement de DQ (jamais deux pushes en même temps), `permissions: contents: write`,
`npm run refresh` dans le sous-dossier, commit + push de `data/` s'il y a du nouveau.
`.vercelignore` garde `lib/`, `scrapers/`, `scripts/`, README et `package.json` hors du site
servi. Secrets `ANTHROPIC_API_KEY`, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (déjà là,
passés en `env` à l'étape `npm run refresh`) ; sans eux, les résumés et le détail de l'argent
sont sautés, le reste tourne. Les échecs d'étapes secondaires sont des avertissements ; une extraction principale
en échec rend le run rouge après avoir publié ce qui a marché.

**Aucune clé dans le dépôt.** GitHub bloque le push s'il reconnaît une clé (même une clé de
lecture que la ville publie elle-même) : la lire à l'exécution dans le code du portail, comme
un navigateur, ou la mettre en secret.

## 13. Pièges déjà rencontrés (ne pas les refaire)

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
- **Fichiers en fins de ligne Windows (CRLF)** : un remplacement scripté qui cherche `\n` ne trouve
  rien ou abîme le fichier. Détecter la fin de ligne du fichier avant de remplacer.
- **`String.replace(motif, texte)` interprète `$&`, `$'` et `$$`** dans le texte de remplacement
  (un `$$` de SQL devient `$`, un `$'` recopie la fin du fichier) : passer une fonction,
  `replace(motif, () => texte)`.
- **Windows** : `process.exit()` pendant qu'un `fetch` est en cours fait planter Node (assertion
  libuv). Laisser `main()` se terminer.
- **Supabase** : `service_role` a besoin de `grant` explicites sur chaque table ; une fonction
  reçoit `EXECUTE` pour tout le monde (`PUBLIC`) à sa création, il faut le révoquer ; ajouter une
  valeur (un sujet de message, par exemple) oblige à modifier la contrainte `check` de la table.
- **Les sommaires peuvent être cachés dans un document de séance** (Longueuil : colonne « Global »
  du tableau des séances, un PDF SharePoint de 1 000 pages avec chaque sommaire et ses annexes).
  Ouvrir toutes les colonnes de la page des séances avant de conclure « pas de sommaires publics ».
  Un lien de partage SharePoint pose un cookie invité pendant sa redirection : `fetch` ne le rejoue
  pas (401), il faut suivre la redirection à la main.
- **Un jeu de données ouvertes peut être périmé** (Longueuil : districts et élus d'avant 2021 sur
  Données Québec, découpage 2025 seulement sur la carte ArcGIS de la Ville). Recouper avec la page
  des élus avant de dessiner la carte.
- **Une année peut n'avoir aucun vote divisé** (Longueuil, 2026, un seul parti au conseil) : mesurer
  l'année précédente avant de conclure qu'il n'y a pas de page Votes, et le dire sur la page.
- **Un compte ou une liste qui ne se voit qu'une fois connecté** se teste avec un faux client
  Supabase dans le navigateur, et le vrai aller-retour se vérifie après le déploiement.

## 14. Ordre de travail conseillé

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
11. Espace abonnés (section 9) : attributs des fiches, listes de villes, projets suivables et
    fichiers de Mes dossiers, puis le détail de l'argent ; vérifier avec un compte abonné.
12. Campagne « demander une explication » (section 10), si la ville la reprend : tables et
    agrégats d'abord, section publique ensuite, digest en dernier.
13. README à jour à chaque étape : chaque décision technique y a sa raison.
14. Le jour de la réponse de la ville : retirer les trois verrous, sitemap.

## 15. Conventions de travail

- Le terminal de Martin est **PowerShell 5.1** : pas de `&&`, une commande par ligne. Quand
  une commande doit tourner, Claude la lance lui-même et pousse lui-même ; on ne demande pas
  « veux-tu que je… », on fait, on vérifie en ligne, on rend compte en une phrase.
- Les domaines sont **dossierquebec.ca** et **dossiercanada.ca** — jamais `.com`.
- Commits en français, message qui explique le pourquoi, signés avec la ligne
  `Co-Authored-By` indiquée par la session.
- Le README du volet est le journal du projet : ce qui a été mesuré, corrigé, et pourquoi.
- Martin décide du produit ; il réagit sur ce qu'il voit. Montrer (capture, test dans le
  navigateur), proposer une recommandation, et rester **consistant** d'une boîte à l'autre :
  mêmes pastilles, mêmes menus dépliants, mêmes liens discrets.
- Les clés et les secrets ne passent jamais dans la conversation : Martin les entre lui-même
  (Vercel, GitHub, `api.env`). Le SQL à exécuter lui est donné prêt à coller.

## 16. Liste de vérification de fin de mise en place

- [ ] `https://dossierquebec.ca/<cle>/` s'ouvre (barre oblique finale) ; pages en `noindex`, lien
      depuis DQ en `nofollow`, courriel au greffe envoyé et relance programmée.
- [ ] Le menu « Ville : … » montre la ville, depuis les volets comme depuis Mes dossiers et
      Abonnement.
- [ ] Un run planifié du workflow a réussi le lendemain et poussé `data/`.
- [ ] Mes dossiers, avec un compte abonné : projet suivi, mot-clé, organisme, agenda, export Excel
      et PDF, courriel d'essai des alertes, demande de détail de l'argent.
- [ ] Abonnement `?ville=<cle>` : « Le travail derrière le volet… » a ses chiffres.
- [ ] Cellulaire 375 px : aucun débordement horizontal, outils sur une ligne ; thème clair et
      sombre.
- [ ] README du volet à jour ; ce guide aussi, s'il a appris quelque chose.
- [ ] Pas de traduction anglaise qui tourne pour la ville (section 11).
- [ ] Si le challenge est repris : une demande faite depuis un compte apparaît dans la section
      publique **et** dans le filtre « 🔥 Challengés ».
- [ ] Plus tard : retrait des verrous le jour de la réponse de la ville.
