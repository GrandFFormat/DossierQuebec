// Lecteur CSV minimal, sans dépendance : guillemets doublés, retours à la ligne à
// l'intérieur des guillemets, BOM, séparateur virgule ou point-virgule (détecté sur la
// première ligne — les exports municipaux hésitent entre les deux).
//
// Les en-têtes sont rendus dans deux formes : `colonnes` (tels quels) et, pour chaque
// ligne, des clés NORMALISÉES — minuscules, sans accents, espaces réduits — parce que la
// Ville écrit tantôt « Prénom », tantôt « prenom », tantôt « Nom du district ».

export function normaliserCle(s) {
  return String(s ?? '')
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function detecterSeparateur(premiereLigne) {
  const virgules = (premiereLigne.match(/,/g) ?? []).length;
  const pointsVirgules = (premiereLigne.match(/;/g) ?? []).length;
  return pointsVirgules > virgules ? ';' : ',';
}

export function parserCsv(texte) {
  const src = String(texte ?? '').replace(/^﻿/, '');
  const finPremiere = src.indexOf('\n');
  const sep = detecterSeparateur(finPremiere < 0 ? src : src.slice(0, finPremiere));

  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          champ += '"';
          i++;
        } else entreGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') entreGuillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      ligne.push(champ);
      champ = '';
      lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  const nonVides = lignes.filter((l) => l.some((v) => v.trim() !== ''));
  if (!nonVides.length) return { colonnes: [], cles: [], lignes: [] };
  const colonnes = nonVides[0].map((c) => c.trim());
  const cles = colonnes.map(normaliserCle);
  const objets = nonVides.slice(1).map((valeurs) => {
    const o = {};
    cles.forEach((cle, i) => {
      o[cle] = (valeurs[i] ?? '').trim();
    });
    return o;
  });
  return { colonnes, cles, lignes: objets };
}

// La première colonne dont la clé normalisée contient l'un des fragments donnés.
export function colonne(cles, ...fragments) {
  for (const f of fragments) {
    const trouve = cles.find((c) => c.includes(normaliserCle(f)));
    if (trouve) return trouve;
  }
  return null;
}
