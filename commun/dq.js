// La logique de DossierQuébec, partagée par les sept pages.
//
// Elle vivait en ligne dans index.html, donc recopiée à l'identique dans six pages de 2 Mo.
// Ici, le navigateur la prend une seule fois et la garde.
//
// Script CLASSIQUE, jamais un module : les fonctions appelées depuis les attributs onclick du
// HTML doivent vivre dans la portée globale. Il est posé après tout le HTML, donc le document
// est déjà analysé quand ce code démarre.

/* ---------------- LES DONNÉES DE LA PAGE ---------------- */
//
// Chaque page déclare dans <body data-donnees="…"> ce qu'elle affiche, et ne charge que ça.
// Avant, les six pages de la racine portaient les neuf jeux en ligne, identiques : 500 ko par
// page, dont la quasi-totalité ne servait pas à la vue affichée. Ouvrir /lexique téléchargeait
// les 735 votes nominatifs.
//
// Ce sont des `let`, pas des `const` : ils sont vides jusqu'à l'arrivée des fichiers. Toute
// fonction de rendu tourne APRÈS chargerDonnees(), et celles dont la vue n'est pas sur la page
// sortent immédiatement (voir les gardes en tête de chacune).
let ministers = [], bills = [], votes = [], presences = {}, deputesRaw = [],
    deputeEmails = {}, newsItems = [], petitions = [], promises = [], stats = null, journal = [];

// Dérivés des précédents, recalculés une fois les fichiers arrivés.
let deputes = [], deputeById = new Map(), voteById = new Map();

// Nom déclaré dans data-donnees → variable à remplir. Trois noms visent `bills` avec des
// contenus différents, et c'est voulu : l'accueil n'a besoin que des 4 projets récents, la page
// des votes que des titres et parrains. Charger les 143 projets complets pour ça, c'était 113 ko.
const _remplir = {
  ministers: (v) => { ministers = v; },
  bills: (v) => { bills = v; },
  apercuBills: (v) => { bills = v; },
  billsTitres: (v) => { bills = v; },
  // Page Ministres : le parrain et son rôle, rien d'autre (« PL parrainés », billsSponsoredBy).
  billsParrains: (v) => { bills = v; },
  votes: (v) => { votes = v; },
  presences: (v) => { presences = v; },
  deputesRaw: (v) => { deputesRaw = v; },
  deputeEmails: (v) => { deputeEmails = v; },
  newsItems: (v) => { newsItems = v; },
  petitions: (v) => { petitions = v; },
  promises: (v) => { promises = v; },
  stats: (v) => { stats = v; },
  journal: (v) => { journal = v; },
};

// Presque tout sort de data/site/, que scripts/build-section-pages.js régénère. Le journal des
// mises à jour, lui, est écrit À LA MAIN : il vit à part, pour que personne ne le croie fabriqué.
const _chemins = { journal: '/data/journal.json' };

// Les jeux qui n'ont pas pu arriver. Leur liste écrite dans le HTML par le build (div.prerendu)
// reste alors affichée : c'est justement le cas où elle sert. Voir retirerPrerendus().
const _echecs = new Set();
async function chargerDonnees(){
  const demandes = (document.body.dataset.donnees || '').split(',').map(s => s.trim()).filter(Boolean);
  // En parallèle : ces fichiers ne dépendent pas les uns des autres, les enchaîner coûterait
  // un aller-retour par jeu.
  await Promise.all(demandes.map(async (nom) => {
    const poser = _remplir[nom];
    if(!poser){ console.warn('jeu de données inconnu : ' + nom); return; }
    try {
      const r = await fetch(_chemins[nom] || `/data/site/${nom}.json`);
      if(!r.ok) throw new Error(r.status);
      poser(await r.json());
    } catch (e) {
      // Une page à moitié vide vaut mieux qu'une page blanche : on note et on continue.
      console.error(`données ${nom} non chargées :`, e.message);
      _echecs.add(nom);
    }
  }));
  deputes = deputesRaw.map(d => ({ name: d[0], riding: d[1], region: d[2], party: d[3], assnatId: d[4] }));
  deputeById = new Map(deputes.map(d => [d.assnatId, d]));
  voteById = new Map(votes.map(v => [v.id, v]));
  if(newsItems.length) newsAnchor = newsItems.reduce((max, n) => (n.date > max ? n.date : max), newsItems[0].date);
  // Les trois compteurs de l'accueil étaient posés par renderMinistres, renderBills et
  // renderVotes — des vues qui ne sont plus sur cette page. Ils viennent maintenant de stats.
  if(stats){
    const poser = (id, n) => { const e = document.getElementById(id); if(e) e.textContent = n; };
    poser('statMinistres', stats.ministres);
    poser('statProjets', stats.projets);
    poser('statVotes', stats.votes);
  }
}

/* ---------------- I18N ---------------- */
const translations = {
  fr: {
    'nav.close':"Fermer",'nav.villes':"Villes",'nav.apercu':"Aperçu",'nav.ministres':"Ministres",'nav.projets':"Projets de loi",
    'nav.votes':"Votes",'nav.quoideneuf':"Quoi de neuf",'nav.compte':"Compte & à propos",'nav.trouve':"Trouvez votre député",
    'nav.lexique':"Lexique",'nav.personnes':"Qui gravite autour",'nav.petitions':"Pétitions",'nav.apropos':"D'où viennent ces données",
    'stat.ministres':"Ministres",'stat.projets':"Projets de loi",'stat.votes':"Votes enregistrés",
    'h.composition':"Composition — 125 sièges",
    'h.billsrecent':"Projets de loi récemment actifs",
    'h.ministres':"Ministres et député·e·s",
    'h.projets':"Projets de loi",
    'h.votes':"Registre des votes",
    'h.compte':"Compte",
    'h.trouve':"Trouvez votre député",
    'h.quoideneuf':"Quoi de neuf",
    'h.quoideneuf.sub':"Dernières activités réelles à l'Assemblée nationale",
    'h.lexique':"Lexique du jargon parlementaire",
    'h.lexique.sub':"Pour comprendre le reste du site sans avoir fait un cours de science politique",
    'h.personnes':"Qui gravite autour de l'Assemblée",
    'h.petitions':"Pétitions ouvertes à l'Assemblée nationale",
    'h.apropos':"D'où viennent ces données, et comment aller plus loin",
    'ph.searchMinistres':"Nom, circonscription, région ou ministère…",
    'ph.searchBills':"Numéro, titre ou mot-clé…",
    'filter.statuts':"Statuts", 'filter.etapes':"Étapes",
    'ph.searchDeputes':"Nom, circonscription ou région…",
    'ph.searchVotes':"Mot-clé : sujet, numéro de projet de loi…",
    'btn.follow':"+ Suivre",'btn.following':"✓ Suivi",
    'btn.viewSummary':"+ Voir le résumé",'btn.hideSummary':"− Masquer le résumé",
    'btn.viewFull':"Voir le texte complet sur assnat.qc.ca →",
    'footer.left':"Site non officiel — données publiques ANQ & Données Québec ·",
    'footer.right':"construit avec Claude",
    'footer.source':"Code source",
  },
  en: {
    'nav.close':"Close",'nav.villes':"Cities",'nav.apercu':"Overview",'nav.ministres':"Ministers",'nav.projets':"Bills",
    'nav.votes':"Votes",'nav.quoideneuf':"What's new",'nav.compte':"Account & about",'nav.trouve':"Find your MNA",
    'nav.lexique':"Glossary",'nav.personnes':"Who's involved",'nav.petitions':"Petitions",'nav.apropos':"Where this data comes from",
    'stat.ministres':"Ministers",'stat.projets':"Bills",'stat.votes':"Votes recorded",
    'h.composition':"Composition — 125 seats",
    'h.billsrecent':"Recently active bills",
    'h.ministres':"Ministers and MNAs",
    'h.ministres2':"The ministers",
    'min.merged.sub':"The Cabinet, then all 125 MNAs from every party — one search box for both",
    'min.sub2b':" ministers — official quebec.ca list",
    'min.restTitle':"The rest of the Assembly",
    'min.restNote':"Every party — 125 seats total",
    'h.comparateur':"Comparator",
    'comp.sub':"Two ministers, the same facts, side by side — never a ranking",
    'h.projets':"Bills",
    'h.votes':"Vote registry",
    'h.compte':"Account",
    'h.trouve':"Find your MNA",
    'h.quoideneuf':"What's new",
    'h.quoideneuf.sub':"Real, recent activity from the National Assembly",
    'h.lexique':"Parliamentary glossary",
    'h.lexique.sub':"To understand the rest of the site without a political science degree",
    'h.personnes':"Who's involved around the Assembly",
    'h.petitions':"Petitions open at the National Assembly",
    'h.apropos':"Where this data comes from, and how to go further",
    'ph.searchMinistres':"Name, riding, region, or ministry…",
    'ph.searchBills':"Number, title or keyword…",
    // Refonte brutaliste — heroes de vues et bandes explicatives
    'hero.l1':"Who sits,",
    'hero.l2':"who legislates,",
    'hero.l3':"who votes what.",
    'hero.manifesto':"Québec's National Assembly, reorganized by person and translated into plain language — no judgment, no verdict. Independent citizen site, real public data.",
    'hero.cta':"Explore →",
    'projhero.l1':"Bills,",
    'projhero.l2':"translated plainly.",
    'projhero.sub':"Every bill summarized in everyday language, with its real stage in the process. The full text is always one click away on assnat.qc.ca.",
    'votehero.l1':"Who voted",
    'votehero.l2':"for, against, absent.",
    'votehero.sub':"The recorded-division registry, as is. We don't interpret — we show. An absence can be an official mission, an illness, a scheduling conflict.",
    'minhero.l1':"The Cabinet",
    'minhero.l2':"& the whole Assembly.",
    'minhero.sub':"The ministers, then all 125 MNAs from every party (<b>the MNAs are further down</b>) — <b>one search for both.</b>",
    'lexhero.l1':"The jargon,",
    'lexhero.l2':"decoded.",
    'lexhero.sub':"“Royal assent”, “clause-by-clause study”, “closure”… Parliament has its own vocabulary. Here, every term is explained like you'd explain it to a friend.",
    'legend.label':"A bill's path:",
    'legend.link':"What are these stages? → Glossary",
    'chexp.h':"✋ What is “challenging”?",
    'chexp.p1':"One click on “Ask for an explanation” = a citizen request for the bill's sponsor to explain it in plain language, and for us to keep an eye on it together.",
    'chexp.p2':"An account (email) is required — one request per person, no anonymous requests. 🔥 At 1,000, we push for an official petition.",
    'lire.h':"How to read a vote",
    'lire.1.h':"Recorded division",
    'lire.1.p':"Each MNA stands and their choice is recorded in the Journal des débats. It's the only kind of vote that can be attributed to a person.",
    'lire.2.h':"Passed ≠ law",
    'lire.2.p':"A winning vote moves the bill one stage forward. It only becomes law after assent by the Lieutenant-Governor.",
    'lire.3.h':"Party line",
    'lire.3.p':"Most votes follow the party's instruction. Free votes are rare — and that's where the nominal detail gets interesting.",
    'suggest.h':"Missing a word?",
    'suggest.p':"If a term tripped you up while reading a bill or a vote, it tripped others too. Suggest it on the Facebook page — it will be added with a plain-language definition.",
    'suggest.cta':"✉ Suggest a term",
    'ch.more':"See more →",
    'lexcat.proc':"Process", 'lexcat.votes':"Votes", 'lexcat.pers':"People & roles", 'lexcat.outils':"Citizen tools",
    'mission.eyebrow':"Our mission",
    'mission.st1':"The Assembly's official site is the most reliable source there is. This one just makes it ",
    'mission.st2':"easier to follow.",
    'filter.statuts':"Statuses", 'filter.etapes':"Stages",
    'ph.searchDeputes':"Name, riding, or region…",
    'ph.searchVotes':"Keyword: subject, bill number…",
    'btn.follow':"+ Follow",'btn.following':"✓ Following",
    'btn.viewSummary':"+ View summary",'btn.hideSummary':"− Hide summary",
    'btn.viewFull':"View full text on assnat.qc.ca →",
    'footer.left':"Unofficial site — public data ANQ & Données Québec ·",
    'footer.right':"built with Claude",
    'footer.source':"Source code",

    // Ministers
    'min.sub1':"Fréchette Cabinet, sworn in April 21, 2026 — ",
    'min.sub2':" members confirmed out of 29 announced",
    'min.incomplete.b':"Up to date.",
    'min.incomplete.pre':"These ",
    'min.incomplete.post':" ministers come directly from the official Council of Ministers page on quebec.ca, scraped live — not a hand-maintained list.",
    // Bills
    'proj.sub':"43rd Legislature — real status as of June 12, 2026 (adjournment)",
    // Votes
    'votes.sub':"43rd Legislature (sessions 1 to 3) — official counts and by-MNA breakdown",
    'votes.info.b':"On the \u201cwho voted what\u201d detail",
    'votes.info.text':"— the National Assembly publishes each MNA's name for every recorded vote in its official vote registry. The by-MNA breakdown above (“View names by MNA” button) comes from that official registry, not an estimate. The party shown next to each name is the one on record at the time of the vote — it may differ from an MNA's current party if they have since changed allegiance.",
    // Find your MNA
    'trouve.sub':"125 ridings — full list, real National Assembly data",
    'trouve.info':"These 125 entries come directly from the official list of sitting MNAs at the National Assembly. Some seats may change between updates (resignation, by-election) — this list is a snapshot taken at the last update, not an automatically updated feed.",
    // What's new / calendar
    'cal.status':"\u25CF Assembly dissolved on August 27, 2026 \u00B7 general election October 5 · new legislature November 17",
    'cal.title':"Sitting calendar",
    // Dissolution de la 43e législature (2026-08-27) — à retirer le 17 nov. 2026.
    'diss.h':"⚠️ The Assembly is dissolved — election October 5",
    'diss.p1':"On <b>August 27, 2026</b>, the National Assembly was dissolved: the 43rd legislature is over. There are no sitting members anymore — those who sat are now candidates or are stepping down. The government stays in place for the duration of the campaign.",
    'diss.p2':"Direct consequence: <b>every bill that had not been assented to died with it.</b> They will have to start over before the new Assembly, convened on <b>November 17, 2026</b>. What remains here is the full record of the 43rd legislature: the laws that passed, how each member voted, and the bills that did not make it.",
    'diss.cta':"What the parties are promising →",
    'prom.l1':"What they promise,",
    'prom.l2':"what they'll do with it.",
    'prom.sub':"The parties' commitments for the October 5, 2026 election, each with its source. <b>No verdict is issued here</b> — as the new Assembly legislates, each promise will be placed next to what was actually done.",
    'h.promesses':"Election promises",
    'prom.lex':"The parties' commitments for the October 5, 2026 election, each with its source — and, as the new Assembly legislates, what was actually done about them. No verdict: the promise and the action, side by side.",
    'prom.lex.cta':"See the promises →",
    'prom.byparty':"By party",
    'prom.bytheme':"By topic",
    'prom.method':"Our method:",
    'prom.m1':"Exact quote",
    'prom.m2':"Source linked",
    'prom.m3':"No judgment",
    'prom.caq':"Only one source is accepted here: the <b>party's own official documents</b>, quoted word for word. <b>At most 8 commitments per party</b>, and the <b>Coalition avenir Québec</b> does not appear at all — its website asks automated tools like ours not to read it, and we honour that request rather than work around it.",
    'prom.meth.h':"Where these promises come from",
    'prom.meth.1':"<b>From the parties themselves.</b> Every quote is taken from a document the party published — an electoral platform or a campaign announcement — and reproduced word for word. A quote that cannot be found verbatim in the source is rejected automatically. The “See the source” link on each card leads to the original.",
    'prom.meth.2':"<b>These are not the “flagship” promises.</b> At most 8 per party, selected automatically from the most concrete ones — amounts, targets, deadlines. Nothing here ranks commitments by importance. A central commitment stated without a figure may therefore be missing, and the parties have published more.",
    'prom.meth.3':"<b>The period covered is not the same for everyone.</b> Québec solidaire, the Liberal Party and the Conservative Party publish a full platform, read in its entirety. The Parti Québécois does not: its commitments are read from its campaign announcements since the August 27 dissolution.",
    'prom.meth.4':"<b>The Coalition avenir Québec is absent.</b> It has published commitments on its website, but that site asks automated tools not to read it. We do not work around that request. It will be added as soon as a readable source exists.",
    'prom.meth.5':"<b>Nothing is taken from the news media.</b> A commitment announced at a press conference but never published by the party does not appear here. Quebec news organizations have opted their content out of AI use, and our permission requests remain unanswered.",
    'prom.meth.fin':"In short: an absence from this list says nothing about what a party thinks. For the full list, follow the link to the source.",
    'prom.ail.h':"Comparison tools from news outlets",
    'prom.ail.p':"Several newsrooms have built their own promise comparison tools, with resources we do not have. <b>We do not reproduce their content</b>: these outlets have opted their material out of AI use, and our permission requests remain unanswered. We respect that choice. But a link is not a reproduction — so here they are, because they will be useful to you.",
    'prom.next.h':"And after October 5?",
    'prom.next.p':"The new Assembly sits from <b>November 17, 2026</b>. From then on, every bill introduced will be placed next to the promise it matches — and the absence of a bill on a commitment will be just as visible. That is the follow-up nobody does past election week.",
    'dissp.h':"⚠️ These bills never became law",
    'dissp.p':"The Assembly was dissolved on <b>August 27, 2026</b>. Any bill that had not been <b>assented to</b> therefore <b>died on the Order Paper</b> — that is the Assembly's official term. On the cards we say it plainly: <b>“dead on arrival”</b> if the bill never got past introduction, <b>“died along the way”</b> if it got further. Either way, it must start over before the new Assembly (November 17, 2026). Bills marked “Assented to” did become law.",
    'cal.p1':"The Assembly doesn't sit year-round. Its Standing Orders set two working periods: a spring period starting the 2nd Tuesday of February (16 weeks, plus 2 intensive weeks), and a fall period starting the 3rd Tuesday of September (10 weeks, plus 2 intensive weeks). Outside these periods the Assembly is adjourned — barring a special sitting called by the Premier.",
    'cal.p2':"This page outlines the main working periods, not the daily schedule. For a day-by-day view of upcoming sittings and committees, the Assembly's official calendar remains the reference.",
    // Lexicon
    'lex.1.t':"Bill", 'lex.1.d':"The text a member or the government submits to the Assembly to become a law. It only becomes a real law once passed and then assented to.",
    'lex.2.t':"Passage in principle", 'lex.2.d':"The first big stage: the Assembly votes on whether it agrees with the general idea of the bill, before studying it in clause-by-clause detail.",
    'lex.3.t':"Clause-by-clause review", 'lex.3.d':"The stage where a parliamentary committee (a small group of MNAs) goes through the bill in detail, clause by clause, and can propose amendments.",
    'lex.4.t':"Passage", 'lex.4.d':"The final vote in the Chamber on the entire bill, once all previous stages are complete.",
    'lex.5.t':"Assent", 'lex.5.d':"The very last administrative step: the Lieutenant Governor gives official assent, and the bill formally becomes a law of Québec.",
    'lex.6.t':"Parliamentary committee", 'lex.6.d':"A smaller group of MNAs (usually around ten) who study a topic or bill in depth, hear experts and citizens, before it comes back before the full Assembly.",
    'lex.7.t':"Recorded vote", 'lex.7.d':"A vote where each MNA's name and choice (Yea/Nay/Abstention) are officially recorded — as opposed to a voice vote, where only the overall result is noted.",
    'lex.8.t':"Minutes (Procès-verbal)", 'lex.8.d':"The official but summarized record of everything that happened during a sitting: decisions, votes, tabled documents.",
    'lex.9.t':"Debates journal (Journal des débats)", 'lex.9.d':"The complete, word-for-word transcript of everything said in the Chamber — unlike the minutes, which only summarize decisions.",
    'lex.10.t':"House leader", 'lex.10.d':"The MNA responsible for organizing their group's proceedings at the Assembly — a bit like the conductor of the calendar and debates for their party.",
    'lex.11.t':"Whip", 'lex.11.d':"The MNA in charge of making sure members of their parliamentary group are present for votes and follow the party line.",
    'lex.12.t':"Minister Delegate / Minister Responsible for", 'lex.12.d':"A minister who isn't the main head of a department, but who officially holds responsibility for a specific file within or alongside it.",
    'lex.13.t':"Attendance (%)", 'lex.13.d':"The figure shown under each minister (e.g. “attendance: 88% (647/735)”): out of the 735 recorded votes across the legislature's 3 sessions, 647 are ones where this person appears as Yea, Nay, or Abstention — meaning they were present to vote, regardless of which way. The count starts from their very first detected vote (a way to approximate the start of their current term without external data). The Assembly does not publish official attendance; this is a presence proxy, not an official measure — the same method used by some media outlets (e.g. Radio-Canada).",
    // Who's involved
    'pers.sub':"The public roles we hadn't covered yet — real names, real current functions",
    'pers.g1':"Inside the Assembly",
    'pers.g2':"The Crown's representative",
    'pers.g3':"Independent watchdogs — appointed by the Assembly, not the government",
    'pers.1.role':"President of the National Assembly", 'pers.1.desc':"Presides over sittings and enforces the Standing Orders. MNA for Montarville (CAQ), but the presiding role requires neutrality.",
    'pers.2.role':"Lieutenant Governor of Québec", 'pers.2.desc':"30th holder of the office, in place since January 25, 2024 — the first person of First Nations heritage to hold it. She gives the royal assent cited on every bill card on this site.",
    'pers.2.badge':"Ceremonial + assent to laws",
    'pers.3.role':"Auditor General of Québec", 'pers.3.desc':"Audits state spending and management. In office since December 2025, 10-year non-renewable term.",
    'pers.4.role':"Québec Ombudsperson", 'pers.4.desc':"Handles citizen complaints against the public administration.",
    'pers.5.role':"Chief Electoral Officer of Québec", 'pers.5.desc':"Oversees elections and the electoral map.",
    'pers.6.role':"Ethics Commissioner", 'pers.6.desc':"Advises on and investigates MNA conduct on ethics matters.",
    'pers.7.role':"Lobbying Commissioner", 'pers.7.desc':"Administers the lobbyist registry — the direct link to the \u201clobbyist registry\u201d task on our roadmap.",
    'pers.8.role':"Commissioner for the Well-Being and Rights of Children", 'pers.8.desc':"The most recent institution in this group, created in 2023.",
    'pers.badge.designee':"Appointed officer",
    'pers.info':"These people hold official public functions and are appointed through a legally defined process — that's what makes the information above public. That doesn't mean everything about them becomes public: I stick to their official function here, as with the rest of the site.",
    'h.lobby':"The lobbyist registry",
    'lobby.sub':"Who's paid to influence public decisions — and how to look it up",
    'lobby.body':"Anyone paid to communicate with <b>public office holders</b> (ministers, MNAs, senior officials…) about laws, regulations, grants or contracts must register in a <b>public registry</b>, overseen by the <b>Quebec Lobbying Commissioner</b>, an independent institution. Lobbyists must declare their mandates there.",
    'lobby.note':"Why this site doesn't reproduce the registry: its data isn't offered as open data (nothing on Données Québec) and is only accessible through the official search tool. Rather than make a copy that wouldn't be reliable or up to date, we link straight to the official public tools.",
    'lobby.link1':"Search the registry ↗",
    'lobby.link2':"Recently published mandates ↗",
    'lobby.link3':"Lobbying Commissioner ↗",
    // Petitions
    'pet.sub':"Real e-petitions currently open for signature — recorded June 23, 2026",
    'pet.info':"Each petition above is reproduced as-is from the National Assembly's official list, with a link to the official page where you can find and sign it. The signature count shown is the one recorded at the last update — for the exact, current count, or to sign, use the \u201cFind and sign on assnat.qc.ca\u201d link on each card.",
    // Where this data comes from
    'apropos.sources.h':"Public sources used here",
    'apropos.sources.p':"<b style=\"color:var(--ink)\">Bills</b> — Données Québec, the National Assembly's official dataset, updated in real time.<br><b style=\"color:var(--ink)\">Bill details</b> (sponsor, current stage, full text as PDF) — assnat.qc.ca, each bill's individual page.<br><b style=\"color:var(--ink)\">Bill summaries</b> — generated by artificial intelligence (Claude API) from the official full text as introduced; every summary is labelled as such on the site.<br><b style=\"color:var(--ink)\">Vote registry</b> — assnat.qc.ca, the detail page of every recorded vote across the 3 sessions of the 43rd Legislature, including each MNA's name and party.<br><b style=\"color:var(--ink)\">Cabinet</b> — quebec.ca, the official Council of Ministers page, scraped live.<br><b style=\"color:var(--ink)\">MNAs and official emails</b> — assnat.qc.ca, the official list of sitting MNAs.<br><b style=\"color:var(--ink)\">Petitions</b> — assnat.qc.ca, the official list of open petitions.<br><b style=\"color:var(--ink)\">Attendance (%)</b> — computed from the vote registry above (see the glossary definition); no external source.",
    'apropos.missing.h':"What's missing for a real production site",
    'apropos.missing.p':"1. <b style=\"color:var(--ink)\">A backend that queries these sources automatically</b> (e.g. a scheduled task that re-reads the vote registry and the bill feed every day) and writes them to a real database.<br>2. <b style=\"color:var(--ink)\">Hosting</b> for this backend and database (e.g. Vercel + Supabase/Postgres, or a classic Node server).<br>3. <b style=\"color:var(--ink)\">The by-MNA vote detail</b>, to be extracted from the official registry — the single biggest missing piece for fully answering \u201cwho voted for what.\u201d<br>4. <b style=\"color:var(--ink)\">An attendance proxy</b>: the Assembly doesn't publish attendance as such; the best public indicator is an MNA's participation rate in recorded votes (the method used by media outlets such as Radio-Canada and The Canadian Press).",
    'apropos.claude.p':"I can write this backend and help you deploy it when you're ready — this is exactly the kind of project where <b style=\"color:var(--ink)\">Claude Code</b> is especially useful, because it can work directly inside a repository, run sync scripts, and iterate on deployment with you.",
    // Overview page
    'apercu.composition.sub':"43rd Legislature · breakdown by parliamentary group",
    'apercu.recent.sub':"↓ Click anywhere in the white square to see the summary ↓",
    'maj.h':"Site updates",
    'sujet.apercu':"Quebec's National Assembly in plain language",
    'sujet.ministres':"Quebec ministers and MNAs",
    'sujet.projets':"Quebec bills",
    'sujet.votes':"Recorded divisions at the National Assembly",
    'sujet.promesses':"2026 election promises",
    'sujet.lexique':"National Assembly glossary",
    'fil.accueil':"Home",
    'fil.ministres':"Ministers and MNAs",
    'fil.projets':"Bills",
    'fil.votes':"Votes",
    'fil.promesses':"Promises",
    'fil.lexique':"Glossary",
    'fil.bd':"Site updates",
    'footer.abonnement':"Subscription",
    'nav.mondossier':"My file",
    'sujet.mondossier':"My file",
    'fil.mondossier':"My file",
    'mdhero.l1':"Your bills,",
    'mdhero.l2':"your members, your alerts.",
    'mdhero.sub':"What you follow at the National Assembly, and what gets sent to you. <b>Your city's decisions live in <a class=\"md-lien\" href=\"/mes-dossiers\">My files</a>, separately.</b>",
    'lp.titre':"How to read vote attendance",
    'lp.lien':"Full definition → Glossary",
    'lp.formule':"<b>88%</b>: out of 100 recorded votes held since their first vote of the legislature, the person voted in 88 — yea, nay or abstention, whichever way.",
    'lp.debut':"The count starts at each person's first vote: someone elected mid-term is not counted absent from votes held before they arrived.",
    'lp.pres':"<b>—</b>: the Assembly's President* and its three Vice-Presidents. To stay neutral, they vote little or not at all: a low rate would not mean they were absent.",
    'lp.aster2':"** Updated every morning: the site rereads the Assembly's register of votes and recalculates each person's rate, then the median, the colours and the numbers above. A vote held one day shows up the next; during the dissolution, nothing changes.",
    'lp.aster':"* The Assembly's President is not the same as the Premier: the President runs the debates and stays neutral, while the Premier heads the government and votes like the other members. <a href=\"/lexique#role-presidence\">See the Assembly's presidency in the Glossary →</a>",
    'lp.nd':"<b>n/a</b>: no recorded vote for this person.",
    'lp.officiel':"This is not an official measure: the Assembly does not publish attendance, and a missed vote does not tell why.",
    'promo.sur':"DossierQuébec subscription",
    'promo.h':"Get alerted when a bill changes status",
    'promo.p':"Follow a bill in one click: an email in the morning when it moves to its next stage, when an elected member you follow introduces one, or when a new bill contains your keywords. One email, everything together, nothing on the days when nothing moves.",
    'promo.diss':"The bills of the 43rd legislature died when the Assembly was dissolved on August 27: following and alerts will start with the first bills of the new legislature, convened on November 17, 2026.",
    'promo.cta':"Get my alerts — $10/month",
    'promo.prix':"or $96 a year · cancel anytime",
    'promo.compte.h':"Your account",
    'promo.villes.h':"Also included: following the cities",
    'promo.villes.p':"The same subscription also alerts you to decisions in <a href=\"/quebec/\">Québec City</a>, <a href=\"/montreal/\">Montréal</a>, <a href=\"/levis/\">Lévis</a>, <a href=\"/longueuil/\">Longueuil</a> and <a href=\"/laval/\">Laval</a>: the projects you follow, your street, your neighbourhood, an organization. One subscription, not one per city — the cities have their own page, My files.",
    'promo.villes.lien':"Pick a city project in My files →",
    'promo.limites':"<b>With the subscription:</b> 10 follows in all — bills, city projects, keywords and organizations share one count — plus the ministers and MNAs of your choice, with no limit. Without a subscription: 3 bills or city projects.",
    'promo.mesdossiers':"My file →",
    'footer.villes':"Cities:",
    'maj.sub':"What changed on DossierQuébec, newest first",
    'bd.intro1':"Hi! My name is",
    'bd.intro3':"I'm 45, and I'm the idea behind this site.",
    'h.petitionsrecent':"Petitions open right now",
    'apercu.petitions.sub':"Click the \u201cPetitions\u201d tab for the full list",
    'quicknav.label':"Jump to:",
    'footer.rss':"RSS feed",
    'quicknav.mission':"Our mission",
    'quicknav.composition':"Composition",
    'quicknav.projets':"Bills",
    'quicknav.quoideneuf':"What's new",
    'quicknav.petitions':"Petitions",
    'footer.etmoi':"and me",
    'footer.coffee':"Buy me a coffee",
    'bd.back':"← Back to overview",
    'quicknav.personnes':"Who's involved",
    'quicknav.lobby':"Lobbyist registry",
    'quicknav.lexiqueitem':"Glossary",
    'quicknav.apropos':"Where this data comes from",
    'quicknav.ministres':"Cabinet",
    'quicknav.deputes':"Rest of the Assembly",
    'quicknav.comparateur':"Ministers comparator",
    'snooze.label':"😴 Collapse",
    'mission.h':"Our mission — why this isn't just a copy of the National Assembly's website",
    'mission.intro':"<b>This is an independent citizen-run site built with real public data from the Assemblée nationale du Québec and Données Québec.</b>",
    'mission.p':"The National Assembly's official site is the most reliable source that exists, and this site never tries to replace it — only to make it easier to follow for someone who doesn't have time to dig through parliamentary procedure menus.",
    'mission.assnat.tag':"What assnat.qc.ca does",
    'mission.assnat.1':"Organizes everything by official document",
    'mission.assnat.2':"The complete, legally authoritative source for everything",
    'mission.assnat.3':"Neutral — never compares or summarizes",
    'mission.site.tag':"What this site tries to do",
    'mission.site.1':"Organizes everything by person: one profile, all their files",
    'mission.site.2':"Translates the jargon into plain language (see the Glossary)",
    'mission.site.3':"Lets you follow what affects you, with no judgment or verdict",
    'intro.compact.text':"Independent citizen-run site · Our mission",
    'intro.show':"😴 Show",
    'intro.hide':"😴 Collapse",
    // Roadmap statuses
    'rm.status.now':"Already there", 'rm.status.later':"To do", 'rm.status.next':"Next step",
    'rm.status.dropped':"Idea explored, dropped for now", 'rm.status.caution':"To do — extra caution",
    'rm.status.verified':"To do — verifiable approach only", 'rm.status.laterlabel':"Later",
    // Roadmap items
    'rm.1.h':"Follow ministers, no account needed",
    'rm.1.p':"The \u201cFollow\u201d button (Cabinet tab) already works: your choice is saved in your browser. Current limit: it won't follow you if you switch devices or clear your browsing data.",
    'rm.2.h':"Priority issues — visitor voting",
    'rm.2.p':"Removed from the site for now, kept here as an idea to revisit later.",
    'rm.2.r1':"<b style=\"color:var(--ink)\">The idea:</b> a tab where visitors propose an issue that affects them (e.g. \u201cprisons no longer do their rehabilitation job\u201d) and vote for the ones that should take priority — a sentiment barometer, not an official poll.",
    'rm.2.r2':"<b style=\"color:var(--ink)\">What already worked in an earlier version:</b> votes were genuinely shared across all site visitors, in real time.",
    'rm.2.r3':"<b style=\"color:var(--ink)\">Its honest limit:</b> without a user account, nothing stops someone from re-voting by switching browsers — so not representative of a real popular vote.",
    'rm.2.r4':"<b style=\"color:var(--ink)\">Worth remembering:</b> the National Assembly already has its own official e-petition system, which obliges a minister to respond publicly — a channel with real weight, unlike this barometer.",
    'rm.2.link':"See the real petition system on assnat.qc.ca →",
    'rm.3.h':"User accounts (email or Google)",
    'rm.3.p':"Done: magic-link (email) sign-in via Supabase Auth — no password to manage. Followed ministers and MNAs now sync across devices for signed-in visitors (a `follows` table, protected by security rules — each person only sees their own follows). Signed-out visitors keep local, browser-only follows, as before.",
    'rm.4.h':"Voluntary donations to support the project",
    'rm.4.p':"Decision already made: no advertising on this site, a “support the project” model with a voluntary donation (Stripe). <b style=\"color:var(--ink)\">Underway:</b> a sole proprietorship registration has been submitted to the Quebec business registrar (waiting on the business number, usually 24-72 business hours after payment). Once received: opening a Stripe account, then a simple Stripe payment link (“Customers choose what to pay”, open amount) — no server needed for this step, just a button pointing to that link. No automatic recurring donation for now (needs a different setup, worth revisiting later if useful). Below the 30,000 dollars/year threshold, no GST/QST registration is required.",
    'rm.5.h':"Ministers' career history",
    'rm.5.p':"Discussed, then deliberately dropped: LinkedIn (and official bios) already cover this for most ministers, and piecing together all 27 career paths by hand, one by one, from scattered press releases and articles doesn't seem like a good effort-to-value tradeoff compared to the site's other priorities (vote registry, user accounts). Kept here for the record, not as an active task.",
    'rm.6.h':"Side-by-side comparison of two ministers",
    'rm.6.p':"Done, in the Cabinet tab: pick two ministers from the dropdowns, their files show up in columns — portfolio, party, riding, real attendance, bills sponsored. What used to block this (vote participation) is now resolved. No “previous positions” row: that item was deliberately dropped higher up this list (LinkedIn and official bios already cover it), so no invented data to fill that cell.",
    'rm.6.r1':"<b style=\"color:var(--ink)\">What this is not:</b> not a ranking (“best/worst minister”) — just the same facts, twice, side by side. Same spirit as the rest of the site: verifiable facts, not judgment.",
    'rm.7.h':"Detailed calendar of upcoming sittings, day by day",
    'rm.7.p':"Currently, the What's New tab only shows the general rules of the parliamentary calendar (when the Assembly generally sits), not a precise schedule of upcoming sittings and committees. Same technical wall as the vote registry: the official calendar page loads its content via JavaScript.",
    'rm.8.h':"Automatic alerts (email)",
    'rm.8.p':"Done: a weekly email digest. Follow a bill (“Follow” button) or ask for an explanation on it, and you'll get a summary when it changes stage — one email a week, never one per change, to avoid fatigue. Sent by a scheduled cloud job (Vercel) that re-reads Données Québec each week and only writes to the people concerned. You only get what you follow; stop anytime by unfollowing.",
    'rm.9.h':"Search expanded to bills' full text",
    'rm.9.p':"The current keyword search looks through titles and the AI summaries generated from the full text (see the item above), but not the full text itself. A very specific word that only appears in the bill's actual text (not in the summary) won't surface anything yet. Indexing the full text for search is a separate project from the summary itself.",
    'rm.10.h':"Minister rating system (report card by issue)",
    'rm.10.p':"Discussed, then deliberately dropped: it would shift the site from \u201cI report verifiable facts\u201d to \u201cI pass judgment on real people,\u201d without a solid methodology behind it. Kept here for the record, not as an active task.",
    'rm.11.h':"Campaign promises vs. government actions — for all parties",
    'rm.11.p':"Proof of concept below. Non-negotiable rule if this gets generalized: never a \u201ckept / broken\u201d verdict written by me — only the promise and the action, each sourced, placed side by side so the reader can judge for themselves. This has to cover the platform of <b style=\"color:var(--ink)\">every party represented in the Assembly</b> (CAQ, PLQ, PQ, QS, PCQ), not just the one in power — otherwise the site would look like it's only scrutinizing one party, which would be unfair and would hurt the credibility of the whole site.",
    'rm.11.r1':"No verdict from me here — just the promise as reported, and the government action as reported, each with its source. It's up to you to judge whether one answers the other.",
    'rm.11.t1':"Reported promise", 'rm.11.t2':"Reported government action",
    'rm.11.t3':"During the CAQ leadership race, Christine Fréchette promised to reopen the Québec Experience Program (PEQ) for two years, with a grandfather clause for immigrants already in Québec when it closed. <a href=\"https://www.lapresse.ca/actualites/politique/2026-04-21/nouveau-conseil-des-ministres/christine-frechette-promet-un-souffle-nouveau-a-son-gouvernement.php\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Source →</a>",
    'rm.11.t4':"On April 21, 2026, responsibility for implementing this PEQ reopening was given to François Bonnardel, appointed Minister of Immigration. <a href=\"https://www.lapresse.ca/actualites/politique/2026-04-21/nouveau-conseil-des-ministres/christine-frechette-promet-un-souffle-nouveau-a-son-gouvernement.php\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Source →</a>",
    'rm.11.r2':"Objective status: responsibility assigned. No concrete bill or order-in-council found yet confirming implementation — to be checked as future sessions unfold.",
    'rm.12.h':"By-MNA vote detail (who voted what)",
    'rm.12.p':"Done: all 735 recorded votes from the 3 sessions of the 43rd Legislature, with each MNA's name and party for every vote (Yea/Nay/Abstention) — on top of the totals already shown before. Scraped directly from the official registry's detail pages (one per vote), not an estimate. Open “View names by MNA” on any vote in the Votes tab for a real example.",
    'rm.12.r1':"<b style=\"color:var(--ink)\">Matching to bills:</b> 64 of the 735 votes are automatically linked to the right bill in the Bills tab, always verifying the title — even when only one candidate exists for a given number (a real collision was found and fixed: the different 2023 Bill 10 had first been wrongly linked to the 2026 Bill 10 simply because the old one had been excluded from tracking). The rest are procedural motions with no associated bill, or bills already fully enacted and therefore outside this site's tracked “current business” scope.",
    'rm.12.r2':"<b style=\"color:var(--ink)\">Useful detail:</b> the party shown next to each name is the one on record at the time of the vote, not the MNA's current party — useful for spotting floor crossings since.",
    'rm.13.h':"AI summaries based on the full bill text",
    'rm.13.p':"Done for all 120 active bills: a short 3-to-7-bullet summary, written by the Claude API from the actual full text (PDF) as introduced, not just the title. Real cost: about $4 USD for the whole set. Open any summary in the Bills tab for a real example.",
    'rm.13.r1':"<b style=\"color:var(--ink)\">What it covers:</b> the concrete changes that affect people (numbers, obligations, bans, new bodies), in plain language, never a value judgment.",
    'rm.13.r2':"<b style=\"color:var(--ink)\">Its honest limit:</b> the summary covers the text as introduced, not necessarily the final version after committee amendments — that's stated directly on every summary. For 2 bills out of 120, the retrieved PDF was just a procedural document with nothing to summarize; the site says so instead of inventing content.",
    'rm.13.r3':"<b style=\"color:var(--ink)\">Related next step:</b> index this full text for keyword search (see the item above), and eventually summarize the final version rather than the one as introduced, time permitting.",
    'rm.14.h':"Public contact badges (email)",
    'rm.14.p':"Done for the 27 ministers and 125 MNAs: the official email (assnat.qc.ca) is shown directly next to the party badge, in the Ministers tab. Scraped in a single fetch of the index page (the table already listed everyone's email). Social media (LinkedIn, Facebook, Instagram) is deliberately left out: those accounts aren't listed anywhere official, and finding them by name search would risk mixing up people with the same name or landing on a fake account — no reliable way to verify the match yet.",
    'rm.15.h':"Lobbyist registry — who declares wanting to influence whom, on what subject",
    'rm.15.p':"Québec has a real official registry (Carrefour Lobby Québec) where every lobbyist must publicly declare who they represent, which department or agency they're approaching, and on what subject. <b style=\"color:var(--ink)\">Why it's not done:</b> checked — it's not just a page that loads its content via JavaScript (that alone would be workable, see the vote registry). The search form is protected by reCAPTCHA (Google), a deliberate anti-automation measure, not just a technical wall. Bypassing a reCAPTCHA to scrape at scale wouldn't be an honest practice, whatever the tool — so this is dropped for now, not a matter of time or technical effort. <b style=\"color:var(--ink)\">Step taken:</b> confirmed no dataset yet exists on Données Québec for this registry (0 search results); an open-data publication request has been drafted for Données Québec (pilote@donneesquebec.ca), to be sent by the person behind this project rather than through any automated mechanism.",
    'rm.16.h':"Synced follows across devices",
    'rm.16.p':"Once accounts are in place, \u201cFollow a minister\u201d and votes will be saved to your account instead of your browser — fixing both current limits at once.",
    'rm.18.h':"Ask for an explanation on a bill (+ possible petition)",
    'rm.18.p':"Done: in the Bills tab, any signed-in person can ask for an explanation on an active bill — never one already enacted, always verified against real data (never a made-up number). One request per person per bill, thanks to user accounts (prevents stuffing). <b style=\"color:var(--ink)\">Anti-troll limit:</b> a maximum of 10 requests per account per month, enforced by a server-side security rule (can't be bypassed from the browser) — stops one account from flooding the system by flagging every bill at once. The real count is only visible to designated admin accounts — not public for now. <b style=\"color:var(--ink)\">Real limit of the official system:</b> a petition to the National Assembly must be tabled by an MNA, who can refuse to present it — so what comes next (finding an MNA willing to sponsor it, a Facebook post, tabling the petition) stays a manual process, not automated. <b style=\"color:var(--ink)\">Watch closely:</b> same risk as the minister rating system dropped above — the numbers are shown raw, without interpretation, never as a judgment, to stay true to the ‘never a verdict on real people’ rule.",
    'rm.17.h':"English version of the site",
    'rm.17.p':"Done: the \u201cEnglish\u201d button (top of the site) translates the whole interface, plus the detailed content — bills, ministers, votes, glossary, petitions, roadmap. The official titles for Bills 1, 7, and 13 come from the real English pages on assnat.qc.ca; the other titles and summaries are my own translation, not yet checked word-for-word against the official site.",
  }
};
let currentLang = 'fr';

