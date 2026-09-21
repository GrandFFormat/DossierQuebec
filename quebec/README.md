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

**Où en est la demande.** Courriel au greffe et aux données ouvertes le 11 sept. 2026
(N/Réf. 2026-09-11-2684). La Ville a répondu le 16 sept. en redirigeant vers le **311** ; la demande
y a été redéposée le même jour, en 974 caractères (limite de 1 000), avec les deux mêmes questions —
le `robots.txt` du portail et l'usage commercial — et, cette fois, **l'abonnement de 3 $ par mois
nommé explicitement**, puisqu'il existe depuis le 14 sept. Sans réponse, relancer vers le 2 oct.

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

## L'infolettre : le compte rendu mensuel

```bash
npm run infolettre                                  # le mois précédent, au complet
npm run infolettre -- --mois=2026-08
npm run infolettre -- --depuis=2026-08-16 --jusqua=2026-09-14
```

`scripts/infolettre.js` écrit `infolettres/AAAA-MM.html` (le courriel, en couleur) et `AAAA-MM.md` (la
version texte) à partir des données déjà extraites — aucun appel à la Ville, aucun appel IA. Mensuel
plutôt qu'hebdomadaire (décidé le 15 sept. 2026) : les alertes du matin couvrent déjà ce qui bouge
pour chacun ; le compte rendu, lui, raconte le mois à tout le monde.

Le contenu : le mois en chiffres (quatre tuiles), les séances, les plus gros montants avec les puces
du résumé, **toutes** les subventions et **tous** les contrats avec un montant, du plus gros au plus
petit (Martin tient aux petits montants), les votes divisés regroupés par séance et par groupe
d'élus minoritaire, et les sujets dans leurs couleurs du site. Une même décision traverse le
sommaire, le comité exécutif et le conseil : tout est regroupé par sommaire pour ne la compter
qu'une fois. Les dépôts de rapports, les « 0 $ » et les valeurs au rôle sont écartés des montants.

**Dans l'édition gratuite, le détail de l'argent n'y est pas** : il y sert seulement à reconnaître la nature d'un montant (une subvention reçue d'un gouvernement n'entre pas dans le total des subventions accordées).

**Deux éditions qui se ressemblent**, dans la même commande : `AAAA-MM.html` (gratuite) et `AAAA-MM-abonnes.html`. Tout ce qui est réservé aux abonnés est **doré**, avec la marque « ★ ABONNÉS », aux mêmes endroits dans les deux : rempli pour l'abonné, fermé (🔒, ce qu'on y trouverait, sans les chiffres) pour les autres. Ce qui est doré : le détail de l'argent des plus gros montants (qui reçoit, soumissions, estimation de la Ville, par année, financement, durée — cinq lignes au plus), et l'agenda des conseils des 45 prochains jours (`attendues.json`, dit approximatif). Là où le détail n'est pas lu, rien : jamais de « demander le détail » dans un compte rendu (Martin, 15 sept. 2026 : pas attirant). En bas, l'invitation à s'abonner (gratuite) ou le rappel de Mes dossiers (abonnés).

