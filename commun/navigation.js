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

// Un volet mémorise sa ville ; Mes dossiers et Abonnement se présentent alors comme une partie
// de ce volet (sa marque, et son logo qui y ramène).
const CLE_VOLET = 'dq:dernier-volet';
export function memoriserVolet(ville) {
  try {
    localStorage.setItem(CLE_VOLET, JSON.stringify({ ville }));
  } catch {}
}
export function dernierVolet() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VOLET) ?? 'null');
    if (v && Object.hasOwn(VILLES, v.ville)) return v.ville;
  } catch {}
  return null;
}

// L'en-tête des pages communes. Venue d'un volet (mémorisé, ou ?ville=) : la marque du volet
// (« DossierVilleDeQuébec », dont le logo ramène à l'accueil du volet). Sinon : DossierQuébec.
// Puis les villes, la taille du texte et le thème — les mêmes réglages (clés dvq:zoom et
// dvq:theme) que dans les volets.
export function enteteCommune() {
  const ville = new URLSearchParams(location.search).get('ville');
  // Une ville demandée dans l'adresse l'emporte sur la dernière visitée.
  const cible = Object.hasOwn(VILLES, ville ?? '') ? ville : dernierVolet();

  const marque = document.querySelector('.ab-marque');
  if (marque && cible) {
    marque.href = `/${cible}/`;
    marque.innerHTML = `Dossier<span>VilleDe${echapper(VILLES[cible])}</span>`;
    document.title = document.title.replace(/— DossierQuébec$/, `— DossierVilleDe${VILLES[cible]}`);
  }
  // Le choix de la ville : un menu déroulant (<details>), qui se referme au clic ailleurs ou sur Échap.
  const villes = document.querySelector('#villes');
  if (villes) {
    villes.innerHTML = `<summary>${cible ? `Ville : ${echapper(VILLES[cible])}` : 'Choisir une ville'}</summary>
      <ul class="ab-villes-menu">
        ${Object.entries(VILLES).map(([v, nom]) => `<li><a href="/${v}/"${v === cible ? ' aria-current="true"' : ''}>${echapper(nom)}</a></li>`).join('')}
        <li class="ab-villes-dq"><a href="/">DossierQuébec <span>(provincial)</span></a></li>
      </ul>`;
    document.addEventListener('click', (e) => {
      if (villes.open && !villes.contains(e.target)) villes.open = false;
    });
    villes.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && villes.open) {
        villes.open = false;
        villes.querySelector('summary').focus();
      }
    });
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
