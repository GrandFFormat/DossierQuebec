// « Donnez votre avis » (16 nov. 2026) : les consultations à venir en commission parlementaire,
// lues dans /data/site/consultations-assemblee.json (écrit par scrapers/build-frontend-data.js à partir
// de api/consultations-data.json, scrapers/consultations.js). Même idée que l'encadré « Have your say »
// de DossierOntario.
//
// Chargé par commun/debats.js, donc partout où « Aujourd'hui à l'Assemblée » s'affiche :
//   - l'accueil : toutes les consultations à venir, au-dessus du duo « Projets récents / Aujourd'hui » ;
//   - la fiche d'un projet de loi (#debats porte data-pl) : celles de ce projet seulement.
// Rien à venir (par exemple pendant la dissolution) : rien d'affiché.

const MOIS = { fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], en: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'] };
const JOURS = { fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], en: ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'] };
const T = {
  fr: {
    titre: 'Donnez votre avis', titrePl: 'Consultations sur ce projet de loi',
    sous: 'Consultations à venir en commission parlementaire. Une consultation générale est ouverte à tous : on peut y déposer un mémoire.',
    generale: 'Consultation générale (ouverte à tous)', particulieres: 'Consultations particulières (sur invitation)',
    seance: 'Séance', seances: 'Prochaine séance', limite: 'Mémoires jusqu’au', pasDeLimite: 'Date limite : voir l’avis de l’Assemblée',
    fiche: 'Fiche du projet', avis: 'Le mandat sur le site de l’Assemblée ↗', source: 'Source : Assemblée nationale du Québec.',
  },
  en: {
    titre: 'Have your say', titrePl: 'Consultations on this bill',
    sous: 'Upcoming consultations in parliamentary committee. A general consultation is open to everyone: anyone can submit a brief.',
    generale: 'General consultation (open to all)', particulieres: 'Special consultations (by invitation)',
    seance: 'Sitting', seances: 'Next sitting', limite: 'Briefs until', pasDeLimite: 'Deadline: see the Assembly’s notice',
    fiche: 'Bill page', avis: 'The mandate on the Assembly’s site (French) ↗', source: 'Source: Assemblée nationale du Québec (titles in French).',
  },
};
const echapper = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (iso, lg) => {
  const [a, m, j] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return lg === 'en' ? `${JOURS.en[js]} ${MOIS.en[m - 1]} ${j}` : `${JOURS.fr[js]} ${j === 1 ? '1er' : j} ${MOIS.fr[m - 1]}`;
};
function langueCourante() {
  const d = new URLSearchParams(location.search).get('lang');
  if (d === 'en' || d === 'fr') return d;
  try { return localStorage.getItem('dvq:langue') === 'en' ? 'en' : 'fr'; } catch (e) { return 'fr'; }
}

function style() {
  if (document.getElementById('ca-style')) return;
  const s = document.createElement('style');
  s.id = 'ca-style';
  s.textContent = `
.ca{margin:30px 0 8px}.ca-boite{background:var(--card,#fff);color:var(--ink,#131313);border:3px solid var(--ink,#131313);box-shadow:5px 5px 0 var(--ink,#131313);padding:16px 18px}
.ca h2{margin:0 0 4px;font-family:'Archivo',sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-.01em;font-size:clamp(18px,2.2vw,24px)}
.ca-sous{margin:0 0 12px;font-size:14px;color:var(--slate,#5B6470)}
.ca-item{border-top:2px solid var(--ink,#131313);padding:12px 0 4px}.ca-item:first-of-type{border-top:0;padding-top:0}
.ca-item h3{margin:0 0 4px;font-size:17px;line-height:1.25}.ca-item h3 a{color:inherit}
.ca-type{display:inline-block;font-family:'Archivo',sans-serif;font-weight:800;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border:2px solid var(--ink,#131313);background:var(--yellow,#FFD24D);color:#131313;margin-right:6px}
.ca-comm{font-size:13px;color:var(--slate,#5B6470)}
.ca-item ul{margin:6px 0 8px;padding-left:18px;font-size:15px;line-height:1.5}
.ca-liens{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;font-weight:700}.ca-liens a{color:var(--ink,#131313)}
.ca-note{margin:10px 0 0;font-size:12px;color:var(--slate,#5B6470)}`;
  document.head.appendChild(s);
}

let donnees = null;
function rendre() {
  const debats = document.getElementById('debats');
  if (!debats || !donnees) return;
  const lg = langueCourante(), t = T[lg];
  const pl = debats.dataset.pl ? Number(debats.dataset.pl) : null;
  const auj = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const liste = (donnees.items ?? []).filter((c) => (!pl || (c.num === pl && (!debats.dataset.leg || String(c.legislature) === debats.dataset.leg)))
    && ((c.dateLimite && c.dateLimite >= auj) || (c.seances ?? []).some((d) => d >= auj)));
  let zone = document.getElementById('consultations-assemblee');
  if (!liste.length) { zone?.remove(); return; }
  if (!zone) {
    zone = document.createElement('section');
    zone.id = 'consultations-assemblee';
    zone.className = 'ca';
    // Accueil : au-dessus du duo, pleine largeur. Fiche : juste avant « Ses séances en commission ».
    (debats.closest('.apercu-duo') ?? debats).insertAdjacentElement('beforebegin', zone);
  }
  style();
  const items = liste.map((c) => {
    const prochaines = (c.seances ?? []).filter((d) => d >= auj);
    const lignes = [];
    if (prochaines.length) lignes.push(`<li><b>${prochaines.length > 1 ? t.seances : t.seance}</b>${lg === 'fr' ? ' : ' : ': '}${echapper(date(prochaines[0], lg))}${prochaines.length > 1 ? ` (+${prochaines.length - 1})` : ''}</li>`);
    if (c.type === 'generale') lignes.push(`<li>${c.dateLimite && c.dateLimite >= auj ? `<b>${t.limite}</b> ${echapper(date(c.dateLimite, lg))}` : t.pasDeLimite}</li>`);
    const titre = echapper(c.titrePl ? `PL ${c.num} — ${c.titrePl}` : c.titre);
    return `<div class="ca-item"><h3>${titre}</h3><div><span class="ca-type">${c.type === 'generale' ? t.generale : t.particulieres}</span><span class="ca-comm">${echapper(c.commission)}</span></div>
      <ul>${lignes.join('')}</ul><div class="ca-liens"><a href="${echapper(c.url)}" target="_blank" rel="noopener">${t.avis}</a></div></div>`;
  }).join('');
  zone.innerHTML = `<div class="ca-boite"><h2>${pl ? t.titrePl : t.titre}</h2>${pl ? '' : `<p class="ca-sous">${t.sous}</p>`}${items}<p class="ca-note">${t.source}</p></div>`;
}

async function lancer() {
  if (!document.getElementById('debats')) return;
  try {
    const r = await fetch('/data/site/consultations-assemblee.json', { cache: 'no-cache' });
    donnees = r.ok ? await r.json() : null;
  } catch (e) { return; }
  rendre();
}
lancer();
document.addEventListener('click', (e) => { if (e.target.closest?.('#langToggle')) setTimeout(rendre, 0); });
