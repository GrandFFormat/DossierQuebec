# DossierVilleDeLaval

Veille citoyenne des décisions de la **Ville de Laval**. Même esprit que DossierQuébec et que
les volets Québec et Montréal : données publiques seulement, aucune donnée inventée, aucun
verdict sur de vraies personnes.

Ce n'est pas un site de la Ville de Laval et ça n'a aucun caractère officiel.

Ce volet suit `quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`, avec une phrase en plus : « La ville,
c'est Laval. » Le présent README est le journal du projet.

> **État au 17 septembre 2026 — la base est construite.** L'étude de faisabilité (étape 1, plus
> bas) a conclu « faisable, et la source ressemble plus à Québec qu'à Montréal », avec un obstacle
> qui tient toujours : l'index des documents est derrière Cloudflare, qui refuse tout client qui
> n'est pas un navigateur. Le volet vit avec : l'index vient d'une **capture manuelle** (section
> « Rafraîchir l'index à la main »), les PDF se lisent normalement. Le courriel à la Ville est
> parti le 14 septembre (étape 2). Tout ce qui est en ligne est en français seulement et sous
> verrou `noindex` en attendant sa réponse — verrou levé le 21 sept. 2026, avant la réponse, par
> décision de Martin : le volet est dans `sitemap.xml` (écrit par `scripts/build-section-pages.js`).

## Démarrage

```
cd laval
npm install                # deux dépendances : le SDK Anthropic (résumés) et pdf.js (lecture des PDF)
npm test                   # les lecteurs, hors ligne, sur des extraits au gabarit de la Ville
npm run refresh            # la routine quotidienne (résumés sautés sans clé API)
npm run serve              # http://localhost:4321/
```

Utiles pendant la mise au point :

```
node scrapers/index.js                                             # l'index en ligne (403 aujourd'hui), sinon la capture
node scrapers/index.js --capture=C:\Users\pc\Downloads\index-laval.json   # ingère une capture faite dans un navigateur
node scrapers/decisions.js --fichier=chemin/CM_PV_ORD_18h30_2026_02_03_2.0.pdf   # découpage d'un PV, sans réseau
node scrapers/votes.js --fichier=chemin/CM_PV_ORD_18h30_2026_02_03_2.0.pdf       # les votes d'un PV
node --env-file=../api.env scrapers/resumes.js --dry-run           # estime le coût des résumés, n'appelle rien
```

## Étape 1 — L'étude de faisabilité

Tout ce qui suit a été **vérifié** le 14 septembre 2026, sauf mention contraire.

### Le gisement

