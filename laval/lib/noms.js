// Clés de jointure entre les sources de la Ville, qui n'écrivent jamais un nom deux fois de la
// même façon : « Fatima–Parcours-du-Cerf » (tiret demi-cadratin) sur la page des élus,
// « Fatima-Parcours-du-Cerf » ailleurs ; « Lysa BELAICHA » sur la page, « Lysa Bélaïcha » dans
// un procès-verbal de 2025. On compare des clés, pas des libellés.

export function cle(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[’']/g, '')
    .replace(/^(?:arrondissement|district) (?:de |des |du |d)?/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Sans aucun séparateur : « Boisé-Du Tremblay » et « Boisé du Tremblay » se rejoignent.
export function cleStricte(s) {
  return cle(s).replace(/-/g, '');
}

export function normaliserEspaces(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// « Marie-Michèle DROLET » -> « Marie-Michèle Drolet » ; « SABOURIN-LEFEBVRE » -> « Sabourin-Lefebvre ».
// Seuls les mots entièrement en capitales sont touchés : un prénom déjà écrit normalement
// (« LeMoyne », « McDuff ») reste tel quel.
export function casseDeNom(s) {
  return normaliserEspaces(s).replace(/[\p{Lu}]{2,}(?:[’'-][\p{Lu}]+)*/gu, (mot) =>
    mot.toLocaleLowerCase('fr-CA').replace(/(^|[\s’'-])(\p{Ll})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('fr-CA'))
  );
}
