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
  }
  // pdf.js donne y depuis le bas de la page : le haut a le y le plus grand.
  lignes.sort((a, b) => b.y - a.y);
  return lignes.map(({ y, texte }) => ({ y, texte }));
}

export async function lirePdf(data) {
  const lib = await pdfjs();
  const tache = lib.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
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

// Une minorité de PDF ressortent avec les lettres espacées (« Ca the r ine »). On ne
// reconstitue pas : on signale. Même critère qu'à Québec.
export function texteDegrade(s) {
  const tokens = String(s ?? '').split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return false;
  const isoles = tokens.filter((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, '').length === 1).length;
  return isoles / tokens.length > 0.25;
}
