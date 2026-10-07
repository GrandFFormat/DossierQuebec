// Scraper — les finances publiques rattachées à un·e député·e ou à sa fonction (Assemblée nationale).
//
// Martin, 6 oct. 2026 : remplacer le comparateur de ministres par un tableau où l'on choisit un·e
// député·e et où tout ce qui lui est rattaché, ou rattaché à sa fonction, apparaît. Trois sources,
// toutes de l'Assemblée nationale, toutes publiques :
//
//   1. « Indemnités et allocations » (page HTML) : l'indemnité annuelle de base, le tableau des
//      indemnités additionnelles par fonction, et les allocations par groupe de circonscriptions.
//   2. La liste des groupes de circonscriptions (PDF, 82 Ko) : quelle circonscription est dans quel
//      groupe (I à V, selon la superficie).
//   3. Les rapports de dépenses (un PDF d'une cinquantaine de Mo par opération de divulgation) : une
//      page par député·e, par cabinet et par service de recherche, avec le montant réel de chaque
//      poste.
//
// RIEN N'EST CALCULÉ NI DEVINÉ ICI. Les montants sont recopiés tels que publiés ; le site n'additionne
// pas des postes de nature différente et ne classe personne. Les libellés du PDF sortent collés
// (« Fraisdelogement àQuébecoudanslacirconscription ») : on les rétablit par une table EXACTE, et un
// libellé inconnu arrête le scraper plutôt que d'être affiché à moitié deviné.
//
// Le gros PDF n'est retéléchargé que si l'Assemblée en publie un nouveau (son identifiant change).
//
// Usage : node scrapers/finances.js            (ne relit le PDF des dépenses que s'il a changé)
//         node scrapers/finances.js --force    (le relit de toute façon)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';

