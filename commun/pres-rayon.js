// « Près de chez moi » : le rayon « − 1 km + », la carte et la bulle-maison (15 nov. 2026).
// Standard de toute ville, copié du modèle de Vancouver (dossierBC/vancouver/near-me-in-vancouver.html).
// La page prépare ses éléments (chantiers, permis) avec leur position ; ce module trie par distance,
// écrit la liste (25 plus proches), le cadre du rayon et la carte Leaflet (chargée seulement ici).
//
//   import { bulle, afficherRayon } from '/commun/pres-rayon.js';
//   afficherRayon(zone, { cleStockage: 'qc:rayon', tr, adresse: { lat, lon }, sections: [
//     { titre: (ou, n) => …, items: [{ lat, lon, classe, libelle, html: (distance) => '<li>…</li>', popup }], pied: '…' }] });

const MAISON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// La bulle (genre ou statut) devient elle-même le lien Google Maps, avec la maison dedans.
export const bulle = (classe, libelle, lat, lon, titre = 'Voir sur Google Maps') => (lat && lon
  ? `<a class="genre-permis bulle-carte ${esc(classe)}" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${lat},${lon}`)}" target="_blank" rel="noopener" title="${esc(titre)}">${MAISON}${libelle}</a>`
  : `<span class="genre-permis ${esc(classe)}">${libelle}</span>`);

export const RAYONS = [0.25, 0.5, 1, 2, 3, 5]; // km

const css = `
  .zone-rayon { display: contents; }
  .cadre-rayon, .carte-pres { grid-column: 1 / -1; }
  .carte-pres { height: 380px; border-radius: var(--rayon); border: var(--bordure-carte, 1px solid var(--ligne)); margin: 0 0 6px; z-index: 0; }
  .carte-pres .leaflet-popup-content { font-size: 13px; line-height: 1.45; }
  .cadre-rayon { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 14px 0 10px; padding: 10px 14px;
    background: var(--carte); border: var(--bordure-carte, 1px solid var(--ligne)); border-radius: var(--rayon); }
  .cadre-rayon > span { font-weight: 600; }
  .cadre-rayon button { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--accent); background: var(--accent);
    color: #fff; font-family: inherit; font-weight: 700; font-size: 20px; line-height: 1; cursor: pointer; padding: 0; }
  .cadre-rayon button:disabled { opacity: .35; cursor: default; }
  .cadre-rayon strong { min-width: 64px; text-align: center; font-size: 1.1rem; }
  /* Les filtres par type (Martin, 15 nov. 2026) : dans la place libre du cadre, une pastille par genre
     de chantier ou de permis, de la couleur de sa bulle ; un clic la masque ou la remontre. */
  .cadre-rayon .rayon-pm { display: inline-flex; align-items: center; gap: 10px; flex: none; }
  .cadre-rayon .filtre-groupe { width: auto; height: auto; border-radius: 999px; padding: 5px 12px; font-size: .82rem; font-weight: 700;
    background: var(--encre); color: var(--fond); border: 1.5px solid var(--encre); }
  .cadre-rayon .filtre-groupe[aria-pressed="false"] { background: transparent; color: var(--encre); opacity: .5; text-decoration: line-through; }
  .cadre-rayon .filtre-groupe[aria-pressed="mixed"] { background: transparent; color: var(--encre); }
  .cadre-rayon .filtre-circulation { width: auto; height: auto; border-radius: 999px; padding: 5px 12px; font-size: .82rem; font-weight: 700;
    background: transparent; color: var(--encre); border: 1.5px solid #E8742C; }
  .cadre-rayon .filtre-circulation[aria-pressed="true"] { background: #E8742C; color: #fff; }
  .cadre-rayon .bouton-filtres { width: auto; height: auto; border-radius: 999px; padding: 5px 12px; font-size: .82rem; font-weight: 700;
    background: transparent; color: var(--encre); border: 1.5px solid var(--ligne-forte, var(--ligne)); }
  .cadre-rayon .bouton-filtres[aria-expanded="true"] { background: var(--encre); color: var(--fond); border-color: var(--encre); }
  .cadre-rayon .bouton-filtres b { font-weight: 700; color: #E8742C; }
  .filtres-detail { display: none; flex-basis: 100%; flex-wrap: wrap; gap: 6px; order: 9; padding-top: 4px; }
  .filtres-detail.ouvert { display: flex; }
  .filtres-rayon { display: flex; flex-wrap: wrap; gap: 6px; margin-right: auto; flex: 1; }
  .cadre-rayon .filtre-type { width: auto; height: auto; border-radius: 999px; padding: 4px 10px 4px 8px; font-size: .8rem; font-weight: 600;
    background: transparent; color: var(--encre); border: 1.5px solid var(--ligne-forte, var(--ligne)); display: inline-flex; align-items: center; gap: 6px; }
  .cadre-rayon .filtre-type i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .cadre-rayon .filtre-type b { font-weight: 600; opacity: .7; }
  .cadre-rayon .filtre-type[aria-pressed="false"] { opacity: .45; text-decoration: line-through; }
  .cadre-rayon .filtre-type[aria-pressed="false"] i { background: transparent !important; box-shadow: inset 0 0 0 1.5px currentColor; }
  .bulle-carte { display: inline-flex; align-items: center; gap: 4px; text-decoration: none; color: #fff; }
  .bulle-carte svg { width: 13px; height: 13px; }
  .bulle-carte:hover, .bulle-carte:focus-visible { filter: brightness(1.12); text-decoration: underline; color: #fff; }
  @media (max-width: 720px), (pointer: coarse) {
    .bulle-carte { min-height: 32px; padding: 4px 12px; font-size: .8rem; margin: 2px 4px 2px 0; }
    .bulle-carte svg { width: 16px; height: 16px; }
  }`;
