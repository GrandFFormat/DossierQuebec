// Consentement aux témoins de Google Analytics (Loi 25), sur toutes les pages : DQ et les villes.
// Martin, 29 sept. 2026. Google Analytics ne dépose de témoins QU'APRÈS « Accepter » ;
// « Refuser » a le même poids. Le choix est gardé dans le navigateur (localStorage « dq:temoins »)
// et peut être changé avec le lien « Témoins » du pied de page, ou n'importe quel élément
// portant data-temoins (voir plus bas).
// Script classique et autonome : il pose lui-même son style, sa bannière et, s'il y a lieu, gtag.
(function () {
  var CLE = 'dq:temoins';

  function lire() { try { return localStorage.getItem(CLE); } catch (e) { return null; } }
  function ecrire(v) { try { localStorage.setItem(CLE, v); } catch (e) { /* navigation privée */ } }
  function anglais() {
    try {
      var p = new URLSearchParams(location.search).get('lang');
      if (p) return p === 'en';
      return localStorage.getItem('dvq:langue') === 'en';
    } catch (e) { return false; }
  }

  // La balise Google est dans le <head> de chaque page, avec un consentement « denied » par défaut
  // (Consent Mode de Google). « Accepter » l'ouvre ; « Refuser » le laisse fermé.
  function chargerAnalytics() {
    if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  var STYLE = '#dq-temoins{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:640px;margin:0 auto;'
    + 'background:#fff;color:#16191D;border:2px solid #16191D;box-shadow:4px 4px 0 #16191D;padding:14px 16px;'
    + 'font:14.5px/1.5 Archivo,system-ui,-apple-system,"Segoe UI",sans-serif}'
    + '#dq-temoins p{margin:0 0 10px}'
    + '#dq-temoins .dq-temoins-boutons{display:flex;gap:10px;flex-wrap:wrap}'
    + '#dq-temoins button{font:inherit;font-weight:700;padding:8px 16px;border:2px solid #16191D;background:#fff;color:#16191D;cursor:pointer}'
    + '#dq-temoins button:hover,#dq-temoins button:focus-visible{background:#16191D;color:#fff}';

  function banniere() {
    if (document.getElementById('dq-temoins')) return;
    var en = anglais();
    if (!document.getElementById('dq-temoins-style')) {
      var st = document.createElement('style');
      st.id = 'dq-temoins-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    var b = document.createElement('div');
    b.id = 'dq-temoins';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', en ? 'Cookies' : 'Témoins');
    b.innerHTML = '<p>' + (en
      ? 'DossierQuébec would like to use <strong>Google Analytics</strong> to count visits. It sets cookies. Nothing else changes if you decline.'
      : 'DossierQuébec aimerait utiliser <strong>Google Analytics</strong> pour compter les visites. Il dépose des témoins (cookies). Rien d’autre ne change si vous refusez.')
      + '</p><div class="dq-temoins-boutons"><button type="button" data-choix="oui">' + (en ? 'Accept' : 'Accepter')
      + '</button><button type="button" data-choix="non">' + (en ? 'Decline' : 'Refuser') + '</button></div>';
    b.addEventListener('click', function (e) {
      var choix = e.target.closest && e.target.closest('[data-choix]');
      if (!choix) return;
      var v = choix.getAttribute('data-choix');
      ecrire(v);
      b.remove();
      if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: v === 'oui' ? 'granted' : 'denied' });
    });
    document.body.appendChild(b);
  }

  // Changer d'avis : un clic sur tout élément data-temoins rouvre la bannière. Un refus après une
  // acceptation prend effet au prochain chargement de page (gtag déjà chargé ne se décharge pas).
  document.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('[data-temoins]');
    if (!l) return;
    e.preventDefault();
    banniere();
  });

  // Le lien « Témoins » au bas de chaque page, pour changer d'avis.
  function lienPied() {
    var pied = document.querySelector('footer');
    if (!pied || pied.querySelector('[data-temoins]')) return;
    var cible = pied.querySelector('p:last-of-type') || pied;
    var a = document.createElement('a');
    a.href = '#';
    a.setAttribute('data-temoins', '');
    a.textContent = anglais() ? 'Cookies' : 'Témoins';
    cible.appendChild(document.createTextNode(' · '));
    cible.appendChild(a);
  }

  function auChargement(f) { if (document.body) f(); else document.addEventListener('DOMContentLoaded', f); }
  auChargement(lienPied);

  var choix = lire();
  if (choix !== 'oui' && choix !== 'non') auChargement(banniere);
})();

// LIENS EXTERNES DANS UN NOUVEL ONGLET, VOLETS DE VILLE SEULEMENT (Martin, 12 nov. 2026) : sur
// /quebec/, /montreal/, /levis/, /laval/ et /longueuil/, tout lien qui fait sortir du site s'ouvre
// dans un nouvel onglet. Le reste de DossierQuébec garde son comportement. Placé ici parce que ce
// fichier est chargé sur toutes les pages publiques. Couvre aussi les liens ajoutés après coup par
// les scripts des pages (recherche par adresse, fiches qu'on ouvre). Les liens internes, mailto: et
// tel: ne sont pas touchés ; un lien qui a déjà une cible garde la sienne.
(function () {
  if (!/^\/(quebec|montreal|levis|laval|longueuil)(\/|$)/.test(location.pathname)) return;
  function marquer(racine) {
    if (!racine || !racine.querySelectorAll) return;
    var liens = racine.matches && racine.matches('a[href]') ? [racine] : racine.querySelectorAll('a[href]');
    for (var i = 0; i < liens.length; i++) {
      var a = liens[i];
      if (a.hasAttribute('target')) continue;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (e) { continue; }
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === location.hostname) continue;
      a.setAttribute('target', '_blank');
      var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
      if (rel.indexOf('noopener') < 0) rel.push('noopener');
      a.setAttribute('rel', rel.join(' '));
    }
  }
  function demarrer() {
    marquer(document.body);
    if (!window.MutationObserver) return;
    new MutationObserver(function (changements) {
      for (var i = 0; i < changements.length; i++) {
        var ajouts = changements[i].addedNodes;
        for (var j = 0; j < ajouts.length; j++) if (ajouts[j].nodeType === 1) marquer(ajouts[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
