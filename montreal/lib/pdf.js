// Texte et hyperliens d'un PDF, avec pdf.js (Mozilla) en Node — la seule dépendance de
// plus qu'à Québec. Là-bas, la Ville avait déjà extrait le texte dans son index ; ici
// les procès-verbaux et ordres du jour n'existent qu'en PDF, il faut les lire nous-mêmes.
//
// Le texte est reconstruit ligne par ligne d'après la position verticale des fragments :
// deux fragments à la même hauteur sont sur la même ligne. C'est ce qui permet ensuite
// aux regex de reconnaître « Votent en faveur : » en début de ligne, ou « 20.03
// 1266245003 » (article et numéro de dossier) à la fin d'une résolution.
//
// Les hyperliens (annotations de type lien) sont rendus avec leur page et leur hauteur :
// les ordres du jour « LPP » renvoient vers les sommaires décisionnels, et c'est ce lien
// qu'on veut rattacher au numéro de dossier écrit juste à côté.

let pdfjsPromise = null;
function pdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

const ESPACE_INSECABLE = / /g;

// Regroupe les fragments d'une page en lignes, triées de haut en bas. Le texte n'est pas
// encore composé : il dépend d'une décision qui se prend sur le document entier, pas sur
// une page (voir colonneDroite).
function lignesDePage(items) {
  const lignes = [];
  for (const it of items) {
    if (!('str' in it) || it.str === '') continue;
    const y = it.transform[5];
    const x = it.transform[4];
    let ligne = lignes.find((l) => Math.abs(l.y - y) <= 2);
    if (!ligne) {
      ligne = { y, fragments: [] };
      lignes.push(ligne);
    }
    ligne.fragments.push({ x, str: it.str, largeur: it.width ?? 0 });
  }
  for (const l of lignes) l.fragments.sort((a, b) => a.x - b.x);
  // pdf.js donne y depuis le bas de la page : le haut a le y le plus grand.
  lignes.sort((a, b) => b.y - a.y);
  return lignes;
}

// Pierrefonds-Roxboro publie ses procès-verbaux sur deux colonnes, le français à gauche et
// sa traduction anglaise à droite. Mises bout à bout, les deux moitiés donnent des lignes
// illisibles : « Règlement CA29 0046 sur la tenue, la By-law CA29 0046 governing the
// holding, ». On ne garde alors que la colonne de gauche — le document français, celui que
// le site présente. Rien n'est inventé : l'autre moitié dit la même chose en anglais.
//
// Ce qui rend l'exercice délicat, c'est qu'un blanc large ne suffit pas à reconnaître une
// gouttière. Mesurés sur un vrai procès-verbal, les espaces entre deux mots FRANÇAIS de la
// même phrase montent jusqu'à 25 unités (« M  Jean-François », « d'arrondissement
// située »), tandis que la gouttière de la page de garde n'en fait que 17. Les deux
// populations se recouvrent entièrement : aucun seuil ne les sépare.
//
// Ce qui les sépare, c'est la POSITION. Une colonne commence toujours au même endroit,
// page après page ; un espace entre deux mots tombe où il tombe. D'où la méthode, en deux
// temps :
//
//   1. Apprendre, sur TOUTES les lignes du document, les x où une colonne commence. Seuls
//      les blancs francs — au moins 24 unités, vers le milieu de la page — servent de
//      preuve. Sur un procès-verbal de Pierrefonds, trois positions ressortent : x=315
//      dans le corps du texte, x=338 et x=362 dans les tableaux de la période de
//      questions, où le français est en retrait derrière une puce. Une page seule se
//      tromperait : la mesure page à page donnait 305, 332, 356, puis rien du tout.
//   2. Couper chaque ligne au premier fragment qui commence à l'une de ces positions,
//      quelle que soit la largeur du blanc qui le précède. C'est ainsi que la page de
//      garde et les titres se coupent enfin — « PROLONGATION DE LA PÉRIODE DE QUESTION
//      PERIOD EXTENSION » redevient « PROLONGATION DE LA PÉRIODE DE ».
const ECART_COLONNE = 24; // la preuve : un blanc franc, bien plus qu'une espace entre mots
const ECART_MINIMAL = 6; // à une position apprise, ce reste suffit — ci-dessus, 17 unités
const TOLERANCE = 8; // deux colonnes sont alignées à quelques unités près (311 et 315)
const PART_MINIMALE = 0.35; // au moins 35 % des lignes doivent être coupées en deux
const PART_COLONNE = 0.03; // une position retenue doit revenir sur au moins 3 % des lignes
// Deux colonnes se partagent la page : elles commencent vers le milieu. Hors de cette
// bande, ce n'est pas une mise en colonnes — c'est une marge, une numérotation ou un
// tableau, et se tromper là coûterait la moitié de chaque ligne du document.
const BANDE = [0.35, 0.65];
// Une ligne qui commence au-delà de ce point n'a pas de moitié française : elle est tout
// entière dans la colonne de droite, et n'a rien à faire dans le texte qu'on garde.
const DEBUT_COLONNE_DROITE = 0.45;

function pleins(ligne) {
  return ligne.fragments.filter((f) => f.str.trim() !== '');
}

// Les fragments faits UNIQUEMENT d'espaces sont écartés de toutes ces mesures, et c'est
// une part du problème : dans ces PDF, la gouttière est souvent comblée par un tel
// fragment — « Signature du livre d'or » à x=95, trente-et-un blancs à x=198, puis
// « Signing of the guestbook » à x=315. Mesuré sur les fragments voisins, l'écart valait
// zéro, et la ligne ne comptait pas comme coupable.
function preuves(lignes, largeurPage) {
  const out = [];
  for (const l of lignes) {
    const f = pleins(l);
    for (let i = 1; i < f.length; i++) {
      if (f[i].x - (f[i - 1].x + f[i - 1].largeur) < ECART_COLONNE) continue;
      if (f[i].x < largeurPage * BANDE[0] || f[i].x > largeurPage * BANDE[1]) continue;
      out.push(f[i].x);
    }
  }
  return out;
}

