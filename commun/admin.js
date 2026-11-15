/* Le tableau de bord /admin (14 nov. 2026, redessiné le 15). Connexion par lien magique (le même
   compte que le site), puis un seul appel à dq_mesures_resume(jours) qui rend tout déjà compté. Si
   le compte n'est pas dans la table `admins`, la fonction refuse et la page le dit.
   En local seulement, /admin?demo=1 affiche des chiffres inventés pour voir le design. */
(function () {
  var sb = supabase.createClient('https://wfgcqftgtmptfutrbujz.supabase.co', 'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6');
  var zone = document.getElementById('tbZone');
  var sortir = document.getElementById('tbSortir');
  var PERIODES = [[1, 'Aujourd’hui'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']];
  var jours = 7;
  try { jours = parseInt(localStorage.getItem('dq:admin-jours'), 10) || 7; } catch (e) {}
  var NOMS_VILLE = { '': 'Assemblée nationale', quebec: 'Ville de Québec', montreal: 'Ville de Montréal', levis: 'Ville de Lévis', longueuil: 'Ville de Longueuil', laval: 'Ville de Laval' };
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]demo=1/.test(location.search);
  var ouverts = {};

  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var n = function (x) { return Number(x || 0).toLocaleString('fr-CA'); };
  var pluriel = function (x, un, des) { return n(x) + ' ' + (Number(x) === 1 ? un : des); };
  var titreCourt = function (t) { return String(t || '').replace(/\s*[—|-]\s*DossierQuébec\s*$/, ''); };

  function connexion(message) {
    sortir.hidden = true;
    zone.innerHTML = '<div class="tb-connexion"><h2>Tableau de bord</h2><p class="tb-note" style="margin:0">Réservé à l’équipe de DossierQuébec.</p>' +
      (message ? '<p class="tb-erreur" style="margin:14px 0 0">' + h(message) + '</p>' : '') +
      '<form id="tbForm"><label for="tbCourriel">Ton courriel</label><input id="tbCourriel" type="email" required autocomplete="email" placeholder="toi@exemple.ca">' +
      '<button type="submit">Recevoir le lien de connexion</button></form><p class="tb-note" id="tbNote">Le même compte que sur le site. Un lien arrive par courriel : clique-le et le tableau s’ouvre.</p></div>';
    document.getElementById('tbForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var courriel = document.getElementById('tbCourriel').value.trim();
      var note = document.getElementById('tbNote');
      note.textContent = 'Envoi…';
      var r = await sb.auth.signInWithOtp({ email: courriel, options: { emailRedirectTo: location.origin + '/admin' } });
      note.textContent = r.error ? 'Pas envoyé : ' + r.error.message : 'Lien envoyé. Regarde ton courriel (et les indésirables).';
    });
  }

  function titre(num, texte, aide) {
    return '<div class="tb-titre"><span class="num">' + num + '</span><h2>' + h(texte) + '</h2>' + (aide ? '<p>' + h(aide) + '</p>' : '') + '</div>';
  }

  // Une liste classée : rang, nom (+ sous-ligne), barre proportionnelle, valeur (+ sous-valeur).
  function liste(cle, lignes, montrer) {
    if (!lignes.length) return '<p class="tb-vide">Rien encore pour cette période.</p>';
    var max = Math.max.apply(null, lignes.map(function (l) { return l.n; })) || 1;
    var tout = ouverts[cle];
    var vues = tout ? lignes : lignes.slice(0, montrer);
    return '<ol class="tb-liste">' + vues.map(function (l, i) {
      return '<li>' + (l.sansRang ? '' : '<span class="tb-rang">' + String(i + 1).padStart(2, '0') + '</span>') +
        '<div class="tb-nom"><b title="' + h(l.nom) + '">' + h(l.nom) + '</b>' + (l.sous ? '<small title="' + h(l.sous) + '">' + h(l.sous) + '</small>' : '') +
        '<span class="tb-barre"><s style="width:' + Math.max(2, Math.round(100 * l.n / max)) + '%"></s></span></div>' +
        '<div class="tb-val">' + n(l.n) + (l.detail ? '<small>' + h(l.detail) + '</small>' : '') + '</div></li>';
    }).join('') + '</ol>' +
    (lignes.length > montrer ? '<button class="tb-plus" data-plus="' + cle + '">' + (tout ? 'Voir moins' : 'Voir les ' + lignes.length) + '</button>' : '');
  }

  function jourCourt(j) { var d = new Date(j + 'T12:00:00'); return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); }

  var dernier = null;
  function rendre(r) {
    dernier = r;
    sortir.hidden = DEMO;
    var parJour = r.par_jour || [];
    var maxJour = parJour.length ? Math.max.apply(null, parJour.map(function (j) { return j.pages; })) : 0;
    var nomPeriode = (PERIODES.filter(function (p) { return p[0] === jours; })[0] || [0, ''])[1].toLowerCase();

    var html = '<div class="tb-tete"><div><h1>Tableau de bord</h1><p>Où vont les gens et sur quoi ils pèsent, ' + (jours === 1 ? 'aujourd’hui' : 'ces ' + nomPeriode) + '. Site de l’Assemblée et volets de ville. Aucune donnée personnelle.</p></div>' +
      '<div class="tb-periodes" role="group" aria-label="Période">' + PERIODES.map(function (p) { return '<button type="button" data-jours="' + p[0] + '" aria-pressed="' + (p[0] === jours) + '">' + p[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="tb-chiffres">' +
        '<div class="tb-chiffre"><b>' + n(r.visites) + '</b><span>Visites</span></div>' +
        '<div class="tb-chiffre"><b>' + n(r.pages_vues) + '</b><span>Pages vues</span></div>' +
        '<div class="tb-chiffre"><b>' + n(r.clics) + '</b><span>Clics</span></div>' +
        '<div class="tb-chiffre"><b>' + (r.visites ? (r.pages_vues / r.visites).toFixed(1).replace('.', ',') : '0') + '</b><span>Pages par visite</span></div>' +
      '</div>';

    if (jours > 1) {
      html += '<section class="tb-bloc">' + titre('01', 'Jour par jour', 'Pages vues chaque jour, heure de Montréal. Survole une barre pour le chiffre.') +
        (parJour.length ? '<div class="tb-courbe"><div class="tb-jours">' + parJour.map(function (j) {
          return '<div class="tb-jour"><s style="height:' + (maxJour ? Math.max(2, Math.round(100 * j.pages / maxJour)) : 2) + '%"></s><i>' + jourCourt(j.jour) + ' · ' + pluriel(j.pages, 'page', 'pages') + ' · ' + pluriel(j.visites, 'visite', 'visites') + '</i></div>';
        }).join('') + '</div><div class="tb-axe"><span>' + jourCourt(parJour[0].jour) + '</span><span>' + jourCourt(parJour[parJour.length - 1].jour) + '</span></div></div>' : '<p class="tb-vide">Rien encore.</p>') + '</section>';
    }

    var villes = (r.par_ville || []).map(function (v) { return { nom: NOMS_VILLE[v.ville] || v.ville, n: v.pages, detail: pluriel(v.visites, 'visite', 'visites'), sansRang: true }; });
    var provs = (r.par_provenance || []).filter(function (p) { return p.provenance; }).map(function (p) { return { nom: p.provenance === 'direct' ? 'Direct (adresse, favori, courriel)' : p.provenance, n: p.visites, detail: 'visites' }; });
    var pages = (r.par_page || []).map(function (p) { return { nom: titreCourt(p.titre) || p.page, sous: p.page, n: p.pages, detail: pluriel(p.visites, 'visite', 'visites') }; });
    var cibles = (r.par_cible || []).map(function (c) { return { nom: c.cible, sous: 'depuis ' + c.page, n: c.clics, detail: 'clics' }; });

    html += '<div class="tb-deux">' +
      '<section class="tb-bloc tb-villes">' + titre(jours > 1 ? '02' : '01', 'Villes', 'Pages vues par volet.') + liste('villes', villes, 10) + '</section>' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '03' : '02', 'D’où ils arrivent', 'Le site qui les envoie.') + liste('provs', provs, 6) + '</section>' +
      '</div>' +
      '<div class="tb-deux">' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '04' : '03', 'Pages populaires', 'Les plus vues.') + liste('pages', pages, 10) + '</section>' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '05' : '04', 'Boutons populaires', '↗ sort du site · → mène à une page.') + liste('cibles', cibles, 10) + '</section>' +
      '</div>' +
      '<p class="tb-pied"><span class="tb-langues">' + (r.par_langue || []).map(function (l) { return '<b>' + (l.langue === 'en' ? 'EN' : 'FR') + ' ' + n(l.pages) + '</b>'; }).join('') + '</span>' +
      'Les lignes de plus de 90 jours s’effacent à chaque ouverture. Google Analytics et Vercel comptent à côté.</p>';

    zone.innerHTML = html;
    zone.querySelectorAll('[data-jours]').forEach(function (b) { b.addEventListener('click', function () { jours = parseInt(b.dataset.jours, 10); try { localStorage.setItem('dq:admin-jours', String(jours)); } catch (e) {} charger(); }); });
    zone.querySelectorAll('[data-plus]').forEach(function (b) { b.addEventListener('click', function () { ouverts[b.dataset.plus] = !ouverts[b.dataset.plus]; rendre(dernier); }); });
  }

  function demo() {
    var parJour = [];
    for (var i = jours - 1; i >= 0; i--) { var d = new Date(Date.now() - i * 864e5); var p = 180 + Math.round(120 * Math.sin(i / 2) + Math.random() * 90); parJour.push({ jour: d.toISOString().slice(0, 10), pages: p, visites: Math.round(p / 2.6) }); }
    var k = Math.max(1, jours);
    return {
      visites: 412 * k, pages_vues: 1088 * k, clics: 640 * k, par_jour: parJour,
      par_ville: [{ ville: '', pages: 620 * k, visites: 240 * k }, { ville: 'quebec', pages: 210 * k, visites: 80 * k }, { ville: 'montreal', pages: 160 * k, visites: 60 * k }, { ville: 'levis', pages: 58 * k, visites: 20 * k }, { ville: 'laval', pages: 22 * k, visites: 8 * k }, { ville: 'longueuil', pages: 18 * k, visites: 6 * k }],
      par_provenance: [{ provenance: 'google.com', visites: 220 * k }, { provenance: 'direct', visites: 120 * k }, { provenance: 'facebook.com', visites: 40 * k }, { provenance: 'agentquebec.ca', visites: 18 * k }, { provenance: 'bing.com', visites: 9 * k }, { provenance: 'linkedin.com', visites: 4 * k }, { provenance: 'duckduckgo.com', visites: 3 * k }],
      par_page: [['/', 'L’Assemblée nationale du Québec en clair — DossierQuébec', 300], ['/projets-de-loi', 'Projets de loi — DossierQuébec', 180], ['/quebec/', 'Ville de Québec en clair — DossierQuébec', 120], ['/ministres', 'Ministres — DossierQuébec', 95], ['/montreal/decisions-de-la-ville-de-montreal', 'Décisions de la Ville de Montréal — DossierQuébec', 80], ['/projets-de-loi/1-43-2', 'Projet de loi 1 : Loi constitutionnelle de 2025 sur le Québec — DossierQuébec', 64], ['/votes', 'Votes — DossierQuébec', 50], ['/ministres/paul-st-pierre-plamondon', 'Paul St-Pierre Plamondon — DossierQuébec', 41], ['/promesses', 'Promesses — DossierQuébec', 33], ['/levis/', 'Ville de Lévis en clair — DossierQuébec', 28], ['/lexique', 'Lexique — DossierQuébec', 20], ['/mon-dossier', 'Mon dossier — DossierQuébec', 14]].map(function (a) { return { page: a[0], titre: a[1], pages: a[2] * k, visites: Math.round(a[2] * k / 1.7) }; }),
      par_cible: [['02Ministres → /ministres', '/', 120], ['Suivre', '/projets-de-loi/1-43-2', 70], ['Télécharger le PDF', '/quebec/', 52], ['EN', '/', 40], ['Projets de loi → /projets-de-loi', '/', 38], ['↗ assnat.qc.ca · Texte officiel', '/projets-de-loi/1-43-2', 30], ['Passer au thème sombre', '/', 22], ['Challenge', '/projets-de-loi', 18], ['Voir la séance → /quebec/decisions-de-la-ville-de-quebec', '/quebec/', 15], ['Mon dossier → /mon-dossier', '/', 12], ['Filtrer par parti', '/votes', 9]].map(function (a) { return { cible: a[0], page: a[1], clics: a[2] * k }; }),
      par_langue: [{ langue: 'fr', pages: 990 * k }, { langue: 'en', pages: 98 * k }]
    };
  }

  async function charger() {
    zone.innerHTML = '<p class="tb-charge">Chargement…</p>';
    if (DEMO) return rendre(demo());
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

  sortir.addEventListener('click', async function () { await sb.auth.signOut(); connexion(); });
  if (DEMO) { charger(); return; }
  sb.auth.onAuthStateChange(function (ev, session) {
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN') { if (session) charger(); else connexion(); }
    if (ev === 'SIGNED_OUT') connexion();
  });
})();
