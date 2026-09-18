// « Les courriels de DossierQuébec » : formulaire (accueil des volets) et boîte Mes dossiers.
// Trois sortes par ville (mensuel, conseil, arrondissement) — api/_infolettre.js.
// Montréal : bloc en 3 zones (langues × lettres de la Ville × arrondissements), chaque combo
// langue×sorte = un envoi distinct. Québec : cases plates, FR seulement.

import { session, mesurer, echapper, tr } from './abonnes-client.js';
import { dernierVolet } from './navigation.js';

const ICONES = { mensuel: '🗓️', conseil: '🏛️', arrondissement: '📍' };

const etatServeur = async (s) => {
  const r = await fetch('/api/infolettre?action=etat', { headers: s ? { Authorization: `Bearer ${s.access_token}` } : {}, cache: 'no-store' }).catch(() => null);
  return r?.ok ? r.json() : null;
};

// montreal:mensuel:fr · montreal:conseil:en · montreal:arrondissement:plateau-mont-royal:fr
const cleChoix = ({ ville, type = 'mensuel', arrondissement = '', langue = 'fr' }) =>
  [ville, type === 'mensuel' ? null : type, arrondissement || null, langue || 'fr'].filter(Boolean).join(':');

const inscrit = (etat, choix) => etat.inscriptions?.[cleChoix(choix)] === 'confirme';

const nomArrondissement = (offre, cle) =>
  offre.find((o) => o.cle === 'arrondissement')?.arrondissements?.find((a) => a.cle === cle)?.nom ?? cle;

const languesDe = (villeEtat) => villeEtat?.langues ?? villeEtat?.offre?.[0]?.langues ?? ['fr'];

const arrondissementsSuivis = (etat, ville, langues) => {
  const set = new Set();
  for (const lang of langues) {
    for (const [cle, statut] of Object.entries(etat.inscriptions ?? {})) {
      if (statut !== 'confirme') continue;
      // …:arrondissement:<arr>:<lang>
      const m = cle.match(new RegExp(`^${ville}:arrondissement:([^:]+):${lang}$`));
      if (m) set.add(m[1]);
    }
  }
  // Aussi les vieux enregistrements sans langue (avant migration) — traités comme fr
  if (langues.includes('fr')) {
    for (const [cle, statut] of Object.entries(etat.inscriptions ?? {})) {
      if (statut === 'confirme' && cle.startsWith(`${ville}:arrondissement:`) && cle.split(':').length === 3) {
        set.add(cle.split(':')[2]);
      }
    }
  }
  return [...set];
};

const sorteVilleActive = (etat, ville, type, langues) =>
  langues.some((langue) => inscrit(etat, { ville, type, langue }));

// ---------- rendu Québec (simple) ----------
function ligneSorte(ville, o, { coche = false, langue = 'fr' } = {}) {
  return `<label class="ab-courriel">
    <input type="checkbox" data-ville="${echapper(ville)}" data-type="${echapper(o.cle)}" data-langue="${echapper(langue)}"${coche ? ' checked' : ''}>
    <span class="ab-courriel-texte">
      <span class="ab-courriel-nom">${ICONES[o.cle] ?? '📬'} ${echapper(o.nom)}</span>
      <span class="ab-courriel-rythme">${echapper(o.rythme)}</span>
      <span class="ab-courriel-quoi">${echapper(o.quoi)}</span>
    </span>
  </label>`;
}

function ligneArrondissementSimple(ville, o, suivis, { retirable = false, langue = 'fr' } = {}) {
  const restants = o.arrondissements.filter((a) => !suivis.includes(a.cle));
  return `<div class="ab-courriel ab-courriel-arr">
    <span class="ab-courriel-texte">
      <span class="ab-courriel-nom">${ICONES.arrondissement} ${echapper(o.nom)}</span>
      <span class="ab-courriel-rythme">${echapper(o.rythme)}</span>
      <span class="ab-courriel-quoi">${echapper(o.quoi)}</span>
      ${suivis.length ? `<span class="ab-arr-suivis">${suivis.map((cle) => `<span class="ab-arr-puce">${echapper(nomArrondissement([o], cle))}${retirable ? `<button type="button" class="ab-arr-retirer" data-ville="${echapper(ville)}" data-arrondissement="${echapper(cle)}" data-langue="${echapper(langue)}" aria-label="${tr('Retirer', 'Remove')} ${echapper(nomArrondissement([o], cle))}">×</button>` : ''}</span>`).join('')}</span>` : ''}
      ${restants.length ? `<select class="ab-arr-choix" data-ville="${echapper(ville)}" data-langue="${echapper(langue)}" aria-label="${tr('Choisir un arrondissement', 'Choose a borough')}">
        <option value="">${suivis.length ? tr('Ajouter un arrondissement…', 'Add a borough…') : tr('Choisir mon arrondissement…', 'Choose my borough…')}</option>
        ${restants.map((a) => `<option value="${echapper(a.cle)}">${echapper(a.nom)}</option>`).join('')}
      </select>` : `<span class="ab-note" style="margin:0">${tr('Vous les suivez tous.', 'You follow them all.')}</span>`}
    </span>
  </div>`;
}

