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

// Regroupe les fragments d'une page en lignes, triées de haut en bas.
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

  // Pierrefonds-Roxboro publie ses procès-verbaux sur deux colonnes, le français à gauche
  // et sa traduction anglaise à droite. Mises bout à bout, les deux moitiés donnent des
  // lignes illisibles : « Règlement CA29 0046 sur la tenue, la By-law CA29 0046 governing
  // the holding, ». On ne garde alors que la colonne de gauche — le document français,
  // celui que le site présente. Rien n'est inventé : l'autre moitié dit la même chose en
  // anglais.
  const coupure = colonneDroite(lignes);

  for (const l of lignes) {
    const fragments = coupure == null ? l.fragments : l.fragments.filter((f) => f.x < coupure);
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
    l.texte = texte.replace(ESPACE_INSECABLE, ' ').trimEnd();
  }
  // pdf.js donne y depuis le bas de la page : le haut a le y le plus grand.
  lignes.sort((a, b) => b.y - a.y);
  return lignes.map(({ y, texte }) => ({ y, texte })).filter((l) => l.texte !== '');
}

// Où commence la colonne de droite, s'il y en a une ? On ne le décide qu'en voyant la
// même coupure se répéter : une page sur deux colonnes a, ligne après ligne, un blanc
// large au MÊME endroit. Un blanc isolé — « 20.03      1266245003 », un tableau, une
// signature en marge — n'en fait pas une, et c'est voulu : se tromper ici coûterait la
// moitié de chaque ligne d'un procès-verbal ordinaire.
const ECART_COLONNE = 24; // en unités PDF : bien plus qu'une espace, même large
const PART_MINIMALE = 0.45; // la coupure doit revenir sur au moins 45 % des lignes

function colonneDroite(lignes) {
  if (lignes.length < 12) return null;
  // Le plus grand blanc de chaque ligne, et la position où il s'ouvre.
  const ouvertures = [];
  for (const l of lignes) {
    let meilleur = 0;
    let ou = null;
    for (let i = 1; i < l.fragments.length; i++) {
      const precedent = l.fragments[i - 1];
      const ecart = l.fragments[i].x - (precedent.x + precedent.largeur);
      if (ecart > meilleur) {
        meilleur = ecart;
        ou = l.fragments[i].x;
      }
    }
    if (meilleur >= ECART_COLONNE) ouvertures.push(ou);
  }
  if (ouvertures.length < lignes.length * PART_MINIMALE) return null;

  // La colonne de droite commence là où le plus de lignes s'ouvrent. On tolère 12 unités
  // d'écart : les deux colonnes sont alignées, mais les fragments ne commencent pas tous
  // exactement au même point.
  ouvertures.sort((a, b) => a - b);
  let meilleure = null;
  let mieux = 0;
  for (const candidate of ouvertures) {
    const n = ouvertures.filter((o) => Math.abs(o - candidate) <= 12).length;
    if (n > mieux) {
      mieux = n;
      meilleure = candidate;
    }
  }
  if (mieux < lignes.length * PART_MINIMALE) return null;
  // La coupure se place un peu avant le début de la colonne de droite, pour ne pas
  // couper un fragment qui commencerait deux ou trois unités plus tôt.
  return meilleure - 6;
}

export async function lirePdf(data) {
  const lib = await pdfjs();
  // verbosity 0 : les avertissements de polices (« TT: undefined function ») remplissaient le
  // journal par centaines sans rien dire d'utile.
  const tache = lib.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  const doc = await tache.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const contenu = await page.getTextContent();
    const lignes = lignesDePage(contenu.items);
    const liens = [];
    try {
      for (const a of await page.getAnnotations()) {
        // rect = [x1, y1, x2, y2] ; on retient le milieu vertical.
        if (a?.url) liens.push({ url: a.url, y: a.rect ? (a.rect[1] + a.rect[3]) / 2 : null });
      }
    } catch {
      // certaines annotations sont illisibles : on garde le texte
    }
    pages.push({ numero: i, lignes, liens, texte: lignes.map((l) => l.texte).join('\n') });
    page.cleanup();
  }
  await tache.destroy();
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
