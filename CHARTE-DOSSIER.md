# Charte Dossier — ce qui fait qu'un site « Dossier » se reconnaît

> Martin, 24 septembre 2026 : « Pour la couleur, c'est bien s'ils ont chacun leur palette.
> Pour le design, par contre, ça pardonne moins. »

Donc, pour tout site de la famille (DossierQuébec, DossierOntario, les suivants) :

- **la palette est à vous** — chaque site choisit ses couleurs ;
- **le design, non** — la typographie, les formes, la grille, les meubles et la fabrication sont
  ceux de DossierQuébec, copiés tels quels, jamais réinterprétés.

Ce document existe parce que deux sites « copiés de DQ » n'y ressemblaient pas : ils avaient
repris les couleurs et réinventé tout le reste. Il dit où est la source, ce qu'on y prend, ce
qu'on change, et ce qu'on ne fait jamais. **Quand le cahier de design et le code divergent, le
code fait foi** : c'est lui qui est en ligne. Et quand la feuille de DQ s'écarte elle-même de sa
règle, la charte le dit : ces écarts **ne font pas modèle**.

*Les numéros de ligne de ce document sont ceux du 24 septembre 2026 au soir (`commun/dq.css` :
1 967 lignes ; recalculés après l'ajout de la langue dans l'adresse). Ils glissent à chaque
retouche ; les noms de sélecteurs, eux, ne bougent pas — au doute,
`grep -n "<sélecteur>" commun/dq.css`.*

---

## 0. Avant d'ouvrir `commun/dq.css`