const listeSortesSimple = (etat, ville, offre, options = {}) => {
  const langue = 'fr';
  return offre.map((o) => (o.arrondissements
    ? ligneArrondissementSimple(ville, o, arrondissementsSuivis(etat, ville, [langue]), { ...options, langue })
    : ligneSorte(ville, o, { coche: options.cocherSuivis && inscrit(etat, { ville, type: o.cle, langue }), langue }))).join('');
};

// ---------- rendu Montréal (3 zones) ----------
function blocMontreal(etat, villeEtat, { retirable = false, cocherSuivis = false, mode = 'formulaire' } = {}) {
  const ville = villeEtat.cle;
  const offre = villeEtat.offre;
  const languesDispo = languesDe(villeEtat);
  const mensuel = offre.find((o) => o.cle === 'mensuel');
  const conseil = offre.find((o) => o.cle === 'conseil');
  const arrOffre = offre.find((o) => o.cle === 'arrondissement');

  // Langues déjà actives (au moins une inscription confirmée dans cette langue)
  const languesActives = languesDispo.filter((lang) =>
    Object.entries(etat.inscriptions ?? {}).some(([cle, st]) => st === 'confirme' && cle.startsWith(`${ville}:`) && cle.endsWith(`:${lang}`))
  );
  // Défaut formulaire public : FR coché ; Mes dossiers : ce qui est déjà actif, sinon FR
  const languesCochees = cocherSuivis
    ? (languesActives.length ? languesActives : ['fr'])
    : ['fr'];

  const suivis = arrondissementsSuivis(etat, ville, languesCochees.length ? languesCochees : ['fr']);
  const restants = (arrOffre?.arrondissements ?? []).filter((a) => !suivis.includes(a.cle));

  const zoneLangues = `<fieldset class="ab-zone ab-zone-langues">
    <legend>${tr('1. Langues', '1. Languages')}</legend>
    <p class="ab-zone-aide">${tr('Chaque lettre cochée plus bas part dans chaque langue cochée ici.', 'Each letter checked below is sent in every language checked here.')}</p>
    <div class="ab-zone-cases">
      ${languesDispo.map((lang) => `<label class="ab-langue"><input type="checkbox" class="ab-langue-case" data-ville="${echapper(ville)}" data-langue="${lang}"${languesCochees.includes(lang) ? ' checked' : ''}> ${lang === 'fr' ? 'Français' : 'English'}</label>`).join('')}
    </div>
  </fieldset>`;

  const caseVille = (o) => {
    if (!o) return '';
    const coche = cocherSuivis && sorteVilleActive(etat, ville, o.cle, languesCochees);
    return `<label class="ab-courriel">
      <input type="checkbox" class="ab-sorte-ville" data-ville="${echapper(ville)}" data-type="${echapper(o.cle)}"${coche ? ' checked' : ''}>
      <span class="ab-courriel-texte">
        <span class="ab-courriel-nom">${ICONES[o.cle] ?? '📬'} ${echapper(o.nom)}</span>
        <span class="ab-courriel-rythme">${echapper(o.rythme)}</span>
        <span class="ab-courriel-quoi">${echapper(o.quoi)}</span>
      </span>
    </label>`;
  };

  const zoneVille = `<fieldset class="ab-zone ab-zone-ville">
    <legend>${tr('2. Lettres de la Ville', '2. City-wide letters')}</legend>
    ${caseVille(mensuel)}
    ${caseVille(conseil)}
  </fieldset>`;

  const zoneArr = arrOffre ? `<fieldset class="ab-zone ab-zone-arr">
    <legend>${tr('3. Arrondissements', '3. Boroughs')}</legend>
    <p class="ab-zone-aide">${tr('Autant que vous voulez — utile pour une biblio, un organisme, plusieurs quartiers.', 'As many as you want — handy for a library, an org, or several neighbourhoods.')}</p>
    ${suivis.length ? `<span class="ab-arr-suivis">${suivis.map((cle) => `<span class="ab-arr-puce">${echapper(nomArrondissement([arrOffre], cle))}${retirable ? `<button type="button" class="ab-arr-retirer" data-ville="${echapper(ville)}" data-arrondissement="${echapper(cle)}" aria-label="${tr('Retirer', 'Remove')} ${echapper(nomArrondissement([arrOffre], cle))}">×</button>` : ''}</span>`).join('')}</span>` : ''}
    ${restants.length ? `<select class="ab-arr-choix ab-arr-mtl" data-ville="${echapper(ville)}" aria-label="${tr('Ajouter un arrondissement', 'Add a borough')}">
      <option value="">${suivis.length ? tr('Ajouter un arrondissement…', 'Add a borough…') : tr('Choisir un arrondissement…', 'Choose a borough…')}</option>
      ${restants.map((a) => `<option value="${echapper(a.cle)}">${echapper(a.nom)}</option>`).join('')}
    </select>` : `<span class="ab-note" style="margin:0">${tr('Vous les suivez tous.', 'You follow them all.')}</span>`}
  </fieldset>` : '';

  return `<div class="ab-mtl-blocs" data-ville="${echapper(ville)}" data-mode="${echapper(mode)}">${zoneLangues}${zoneVille}${zoneArr}</div>`;
}