const SITE = 'https://www.assnat.qc.ca';
const URL_INDEMNITES = `${SITE}/fr/abc-assemblee/fonction-depute/indemnites-allocations.html`;
const URL_DEPENSES = `${SITE}/fr/deputes/rapports-des-depenses/deputes-cabinets.html`;
const OUT_PATH = 'data/finances.json';
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';
const force = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const net = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// « 146 589 $ », « 81 201,32 $ » → nombre. null si ce n'est pas un montant.
const montant = (s) => {
  const m = net(s).replace(/ /g, ' ').match(/^(-?[\d ]+(?:,\d{1,2})?)\s*\$?$/);
  return m ? Number(m[1].replace(/ /g, '').replace(',', '.')) : null;
};
const cle = (s) => net(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function page(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return res.text();
}

// ---------------------------------------------------------------- 1. le barème
function lireBareme(html) {
  const $ = cheerio.load(html);
  const texte = net($('body').text());
  const base = texte.match(/reçoit, depuis le ([^,]+), une indemnité annuelle ajustée de ([\d\s ]+) \$/);
  if (!base) throw new Error("indemnité annuelle de base introuvable dans la page : le texte a changé ?");

  const tables = {};
  $('table').each((_, t) => {
    const titre = net($(t).find('caption').text());
    const lignes = [];
    $(t).find('tr').each((__, tr) => {
      const c = $(tr).find('th,td').map((___, x) => net($(x).text())).get();
      if (c.length) lignes.push(c);
    });
    tables[titre] = lignes;
  });
  const table = (debut) => {
    const k = Object.keys(tables).find((x) => x.startsWith(debut));
    if (!k) throw new Error(`tableau « ${debut}… » introuvable dans la page des indemnités`);
    return tables[k].slice(1);   // sans la ligne d'en-têtes
  };

  const fonctions = table('Tableau des indemnités additionnelles').map(([fonction, pct, additionnelle, total]) => ({
    fonction, pourcentage: pct, additionnelle: montant(additionnelle), total: montant(total),
  })).filter((f) => f.additionnelle !== null && f.total !== null);
  if (fonctions.length < 15) throw new Error(`seulement ${fonctions.length} fonctions lues dans le tableau des indemnités`);

  const parGroupe = (debut) => Object.fromEntries(table(debut).map(([g, m]) => [g, montant(m)]).filter(([g, m]) => /^[1-5]$/.test(g) && m !== null));
  const parTitulaire = (debut) => table(debut).map(([titulaire, m]) => ({ titulaire, montant: montant(m) })).filter((x) => x.montant !== null);

  return {
    source: URL_INDEMNITES,
    depuis: net(base[1]),
    base: montant(base[2]),
    fonctions,
    // Les allocations qui varient selon le groupe de la circonscription (1 à 5).
    allocations: [
      { libelle: 'Allocation de déplacement dans la circonscription et ailleurs au Québec', parGroupe: parGroupe('Allocation de déplacement') },
      { libelle: 'Budget pour le fonctionnement du local de circonscription', parGroupe: parGroupe('Budget pour le fonctionnement du local') },
      { libelle: 'Masse salariale pour la rémunération du personnel', parGroupe: parGroupe('Masse salariale pour la rémunération du personnel du député') },
      { libelle: 'Frais de déplacement du personnel', parGroupe: parGroupe('Frais de déplacement du personnel du député') },
    ],
    cabinets: {
      masseSalariale: parTitulaire("Masse salariale pour la rémunération du personnel d’un cabinet"),
      fonctionnement: parTitulaire('Budget pour le fonctionnement du cabinet'),
    },
    lienGroupes: $('a').filter((_, a) => /liste des groupes de circonscriptions/i.test($(a).text())).first().attr('href') ?? null,
  };
}

// ---------------------------------------------------------------- 2. les groupes de circonscriptions
const ROMAIN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
async function lireGroupes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour la liste des groupes`);
  const { text } = await pdfParse(Buffer.from(await res.arrayBuffer()));
  const groupes = {};
  let courant = null;
  for (const brut of text.split('\n')) {
    const l = net(brut);
    const g = l.match(/^GROUPE (I{1,3}|IV|V)$/);
    if (g) { courant = ROMAIN[g[1]]; continue; }
    if (!courant || !l || /^\d+$/.test(l)) continue;
    // Le groupe V tient sur une ligne dans le PDF : « Duplessis Ungava ». Ce sont deux
    // circonscriptions (l'en-tête du document dit « V (2) »), nommées dans la page des indemnités.
    const noms = courant === 5 && l === 'Duplessis Ungava' ? ['Duplessis', 'Ungava'] : [l];
    for (const nom of noms) groupes[nom.replace(/\s*–\s*/g, '–')] = courant;
  }
  const n = Object.keys(groupes).length;
  if (n < 100) throw new Error(`seulement ${n} circonscriptions lues dans la liste des groupes`);
  return groupes;
}

// ---------------------------------------------------------------- 3. les rapports de dépenses
// Les libellés du PDF, tels qu'ils sortent de l'extraction (collés), et leur forme lisible. Table
// EXACTE : un libellé absent d'ici arrête le scraper. `niveau` 0 = un poste principal du rapport ;
// 1 = une composante du budget de fonctionnement ; les lignes à puce « • » du PDF sont de niveau 2
// sous « Bureau », de niveau 1 sinon (cabinets et services de recherche).
const LIBELLES = {
  'Fraisdelogement àQuébecoudanslacirconscription': ['Frais de logement à Québec ou dans la circonscription', 0],
  // Deux libellés des divulgations 2020-2021 et 2021-2022 : l'ancien nom du poste de logement (gardé
  // tel quel : le site ne décide pas que c'est le même poste que « Frais de logement à Québec ou dans
  // la circonscription ») et un poste propre à la pandémie.
  'Allocation delogement àQuébec': ['Allocation de logement à Québec', 0],
  'Mesuresliéesàlapandémie -COVID-19': ['Mesures liées à la pandémie – COVID-19', 1],
  'Voyagecirconscription -hôtelduParlement':['Voyages entre la circonscription et l’hôtel du Parlement', 0],
  'Massesalariale': ['Masse salariale', 0],
  'Fraisdedéplacement dupersonnel': ['Frais de déplacement du personnel', 0],
  'Fraisdedéplacement dupersonnel dutitulairedecabinet': ['Frais de déplacement du personnel du titulaire de cabinet', 0],
  'Fraisdedéplacement dupersonnel dutitulaireduservicederecherche': ['Frais de déplacement du personnel du titulaire du service de recherche', 0],
  'Budgetdefonctionnement dulocaldecirconscription': ['Budget de fonctionnement du local de circonscription', 0],
  'Budgetdefonctionnement ducabinet': ['Budget de fonctionnement du cabinet', 0],
  'Budgetdefonctionnement duservicederecherche': ['Budget de fonctionnement du service de recherche', 0],
  'Bureau': ['Bureau', 1],
  "Fraisd'accueil": ['Frais d’accueil', 1],
  'Publicitéetcommunications aveclepublic': ['Publicité et communications avec le public', 1],
  'Contratsdeservice': ['Contrats de service', 1],
  'Colloques, congrèsetsymposium': ['Colloques, congrès et symposium', 1],
  'Matérielpromotionnel': ['Matériel promotionnel', 1],
  'Formation dudéputé': ['Formation du député', 1],
  "Mesuresfavorisant l'accessibilité dulocaldecirconscription": ['Mesures favorisant l’accessibilité du local de circonscription', 1],
};

function lireRapports(pages) {
  // Un rapport s'ouvre par « Nom, Prénom — Entité BUDGETS ET ALLOCATIONS MONTANT RÉEL », précédé de
  // « Rapport de dépenses AAAA-AAAA » en haut de page. Une même page peut en porter deux à la suite
  // (le rapport du député, puis celui de son cabinet), et un rapport peut déborder sur la page
  // suivante : on découpe donc le texte ENTIER sur ce marqueur, pas page par page. L'en-tête d'un
  // rapport est ce qui suit le dernier montant du rapport précédent.
  const MARQUEUR = ' BUDGETS ET ALLOCATIONS MONTANT RÉEL ';
  const texte = net(pages.join(' '));
  const morceaux = texte.split(MARQUEUR);
  if (morceaux.length < 50) throw new Error(`seulement ${morceaux.length - 1} rapports repérés dans le PDF des dépenses : format changé ?`);
  const periodeDe = (t) => (t.match(/Rapport de dépenses (\d{4}-\d{4})/) || [])[1] ?? null;
  let periode = periodeDe(morceaux[0]);
  const rapports = [];
  for (let i = 0; i < morceaux.length - 1; i++) {
    const coupe = morceaux[i].lastIndexOf('$');
    const tete = net(morceaux[i].slice(coupe + 1));
    periode = periodeDe(tete) ?? periode;
    const m = tete.replace(/^.*?Rapport de dépenses \d{4}-\d{4} /, '').match(/^(.+?) — (.+)$/);
    if (!m) throw new Error(`en-tête de rapport illisible : « ${tete.slice(0, 80)} »`);
    const suite = morceaux[i + 1];
    const fin = i + 1 < morceaux.length - 1 ? suite.lastIndexOf('$') + 1 : suite.length;
    // L'extraction glisse une espace après certains traits d'union (« Vanier- Les Rivières ») ; le
    // « Chicoutimi - Vacant » de l'Assemblée, lui, a une espace des DEUX côtés et reste tel quel.
    rapports.push({ periode, nom: net(m[1]), entite: net(m[2]).replace(/(\S)- (?=\S)/g, '$1-'), corps: suite.slice(0, fin) });
  }
  const inconnus = new Set();
  for (const r of rapports) {
    r.lignes = [];
    let sousBureau = false;
    // « Nombre de voyages • 23 » (ou « 22,5 ») est un compte, pas un montant : on le rattache au poste.
    // Certaines années, le compte est vide (« Nombre de voyages • » sans chiffre).
    // Les plus anciennes écrivent la demie avec un point (« 23.5 »).
    const corps = r.corps.replace(/Nombre de voyages •(?: (\d+(?:[.,]\d+)?)(?= |$))?/g, (_, n) => { if (n) r.voyages = n.replace('.', ','); return ''; });
    for (const m of corps.matchAll(/([^$]+?)\s(-?[\d ]+,\d\d) \$/g)) {
      let libelle = net(m[1]);
      const valeur = montant(m[2]);
      if (valeur === null) throw new Error(`montant illisible « ${m[2]} » (${r.nom})`);
      if (libelle.endsWith('•')) {
        r.lignes.push({ libelle: net(libelle.slice(0, -1)).replace(/'/g, '’'), montant: valeur, niveau: sousBureau ? 2 : 1 });
        continue;
      }
      const connu = LIBELLES[libelle];
      if (!connu) { inconnus.add(libelle); continue; }
      sousBureau = connu[0] === 'Bureau';
      r.lignes.push({ libelle: connu[0], montant: valeur, niveau: connu[1], ...(connu[0].startsWith('Voyages') && r.voyages ? { note: `${r.voyages} voyage(s)` } : {}) });
    }
    if (!r.lignes.length && !inconnus.size) throw new Error(`aucune ligne lue pour ${r.nom} — ${r.entite}`);
    delete r.corps; delete r.voyages;
  }
  // Un libellé absent de LIBELLES arrête la lecture du document : on ne publie pas un poste à
  // moitié deviné. Ils sont tous rapportés d'un coup, pour les vérifier dans le PDF en une fois.
  if (inconnus.size) throw new Error(`${inconnus.size} libellé(s) inconnu(s) dans le PDF des dépenses, à ajouter à LIBELLES après vérification : ${[...inconnus].map((x) => `« ${x} »`).join(' ; ')}`);
  return rapports;
}

// « Fréchette, Christine » → « Christine Fréchette » (l'extraction du PDF glisse parfois une espace
// après un trait d'union : « Cliche- Rivard »).
const nomUsuel = (s) => { const m = net(s).replace(/-\s+/g, '-').match(/^([^,]+),\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : net(s); };

async function lireDepenses(precedent) {
  const html = await page(URL_DEPENSES);
  const $ = cheerio.load(html);
  // La page liste une opération de divulgation par lien ; la plus récente est la dernière publiée,
  // donc celle dont l'identifiant de document est le plus grand.
  const liens = $('a').map((_, a) => $(a).attr('href') || '').get().filter((h) => /DocumentGenerique_\d+/.test(h))
    .map((h) => ({ url: h.replace(/&amp;/g, '&'), id: Number(h.match(/DocumentGenerique_(\d+)/)[1]) })).sort((a, b) => b.id - a.id);
  if (!liens.length) throw new Error('aucun rapport de dépenses lié dans la page de l’Assemblée');
  const recent = liens[0];
  if (!force && precedent?.document === recent.id && precedent.rapports?.length) {
    console.log(`Dépenses : le PDF n'a pas changé (document ${recent.id}), rapports conservés.`);
    return { ...precedent, liens };
  }
  return { ...(await lireDocument(recent)), liens };
}

