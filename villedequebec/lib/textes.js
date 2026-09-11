// Ce que les scrapers partagent pour lire le texte intégral sans le demander en bloc.
//
// Le nom de fichier n'est pas filtrable dans l'index de la Ville ; le numéro l'est, et
// `search.in` accepte une liste. On demande donc le texte par lots de numéros, et l'appelant
// recoupe sur le nom de fichier pour ne rien attribuer de travers.

import { search, encodeFieldValue } from './gpd.js';

// Le filtre voyage dans l'URL : cent numéros font moins de deux kilooctets. Pour des
// documents lourds (un sommaire fait souvent 50 ko de texte), l'appelant réduit le lot.
export const LOT_TEXTE = 100;

export async function* textesParNumero(numeros, { select = 'metadata_storage_name,content', lot = LOT_TEXTE } = {}) {
  for (let i = 0; i < numeros.length; i += lot) {
    const valeurs = numeros.slice(i, i + lot).map(encodeFieldValue).join('|');
    const page = await search({ filter: `search.in(Numero, '${valeurs}', '|')`, select, top: 1000 });
    for (const row of page.value ?? []) yield row;
  }
}

// L'objet tel que la Ville l'indexe traîne des retours à la ligne et des espaces en rafale.
export function normaliserObjet(objet) {
  return (objet ?? '').replace(/\s+/g, ' ').trim() || null;
}
