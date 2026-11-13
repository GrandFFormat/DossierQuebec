// Contrats octroyés par la Ville de Lévis (copie de quebec/scrapers/contrats.js), d'après les données ouvertes du SEAO.
//
//   node scrapers/contrats.js            n'ajoute que les fichiers SEAO pas encore lus
//   node scrapers/contrats.js --reset    relit tout depuis le 1er janvier de DEPUIS
//
// Source : jeu « Système électronique d'appel d'offres (SEAO) » sur Données Québec, publié par
// le Secrétariat du Conseil du trésor sous CC BY 4.0, au format OCDS (un JSON mensuel de 70 à
// 95 Mo, et un hebdomadaire pour les semaines pas encore couvertes par un mensuel). Aucune
// requête vers la Ville. Idée et repères tirés de github.com/zachariaellaham/seao (MIT).
//
// Ce qu'on garde : les octrois (awards) dont l'acheteur est exactement « Ville de Québec » et dont
// la date d'octroi tombe depuis DEPUIS. Une même procédure revient dans plusieurs publications
// (avis, mise à jour, octroi) : on fusionne par ocid, la publication la plus récente l'emporte.
// Le montant est celui de l'octroi, pas la dépense finale (les avenants n'y sont pas).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const DEPUIS = '2026-01-01';
// Le SEAO écrit « Ville de Lévis. », avec un point (vérifié le 12 nov. 2026).
const ACHETEUR = 'Ville de Lévis.';
const SORTIE = 'data/contrats.json';
const API = 'https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=systeme-electronique-dappel-doffres-seao';
const UA = { 'User-Agent': 'DossierQuebec/1.0 (+https://dossierquebec.ca/levis/)' };

const reset = process.argv.includes('--reset');
const etat = !reset && existsSync(SORTIE)
  ? JSON.parse(readFileSync(SORTIE, 'utf8'))
  : { fichiers: [], contrats: [] };
// Soumissions reçues, par ocid : [fournisseur, montant, lots]. Les octrois (awards) ne disent pas à
// quel lot ils se rattachent : on retrouve le lot par la soumission du fournisseur retenu, puis on
// compte les soumissionnaires de CE lot. Sans ça, un avis de 21 lots afficherait le nombre de
// soumissionnaires de l'avis entier (vérifié contre le SEAO le 12 nov. 2026).
const offres = etat.offres || {};

// Les fichiers à lire : mensuels depuis DEPUIS, puis les hebdomadaires qui commencent après la fin
// du dernier mensuel. Un hebdo relu plus tard (doublon d'un mensuel) ne fait que réécrire les
// mêmes octrois : la fusion par ocid le rend sans effet.
const paquet = await (await fetch(API, { headers: UA })).json();
const motif = /^(mensuel|hebdo)_(\d{8})_(\d{8})\.json$/;
const tous = paquet.result.resources
  .map((r) => ({ nom: r.name, url: r.url, m: motif.exec(r.name || '') }))
  .filter((r) => r.m && r.m[2] >= DEPUIS.replaceAll('-', ''))
  .map((r) => ({ nom: r.nom, url: r.url, type: r.m[1], debut: r.m[2], fin: r.m[3] }));
// Données Québec publie parfois deux fois le même nom : on garde la dernière entrée vue.
const parNom = new Map(tous.map((r) => [r.nom, r]));
const mensuels = [...parNom.values()].filter((r) => r.type === 'mensuel');
const finMensuels = mensuels.reduce((m, r) => (r.fin > m ? r.fin : m), '');
const hebdos = [...parNom.values()].filter((r) => r.type === 'hebdo' && r.debut > finMensuels);
const aLire = [...mensuels, ...hebdos]
  .filter((r) => !etat.fichiers.includes(r.nom))
  .sort((a, b) => a.debut.localeCompare(b.debut));

// Rien de neuf : on réécrit quand même les deux fichiers (la date d'extraction avance).
if (!aLire.length) console.log(`Contrats : aucun nouveau fichier SEAO (${etat.contrats.length} octrois connus).`);

