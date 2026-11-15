/* Le tableau de bord /admin (14 nov. 2026). Connexion par lien magique (le même compte que le
   site), puis un seul appel à dq_mesures_resume(jours) qui rend tout déjà compté. Si le compte
   n'est pas dans la table `admins`, la fonction refuse et la page le dit. */
(function () {
  var sb = supabase.createClient('https://wfgcqftgtmptfutrbujz.supabase.co', 'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6');
  var zone = document.getElementById('tbZone');
  var PERIODES = [[1, 'Aujourd’hui'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']];
  var jours = 7;
  try { jours = parseInt(localStorage.getItem('dq:admin-jours'), 10) || 7; } catch (e) {}
  var NOMS_VILLE = { '': 'Assemblée nationale', quebec: 'Ville de Québec', montreal: 'Ville de Montréal', levis: 'Ville de Lévis', longueuil: 'Ville de Longueuil', laval: 'Ville de Laval' };

  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var n = function (x) { return Number(x || 0).toLocaleString('fr-CA'); };
  var pluriel = function (x, un, des) { return n(x) + ' ' + (Number(x) === 1 ? un : des); };

  function connexion(message) {
    zone.innerHTML = '<div class="tb-connexion"><b>Réservé à l’équipe</b>' + (message ? '<p class="tb-erreur" style="margin:10px 0">' + h(message) + '</p>' : '') +
      '<form id="tbForm"><label for="tbCourriel">Ton courriel</label><input id="tbCourriel" type="email" required autocomplete="email" placeholder="toi@exemple.ca">' +
      '<button type="submit">Recevoir le lien de connexion</button></form><p class="tb-note" id="tbNote">Le même compte que sur le site. Un lien arrive par courriel ; clique-le et la page s’ouvre.</p></div>';
    document.getElementById('tbForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var courriel = document.getElementById('tbCourriel').value.trim();
      var note = document.getElementById('tbNote');
      note.textContent = 'Envoi…';
      var r = await sb.auth.signInWithOtp({ email: courriel, options: { emailRedirectTo: location.origin + '/admin' } });
      note.textContent = r.error ? 'Pas envoyé : ' + r.error.message : 'Lien envoyé. Regarde ton courriel (et les indésirables).';
    });
  }

  function tableau(titre, aide, lignes, rendu, large) {
    var max = lignes.length ? Math.max.apply(null, lignes.map(function (l) { return l.n; })) : 0;
    return '<section class="tb-carte' + (large ? ' large' : '') + '"><h2>' + h(titre) + '</h2><p class="aide">' + h(aide) + '</p>' +
      (lignes.length ? '<table class="tb-table"><tbody>' + lignes.map(function (l) {
        return '<tr><td>' + rendu(l) + '<span class="tb-barre" style="width:' + (max ? Math.max(2, Math.round(100 * l.n / max)) : 0) + '%"></span></td><td>' + n(l.n) + (l.detail ? '<span class="petit">' + h(l.detail) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="tb-vide">Rien encore pour cette période.</p>') + '</section>';
  }

  function jourCourt(j) { var d = new Date(j + 'T12:00:00'); return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); }

  function rendre(r) {
    var parJour = r.par_jour || [];
    var maxJour = parJour.length ? Math.max.apply(null, parJour.map(function (j) { return j.pages; })) : 0;
    var html = '<button class="tb-sortir" id="tbSortir">Se déconnecter</button>' +
      '<div class="tb-periodes">' + PERIODES.map(function (p) { return '<button type="button" data-jours="' + p[0] + '" aria-pressed="' + (p[0] === jours) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="tb-chiffres">' +
        '<div class="tb-chiffre"><b>' + n(r.visites) + '</b><span>visites (une personne, un passage)</span></div>' +
        '<div class="tb-chiffre"><b>' + n(r.pages_vues) + '</b><span>pages vues</span></div>' +
        '<div class="tb-chiffre"><b>' + n(r.clics) + '</b><span>clics sur un bouton ou un lien</span></div>' +
        '<div class="tb-chiffre"><b>' + (r.visites ? (r.pages_vues / r.visites).toFixed(1).replace('.', ',') : '0') + '</b><span>pages par visite</span></div>' +
      '</div>';

    if (jours > 1) {
      html += '<section class="tb-carte large" style="margin-bottom:18px"><h2>Jour par jour</h2><p class="aide">Pages vues chaque jour, heure de Montréal. Passe la souris pour le chiffre.</p>' +
        (parJour.length ? '<div class="tb-jours">' + parJour.map(function (j) {
          return '<div class="tb-jour" style="height:' + (maxJour ? Math.max(2, Math.round(100 * j.pages / maxJour)) : 2) + '%"><i>' + jourCourt(j.jour) + ' · ' + pluriel(j.pages, 'page', 'pages') + ' · ' + pluriel(j.visites, 'visite', 'visites') + '</i></div>';
        }).join('') + '</div><div class="tb-axe"><span>' + jourCourt(parJour[0].jour) + '</span><span>' + jourCourt(parJour[parJour.length - 1].jour) + '</span></div>' : '<p class="tb-vide">Rien encore.</p>') + '</section>';
    }

    html += '<div class="tb-grille">' +
      tableau('Villes populaires', 'Où les gens vont, par volet. Le chiffre est le nombre de pages vues ; en dessous, les visites.',
        (r.par_ville || []).map(function (v) { return { n: v.pages, detail: pluriel(v.visites, 'visite', 'visites'), v: v }; }),
        function (l) { return '<b>' + h(NOMS_VILLE[l.v.ville] || l.v.ville) + '</b>'; }) +
      tableau('D’où ils arrivent', 'Le site qui les a envoyés, ou « direct » (adresse tapée, favori, courriel). Compté en visites.',
        (r.par_provenance || []).filter(function (p) { return p.provenance; }).map(function (p) { return { n: p.visites, p: p }; }),
        function (l) { return h(l.p.provenance); }) +
      tableau('Pages populaires', 'Les 40 pages les plus vues. Le titre, puis l’adresse.',
        (r.par_page || []).map(function (p) { return { n: p.pages, detail: pluriel(p.visites, 'visite', 'visites'), p: p }; }),
        function (l) { return '<b>' + h(l.p.titre || l.p.page) + '</b><span class="petit">' + h(l.p.page) + '</span>'; }, true) +
      tableau('Boutons populaires', 'Sur quoi ils pèsent : les 40 boutons et liens les plus cliqués. « ↗ » = un lien qui sort du site ; « → » = vers quelle page.',
        (r.par_cible || []).map(function (c) { return { n: c.clics, c: c }; }),
        function (l) { return h(l.c.cible) + '<span class="petit">depuis ' + h(l.c.page) + '</span>'; }, true) +
      '</div>' +
      '<p class="tb-note">Langues : ' + (r.par_langue || []).map(function (l) { return (l.langue === 'en' ? 'anglais' : 'français') + ' ' + n(l.pages); }).join(' · ') + '. Les lignes de plus de 90 jours sont effacées à chaque ouverture de cette page. Google Analytics et Vercel Analytics continuent de compter à côté.</p>';
    zone.innerHTML = html;
    zone.querySelectorAll('.tb-periodes button').forEach(function (b) { b.addEventListener('click', function () { jours = parseInt(b.dataset.jours, 10); try { localStorage.setItem('dq:admin-jours', String(jours)); } catch (e) {} charger(); }); });
    document.getElementById('tbSortir').addEventListener('click', async function () { await sb.auth.signOut(); connexion(); });
  }

  async function charger() {
    zone.innerHTML = '<p class="tb-vide">Chargement…</p>';
    var r = await sb.rpc('dq_mesures_resume', { jours: jours });
    if (r.error) {
      var m = r.error.message || '';
      if (/réservé aux admins|42501|permission denied/i.test(m)) { await sb.auth.signOut(); return connexion('Ce compte n’est pas dans la liste des admins.'); }
      if (/function .*dq_mesures_resume|does not exist|PGRST202/i.test(m)) { zone.innerHTML = '<p class="tb-erreur">La fonction dq_mesures_resume n’existe pas encore : colle scripts/supabase-dq-mesures.sql dans Supabase (SQL Editor → Run).</p>'; return; }
      zone.innerHTML = '<p class="tb-erreur">Pas pu lire : ' + h(m) + '</p>';
      return;
    }
    rendre(r.data || {});
  }

  sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN') { if (session) charger(); else connexion(); }
    if (ev === 'SIGNED_OUT') connexion();
  });
})();