function t(key){ return (translations[currentLang] && translations[currentLang][key]) || key; }

// Mémorise le HTML français d'origine de chaque élément traduit, une seule fois.
// Sans ça, un aller-retour FR→EN→FR laissait en anglais tout élément qui n'a
// pas d'entrée française explicite (le français venait du HTML inline, écrasé
// par l'anglais et jamais restauré). On restaure maintenant cet original.
const i18nOriginals = new WeakMap();
function applyLanguage(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if(!i18nOriginals.has(el)) i18nOriginals.set(el, el.innerHTML);
    const entry = translations[currentLang] && translations[currentLang][key];
    el.innerHTML = (entry !== undefined) ? entry : i18nOriginals.get(el);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder');
    const entry = translations[currentLang] && translations[currentLang][key];
    if(entry !== undefined){ el.placeholder = entry; }
  });
  { const _e = document.getElementById('langToggle'); if(_e) _e.textContent = currentLang === 'fr' ? 'English' : 'Français'; }
  document.body.classList.toggle('lang-en', currentLang === 'en');
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'fr';
  { const _e = document.getElementById('footerLeft'); if(_e) _e.textContent = t('footer.left'); }
  { const _e = document.getElementById('footerRight'); if(_e) _e.textContent = t('footer.right'); }
  // Re-render dynamic lists so their JS-generated buttons pick up the new language
  renderHemicycle();
  renderLegendePresence();
  renderPartyFilters();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderStatusFilters();
  renderStepFilters();
  updateSortToggleLabel();  updateMinistresSortLabel();
  renderAccountBox();
  renderFlagBox();
  renderAdminFlagCounts();
  renderComparateurSelects();
  renderComparateurTable();
  renderBills();
  renderDeputes(document.getElementById('searchMinistres')?.value);
  renderVotes();
  renderApercuBills();
  renderApercuPetitions();
  renderNews();
  renderChallenged();
  renderPromises();
  renderJournal();
  document.querySelectorAll('.snooze-pill').forEach(pill=>{
    // La pastille de l'intro compacte (#introCompact) n'a pas de <span> imbriqué
    // comme les autres — sans ce repli, ça plantait ici et bloquait tout le
    // reste du chargement de la page (y compris l'authentification).
    const isCollapsed = pill.classList.contains('snoozed');
    const labelSpan = pill.querySelector('span') || pill;
    labelSpan.textContent = isCollapsed ? (currentLang==='en' ? '😴 Show' : '😴 Afficher') : (currentLang==='en' ? '😴 Collapse' : '😴 Réduire');
  });
  // Le <title> suit la langue ET l'onglet courant (déduit de l'URL).
  if(typeof syncTitle === 'function') syncTitle(viewFromPath());
  if(typeof applyAssemblyState === 'function') applyAssemblyState();
  // L'infobulle de la bascule de thème suit la langue elle aussi.
  if(typeof appliquerTheme === 'function') appliquerTheme();
}

/* Corrige les textes statiques qui deviennent FAUX pendant une dissolution —
   les député·e·s ne sont plus en poste. Piloté par ASSEMBLY.dissolved : quand
   la nouvelle législature commencera, ces textes reprennent leur version i18n
   d'origine sans autre intervention. Appelé à la fin d'applyLanguage (donc
   APRÈS le remplacement des data-i18n, sinon il serait écrasé). */
function applyAssemblyState(){
  if(typeof ASSEMBLY === 'undefined' || !ASSEMBLY.dissolved) return;
  const isEn = currentLang === 'en';
  // ENTRE LE SCRUTIN ET LA NOUVELLE LÉGISLATURE : le site ne doit pas annoncer au
  // futur une élection qui a eu lieu. La phase vient de la date locale du
  // visiteur (ASSEMBLY.phase) — rien à faire le matin du 6. Le résultat, lui,
  // n'apparaît que si quelqu'un l'a écrit dans ASSEMBLY.resultat.
  if(ASSEMBLY.phase === 'entre-deux'){
    const cal = document.querySelector('[data-i18n="cal.status"]');
    if(cal) cal.textContent = isEn
      ? '● Assembly dissolved on August 27, 2026 · election held October 5 · new legislature November 17'
      : '● Assemblée dissoute le 27 août 2026 · élection tenue le 5 octobre · nouvelle législature le 17 novembre';
    const h = document.querySelector('[data-i18n="diss.h"]');
    if(h) h.textContent = isEn
      ? '⚠️ The Assembly is dissolved — the election was held on October 5'
      : '⚠️ L\'Assemblée est dissoute — l\'élection a eu lieu le 5 octobre';
    const p1 = document.querySelector('[data-i18n="diss.p1"]');
    if(p1) p1.innerHTML = isEn
      ? 'On <b>August 27, 2026</b>, the National Assembly was dissolved and the 43rd legislature ended. The general election was held on <b>October 5</b>. The new Assembly is convened on <b>November 17, 2026</b>; until then, the government stays in place to handle current business.'
      : 'Le <b>27 août 2026</b>, l\'Assemblée nationale a été dissoute et la 43<sup>e</sup> législature a pris fin. L\'élection générale a eu lieu le <b>5 octobre</b>. La nouvelle Assemblée est convoquée le <b>17 novembre 2026</b> ; d\'ici là, le gouvernement reste en place pour expédier les affaires courantes.';
    const res = document.getElementById('dissResultat');
    const txt = isEn ? (ASSEMBLY.resultatEn || ASSEMBLY.resultat) : ASSEMBLY.resultat;
    if(res){ res.hidden = !txt; res.textContent = txt || ''; }
    if(typeof renderTicker === 'function') renderTicker(); // il lit cal.status
  }
  // Le titre et le sous-titre des pétitions annonçaient des pétitions
  // « actuellement ouvertes pour signature », ce qui contredisait l'avis affiché
  // juste en dessous (aucune ne peut être signée pendant la dissolution).
  const pTitre = document.querySelector('[data-i18n="h.petitions"]');
  if(pTitre) pTitre.textContent = isEn ? 'Petitions at the National Assembly' : 'Pétitions à l\'Assemblée nationale';
  const pSub = document.querySelector('[data-i18n="pet.sub"]');
  if(pSub) pSub.textContent = isEn
    ? 'No petition can be signed while the Assembly is dissolved'
    : 'Aucune pétition ne peut être signée pendant la dissolution de l\'Assemblée';
  const h = document.querySelector('#deputesTitle h2');
  if(h) h.textContent = isEn ? 'The outgoing Assembly' : 'L\'Assemblée sortante';
  const note = document.querySelector('#deputesTitle .head-note');
  if(note) note.textContent = isEn ? 'All parties — 125 seats before dissolution' : 'Tous les partis — 125 sièges avant la dissolution';
  const box = document.getElementById('deputesInfoBox');
  if(box) box.textContent = isEn
    ? 'The Assembly was dissolved on August 27, 2026: these 125 people are no longer members — they are the outgoing members of the 43rd legislature (now candidates, or stepping down). Their voting record below is the record of that legislature.'
    : 'L\'Assemblée a été dissoute le 27 août 2026 : ces 125 personnes ne sont plus députées — ce sont les sortant·e·s de la 43e législature (maintenant candidat·e·s, ou qui se retirent). Leur bilan de votes ci-dessous reste celui de cette législature.';
}

document.getElementById('langToggle')?.addEventListener('click', ()=>{
  currentLang = currentLang === 'fr' ? 'en' : 'fr';
  applyLanguage();
  if(typeof renderTicker === 'function') renderTicker(); // le ticker suit la langue
});

/* ---------------- DATA ---------------- */

// Couleurs des partis — au plus proche des vraies identités visuelles, tout en
// restant distinguables (CAQ cyan clair, PCQ bleu royal, PQ bleu foncé : trois
// bleus séparés par la clarté, comme dans la vraie vie politique québécoise).
const partyColors = { CAQ:'#00A5CF', PLQ:'#E23A3A', QS:'#FF7B33', PQ:'#12429B', PCQ:'#3E63B0', IND:'#8B8578' };
// Refonte : badges de parti à fond PLEIN — couleur de texte lisible par parti
// (noir sur cyan/orange clairs, blanc sur les foncés).
const partyTextColors = { CAQ:'#131313', QS:'#131313', PLQ:'#fff', PQ:'#fff', PCQ:'#fff', IND:'#fff' };
function partyText(p){ return partyTextColors[p] || '#fff'; }

// Répartition réelle approximative des groupes à la 43e législature (Ass. nat. du Québec)
const seats = [
  {party:'CAQ', label:'Coalition avenir Québec (gouvernement)', labelEn:'Coalition avenir Québec (government)', n:79},
  {party:'PLQ', label:'Parti libéral du Québec (opposition officielle)', labelEn:'Québec Liberal Party (official opposition)', n:18},
  {party:'QS', label:'Québec solidaire', labelEn:'Québec solidaire', n:11},
  {party:'IND', label:'Indépendants', labelEn:'Independents', n:9},
  {party:'PQ', label:'Parti québécois', labelEn:'Parti Québécois', n:7},
  {party:'PCQ', label:'Parti conservateur du Québec', labelEn:'Conservative Party of Québec', n:1},
];






// Stepper simplifié à 3 étapes pour l'affichage. Les données gardent la pleine
// granularité officielle (b.step de 1 à 5, régénéré chaque jour par les scrapers) ;
// displayStep() replie « Adoption du principe » (2) et « Prise en considération » (4)
// dans « Étude détaillée » — assez précis pour un lecteur pressé, et le détail réel
// reste visible dans la note de chaque carte (« Adoption du principe le … »).
const steps = ['Présentation','Étude détaillée','Adoption / Sanction'];
const stepsEn = ['Introduction','Detailed study','Passage / Assent'];
function displayStep(step){
  if(step === null || step === undefined) return step;
  return step <= 1 ? 1 : (step >= 5 ? 3 : 2);
}

// Votes réels du registre des votes de l'Assemblée nationale (43e législature,
// sessions 1 à 3) — voir scrapers/votes.js pour le scraper et
// scrapers/build-votes-data.js pour l'injection. Chaque entrée du détail
// nominatif (nominal.pour/contre/abstentions) est une paire [ID assnat, parti
// au moment du vote] ; le nom complet est retrouvé via `deputes` (voir
// DEPUTES_DATA_START plus haut) en joignant sur cet ID.



// (le calcul de `deputes` a rejoint chargerDonnees, en haut : il ne peut plus tourner au
//  chargement du script, puisque deputesRaw arrive par le réseau.)

/* ---------------- STORAGE (favoris) ---------------- */
// `window.storage` était une API propre à l'environnement Claude.ai, pas une vraie
// fonction de navigateur — elle n'existe plus une fois le site hébergé ailleurs.
// Remplacée ici par un vrai stockage local (localStorage), avec la même interface
// (.get(key) -> {value} | null, .set(key, value)) pour ne pas toucher aux appels
// existants plus bas. Préfixe pour éviter les collisions avec d'autres clés.
window.storage = {
  async get(key){
    const value = localStorage.getItem('dossierquebec:' + key);
    return value === null ? null : { value };
  },
  async set(key, value){
    localStorage.setItem('dossierquebec:' + key, value);
  }
};

let followed = {};
async function loadFollowed(){
  try{
    const res = await window.storage.get('followed-ministers');
    followed = res ? JSON.parse(res.value) : {};
  }catch(e){ followed = {}; }
}
async function toggleFollow(name){
  followed[name] = !followed[name];
  if(currentUser){
    await upsertFollow('minister', name, followed[name]);
  } else {
    try{ await window.storage.set('followed-ministers', JSON.stringify(followed)); }catch(e){}
  }
  // En vue combinée (voir toggleMinistresSort), un ministre peut être affiché
  // dans la même grille qu'un·e député·e — les deux fonctions de rendu doivent
  // donc rafraîchir ensemble, peu importe qui a déclenché le suivi.
  const kw = document.getElementById('searchMinistres')?.value;
  renderMinistres(kw);
  renderDeputes(kw);
}

let followedDeputes = {};
async function loadFollowedDeputes(){
  try{
    const res = await window.storage.get('followed-deputes');
    followedDeputes = res ? JSON.parse(res.value) : {};
  }catch(e){ followedDeputes = {}; }
}
async function toggleFollowDepute(id){
  followedDeputes[id] = !followedDeputes[id];
  if(currentUser){
    await upsertFollow('depute', id, followedDeputes[id]);
  } else {
    try{ await window.storage.set('followed-deputes', JSON.stringify(followedDeputes)); }catch(e){}
  }
  const kw = document.getElementById('searchMinistres')?.value;
  renderMinistres(kw);
  renderDeputes(kw);
}

// Suivi des projets de loi (21 sept. 2026). Rangé avec les projets des villes, dans
// dossiers_suivis (ville « assemblee », dossier_id « pl:<id> ») : même limite (3 sans
// abonnement, 10 avec, trigger Postgres), même protection des comptes de consultation,
// visible dans Mes dossiers, et l'alerte du matin des abonnés le lit
// (api/alertes-projets.js). Connexion requise : un suivi anonyme ne recevrait rien.
// (L'ancien suivi par `follows` type 'bill' n'a jamais pu s'enregistrer : la contrainte de
// la table n'accepte que 'minister' et 'depute'.)
let followedBills = {};
async function loadFollowedBills(){
  followedBills = {};
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('dossiers_suivis')
    .select('dossier_id').eq('user_id', currentUser.id).eq('ville', 'assemblee');
  if(error){ console.error('loadFollowedBills:', error); return; }
  for(const row of (data || [])){
    const m = /^pl:(\d+)$/.exec(row.dossier_id);
    if(m) followedBills[m[1]] = true;
  }
}
async function toggleFollowBill(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  const b = bills.find(x => x.id === billId);
  if(!b) return;
  if(btn) btn.disabled = true;
  const cle = { user_id: currentUser.id, ville: 'assemblee', dossier_id: 'pl:' + billId };
  const { error } = followedBills[billId]
    ? await supabaseClient.from('dossiers_suivis').delete().eq('user_id', cle.user_id).eq('ville', cle.ville).eq('dossier_id', cle.dossier_id)
    : await supabaseClient.from('dossiers_suivis').upsert(
        { ...cle, numero: 'PL ' + b.num, objet: String(b.title || '').slice(0, 600) },
        { onConflict: 'user_id,ville,dossier_id', ignoreDuplicates: true });
  if(error){
    console.error('toggleFollowBill:', error);
    if(btn) btn.disabled = false;
    // Le plafond vient du trigger : « limite de N suivis atteinte ». Un seul quota pour tout ce
    // qu'on suit — projets de loi, projets de ville, mots-clés, organismes. (« projets » est
    // l'ancien message, gardé tant que le nouveau script SQL n'est pas exécuté.)
    const plafond = Number(/limite de (\d+) (?:projets )?suivis/.exec(error.message || '')?.[1]) || 0;
    if(plafond === 3){
      if(confirm(isEn
        ? 'Without a subscription, you can follow 3 things in all — bills and city projects together (10 with one, plus a morning email when they move). See the subscription?'
        : 'Sans abonnement, on suit 3 choses en tout — projets de loi et projets de ville ensemble (10 avec l’abonnement, et un courriel le matin quand ça bouge). Voir l’abonnement ?')) location.href = '/abonnement?de=assemblee';
    } else if(plafond){
      alert(isEn ? `Limit reached: ${plafond} things followed in all (bills, city projects, keywords, organizations). Remove one in My file first.` : `Limite atteinte : ${plafond} suivis en tout (projets de loi, projets de ville, mots-clés, organismes). Retirez-en un dans Mon dossier d’abord.`);
    } else if(/consultation/i.test(error.message || '')){
      alert(isEn ? 'This is a reading-station account: it cannot change what it follows.' : 'Ce compte est un poste de consultation : il ne peut pas modifier ses suivis.');
    } else {
      alert(isEn ? "Couldn't save. Try again." : 'Impossible d’enregistrer. Réessayez.');
    }
    return;
  }
  followedBills[billId] = !followedBills[billId];
  // Sur place, sans redessiner la liste : la carte ouverte doit le rester, avec le nouvel état.
  for(const bouton of document.querySelectorAll(`button[id^="suivre-"][id$="-${billId}"]`)){
    bouton.textContent = libelleSuivreLoi(followedBills[billId], isEn);
    bouton.classList.toggle('on', !!followedBills[billId]);
    bouton.disabled = false;
  }
}
const libelleSuivreLoi = (suivi, isEn) => suivi
  ? (isEn ? '★ Following — stop' : '★ Suivi — retirer')
  : (isEn ? '☆ Follow this bill' : '☆ Suivre ce projet de loi');
// Un projet de loi « vivant » : pas de dissolution en cours, ET de la législature en cours. Le
// 17 nov. 2026, dissolved repasse à false alors que bills.json porte encore les 143 projets de la
// 43e, tous morts le 27 août, jusqu'à ce que Données Québec publie le premier de la 44e. Aucun
// projet de la 43e n'a d'activité après la dissolution ; tout projet de la 44e en a une après
// newLegislatureOn.
const loiVivante = (b) => !ASSEMBLY.dissolved && String(b.lastActivity || '') >= ASSEMBLY.newLegislatureOn;

/* ---------------- COMPTES (Supabase) ---------------- */
// Auth par lien magique (courriel) — voir scripts/supabase-schema.sql pour la
// table `follows` et ses règles de sécurité (chaque compte ne voit que ses
// propres suivis). Tant que personne n'est connecté, le suivi reste dans
// localStorage comme avant (comportement inchangé pour les visiteurs anonymes).
const supabaseClient = supabase.createClient(
  'https://wfgcqftgtmptfutrbujz.supabase.co',
  'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6'
);
let currentUser = null;