if (!document.getElementById('css-pres-rayon')) {
  const s = document.createElement('style'); s.id = 'css-pres-rayon'; s.textContent = css; document.head.append(s);
}

export const distanceKm = (a, b, c, d) => {
  const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

let leaflet = null;
const chargerLeaflet = () => leaflet ??= new Promise((ok, non) => {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.append(l);
  const js = document.createElement('script');
  js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.onload = () => ok(window.L); js.onerror = non;
  document.head.append(js);
});
// Chaque point prend la couleur de sa bulle, lue dans le CSS : le thème clair ou sombre suit.
const couleurs = {};
const couleurDe = (classe) => couleurs[classe] ??= (() => {
  const e = document.createElement('span');
  e.className = `genre-permis ${classe}`; e.style.display = 'none';
  document.body.append(e);
  const c = getComputedStyle(e).backgroundColor; e.remove(); return c;
})();

// Affiche le cadre, la carte et les sections dans `el` (vidé). Rend le nombre d'éléments par section.
export function afficherRayon(el, { cleStockage, tr, adresse, sections }) {
  let rayon = 1;
  try { const r = Number(localStorage.getItem(cleStockage)); if (RAYONS.includes(r)) rayon = r; } catch {}
  const texteKm = (k) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toLocaleString(tr('fr-CA', 'en-CA'), { maximumFractionDigits: 1 })} km`);
  // « Impact sur la circulation » (Martin, 15 nov. 2026) : un élément porte circulation: true quand la
  // source dit qu'il ferme une rue ou des voies. Le bouton n'apparaît que si la ville distingue
  // (Québec oui ; Montréal non : toutes ses « entraves » en sont, sans dire lesquelles ferment des voies).
  // Deux boutons seulement dans le cadre (Martin, 15 nov. 2026) : « Filtres », qui déplie les autres (Routes, Permis, les types), et « Impact sur la circulation ».
  let filtresOuverts = false;
  let seulementCirculation = false;
  try { seulementCirculation = localStorage.getItem(`${cleStockage}:circulation`) === '1'; } catch {}
  const distingue = sections.some((sec) => sec.items.some((i) => i.circulation === true)) && sections.some((sec) => sec.items.some((i) => i.circulation === false));
  // Les types masqués, gardés d'une visite à l'autre.
  let masques = new Set();
  try { masques = new Set(JSON.parse(localStorage.getItem(`${cleStockage}:masques`) ?? '[]')); } catch {}
  const rendre = () => {
    // Tous les types présents dans le rayon, avec leur nombre, avant le filtre : leurs pastilles.
    const dansRayon = sections.map((s) => s.items
      .filter((i) => i.lat && i.lon && (!seulementCirculation || !distingue || i.circulation))
      .map((i) => ({ i, d: distanceKm(adresse.lat, adresse.lon, i.lat, i.lon) }))
      .filter((x) => x.d <= rayon));
    const types = new Map();
    for (const l of dansRayon) for (const { i } of l) {
      const t = types.get(i.classe) ?? { classe: i.classe, libelle: i.libelle, n: 0 };
      t.n++; types.set(i.classe, t);
    }
    // Un bouton par section (Routes, Permis) : masque ou remontre d'un coup tous ses types.
    const etatGroupe = (cl) => (cl.every((c) => masques.has(c)) ? 'false' : cl.some((c) => masques.has(c)) ? 'mixed' : 'true');
    const groupes = sections.map((sec, k) => {
      const cl = [...new Set(dansRayon[k].map(({ i }) => i.classe))];
      const nom = sec.groupe ?? (k === 0 ? tr('Routes', 'Roads') : tr('Permis', 'Permits'));
      return cl.length ? `<button type="button" class="filtre-groupe" data-classes="${esc(cl.join(','))}" aria-pressed="${etatGroupe(cl)}">${nom}</button>` : '';
    }).join('');
    const circ = distingue ? `<button type="button" class="filtre-circulation" aria-pressed="${seulementCirculation}">🚧 ${tr('Impact sur la circulation', 'Traffic impact')}</button>` : '';
    const nbMasques = [...types.keys()].filter((c) => masques.has(c)).length;
    const boutonFiltres = `<button type="button" class="bouton-filtres" aria-expanded="${filtresOuverts}">${tr('Filtres', 'Filters')}${nbMasques ? ` <b>${nbMasques}</b>` : ''} ${filtresOuverts ? '▴' : '▾'}</button>`;
    const detail = groupes + [...types.values()].map((t) => `<button type="button" class="filtre-type" data-classe="${esc(t.classe)}" aria-pressed="${!masques.has(t.classe)}"><i style="background:${couleurDe(t.classe)}"></i>${t.libelle} <b>${t.n}</b></button>`).join('');
    // Impact sur la circulation actif : seul ce bouton reste, les filtres disparaissent (Martin, 15 nov. 2026).
    const filtres = seulementCirculation && distingue ? circ : boutonFiltres + circ + `<div class="filtres-detail${filtresOuverts ? ' ouvert' : ''}">${detail}</div>`;
    const tri = sections.map((s) => s.items
      .filter((i) => i.lat && i.lon && !masques.has(i.classe) && (!seulementCirculation || !distingue || i.circulation))
      .map((i) => ({ i, d: distanceKm(adresse.lat, adresse.lon, i.lat, i.lon) }))
      .filter((x) => x.d <= rayon).sort((a, b) => a.d - b.d));
    const ou = tr(`à moins de ${texteKm(rayon)}`, `within ${texteKm(rayon)}`);
    el.innerHTML = `<div class="cadre-rayon" role="group" aria-label="${tr('Distance autour de votre adresse', 'Distance around your address')}">
        <span>${tr('Autour de votre adresse', 'Around your address')}</span>
        <div class="filtres-rayon" role="group" aria-label="${tr('Montrer ou masquer un type', 'Show or hide a type')}">${filtres}</div>
        <span class="rayon-pm"><button type="button" data-sens="-1" ${rayon === RAYONS[0] ? 'disabled' : ''} aria-label="${tr('Plus près', 'Closer')}">−</button>
        <strong aria-live="polite">${texteKm(rayon)}</strong>
        <button type="button" data-sens="1" ${rayon === RAYONS[RAYONS.length - 1] ? 'disabled' : ''} aria-label="${tr('Plus loin', 'Farther')}">+</button></span>
      </div><div class="carte-pres" aria-label="${tr('Carte des chantiers et des permis', 'Map of roadwork and permits')}"></div>` +
      sections.map((s, k) => `<section class="bloc-pres"><h3>${s.titre(ou, tri[k].length)}</h3>${tri[k].length
        ? `<ul>${tri[k].slice(0, 25).map(({ i, d }) => i.html(` <span class="compte">· ${texteKm(d)}</span>`)).join('')}</ul>`
        : `<p class="compte">${tr('Aucun. Élargissez la distance avec le +.', 'None. Widen the distance with +.')}</p>`}${tri[k].length > 25 ? `<p class="compte">${tr('Les 25 plus proches.', 'The 25 closest.')}</p>` : ''}${s.pied ?? ''}</section>`).join('');
    el.querySelector('.bouton-filtres')?.addEventListener('click', () => { filtresOuverts = !filtresOuverts; rendre(); });
    el.querySelector('.filtre-circulation')?.addEventListener('click', () => {
      seulementCirculation = !seulementCirculation;
      try { localStorage.setItem(`${cleStockage}:circulation`, seulementCirculation ? '1' : '0'); } catch {}
      rendre();
    });
    el.querySelectorAll('.filtre-groupe').forEach((b) => b.addEventListener('click', () => {
      const cl = b.dataset.classes.split(',');
      const tous = cl.every((c) => masques.has(c));
      for (const c of cl) tous ? masques.delete(c) : masques.add(c);
      try { localStorage.setItem(`${cleStockage}:masques`, JSON.stringify([...masques])); } catch {}
      rendre();
    }));
    el.querySelectorAll('.filtre-type').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.classe;
      masques.has(c) ? masques.delete(c) : masques.add(c);
      try { localStorage.setItem(`${cleStockage}:masques`, JSON.stringify([...masques])); } catch {}
      rendre();
    }));
    el.querySelectorAll('.cadre-rayon button[data-sens]').forEach((b) => b.addEventListener('click', () => {
      const i = RAYONS.indexOf(rayon) + Number(b.dataset.sens);
      if (i < 0 || i >= RAYONS.length) return;
      rayon = RAYONS[i];
      try { localStorage.setItem(cleStockage, String(rayon)); } catch {}
      rendre();
    }));
    dessiner(el.querySelector('.carte-pres'), tri, texteKm);
    el.dataset.compte = tri.map((t) => t.length).join(',');
  };
  async function dessiner(boite, tri, texteKm) {
    let L;
    try { L = await chargerLeaflet(); } catch { boite.remove(); return; }
    if (!document.body.contains(boite)) return;
    // setView AVANT getBounds/fitBounds, sinon erreur layerPointToLatLng.
    const carte = L.map(boite, { scrollWheelZoom: false }).setView([adresse.lat, adresse.lon], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(carte);
    const cercle = L.circle([adresse.lat, adresse.lon], { radius: rayon * 1000, color: '#1f4f8a', weight: 2, fillOpacity: 0.06 }).addTo(carte);
    L.circleMarker([adresse.lat, adresse.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#1f4f8a', fillOpacity: 1 })
      .addTo(carte).bindPopup(`<strong>${tr('Votre adresse', 'Your address')}</strong>`);
    for (const liste of tri) for (const { i, d } of liste) {
      L.circleMarker([i.lat, i.lon], { radius: 6, color: '#fff', weight: 1.5, fillColor: couleurDe(i.classe), fillOpacity: 0.95 })
        .addTo(carte).bindPopup(`${i.popup ?? ''}<br>${texteKm(d)}`);
    }
    carte.fitBounds(cercle.getBounds(), { padding: [12, 12] });
  }
  rendre();
}
