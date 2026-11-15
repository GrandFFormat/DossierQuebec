/* La mesure maison de DQ (14 nov. 2026) : une ligne par page vue et une par clic dans la table
   dq_mesures (scripts/supabase-dq-mesures.sql), lues par /admin. Chargé sur toutes les pages du
   site de l'Assemblée et des cinq volets de ville, après la ligne Vercel Analytics.

   Loi 25 : aucune donnée personnelle, donc pas de consentement à demander. Pas d'adresse IP
   gardée, pas de témoin, pas de compte. Le jeton de session est un nombre au hasard qui meurt
   avec l'onglet (sessionStorage) : il compte les visites distinctes, rien de plus.

   Le libellé d'un clic : l'attribut data-mesure s'il existe, sinon le texte du bouton ou du lien
   (80 caractères au plus), sinon son adresse. Les liens externes gardent leur adresse. Les champs
   (saisie de courriel, codes) ne sont jamais mesurés. */
(function () {
  var URL_SUPABASE = 'https://wfgcqftgtmptfutrbujz.supabase.co/rest/v1/dq_mesures';
  var CLE_ANON = 'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6';
  var VILLES = ['quebec', 'montreal', 'levis', 'longueuil', 'laval'];

  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]mesure=1/.test(location.search)) return;   // rien en local, sauf ?mesure=1 pour tester

  function session() {
    try {
      var s = sessionStorage.getItem('dq:mesure');
      if (!s) { s = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('dq:mesure', s); }
      return s;
    } catch (e) { return ''; }
  }
  function ville() {
    var premier = location.pathname.split('/')[1] || '';
    return VILLES.indexOf(premier) >= 0 ? premier : '';
  }
  function provenance() {
    try {
      var utm = new URL(location.href).searchParams.get('utm_source');
      if (utm) return utm.slice(0, 120);
      if (!document.referrer) return 'direct';
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h === location.hostname.replace(/^www\./, '') ? '' : h.slice(0, 120);
    } catch (e) { return ''; }
  }
  function page() { return (location.pathname || '/').replace(/\.html$/, '').slice(0, 200); }
  function langue() { return document.documentElement.classList.contains('dq-en') || document.documentElement.lang === 'en' ? 'en' : 'fr'; }
  function titre() { return (document.title || '').replace(/\s+/g, ' ').trim().slice(0, 160); }

  function envoyer(ligne) {
    ligne.ville = ville(); ligne.page = page(); ligne.langue = langue(); ligne.session = session();
    var corps = JSON.stringify(ligne);
    try {
      fetch(URL_SUPABASE, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'apikey': CLE_ANON, 'Authorization': 'Bearer ' + CLE_ANON, 'Prefer': 'return=minimal' },
        body: corps
      }).catch(function () {});
    } catch (e) {}
  }

  // La page vue, une fois : le titre arrive parfois après dq.js (pages fabriquées en JS), on attend un peu.
  function pageVue() { envoyer({ type: 'page', titre: titre(), provenance: provenance() }); }
  if (document.readyState === 'complete') setTimeout(pageVue, 400); else window.addEventListener('load', function () { setTimeout(pageVue, 400); });

  // Le libellé d'un clic.
  function libelle(el) {
    var m = el.getAttribute('data-mesure');
    if (m) return m.slice(0, 120);
    var t = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (el.tagName === 'A' && el.href) {
      var ext = /^https?:/.test(el.getAttribute('href') || '') && el.hostname !== location.hostname;
      if (ext) return ('↗ ' + el.hostname.replace(/^www\./, '') + (t ? ' · ' + t.slice(0, 60) : '')).slice(0, 120);
      var chemin = (el.pathname || '') + (el.hash || '');
      return (t ? t.slice(0, 80) + ' → ' : '') + chemin.replace(/\.html$/, '').slice(0, 120 - Math.min(t.length, 80) - 3);
    }
    return (t || el.id || el.className || el.tagName.toLowerCase()).slice(0, 120);
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a, button, [role="button"], summary, [data-mesure]') : null;
    if (!el) return;
    if (el.closest('#dq-consentement, .dq-consentement')) return;   // la bannière de témoins, pas un geste du site
    var l = libelle(el);
    if (!l) return;
    envoyer({ type: 'clic', cible: l, titre: titre() });
  }, true);
})();
