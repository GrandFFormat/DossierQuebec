// « En bref » : la dernière séance de chaque conseil, en tête de la page Décisions (Martin,
// 13 nov. 2026). Lit <ville>/data/resumes-seances.json, écrit par scripts/resumes-seances.js.
// Indépendant d'app.js : la page pré-rendue de Québec n'exécute pas app.js au premier écran.
// Un grand carré vert comme le résumé d'une décision ; dedans, une carte par conseil, la phrase
// puis trois décisions marquantes. Les arrondissements, repliés, en cartes plus petites.
import { EN } from '/commun/langue.js';

const tr = (fr, en) => (EN ? en : fr);
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dateLongue(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return EN ? `${MOIS_EN[m - 1]} ${j}, ${a}` : `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}
const couper = (t, n) => (t.length > n ? t.slice(0, n).replace(/[\s,;:–-]+\S*$/, '') + '…' : t);
// « CONTRAT - ISI CONSTRUCTION INC. » crie : on remet en minuscules ce qui est tout en capitales.
function adoucir(t) {
  t = String(t ?? '').replace(/\s+/g, ' ').trim();
  const lettres = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (lettres && lettres === lettres.toUpperCase()) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}
const estArrondissement = (i) => /arrondissement|borough/i.test(i);
// « Conseil d'arrondissement de Ville-Marie » → « Ville-Marie » dans la liste des arrondissements.
const nomCourt = (i) => i.replace(/^Conseil d(?:e l'|')arrondissement (?:de la |de l'|de |du |des )/i, '').replace(/ borough council$/i, '');
const suffixe = EN ? '&lang=en' : '';
// À quelle fréquence le conseil siège, collé au nom : « Conseil d'agglomération/mois » (Martin,
// 13 nov. 2026). Le conseil de la ville de Québec siège deux fois par mois.
// Les sujets, mêmes couleurs que les pastilles des décisions (--t-* du style.css de chaque ville).
const THEMES_FR = { urbanisme: 'Urbanisme', transport: 'Transport', immobilier: 'Immobilier', subventions: 'Subventions', contrats: 'Contrats', finances: 'Finances', rh: 'Ressources humaines', environnement: 'Environnement', culture: 'Culture et patrimoine', loisirs: 'Loisirs et communauté', securite: 'Sécurité publique', economie: 'Développement économique', travaux: 'Travaux et infrastructures', honneurs: 'Motions et hommages', social: 'Logement et social', procedure: 'Procédure', administration: 'Administration' };
const THEMES_EN = { urbanisme: 'Urban planning', transport: 'Transportation', immobilier: 'Real estate', subventions: 'Grants', contrats: 'Contracts', finances: 'Finance', rh: 'Human resources', environnement: 'Environment', culture: 'Culture and heritage', loisirs: 'Recreation and community', securite: 'Public safety', economie: 'Economic development', travaux: 'Public works', honneurs: 'Motions and tributes', social: 'Housing and social', procedure: 'Procedure', administration: 'Administration' };
const nomTheme = (t) => (EN ? THEMES_EN[t] : THEMES_FR[t]) ?? t;

// Le sujet de chaque élément de la phrase est souligné (« déneigement », « organisme jeunesse »…) :
// on sait de quoi parle la séance avant de lire (Martin, 13 nov. 2026). Les mots viennent du robot,
// qui ne garde que ceux écrits mot pour mot dans la phrase.
// La couleur du soulignement est celle du sujet (motsThemes, même rang que les mots ; l'anglais
// reprend les sujets du français).
function souligner(phrase, mots, themes = []) {
  let html = echapper(phrase);
  (mots ?? []).forEach((m, k) => {
    const e = echapper(m);
    const i = html.indexOf(e);
    const t = themes[k];
    if (i >= 0) html = html.slice(0, i) + `<span class="eb-mot${t ? ` t-bord-${t}` : ''}"${t ? ` title="${echapper(nomTheme(t))}"` : ''}>${e}</span>` + html.slice(i + e.length);
  });
  return html;
}

// Les votes nominaux de la séance, juste au-dessus du lien du procès-verbal, comme les cartes de
// votes de DQ : le décompte et une barre pour / contre (Martin, 13 nov. 2026). Deux au plus, le reste
// en compte ; la séance sans vote nominal le dit.
function blocVotes(s, page, petite) {
  const votes = s.votes ?? [];
  if (!votes.length) return `<p class="eb-votes-aucun">${tr('Aucun vote nominal à cette séance.', 'No recorded vote at this meeting.')}</p>`;
  const lignes = votes.slice(0, petite ? 1 : 2).map((v) => {
    const total = v.pour + v.contre || 1;
    return `<a class="eb-vote" href="${page}?q=${encodeURIComponent(v.numero)}${suffixe}">
      <span class="eb-vote-titre">${echapper(couper(adoucir(v.titre ?? v.numero), 70))}</span>
      <span class="eb-vote-compte"><b class="p">${v.pour}</b> ${tr('pour', 'for')} · <b class="c">${v.contre}</b> ${tr('contre', 'against')}</span>
      <span class="eb-vote-barre"><i class="p" style="width:${(v.pour / total * 100).toFixed(1)}%"></i><i class="c" style="width:${(v.contre / total * 100).toFixed(1)}%"></i></span>
    </a>`;
  }).join('');
  const reste = votes.length - (petite ? 1 : 2);
  return `<div class="eb-votes"><span class="eb-votes-titre">${tr(`${votes.length > 1 ? 'Votes nominaux' : 'Vote nominal'} (${votes.length})`, `Recorded vote${votes.length > 1 ? 's' : ''} (${votes.length})`)}</span>${lignes}${reste > 0 ? `<a class="eb-votes-plus" href="${page}?instance=${encodeURIComponent(s.instance)}&vote=1${suffixe}">${tr(`et ${reste} autre${reste > 1 ? 's' : ''}`, `and ${reste} more`)} →</a>` : ''}</div>`;
}

function rythme(i) {
  if (/comité exécutif/i.test(i)) return tr('semaine', 'week');
  if (/^Conseil de la ville$/.test(i)) return tr('2 semaines', '2 weeks');
  return tr('mois', 'month');
}

// Une carte = UNE séance, jamais deux mélangées (Martin, 13 nov. 2026 : « le monde est perdu »).
// Deux sortes : l'ORDRE DU JOUR d'une séance récente (ce qui était prévu, pas encore officiel) et
// le PROCÈS-VERBAL (ce qui a été décidé). La pastille du haut dit laquelle.
function carte(s, page, petite) {
  const odj = Boolean(s.odj);
  const instance = EN ? s.instanceEn ?? s.instance : s.instance;
  const phrase = EN ? s.phraseEn : s.phrase;
  const points = s.points.filter((p) => p.titre).slice(0, petite ? 2 : 3).map((p) => {
    const titre = couper(adoucir(EN ? p.titreEn ?? p.titre : p.titre), petite ? 70 : 85);
    const montant = EN ? p.montantEn ?? p.montant : p.montant;
    const lien = odj ? `${echapper(p.lien)}" target="_blank" rel="noopener` : `${page}?q=${encodeURIComponent(p.numero)}${suffixe}`;
    return `<li${p.theme ? ` class="eb-pt t-bord-${p.theme}" title="${echapper(nomTheme(p.theme))}"` : ''}><a href="${lien}"><span class="eb-titre">${echapper(titre)}</span>`
      + (montant ? `<span class="eb-montant">${echapper(montant)}</span>` : '')
      + (p.divise ? `<span class="eb-divise">${tr('vote divisé', 'split vote')}</span>` : '')
      + '</a></li>';
  }).join('');
  const quoi = odj
    ? `<span class="eb-sorte eb-sorte-odj">${tr('Ordre du jour · prévu, pas encore officiel', 'Agenda · planned, not yet official')}</span>`
    : `<span class="eb-sorte eb-sorte-pv">${tr('Procès-verbal · décidé', 'Minutes · decided')}</span>`;
  const compte = odj
    ? `${s.nPoints} ${tr("points à l'ordre du jour", 'agenda items')}`
    : `${s.nDecisions} ${tr(s.nDecisions > 1 ? 'décisions' : 'décision', s.nDecisions > 1 ? 'decisions' : 'decision')}`;
  const liens = odj
    ? `<a class="eb-officiel" href="${echapper(s.odj)}" target="_blank" rel="noopener">${tr('Ordre du jour (PDF)', 'Agenda (PDF, French)')} ↗</a>`
    : `<a class="eb-tout" href="${page}?instance=${encodeURIComponent(s.instance)}${suffixe}">${tr('Toutes ses décisions', 'All its decisions')} →</a>`
      + (s.pv ? `<a class="eb-officiel eb-pv" href="${echapper(s.pv)}" target="_blank" rel="noopener">${tr('P.-verbal (PDF)', 'Minutes (PDF, French)')} ↗</a>` : '');
  return `<article class="eb-carte${petite ? ' eb-petite' : ''}${odj ? ' eb-carte-odj' : ''}">
    ${quoi}
    <header><h3>${echapper(petite ? nomCourt(instance) : instance)}<span class="eb-rythme">/${rythme(s.instance)}</span></h3>
    <span class="eb-date">${tr('Séance du', 'Meeting of')} ${dateLongue(s.date)} · ${compte}</span></header>
    ${phrase ? `<div class="eb-phrase">${souligner(phrase, EN ? s.motsClesEn : s.motsCles, s.motsThemes)}</div>` : ''}
    ${points ? `<ul class="eb-points">${points}</ul>` : ''}
    ${odj ? '' : blocVotes(s, page, petite)}
    <div class="eb-liens">${liens}</div>
  </article>`;
}

const grille = (liste, page, petite) => `<div class="eb-grille${petite ? ' eb-grille-petite' : ''}">${liste.map((s) => carte(s, page, petite)).join('')}</div>`;
const parNom = (a, b) => nomCourt(a.instance).localeCompare(nomCourt(b.instance), 'fr');

const NOTE_FR = "<strong>Notre lecture, pas la version officielle</strong> et <strong>peut changer d'ici le dépôt de la version officielle.</strong> La phrase de chaque carte est écrite par IA. Pour les séances récentes, elle résume l'ordre du jour, c'est-à-dire ce qui était prévu : un point peut être modifié, reporté ou retiré avant le procès-verbal de la Ville.";
const NOTE_EN = "<strong>Our reading, not the official version</strong> and <strong>may change until the official version is filed.</strong> Each card's sentence is AI-written. For recent meetings, it summarizes the agenda, that is what was planned: an item may be amended, postponed or withdrawn before the City's minutes.";
// Sans ordre du jour en avant (Québec, Lévis) : tout vient du procès-verbal, publié tout de suite.
// C'est la version officielle, résumée (Martin, 13 nov. 2026) : pas de « pas la version officielle ».
const NOTE_PV_FR = "<strong>D'après le procès-verbal de la Ville.</strong> La phrase de chaque carte en est un résumé écrit par IA. Le procès-verbal fait foi : le lien est au bas de chaque carte.";
const NOTE_PV_EN = "<strong>From the City's minutes.</strong> Each card's sentence is an AI-written summary of them. The minutes prevail: the link is at the bottom of each card.";
const RETARD_FR = "Un procès-verbal est d'abord adopté à la séance suivante, puis mis en ligne. On a donc toujours un mois de retard, souvent plus pour le comité exécutif. Voici la dernière séance de chaque conseil dont le procès-verbal est publié : ce qui a été décidé, d'après notre extraction.";
const RETARD_EN = "Minutes are first adopted at the next meeting, then put online. So we are always a month behind, often more for the executive committee. Here is the latest meeting of each council whose minutes are published: what was decided, according to our extraction.";

async function init() {
  const zone = document.getElementById('en-bref');
  if (!zone) return;
  let jeu;
  try {
    const r = await fetch('data/resumes-seances.json', { cache: 'no-cache' });
    if (!r.ok) return;
    jeu = await r.json();
  } catch { return; }
  // Le procès-verbal le plus récent de chaque conseil.
  const vues = new Set();
  const pvs = (jeu.seances ?? []).filter((s) => s.points?.length && !vues.has(s.instance) && vues.add(s.instance));
  const odjs = new Map((jeu.ordresDuJour ?? []).filter((o) => o.phrase && o.points?.length).map((o) => [o.instance, o]));
  if (!pvs.length && !odjs.size) return;
  // En avant : l'ordre du jour récent s'il y en a un, sinon le procès-verbal. Derrière « Pourquoi un
  // mois de retard ? » : les procès-verbaux que l'ordre du jour a poussés hors de l'avant-plan.
  const instances = [...new Set([...pvs.map((s) => s.instance), ...odjs.keys()])];
  const devant = instances.map((i) => odjs.get(i) ?? pvs.find((s) => s.instance === i)).filter(Boolean);
  const derriere = pvs.filter((s) => odjs.has(s.instance));
  // Montréal : dans l'ordre du chemin d'un dossier, exécutif → municipal → agglomération (Martin, 16 nov. 2026).
  const RANG = (i) => (/exécutif/i.test(i) ? 0 : /municipal|conseil de la ville/i.test(i) ? 1 : /agglom/i.test(i) ? 2 : 3);
  const principales = devant.filter((s) => !estArrondissement(s.instance)).sort((x, y) => RANG(x.instance) - RANG(y.instance));
  // Le chemin d'un dossier, d'après les conseils présents (Montréal, Québec, Lévis), flèches en jaune.
  const etapes = principales.map((x) => x.instance).filter((i) => RANG(i) < 3);
  const nomEtape = (i) => (/exécutif/i.test(i) ? tr('Comité exécutif', 'Executive committee')
    : /agglom/i.test(i) ? tr('Conseil d’agglomération', 'Agglomeration council')
    : /municipal/i.test(i) ? tr('Conseil municipal', 'City council') : tr('Conseil de la ville', 'City council'));
  const chemin = etapes.length > 1 && etapes.some((i) => RANG(i) === 0)
    ? `<p class="eb-chemin">${[...new Set(etapes.map(nomEtape))].join(' <b class="eb-fleche">→</b> ')}</p>` : '';
  const arrondissements = devant.filter((s) => estArrondissement(s.instance)).sort(parNom);
  const n = arrondissements.length;
  const derrierePrinc = derriere.filter((s) => !estArrondissement(s.instance));
  const derriereArr = derriere.filter((s) => estArrondissement(s.instance)).sort(parNom);

  zone.innerHTML = `<div class="resume eb-gros">
    <div class="resume-entete"><span>${tr('En bref — la dernière séance de chaque conseil · résumé généré par IA', 'In brief — the latest meeting of each council · AI-generated summary')}</span></div>
    <div class="eb-note">${odjs.size ? tr(NOTE_FR, NOTE_EN) : tr(NOTE_PV_FR, NOTE_PV_EN)}${odjs.size && derriere.length ? ` <a class="eb-vo" href="#eb-version-officielle">${tr('Version officielle', 'Official version')} ↓</a>` : ''}</div>
    ${chemin}${grille(principales, jeu.page, false)}
    ${n ? `<details class="eb-arr"><summary>${odjs.size ? `<span class="eb-marque eb-marque-non">${tr(`Les ${n} arrondissements · non officiel`, `The ${n} boroughs · not official`)}</span>` : tr(`Les ${n} arrondissements`, `The ${n} boroughs`)}</summary>${grille(arrondissements, jeu.page, true)}</details>` : ''}
  </div>
  ${derriere.length ? `<div class="resume eb-gros eb-boite-retard" id="eb-version-officielle"><details class="eb-arr eb-retard"><summary><span class="eb-marque eb-marque-non">${tr("Pourquoi un mois de retard ? C'est la façon de faire de Montréal", 'Why a month behind? That is how Montréal works')}</span></summary>
      <div class="eb-note">${tr(RETARD_FR, RETARD_EN)}</div>
      ${chemin}${grille(derrierePrinc.sort((x, y) => RANG(x.instance) - RANG(y.instance)), jeu.page, false)}
      ${derriereArr.length ? grille(derriereArr, jeu.page, true) : ''}
      <a class="eb-detail" href="#liste-decisions">${tr('Voir toutes les décisions, séance par séance ↓', 'See every decision, meeting by meeting ↓')}</a>
    </details></div>` : ''}`;
  // Le remerciement du commanditaire monte entre l'encadré non officiel et « Pourquoi un mois de
  // retard ? » (Martin, 13 nov. 2026). Sans cette boîte (Québec), il passe juste sous l'encadré.
  const merci = document.querySelector('aside.merci-commanditaire');
  if (merci) {
    const retard = zone.querySelector('.eb-boite-retard');
    if (retard) zone.insertBefore(merci, retard); else zone.appendChild(merci);
  }
  // Cellulaire (Martin, 16 nov. 2026) : « Version officielle » au bout de la note descend aux
  // procès-verbaux officiels, derrière « Pourquoi un mois de retard ? », et ouvre le pli.
  zone.querySelector('.eb-vo')?.addEventListener('click', () => { const d = zone.querySelector('.eb-retard'); if (d) d.open = true; });
  zone.hidden = false;
  // Arrivée sur une décision précise (?q=) : le cadre reste en haut, comme partout (Martin, 13 nov. 2026),
  // mais il vient de pousser la liste vers le bas. On redescend sur la fiche ouverte dès qu'elle est là.
  if (new URLSearchParams(location.search).has('q')) {
    let essais = 0;
    const viser = () => {
      const fiches = document.querySelectorAll('#liste-decisions details.carte');
      if (fiches.length === 1) {
        fiches[0].scrollIntoView({ block: 'center' });
        // Une deuxième fois, quand les images et le reste de la page ont fini de bouger.
        setTimeout(() => fiches[0].scrollIntoView({ block: 'center' }), 600);
      }
      else if (essais++ < 30) setTimeout(viser, 100);
    };
    requestAnimationFrame(viser);
  }
}
init();

// ---------- flèche jaune « retour au point de départ » (Martin, 16 nov. 2026) ----------
// Un lien de l'encadré qui mène ailleurs sur la même page (« Version officielle ↓ », « Toutes ses
// décisions → », un vote…) retient d'où on est parti. Une petite flèche jaune, au-dessus de la
// flèche ↑ habituelle, y ramène. Elle disparaît une fois utilisée.
(() => {
  const CLE = 'eb:retour', RESTAURER = 'eb:restaurer';
  const lire = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
  const ecrire = (k, v) => { try { v ? sessionStorage.setItem(k, JSON.stringify(v)) : sessionStorage.removeItem(k); } catch {} };
  // Comme « Latest at the Legislature » de DossierOntario : la carte d'où on était parti s'allume en jaune.
  const allumer = (i) => {
    const c = [...document.querySelectorAll('#en-bref .eb-carte')][i];
    if (!c) return;
    c.classList.remove('eb-revenue'); void c.offsetWidth; c.classList.add('eb-revenue');
  };

  // Retour d'une page filtrée : on remet la position une fois l'encadré dessiné.
  const r = lire(RESTAURER);
  if (r && r.href === location.href) {
    ecrire(RESTAURER, null);
    let n = 0;
    // Les menus déroulants qui étaient ouverts le redeviennent, sinon la position ne veut plus rien dire.
    const viser = () => {
      const pl = [...document.querySelectorAll('#en-bref details')];
      (r.ouverts ?? []).forEach((i) => { if (pl[i]) pl[i].open = true; });
      // La page reste cachée le temps de se placer : pas de passage par le haut de la page.
      window.scrollTo(0, r.y);
      if (++n < 3 || (Math.abs(window.scrollY - r.y) > 4 && n < 20)) { setTimeout(viser, 100); return; }
      document.documentElement.style.visibility = '';
      allumer(r.carte);
    };
    document.documentElement.style.visibility = 'hidden';
    setTimeout(viser, 100);
  }

  const st = document.createElement('style');
  st.textContent = `.eb-retour{position:fixed;right:22px;bottom:70px;z-index:21;width:34px;height:34px;border-radius:50%;border:2px solid #16191D;background:#FFD24D;color:#16191D;font-size:17px;font-weight:900;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);display:none}.eb-retour.visible{display:block}.eb-revenue{animation:ebRevenue 1.6s ease-out}@keyframes ebRevenue{0%,35%{background:rgba(255,210,77,.35)}100%{background:transparent}}@media (prefers-reduced-motion:reduce){.eb-revenue{animation:none}}@keyframes eb-envol{0%{transform:none;opacity:1}15%{transform:translateY(calc(var(--sens,1) * -8px)) scale(1.1)}100%{transform:translateY(var(--envol,-300px)) scale(.6);opacity:0}}.eb-retour.envol{display:block;animation:eb-envol .7s cubic-bezier(.5,0,.2,1) forwards;pointer-events:none}@media (prefers-reduced-motion:reduce){.eb-retour.envol{animation:none;display:none}}`;
  document.head.appendChild(st);
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'eb-retour';
  bouton.textContent = '↩';
  bouton.setAttribute('aria-label', tr('Revenir où j’étais', 'Back to where I was'));
  bouton.title = bouton.getAttribute('aria-label');
  document.body.appendChild(bouton);

  const montrer = () => bouton.classList.toggle('visible', Boolean(lire(CLE)));
  montrer();

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('#en-bref a[href]');
    if (!a || a.target === '_blank') return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (u.pathname !== location.pathname) return;
    const ouverts = [...document.querySelectorAll('#en-bref details')].map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0);
    const carte = [...document.querySelectorAll('#en-bref .eb-carte')].indexOf(a.closest('.eb-carte'));
    ecrire(CLE, { href: location.href, y: Math.round(window.scrollY), ouverts, carte });
    setTimeout(montrer, 0);
  }, true);

  bouton.addEventListener('click', () => {
    const d = lire(CLE);
    ecrire(CLE, null);
    if (!d) { montrer(); return; }
    // La flèche s'envole dans le sens du retour (vers le haut ou vers le bas), comme la flèche ↑.
    if (d.href.split('#')[0] !== location.href.split('#')[0]) { ecrire(RESTAURER, d); location.href = d.href; return; }
    const monte = d.y < window.scrollY;
    bouton.style.setProperty('--envol', `${monte ? -(window.innerHeight - 140) : 120}px`);
    bouton.style.setProperty('--sens', monte ? -1 : 1);
    bouton.classList.add('envol');
    bouton.addEventListener('animationend', () => { bouton.classList.remove('envol'); montrer(); }, { once: true });
    if (d.href.split('#')[0] === location.href.split('#')[0]) {
      const pl = [...document.querySelectorAll('#en-bref details')];
      (d.ouverts ?? []).forEach((i) => { if (pl[i]) pl[i].open = true; });
      window.scrollTo({ top: d.y, behavior: 'smooth' });
      setTimeout(() => allumer(d.carte), 450);
    }

  });
})();
