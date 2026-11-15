// Mode aperçu de /mon-dossier (prototype, 3 nov. 2026). UNIQUEMENT sur http://localhost avec
// ?apercu=connecte : affiche l'état connecté avec des données factices, sans jamais appeler
// Supabase ni les fonctions /api. Sur tout autre nom d'hôte (production), ce fichier ne fait rien.
// Chargé entre le script Supabase et commun/dq.js ; commun/abonnes-client.js lit window.__DQ_APERCU__.
(function(){
  'use strict';
  if (location.hostname !== 'localhost') return;
  // ?apercu=connecte : compte gratuit ; ?apercu=abonne : abonné·e, les six outils remplis (14 nov. 2026).
  const MODE = new URLSearchParams(location.search).get('apercu');
  if (MODE !== 'connecte' && MODE !== 'abonne') return;
  const ABONNE = MODE === 'abonne';

  const user = { id: '00000000-0000-0000-0000-00000000a9e1', email: 'apercu@exemple.test' };
  const session = { access_token: 'apercu', user };
  const maintenant = new Date().toISOString();
  const TABLES = {
    follows: [{ person_type: 'minister', person_key: 'Paul St-Pierre Plamondon' }],
    dossiers_suivis: [
      { id: 1, ville: 'assemblee', dossier_id: 'pl:27463', numero: null, objet: null, created_at: maintenant },
      { id: 2, ville: 'assemblee', dossier_id: 'pl:26903', numero: null, objet: null, created_at: maintenant },
      { id: 3, ville: 'montreal', dossier_id: 'projet:canopee', numero: null, objet: 'Canopée', created_at: '2026-09-14T12:00:00Z' },
      { id: 4, ville: 'quebec', dossier_id: 'projet:tramway', numero: null, objet: 'Tramway', created_at: '2026-09-14T12:00:00Z' },
      { id: 5, ville: 'quebec', dossier_id: 'projet:logement', numero: null, objet: 'Logement', created_at: '2026-09-20T12:00:00Z' },
      { id: 6, ville: 'quebec', dossier_id: 'projet:expocite', numero: null, objet: 'ExpoCité', created_at: '2026-10-02T12:00:00Z' },
    ],
    // Les outils de l'abonnement, remplis en mode abonne.
    alertes_mots_cles: ABONNE ? [{ id: 'm1', mot: 'logement', portee: 'assemblee' }, { id: 'm2', mot: 'tramway', portee: 'assemblee' }, { id: 'm3', mot: 'santé mentale', portee: 'assemblee' }] : [],
    alertes_preferences: ABONNE ? [{ actif: true, veille_themes: ['sante', 'logement', 'transports'] }] : [],
    organismes_suivis: ABONNE ? [{ id: 'o1', nom: 'Barreau du Québec', portee: 'assemblee' }, { id: 'o2', nom: 'Fédération des travailleurs et travailleuses du Québec', portee: 'assemblee' }] : [],
    abonnements: [{ lecture_seule: false }],
  };
  function requete(table){
    let lignes = (TABLES[table] || []).slice(), ecriture = false, une = false;
    const b = {
      select(){ return b; }, order(){ return b; }, limit(){ return b; }, range(){ return b; }, in(){ return b; }, neq(){ return b; }, gte(){ return b; }, lte(){ return b; }, is(){ return b; }, not(){ return b; },
      eq(col, val){ if(!ecriture && col !== 'user_id') lignes = lignes.filter((l) => !(col in l) || String(l[col]) === String(val)); return b; },
      insert(){ ecriture = true; return b; }, upsert(){ ecriture = true; return b; }, update(){ ecriture = true; return b; }, delete(){ ecriture = true; return b; },
      maybeSingle(){ une = true; return b; }, single(){ une = true; return b; },
      then(ok, ko){ const data = ecriture ? null : (une ? (lignes[0] ?? null) : lignes); return Promise.resolve({ data, error: null }).then(ok, ko); },
    };
    return b;
  }
  const client = {
    from: requete,
    rpc: () => Promise.resolve({ data: { recus: 1, sujets: [] }, error: null }),
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser: () => Promise.resolve({ data: { user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithOtp: () => Promise.resolve({ error: null }),
    },
  };
  window.__DQ_APERCU__ = { client };
  if (window.supabase) window.supabase.createClient = () => client;

  // Les courriels : ce que /api/infolettre?action=etat renverrait (api/_infolettre.js, offreDe).
  const T = {
    mensuel: { nom: 'Le compte rendu du mois', nomEn: 'The monthly roundup', quoi: 'Tout ce que la Ville a décidé dans le mois : les plus gros montants, toutes les subventions et tous les contrats, les votes divisés.', quoiEn: 'Everything City Hall decided this month: the biggest amounts, every grant and every contract, the split votes.', rythme: 'une fois par mois', rythmeEn: 'once a month' },
    conseil: { nom: 'Après chaque séance du conseil de la ville', nomEn: 'After each city council meeting', quoi: 'Ce que le conseil a décidé à sa séance : les montants, les votes divisés, ce qui a été reporté.', quoiEn: 'What council decided at its meeting: the amounts, the split votes, what was postponed.', rythme: 'environ aux deux semaines', rythmeEn: 'about every two weeks' },
    arrondissement: { nom: 'Mon arrondissement', nomEn: 'My borough', quoi: 'Ce que le conseil de votre arrondissement a décidé à sa séance : permis, travaux, subventions de quartier, circulation.', quoiEn: 'What your borough council decided at its meeting: permits, works, neighbourhood grants, traffic.', rythme: "après chaque séance de l'arrondissement", rythmeEn: 'after each borough council meeting' },
  };
  const arr = (noms) => noms.map((nom) => ({ cle: nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), nom }));
  const ville = (cle, nom, langues, arrondissements, note = null, noteEn = null) => ({
    cle, nom, langues, note, noteEn,
    offre: ['mensuel', 'conseil', 'arrondissement'].map((c) => ({ cle: c, ...T[c], arrondissements: c === 'arrondissement' ? arrondissements : null, langues })),
  });
  const etat = {
    villes: [
      ville('quebec', 'Québec', ['fr'], arr(['La Cité-Limoilou', 'Les Rivières', 'Sainte-Foy–Sillery–Cap-Rouge', 'Charlesbourg', 'Beauport', 'La Haute-Saint-Charles'])),
      ville('montreal', 'Montréal', ['fr', 'en'], arr(['Ahuntsic-Cartierville', 'Anjou', 'Côte-des-Neiges–Notre-Dame-de-Grâce', 'Lachine', 'LaSalle', 'Mercier–Hochelaga-Maisonneuve', 'Montréal-Nord', 'Outremont', 'Plateau-Mont-Royal', 'Rosemont–La Petite-Patrie', 'Saint-Laurent', 'Verdun', 'Ville-Marie']),
        'Montréal publie ses procès-verbaux environ deux mois après chaque séance : les courriels suivent ce rythme.',
        'Montréal publishes its minutes about two months after each meeting: the emails follow that pace.'),
      { cle: 'assemblee', nom: 'Assemblée nationale', langues: ['fr'], note: null, noteEn: null, offre: [{ cle: 'mensuel', nom: "L'infolettre de l'Assemblée nationale", nomEn: 'The National Assembly newsletter', quoi: 'Un courriel au début de chaque mois : les projets de loi, les votes, ce qui a bougé.', quoiEn: 'One email at the start of each month: the bills, the votes, what moved.', rythme: 'une fois par mois', rythmeEn: 'once a month', arrondissements: null, langues: ['fr'] }] },
    ],
    connecte: true, courriel: user.email,
    inscriptions: { 'assemblee:fr': 'confirme', 'quebec:conseil:fr': 'confirme', 'quebec:arrondissement:la-cite-limoilou:fr': 'confirme', 'montreal:fr': 'confirme', 'montreal:arrondissement:plateau-mont-royal:fr': 'confirme' },
  };
  const cleChoix = ({ ville: v, type = 'mensuel', arrondissement = '', langue = 'fr' }) =>
    [v, type === 'mensuel' ? null : type, arrondissement || null, langue || 'fr'].filter(Boolean).join(':');
  const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
  const fetchVrai = window.fetch.bind(window);
  window.fetch = async (entree, options = {}) => {
    const url = new URL(typeof entree === 'string' ? entree : entree.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetchVrai(entree, options);
    await new Promise((r) => setTimeout(r, 120));
    if (url.pathname === '/api/infolettre') {
      if (url.searchParams.get('action') === 'preferences') {
        const { choix = [] } = JSON.parse(options.body || '{}');
        for (const c of choix) { const k = cleChoix(c); if (c.actif) etat.inscriptions[k] = 'confirme'; else delete etat.inscriptions[k]; }
      }
      return json(JSON.parse(JSON.stringify(etat)));
    }
    if (url.pathname === '/api/abonnement') {
      const action = url.searchParams.get('action');
      if (action === 'codes') return json({ codes: [] });
      if (action === 'flux') return json(ABONNE ? {
        adresse: 'https://dossierquebec.ca/feed.xml?u=apercu&s=3f9c1a7e2b',
        ministeres: ['Santé et Services sociaux', 'Transports et Mobilité durable', 'Éducation', 'Environnement, Lutte contre les changements climatiques, Faune et Parcs'],
        elus: [{ cle: 'paul-st-pierre-plamondon', nom: 'Paul St-Pierre Plamondon' }, { cle: 'ruba-ghazal', nom: 'Ruba Ghazal' }, { cle: 'marc-tanguay', nom: 'Marc Tanguay' }],
      } : { abonne: false });
      return json({ abonne: ABONNE, connecte: true });
    }
    if (url.pathname === '/api/export' && url.searchParams.get('jeu') === 'organismes') {
      if (url.searchParams.get('q')) return json({ resultats: [{ nom: 'Mouvement Desjardins', cle: 'Mouvement Desjardins', memoires: 7 }, { nom: 'Desjardins Assurances', cle: 'Desjardins Assurances', memoires: 2 }] });
      const memoire = (num, titrePl, titre, date) => ({ titre, url: 'https://www.assnat.qc.ca/', date, num, titrePl, commission: 'Commission des institutions' });
      return json({ misAJour: '2026-11-13', organismes: {
        'Barreau du Québec': { nom: 'Barreau du Québec', memoires: 2, variantes: ['Le Barreau du Québec'], liste: [memoire('2', 'Loi portant sur la réforme du droit de la famille', 'Mémoire du Barreau du Québec sur le projet de loi 2', '2026-10-01'), memoire('11', 'Loi modifiant le Code de procédure civile', 'Commentaires du Barreau', '2026-09-12')] },
        'Fédération des travailleurs et travailleuses du Québec': { nom: 'Fédération des travailleurs et travailleuses du Québec', memoires: 1, variantes: ['FTQ'], liste: [memoire('7', 'Loi visant à améliorer le régime de santé et de sécurité du travail', 'Mémoire de la FTQ', '2026-10-20')] },
      } });
    }
    if (url.pathname === '/api/export' && url.searchParams.get('jeu') === 'consultations') return json({
      aVenir: [
        { titre: 'Consultations particulières sur le projet de loi 5, Loi sur l’encadrement des loyers', url: 'https://www.assnat.qc.ca/', commission: 'Commission de l’aménagement du territoire', type: 'particuliere', prochaineSeance: '2026-11-25', dateLimite: '2026-11-20' },
        { titre: 'Consultation générale sur le projet de loi 8, Loi sur la laïcité dans les services publics', url: 'https://www.assnat.qc.ca/', commission: 'Commission des institutions', type: 'generale', prochaineSeance: null, dateLimite: null },
      ],
      projets: { 27463: { num: '3', titre: 'Loi sur la protection des renseignements personnels dans le secteur de la santé', memoires: [{ depose: 'Commission d’accès à l’information', url: 'https://www.assnat.qc.ca/', date: '2026-10-02', organisme: 'Commission d’accès à l’information' }, { depose: 'Ordre des infirmières et infirmiers du Québec', url: 'https://www.assnat.qc.ca/', date: '2026-10-03', organisme: 'OIIQ' }] } },
    });
    if (url.pathname === '/api/message') return json({ ok: true });
    return json({ erreur: 'apercu' }, 404);
  };
  console.info('[apercu] /mon-dossier en état connecté, données factices (localhost seulement).');
})();
