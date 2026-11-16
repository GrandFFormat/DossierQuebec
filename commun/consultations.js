// Consultations publiques des volets de ville (16 nov. 2026). Lit /<volet>/data/consultations.json,
// écrit chaque jour par <volet>/scrapers/consultations.js (Québec, Montréal, Lévis).
//
// Trois rôles, sur toutes les pages du volet :
//   1. la pastille sur l'onglet « Conseil municipal » du menu, quand une consultation s'est ajoutée
//      depuis la dernière visite de cette page (mémoire du navigateur, aucun compte) ;
//   2. <div id="consultations-ville"></div> (page du conseil) : la liste complète, regroupée par projet ;
//   3. <div id="consultations-ville" data-mode="apercu"></div> (accueil) : les trois prochaines + lien.
// Rien ne s'affiche quand il n'y a aucune consultation à venir.

import { EN, tr } from '/commun/langue.js';

const VOLET = location.pathname.split('/')[1] || '';
const CLE_VU = `dq:consultations-vues:${VOLET}`;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAYS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'];

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (iso, avecJour = true) => {
  const [a, m, j] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return EN ? `${avecJour ? DAYS[js] + ' ' : ''}${MONTHS[m - 1]} ${j}` : `${avecJour ? JOURS[js] + ' ' : ''}${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
};
const quand = (i) => i.fin ? tr(`du ${date(i.debut, false)} au ${date(i.fin, false)}`, `${date(i.debut, false)} to ${date(i.fin, false)}`) : `${date(i.debut)}${i.heure ? `, ${i.heure}` : ''}`;
const pageConseil = () => document.querySelector('header nav a[href^="conseil-municipal-de-"]');

function lireVus() { try { return new Set(JSON.parse(localStorage.getItem(CLE_VU) || '[]')); } catch (e) { return new Set(); } }
function noterVus(ids) { try { localStorage.setItem(CLE_VU, JSON.stringify(ids)); } catch (e) {} }

function style() {
  if (document.getElementById('consultations-style')) return;
  const s = document.createElement('style');
  s.id = 'consultations-style';
  s.textContent = `
.cv-boite{border:1px solid var(--ligne);border-left:5px solid var(--accent);border-radius:var(--rayon,6px);background:var(--carte);padding:14px 18px;margin:0 0 20px}
.cv-boite h2{margin:0 0 4px;font-size:1.15rem}
.cv-boite .cv-sous{margin:0 0 10px;font-size:.9rem;color:var(--doux,inherit);opacity:.85}
.cv-liste{list-style:none;margin:0;padding:0}
.cv-liste>li{padding:9px 0;border-top:1px solid var(--ligne)}
.cv-liste>li:first-child{border-top:0}
.cv-titre{font-weight:700}
.cv-titre a{color:inherit}
.cv-etapes{margin:3px 0 0;padding-left:18px;font-size:.93rem}
.cv-etapes li{margin:1px 0}
.cv-secteur{display:inline-block;font-size:.78rem;font-weight:700;padding:0 6px;margin-left:6px;border:1px solid var(--ligne-forte,var(--ligne));border-radius:3px;vertical-align:1px}
.cv-annule{text-decoration:line-through;opacity:.7}
.cv-pied{margin:8px 0 0;font-size:.82rem;opacity:.8}
.cv-nouveau{position:relative}
.cv-nouveau::after{content:'';position:absolute;top:2px;right:-9px;width:8px;height:8px;border-radius:50%;background:#FFD24D;box-shadow:0 0 0 2px var(--carte)}
`;
  document.head.appendChild(s);
}

// Les activités d'un même projet (assemblée puis consultation écrite) vont ensemble.
function regrouper(items) {
  const parUrl = new Map();
  for (const i of items) (parUrl.get(i.url) ?? parUrl.set(i.url, []).get(i.url)).push(i);
  return [...parUrl.values()];
}

function rendre(zone, donnees, items) {
  const apercu = zone.dataset.mode === 'apercu';
  const groupes = regrouper(items);
  // L'aperçu de l'accueil saute les projets dont toutes les activités sont annulées.
  const montres = apercu ? groupes.filter((g) => g.some((i) => !i.annule)).slice(0, 3) : groupes;
  const lien = pageConseil()?.getAttribute('href');
  const lignes = montres.map((g) => {
    const p = g[0];
    const secteur = g.find((i) => i.secteur)?.secteur;
    const etapes = g.map((i) => `<li class="${i.annule ? 'cv-annule' : ''}">${echapper(i.type)} : ${echapper(quand(i))}${i.lieu ? ` · ${echapper(i.lieu)}` : ''}${i.annule ? ` (${tr('annulé', 'cancelled')})` : ''}</li>`).join('');
    return `<li><div class="cv-titre"><a href="${echapper(p.url)}" target="_blank" rel="noopener">${echapper(p.titre)} ↗</a>${secteur ? `<span class="cv-secteur">${echapper(secteur)}</span>` : ''}</div><ul class="cv-etapes">${etapes}</ul></li>`;
  }).join('');
  const reste = groupes.length - montres.length;
  zone.innerHTML = `<section class="cv-boite" aria-labelledby="cv-titre">
    <h2 id="cv-titre">${tr('Vous pouvez encore donner votre avis', 'You can still have your say')}</h2>
    <p class="cv-sous">${tr('Consultations publiques et assemblées à venir. Chaque ligne disparaît quand sa date est passée.', 'Upcoming public consultations and meetings (in French). Each line disappears once its date has passed.')}</p>
    <ul class="cv-liste">${lignes}</ul>
    ${apercu && lien ? `<p class="cv-pied"><a href="${echapper(lien)}#consultations-ville">${reste > 0 ? tr(`Voir les ${groupes.length} consultations →`, `See all ${groupes.length} consultations →`) : tr('Toutes les consultations →', 'All consultations →')}</a></p>` : ''}
    <p class="cv-pied">${tr('Source', 'Source')} : <a href="${echapper(donnees.source?.url)}" target="_blank" rel="noopener">${echapper(donnees.source?.nom)} ↗</a></p>
  </section>`;
  zone.hidden = false;
}

async function lancer() {
  if (!['quebec', 'montreal', 'levis'].includes(VOLET)) return;
  let donnees;
  try { donnees = await (await fetch(`/${VOLET}/data/consultations.json`, { cache: 'no-cache' })).json(); } catch (e) { return; }
  const auj = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const items = (donnees.items ?? []).filter((i) => (i.fin || i.debut) >= auj);
  if (!items.length) return;
  style();
  const zone = document.getElementById('consultations-ville');
  if (zone) rendre(zone, donnees, items);
  const ids = items.map((i) => i.id);
  const surConseil = document.body.dataset.page && location.pathname.includes('conseil-municipal-de-');
  if (surConseil && zone) { noterVus(ids); return; }
  const vus = lireVus();
  const nouveaux = ids.filter((id) => !vus.has(id)).length;
  const a = pageConseil();
  if (nouveaux && a) {
    a.classList.add('cv-nouveau');
    a.title = tr(`${nouveaux} nouvelle(s) consultation(s) publique(s)`, `${nouveaux} new public consultation(s)`);
  }
}
lancer();