1. **La feuille est en deux couches.** Tout ce qui précède le bloc « REFONTE BRUTALISTE —
   FONDATION » (le commentaire s'ouvre à `commun/dq.css:697`) est l'**ancien** design — gélules
   arrondies, cartes à filet de 1 px, ombres douces. Il est encore là parce que les pages s'y
   appuient, mais **il ne gagne plus** : la couche brutaliste, chargée après, l'écrase. Le design
   réel commence à ce bloc et à sa première règle, `*{border-radius:0 !important;}`
   (`commun/dq.css:705`). Qui lit le fichier par le début apprend le mauvais design — c'est arrivé
   à deux relecteurs de suite.
2. **`quebec/assets/style.css` n'est pas DQ.** C'est la feuille des volets de ville : accent vert
   `#0B8A4B` (l. 24), coins de 6 px (`--rayon`, l. 37), ombres floues. Un site Dossier ne part
   jamais de là.
3. **Le cahier d'origine est dans le dépôt** : `design/handoff-2026-07/` — un README de mesures
   et cinq maquettes HTML (`*.dc.html`) qui montrent le résultat attendu. Il date de juillet ; le
   code a bougé depuis, et c'est le code qui compte. Écarts assumés : la colonne fait **1280 px
   avec 28 px de gouttière** (le cahier disait 1180/32) ; le bleu porte le nom historique
   `--gold` ; le H1 descend à 42 px (34 sous 640 px) là où le cahier disait 72-92 ; A− / A+ est un
   `zoom` de 80 à 150 % et non une échelle 0,85-1,3 ; le ticker se met en pause au survol (demandé
   par le README du cahier, absent de ses maquettes).

---

## 1. Ce qui est à vous : la palette

Toute la couleur passe par **trois blocs de jetons**, et un autre site ne touche qu'à eux :

- le bloc clair `:root` (`commun/dq.css:26-74`) ;
- le bloc sombre `html[data-theme="dark"]` (`commun/dq.css:95-118`) ;
- les redéfinitions des bandes en thème sombre (`commun/dq.css:129-142`), qui répètent des
  valeurs claires **en dur** : la bande jaune y rétablit les quatorze jetons de surface et de
  texte qui changent avec le thème (l. 131-134 — seuls `--ink-bg` et les trois ombres gardent
  leur valeur sombre), la bande bleue y force des valeurs claires sur six jetons — encre, encre
  secondaire, carte, trait, ardoise et accent (l. 140-141).

| Jeton | Chez DQ | Rôle |
|---|---|---|
| `--paper` / `--paper-2` | `#F2F0EA` / `#FDFCF9` | fond de page, fond secondaire |
| `--card` | `#FFFFFF` | fond des cartes |
| `--ink` / `--ink-2` / `--line` | `#131313` | texte, bordures (clairs en thème sombre) |
| `--line-soft` | `#E5E2DA` | filets discrets |
| `--slate` | `#555550` | texte secondaire |
| `--gold` | `#0E4FC1` (bleu Québec) | **l'accent** en texte : liens, numéros, titres accentués |
| `--gold-bg` | `#0E4FC1` | l'accent en **fond de bloc** (bande bleue, bouton principal) — ne s'éclaircit pas en sombre |
| `--gold-soft` | `#D6E4FF` | l'accent en fond de pastille |
| `--gold-hover` / `--gold-pale` / `--gold-paler` | `#08307A` / `#A9C6FF` / `#D6E4FF` | les teintes de l'accent posées **sur** un bloc d'accent : survol du bouton principal, sur-titres et texte courant de la bande bleue |
| `--ink-bg` | `#131313` | surface qui reste **noire dans les deux thèmes** sous du texte jaune : filtres et pastilles actifs, onglet actif du menu mobile (texte blanc, filet jaune) |
| `--yellow` | `#FFD24D` | la deuxième couleur : bandes, survols, sélection |
| `--green` / `--green-soft` | `#1E6A3C` / `#BFE8CD` | adopté, pour |
| `--red` / `--red-soft` | `#C22B1D` / `#F6C9C2` | rejeté, contre |
| `--sur-clair` / `--sur-fonce` | `#131313` / `#FFFFFF` | texte sur une surface qui reste claire / sombre dans les deux thèmes |
| `--shadow` / `--shadow-lg` / `--shadow-sm` | `6px 6px 0 #131313` / `8px 8px 0` / `4px 4px 0` | les trois ombres (noires `#000000` en sombre) |

**Pour un nouveau site, le minimum** : `--gold`, `--gold-bg`, `--gold-soft`, `--gold-hover`,
`--gold-pale`, `--gold-paler` dans les deux blocs, les deux lignes d'accent des bandes sombres
(l. 133 et 141), la `theme-color` du `<head>` (`gabarit.html:38`, à votre `--gold-bg`) et la tuile
du favicon. Depuis le 24 septembre, **plus aucun bleu Québec n'est écrit en dur dans la couche
design** : changer ces jetons change tout l'accent. Reste une paire cyan `#CFF0F7` / `#0A6E85`
(l. 1588, le badge « Outils citoyens » du lexique) qu'un site frère remplace par ses propres
teintes ou par `--gold-soft` / `--gold`. DossierOntario, avec 19 jetons identiques à DQ sur les 23
noms qu'ils partagent et un accent rouge, avait ses couleurs justes du premier coup.

**Les règles qui viennent avec la palette** (écrites dans `dq.css`, l. 38-62 et 76-94 ; elles ne
se négocient pas, même avec d'autres couleurs) :

- l'accent a **deux jetons**, `--gold` (texte) et `--gold-bg` (fond) : en thème sombre le texte
  s'éclaircit, le bloc reste profond ; ses teintes dérivées vivent sur ce bloc et ne basculent
  pas. Deux écarts dans la feuille, à ne pas copier : le bouton Villes prend `--gold` en fond
  (l. 759, il s'éclaircit donc en sombre) et `.legend-link:hover` prend `--gold-hover` en texte
  sur fond blanc (l. 1221) ;
- `--sur-clair` et `--sur-fonce` ne se remplacent **jamais** par `--ink` / `--card` ;
- en thème sombre, **les ombres restent noires** (une ombre claire est une lueur) — vrai des trois
  jetons `--shadow*` ; la seule ombre écrite hors jeton avec `var(--ink)`, celle des listes du
  comparateur (l. 1524), blanchit dans la bande bleue et devrait passer à `--shadow-sm` — et
  **les bordures s'inversent** (le trait franc est la signature) ;
- une bande de couleur pleine redéfinit ses jetons **à l'intérieur d'elle-même** en thème sombre
  (l. 129-142) — la palette qui bascule au complet pour la jaune, pas quelques jetons ;
- le **favicon** garde la construction de `commun/dq.svg` : tuile dans votre accent, lettres
  dessinées (pas composées) dans votre papier, et **le bandeau jaune sur les 12 unités du bas**
  (frontière à 13/16, pour tomber pile sur un pixel à 16, 32, 48 et 64 px). Le bandeau est la
  marque de famille ; sa couleur est votre `--yellow`.

**Ce qui reste en dur dans la couche design** : 38 codes hexadécimaux après la ligne 705 — le
`#131313` (douze fois) des pastilles de présence (l. 1888-1890) et des encarts de l'accueil
`.promo-villes` / `.promo-compte` (l. 1920-1930), des surfaces qui doivent rester noires sur jaune
ou sur blanc ; les verts, rouges et gris des pastilles d'état et des barres de vote (`#14532D`,
`#2E9958`, `#1E9E5A`, `#1E7B45`, `#D9442F`, `#D64545`, `#8B8578`) ; le rouge de la feuille d'érable
(`#D52B1E`, l. 736) ; le cyan du badge « Outils » du lexique (l. 1588) ; le bronze sous le nom du
créateur (`#A9782E`, l. 1778) ; deux `#FFD24D`, quatre `#FFFFFF` et un `#555550` sur des surfaces
fixées ; le gris `#B8B4AA` du pied de page. Un site qui change **plus que l'accent** (le jaune,
les verts, les rouges) les passe en revue une fois :

```bash
awk 'NR>705' commun/dq.css | grep -on "#[0-9A-Fa-f]\{3,6\}\b"   # 38 occurrences sur 23 lignes
```

---

## 2. Ce qui ne se discute pas : le design

### Typographie

Une seule balise, exactement celle-ci (`gabarit.html:96`, précédée des deux `preconnect` des
lignes 84-85) :

```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&family=Archivo+Narrow:wght@400..700&display=swap" rel="stylesheet">
```

- **Archivo** pour le corps (`body`, `commun/dq.css:169`) et les titres : les h2 de section et de
  bande en `900 / capitales / letter-spacing:-0.02em` (`commun/dq.css:856`) — deux écarts assumés,
  la mission de la bande bleue en 800 / -0.015em (l. 1058-1061) et les mois de la page Mises à
  jour en 600 / 14 px / +0.05em (l. 1789-1792), qui sont des étiquettes plus que des titres ; les
  titres de cartes (h3) en 800, `-0.01em`, casse normale (`.bill h3`, l. 1255 ; `.vc-head-main h3`,
  l. 1318), capitales pour les noms de personnes (`.m-name`, l. 1444 ; `.role-card h3`, l. 1612).
  Deux encadrés de méthode sont en 900 / capitales (`.prom-methode h3`, l. 1166 ; `.prom-ailleurs
  h3`, l. 1184), et les trois boîtes de « Comment lire un vote » en 900 (l. 1389).
- **Archivo Narrow** pour presque tout ce qui étiquette : pastilles, métadonnées, en-têtes de
  tableau, filtres, fil d'Ariane, pied de page — en capitales (sauf les courriels, les dates et la
  note de composition, l. 1427), `letter-spacing` de 0,02 à 0,1 em, le plus souvent 0,04 à 0,06
  (deux pastilles n'en ont pas : `.ch-badge`, l. 999 ; `.vcc`, l. 1321). Deux étiquettes sont
  volontairement en Archivo 800 : le sur-titre de la bande d'abonnement (`.promo-sur`, l. 1907) et
  l'étiquette jaune de Mon dossier (`.md-etiquette`, l. 1842).
- L'affiche d'accueil : `.hero-h1` en `clamp(42px, 7vw, 92px)`, poids 900, interligne 0,92, une
  ligne **en contour** (`.hero-outline`, `-webkit-text-stroke:3px`, l. 904) et une en accent
  (`.hero-blue`, l. 905 ; le bloc va de 898 à 905) ; sous 640 px, `clamp(34px, 11vw, 48px)` et
  contour de 2 px (l. 1104-1105, l'accueil seulement). Les pages de section (Ministres, Projets de
  loi, Votes, Promesses, Lexique, Mon dossier) portent en plus `.hero-h1-md` (l. 1114) :
  `clamp(36px, 5.6vw, 72px)`, interligne 0,94, 30 px en `.etroit` (l. 1679). En tête du H1, une
  étiquette jaune bordée, `.hero-sujet`, dit le sujet de la page (`gabarit.html:249`).
- Pas d'autre police, pas d'Archivo Black, pas de chasse fixe.

### Formes

- **Tout est carré** : `*{border-radius:0 !important;}` (`commun/dq.css:705`). Quatre exceptions
  assumées chez DQ, à copier telles quelles et pas une de plus : la pastille « Villes »
  `.city-flip` (l. 756-758), l'icône lune / soleil du bouton de thème (`.theme-toggle::before/
  ::after`, l. 818-826) et le pouce de la barre de défilement des onglets
  (`nav.tabs::-webkit-scrollbar-thumb`, l. 229) — des pseudo-éléments que la règle `*` n'atteint
  pas — et le portrait rond de la page Mises à jour (l. 1763).
- **Bordures** : `3px solid var(--ink)` pour les conteneurs (cartes, bandes, boutons principaux,
  champ de recherche) — `var(--card)` quand ils sont posés sur la bande bleue (l. 1063, 1388,
  1544), en pointillé seulement pour un renvoi ou un emplacement vide (l. 1157, 1540, 1843) ;
  `2px` pour les éléments internes (pastilles, sous-blocs, en-têtes de tableau) ; `1px` pour les
  filets et les contrôles de l'en-tête. Trois épaisseurs avec leur rôle — pas du 3 px partout,
  c'est la hiérarchie qui fait respirer la page. Deux écarts restent dans la feuille et ne font
  pas modèle : la barre de 4 px des actualités (l. 1080) et les cadres de 1,5 px de la page Mises
  à jour (l. 1757, 1768, 1807) et du bouton de filtres mobile `.filter-hamburger` (l. 1634).
- **Ombres dures** : `var(--shadow)` sur les cartes principales, `--shadow-lg` sur les gros blocs,
  `--shadow-sm` sur les petits boutons et les cartes secondaires. Décalage égal en x et en y,
  **sans flou**, toujours par un jeton. Ne font pas modèle : deux ombres floues (le menu Villes,
  l. 774 ; l'en-tête compacte au défilement, l. 264) et deux ombres dures écrites hors jetons
  (les listes du comparateur, `5px 5px 0 var(--ink)`, l. 1524 ; le bouton « Suggérer un terme »,
  `6px 6px 0 rgba(19,19,19,0.35)`, l. 1602).
- Pas de dégradé de couleur (le seul `linear-gradient`, l. 1881, peint des paliers nets), pas
  d'image décorative, pas de transition sur les états de survol ou d'ouverture des cartes,
  boutons, filtres et pastilles — le style assume des changements nets. Cinq transitions vivent
  dans l'en-tête et le bouton « remonter » et ne font pas modèle : `.city-flip` (0,3 s, l. 762),
  `.maple-flip` (0,7 s, l. 732), `.hamburger span` (0,2 s, l. 1726), `.dq-remonter` (0,25 s,
  l. 688) et l'ombre de `#dq-topbar.compact` (0,22 s, l. 262). Les seules animations sont le
  ticker (`dqTicker`, l. 709), le glissement des cartes « Voir plus » (`chSlideIn`,
  l. 1032-1033), la bascule de la feuille d'érable (l. 732) et le léger agrandissement du bouton
  Villes au survol et à l'ouverture (`scale(1.06)`, l. 769).
- Les icônes de contenu sont des émojis (🔍 ✋ 🔥 ✉ ●) ; celles de l'en-tête et du bouton
  « remonter » sont dessinées — feuille d'érable et flèche en SVG en ligne (`gabarit.html:130`,
  `1040`), lune / soleil et triangle du bouton Villes en CSS (l. 818-838, 764). Jamais une image,
  jamais une police d'icônes.

