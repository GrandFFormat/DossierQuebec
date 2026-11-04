// LES CHEFS DE L'OPPOSITION — /deputes/charles-milliard (3 nov. 2026).
//
// Même fiche que scripts/build-minister-pages.js (dont elle reprend les fonctions), pour les chefs
// et porte-parole des partis d'opposition qui siègent : data/site/chefsOpposition.json (fonctions,
// page de la photo, réseaux relevés sur le site du parti) et data/site/chefsWiki.json (faits de
// Wikidata, refait par node scripts/ministres-wiki.js --chefs). Photo : deputes/photos/<slug>-parti.*,
// tirée du site du parti (Martin, 3 nov. 2026). La page porte la vue « ministre » de commun/dq.js
// (onglet Ministres actif) : la fiche est laissée telle quelle.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { slugProjet } from './build-bill-pages.js';
import { slugMinistre, esc, norm, lire, dateFr, dateEn, ICONES_RESEAUX, nomReseau, citeSource, deux, PARTIS, classeurPresence } from './build-minister-pages.js';

const SITE = 'https://dossierquebec.ca';
const DOSSIER = 'deputes';
const NOMS_PARTIS = { PLQ: 'Parti libéral du Québec', PCQ: 'Parti conservateur du Québec', QS: 'Québec solidaire' };

// Promesses les plus parlantes : une par thème, à tour de rôle, 8 au plus.
function choisirPromesses(liste, max = 8) {
  const parTheme = new Map();
  for (const p of liste) { if (!parTheme.has(p.theme)) parTheme.set(p.theme, []); parTheme.get(p.theme).push(p); }
  const files = [...parTheme.values()], out = [];
  for (let i = 0; out.length < max && files.some((f) => f[i]); i++) for (const f of files) if (f[i] && out.length < max) out.push(f[i]);
  return out;
}
// « pharmacien ou pharmacienne » → la forme qui convient ; doublons et « candidat » retirés.
const metier = (m, femme) => m.replace(/^(\S+) ou (\S+)/, (_, a, b) => (femme ? b : a));