const listePourVille = (etat, villeEtat, options = {}) =>
  (villeEtat.cle === 'montreal' && (languesDe(villeEtat).length > 1 || options.forcerMtl))
    ? blocMontreal(etat, villeEtat, options)
    : listeSortesSimple(etat, villeEtat.cle, villeEtat.offre, options);

// Choix cochés dans un formulaire public (expansion langues × sortes × arr)
function choixDepuisFormulaire(racine) {
  const blocs = [...racine.querySelectorAll('.ab-mtl-blocs')];
  const out = [];

  for (const bloc of blocs) {
    const ville = bloc.dataset.ville;
    const langues = [...bloc.querySelectorAll('.ab-langue-case:checked')].map((c) => c.dataset.langue);
    if (!langues.length) continue;
    for (const c of bloc.querySelectorAll('.ab-sorte-ville:checked')) {
      for (const langue of langues) out.push({ ville, type: c.dataset.type, langue });
    }
    const arrs = [
      ...[...bloc.querySelectorAll('.ab-arr-suivis [data-arrondissement]')].map((el) => el.dataset.arrondissement),
      ...(bloc.querySelector('.ab-arr-mtl')?.value ? [bloc.querySelector('.ab-arr-mtl').value] : []),
    ];
    for (const arrondissement of [...new Set(arrs)]) {
      for (const langue of langues) out.push({ ville, type: 'arrondissement', arrondissement, langue });
    }
  }

  // Québec / villes simples
  for (const c of racine.querySelectorAll('input[type="checkbox"][data-type]:checked')) {
    if (c.classList.contains('ab-langue-case') || c.classList.contains('ab-sorte-ville')) continue;
    out.push({ ville: c.dataset.ville, type: c.dataset.type, langue: c.dataset.langue || 'fr' });
  }
  for (const s of racine.querySelectorAll('.ab-arr-choix:not(.ab-arr-mtl)')) {
    if (!s.value) continue;
    out.push({ ville: s.dataset.ville, type: 'arrondissement', arrondissement: s.value, langue: s.dataset.langue || 'fr' });
  }
  return out;
}

