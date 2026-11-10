// Bloc d'après-vente (Martin, 10 nov. 2026) : la file des mois de commandite d'une ville louée.
// 50 $ par mois, 1 à 6 mois, placés après la dernière période réservée. Affichage : nom du payeur,
// anonyme ou bannière (image fixe, vérifiée avant la mise en ligne). Après le paiement, GoHighLevel
// redirige vers le formulaire d'après-vente (ville + bannière), en français ou en anglais.
//
// Pour l'ajouter à une ville louée :
//   <div data-apres-vente data-file="data/file-commandite.json"></div>
//   <script src="/commun/apres-vente.js" defer></script>
// La file : { "periodes": [ { "debut": "AAAA-MM-JJ", "fin": "AAAA-MM-JJ", "affichage": "nom|anonyme|banniere", "nom": "" } ] }
// Une ligne par paiement reçu. La langue suit la page (voir lang plus bas).
(function(){
  var LIENS = {
    fr: { nom: '6af307242330fac488af738c', anonyme: '6af307442330fac488af738d', banniere: '6af3076603c375ed645fe94e' },
    en: { nom: '6af317df03c375ed645fe986', anonyme: '6af3180103c375ed645fe987', banniere: '6af318222330fac488af73b4' }
  };
  // Villes à un seul mois à la fois (data-max-mois="1", Québec et Montréal, 10 nov. 2026) : liens à 1 mois fixe,
  // et aucune réservation tant que la ville est réservée. Un gros commanditaire attend au plus un mois.
  var LIENS1 = {
    fr: { nom: '6af31a6b03c375ed645fe997', anonyme: '6af31a952330fac488af73c5', banniere: '6af31abf2330fac488af73c7' },
    en: { nom: '6af31a1903c375ed645fe993', anonyme: '6af319e92330fac488af73c0', banniere: '6af31a412330fac488af73c4' }
  };
  // Bannière au prix de la ville (Martin, 10 nov. 2026) : le nom et l'anonymat restent à 50 $, la bannière
  // d'une entreprise paie le prix de la grille. data-prix-banniere="300" sur le bloc ; clé prix-mode (6 = 1 à 6 mois, 1 = mois fixe).
  // Un prix ou une langue absents ici retombent sur le lien bannière à 50 $ : créer le lien d'abord.
  var BANNIERE = {
    '100-6': { fr: '6af32d0b03c375ed645fe9e6' },
    '300-1': { fr: '6af32d3c2330fac488af7409' },
    '500-1': { fr: '6af32d6d2330fac488af740a', en: '6af32da12330fac488af740b' }
  };
  var PAIEMENT = 'https://promo.dafrsolution.com/payment-link/';
  var T = {
    fr: { reservee: 'Réservée jusqu’au', commanditer: 'Commanditer un mois : dès 50 $', libre: 'Prochain mois libre',
          prix: '50 $ par mois, de 1 à 6 mois. Vos mois s’ajoutent au bout de la file, après le dernier mois réservé.',
          libreMaint: 'Libre', prix6: 'De 1 à 6 mois. Vos mois s’ajoutent au bout de la file, après le dernier mois réservé.', prix1: 'Un mois à la fois, une réservation à la fois.', prixB: function(p){ return 'Avec votre nom ou anonymement : 50 $ par mois. Avec votre bannière ou le nom de votre entreprise : ' + p + ' $ par mois.'; }, bp: function(p){ return 'Avec ma bannière ou mon entreprise (' + p + ' $)'; }, occupe: 'Ce mois est déjà réservé. La prochaine réservation ouvre le',
          periode: 'Période', qui: 'Commanditaire', anonyme: 'Anonyme',
          b: { nom: 'Avec mon nom', anonyme: 'Anonyme', banniere: 'Avec ma bannière' },
          note: 'Le nom affiché est celui du paiement. Chaque bannière, une image fixe sans animation, est vérifiée avant sa mise en ligne. Refusée, elle est remboursée. Contribution au service, sans reçu d’impôt.' },
    en: { reservee: 'Booked until', commanditer: 'Sponsor a month: from $50', libre: 'Next free month',
          prix: '$50 per month, 1 to 6 months. Your months are added at the end of the line, after the last booked month.',
          libreMaint: 'Available', prix6: '1 to 6 months. Your months are added at the end of the line, after the last booked month.', prix1: 'One month at a time, one booking at a time.', prixB: function(p){ return 'With your name or anonymously: $50 a month. With your banner or business name: $' + p + ' a month.'; }, bp: function(p){ return 'With my banner or business ($' + p + ')'; }, occupe: 'This month is already booked. The next booking opens on',
          periode: 'Period', qui: 'Sponsor', anonyme: 'Anonymous',
          b: { nom: 'With my name', anonyme: 'Anonymously', banniere: 'With my banner' },
          note: 'The name shown is the one used for payment. Each banner, a still image with no animation, is checked before going online. If refused, you are refunded. Contribution to the service, no tax receipt.' }
  };
  var CSS = '.apres-vente{margin:-18px 0 28px;font-size:14px}.apres-vente summary{cursor:pointer;opacity:.85}'
    + '.apres-vente p{margin:8px 0;font-size:14px;background:none;padding:0;border:0}.apres-vente table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}'
    + '.apres-vente th,.apres-vente td{text-align:left;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.35)}'
    + '.apres-vente .av-boutons{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 6px}'
    + '.apres-vente .av-bouton{display:inline-block;padding:5px 12px;font-size:13px;border:2px solid currentColor;font-weight:700;text-decoration:none}'
    + '.apres-vente .av-bouton:hover{opacity:.75}.apres-vente .av-note{font-size:13px;opacity:.8}';
  // Le bloc suit la langue de la PAGE : un volet sans anglais (Lévis, Québec) reste en français,
  // même si le visiteur a choisi l’anglais ailleurs (même règle que commun/langue.js, VOLETS_EN).
  // data-lang="en" ou "fr" sur le bloc impose la langue (sites sœurs en anglais).
  var VOLETS_EN = ['montreal'];
  var lang = function(el){
    var impose = el.getAttribute('data-lang'); if(impose === 'en' || impose === 'fr') return impose;
    var ville = document.body && document.body.dataset.ville;
    if(ville && VOLETS_EN.indexOf(ville) < 0) return 'fr';
    if(/[?&]lang=en/.test(location.search)) return 'en';
    try { if(localStorage.getItem('dvq:langue') === 'en') return 'en'; } catch(e){}
    return /^en/i.test(document.documentElement.lang) ? 'en' : 'fr';
  };

  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function monter(el){
    var L = lang(el), t = T[L];
    var jour = function(s){ return new Date(s + 'T12:00:00').toLocaleDateString(L === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }); };
    var un = el.getAttribute('data-max-mois') === '1', liens = Object.assign({}, (un ? LIENS1 : LIENS)[L]);
    var pb = el.getAttribute('data-prix-banniere'), cle = pb && BANNIERE[pb + '-' + (un ? '1' : '6')];
    if(cle && cle[L]) liens.banniere = cle[L]; else pb = null;
    var iso = function(dt){ return dt.toISOString().slice(0, 10); }, auj = iso(new Date());
    fetch(el.getAttribute('data-file')).then(function(r){ return r.json(); }).then(function(d){
      var p = d.periodes || [];
      var fin = p.length ? p[p.length - 1].fin : null;
      var libre = fin ? new Date(fin + 'T12:00:00') : new Date(); if(fin) libre.setDate(libre.getDate() + 1);
      if(libre < new Date()) libre = new Date();
      var occupe = un && fin && fin >= auj;
      var qui = function(x){ return x.affichage === 'anonyme' ? t.anonyme : esc(x.nom); };
      var bouton = function(k){ return '<a class="av-bouton" href="' + PAIEMENT + liens[k] + '" rel="noopener">' + (k === 'banniere' && pb ? t.bp(pb) : t.b[k]) + '</a>'; };
      var resume = fin && fin >= auj ? t.reservee + ' <b>' + jour(fin) + '</b>' : t.libreMaint;
      el.outerHTML = '<details class="apres-vente"><summary>' + resume + ' · ' + t.commanditer + '</summary>'
        + (occupe ? '<p>' + t.occupe + ' <b>' + jour(iso(libre)) + '</b>.</p>'
                  : '<p>' + t.libre + ' : <b>' + jour(iso(libre)) + '</b></p><p>' + (un ? t.prix1 : (pb ? t.prix6 : t.prix)) + (pb ? ' ' + t.prixB(pb) : '') + '</p>')
        + (p.length ? '<table><tr><th>#</th><th>' + t.periode + '</th><th>' + t.qui + '</th></tr>'
          + p.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td>' + jour(x.debut) + ' → ' + jour(x.fin) + '</td><td>' + qui(x) + '</td></tr>'; }).join('') + '</table>' : '')
        + (occupe ? '' : '<p class="av-boutons">' + bouton('nom') + bouton('anonyme') + bouton('banniere') + '</p>')
        + '<p class="av-note">' + t.note + '</p></details>';
    }).catch(function(){ el.remove(); });
  }
  function demarrer(){
    var blocs = document.querySelectorAll('[data-apres-vente]'); if(!blocs.length) return;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    blocs.forEach(monter);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