async function upsertFollow(personType, personKey, isFollowed){
  if(!currentUser) return;
  // Supabase ne "throw" pas pour une erreur de requête (RLS refusée, etc.) —
  // elle revient dans `error` sur la réponse normale. Le try/catch seul ne
  // suffit donc pas : il faut vérifier `error` explicitement, sinon un échec
  // silencieux laisse croire que le suivi a été enregistré alors que non.
  try{
    let error;
    if(isFollowed){
      ({ error } = await supabaseClient.from('follows').upsert(
        { user_id: currentUser.id, person_type: personType, person_key: personKey },
        { onConflict: 'user_id,person_type,person_key' }
      ));
    } else {
      ({ error } = await supabaseClient.from('follows').delete()
        .eq('user_id', currentUser.id).eq('person_type', personType).eq('person_key', personKey));
    }
    if(error) console.error('Supabase follow sync error:', error);
  }catch(e){ console.error('Supabase follow sync failed:', e); }
}

async function loadFollowsFromSupabase(){
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('follows')
    .select('person_type, person_key').eq('user_id', currentUser.id);
  if(error){ console.error(error); return; }
  followed = {};
  followedDeputes = {};
  for(const row of (data || [])){
    if(row.person_type === 'minister') followed[row.person_key] = true;
    else if(row.person_type === 'depute') followedDeputes[row.person_key] = true;
  }
}

// Projets de loi pour lesquels CE compte a demandé une explication (bill_flags).
// La RLS n'autorise chaque personne à voir que ses propres lignes — donc ceci ne
// révèle rien sur les autres. Alimente l'état « déjà demandé » du bouton par carte.
let myFlaggedBills = {};
async function loadMyFlagsFromSupabase(){
  myFlaggedBills = {};
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('bill_flags')
    .select('bill_id').eq('user_id', currentUser.id);
  if(error){ console.error('loadMyFlagsFromSupabase failed:', error); return; }
  for(const row of (data || [])) myFlaggedBills[row.bill_id] = true;
}

// Demande une explication sur un projet de loi (bouton par carte, 3 états).
// Réutilise la table bill_flags : RLS + limite mensuelle inchangées, l'insert
// reste réservé au rôle authenticated avec auth.uid() = user_id. Un doublon
// (23505 = déjà demandé) est traité comme un succès.
async function requestExplanation(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  if(btn) btn.disabled = true;

  // 1) Vérifie que la session est ENCORE valide côté serveur (le jeton peut
  //    avoir expiré même si currentUser est encore en mémoire). C'est la cause
  //    la plus fréquente du faux message « limite mensuelle ».
  const { data: fresh, error: authErr } = await supabaseClient.auth.getUser();
  if(authErr || !fresh || !fresh.user){
    if(btn) btn.disabled = false;
    alert(isEn ? 'Your session has expired — please sign in again.' : 'Votre session a expiré — reconnectez-vous.');
    goToAccount();
    return;
  }
  const uid = fresh.user.id;

  const { error } = await supabaseClient.from('bill_flags').insert({ user_id: uid, bill_id: billId });
  if(error && error.code !== '23505'){
    console.error('requestExplanation insert error:', error);
    if(btn) btn.disabled = false;
    // 2) Distingue la VRAIE limite (≥10 en 30 jours) des autres erreurs :
    //    on compte les demandes récentes de la personne (RLS : ne voit que
    //    les siennes) au lieu de supposer que c'est toujours la limite.
    let atLimit = false;
    try{
      const since = new Date(Date.now() - 30*864e5).toISOString();
      const { count } = await supabaseClient.from('bill_flags')
        .select('*', { count: 'exact', head: true }).gte('created_at', since);
      atLimit = (typeof count === 'number' && count >= 10);
    }catch(e){}
    alert(atLimit
      ? (isEn ? "You've reached your monthly limit (10 requests)." : "Vous avez atteint votre limite mensuelle (10 demandes).")
      : (isEn ? ("Couldn't record your request. (" + (error.message || error.code || 'unknown') + ")")
              : ("Impossible d'enregistrer la demande. (" + (error.message || error.code || 'inconnu') + ")")));
    return;
  }
  myFlaggedBills[billId] = true; // succès OU doublon = « challengé »
  if(btn){
    // Bouton réactivé (pas disabled) pour permettre de RETIRER le challenge
    // ensuite. Le libellé indique l'état « challengé + retirer ».
    btn.textContent = isEn ? '✓ Challenged — remove' : '✓ Challengé — retirer';
    btn.title = isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge';
    btn.classList.add('on');
    btn.disabled = false;
  }
  challengedCache = null; renderChallenged(); renderApercuBills(); // le compteur a bougé
}

// Bascule : challenge si pas encore fait, retire si déjà fait.
async function toggleChallenge(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  return myFlaggedBills[billId] ? removeExplanation(billId, btnId) : requestExplanation(billId, btnId);
}

// Retire la demande/challenge de la personne sur ce projet de loi.
async function removeExplanation(billId, btnId){
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  if(btn) btn.disabled = true;
  const { error } = await supabaseClient.from('bill_flags')
    .delete().eq('user_id', currentUser.id).eq('bill_id', billId);
  if(error){
    console.error('removeExplanation delete error:', error);
    if(btn) btn.disabled = false;
    alert(isEn ? ("Couldn't remove your challenge. (" + (error.message || error.code || 'unknown') + ")")
               : ("Impossible de retirer votre challenge. (" + (error.message || error.code || 'inconnu') + ")"));
    return;
  }
  myFlaggedBills[billId] = false;
  if(btn){
    btn.textContent = (btn.classList.contains('ch-demand') ? '✋ ' : '') + (isEn ? 'Ask for an explanation' : 'Demander une explication');
    btn.removeAttribute('title');
    btn.classList.remove('on');
    btn.disabled = false;
  }
  challengedCache = null; renderChallenged(); renderApercuBills();
}

async function signInWithMagicLink(email){
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  return error;
}

async function signOutUser(){
  await supabaseClient.auth.signOut();
}

async function handleMagicLinkClick(){
  const input = document.getElementById('accountEmailInput');
  const note = document.getElementById('accountStatusNote');
  const btn = document.getElementById('magicLinkBtn');
  const isEn = currentLang === 'en';
  const email = input ? input.value.trim() : '';
  if(!email || !note || !btn) return;
  // Désactivé tout de suite pour éviter les clics multiples (donc plusieurs
  // courriels envoyés) pendant que la requête est en cours.
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi en cours…';
  const error = await signInWithMagicLink(email);
  if(error){
    btn.disabled = false;
    if(error.code === 'over_email_send_rate_limit'){
      note.textContent = isEn
        ? 'A link was already sent recently — check your inbox, or wait a bit before trying again.'
        : 'Un lien a déjà été envoyé récemment — vérifiez votre boîte courriel, ou attendez un peu avant de réessayer.';
    } else {
      note.textContent = isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.';
    }
  } else {
    btn.textContent = isEn ? '✓ Link sent' : '✓ Lien envoyé';
    note.textContent = isEn ? `Check your inbox (${email}) for the sign-in link.` : `Vérifiez votre boîte courriel (${email}) pour le lien de connexion.`;
  }
}

// La boîte « Votre compte » de l'encadré d'abonnement, sur l'accueil (gabarit.html,
// #promoCompte). Même connexion par lien que Lexique (signInWithMagicLink), ses propres ids :
// les deux boîtes ne sont jamais sur la même page, mais le gabarit les porte toutes les deux.
// L'état de l'envoi du lien vit hors de la boîte : un changement de langue la redessine, et
// l'envoi en cours (ou fait) ne doit pas redevenir un bouton qu'on peut recliquer.
let promoEnvoi = null; // null | { etat: 'encours' | 'envoye', email }
function renderPromoCompte(){
  const box = document.getElementById('promoCompte');
  if(!box) return;
  const isEn = currentLang === 'en';
  if(currentUser){
    const nom = (currentUser.email || '').split('@')[0] || currentUser.email;
    const echappe = String(nom).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    box.innerHTML = `<p class="promo-compte-note" style="margin:0">${isEn ? 'Signed in as' : 'Connecté comme'} <b>${echappe}</b>. ${isEn ? 'Your followed bills are in <a class="promo-lien" href="/mon-dossier">My file</a>, your city projects in <a class="promo-lien" href="/mes-dossiers">My files</a>.' : 'Vos projets de loi suivis sont dans <a class="promo-lien" href="/mon-dossier">Mon dossier</a>, vos projets de ville dans <a class="promo-lien" href="/mes-dossiers">Mes dossiers</a>.'}</p>`;
    return;
  }
  const saisie = promoEnvoi?.email || document.getElementById('promoEmail')?.value || '';
  const occupe = !!promoEnvoi;
  const libelle = promoEnvoi?.etat === 'envoye' ? (isEn ? '✓ Link sent' : '✓ Lien envoyé')
    : promoEnvoi?.etat === 'encours' ? (isEn ? 'Sending…' : 'Envoi…')
    : (isEn ? 'Get the link' : 'Recevoir le lien');
  const note = promoEnvoi?.etat === 'envoye'
    ? (isEn ? 'Check your inbox for the sign-in link.' : 'Vérifiez vos courriels : le lien de connexion vous attend.')
    : (isEn ? 'No password: a sign-in link arrives by email. A free account follows 3 things in all.' : 'Pas de mot de passe : un lien de connexion arrive par courriel. Le compte gratuit suit 3 choses en tout.');
  box.innerHTML = `<div class="promo-compte-ligne">
      <input type="email" id="promoEmail" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}"${occupe ? ' readonly' : ''}>
      <button class="account-btn" id="promoLienBtn" onclick="handlePromoLink()"${occupe ? ' disabled' : ''}>${libelle}</button>
    </div>
    <p class="promo-compte-note" id="promoNote">${note}</p>`;
  const champ = document.getElementById('promoEmail');
  if(champ && saisie) champ.value = saisie;
  champ?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); handlePromoLink(); } });
}

async function handlePromoLink(){
  const isEn = currentLang === 'en';
  const input = document.getElementById('promoEmail');
  const email = input ? input.value.trim() : '';
  // Un envoi en cours ou déjà fait : Entrée ou un second clic ne renvoient rien.
  if(promoEnvoi) return;
  if(!email || !input.checkValidity()){ input?.focus(); return; }
  promoEnvoi = { etat: 'encours', email };
  renderPromoCompte();
  const error = await signInWithMagicLink(email);
  if(error){
    promoEnvoi = null;
    renderPromoCompte();
    const note = document.getElementById('promoNote');   // la boîte a pu être refaite entre-temps
    if(note) note.textContent = error.code === 'over_email_send_rate_limit'
      ? (isEn ? 'A link was already sent recently — check your inbox, or wait a bit.' : 'Un lien a déjà été envoyé récemment — vérifiez vos courriels, ou attendez un peu.')
      : (isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.');
    return;
  }
  promoEnvoi = { etat: 'envoye', email };
  renderPromoCompte();
}

/* ---------------- /mon-dossier — l'espace de la personne, côté ASSEMBLÉE ----------------
   Les villes ont leur propre page, /mes-dossiers (Martin, 22 sept. 2026 : « complètement
   séparés »). Ici : les projets de loi suivis, les élus suivis, les mots-clés de l'Assemblée et
   l'alerte du matin. Rien de personnel n'est écrit dans le HTML : tout arrive de Supabase, avec
   les règles de sécurité qui font que chaque compte ne voit que ses propres lignes. */
const mdH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let mdPorteeOk = null;   // la colonne portee existe-t-elle ? (scripts/supabase-schema-mots-cles-portee.sql)

// UN SEUL abonnement (Martin, 23 sept. 2026 : « revenons à un seul abonnement ») : il couvre les
// villes et l'Assemblée. Cette page regarde quand même l'accès par le serveur (api/abonnement.js),
// et comprend un champ `acces` s'il apparaît un jour.
async function mdAccesProvince(){
  if(!currentUser) return { plein: false };
  const { data: { session } } = await supabaseClient.auth.getSession();
  const r = await fetch('/api/abonnement', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }, cache: 'no-store' }).catch(() => null);
  const e = r?.ok ? await r.json().catch(() => null) : null;
  // Tant que le serveur ne distingue pas les deux abonnements (pas de champ `acces`), un
  // abonnement actif ouvre tout, comme avant.
  return { plein: e?.acces ? Boolean(e.acces.province) : Boolean(e?.abonne) };
}

function mdVerrou(titre, phrase, isEn){
  return `<div class="md-carte md-verrou">
    <div class="md-carte-tete"><h2>${titre}</h2><span class="md-etiquette">${isEn ? 'subscribers' : 'abonnés'}</span></div>
    <p>${phrase} <a class="md-lien" href="/abonnement?de=assemblee">${isEn ? 'See the subscription' : "Voir l'abonnement"}</a></p>
  </div>`;
}

// UN SEUL quota pour tout ce qu'on suit (Martin, 23 sept. 2026 : « 10 suivis en tout, tous
// mélangés ») : projets de loi, projets de ville, mots-clés et organismes ensemble — 10 avec
// l'abonnement, 3 sans. Les élus suivis n'en font pas partie : ils n'ont jamais eu de plafond, et
// leur en donner un retirerait quelque chose aux comptes existants.
// Le compte vient de la base, pas de l'écran : cette page ne voit pas les suivis de ville. Si une
// des trois lectures échoue, on renvoie `sur: null` et la page n'affiche aucun total plutôt qu'un
// total faux.
async function mdQuota(acces){
  const plafond = acces.plein ? 10 : 3;
  if(!currentUser) return { total: 0, sur: null, parties: null };
  const [d, m, o] = await Promise.all([
    supabaseClient.from('dossiers_suivis').select('ville'),
    supabaseClient.from('alertes_mots_cles').select('portee'),
    supabaseClient.from('organismes_suivis').select('id'),
  ]);
  if(d.error || m.error || o.error) return { total: 0, sur: null, parties: null };
  const dossiers = d.data ?? [], mots = m.data ?? [], org = o.data ?? [];
  const parties = {
    lois: dossiers.filter((x) => x.ville === 'assemblee').length,
    villes: dossiers.filter((x) => x.ville !== 'assemblee').length,
    motsAssemblee: mots.filter((x) => (x.portee ?? 'villes') === 'assemblee').length,
    motsVilles: mots.filter((x) => (x.portee ?? 'villes') !== 'assemblee').length,
    organismes: org.length,
  };
  return { total: dossiers.length + mots.length + org.length, sur: plafond, parties };
}

async function renderMonDossier(){
  if(!document.getElementById('mdCompte')) return;   // pas sur cette page
  const isEn = currentLang === 'en';
  const acces = await mdAccesProvince();
  const quota = await mdQuota(acces);
  mdCompte(isEn, acces, quota);
  mdLois(isEn, acces, quota);
  mdElus(isEn);
  await mdMots(isEn, acces, quota);
  await mdAlerte(isEn, acces);
}

function mdCompte(isEn, acces, quota){
  const abonne = acces.plein;
  const zone = document.getElementById('mdCompte');
  if(!currentUser){
    zone.innerHTML = `<div class="md-carte md-connexion">
      <h2>${isEn ? 'Sign in' : 'Se connecter'}</h2>
      <p>${isEn ? 'One account for DossierQuébec. No password: a sign-in link arrives by email.' : 'Un seul compte pour DossierQuébec. Pas de mot de passe : un lien de connexion arrive par courriel.'}</p>
      <div class="md-ligne">
        <input type="email" id="mdEmail" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}">
        <button class="account-btn" id="mdLienBtn" onclick="mdEnvoyerLien()">${isEn ? 'Get the link' : 'Recevoir le lien'}</button>
      </div>
      <p class="md-note" id="mdNote">${isEn ? 'A free account follows 3 things in all — bills and city projects. The subscription takes it to 10, keywords and organizations included, and adds the alerts.' : 'Un compte gratuit suit 3 choses en tout — projets de loi et projets de ville. L’abonnement monte à 10, mots-clés et organismes compris, et ajoute les alertes.'}</p>
    </div>`;
    document.getElementById('mdEmail')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); mdEnvoyerLien(); } });
    return;
  }
  const merci = new URLSearchParams(location.search).get('abonnement') === 'merci';
  zone.innerHTML = `<div class="md-carte md-compte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Your account' : 'Votre compte'}</h2>
      <button class="md-bouton-doux" onclick="signOutUser()">${isEn ? 'Sign out' : 'Se déconnecter'}</button>
    </div>
    <p>${mdH(currentUser.email)} · ${abonne
      ? `${isEn ? 'subscription active' : 'abonnement actif'} — <a class="md-lien" href="/abonnement?de=assemblee">${isEn ? 'manage' : 'gérer'}</a>`
      : `${isEn ? 'no subscription' : 'pas d’abonnement'} — <a class="md-lien" href="/abonnement?de=assemblee">${isEn ? 'see the subscription' : 'voir l’abonnement'}</a>`}</p>
    <p class="md-note">${isEn ? 'The same subscription also covers the cities, in My files.' : 'Le même abonnement couvre aussi les villes, dans Mes dossiers.'}</p>
    ${quota?.sur ? `<p class="md-note md-quota"><b>${isEn ? `${quota.total} of ${quota.sur} follows used` : `${quota.total} suivis sur ${quota.sur}`}</b> — ${isEn
      ? 'bills, city projects, keywords and organizations share the same count.' : 'projets de loi, projets de ville, mots-clés et organismes comptent ensemble.'}
      ${quota.parties?.villes || quota.parties?.motsVilles || quota.parties?.organismes
        ? `<a class="md-lien" href="/mes-dossiers">${isEn ? 'Your city follows' : 'Vos suivis de ville'}</a>` : ''}
      <br>${isEn ? 'Members you follow are not counted.' : 'Les élus suivis ne comptent pas dans ce total.'}</p>` : ''}
    ${merci && !abonne ? `<p class="md-note">${isEn ? 'Thank you! Waiting for Stripe to confirm the payment, a few seconds… Reload the page.' : 'Merci ! On attend la confirmation du paiement par Stripe, quelques secondes… Rechargez la page.'}</p>` : ''}
    ${merci && abonne ? `<p class="md-note">${isEn ? 'Thank you: your subscription is active. Alerts, keywords and followed members are below.' : 'Merci : votre abonnement est actif. Les alertes, les mots-clés et les élus suivis sont plus bas.'}</p>` : ''}
  </div>`;
}

async function mdEnvoyerLien(){
  const input = document.getElementById('mdEmail');
  const note = document.getElementById('mdNote');
  const btn = document.getElementById('mdLienBtn');
  const isEn = currentLang === 'en';
  const email = input ? input.value.trim() : '';
  if(!email || !input.checkValidity() || !btn || btn.disabled){ input?.focus(); return; }
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi en cours…';
  const error = await signInWithMagicLink(email);
  if(error){
    btn.disabled = false;
    note.textContent = error.code === 'over_email_send_rate_limit'
      ? (isEn ? 'A link was already sent recently — check your inbox, or wait a bit.' : 'Un lien a déjà été envoyé récemment — vérifiez vos courriels, ou attendez un peu.')
      : (isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.');
    return;
  }
  btn.textContent = isEn ? '✓ Link sent' : '✓ Lien envoyé';
  note.textContent = isEn ? `Check your inbox (${email}).` : `Vérifiez vos courriels (${email}).`;
}

function mdLois(isEn, acces, quota){
  const zone = document.getElementById('mdLois');
  const ids = Object.keys(followedBills).filter((id) => followedBills[id]);
  // Le plafond est commun à tout ce qu'on suit : il est affiché une seule fois, dans la carte du
  // compte. Ici, juste le nombre de projets de loi.
  const plafond = quota?.sur ?? (acces.plein ? 10 : 3);
  const suivables = bills.filter((b) => loiVivante(b) && (b.status === 'encours' || b.status === 'laisse_de_cote')).length;
  const vide = !currentUser
    ? (isEn ? 'Sign in to follow bills: what you follow stays with your account, on every device.' : 'Connectez-vous pour suivre des projets de loi : vos suivis restent sur votre compte, sur tous vos appareils.')
    : suivables
      ? `${isEn ? 'No bill followed yet.' : 'Aucun projet de loi suivi.'} <a class="md-lien" href="/projets-de-loi">${isEn ? 'Follow one from the Bills page' : 'Suivez-en un depuis la page Projets de loi'}</a>`
      : (isEn ? 'No bill can be followed right now: the Assembly has no bill under study. The buttons come back with the first bills of the new legislature.' : 'Aucun projet de loi ne peut être suivi pour l’instant : l’Assemblée n’en a aucun à l’étude. Les boutons reviendront avec les premiers projets de la nouvelle législature.');
  const lignes = ids.map((id) => {
    const b = bills.find((x) => String(x.id) === String(id));
    if(!b) return `<li class="md-ligne-loi"><div><b>${isEn ? 'Bill no longer in the current legislature' : 'Projet de loi absent de la législature en cours'}</b>
      <div class="md-note">${isEn ? 'It became law in an earlier session, or its legislature ended.' : 'Il est devenu loi lors d’une session précédente, ou sa législature a pris fin.'}</div></div>
      <button class="md-bouton-doux" onclick="mdRetirerLoi('${mdH(id)}')">${isEn ? 'Stop following' : 'Ne plus suivre'}</button></li>`;
    const note = isEn ? (b.noteEn || b.note) : b.note;
    return `<li class="md-ligne-loi">
      <div>
        <div class="md-loi-tete"><span class="md-pl">PL ${mdH(b.num)}</span> <span class="status-pill ${statusClass(b.status)}">${statusLabel(b.status, b.step)}</span></div>
        <b>${mdH(isEn ? (b.titleEn || b.title) : b.title)}</b>
        <div class="md-note">${mdH(note || '')}</div>
        <div class="md-liens"><a class="md-lien" href="/projets-de-loi?pl=${encodeURIComponent(b.num)}&id=${encodeURIComponent(b.id)}">${isEn ? 'Its card and summary' : 'Sa fiche et son résumé'}</a>
          <a class="md-lien" href="${mdH(isEn ? (b.urlEn || b.url) : b.url)}" target="_blank" rel="noopener">${isEn ? 'On the Assembly’s website ↗' : 'Sur le site de l’Assemblée ↗'}</a></div>
      </div>
      <button class="md-bouton-doux" onclick="mdRetirerLoi('${mdH(b.id)}')">${isEn ? 'Stop following' : 'Ne plus suivre'}</button>
    </li>`;
  }).join('');
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Bills you follow' : 'Projets de loi suivis'}</h2>
      <span class="md-etiquette">${ids.length}</span>
    </div>
    ${ids.length ? `<ul class="md-liste">${lignes}</ul>` : `<p>${vide}</p>`}
    <p class="md-note">${acces.plein
      ? (isEn ? `With the subscription: an email the morning a followed bill moves to a later stage. ${plafond} follows in all${quota?.sur != null ? ', of any kind' : ' — bills and city projects together'}.` : `Avec l’abonnement : un courriel le matin où un projet suivi passe à une étape plus avancée. ${plafond} suivis en tout${quota?.sur != null ? ', de n’importe quelle sorte' : ' — projets de loi et projets de ville ensemble'}.`)
      : (isEn ? `${plafond} follows in all without a subscription — bills and city projects together. 10 with one, keywords and organizations included, plus the morning alert.` : `${plafond} suivis en tout sans abonnement — projets de loi et projets de ville ensemble. 10 avec l’abonnement, mots-clés et organismes compris, et l’alerte du matin.`)}</p>
  </div>`;
}

async function mdRetirerLoi(id){
  await toggleFollowBill(Number(id), null);
  renderMonDossier();
}

function mdElus(isEn){
  const zone = document.getElementById('mdElus');
  const ministres = Object.keys(followed).filter((n) => followed[n]);
  const deps = Object.keys(followedDeputes).filter((k) => followedDeputes[k]);
  const ligne = (nom, sous, onclick) => `<li class="md-ligne-elu"><div><b>${mdH(nom)}</b>${sous ? `<div class="md-note">${mdH(sous)}</div>` : ''}</div>
    <button class="md-bouton-doux" onclick="${onclick}">${isEn ? 'Unfollow' : 'Ne plus suivre'}</button></li>`;
  const lignes = [
    ...ministres.map((n) => ligne(n, ministers.find((m) => m.name === n) ? (isEn ? (ministers.find((m) => m.name === n).roleEn || ministers.find((m) => m.name === n).role) : ministers.find((m) => m.name === n).role) : '', `mdRetirerElu('minister', '${mdH(n).replace(/'/g, "\\'")}')`)),
    ...deps.map((k) => ligne(k.split('|')[0], k.split('|')[1] || '', `mdRetirerElu('depute', '${mdH(k).replace(/'/g, "\\'")}')`)),
  ].join('');
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Members you follow' : 'Élus suivis'}</h2>
      <span class="md-etiquette">${ministres.length + deps.length}</span>
    </div>
    ${lignes ? `<ul class="md-liste">${lignes}</ul>` : `<p>${isEn ? 'No minister or MNA followed yet.' : 'Aucun ministre ni député suivi.'} <a class="md-lien" href="/ministres">${isEn ? 'Follow someone from the Ministers and MNAs page' : 'Suivez quelqu’un depuis la page Ministres et député·e·s'}</a></p>`}
    <p class="md-note">${isEn ? 'With the subscription: an email when someone you follow introduces a bill.' : 'Avec l’abonnement : un courriel quand une personne suivie présente un projet de loi.'}</p>
  </div>`;
}

async function mdRetirerElu(type, cle){
  if(type === 'minister') await toggleFollow(cle); else await toggleFollowDepute(cle);
  renderMonDossier();
}

async function mdMots(isEn, acces, quota){
  const zone = document.getElementById('mdMots');
  const titre = isEn ? 'Your Assembly keywords' : 'Vos mots-clés de l’Assemblée';
  // Un mot-clé prend une place dans le même quota que les projets suivis : on ferme le champ quand
  // il n'en reste plus. Si le total n'a pas pu être lu, on laisse essayer — la base tranchera.
  const plein = quota?.sur ? quota.total >= quota.sur : false;
  if(!currentUser || !acces.plein){
    const verrou = mdVerrou(titre, isEn
      ? 'A topic — “logement”, “forêt”, “électricité” — searched in the title and summary of every new bill. A separate list from your city keywords.'
      : 'Un sujet — « logement », « forêt », « électricité » — cherché dans le titre et le résumé de chaque nouveau projet de loi. Une liste à part de vos mots-clés de ville.', isEn);
    // Un abonnement qui s'arrête ne supprime pas les mots-clés : ils dorment, mais ils occupent
    // toujours une place dans le quota commun. On les montre donc, avec de quoi les retirer —
    // sinon la personne reste bloquée sans comprendre ce qui prend ses places.
    let dormants = [];
    if(currentUser){
      const { data } = await supabaseClient.from('alertes_mots_cles').select('*').order('created_at');
      dormants = (data ?? []).filter((m) => (m.portee ?? 'villes') === 'assemblee');
    }
    zone.innerHTML = verrou + (dormants.length ? `<div class="md-carte">
      <div class="md-carte-tete"><h2>${isEn ? 'Your keywords, asleep' : 'Vos mots-clés, en sommeil'}</h2><span class="md-etiquette">${dormants.length}</span></div>
      <p class="md-note">${isEn ? 'They no longer trigger anything, but they still take up your follows. Remove one to follow a bill instead.' : 'Ils ne déclenchent plus rien, mais ils occupent toujours une place dans vos suivis. Retirez-en un pour suivre un projet de loi à la place.'}</p>
      <ul class="md-mots">${dormants.map((m) => `<li><span class="md-mot">${mdH(m.mot)}</span>
        <button class="md-bouton-doux" onclick="mdRetirerMot('${mdH(m.id)}')" aria-label="${isEn ? 'Remove' : 'Retirer'} ${mdH(m.mot)}">×</button></li>`).join('')}</ul>
    </div>` : '');
    return;
  }
  if(mdPorteeOk === null){
    const essai = await supabaseClient.from('alertes_mots_cles').select('portee').limit(1);
    mdPorteeOk = !essai.error;
  }
  if(!mdPorteeOk){
    zone.innerHTML = `<div class="md-carte"><h2>${titre}</h2><p class="md-note">${isEn ? 'Coming soon: the two keyword lists (cities and Assembly) are not set up on the database yet.' : 'Bientôt : les deux listes de mots-clés (villes et Assemblée) ne sont pas encore en place dans la base.'}</p></div>`;
    return;
  }
  const { data, error } = await supabaseClient.from('alertes_mots_cles').select('*').order('created_at');
  const mots = (data ?? []).filter((m) => (m.portee ?? 'villes') === 'assemblee');
  if(error){ zone.innerHTML = ''; return; }
  const compte = (mot) => bills.filter((b) => mdContientMot(b, mot)).length;
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete"><h2>${titre}</h2><span class="md-etiquette">${mots.length}</span></div>
    <ul class="md-mots">${mots.length ? mots.map((m) => {
      const n = compte(m.mot);
      return `<li><span class="md-mot">${mdH(m.mot)}</span><span class="md-note">${n ? (isEn ? `${n} bill${n > 1 ? 's' : ''} today` : `${n} projet${n > 1 ? 's' : ''} de loi aujourd’hui`) : (isEn ? 'no bill yet' : 'aucun projet de loi pour l’instant')}</span>
        <button class="md-bouton-doux" onclick="mdRetirerMot('${mdH(m.id)}')" aria-label="${isEn ? 'Remove' : 'Retirer'} ${mdH(m.mot)}">×</button></li>`;
    }).join('') : `<li class="md-note">${isEn ? 'No keyword yet.' : 'Aucun mot-clé pour l’instant.'}</li>`}</ul>
    <div class="md-ligne">
      <input type="text" id="mdMotChamp" maxlength="60" placeholder="${isEn ? 'Add a keyword' : 'Ajouter un mot-clé'}" aria-label="${isEn ? 'New keyword' : 'Nouveau mot-clé'}"${plein ? ' disabled' : ''}>
      <button class="account-btn" id="mdMotBtn" onclick="mdAjouterMot()"${plein ? ' disabled' : ''}>${isEn ? 'Add' : 'Ajouter'}</button>
    </div>
    <p class="md-note" id="mdMotEtat">${plein
      ? (isEn ? `All ${quota.sur} follows are used. Remove a bill, a keyword or a city project to add another.` : `Vos ${quota.sur} suivis sont utilisés. Retirez un projet de loi, un mot-clé ou un projet de ville pour en ajouter un autre.`)
      : (isEn ? 'Searched in each bill’s title and French summary, ignoring accents and capitals. A keyword takes one of your follows.' : 'Cherché dans le titre et le résumé de chaque projet de loi, sans tenir compte des accents ni des majuscules. Un mot-clé prend une place dans vos suivis.')}</p>
  </div>`;
  document.getElementById('mdMotChamp')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); mdAjouterMot(); } });
}

