// Clés de jointure entre les jeux de la Ville, qui n'écrivent jamais un nom deux fois de
// la même façon : « Côte-des-Neiges - Notre-Dame-de-Grâce » dans un fichier, « Côte-des-
// Neiges–Notre-Dame-de-Grâce » dans l'autre, « L'Île-Bizard - Sainte-Geneviève » ici et
// « Île-Bizard–Sainte-Geneviève » là. On compare des clés, pas des libellés.

export function cle(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[’']/g, '')
    .replace(/^(?:arrondissement|district) (?:de |des |du |d)?/, '')
    .replace(/^(?:le |la |les |l)/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Le nom de famille tel qu'un procès-verbal l'écrit dans une liste de votants
// (« Martinez Ferrada », « Côté-Tremblay ») ramené à une clé comparable.
export function cleNom(s) {
  return cle(s).replace(/-/g, ' ');
}

export function normaliserEspaces(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// Les 19 arrondissements de Montréal, en clé. Sert à distinguer, dans une colonne
// « Arrondissement / Ville liée », ce qui est un arrondissement de Montréal de ce qui est
// une ville liée.
export const ARRONDISSEMENTS = [
  'Ahuntsic-Cartierville', 'Anjou', 'Côte-des-Neiges–Notre-Dame-de-Grâce', 'Lachine', 'LaSalle',
  "L'Île-Bizard–Sainte-Geneviève", 'Mercier–Hochelaga-Maisonneuve', 'Montréal-Nord', 'Outremont',
  'Pierrefonds-Roxboro', 'Le Plateau-Mont-Royal', 'Rivière-des-Prairies–Pointe-aux-Trembles',
  'Rosemont–La Petite-Patrie', 'Saint-Laurent', 'Saint-Léonard', 'Le Sud-Ouest', 'Verdun',
  'Ville-Marie', 'Villeray–Saint-Michel–Parc-Extension',
];
const CLES_ARRONDISSEMENTS = new Set(ARRONDISSEMENTS.map(cle));
export function estArrondissement(s) {
  return CLES_ARRONDISSEMENTS.has(cle(s));
}

// Clé encore plus tolérante : sans aucun séparateur. « De Lorimier » et « DeLorimier »
// se rejoignent ; « Saint-Paul–Émard » et « Saint-Paul—Émard » aussi.
export function cleStricte(s) {
  return cle(s).replace(/-/g, '');
}
