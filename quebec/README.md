# DossierVilleDeQuébec

Veille citoyenne des décisions de la **Ville de Québec**. Même esprit que DossierQuébec, mais
au palier municipal : données publiques seulement, aucune donnée inventée, aucun verdict sur
de vraies personnes.

Ce n'est pas un site de la Ville de Québec et ça n'a aucun caractère officiel.

Pour refaire la même chose ailleurs : `REPRODUIRE-POUR-UNE-AUTRE-VILLE.md` — ce qui se
réutilise tel quel, ce qui se réécrit, dans quel ordre, et les pièges déjà rencontrés.

Le site est servi comme volet de DossierQuébec, à **https://dossierquebec.ca/quebec/**,
et ce dossier vit dans le dépôt de DossierQuébec sous `quebec/` : mêmes déploiements
(Vercel, à chaque push), même tableau de bord, même mécanique de rafraîchissement automatique.
Tant que la Ville n'a pas répondu à la demande d'autorisation, les pages restent hors des
moteurs de recherche (voir « Les pages »).

## Démarrage

```bash
npm install            # une seule dépendance : le SDK Anthropic, pour les résumés
npm run refresh        # la routine quotidienne : décisions, votes, résumés des nouveautés
npm run serve          # http://localhost:4321
```

`npm run refresh` est exactement ce que GitHub Actions lance chaque matin (section suivante).
Les extractions sont gratuites ; seule l'étape des résumés appelle une API payante, et elle est
plafonnée à 120 documents par exécution — sautée s'il n'y a pas de clé (`api.env` ici, ou celui
de DossierQuébec à la racine du dépôt).

```bash
npm run refresh -- --sans-resumes             # sans appel à l'API Claude
npm run refresh -- --complet                  # votes : toute l'année (fait d'office le 1er du mois)
npm run refresh -- --elus                     # force les pages du conseil (sinon : le lundi)
npm run refresh -- --fenetre=30 --plafond=50  # fenêtre des votes et des résumés, plafond de résumés
```

**Une seule dépendance npm**, le SDK Anthropic, et elle ne sert qu'aux résumés. Toute
l'extraction des données publiques — décisions, votes, élus, districts — et tout le site
tournent sur Node seul : `fetch`, des regex, et du SVG écrit à la main.

## Rafraîchissement automatique

`.github/workflows/refresh-villedequebec.yml`, à la racine du dépôt DossierQuébec, lance
`npm run refresh` chaque matin à 08 h 30 UTC — après celui de DossierQuébec, et jamais en même
temps — puis pousse `data/` s'il y a du nouveau ; Vercel redéploie. Le bouton « Run workflow »
sur GitHub permet de le lancer à la main.

Ce que ça demande à la Ville, par jour, à 0,6 s d'écart : les métadonnées de l'année en cinq
requêtes de mille documents ; le texte des seules résolutions jamais lues, une requête par
centaine — c'est là qu'on lit le renvoi vers le sommaire décisionnel ; les votes des soixante
derniers jours, une ou deux ; le texte des sommaires à résumer, une par cinquantaine. **Une
dizaine de requêtes, quel que soit le nombre de documents déjà connus.** C'est ce qui a été
décrit au greffe dans la demande d'autorisation — ne pas l'alourdir sans mettre le courriel à
jour.

Le nom de fichier n'est pas filtrable dans l'index de la Ville, mais le numéro l'est :
`lib/textes.js` demande le texte par listes de numéros (`search.in`) et recoupe sur le nom de
fichier pour ne rien attribuer de travers.

Le lundi, les pages du conseil (membres, districts, agglomération) sont relues. Le 1er du mois,
les votes sont relus sur toute l'année, pour rattraper un vote publié en retard. En janvier,
`archive.js --rotate` range l'année révolue avant la première extraction de la nouvelle.

Une étape qui échoue ne bloque pas les autres : la source en panne garde ses données de la
veille, le reste est publié, et le run est marqué rouge si c'est une extraction principale
(décisions, votes) ou reçoit un avertissement si c'est une étape secondaire (pages du conseil,
résumés, archive).

Secrets et variables du dépôt : `ANTHROPIC_API_KEY` (déjà là pour DossierQuébec) ;
`GPD_CONTACT`, facultatif, pour laisser une adresse de contact dans le User-Agent plutôt que
l'adresse du site.

## Ce que le prototype contient

| Jeu | Source | Ce qu'on en tire |
|---|---|---|
| `data/decisions.json` | index Azure Search du portail GPD | résolutions, sommaires décisionnels, procès-verbaux, tableaux des décisions de l'année en cours |
| `data/votes.json` | même index, texte intégral des résolutions | les appels nominaux : qui vote pour, qui vote contre, décomptes, abstentions, résultat |
| `data/elus.json` | page officielle des membres du conseil | les 22 membres, district, arrondissement, parti, rôles, téléphone, lien de contact |
| `data/resumes.json` | API Claude, à partir du texte des sommaires | 3 à 7 puces en langage clair par décision, plus le montant en jeu |
| `data/districts.json` | Données Québec (CC-BY 4.0) | les contours des 21 districts électoraux, simplifiés, joints aux élus |

## Les pages

Vraies pages HTML séparées, pas des onglets — chacune a son titre, sa description et son URL,
donc elle peut être indexée et partagée telle quelle.

| Page | Contenu |
|---|---|
| `index.html` | accueil : le fil de ce qui a changé depuis la dernière extraction |
| `decisions.html` | toutes les décisions, recherche, filtres, résumés |
| `votes.html` | appels nominaux et décompte des votes contre par personne |
| `conseil.html` | la carte des 21 districts, les 22 membres, et le conseil d'agglomération |
| `lexique.html` | 30 termes du vocabulaire décisionnel, chiffrés sur le corpus |
| `sources.html` | provenance, méthode, limites, état des données |

