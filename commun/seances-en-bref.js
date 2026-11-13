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
    ? `<a class="eb-officiel" href="${echapper(s.odj)}" target="_blank" rel="noopener">${tr('Ordre du jour de la Ville (PDF)', 'City agenda (PDF, in French)')} ↗</a>`
    : `<a class="eb-tout" href="${page}?instance=${encodeURIComponent(s.instance)}${suffixe}">${tr('Toutes ses décisions', 'All its decisions')} →</a>`
      + (s.pv ? `<a class="eb-officiel" href="${echapper(s.pv)}" target="_blank" rel="noopener">${tr('Version officielle : procès-verbal (PDF)', 'Official version: minutes (PDF, in French)')} ↗</a>` : '');
  return `<article class="eb-carte${petite ? ' eb-petite' : ''}${odj ? ' eb-carte-odj' : ''}">
    ${quoi}
    <header><h3>${echapper(petite ? nomCourt(instance) : instance)}<span class="eb-rythme">/${rythme(s.instance)}</span></h3>
    <span class="eb-date">${tr('Séance du', 'Meeting of')} ${dateLongue(s.date)} · ${compte}</span></header>
    ${phrase ? `<div class="eb-phrase">${souligner(phrase, EN ? s.motsClesEn : s.motsCles, s.motsThemes)}</div>` : ''}
    ${points ? `<ul class="eb-points">${points}</ul>` : ''}
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
  const principales = devant.filter((s) => !estArrondissement(s.instance));
  const arrondissements = devant.filter((s) => estArrondissement(s.instance)).sort(parNom);
  const n = arrondissements.length;
  const derrierePrinc = derriere.filter((s) => !estArrondissement(s.instance));
  const derriereArr = derriere.filter((s) => estArrondissement(s.instance)).sort(parNom);

  zone.innerHTML = `<div class="resume eb-gros">
    <div class="resume-entete"><span>${tr('En bref — la dernière séance de chaque conseil · résumé généré par IA', 'In brief — the latest meeting of each council · AI-generated summary')}</span></div>
    <div class="eb-note">${odjs.size ? tr(NOTE_FR, NOTE_EN) : tr(NOTE_PV_FR, NOTE_PV_EN)}</div>
    ${grille(principales, jeu.page, false)}
    ${n ? `<details class="eb-arr"><summary>${odjs.size ? `<span class="eb-marque eb-marque-non">${tr(`Les ${n} arrondissements · non officiel`, `The ${n} boroughs · not official`)}</span>` : tr(`Les ${n} arrondissements`, `The ${n} boroughs`)}</summary>${grille(arrondissements, jeu.page, true)}</details>` : ''}
  </div>
  ${derriere.length ? `<div class="resume eb-gros eb-boite-retard"><details class="eb-arr eb-retard"><summary><span class="eb-marque eb-marque-non">${tr("Pourquoi un mois de retard ? C'est la façon de faire de Montréal", 'Why a month behind? That is how Montréal works')}</span></summary>
      <div class="eb-note">${tr(RETARD_FR, RETARD_EN)}</div>
      ${grille(derrierePrinc, jeu.page, false)}
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