const noteDe = (v) => (v?.note ? `<p class="ab-note ab-infolettre-note">${v.note}</p>` : '');
export async function formulaireInfolettre(zone, { ville = null } = {}) {
  if (!zone) return;
  const s = await session().catch(() => null);
  const etat = await etatServeur(s);
  if (!etat?.villes?.length) { zone.hidden = true; return; }
  const villes = ville ? etat.villes.filter((v) => v.cle === ville) : [...etat.villes];
  if (!villes.length) { zone.hidden = true; return; }
  const titre = ville
    ? tr(`Les courriels de ${echapper(villes[0].nom)}`, `${echapper(villes[0].nom)} emails`)
    : tr('Les courriels de DossierQuébec', 'DossierQuébec emails');

  zone.innerHTML = `<section class="ab-infolettre">
    <h2>📬 ${titre}</h2>
    <p>${tr('Choisissez ce que vous voulez recevoir. C’est gratuit, et on se désinscrit en un clic dans chaque courriel. <strong>Vous recevez tout de suite le plus récent de chaque sorte cochée.</strong>', 'Choose what you want to receive. It’s free, and one click unsubscribes you in every email. <strong>You get the latest of each kind right away.</strong>')}</p>
    <form class="ab-infolettre-form" novalidate>
      ${villes.map((v) => `${villes.length > 1 ? `<h3 class="ab-sous-titre">${echapper(v.nom)}</h3>` : ''}${noteDe(v)}${listePourVille(etat, v, { mode: 'formulaire' })}`).join('')}
      <div class="ab-form">
        <input type="email" name="email" required maxlength="200" autocomplete="email" placeholder="${tr('Votre courriel', 'Your email')}" aria-label="${tr('Votre courriel', 'Your email')}" value="${echapper(etat.courriel ?? '')}">
        <input type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true" class="ab-pot-de-miel">
        <button type="submit" class="ab-bouton">${tr('M’inscrire', 'Subscribe')}</button>
      </div>
    </form>
    <p class="ab-note ab-infolettre-etat" aria-live="polite"></p>
    <p class="ab-note">${tr('Un courriel par combinaison cochée (sorte × langue). Aucune publicité ; votre adresse ne sert qu’à ça.', 'One email per checked combination (kind × language). No ads; your address is used for nothing else.')}</p>
  </section>`;
  zone.hidden = false;

  const form = zone.querySelector('form');
  const etatTexte = zone.querySelector('.ab-infolettre-etat');
  // Formulaire public MTL : accumuler plusieurs arrondissements avant l'envoi
  form.addEventListener('change', (ev) => {
    const sel = ev.target.closest('.ab-arr-mtl');
    if (!sel?.value) return;
    const bloc = sel.closest('.ab-mtl-blocs');
    if (!bloc) return;
    let liste = bloc.querySelector('.ab-arr-suivis');
    if (!liste) {
      liste = document.createElement('span');
      liste.className = 'ab-arr-suivis';
      sel.before(liste);
    }
    if ([...liste.querySelectorAll('[data-arrondissement]')].some((el) => el.dataset.arrondissement === sel.value)) {
      sel.value = '';
      return;
    }
    const puce = document.createElement('span');
    puce.className = 'ab-arr-puce';
    puce.dataset.arrondissement = sel.value;
    const nom = sel.selectedOptions[0]?.textContent ?? sel.value;
    puce.innerHTML = `${nom}<button type="button" class="ab-arr-retirer ab-arr-mtl-accum" data-arrondissement="${sel.value}" aria-label="Retirer">×</button>`;
    liste.appendChild(puce);
    sel.querySelector(`option[value="${CSS.escape(sel.value)}"]`)?.remove();
    sel.value = '';
  });
  form.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.ab-arr-mtl-accum');
    if (!btn) return;
    btn.closest('.ab-arr-puce')?.remove();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const choix = choixDepuisFormulaire(form);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { etatTexte.textContent = tr('Entrez une adresse courriel valide.', 'Enter a valid email address.'); return; }
    if (!choix.length) { etatTexte.textContent = tr('Cochez au moins une langue et une lettre, ou un arrondissement.', 'Check at least one language and one letter, or a borough.'); return; }
    // Montréal : exiger ≥1 langue si le bloc mtl est présent
    const bloc = form.querySelector('.ab-mtl-blocs');
    if (bloc && ![...bloc.querySelectorAll('.ab-langue-case:checked')].length) {
      etatTexte.textContent = tr('Cochez au moins une langue (Français ou English).', 'Check at least one language (French or English).');
      return;
    }
    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    etatTexte.textContent = tr('Envoi…', 'Sending…');
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=inscrire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(courante ? { Authorization: `Bearer ${courante.access_token}` } : {}) },
      body: JSON.stringify({ email, choix, site_web: form.site_web.value }),
    }).catch(() => null);
    const donnees = r ? await r.json().catch(() => ({})) : {};
    bouton.disabled = false;
    if (!r?.ok) {
      etatTexte.textContent = r?.status === 429
        ? tr('Trop de demandes en ce moment. Réessayez dans une heure.', 'Too many requests right now. Try again in an hour.')
        : tr('Une erreur est survenue. Réessayez dans un moment.', 'Something went wrong. Try again in a moment.');
      return;
    }
    mesurer('infolettre_inscription', { sortes: choix.map((c) => `${c.type}:${c.langue}`).join(','), connecte: donnees.confirme ? 'oui' : 'non' });
    etatTexte.innerHTML = donnees.confirme
      ? tr(`<strong>C'est fait.</strong> Le plus récent de chaque sorte part vers ${echapper(email)}.`, `<strong>Done.</strong> The latest of each kind is on its way to ${echapper(email)}.`)
      : tr(`<strong>Presque fini :</strong> on vient d'écrire à ${echapper(email)}. Cliquez sur « Confirmer mon inscription » dans ce courriel. (Pas reçu ? Regardez dans les indésirables.)`, `<strong>Almost done:</strong> we just emailed ${echapper(email)}. Click “Confirmer mon inscription” in that email. (Not there? Check your spam folder.)`);
    form.reset();
  });
}

