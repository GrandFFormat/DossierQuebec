// La navigation entre les volets municipaux et les pages communes (Mes dossiers, Abonnement).
//
// Séparé de abonnes-client.js exprès : ce module n'importe rien d'extérieur. Les pages
// communes le chargent dans leur propre <script type="module">, qui s'exécute sans attendre le
// téléchargement de Supabase — la marque du volet et le bouton de retour sont en place dès
// l'affichage, sans clignoter.

import { EN, tr, traduirePage, pastilleLangue, compterPageEn, languePrete, PAGE_BILINGUE } from './langue.js';
export { EN, tr } from './langue.js';

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

// Le choix de la ville, en haut à droite de chaque page (volets et pages communes) : un menu
// déroulant (<details>, donc clavier et lecteurs d'écran sans rien de plus) qui se referme au clic
// ailleurs ou sur Échap. Une ville ajoutée à VILLES y apparaît toute seule.
export function menuVilles(details, villeActuelle) {
  if (!details) return;
  details.innerHTML = `<summary>${villeActuelle ? `<span class="ab-villes-libelle">${tr('Ville : ', 'City: ')}</span>${echapper(VILLES[villeActuelle])}` : tr('Choisir une ville', 'Choose a city')}</summary>
    <ul class="ab-villes-menu">
      ${Object.entries(VILLES).map(([v, nom]) => `<li><a href="/${v}/"${v === villeActuelle ? ' aria-current="true"' : ''}>${echapper(nom)}</a></li>`).join('')}
      <li class="ab-villes-dq"><a href="/">DossierQuébec <span>(${tr('provincial', 'Québec province')})</span></a></li>
    </ul>`;
  document.addEventListener('click', (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  details.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && details.open) {
      details.open = false;
      details.querySelector('summary').focus();
    }
  });
}

// L'en-tête d'un volet : le menu des villes, sa ville cochée. Chargé par chaque page de volet
// (<script type="module" src="/commun/entete-volet.js">), à part de Supabase pour ne pas attendre.
export function enteteVolet() {
  const ville = Object.hasOwn(VILLES, document.body.dataset.ville ?? '') ? document.body.dataset.ville : null;
  traduirePage();
  menuVilles(document.querySelector('#villes'), ville);
  if (PAGE_BILINGUE) document.querySelector('#villes')?.after(pastilleLangue());
  // Sur cellulaire, le menu en haut à droite passerait seul sur une ligne : un second exemplaire
  // prend place dans la ligne des outils (à la place d'« Abonnement », masqué là). Le CSS n'en
  // montre qu'un des deux selon la largeur.
  const outils = document.querySelector('header nav .outils');
  if (outils && !outils.querySelector('.ab-villes')) {
    const mobile = document.createElement('details');
    mobile.className = 'ab-villes ab-villes-mobile';
    outils.prepend(mobile);
    menuVilles(mobile, ville);
    // Sur cellulaire, la ligne des outils est déjà pleine : la pastille de langue va au bout des liens.
    const externe = document.querySelector('header nav a.externe');
    if (PAGE_BILINGUE) (externe ? externe.after(pastilleLangue('ab-langue-mobile')) : mobile.after(pastilleLangue('ab-langue-mobile')));
  }
  compterPageEn();
  languePrete();
}

// L'en-tête des pages communes. Venue d'un volet (mémorisé, ou ?ville=) : la marque du volet
// (« DossierVilleDeQuébec », dont le logo ramène à l'accueil du volet). Sinon : DossierQuébec.
// Puis les villes, la taille du texte et le thème — les mêmes réglages (clés dvq:zoom et
// dvq:theme) que dans les volets.
export function enteteCommune() {
  traduirePage();
  const ville = new URLSearchParams(location.search).get('ville');
  // Une ville demandée dans l'adresse l'emporte sur la dernière visitée.
  const cible = Object.hasOwn(VILLES, ville ?? '') ? ville : dernierVolet();

  const marque = document.querySelector('.ab-marque');
  if (marque && cible) {
    marque.href = `/${cible}/`;
    marque.innerHTML = `Dossier<span>VilleDe${echapper(VILLES[cible])}</span>`;
    document.title = document.title.replace(/— DossierQuébec$/, `— DossierVilleDe${VILLES[cible]}`);
  }
  menuVilles(document.querySelector('#villes'), cible);
  // La pastille de langue : à côté du menu des villes, ou au bout de la ligne du logo (Mes dossiers
  // n'a pas de menu des villes).
  const villes = document.querySelector('#villes');
  if (villes) villes.after(pastilleLangue());
  else document.querySelector('.ab-haut-ligne')?.append(pastilleLangue('ab-langue-seule'));
  compterPageEn();
  languePrete();

  const outils = document.querySelector('#outils');
  if (!outils) return;
  outils.innerHTML = `<div class="ab-taille" role="group" aria-label="${tr('Taille du texte', 'Text size')}">
      <button type="button" data-zoom="-10" aria-label="${tr('Réduire le texte', 'Smaller text')}">A−</button>
      <span aria-live="polite"></span>
      <button type="button" data-zoom="10" aria-label="${tr('Agrandir le texte', 'Larger text')}">A+</button>
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
    const etiquette = t === 'sombre' ? tr('Passer au thème clair', 'Switch to light theme') : tr('Passer au thème sombre', 'Switch to dark theme');
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
  bouton.setAttribute('aria-label', tr('Revenir en haut de la page', 'Back to top'));
  bouton.textContent = '↑';
  document.body.appendChild(bouton);
  const majVisible = () => bouton.classList.toggle('visible', window.scrollY > 600);
  window.addEventListener('scroll', majVisible, { passive: true });
  majVisible();
  bouton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