// Un PDF de divulgation, lu en entier : ses rapports, sa période.
async function lireDocument(lien) {
  console.log(`Dépenses : téléchargement du PDF ${lien.id}…`);
  await sleep(3000);
  const res = await fetch(lien.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour le PDF des dépenses ${lien.id}`);
  const tampon = Buffer.from(await res.arrayBuffer());
  const pages = [];
  await pdfParse(tampon, { pagerender: async (p) => { const t = await p.getTextContent(); const s = t.items.map((i) => i.str).join(' '); pages.push(s); return s; } });
  const rapports = lireRapports(pages);
  const periodes = [...new Set(rapports.map((r) => r.periode))];
  return {
    source: URL_DEPENSES, document: lien.id, pdf: lien.url, mo: Math.round(tampon.length / 1e6), pages: pages.length,
    periode: periodes.length === 1 ? periodes[0] : periodes.join(', '),
    rapports: rapports.map((r) => ({
      nom: nomUsuel(r.nom), entite: r.entite,
      // Un rapport de député·e porte le nom de sa circonscription ; les autres, celui d'un cabinet
      // ou d'un service de recherche.
      // « Chicoutimi - Vacant » : une circonscription sans député·e, dont le rapport porte le nom de la
      // personne qui l'administre. Ce n'est PAS son rapport personnel : type à part.
      type: /^Cabinet\b/i.test(r.entite) ? 'cabinet' : /^Service de recherche\b/i.test(r.entite) ? 'recherche' : /- Vacant$/i.test(r.entite) ? 'vacant' : 'depute',
      lignes: r.lignes,
    })),
  };
}

// ---------------------------------------------------------------- 4. les années précédentes
// L'Assemblée garde en ligne plusieurs opérations de divulgation. Pour montrer comment les dépenses
// d'un·e député·e ou d'un cabinet ont bougé d'une année à l'autre (Martin, 6 oct. 2026), on lit
// chacune UNE fois et on n'en garde que les postes principaux (niveau 0, sans les composantes ni le détail à
// puces) : data/finances-historique.json. Un document déjà lu n'est jamais retéléchargé.
//   rapports : { « nom|entité » : { nom, entite, type, annees : { « 2024-2025 » : { libellé : montant } } } }
const HIST_PATH = 'data/finances-historique.json';
async function historique(liens, courant) {
  const hist = existsSync(HIST_PATH) ? JSON.parse(readFileSync(HIST_PATH, 'utf8')) : { source: URL_DEPENSES, documents: {}, rapports: {} };
  const verser = (doc) => {
    // Deux documents pour une même période (une divulgation refaite) : le plus récent l'emporte.
    const deja = Object.entries(hist.documents).find(([, d]) => d.periode === doc.periode);
    if (deja && Number(deja[0]) > doc.document) return;
    if (deja && Number(deja[0]) !== doc.document) { delete hist.documents[deja[0]]; for (const r of Object.values(hist.rapports)) delete r.annees[doc.periode]; }
    hist.documents[doc.document] = { periode: doc.periode, pages: doc.pages, mo: doc.mo };
    for (const r of doc.rapports) {
      const k = `${cle(r.nom)}|${cle(r.entite)}`;
      hist.rapports[k] ??= { nom: r.nom, entite: r.entite, type: r.type, annees: {} };
      hist.rapports[k].annees[doc.periode] = Object.fromEntries(r.lignes.filter((l) => l.niveau === 0).map((l) => [l.libelle, l.montant]));
    }
  };
  let change = false;
  if (!hist.documents[courant.document] || force) { verser(courant); change = true; }
  for (const lien of liens) {
    // Un document d'une ancienne mise en page, qu'on n'a pas su lire, n'est pas retéléchargé chaque
    // matin (une cinquantaine de Mo) : il est noté dans `illisibles`. `--force` le retente.
    if (lien.id === courant.document || hist.documents[lien.id] || (!force && hist.illisibles?.[lien.id])) continue;
    try { verser(await lireDocument(lien)); change = true; if (hist.illisibles) delete hist.illisibles[lien.id]; }
    catch (e) { console.error(`⚠ historique, document ${lien.id} : ${e.message}`); (hist.illisibles ??= {})[lien.id] = e.message.slice(0, 400); change = true; }
  }
  for (const r of Object.values(hist.rapports)) if (!Object.keys(r.annees).length) delete hist.rapports[`${cle(r.nom)}|${cle(r.entite)}`];
  if (change) {
    writeFileSync(HIST_PATH, JSON.stringify(hist));
    console.log(`Historique : ${Object.values(hist.documents).map((d) => d.periode).sort().join(', ')} — ${Object.keys(hist.rapports).length} rapports suivis → ${HIST_PATH}`);
  }
}

async function main() {
  const avant = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  const bareme = lireBareme(await page(URL_INDEMNITES));
  await sleep(3000);
  let groupes = avant.groupes ?? {};
  if (bareme.lienGroupes) {
    try { groupes = await lireGroupes(new URL(bareme.lienGroupes, SITE).href); }
    catch (e) { console.error(`⚠ groupes de circonscriptions : ${e.message} — liste précédente conservée.`); }
  }
  await sleep(3000);
  const { liens, ...depenses } = await lireDepenses(avant.depenses);
  await historique(liens, depenses);

  const data = { lu: new Date().toISOString().slice(0, 10), bareme, groupes, depenses };
  // Ne réécrire que si quelque chose a changé (hors date de lecture) : le diff quotidien reste vide.
  const sansDate = (d) => JSON.stringify({ ...d, lu: null });
  if (existsSync(OUT_PATH) && sansDate(avant) === sansDate(data)) { console.log('Finances : rien de changé.'); return; }
  mkdirSync('data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data));
  const t = (x) => depenses.rapports.filter((r) => r.type === x).length;
  console.log(`Finances : base ${bareme.base} $ (${bareme.depuis}), ${bareme.fonctions.length} fonctions, ${Object.keys(groupes).length} circonscriptions groupées ; dépenses ${depenses.periode} : ${t('depute')} député·e·s, ${t('cabinet')} cabinets, ${t('recherche')} services de recherche → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Échec du scraper finances.js :', err.message);
  process.exitCode = 1;
});
