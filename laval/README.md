# DossierVilleDeLaval

Veille citoyenne des décisions de la **Ville de Laval**. Même esprit que DossierQuébec et que
les volets Québec et Montréal : données publiques seulement, aucune donnée inventée, aucun
verdict sur de vraies personnes.

Ce n'est pas un site de la Ville de Laval et ça n'a aucun caractère officiel.

Ce volet suit `quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`, avec une phrase en plus : « La ville,
c'est Laval. » Le présent README est le journal du projet.

> **État au 14 septembre 2026 — étape 1 seulement.** L'étude de faisabilité est faite (ci-dessous),
> aucun code n'est écrit. Elle conclut « faisable, et la source ressemble plus à Québec qu'à
> Montréal », avec **un obstacle à régler avec la Ville avant d'écrire la routine** : l'index des
> documents est derrière Cloudflare, qui refuse tout client qui n'est pas un navigateur.

## Étape 1 — L'étude de faisabilité

Tout ce qui suit a été **vérifié** le 14 septembre 2026, sauf mention contraire.

### Le gisement

| Porte | Ce qu'on y trouve | Accès automatisé |
|---|---|---|
| **Index des documents** — page « Sommaires décisionnels, ordres du jour, procès-verbaux » de laval.ca, un tableau wpDataTables servi par `wp-admin/admin-ajax.php?action=get_wdtable&table_id=11` (POST, pagination côté serveur) | **4 360 documents** depuis mai 2023. Par ligne : `ID`, `Nom Fichier`, instance (Conseil municipal / Comité exécutif), sous-type (Ordinaire, Extraordinaire, Publique, Huis clos), type (Ordre du jour, Procès verbal, Sommaire décisionnel), date, **`Numéro`** et **`Titre`** (sommaires seulement : `SD-2026-4237`, « CESSION DE CONTRAT - CONTRAT OS-SP-29554 »), version, URL du PDF | ❌ **HTTP 403 Cloudflare** pour tout client hors navigateur, quel que soit le User-Agent (laval.ca en entier : pages, sitemap, `wp-json`). Le `robots.txt` autorise pourtant explicitement `admin-ajax.php`. |
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
- **Élus** : le jeu ouvert date de 2023, inutilisable. La page des élus de laval.ca est derrière le
  même Cloudflare (pas encore lue). Les présences (jeu ouvert, mensuel) et les en-têtes de
  procès-verbaux donnent les noms et fonctions actuels ; district et parti devront venir de laval.ca.
- **Présences** : déjà publiées en données ouvertes par la Ville — pas besoin de les extraire des
  procès-verbaux comme pour l'agglomération de Québec.

### Les conditions

- `robots.txt` de laval.ca : `Disallow: /wp-admin/` sauf `Allow: /wp-admin/admin-ajax.php`. Rien
  n'exclut l'index ni les PDF.
- **Cloudflare bloque pourtant tout accès non-navigateur** (403 immédiat, pas de défi à résoudre).
  C'est une décision technique de la Ville (ou de son hébergeur) qu'on ne contourne pas : pas de
  navigateur sans tête, pas d'usurpation d'identité de navigateur. La règle 3 du guide s'applique.
- Aucun avis de droit d'auteur ou de conditions d'utilisation trouvé sur laval.ca (seulement une
  politique de confidentialité). À poser dans le courriel au greffe.
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