const parCle = new Map(etat.contrats.map((c) => [c.cle, c]));
const urlSeao = (r) => {
  const m = JSON.stringify(r.tender || {}).match(/https:\/\/seao\.gouv\.qc\.ca\/[^"]+/);
  return m ? m[0] : null;
};

for (const f of aLire) {
  process.stdout.write(`Contrats : lecture de ${f.nom}… `);
  const rep = await fetch(f.url, { headers: UA });
  if (!rep.ok) throw new Error(`${f.nom} : HTTP ${rep.status}`);
  const { releases } = JSON.parse(await rep.text());
  let n = 0;
  for (const r of releases) {
    if (r.buyer?.name !== ACHETEUR) continue;
    // SEAO-2022 : les soumissions sont une liste dans r.bids (l'ancien format les mettait dans r.bids.details).
    const soumissions = Array.isArray(r.bids) ? r.bids : r.bids?.details;
    if (soumissions?.length) offres[r.ocid] = soumissions.map((b) => [b.id, b.value ?? null, b.relatedLots || []]);
    if (!r.awards?.length) continue;
    const t = r.tender || {};
    for (const a of r.awards) {
      const date = (a.date || '').slice(0, 10);
      if (a.status !== 'active' || date < DEPUIS) continue;
      const cle = `${r.ocid}/${a.id}`;
      const avant = parCle.get(cle);
      if (avant && avant.maj > r.date) continue;
      const fo = a.suppliers?.[0] || {};
      const neq = r.parties?.find((p) => p.id === fo.id)?.details?.neq || null;
      parCle.set(cle, {
        cle,
        maj: r.date,
        numero: t.id || avant?.numero || null,
        titre: (t.title || avant?.titre || '').trim(),
        mode: t.procurementMethodDetails || avant?.mode || null,
        gre: t.procurementMethod ? t.procurementMethod === 'direct' : avant?.gre ?? null,
        motif: t.procurementMethodRationale || avant?.motif || null,
        categorie: t.additionalProcurementCategories?.[0] || avant?.categorie || null,
        ocid: r.ocid,
        foId: fo.id || avant?.foId || null,
        nbLots: Math.max(t.lots?.length || 0, avant?.nbLots || 0),
        soumAvis: t.numberOfTenderers ?? avant?.soumAvis ?? null,
        date,
        montant: a.value?.amount ?? null,
        fournisseur: (fo.name || '').trim(),
        neq,
        url: urlSeao(r) || avant?.url || null,
      });
      n++;
    }
  }
  etat.fichiers.push(f.nom);
  console.log(`${n} octroi(s).`);
}

// Soumissions du lot de chaque octroi ; null quand l'avis a plusieurs lots et qu'on ne retrouve pas
// lequel (on n'affiche alors aucune pastille plutôt qu'un chiffre faux).
for (const c of parCle.values()) {
  const o = offres[c.ocid];
  let lot = null;
  if (o && c.foId) {
    const siennes = o.filter((b) => b[0] === c.foId);
    const proche = siennes.filter((b) => b[1] != null && c.montant != null && Math.abs(b[1] - c.montant) < 1);
    const choix = proche.length === 1 ? proche[0] : siennes.length === 1 ? siennes[0] : null;
    if (choix && choix[2].length === 1) lot = choix[2][0];
  }
  if (lot) c.soumissions = new Set(o.filter((b) => b[2].includes(lot)).map((b) => b[0])).size;
  // Un seul soumissionnaire pour tout l'avis : chaque lot en a eu un seul, lots ou pas.
  else if (c.nbLots <= 1 || c.soumAvis === 1) c.soumissions = c.soumAvis;
  else c.soumissions = null;
}
const contrats = [...parCle.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.montant || 0) - (a.montant || 0));
writeFileSync(SORTIE, JSON.stringify({
  source: 'SEAO, Secrétariat du Conseil du trésor, données ouvertes (CC BY 4.0)',
  acheteur: ACHETEUR,
  depuis: DEPUIS,
  extraction: new Date().toISOString(),
  fichiers: etat.fichiers,
  contrats,
  offres,
}));
// Version allégée pour la page (contrats-de-la-ville-de-levis.html) : tableaux plutôt qu'objets,
// motifs et catégories en index, seul l'ItemId de l'adresse SEAO. ~3 fois moins lourd.
// Une même entreprise s'écrit parfois de deux façons (« Groupe Colas Québec inc. » et « GROUPE COLAS
// QUÉBEC INC. ») : la page affiche, pour chaque NEQ, le nom le plus fréquent. Sinon le palmarès la
// coupe en deux (écart trouvé en comparant avec l'outil seao de Z. Ellaham, 12 nov. 2026).
const nomsParNeq = new Map();
for (const c of contrats) {
  if (!c.neq) continue;
  const m = nomsParNeq.get(c.neq) || new Map();
  m.set(c.fournisseur, (m.get(c.fournisseur) || 0) + 1);
  nomsParNeq.set(c.neq, m);
}
const nomAffiche = (c) => (c.neq ? [...nomsParNeq.get(c.neq)].sort((a, b) => b[1] - a[1])[0][0] : c.fournisseur);
// LE PONT AVEC LES DÉCISIONS DU CONSEIL (12 nov. 2026). La Ville écrit le numéro d'avis SEAO dans
// l'objet de ses décisions : « Adjudication d'un contrat… (Appel d'offres public 96068) ». On le
// retrouve des deux côtés, sans IA. Les gré à gré ne citent presque jamais d'avis : ils restent sans lien.
const decisionsParAvis = new Map();
try {
  const brutes = JSON.parse(readFileSync('data/decisions.json', 'utf8'));
  const liste = Array.isArray(brutes) ? brutes : brutes.decisions || [];
  const motif = /(?:appel d.offres|avis|AO|soumission|demande de prix)[^0-9]{0,40}?(\d{5,6})/gi;
  for (const d of liste) {
    if (!d.numero) continue;
    for (const m of (d.objet || '').matchAll(motif)) {
      const a = decisionsParAvis.get(m[1]) || [];
      if (!a.some((x) => x.numero === d.numero)) a.push({ numero: d.numero, date: d.date, instance: d.instanceDecisionnelle || d.instance || null });
      decisionsParAvis.set(m[1], a);
    }
  }
} catch (e) {
  console.warn(`Contrats : décisions illisibles (${e.message}) — pas de lien vers les décisions.`);
}
const decisionsDe = (c) => (c.numero && decisionsParAvis.get(c.numero)) || [];
// Pour la page Décisions : numéro de décision → contrats qu'elle vise. Chargé seulement à l'ouverture
// d'une fiche (assets/app.js, boîte « Contrat au SEAO »).
const parDecision = {};
for (const c of contrats) {
  for (const d of decisionsDe(c)) {
    (parDecision[d.numero] ||= []).push([nomAffiche(c), c.montant, c.gre ? 1 : 0, c.soumissions, (c.url || '').split('ItemId=')[1] || '', c.date]);
  }
}
writeFileSync('data/contrats-decisions.json', JSON.stringify(parDecision));
const relies = contrats.filter((c) => decisionsDe(c).length);
console.log(`Contrats : ${relies.length} reliés à une décision du conseil (${Object.keys(parDecision).length} décisions).`);
const motifs = [...new Set(contrats.map((c) => c.motif || ''))];
const categories = [...new Set(contrats.map((c) => c.categorie || ''))];
const modes = [...new Set(contrats.map((c) => c.mode || ''))];
writeFileSync('data/contrats-page.json', JSON.stringify({
  depuis: DEPUIS,
  extraction: new Date().toISOString(),
  modes, motifs, categories,
  // [date, montant, mode, soumissions, motif, catégorie, fournisseur, titre, ItemId SEAO, n° d'avis si relié à une décision]
  c: contrats.map((c) => [
    c.date, c.montant, modes.indexOf(c.mode || ''), c.soumissions,
    motifs.indexOf(c.motif || ''), categories.indexOf(c.categorie || ''),
    nomAffiche(c), c.titre, (c.url || '').split('ItemId=')[1] || '',
    decisionsDe(c).length ? c.numero : '',
  ]),
}));
console.log(`Contrats : ${contrats.length} octrois écrits dans ${SORTIE} et data/contrats-page.json.`);