// Même recherche que le serveur (api/alertes-projets.js, contientMot) : mot entier, sans accents.
function mdNorm(s){ return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' '); }
function mdContientMot(b, mot){
  const m = mdNorm(mot).trim();
  if(m.length < 2) return false;
  return new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(mdNorm(b.title));
}

async function mdAjouterMot(){
  const champ = document.getElementById('mdMotChamp');
  const etat = document.getElementById('mdMotEtat');
  const isEn = currentLang === 'en';
  const mot = champ ? champ.value.trim().replace(/\s+/g, ' ') : '';
  if(mot.length < 2){ etat.textContent = isEn ? 'A keyword needs at least 2 characters.' : 'Un mot-clé compte au moins 2 caractères.'; return; }
  const { error } = await supabaseClient.from('alertes_mots_cles').insert({ user_id: currentUser.id, mot, portee: 'assemblee' });
  if(error){
    etat.textContent = /limite de/i.test(error.message)
      ? (isEn ? 'Your follows are all used. Remove one first — bills, city projects, keywords and organizations share the same count.' : 'Vos suivis sont tous utilisés. Retirez-en un d’abord — projets de loi, projets de ville, mots-clés et organismes comptent ensemble.')
      : /duplicate|unique/i.test(error.message) ? (isEn ? 'This keyword is already in your list.' : 'Ce mot-clé est déjà dans votre liste.')
      : (isEn ? "Couldn't add this keyword. Try again." : "Impossible d'ajouter ce mot-clé. Réessayez.");
    return;
  }
  renderMonDossier();
}

async function mdRetirerMot(id){
  await supabaseClient.from('alertes_mots_cles').delete().eq('id', id);
  renderMonDossier();
}

async function mdAlerte(isEn, acces){
  const zone = document.getElementById('mdAlerte');
  const titre = isEn ? 'My morning alert' : 'Mon alerte du matin';
  if(!currentUser || !acces.plein){
    zone.innerHTML = mdVerrou(titre, isEn
      ? 'One email in the morning when a followed bill moves, when someone you follow introduces one, or when a new bill contains your keywords. Nothing on the days when nothing moves.'
      : 'Un courriel le matin quand un projet suivi avance, quand une personne suivie en présente un, ou quand un nouveau projet contient vos mots-clés. Rien les jours où rien ne bouge.', isEn);
    return;
  }
  const [pref, envois] = await Promise.all([
    supabaseClient.from('alertes_preferences').select('actif').eq('user_id', currentUser.id).maybeSingle(),
    supabaseClient.from('alertes_envois').select('envoye_le').eq('user_id', currentUser.id).eq('essai', false).order('envoye_le', { ascending: false }).limit(1),
  ]);
  const actif = pref.data?.actif !== false;
  const derniere = envois.data?.[0]?.envoye_le;
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete"><h2>🔔 ${titre}</h2><span class="md-etiquette">${isEn ? 'every morning' : 'chaque matin'}</span></div>
    <label class="md-case"><input type="checkbox" id="mdAlerteActif"${actif ? ' checked' : ''} onchange="mdBasculerAlerte(this.checked)">
      <span>${isEn ? 'Send me the morning email when something moves' : 'M’envoyer le courriel du matin quand quelque chose bouge'}</span></label>
    <p class="md-note">${isEn ? 'The same email also carries your city follows, if you have any.' : 'Le même courriel porte aussi vos suivis des villes, si vous en avez.'}${derniere ? ` ${isEn ? 'Last alert:' : 'Dernière alerte :'} ${mdH(new Date(derniere).toLocaleDateString(isEn ? 'en-CA' : 'fr-CA'))}.` : ''}</p>
    <div class="md-liens"><button class="md-bouton-doux" id="mdEssaiBtn" onclick="mdCourrielEssai()">${isEn ? 'Send me a test email' : 'M’envoyer un courriel d’essai'}</button>
      <span class="md-note" id="mdAlerteEtat" aria-live="polite"></span></div>
  </div>`;
}

async function mdBasculerAlerte(voulu){
  const etat = document.getElementById('mdAlerteEtat');
  const isEn = currentLang === 'en';
  const { error } = await supabaseClient.from('alertes_preferences').upsert({ user_id: currentUser.id, actif: voulu, updated_at: new Date().toISOString() });
  if(etat) etat.textContent = error
    ? (isEn ? "Couldn't save. Try again." : "Impossible d'enregistrer. Réessayez.")
    : voulu ? (isEn ? 'Saved: you will get the morning email.' : 'Enregistré : vous recevrez le courriel du matin.')
      : (isEn ? 'Saved: no more morning email. Your follows stay.' : 'Enregistré : plus de courriel du matin. Vos suivis restent.');
}

async function mdCourrielEssai(){
  const btn = document.getElementById('mdEssaiBtn');
  const etat = document.getElementById('mdAlerteEtat');
  const isEn = currentLang === 'en';
  if(btn) btn.disabled = true;
  if(etat) etat.textContent = isEn ? 'Sending…' : 'Envoi…';
  const { data: { session } } = await supabaseClient.auth.getSession();
  const r = await fetch('/api/alertes-projets?essai=moi', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } }).catch(() => null);
  const corps = r ? await r.json().catch(() => ({})) : {};
  if(btn) btn.disabled = false;
  if(etat) etat.textContent = r?.ok
    ? (corps.envoyes ? (isEn ? `Test email sent to ${currentUser.email}. Check your spam folder.` : `Courriel d'essai envoyé à ${currentUser.email}. Pensez à vérifier vos courriels indésirables.`)
      : (isEn ? 'Follow at least one bill, a member or a keyword to get a test email.' : 'Suivez au moins un projet de loi, une personne ou un mot-clé pour recevoir un courriel d’essai.'))
    : r?.status === 429 ? (isEn ? 'Three test emails already sent in the last 24 hours. Try again tomorrow.' : "Trois courriels d'essai déjà envoyés dans les dernières 24 heures. Réessayez demain.")
      : (isEn ? "Sending didn't work. Try again in a moment." : "L'envoi n'a pas fonctionné. Réessayez dans un moment.");
}

function renderAccountBox(){
  renderPromoCompte();
  renderMonDossier();   // page /mon-dossier : elle se redessine à la connexion et au changement de langue
  if(!document.getElementById('accountBox')) return;   // vue absente de cette page
  const box = document.getElementById('accountBox');
  if(!box) return;
  const isEn = currentLang === 'en';
  if(currentUser){
    const displayName = (currentUser.email || '').split('@')[0] || currentUser.email;
    box.innerHTML = `
      <div class="account-row">
        <span>${isEn ? 'Signed in as' : 'Connecté·e comme'} <span class="account-email">${displayName}</span></span>
        <button class="account-btn" onclick="signOutUser()">${isEn ? 'Sign out' : 'Se déconnecter'}</button>
      </div>
      <div class="account-note">${isEn ? 'The ministers, MNAs, and bills you follow are now synced to your account, across devices.' : 'Les ministres, député·e·s et projets de loi que vous suivez sont maintenant synchronisés à votre compte, entre tous vos appareils.'}</div>
    `;
  } else {
    const saisie = document.getElementById('accountEmailInput')?.value || '';
    box.innerHTML = `
      <div class="account-row">
        <input type="email" id="accountEmailInput" placeholder="${isEn ? 'Your email' : 'Votre courriel'}">
        <button class="account-btn" id="magicLinkBtn" onclick="handleMagicLinkClick()">${isEn ? 'Send magic link' : 'Envoyer un lien de connexion'}</button>
      </div>
      <div class="account-note" id="accountStatusNote">${isEn ? 'Sign in to sync the ministers, MNAs, and bills you follow across devices.' : 'Connectez-vous pour synchroniser les ministres, député·e·s et projets de loi que vous suivez entre vos appareils.'}</div>
    `;
    const champ = document.getElementById('accountEmailInput');
    if(champ && saisie) champ.value = saisie;
  }
}

async function initAuth(){
  // `renderAccountBox()` est toujours appelé dans un `finally` — si le
  // chargement des suivis échoue (réseau, etc.), la barre de compte doit
  // quand même s'afficher plutôt que de rester vide.
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    if(currentUser) await loadFollowsFromSupabase();
    await loadFollowedBills();
    await loadMyFlagsFromSupabase();
  }catch(e){
    console.error('initAuth failed:', e);
  }finally{
    renderAccountBox();
    renderFlagBox();
    renderAdminFlagCounts();
  }

  supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
    // Même personne qu'avant (INITIAL_SESSION juste après initAuth, TOKEN_REFRESHED, SIGNED_IN au
    // retour sur l'onglet) : rien à recharger ni à redessiner. Redessiner refermait la carte qu'un
    // lien ?pl=…&id=… venait d'ouvrir (courriels d'alerte, Mes dossiers).
    if((newSession?.user?.id ?? null) === (currentUser?.id ?? null)){ currentUser = newSession?.user ?? null; return; }
    try{
      currentUser = newSession?.user ?? null;
      if(currentUser) await loadFollowsFromSupabase();
      await loadFollowedBills();
      await loadMyFlagsFromSupabase();
    }catch(e){
      console.error('onAuthStateChange failed:', e);
    }finally{
      renderAccountBox();
      renderFlagBox();
      renderAdminFlagCounts();
    }
    const kw = document.getElementById('searchMinistres')?.value || '';
    renderMinistres(kw);
    renderDeputes(kw);
    renderBills();
    renderApercuBills();
  });
}

/* ---------------- DEMANDES D'EXPLICATIONS (bill_flags) ---------------- */
// Voir scripts/supabase-schema-flags.sql. Contrainte unique côté base de
// données : un compte ne peut demander qu'une fois par projet de loi. Le
// numéro entré est toujours vérifié contre les vraies données `bills` avant
// d'accepter la demande — jamais de projet de loi deviné ou inventé.

const FLAG_MONTHLY_LIMIT = 10; // même limite appliquée côté serveur (RLS) — voir scripts/supabase-schema-flags.sql

async function checkMonthlyFlagCount(){
  if(!currentUser) return 0;
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  const { count, error } = await supabaseClient.from('bill_flags')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .gte('created_at', thirtyDaysAgo);
  if(error){ console.error('checkMonthlyFlagCount failed:', error); return 0; }
  return count ?? 0;
}

// ⚠️ Aucune page ne porte plus `id="flagBox"` depuis le découpage multipage : cette boîte
// (demander une explication par NUMÉRO, avec le compteur de demandes restantes du mois) ne
// s'affiche donc nulle part. Le bouton des cartes fait le même travail ; reste à décider si
// on la remet sur la page du compte ou si on retire la fonction. Constaté le 24 sept. 2026.
async function renderFlagBox(){
  if(!document.getElementById('flagBox')) return;   // vue absente de cette page
  const box = document.getElementById('flagBox');
  if(!box) return;
  const isEn = currentLang === 'en';
  if(!currentUser){
    box.innerHTML = `
      <div class="account-note">${isEn
        ? `Sign in (Account tab) to ask a bill's sponsor for an explanation (up to ${FLAG_MONTHLY_LIMIT} requests per month, to prevent abuse). At 1,000 requests for the same bill, a public post goes up — hoping an MNA agrees to open a petition.`
        : `Connectez-vous (onglet Compte) pour demander des explications sur un projet de loi (jusqu'à ${FLAG_MONTHLY_LIMIT} demandes par mois, pour éviter les abus). À 1000 demandes pour un même projet, une publication publique sera faite — dans l'espoir qu'un·e élu·e accepte d'ouvrir une pétition.`}</div>
    `;
    return;
  }

  // Vérifié côté navigateur pour un message clair — la vraie limite est
  // appliquée par une règle de sécurité côté serveur, impossible à contourner.
  const usedThisMonth = await checkMonthlyFlagCount();
  if(usedThisMonth >= FLAG_MONTHLY_LIMIT){
    box.innerHTML = `
      <div class="account-note">${isEn
        ? `You've reached your limit of ${FLAG_MONTHLY_LIMIT} requests this month. Come back later to ask about another bill.`
        : `Vous avez atteint votre limite de ${FLAG_MONTHLY_LIMIT} demandes ce mois-ci. Revenez plus tard pour demander des explications sur un autre projet de loi.`}</div>
    `;
    return;
  }

  const remaining = FLAG_MONTHLY_LIMIT - usedThisMonth;
  box.innerHTML = `
    <div class="account-note">${isEn
      ? `Enter the number of an active bill (not yet enacted) to ask its sponsor for an explanation. At 1,000 requests for the same bill, a public Facebook post goes up — hoping an MNA agrees to open a petition. (${remaining} of ${FLAG_MONTHLY_LIMIT} requests left this month.)`
      : `Entrez le numéro d'un projet de loi actif (pas encore sanctionné) pour demander des explications à son parrain. À 1000 demandes pour un même projet, une publication publique sera faite sur Facebook — dans l'espoir qu'un·e élu·e accepte d'ouvrir une pétition. (${remaining} demande${remaining>1?'s':''} sur ${FLAG_MONTHLY_LIMIT} restante${remaining>1?'s':''} ce mois-ci.)`}</div>
    <div class="account-row" style="margin-top:10px;">
      <input type="text" id="flagBillNumberInput" inputmode="numeric" placeholder="${isEn ? 'Bill number (e.g. 24)' : 'Numéro du projet de loi (ex. 24)'}" oninput="checkBillNumberInput()">
      <button class="account-btn" id="flagSubmitBtn" onclick="submitBillFlag()" disabled>${isEn ? 'Ask for an explanation' : 'Demander des explications'}</button>
    </div>
    <div class="account-note" id="flagPreview"></div>
  `;
}

function checkBillNumberInput(){
  const input = document.getElementById('flagBillNumberInput');
  const preview = document.getElementById('flagPreview');
  const btn = document.getElementById('flagSubmitBtn');
  if(!input || !preview || !btn) return;
  const isEn = currentLang === 'en';
  const num = parseInt(input.value, 10);
  if(!input.value.trim() || Number.isNaN(num)){
    preview.textContent = '';
    btn.disabled = true;
    delete btn.dataset.billId;
    return;
  }
  const candidates = bills.filter(b => b.num === num && b.status !== 'sanctionne');
  if(candidates.length === 1){
    const b = candidates[0];
    preview.textContent = (isEn ? 'Bill found: ' : 'Projet de loi trouvé : ') + (isEn ? (b.titleEn || b.title) : b.title);
    btn.disabled = false;
    btn.dataset.billId = b.id;
  } else {
    preview.textContent = isEn
      ? 'No active (not yet enacted) bill found with this number.'
      : 'Aucun projet de loi actif (pas encore sanctionné) trouvé avec ce numéro.';
    btn.disabled = true;
    delete btn.dataset.billId;
  }
}

async function submitBillFlag(){
  const btn = document.getElementById('flagSubmitBtn');
  const preview = document.getElementById('flagPreview');
  const input = document.getElementById('flagBillNumberInput');
  if(!btn || !preview || !input || !currentUser) return;
  const isEn = currentLang === 'en';
  const billId = Number(btn.dataset.billId);
  if(!billId) return;
  btn.disabled = true;
  const { error } = await supabaseClient.from('bill_flags').insert({ user_id: currentUser.id, bill_id: billId });
  if(error){
    if(error.code === '23505'){
      preview.textContent = isEn ? "You've already asked for an explanation on this bill." : "Vous avez déjà demandé des explications sur ce projet de loi.";
      btn.disabled = false;
    } else {
      // Inclut le cas où la limite mensuelle est atteinte (refusée par la
      // règle de sécurité côté serveur) — on ne devine pas le message précis,
      // on relaisse renderFlagBox() vérifier le vrai décompte et l'afficher.
      console.error('bill flag insert error:', error);
      await renderFlagBox();
      return;
    }
  } else {
    preview.textContent = isEn ? '✓ Request recorded. Thanks!' : '✓ Demande enregistrée. Merci !';
    input.value = '';
    setTimeout(renderFlagBox, 1200);
  }
}

// Réservé aux comptes listés dans la table `admins` (voir
// scripts/supabase-schema-flags.sql) — les vrais chiffres de demandes par
// projet de loi, rien d'autre que ça. Compté côté navigateur à partir des
// lignes que la politique de sécurité autorise un·e admin à voir en entier
// (tout le monde d'autre ne voit que ses propres demandes).
async function checkIsAdmin(){
  if(!currentUser) return false;
  const { data, error } = await supabaseClient.from('admins').select('user_id').eq('user_id', currentUser.id).maybeSingle();
  if(error){ console.error('checkIsAdmin failed:', error); return false; }
  return !!data;
}

// Paliers de pétition (le seuil monte via le bouton admin « Resend »).
const PETITION_TIERS = [1000, 5000, 25000];

async function renderAdminFlagCounts(){
  if(!document.getElementById('adminFlagCounts')) return;   // vue absente de cette page
  const container = document.getElementById('adminFlagCounts');
  if(!container) return;
  const isAdmin = await checkIsAdmin();
  if(!isAdmin){ container.innerHTML = ''; return; }
  // La page du compte ne charge aucun projet : sans les titres, ce panneau n'affichait que
  // des « #27053 ». Admins seulement, donc jamais payé par un visiteur ordinaire.
  await chargerChallenges();

  const { data, error } = await supabaseClient.from('bill_flags').select('bill_id');
  if(error){ console.error('renderAdminFlagCounts failed:', error); container.innerHTML = ''; return; }
  // État de campagne (seuil courant + escalade en attente) — table bill_campaign.
  const { data: campData } = await supabaseClient.from('bill_campaign').select('bill_id, threshold, escalation_pending');
  const camp = {}; for(const r of (campData || [])) camp[r.bill_id] = r;

  const isEn = currentLang === 'en';
  const counts = {};
  for(const row of (data || [])) counts[row.bill_id] = (counts[row.bill_id] || 0) + 1;
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);

  const rowsHtml = entries.length ? entries.map(([billId, count]) => {
    const bill = projetChallenge(billId);
    const title = bill ? (isEn ? (bill.titleEn || bill.title) : bill.title) : `#${billId}`;
    const c = camp[billId];
    const threshold = c ? c.threshold : PETITION_TIERS[0];
    const pending = c && c.escalation_pending;
    return `<div class="account-row" style="flex-wrap:wrap; gap:8px;">
      <span style="flex:1 1 180px;">${title}</span>
      <b>${count} / ${threshold}</b>
      <button class="account-btn" style="padding:4px 10px; font-size:11px;" onclick="adminResend(${billId})">${pending ? (isEn ? '↑ queued' : '↑ en file') : 'Resend ↑'}</button>
      <button class="account-btn" style="padding:4px 10px; font-size:11px;" onclick="adminReset(${billId})">Reset</button>
    </div>`;
  }).join('') : `<div class="account-note">${isEn ? 'No requests yet.' : 'Aucune demande pour l\'instant.'}</div>`;

  container.innerHTML = `
    <div class="account-box">
      <div class="account-note" style="margin-bottom:10px;"><b>${isEn ? 'Explanation requests (admin only)' : "Demandes d'explications (réservé aux admins)"}</b> — ${isEn ? 'Resend raises the petition threshold and queues an escalation email in the next digest; Reset clears the campaign.' : "Resend monte le seuil de pétition et met un courriel d'escalade dans le prochain digest ; Reset remet la campagne à zéro."}</div>
      ${rowsHtml}
    </div>
  `;
}

// Escalade (bouton admin) : monte le seuil de pétition au palier suivant et pose
// escalation_pending → le prochain digest aux 2 semaines annonce « le parrain a
// répondu mais insuffisant, on continue jusqu'à X ». Mutation via la RLS admin.
async function adminResend(billId){
  const { data } = await supabaseClient.from('bill_campaign').select('threshold').eq('bill_id', billId).maybeSingle();
  const cur = data ? data.threshold : PETITION_TIERS[0];
  const next = PETITION_TIERS.find(t => t > cur) ?? cur;
  if(next === cur && !confirm('Seuil déjà au maximum. Renvoyer quand même un courriel d\'escalade au prochain digest ?')) return;
  const { error } = await supabaseClient.from('bill_campaign').upsert(
    { bill_id: billId, threshold: next, escalation_pending: true, updated_at: new Date().toISOString() },
    { onConflict: 'bill_id' }
  );
  if(error){ alert('Erreur : ' + error.message); return; }
  alert(`Escalade posée (seuil ${cur} → ${next}). Le prochain digest l'annoncera.`);
  renderAdminFlagCounts();
}

// Reset (bouton admin) : efface la campagne de ce projet — repart à zéro.
async function adminReset(billId){
  if(!confirm('Réinitialiser la campagne de ce projet (repart à zéro) ?')) return;
  const { error } = await supabaseClient.from('bill_campaign').delete().eq('bill_id', billId);
  if(error){ alert('Erreur : ' + error.message); return; }
  renderAdminFlagCounts();
}

/* Promesses électorales — promesse et action côte à côte, sans verdict.
   La colonne « action » reste vide tant que la nouvelle Assemblée n'a pas
   légiféré (17 nov. 2026) ; elle se remplira à partir des projets de loi
   déjà scrapés. Le vide est lui aussi une information. */
/* Couleurs de sujet. Les thèmes courants ont une couleur fixe ; tout nouveau
   thème ajouté dans data/promises.json reçoit automatiquement une couleur
   stable de la palette de secours (dérivée du nom, donc toujours la même). */
const themeColors = {
  'Santé':'#E23A3A', 'Logement':'#0E4FC1', 'Transport':'#1E9E5A',
  'Finances publiques':'#FFD24D', 'Éducation':'#FF7B33', 'Environnement':'#12429B',
  'Économie':'#7C5CD6', 'Famille':'#D4537E', 'Culture':'#00A5CF',
  'Immigration':'#B45309', 'Énergie':'#0891B2', 'Justice':'#6B7280', 'Agriculture':'#84A31E', 'Aînés':'#7C3AED', 'Fiscalité':'#A16207', 'Infrastructures':'#475569',
};
const themeFallback = ['#8B5CF6','#0891B2','#C2410C','#4D7C0F','#BE185D','#0F766E'];
function themeColor(t){
  if(themeColors[t]) return themeColors[t];
  let h = 0; for(let i=0; i<String(t).length; i++) h = (h*31 + String(t).charCodeAt(i)) % 9973;
  return themeFallback[h % themeFallback.length];
}
// Noir ou blanc selon la luminance du fond — marche aussi pour les couleurs de secours.
function readableOn(hex){
  const c = String(hex).replace('#','');
  const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#131313' : '#fff';
}

let promParty = 'tous';
let promTheme = 'tous';
// Levé par init juste avant son propre renderPromises(). Avant, un clic sur un filtre (écrit dans
// le HTML par le build) redessinait tout avec une liste encore vide : « Tous 0 », des rangées qui
// rétrécissent, « Aucune promesse » au-dessus de la liste du build. Le choix est retenu, et
// appliqué dès que les données sont là.
let promPret = false;
function setPromParty(p){ promParty = p; renderPromises(); }
function setPromTheme(t){ promTheme = t; renderPromises(); }

