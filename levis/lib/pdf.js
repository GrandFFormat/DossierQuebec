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
//
// LÉVIS : chaque ligne dit aussi si elle est entièrement en gras (`gras`). Dans les
// procès-verbaux de Lévis, le numéro de résolution et son objet sont en gras, le corps ne
// l'est pas : c'est ce qui donne l'objet exact, sans deviner où il s'arrête. `estGras` reçoit
// le nom interne de la police d'un fragment et dit si la vraie police est une graisse.
function lignesDePage(items, estGras = () => false) {
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
    ligne.fragments.push({ x, str: it.str, largeur: it.width ?? 0, gras: estGras(it.fontName) });
  }
  for (const l of lignes) {
    l.fragments.sort((a, b) => a.x - b.x);
    let texte = '';
    let precedent = null;
    for (const f of l.fragments) {
      if (precedent) {
        const ecart = f.x - (precedent.x + precedent.largeur);
        if (ecart > 1 && !precedent.str.endsWith(' ') && !f.str.startsWith(' ')) texte += ' ';
      }
      texte += f.str;
      precedent = f;
    }
    l.texte = texte.replace(ESPACE_INSECABLE, ' ');
    const visibles = l.fragments.filter((f) => f.str.trim());
    l.gras = visibles.length > 0 && visibles.every((f) => f.gras);
  }
  // pdf.js donne y depuis le bas de la page : le haut a le y le plus grand.
  lignes.sort((a, b) => b.y - a.y);
  return lignes.map(({ y, texte, gras }) => ({ y, texte, gras }));
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
    // Les vrais noms de police (« BCDFEE+TimesNewRomanPS-BoldMT ») ne sont connus qu'une fois
    // les polices chargées, ce que fait getOperatorList.
    let estGras = () => false;
    try {
      await page.getOperatorList();
      const cache = new Map();
      estGras = (id) => {
        if (!cache.has(id)) {
          let nom = '';
          try {
            nom = page.commonObjs.get(id)?.name ?? '';
          } catch {
            nom = '';
          }
          cache.set(id, /bold|black|heavy|demi|semibold/i.test(nom));
        }
        return cache.get(id);
      };
    } catch {
      // polices illisibles : pas de graisse, le lecteur de PV se rabat sur ses règles de texte
    }
    const lignes = lignesDePage(contenu.items, estGras);
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