| Porte | Ce qu'on y trouve | Accès automatisé |
|---|---|---|
| **Index des documents** — page « Ordre du jour, procès-verbaux et sommaire décisionnel » (`laval.ca/vie-democratique/hotel-de-ville-personnes-elues/ordre-jour-proces-verbaux-sommaire/`, aucun bouton d'export), un tableau wpDataTables servi par `wp-admin/admin-ajax.php?action=get_wdtable&table_id=11` (POST, pagination côté serveur) | **4 360 documents** depuis mai 2023. Par ligne : `ID`, `Nom Fichier`, instance (Conseil municipal / Comité exécutif), sous-type (Ordinaire, Extraordinaire, Publique, Huis clos), type (Ordre du jour, Procès verbal, Sommaire décisionnel), date, **`Numéro`** et **`Titre`** (sommaires seulement : `SD-2026-4237`, « CESSION DE CONTRAT - CONTRAT OS-SP-29554 »), version, URL du PDF | ❌ **HTTP 403 Cloudflare** pour tout client hors navigateur, quel que soit le User-Agent (laval.ca en entier : pages, sitemap, `wp-json`). Le `robots.txt` autorise pourtant explicitement `admin-ajax.php`. |
| **PDF** — `https://vdldocgreffecmspc01sa.blob.core.windows.net/cms/<Nom Fichier>` (stockage Azure de la Ville) | Les documents eux-mêmes. Noms : `CM_PV_ORD_18h30_2026_09_01_2.0.pdf`, `CE_PV_PUB_09h00_2026_09_09_2.0.pdf`, `CE_PV_HC_…`, `CM_ODJ_ORD_…`, `SD-2026-4237_1.0.pdf` | ✅ HTTP 200, sans Cloudflare. Le listage du conteneur n'est pas public (404) : il faut l'index pour connaître les noms. |
| **Données Québec** (CKAN, CC-BY 4.0), organisation `ville-de-laval`, 130 jeux | `presence-des-elus-au-conseil-municipal` (CSV/JSON, **mensuel, à jour au 4 sept. 2026**, 6 000 lignes depuis 2016 : date, heure, type de séance, nom, présent/absent) · `limites-des-districts-electoraux-des-dernieres-elections-municipales` (GeoJSON, mis à jour le 20 mai 2026) · `liste-des-elus` (**périmé** : fichiers de février 2023, avant l'élection de novembre 2025) · `contrats-octroyes` (fichiers de mars 2025) · `remuneration-des-elus`, `depenses-des-elus` | ✅ API CKAN ouverte |
| Ancien site `ville.laval.qc.ca/wlav2/docs/greffe/` | Ordres du jour de 2023 (`CM_ODJ_ORD_19h00_2023_01_10.pdf`) | ✅ encore en ligne, archive seulement |

### Volumes

| Type | Nombre dans l'index |
|---|---|
| Sommaires décisionnels | 932 (2023, depuis mai) · 1 119 (2024) · 1 060 (2025) · 505 (2026 au 14 sept.) |
| Procès-verbaux du comité exécutif (publics et huis clos) | 372 |
| Procès-verbaux du conseil municipal | 93 (depuis mai 2023) |
| Ordres du jour | 93 (conseil) · 176 (comité exécutif) |

Les numéros de sommaire montent au-delà de 4 600 en 2026 alors que l'index en publie 505 : les
sommaires publiés semblent être ceux qui vont au **conseil municipal** (à confirmer ; ceux du
comité exécutif sont cités dans ses procès-verbaux mais pas forcément publiés).

### Ce que les documents contiennent

- **Texte réel**, pas de scan : `pdftotext` le lit proprement (échantillon : 9 procès-verbaux du
  conseil de 2026, 1 du comité exécutif, 1 sommaire, 1 ordre du jour).
- **Résolutions numérotées** `CM-20260901-…` et `CE-20260909-2024`. ⚠ Dans le PDF, les numéros
  sont **dans la marge, empilés en haut de chaque page**, pas en face de leur résolution : il
  faudra les apparier dans l'ordre (autant de numéros que de résolutions sur la page).
- **Chaque résolution se termine par son sommaire** : `(SD-2026-4400)`. C'est le même renvoi qu'à
  Québec, et il donne directement l'URL du PDF du sommaire (`SD-2026-4400_1.0.pdf`, version à
  confirmer par l'index). 50 à 100 renvois par séance du conseil.
- **Le sommaire décisionnel** est structuré : service, objet, numéro(s) de contrat, montant,
  mode de sollicitation, **districts touchés**, unités concernées, décisions antérieures (avec leur
  numéro de résolution). C'est un très bon matériau pour les résumés et pour l'espace abonnés
  (`data-dossier` = le numéro SD, `data-montant`).

### Les votes nominaux

Oui, et sous la meilleure forme rencontrée jusqu'ici — noms complets et décompte imprimé dans la
même phrase :

> Le conseiller Martin Vaillancourt demande le vote sur la proposition, laquelle est adoptée par un
> compte de 15 en faveur et de 5 contre: M. Stéphane Boyer, maire, et les conseillers Ray Khalil,
> … se prononcent en faveur de la proposition; les conseillers Aglaia Revelakis, … se prononcent
> contre la proposition. (SD-2025-6452)

- **45 « demande le vote »** dans les 9 procès-verbaux ordinaires du conseil de 2026 lus, dont
  ~40 avec appel nominal (les autres : « adoptée à l'unanimité » après demande de vote).
- Le garde-fou de la section 6 du guide est gratuit : `par un compte de N en faveur et de M
  contre` se recoupe avec les deux listes.
- Formules à gérer : « adoptée » / « rejetée », « M. Stéphane Boyer, maire, et les conseillers … »,
  « les conseillers » au masculin générique pour tout le monde (les conseillères y sont incluses).
- Le comité exécutif vote « à l'unanimité » partout dans l'échantillon : pas de page Votes pour lui.

### Les pages « membres »

- **Districts** : GeoJSON CC-BY sur Données Québec, à jour (mai 2026).
- **Élus** : le jeu ouvert date de 2023, inutilisable. La page officielle
  `laval.ca/vie-democratique/hotel-de-ville-personnes-elues/membres-conseil-municipal/` (lue le
  14 sept. 2026 dans un navigateur, même Cloudflare) donne le maire et **22 districts** : nom,
  « District 05 – Marigot », courriel `@laval.ca`, téléphone, lien « Voir son profil ». Le **parti**
  n'est que sur la fiche de profil (`…/membres-conseil-municipal/<prenom-nom>/` : « Parti politique :
  Mouvement lavallois »), avec le nombre d'habitants du district et une biographie. Photos chargées
  à l'affichage (image vide dans le HTML). Les présences (jeu ouvert, mensuel) et les en-têtes de
  procès-verbaux recoupent les noms et les fonctions.
- **Présences** : déjà publiées en données ouvertes par la Ville — pas besoin de les extraire des
  procès-verbaux comme pour l'agglomération de Québec.

### Les conditions

- `robots.txt` de laval.ca : `Disallow: /wp-admin/` sauf `Allow: /wp-admin/admin-ajax.php`. Rien
  n'exclut l'index ni les PDF.
- **Cloudflare bloque pourtant tout accès non-navigateur** (403 immédiat, pas de défi à résoudre).
  C'est une décision technique de la Ville (ou de son hébergeur) qu'on ne contourne pas : pas de
  navigateur sans tête, pas d'usurpation d'identité de navigateur. La règle 3 du guide s'applique.
- Aucun avis de droit d'auteur ou de conditions d'utilisation sur laval.ca : le pied de page (vérifié
  le 14 sept. 2026) n'a que « Accès à l'information », « Politique de confidentialité », « Plan du
  site » et « Fichiers témoins ». Question posée dans le courriel à la Ville.
- Données Québec : CC-BY 4.0.

### Conclusion

**Faisable, avec une source plus riche que Québec et Montréal** — à une condition.

| | Laval |
|---|---|
| Documents / an | ~1 100 sommaires, ~12–20 procès-verbaux du conseil, ~70 du comité exécutif |
| Texte | vrai texte PDF, à extraire nous-mêmes (pdf.js, comme Montréal) |
| Lien résolution → sommaire | oui, systématique `(SD-AAAA-N)` |
| Votes nominaux 2026 | ~40 au conseil, noms complets + décompte |
| Pages membres | districts oui (GeoJSON) ; élus à lire sur laval.ca ; présences en données ouvertes |
| Blocage | **l'index est derrière Cloudflare** |

**L'obstacle et comment le lever.** Sans l'index, on connaît les sommaires (par les renvois des
procès-verbaux, URL prévisibles) mais pas les noms des procès-verbaux eux-mêmes : l'heure réelle
d'ouverture est dans le nom (`18h33`, `09h03`). Trois voies, par ordre de préférence :

1. **Demander à la Ville** (courriel au greffe et à `donneesouvertes@laval.ca`) de laisser passer
   le robot identifié `DossierVille/0.1` sur `admin-ajax.php` (règle Cloudflare par User-Agent),
   ou de publier l'index des documents décisionnels en données ouvertes — un CSV sur Données
   Québec, comme les présences. C'est la voie qui respecte la règle 3 et qu'ils ont déjà l'habitude
   de servir.
2. En attendant, un **amorçage manuel** : exporter l'index une fois depuis un vrai navigateur
   (Martin, à la main) pour construire et valider les lecteurs sur les PDF, qui eux sont ouverts.
3. Pour la routine quotidienne sans index : déduire les procès-verbaux de la date de séance (jeu
   des présences) en essayant les quelques minutes plausibles de l'heure d'ouverture. Possible,
   mais c'est deviner des URL ; seulement si la Ville ne répond pas, et dit comme tel dans le
   courriel.

## Étape 2 — L'entente avec la Ville

- **14 septembre 2026** : courriel envoyé à `donneesouvertes@laval.ca`, greffe en copie. Il demande
  l'accès du robot identifié à l'index (ou l'index en données ouvertes), confirme l'usage non
  commercial avec la source citée, et demande l'accord pour rendre le site public.
- **13 octobre 2026** : fin du délai de 20 jours ouvrables (le 12 est l'Action de grâce). Relance
  programmée ce jour-là si rien n'est arrivé.

## Étape 3 — Le contrat de données, tel que construit (17 septembre 2026)

| Fichier | Écrit par | Contenu |
|---|---|---|
| `data/index-documents.json` | `scrapers/index.js` | l'index de la Ville, 4 360 documents depuis mai 2023 (capture manuelle ; non servi) |
| `data/seances.json` | `scrapers/index.js` | une séance par procès-verbal ou ordre du jour, les deux appariés ; `prefixe` (« CM-20260203 ») ouvre les numéros de résolution de la journée |
| `data/decisions.json` | `scrapers/decisions.js` | les résolutions de l'année, lues dans les PV du conseil municipal et du comité exécutif (publiques et à huis clos) ; objet pris à l'ordre du jour du conseil quand il existe, avec les districts touchés et le montant |
| `data/votes.json` | `scrapers/votes.js` | les votes nominaux de l'année, avec le passage brut et le décompte imprimé |
| `data/textes/` | les scrapers | texte extrait des PDF (cache, hors dépôt) |

Premier lancement, 17 septembre 2026 : **87 séances de 2026 lues** (13 du conseil, 74 du comité
exécutif), **2 892 fiches**, 641 renvois à un sommaire pour le seul conseil, **44 votes nominaux**
recoupés avec le décompte imprimé, **0 avertissement**.

### Comment on lit un procès-verbal

Avec pdf.js (`lib/pdf.js`, repris de Longueuil), qui reconstruit chaque ligne d'après la hauteur
des fragments. C'est ce qui règle le piège noté à l'étude : **les numéros de résolution sont dans la
marge de gauche, à la hauteur de la première ligne du titre**. `pdftotext -layout` les empilait en
haut de la page, loin de leur résolution ; pdf.js les met sur la même ligne que le titre
(`CM-20260203-64 ADOPTION - RÈGLEMENT L-13132`), et `lib/pv.js` ouvre un bloc sur chaque ligne qui
commence par le préfixe de la journée. Un renvoi vers une résolution d'une autre date
(« conformément à la résolution CE-20190320-759 ») n'ouvre donc jamais de bloc.

Le titre continue tant que la ligne est en majuscules ; le corps suit ; le dernier `(SD-AAAA-N)` du
bloc est le sommaire de la résolution (une résolution qui en cite d'autres se clôt toujours par le
sien) ; `(CT:N)` est le certificat de trésorerie. Le résultat : « résolu à l'unanimité » (conseil :
« et résolu à l'unanimité: » ; comité exécutif : « RÉSOLU À L'UNANIMITÉ: »), ou le décompte d'un
vote demandé. Un dépôt, un avis de motion, une prise d'acte n'ont pas de résultat : la fiche porte
un `type` qui le dit.

### Les votes

« La conseillère Louise Lortie demande le vote sur la proposition, laquelle est adoptée par un
compte de 17 en faveur et de 4 contre: M. Stéphane Boyer, maire, et les conseillers …, se
prononcent en faveur de la proposition; les conseillers … se prononcent contre la proposition. »
Le décompte est dans la phrase : le garde-fou ne coûte rien. Variantes rencontrées en 2026 et
lues : « l'amendement, lequel est rejeté », « la proposition amendée », « la demande de discuter
immédiatement de la proposition », « la prolongation », « celui-ci », « acceptée » pour
« adoptée », un membre seul (« se prononce »), une virgule avant « se prononcent », et **un vote
corrigé en séance** (« Le conseiller …, ayant indiqué s'être trompé, corrige son vote … Le compte
final est de 16 en faveur et de 4 contre: ») — c'est le compte final qui vaut. Un vote demandé
mais « adopté à l'unanimité » n'a pas de noms et n'entre pas au registre. Le comité exécutif a tout
adopté à l'unanimité en 2026.

### L'ordre du jour du conseil

Il écrit chaque point en casse normale, suivi de ses renvois : `SD-2025-6415 - CT : 1876662`,
`District(s) : 01 Saint-François, 02 Saint-Vincent-de-Paul…` (coupé par la mise en page, recollé),
`Montants(s) : 689 850,00 $`. Les points ne portent pas le numéro de résolution : **c'est le numéro
de sommaire qui relie le point à la résolution**, et dans l'ordre — un règlement passe deux fois à
la même séance (dépôt du projet, avis de motion) avec le même sommaire ; le k-ième point citant
SD-X va au k-ième bloc qui le cite. Séance du 3 février 2026 : 50 résolutions avec sommaire, 50
appariées.

## Rafraîchir l'index à la main

Tant que laval.ca refuse les robots, l'index se capture dans un navigateur, sur la page
« Ordre du jour, procès-verbaux et sommaire décisionnel ». Dans la console du navigateur (F12),
coller :

```js
(async () => {
  const dt = jQuery('#table_1').DataTable(); const p = dt.ajax.params(); p.start = 0; p.length = 5000;
  const r = await jQuery.ajax({ url: '/wp-admin/admin-ajax.php?action=get_wdtable&table_id=11', type: 'POST', data: p, dataType: 'json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ recordsTotal: r.recordsTotal, data: r.data })], { type: 'application/json' }));
  a.download = 'index-laval.json'; a.click();
})();
```

Puis `node scrapers/index.js --capture=C:\Users\pc\Downloads\index-laval.json`, et commiter
`data/index-documents.json` et `data/seances.json`. Le tableau demande tout d'un coup
(`length = 5000`) : pas de pagination, donc pas de ligne sautée ou répétée. La date de la capture
est écrite dans le fichier et sur la page Sources. Le jour où la Ville ouvre la porte,
`scrapers/index.js` lit l'index tout seul (il porte déjà le jeton `wdtNonce` que l'API exige,
lu dans la page) : rien d'autre à changer.

## Pièges rencontrés

- **Les numéros de résolution sont dans la marge** : avec pdftotext, ils s'empilent en haut de
  page ; avec pdf.js, ils sont à la hauteur du titre. Lire par hauteur, pas par colonne.
- **Deux procès-verbaux du même type le même jour** (15 décembre 2025 : deux séances
  extraordinaires, 16 h et 17 h 30 ; 4 février 2026 : deux huis clos du comité exécutif) : le
  procès-verbal porte l'heure réelle d'ouverture (18h33), l'ordre du jour l'heure prévue (18h30).
  Apparier par heure la plus proche, couples les plus serrés d'abord, jamais au-delà de deux heures
  — un premier appariement « le premier libre » donnait l'ordre du jour de 17 h 30 au
  procès-verbal de 16 h.
- **Un même fichier d'ordre du jour listé deux fois** (11 août 2026 : sans version sur
  `wp-content`, en 2.0 sur le stockage) : garder la version la plus haute, et à égalité le stockage.
- **Un sommaire est listé à chaque passage au conseil** (dépôt, avis de motion, adoption : jusqu'à
  trois dates, 448 fichiers en double) : un fichier par numéro, la liste des passages à côté.
- **Les sommaires du comité exécutif ne sont pas publiés** (404 en XML sur le stockage) : la
  version du fichier varie (`_1.0` à `_9.0`), on ne devine pas d'adresse, on lit l'index.
- **`prononcent?`** exige « prononcen » : un membre seul « se prononce » disparaissait. Écrire
  `prononce(?:nt)?`. Même famille que `conseill\w+` qui rate « conseillère ».
- **L'apostrophe courbe** de « RÉSOLU À L’UNANIMITÉ » : normaliser avant de reconnaître.
- **Le navigateur intégré refuse d'envoyer vers `127.0.0.1`** (`ERR_BLOCKED_BY_CLIENT`) : la capture
  a transité par l'adresse d'une page locale (fragment `#`, gzip + base64), pas par `fetch`.

## Ce que le volet contient (17 septembre 2026)

| Fichier | Écrit par | Contenu |
|---|---|---|
| `data/index-documents.json` | `scrapers/index.js` | l'index de la Ville, 4 360 documents (capture manuelle ; non servi) |
| `data/seances.json` | `scrapers/index.js` | 467 séances, procès-verbal et ordre du jour appariés (non servi) |
| `data/decisions.json` | `scrapers/decisions.js` | les résolutions de l'année, conseil municipal et comité exécutif |
| `data/votes.json` | `scrapers/votes.js` | les votes nominaux de l'année, avec le passage brut |
| `data/sommaires.json` | `scrapers/sommaires.js` | l'index des sommaires décisionnels lus, un PDF par dossier |
| `data/elus.json`, `data/districts.json` | `scrapers/elus.js`, `scrapers/districts.js` | le conseil et la carte |
| `data/presences.json` | `scrapers/presences.js` | les présences publiées en données ouvertes |
| `data/lexique.json` | `scrapers/lexique.js` | 49 termes, mesurés sur les procès-verbaux de l'année |
| `data/textes/` | les scrapers | texte extrait des PDF (cache, hors dépôt, 21 Mo) |

Premier lancement complet, 17 septembre 2026 : **87 séances de 2026** (13 du conseil, 74 du comité
exécutif), **2 892 fiches**, **0 classée par défaut**, **46 votes nominaux** sans aucun
avertissement d'extraction, **511 sommaires décisionnels** lus (235 avec un montant, 428 avec des
districts), 23 membres du conseil, 22 districts (359 ko de GeoJSON ramenés à 31 ko), 49 termes de
lexique. `npm test` : 54 tests.