Le style et la logique sont partagés (`assets/style.css`, `assets/app.js`) et les données sont
lues à l'exécution depuis `data/*.json` : chaque page fait quelques kilo-octets, et une seule
extraction met tout le site à jour.

Tant que la Ville n'a pas répondu, les pages portent `<meta name="robots" content="noindex,
nofollow">`, le `vercel.json` de DossierQuébec ajoute `X-Robots-Tag` sur `/quebec/`, et
le lien depuis DossierQuébec est en `rel="nofollow"`. Le jour où ça débloque : retirer ces trois
verrous et ajouter les pages au `sitemap.xml` de DossierQuébec.

## Le gisement : le portail des documents décisionnels

`decisions.ville.quebec.qc.ca` est une application AzSearch.js. Sa configuration (service
`srch-gpd-p`, index `stgpdprod01-index`, clé de lecture) est publiée **en clair** dans
`js/scripts.js`, que tout navigateur télécharge en ouvrant le portail. On s'en sert de la même
façon que le site lui-même, avec un débit volontairement plus lent.

L'index contient **~207 900 documents** de 2000 à aujourd'hui, ~9 à 10 000 par an :

| Type | Nombre |
|---|---|
| Résolutions | 122 618 |
| Sommaires et mémoires | 73 946 |
| Procès-verbaux | 7 383 |
| Tableaux des décisions | 2 163 |
| Mouvements de personnel | 1 802 |

Deux particularités à connaître :

1. **Le texte intégral est déjà extrait** par la Ville dans le champ `content`. Pas de
   `pdf-parse` à faire — contrairement aux projets de loi de l'Assemblée nationale.
2. **Les valeurs sont stockées URL-encodées dans l'index** (`Sommaires%20et%20m%C3%A9moires`).
   `lib/gpd.js` s'occupe de l'encodage et du décodage dans les deux sens ; un `$filter` sur
   ces champs demande donc un double encodage, géré par `encodeFieldValue()`.

Le champ `Ancienneuadministrative`, présent dans le code du portail, **n'existe pas** dans
l'index de production — l'inclure dans un `$select` renvoie un HTTP 400.

## Comment les votes nominatifs sont obtenus

La plupart des décisions sont adoptées sans appel nominal. Quand un membre « demande le vote »,
le procès-verbal consigne le vote complet, nommément :

```
Monsieur le conseiller Richard Levesque demande le vote.

Ont voté en faveur : monsieur le maire Gaétan Pageau, mesdames les conseillères
Marie-Pierre Boucher, Catherine Deschamps, Elainie Lepage, Catherine Vallières-Roland
et Elisa Verreault et monsieur le conseiller Gabriel Dusablon.

Ont voté contre : monsieur le conseiller Richard Levesque.

En faveur : 7      Contre : 1

Monsieur le président s'est abstenu de voter.

Adoptée à la majorité
```

`scrapers/votes.js` lit ces passages et en fait des données structurées. Pièges rencontrés,
tous corrigés :

- **Le singulier.** Quand une seule personne vote d'un côté, c'est « **A** voté contre : ».
- **Les listes qui traversent une page.** Un segment ne se termine pas à la première ligne
  vide, sinon une liste de 18 noms est tronquée ; il se termine au marqueur suivant.
- **Les hyperliens en plein milieu d'un nom.** Les résolutions contiennent des liens vers le
  sommaire décisionnel, qui ressortent entre le prénom et le nom à l'extraction du PDF.
- **Les connecteurs.** Les noms sont séparés par des virgules, par « et », et par « ainsi que ».
- **« Aucun membre du conseil »** est une liste vide légitime, pas un échec.
- **Les PDF aux glyphes espacés.** Une minorité de documents ressortent en
  `Ca the r ine Va l l i è r e s -Ro land`. Les noms ne sont **pas** extraits dans ce cas :
  la fiche porte `texteSourceDegrade: true` et affiche le texte brut. On préfère un trou
  assumé à un nom inventé.

**Le garde-fou** : chaque vote est recoupé avec le décompte imprimé dans le document lui-même
(`En faveur : 7   Contre : 1`). Tout écart entre les noms extraits et ces chiffres est écrit
dans `avertissements` et affiché sur le site — jamais corrigé en silence. Sur l'extraction de
2026 : 227 appels nominaux, dont 217 se recoupent exactement et 10 signalés comme dégradés.

## Les résumés en langage clair

Le sommaire décisionnel est la note que l'administration rédige avant chaque décision :
exposé de la situation, décisions antérieures, analyse, recommandation. Le « pourquoi » y est
déjà écrit — le résumé ne fait que le rendre lisible. C'est une matière première bien meilleure
que le texte brut d'un projet de loi, et **moins chère à traiter** : le texte est déjà extrait
dans l'index, il n'y a aucun PDF à parser.

```bash
# 1. mettre la clé
cp api.env.example api.env       # puis y coller ANTHROPIC_API_KEY=sk-ant-…

# 2. estimer avant de dépenser — mesure réelle, aucun appel de génération
npm run scrape:resumes -- --dry-run --max=1500

# 3. générer
npm run scrape:resumes -- --max=50              # un échantillon, tout de suite
npm run scrape:resumes -- --max=1500 --batch    # tout, à 50 % du tarif

# la routine quotidienne (ce que fait npm run refresh) : les sommaires des 60 derniers jours
# sans résumé, au plus 120 par exécution, texte lu par lots de numéros — jamais tout l'index
npm run scrape:resumes -- --depuis=2026-07-13 --plafond=120
```

- `--dry-run` compte les jetons de douze documents réels avec `messages.countTokens`, en déduit
  le ratio caractères/jeton et extrapole. Pas de règle de trois approximative.
