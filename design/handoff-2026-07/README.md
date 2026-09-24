# Handoff : DossierQuébec — refonte brutaliste

## Overview
Refonte visuelle complète de **dossierquebec.ca**, un site citoyen indépendant qui suit l'Assemblée nationale du Québec (ministres, projets de loi, votes nominatifs, pétitions, lexique). Direction retenue par le propriétaire : **néo-brutalisme** — fond crème, bordures noires épaisses, ombres dures décalées, jaune d'accent, bleu Québec, typographie Archivo en capitales.

Le site existant est en français, orienté « langage clair, sans jugement ni verdict ». Le ton des textes doit rester accessible et chaleureux (tutoiement collectif « citoyen·ne·s », écriture inclusive avec point médian).

## About the Design Files
Les fichiers `*.dc.html` de ce dossier sont des **références de design créées en HTML** — des prototypes montrant l'apparence et le comportement voulus, PAS du code de production à copier tel quel. La tâche est de **recréer ces designs dans l'environnement existant du site** (son framework, ses patterns, sa source de données réelle). Si le site n'a pas de framework établi, choisir le plus approprié et y implémenter ces designs.

⚠️ **Toutes les données dans les maquettes sont des exemples** (ministres partiellement réels mais chiffres de présence inventés, projets de loi fictifs, votes fictifs, noms de député·e·s générés). Le vrai site doit brancher ses vraies données (scraping assnat.qc.ca / quebec.ca / Données Québec, comme il le fait déjà).

## Fidelity
**High-fidelity (hifi)** : couleurs, typographie, espacements et interactions sont finaux. Recréer l'UI fidèlement avec les valeurs exactes ci-dessous.

## Design Tokens

### Couleurs
- Fond de page : `#F2F0EA` (crème)
- Encre / bordures / noir : `#131313`
- Bleu Québec (accent principal, liens) : `#0E4FC1` (hover liens : `#08307A`)
- Jaune d'accent (sections mises en valeur, CTA, hover) : `#FFD24D`
- Blanc cartes : `#FFFFFF`
- Sélection texte : fond `#FFD24D`
- Vert « pour / adopté » : `#2E9958` (barres), `#1E6A3C` (texte), badge `#BFE8CD` / texte `#14532D`
- Rouge « contre / rejeté » : `#D9442F` (barres), `#C22B1D` (texte/badge)
- Gris « absent » : `#8B8578`, barre `#D8D4C8`
- Badge neutre : fond `#E5E2DA`
- Badge bleu clair : fond `#D6E4FF` / texte `#0E4FC1`
- Footer / ticker : fond `#131313`, texte `#F2F0EA`, texte secondaire `#B8B4AA`
- Couleurs de partis : CAQ `#00A5CF` (texte noir), PLQ `#E23A3A` (texte blanc), QS `#FF7B33` (texte noir), PQ `#12429B` (texte blanc), IND `#8B8578` (texte blanc)

### Typographie (Google Fonts)
- **Archivo** (400–900) : tout le corps et les titres. Titres en `font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em`.
- **Archivo Narrow** (500–700) : étiquettes, badges, méta, nav — toujours `text-transform: uppercase; letter-spacing: 0.04–0.08em`.
- H1 hero : 72–92px, `line-height: 0.92–0.94`, une ligne sur deux en contour (`color: transparent; -webkit-text-stroke: 3px #131313`) ou en bleu `#0E4FC1`.
- H2 section : 34–46px weight 900 uppercase.
- Corps : 15–17px weight 500 ; méta : 12–14px Archivo Narrow.

