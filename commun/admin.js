/* Le tableau de bord /admin (14 nov. 2026, redessiné le 15). Connexion par lien magique (le même
   compte que le site), puis un seul appel à dq_mesures_resume(jours) qui rend tout déjà compté. Si
   le compte n'est pas dans la table `admins`, la fonction refuse et la page le dit.
   En local seulement, /admin?demo=1 affiche des chiffres inventés pour voir le design. */
(function () {
  var sb = supabase.createClient('https://wfgcqftgtmptfutrbujz.supabase.co', 'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6');
  var zone = document.getElementById('tbZone');
  var sortir = document.getElementById('tbSortir');
  var SITES_FILTRE = [['', 'Tous les sites'], ['dq', 'DossierQuébec'], ['dossiercanada.ca', 'DossierCanada'], ['dossierontario.ca', 'DossierOntario'], ['dossiersaskatchewan.ca', 'DossierSaskatchewan'], ['dossiernbrunswick.ca', 'DossierNBrunswick'], ['dossierbc.ca', 'DossierBC']];
  var site = '';
  try { site = localStorage.getItem('dq:admin-site') || ''; } catch (e) {}
  var PERIODES = [[1, 'Aujourd’hui'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']];
  var jours = 7;
  try { jours = parseInt(localStorage.getItem('dq:admin-jours'), 10) || 7; } catch (e) {}
  var NOMS_VILLE = { '': 'Assemblée nationale', quebec: 'Ville de Québec', montreal: 'Ville de Montréal', levis: 'Ville de Lévis', longueuil: 'Ville de Longueuil', laval: 'Ville de Laval', canada: 'DossierCanada', ontario: 'DossierOntario', 'ontario-ottawa': 'Ontario · Ottawa', saskatchewan: 'DossierSaskatchewan', nbrunswick: 'DossierNBrunswick', 'nbrunswick-fredericton': 'N.-B. · Fredericton', bc: 'DossierBC', 'bc-vancouver': 'BC · Vancouver' };
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]demo=1/.test(location.search);
  var ouverts = {};
  var onglets = document.getElementById('tbOnglets');
  var onglet = 'trafic';
  try { var o0 = localStorage.getItem('dq:admin-onglet'); if (o0 === 'rtv' || o0 === 'villes') onglet = o0; } catch (e) {}
  function montrerOnglets() {
    onglets.hidden = false;
    onglets.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.onglet === onglet)); });
  }
  onglets.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { onglet = b.dataset.onglet; try { localStorage.setItem('dq:admin-onglet', onglet); } catch (e) {} charger(); });
  });

  var h = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var n = function (x) { return Number(x || 0).toLocaleString('fr-CA'); };
  var pluriel = function (x, un, des) { return n(x) + ' ' + (Number(x) === 1 ? un : des); };
  var titreCourt = function (t) { return String(t || '').replace(/\s*[—|-]\s*DossierQuébec\s*$/, ''); };

  function connexion(message) {
    sortir.hidden = true;
    onglets.hidden = true;
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
        '<div class="tb-val">' + n(l.n) + (l.detail ? '<small>' + h(l.detail) + '</small>' : '') + (l.lien ? '<a class="tb-go" href="' + h(l.lien.charAt(0) === '/' ? l.lien : 'https://' + l.lien) + '" target="_blank" rel="noopener" title="Ouvrir la page">Ouvrir ↗</a>' : '') + '</div></li>';
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

    var html = '<div class="tb-tete"><div><h1>Tableau de bord</h1><p>Où vont les gens et sur quoi ils pèsent, ' + (jours === 1 ? 'aujourd’hui' : 'ces ' + nomPeriode) + '. Tous les sites Dossier et leurs volets de ville. Aucune donnée personnelle.</p></div>' +
      '<div class="tb-filtres"><select class="tb-site" aria-label="Site">' + SITES_FILTRE.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === site ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<div class="tb-periodes" role="group" aria-label="Période">' + PERIODES.map(function (p) { return '<button type="button" data-jours="' + p[0] + '" aria-pressed="' + (p[0] === jours) + '">' + p[1] + '</button>'; }).join('') + '</div></div></div>' +
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
    var pages = (r.par_page || []).map(function (p) { return { nom: titreCourt(p.titre) || p.page, sous: p.page, lien: p.page, n: p.pages, detail: pluriel(p.visites, 'visite', 'visites') }; });
    var cibles = (r.par_cible || []).map(function (c) { return { nom: c.cible, sous: 'depuis ' + c.page, lien: c.page, n: c.clics, detail: 'clics' }; });

    html += '<div class="tb-deux">' +
      '<section class="tb-bloc tb-villes">' + titre(jours > 1 ? '02' : '01', 'Sites et villes', 'Pages vues par site et par volet.') + liste('villes', villes, 10) + '</section>' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '03' : '02', 'D’où ils arrivent', 'Le site qui les envoie.') + liste('provs', provs, 6) + '</section>' +
      '</div>' +
      '<div class="tb-deux">' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '04' : '03', 'Pages populaires', 'Les plus vues.') + liste('pages', pages, 10) + '</section>' +
      '<section class="tb-bloc">' + titre(jours > 1 ? '05' : '04', 'Boutons populaires', '↗ sort du site · → mène à une page.') + liste('cibles', cibles, 10) + '</section>' +
      '</div>' +
      '<p class="tb-pied"><span class="tb-langues">' + (r.par_langue || []).map(function (l) { return '<b>' + (l.langue === 'en' ? 'EN' : 'FR') + ' ' + n(l.pages) + '</b>'; }).join('') + '</span>' +
      'Les lignes de plus de 90 jours s’effacent à chaque ouverture. Google Analytics et Vercel comptent à côté.</p>';

    zone.innerHTML = html;
    var choixSite = zone.querySelector('.tb-site');
    if (choixSite) choixSite.addEventListener('change', function () { site = choixSite.value; try { localStorage.setItem('dq:admin-site', site); } catch (e) {} charger(); });
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

  // ---------- Onglet « Représentez votre ville » (déménagé du Lexique le 15 nov. 2026) ----------
  // Les demandes du formulaire /represente-ta-ville (rtv_demandes), les enchères de bannière
  // (rtv_encheres) et les visites de la page (rtv_visites, 30 jours). Mêmes tables et mêmes règles
  // qu'avant : lecture et statut permis aux admins seulement.
  var voirArchives = false;
  var PROFILS = { citoyen: 'Citoyen·ne', organisme: 'Organisme', entreprise: 'Entreprise' };
  var dollars = function (x) { return Number(x).toLocaleString('fr-CA') + ' $'; };
  var jourLong = function (s) { return new Date(s + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1er '); };
  var quand = function (s) { return s ? new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
  function grouper(liste, cle) { var m = new Map(); liste.forEach(function (x) { var k = cle(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; }

  function blocDemandes(res) {
    if (res.error) return '<p class="tb-erreur">Les demandes n’ont pas pu être lues : ' + h(res.error.message) + '</p>';
    var data = res.data || [];
    var villes = Array.from(grouper(data, function (d) { return d.ville_cle; }).values()).sort(function (a, b) { return b.length - a.length || a[0].ville.localeCompare(b[0].ville, 'fr'); });
    var outil = '<button class="tb-btn" data-rtv="archives">' + (voirArchives ? 'Cacher les archivées' : 'Voir les archivées') + '</button>';
    if (!data.length) return '<p class="tb-vide">Aucune demande pour l’instant.</p><p style="margin-top:10px">' + outil + '</p>';
    return villes.map(function (liste) {
      var ent = liste.filter(function (d) { return d.profil === 'entreprise'; }).length;
      var nouv = liste.filter(function (d) { return d.statut === 'nouvelle'; }).length;
      return '<div class="tb-groupe"><h3>' + h(liste[0].ville) + ' <span class="tb-pastille">' + pluriel(liste.length, 'demande', 'demandes') + '</span>' +
        (ent ? '<span class="tb-pastille jaune">💼 ' + pluriel(ent, 'entreprise', 'entreprises') + '</span>' : '') +
        (nouv ? '<span class="tb-pastille bleu">' + pluriel(nouv, 'nouvelle', 'nouvelles') + '</span>' : '') + '</h3><div class="tb-cartes">' +
        liste.map(function (d) {
          var sujet = encodeURIComponent('Dossier Québec — ' + d.ville);
          var actions = (d.statut !== 'repondue' ? '<button class="tb-btn plein" data-statut="repondue" data-id="' + h(d.id) + '">Répondue</button>' : '') +
            (d.statut !== 'archivee' ? '<button class="tb-btn" data-statut="archivee" data-id="' + h(d.id) + '">Archiver</button>' : '<button class="tb-btn" data-statut="nouvelle" data-id="' + h(d.id) + '">Ressortir</button>');
          return '<article class="tb-dem ' + h(d.statut) + '"><div class="tb-dem-qui"><b>' + h(d.nom) + '</b> · ' + (d.profil === 'entreprise' ? '<b>💼 Entreprise</b>' : h(PROFILS[d.profil] || d.profil)) +
            '<small><a href="mailto:' + h(d.courriel) + '?subject=' + sujet + '">' + h(d.courriel) + '</a></small>' +
            '<span class="tb-dem-meta">' + h(quand(d.created_at)) + ' · ' + (d.statut === 'nouvelle' ? 'nouvelle' : d.statut === 'repondue' ? 'répondue' : 'archivée') + (d.provenance ? ' · arrivé·e par ' + h(d.provenance) : '') + '</span></div>' +
            '<div class="tb-dem-actions">' + actions + '</div>' +
            '<div class="tb-dem-msg">' + (h(d.message) || '—') + '</div></article>';
        }).join('') + '</div></div>';
    }).join('') + '<p>' + outil + '</p>';
  }

  // Classement des offres confirmées : meilleure offre par courriel, la première confirmée passe
  // devant à égalité (comme api/_enchere.js) ; les offres pas encore confirmées en pâle.
  function blocEncheres(res) {
    if (res.error) return '<p class="tb-erreur">Les offres n’ont pas pu être lues : ' + h(res.error.message) + '</p>';
    var data = res.data || [];
    if (!data.length) return '<p class="tb-vide">Aucune offre pour l’instant.</p>';
    var auj = new Date().toISOString().slice(0, 10);
    var fermeture = function (m) { var d = new Date(m + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); };
    var villes = Array.from(grouper(data, function (o) { return o.ville_cle; }).values()).sort(function (a, b) { return a[0].ville.localeCompare(b[0].ville, 'fr'); });
    return villes.map(function (lv) {
      return '<div class="tb-groupe"><h3>' + h(lv[0].ville) + '</h3>' + Array.from(grouper(lv, function (o) { return o.mois_debut; })).map(function (e) {
        var mois = e[0], liste = e[1];
        var conf = liste.filter(function (o) { return o.confirmee_at; }).sort(function (a, b) { return b.montant - a.montant || String(a.confirmee_at).localeCompare(String(b.confirmee_at)); });
        var rang = new Map(), vus = new Set();
        conf.forEach(function (o) { var c = o.courriel.toLowerCase(); if (!vus.has(c)) { vus.add(c); rang.set(o, vus.size); } });
        var f = fermeture(mois), ferme = auj > f;
        return '<p class="tb-mois">Du ' + jourLong(mois) + ' au ' + jourLong(liste[0].mois_fin) + ' · ' + (ferme ? '<b>fermée</b> le ' : 'ferme le ') + jourLong(f) + ' · ' + pluriel(vus.size, 'enchérisseur', 'enchérisseurs') + '</p>' +
          '<div class="tb-defile"><table class="tb-tab"><thead><tr><th>Rang</th><th>Offre</th><th>Entreprise</th><th>Qui</th><th>Confirmée</th></tr></thead><tbody>' +
          conf.concat(liste.filter(function (o) { return !o.confirmee_at; })).map(function (o) {
            var r = rang.get(o);
            return '<tr class="' + (r === 1 ? 'gagne' : (!o.confirmee_at ? 'pale' : '')) + '"><td>' + (r ? (r === 1 ? '<b>1</b>' : r) : '—') + '</td><td><b>' + dollars(o.montant) + '</b></td><td>' + h(o.entreprise) + '</td>' +
              '<td>' + h(o.nom) + '<br><a href="mailto:' + h(o.courriel) + '">' + h(o.courriel) + '</a></td>' +
              '<td>' + (o.confirmee_at ? h(quand(o.confirmee_at)) : 'pas confirmée') + (!r && o.confirmee_at ? '<br><small>remplacée par une offre plus haute</small>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function blocVisites(res) {
    if (res.error) return '<p class="tb-erreur">Les visites n’ont pas pu être lues : ' + h(res.error.message) + '</p>';
    var data = res.data || [];
    var compter = function (cle) { var m = new Map(); data.forEach(function (v) { var k = cle(v); if (k) m.set(k, (m.get(k) || 0) + 1); }); return Array.from(m); };
    var sources = compter(function (v) { return v.source + (v.campagne ? ' [' + v.campagne + ']' : ''); }).sort(function (a, b) { return b[1] - a[1]; }).map(function (a) { return { nom: a[0] === 'direct' ? 'Direct' : a[0], n: a[1] }; });
    var pages = compter(function (v) { return v.page_interne; }).sort(function (a, b) { return b[1] - a[1]; }).map(function (a) { return { nom: a[0], n: a[1] }; });
    var parJour = compter(function (v) { return String(v.created_at).slice(0, 10); }).sort(function (a, b) { return a[0].localeCompare(b[0]); });
    var max = parJour.length ? Math.max.apply(null, parJour.map(function (j) { return j[1]; })) : 0;
    return '<div class="tb-chiffres" style="grid-template-columns:1fr; max-width:320px; margin-bottom:22px"><div class="tb-chiffre"><b>' + n(data.length) + '</b><span>Visites en 30 jours, une par session</span></div></div>' +
      (parJour.length ? '<section class="tb-bloc"><div class="tb-courbe"><div class="tb-jours" style="height:120px">' + parJour.map(function (j) {
        return '<div class="tb-jour"><s style="height:' + Math.max(3, Math.round(100 * j[1] / max)) + '%"></s><i>' + jourCourt(j[0]) + ' · ' + pluriel(j[1], 'visite', 'visites') + '</i></div>';
      }).join('') + '</div><div class="tb-axe"><span>' + jourCourt(parJour[0][0]) + '</span><span>' + jourCourt(parJour[parJour.length - 1][0]) + '</span></div></div></section>' : '') +
      '<div class="tb-deux"><section class="tb-bloc">' + titre('', 'D’où on arrive', 'Entre crochets : la province du site d’origine.') + liste('rtv-src', sources, 8) + '</section>' +
      '<section class="tb-bloc">' + titre('', 'Depuis quelle page de DQ', '') + liste('rtv-pages', pages, 8) + '</section></div>';
  }

  var rtvDernier = null;
  function rendreRtv(d) {
    rtvDernier = d;
    var nouv = ((d.demandes.data) || []).filter(function (x) { return x.statut === 'nouvelle'; }).length;
    zone.innerHTML = '<div class="tb-tete"><div><h1>Représentez votre ville</h1><p>Les demandes du formulaire, les enchères de bannière et les visites de /represente-ta-ville. Clique l’adresse pour répondre, puis « Répondue ».</p></div></div>' +
      '<section class="tb-bloc">' + titre('01', 'Demandes', nouv ? pluriel(nouv, 'nouvelle', 'nouvelles') + ' à traiter.' : 'Par ville, la plus demandée d’abord.') + blocDemandes(d.demandes) + '</section>' +
      '<section class="tb-bloc">' + titre('02', 'Enchères de bannière', 'Le rang 1 gagne à la fermeture : lui envoyer la facture GHL.') + blocEncheres(d.encheres) + '</section>' +
      '<section class="tb-bloc">' + titre('03', 'Visites de la page', '30 derniers jours.') + blocVisites(d.visites) + '</section>';
    zone.querySelectorAll('[data-statut]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        if (!DEMO) { var r = await sb.from('rtv_demandes').update({ statut: b.dataset.statut }).eq('id', b.dataset.id); if (r.error) { alert('Pas enregistré : ' + r.error.message); b.disabled = false; return; } }
        chargerRtv();
      });
    });
    zone.querySelectorAll('[data-rtv="archives"]').forEach(function (b) { b.addEventListener('click', function () { voirArchives = !voirArchives; chargerRtv(); }); });
    zone.querySelectorAll('[data-plus]').forEach(function (b) { b.addEventListener('click', function () { ouverts[b.dataset.plus] = !ouverts[b.dataset.plus]; rendreRtv(rtvDernier); }); });
  }

  function demoRtv() {
    var il = function (j) { return new Date(Date.now() - j * 864e5).toISOString(); };
    var visites = [];
    [['dossierquebec.ca', '', '/', 18], ['facebook.com', '', '/montreal/', 4], ['direct', 'nb', '/', 4], ['direct', '', '/levis/', 3], ['dossiernbrunswick.ca', 'nb', '', 2], ['dossiersaskatchewan.ca', 'sk', '', 2]].forEach(function (a) { for (var i = 0; i < a[3]; i++) visites.push({ created_at: il(i % 6), source: a[0], campagne: a[1], page_interne: a[2] }); });
    return {
      demandes: { data: [
        { id: '1', created_at: il(0), ville: 'Sherbrooke', ville_cle: 'sherbrooke', nom: 'Marie Tremblay', courriel: 'marie@exemple.ca', profil: 'citoyen', message: 'J’aimerais voir les décisions du conseil de Sherbrooke.', statut: 'nouvelle', provenance: 'facebook.com' },
        { id: '2', created_at: il(1), ville: 'Sherbrooke', ville_cle: 'sherbrooke', nom: 'Quincaillerie Fortin', courriel: 'info@exemple.ca', profil: 'entreprise', message: 'Intéressés à commanditer le volet.', statut: 'nouvelle', provenance: '' },
        { id: '3', created_at: il(3), ville: 'Gatineau', ville_cle: 'gatineau', nom: 'Luc Gagnon', courriel: 'luc@exemple.ca', profil: 'organisme', message: '', statut: 'repondue', provenance: 'dossierquebec.ca' }] },
      encheres: { data: [
        { ville: 'Ville de Québec', ville_cle: 'quebec', mois_debut: '2026-12-01', mois_fin: '2026-12-31', montant: 350, nom: 'Paul Roy', entreprise: 'Boulangerie Roy', courriel: 'paul@exemple.ca', confirmee_at: il(2) },
        { ville: 'Ville de Québec', ville_cle: 'quebec', mois_debut: '2026-12-01', mois_fin: '2026-12-31', montant: 300, nom: 'Anne Côté', entreprise: 'Côté Notaires', courriel: 'anne@exemple.ca', confirmee_at: il(3) },
        { ville: 'Ville de Québec', ville_cle: 'quebec', mois_debut: '2026-12-01', mois_fin: '2026-12-31', montant: 400, nom: 'Jean Roy', entreprise: 'Garage Roy', courriel: 'jean@exemple.ca', confirmee_at: null }] },
      visites: { data: visites }
    };
  }

  async function chargerRtv() {
    montrerOnglets(); sortir.hidden = DEMO;
    if (DEMO) return rendreRtv(demoRtv());
    var u = (await sb.auth.getUser()).data.user;
    var adm = u ? await sb.from('admins').select('user_id').eq('user_id', u.id).maybeSingle() : { data: null };
    if (!adm.data) { await sb.auth.signOut(); return connexion('Ce compte n’est pas dans la liste des admins.'); }
    var reqDem = sb.from('rtv_demandes').select('id, created_at, ville, ville_cle, nom, courriel, profil, message, statut, provenance').order('created_at', { ascending: false }).limit(500);
    if (!voirArchives) reqDem = reqDem.neq('statut', 'archivee');
    var depuis = new Date(Date.now() - 30 * 864e5).toISOString();
    var res = await Promise.all([
      reqDem,
      sb.from('rtv_encheres').select('ville, ville_cle, mois_debut, mois_fin, montant, nom, entreprise, courriel, created_at, confirmee_at').order('mois_debut', { ascending: false }).order('montant', { ascending: false }).limit(1000),
      sb.from('rtv_visites').select('created_at, source, page_interne, campagne').gte('created_at', depuis).order('created_at', { ascending: false }).limit(5000)
    ]);
    if (onglet !== 'rtv') return;
    rendreRtv({ demandes: res[0], encheres: res[1], visites: res[2] });
  }

  // ---------- Onglet « Villes » (Martin, 15 nov. 2026 : toutes ses villes à un seul endroit, par province) ----------
  // Les villes sont listées à la main (une ville neuve s'ajoute ici ET dans VILLES_ETAT de
  // api/represente.js), mais leur statut se lit tout seul sur les sites en ligne. Les villes vivent dans des dépôts différents (dossierquebec, dossierBC,
  // dossierontario…), le tableau ne peut pas les deviner. À mettre à jour quand une ville s'ajoute,
  // passe en pause ou se rallume (en même temps que VILLES / VILLES_EN_PAUSE de commun/navigation.js).
  // etat : actif | pause | apercu (bâtie, pas encore en ligne). file : le file-commandite.json lisible
  // d'ici (même domaine) ; null tant que la ville n'a pas de file en ligne sur dossierquebec.ca.
  var PROVINCES = [
    { nom: 'Québec', site: 'https://dossierquebec.ca', villes: [
      { cle: 'quebec', nom: 'Québec', etat: 'actif', url: '/quebec/', file: '/quebec/data/file-commandite.json', note: 'Un mois de commandite à la fois.' },
      { cle: 'montreal', nom: 'Montréal', etat: 'actif', url: '/montreal/', file: '/montreal/data/file-commandite.json', note: 'Un mois de commandite à la fois.' },
      { cle: 'levis', nom: 'Lévis', etat: 'actif', url: '/levis/', file: '/levis/data/file-commandite.json' },
      { cle: 'laval', nom: 'Laval', etat: 'pause', depuis: '2026-10-07', url: '/laval/', file: '/laval/data/file-commandite.json' },
      { cle: 'longueuil', nom: 'Longueuil', etat: 'pause', depuis: '2026-10-07', url: '/longueuil/', file: '/longueuil/data/file-commandite.json' }
    ] },
    { nom: 'Colombie-Britannique', site: 'https://dossierbc.ca', villes: [
      { cle: 'vancouver', nom: 'Vancouver', etat: 'pause', depuis: '2026-11-15', url: 'https://dossierbc.ca/vancouver/', file: null, note: 'En ligne depuis le 15 nov. 2026, déjà en pause (aperçu de juin et juillet). Demande Van311 nº 201003771234 envoyée à la Ville pour les procès-verbaux ; relance le 14 déc. 2026.' }
    ] },
    { nom: 'Ontario', site: 'https://dossierontario.ca', villes: [
      { cle: 'ottawa', nom: 'Ottawa', etat: 'pause', url: 'https://dossierontario.ca/ottawa/', file: null }
    ] },
    { nom: 'Nouveau-Brunswick', site: 'https://dossiernbrunswick.ca', villes: [
      { cle: 'fredericton', nom: 'Fredericton', etat: 'pause', url: 'https://dossiernbrunswick.ca/fredericton/', file: null, note: 'En ligne depuis le 19 nov. 2026, en pause (réactivation 150 $). Pas lu par api/represente.js : son avis de pause ne passe pas par avis-pause.js.' }
    ] },
    { nom: 'Saskatchewan', site: 'https://dossiersaskatchewan.ca', villes: [] }
  ];
  var ETATS = { actif: ['Active', 'bleu'], pause: ['En pause', 'rouge'], apercu: ['Pas encore en ligne', 'gris'] };
  var aujourdhui = function () { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montreal' }); };
  async function lireFile(chemin) {
    if (!chemin) return null;
    try { var r = await fetch(chemin, { cache: 'no-store' }); if (!r.ok) return { erreur: 'HTTP ' + r.status }; return await r.json(); }
    catch (e) { return { erreur: 'illisible' }; }
  }
  function enCours(f) { var j = aujourdhui(); return !!(f && f.periodes) && f.periodes.some(function (p) { return p.debut <= j && j <= p.fin; }); }
  // Les villes louées : le registre public RTV_LOUEES de /represente-ta-ville.html ([ville, province, fin]).
  // Lu d'ici pour ne tenir la liste qu'à un seul endroit : une ville qu'on y ajoute reçoit sa pastille.
  var louees = {};
  async function lireLouees() {
    try {
      var t = await (await fetch('/represente-ta-ville.html', { cache: 'no-store' })).text();
      var m = t.match(/var RTV_LOUEES = (\[[^;]*\]);/);
      var j = aujourdhui();
      louees = {};
      if (m) JSON.parse(m[1].replace(/'/g, '"')).forEach(function (l) { if (!l[2] || l[2] >= j) louees[l[0]] = l[2] || ''; });
    } catch (e) { louees = {}; }
  }
  function pastilleLouee(v, f) {
    var fin = louees[v.nom];
    if (fin === undefined && !enCours(f)) return '';
    return ' <span class="tb-pastille jaune">Louée' + (fin ? ' jusqu’au ' + jourLong(fin) : '') + '</span>';
  }
  function blocCommandite(f) {
    if (f === null) return '<p>Commandite : pas encore de file en ligne.</p>';
    if (f.erreur) return '<p>Commandite : file ' + h(f.erreur) + '.</p>';
    var per = (f.periodes || []).slice().sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
    if (!per.length) return '<p>Commandite : <b>personne</b> pour l’instant.</p>';
    var j = aujourdhui();
    var qui = function (p) { return p.affichage === 'anonyme' ? 'anonyme' : (p.nom || '(sans nom)') + (p.affichage === 'banniere' ? ' (bannière)' : ''); };
    var cour = per.filter(function (p) { return p.debut <= j && j <= p.fin; })[0];
    var avenir = per.filter(function (p) { return p.debut > j; });
    var fin = per.reduce(function (m, p) { return p.fin > m ? p.fin : m; }, per[0].fin);
    return '<p>Commandite : ' + (cour ? '<b>' + h(qui(cour)) + '</b> jusqu’au ' + jourLong(cour.fin) : '<b>personne</b> aujourd’hui') + '.</p>' +
      (avenir.length ? '<p>À venir : ' + avenir.map(function (p) { return h(qui(p)) + ' dès le ' + jourLong(p.debut); }).join(' ; ') + '.</p>' : '') +
      (fin >= j ? '<p>Réservé jusqu’au ' + jourLong(fin) + '.</p>' : '');
  }
  // Les abonné·e·s aux courriels de ville (Martin, 17 nov. 2026) : totaux par ville rendus par la
  // fonction dq_infolettre_abonnes (scripts/supabase-admin-abonnes.sql), jamais une adresse.
  function blocAbonnes(a, erreur) {
    if (erreur) return '<p class="tb-abonnes">Abonné·e·s au courriel : ' + h(erreur) + '</p>';
    if (!a) return '<p class="tb-abonnes">Abonné·e·s au courriel : aucun.</p>';
    var detail = [];
    if (a.mensuel) detail.push(n(a.mensuel) + ' mensuel');
    if (a.conseil) detail.push(n(a.conseil) + ' conseil');
    if (a.arrondissement) detail.push(n(a.arrondissement) + ' arrondissement');
    return '<p class="tb-abonnes"><strong>' + pluriel(a.personnes, 'abonné·e au courriel', 'abonné·e·s au courriel') + '</strong>' +
      (detail.length ? ' (' + detail.join(', ') + ')' : '') +
      (a.en_attente ? ' · ' + n(a.en_attente) + ' en attente de confirmation' : '') + '.</p>';
  }
  function rendreVilles(fichiers, demandes, abonnes) {
    abonnes = abonnes || {};
    var nouvelles = {}, toutes = {};
    (demandes || []).forEach(function (d) { toutes[d.ville_cle] = (toutes[d.ville_cle] || 0) + 1; if (d.statut === 'nouvelle') nouvelles[d.ville_cle] = (nouvelles[d.ville_cle] || 0) + 1; });
    var total = PROVINCES.reduce(function (t, p) { return t + p.villes.length; }, 0);
    zone.innerHTML = '<div class="tb-tete"><div><h1>Villes</h1><p>Toutes tes villes : ' + pluriel(total, 'ville', 'villes') + ', ' + pluriel(PROVINCES.length, 'province', 'provinces') + '. État, commanditaire du moment et demandes reçues. La liste se tient à la main dans commun/admin.js.</p></div></div>' +
      PROVINCES.map(function (p) {
        var lien = p.site.replace(/^https:\/\//, '');
        return '<section class="tb-prov"><h2>' + h(p.nom) + '<small><a href="' + h(p.site) + '" target="_blank" rel="noopener">' + h(lien) + '</a> · ' + pluriel(p.villes.length, 'ville', 'villes') + '</small></h2>' +
          (p.villes.length ? '<div class="tb-cartes">' + p.villes.map(function (v) {
            var e = ETATS[v.etat] || [v.etat, ''];
            var nv = nouvelles[v.cle] || 0, tt = toutes[v.cle] || 0;
            return '<article class="tb-carte"><h3>' + h(v.nom) + ' <span class="tb-pastille ' + e[1] + '">' + e[0] + '</span>' + pastilleLouee(v, fichiers[v.cle]) + (nv ? ' <span class="tb-pastille jaune">' + pluriel(nv, 'nouvelle demande', 'nouvelles demandes') + '</span>' : '') + '</h3>' +
              (v.etat === 'pause' && v.depuis ? '<p>Données figées depuis le ' + jourLong(v.depuis) + '. Réactivation : 150 $.</p>' : '') +
              blocCommandite(fichiers[v.cle]) +
              (p.site === 'https://dossierquebec.ca' ? blocAbonnes(abonnes[v.cle], abonnes._erreur) : '') +
              (tt ? '<p>Demandes « Représentez votre ville » : ' + n(tt) + '.</p>' : '') +
              (v.note ? '<p>' + h(v.note) + '</p>' : '') +
              '<div class="tb-liens"><a href="' + h(v.url) + '" target="_blank" rel="noopener">Voir la ville ↗</a>' + (v.file ? '<a href="' + h(v.file) + '" target="_blank" rel="noopener">File de commandite ↗</a>' : '') + '</div></article>';
          }).join('') + '</div>' : '<p class="tb-vide-prov">Aucune ville encore.</p>') + '</section>';
      }).join('');
  }
  async function chargerVilles() {
    montrerOnglets(); sortir.hidden = DEMO;
    var dem = { data: [] }, abonnes = {};
    if (DEMO) abonnes = { quebec: { personnes: 42, mensuel: 40, conseil: 12, arrondissement: 3, en_attente: 2 }, montreal: { personnes: 17, mensuel: 17, conseil: 0, arrondissement: 0, en_attente: 0 } };
    if (!DEMO) {
      var u = (await sb.auth.getUser()).data.user;
      var adm = u ? await sb.from('admins').select('user_id').eq('user_id', u.id).maybeSingle() : { data: null };
      if (!adm.data) { await sb.auth.signOut(); return connexion('Ce compte n’est pas dans la liste des admins.'); }
      var lectures = await Promise.all([
        sb.from('rtv_demandes').select('ville_cle, statut').neq('statut', 'archivee').limit(2000),
        sb.rpc('dq_infolettre_abonnes')
      ]);
      dem = lectures[0];
      var ab = lectures[1];
      if (ab.error) abonnes = { _erreur: /does not exist|PGRST202/i.test(ab.error.message || '') ? 'fonction absente, colle scripts/supabase-admin-abonnes.sql dans Supabase.' : 'pas pu lire (' + (ab.error.message || '') + ').' };
      else abonnes = ab.data || {};
    }
    var tout = [];
    PROVINCES.forEach(function (p) { p.villes.forEach(function (v) { tout.push(v); }); });
    // Le statut vient des sites en ligne (api/represente.js?etat=villes) ; l'état écrit dans
    // PROVINCES ne sert plus que de repli si l'appel échoue (en local, par exemple).
    var etats = {};
    try { var re = await fetch('/api/represente?etat=villes'); if (re.ok) etats = await re.json(); } catch (e) {}
    tout.forEach(function (v) { var e = etats[v.cle]; if (e && e.etat) { v.etat = e.etat; if (e.depuis) v.depuis = e.depuis; } });
    var lus = await Promise.all(tout.map(function (v) { return lireFile(v.file); }).concat([lireLouees()]));
    var fichiers = {};
    tout.forEach(function (v, i) { fichiers[v.cle] = lus[i]; });
    if (onglet !== 'villes') return;
    rendreVilles(fichiers, dem.data || [], abonnes);
  }

  async function charger() {
    zone.innerHTML = '<p class="tb-charge">Chargement…</p>';
    if (onglet === 'rtv') return chargerRtv();
    if (onglet === 'villes') return chargerVilles();
    montrerOnglets();
    if (DEMO) return rendre(demo());
    var r = await sb.rpc('dq_mesures_resume', { jours: jours, site: site });
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