- `--batch` passe par l'API Batches : **moitié prix**, résultats en moins d'une heure en général.
- Les résumés sont **mis en cache** dans `data/resumes.json` : relancer la commande ne repaie
  jamais un document déjà résumé. `--force` pour tout regénérer.
- `--model=claude-sonnet-5` si tu veux arbitrer autrement le coût. Par défaut : `claude-opus-5`.

La sortie passe par un outil en schéma strict (`strict: true` + `tool_choice` forcé), donc la
structure est garantie valide — pas de JSON à rattraper au parsing.

Ce que la consigne interdit au modèle, et qui est vérifiable dans `scrapers/resumes.js` :
ajouter quoi que ce soit d'absent du document, porter un jugement (sur la décision comme sur
une personne), et meubler quand un document est purement procédural — dans ce cas il doit lever
`sansContenuSubstantiel`, et la fiche affiche « document de procédure ». Le montant est recopié
tel qu'écrit, jamais recalculé. Chaque résumé porte le modèle utilisé et sa date, et la fiche
garde le lien vers le PDF officiel.

## L'infolettre hebdomadaire : le brouillon

```bash
npm run infolettre                                  # la semaine écoulée
npm run infolettre -- --depuis=2026-07-02 --jusqua=2026-07-08
```

`scripts/infolettre.js` écrit `infolettres/AAAA-MM-JJ.md` et `.html` (courriel, styles en
ligne) à partir des données déjà extraites — aucun appel à la Ville, aucun appel IA. Le
brouillon contient les séances de la semaine, les votes divisés **regroupés par dissidence**
(un élu qui vote contre 48 résolutions d'une même séance, c'est une ligne qui dit sur quoi,
pas 48 lignes), les cinq décisions les plus lourdes, les subventions, les sujets. Une même
décision traverse le sommaire, le comité exécutif et le conseil : tout est regroupé par
sommaire pour ne la compter qu'une fois. Les dépôts de rapports et de listes, qui parlent
d'argent sans rien décider, sont écartés des montants. L'introduction s'écrit à la main.

Les brouillons ne sont pas versionnés (`.gitignore`) : ils se relisent, puis partent.

**Avec `--details`**, les documents retenus pour les montants, les subventions et les contrats
passent par `scrapers/details-argent.js` : un outil en schéma strict extrait du sommaire la
nature du montant (dépense, subvention accordée ou reçue, valeur au rôle, investissement
privé…), le bénéficiaire, la durée, le mode d'attribution, les soumissions et l'estimation de
la Ville, la répartition par année, le financement, les conditions et ce qui change. Le type
de montant empêche d'additionner une valeur au rôle ou une subvention reçue avec une dépense ;
le parcours (comité exécutif → conseil → agglomération) est calculé à partir des résolutions,
sans IA. Coût mesuré sur la semaine du 2 au 8 juillet : 30 documents, ≈ 4 $ US — mis en cache
dans `data/details.json`, jamais repayés.

Un piège trouvé en testant : les tableaux d'annexe (analyse des soumissions) arrivent aplatis,
valeurs avant libellés. Avec un appel d'outil forcé — qui désactive la réflexion du modèle —
l'estimation de la Ville et la médiane des soumissions ont été inversées sur AP2026-271. Appel
non forcé, réflexion adaptative et consigne de vérification de cohérence : lecture correcte.
Le brouillon se relit quand même avant l'envoi.

## L'espace abonnés (commun à toutes les villes)

Un seul compte et un seul abonnement pour tous les volets municipaux, parce qu'ils sont tous
des sous-dossiers de dossierquebec.ca : la session Supabase ouverte sur une page vaut partout.

- `/commun/abonnes.js` et `.css` (racine du dépôt) — chargés par chaque page de volet. Ils
  ajoutent « Mes dossiers » dans l'en-tête et, à l'ouverture d'une fiche, « Suivre ce dossier » et
  le « Détail de l'argent » : complet pour un abonné, aperçu et « Abonnez-vous » sinon.
- Un volet n'a que deux choses à fournir : `data-ville="quebec"` sur `<body>`, et dans chaque
  fiche un `<div class="ab-fiche" data-dossier data-numero data-objet>`. La clé de dossier est
  celle qui suit une décision d'une instance à l'autre (le sommaire ici, le numéro de dossier à
  Montréal).
- `/mes-dossiers` et `/abonnement` — pages communes, à la racine.
- `api/detail.js` — sert le détail après avoir vérifié l'abonnement, côté serveur.
- `scripts/supabase-schema-abonnes.sql` — tables `dossiers_suivis`, `abonnements`,
  `abonnement_liste_attente`, `details_argent`, et leurs règles.
- **Alertes par courriel (abonnés).** `api/alertes-projets.js`, Vercel Cron chaque matin à 11 h UTC
  (après le rafraîchissement) : pour chaque abonné qui suit des projets, compare le fichier public
  du projet (`data/projets/<cle>.json`) à ce qu'on lui a déjà signalé (table `alertes_etat`) et
  n'écrit que s'il y a un nouveau dossier, une décision finale ou une nouvelle résolution ; le
  récapitulatif refait accompagne ces nouvelles. Un projet tout juste suivi est mémorisé sans
  courriel. Plafond de 80 Ko (Gmail coupe vers 102 Ko et cache le lien de désabonnement) : les
  projets entrent en entier tant qu'il y a de la place, celui qui déborde est coupé (« …et N
  autres »), les suivants tiennent sur une ligne. Un courriel au plus par personne, tous projets réunis ; si l'envoi échoue, rien
  n'est mémorisé et ce sera redit le lendemain. `?apercu=1` (avec `CRON_SECRET`) montre ce qui
  partirait. Dans Mes dossiers, l'abonné coupe ou remet ses alertes (`alertes_preferences`) et
  peut s'envoyer un essai (3 par 24 h) ; chaque courriel a un lien signé « Ne plus recevoir ces
  alertes » (`api/alertes-desabonnement.js`, aussi en un clic pour les messageries).
  Tables : `scripts/supabase-schema-alertes.sql`.