Les pages : `index.html`, `decisions.html`, `votes.html`, `conseil.html` (carte des districts
colorée par parti, fiches des élus, présences), `lexique.html`, `sources.html`.

### L'ordre du jour du comité exécutif

Il existe, mais son gabarit n'est pas celui du conseil : les chapitres sont les **services**
numérotés par leur code (« 43 - Service de l'urbanisme »), les points s'écrivent « 43-1 Objet en
casse normale », le renvoi au sommaire est systématique, `District(s) :05 Marigot` a son
deux-points collé, et il n'y a **jamais de ligne Montant**. `lib/pv.js` reconnaît les deux gabarits
et choisit, pour tout le document, celui dont la numérotation revient le plus — jamais ligne à
ligne, parce qu'un ordre du jour du conseil contient « 1-18 modifiant le Règlement CDU-1 » et un du
comité exécutif « 317-325 boulevard Goineau ». Résultat : 1 202 des 1 950 résolutions du comité
exécutif prennent leur objet à l'ordre du jour. Les autres sont les 2e, 3e et 4e résolutions d'un
même dossier (adjudication, début des travaux, dépenses) : le comité exécutif écrit **un point par
dossier** et le procès-verbal le décline ; ces fiches gardent le titre du procès-verbal, parce que
l'objet du point décrirait le dossier et non la résolution.

### Les résumés : payants, et éteints par défaut

`scrapers/resumes.js` est prêt et estimé, mais **aucun résumé n'a été généré**. Estimation du
14 septembre pour les 511 sommaires de 2026 : `claude-opus-5` **12,26 $ US** en synchrone,
**6,13 $** via l'API Batches ; `claude-sonnet-5` 4,90 / 2,45 $ ; `claude-haiku-4-5` 2,45 / 1,23 $.
La moitié du coût est la part fixe de chaque requête (consigne et schéma d'outil, 1 648 jetons).

Contrairement aux autres volets, **la seule présence de la clé API ne suffit pas à lancer l'étape** :
il faut la demander (`npm run refresh -- --avec-resumes`, ou la variable `LAV_RESUMES=oui` dans le
workflow), et le modèle se choisit avec `LAV_RESUMES_MODELE`, le mode avec `LAV_RESUMES_BATCH=oui`.
Sans ça, le jour où le secret `ANTHROPIC_API_KEY` est posé, la routine se serait mise à dépenser
chaque matin sans que personne l'ait décidé.

## Pièges rencontrés (suite)

- **Une relecture complète qui ne lit rien écrivait un fichier vide.** `--complet` repart d'une
  carte vide et seules les séances relues la remplissent : un stockage en panne le 1er du mois
  (jour où la routine force `--complet`) vidait `decisions.json` et `votes.json`, code de sortie 0,
  et le workflow committait le vide. Les deux scrapers refusent maintenant d'écrire quand aucune
  séance n'a pu être lue alors que le fichier précédent en contenait, et sortent en erreur.
- **`--complet` retéléchargeait les ~175 PDF de l'année** alors que le cache est invalidé par
  l'adresse (une nouvelle version d'un PDF en a une autre) : il rejoue désormais le découpage sur le
  texte déjà lu, et seul `--retelecharger` redemande les fichiers à la Ville (règle 3).
- **Deux votes nominaux manquaient au registre** : « demande **ensuite** le vote » (un second vote
  demandé par la même personne dans le même bloc) et « laquelle est **maintenue** par un compte de »
  (vote sur une décision de la présidence). Le registre passe de 44 à 46 ; « Maintenue » est le mot
  de la Ville, on ne le traduit pas en « Adoptée ».
- **Un vote de procédure empruntait l'objet de son voisin** : la prolongation de la séance au-delà
  de 23 h, quand elle est **rejetée**, n'a pas de numéro de résolution et reste dans le dernier bloc
  ouvert. La fiche affichait l'objet et le sommaire d'une décision sans rapport. Ces votes portent
  maintenant « Prolongation de la séance », sans dossier ni lien vers une décision.
- **Un palmarès s'était glissé sur la page des votes** : le résumé du tableau nommait les trois
  personnes le plus souvent contre, et le tableau était trié par ce décompte. C'est ce que la règle 2
  interdit, et l'assiette est trompeuse (46 votes sur 2 892 décisions, seulement les points
  contestés). Résumé neutre, tableau par ordre alphabétique.
