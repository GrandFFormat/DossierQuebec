// Bloc d'après-vente (Martin, 10 nov. 2026) : la file des mois de commandite d'une ville louée.
// 50 $ par mois, 1 à 6 mois, placés après la dernière période réservée. Affichage : nom du payeur,
// anonyme ou bannière (image fixe, vérifiée avant la mise en ligne). Après le paiement, GoHighLevel
// redirige vers le formulaire d'après-vente (ville + bannière), en français ou en anglais.
//
// Pour l'ajouter à une ville louée :
//   <div data-apres-vente data-file="data/file-commandite.json"></div>
//   <script src="/commun/apres-vente.js" defer></script>
// La file : { "periodes": [ { "debut": "AAAA-MM-JJ", "fin": "AAAA-MM-JJ", "affichage": "nom|anonyme|banniere", "nom": "" } ] }
// Une ligne par paiement reçu (une bannière gagnée : affichage « banniere », nom de l'entreprise, "prix").
// La langue suit la page (voir lang plus bas).
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
  // Une ville d'ENCHERE n'utilise plus ces liens : sa bannière se gagne aux enchères.
  var BANNIERE = {
    '100-6': { fr: '6af32d0b03c375ed645fe9e6', en: '6af4833d906a8b62055d5942' },
    '300-1': { fr: '6af32d3c2330fac488af7409', en: '6af48302906a8b62055d5941' },
    '500-1': { fr: '6af32d6d2330fac488af740a', en: '6af32da12330fac488af740b' }
  };
  var PAIEMENT = 'https://promo.dafrsolution.com/payment-link/';
  // Enchère en direct du mois de bannière (Martin, 11 nov. 2026), servie par api/represente.js (api/_enchere.js).
  // On offre le montant voulu, à partir du prix de la ville ; l'offre compte une fois confirmée par courriel,
  // la page dit la place obtenue et l'ancien premier est prévenu par courriel. Fermeture 7 jours avant le
  // début du mois ; Martin reçoit le gagnant et lui envoie la facture GHL.
  // Le mois en jeu : le lendemain de la dernière bannière ou du dernier mois commencé (passe-devant :
  // les mois de particuliers pas encore commencés ne le retiennent pas), sinon le 1er du mois suivant,
  // toujours assez loin pour que la fermeture ne soit pas passée. Le serveur fait le même calcul de fin.
  var ENCHERE = ['quebec', 'montreal', 'levis'], API = '/api/represente', FERMETURE = 7;
  var T = {
    fr: { reservee: 'Réservée jusqu’au', commanditer: 'Commanditer un mois : dès 50 $', libre: 'Prochain mois libre',
          prix: '50 $ par mois, de 1 à 6 mois. Vos mois s’ajoutent au bout de la file, après le dernier mois réservé.',
          libreMaint: 'Libre', prix6: 'De 1 à 6 mois. Vos mois s’ajoutent au bout de la file, après le dernier mois réservé.', prix1: 'Un mois à la fois, une réservation à la fois.', prixB: function(p){ return 'Avec votre nom ou anonymement : 50 $ par mois. Avec votre bannière ou le nom de votre entreprise : ' + p + ' $ par mois.'; }, bp: function(p){ return 'Avec ma bannière ou mon entreprise (' + p + ' $)'; }, occupe: 'Ce mois est déjà réservé. La prochaine réservation ouvre le',
          prixN: 'Avec votre nom ou anonymement : 50 $ par mois.',
          periode: 'Période', qui: 'Commanditaire', anonyme: 'Anonyme',
          b: { nom: 'Avec mon nom', anonyme: 'Anonyme', banniere: 'Avec ma bannière' },
          note: 'Le nom affiché est celui du paiement. Chaque bannière, une image fixe sans animation, est vérifiée avant sa mise en ligne. Refusée, elle est remboursée. Contribution au service, sans reçu d’impôt.',
          dollars: function(n){ return n.toLocaleString('fr-CA') + ' $'; },
          rang: function(n){ return n === 1 ? '1re' : n + 'e'; },
          enchere: 'Bannière d’entreprise : enchère', mois: function(a, b){ return 'Mois du ' + a + ' au ' + b + '.'; },
          depart: 'Mise de départ', ferme: 'Fermeture le', aucune: 'Aucune offre pour l’instant.', offres: 'Offres en cours',
          devant: 'La bannière passe devant les mois des particuliers pas encore commencés. Leurs mois sont décalés après, rien n’est perdu.',
          champs: { montant: 'Votre offre ($ par mois)', entreprise: 'Entreprise', nom: 'Votre nom', courriel: 'Courriel' }, offrir: 'Faire une offre',
          envoye: 'Vérifiez vos courriels : votre offre compte une fois confirmée par le lien reçu.',
          mien: function(m, p, n){ return 'Votre offre de ' + m + ' est confirmée. Vous êtes <b>' + p + '</b> sur ' + n + '.'; },
          attente: function(m){ return 'Votre offre de ' + m + ' attend votre confirmation : ouvrez le lien reçu par courriel.'; },
          fermee: 'Enchère fermée. L’offre gagnante reçoit sa facture.', minimum: function(m){ return 'L’offre minimale est de ' + m + '.'; },
          erreur: 'Offre non envoyée. Vérifiez les champs ou réessayez plus tard.',
          regles: 'Le mois de bannière se gagne aux enchères, à partir du prix de la ville. Une offre compte une fois confirmée par courriel. Vous savez tout de suite votre place. Si quelqu’un vous dépasse, un courriel vous le dit. L’enchère ferme 7 jours avant le début du mois. Une offre ne se paie pas : seule l’offre gagnante reçoit une facture.' },
    en: { reservee: 'Booked until', commanditer: 'Sponsor a month: from $50', libre: 'Next free month',
          prix: '$50 per month, 1 to 6 months. Your months are added at the end of the line, after the last booked month.',
          libreMaint: 'Available', prix6: '1 to 6 months. Your months are added at the end of the line, after the last booked month.', prix1: 'One month at a time, one booking at a time.', prixB: function(p){ return 'With your name or anonymously: $50 a month. With your banner or business name: $' + p + ' a month.'; }, bp: function(p){ return 'With my banner or business ($' + p + ')'; }, occupe: 'This month is already booked. The next booking opens on',
          prixN: 'With your name or anonymously: $50 a month.',
          periode: 'Period', qui: 'Sponsor', anonyme: 'Anonymous',
          b: { nom: 'With my name', anonyme: 'Anonymously', banniere: 'With my banner' },
          note: 'The name shown is the one used for payment. Each banner, a still image with no animation, is checked before going online. If refused, you are refunded. Contribution to the service, no tax receipt.',
          dollars: function(n){ return '$' + n.toLocaleString('en-CA'); },
          rang: function(n){ var s = n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + s; },
          enchere: 'Business banner: auction', mois: function(a, b){ return 'Month from ' + a + ' to ' + b + '.'; },
          depart: 'Starting bid', ferme: 'Closes on', aucune: 'No bids yet.', offres: 'Current bids',
          devant: 'The banner goes ahead of individuals’ months that have not started. Their months move after it, nothing is lost.',
          champs: { montant: 'Your bid ($ per month)', entreprise: 'Business', nom: 'Your name', courriel: 'Email' }, offrir: 'Place a bid',
          envoye: 'Check your email: your bid counts once you confirm it with the link you receive.',
          mien: function(m, p, n){ return 'Your bid of ' + m + ' is confirmed. You are <b>' + p + '</b> out of ' + n + '.'; },
          attente: function(m){ return 'Your bid of ' + m + ' awaits confirmation: open the link sent to your email.'; },
          fermee: 'Auction closed. The winning bid receives an invoice.', minimum: function(m){ return 'The minimum bid is ' + m + '.'; },
          erreur: 'Bid not sent. Check the fields or try again later.',
          regles: 'The banner month goes to auction, starting at the city’s price. A bid counts once confirmed by email. You see your place right away. If someone outbids you, an email tells you. The auction closes 7 days before the month starts. A bid is not paid up front: only the winning bid receives an invoice.' }
  };
  var CSS = '.apres-vente{margin:-18px 0 28px;font-size:14px}.apres-vente summary{cursor:pointer;opacity:.85}'
    + '.apres-vente p{margin:8px 0;font-size:14px;background:none;padding:0;border:0}.apres-vente table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}'
    + '.apres-vente th,.apres-vente td{text-align:left;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.35)}'
    + '.apres-vente .av-boutons{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 6px}'
    + '.apres-vente .av-bouton{display:inline-block;padding:5px 12px;font-size:13px;border:2px solid currentColor;font-weight:700;text-decoration:none;background:none;color:inherit;cursor:pointer;font-family:inherit}'
    + '.apres-vente .av-bouton:hover{opacity:.75}.apres-vente .av-note{font-size:13px;opacity:.8}'
    + '.apres-vente .av-enchere{margin:18px 0 6px;padding-top:12px;border-top:1px solid rgba(127,127,127,.35)}'
    + '.apres-vente .av-classement{margin:6px 0;padding-left:22px}.apres-vente .av-classement li{margin:2px 0}'
    + '.apres-vente .av-offre{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:10px 0}'
    + '.apres-vente .av-offre label{display:flex;flex-direction:column;gap:3px;font-size:13px}'
    + '.apres-vente .av-offre input{font:inherit;padding:6px 8px;border:1px solid rgba(127,127,127,.6);background:transparent;color:inherit}'
    + '.apres-vente .av-piege{position:absolute;left:-9999px}.apres-vente .av-msg{font-weight:700}';
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
  var iso = function(dt){ return dt.toISOString().slice(0, 10); };
  var plusJours = function(s, n){ var x = new Date(s + 'T12:00:00'); x.setDate(x.getDate() + n); return iso(x); };
  var finMois = function(s){ var x = new Date(s + 'T12:00:00'); x.setMonth(x.getMonth() + 1); x.setDate(x.getDate() - 1); return iso(x); };

  function monter(el){
    var L = lang(el), t = T[L];
    var jour = function(s){ var j = new Date(s + 'T12:00:00').toLocaleDateString(L === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }); return L === 'en' ? j : j.replace(/^1 /, '1er '); };
    var un = el.getAttribute('data-max-mois') === '1', liens = Object.assign({}, (un ? LIENS1 : LIENS)[L]);
    var pb = el.getAttribute('data-prix-banniere'), cle = pb && BANNIERE[pb + '-' + (un ? '1' : '6')];
    if(cle && cle[L]) liens.banniere = cle[L]; else pb = null;
    var ville = document.body && document.body.dataset.ville, enchere = pb && ENCHERE.indexOf(ville) > -1;
    var auj = iso(new Date());
    fetch(el.getAttribute('data-file')).then(function(r){ return r.json(); }).then(function(d){
      var p = d.periodes || [];
      var finMax = function(l){ return l.reduce(function(m, x){ return !m || x.fin > m ? x.fin : m; }, null); };
      var apres = function(f){ var x = f ? new Date(f + 'T12:00:00') : new Date(); if(f) x.setDate(x.getDate() + 1); return x < new Date() ? new Date() : x; };
      var fin = finMax(p), libre = apres(fin);
      var occupe = un && fin && fin >= auj;
      // Passe-devant (Martin, 11 nov. 2026) : une bannière passe devant les mois de particuliers pas encore commencés.
      // Seuls les mois commencés et les autres bannières la retiennent.
      var finB = finMax(p.filter(function(x){ return x.affichage === 'banniere' || x.debut <= auj; })), libreB = apres(finB);
      var occupeB = un && finB && finB >= auj;
      var moisB = (function(){
        var depart = finB ? plusJours(finB, 1) : null;
        if(depart && depart > auj && plusJours(depart, -FERMETURE) >= auj) return depart;
        var x = new Date((depart && depart > auj ? depart : auj) + 'T12:00:00'); x.setDate(1);
        do { x.setMonth(x.getMonth() + 1); } while(plusJours(iso(x), -FERMETURE) < auj);
        return iso(x);
      })();
      var devant = enchere ? moisB < iso(libre) : pb && !occupeB && iso(libreB) < iso(libre);
      var qui = function(x){ return x.affichage === 'anonyme' ? t.anonyme : esc(x.nom); };
      var bouton = function(k){ return '<a class="av-bouton" href="' + PAIEMENT + liens[k] + '" rel="noopener">' + (k === 'banniere' && pb ? t.bp(pb) : t.b[k]) + '</a>'; };
      var boutons = (occupe ? [] : ['nom', 'anonyme']).concat(enchere || (pb ? occupeB : occupe) ? [] : ['banniere']);
      var resume = fin && fin >= auj ? t.reservee + ' <b>' + jour(fin) + '</b>' : t.libreMaint;
      var champ = function(n, type, extra){ return '<label>' + t.champs[n] + '<input name="' + n + '" type="' + type + '" required ' + (extra || '') + '></label>'; };
      var html = '<details class="apres-vente"><summary>' + resume + ' · ' + t.commanditer + '</summary>'
        + (occupe ? '<p>' + t.occupe + ' <b>' + jour(iso(libre)) + '</b>.</p>'
                  : '<p>' + t.libre + ' : <b>' + jour(iso(libre)) + '</b></p><p>' + (un ? t.prix1 : (pb ? t.prix6 : t.prix)) + (enchere ? ' ' + t.prixN : pb ? ' ' + t.prixB(pb) : '') + '</p>')
        + (p.length ? '<table><tr><th>#</th><th>' + t.periode + '</th><th>' + t.qui + '</th></tr>'
          + p.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td>' + jour(x.debut) + ' → ' + jour(x.fin) + '</td><td>' + qui(x) + '</td></tr>'; }).join('') + '</table>' : '')
        + (boutons.length ? '<p class="av-boutons">' + boutons.map(function(k){ return bouton(k); }).join('') + '</p>' : '')
        + (enchere ? '<div class="av-enchere" id="enchere"><p><b>' + t.enchere + '</b>. ' + t.mois(jour(moisB), jour(finMois(moisB)))
            + ' ' + t.depart + ' : <b>' + t.dollars(+pb) + '</b>. ' + t.ferme + ' ' + jour(plusJours(moisB, -FERMETURE)) + '.</p>'
            + (devant ? '<p>' + t.devant + '</p>' : '')
            + '<p class="av-msg" aria-live="polite"></p><div class="av-liste"></div>'
            + '<form class="av-offre">' + champ('montant', 'number', 'min="' + pb + '" step="1" inputmode="numeric"') + champ('entreprise', 'text', 'maxlength="120"')
            + champ('nom', 'text', 'maxlength="120" autocomplete="name"') + champ('courriel', 'email', 'maxlength="200" autocomplete="email"')
            // Piège à robots : un nom qu'aucun navigateur ne remplit tout seul (« site_web » l'était, 11 nov. 2026).
            + '<input class="av-piege" name="av_laisser_vide" tabindex="-1" autocomplete="new-password" aria-hidden="true">'
            + '<p class="av-boutons"><button class="av-bouton" type="submit">' + t.offrir + '</button></p></form></div>' : '')
        + '<p class="av-note">' + t.note + (enchere ? ' ' + t.regles : '') + '</p></details>';
      var boite = document.createElement('div'); boite.innerHTML = html;
      var bloc = boite.firstChild; el.replaceWith(bloc);
      if(enchere) brancher(bloc, ville, moisB, +pb, L, t);
    }).catch(function(){ el.remove(); });
  }

  // L'enchère en direct : classement, place de l'offre (?enchere=<jeton> au retour du courriel), envoi d'une offre.
  function brancher(bloc, ville, mois, minimum, L, t){
    var zone = bloc.querySelector('.av-enchere'), msg = zone.querySelector('.av-msg'), liste = zone.querySelector('.av-liste'), form = zone.querySelector('form');
    var jeton = new URLSearchParams(location.search).get('enchere');
    if(jeton){ bloc.open = true; setTimeout(function(){ zone.scrollIntoView({ block: 'start' }); }, 50); }
    var charger = function(){
      return fetch(API + '?enchere=' + ville + '&mois=' + mois + (jeton ? '&jeton=' + encodeURIComponent(jeton) : ''), { cache: 'no-store' })
        .then(function(r){ return r.json(); }).then(function(d){
          if(!d.ok) return;
          liste.innerHTML = d.offres.length
            ? '<p>' + t.offres + ' :</p><ol class="av-classement">' + d.offres.map(function(m){ return '<li>' + t.dollars(m) + '</li>'; }).join('') + '</ol>'
            : '<p>' + t.aucune + '</p>';
          if(d.mien) msg.innerHTML = d.mien.confirmee && d.mien.position ? t.mien(t.dollars(d.mien.meilleur), t.rang(d.mien.position), d.offres.length) : t.attente(t.dollars(d.mien.montant));
          if(d.ferme){ form.hidden = true; msg.textContent = t.fermee; }
          var m = form.elements.montant; if(!m.value) m.value = d.offres.length ? Math.ceil(d.offres[0] * 1.1 / 5) * 5 : minimum;
        }).catch(function(){});
    };
    charger();
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var f = form.elements, montant = Math.round(+f.montant.value);
      if(!(montant >= minimum)){ msg.textContent = t.minimum(t.dollars(minimum)); return; }
      var envoi = form.querySelector('button'); envoi.disabled = true;
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'offre', ville_cle: ville, mois: mois, montant: montant, entreprise: f.entreprise.value, nom: f.nom.value,
        courriel: f.courriel.value, langue: L, page: location.origin + location.pathname, av_laisser_vide: f.av_laisser_vide.value }) })
        .then(function(r){ return r.json(); }).then(function(d){
          if(d.ok){ msg.textContent = t.envoye; form.reset(); }
          else msg.textContent = d.erreur === 'montant' ? t.minimum(t.dollars(d.minimum || minimum)) : d.erreur === 'ferme' ? t.fermee : t.erreur;
        }).catch(function(){ msg.textContent = t.erreur; }).then(function(){ envoi.disabled = false; });
    });
  }

  function demarrer(){
    var blocs = document.querySelectorAll('[data-apres-vente]'); if(!blocs.length) return;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    blocs.forEach(monter);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