**`--details`** fait d'abord lire le détail des 8 plus gros montants et de toutes les subventions et de tous les contrats du mois qui ne l'ont pas (≈ 0,25 à 0,30 $ US chacun, mis en cache et publié pour les abonnés) : pour août 2026, 5 puis 28 documents, 8,57 $ en tout. Sous chaque subvention et chaque contrat, l'édition abonnés met alors une ligne dorée « ★ » : le nombre de soumissions et l'écart de la plus basse avec l'estimation de la Ville, ou le chiffre clé du document (coût total du projet, budget de l'événement), le nombre de versements, la date de fin. Sous un **contrat**, c'est un petit bloc : l'entreprise retenue et son prix, les autres soumissions (avec « non conforme » s'il y a lieu), l'estimation de la Ville et l'écart, le mode d'attribution (appel d'offres ou gré à gré), la durée. Dans l'édition gratuite, la même ligne est fermée : « 🔒 ★ Abonnés : 4 soumissions comparées à l'estimation de la Ville · 3 conditions » — ce que le détail contient, sans les chiffres (Martin, 15 sept. 2026 : c'est correct de montrer ce qui manque). À partir des dossiers du 15 sept. 2026, l'étape du matin les lit déjà. Une édition abonnés transférée montre ces quelques lignes de détail : c'est accepté, le reste demande la connexion.

**Trois sortes de courriels (16 sept. 2026).** Par ville : `mensuel` (le gros compte rendu du mois),
`conseil` (après chaque séance du conseil de la ville, environ aux deux semaines) et `arrondissement`
(après chaque séance d'un arrondissement choisi dans un menu déroulant ; on peut en suivre plusieurs).
Les sortes et les arrondissements vivent dans `api/_infolettre.js` (`TYPES_INFOLETTRE`,
`ARRONDISSEMENTS`) et sont servis au navigateur par `?action=etat` : le formulaire s'adapte tout seul.
Une ligne d'inscription par adresse, par ville, par sorte et par arrondissement ; un numéro publié ne
part qu'aux inscrits de sa sorte. SQL : `scripts/supabase-schema-infolettre-types.sql`. Dans Mes
dossiers, la même boîte, « Mes courriels », porte aussi l'alerte du matin (abonnés).

Le courriel **après une séance** vient du même script : `npm run infolettre -- --seance=2026-08-25`
(conseil de la ville) ou `--seance=AAAA-MM-JJ --instance=charlesbourg` (un arrondissement ; mêmes clés
que `api/_infolettre.js`). Mêmes sections et mêmes deux éditions que le mensuel, pour les seules
résolutions de cette instance ce jour-là (et les sommaires qu'elles citent) : résolutions adoptées,
montants, subventions, contrats, votes divisés de la séance, liens vers le procès-verbal et le tableau
des décisions, et l'agenda en doré (pour un arrondissement : l'agenda de tous les conseils
d'arrondissement, parce que les sommaires ne disent pas lequel — corrigé le 17 sept., il était
toujours vide). Fichiers `infolettres/<instance>-<date>.html`. `--publier` le range comme numéro
`conseil` ou `arrondissement` (clé : la date de la séance — les contraintes SQL `mois ~ 'AAAA-MM'`
du premier schéma l'auraient refusé ; `supabase-schema-infolettre-types.sql` les élargit depuis le
17 sept.). Le déclenchement automatique après chaque séance reste à faire.

**Pourquoi Québec seulement (17 sept. 2026).** Martin a remarqué que « Mes courriels » ne montre
que les arrondissements de Québec : la boîte reflète `VILLES_INFOLETTRE`, et c'est voulu — une ville
n'y entre que quand ses numéros peuvent sortir (le courriel de bienvenue promet « le premier arrive
le … »). Cinq lectures indépendantes ont établi ce qui manque ailleurs : le générateur est propre à
Québec (chemins, instances, types de documents au pluriel, textes, détail de l'argent via
`scrapers/details-argent.js` et l'index de la Ville) ; Montréal n'a ni résumés ni agenda et publie
ses procès-verbaux un à deux mois après la séance (un numéro d'arrondissement serait une liste de
titres, 18 arrondissements sur 19) ; Lévis a de quoi faire le mensuel et le conseil (résumés,
montants, votes), mais ses 483 résolutions d'arrondissement n'ont ni sommaire ni résumé ni montant
(une liste de dérogations et de PIIA, un à quatre mois après) ; Longueuil n'a aucun conseil
d'arrondissement dans ses données (Vieux-Longueuil et Saint-Hubert sont `actif: false` dans
`lib/lgl.js`, Greenfield Park n'a pas de document de séance), et le volet attend la réponse de la
Ville sur l'usage de son contenu. La boîte le dit désormais (« Offert pour Québec seulement pour
l'instant »). Chemin si on y va : rendre le générateur générique (`--ville`, un module de
configuration par ville, sortie de Québec comparée octet pour octet), puis Lévis en mensuel +
conseil d'abord, Longueuil après la réponse de la Ville, Montréal quand ses sommaires s'ouvrent ;
« Mon arrondissement » hors Québec seulement avec des résumés d'arrondissement. Le rythme promis
« environ aux deux semaines » pour le conseil est celui de Québec : à rendre propre à chaque ville.

**L'inscription et l'envoi (15 sept. 2026).** Une ligne par adresse et par ville (`infolettre_inscriptions`, `scripts/supabase-schema-infolettre.sql`) : les villes offertes sont celles de `VILLES_INFOLETTRE` dans `api/_infolettre.js` (Québec pour l'instant). Formulaire sur l'accueil du volet (`commun/infolettre.js`) : courriel « Confirmer mon inscription » (lien signé), puis le plus récent compte rendu publié part aussitôt avec un bandeau « Bienvenue ! Le prochain arrive au début de… ». Connecté avec la même adresse (déjà vérifiée) : confirmé tout de suite ; dans Mes dossiers, une case par ville. Garde-fous : pot de miel, une confirmation par adresse aux 10 minutes, 30 par heure en tout ; la réponse ne dit jamais si une adresse est déjà inscrite. Chaque courriel porte « ne plus recevoir celui de Québec » et « me désinscrire de tout », et l'en-tête de désinscription en un clic. L'édition abonnés va aux adresses d'un abonnement actif.

**Chaque mois** : `npm run infolettre -- --mois=AAAA-MM --details`, relire les deux fichiers, puis `npm run infolettre -- --mois=AAAA-MM --publier` (dans `infolettre_numeros` ; refusé si le numéro est déjà parti). Avec `--pour-tous` (Martin, 17 sept. 2026, pour le numéro d'août) : l'édition gratuite devient l'édition abonnés offerte à tout le monde — même contenu doré, mais l'en-tête, l'encadré d'ouverture et le pied disent que c'est offert ce mois-ci et invitent à s'abonner ; l'édition abonnés, elle, ne change pas. Le cron quotidien des alertes (11 h UTC) l'envoie aux inscrits confirmés qui ne l'ont pas eu en bienvenue, **après les alertes des abonnés payants, avec ce qu'elles ont laissé** des 90 envois du jour (Resend gratuit : 100 par jour pour tout) ; le reste part les jours suivants. Jusqu'au 18 sept. 2026, l'infolettre passait avant et pouvait prendre 90 envois sur 100 : un jour de parution, il ne restait que 10 courriels pour les alertes payées. Resend Pro (20 $ US par mois, 50 000 courriels) le jour où abonnés et inscrits approchent 60 ou 70.

**Le mot du mois**, facultatif : un fichier `infolettres/AAAA-MM-mot.md` écrit à la main s'ajoute sous
le titre. Le courriel est fait de tableaux et de styles en ligne, sans variables CSS ni `color-mix`,
pour s'afficher pareil dans Gmail, Outlook et sur cellulaire. Les brouillons ne sont pas versionnés
(`.gitignore`) : ils se relisent, puis partent.

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
- **Les limites du palier citoyen** (20 sept. 2026, `scripts/supabase-schema-limites.sql`) : 3 projets
  suivis sans abonnement et 10 avec, 5 alertes par mot-clé, 3 organismes, 10 exports par mois civil.
  Les trois premières sont des triggers Postgres ; les exports sont comptés côté serveur par
  `api/export.js` dans la table `exports`. Les anciens plafonds (500/20/30) restent écrits dans les
  scripts de création : c’est le script des limites qui fait foi.
- **Alertes par mot-clé (abonnés).** Dans Mes dossiers, jusqu’à 5 mots (« 1re Avenue », « Limoilou »,
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
  de l'année qui le nomment, lus dans `data/dossiers.json` (toute l'année, ~560 Ko compressé,
  chargé seulement à l'ouverture de la boîte — voir « Ce que Mes dossiers charge »), avec le résumé, le PDF et le
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
`api.env`. L'abonnement se paie par Stripe (plus bas, « Le paiement : Stripe ») ; il peut aussi se
donner à la main dans Supabase (`source = 'manuel'`), et Stripe n'y touche pas.

**Quels dossiers ont le détail (décidé le 14 sept. 2026).** Seulement ceux dont le résumé a trouvé
un montant (875 des 1 502 sommaires de 2026) : les dossiers des projets suivables, extraits d'un
coup, puis chaque matin les nouveaux dossiers (`scripts/details-du-jour.js --projets
--plafond=30`, appelé par `refresh.js`) — environ 30 à 40 $ US par mois. Les autres dossiers de
2026 (~845, ~235 $) attendent des abonnés pour les financer ; les pages Abonnement et Mes dossiers
le disent sous « Le détail de l'argent ». Ce qui est déjà lu se lit dans Supabase (y compris les
détails jugés inutilisables, publiés comme repère mais jamais montrés) : en CI, sans cache local,
rien n'est relu ni repayé. Le workflow demande les secrets `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` ; sans eux, l'étape est sautée.

**Demander un détail manquant (abonnés seulement).** Sur une fiche d'un volet ou un dossier
d'organisme dans Mes dossiers, quand le résumé a un montant mais que le détail n'est pas encore
lu, l'abonné voit « Demander le détail de l'argent ». `api/detail.js` (POST) vérifie
l'abonnement et l'ajoute à la table `demandes_details`
(`scripts/supabase-schema-demandes-details.sql`), au plus 10 par abonné par 24 heures ; la fiche
affiche ensuite « Demandé le … ». Le lendemain matin, `details-du-jour.js` lit les demandes en
attente avant les nouveaux dossiers, dans le même plafond de 30 (le coût maximal par jour ne
change pas), puis note chacune « lu », « deja-lu » ou « sans-montant ». Une lecture qui échoue
reste en attente et repasse le lendemain. Un document lu mais inutilisable affiche « on n'a pas
pu en tirer un détail fiable » au lieu du bouton.

**Visible pour tous, utilisable par les abonnés (Martin, 17 sept. 2026).** Un visiteur ou un
compte gratuit voit, au même endroit, « 🔒 Demander le détail de l'argent · réservé aux
abonnés », avec un lien vers la page Abonnement ; il n'a pas de bouton, et le serveur refuse sa
demande (403). Seulement pour Québec, où les demandes sont lues : sur les volets en prototype, rien
n'est proposé aux non-abonnés. La page Abonnement et Mes dossiers citent la demande parmi les
avantages. Vérifié le 17 sept. par trois relectures indépendantes (serveur, interface, états
d'abonnement) : aucun chemin ne permet à un non-abonné de créer une demande — la table n'a aucune
politique RLS, seul le serveur y écrit, et le `user_id` vient du jeton vérifié. Durcissements
ajoutés à cette occasion :

- **Une seule définition d'« abonné actif »** : `estActive` (`api/_stripe.js`), importée par
  `api/detail.js`, `api/alertes-projets.js` et le script du matin (statut `actif`, fin nulle ou
  future).
- **Le matin revérifie l'abonnement** : seules les demandes d'abonnés encore actifs sont lues, au
  plus 10 par personne (abonnements lus par pages de 1000). Une demande faite avant une
  annulation attend sans coûter de lecture, et revient si la personne se réabonne. En miroir,
  `api/detail.js` ne montre « déjà demandé par un abonné » que si l'auteur est encore actif :
  sinon, les autres abonnés gardent le bouton, et le dossier finit lu grâce à leur demande.
- **Plus de fausse promesse** : un dossier classé « sans-montant » n'est plus proposé (« ce dossier
  n'a pas de montant à détailler ») — et le matin rouvre ces demandes si un résumé refait trouve un
  montant. Une demande notée « lu » dont le détail n'est pas dans Supabase (publication échouée)
  est rouverte quand l'abonné redemande, au lieu d'un « déjà traitée » qui ne montre rien.
  `projets-publics.js` marque `procedure: true` les dossiers dont le résumé est sans contenu
  substantiel : Mes dossiers affiche leur montant, comme le volet, mais ne propose pas de le
  demander (le matin ne les lit pas).
- **Grâce d'impayé non renouvelable** : en `past_due`, un accès déjà expiré le reste d'une période
  à l'autre (sinon, trois jours gratuits reviendraient chaque mois si Stripe laisse l'abonnement
  impayé). Dans Stripe, régler « après les relances : annuler l'abonnement » reste le plus simple.
- **Messages justes** : le serveur distingue 403 « abonnement inactif » (compte reconnu, plus
  d'abonnement : « votre abonnement n'est plus actif », avec le lien), 403 « réservé aux abonnés »
  (pas de session) et 503 « abonnement non vérifiable » (Supabase ne répond pas : « réessayez »,
  jamais un faux verrou ni un faux aperçu à un abonné payant). L'export suit la même règle, et les
  fiches des volets envoient la session du moment (le jeton se renouvelle toutes les heures).
- **SQL** : `revoke all on public.demandes_details from anon, authenticated;` en plus de la RLS —
  à exécuter dans Supabase (le fichier `scripts/supabase-schema-demandes-details.sql` est
  ré-exécutable tel quel).

Restent notés, sans correctif : la clé d'un dossier de Lévis diffère entre Mes dossiers
(`FIN-2026-038.pdf`) et le volet (`FIN-2026-038`), sans effet tant que le détail de Lévis est
sur la glace ; le quota de 10 par 24 h se compte avant l'ajout (des demandes lancées en parallèle
peuvent le dépasser, d'où le plafond par personne du matin) ; la 11e demande d'un abonné très
actif attend un matin de plus que promis ; les remboursements et contestations Stripe ne coupent
pas l'accès avant la fin de la période.

**Export en tableur (abonnés).** Dans Mes dossiers, l'abonné choisit lui-même : quelles décisions
(un projet à la fois : « toutes les décisions de l'année » est grisée et ne sort sous aucune forme, décision de Martin du 14 sept. 2026), un mot ou un nom facultatif (ses mots-clés et organismes sont
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

**PDF à imprimer.** Même sélection, mais une fiche par dossier (21 colonnes ne tiennent pas sur une
page) : `rapportImprimable()` dans `mes-dossiers.html` écrit une page autonome dans une nouvelle
fenêtre — ouverte pendant le clic, sinon le bloqueur de fenêtres la refuse — qui lance
l'impression ; « Enregistrer au format PDF » fait le fichier, liens cliquables. Pas de
bibliothèque PDF : le navigateur met en page mieux qu'elle et garde tous les accents.

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

### Ce que Mes dossiers charge (14 sept. 2026)

Les boîtes des abonnés (mots-clés, organismes, export, agenda) sont fermées au départ et ne
chargent leurs fichiers qu'à leur **première ouverture** (`aLOuverture` dans `mes-dossiers.html`).
À l'arrivée, un abonné ne télécharge plus que l'index des projets et `attendues.json` (le compte de
l'agenda) : ~35 Ko compressés au lieu de ~700 Ko (~1,1 Mo en anglais). Ensuite, à la demande :
`recentes.json` (~100 Ko) pour les mots-clés, `organismes.json` et `dossiers.json` (~560 Ko, une
seule fois pour les organismes et l'export) et, en anglais, `resumes-en.json` (~440 Ko) pour
l'agenda, l'export et les projets. Une boîte restée ouverte d'un rendu à l'autre se remplit tout de
suite. `dossiers.json` grossit jusqu'en décembre : c'est lui qu'on ne veut pas faire payer à
chaque visite, surtout sur cellulaire.

### Le paiement : Stripe (construit le 14 sept. 2026, en mode essai)

Un seul abonnement pour toutes les villes : **10 $ CA par mois ou 80 $ CA par an** (Martin, 18 sept.
2026 ; c'était 3 $ par mois jusque-là). Le navigateur n'envoie que « mensuel » ou « annuel » ; le
serveur choisit le prix Stripe (`STRIPE_PRIX`, `STRIPE_PRIX_ANNUEL`) et **vérifie auprès de Stripe
qu'il vaut bien 10 $ par mois ou 80 $ par an avant d'ouvrir le paiement** (`prixConforme`,
`api/_stripe.js`) : un ancien `price_…` oublié dans Vercel répond « prix mal configuré » au lieu de
vendre au mauvais montant. Sans `STRIPE_PRIX_ANNUEL`, seul le mensuel est offert. Stripe tient la carte, les factures,
les renouvellements et l'annulation ; le site ne voit jamais une carte. Aucune bibliothèque : l'API
Stripe est du formulaire HTTP et la signature des webhooks un HMAC (`api/_stripe.js`).

- **S'abonner** : la page Abonnement demande l'état à `GET /api/abonnement`, puis « S'abonner »
  crée une session Stripe Checkout (`POST /api/abonnement?action=paiement`) rattachée au compte
  (`client_reference_id` et `metadata.user_id`). Retour sur `/mes-dossiers?abonnement=merci`, qui
  attend la confirmation (30 s au plus) et ouvre les boîtes des abonnés.
- **L'accès n'est donné que par le webhook** (`api/stripe-webhook.js`, signature vérifiée sur le
  corps brut). Pour chaque événement, il relit l'abonnement chez Stripe et le recopie dans la table
  `abonnements` : l'ordre des événements n'importe pas, et en rejouer un ne change rien. Rien d'autre
  ne change dans le site : `api/detail.js`, les alertes et Mes dossiers lisent déjà
  `statut = 'actif'` et `fin` dans le futur.
- **`fin`** : fin de la période payée + 2 jours (un renouvellement dont le webhook tarde ne coupe
  rien) ; annulé par l'abonné : exactement la fin de la période payée ; carte refusée
  (`past_due`) : 3 jours après le début de la période, pendant que Stripe réessaie.
- **Gérer** (carte, factures, annulation) : le portail client de Stripe
  (`POST /api/abonnement?action=portail`), depuis la page Abonnement ; Mes dossiers y renvoie.
- **Un abonnement donné à la main** (`source = 'manuel'`, actif) n'est jamais modifié par Stripe.
- **Ouvert ou pas** : sans `STRIPE_OUVERT=1`, le bouton n'apparaît qu'aux adresses de
  `STRIPE_ESSAI` ; tout le monde d'autre voit la liste d'attente, comme avant. C'est ce qui permet
  d'essayer en production sans ouvrir l'abonnement.

**Variables Vercel** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX` (mensuel),
`STRIPE_PRIX_ANNUEL`, `STRIPE_ESSAI`,
puis `STRIPE_OUVERT=1` le jour de l'ouverture. **Supabase** : `scripts/supabase-schema-stripe.sql`
(colonnes `stripe_customer_id`, `stripe_subscription_id`, `annulation_prevue`). **Stripe** : le
produit et son prix récurrent, le webhook vers `https://dossierquebec.ca/api/stripe-webhook`
(`checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`,
`invoice.payment_failed`), et le portail client enregistré une fois (Paramètres → Facturation →
Portail client).

**Essai de bout en bout le 14 sept. 2026**, en production et en mode test (compte `+essai` de
Martin) : paiement Checkout, ligne `abonnements` écrite par le webhook 4 secondes plus tard, boîtes
des abonnés ouvertes, puis annulation par le portail (`annulation_prevue`, fin ramenée à la fin du
mois payé). Le produit, le webhook et le portail existent aussi en mode réel, prêts pour l'ouverture.

**Durci le 18 sept. 2026, après un audit de lancement** (cinq angles — bascule Stripe, promesses,
droit québécois, exploitation, sécurité — 70 constats, chacun contre-vérifié) :

- **`STRIPE_OUVERT=1` ne vaut qu'avec une clé du mode réel** (`paiementOuvert`). Posé sur des clés
  d'essai — le geste littéral de « débarrer » — il aurait donné l'accès payant à n'importe qui contre
  la carte 4242, que la page affiche elle-même en mode essai.
- **Un seul client Stripe par compte** : celui de la ligne s'il existe dans ce mode, sinon celui que
  Stripe connaît sous cette adresse, sinon un nouveau (`clientStripe`). Avec `customer_email`, deux
  paiements ouverts en parallèle créaient deux clients, dont un invisible dans le portail.
- **Jamais de vente par-dessus un abonnement vivant** : un impayé que Stripe relance encore renvoie
  au portail (changer de carte) ; un abonnement payé chez Stripe dont la ligne ne le dit pas (webhook
  perdu) est resynchronisé au clic. Deux abonnements vivants malgré tout : `synchroniser` garde le
  premier et écrit `DOUBLE ABONNEMENT` dans les journaux Vercel — à annuler et rembourser dans Stripe.
- **Ligne du mode essai lue avec les clés réelles** (« No such customer ») : le portail répond 404 et
  le paiement repart sur un client neuf, au lieu de « Stripe ne répond pas » à chaque clic.
- **Supabase en panne** : 503, jamais « pas abonné » ni un nouveau paiement.
- **Session Checkout** : adresse de facturation exigée (le contrat à distance doit porter le nom et
  l'adresse du consommateur), carte seulement (payé d'avance : la rétrofacturation reste possible),
  plus de codes promo (la Loi 10 exige un avis 2 à 10 jours avant la fin d'une période à prix
  réduit, et rien ne l'envoie), payable 31 minutes au lieu de 24 heures.
- **« Annuler mon abonnement »** sur la page Abonnement (`action=annuler`) : le portail ouvert
  directement sur l'annulation, sans motif demandé — la Loi 10 (en vigueur le 12 sept. 2026) exige
  un bouton facile à repérer pour un abonnement conclu en ligne.
- **Compte supprimé alors que Stripe débite encore** : le webhook répond 200 « sans-compte » et
  écrit `ABONNEMENT SANS COMPTE` dans les journaux, au lieu de 500 et de trois jours de réessais.
  Avant de supprimer un compte (demande Loi 25), annuler son abonnement dans Stripe.

**Clé Stripe** : une clé restreinte suffit — Checkout Sessions et Customer portal en écriture,
Customers en écriture, Subscriptions et Prices en lecture ; rien d'autre.

**Avant d'ouvrir en réel** : la réponse du greffe (usage commercial, N/Réf. 2026-09-11-2684) — et
les lettres aux greffes de Montréal et de Lévis promettent « aucun usage commercial » ; ~~le forfait
Vercel Pro~~ (fait le 18 sept. 2026 : Hobby interdit « tout moyen de demander ou traiter un paiement
des visiteurs ») ; des
conditions (qui vend, avec nom, adresse, téléphone et courriel ; annulation ; remboursement)
acceptées avant le paiement, et la copie du contrat envoyée dans les 15 jours ; une politique de
confidentialité avec le responsable nommé (Loi 25 ; adresses traitées hors Québec : Resend en
Virginie, Supabase, Vercel) ; l'immatriculation au REQ si l'activité se fait sous « DossierQuébec » ;
retirer « prix prévu » des pages Abonnement et Mes dossiers ; une promesse par ville qui dit vrai
(seul Québec a tout) ; le détail de l'argent livré plusieurs matins de suite ; un SMTP à soi pour les
liens de connexion de Supabase ; refaire les deux prix, le webhook et le portail en mode réel (ils
ne passent pas du mode essai au réel), changer les trois clés, puis **redéployer en décochant
« Use project's Ignore Build Step »** (sinon `scripts/vercel-deployer.sh` annule le redéploiement du
même commit et les nouvelles variables ne s'appliquent pas) ; avant la bascule, annuler tout de suite
les abonnements d'essai et vider les lignes `source = 'stripe'` ; faire valider les taxes (TPS/TVQ,
seuil du petit fournisseur) par un comptable.

**Expéditeur des courriels** (15 sept. 2026) : la variable Vercel `DIGEST_FROM` vaut
`DossierQuébec <compte-rendu@dossierquebec.ca>` — domaine dossierquebec.ca vérifié dans Resend
(DNS chez Cloudflare, région North Virginia, la seule proche). Elle servait avant une adresse en .com.

## La version anglaise (étape 1, 14 sept. 2026)

Le français reste la langue par défaut et celle des documents officiels. La pastille **EN** (à côté
du menu des villes ; sur cellulaire, au bout des liens) bascule le volet Québec et les pages
communes en anglais ; le choix est gardé (`localStorage` `dvq:langue`) et `?lang=en` l'impose dans
un lien. Tout passe par `commun/langue.js` :

- **HTML des pages** : `data-en="…"` remplace le contenu d'un élément (et `data-en-placeholder`,
  `data-en-title`, `data-en-aria-label`, `data-en-content`), appliqué par `traduirePage()` depuis
  `navigation.js`. Le script en ligne de chaque page cache la page le temps de traduire (1,5 s au
  plus), pour ne pas montrer le français une fraction de seconde.
- **JavaScript** : `tr('français', 'English')` dans `assets/app.js`, `commun/abonnes.js`,
  `commun/abonnes-client.js`, `mes-dossiers.html`, `abonnement.html`. Dates (« Sept. 11, 2026 ») et
  nombres (« 4,843 ») au format anglais.
- **Libellés de la Ville** : `assets/libelles-en.js` — types de documents, instances (« Conseil de
  l'Arrondissement de Beauport » → « Borough Council — Beauport »), sujets, résultats, rôles. Les
  noms propres restent en français.
- **Résumés IA** : `scrapers/traductions.js` traduit les puces françaises (pas les PDF) dans
  `data/resumes-en.json`. **Garde-fou** : chaque nombre du français doit se retrouver dans
  l'anglais, séparateurs retirés (« 5 948 217 $ » = « $5,948,217 ») ; sinon la traduction est
  refusée et la page garde le français (« summary not yet translated »). Avant de compter, les
  tournures qui changent le compte sans changer le sens prennent une seule forme : « 6:30 p.m. » =
  « 18 h 30 », noon/midi = 12, midnight/minuit = 0, « 24 heures sur 24 » = « 24 hours a day ».
  Rattrapage du 14 sept. 2026 : 1 495 résumés en lot (`--batch`), **12,04 $ US**, 113 refus au
  premier passage, presque tous des heures (« 18 h » → « 6 p.m. ») ; le garde-fou corrigé a revérifié
  les réponses du lot sans rien repayer : 1 491 traduits, 9 refus justifiés (« 4 ½ » écrit en
  lettres, un « 5 à 7 » sans ses chiffres, un nombre ajouté). Les refus sont gardés dans
  `resumes-en.json` (`refus`) et ne sont pas retentés chaque matin — seulement si le résumé
  français est refait, ou avec `--refusees`. Ensuite `refresh.js` traduit les nouveaux chaque
  matin (`--plafond=150`, ~1,6 ¢ chacun, ~3 $ par mois). Mes dossiers superpose ces puces à celles
  des fichiers de projets, de l'agenda et de l'année, en gardant les françaises (`pucesFr`) pour la
  recherche de mots-clés et d'organismes, puisque les décisions sont en français.
- **Lexique** : `scrapers/lexique-en.js` → `data/lexique-en.json` (un appel, refait seulement si le
  lexique français change) ; le terme reste en français, suivi de son équivalent anglais.
- **Pas encore traduits (étape 2)** : titres et descriptions des projets, récapitulatifs « Où en est
  le projet », contenu du détail de l'argent (ses libellés le sont), courriels d'alerte. Les objets
  des décisions restent les titres officiels, en français.
- **Montréal** : `VOLETS_EN` dans `langue.js` ne contient que `quebec`. Sur un volet absent de la
  liste, la page reste en français même si l'anglais a été choisi, et la pastille n'apparaît pas.
  Pour l'ajouter : traduire ses pages et son `app.js` de la même façon, puis l'ajouter à la liste.

**Mesurer si ça vaut la peine** (Vercel → Analytics → Events ; les événements personnalisés
demandent le forfait Pro) : `langue_choisie` { vers, page } à chaque clic sur la pastille, et
`page_en` { page } à chaque page vue en anglais. Rapporté aux pages vues du volet, ça dit quelle part
des visiteurs lit en anglais, et sur quelles pages.

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
