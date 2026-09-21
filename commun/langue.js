// Version anglaise des volets municipaux et des pages communes (Mes dossiers, Abonnement).
//
// Le français reste la langue par défaut et celle des documents officiels. L'anglais se choisit
// avec la pastille « EN » à côté du menu des villes ; le choix est gardé (localStorage dvq:langue)
// d'une page à l'autre, et « ?lang=en » dans une adresse l'impose (liens partagés).
//
// Trois façons de traduire, du plus simple au plus complet :
//   - le HTML des pages : data-en="…" remplace le contenu d'un élément (et data-en-placeholder,
//     data-en-title, data-en-aria-label, data-en-content pour les attributs) ;
//   - le JavaScript : tr('Décisions', 'Decisions') rend l'une ou l'autre selon la langue ;
//   - les résumés IA : data/resumes-en.json (quebec/scrapers/traductions.js), superposés aux
//     français par chaque page qui les affiche.
//
// MESURE (Vercel Web Analytics, événements personnalisés) — pour savoir si l'anglais vaut la peine
// d'être refait ailleurs :
//   langue_choisie { vers: 'en' | 'fr', page }   un clic sur la pastille ;
//   page_en        { page }                      chaque page vue en anglais.
// Dans Vercel : Analytics → Events. (Les événements personnalisés demandent un forfait Pro ; sans lui,
// ils ne s'affichent pas, mais rien ne casse.)
//
// Ce module n'importe rien d'extérieur : il s'exécute sans attendre Supabase.

const CLE = 'dvq:langue';

function lireLangue() {
  try {
    const demandee = new URLSearchParams(location.search).get('lang');
    if (demandee === 'en' || demandee === 'fr') {
      localStorage.setItem(CLE, demandee);
      return demandee;
    }
    return localStorage.getItem(CLE) === 'en' ? 'en' : 'fr';
  } catch {
    return new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fr';
  }
}

export const LANGUE = lireLangue();
// Les volets dont le contenu est traduit. Ailleurs (Montréal pour l'instant), la page reste en
// français même si l'anglais a été choisi, et n'offre pas la pastille : un en-tête anglais sur un
// contenu français serait pire que rien. Les pages communes (sans data-ville) sont bilingues.
// Les volets dont les pages se lisent aussi en anglais. Québec en est sorti le 21 septembre 2026 :
// sa pastille EN disparaît et ses pages restent en français, même pour un visiteur qui avait
// choisi l'anglais ailleurs. Mes dossiers et Abonnement (sans ville) restent bilingues.
const VOLETS_EN = new Set(['montreal']);
const villePage = typeof document !== 'undefined' ? document.body?.dataset.ville : null;
export const PAGE_BILINGUE = !villePage || VOLETS_EN.has(villePage);
export const EN = LANGUE === 'en' && PAGE_BILINGUE;
export const tr = (fr, en) => (EN ? en : fr);

const mesurer = (nom, donnees) => {
  try {
    window.va?.('event', { name: nom, ...donnees });
  } catch {}
};
const page = () => location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';

// Le HTML de la page, une fois. Idempotent : un élément déjà traduit est marqué.
export function traduirePage(racine = document) {
  if (!EN) return;
  document.documentElement.lang = 'en';
  for (const el of racine.querySelectorAll('[data-en]:not([data-en-fait])')) {
    el.innerHTML = el.dataset.en;
    el.setAttribute('data-en-fait', '');
  }
  const ATTRIBUTS = { 'data-en-placeholder': 'placeholder', 'data-en-title': 'title', 'data-en-aria-label': 'aria-label', 'data-en-content': 'content' };
  for (const [source, cible] of Object.entries(ATTRIBUTS)) {
    for (const el of racine.querySelectorAll(`[${source}]`)) el.setAttribute(cible, el.getAttribute(source));
  }
}

// La pastille EN / FR. Un clic garde le choix et recharge la page dans l'autre langue : toutes les
// parties dynamiques se redessinent d'elles-mêmes.
export function pastilleLangue(classe = '') {
  const a = document.createElement('a');
  const vers = EN ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  a.href = url.pathname + url.search + url.hash;
  a.className = `ab-langue ${classe}`.trim();
  a.textContent = vers.toUpperCase();
  a.lang = vers;
  a.hreflang = vers;
  a.title = EN ? 'Afficher en français' : 'View in English';
  a.setAttribute('aria-label', a.title);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      localStorage.setItem(CLE, vers);
    } catch {}
    mesurer('langue_choisie', { vers, page: page() });
    // Laisse partir l'événement avant de recharger.
    setTimeout(() => location.assign(a.href), 150);
  });
  return a;
}

// Une page vue en anglais : comptée une fois par chargement.
export function compterPageEn() {
  if (EN) mesurer('page_en', { page: page() });
}

// Rendre la page visible : l'en-tête (script en ligne) la cache un instant quand l'anglais est
// choisi, pour éviter d'afficher le français une fraction de seconde.
export function languePrete() {
  document.documentElement.classList.add('dvq-pret');
}