// Construit les deux rangées de filtres à partir des données elles-mêmes :
// à mesure que des promesses sont ajoutées, les partis et sujets apparaissent
// tout seuls — rien à maintenir à la main.
function renderPromFilters(){
  const isEn = currentLang === 'en';
  const partyEl = document.getElementById('promPartyFilters');
  const themeEl = document.getElementById('promThemeFilters');
  const tous = isEn ? 'All' : 'Tous';
  // Les boutons portent TOUJOURS la couleur (parti ou sujet) : on reconnaît
  // d'un coup d'œil. La sélection se marque par la classe .qf-sel (ombre dure),
  // pas par la couleur — sinon on perdrait le repère visuel.
  // Compteurs CROISÉS : le nombre affiché sur un bouton de parti tient compte du
  // sujet sélectionné, et inversement. Sinon le chiffre ne correspondrait pas aux
  // cartes visibles à l'écran. Un « 0 » est donc possible et il est honnête : ce
  // parti n'a rien dans ce sujet PARMI CE QU'ON PUBLIE — le plafond de 8 par
  // parti est expliqué juste au-dessus, dans l'encadré.
  const nb = (f) => promises.filter(f).length;
  const compteur = (n) => ` <span class="qf-n">${n}</span>`;

  if(partyEl){
    const partis = [...new Set(promises.map(p => p.party))];
    const sousTheme = (p) => promTheme === 'tous' || p.theme === promTheme;
    partyEl.innerHTML = [['tous', tous], ...partis.map(x => [x, x])].map(([k, label]) => {
      const sel = promParty === k;
      const n = k === 'tous' ? nb(sousTheme) : nb(p => p.party === k && sousTheme(p));
      const zero = n === 0 ? ' qf-zero' : '';
      if(k === 'tous') return `<button class="qf-btn ${sel ? 'active' : ''}${zero}" onclick="setPromParty('tous')">${label}${compteur(n)}</button>`;
      const bg = partyColors[k] || '#8B8578';
      return `<button class="qf-btn ${sel ? 'qf-sel' : ''}${zero}" style="background:${bg}; color:${partyText(k)};" onclick="setPromParty('${k}')">${label}${compteur(n)}</button>`;
    }).join('');
    // « Médias » à la suite des partis : ce n'est PAS un filtre, c'est un renvoi
    // vers les comparateurs des salles de rédaction, en bas de page. Il est posé
    // ici parce que c'est là que regarde quelqu'un qui compare — mais il doit se
    // distinguer des partis, sinon on croit à un filtre qui ne filtre rien :
    // d'où le trait pointillé, l'absence de couleur de parti et la flèche.
    partyEl.innerHTML += `<button class="qf-btn qf-renvoi" onclick="allerAuxComparateurs()" title="${isEn
      ? 'Comparison tools built by newsrooms, at the bottom of the page'
      : 'Les comparateurs des salles de rédaction, en bas de page'}">${isEn ? 'Media' : 'Médias'}${compteur(4)} ↓</button>`;
  }
  if(themeEl){
    const sujets = [...new Set(promises.map(p => p.theme))].sort();
    const sousParti = (p) => promParty === 'tous' || p.party === promParty;
    themeEl.innerHTML = [['tous', tous], ...sujets.map(x => [x, x])].map(([k, label]) => {
      const sel = promTheme === k;
      const esc = String(k).replace(/'/g, "\\'");
      const n = k === 'tous' ? nb(sousParti) : nb(p => p.theme === k && sousParti(p));
      const zero = n === 0 ? ' qf-zero' : '';
      if(k === 'tous') return `<button class="qf-btn ${sel ? 'active' : ''}${zero}" onclick="setPromTheme('tous')">${label}${compteur(n)}</button>`;
      const bg = themeColor(k);
      return `<button class="qf-btn ${sel ? 'qf-sel' : ''}${zero}" style="background:${bg}; color:${readableOn(bg)};" onclick="setPromTheme('${esc}')">${label}${compteur(n)}</button>`;
    }).join('');
  }
}

// Renvoi vers les comparateurs des médias, en bas de la page Promesses.
function allerAuxComparateurs(){
  const el = document.getElementById('prom-ailleurs');
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPromises(){
  if(!document.getElementById('promisesList')) return;   // vue absente de cette page
  if(!promPret) return;   // données pas encore là : filtres et liste du build restent tels quels
  const el = document.getElementById('promisesList');
  if(!el) return;
  const isEn = currentLang === 'en';
  renderPromFilters();
  const liste = promises.filter(p =>
    (promParty === 'tous' || p.party === promParty) &&
    (promTheme === 'tous' || p.theme === promTheme));
  const titreEl = document.getElementById('promResultTitle');
  const noteEl = document.getElementById('promResultNote');
  if(titreEl) titreEl.textContent = promParty === 'tous' && promTheme === 'tous'
    ? (isEn ? 'All promises' : 'Toutes les promesses')
    : [promParty !== 'tous' ? promParty : null, promTheme !== 'tous' ? promTheme : null].filter(Boolean).join(' · ');
  if(noteEl) noteEl.textContent = `${liste.length} ${isEn ? (liste.length > 1 ? 'promises' : 'promise') : (liste.length > 1 ? 'promesses' : 'promesse')}`;
  if(!promises.length){
    el.innerHTML = `<div class="no-results">${isEn ? 'No promise recorded yet.' : 'Aucune promesse saisie pour l\'instant.'}</div>`;
    return;
  }
  if(!liste.length){
    el.innerHTML = `<div class="no-results">${isEn ? 'No promise matches these filters.' : 'Aucune promesse ne correspond à ces filtres.'}</div>`;
    return;
  }
  el.innerHTML = liste.map(p => {
    const couleur = partyColors[p.party] || '#8B8578';
    const badge = `<span class="depute-party" style="background:${couleur}; color:${partyText(p.party)}">${p.party}</span>`;
    const brouillon = p.draft ? `<span class="prom-draft">${isEn ? 'To verify' : 'À vérifier'}</span>` : '';
    const typeSrc = p.sourceType === 'primaire'
      ? (isEn ? 'Primary source (party)' : 'Source primaire (parti)')
      : (isEn ? 'Journalistic source' : 'Source journalistique');
    return `<div class="prom-card">
      <div class="prom-top">${badge}<button class="prom-theme-pill" style="background:${themeColor(p.theme)}; color:${readableOn(themeColor(p.theme))};" onclick="setPromTheme('${String(p.theme).replace(/'/g, "\\'")}')" title="${isEn ? 'Filter by this topic' : 'Filtrer par ce sujet'}">${p.theme}</button>${brouillon}</div>
      <p class="prom-quote">« ${p.quote} »</p>
      <div class="prom-grid">
        <div class="prom-col">
          <span class="lbl">${isEn ? 'The promise' : 'La promesse'}</span>
          <p>${p.sourceLabel}</p>
          <p class="prom-srctype">${typeSrc} · ${isEn ? 'captured on' : 'captée le'} ${p.capturedAt}</p>
          <a href="${p.sourceUrl}" target="_blank" rel="noopener">${isEn ? 'See the source' : 'Voir la source'}</a>
        </div>
        <div class="prom-col">
          <span class="lbl att">${isEn ? 'The action' : 'L\'action'}</span>
          <p class="prom-none">${isEn
            ? 'Nothing yet. The new Assembly sits from November 17, 2026.'
            : 'Rien encore. La nouvelle Assemblée siège à partir du 17 novembre 2026.'}</p>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- RENDER ---------------- */
const mailIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';
const deputesDirectoryUrl = 'https://www.assnat.qc.ca/fr/deputes/index.html';



function findDeputeEmail(name){
  if(!name) return null;
  const clean = name.replace(/\s*\([^)]*\)\s*/g,'').trim();
  return deputeEmails[norm(clean)] || null;
}

let partyFilter = '';
const partyOrder = ['CAQ','PLQ','PQ','QS','PCQ','IND'];

function renderPartyFilters(){
  const el = document.getElementById('partyFilters');
  if(!el) return;
  const allLabel = currentLang==='en' ? 'All' : 'Tous';
  el.innerHTML = `<span class="party-chip ${!partyFilter?'active':''}" style="${!partyFilter ? 'background:var(--ink); border-color:var(--ink);' : 'border-color:var(--line); color:var(--slate);'}" onclick="setPartyFilter('')">${allLabel}</span>` +
    partyOrder.map(p => `
    <span class="party-chip ${partyFilter===p?'active':''}" style="${partyFilter===p ? `background:${partyColors[p]}; border-color:${partyColors[p]};` : `border-color:${partyColors[p]}66; color:${partyColors[p]};`}" onclick="setPartyFilter('${p}')">${p}</span>
  `).join('');
}

function setPartyFilter(p){
  partyFilter = (partyFilter === p) ? '' : p;
  renderPartyFilters();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderDeputes(document.getElementById('searchMinistres')?.value);
}

let introCollapsed = false;
async function loadIntroState(){
  try{
    const res = await window.storage.get('apercu-intro-collapsed');
    introCollapsed = res ? JSON.parse(res.value) : false;
  }catch(e){ introCollapsed = false; }
  applyIntroState();
}
function applyIntroState(){
  // Refonte : les boutons « 😴 Réduire » ont été retirés — la mission est
  // toujours affichée, peu importe l'état sauvegardé d'avant.
  const block = document.getElementById('introBlock');
  if(block) block.classList.remove('collapsed');
}

document.querySelectorAll('.quick-nav a').forEach(a=>{
  a.addEventListener('click', ()=>{
    const targetId = a.getAttribute('data-jump');
    const introTargets = ['sec-mission','sec-composition'];
    if(introTargets.includes(targetId) && introCollapsed){
      introCollapsed = false;
      applyIntroState();
      window.storage.set('apercu-intro-collapsed', JSON.stringify(false)).catch(()=>{});
    }
    requestAnimationFrame(()=>{
      const el = document.getElementById(targetId);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
});

let fontZoom = 100;
// Le CSS n'a aucun moyen de connaître la largeur dont dispose RÉELLEMENT la
// mise en page : l'unité vw inclut la barre de défilement, et ni vw ni les
// media queries ne suivent le `zoom` que le bouton A+ applique sur <body>
// (à 150 % sur un téléphone de 412 px, la page se compose comme dans 275 px).
// On la mesure donc ici et on la publie : --vw pour les bandes pleine largeur,
// la classe .etroit pour les réglages qu'un @media ne peut pas déclencher.
function majMetriquesMiseEnPage(){
  // ⚠️ clientWidth peut valoir 0 : onglet caché, rendu en arrière-plan, capture
  // de vignette. Publier « --vw: 0px » cassait toute la mise en page ET ne se
  // corrigeait jamais, car le repli « var(--vw, 100vw) » ne s'applique que si la
  // variable est ABSENTE — pas si elle est présente mais fausse. On ne publie
  // donc rien tant qu'on n'a pas une largeur crédible.
  const largeur = document.documentElement.clientWidth || window.innerWidth || 0;
  if(largeur < 200) return;
  const effective = largeur / (fontZoom / 100);
  document.body.style.setProperty('--vw', effective + 'px');
  document.documentElement.classList.toggle('etroit', effective < 360);
  // La rangée du logo a besoin de 411 px : voir .entete-etroite dans le CSS.
  document.documentElement.classList.toggle('entete-etroite', effective < 420);
}
window.addEventListener('resize', majMetriquesMiseEnPage);
// Rattrapage : si la page a été construite alors qu'elle n'avait pas encore de
// largeur, on remesure dès qu'elle devient visible.
window.addEventListener('pageshow', majMetriquesMiseEnPage);
document.addEventListener('visibilitychange', () => { if(!document.hidden) majMetriquesMiseEnPage(); });
async function loadFontZoom(){
  try{
    const res = await window.storage.get('font-zoom');
    fontZoom = res ? JSON.parse(res.value) : 100;
  }catch(e){ fontZoom = 100; }
  applyFontZoom();
}
function applyFontZoom(){
  document.body.style.zoom = fontZoom + '%';
  majMetriquesMiseEnPage();
  { const _e = document.getElementById('fontPct'); if(_e) _e.textContent = fontZoom + '%'; }
  { const _e = document.getElementById('fontMinus'); if(_e) _e.disabled = fontZoom <= 80; }
  { const _e = document.getElementById('fontPlus'); if(_e) _e.disabled = fontZoom >= 150; }
}
async function changeFontZoom(delta){
  fontZoom = Math.max(80, Math.min(150, fontZoom + delta));
  applyFontZoom();
  try{ await window.storage.set('font-zoom', JSON.stringify(fontZoom)); }catch(e){}
}

/* ---------------- THÈME SOMBRE ----------------
   Volontairement PAS branché sur prefers-color-scheme : tant que le thème est à
   l'essai, personne ne doit le recevoir sans l'avoir demandé. Le jour où on le
   juge prêt, il suffira de lire la préférence système au premier chargement.
   L'attribut vit sur <html> et non sur <body>, pour que le fond de page soit
   peint avant même que le corps existe. */
let themeSombre = false;
function appliquerTheme(){
  document.documentElement.setAttribute('data-theme', themeSombre ? 'dark' : 'light');
  const b = document.getElementById('themeToggle');
  if(!b) return;
  const isEn = currentLang === 'en';
  b.setAttribute('aria-pressed', themeSombre ? 'true' : 'false');
  const t = themeSombre
    ? (isEn ? 'Switch to light theme' : 'Passer au thème clair')
    : (isEn ? 'Switch to dark theme' : 'Passer au thème sombre');
  b.setAttribute('aria-label', t);
  b.setAttribute('title', t);
}
async function loadTheme(){
  try{
    const res = await window.storage.get('theme');
    themeSombre = res ? JSON.parse(res.value) === 'dark' : false;
  }catch(e){ themeSombre = false; }
  appliquerTheme();
}
async function basculerTheme(){
  themeSombre = !themeSombre;
  appliquerTheme();
  try{ await window.storage.set('theme', JSON.stringify(themeSombre ? 'dark' : 'light')); }catch(e){}
}
document.getElementById('themeToggle')?.addEventListener('click', basculerTheme);
document.getElementById('fontMinus')?.addEventListener('click', ()=> changeFontZoom(-10));
document.getElementById('fontPlus')?.addEventListener('click', ()=> changeFontZoom(10));

let snoozedSections = {};
async function loadSnoozedSections(){
  try{
    const res = await window.storage.get('snoozed-sections');
    snoozedSections = res ? JSON.parse(res.value) : {};
  }catch(e){ snoozedSections = {}; }
  Object.keys(snoozedSections).forEach(key=>{
    if(snoozedSections[key]){
      const body = document.getElementById('body-'+key);
      const pill = document.getElementById('snooze-'+key);
      if(body && pill){
        body.classList.add('collapsed');
        pill.classList.add('snoozed');
        const labelSpan = pill.querySelector('span');
        labelSpan.textContent = currentLang==='en' ? '😴 Show' : '😴 Afficher';
      }
    }
  });
}

async function toggleSnooze(key, persist){
  const body = document.getElementById('body-'+key);
  const pill = document.getElementById('snooze-'+key);
  const isCollapsed = body.classList.toggle('collapsed');
  pill.classList.toggle('snoozed', isCollapsed);
  const labelSpan = pill.querySelector('span');
  const isEn = currentLang === 'en';
  labelSpan.textContent = isCollapsed ? (isEn ? '😴 Show' : '😴 Afficher') : (isEn ? '😴 Collapse' : '😴 Réduire');
  if(persist){
    snoozedSections[key] = isCollapsed;
    try{ await window.storage.set('snoozed-sections', JSON.stringify(snoozedSections)); }catch(e){}
  }
}

function initials(name){
  return name.split(' ').filter(w=>w[0]===w[0].toUpperCase()).slice(0,2).map(w=>w[0]).join('');
}

// Vrais éléments datés, tirés de la page d'accueil assnat.qc.ca (relevés le 12 juin 2026)

// La date la plus récente du fil d'actualité, qui sert de « aujourd'hui » aux barres de
// progression. Calculée dans chargerDonnees : au chargement du script, newsItems est encore
// vide — les données arrivent par le réseau.
let newsAnchor = null;
// Borne le nombre d'ÉVÉNEMENTS, pas de journées : une seule journée de fin de
// session peut en contenir neuf et remplir l'écran à elle seule.
const NEWS_STEP = 8;
let newsShown = NEWS_STEP;

function renderNews(){
  if(!document.getElementById('newsList')) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  // Pagination par JOURNÉES, pas par fenêtres de 7 jours : une seule semaine de
  // fin de session peut contenir 20 événements et remplir tout l'écran. On
  // affiche un nombre fixe de journées, comme les pétitions affichent 3 cartes.
  const visible = newsItems.slice(0, newsShown);
  const hasMore = newsItems.length > visible.length;
  const moreBtn = isEn ? "+ Show more" : "+ Voir plus";
  const noMore = isEn ? 'Data not yet confirmed beyond this — to be added later.' : 'Donnée manquante au-delà de cette date — à confirmer plus tard.';

  // DISSOLUTION : sans explication, « Quoi de neuf » affichant des entrées de
  // juin donne l'impression d'un site à l'abandon. La vraie raison, c'est qu'il
  // ne s'est rien passé : l'Assemblée a suspendu ses travaux le 12 juin puis a
  // été dissoute le 27 août. On le dit, plutôt que de laisser le doute.
  const avisDissolution = (typeof ASSEMBLY !== 'undefined' && ASSEMBLY.dissolved)
    ? `<div class="info-box" style="margin-bottom:16px;">${isEn
        ? "Nothing new since June 12, 2026 — and that is expected. The Assembly rose that day, then was dissolved on August 27. There will be no new parliamentary activity until the new Assembly convenes on November 17, 2026. What follows is the final record of the 43rd legislature."
        : "Rien de neuf depuis le 12 juin 2026 — et c'est normal. L'Assemblée a suspendu ses travaux ce jour-là, puis a été dissoute le 27 août. Il n'y aura pas de nouvelle activité parlementaire avant la rentrée de la nouvelle Assemblée, le 17 novembre 2026. Ce qui suit est le dernier état des travaux de la 43<sup>e</sup> législature."}</div>`
    : '';

  // Regroupé PAR JOUR : une même date revenait jusqu'à huit fois de suite, ce
  // qui noyait le contenu sous des en-têtes répétés. Un bloc par journée, avec
  // tous ses événements en dessous.
  const parJour = [];
  for(const n of visible){
    const dernier = parJour[parJour.length - 1];
    if(dernier && dernier.date === n.date) dernier.items.push(n);
    else parJour.push({ date: n.date, label: isEn ? (n.labelEn||n.label) : n.label, items: [n] });
  }

  document.getElementById('newsList').innerHTML = avisDissolution + parJour.map(j => `
    <div class="news-item">
      <div class="news-date">${j.label}</div>
      <div class="news-body">${j.items.map(n => `<p>${isEn ? (n.textEn||n.text) : n.text}</p>`).join('')}</div>
    </div>
  `).join('') + (hasMore ? `<button class="bill-more" style="margin-top:14px; border:none; cursor:pointer;" onclick="loadMoreNews()">${moreBtn}</button>` : `<div class="no-results">${noMore}</div>`);
}

function loadMoreNews(){
  newsShown += NEWS_STEP;
  renderNews();
}

function toggleRoadmapRecap(id){
  const el = document.getElementById(id);
  const hint = document.getElementById('hint-'+id);
  const isOpen = el.classList.toggle('open');
  hint.textContent = isOpen ? '−' : '+';
}

// Vraies pétitions électroniques ouvertes pour signature — assnat.qc.ca
// Confirmées deux fois : une première fois par un fetch direct, une seconde fois
// indépendamment par l'utilisateur qui les a copiées depuis son propre navigateur.




function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

let petitionsShown = 3;

function renderPetitions(targetId){
  targetId = targetId || 'petitionsList';
  const el = document.getElementById(targetId);
  // Son conteneur est passé en paramètre, donc aucune garde automatique ne pouvait le couvrir :
  // sur /ministres ou /votes, il n'existe pas.
  if(!el) return;
  const isEn = currentLang === 'en';
  // DISSOLUTION : le Règlement de l'Assemblée interdit de signer une pétition
  // électronique quand l'Assemblée est dissoute — il n'y a donc AUCUNE pétition
  // ouverte. On n'affiche pas les anciennes : elles ne sont plus signables, et
  // les montrer avec un bouton « signer » enverrait les gens vers un mur.
  // (Le scraper hebdo garde ses données de la veille ; c'est l'affichage qui
  // tranche, comme pour les projets de loi morts au feuilleton.)
  if(typeof ASSEMBLY !== 'undefined' && ASSEMBLY.dissolved){
    const msg = isEn
      ? "No petition can be signed right now. The National Assembly's rules prohibit signing an e-petition while the Assembly is dissolved — which has been the case since August 27, 2026. Petitions reopen once the new Assembly convenes, on November 17, 2026."
      : "Aucune pétition ne peut être signée en ce moment. Le Règlement de l'Assemblée interdit de signer une pétition électronique pendant que l'Assemblée est dissoute — c'est le cas depuis le 27 août 2026. Les pétitions rouvriront à la rentrée de la nouvelle Assemblée, le 17 novembre 2026.";
    const lien = isEn ? "See the official notice on assnat.qc.ca →" : "Voir l'avis officiel sur assnat.qc.ca →";
    const url = isEn
      ? "https://www.assnat.qc.ca/en/exprimez-votre-opinion/petition/signer-petition/index.html"
      : "https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html";
    el.innerHTML = `<div class="no-results">${msg}</div>
    <a class="bill-more" href="${url}" target="_blank" rel="noopener" style="display:inline-block; margin-top:12px;">${lien}</a>`;
    return;
  }
  if(petitions.length === 0){
    const emptyMsg = isEn
      ? "I couldn't retrieve the real list of open petitions — the official page loads its content dynamically, like the vote registry. Rather than invent petitions, I'm leaving this tab empty for now. Use the link below to see the real petitions right now."
      : "Je n'ai pas pu récupérer la vraie liste des pétitions ouvertes — la page officielle charge son contenu dynamiquement, comme le registre des votes. Plutôt que d'inventer des pétitions, je laisse cet onglet vide pour l'instant. Utilisez le lien ci-dessous pour voir les vraies pétitions en ce moment.";
    const emptyLinkText = isEn ? "See the real open petitions on assnat.qc.ca →" : "Voir les vraies pétitions ouvertes sur assnat.qc.ca →";
    const emptyUrl = isEn ? "https://www.assnat.qc.ca/en/exprimez-votre-opinion/petition/signer-petition/index.html" : "https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html";
    el.innerHTML = `<div class="no-results">${emptyMsg}</div>
    <a class="bill-more" href="${emptyUrl}" target="_blank" rel="noopener" style="display:inline-block; margin-top:12px;">${emptyLinkText}</a>`;
    return;
  }
  const sponsorLabel = isEn ? "Sponsoring MNA" : "Députée ou député intermédiaire";
  const openLabel = isEn ? "Open from" : "Ouverte du";
  const toLabel = isEn ? "to" : "au";
  const signatureLabel = isEn ? "signature" : "signature";
  const viewSignLabel = isEn ? "Find and sign on assnat.qc.ca →" : "Trouver et signer sur assnat.qc.ca →";
  const moreLabel = isEn ? "+ Show 3 more" : "+ Voir 3 de plus";
  const sorted = petitions.slice().sort((a,b)=>b.count-a.count);
  const list = sorted.slice(0, petitionsShown);
  const hasMore = petitionsShown < sorted.length;
  el.innerHTML = list.map(p=>{
    const total = daysBetween(p.start,p.end);
    const elapsed = Math.min(total, daysBetween(p.start, newsAnchor));
    const pct = Math.max(4, Math.min(100, Math.round(elapsed/total*100)));
    const title = isEn ? (p.titleEn||p.title) : p.title;
    const url = isEn ? (p.urlEn||p.url) : p.url;
    const localeCount = p.count.toLocaleString(isEn ? 'en-CA' : 'fr-CA');
    return `
    <div class="petition-card">
      <h3>${title}</h3>
      <div class="petition-meta">
        <span>${sponsorLabel} : <b>${p.sponsor}</b></span>
        <span>${openLabel} <b>${p.start}</b> ${toLabel} <b>${p.end}</b></span>
      </div>
      <div class="petition-progress"><div class="fill" style="width:${pct}%"></div></div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="petition-count">${localeCount} ${signatureLabel}${p.count>1?'s':''}</span>
        <a class="bill-more" href="${url}" target="_blank" rel="noopener">${viewSignLabel}</a>
      </div>
    </div>
  `;}).join('') + (hasMore ? `<button class="bill-more" style="margin-top:6px; border:none; cursor:pointer;" onclick="loadMorePetitions('${targetId}')">${moreLabel}</button>` : '');
}

function loadMorePetitions(targetId){
  petitionsShown += 3;
  renderPetitions(targetId);
}

function renderApercuPetitions(){
  renderPetitions('apercuPetitions');
}

function norm(s){
  return (s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderDeputes(filter){
  if(!document.getElementById('deputesList')) return;   // vue absente de cette page
  // En mode trié (voir toggleMinistresSort), renderMinistres() affiche tout le
  // monde (ministres + reste de l'Assemblée) fusionné dans une seule liste —
  // cette grille-ci reste donc vide et n'a rien à faire.
  if(ministresSortMode){
    { const _e = document.getElementById('deputesList'); if(_e) _e.innerHTML = ''; }
    return;
  }
  const f = norm(filter);
  const ministerNames = new Set(ministers.map(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,''))));
  const list = deputes.filter(d => !ministerNames.has(norm(d.name)) && (!partyFilter || d.party===partyFilter) && (!f ||
    norm(d.name).includes(f) ||
    norm(d.riding).includes(f) ||
    norm(d.region).includes(f)
  ));
  const el = document.getElementById('deputesList');
  if(list.length === 0){
    el.innerHTML = `<div class="no-results">${currentLang==='en' ? 'No results for this search.' : 'Aucun résultat pour cette recherche.'}</div>`;
    return;
  }
  const isEn = currentLang === 'en';
  // Refonte brutaliste : tableau GROUPÉ PAR PARTI (bandeau pleine largeur aux
  // couleurs du parti), au lieu de la grille de cartes — mêmes données, mêmes
  // boutons Suivre (followedDeputes), même courriel.
  const partyOrder = seats.map(s=>s.party);
  const groups = partyOrder
    .map(p => ({ party:p, seat: seats.find(s=>s.party===p), members: list.filter(d=>d.party===p) }))
    .filter(g => g.members.length);
  const nameLabel = isEn ? 'Name' : 'Nom';
  const ridingLabel = isEn ? 'Riding — region' : 'Circonscription — région';
  const followColLabel = isEn ? 'Follow' : 'Suivre';
  const seatWord = isEn ? 'shown' : 'affiché·e·s';
  el.innerHTML = `<div class="dep-table">
    <div class="dep-table-head"><span>${nameLabel}</span><span>${ridingLabel}</span><span>${followColLabel}</span></div>
    ${groups.map(g => {
      const label = isEn ? (g.seat.labelEn||g.seat.label) : g.seat.label;
      return `
      <div class="dep-group-banner" style="background:${partyColors[g.party]}; color:${partyText(g.party)}">
        <span class="dep-group-name">${label}</span>
        <span class="dep-group-count">${g.members.length} ${seatWord}</span>
      </div>
      ${g.members.map(d => {
        const email = findDeputeEmail(d.name);
        const mailHref = email ? 'mailto:'+email : deputesDirectoryUrl;
        const mailText = email ? email : (isEn ? 'Official email on assnat.qc.ca' : 'Courriel officiel sur assnat.qc.ca');
        const followKey = d.name + '|' + d.riding;
        const isFollowed = !!followedDeputes[followKey];
        const att = attendanceForAssnatId(d.assnatId);
        const presidingNote = presidingRoleNote(d.name, isEn);
        const attNote = presidingNote ? presidingNote : att
          ? `${isEn ? 'attendance:' : 'présence :'} ${pastillePresence(att.rate, isEn)}`
          : (isEn ? 'attendance: n/a' : 'présence : n/d');
        return `
        <div class="dep-row">
          <div>
            <div class="dep-name">${d.name}</div>
            <a class="dep-mail" href="${mailHref}" ${email ? '' : 'target="_blank" rel="noopener"'}>✉ ${mailText}</a>
          </div>
          <div>
            <div class="dep-riding">${d.riding} — ${d.region}</div>
            <div class="dep-att">${attNote}</div>
          </div>
          <button class="follow-btn dep-follow ${isFollowed?'on':''}" onclick="toggleFollowDepute('${followKey.replace(/'/g,"\\'")}')">${isFollowed ? t('btn.following') : t('btn.follow')}</button>
        </div>`;
      }).join('')}`;
    }).join('')}
  </div>`;
}

// Carte unifiée pour la vue combinée (ministres + reste de l'Assemblée sur un
// seul pied d'égalité, voir toggleMinistresSort) — même info qu'avant, juste
// réunie dans un seul type de carte puisque le classement mélange les deux
// groupes plutôt que de garder la priorité "Conseil des ministres" en premier.
function personCard(p){
  const isEn = currentLang === 'en';
  const isMin = p.type === 'minister';
  const name = isMin ? p.m.name : p.d.name;
  // Dans la vue combinée (classement par présence), on affiche circonscription
  // — région pour tout le monde, ministres compris, pour rester cohérent sur
  // un même pied d'égalité plutôt que de garder le titre de portefeuille.
  const minDep = isMin && p.combined ? resolveDepute(name) : null;
  const subtitle = isMin
    ? (p.combined ? (minDep ? `${minDep.riding} — ${minDep.region}` : '') : (isEn ? (p.m.roleEn||p.m.role) : p.m.role))
    : `${p.d.riding} — ${p.d.region}`;
  const party = isMin ? p.m.party : p.d.party;
  const email = findDeputeEmail(name);
  const mailHref = email ? 'mailto:'+email : deputesDirectoryUrl;
  const mailTitle = email ? email : (isEn ? 'Find the official email on assnat.qc.ca' : 'Trouver le courriel officiel sur assnat.qc.ca');
  const followKey = isMin ? name : (p.d.name + '|' + p.d.riding);
  const isFollowed = isMin ? !!followed[name] : !!followedDeputes[followKey];
  const followOnclick = isMin
    ? `toggleFollow('${name.replace(/'/g,"\\'")}')`
    : `toggleFollowDepute('${followKey.replace(/'/g,"\\'")}')`;
  const presidingNote = presidingRoleNote(name, isEn);
  const attNote = presidingNote ? presidingNote : p.att
    ? (isEn ? `attendance: ${p.att.rate}% (${p.att.participated}/${p.att.total})` : `présence : ${p.att.rate} % (${p.att.participated}/${p.att.total})`)
    : (isEn ? 'attendance: not available' : 'présence : non disponible');
  const attTitle = presidingNote
    ? (isEn ? 'The Assembly\'s President and Vice-Presidents referee the debates (nothing to do with the Premier). To stay neutral, they vote little or not at all — so a low or absent vote count does not mean they were absent.' : 'La présidence et les vice-présidences de l\'Assemblée arbitrent les débats (rien à voir avec la ou le premier ministre). Par neutralité, elles votent peu ou pas du tout — un faible taux ou une absence de vote ne veut donc pas dire qu\'elles étaient absentes.')
    : isEn
    ? 'Share of recorded votes (all 3 sessions of the 43rd Legislature) this MNA appears in (Yea/Nay/Abstention), counted since their first recorded vote — a proxy for attendance, since the Assembly does not publish attendance directly.'
    : "Part des votes nominaux enregistrés (3 sessions de la 43e législature) où cette personne apparaît (Pour/Contre/Abstention), comptée depuis son premier vote enregistré — un indicateur de présence, l'Assemblée ne publiant pas l'assiduité directement.";
  // Carte au format de la maquette (Ministres.dc.html) : badge parti + Suivre
  // en tête, nom 800 uppercase, portefeuille bleu, puis les faits en rangées
  // étiquette/valeur (circonscription, présence, PL parrainés) et le courriel.
  const dep = isMin ? resolveDepute(name) : p.d;
  const riding = dep ? dep.riding : (isEn ? 'n/a' : 'n/d');
  const presidingShort = presidingNote ? '—' : null;
  const attShort = presidingShort ? presidingShort : (p.att ? pastillePresence(p.att.rate, isEn) : (isEn ? 'n/a' : 'n/d'));
  const plCount = billsSponsoredBy(name).length;
  const labels = isEn
    ? { riding:'Riding', att:'Vote attendance', bills:'Bills sponsored' }
    : { riding:'Circonscription', att:'Présence votes', bills:'PL parrainés' };
  return `
    <div class="m-card">
      <div class="m-card-top">
        <div class="m-top-row">
          <span class="depute-party" style="background:${partyColors[party]}; color:${partyText(party)}">${party}</span>
          <button class="follow-btn ${isFollowed?'on':''}" onclick="${followOnclick}">${isFollowed ? t('btn.following') : t('btn.follow')}</button>
        </div>
        <div class="m-name">${name}</div>
        <div class="m-portfolio">${subtitle}</div>
      </div>
      <div class="m-card-bottom">
        <div class="m-row"><span class="m-label">${labels.riding}</span><span class="m-val">${riding}</span></div>
        <div class="m-row"><span class="m-label">${labels.att}</span><span class="m-val m-val-blue" title="${attTitle}">${attShort}</span></div>
        <div class="m-row"><span class="m-label">${labels.bills}</span><span class="m-val">${plCount}</span></div>
        <a class="m-mail" href="${mailHref}" ${email ? '' : 'target="_blank" rel="noopener"'} onclick="event.stopPropagation()" title="${mailTitle}">✉ ${email ? email : (isEn ? 'Official email on assnat.qc.ca' : 'Courriel officiel sur assnat.qc.ca')}</a>
      </div>
    </div>
  `;
}

function renderHemicycle(){
  if(!document.getElementById('compoBar')) return;   // vue absente de cette page
  // Refonte brutaliste : la composition est une barre empilée bordée (segments
  // proportionnels aux sièges, séparés par des bordures noires) + légende à
  // carrés — mêmes données réelles `seats` que l'ancien hémicycle SVG.
  const bar = document.getElementById('compoBar');
  const legend = document.getElementById('hemicycleLegend');
  if(!bar || !legend) return;
  const total = seats.reduce((a,s)=>a+s.n,0);
  const isEn = currentLang === 'en';
  bar.innerHTML = seats.map((s,i)=>
    `<div class="compo-seg" title="${(isEn ? (s.labelEn||s.label) : s.label)} — ${s.n}" style="width:${(s.n/total*100).toFixed(2)}%; background:${partyColors[s.party] || '#999'};${i>0 ? ' border-left:3px solid var(--ink);' : ''}"></div>`
  ).join('');
  // Légende en ACRONYMES (le nom complet reste au survol des segments).
  legend.innerHTML = seats.map(s=>`
    <div class="compo-row" title="${isEn ? (s.labelEn||s.label) : s.label}"><span class="compo-swatch" style="background:${partyColors[s.party]}"></span>${s.party} — <b>${s.n}</b></div>
  `).join('');
}

let ministresSortMode = null; // null (ordre par défaut) | 'desc' (+ actif) | 'asc' (- actif)
function toggleMinistresSort(){
  ministresSortMode = ministresSortMode === null ? 'desc' : (ministresSortMode === 'desc' ? 'asc' : null);
  updateMinistresSortLabel();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderDeputes(document.getElementById('searchMinistres')?.value);
}
function updateMinistresSortLabel(){
  if(!document.getElementById('ministresSortToggle')) return;   // vue absente de cette page
  const btn = document.getElementById('ministresSortToggle');
  if(!btn) return;
  const isEn = currentLang === 'en';
  if(ministresSortMode === 'desc') btn.textContent = isEn ? '↓ Most active first' : '↓ + actif d\'abord';
  else if(ministresSortMode === 'asc') btn.textContent = isEn ? '↑ Least active first' : '↑ - actif d\'abord';
  else btn.textContent = isEn ? 'Sort: default order' : 'Trier : ordre par défaut';
}

function sortByAttendance(list, dir){
  // La présidence et les 3 vice-présidences (voir presidingRoles) ont parfois
  // un vrai pourcentage très bas (ex. un vice-président qui vote rarement en
  // dehors de ses rares remplacements), pas juste `null` — les exclure du
  // classement seulement quand `att` est absent laissait ces personnes-là
  // se glisser dans le tri normal, tandis que celles à 0 vote (att=null)
  // étaient poussées « à la fin » peu importe la direction : en ordre
  // ascendant, ça les faisait atterrir à la position des PLUS actif·ves.
  // Il faut exclure les 4 rôles de présidence du classement au complet, pas
  // seulement selon qu'ils ont ou non une donnée calculable.
  return list.slice().sort((a,b)=>{
    const nameA = a.type === 'minister' ? a.m.name : a.d.name;
    const nameB = b.type === 'minister' ? b.m.name : b.d.name;
    const excludedA = !!presidingRoleNote(nameA, false);
    const excludedB = !!presidingRoleNote(nameB, false);
    if(excludedA && excludedB) return 0;
    if(excludedA) return 1; // toujours en dernier, peu importe la direction
    if(excludedB) return -1;
    const ra = a.att ? a.att.rate : null;
    const rb = b.att ? b.att.rate : null;
    if(ra === null && rb === null) return 0;
    if(ra === null) return 1; // pas de donnée : toujours en dernier, peu importe la direction
    if(rb === null) return -1;
    return dir === 'desc' ? rb - ra : ra - rb;
  });
}

function renderMinistres(filter){
  if(!document.getElementById('ministresGrid')) return;   // vue absente de cette page
  const grid = document.getElementById('ministresGrid');
  const isEn = currentLang === 'en';
  // (le compteur de l accueil vient de stats.json : voir chargerDonnees. Cette vue ne le
  //  porte plus, et l ecrire ici plantait sur /ministres.)

  if(ministresSortMode){
    // Vue combinée : plus de priorité "Conseil des ministres" — tout le monde
    // (ministres + reste de l'Assemblée) sur un même pied d'égalité, classé
    // par présence. Voir toggleMinistresSort().
    { const _e = document.getElementById('ministresTitle'); if(_e) _e.style.display = 'none'; }
    { const _e = document.getElementById('deputesTitle'); if(_e) _e.style.display = 'none'; }
    { const _e = document.getElementById('deputesInfoBox'); if(_e) _e.style.display = 'none'; }
    const combinedTitle = document.getElementById('combinedTitle');
    combinedTitle.style.display = '';

    const f = norm(filter);
    const minList = ministers
      .filter(m => (!partyFilter || m.party===partyFilter) && (!f || norm(m.name).includes(f) || norm(m.role).includes(f) || norm(m.roleEn||'').includes(f)))
      .map(m => ({ type:'minister', m, att: computeAttendance(m.name), combined: true }));
    const ministerNames = new Set(ministers.map(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,''))));
    const depList = deputes
      .filter(d => !ministerNames.has(norm(d.name)) && (!partyFilter || d.party===partyFilter) && (!f ||
        norm(d.name).includes(f) || norm(d.riding).includes(f) || norm(d.region).includes(f)))
      .map(d => ({ type:'depute', d, att: attendanceForAssnatId(d.assnatId) }));
    const combined = sortByAttendance([...minList, ...depList], ministresSortMode);

    combinedTitle.textContent = isEn
      ? `All elected members — sorted by attendance (${combined.length} shown)`
      : `Tou·te·s les élu·e·s — triés par présence (${combined.length} affiché·e·s)`;
    grid.innerHTML = combined.length
      ? combined.map(personCard).join('')
      : `<div class="no-results">${isEn ? 'No results for this search.' : 'Aucun résultat pour cette recherche.'}</div>`;
    return;
  }

  // Ordre par défaut : Conseil des ministres seulement dans cette grille (rang
  // de cabinet), le reste de l'Assemblée s'affiche séparément via renderDeputes().
  { const _e = document.getElementById('ministresTitle'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('deputesTitle'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('deputesInfoBox'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('combinedTitle'); if(_e) _e.style.display = 'none'; }

  const f = norm(filter);
  const list = ministers.filter(m => (!partyFilter || m.party===partyFilter) && (!f || norm(m.name).includes(f) || norm(m.role).includes(f) || norm(m.roleEn||'').includes(f)));
  grid.innerHTML = list.map(m => personCard({ type:'minister', m, att: computeAttendance(m.name) })).join('');
  { const _e = document.getElementById('ministresCount'); if(_e) _e.textContent = ministers.length; }
}

// Comparateur de deux ministres (voir onglet 5, item réglé une fois la
// présence réelle disponible). Pas de ligne "postes précédents" — cet item a
// été volontairement écarté (LinkedIn et les bios officielles couvrent déjà
// ça), donc pas de donnée inventée ici pour remplir cette case.
function renderComparateurSelects(){
  if(!document.getElementById('compareA')) return;   // vue absente de cette page
  const selA = document.getElementById('compareA');
  const selB = document.getElementById('compareB');
  if(!selA || !selB) return;
  const isEn = currentLang === 'en';
  const placeholder = isEn ? '— Choose a minister —' : '— Choisir un ministre —';
  const options = `<option value="">${placeholder}</option>` + ministers.map(m => `<option value="${m.name.replace(/"/g,'&quot;')}">${m.name}</option>`).join('');
  const prevA = selA.value, prevB = selB.value;
  selA.innerHTML = options;
  selB.innerHTML = options;
  if([...selA.options].some(o=>o.value===prevA)) selA.value = prevA;
  if([...selB.options].some(o=>o.value===prevB)) selB.value = prevB;
}

function billsSponsoredBy(ministerName){
  const bareName = norm(ministerName.replace(/\s*\([^)]*\)\s*/g, ''));
  const memeNom = bills.filter(b => b.sponsor && norm(b.sponsor) === bareName);
  // Homonymes (les deux Eric Girard) : le nom du parrain ne suffit pas, il faut que son rôle
  // (« Ministre des Finances », jeu billsParrains) soit un rôle de CETTE personne. Sans rôle pour
  // trancher, on n'attribue rien plutôt que de prêter les lois de l'un à l'autre.
  const homonymes = deputes.filter(d => norm(d.name) === bareName).length > 1
    || ministers.some(m => m.name !== ministerName && norm(m.name.replace(/\s*\([^)]*\)\s*/g, '')) === bareName);
  if(!homonymes) return memeNom;
  const fiche = ministers.find(m => m.name === ministerName);
  const roles = fiche ? String(fiche.role || '').split('·').map(r => norm(r)).filter(Boolean) : [];
  return memeNom.filter(b => b.role && roles.includes(norm(b.role)));
}

function renderComparateurTable(){
  if(!document.getElementById('comparateurTable')) return;   // vue absente de cette page
  const container = document.getElementById('comparateurTable');
  if(!container) return;
  const isEn = currentLang === 'en';
  const nameA = document.getElementById('compareA')?.value;
  const nameB = document.getElementById('compareB')?.value;
  if(!nameA || !nameB){
    // Placeholder tant que les deux ministres ne sont pas choisis
    container.innerHTML = `<div class="compare-placeholder">
      <div class="cp-cols">
        <div class="cp-col ${nameA ? 'filled' : ''}"><span class="cp-slot">A</span><span class="cp-txt">${nameA ? nameA : (isEn ? 'Pick a first minister' : 'Choisissez un premier ministre')}</span></div>
        <div class="cp-vs">VS</div>
        <div class="cp-col ${nameB ? 'filled' : ''}"><span class="cp-slot">B</span><span class="cp-txt">${nameB ? nameB : (isEn ? 'Pick a second minister' : 'Choisissez un second ministre')}</span></div>
      </div>
      <div class="cp-hint">${isEn ? 'Portfolio · party · riding · vote attendance · bills sponsored — side by side.' : 'Portefeuille · parti · circonscription · présence votes · PL parrainés — côte à côte.'}</div>
    </div>`;
    return;
  }
  const mA = ministers.find(m => m.name === nameA);
  const mB = ministers.find(m => m.name === nameB);
  const depA = resolveDepute(nameA);
  const depB = resolveDepute(nameB);
  const presA = presidingRoleNote(nameA, isEn);
  const presB = presidingRoleNote(nameB, isEn);
  const attA = presA ? null : computeAttendance(nameA);
  const attB = presB ? null : computeAttendance(nameB);
  const billsA = billsSponsoredBy(nameA);
  const billsB = billsSponsoredBy(nameB);

  // Valeurs concises comme la maquette (pas de listes de titres qui débordent).
  const attCell = (att, pres) => pres ? '—' : (att ? pastillePresence(att.rate, isEn) : (isEn ? 'n/a' : 'n/d'));
  const rows = [
    [isEn?'Portfolio':'Portefeuille', isEn?(mA.roleEn||mA.role):mA.role, isEn?(mB.roleEn||mB.role):mB.role],
    [isEn?'Party':'Parti', mA.party, mB.party],
    [isEn?'Riding':'Circonscription', depA?depA.riding:'?', depB?depB.riding:'?'],
    [isEn?'Vote attendance':'Présence votes', attCell(attA,presA), attCell(attB,presB)],
    [isEn?'Bills sponsored':'PL parrainés', String(billsA.length), String(billsB.length)],
  ];

  container.innerHTML = `
    <div class="compare-table-wrap"><table class="compare-table">
      <tr><th></th><th>${mA.name}</th><th>${mB.name}</th></tr>
      ${rows.map(([label,a,b]) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`).join('')}
    </table></div>
  `;
}

/* ---------- État de l'Assemblée (source de vérité unique) ----------
   L'Assemblée nationale a été DISSOUTE le 27 août 2026 (fin de la 43e
   législature) : élections générales le 5 octobre 2026, nouvelle Assemblée
   convoquée le 17 novembre 2026.
   Conséquences factuelles, appliquées partout via cet objet :
     - tout projet de loi NON sanctionné meurt au feuilleton ;
     - les député·e·s cessent de l'être (ce sont des sortant·e·s / candidat·e·s) ;
     - on ne peut plus « challenger » un projet mort ni interpeller son parrain.
   ➜ Quand la nouvelle législature commencera (17 nov. 2026), remettre
     `dissolved: false` et mettre à jour la ligne « cal.status ». */
const ASSEMBLY = {
  dissolved: true,
  dissolvedOn: '2026-08-27',
  electionOn: '2026-10-05',
  newLegislatureOn: '2026-11-17',
  // À remplir À LA MAIN le soir du 5 octobre : UNE phrase, factuelle, sans
  // adjectif — p. ex. « Le Parti Québécois forme un gouvernement majoritaire
  // (63 sièges). » Vide tant que ce n'est pas officiel : la bande passe au
  // passé toute seule (voir phase), mais n'invente jamais de résultat.
  resultat: '',
  resultatEn: '',
};
// Phase déduite de la DATE LOCALE du visiteur, pour que le site ne dise pas
// « élections le 5 octobre » le matin du 6 sans que personne n'ait à y toucher —
// c'est le moment de trafic maximal, et un site au futur y aurait l'air
// abandonné. Le jour du vote compte encore comme campagne (on vote jusqu'à
// 20 h). Le retour à « legislature » reste MANUEL : dissolved = false le
// 17 novembre, quand la nouvelle Assemblée siège.
ASSEMBLY.phase = (function(){
  if(!ASSEMBLY.dissolved) return 'legislature';
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return local > ASSEMBLY.electionOn ? 'entre-deux' : 'campagne';
})();

function statusLabel(s, step){
  const isEn = currentLang === 'en';
  // À la dissolution, tout ce qui n'est pas sanctionné meurt (« mort au feuilleton »
  // dans le jargon de l'Assemblée — gardé dans la bande d'explication et le Lexique,
  // mais PAS sur la pastille : ici on écrit en langage clair).
  // On distingue selon l'étape atteinte, sinon le libellé contredirait les chips
  // d'étapes affichées juste en dessous : 95 des 102 projets n'ont jamais dépassé
  // la présentation, 7 s'étaient rendus à l'adoption du principe.
  if(ASSEMBLY.dissolved && s !== 'sanctionne'){
    // Appel sans étape (chips de filtre, qui portent sur un statut, pas un projet).
    if(step === undefined || step === null){
      return isEn ? 'Not passed' : 'Non adopté';
    }
    return (step <= 1)
      ? (isEn ? 'Dead on arrival' : 'Mort dans l\'œuf')
      : (isEn ? 'Died along the way' : 'Tombé en cours de route');
  }
  if(isEn){
    return s==='sanctionne' ? 'Assented to' : s==='laisse_de_cote' ? 'On ice' : 'Under review';
  }
  return s==='sanctionne' ? 'Sanctionnée' : s==='laisse_de_cote' ? 'Sur la glace' : 'À l\'étude';
}
function statusClass(s){
  if(ASSEMBLY.dissolved && s !== 'sanctionne') return 'status-mort';
  return s==='sanctionne' ? 'status-sanctionne' : s==='laisse_de_cote' ? 'status-glace' : 'status-encours';
}

// Fait correspondre le nom du parrain (format "Prénom Nom", voir build-frontend-data.js)
// avec les listes ministers/deputes déjà présentes sur la page, pour afficher son parti.
// Retourne null si aucune correspondance fiable n'est trouvée (jamais de supposition).
function sponsorParty(sponsorName){
  if(!sponsorName) return null;
  const target = norm(sponsorName);
  const minister = ministers.find(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,'')) === target);
  if(minister) return minister.party;
  const depute = deputes.find(d => norm(d.name) === target);
  return depute ? depute.party : null;
}

// Parti du parrain, calculé UNE SEULE FOIS par projet et mis en cache.
// ⚠️ Ne pas appeler sponsorParty() dans le filtre de recherche : mesuré à 7,1 ms
// pour les 143 projets, soit près de trois fois le coût total d'une frappe
// (2,5 ms). Invisible sur un ordinateur, sensible sur un téléphone lent.
// On stocke le sigle ET le nom complet, pour que « CAQ » comme « coalition
// avenir québec » trouvent la même chose.
let _partiParProjet = null;
function partiDuProjet(b){
  if(!_partiParProjet){
    _partiParProjet = new Map();
    // ⚠️ Le nom complet vient de `seats`, PAS de `deputes` : le champ partyFull
    // existe bien dans data/deputes.json mais l'injection ne le reprend pas, et
    // le chercher là donnait silencieusement une chaîne vide — « CAQ » trouvait,
    // « coalition avenir » ne trouvait rien.
    const nomComplet = new Map();
    for(const s of seats) if(s.party && s.label) nomComplet.set(s.party, s.label);
    for(const x of bills){
      const sigle = sponsorParty(x.sponsor);
      _partiParProjet.set(x.id, sigle ? `${sigle} ${nomComplet.get(sigle) || ''}` : '');
    }
  }
  return _partiParProjet.get(b.id) || '';
}

function billCard(b, ctx){
  ctx = ctx || 'full';
  const domId = 'bill-summary-' + ctx + '-' + b.id;
  const isEn = currentLang === 'en';
  const title = isEn ? (b.titleEn||b.title) : b.title;
  const note = isEn ? (b.noteEn||b.note) : b.note;
  // Le résumé n'est plus dans `b` : il arrive au dépliement (voir resumesProjets).
  const url = isEn ? (b.urlEn||b.url) : b.url;
  const billLabel = isEn ? `Bill ${b.num}` : `PL Nº ${b.num}`;
  const sponsorLabel = isEn ? 'Sponsor' : 'Parrain';
  const pourLabel = isEn ? 'yeas' : 'pour';
  const contreLabel = isEn ? 'nays' : 'contre';
  const abstLabel = isEn ? 'abstentions' : 'abstention';
  const srcNote = isEn ? "Summary written from the official title and public documents — not an excerpt of the bill's text." : "Résumé rédigé à partir du titre officiel et des documents publics — pas un extrait du texte de loi.";
  const lastActivityLabel = isEn ? 'Last activity' : 'Dernière activité';
  const lastActivityValue = b.lastActivity ? b.lastActivity : (isEn ? 'not confirmed' : 'non confirmée');
  const presentedOnLabel = isEn ? 'Tracked since' : 'Suivi depuis le';
  const presentedOnValue = b.presentedOn || (isEn ? 'unknown' : 'inconnu');
  const noSponsorLabel = isEn ? 'Not specified' : 'Non précisé';
  const party = sponsorParty(b.sponsor);
  const partyBadge = party ? `<span class="depute-party" style="background:${partyColors[party]}; color:${partyText(party)}">${party}</span>` : '';
  // Badge « 🔥 N demandes » (maquette) quand le projet est challengé — compte
  // AGRÉGÉ public (challengedCache) ; absent tant que le cache n'est pas chargé
  // (renderChallenged re-rend les listes une fois le cache arrivé).
  const chEntry = (challengedCache || []).find(c => Number(c.bill_id) === b.id);
  const hotBadge = chEntry ? `<span class="hot-badge">🔥 ${Number(chEntry.cnt).toLocaleString(isEn ? 'en-CA' : 'fr-CA')} ${isEn ? (Number(chEntry.cnt) > 1 ? 'requests' : 'request') : (Number(chEntry.cnt) > 1 ? 'demandes' : 'demande')}</span>` : '';
  const isFollowed = !!followedBills[b.id];
  // Le suivi (et les alertes courriel) est caché sur les projets sanctionnés :
  // ils sont finaux, ne changeront plus d'étape, donc rien à suivre. Gardé sur
  // les « sur la glace » (laissés de côté) : un projet dormant pourrait être
  // réactivé, auquel cas la personne qui le suit voudra être avertie. Caché aussi
  // pendant une dissolution : tout projet non sanctionné est mort au feuilleton,
  // le suivre promettrait une alerte qui ne viendra jamais.
  const canFollow = loiVivante(b) && (b.status === 'encours' || b.status === 'laisse_de_cote');
  const followBtnId = 'suivre-' + ctx + '-' + b.id;
  const followRow = !canFollow ? '' : `<div class="bill-follow-row">
      <span class="follow-hint">${!currentUser
        ? (isEn ? 'Sign in to follow it — it goes to My file' : 'Connexion requise — il s’ajoute à Mon dossier')
        : (isEn ? 'In My file · subscribers get an email the morning it moves' : 'Dans Mon dossier · les abonnés reçoivent un courriel le matin où il avance')}</span>
      <button class="follow-btn ${isFollowed?'on':''}" id="${followBtnId}" onclick="event.stopPropagation(); ${currentUser ? `toggleFollowBill(${b.id}, '${followBtnId}')` : 'goToAccount()'}">${!currentUser
        ? (isEn ? '🔒 Sign in to follow' : '🔒 Se connecter pour suivre')
        : libelleSuivreLoi(isFollowed, isEn)}</button>
    </div>`;
  // Bouton « Demander une explication » (remplace l'ancien « Suivre » pour les
  // projets de loi — le suivi des personnes reste intact ailleurs). 3 états :
  // déconnecté (mène au compte), à demander, déjà demandé. Seulement sur les
  // projets ACTIFS (status 'encours') : un projet sanctionné ou laissé de côté
  // ne se « challenge » plus.
  const isFlagged = !!myFlaggedBills[b.id];
  const canFlag = b.status === 'encours' && loiVivante(b);
  const flagBtnId = 'demand-' + ctx + '-' + b.id;
  const mailHint = isEn
    ? 'One email at the moments that count (500 & 1,000 requests, or if it becomes law)'
    : 'Un courriel aux moments qui comptent (500 et 1000 demandes, ou si ça devient loi)';
  let flagRow = '';
  if(canFlag){
    let hint, label, onclick = '', title = '';
    if(!currentUser){
      hint = isEn ? 'Sign in — one request per person, no anonymous requests' : 'Connexion requise — une demande par personne, aucune demande anonyme';
      label = isEn ? '🔒 Sign in to challenge' : '🔒 Se connecter pour challenger';
      onclick = "goToAccount()";
    } else if(isFlagged){
      // Déjà challengé → re-cliquer RETIRE le challenge (bascule).
      hint = mailHint; label = isEn ? '✓ Challenged — remove' : '✓ Challengé — retirer';
      title = isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge';
      onclick = `toggleChallenge(${b.id}, '${flagBtnId}')`;
    } else {
      hint = mailHint; label = isEn ? 'Ask for an explanation' : 'Demander une explication';
      onclick = `toggleChallenge(${b.id}, '${flagBtnId}')`;
    }
    flagRow = `<div class="bill-follow-row">
      <span class="follow-hint">${hint}</span>
      <button class="follow-btn ${isFlagged?'on':''}" id="${flagBtnId}"${title?` title="${title}"`:''} onclick="event.stopPropagation(); ${onclick}">${label}</button>
    </div>`;
  }
  // Partage du projet : toujours les trois mêmes boutons, 𝕏 / Facebook / copier.
  // Le lien pointe vers /projets-de-loi?pl=NUM, qui ouvre directement CE projet
  // (voir openBillFromQuery).
  //
  // ⚠️ Ne PAS réintroduire navigator.share ici. On avait un bouton « ↗ Partager »
  // unique quand le navigateur supporte le partage natif — mais Chrome et Brave
  // le supportent AUSSI sur Windows, où il ouvre la fenêtre de partage du
  // système : un gros panneau modal pour copier un lien. Sur téléphone c'est
  // naturel, sur ordinateur c'est disproportionné, et on ne peut pas distinguer
  // les deux de façon fiable. Trois boutons visibles font le travail partout.
  const shareCtrls =
      `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'x', event)" aria-label="${isEn ? 'Share on X' : 'Partager sur X'}">𝕏</button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'fb', event)" aria-label="${isEn ? 'Share on Facebook' : 'Partager sur Facebook'}">FB</button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'copy', event)" aria-label="${isEn ? 'Copy link' : 'Copier le lien'}">⧉</button>`;
  const shareRow = `<div class="bill-share-row">
      <span class="bill-share-label">${isEn ? 'Share:' : 'Partager :'}</span>
      ${shareCtrls}
    </div>`;
  // Les votes ne sont plus affichés sur les cartes de projets de loi — le
  // détail complet (décomptes + qui a voté quoi) vit dans l'onglet Votes.
  return `
    <div class="bill" onclick="toggleBillSummary('${domId}', event)">
      <div class="head">
        <span class="num">${billLabel}</span>
        <div class="bill-head-main">
          <h3>${title}</h3>
          <div class="meta">${sponsorLabel} : ${b.sponsor || noSponsorLabel} · ${presentedOnLabel} ${presentedOnValue}</div>
        </div>
        <div class="bill-head-right">
          ${hotBadge}
          ${partyBadge}
          <span class="status-pill ${statusClass(b.status)}">${statusLabel(b.status, b.step)}</span>
        </div>
      </div>
      <div class="bstep-row">
        ${(isEn?stepsEn:steps).map((s,i)=>{
          const cur = displayStep(b.step)-1;
          const cls = i < cur ? 'on' : (i === cur ? 'now' : 'off');
          return `<span class="bstep ${cls}">${s}</span>`;
        }).join('')}
      </div>
      <div class="expand-hint" id="hint-${domId}">${t('btn.viewSummary')}</div>
      <div class="bill-summary" id="${domId}" data-bill="${b.id}">
        <div class="bill-open-grid">
          <div>
            <div class="open-label">${isEn ? 'What it does, plainly' : 'Ce que ça fait, en clair'}</div>
            <div class="bill-summary-body"></div>
            <p class="src-note">${b.summaryAiGenerated ? (isEn ? '⚙ AI-generated summary of the bill as introduced — may not reflect amendments made since.' : '⚙ Résumé généré par IA à partir du texte tel que présenté — peut ne pas refléter les amendements adoptés depuis.') : srcNote}</p>
          </div>
          <div class="bill-open-side">
            <div class="open-label side">${lastActivityLabel}</div>
            <div class="last-event-box">${lastActivityValue}${note ? ` — ${note}` : ''}</div>
            <a class="bill-more" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${t('btn.viewFull')}</a>
            ${followRow}
            ${flagRow}
            ${shareRow}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Les résumés en clair des projets de loi — le cœur de l'onglet, mais aussi 177 ko bruts et
// 55 ko compressés, soit plus du tiers du poids de la page pour du texte qui ne s'affiche que
// dans la carte dépliée. Ils vivent donc dans data/bills-resumes-<langue>.json et arrivent au
// premier besoin : un dépliement de carte, ou une recherche par mot-clé (qui les fouille).
// Un fichier par langue : on n'a jamais besoin des deux à la fois.
const _resumes = new Map();
function resumesProjets(langue){
  const cle = langue === 'en' ? 'en' : 'fr';
  if(_resumes.has(cle)) return _resumes.get(cle);
  const p = fetch(`/data/bills-resumes-${cle}.json`)
    .then(r => r.ok ? r.json() : null)
    // Un échec ne doit pas rester collé : on l'oublie pour que la prochaine tentative réessaie.
    .catch(() => null)
    .then(d => { if(!d) _resumes.delete(cle); return d; });
  _resumes.set(cle, p);
  return p;
}
// Ce qu'on a DÉJÀ sous la main, sans attendre. Sert à la recherche, qui doit rester synchrone.
let _resumesFr = null, _resumesEn = null;
function resumeConnu(b, isEn){
  const m = isEn ? _resumesEn : _resumesFr;
  return (m && m[b.id]) || (isEn && _resumesFr ? _resumesFr[b.id] : null) || null;
}
async function chargerResumes(langue){
  const m = await resumesProjets(langue);
  if(!m) return null;
  if(langue === 'en') _resumesEn = m; else _resumesFr = m;
  return m;
}

async function remplirResume(el){
  if(el.dataset.rempli) return;
  const isEn = currentLang === 'en';
  const corps = el.querySelector('.bill-summary-body');
  if(!corps) return;
  const dejaLa = resumeConnu({ id: el.dataset.bill }, isEn);
  if(!dejaLa) corps.innerHTML = `<p><em>${isEn ? 'Loading the summary…' : 'Chargement du résumé…'}</em></p>`;
  const m = await chargerResumes(isEn ? 'en' : 'fr');
  // L'anglais n'existe pas pour tous les projets : on retombe sur le français, comme avant.
  let texte = m ? m[el.dataset.bill] : null;
  if(!texte && isEn) texte = (await chargerResumes('fr'))?.[el.dataset.bill] || null;
  corps.innerHTML = texte
    || `<p><em>${isEn ? 'Summary not available for this bill.' : 'Résumé non disponible pour ce projet de loi.'}</em></p>`;
  if(texte) el.dataset.rempli = '1';
}

function toggleBillSummary(domId, evt){
  if(evt) evt.stopPropagation();
  const el = document.getElementById(domId);
  const hint = document.getElementById('hint-'+domId);
  const willOpen = !el.classList.contains('open');
  if(willOpen) remplirResume(el);
  if(willOpen){
    // Accordéon (maquette) : un seul résumé ouvert à la fois.
    document.querySelectorAll('.bill-summary.open').forEach(other=>{
      if(other === el) return;
      other.classList.remove('open');
      const h = document.getElementById('hint-'+other.id);
      if(h) h.textContent = t('btn.viewSummary');
    });
  }
  el.classList.toggle('open', willOpen);
  if(hint) hint.textContent = willOpen ? t('btn.hideSummary') : t('btn.viewSummary');
}

// Bascule la section « votes enregistrés » d'une carte entre la vue compacte
// (une ligne par vote) et la vue détaillée (détail nominatif, les + par ligne).
function toggleBillVotes(id){
  const compact  = document.getElementById(id + '-compact');
  const detailed = document.getElementById(id + '-detailed');
  const plus     = document.getElementById('plus-' + id);
  if(!compact || !detailed) return;
  const opening = detailed.style.display === 'none';
  detailed.style.display = opening ? '' : 'none';
  compact.style.display  = opening ? 'none' : '';
  if(plus) plus.textContent = opening ? '−' : '+';
}

let billsStatusFilter = '';
let billsStepFilter = null;
let billsSortDir = 'desc';
const billsStatusOrder = ['sanctionne','encours','laisse_de_cote'];

function renderStatusFilters(){
  if(!document.getElementById('statusFilters')) return;   // vue absente de cette page
  const el = document.getElementById('statusFilters');
  if(!el) return;
  const allLabel = currentLang==='en' ? 'All statuses' : 'Tous les statuts';
  el.innerHTML = `<span class="status-chip ${!billsStatusFilter?'active':''}" onclick="setBillsStatusFilter('')">${allLabel}</span>` +
    billsStatusOrder.map(s=>`<span class="status-chip ${billsStatusFilter===s?'active':''}" onclick="setBillsStatusFilter('${s}')">${statusLabel(s)}</span>`).join('');
}
function toggleFilterPanel(which){
  const panelId = which === 'status' ? 'statusFilters' : 'stepFilters';
  const btnId = which === 'status' ? 'statusFilterBtn' : 'stepFilterBtn';
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const isOpen = panel.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen);
}
function closeFilterPanelsOnMobile(){
  if(window.innerWidth > 640) return;
  ['statusFilters','stepFilters'].forEach(id=>{
    document.getElementById(id).classList.remove('open');
  });
  ['statusFilterBtn','stepFilterBtn'].forEach(id=>{
    document.getElementById(id).setAttribute('aria-expanded','false');
  });
}

function setBillsStatusFilter(s){
  billsStatusFilter = (billsStatusFilter===s) ? '' : s;
  renderStatusFilters();
  renderBills();
  closeFilterPanelsOnMobile();
}

function renderStepFilters(){
  if(!document.getElementById('stepFilters')) return;   // vue absente de cette page
  const el = document.getElementById('stepFilters');
  if(!el) return;
  const labels = currentLang==='en' ? stepsEn : steps;
  el.innerHTML = labels.map((s,i)=>`<span class="step-chip ${billsStepFilter===i+1?'active':''}" onclick="setBillsStepFilter(${i+1})">${s}</span>`).join('');
}
function setBillsStepFilter(n){
  billsStepFilter = (billsStepFilter===n) ? null : n;
  renderStepFilters();
  renderBills();
  closeFilterPanelsOnMobile();
}

function updateSortToggleLabel(){
  if(!document.getElementById('sortToggle')) return;   // vue absente de cette page
  const btn = document.getElementById('sortToggle');
  if(!btn) return;
  // Libellés courts : le bouton vit dans la rangée des contrôles, à côté de la
  // recherche. Il annonce l'ORDRE COURANT, pas l'action — c'est ce qu'on lit sur
  // les en-têtes de tri partout ailleurs.
  const asc = currentLang==='en' ? '↑ Oldest activity' : '↑ Activité ancienne';
  const desc = currentLang==='en' ? '↓ Recent activity' : '↓ Activité récente';
  btn.textContent = billsSortDir === 'desc' ? desc : asc;
  btn.setAttribute('title', currentLang==='en'
    ? 'Sort by date of last activity on the bill'
    : "Trier par date de dernière activité sur le projet de loi");
}
function toggleBillsSort(){
  billsSortDir = billsSortDir === 'desc' ? 'asc' : 'desc';
  updateSortToggleLabel();
  billsShown = BILLS_STEP;
  renderBills();
}

// Filtre rapide des votes : Tous / Divisés / Projets de loi / Motions.
//
// Remplace un réglage « afficher les motions » qui n'a JAMAIS fonctionné : son
// état existait, son libellé était traduit, mais aucun bouton ne le posait dans
// la page, ET renderVotes ne le lisait pas. Doublement mort.
//
// « Divisé » = au moins deux partis ont pris des positions majoritaires
// différentes. Mesuré sur les 735 votes de la 43e législature : 52 % sont
// unanimes (motions de condamnation, nominations — lire « 105 pour, 0 contre »
// n'apprend rien), 44 % opposent les partis, et AUCUN n'est serré — avec 79
// sièges, la CAQ gagne chaque affrontement par une cinquantaine de voix.
// L'information n'est donc pas qui gagne : c'est sur quoi on s'oppose.
let votesQuickFilter = 'tous';
function setVotesQuickFilter(k){
  votesQuickFilter = k;
  votesShown = 6;
  renderVotes();
}
// Calculé au build, plus au chargement : c'est scrapers/build-votes-data.js qui parcourt le
// détail nominatif et pose `divise` sur chaque vote. Avant, le navigateur relisait 1 032 ko de
// nominatif à la première frappe dans le champ de recherche — pour en tirer 735 booléens.
function voteDivise(v){
  return v.divise === true;
}
function voteAdmisParFiltre(v, filtre){
  if(filtre === 'divises') return voteDivise(v);
  if(filtre === 'projets') return !!v.billNum;
  if(filtre === 'motions') return !v.billNum;
  return true;
}
// Les compteurs tiennent compte de la recherche en cours (comme sur Promesses) :
// le chiffre d'un bouton doit correspondre à ce qu'on verrait en le pressant.
function renderVotesQuickFilters(correspondRecherche){
  if(!document.getElementById('votesQuickFilters')) return;   // vue absente de cette page
  const el = document.getElementById('votesQuickFilters');
  if(!el) return;
  const isEn = currentLang === 'en';
  const defs = [
    ['tous',    isEn ? 'All' : 'Tous'],
    ['divises', isEn ? 'Divided' : 'Divisés'],
    ['projets', isEn ? 'Bills' : 'Projets de loi'],
    ['motions', 'Motions'],
  ];
  const titres = {
    divises: isEn
      ? 'Votes where at least two parties took opposite positions'
      : 'Votes où au moins deux partis ont pris des positions opposées',
    motions: isEn
      ? 'Motions are not bills: they state a position, they do not make law'
      : 'Une motion n\'est pas un projet de loi : elle exprime une position, elle ne fait pas de loi',
  };
  el.innerHTML = defs.map(([k, label]) => {
    const n = votes.filter(v => correspondRecherche(v) && voteAdmisParFiltre(v, k)).length;
    const sel = votesQuickFilter === k;
    return `<button class="qf-btn ${sel ? 'active' : ''}${n === 0 ? ' qf-zero' : ''}" onclick="setVotesQuickFilter('${k}')"${titres[k] ? ` title="${titres[k]}"` : ''}>${label} <span class="qf-n">${n}</span></button>`;
  }).join('');
}

// Filtre rapide des projets (maquette) : Tous / En cours / Adoptés / 🔥 Challengés
let billsQuickFilter = 'tous';
// On n'affiche pas les 143 projets d'un coup : 10, puis « + 10 » à la demande.
// ⚠️ Toute action qui change la LISTE (filtre, recherche, tri) doit remettre ce
// compteur à BILLS_STEP — sinon on garde une fenêtre ouverte sur une liste qui
// n'a plus rien à voir, et le lecteur croit voir « tout » ce qui correspond.
const BILLS_STEP = 10;
let billsShown = BILLS_STEP;
function loadMoreBills(){ billsShown += BILLS_STEP; renderBills(); }
function setBillsQuickFilter(k){
  billsQuickFilter = k;
  billsShown = BILLS_STEP;
  renderBills();
}
function renderBillsQuickFilters(){
  if(!document.getElementById('billsQuickFilters')) return;   // vue absente de cette page
  const el = document.getElementById('billsQuickFilters');
  if(!el) return;
  const isEn = currentLang === 'en';
  const defs = [
    ['tous', isEn ? 'All' : 'Tous'],
    ['encours', ASSEMBLY.dissolved ? (isEn ? 'Not passed' : 'Non adoptés') : (isEn ? 'Active' : 'En cours')],
    ['adoptes', isEn ? 'Passed' : 'Adoptés'],
    ['challenges', isEn ? '🔥 Challenged' : '🔥 Challengés'],
  ];
  el.innerHTML = defs.map(([k, label]) =>
    `<button class="qf-btn ${billsQuickFilter===k?'active':''}" onclick="setBillsQuickFilter('${k}')">${label}</button>`
  ).join('');
}

function renderBills(keyword){
  if(!document.getElementById('billsList')) return;   // vue absente de cette page
  keyword = keyword !== undefined ? keyword : (document.getElementById('searchBills')?.value || '');
  const kw = norm(keyword);
  const isEn = currentLang === 'en';
  const ch = challengedCache || [];
  // La recherche fouille les résumés, qui ne sont plus dans la page. Dès qu'on cherche vraiment
  // quelque chose, on va les chercher et on refait le rendu une fois arrivés — plutôt que de
  // faire payer 55 ko à tous ceux qui ne cherchent jamais rien. Entre les deux, la recherche
  // porte déjà sur le titre, la note, le parrain et le numéro.
  if(kw && !_resumesFr) chargerResumes('fr').then(m => { if(m) renderBills(keyword); });
  // « 3 », « pl 3 », « PL Nº 3 », « projet de loi n° 3 » désignent tous le PROJET
  // NUMÉRO 3, et rien d'autre. Sans cette règle, « 3 » renvoyait 75 projets (tout
  // résumé ou toute date contenant un 3) et « pl 3 » en renvoyait 14, parce que
  // « pl 30 », « pl 31 »… contiennent « pl 3 » comme sous-chaîne.
  const numCherche = (kw.match(/^(?:pl|projet de loi)?\s*(?:n[°ºo]?\s*)?(\d+)$/) || [])[1] ?? null;
  const list = bills.filter(b => {
    const quickOk = billsQuickFilter === 'tous'
      || (billsQuickFilter === 'encours' && (ASSEMBLY.dissolved ? b.status !== 'sanctionne' : b.status === 'encours'))
      || (billsQuickFilter === 'adoptes' && b.status === 'sanctionne')
      || (billsQuickFilter === 'challenges' && ch.some(c => Number(c.bill_id) === b.id));
    const summaryText = ((_resumesFr && _resumesFr[b.id]) || '').replace(/<[^>]+>/g, ' ');
    // On cherche dans : le titre, le résumé en clair, la ligne de statut, le nom
    // du parrain, le numéro sous toutes ses écritures, et le PARTI du parrain
    // (sigle + nom complet). Sans le parti, taper « CAQ » ne donnait rien alors
    // que chaque carte affiche une pastille CAQ — le lecteur croit à un bogue.
    // « pl 3 » est ajouté parce que c'est la notation que le site lui-même
    // affiche sur toutes les cartes ; elle ne trouvait rien.
    const haystack = norm([
      b.title, summaryText, b.note, b.sponsor,
      'projet de loi n° ' + b.num, 'pl ' + b.num, 'pl no ' + b.num,
      partiDuProjet(b),
    ].join(' '));
    const kwOk = !kw || (numCherche !== null ? String(b.num) === numCherche : haystack.includes(kw));
    return quickOk && kwOk;
  }).sort((a,b)=>{
    const da = a.lastActivity || '', db = b.lastActivity || '';
    if(!da && !db) return 0;
    if(!da) return 1;
    if(!db) return -1;
    return billsSortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
  });
  // La bande jaune « challenger » s'intercale entre le 2e et le 3e projet :
  // 2 premiers dans #billsList, le reste dans #billsListRest (la bande est
  // le noeud HTML statique entre les deux).
  const el = document.getElementById('billsList');
  const rest = document.getElementById('billsListRest');
  const banner = document.getElementById('band-challenge-explainer');
  const visibles = list.slice(0, billsShown);
  if(list.length){
    el.innerHTML = visibles.slice(0, 2).map(b=>billCard(b,'full')).join('');
    if(rest){
      rest.innerHTML = visibles.slice(2).map(b=>billCard(b,'full')).join('');
      // Barre « + 10 », même patron que celle des votes.
      if(list.length > visibles.length){
        const reste = list.length - visibles.length;
        const pas = Math.min(BILLS_STEP, reste);
        rest.innerHTML += `<button class="votes-more" onclick="loadMoreBills()">${isEn
          ? `Show ${pas} more — ${visibles.length} of ${list.length}`
          : `Voir ${pas} de plus — ${visibles.length} sur ${list.length}`}</button>`;
      } else if(list.length > BILLS_STEP){
        rest.innerHTML += `<div class="votes-more-note">${isEn
          ? `All ${list.length} shown` : `Les ${list.length} affichés`}</div>`;
      }
    }
    // Pendant la dissolution, on n'affiche pas l'explication du « challenge » :
    // la fonction est désactivée (on n'interpelle pas le parrain d'un projet mort).
    if(banner) banner.style.display = ASSEMBLY.dissolved ? 'none' : '';
  } else {
    el.innerHTML = `<div class="no-results">${isEn ? 'No bill matches this search.' : 'Aucun projet de loi ne correspond à cette recherche.'}</div>`;
    if(rest) rest.innerHTML = '';
    if(banner) banner.style.display = 'none'; // pas de bande sur « aucun résultat »
  }
  // (idem : le compteur de l accueil vient de stats.json.)
  // Titre de résultats + note (suivent le filtre actif et la langue)
  renderBillsQuickFilters();
  const titles = {
    tous:       isEn ? 'All bills' : 'Tous les projets',
    encours:    ASSEMBLY.dissolved ? (isEn ? 'Bills that never passed' : 'Projets non adoptés') : (isEn ? 'Active bills' : 'En cours'),
    adoptes:    isEn ? 'Passed bills' : 'Adoptés',
    challenges: isEn ? 'Challenged bills' : 'Challengés',
  };
  const titleEl = document.getElementById('billsResultTitle');
  const noteEl = document.getElementById('billsResultNote');
  if(titleEl) titleEl.textContent = titles[billsQuickFilter];
  // La note dit ce qui est À L'ÉCRAN sur le total filtré — sinon annoncer « 143 »
  // au-dessus de 10 cartes laisse croire à un bogue d'affichage.
  if(noteEl){
    const combien = visibles.length < list.length ? `${visibles.length} / ${list.length}` : `${list.length}`;
    noteEl.textContent = `${combien} ${isEn ? 'shown · click a card → plain summary' : 'affiché·s · cliquez une carte → résumé en clair'}`;
  }
}

function renderApercuBills(){
  if(!document.getElementById('apercuBills')) return;   // vue absente de cette page
  { const _e = document.getElementById('apercuBills'); if(_e) _e.innerHTML = bills.slice(0,4).map(b=>billCard(b,'apercu')).join(''); }
}

// Projets « challengés » : affiche PUBLIQUEMENT les projets de loi ayant atteint
// le seuil de demandes d'explications, via l'agrégat Supabase flag_counts() qui
// ne renvoie QUE les totaux (jamais qui a demandé quoi). Robuste : si la fonction
// SQL n'existe pas encore, l'appel échoue en douceur -> état vide, pas d'erreur.
// Paliers de « challenge » (montent en continu, le compteur ne se remet jamais à
// zéro). 500 = apparition + momentum ; 1000 = seuil pétition ; au-dessus =
// escalade (déclenchée MANUELLEMENT par l'admin — voir le panneau admin).
// ⚠️ La fonction SQL flag_counts() doit renvoyer les projets >= 500 (le 1er palier).
const CHALLENGE_TIERS = [500, 1000, 2500, 5000, 25000];
const CHALLENGE_THRESHOLD = CHALLENGE_TIERS[0];
const PETITION_THRESHOLD = 1000;
// Un projet apparaît dans « Projets challengés » dès la PREMIÈRE demande (pas
// besoin d'attendre 500) — pour montrer l'élan et laisser les gens « piler »
// dessus directement depuis l'accueil. ⚠️ Nécessite que la fonction SQL
// flag_counts() renvoie aussi les projets sous 500 : voir
// scripts/supabase-schema-campaign.sql (having count(*) >= 1).
const CHALLENGE_DISPLAY_MIN = 1;
const CHALLENGE_DISPLAY_MAX = 9; // cap total (pagine par 3 via « Voir plus »)
// Pagination en carrousel : 3 cartes affichées à la fois. « Voir plus »
// REMPLACE les 3 visibles par les 3 suivantes (slide-in), et reboucle au
// début une fois au bout. La page courante survit aux re-rendus.
let challengedPage = 0;
const nextChallengeTier = cnt => CHALLENGE_TIERS.find(t => cnt < t) ?? null;
let challengedCache = null;

// flag_counts() ne renvoie que des `bill_id` : il faut des titres pour en faire des cartes.
// Jusqu'au 24 septembre 2026 cette jointure se faisait sur la variable `bills` de la page —
// or l'accueil n'en charge que 4 (`apercuBills` remplit la MÊME variable que la liste
// complète, voir _remplir en haut). Tout projet challengé hors de ces quatre-là disparaissait
// en silence, et l'accueil affirmait « Personne n'a encore demandé d'explication » : une
// phrase qu'il n'était pas en mesure de savoir vraie. D'où cette liste maigre (sept champs
// par projet), qui n'est PAS déclarée dans data-donnees et n'arrive que si l'agrégat renvoie
// au moins un projet dont la page n'a pas le titre. Une page où rien n'est challengé ne paie
// rien.
let _challengeBillsP = null, _challengeParId = new Map();
function chargerChallengeBills(){
  if(_challengeBillsP) return _challengeBillsP;
  _challengeBillsP = fetch('/data/site/challengeBills.json')
    .then(r => r.ok ? r.json() : null)
    // Un échec ne doit pas rester collé : on l'oublie pour que la prochaine tentative réessaie.
    .catch(() => null)
    .then(d => { if(!d) _challengeBillsP = null; return d; });
  return _challengeBillsP;
}
// Le projet derrière un bill_id : d'abord ce que la page a chargé (la page des projets a les
// 143 complets, avec parrain et note), sinon la liste maigre.
const projetChallenge = (billId) =>
  bills.find(b => b.id === Number(billId)) || _challengeParId.get(Number(billId)) || null;

// Charge le palmarès public : des TOTAUX par projet, jamais d'identités (la RLS de
// bill_flags protège qui a demandé quoi). Séparée du rendu le 24 septembre 2026 — enfermée
// dans renderChallenged(), elle ne tournait que sur l'accueil, et la page des projets gardait
// donc un filtre « 🔥 Challengés » qui ne renvoyait jamais rien et des cartes sans badge.
async function chargerChallenges(){
  if(challengedCache !== null) return challengedCache;
  try{
    const { data, error } = await supabaseClient.rpc('flag_counts');
    challengedCache = (!error && Array.isArray(data)) ? data : [];
  }catch(e){ challengedCache = []; }
  if(challengedCache.some(c => !bills.some(b => b.id === Number(c.bill_id)))){
    const maigres = await chargerChallengeBills();
    if(maigres) _challengeParId = new Map(maigres.map(b => [Number(b.id), b]));
  }
  // Le cache vient d'arriver : re-rend les listes de projets pour que les badges
  // « 🔥 N demandes » apparaissent (billCard les lit) et que le filtre ait de quoi filtrer.
  renderBills();
  renderApercuBills();
  return challengedCache;
}

// Partage social d'un projet challengé — accès DIRECT en un clic (pas de
// copier-coller). Message : « X personnes contestent le projet de loi n° N —
// [titre]. Connectez-vous pour appuyer cette demande : [lien] ». X et « Copier »
// portent le texte complet ; Facebook n'affiche que l'aperçu du lien (règle FB,
// pas contournable) — le bouton reste direct quand même.
function shareChallenge(billId, count, platform, evt){
  if(evt) evt.stopPropagation();
  const isEn = currentLang === 'en';
  const b = projetChallenge(billId);
  const num = b ? b.num : '';
  const title = b ? (isEn ? (b.titleEn || b.title) : b.title) : '';
  const n = Number(count).toLocaleString(isEn ? 'en-CA' : 'fr-CA');
  const url = 'https://dossierquebec.ca/';
  const text = isEn
    ? `${n} people are challenging Bill no. ${num} — ${title}. Sign in to support this request:`
    : `${n} personnes contestent le projet de loi n° ${num} — ${title}. Connectez-vous pour appuyer cette demande :`;
  if(platform === 'x'){
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else if(platform === 'fb'){
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else { // copier
    copierLien(text + ' ' + url, evt, isEn);
  }
}

// Copie dans le presse-papiers, avec accusé de réception SUR le bouton cliqué :
// son libellé devient ✓ pendant une seconde et demie.
//
// ⚠️ Ne pas revenir à une alert(). C'était le comportement d'origine : une
// fenêtre modale à fermer pour apprendre qu'un lien avait été copié — plus
// d'effort que l'action elle-même, et deux clics pour un.
function copierLien(texte, evt, isEn){
  // Capté MAINTENANT : evt.currentTarget devient null dès la fin de la
  // distribution de l'événement, donc inutilisable depuis un .then().
  const bouton = evt && evt.target && evt.target.closest ? evt.target.closest('button') : null;
  const confirmer = () => {
    if(!bouton || bouton.dataset.repos) return;
    bouton.dataset.repos = bouton.textContent;
    bouton.textContent = '✓';
    bouton.classList.add('copie');
    setTimeout(() => {
      bouton.textContent = bouton.dataset.repos;
      delete bouton.dataset.repos;
      bouton.classList.remove('copie');
    }, 1500);
  };
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject())
    .then(confirmer)
    // Repli seulement en cas d'échec réel (presse-papiers refusé) : là une
    // fenêtre se justifie, c'est le seul moyen de laisser copier à la main.
    .catch(() => prompt(isEn ? 'Copy this:' : 'Copiez ceci :', texte));
}

// Partage d'un projet de loi (onglet Projets). Message neutre + lien profond
// /projets-de-loi?pl=NUM qui ouvre directement le projet à l'arrivée.
// Trois destinations : 𝕏, Facebook, copier.
function shareBill(billId, platform, evt){
  if(evt) evt.stopPropagation();
  const isEn = currentLang === 'en';
  const b = bills.find(x => x.id === Number(billId));
  if(!b) return;
  const title = isEn ? (b.titleEn || b.title) : b.title;
  const url = `https://dossierquebec.ca/projets-de-loi?pl=${encodeURIComponent(b.num)}`;
  const text = isEn
    ? `Bill no. ${b.num} — ${title}. Plain-language summary on DossierQuébec:`
    : `Projet de loi n° ${b.num} — ${title}. Résumé en clair sur DossierQuébec :`;
  if(platform === 'x'){
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else if(platform === 'fb'){
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else { // copier
    copierLien(text + ' ' + url, evt, isEn);
  }
}

// Lien profond : /projets-de-loi?pl=NUM → ouvre directement ce projet.
function openBillFromQuery(){
  const params = new URLSearchParams(location.search);
  const pl = params.get('pl');
  if(!pl) return;
  // Le numéro n'est pas unique (PL 1, PL 2… reviennent à chaque session) : quand le lien porte
  // aussi l'id (courriels d'alerte, Mes dossiers), c'est lui qui choisit.
  const id = params.get('id');
  const b = (id && bills.find(x => String(x.id) === id)) || bills.find(x => String(x.num) === String(pl));
  if(!b) return;
  // S'assurer qu'on est bien sur l'onglet Projets (au cas où le lien arrive
  // ailleurs, ex. /?pl=NUM) — sans toucher à l'URL (fromHistory).
  if(viewFromPath() !== 'projets'){ goToTab('projets', { fromHistory: true, noScroll: true }); }
  // Le projet doit passer le filtre courant : on force « tous » + recherche vide.
  billsQuickFilter = 'tous';
  // ⚠️ ET il doit être DANS LA FENÊTRE affichée. Depuis que la liste se limite à
  // 10 projets, un lien partagé vers un projet plus bas ne trouvait plus sa carte
  // dans le DOM : le lien semblait simplement ne rien faire. On ouvre donc assez
  // de pages pour l'inclure. (Le tri est le même que dans renderBills.)
  const ordonnes = [...bills].sort((x, y) => {
    const dx = x.lastActivity || '', dy = y.lastActivity || '';
    if(!dx && !dy) return 0;
    if(!dx) return 1;
    if(!dy) return -1;
    return billsSortDir === 'desc' ? dy.localeCompare(dx) : dx.localeCompare(dy);
  });
  const rang = ordonnes.findIndex(x => x.id === b.id);
  if(rang >= 0) billsShown = Math.max(billsShown, Math.ceil((rang + 1) / BILLS_STEP) * BILLS_STEP);
  const sb = document.getElementById('searchBills'); if(sb) sb.value = '';
  renderBills();
  const domId = 'bill-summary-full-' + b.id;
  const summary = document.getElementById(domId);
  if(summary){
    if(!summary.classList.contains('open')) toggleBillSummary(domId);
    const card = summary.closest('.bill');
    if(card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

async function renderChallenged(){
  const el = document.getElementById('challengedList');
  // Le palmarès se charge MÊME quand la section n'est pas sur cette page : la page des
  // projets en a besoin pour son filtre « 🔥 Challengés » et pour les badges de ses cartes.
  // Les pages qui n'affichent ni l'un ni l'autre (votes, ministres…) n'appellent rien.
  if(el || document.getElementById('billsList')) await chargerChallenges();
  if(!el) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  const fmt = n => n.toLocaleString(isEn ? 'en-CA' : 'fr-CA');
  const titleEl = document.getElementById('challengedTitle');
  const subEl = document.getElementById('challengedSub');
  if(titleEl) titleEl.textContent = ASSEMBLY.dissolved
    ? (isEn ? 'Bills citizens had challenged' : 'Projets que les citoyen·ne·s avaient challengés')
    : (isEn ? 'Bills challenged by citizens' : 'Projets challengés par les citoyen·ne·s');
  // Pendant la dissolution, on ne promet plus de pétition : ces projets sont morts
  // au feuilleton, on présente donc la section comme une trace de la législature.
  if(subEl) subEl.textContent = ASSEMBLY.dissolved
    ? (isEn
        ? 'Demands made before the Assembly was dissolved — these bills died with it and would have to start over'
        : 'Demandes faites avant la dissolution — ces projets sont morts avec elle et devraient repartir de zéro')
    : (isEn
        ? `The moment one person asks for an explanation, the bill appears here — pile on in one click; at ${fmt(PETITION_THRESHOLD)}, we push for a petition`
        : `Dès qu'une personne demande une explication, le projet apparaît ici — appuyez en un clic ; à ${fmt(PETITION_THRESHOLD)}, on pousse pour une pétition`);

  const challenged = (challengedCache || [])
    .map(c => ({ cnt: Number(c.cnt), bill: projetChallenge(c.bill_id) }))
    .filter(c => c.bill && c.cnt >= CHALLENGE_DISPLAY_MIN)
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, CHALLENGE_DISPLAY_MAX);

  if(challenged.length){
    // Cartes compactes en GRILLE 3 colonnes, fidèles à la maquette
    // (Apercu.dc.html) : nº bleu 900 + badge noir/jaune 🔥 N, titre 700,
    // étape en bas séparée d'une bordure — plus le bouton « Demander »
    // (3 états, projets actifs seulement) et le partage direct.
    el.classList.add('ch-grid');
    // Si la donnée a changé et que la page courante n'existe plus, on recale.
    challengedPage = Math.min(challengedPage, Math.ceil(challenged.length / 3) - 1);
    const pageStart = challengedPage * 3;
    el.innerHTML = challenged.map((c, idx) => {
      const b = c.bill;
      const cnt = c.cnt;
      const title = isEn ? (b.titleEn || b.title) : b.title;
      const numLabel = isEn ? `Bill ${b.num}` : `PL Nº ${b.num}`;
      const flames = '🔥'.repeat(Math.max(1, CHALLENGE_TIERS.filter(t => cnt >= t).length));
      const stepLabels = isEn ? stepsEn : steps;
      const stageIdx = Math.max(0, Math.min(stepLabels.length - 1, displayStep(b.step) - 1));
      const stageLabel = b.status === 'encours' && loiVivante(b) ? stepLabels[stageIdx] : statusLabel(b.status, b.step);
      const petition = cnt >= PETITION_THRESHOLD
        ? `<div class="ch-petition">⚑ ${isEn ? 'Petition threshold reached' : 'Seuil de pétition atteint'}</div>` : '';
      const canFlag = b.status === 'encours' && loiVivante(b);
      const isFlagged = !!myFlaggedBills[b.id];
      const flagBtnId = 'demand-ch-' + b.id;
      let demandBtn = '';
      if(canFlag){
        if(!currentUser){
          demandBtn = `<button class="ch-demand" onclick="event.stopPropagation(); goToAccount()">🔒 ${isEn ? 'Sign in to challenge' : 'Se connecter pour challenger'}</button>`;
        } else if(isFlagged){
          demandBtn = `<button class="ch-demand on" id="${flagBtnId}" title="${isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge'}" onclick="event.stopPropagation(); toggleChallenge(${b.id}, '${flagBtnId}')">✓ ${isEn ? 'Challenged — remove' : 'Challengé — retirer'}</button>`;
        } else {
          demandBtn = `<button class="ch-demand" id="${flagBtnId}" onclick="event.stopPropagation(); toggleChallenge(${b.id}, '${flagBtnId}')">✋ ${isEn ? 'Ask for an explanation' : 'Demander une explication'}</button>`;
        }
      }
      return `<div class="ch-card${(idx < pageStart || idx >= pageStart + 3) ? ' ch-hidden' : ''}" onclick="goToTab('projets')">
        <div class="ch-top">
          <span class="ch-num">${numLabel}</span>
          <span class="ch-badge">${flames} ${fmt(cnt)}</span>
        </div>
        <div class="ch-title">${title}</div>
        ${petition}
        <div class="ch-stage">${stageLabel}</div>
        ${demandBtn}
        <div class="ch-share">
          <span>${isEn ? 'Share:' : 'Partager :'}</span>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'x', event)" aria-label="Partager sur X">𝕏</button>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'fb', event)" aria-label="Partager sur Facebook">FB</button>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'copy', event)" aria-label="Copier">⧉</button>
        </div>
      </div>`;
    }).join('');
    const moreBtn = document.getElementById('chMoreBtn');
    if(moreBtn) moreBtn.style.display = challenged.length > 3 ? '' : 'none';
  } else {
    el.classList.remove('ch-grid');
    const moreBtn = document.getElementById('chMoreBtn');
    if(moreBtn) moreBtn.style.display = 'none';
    el.innerHTML = `<div style="background:var(--card); border:1px dashed var(--line); border-radius:var(--radius); padding:22px 18px; text-align:center; color:var(--slate);">
      <div style="font-size:26px; margin-bottom:8px;">🔎</div>
      <div style="font-size:14px; line-height:1.65; max-width:580px; margin:0 auto;">${isEn
        ? `No one has asked for an explanation yet. The moment someone does, the bill shows up here — ask for an explanation on any active bill to get the ball rolling.`
        : `Personne n'a encore demandé d'explication. Dès qu'une personne le fait, le projet apparaît ici — demandez une explication sur n'importe quel projet actif pour lancer le bal.`}</div>
      <button class="sort-toggle" style="margin-top:14px; cursor:pointer;" onclick="goToTab('projets')">${isEn ? 'Go to bills →' : 'Aller aux projets de loi →'}</button>
    </div>`;
  }
}

// « Voir plus » : REMPLACE les 3 cartes visibles par les 3 suivantes
// (slide-in décalé de 80 ms par carte), et reboucle au début après la
// dernière page.
function showMoreChallenged(){
  const cards = Array.from(document.querySelectorAll('#challengedList .ch-card'));
  if(cards.length <= 3) return;
  const pages = Math.ceil(cards.length / 3);
  challengedPage = (challengedPage + 1) % pages;
  const start = challengedPage * 3;
  cards.forEach((card, i) => {
    const show = i >= start && i < start + 3;
    card.classList.remove('ch-reveal');
    card.classList.toggle('ch-hidden', !show);
    if(show){
      void card.offsetWidth; // force le redémarrage de l'animation
      card.classList.add('ch-reveal');
      card.style.animationDelay = ((i - start) * 0.08) + 's';
    }
  });
}

// (deputeById et voteById sont construits dans chargerDonnees.)


// Proxy de présence : l'Assemblée ne publie pas d'assiduité en tant que telle
// (voir onglet « D'où viennent ces données »). Le meilleur indicateur public est
// le taux de participation aux votes nominaux enregistrés — même méthode que les
// médias (ex. Radio-Canada). Calculé depuis le premier vote où la personne
// apparaît (approximation honnête du début de son mandat actuel, sans donnée
// externe inventée), jusqu'au dernier vote scrapé.
// L'index « qui a participé à quels votes » se reconstruisait ici à chaque chargement de page,
// en parcourant le détail nominatif des 735 votes. Il est maintenant calculé au build et livré
// sous forme de taux déjà faits, dans `presences` (voir scrapers/build-votes-data.js).
// La présidence et les 3 vice-présidences de l'Assemblée ne votent généralement
// pas quand elles président une séance, pour préserver leur neutralité — un vrai
// taux de présence très bas ou nul pour ces 4 personnes ne veut donc pas dire
// « absent·e », contrairement à tout le monde d'autre. Sources : élection de la
// présidence du 29 novembre 2022 (quebec.ca) et fiches assnat.qc.ca de chacun·e.
const presidingRoles = {
  'nathalie roy': { fr: "Présidente de l'Assemblée nationale", en: 'President of the National Assembly' },
  'chantal soucy': { fr: '1ère vice-présidente de l\'Assemblée', en: '1st Vice-President of the Assembly' },
  'sylvain levesque': { fr: '2e vice-président de l\'Assemblée', en: '2nd Vice-President of the Assembly' },
  'frantz benjamin': { fr: '3e vice-président de l\'Assemblée', en: '3rd Vice-President of the Assembly' },
};
function presidingRoleNote(name, isEn){
  const bareName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const role = presidingRoles[norm(bareName)];
  return role ? (isEn ? role.en : role.fr) : null;
}

// La légende de la présence (gabarit.html, #legendePresence), sous la composition de l'Assemblée :
// une échelle 0-100 % avec l'étendue réelle et la médiane, calculées ici à partir de `presences`.
// La présidence et les vice-présidences sont laissées de côté (elles ne votent pas en présidant).
// Pas de couleur de jugement : des faits, pour situer un chiffre, rien de plus.
// Les taux de l'Assemblée, présidence exclue, et leur médiane : calculés une fois, partagés par la
// légende et par la couleur de chaque élu (vert à la médiane ou au-dessus, jaune en dessous —
// Martin, 22 sept. 2026). Le seuil suit donc les données, sans chiffre fixé à la main.
let _tauxPresence = null;
function tauxPresence(){
  if(_tauxPresence) return _tauxPresence;
  const taux = (typeof deputesRaw !== 'undefined' ? deputesRaw : [])
    .filter(d => !presidingRoleNote(d[0], false))
    .map(d => attendanceForAssnatId(d[4])?.rate)
    .filter(r => typeof r === 'number')
    .sort((a, b) => a - b);
  if(!taux.length) return null;   // données pas encore là : on ne garde rien en mémoire
  const medianeDe = (a) => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  const mediane = medianeDe(taux);
  // Le second seuil : la médiane de ceux qui sont sous la médiane de l'Assemblée (Martin : « médiane
  // jaune et plus » en jaune, « médiane jaune et moins » sans couleur).
  const sous = taux.filter(r => r < mediane);
  const medianeJaune = sous.length ? medianeDe(sous) : mediane;
  return (_tauxPresence = { taux, min: taux[0], max: taux[taux.length - 1], mediane, medianeJaune });
}
// Trois groupes, tous calculés à partir des données (Martin, 22 sept. 2026) :
//   vert          à la médiane de l'Assemblée ou au-dessus ;
//   jaune         sous elle, mais à la médiane de ce groupe-là ou au-dessus ;
//   sans couleur  sous la médiane du jaune — une pastille neutre, pas de rouge : un vote manqué
//                 n'en dit pas la raison.
// Sans médiane connue, le chiffre seul.
function groupePresence(rate){
  const t = tauxPresence();
  if(!t || typeof rate !== 'number') return null;
  return rate >= t.mediane ? 'haute' : rate >= t.medianeJaune ? 'moyenne' : 'neutre';
}
function pastillePresence(rate, isEn){
  const texte = isEn ? `${rate}%` : `${rate} %`;
  const groupe = groupePresence(rate);
  if(!groupe) return texte;
  const t = tauxPresence();
  const titre = {
    haute: isEn ? `At or above the Assembly's median (${t.mediane}%)` : `À la médiane de l'Assemblée (${t.mediane} %) ou au-dessus`,
    moyenne: isEn ? `Below the Assembly's median (${t.mediane}%), at or above ${t.medianeJaune}%` : `Sous la médiane de l'Assemblée (${t.mediane} %), à ${t.medianeJaune} % ou plus`,
    neutre: isEn ? `Below ${t.medianeJaune}%` : `Sous ${t.medianeJaune} %`,
  }[groupe];
  return `<span class="presence-pastille presence-${groupe}" title="${titre}">${texte}</span>`;
}

function renderLegendePresence(){
  const boite = document.getElementById('lpEchelle');
  if(!boite) return;
  const isEn = currentLang === 'en';
  const t = tauxPresence();
  if(!t){ boite.innerHTML = ''; return; }
  const { taux, min, max, mediane, medianeJaune } = t;
  const pct = (n) => isEn ? `${n}%` : `${n} %`;
  // Combien d'élu·e·s dans chaque groupe (même règle que les pastilles : groupePresence).
  const nbVert = taux.filter(r => groupePresence(r) === 'haute').length;
  const nbJaune = taux.filter(r => groupePresence(r) === 'moyenne').length;
  const nbNeutre = taux.length - nbVert - nbJaune;
  // L'étiquette de la médiane, au-dessus de la barre, ancrée du côté où il y a de la place
  // (à 86 %, centrée, elle débordait à droite sur téléphone).
  const ancre = mediane > 60 ? 'droite' : mediane < 40 ? 'gauche' : 'centre';
  boite.innerHTML = `
    <div class="lp-repere-ligne" aria-hidden="true"><span class="lp-repere lp-ancre-${ancre}" style="left:${mediane}%">${isEn ? 'median' : 'médiane'} ${pct(mediane)}</span></div>
    <div class="lp-barre" aria-hidden="true" style="--mediane:${mediane}%; --mediane-jaune:${medianeJaune}%">
      <span class="lp-mediane" style="left:${mediane}%"></span>
      <span class="lp-mediane lp-mediane-jaune" style="left:${medianeJaune}%"></span>
    </div>
    <div class="lp-bornes" aria-hidden="true"><span>${pct(0)}</span><span>${pct(100)}</span></div>
    <ul class="lp-groupes">
      <li><span class="presence-pastille presence-haute">${isEn ? 'Green' : 'Vert'} (${nbVert})</span> ${isEn ? `${pct(mediane)} or more — the Assembly's median` : `${pct(mediane)} et plus — la médiane de l'Assemblée`}</li>
      <li><span class="presence-pastille presence-moyenne">${isEn ? 'Yellow' : 'Jaune'} (${nbJaune})</span> ${isEn ? `${pct(medianeJaune)} to ${pct(mediane - 1)} — ${pct(medianeJaune)} is the median of those below ${pct(mediane)}` : `de ${pct(medianeJaune)} à ${pct(mediane - 1)} — ${pct(medianeJaune)} est la médiane des élu·e·s sous ${pct(mediane)}`}</li>
      <li><span class="presence-pastille presence-neutre">${isEn ? 'No colour' : 'Sans couleur'} (${nbNeutre})</span> ${isEn ? `below ${pct(medianeJaune)}` : `moins de ${pct(medianeJaune)}`}</li>
    </ul>
    <p class="lp-legende-chiffres">${isEn
      ? `Across the ${taux.length} members counted: from ${pct(min)} to ${pct(max)}; half are at ${pct(mediane)} or more.**`
      : `Chez les ${taux.length} élu·e·s comptés : de ${pct(min)} à ${pct(max)} ; la moitié est à ${pct(mediane)} ou plus.**`}</p>`;
}

function attendanceForAssnatId(assnatId){
  if(assnatId == null) return null;
  // Les clés de `presences` viennent d'un JSON : ce sont des chaînes, pas des nombres.
  return (typeof presences !== 'undefined' && presences[assnatId]) || null;
}
function resolveDepute(name){
  // Même convention que sponsorParty()/findDeputeEmail() : un nom peut porter un
  // suffixe "(Circonscription)" quand deux élu·e·s partagent le même nom (ex.
  // les deux "Eric Girard" — un vrai homonyme, pas une erreur). Si le nom est
  // ambigu sans ce suffixe et qu'aucune circonscription ne permet de trancher,
  // on refuse de deviner plutôt que de risquer d'attribuer les votes d'une
  // personne à une autre.
  const ridingMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const bareName = ridingMatch ? ridingMatch[1].trim() : name;
  const ridingHint = ridingMatch ? ridingMatch[2].trim() : null;
  const candidates = deputes.filter(d => norm(d.name) === norm(bareName));
  return ridingHint ? candidates.find(d => norm(d.riding) === norm(ridingHint)) : (candidates.length === 1 ? candidates[0] : null);
}
function computeAttendance(name){
  const dep = resolveDepute(name);
  if(!dep) return null;
  return attendanceForAssnatId(dep.assnatId);
}

function partyCounts(pairs){
  const counts = {};
  for(const [, party] of pairs) counts[party] = (counts[party] || 0) + 1;
  return Object.keys(partyColors).filter(p => counts[p]).map(p => [p, counts[p]]);
}
function partyBreakdownHtml(pairs){
  if(!pairs.length) return '';
  return partyCounts(pairs).map(([p, n]) => `<span style="color:${partyColors[p]}">${n} ${p}</span>`).join('');
}

let votesShown = 6; // on montre les 6 plus récents ; « Voir 6 de plus » ajoute 6
function loadMoreVotes(){ votesShown += 6; renderVotes(); }

function renderVotes(keyword){
  if(!document.getElementById('votesList')) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  keyword = keyword !== undefined ? keyword : (document.getElementById('searchVotes')?.value || '');
  const kw = norm(keyword);
  // Votes ET motions, les plus récents d'abord (les gens peuvent chercher un
  // projet de loi précis via la recherche).
  // La recherche est évaluée UNE fois par vote, puis mémorisée dans un Set : les
  // quatre compteurs du filtre rapide et la liste elle-même la consultent, et
  // bills.find() par vote × cinq passes coûterait ~400 000 comparaisons par frappe.
  const correspondants = new Set(votes.filter(v=>{
    if(!kw) return true;
    const bill = v.billId ? bills.find(b=>b.id===v.billId) : null;
    const haystack = norm([v.subject, v.stage, bill?bill.title:'', v.billNum?('projet de loi n° '+v.billNum):''].join(' '));
    return haystack.includes(kw);
  }).map(v=>v.id));
  const correspondRecherche = v => correspondants.has(v.id);
  renderVotesQuickFilters(correspondRecherche);
  const full = votes.filter(v => correspondRecherche(v) && voteAdmisParFiltre(v, votesQuickFilter))
    .sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const list = full.slice(0, votesShown);

  const billLabel = isEn ? 'BILL NO.' : 'PROJET DE LOI N°';
  const pourLabel = isEn ? 'yeas' : 'pour';
  const contreLabel = isEn ? 'nays' : 'contre';
  const abstLabel = isEn ? 'abstentions' : 'abstention';
  const srcNote = isEn ? 'Official source (vote detail page)' : 'Source officielle (page de détail du vote)';
  const sponsorLabel = isEn ? 'Sponsor' : 'Parrain';

  const el = document.getElementById('votesList');
  el.innerHTML = list.length ? list.map(v=>{
    const total = v.totals.pour + v.totals.contre + v.totals.abstentions;
    const bill = v.billId ? bills.find(b=>b.id===v.billId) : null;
    const title = bill ? (isEn ? (bill.titleEn||bill.title) : bill.title) : v.subject;
    const domId = 'nominal-' + v.id;
    const wrapId = `votecard-${v.id}`;
    const whoLabel = isEn ? 'who voted what' : 'qui a voté quoi';
    const numLine = (v.billNum ? `${billLabel} ${v.billNum} — ` : '') + (v.stage ? v.stage + ' — ' : '') + v.date;
    const sponsorParty_ = bill && bill.sponsor ? sponsorParty(bill.sponsor) : null;
    const sponsorBadge = sponsorParty_ ? `<span class="depute-party" style="background:${partyColors[sponsorParty_]}; color:${partyText(sponsorParty_)}">${sponsorParty_}</span>` : '';
    const sponsorLine = bill && bill.sponsor ? `<div class="meta">${sponsorLabel} : ${bill.sponsor} ${sponsorBadge}</div>` : '';
    const isAdopted = v.totals.pour > v.totals.contre;
    const headTitle = (v.stage ? v.stage + ' — ' : '') + (v.billNum ? `${isEn ? 'Bill' : 'PL'} ${v.billNum}, ` : '') + title;
    const metaLine = `${v.date} · ${isEn ? 'Recorded division' : 'Vote nominal'}${v.stage ? ' · ' + v.stage : ''}`;
    const seg = (g) => total ? (v.totals[g]/total*100).toFixed(1) : 0;

    return `
      <div class="vote-card">
        <div class="vc-head" onclick="toggleVoteCard('vc-${v.id}', event)">
          <span class="result-badge ${isAdopted ? 'adopte' : 'rejete'}">${isAdopted ? (isEn ? 'Passed' : 'Adopté') : (isEn ? 'Rejected' : 'Rejeté')}</span>
          <div class="vc-head-main">
            <h3>${headTitle}</h3>
            <div class="vc-meta">${metaLine}</div>
          </div>
          <div class="vc-counts">
            <span class="vcc pour"><b>${v.totals.pour}</b> ${isEn?'yea':'pour'}</span>
            <span class="vcc contre"><b>${v.totals.contre}</b> ${isEn?'nay':'contre'}</span>
            <span class="vcc abst"><b>${v.totals.abstentions}</b> ${isEn?'abst.':'abst.'}</span>
          </div>
          <span class="vc-toggle" id="vctog-vc-${v.id}">+</span>
        </div>
        <div class="bar" onclick="toggleVoteCard('vc-${v.id}', event)">
          <div class="seg pour" style="width:${seg('pour')}%"></div>
          <div class="seg contre" style="width:${seg('contre')}%"></div>
          <div class="seg abst" style="width:${seg('abstentions')}%"></div>
        </div>
        <div class="vc-detail" id="vc-${v.id}" data-vote="${v.id}">
          <div class="vc-pgrid"></div>
          <div class="vc-ncols"></div>
          <div class="vc-foot">
            <span class="vc-foot-note">${isEn ? 'An abstention is not a « no » vote — mission, illness, scheduling.' : 'Une abstention n\'est pas un vote « non » — mission, maladie, horaire.'}</span>
            <a class="bill-more" href="${v.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${isEn ? 'Full record → assnat.qc.ca' : 'Procès-verbal complet → assnat.qc.ca'}</a>
          </div>
        </div>
      </div>
    `;
  }).join('') : `<div class="no-results">${isEn ? 'No vote matches this search.' : 'Aucun vote ne correspond à cette recherche.'}</div>`;
  // Barre jaune « Voir 6 de plus » (maquette) tant qu'il reste des votes.
  if(full.length > votesShown){
    const remaining = full.length - votesShown;
    const step = Math.min(6, remaining);
    el.innerHTML += `<button class="votes-more" onclick="loadMoreVotes()">${isEn
      ? `Show ${step} more — ${list.length} of ${full.length} shown`
      : `Voir ${step} de plus — ${list.length} sur ${full.length} affichés`}</button>`;
  } else if(full.length > 6){
    el.innerHTML += `<div class="votes-more-note">${isEn ? `All ${full.length} shown` : `Les ${full.length} affichés`}</div>`;
  }
  // (idem : le compteur de l accueil vient de stats.json.)
}

// Onglet Votes : ouvre/ferme le détail d'une carte (un seul ouvert à la fois).
// Le détail nominatif d'un vote — qui a voté quoi — ne voyage plus dans la page. Il pèse
// 1 032 ko pour les 735 votes, soit 61 % du poids de la page, alors qu'il ne s'affiche que
// dans la carte qu'on déplie. Il vit donc dans data/votes/<id>.json (~1,4 ko) et arrive au
// moment où on en a besoin. Une fois chargé, il reste en mémoire.
const _nominalCache = new Map();
async function nominalDuVote(voteId){
  if(_nominalCache.has(voteId)) return _nominalCache.get(voteId);
  const p = fetch(`/data/votes/${encodeURIComponent(voteId)}.json`)
    .then(r => r.ok ? r.json() : null)
    // Un réseau qui tombe ne doit pas laisser la carte bloquée sur « chargement » pour
    // toujours : on oublie l'échec pour que la prochaine ouverture réessaie.
    .catch(() => null)
    .then(d => { if(!d) _nominalCache.delete(voteId); return d; });
  _nominalCache.set(voteId, p);
  return p;
}

// Les deux moitiés du détail : les boîtes par parti, puis les trois colonnes de noms.
function contenuNominal(v, nominal, isEn){
  // Boîtes par parti : une par parti RÉELLEMENT présent dans ce vote
  // (Pour/Contre/Abstentions comptés sur le détail nominatif officiel).
  const perParty = {};
  ['pour','contre','abstentions'].forEach(g => (nominal[g]||[]).forEach(([id,party])=>{
    (perParty[party] = perParty[party] || {pour:0, contre:0, abstentions:0})[g]++;
  }));
  const partiesPresent = Object.keys(partyColors).filter(p => perParty[p])
    .concat(Object.keys(perParty).filter(p => !(p in partyColors)));
  const partyBoxes = partiesPresent.map(p => `
    <div class="vc-pbox">
      <div class="vc-phead" style="background:${partyColors[p]||'#999'}; color:${partyText(p)}">${p}</div>
      <div class="vc-pbody">
        <div class="vc-prow"><span style="color:var(--green)">${isEn?'Yea':'Pour'}</span><b>${perParty[p].pour}</b></div>
        <div class="vc-prow"><span style="color:var(--red)">${isEn?'Nay':'Contre'}</span><b>${perParty[p].contre}</b></div>
        <div class="vc-prow"><span style="color:var(--slate)">${isEn?'Abst.':'Abst.'}</span><b>${perParty[p].abstentions}</b></div>
      </div>
    </div>`).join('');

  // 3 colonnes nominatives défilables (nom + pastille de parti)
  const heads = isEn ? ['Yea','Nay','Abstentions'] : ['Pour','Contre','Abstentions'];
  const nominalCols = ['pour','contre','abstentions'].map((g,i)=>{
    const pairs = nominal[g] || [];
    const cls = ['pour','contre','abst'][i];
    const body = pairs.length ? pairs.map(([id,party])=>{
      const dep = deputeById.get(id);
      const name = dep ? dep.name : ('#'+id);
      return `<div class="vc-nrow"><span class="vc-chip" style="background:${partyColors[party]||'#999'}"></span>${name}</div>`;
    }).join('') : `<div class="vc-empty">${isEn ? 'None' : 'Personne'}</div>`;
    return `<div class="vc-ncol">
      <div class="vc-nhead ${cls}">${heads[i]} — ${v.totals[g]}</div>
      <div class="vc-nbody">${body}</div>
    </div>`;
  }).join('');
  return { partyBoxes, nominalCols };
}

// Remplit le détail d'une carte, une seule fois. Rendu synchrone si le nominatif est déjà là,
// pour que le cas courant (rouvrir une carte) n'ait aucune latence.
async function remplirDetailVote(el){
  if(el.dataset.rempli) return;
  const voteId = el.dataset.vote;
  const v = votes.find(x => x.id === voteId);
  if(!v) return;
  const isEn = currentLang === 'en';
  const grille = el.querySelector('.vc-pgrid');
  const colonnes = el.querySelector('.vc-ncols');
  if(!_nominalCache.has(voteId)){
    colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Loading the names…' : 'Chargement des noms…'}</div>`;
  }
  const nominal = await nominalDuVote(voteId);
  if(!nominal){
    colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Could not load the names. Open the official record below.' : 'Les noms n\'ont pas pu être chargés. Le procès-verbal officiel est en dessous.'}</div>`;
    return;
  }
  const { partyBoxes, nominalCols } = contenuNominal(v, nominal, isEn);
  grille.innerHTML = partyBoxes;
  colonnes.innerHTML = nominalCols;
  el.dataset.rempli = '1';
}

function toggleVoteCard(id, evt){
  if(evt) evt.stopPropagation();
  const el = document.getElementById(id);
  if(!el) return;
  const willOpen = !el.classList.contains('open');
  if(willOpen) remplirDetailVote(el);
  document.querySelectorAll('.vc-detail.open').forEach(other=>{
    if(other === el) return;
    other.classList.remove('open');
    const t = document.getElementById('vctog-' + other.id);
    if(t) t.textContent = '+';
  });
  el.classList.toggle('open', willOpen);
  const tog = document.getElementById('vctog-' + id);
  if(tog) tog.textContent = willOpen ? '−' : '+';
}

// (Ici vivait toggleNominalGroup, qui dépliait un camp d'un vote parti par parti. Plus aucun
//  appelant depuis que la carte de vote affiche ses trois colonnes d'un coup — et c'était le
//  dernier endroit à lire v.nominal, qui ne voyage plus dans la page. Retiré le 21 sept. 2026.)

/* ---------------- NAV ---------------- */
/* ---------- Routage par URL (SEO : chaque onglet a sa propre adresse) ----------
   Les pages /ministres, /projets-de-loi, /votes, /lexique existent aussi en
   HTML pré-rendu (scripts/build-section-pages.js) : contenu visible sans JS et
   <title> propre, pour que Google les indexe séparément. Ici, côté client : on
   synchronise l'URL au clic et on ouvre le bon onglet si on arrive directement
   sur une de ces adresses. */
const VIEW_SLUGS = { apercu:'/', ministres:'/ministres', projets:'/projets-de-loi', votes:'/votes', lexique:'/lexique', promesses:'/promesses', bd:'/sources' };
const SLUG_VIEWS = { '':'apercu', 'ministres':'ministres', 'projets-de-loi':'projets', 'votes':'votes', 'lexique':'lexique', 'promesses':'promesses', 'sources':'bd' };
// Titres ANGLAIS seulement : le français vient du <title> de la page (voir syncTitle).
const PAGE_META = {
  bd:        { en:"Site updates — DossierQuébec" },
  apercu:    { en:"Quebec's National Assembly in plain language — DossierQuébec" },
  ministres: { en:"Quebec ministers and MNAs — DossierQuébec" },
  projets:   { en:"Quebec bills explained in plain language — DossierQuébec" },
  votes:     { en:"Recorded divisions at the National Assembly — DossierQuébec" },
  lexique:   { en:"National Assembly glossary in plain language — DossierQuébec" },
  promesses: { en:"2026 Quebec election promises — DossierQuébec" },
};
function viewFromPath(){
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  return SLUG_VIEWS[seg] || 'apercu';
}
const _titreFr = document.title;
function syncTitle(viewName){
  const m = PAGE_META[viewName]; if(!m) return;
  document.title = (typeof currentLang !== 'undefined' && currentLang === 'en') ? m.en : _titreFr;
}

function goToTab(viewName, opts){
  opts = opts || {};
  const target = document.getElementById('view-'+viewName);
  // Chaque vue a maintenant SA page. Si celle qu'on demande n'est pas ici, on y va pour de
  // vrai — avant, tout vivait dans le même document et il suffisait de basculer une classe.
  if(!target){
    const url = VIEW_SLUGS[viewName];
    if(url && !opts.fromHistory) location.href = url;
    return;
  }
  document.querySelectorAll('nav.tabs a[data-view]').forEach(a=>{
    const actif = a.dataset.view === viewName;
    a.classList.toggle('active', actif);
    if(actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  target.classList.add('active');
  closeMobileMenu();
  if(!opts.noScroll) window.scrollTo({top:0, behavior: opts.fromHistory ? 'auto' : 'smooth'});
  // Met l'URL à jour au clic (mais pas quand on répond à un back/forward).
  if(!opts.fromHistory && VIEW_SLUGS[viewName]){
    const url = VIEW_SLUGS[viewName];
    const here = (location.pathname.replace(/\.html$/, '') || '/');
    if(here !== url){ history.pushState({ view: viewName }, '', url); }
  }
  syncTitle(viewName);
}

// Boutons Précédent/Suivant du navigateur.
window.addEventListener('popstate', ()=>{ goToTab(viewFromPath(), { fromHistory: true }); });

// La connexion vit désormais dans l'onglet Lexique (section « Compte & à
// propos »). Les boutons « Se connecter » y sautent et défilent jusqu'au bloc.
function goToAccount(){
  goToTab('lexique');
  setTimeout(()=>{
    const el = document.getElementById('sec-compte') || document.getElementById('accountBox');
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 80);
}

document.querySelectorAll('nav.tabs a[data-view]').forEach(lien=>{
  lien.addEventListener('click', (e)=>{
    if(e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if(!document.getElementById('view-' + lien.dataset.view)) return;   // une autre page : le lien s'en charge
    e.preventDefault();
    goToTab(lien.dataset.view);
  });
});

document.querySelector('.brand-text')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goToTab('apercu'); }
});
// (Le logo-dossier qui flippait vers DossierCanada a été retiré — le listener
// et l'animation sont partis avec. À réintroduire ailleurs si souhaité.)

function openMobileMenu(){
  document.querySelector('nav.tabs')?.classList.add('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded','true');
}
function closeMobileMenu(){
  document.querySelector('nav.tabs')?.classList.remove('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded','false');
}
document.getElementById('hamburgerBtn')?.addEventListener('click', ()=>{
  const isOpen = document.querySelector('nav.tabs')?.classList.contains('open');
  isOpen ? closeMobileMenu() : openMobileMenu();
});
document.getElementById('closeMenuBtn')?.addEventListener('click', closeMobileMenu);

const backToTopBtn = document.getElementById('backToTop');
window.addEventListener('scroll', ()=>{
  backToTopBtn.classList.toggle('visible', window.scrollY > 400);
});

document.getElementById('searchMinistres')?.addEventListener('input', e=> { renderMinistres(e.target.value); renderDeputes(e.target.value); });
document.getElementById('searchBills')?.addEventListener('input', ()=> { billsShown = BILLS_STEP; renderBills(); });
document.getElementById('searchVotes')?.addEventListener('input', ()=> { votesShown = 6; renderVotes(); });

/* ---------------- INIT ---------------- */
function sortRoadmapItems(){
  const container = document.getElementById('view-compte');
  if(!container) return;
  const items = [...container.querySelectorAll(':scope > .roadmap-item')];
  const priority = { now: 0, next: 1, later: 2 };
  const getPriority = (item) => {
    const statusEl = item.querySelector('.roadmap-status');
    for(const cls of statusEl.classList){
      if(cls in priority) return priority[cls];
    }
    return 99;
  };
  items
    .map((item, i) => ({ item, i, p: getPriority(item) }))
    .sort((a,b) => a.p - b.p || a.i - b.i)
    .forEach(({item}) => container.appendChild(item));
}

/* Retire les listes que le build a écrites dans le HTML (div.prerendu[data-prerendu="<jeu>"]),
   une fois les vraies cartes dessinées — sauf celles dont le jeu n'a pas pu être chargé. */
function retirerPrerendus(jeux){
  document.querySelectorAll('[data-prerendu]').forEach(e => {
    const jeu = e.dataset.prerendu;
    if(jeux && !jeux.includes(jeu)) return;
    if(_echecs.has(jeu)){
      // Pas .hidden : #deputesList{display:block} et .grid{display:grid} l'emporteraient.
      const c = e.previousElementSibling;
      if(c) c.style.display = 'none';
      return;
    }
    e.remove();
  });
}

/* ---------------- MISES À JOUR DU SITE (/sources) ----------------
   data/journal.json est tenu À LA MAIN : un changement visible du site y ajoute son entrée,
   dans le même commit que le changement. Les premières entrées couvrent la semaine du 14 au
   21 septembre 2026, rédigées à partir de ses commits ; chacune garde les siens dans `commits`,
   pour qu'on puisse toujours remonter à ce qui a vraiment été fait. Rien n'y entre qui ne soit
   en ligne. */
const JOURNAL_VOLETS = {
  assemblee: ['Assemblée nationale', 'National Assembly'],
  quebec:    ['Ville de Québec', 'Québec City'],
  montreal:  ['Montréal', 'Montréal'],
  levis:     ['Lévis', 'Lévis'],
  longueuil: ['Longueuil', 'Longueuil'],
  laval:     ['Laval', 'Laval'],
  compte:    ['Compte et abonnement', 'Account and subscription'],
  site:      ['Tout le site', 'Whole site'],
};
const JOURNAL_PREMIERES = 20;   // au-delà, un bouton ouvre le reste
let journalTout = false;

function renderJournal(){
  const liste = document.getElementById('journalListe');
  if(!liste) return;   // vue absente de cette page
  const en = currentLang === 'en';
  const loc = en ? 'en-CA' : 'fr-CA';
  const h = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  // AAAA-MM-JJ lu comme une date LOCALE : new Date('2026-09-21') serait minuit UTC, donc le 20
  // au soir au Québec.
  const jour = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j); };
  const fmtMois = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
  const fmtJour = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' });
  const entrees = journal.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.fr)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const visibles = journalTout ? entrees : entrees.slice(0, JOURNAL_PREMIERES);
  let html = '', mois = '';
  for(const e of visibles){
    if(e.date.slice(0, 7) !== mois){
      if(mois) html += '</ol></li>';
      mois = e.date.slice(0, 7);
      const t = fmtMois.format(jour(e.date));
      html += `<li class="maj-mois"><h2>${h(t.charAt(0).toUpperCase() + t.slice(1))}</h2><ol>`;
    }
    const txt = (en && e.en) ? e.en : e.fr;
    const volet = JOURNAL_VOLETS[e.volet] || JOURNAL_VOLETS.site;
    html += `<li class="maj-entree"><time datetime="${h(e.date)}">${h(fmtJour.format(jour(e.date)))}</time>`
      + `<div class="maj-corps"><span class="maj-volet maj-volet-${h(e.volet)}">${h(volet[en ? 1 : 0])}</span>`
      + `<h3>${h(txt.titre)}</h3><p>${h(txt.texte)}</p></div></li>`;
  }
  if(mois) html += '</ol></li>';
  liste.innerHTML = html || `<li class="maj-vide">${en ? 'No updates to show yet.' : 'Aucune mise à jour à afficher pour l’instant.'}</li>`;
  const plus = document.getElementById('journalPlus');
  if(plus){
    const reste = entrees.length - visibles.length;
    plus.hidden = reste <= 0;
    plus.textContent = en
      ? `Show ${reste} older update${reste > 1 ? 's' : ''}`
      : `Voir ${reste > 1 ? `les ${reste} mises à jour plus anciennes` : 'la mise à jour plus ancienne'}`;
  }
}
document.getElementById('journalPlus')?.addEventListener('click', () => { journalTout = true; renderJournal(); });

// Ticker brutaliste : compose la bande défilante avec les VRAIES données
// (comptes réels des datasets + statut des travaux déjà affiché dans
// .calendar-box). Le contenu est dupliqué dans deux spans identiques pour
// que l'animation translateX(-50%) boucle sans couture.
function renderTicker(){
  if(!document.getElementById('tickerA')) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  const parts = [];
  const cal = document.querySelector('.calendar-box .status');
  if(cal) parts.push(cal.textContent.replace(/^●\s*/,'').trim());
  // Les compteurs viennent de stats, que chaque page charge. Compter les jeux eux-mêmes
  // donnait 0 partout depuis le découpage : /votes n'a pas les projets, /sources n'a rien.
  // Sans stats (fichier perdu), on se tait plutôt que d'afficher un faux zéro.
  if(stats){
    parts.push(`${stats.votes} ${isEn ? 'recorded divisions' : 'votes nominatifs enregistrés'}`);
    parts.push(`${stats.projets} ${isEn ? 'bills tracked' : 'projets de loi suivis'}`);
    parts.push(`${stats.ministres} ${isEn ? 'ministers in Cabinet' : 'ministres au Conseil'}`);
  }
  parts.push(isEn ? 'Independent citizen site · real public data' : 'Site citoyen indépendant · vraies données publiques');
  const line = parts.map(p => `● ${p}`).join('   ') + '   ';
  const a = document.getElementById('tickerA'), b = document.getElementById('tickerB');
  if(a && b){ a.textContent = line; b.textContent = line; }
}

// « Ce qui est sur DQ reste sur DQ » (Martin, 21 sept. 2026) : les pages communes (Mes dossiers,
// Abonnement) prennent la marque du DERNIER site visité. Les volets y inscrivent leur ville
// (commun/abonnes.js, memoriserVolet) ; le provincial y inscrit « assemblee » — même clé, lue par
// commun/navigation.js (dernierVolet, vientDuProvincial) et par le <head> de abonnement.html.
try{ localStorage.setItem('dq:dernier-volet', JSON.stringify({ ville: 'assemblee' })); }catch(e){}

(async function init(){
  // D'abord les données : tout ce qui suit en dépend, et elles arrivent maintenant par le
  // réseau plutôt que d'être écrites dans la page.
  await chargerDonnees();
  // L'encadré de l'abonnement : sa phrase « le suivi commencera avec la nouvelle législature »
  // tombe quand un projet de loi suivable existe VRAIMENT dans les données (loiVivante), pas à une
  // date : le 17 nov., dissolved=false ne suffit pas, il faut le premier projet de la 44e.
  for(const d of document.querySelectorAll('.promo-dissolution')) d.hidden = bills.some(loiVivante);
  await loadFollowed();
  await loadIntroState();
  await loadFontZoom();
  await loadTheme();
  await loadFollowedDeputes();
  await initAuth();   // charge aussi les projets de loi suivis (compte requis)
  renderHemicycle();
  renderLegendePresence();
  sortRoadmapItems();
  renderMinistres();
  renderStatusFilters();
  renderStepFilters();
  updateSortToggleLabel();  updateMinistresSortLabel();
  renderAccountBox();
  renderFlagBox();
  renderAdminFlagCounts();
  renderComparateurSelects();
  renderComparateurTable();
  renderBills();
  renderApercuBills();
  renderVotes();
  renderDeputes();
  renderNews();
  // Les listes du HTML s'effacent dès que leurs cartes sont là — AVANT l'appel réseau de
  // renderChallenged, sinon l'accueil montrait les deux versions le temps de sa réponse.
  retirerPrerendus(['apercuBills', 'newsItems', 'bills', 'votes', 'ministers', 'deputesRaw']);
  // Attendu : renderChallenged charge le cache PUIS re-rend la liste des projets.
  // Sans l'attendre, ce re-rendu tardif referme la carte ouverte par le lien
  // profond (?pl=NUM) — d'où le await avant openBillFromQuery plus bas.
  await renderChallenged();
  promPret = true;
  renderPromises();
  await loadSnoozedSections();
  applyLanguage();
  retirerPrerendus();   // le reste (promesses, journal) : ils viennent d'être dessinés
  // Ouvre l'onglet correspondant à l'adresse d'arrivée (/votes, /ministres…).
  const bootView = viewFromPath();
  history.replaceState({ view: bootView }, '', location.pathname + location.search);
  if(bootView !== 'apercu'){ goToTab(bootView, { fromHistory: true, noScroll: true }); }
  else { syncTitle('apercu'); }
  // Lien profond partagé (/projets-de-loi?pl=NUM) : ouvre le projet ciblé.
  openBillFromQuery();
  renderTicker();
})();