- **Alertes par mot-clé (abonnés).** Dans Mes dossiers, jusqu'à 20 mots (« 1re Avenue », « Limoilou »,
  « déneigement ») dans la table `alertes_mots_cles` (`scripts/supabase-schema-mots-cles.sql`). Le
  même courriel du matin y ajoute les dossiers récents dont l'objet ou le résumé contient le mot —
  mot entier, sans accents ni majuscules (`contientMot`) — lus dans `data/recentes.json` (dossiers
  qui ont bougé dans les 45 derniers jours, écrit par `projets-publics.js`). Déjà signalé : dans
  `alertes_etat` sous « mot_<id> » ; un mot tout juste ajouté est mémorisé sans courriel ; un dossier
  déjà signalé pour un projet dans le même courriel n'est pas répété. Sans la table, les alertes de
  projets partent quand même.
- **Organismes et entreprises suivis (abonnés).** Dans Mes dossiers, jusqu'à 30 noms dans la table
  `organismes_suivis` (`scripts/supabase-schema-organismes.sql`) ; des organismes seulement, jamais
  des personnes. Le nom est cherché sans sa forme juridique (`sansFormeJuridique` : « inc. »,
  « ltée », « s.e.n.c. »…), puis comme un mot-clé. Pour chacun, la carte déplie tous les dossiers
  de l'année qui le nomment, lus dans `data/dossiers.json` (toute l'année, ~540 Ko compressé,
  chargé seulement pour les abonnés qui suivent un organisme), avec le résumé, le PDF et le
  « Détail de l'argent » à la demande. Les montants restent ceux de chaque résumé : jamais
  additionnés (un engagement, un emprunt et une subvention ne s'additionnent pas). Les
  suggestions du champ viennent de `data/organismes.json` : noms repérés automatiquement dans les
  résumés (forme juridique, « l'organisme X »), donc imparfaits. Les nouvelles décisions
  s'ajoutent au courriel du matin, comme les mots-clés, sous la clé « org_<id> » d'`alertes_etat`.
- **À l'agenda des conseils (abonnés).** `scripts/projets-publics.js` écrit `data/attendues.json` : chaque
  sommaire encore en attente d'une décision finale, avec l'instance qui doit décider (regroupée :
  conseil de la ville, d'agglomération, comité exécutif, arrondissements), la date cible écrite
  par la Ville et le résumé IA. Mes dossiers les montre par instance (menu déroulant) : d'abord
  « Probablement à la prochaine séance » (date cible à venir), puis les autres, chacun dépliable
  sur son résumé. Toujours « probablement » : une date cible n'est pas un ordre du jour. Une
  première version en calendrier avec abonnement d'agenda (25 dates cibles sur 104) a été retirée
  le 14 sept. 2026 (commit 22896d2 dans l'historique).
- **Nous écrire.** « Signaler une erreur dans cette fiche » au bas de chaque fiche ouverte (le
  numéro s'ajoute tout seul) et un formulaire « Nous écrire » dans `/mes-dossiers` (idée, problème,
  erreur). Compte requis. `api/message.js` note si la personne est abonnée, limite à 5 messages
  par 24 heures, garde le message dans la table `messages_utilisateurs`
  (`scripts/supabase-schema-messages.sql`, aucun accès public) et en envoie une copie par Resend à
  `MESSAGES_A` (variable Vercel), avec « Répondre » qui écrit directement à la personne.

**Où en est un dossier.** Chaque sommaire dit, en tête, quelle instance décide et à quelle date
cible (« Conseil d'agglomération de Québec — Instance décisionnelle — 16 septembre 2026 »).
`scrapers/decisions.js` le lit par extraits de texte (le *highlight* de l'index, ~3 ko par
document au lieu du texte entier ; 16 requêtes pour toute l'année, puis quelques-unes par jour),
et marque chaque décision `statutDossier` : `termine` quand une résolution de cette instance
renvoie au sommaire — hors étapes préliminaires (autorisation de soumettre au conseil, avis de
motion, adoption du projet de règlement) —, sinon `en_cours`, avec `etapeFinale` et `echeance`.
Sur 2026 : 1 398 dossiers terminés, 104 en cours. Une fiche terminée affiche « Décision finale »
au lieu de « Suivre » : il n'y a plus rien à suivre.

**Les projets.** `lib/projets.js` définit à la main les projets suivables dans leur ensemble
(tramway, logement social et abordable, matières résiduelles, ExpoCité, milieux humides,
Galeries Charlesbourg, interconnexion Québec–Lévis), chacun par une règle relue sur ses
résultats avec `node scripts/verifier-projets.js`. Deux corrections trouvées ainsi : les objets
tronqués par la Ville (« projet TramC ») cachaient 42 décisions du tramway, et « UTILE » sans
respect de la casse attrapait « remède utile ». Chaque fiche d'un projet affiche « Projet :
Tramway » ; le suivre met toutes ses décisions dans « Mes dossiers », et
`decisions.html?projet=tramway` les filtre dans le volet.

**Où en est le projet.** Un projet ouvert dans « Mes dossiers » affiche, du plus lisible au plus
détaillé : des chiffres (dossiers, résolutions, en attente, dernière décision), le récapitulatif
« Où en est le projet », les décisions par mois et par thème, ce qui attend une décision, puis la
liste, repliée. Les chiffres et les graphiques sont calculés au rafraîchissement, jamais par l'IA. Le
récapitulatif vient de `scrapers/recaps-projets.js` → `data/projets-recaps.json` : quelques
phrases d'ensemble, une ligne du temps de trois à six étapes rattachées aux numéros des décisions,
et « À surveiller ». Sources : l'objet, le résumé et les résolutions de chaque dossier du projet
(pas le détail de l'argent). Vérifié sans relecture humaine, comme le détail : chaque numéro cité
doit appartenir au projet et chaque nombre exister dans les dossiers cités, puis une contre-lecture
retire ce qui est mal attribué. Un projet n'est refait que si l'un de ses dossiers a changé
(signature) ; `refresh.js` l'appelle après les résumés. Environ 0,50 $ pour le tramway, 0,20 $
pour un petit projet ; rien les jours sans nouveauté.

**Ce que « Mes dossiers » télécharge : `data/projets/`.** La page est commune à toutes les villes :
elle ne lit JAMAIS `decisions.json` ni `resumes.json` (des mégaoctets par ville — intenable à
quinze villes). `scripts/projets-publics.js`, dernière étape de `refresh.js`, lui prépare :

- `data/projets/index.json` — `{ generatedAt, projets: { <cle>: { titre, description, annee,
  decisions, dossiers, resolutions, enAttente, derniere, enBref, plusRecent } } }`. Quelques Ko
  pour toute la ville ; sert aux en-têtes et aux suggestions.
- `data/projets/<cle>.json` — `{ cle, titre, description, annee, chiffres, parMois[12],
  themes[{ cle, libelle, couleur, n }], recap | null, dossiers[{ numero, numeros[], date, derniere,
  instances[], statutDossier, etapeFinale, echeance, theme, objet, puces[], pdf, resolutions[{
  numero, instance, date, resultat }] }] }`, dossiers du plus récent au plus ancien. Chargé
  seulement quand on ouvre le projet (13 Ko compressé pour le tramway).

**« Le travail derrière le site » (page Abonnement)** lit `data/travail.json`, produit par
`scripts/travail-public.js` : des comptes tirés des données publiées (documents lus par type et
par mois, résumés, votes, dossiers terminés et en attente, projets, éléments retirés par la
vérification), jamais d'estimation. Venue d'un volet (`/abonnement?ville=quebec`), la page ne
montre que cette ville ; sinon elle additionne les villes qui publient ce fichier (format en tête
du script).

**Une autre ville qui veut ses projets dans Mes dossiers produit ces deux fichiers, avec ces
champs** (et s'ajoute à `VILLES` dans `/commun/navigation.js`). Sans `index.json`, la ville
est simplement absente des suggestions.

**Le détail ne vit plus dans le dépôt.** Le dépôt GitHub de DossierQuébec est public : un fichier
versionné est lisible par tous. `data/details.json` reste en local comme cache (`.gitignore`), et
la copie servie aux abonnés est dans Supabase, publiée par `scripts/publier-details.js` — appelé
automatiquement après chaque extraction si `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont dans
`api.env`. L'abonnement se donne à la main dans Supabase tant que Stripe n'est pas branché.

**Quels dossiers ont le détail (décidé le 14 sept. 2026).** Seulement ceux dont le résumé a trouvé
un montant (875 des 1 502 sommaires de 2026) : les dossiers des projets suivables, extraits d'un
coup, puis chaque matin les nouveaux dossiers (`scripts/details-du-jour.js --projets
--plafond=30`, appelé par `refresh.js`) — environ 30 à 40 $ US par mois. Les autres dossiers de
2026 (~845, ~235 $) attendent des abonnés pour les financer ; les pages Abonnement et Mes dossiers
le disent sous « Le détail de l'argent ». Ce qui est déjà lu se lit dans Supabase (y compris les
détails jugés inutilisables, publiés comme repère mais jamais montrés) : en CI, sans cache local,
rien n'est relu ni repayé. Le workflow demande les secrets `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` ; sans eux, l'étape est sautée.

**Demander un détail manquant (abonnés).** Sur une fiche d'un volet ou un dossier d'organisme dans
Mes dossiers, quand le résumé a un montant mais que le détail n'est pas encore lu, l'abonné voit
« Demander ce détail ». `api/detail.js` (POST) vérifie l'abonnement et l'ajoute à la table
`demandes_details` (`scripts/supabase-schema-demandes-details.sql`), au plus 10 par abonné par
24 heures ; la fiche affiche ensuite « Demandé le … ». Le lendemain matin, `details-du-jour.js`
lit les demandes en attente avant les nouveaux dossiers, dans le même plafond de 30 (le coût
maximal par jour ne change pas), puis note chacune « lu », « deja-lu » ou « sans-montant ». Une
lecture qui échoue reste en attente et repasse le lendemain. Un document lu mais inutilisable
affiche « on n'a pas pu en tirer un détail fiable » au lieu du bouton.

**Export en tableur (abonnés).** Dans Mes dossiers, l'abonné choisit lui-même : quelles décisions
(toute l'année ou un projet), un mot ou un nom facultatif (ses mots-clés et organismes sont
suggérés ; même recherche que les alertes), les groupes de colonnes (dossier toujours ; résumé IA,
montant du résumé, détail de l'argent, liens au choix), « seulement avec un montant », puis Excel
ou CSV. Une ligne par dossier (le sommaire et ses résolutions, `data/dossiers.json`, qui porte
`numeros[]` pour retrouver les dossiers d'un projet cités par une résolution). Le fichier se
fabrique dans le navigateur (`commun/tableur.js` : un vrai .xlsx écrit à la main — archive ZIP
sans compression, relue par SheetJS au test — et un CSV « ; » avec marque UTF-8 pour Excel en
français) ; seul le détail de l'argent vient du serveur, par lots de 150 (`GET
/api/detail?ville=…&dossiers=…`, abonnés seulement, 200 au plus par appel). Le .xlsx a une
feuille « À lire » : sélection, date, sources, et que les montants ne s'additionnent pas. Les
montants restent du texte tel qu'écrit. Le lien « Dites-le-nous » sert à apprendre quels exports
les abonnés veulent vraiment.

**Le coût du détail (~0,26-0,28 $ US par dossier) : ce qui a été mesuré le 14 sept. 2026.**
D'où il vient : environ 40 % la lecture du document (deux fois : extraction et contre-lecture),
60 % la réflexion du modèle (sortie, 5 fois plus chère que l'entrée). Deux pistes testées sur
des dossiers déjà vérifiés, comparées champ par champ :
- **Document allégé** (formulaire GPD1101R + passages d'annexe qui parlent d'argent, ~60 % du
  texte ; étude préalable : montant, bénéficiaire, financement, durée presque toujours dans le
  formulaire) : 0,235 $ par long dossier, mais des durées et des renouvellements perdus (ils
  sont dans les annexes). **Écarté.**
- **Effort de réflexion « high » au lieu de « max »**, document complet : même qualité (le piège
  estimation/médiane d'AP2026-271 et AP2026-278 évité), mais 0,284 $ par dossier — le modèle
  réfléchit presque autant. **Aucune économie.**
Reste le vrai levier : l'**API Batches (−50 %)**, sans effet sur la qualité mais avec un délai
(extraction puis contre-lecture = deux lots). Tout indiqué pour un rattrapage sans urgence, comme
le reste de 2026 (~845 dossiers : ~110 $ au lieu de ~235 $) ; l'étape du matin reste synchrone.
`lireEtVerifier(client, doc, montantResume, { effortExtraction })` fait un document sans rien
écrire, et chaque détail garde ses `jetons` pour mesurer.

## La carte des districts

Contours tirés du jeu « Districts électoraux » de la Ville sur Données Québec, en **CC-BY 4.0** —
donc librement réutilisables avec mention de la source, contrairement aux documents décisionnels.

Le GeoJSON d'origine fait 586 ko et descend au centimètre. `scrapers/districts.js` simplifie les
contours (Douglas-Peucker, avec correction du facteur `cos(latitude)` pour ne pas écraser l'axe
est-ouest) et arrondit à cinq décimales : **586 ko → 46 ko, 14 200 points → 1 805**, sans
différence visible à l'échelle d'une ville.

La carte est dessinée en **SVG, sans librairie et sans serveur de tuiles** : la projection Web
Mercator tient en trois lignes, et aucune requête ne part vers un tiers quand la page s'ouvre.
Coloration au choix par arrondissement ou par parti, districts cliquables au doigt comme au clavier.

Deux choses que ce travail a mises au jour :

- **Le GeoJSON porte déjà `CONSEILLER` et `PARTI`**, à jour depuis l'élection de novembre 2025.
  On les recoupe avec la page des membres du conseil : deux sources de la Ville qui se
  contredisent, c'est une information, pas un détail à écraser. Écart trouvé et consigné : le
  nom du conseiller du district 19 est inscrit deux fois dans le GeoJSON.
- **La page des membres balise la même information de trois façons** selon l'élu —
  `itemprop="affiliation"`, `itemprop="jobTitle"`, ou un `<p>` nu sans aucun `itemprop` — et
  `jobTitle` sert tantôt à la fonction, tantôt au district. Se fier à un seul balisage faisait
  disparaître 8 des 12 fonctions (dont le chef de l'opposition et quatre présidences
  d'arrondissement). Le parseur balaie maintenant tous les `<p>` du bloc.

**Ce que la carte ne prétend pas faire** : les décisions de la Ville ne portent aucune coordonnée.
Impossible de dire « voici ce qui s'est décidé dans votre district ». Le rattachement offert est
celui de l'*arrondissement*, qui lui existe vraiment dans les données — un clic sur un district
mène aux décisions du conseil d'arrondissement correspondant.


## L'année en cours, et l'archive

Le site ne montre que **l'année en cours**. C'est ce qui intéresse quelqu'un qui veut savoir ce
que sa ville décide en ce moment, et ça garde les pages légères.

Les années précédentes ne disparaissent pas : elles sont écrites compressées dans
`data/archives/`, hors du chemin de chargement des pages. Le site ne lit que le manifeste
`data/archives/index.json` pour annoncer ce qui existe — jamais les fichiers d'années eux-mêmes.

```bash
npm run archive -- --list          # état de l'archive
npm run archive -- --year=2025     # archive une année
npm run archive -- --rotate        # archive l'année de decisions.json si elle est révolue
```

`--rotate` est le cas d'usage normal : **l'archive n'est pas un rapatriement massif fait une
fois, c'est ce qui arrive à l'année courante quand l'année tourne.** `npm run refresh` le lance
en premier à chaque exécution ; en janvier 2027, il range 2026 et laisse la place à la nouvelle
année. Les résumés, eux, ne sont pas encore archivés : `data/resumes.json` grossit d'une année
à l'autre, et c'est à régler avant que ça pèse.

Seules les **métadonnées** sont archivées — jamais le champ `content`. Le texte intégral reste
chez la Ville, et le lien vers chaque PDF officiel est conservé. Mesure réelle sur 2025 :
**8 637 documents, 3 814 ko → 413 ko** en gzip.

### Sur le volume, une précision

J'ai écrit plus haut qu'un miroir complet devait passer par une demande au greffe. C'est vrai,
mais pour des raisons de droit et d'usage — **pas de charge**. Une année de métadonnées, c'est
une dizaine de requêtes ; les 21 années de l'index en feraient environ 200, soit quelques
minutes à débit volontairement lent. Ce qui serait lourd, ce serait de rapatrier le texte
intégral des 207 000 documents. On ne le fait pas, et le site n'en a pas besoin.


## Les pastilles de sujet

Chaque décision porte une pastille colorée qui dit de quoi elle parle. **Ce classement n'existe
pas dans les données de la Ville** — il est ajouté ici, et `lib/themes.js` le contient en entier,
lisible d'un bout à l'autre.

Deux bases, dans cet ordre :

1. **L'objet du document.** Les libellés de la Ville sont très formulaires (« Adjudication d'un
   contrat… », « Demande de dérogation mineure… », « Ordonnance … portant sur le stationnement »),
   ce qui rend des règles par mots-clés fiables et vérifiables. Les sujets passent avant les
   véhicules (contrats, finances), et une dernière salve de règles, en fin de liste, ramasse les
   familles que l'année complète a fait apparaître — sans rien voler aux précédentes.
2. **À défaut, l'unité administrative** responsable, quand la Ville la publie — surtout sur les
   sommaires décisionnels.
3. **Faute de mieux, « Administration »** : le tout-venant de la vie municipale qu'aucune règle ne
   reconnaît. Chaque décision a donc une pastille, et `themeSource` (`objet`, `unite` ou `defaut`)
   dit ce qui a tranché — 16 documents sur 4 835 sont classés par défaut.

Résultat mesuré sur 2026 (4 835 documents) :

| Sujet | N | | Sujet | N |
|---|--:|---|---|--:|
| Urbanisme | 907 | | Ressources humaines | 156 |
| Procédure | 647 | | Administration | 149 |
| Subventions | 533 | | Culture et patrimoine | 141 |
| Transport | 515 | | Environnement | 140 |
| Contrats | 479 | | Sécurité publique | 106 |
| Immobilier | 285 | | Développement économique | 81 |
| Loisirs et communauté | 245 | | Motions et hommages | 34 |
| Finances | 207 | | Logement et social | 22 |
| Travaux et infrastructures | 188 | | | |

L'ordre des règles compte, et une subtilité mérite d'être notée : la règle « procédure » est
scindée en deux. Les marqueurs sans ambiguïté (procès-verbal, ordre du jour, période de questions)
passent en premier ; mais « avis de motion » passe en **dernier**, après les règles de sujet — sinon
un avis de motion portant sur l'urbanisme sortirait en « Procédure » au lieu d'« Urbanisme », ce qui
n'apprend rien au lecteur.

## Les fiches repliables

Les fiches sont **repliées par défaut** : on voit la pastille, le numéro, la date et l'objet ; on
clique n'importe où sur la boîte pour lire le résumé et atteindre le PDF. Un bouton « Tout déplier /
Tout replier » agit sur la liste visible.

C'est fait avec `<details>`/`<summary>` natifs, sans JavaScript pour l'ouverture : le clavier, la
recherche du navigateur et les lecteurs d'écran fonctionnent sans qu'on ait à les recoder.


## Le conseil d'agglomération

Saint-Augustin-de-Desmaures et L'Ancienne-Lorette sont des **villes reconstituées** : elles ont
défusionné de Québec. Leurs élus ne siègent pas au conseil municipal de Québec et ne
représentent aucun district de Québec — mais ils **votent au conseil d'agglomération**, sur des
dossiers qui touchent Québec. Ils devaient donc être sur le site.

Vérification faite avec notre propre carte, par test point-dans-polygone sur les 21 districts :

| Point | District de Québec |
|---|---|
| Vieux-Québec (témoin) | district 1 — Cap-aux-Diamants |
| Sainte-Foy (témoin) | district 10 — Le Plateau |
| L'Ancienne-Lorette | **aucun** |
| Saint-Augustin-de-Desmaures | **aucun** |

Les trous dans la carte ne sont pas un défaut de données : ce sont les deux villes reconstituées.

La Ville ne publie pas de page « membres » pour ce conseil. `scrapers/agglomeration.js` le
reconstitue depuis les **listes de présences** des procès-verbaux, qui donnent pour chacun sa
fonction, sa ville et la personne qu'il remplace. Sur 2026 : 12 séances, 15 élus — Québec 8,
Saint-Augustin-de-Desmaures 5, L'Ancienne-Lorette 2.

Deux faits que ça met au jour, bruts : **Bruno Marchand, maire de Québec, est absent des 12
séances** (remplacé par Catherine Vallières-Roland), et **Sylvain Juneau, maire de
Saint-Augustin, l'est aussi** (remplacé le plus souvent par Richard Levesque).

### La commission d'urbanisme, même méthode

La Commission d'urbanisme et de conservation de Québec (CUCQ) siège à peu près chaque
semaine — 31 procès-verbaux de janvier à août 2026 — et ses décisions sont les résolutions
« C.U. » de la page Décisions. Là non plus, pas de page « membres » chez la Ville ;
`scrapers/cucq.js` lit les blocs « Membres votant » et « Membres substituts » des
procès-verbaux, en laissant de côté « Assistent également » (les fonctionnaires). Résultat :
13 personnes, dont 3 élus (la présidence et une vice-présidence sont tenues par des
conseillers municipaux), avec l'assiduité de chacun. La section est au bas de la page
Conseil, après l'agglomération.

### Le bug qui effaçait les femmes

Première version du parseur : `conseill\w+` pour attraper la fonction. **`\w` ne couvre pas les
lettres accentuées** — « conseiller » passait, « conseillère » jamais. Résultat : les cinq
conseillères de Québec siégeant à l'agglomération avaient disparu de la liste, sans la moindre
erreur à l'exécution. Corrigé par une classe explicite (`conseill[a-zà-ÿ]*`), et c'est signalé en
commentaire dans le fichier parce que le piège est facile à refaire ailleurs.


## Le lexique

Le vocabulaire décisionnel municipal est opaque par habitude, pas par nécessité. `lexique.html`
explique 30 termes — résolution, sommaire décisionnel, avis de motion, ordonnance, dérogation
mineure, ville reconstituée, adjudication, gré à gré… — en six catégories.

Le partage des rôles est strict, et la page le dit en haut :

- **Les définitions sont écrites par nous** (`lib/lexique.js`). Ce ne sont ni des textes de la
  Ville, ni des définitions légales.
- **Les décomptes et les exemples viennent des documents.** `scrapers/lexique.js` mesure chaque
  terme sur les 207 915 documents du portail, puis attache un vrai document de l'année en cours
  avec son lien PDF. 28 des 30 termes ont un exemple vivant.

Une définition sans exemple est une affirmation ; avec, elle est vérifiable.

### Ce que la mesure a corrigé

Écrire le lexique « de tête » aurait produit deux entrées fausses, que le décompte a attrapées :

- **P.I.I.A.** — je cherchais « implantation et d'intégration architecturale » : **2 documents**.
  Les documents écrivent l'acronyme pointé (**4 352**), et « plan d'implantation » au long
  (1 018, dont 25 en 2026). Mieux : la facette par année montre que l'acronyme culmine entre 2006
  et 2017 puis **disparaît** — le vocabulaire de la Ville a changé en cours de route, et le
  lexique le dit.
- **Ville reconstituée** — « municipalité reconstituée » ne donnait que 14 documents. Le terme du
  droit et des documents est **« municipalité liée »** (335), et « villes reconstituées » (142).

C'est l'argument pour cette approche : un lexique adossé au corpus se fait corriger par lui.

## ⚠ Avant de passer à l'échelle

Trois choses à régler, et elles sont politiques autant que techniques :

1. **`robots.txt` du portail = `User-agent: * / Disallow: /`.** Le prototype reste à un volume
   modeste, s'identifie (`GPD_CONTACT`) et attend 600 ms entre deux requêtes — mais un miroir
   complet des 207 000 documents doit passer par une demande au greffe de la Ville, pas par un
   fait accompli.
2. **Droit d'auteur.** La Ville autorise la reproduction avec mention de la source et
   **interdit l'usage commercial sans autorisation préalable**. Un site sans publicité et sans
   vente est du bon côté, mais ça vaut d'être confirmé par écrit.
3. **C'est leur facture Azure.** Chaque requête coûte quelque chose à la Ville.

Variables d'environnement :

```bash
GPD_CONTACT="votre@courriel"   # dans le User-Agent, pour qu'on puisse vous joindre ; à défaut, l'adresse du site
GPD_DELAY_MS=600               # délai minimal entre deux requêtes
```

## Ce qui n'est pas encore là

- **Les contrats.** La Ville publie ses listes mensuelles en PDF seulement, et le jeu de
  données ouvert du SEAO ne couvre que les ministères et organismes du gouvernement, pas le
  municipal. Il faut parser les PDF ou scraper la page SEAO par organisation.
- **Le lobbyisme.** Carrefour Lobby Québec refuse l'accès automatisé (HTTP 403) et aucun jeu
  de données ouvert du registre n'existe sur Données Québec. Même mur qu'au provincial.
- **Consulter l'archive depuis le site.** Les années révolues sont conservées (voir plus haut)
  mais aucune page ne les lit encore — seul leur relevé est affiché.
- **Les alertes et le suivi.** À reprendre de DossierQuébec (Supabase + Resend + Vercel Cron).

## Ce que les données disent déjà

Sur l'année 2026, les appels nominaux se répartissent ainsi : **175 au conseil d'agglomération**
contre **52 au conseil de la ville**. Le conseil municipal est composé à 19 sur 22 d'un seul
parti, donc peu contesté ; c'est au conseil d'agglomération — là où siègent les maires des
villes reconstituées — que se jouent les votes serrés.

C'est le genre de constat que le site doit présenter en chiffres bruts et sourcés, sans
l'interpréter à la place du lecteur.

## Structure

```
lib/gpd.js               client Azure Search : throttle, réessais, encodage/décodage
lib/textes.js            texte intégral par lots de numéros (search.in) : on ne lit que le nouveau
lib/themes.js            règles de classement thématique (pastilles de sujet)
lib/lexique.js           définitions du lexique (écrites à la main)
scrapers/decisions.js    miroir incrémental des documents décisionnels
scrapers/votes.js        registre des votes nominatifs (analyse de texte)
scrapers/elus.js         les 22 membres du conseil (microdonnées schema.org)
scrapers/districts.js    contours des 21 districts, simplifiés et joints aux élus
scrapers/agglomeration.js membres du conseil d'agglomération, via les listes de présences
scrapers/cucq.js         membres de la Commission d'urbanisme et de conservation, même méthode
scrapers/lexique.js      mesure chaque terme du lexique sur le corpus + un exemple
scrapers/resumes.js      résumés en langage clair (API Claude, avec cache et estimation)
scrapers/archive.js      archivage compressé des années révolues
scripts/refresh.js       la routine quotidienne, tolérante aux pannes (local et GitHub Actions)
scripts/static-server.js serveur statique local
scripts/reparer-echappements.js  répare les accents échappés (\uXXXX) dans les résumés
assets/style.css         style commun à toutes les pages
assets/app.js            logique commune ; chaque page charge ce dont elle a besoin
index.html decisions.html votes.html conseil.html lexique.html sources.html
data/                    sorties JSON
../.github/workflows/refresh-villedequebec.yml   le workflow quotidien (racine du dépôt DossierQuébec)
../.vercelignore         garde lib/, scrapers/ et scripts/ hors du site servi
```