// ---------- Mes dossiers ----------
export async function boiteInfolettre(zone, s, { premiereLigne = null } = {}) {
  if (!zone) return;
  if (!s) { zone.innerHTML = ''; return; }
  let etat = await etatServeur(s);
  if (!etat?.villes?.length && !premiereLigne) { zone.innerHTML = ''; return; }
  etat ??= { villes: [], inscriptions: {}, courriel: s.user?.email ?? '' };
  const volet = dernierVolet();
  const villesIci = etat.villes.filter((v) => v.cle === volet);
  const villes = villesIci.length ? villesIci : etat.villes;
  const titreBoite = villesIci.length
    ? tr(`Mes courriels de ${echapper(villesIci[0].nom)}`, `My ${echapper(villesIci[0].nom)} emails`)
    : tr('Mes courriels', 'My emails');

  const dessiner = (message = '') => {
    zone.innerHTML = `<section class="ab-carte ab-infolettre-boite">
      <h2 style="margin-top:0">📬 ${titreBoite}</h2>
      <p class="ab-chapeau" style="margin-bottom:12px">${tr('Cochez ce que vous voulez recevoir. Pour Montréal : langues, lettres de la Ville, puis arrondissements. Chaque changement s’enregistre tout de suite.', 'Check what you want to receive. For Montréal: languages, city letters, then boroughs. Each change is saved right away.')}</p>
      ${premiereLigne?.html ?? ''}
      ${villes.map((v) => `${villes.length > 1 ? `<h3 class="ab-sous-titre">${echapper(v.nom)}</h3>` : ''}${noteDe(v)}${listePourVille(etat, v, { cocherSuivis: true, retirable: true, mode: 'boite' })}`).join('')}
      <p class="ab-note" aria-live="polite">${message || tr(`Envoyé à ${echapper(etat.courriel ?? '')}.`, `Sent to ${echapper(etat.courriel ?? '')}.`)}</p>
    </section>`;
    premiereLigne?.cabler?.(zone);
  };
  dessiner();

  const enregistrer = async (choixListe, message) => {
    const courante = await session().catch(() => null);
    const r = await fetch('/api/infolettre?action=preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courante?.access_token ?? ''}` },
      body: JSON.stringify({ choix: choixListe }),
    }).catch(() => null);
    const donnees = r?.ok ? await r.json().catch(() => null) : null;
    if (!donnees) { dessiner(tr('Impossible pour l’instant. Réessayez dans un moment.', "Couldn't do it right now. Try again in a moment.")); return; }
    etat = donnees;
    mesurer('infolettre_preferences', { n: String(choixListe.length) });
    dessiner(message);
  };

  const languesCocheesBloc = (bloc) => [...bloc.querySelectorAll('.ab-langue-case:checked')].map((c) => c.dataset.langue);

  zone.onchange = async (ev) => {
    const bloc = ev.target.closest('.ab-mtl-blocs');

    // --- Montréal : case langue ---
    if (ev.target.classList.contains('ab-langue-case') && bloc) {
      const ville = bloc.dataset.ville;
      const langue = ev.target.dataset.langue;
      const actif = ev.target.checked;
      const restantes = languesCocheesBloc(bloc);
      if (!actif && !restantes.length) {
        ev.target.checked = true;
        dessiner(tr('Gardez au moins une langue cochée.', 'Keep at least one language checked.'));
        return;
      }
      // Sortes Ville cochées + arrondissements suivis → activer/désactiver cette langue
      const typesVille = [...bloc.querySelectorAll('.ab-sorte-ville:checked')].map((c) => c.dataset.type);
      const arrs = arrondissementsSuivis(etat, ville, ['fr', 'en']);
      const batch = [
        ...typesVille.map((type) => ({ ville, type, langue, actif })),
        ...arrs.map((arrondissement) => ({ ville, type: 'arrondissement', arrondissement, langue, actif })),
      ];
      if (!batch.length) {
        // Rien d'autre coché : on mémorise juste l'UI ; rien à pousser tant qu'il n'y a pas de lettre
        return;
      }
      ev.target.disabled = true;
      return enregistrer(batch, actif
        ? tr(`Langue « ${langue === 'fr' ? 'Français' : 'English'} » ajoutée aux lettres cochées.`, `“${langue === 'fr' ? 'French' : 'English'}” added to your checked letters.`)
        : tr(`Langue « ${langue === 'fr' ? 'Français' : 'English'} » retirée.`, `“${langue === 'fr' ? 'French' : 'English'}” removed.`));
    }

    // --- Montréal : lettre Ville ---
    if (ev.target.classList.contains('ab-sorte-ville') && bloc) {
      const ville = bloc.dataset.ville;
      const type = ev.target.dataset.type;
      const langues = languesCocheesBloc(bloc);
      if (!langues.length) {
        ev.target.checked = false;
        dessiner(tr('Cochez d’abord une langue.', 'Check a language first.'));
        return;
      }
      ev.target.disabled = true;
      return enregistrer(
        langues.map((langue) => ({ ville, type, langue, actif: ev.target.checked })),
        ev.target.checked
          ? tr('Inscrit : le plus récent part vers votre boîte.', 'Subscribed: the latest one is on its way.')
          : tr('Vous ne recevrez plus cette lettre.', "You won't receive this letter anymore.")
      );
    }

    // --- Montréal : ajouter arrondissement ---
    if (ev.target.classList.contains('ab-arr-mtl') && ev.target.value && bloc) {
      const ville = bloc.dataset.ville;
      const arrondissement = ev.target.value;
      const langues = languesCocheesBloc(bloc);
      if (!langues.length) {
        ev.target.value = '';
        dessiner(tr('Cochez d’abord une langue.', 'Check a language first.'));
        return;
      }
      const nom = ev.target.selectedOptions[0]?.textContent ?? arrondissement;
      ev.target.disabled = true;
      return enregistrer(
        langues.map((langue) => ({ ville, type: 'arrondissement', arrondissement, langue, actif: true })),
        tr(`Arrondissement ${echapper(nom)} ajouté.`, `Borough ${echapper(nom)} added.`)
      );
    }

    // --- Québec / simple ---
    const caseSorte = ev.target.closest('input[type="checkbox"][data-type]:not(.ab-langue-case):not(.ab-sorte-ville)');
    if (caseSorte) {
      const { ville, type, langue = 'fr' } = caseSorte.dataset;
      caseSorte.disabled = true;
      return enregistrer([{ ville, type, langue, actif: caseSorte.checked }], caseSorte.checked
        ? tr('Inscrit : le plus récent part vers votre boîte.', 'Subscribed: the latest one is on its way.')
        : tr('Vous ne recevrez plus cette lettre.', "You won't receive this letter anymore."));
    }
    const choixArr = ev.target.closest('.ab-arr-choix:not(.ab-arr-mtl)');
    if (choixArr?.value) {
      const { ville, langue = 'fr' } = choixArr.dataset;
      const arrondissement = choixArr.value;
      choixArr.disabled = true;
      return enregistrer([{ ville, type: 'arrondissement', arrondissement, langue, actif: true }],
        tr('Arrondissement ajouté.', 'Borough added.'));
    }
  };

  zone.onclick = async (ev) => {
    const retirer = ev.target.closest('.ab-arr-retirer');
    if (!retirer) return;
    const { ville, arrondissement } = retirer.dataset;
    const bloc = retirer.closest('.ab-mtl-blocs');
    const langues = bloc ? languesCocheesBloc(bloc) : [retirer.dataset.langue || 'fr'];
    retirer.disabled = true;
    await enregistrer(
      (langues.length ? langues : ['fr']).map((langue) => ({ ville, type: 'arrondissement', arrondissement, langue, actif: false })),
      tr('Arrondissement retiré.', 'Borough removed.')
    );
  };
}
