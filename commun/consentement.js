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

  // Au CENTRE de l'écran, sur un voile — comme sur DossierCanada : la question se
  // pose une fois, elle ne se noie pas en bas de page. Les deux boutons ont la
  // même taille : refuser doit être aussi facile qu'accepter.
  var STYLE = '#dq-temoins{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;'
    + 'padding:20px;background:rgba(22,25,29,0.45);'
    + 'font:14.5px/1.6 Archivo,system-ui,-apple-system,"Segoe UI",sans-serif}'
    + '#dq-temoins .dq-temoins-carte{width:100%;max-width:520px;background:#fff;color:#16191D;'
    + 'border:2px solid #16191D;box-shadow:6px 6px 0 #16191D;padding:22px 24px 20px}'
    + '#dq-temoins h2{font:700 19px/1.2 Archivo,system-ui,sans-serif;margin:0;text-transform:uppercase;letter-spacing:0.01em}'
    + '#dq-temoins h2::after{content:"";display:block;width:100px;height:4px;margin:9px 0 14px;background:#0E4FC1}'
    + '#dq-temoins p{margin:0 0 18px;max-width:56ch}'
    + '#dq-temoins .dq-temoins-boutons{display:flex;gap:10px}'
    + '#dq-temoins button{flex:1;font:inherit;font-weight:700;padding:10px 16px;border:2px solid #16191D;'
    + 'background:#fff;color:#16191D;cursor:pointer;box-shadow:3px 3px 0 #16191D}'
    + '#dq-temoins button:hover,#dq-temoins button:focus-visible{background:#16191D;color:#fff}'
    + '#dq-temoins button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #16191D}'
    + '@media (max-width:520px){#dq-temoins .dq-temoins-carte{padding:18px}#dq-temoins .dq-temoins-boutons{flex-direction:column}}';

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
    b.setAttribute('aria-modal', 'true');
    b.setAttribute('aria-label', en ? 'Cookies' : 'Témoins');
    b.innerHTML = '<div class="dq-temoins-carte"><h2>' + (en ? 'Cookies' : 'Témoins') + '</h2><p>' + (en
      ? 'DossierQuébec would like to use <strong>Google Analytics</strong> to count visits. It sets cookies. Nothing else changes if you decline.'
      : 'DossierQuébec aimerait utiliser <strong>Google Analytics</strong> pour compter les visites. Il dépose des témoins (cookies). Rien d’autre ne change si vous refusez.')
      + '</p><div class="dq-temoins-boutons"><button type="button" data-choix="non">' + (en ? 'Decline' : 'Refuser')
      + '</button><button type="button" data-choix="oui">' + (en ? 'Accept' : 'Accepter') + '</button></div></div>';
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