### Grille

- Une colonne de **1280 px** avec **28 px** de gouttière (`.app`, `commun/dq.css:173`), reprise à
  l'identique par l'en-tête (qui contient les onglets) et le pied ; 18 px de gouttière sous
  640 px — sauf le pied de page, qui garde ses 28 px (l. 871, 1941 : écart à assumer ou à
  corriger).
- Les bandes pleine largeur passent par **`.bleed`** (`commun/dq.css:895`) : elles débordent la
  colonne mais leur contenu reste aligné dessus. Elle ne se fie pas à `100vw` (barre de
  défilement, zoom A+) : la largeur vient d'une variable `--vw` publiée sur `<body>` par
  `commun/dq.js` (`majMetriquesMiseEnPage`, l. 1881-1894) ; `100vw` n'est que le repli d'avant le
  script, ce qui oblige toute page qui a une bande à charger `dq.js`.
- Chaque section pleine largeur est fermée par un trait de 3 px ; les fonds alternent crème,
  blanc, et couleur pleine (jaune, accent, encre).

### Thème sombre

Posé par `html[data-theme="dark"]` (`commun/dq.css:95`), **jamais** par `prefers-color-scheme` ;
l'attribut est mis par `commun/dq.js` et le bouton `.theme-toggle` (l. 810, `gabarit.html:174`).
Le jeu de jetons sombre, les deux règles (ombres noires, bordures inversées), les redéfinitions
des bandes (l. 129-142) et les rattrapages par composant (l. 143-162, plus le soleil du bouton de
thème, l. 828-838, et le survol du bouton d'abonnement, l. 1935) se copient avec le reste. Le
ticker, l'onglet actif (sur bureau) et le pied de page sont en `--ink` : noirs en clair, **crème
en sombre** — c'est voulu, les bordures et les surfaces d'encre s'inversent ensemble. Dans le
panneau mobile (≤ 640 px), l'onglet actif est au contraire en `--ink-bg`, texte blanc et filet
gauche jaune (l. 1744) : il reste noir dans les deux thèmes.

### Les meubles — ce qu'on reconnaît de loin

Chaque site de la famille a **tous** ceux-là. Ligne du style dans `commun/dq.css`, ligne du
balisage dans `gabarit.html` (« — » : pas de balisage propre, la classe est posée par le
JavaScript).

| Meuble | Style | Balisage |
|---|---|---|
| Bandeau défilant `.ticker` en haut de chaque page (26 s, pause au survol, rempli par `renderTicker`, `dq.js:3900`) | 708 | 103 |
| En-tête collant `#dq-topbar`, fermé par un trait de 3 px | 259, 721 | 110 |
| Marque `.brand` : `.brand-title` en Archivo 900, capitales, `letter-spacing:-0.03em`, deuxième moitié du nom dans l'accent (`.brand-blue`, l. 727) — pas de logo-image | 723-727 | 112-122 |
| Feuille d'érable `.maple-flip` vers le site fédéral (bascule jaune ↔ rouge toutes les 20 s) | 729 | 126 |
| Onglets `nav.tabs` : pilules carrées, **actif = fond d'encre** (noir sur mobile), survol jaune, sans numérotation | 842-853 | 155 |
| Contrôles A− / A+ (`.font-size-ctrl`) : `zoom` de 80 à 150 % par pas de 10 sur `<body>` (`dq.js:1915`) | 789, 1687 | 167 |
| Bouton de thème `.theme-toggle` (icône dessinée en CSS) et bouton de langue `.lang-toggle`, tous à la hauteur `--h-ctrl` (36 px, posée par `.header-ctrls > *`) | 810, 796 ; 1712-1718 | 174-175 |
| Affiche `.hero-poster` : `.hero-sujet` + H1 trois lignes + manifeste encadré `.hero-manifesto` + bouton `.hero-cta` | 897-918 | 247-261 |
| Bande de chiffres `.stat-band` : **un seul bloc** à trois cellules séparées par des traits, chiffre 54 px / 900 | 920 | 263 |
| Bandes de couleur `.band-yellow` / `.band-blue`, toujours sur `.bleed` | 930, 980 | 234, 273 |
| Cartes principales — même patron : fond `--card`, 3 px, `--shadow` : `.bill` 1076, `.vote-card` 1315, `.m-card` 1433 | | |
| Cartes secondaires — même cadre, `--shadow-sm` : `.role-card` 1607, `.md-carte` 1839, `.legende-presence` 1866 | | |
| Pastilles d'état `.status-pill` : Archivo Narrow 700, capitales, 2 px | 1282 | — |
| Recherche `.brutal-search` : 3 px, ombre, loupe sur fond jaune séparée par un trait | 1398 | 414 |
| Filtres `.qf-btn` : 3 px, **actif = jaune sur noir** (`--yellow` sur `--ink-bg`), survol jaune | 1142-1149 | — |
| Bouton « remonter » `.dq-remonter` : carré jaune, 3 px, `--shadow-sm` | 879 | 1039 |
| Pied de page en `--ink` pleine largeur, Archivo Narrow en capitales, avec le plan du site `.footer-nav` | 862, 870, 1940 | 1009-1010 |
| Favicon `commun/dq.svg` : tuile, lettres dessinées, bandeau jaune | — | 58-59 |

### La fabrication

- **`gabarit.html` n'est jamais servi.** C'est le modèle : toutes les vues, un tronc commun.
- **`scripts/build-section-pages.js`** le découpe en pages (`decouper`, l. 360), sort les données
  vers `data/site/*.json`, remplit les repères `<!--PRERENDU:…-->` (`prerendus`, l. 297) pour les
  robots et les navigateurs sans JavaScript, fabrique le sitemap, et **refuse de publier** si :
  - la feuille n'est pas `/commun/dq.css`, s'il reste un `<style>` dans le modèle, si les
    accolades ou les commentaires ne sont pas équilibrés, si une variable CSS est orpheline
    (`verifierCss`, l. 492 ; `verifierJs` juste après) ;
  - un titre est en double ou dépasse 65 caractères, une description est en double ou sort de
    120-165 caractères, un `<h1>` est absent, multiple ou en double, s'il manque un canonical ou
    un JSON-LD (`verifierReferencement`, l. 569).
- La liste des pages est `PAGES` (l. 165) ; une page privée porte `prive: true` (noindex, hors
  sitemap).

Ces garde-fous **font partie du design** : sans eux, la feuille se casse en silence et la dérive
recommence.

---

## 3. Démarrer un site Dossier — la marche

Dans l'ordre. C'est court parce qu'on copie.

1. **Copier `commun/dq.css` au complet** — ses quelque 1 970 lignes, sans trier, sans « nettoyer »
   la première couche. Le nommer comme vous voulez (`commun/on.css`) ; ne pas le réécrire.
2. **Changer la palette, et seulement elle** : les trois blocs de jetons (§ 1), la `theme-color`,
   le favicon (même construction, vos couleurs).
3. **Ne renommer aucune classe.** `.hero-poster` reste `.hero-poster`, `.m-card` reste `.m-card`,
   `.dq-remonter` reste `.dq-remonter` : tels quels, dans la langue où DQ les a écrits (surtout
   l'anglais, parfois le français). C'est là que DossierOntario s'est perdu : près d'une centaine
   de classes en français (94 définies, 43 utilisées) contre plus de quatre cents chez DQ, trois
   en commun — un site à réécrire au complet.
4. **Copier `gabarit.html`** : le `<head>` (le script de langue des l. 6-30, polices, favicon,
   canonical), le ticker, `#dq-topbar` avec sa marque, ses onglets et ses contrôles, l'affiche, la
   bande de chiffres, le pied, le bouton « remonter ». Puis remplacer le **contenu** des vues — pas
   leur structure.
5. **Extraire de `commun/dq.js`** ce qui porte le design, en le rebranchant sur vos données : la
   langue — les textes (`translations`, l. 86) et sa mécanique : la lecture au démarrage, la langue
   écrite dans l'adresse (`?lang=en`) et gardée sous `dvq:langue` (`langueDeDepart`,
   `langueDansAdresse`, `paramLangue`, les liens qui emportent la langue et le suivi entre onglets, l. 433-512), la traduction des textes fixes
   (`traduireTextesFixes`, l. 524) ; `window.storage` (l. 696, dont dépendent le zoom et le thème) ;
   `majMetriquesMiseEnPage` + zoom + thème (l. 1874-1953, en partant de `let fontZoom = 100;`) ;
   `renderTicker` (l. 3900). Le reste (données, abonnés) selon le site. La règle
   `html.dq-en:not(.dq-pret) body`, en fin de `dq.css`, vient avec le script du `<head>` : elle
   cache la page anglaise le temps de la traduire.
6. **Reprendre les garde-fous du build.** `verifierCss` et `verifierJs` (l. 492-526) se copient
   seuls, en changeant `SRC`, `CSS_PATH` et `JS_PATH`. `verifierReferencement` (l. 569-613), non :
   il lit `produites` (l. 556), donc tout le build. Soit on reprend le build entier en récrivant
   `BASE` (l. 20), le suffixe « — DossierQuébec » (l. 579), les `title` de `PAGES` (l. 165),
   `ORGANISATION` (l. 239-246), les marqueurs de données (l. 34-43), les repères PRERENDU de votre
   modèle et `VILLES` (l. 634) ; soit on réécrit le contrôle sur ses propres pages produites, avec
   les mêmes critères.
7. **Comparer à une maquette** de `design/handoff-2026-07/` avant de publier : si votre accueil
   ne ressemble pas à `Apercu.dc.html` avec d'autres couleurs, quelque chose n'a pas été copié.

---

## 4. Ce qu'on ne fait jamais

- **Réécrire un composant « à la manière de »** : on copie la règle, on ne la recompose pas.
- **Traduire ou renommer les classes.**
- **Lire `dq.css` par le début** et en tirer des arrondis, des cartes à filet de 1 px ou des
  ombres floues.
- **Réciter une charte de mémoire.** `dossierontario/commun/on.css` cite « la charte commune
  (tokens.json, version du 19 septembre 2026) » : ce fichier n'a jamais existé. La charte, c'est ce
  document, et il renvoie à des lignes de code qu'on peut ouvrir.
- **Partir de `quebec/assets/style.css`** ou de `quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md` : ils
  servent aux volets de ville dans le dépôt de DQ, pas à un site.
- **Mettre du 3 px partout**, ou nulle part : trois épaisseurs, avec leur rôle.
- **Un `<style>` dans une page.** Tout vit dans la feuille commune ; `verifierCss` le refuse dans
  `gabarit.html` (les pages hors modèle ne sont pas contrôlées : c'est à vous d'y veiller).
- **Une police de plus.**

---

## 5. Où en sont les sites frères (24 septembre 2026)

- **DossierOntario** — palette juste (19 jetons identiques à DQ sur 23 noms partagés, les quatre
  autres étant l'accent rouge `#C8102E` assumé), design réécrit : pas de ticker, pas de manifeste
  ni de bouton sous l'affiche, bande de chiffres en vignettes séparées, favicon sans bandeau, près
  d'une centaine de classes en français. Le plus petit geste utile : **remplacer `on.css` par
  `dq.css` + l'accent rouge**, et reprendre le `gabarit.html` de DQ ; pas rapprocher les classes
  une à une.
- **DossierCanada** — ce n'est pas une copie ratée : il a reçu **son propre cahier de design**
  (`dossiercanada/Website design improvement needed/design_handoff_dossiercanada/`, « gazette
  bonbon » : crème, jaune `#FFDD33` en accent principal, rose, cyan, lime, Archivo Black + IBM
  Plex Mono), commandé à part, et il a été forké de DQ le 7 juillet 2026, moins de deux jours après
  le premier commit de DQ. S'il doit rejoindre la famille, c'est une refonte, à décider comme
  telle.
- **Les volets de ville** (`quebec/`, `montreal/`, `levis/`, `longueuil/`, `laval/`) — un
  troisième langage (`quebec/assets/style.css`, vert, arrondi), à l'intérieur même de DQ. Hors du
  présent document ; à trancher un jour.