### Motifs signature (à appliquer partout)
- **Bordures** : `3px solid #131313` (conteneurs), `2px solid #131313` (éléments internes). Aucun rayon de bordure — tout est carré.
- **Ombres dures** : `box-shadow: 6px 6px 0 #131313` (cartes), `8px 8px 0` (gros conteneurs), `4px 4px 0` (petits boutons).
- **Séparations de sections** : chaque section pleine largeur séparée par `border-bottom: 3px solid #131313`; fonds alternés crème / blanc / couleur pleine (jaune, bleu, noir).
- **Ticker défilant** : bande noire en haut de chaque page, texte uppercase défilant (animation `translateX(0 → -50%)`, 26s linéaire, contenu dupliqué 2×), puces `●`.
- **Header sticky** : logo « DOSSIERQUÉBEC » weight 900 uppercase (« Québec » en bleu), nav en pilules carrées (actif = fond noir texte blanc), contrôles A− / A+ (échelle de texte 0.85–1.3 par pas de 0.1 sur le font-size racine) + bouton EN.
- **Champ de recherche** : bordure 3px, ombre 6px, préfixe 🔍 sur fond jaune séparé par une bordure.
- **Boutons filtres** : bordure 3px, actif = fond noir / texte jaune.
- Largeur max contenu : 1180px, padding horizontal 32px.

## Screens / Views

### 1. Aperçu (`Apercu.dc.html`) — accueil
- Ticker noir → header → **hero poster** : H1 3 lignes (plein / contour / bleu), carte manifeste blanche + CTA bleu « Explorer → ».
- **Bande stats** fond blanc : 3 cellules séparées par bordures (27 ministres, 120 projets, 735 votes) — chiffre 54px/900, étiquette Archivo Narrow.
- **Projets challengés** (section signature, fond jaune `#FFD24D`) : titre + bouton « Voir plus → », sous-titre « ✋ Demandé par les citoyen·ne·s », 3 cartes blanches ombre dure (nº bleu, badge noir/jaune « 🔥 N », titre, étape).
- **Projets de loi** : liste-tableau bordée, lignes cliquables → accordéon avec chips d'étapes (Présentation→Principe→Étude→Adoption→Sanction ; passé = bleu, courant = jaune, futur = gris) + résumé en puces + disclaimer.
- **Quoi de neuf + Pétitions** (fond blanc, 2 colonnes) : actualités avec barre bleue à gauche + encart noir « Reprise des travaux 15 SEPT. 2026 » ; pétitions avec compteur signatures, barre de progression bleue bordée, lien « Voir et signer → ».
- **Mission** (fond bleu `#0E4FC1`, texte blanc) : citation 34px uppercase avec surlignage jaune, 2 encadrés « assnat.qc.ca fait » / « ce site essaie de faire » (le 2e bordé jaune).
- **Footer** noir.

### 2. Ministres (`Ministres.dc.html`)
- H1 « Conseil des ministres / & toute l'Assemblée. » + **recherche unique** (nom, portefeuille, circonscription — filtre ministres ET député·e·s en direct).
- **Composition — 125 sièges** : barre empilée bordée (segments proportionnels aux sièges par parti, séparés par bordures 3px) + légende à carrés.
- **Les ministres** : grille 3 colonnes, 27 cartes (badge parti coloré, bouton « Suivre » toggle → fond noir texte jaune « Suivi ✓ », nom uppercase 800, portefeuille bleu, circonscription, présence aux votes, PL parrainés, courriel). L'état « suivi » doit persister (localStorage ou compte).
- **Le reste de l'Assemblée** : tableau bordé ombre 8px, **groupé par parti** — bandeau pleine largeur aux couleurs du parti (nom complet + nombre de sièges), lignes nom/courriel + circonscription + Suivre.
- **Comparateur** (fond bleu) : 2 selects (jaune / blanc, bordés, ombre dure), tableau côte à côte (portefeuille, parti, circonscription, présence, PL parrainés). Jamais un classement — présentation factuelle.

### 3. Projets de loi (`Projets de loi.dc.html`)
- H1 « Projets de loi, / traduits en clair. » + recherche + filtres (Tous / En cours / Adoptés / 🔥 Challengés).
- **Bande légende** (fond blanc) : les 5 étapes en chips reliées par des flèches + lien vers Lexique.
- **Liste de cartes** cliquables : nº badge bleu, titre 800, parrain + date de dépôt, badge « 🔥 N demandes » si challengé, badge statut, chips d'étapes toujours visibles. Ouvert → 2 colonnes : « Ce que ça fait, en clair » (puces) + « Dernier événement » (encadré) + CTA jaune « Texte intégral → assnat.qc.ca » + bouton **« ✋ Challenger ce projet (N) »** (toggle, compteur +1, persistance requise côté vrai site).
- **Explainer challenge** (fond jaune) : c'est quoi challenger + top 3 des demandes.

