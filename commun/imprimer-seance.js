// Imprimer une séance entière (Martin, 27 sept. 2026) : une icône d'imprimante à gauche du « + »
// de chaque séance, sur ordinateur seulement. Un clic imprime CETTE séance, et elle seule, avec
// toutes ses décisions dépliées ; la page revient ensuite comme elle était.
//
// Utilisé par les volets Québec et Montréal (assets/app.js) : boutonImprimer() dans l'en-tête de
// séance, brancherImpression() une fois au chargement. La feuille de style vient d'ici aussi, pour
// qu'un volet n'ait qu'une ligne à ajouter.

const ICONE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M6 14h12v7H6z"/></svg>';

export function boutonImprimer(libelle) {
  return `<button type="button" class="imprimer-seance" data-action="imprimer-seance" title="${libelle}" aria-label="${libelle}">${ICONE}</button>`;
}

const STYLE = `
.imprimer-seance { display: none; }
/* Ordinateur seulement : une souris, et assez de largeur. */
@media (hover: hover) and (pointer: fine) and (min-width: 900px) {
  .seance-entete { padding-right: 76px; }
  .imprimer-seance {
    display: inline-flex; align-items: center; justify-content: center;
    position: absolute; right: 38px; top: 50%; transform: translateY(-50%);
    width: 30px; height: 30px; padding: 0; border: 1px solid transparent; border-radius: 6px;
    background: none; color: var(--doux); cursor: pointer;
  }
  .imprimer-seance:hover, .imprimer-seance:focus-visible { color: var(--accent); border-color: var(--accent); }
}
@media print {
  body.impression-seance header, body.impression-seance footer, body.impression-seance nav,
  body.impression-seance .barre-outils, body.impression-seance .chapeau, body.impression-seance h2.page, body.impression-seance h1.page,
  body.impression-seance #compte-decisions, body.impression-seance #plus-decisions,
  body.impression-seance #chargement, body.impression-seance .imprimer-seance { display: none !important; }
  body.impression-seance .seance:not(.a-imprimer) { display: none !important; }
  body.impression-seance #liste-decisions > :not(.seance) { display: none !important; }
  body.impression-seance .seance-entete { position: static !important; box-shadow: none; padding-right: 16px; }
  body.impression-seance .seance-entete::after, body.impression-seance .reste-seance > summary { display: none !important; }
  body.impression-seance .ab-fiche, body.impression-seance .ab-signaler { display: none !important; }
  body.impression-seance .carte { break-inside: avoid; box-shadow: none; }
}`;

function imprimer(seance) {
  // Les fiches forment un accordéon (<details name="fiches">) : une seule ouverte à la fois. On
  // retire le nom le temps d'imprimer pour les ouvrir toutes, puis on remet tout comme avant.
  const avant = [];
  const pliables = [seance, ...seance.querySelectorAll('details')];
  for (const d of pliables) {
    avant.push([d, d.open, d.getAttribute('name')]);
    d.removeAttribute('name');
    d.open = true;
  }
  document.body.classList.add('impression-seance');
  seance.classList.add('a-imprimer');
  const remettre = () => {
    window.removeEventListener('afterprint', remettre);
    document.body.classList.remove('impression-seance');
    seance.classList.remove('a-imprimer');
    for (const [d, ouvert, nom] of avant) {
      d.open = ouvert;
      if (nom !== null) d.setAttribute('name', nom);
    }
  };
  window.addEventListener('afterprint', remettre);
  window.print();
}

export function brancherImpression() {
  if (document.getElementById('style-imprimer-seance')) return;
  const style = document.createElement('style');
  style.id = 'style-imprimer-seance';
  style.textContent = STYLE;
  document.head.appendChild(style);
  // En capture : le bouton vit dans le <summary>, et son clic ne doit pas plier la séance.
  document.addEventListener('click', (e) => {
    const bouton = e.target.closest?.('[data-action="imprimer-seance"]');
    if (!bouton) return;
    e.preventDefault();
    e.stopPropagation();
    const seance = bouton.closest('details.seance');
    if (seance) imprimer(seance);
  }, true);
}