export function construirePagesChefs() {
  const chefs = lire('data/site/chefsOpposition.json', []);
  if (!chefs.length) return;
  const modele = readFileSync('ministres.html', 'utf8').replace(/\r\n/g, '\n');
  const deputes = lire('data/site/deputesRaw.json', []);
  const courriels = lire('data/site/deputeEmails.json', {});
  const presences = lire('data/site/presences.json', {});
  const classePresence = classeurPresence(deputes, presences);
  const historique = lire('data/site/historiqueLeg.json', {});
  const parrains = lire('data/site/billsParrains.json', []);
  const promesses = lire('data/site/promises.json', []).filter((p) => !p.draft);
  const wiki = lire('data/site/chefsWiki.json', {});
  const brut = new Map((lire('data/bills.json', { bills: [] }).bills ?? []).map((b) => [b.id, b]));
  const affiches = new Map(lire('data/site/bills.json', []).map((b) => [b.id, b]));
  const courrielDe = new Map(Object.entries(courriels).map(([k, v]) => [norm(k), v]));
  const auj = new Date().toISOString().slice(0, 10);

  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html')) rmSync(`${DOSSIER}/${f}`);
  mkdirSync(DOSSIER, { recursive: true });

  const adresses = [];
  for (const c of chefs) {
    const slug = slugMinistre(c.name);
    const url = `${SITE}/${DOSSIER}/${slug}`;
    const d = deputes.find((x) => norm(x[0]) === norm(c.name));
    if (!d) { console.log(`– ${c.name} ne siège pas : pas de fiche`); continue; }
    const [, riding, region, , assnatId, mandats] = d;
    const [partiFr, partiEn] = PARTIS[c.party] ?? [c.party, c.party];
    const w = wiki[slug] ?? {};
    const e = c.femme ? 'e' : '';

    const projets = parrains.filter((p) => norm(p.sponsor) === norm(c.name)).map((p) => brut.get(p.id) ?? affiches.get(p.id)).filter(Boolean)
      .sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));
    const att = assnatId ? presences[assnatId] : null;
    const passees = assnatId ? historique.presences?.[assnatId] : null;
    const courriel = courrielDe.get(norm(c.name));
    const proms = choisirPromesses(promesses.filter((p) => p.party === c.party));

    const bioFr = [], bioEn = [];
    if (w.naissance || w.lieu) {
      const quand = w.naissance ? (w.naissance.length === 10 ? `le ${dateFr(w.naissance)}` : `en ${w.naissance}`) : '';
      const quandEn = w.naissance ? (w.naissance.length === 10 ? `on ${dateEn(w.naissance)}` : `in ${w.naissance}`) : '';
      bioFr.push(`Naissance ${[quand, w.lieu ? `à ${w.lieu}` : ''].filter(Boolean).join(' ')}.`);
      bioEn.push(`Born ${[quandEn, w.lieuEn ? `in ${w.lieuEn}` : ''].filter(Boolean).join(' ')}.`);
    }
    const form = [...new Set(w.formation ?? [])], formEn = [...new Set(w.formationEn ?? [])];
    if (form.length) { bioFr.push(`Études : ${form.join(', ')}.`); bioEn.push(`Education: ${formEn.join(', ')}.`); }
    const garde = (w.metiers ?? []).map((m, i) => [m, w.metiersEn?.[i]]).filter(([m]) => !/candidat|conseil d'administration/i.test(m));
    if (garde.length) { bioFr.push(`Avant la politique : ${garde.map(([m]) => metier(m, c.femme)).join(', ')}.`); bioEn.push(`Occupation outside politics: ${garde.map(([, m]) => m).join(', ')}.`); }
    bioFr.push(`Député${e} de ${riding} (${partiFr})${mandats ? `, ${mandats === 1 ? 'premier mandat' : `${mandats}e mandat`}` : ''}.`);
    bioEn.push(`MNA for ${riding} (${partiEn})${mandats ? `, ${mandats === 1 ? 'first term' : `term no. ${mandats}`}` : ''}.`);

    const ligne = (lbl, val) => `<div class="m-row"><span class="m-label">${lbl}</span><span class="m-val">${val}</span></div>`;
    const long = `${c.name}, ${c.bandeau[0].charAt(0).toLowerCase() + c.bandeau[0].slice(1)} — DossierQuébec`;
    const titre = long.length <= 65 ? long : `${c.name}, ${c.party} — DossierQuébec`;
    let desc = `${c.name} (${c.party}, ${riding}) : ${c.roles[0].charAt(0).toLowerCase() + c.roles[0].slice(1)}. Projets de loi, présence aux votes, promesses et biographie.`;
    if (desc.length > 165) desc = `${c.name} (${c.party}, ${riding}). Projets de loi, présence aux votes, promesses de son parti et biographie.`;
    if (desc.length < 120) desc += ' Assemblée nationale du Québec.';
    if (desc.length < 120) desc += ' Fiche à jour.';

    const base = `/${DOSSIER}/photos/${slug}-parti`;
    const photo = existsSync(`${DOSSIER}/photos/${slug}-parti.jpg`)
      ? `<figure class="min-photo"><img src="${base}.webp" srcset="${base}.webp 1x, ${base}@2x.webp 2x" width="200" height="200" alt="${esc(c.name)}"><figcaption>${deux('Photo', 'Photo')} : <a href="${esc(c.photoPage)}" rel="noopener">${esc(NOMS_PARTIS[c.party] ?? partiFr)}</a></figcaption></figure>` : '';
    const reseaux = c.reseaux ?? [];

    const fiche = `<section class="view active" id="view-ministre" data-titre-en="${esc(`${c.name}, ${c.bandeau[1]} — DossierQuébec`.length <= 65 ? `${c.name}, ${c.bandeau[1]} — DossierQuébec` : `${c.name}, ${c.party} — DossierQuébec`)}">
    <nav class="fil-ariane" aria-label="Fil d'Ariane"><a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><a href="/ministres" data-i18n="fil.ministres">Ministres et député·e·s</a><span class="sep" aria-hidden="true">›</span><span aria-current="page">${esc(c.name)}</span></nav>
    <div class="view-hero min-hero">
      <div class="min-colphoto">${photo}${reseaux.length ? `<p class="min-reseaux">${reseaux.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="${nomReseau(u)}" aria-label="${nomReseau(u)}">${ICONES_RESEAUX[nomReseau(u)] || nomReseau(u)}</a>`).join('')}</p>` : ''}</div>
      <div class="min-tete">
        <h1 class="hero-h1 hero-h1-md"><span class="hero-sujet">${deux(esc(c.bandeau[0]), esc(c.bandeau[1]))}</span><span>${esc(c.name)}</span></h1>
        <p class="view-hero-sub">${deux(`${esc(c.name)} est ${esc(c.roles.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join(' et '))}, député${e} de ${esc(riding)} (au ${dateFr(auj)}).`, `${esc(c.name)} is ${esc(c.rolesEn.map((r) => r.replace(/^(\w)/, (x) => x.toLowerCase())).map((r) => 'the ' + r).join(' and '))}, MNA for ${esc(riding)} (as of ${dateEn(auj)}).`)}</p>
        <button class="follow-btn" onclick="toggleFollow('${esc(c.name.replace(/'/g, "\\'"))}')" data-i18n="btn.follow">Suivre</button>
      </div>
    </div>
    <div class="band band-white bleed"><div class="min-fiche">
      <h2>${deux('Fonctions', 'Roles')}</h2>
      <ul class="min-liste">${c.roles.map((r, i) => `<li>${deux(esc(r), esc(c.rolesEn[i] ?? r))}</li>`).join('')}</ul>
      <div class="min-faits">
        ${ligne(deux('Parti', 'Party'), esc(`${partiFr} (${c.party})`))}
        ${ligne(deux('Circonscription', 'Riding'), esc(riding + (region ? ` — ${region}` : '')))}
        ${mandats ? ligne(deux('Mandat', 'Term'), deux(mandats === 1 ? '1er' : `${mandats}e`, mandats === 1 ? '1st' : `no. ${mandats}`)) : ''}
      </div>

      <h2>${deux('Projets de loi parrainés', 'Bills sponsored')}</h2>
      ${projets.length ? `<ul class="min-liste">${projets.map((b) => { const s = slugProjet(b); return `<li><a href="${s ? `/projets-de-loi/${s}` : `/projets-de-loi?pl=${b.num}`}">${deux(`PL ${esc(b.num)} — ${esc(b.title)}`, `Bill ${esc(b.num)} — ${esc(b.titleEn || b.title)}`)}</a> <span class="pr-meta">· ${b.legislature ? deux(`${b.legislature}e législature`, `${b.legislature}th Legislature`) + ' · ' : ''}${deux(esc(b.note ?? ''), esc(b.noteEn ?? b.note ?? ''))}</span></li>`; }).join('')}</ul>`
        : `<p>${deux('Aucun projet de loi parrainé dans les données du site pour l’instant.', 'No bill sponsored in the site’s data so far.')}</p>`}

      <h2>${deux('Présence aux votes', 'Vote attendance')}</h2>
      ${att ? `<p>${deux(`<b class="presence-pastille ${classePresence(att.rate)}">${att.rate} %</b> des votes nominaux depuis le ${dateFr(att.depuis)} : ${att.participated} sur ${att.total}, soit ${att.total - att.participated} votes manqués (43e législature).`, `<b class="presence-pastille ${classePresence(att.rate)}">${att.rate}%</b> of recorded divisions since ${dateEn(att.depuis)}: ${att.participated} of ${att.total}, i.e. ${att.total - att.participated} votes missed (43rd Legislature).`)}</p><p class="pr-meta">${deux('Un vote manqué peut être une mission officielle, une maladie ou un conflit d’horaire : le registre n’en donne pas la raison.', 'A missed vote can be an official mission, an illness or a scheduling conflict: the register does not give the reason.')}</p>`
        : `<p><b class="presence-pastille presence-avenir">${deux('À venir', 'Coming')}</b> ${deux('Aucun vote nominal encore : les premiers votes de la 44e législature suivront la rentrée du 17 novembre 2026.', 'No recorded division yet: the first votes of the 44th Legislature will follow the return on November 17, 2026.')}</p>`}

      <h2>${deux('Historique', 'History')}</h2>
      <p>${mandats ? deux(mandats === 1 ? 'Premier mandat à l’Assemblée nationale.' : `${mandats}e mandat à l’Assemblée nationale.`, mandats === 1 ? 'First term in the National Assembly.' : `Term no. ${mandats} in the National Assembly.`) : ''}${passees ? ` ${deux(`Présence aux votes de la ${historique.courante - 1}e législature : ${esc(passees.rate ?? '')} %.`, `Attendance in the previous Legislature: ${esc(passees.rate ?? '')}%.`)}` : ''}</p>

      ${proms.length ? `<h2>${deux(`Promesses du ${esc(partiFr)} en 2026`, `${esc(partiEn)} 2026 promises`)}</h2>
      <ul class="min-liste">${proms.map((p) => `<li class="min-promesse"><q>${esc(p.quote)}</q><span class="min-prom-source">${citeSource(p)}</span></li>`).join('')}</ul>
      <p><a href="/promesses">${deux('Toutes les promesses 2026 →', 'All 2026 promises →')}</a></p>` : ''}

      ${bioFr.length ? `<h2>${deux('Biographie', 'Biography')}</h2><p>${deux(esc(bioFr.join(' ')), esc(bioEn.join(' ')))}</p>` : ''}

      <h2>${deux('Coordonnées officielles', 'Official contact')}</h2>
      <p>${courriel ? `<a class="m-mail" href="mailto:${esc(courriel)}">✉ ${esc(courriel)}</a>` : `<a href="https://www.assnat.qc.ca/fr/deputes/index.html" rel="noopener">${deux('Coordonnées sur assnat.qc.ca', 'Contact details on assnat.qc.ca')}</a>`}</p>
      ${w.url ? `<p class="min-source">${deux('Source', 'Source')} : <a href="${esc(w.url)}" rel="noopener">Wikipédia</a></p>` : ''}
    </div></div>
  </section>`;

    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Ministres et député·e·s', item: `${SITE}/ministres` },
          { '@type': 'ListItem', position: 3, name: c.name, item: url },
        ] },
        { '@type': 'Person', name: c.name, url, jobTitle: c.roles, memberOf: [{ '@type': 'PoliticalParty', name: partiFr }],
          ...(photo ? { image: `${SITE}${base}.jpg` } : {}),
          sameAs: [...(w.url ? [w.url] : []), ...(w.wikidata ? [`https://www.wikidata.org/wiki/${w.wikidata}`] : []), ...reseaux] },
      ],
    }, null, 1).replace(/</g, '\\u003c');

    let h = modele;
    const remplacer = (motif, valeur) => {
      if (!motif.test(h)) throw new Error(`build-chefs-opposition : ${motif} introuvable dans ministres.html`);
      h = h.replace(motif, () => valeur);
    };
    remplacer(/<title>[^<]*<\/title>/, `<title>${esc(titre)}</title>`);
    remplacer(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
    remplacer(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
    remplacer(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titre)}">`);
    remplacer(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
    remplacer(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
    remplacer(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(titre)}">`);
    remplacer(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
    remplacer(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
    remplacer(/<body data-page="ministres"/, '<body data-page="ministre"');
    remplacer(/<section class="view active" id="view-ministres">[\s\S]*?<\/section>/, fiche);

    if (titre.length > 65) throw new Error(`build-chefs-opposition : titre trop long (${titre.length}) : ${titre}`);
    if (desc.length < 120 || desc.length > 165) throw new Error(`build-chefs-opposition : description de ${desc.length} caractères pour ${c.name}`);
    if ((h.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`build-chefs-opposition : ${c.name} n'a pas exactement un <h1>`);
    writeFileSync(`${DOSSIER}/${slug}.html`, h, 'utf8');
    adresses.push(url);
  }

  const plan = readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n');
  const entrees = adresses.map((u) => `  <url>\n    <loc>${u}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  const nouveau = plan.replace(/\n<\/urlset>/, `\n${entrees}\n</urlset>`);
  if (nouveau !== plan) writeFileSync('sitemap.xml', nouveau, 'utf8');
  console.log(`✓ ${adresses.length} fiches de chefs de l'opposition (/${DOSSIER}/prénom-nom), au sitemap.`);
}