- **`casseDePhrase` met les noms propres en minuscules** (« Vente - johanne lefrançois ») : la fiche
  affiche donc toujours, en plus, le titre exact du procès-verbal.
- **Une liste de montants coupée par la mise en page** perdait sa fin (huit sommes sur trois lignes
  dans l'ordre du jour du 10 mars) : la continuation se recolle quand la ligne finit par « ; ».
- **`\b` de JavaScript ne voit pas les lettres accentuées**, et les sous-chaînes piègent les règles
  de classement : « velo » dans « développement », « sport » dans « transport », « céder » dans
  « procéder », « ges » dans « Images », « aines » dans « souterraines », « arbres » dans
  Val-des-Arbres.

## Ce qui n'est pas encore là

- **La réponse de la Ville** : relance programmée le 13 octobre 2026. Les verrous `noindex` ont été levés le
  21 sept. 2026, avant la réponse, par décision de Martin ; pour les remettre, voir la note du même jour
  dans `quebec/README.md`.
  L'index reste une capture à refaire à la main d'ici là.
- **Les résumés** : estimés, éteints, en attente d'une décision de modèle et de budget.
- **L'espace abonnés** (guide, section 9) : les pages portent `data-ville="laval"` et chaque fiche sa
  boîte `ab-fiche` (clé = numéro de sommaire), mais les fichiers de Mes dossiers
  (`data/projets/`, `recentes.json`, `dossiers.json`, `attendues.json`, `organismes.json`,
  `travail.json`) et le détail de l'argent restent à écrire — comme pour Montréal, Lévis et Longueuil.
- **Les présences de 2026** : le jeu ouvert de la Ville s'arrête au 18 novembre 2025 alors qu'il est
  annoncé mensuel. La page affiche l'année couverte et le dit.
- **Un premier run planifié du workflow** à vérifier le lendemain de la mise en place.