### 4. Votes (`Votes.dc.html`)
- H1 « Qui a voté / pour, contre, absent. » + manifeste (« On n'interprète pas — on montre »).
- **Motions cachées par défaut** : bouton « Montrer les motions (N) » / « Masquer les motions » (actif = noir/jaune). Seuls les votes sur projets de loi sont visibles initialement.
- **Cartes de vote** : badge Adopté (vert) / Rejeté (rouge), sujet, date + type, compteurs pour/contre/abs colorés, **barre de résultat** segmentée vert/rouge/gris bordée. Ouvert → grille par parti (4 encadrés à bandeau coloré : pour/contre/absents) + **détail nominal complet** : 3 colonnes défilables (max-height 260px) Pour / Contre / Absent·e·s listant les 125 député·e·s avec pastille de parti + note « une absence n'est pas un non » + CTA jaune « Procès-verbal complet ».
- **« Comment lire un vote »** (fond bleu) : 3 encadrés (Vote nominal / Adopté ≠ loi / Ligne de parti, le 3e bordé jaune).
- Cohérence des données : les totaux d'en-tête DOIVENT égaler la somme du détail par parti (les 2 indépendants comptés dans les absents dans la maquette).

### 5. Lexique (`Lexique.dc.html`)
- H1 « Le jargon, / décodé. » + recherche + filtres par catégorie (Tous / Processus / Votes / Personnes et rôles / Outils citoyens) avec compteur de résultats.
- **Grille 2 colonnes** de cartes : terme uppercase 900, badge catégorie coloré (Processus bleu clair, Votes vert clair, Personnes jaune, Outils pêche), définition, puis « **En une phrase :** » + résumé italique.
- 20 termes fournis dans la maquette (réutiliser les textes tels quels — ils sont rédigés).
- **« Un mot vous échappe ? »** (fond jaune) : CTA noir « ✉ Suggérer un terme ».

## Interactions & Behavior
- **Accordéons** (projets, votes) : un seul ouvert à la fois (`openIndex`, re-clic pour fermer), animation d'entrée fade+translateY 8px, 250ms ease.
- **A− / A+** : échelle du font-size racine 0.85–1.3, pas de 0.1 (les tailles en px héritent via em ou recalcul).
- **Recherche** : filtre en direct, insensible à la casse ; état vide = encadré « Aucun résultat » bordé.
- **Suivre / Challenger** : toggles avec compteur ; côté production, persister (localStorage minimum).
- **Ticker** : pause au survol souhaitable (non implémenté dans la maquette).
- Hover liens : `#0E4FC1 → #08307A`. Pas de transitions douces ailleurs — le style assume des changements nets.
- Cibles tactiles ≥ 30px (boutons A−/A+ = 30px, le reste plus grand).

## State Management
Par page : `scale` (échelle texte), `query` (recherche), `openBill`/`openVote` (accordéon), `filter`/`cat` (filtres), `follows` (map clé→bool), `challenges` (map), `showMotions` (bool). Tout est local à la page ; en production, `follows`/`challenges` → localStorage ou backend.

## Assets
Aucune image. Tout est typographie + bordures. Émojis utilisés comme icônes : 🔍 ✋ 🔥 ✉ ● (à conserver — c'est cohérent avec le ton citoyen). Fonts via Google Fonts : Archivo, Archivo Narrow.

## Files
- `Apercu.dc.html` — accueil
- `Ministres.dc.html` — conseil + assemblée + comparateur
- `Projets de loi.dc.html` — liste, filtres, challenge
- `Votes.dc.html` — registre nominal
- `Lexique.dc.html` — glossaire
- `support.js` — runtime des prototypes (ignorer ; sert uniquement à ouvrir les .dc.html dans un navigateur)

Chaque fichier contient le template HTML (styles inline = source de vérité) et une classe JS avec les données d'exemple et la logique d'interaction.