// Les positions où une colonne commence, de la mieux attestée à la moins bonne.
export function colonnes(lignes, largeurPage) {
  if (lignes.length < 25 || !largeurPage) return [];
  let reste = preuves(lignes, largeurPage);
  const minimum = Math.max(3, lignes.length * PART_COLONNE);
  const centres = [];
  while (reste.length) {
    let meilleur = null;
    let mieux = 0;
    for (const c of reste) {
      const n = reste.filter((o) => Math.abs(o - c) <= TOLERANCE).length;
      if (n > mieux) {
        mieux = n;
        meilleur = c;
      }
    }
    if (mieux < minimum) break;
    centres.push(meilleur);
    reste = reste.filter((o) => Math.abs(o - meilleur) > TOLERANCE);
  }
  return centres;
}

// Où cette ligne passe-t-elle dans la colonne de droite ?
function coupureDeLigne(ligne, centres) {
  const f = pleins(ligne);
  for (let i = 1; i < f.length; i++) {
    if (f[i].x - (f[i - 1].x + f[i - 1].largeur) < ECART_MINIMAL) continue;
    if (centres.some((c) => Math.abs(f[i].x - c) <= TOLERANCE)) return f[i].x;
  }
  return null;
}

export function estDeuxColonnes(lignes, centres) {
  if (!centres.length) return false;
  return lignes.filter((l) => coupureDeLigne(l, centres) != null).length >= lignes.length * PART_MINIMALE;
}

// Compose le texte d'une ligne, sans sa moitié anglaise quand il y en a une.
export function texteDeLigne(ligne, largeurPage, centres) {
  let fragments = ligne.fragments;
  if (centres.length) {
    const f = pleins(ligne);
    // Rien que du blanc, ou une ligne entièrement dans la colonne de droite.
    if (!f.length || f[0].x >= largeurPage * DEBUT_COLONNE_DROITE) return '';
    const coupure = coupureDeLigne(ligne, centres);
    if (coupure != null) fragments = fragments.filter((x) => x.x < coupure);
  }
  let texte = '';
  let precedent = null;
  for (const f of fragments) {
    if (precedent) {
      const ecart = f.x - (precedent.x + precedent.largeur);
      if (ecart > 1 && !precedent.str.endsWith(' ') && !f.str.startsWith(' ')) texte += ' ';
    }
    texte += f.str;
    precedent = f;
  }
  return texte.replace(ESPACE_INSECABLE, ' ').trimEnd();
}

export async function lirePdf(data) {
  const lib = await pdfjs();
  // verbosity 0 : les avertissements de polices (« TT: undefined function ») remplissaient le
  // journal par centaines sans rien dire d'utile.
  const tache = lib.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  const doc = await tache.promise;
  // Premier temps : les lignes et leurs fragments, sans composer le texte. La mise en
  // colonnes se décide sur l'ensemble du document (voir colonneDroite), donc il faut
  // l'avoir lu en entier avant d'écrire une seule ligne.
  const brutes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    const liens = [];
    try {
      for (const a of await page.getAnnotations()) {
        // rect = [x1, y1, x2, y2] ; on retient le milieu vertical.
        if (a?.url) liens.push({ url: a.url, y: a.rect ? (a.rect[1] + a.rect[3]) / 2 : null });
      }
    } catch {
      // certaines annotations sont illisibles : on garde le texte
    }
    brutes.push({ numero: i, lignes: lignesDePage(contenu.items), liens, largeur: page.view?.[2] ?? null });
    page.cleanup();
  }
  await tache.destroy();

  const largeurs = brutes.map((p) => p.largeur).filter(Boolean).sort((a, b) => a - b);
  const largeurPage = largeurs.length ? largeurs[Math.floor(largeurs.length / 2)] : null;
  const toutesLesLignes = brutes.flatMap((p) => p.lignes);
  const centres = colonnes(toutesLesLignes, largeurPage);
  // Les positions apprises ne servent que si le document est VRAIMENT sur deux colonnes.
  const deuxColonnes = estDeuxColonnes(toutesLesLignes, centres) ? centres : [];

  // Second temps : le texte. Une ligne entièrement dans la colonne écartée devient vide,
  // et une ligne vide n'apprend rien à personne.
  const pages = brutes.map(({ numero, lignes, liens }) => {
    const rendues = lignes
      .map((l) => ({ y: l.y, texte: texteDeLigne(l, largeurPage, deuxColonnes) }))
      .filter((l) => l.texte !== '');
    return { numero, lignes: rendues, liens, texte: rendues.map((l) => l.texte).join('\n') };
  });
  return {
    nombrePages: pages.length,
    texte: pages.map((p) => p.texte).join('\n\f\n'),
    liens: [...new Set(pages.flatMap((p) => p.liens.map((l) => l.url)))],
    pages,
  };
}

// Un vrai PDF commence par « %PDF ». La Ville répond parfois une page HTML (200) à l'URL
// d'un procès-verbal pas encore publié : ce n'est pas un PDF, et pdf.js le dit en plantant.
export function estPdf(data) {
  return data && data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}

// Une minorité de PDF ressortent avec les lettres espacées (« Ca the r ine »). On ne
// reconstitue pas : on signale. Même critère qu'à Québec.
export function texteDegrade(s) {
  const tokens = String(s ?? '').split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return false;
  const isoles = tokens.filter((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, '').length === 1).length;
  return isoles / tokens.length > 0.25;
}
