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
  .cadre-rayon span { font-weight: 600; margin-right: auto; }
  .cadre-rayon button { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--accent); background: var(--accent);
    color: #fff; font-family: inherit; font-weight: 700; font-size: 20px; line-height: 1; cursor: pointer; padding: 0; }
  .cadre-rayon button:disabled { opacity: .35; cursor: default; }
  .cadre-rayon strong { min-width: 64px; text-align: center; font-size: 1.1rem; }
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
  const rendre = () => {
    const tri = sections.map((s) => s.items
      .filter((i) => i.lat && i.lon)
      .map((i) => ({ i, d: distanceKm(adresse.lat, adresse.lon, i.lat, i.lon) }))
      .filter((x) => x.d <= rayon).sort((a, b) => a.d - b.d));
    const ou = tr(`à moins de ${texteKm(rayon)}`, `within ${texteKm(rayon)}`);
    el.innerHTML = `<div class="cadre-rayon" role="group" aria-label="${tr('Distance autour de votre adresse', 'Distance around your address')}">
        <span>${tr('Autour de votre adresse', 'Around your address')}</span>
        <button type="button" data-sens="-1" ${rayon === RAYONS[0] ? 'disabled' : ''} aria-label="${tr('Plus près', 'Closer')}">−</button>
        <strong aria-live="polite">${texteKm(rayon)}</strong>
        <button type="button" data-sens="1" ${rayon === RAYONS[RAYONS.length - 1] ? 'disabled' : ''} aria-label="${tr('Plus loin', 'Farther')}">+</button>
      </div><div class="carte-pres" aria-label="${tr('Carte des chantiers et des permis', 'Map of roadwork and permits')}"></div>` +
      sections.map((s, k) => `<section class="bloc-pres"><h3>${s.titre(ou, tri[k].length)}</h3>${tri[k].length
        ? `<ul>${tri[k].slice(0, 25).map(({ i, d }) => i.html(` <span class="compte">· ${texteKm(d)}</span>`)).join('')}</ul>`
        : `<p class="compte">${tr('Aucun. Élargissez la distance avec le +.', 'None. Widen the distance with +.')}</p>`}${tri[k].length > 25 ? `<p class="compte">${tr('Les 25 plus proches.', 'The 25 closest.')}</p>` : ''}${s.pied ?? ''}</section>`).join('');
    el.querySelectorAll('.cadre-rayon button').forEach((b) => b.addEventListener('click', () => {
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
