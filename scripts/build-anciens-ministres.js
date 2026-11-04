// LES ANCIENS MINISTRES DE LA 43e — /archives/43/ministres et /archives/43/ministres/<slug> (3 nov. 2026).
//
// Même fiche que scripts/build-minister-pages.js, pour les ministres de la 43e législature : gouvernement
// Legault (deuxième cabinet, 20 oct. 2022 - 15 avril 2026) et gouvernement Fréchette (15 avril - 21 oct.
// 2026 ; Conseil du 21 avril 2026, assermentation de Paul St-Pierre Plamondon le 21 oct.), bâtie sur archives.html (onglet Archives) : fonctions occupées,
// circonscription, parti, projets de loi parrainés pendant la 43e, présence aux votes nominaux de
// la 43e (pastille calculée sur les 125 député·e·s de la 43e), votes marquants, bio et photo
// (data/archives/43/ministres.json, refait par scripts/anciens-ministres-wiki.js).
// commun/dq.js voit la vue « ancien » (viewFromPath) et laisse la page telle quelle.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { slugProjet } from './build-bill-pages.js';
import { slugMinistre } from './build-minister-pages.js';

const SITE = 'https://dossierquebec.ca';
const LEG = 43;
const DOSSIER = `archives/${LEG}/ministres`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const lire = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const deux = (fr, en) => `<span class="fr-txt">${fr}</span><span class="en-txt">${en}</span>`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateFr = (iso) => { const [a, m, j] = iso.split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; };
const dateEn = (iso) => { const [a, m, j] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${j}, ${a}`; };
const FEMMES = /^(Geneviève|Sonia|Pascale|Christine|Suzanne|Andrée|Martine|Maïté|Kateri|Caroline|France-Élaine|Isabelle|Chantal|Amélie|Catherine|Karine|Kariane)\b/;
// Les deux gouvernements de la 43e législature.
const GOUVS = {
  legault: { fr: 'Gouvernement Legault (2022-2026)', en: 'Legault government (2022-2026)', debut: '2022-10-20', fin: '2026-04-15' },
  frechette: { fr: 'Gouvernement Fréchette (avril-octobre 2026)', en: 'Fréchette government (April-October 2026)', debut: '2026-04-21', fin: '2026-10-21' },
};
const dansLegault = (m) => m.fonctions2022.length + m.fonctions2025.length > 0;
const dansFrechette = (m) => (m.fonctionsFrechette ?? []).length > 0;
// « du gouvernement Legault », « du gouvernement Fréchette » ou « des gouvernements Legault et Fréchette ».
const quelGouv = (m) => dansLegault(m) && dansFrechette(m)
  ? ['des gouvernements Legault et Fréchette', 'the Legault and Fréchette governments’']
  : dansFrechette(m) ? ['du gouvernement Fréchette', 'the Fréchette government’s'] : ['du gouvernement Legault', 'the Legault government’s'];

function remplacerTout(modele, { titre, desc, url, ld, section, fichier }) {
  let h = modele;
  const r = (motif, valeur) => {
    if (!motif.test(h)) throw new Error(`build-anciens-ministres : ${motif} introuvable dans archives.html`);
    h = h.replace(motif, () => valeur);
  };
  r(/<title>[^<]*<\/title>/, `<title>${esc(titre)}</title>`);
  r(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  r(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  r(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titre)}">`);
  r(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  r(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  r(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(titre)}">`);
  r(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
  r(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
  r(/<body data-page="archives"/, '<body data-page="ancien"');
  r(/<section class="view active" id="view-archives">[\s\S]*?<\/section>/, section);
  if (titre.length > 65) throw new Error(`build-anciens-ministres : titre trop long (${titre.length}) : ${titre}`);
  if (desc.length < 120 || desc.length > 165) throw new Error(`build-anciens-ministres : description de ${desc.length} caractères (${fichier})`);
  if ((h.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`build-anciens-ministres : ${fichier} n'a pas exactement un <h1>`);
  writeFileSync(fichier, h, 'utf8');
}

export function construirePagesAnciensMinistres() {
  const donnees = lire(`data/archives/${LEG}/ministres.json`, null);
  if (!donnees) { console.log(`– pas de data/archives/${LEG}/ministres.json : aucune fiche d'ancien ministre`); return; }
  const modele = readFileSync('archives.html', 'utf8').replace(/\r\n/g, '\n');
  const bills = lire(`data/archives/${LEG}/bills.json`, []);
  const votes = lire(`data/archives/${LEG}/votes.json`, []).filter((v) => v.date).sort((a, b) => a.date.localeCompare(b.date));
  const actuels = new Map(lire('data/site/ministers.json', []).map((m) => [norm(m.name), m]));
  const deputes = new Map(lire('data/site/deputesRaw.json', []).map((d) => [d[4], d]));

  // Présence aux votes nominaux de la 43e, même calcul que scrapers/build-votes-data.js (depuis le
  // premier vote où la personne apparaît), sauf qu'une personne partie en cours de route (aucun vote
  // dans les 60 derniers jours de la législature) n'est comptée que jusqu'à son dernier vote.
  const nominal = new Map(votes.map((v) => [v.id, lire(`data/archives/${LEG}/votes/${v.id}.json`, { pour: [], contre: [], abstentions: [] })]));
  const apparus = new Map();
  for (const v of votes) for (const k of ['pour', 'contre', 'abstentions']) for (const [id] of nominal.get(v.id)[k] ?? []) {
    if (!apparus.has(id)) apparus.set(id, new Set());
    apparus.get(id).add(v.id);
  }
  const finLeg = votes.at(-1)?.date ?? '9999';
  const limite = new Date(Date.parse(finLeg) - 60 * 864e5).toISOString().slice(0, 10);
  const presences = {};
  for (const [id, set] of apparus) {
    const siens = votes.filter((v) => set.has(v.id));
    const depuis = siens[0].date, jusqua = siens.at(-1).date < limite ? siens.at(-1).date : finLeg;
    const elig = votes.filter((v) => v.date >= depuis && v.date <= jusqua);
    presences[id] = { participated: siens.length, total: elig.length, rate: Math.round((siens.length / elig.length) * 100), depuis, jusqua, parti: jusqua !== finLeg };
  }
  const taux = Object.values(presences).map((p) => p.rate).sort((x, y) => x - y);
  const medianeDe = (t) => { const k = Math.floor(t.length / 2); return t.length % 2 ? t[k] : Math.round((t[k - 1] + t[k]) / 2); };
  const mediane = taux.length ? medianeDe(taux) : 0;
  const sous = taux.filter((r) => r < mediane);
  const medianeJaune = sous.length ? medianeDe(sous) : mediane;
  const classe = (r) => r >= mediane ? 'presence-haute' : r >= medianeJaune ? 'presence-moyenne' : 'presence-neutre';

  // Votes marquants : les adoptions finales de projets de loi qui ont divisé l'Assemblée.
  const marquants = votes.filter((v) => v.divise && v.stage === 'Adoption').reverse();
  const positionDe = (v, id) => ['pour', 'contre', 'abstentions'].find((k) => (nominal.get(v.id)[k] ?? []).some(([x]) => x === id));
  const POS = { pour: ['Pour', 'For'], contre: ['Contre', 'Against'], abstentions: ['Abstention', 'Abstained'] };
  const billParNum = new Map(bills.map((b) => [String(b.num), b]));

  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html')) rmSync(`${DOSSIER}/${f}`);
  mkdirSync(DOSSIER, { recursive: true });
  const adresses = [];
  const cartes = [];
  const filArchive = `<a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><a href="/archives" data-i18n="fil.archives">Archives</a><span class="sep" aria-hidden="true">›</span>`;
  const bande = (fr = 'Ancien ministre', en = 'Former minister', pl = false) => `<p class="archives-note archives-bande">${deux(`<b>${fr} (2022-2026).</b> ${pl ? 'Fiches' : 'Fiche'} de la 43e législature, archivée à sa dissolution.`, `<b>${en} (2022-2026).</b> ${pl ? 'Profiles' : 'Profile'} from the 43rd Legislature, archived at its dissolution.`)}</p>`;

  for (const m of donnees.ministres) {
    // Deux Eric Girard (Groulx et Lac-Saint-Jean) : un nom en double prend sa circonscription.
    const homonyme = donnees.ministres.filter((x) => slugMinistre(x.nom) === slugMinistre(m.nom)).length > 1;
    const slug = slugMinistre(homonyme && m.circonscription ? `${m.nom} ${m.circonscription}` : m.nom);
    const url = `${SITE}/${DOSSIER}/${slug}`;
    const f = FEMMES.test(m.nom);
    m.fonctionsFrechette ??= [];
    const [gouvFr, gouvEn] = quelGouv(m);
    // François Legault : premier ministre du 18 octobre 2018 au 15 avril 2026.
    const premierLegault = /^Fran[cç]ois Legault$/.test(m.nom);
    const premiereMin = m.fonctionsFrechette.some((r) => /^Premi[eè]re? ministre$/i.test(r));
    const principale = (m.fonctionsFrechette[0] || m.fonctions2025[0] || m.fonctions2022[0] || 'Ministre').replace(/^Ministre/, 'ministre').replace(/^Président/, 'président').replace(/^Premier/, 'premier');
    const projets = bills.filter((b) => norm(b.sponsor) === norm(m.nom)).sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));
    const att = m.assnatId ? presences[m.assnatId] : null;
    const actuel = actuels.get(norm(m.nom));
    const depute = m.assnatId ? deputes.get(m.assnatId) : null;
    const mesVotes = m.assnatId ? marquants.map((v) => [v, positionDe(v, m.assnatId)]).filter(([, p]) => p).slice(0, 6) : [];
    const ancien = f ? 'Ancienne ministre' : 'Ancien ministre';

    const bioFr = [], bioEn = [];
    if (m.naissance || m.lieu) {
      const quand = m.naissance ? (m.naissance.length === 10 ? `le ${dateFr(m.naissance)}` : `en ${m.naissance}`) : '';
      const quandEn = m.naissance ? (m.naissance.length === 10 ? `on ${dateEn(m.naissance)}` : `in ${m.naissance}`) : '';
      bioFr.push(`Naissance ${[quand, m.lieu ? `à ${m.lieu}` : ''].filter(Boolean).join(' ')}.`);
      bioEn.push(`Born ${[quandEn, m.lieuEn ? `in ${m.lieuEn}` : ''].filter(Boolean).join(' ')}.`);
    }
    if (m.formation?.length) { bioFr.push(`Études : ${m.formation.join(', ')}.`); bioEn.push(`Education: ${m.formationEn.join(', ')}.`); }
    if (m.metiers?.length) { bioFr.push(`Avant ou à côté de la politique : ${m.metiers.join(', ')}.`); bioEn.push(`Occupation outside politics: ${m.metiersEn.join(', ')}.`); }
    if (m.circonscription) { bioFr.push(`Député${f ? 'e' : ''} de ${m.circonscription} (Coalition avenir Québec) pendant la 43e législature.`); bioEn.push(`MNA for ${m.circonscription} (Coalition Avenir Québec) during the 43rd Legislature.`); }

    const ligne = (lbl, val) => `<div class="m-row"><span class="m-label">${lbl}</span><span class="m-val">${val}</span></div>`;
    const photo = m.photo ? `<figure class="min-photo"><img src="${esc(m.photo.src)}" srcset="${esc(m.photo.src)} 1x, ${esc(m.photo.src2x)} 2x" width="200" height="200" alt="${esc(m.nom)}"><figcaption>${esc(m.photo.auteur)}, ${m.photo.licenceUrl ? `<a href="${esc(m.photo.licenceUrl)}" rel="noopener license">${esc(m.photo.licence)}</a>` : esc(m.photo.licence)} · <a href="${esc(m.photo.fiche)}" rel="noopener">Wikimedia Commons</a></figcaption></figure>` : '';
    const lienActuel = actuel
      ? `<p>${deux(`${esc(m.nom)} siège toujours, dans la 44e législature : <a href="/ministres/${slugMinistre(actuel.name)}">sa fiche actuelle →</a>`, `${esc(m.nom)} still sits in the 44th Legislature: <a href="/ministres/${slugMinistre(actuel.name)}">current profile →</a>`)}</p>`
      : depute ? `<p>${deux(`Réélu${f ? 'e' : ''} le 5 octobre 2026 : ${esc(m.nom)} siège dans la 44e législature (${esc(depute[1])}, ${esc(depute[3])}). <a href="/ministres?elu=${slugMinistre(m.nom)}">Voir sa carte parmi les député·e·s →</a>`, `Re-elected on October 5, 2026: ${esc(m.nom)} sits in the 44th Legislature (${esc(depute[1])}, ${esc(depute[3])}). <a href="/ministres?elu=${slugMinistre(m.nom)}">See the MNAs →</a>`)}</p>` : '';

    const section = `<section class="view active" id="view-ancien" data-titre-en="${esc(`${m.nom}, ${premierLegault || premiereMin ? 'former Premier' : 'former minister'} — DossierQuébec`)}">
    <nav class="fil-ariane" aria-label="Fil d'Ariane">${filArchive}<a href="/${DOSSIER}">${deux('Anciens ministres', 'Former ministers')}</a><span class="sep" aria-hidden="true">›</span><span aria-current="page">${esc(m.nom)}</span></nav>
    ${bande(ancien)}
    <div class="view-hero min-hero">
      <div class="min-colphoto">${photo}</div>
      <div class="min-tete">
        <h1 class="hero-h1 hero-h1-md"><span class="hero-sujet">${premierLegault ? deux('Premier ministre (2018-2026)', 'Premier of Québec (2018-2026)') : premiereMin ? deux('Première ministre (2026)', 'Premier of Québec (2026)') : deux(`${ancien} (2022-2026)`, 'Former minister (2022-2026)')}</span><span>${esc(m.nom)}</span></h1>
        <p class="view-hero-sub">${premierLegault
          ? deux(`${esc(m.nom)} a été premier ministre du Québec du 18 octobre 2018 au 15 avril 2026.`, `${esc(m.nom)} was Premier of Québec from October 18, 2018 to April 15, 2026. Official titles are listed below in French.`)
          : premiereMin
          ? deux(`${esc(m.nom)} a été première ministre du Québec du 15 avril au 21 octobre 2026, après avoir été membre du Conseil des ministres du gouvernement Legault pendant la 43e législature.`, `${esc(m.nom)} was Premier of Québec from April 15 to October 21, 2026, after sitting in the Legault government’s cabinet during the 43rd Legislature. Official titles are listed below in French.`)
          : deux(`${esc(m.nom)} a été membre du Conseil des ministres ${gouvFr} pendant la 43e législature (2022-2026).`, `${esc(m.nom)} sat in ${gouvEn} cabinet during the 43rd Legislature (2022-2026). Official titles are listed below in French.`)}</p>
        ${lienActuel}
      </div>
    </div>
    <div class="band band-white bleed"><div class="min-fiche">
      <h2>${deux('Fonctions occupées', 'Roles held')}</h2>
      ${dansLegault(m) ? `<h3>${deux(GOUVS.legault.fr, GOUVS.legault.en)}</h3>
      ${m.fonctions2022.length ? `<p class="pr-meta">${deux('Conseil du 20 octobre 2022', 'Cabinet of October 20, 2022')}</p><ul class="min-liste">${m.fonctions2022.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${m.fonctions2025.length ? `<p class="pr-meta">${deux('Remaniement du 10 septembre 2025', 'Shuffle of September 10, 2025')}</p><ul class="min-liste">${m.fonctions2025.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}` : ''}
      ${dansFrechette(m) ? `<h3>${deux(GOUVS.frechette.fr, GOUVS.frechette.en)}</h3>
      <p class="pr-meta">${deux('Conseil du 21 avril 2026', 'Cabinet of April 21, 2026')}</p><ul class="min-liste">${m.fonctionsFrechette.map((r) => `<li>${esc(premiereMin && /^Premi/i.test(r) ? `${r} (2026)` : r)}</li>`).join('')}</ul>
      ${m.ajustementFrechette ? `<p>${deux(esc(m.ajustementFrechette.fr), esc(m.ajustementFrechette.en))}</p>` : ''}` : ''}
      <p class="pr-meta">${deux('Fonctions relevées à trois dates : 20 octobre 2022 et 10 septembre 2025 (gouvernement Legault), 21 avril 2026 (gouvernement Fréchette, avec le changement du 9 octobre 2026). Les autres ajustements (démissions, intérims) ne sont pas tous repris ici.', 'Roles recorded at three dates: October 20, 2022 and September 10, 2025 (Legault government), April 21, 2026 (Fréchette government, with the October 9, 2026 change). Other adjustments (resignations, acting roles) are not all listed here.')}</p>
      <div class="min-faits">
        ${ligne(deux('Parti', 'Party'), deux('Coalition avenir Québec (CAQ)', 'Coalition Avenir Québec (CAQ)'))}
        ${m.circonscription ? ligne(deux('Circonscription (43e)', 'Riding (43rd)'), esc(m.circonscription)) : ''}
      </div>

      <h2>${deux('Projets de loi parrainés (43e)', 'Bills sponsored (43rd)')}</h2>
      ${projets.length ? `<ul class="min-liste">${projets.map((b) => { const s = slugProjet(b); return `<li><a href="${s ? `/projets-de-loi/${s}` : `/projets-de-loi?archives=${LEG}`}">${deux(`PL ${esc(b.num)} — ${esc(b.title)}`, `Bill ${esc(b.num)} — ${esc(b.titleEn || b.title)}`)}</a> <span class="pr-meta">· ${deux(esc(b.note ?? ''), esc(b.noteEn ?? b.note ?? ''))}</span></li>`; }).join('')}</ul>`
        : `<p>${deux('Aucun projet de loi parrainé dans les données de la 43e législature.', 'No bill sponsored in the 43rd Legislature’s data.')}</p>`}

      <h2>${deux('Présence aux votes (43e)', 'Vote attendance (43rd)')}</h2>
      ${att ? `<p>${deux(`<b class="presence-pastille ${classe(att.rate)}">${att.rate} %</b> des votes nominaux du ${dateFr(att.depuis)} au ${dateFr(att.jusqua)} : ${att.participated} sur ${att.total}, soit ${att.total - att.participated} votes manqués.`, `<b class="presence-pastille ${classe(att.rate)}">${att.rate}%</b> of recorded divisions from ${dateEn(att.depuis)} to ${dateEn(att.jusqua)}: ${att.participated} of ${att.total}, i.e. ${att.total - att.participated} votes missed.`)}</p><p class="pr-meta">${deux(`Vert : à la médiane des député·e·s de la 43e (${mediane} %) ou au-dessus ; jaune : jusqu'à ${medianeJaune} %.${att.parti ? ' Compté jusqu’à son dernier vote, son départ de l’Assemblée étant antérieur à la fin de la législature.' : ''} Un vote manqué peut être une mission officielle, une maladie ou un conflit d’horaire : le registre n’en donne pas la raison.`, `Green: at or above the 43rd Legislature’s median (${mediane}%); yellow: down to ${medianeJaune}%.${att.parti ? ' Counted up to the last vote, since this member left before the Legislature ended.' : ''} A missed vote can be an official mission, an illness or a scheduling conflict: the register does not give the reason.`)}</p>`
        : `<p>${deux('Aucun vote nominal relevé.', 'No recorded division found.')}</p>`}

      ${mesVotes.length ? `<h2>${deux('Votes marquants', 'Notable votes')}</h2>
      <p class="pr-meta">${deux('Adoptions finales de projets de loi qui ont divisé l’Assemblée, les plus récentes d’abord.', 'Final passage votes on bills that split the Assembly, most recent first.')}</p>
      <ul class="min-liste">${mesVotes.map(([v, p]) => { const b = v.billNum != null ? billParNum.get(String(v.billNum)) : null; const s = b ? slugProjet(b) : null; const sujet = b ? deux(`PL ${esc(b.num)} — ${esc(b.title)}`, `Bill ${esc(b.num)} — ${esc(b.titleEn || b.title)}`) : esc(v.subject); return `<li><b>${deux(POS[p][0], POS[p][1])}</b> · ${s ? `<a href="/projets-de-loi/${s}">${sujet}</a>` : sujet} <span class="pr-meta">· ${deux(dateFr(v.date), dateEn(v.date))}</span></li>`; }).join('')}</ul>
      <p><a href="/votes?archives=${LEG}">${deux('Tous les votes de la 43e →', 'All votes of the 43rd →')}</a></p>` : ''}

      ${bioFr.length ? `<h2>${deux('Biographie', 'Biography')}</h2><p>${deux(esc(bioFr.join(' ')), esc(bioEn.join(' ')))}</p>` : ''}
      ${m.url ? `<p class="min-source">${deux('Source', 'Source')} : <a href="${esc(m.url)}" rel="noopener">Wikipédia</a></p>` : ''}
    </div></div>
  </section>`;

    const qui = premierLegault ? 'ancien premier ministre' : premiereMin ? 'ancienne première ministre' : `${f ? 'ancienne' : 'ancien'} ministre`;
    const titreCourt = `${m.nom}${homonyme && m.circonscription ? ` (${m.circonscription})` : ''}, ${qui}`;
    const titre = `${titreCourt} — DossierQuébec`;
    const suite = ': fonctions, projets de loi et présence aux votes de la 43e législature.';
    let desc = `${m.nom} (CAQ${m.circonscription ? `, ${m.circonscription}` : ''}), ${qui} ${gouvFr} ${suite}`;
    if (desc.length > 165) desc = `${m.nom}, ${qui} ${gouvFr} ${suite}`;
    if (desc.length > 165) desc = `${m.nom}, ${qui} de la Coalition avenir Québec ${suite}`;
    if (desc.length > 165) desc = `${m.nom}, ${qui} de la CAQ ${suite}`;
    if (desc.length < 120) desc += ' Archives de la 43e législature.';
    if (desc.length < 120) desc += ' Sur DossierQuébec.';
    const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Archives', item: `${SITE}/archives` },
        { '@type': 'ListItem', position: 3, name: 'Anciens ministres', item: `${SITE}/${DOSSIER}` },
        { '@type': 'ListItem', position: 4, name: m.nom, item: url },
      ] },
      { '@type': 'Person', name: m.nom, url, memberOf: { '@type': 'PoliticalParty', name: 'Coalition avenir Québec' },
        hasOccupation: [
          ...[...new Set([...m.fonctions2022, ...m.fonctions2025])].map((r) => ({ '@type': 'Role', roleName: `${r} (gouvernement Legault)`, startDate: m.fonctions2022.includes(r) ? GOUVS.legault.debut : '2025-09-10', endDate: GOUVS.legault.fin })),
          ...m.fonctionsFrechette.map((r) => ({ '@type': 'Role', roleName: `${r} (gouvernement Fréchette)`, startDate: /^Premi/i.test(r) ? '2026-04-15' : GOUVS.frechette.debut, endDate: m.nom === 'Mathieu Lacombe' ? '2026-10-09' : GOUVS.frechette.fin })),
          ...(m.nom === 'Martine Biron' ? [{ '@type': 'Role', roleName: 'Ministre de la Culture et des Communications (gouvernement Fréchette)', startDate: '2026-10-09', endDate: GOUVS.frechette.fin }] : []),
        ],
        ...(m.photo ? { image: SITE + m.photo.src } : {}), ...(m.url ? { sameAs: [m.url, ...(m.wikidata ? [`https://www.wikidata.org/wiki/${m.wikidata}`] : [])] } : {}) },
    ] }, null, 1).replace(/</g, '\\u003c');
    remplacerTout(modele, { titre, desc, url, ld, section, fichier: `${DOSSIER}/${slug}.html` });
    adresses.push(url);
    cartes.push({ m, slug });
  }

  // La page index : le Conseil de Christine Fréchette, puis celui de François Legault. Une personne
  // qui a siégé aux deux apparaît dans les deux listes (même fiche).
  const urlIdx = `${SITE}/${DOSSIER}`;
  const nomFamille = (c) => c.m.nom.split(' ').slice(1).join(' ');
  const liste = (garde, fonctionDe) => {
    const siens = cartes.filter((c) => garde(c.m));
    const chef = siens.filter((c) => /^Premi[eè]re? ministre$/i.test(fonctionDe(c.m)));
    const reste = siens.filter((c) => !chef.includes(c)).sort((a, b) => nomFamille(a).localeCompare(nomFamille(b), 'fr'));
    return { n: siens.length, html: `<ul class="min-liste">${[...chef, ...reste].map((c) => `<li><b><a href="/${DOSSIER}/${c.slug}">${esc(c.m.nom)}</a></b> — ${esc(fonctionDe(c.m))}${c.m.circonscription ? ` <span class="pr-meta">(${esc(c.m.circonscription)})</span>` : ''}</li>`).join('')}</ul>` };
  };
  const lFrechette = liste(dansFrechette, (m) => m.fonctionsFrechette[0]);
  const lLegault = liste(dansLegault, (m) => m.fonctions2025[0] || m.fonctions2022[0]);
  const deuxFois = cartes.filter((c) => dansLegault(c.m) && dansFrechette(c.m)).length;
  const section = `<section class="view active" id="view-ancien" data-titre-en="Former CAQ ministers (2022-2026) — DossierQuébec">
    <nav class="fil-ariane" aria-label="Fil d'Ariane">${filArchive}<span aria-current="page">${deux('Anciens ministres', 'Former ministers')}</span></nav>
    ${bande('Anciens ministres', 'Former ministers', true)}
    <div class="view-hero">
      <h1 class="hero-h1 hero-h1-md"><span class="hero-sujet">${deux('Archives de la 43e législature', 'Archives of the 43rd Legislature')}</span><span>${deux('Anciens ministres de la CAQ (2022-2026)', 'Former CAQ ministers (2022-2026)')}</span></h1>
      <p class="view-hero-sub">${deux(`${cartes.length} personnes ont siégé au Conseil des ministres pendant la 43e législature, sous deux gouvernements : celui de François Legault (2022-avril 2026) et celui de Christine Fréchette (avril-octobre 2026). ${deuxFois} ont siégé aux deux. Chaque fiche donne leurs fonctions, leurs projets de loi et leur présence aux votes.`, `${cartes.length} people sat in cabinet during the 43rd Legislature, under two governments: François Legault’s (2022-April 2026) and Christine Fréchette’s (April-October 2026). ${deuxFois} sat in both. Each profile lists their roles, bills and vote attendance.`)}</p>
    </div>
    <div class="band band-white bleed"><div class="min-fiche">
      <h2>${deux('Conseil des ministres de Christine Fréchette (avril-octobre 2026)', 'Christine Fréchette’s cabinet (April-October 2026)')}</h2>
      <p class="pr-meta">${deux(`${lFrechette.n} membres, Conseil du 21 avril 2026. Christine Fréchette est assermentée le 15 avril 2026 ; son gouvernement prend fin à l’assermentation de Paul St-Pierre Plamondon, le 21 octobre 2026. Le 9 octobre 2026, Mathieu Lacombe est expulsé du Conseil et Martine Biron reprend la Culture et les Communications.`, `${lFrechette.n} members, cabinet of April 21, 2026. Christine Fréchette was sworn in on April 15, 2026; her government ended when Paul St-Pierre Plamondon was sworn in on October 21, 2026. On October 9, 2026, Mathieu Lacombe was removed from cabinet and Martine Biron took over Culture and Communications.`)}</p>
      ${lFrechette.html}
      <h2>${deux('Conseil des ministres de François Legault (2022-avril 2026)', 'François Legault’s cabinet (2022-April 2026)')}</h2>
      <p class="pr-meta">${deux(`${lLegault.n} membres, au Conseil du 20 octobre 2022 ou au remaniement du 10 septembre 2025 (fonction la plus récente). François Legault quitte ses fonctions le 15 avril 2026.`, `${lLegault.n} members, in the October 20, 2022 cabinet or the September 10, 2025 shuffle (most recent role). François Legault left office on April 15, 2026.`)}</p>
      ${lLegault.html}
      <p class="min-source">${deux('Source des listes', 'Source of the lists')} : <a href="${esc(donnees.source)}" rel="noopener">Wikipédia (Legault)</a>${donnees.sourceFrechette ? `, <a href="${esc(donnees.sourceFrechette)}" rel="noopener">Wikipédia (Fréchette)</a>` : ''} · ${deux('votes et projets de loi', 'votes and bills')} : <a href="https://www.assnat.qc.ca/" rel="noopener">assnat.qc.ca</a></p>
    </div></div>
  </section>`;
  const ldIdx = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Archives', item: `${SITE}/archives` },
    { '@type': 'ListItem', position: 3, name: 'Anciens ministres', item: urlIdx },
  ] }] }, null, 1).replace(/</g, '\\u003c');
  remplacerTout(modele, {
    titre: 'Anciens ministres de la CAQ (2022-2026) — DossierQuébec',
    desc: `Les ${cartes.length} ministres des gouvernements Legault et Fréchette (2022-2026) : fonctions, projets de loi et présence aux votes de la 43e législature.`,
    url: urlIdx, ld: ldIdx, section, fichier: `archives/${LEG}/ministres.html`,
  });
  adresses.unshift(urlIdx);

  const plan = readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n');
  const entrees = adresses.map((u) => `  <url>\n    <loc>${u}</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.4</priority>\n  </url>`).join('\n');
  const nouveau = plan.replace(/\n<\/urlset>/, `\n${entrees}\n</urlset>`);
  if (nouveau !== plan) writeFileSync('sitemap.xml', nouveau, 'utf8');
  console.log(`✓ ${cartes.length} fiches d'anciens ministres (/${DOSSIER}/prénom-nom) et leur index, au sitemap.`);
}
