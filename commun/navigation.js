// La navigation entre les volets municipaux et les pages communes (Mes dossiers, Abonnement).
//
// Séparé de abonnes-client.js exprès : ce module n'importe rien d'extérieur. Les pages
// communes le chargent dans leur propre <script type="module">, qui s'exécute sans attendre le
// téléchargement de Supabase — la marque du volet et le bouton de retour sont en place dès
// l'affichage, sans clignoter.

// Les villes couvertes : clé du sous-dossier → nom. La marque d'un volet en découle
// (« DossierVilleDeQuébec »).
export const VILLES = { quebec: 'Québec', montreal: 'Montréal' };

export const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Un volet mémorise la page où l'on était ; Mes dossiers et Abonnement se présentent alors
// comme une partie de ce volet et proposent d'y revenir. Seulement un chemin du site, jamais une
// adresse extérieure.
const CLE_VOLET = 'dq:dernier-volet';
export function memoriserVolet(ville) {
  try {
    localStorage.setItem(CLE_VOLET, JSON.stringify({ ville, chemin: location.pathname + location.search }));
  } catch {}
}
export function dernierVolet() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VOLET) ?? 'null');
    if (v && VILLES[v.ville] && typeof v.chemin === 'string' && v.chemin.startsWith(`/${v.ville}/`) && /^[\w\-./?=&%+]*$/.test(v.chemin)) return v;
  } catch {}
  return null;
}

// L'en-tête des pages communes. Venue d'un volet (mémorisé, ou ?ville=) : la marque du volet
// (« DossierVilleDeQuébec », qui ramène à l'accueil du volet) et « ← Retour au volet » vers la
// page quittée. Sinon : DossierQuébec. Puis les villes, la taille du texte et le thème — les
// mêmes réglages (clés dvq:zoom et dvq:theme) que dans les volets.
export function enteteCommune() {
  const ville = new URLSearchParams(location.search).get('ville');
  const volet = dernierVolet();
  // Une ville demandée dans l'adresse l'emporte sur la dernière visitée.
  const cible = VILLES[ville] ? (volet?.ville === ville ? volet : { ville, chemin: `/${ville}/` }) : volet;

  const marque = document.querySelector('.ab-marque');
  if (marque && cible) {
    marque.href = `/${cible.ville}/`;
    marque.innerHTML = `Dossier<span>VilleDe${echapper(VILLES[cible.ville])}</span>`;
    document.title = document.title.replace(/— DossierQuébec$/, `— DossierVilleDe${VILLES[cible.ville]}`);
  }
  const retour = document.querySelector('#retour-volet');
  if (retour && cible) {
    retour.href = cible.chemin;
    retour.textContent = `← Retour au volet ${VILLES[cible.ville]}`;
    retour.hidden = false;
  }
  const villes = document.querySelector('#villes');
  if (villes) {
    villes.innerHTML = `Villes : ${Object.entries(VILLES).map(([v, nom]) => `<a href="/${v}/">${echapper(nom)}</a>`).join(' · ')} · <a href="/">DossierQuébec</a>`;
  }

  const outils = document.querySelector('#outils');
  if (!outils) return;
  outils.innerHTML = `<div class="ab-taille" role="group" aria-label="Taille du texte">
      <button type="button" data-zoom="-10" aria-label="Réduire le texte">A−</button>
      <span aria-live="polite"></span>
      <button type="button" data-zoom="10" aria-label="Agrandir le texte">A+</button>
    </div>
    <button type="button" class="ab-theme" aria-pressed="false"></button>`;
  const pct = outils.querySelector('.ab-taille span');
  const lireZoom = () => {
    const z = parseInt(document.documentElement.style.zoom, 10);
    return z >= 80 && z <= 150 ? z : 100;
  };
  const zoom = (z) => {
    document.documentElement.style.zoom = z + '%';
    pct.textContent = z + '%';
    outils.querySelector('[data-zoom="-10"]').disabled = z <= 80;
    outils.querySelector('[data-zoom="10"]').disabled = z >= 150;
    try { localStorage.setItem('dvq:zoom', String(z)); } catch {}
  };
  zoom(lireZoom());
  for (const b of outils.querySelectorAll('[data-zoom]')) b.addEventListener('click', () => zoom(Math.min(150, Math.max(80, lireZoom() + Number(b.dataset.zoom)))));

  const bouton = outils.querySelector('.ab-theme');
  const themeActuel = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair');
  const theme = (t) => {
    document.documentElement.dataset.theme = t;
    const etiquette = t === 'sombre' ? 'Passer au thème clair' : 'Passer au thème sombre';
    bouton.title = etiquette;
    bouton.setAttribute('aria-label', etiquette);
    bouton.setAttribute('aria-pressed', String(t === 'sombre'));
  };
  theme(themeActuel());
  bouton.addEventListener('click', () => {
    const t = themeActuel() === 'sombre' ? 'clair' : 'sombre';
    theme(t);
    try { localStorage.setItem('dvq:theme', t); } catch {}
  });
}

// La flèche « retour en haut » des pages communes, comme dans les volets : elle n'apparaît
// qu'une fois qu'on a vraiment descendu.
export function boutonRetourEnHaut() {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'ab-retour-haut';
  bouton.setAttribute('aria-label', 'Revenir en haut de la page');
  bouton.textContent = '↑';
  document.body.appendChild(bouton);
  const majVisible = () => bouton.classList.toggle('visible', window.scrollY > 600);
  window.addEventListener('scroll', majVisible, { passive: true });
  majVisible();
  bouton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
