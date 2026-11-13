// En bref, séance par séance (Martin, 13 nov. 2026 : « un résumé de chaque conseil en en-tête,
// avec un lien vers les décisions, pour ne pas avoir à tout faire défiler »).
//
//   node scripts/resumes-seances.js montreal            les séances des 90 derniers jours
//   node scripts/resumes-seances.js quebec --dry-run    montre ce qui serait demandé, n'appelle rien
//
// Écrit <ville>/data/resumes-seances.json, que lit commun/seances-en-bref.js.
//
// Deux parties :
//   - les POINTS MARQUANTS sont choisis sans IA : les décisions résumées, classées par montant,
//     vote divisé et règlement adopté. Gratuit, et toujours vrai.
//   - la PHRASE est écrite par l'IA (Haiku), un appel par séance, en français et en anglais d'un
//     coup. Une séance déjà résumée n'est pas redemandée tant que ses décisions n'ont pas changé.
//     Garde-fou : tout nombre de la phrase doit figurer dans ce qu'on a envoyé, sinon pas de phrase.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const VILLE = process.argv[2];
const ARGS = new Set(process.argv.slice(3));
const DRY = ARGS.has('--dry-run');
const VILLES = {
  montreal: { page: 'decisions-de-la-ville-de-montreal', estResolution: (d) => d.type === 'Résolution', cle: (d) => d.seanceId ?? `${d.date}__${d.instance}` },
  quebec: { page: 'decisions-de-la-ville-de-quebec', estResolution: (d) => d.type === 'Résolutions', cle: (d) => `${d.date}__${d.instance}` },
};
if (!VILLES[VILLE]) { console.error('Usage : node scripts/resumes-seances.js montreal|quebec [--dry-run]'); process.exit(1); }
const CFG = VILLES[VILLE];
const DOSSIER = new URL(`../${VILLE}/data/`, import.meta.url);
const OUT = new URL('resumes-seances.json', DOSSIER);
const MODELE = 'claude-haiku-4-5';
const TARIF = { entree: 1, sortie: 5 };   // $ US par million de jetons
const JOURS = 90;   // Montréal publie ses procès-verbaux avec un mois de retard ou plus
const MAX_POINTS = 4;
// Mots de jugement ou de total vague : la phrase est rejetée, pas corrigée.
const JUGEMENT = /\b(majeur|majeure|majeurs|majeures|important|importante|importants|importantes|ambitieu|coûteu|controvers|totalisant|au total|environ|plusieurs millions|historique|major|significant|totaling|totalling|approximately)/i;

const lire = async (nom) => (existsSync(new URL(nom, DOSSIER)) ? JSON.parse(await readFile(new URL(nom, DOSSIER), 'utf8')) : null);

function instanceEn(i) {
  if (!i) return i;
  const fixe = { 'Conseil municipal': 'City council', 'Conseil de la ville': 'City council', "Conseil d'agglomération": 'Agglomeration council', "Conseil d'agglomération de Québec": 'Québec agglomeration council', 'Comité exécutif': 'Executive committee' };
  if (fixe[i]) return fixe[i];
  const m = i.match(/^Conseil d(?:e l'|')Arrondissement (?:de la |de l'|de |du |des )(.+)$/i);
  if (m) return `${/^Rivières$/.test(m[1]) ? 'Les Rivières' : m[1]} borough council`;
  return i;
}

// « 1 234 567,89 $ » → 1234567.89 ; null si rien de lisible.
function montant(texte) {
  if (!texte) return 0;
  const m = String(texte).replace(/[  ]/g, ' ').match(/(\d{1,3}(?: \d{3})+|\d+)(?:,(\d+))?\s*(M\$|millions?)?/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/ /g, '') + (m[2] ? '.' + m[2] : ''));
  return m[3] ? n * 1e6 : n;
}

const CONSIGNE = `Tu écris le résumé d'une séance d'un conseil municipal pour un site d'information citoyenne.
On te donne la liste des décisions prises à cette séance (objet, montant s'il y en a, résultat du vote,
et parfois la première ligne d'un résumé).

Écris UNE ou DEUX phrases, 45 mots au plus, qui disent ce que le conseil a fait de plus concret à cette
séance : les sujets principaux, les plus gros montants, ce qui touche directement les gens.
Commence par « Le conseil » (ou « Le comité exécutif » pour un comité exécutif).

Interdits absolus (une phrase qui les enfreint est jetée) :
1. N'invente rien. Tout nombre que tu écris doit être recopié tel quel de la liste, au caractère près :
   « 1 512 300,00 $ » reste « 1 512 300,00 $ », jamais « 1,51 M$ ». N'additionne jamais, ne fais
   aucun total, n'arrondis pas, ne dis pas « environ ». Deux montants au plus. Dans le doute, nomme
   le sujet sans montant.
2. Aucun jugement : ni « majeur », ni « important », ni « ambitieux », ni « coûteux », ni « historique ». Ni « totalisant », ni « environ », ni « plusieurs millions ».
3. Pas de vocabulaire de procédure (ordre du jour, procès-verbal, levée de séance).

Exemple du ton voulu (Martin, 13 nov. 2026) : « Le conseil a approuvé la réfection de la croix du
Mont-Royal pour 3 769 140,63 $, la déconstruction de l'ancien hôpital chinois pour 3 171 084,23 $ et
l'installation de fibre optique sur 38 km de conduites d'aqueduc pour 24 338 482,88 $. »
Des choses concrètes que les gens reconnaissent, chacune avec son montant exact.

Écris aussi la même phrase en anglais (phraseEn), fidèlement, avec les mêmes nombres.`;

const OUTIL = {
  name: 'resume_seance',
  description: "Enregistre la phrase qui résume la séance.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: { phrase: { type: 'string' }, phraseEn: { type: 'string' } },
    required: ['phrase', 'phraseEn'],
    additionalProperties: false,
  },
};

const CONSIGNE_ODJ = `Tu écris le résumé de l'ORDRE DU JOUR d'une séance d'un conseil municipal, pour un site
d'information citoyenne. Le procès-verbal n'est pas encore publié : on ne sait PAS ce qui a été décidé,
seulement ce qui était prévu.

Écris UNE phrase de 40 mots au plus (elle est jetée au-delà de 50) qui commence par « À l'ordre du jour : »
puis nomme TROIS sujets au plus, les plus concrets (contrats, travaux, règlements, subventions), chacun avec son montant exact
s'il est écrit dans la liste. N'écris jamais « a approuvé », « a adopté » ni « a décidé » : rien n'est
encore officiel.

Interdits absolus (une phrase qui les enfreint est jetée) :
1. Tout nombre doit être recopié tel quel de la liste, au caractère près. N'additionne jamais, pas de
   total, pas d'arrondi, pas de « M$ » si la liste ne l'écrit pas. Deux montants au plus.
2. Aucun jugement : ni « majeur », ni « important », ni « ambitieux », ni « historique ». Ni
   « totalisant », ni « environ », ni « plusieurs millions ».
3. Pas de vocabulaire de procédure (dépôt, période de questions, procès-verbal).

Donne aussi la phrase en anglais (phraseEn, qui commence par « On the agenda: »), et la traduction
anglaise fidèle de chacun des titres fournis à la fin (titresEn, même ordre, mêmes nombres).

Exemple du ton voulu : « À l'ordre du jour : la réfection de la croix du Mont-Royal pour
3 769 140,63 $, la déconstruction de l'ancien hôpital chinois et un contrat de sel de déglaçage. »`;

const OUTIL_ODJ = {
  name: 'resume_ordre_du_jour',
  description: "Enregistre la phrase qui résume l'ordre du jour.",
  strict: true,
  input_schema: {
    type: 'object',
    properties: { phrase: { type: 'string' }, phraseEn: { type: 'string' }, titresEn: { type: 'array', items: { type: 'string' } } },
    required: ['phrase', 'phraseEn', 'titresEn'],
    additionalProperties: false,
  },
};

// Les nombres d'une phrase, sans espaces ni séparateurs : « 48,5 M$ » → « 485 ».
const nombres = (t) => (String(t).replace(/[   ]/g, '').match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, ''));

async function main() {
  const decisions = await lire('decisions.json');
  const resumes = await lire('resumes.json');
  const en = await lire('resumes-en.json');
  const ancien = (await lire('resumes-seances.json')) ?? { seances: [] };
  const anciens = new Map(ancien.seances.map((s) => [s.id, s]));
  const parId = new Map((resumes?.resumes ?? []).map((r) => [r.id, r]));
  const resumePour = (d) => (d.theme === 'procedure' ? null : parId.get(d.id) ?? (d.sommaireId ? parId.get(d.sommaireId) : null) ?? null);
  const objetsEn = en?.objets ?? {};
  const traductionsEn = en?.traductions ?? {};

  const limite = new Date(Date.now() - JOURS * 864e5).toISOString().slice(0, 10);
  const groupes = new Map();
  for (const d of decisions.decisions) {
    if (!CFG.estResolution(d) || !d.instance || !d.date || d.date < limite) continue;
    const cle = CFG.cle(d);
    if (!groupes.has(cle)) groupes.set(cle, { id: cle, instance: d.instance, date: d.date, lignes: [] });
    groupes.get(cle).lignes.push(d);
  }

  // Sur GitHub, seules les dépendances du volet sont installées (npm ci dans montreal/ ou quebec/) :
  // on charge le SDK depuis le dossier de la ville, pas depuis la racine.
  const { default: Anthropic } = await import(pathToFileURL(createRequire(new URL(`../${VILLE}/package.json`, import.meta.url)).resolve('@anthropic-ai/sdk')).href);
  const client = DRY ? null : new Anthropic();
  const sortie = [];
  let appels = 0, entree = 0, sortieJetons = 0, rejets = 0;

  for (const g of [...groupes.values()].sort((a, b) => b.date.localeCompare(a.date) || a.instance.localeCompare(b.instance))) {
    const utiles = g.lignes.filter((d) => d.theme !== 'procedure');
    const avecResume = utiles.map((d) => ({ d, r: resumePour(d) }));
    // Points marquants : sans IA. Les décisions résumées d'abord, puis montant, vote divisé, règlement.
    const score = ({ d, r }) =>
      (r ? 1000 : 0) +
      Math.log10(1 + montant(r?.montantPrincipal)) * 50 +
      (/majorité|division|rejet/i.test(d.resultat ?? '') || d.voteEnregistre ? 200 : 0) +
      (/r[èe]glement/i.test(d.objet ?? '') && !/avis de motion|projet de r[èe]glement/i.test(d.objet ?? '') ? 120 : 0);
    const points = [...avecResume].sort((a, b) => score(b) - score(a)).slice(0, MAX_POINTS).map(({ d, r }) => ({
      id: d.id,
      numero: d.numero ?? d.id,
      titre: d.objet,
      titreEn: objetsEn[d.id]?.en ?? null,
      montant: r?.montantPrincipal ?? null,
      montantEn: traductionsEn[r?.id]?.montantPrincipal ?? null,
      divise: /majorité|division|rejet/i.test(d.resultat ?? '') || Boolean(d.voteEnregistre),
    }));

    const signature = `${g.lignes.length}:${avecResume.filter((x) => x.r).length}`;
    // Le procès-verbal officiel de la séance : la version qui fait foi, liée sur la carte.
    const pv = decisions.decisions.find((d) => /^Procès-verba/.test(d.type) && d.pdf && (d.seanceId ? d.seanceId === g.id : d.date === g.date && d.instance === g.instance));
    const base = { id: g.id, instance: g.instance, instanceEn: instanceEn(g.instance), date: g.date, nDecisions: g.lignes.length, pv: pv?.pdf ?? null, points };
    const vieux = anciens.get(g.id);
    // Trois phrases rejetées pour les mêmes décisions : on n'insiste plus (la carte garde ses points).
    const vieuxBon = vieux?.phrase && !JUGEMENT.test(vieux.phrase) && !JUGEMENT.test(vieux.phraseEn ?? '');
    if (vieux?.signature === signature && (vieuxBon || (vieux.rejets ?? 0) >= 3)) { sortie.push({ ...vieux, ...base }); continue; }
    if (utiles.length < 2) { sortie.push({ ...base, signature, phrase: null, phraseEn: null }); continue; }

    const liste = avecResume.slice(0, 70).map(({ d, r }) => {
      const morceaux = [`- ${d.objet}`];
      if (r?.montantPrincipal) morceaux.push(`[montant : ${r.montantPrincipal}]`);
      if (d.resultat) morceaux.push(`[${d.resultat}]`);
      if (r?.puces?.[0]) morceaux.push(`— ${r.puces[0]}`);
      return morceaux.join(' ');
    }).join('\n');
    const message = `${g.instance}, séance du ${g.date} — ${g.lignes.length} décisions, dont ${utiles.length} hors procédure.\n\n${liste}`;
    if (DRY) { console.log(`\n=== ${g.id}\n${message.slice(0, 600)}…`); sortie.push({ ...base, signature, phrase: null, phraseEn: null }); continue; }

    try {
      const rep = await client.messages.create({
        model: MODELE, max_tokens: 600, system: CONSIGNE, tools: [OUTIL], tool_choice: { type: 'tool', name: OUTIL.name },
        messages: [{ role: 'user', content: message }],
      });
      appels++; entree += rep.usage.input_tokens; sortieJetons += rep.usage.output_tokens;
      const { phrase, phraseEn } = rep.content.find((c) => c.type === 'tool_use')?.input ?? {};
      // « 5 414 590 $ » dans la phrase, « 5 414 590,00 $ » dans la source : même nombre. On tolère
      // donc un nombre de 4 chiffres ou plus qui commence un nombre de la source ; les petits
      // nombres doivent être identiques.
      const permis = nombres(message);
      const fautifs = [...nombres(phrase), ...nombres(phraseEn)].filter((n) => !permis.some((p) => p === n || (n.length >= 4 && p.startsWith(n))));
      if (JUGEMENT.test(phrase ?? '') || JUGEMENT.test(phraseEn ?? '')) fautifs.push(`mot de jugement « ${(phrase.match(JUGEMENT) ?? phraseEn.match(JUGEMENT))[0]} »`);
      if (!phrase || fautifs.length) {
        rejets++;
        console.log(`  ${g.id} : phrase rejetée (nombres absents de la source : ${fautifs.join(', ')}) — ${phrase}`);
        sortie.push({ ...base, signature, rejets: (vieux?.signature === signature ? vieux.rejets ?? 0 : 0) + 1, phrase: null, phraseEn: null });
      } else {
        sortie.push({ ...base, signature, phrase, phraseEn, genereLe: new Date().toISOString() });
      }
    } catch (e) {
      console.log(`  ${g.id} : échec (${e.message})`);
      sortie.push({ ...base, signature: null, phrase: vieux?.phrase ?? null, phraseEn: vieux?.phraseEn ?? null });
    }
  }

  // ---------- L'ORDRE DU JOUR des séances tenues mais pas encore au procès-verbal (Montréal) ----------
  // Martin, 13 nov. 2026 : la séance récente en avant-plan, la version du procès-verbal derrière
  // « Pourquoi un mois de retard ? ». L'ordre du jour dit ce qui était PRÉVU, pas ce qui a été
  // décidé : la phrase le dit, la carte aussi. Une séance déjà résumée n'est pas relue.
  const odjSortie = [];
  if (VILLE === 'montreal') {
    const { documentDeSeance } = await import('../montreal/scrapers/decisions.js');
    const { parserOrdreDuJour } = await import('../montreal/lib/pv.js');
    const anciensOdj = new Map((ancien.ordresDuJour ?? []).map((o) => [o.id, o]));
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const attente = (decisions.seances ?? [])
      .filter((s) => s.etat === 'procès-verbal non publié' && s.date <= aujourdhui)
      .sort((a, b) => b.date.localeCompare(a.date));
    const faites = new Set();
    for (const s of attente) {
      if (faites.has(s.nom)) continue;
      const vieux = anciensOdj.get(s.id);
      const mots = (t) => String(t ?? '').split(/ +/).length;
      if (vieux?.version === 5 && ((vieux.phrase && mots(vieux.phrase) <= 50) || (vieux.rejets ?? 0) >= 3)) { odjSortie.push(vieux); faites.add(s.nom); continue; }
      let doc;
      try { doc = await documentDeSeance(s, 'ODJ'); } catch (e) { console.log(`  ${s.id} : ordre du jour illisible (${e.message})`); continue; }
      if (!doc?.url) continue;   // pas d'ordre du jour public (le comité exécutif, souvent) : on essaie la séance d'avant
      const tous = parserOrdreDuJour(doc.pages);
      const PROCEDURE = /^(Dépôt|Période de questions|Adoption de l'ordre du jour|Approbation du procès-verbal|Ouverture|Levée|Questions|Correspondance)|procès-verbal/i;
      const utiles = tous.filter((p) => p.objet && !PROCEDURE.test(p.objet) && !/Dépôt|Questions|Proclamation/i.test(p.categorie ?? ''));
      if (utiles.length < 2) { faites.add(s.nom); continue; }
      const montantDe = (o) => (o.match(/\d{1,3}(?:[  ]\d{3})+(?:,\d{2})?\s*\$/) ?? [null])[0];
      // Un ordre du jour « LPP » mêle les sommaires au fil des points : certains objets ramassent du
      // bruit (« ____ A 28 h 5A, 3 est proposé par… », « Trésorerie - 1263611002 … »). On nettoie le
      // préfixe d'unité, puis on écarte des POINTS affichés tout objet qui garde une trace de bruit.
      const net = (o) => o.replace(/^[^-–]{2,80}\s[-–]\s\d{10}\s+/, '').replace(/^\s*(?:C[AEGM]\d{2}\s\d{2,4}(?:\s\d{4})?)\s+/, '').trim();
      const BRUIT = /_{2,}|est proposé par|appuyé par|^Séance|\b\d{1,2} h \d|^Avis de motion|^\W/i;
      const propres = utiles.map((p) => ({ ...p, objet: net(p.objet) })).filter((p) => p.objet.length >= 25 && p.objet.length <= 400 && !BRUIT.test(p.objet) && /^(Accorder|Approuver|Adopter|Adoption|Autoriser|Autorisation|Attribuer|Attribution|Octroyer|Octroi|Exercer|Entériner|Ordonnance|Location|Accepter|Modifier|Édicter|Édiction|Résilier|Renouveler|Conclure|Ratifier|Acquérir|Acquisition|Vendre|Vente|Céder|Prolonger|Augmenter|Majorer|Affecter|Allouer|Verser|Contribution|Subvention)\b/.test(p.objet) && !/^Approbation des procès|ordre du jour/i.test(p.objet) && !/^L'objet du règlement|tel que proposé.?$/.test(p.objet));
      const points = [...propres]
        .sort((a, b) => montant(montantDe(b.objet)) - montant(montantDe(a.objet)) || (/r[èe]glement/i.test(b.objet) ? 1 : 0) - (/r[èe]glement/i.test(a.objet) ? 1 : 0))
        .slice(0, MAX_POINTS)
        .map((p) => ({ article: p.article, titre: p.objet, montant: montantDe(p.objet)?.replace(/\s+\$$/, ' $') ?? null, lien: p.page ? `${doc.url}#page=${p.page}` : doc.url }));
      const base = { id: s.id, version: 5, instance: s.nom, instanceEn: instanceEn(s.nom), date: s.date, odj: doc.url, nPoints: tous.length, points };
      const message = `${s.nom}, ordre du jour de la séance du ${s.date} — ${tous.length} points, dont ${utiles.length} hors procédure.\n\n${utiles.slice(0, 120).map((p) => `- ${p.objet}`).join('\n')}`;
      if (DRY) { console.log(`\n=== ODJ ${s.id}\n${message.slice(0, 500)}…`); faites.add(s.nom); continue; }
      try {
        const rep = await client.messages.create({
          model: MODELE, max_tokens: 900, system: CONSIGNE_ODJ, tools: [OUTIL_ODJ], tool_choice: { type: 'tool', name: OUTIL_ODJ.name },
          messages: [{ role: 'user', content: `${message}\n\nTitres à traduire (titresEn, même ordre) :\n${points.map((p) => `- ${p.titre}`).join('\n')}` }],
        });
        appels++; entree += rep.usage.input_tokens; sortieJetons += rep.usage.output_tokens;
        const { phrase, phraseEn, titresEn } = rep.content.find((c) => c.type === 'tool_use')?.input ?? {};
        const permis = nombres(message + points.map((p) => p.titre).join(' '));
        const fautifs = [...nombres(phrase), ...nombres(phraseEn)].filter((n) => !permis.some((p) => p === n || (n.length >= 4 && p.startsWith(n))));
        if (JUGEMENT.test(phrase ?? '') || JUGEMENT.test(phraseEn ?? '')) fautifs.push('mot de jugement');
        if (mots(phrase) > 50) fautifs.push(`trop longue (${mots(phrase)} mots)`);
        points.forEach((p, i) => { p.titreEn = titresEn?.[i] ?? null; });
        if (!phrase || fautifs.length) {
          rejets++;
          console.log(`  ODJ ${s.id} : phrase rejetée (${fautifs.join(', ')}) — ${phrase}`);
          odjSortie.push({ ...base, phrase: null, phraseEn: null, rejets: (vieux?.rejets ?? 0) + 1 });
        } else {
          odjSortie.push({ ...base, phrase, phraseEn, genereLe: new Date().toISOString() });
        }
      } catch (e) {
        console.log(`  ODJ ${s.id} : échec (${e.message})`);
      }
      faites.add(s.nom);
    }
  }

  const cout = (entree * TARIF.entree + sortieJetons * TARIF.sortie) / 1e6;
  console.log(`Séances : ${sortie.length}, appels : ${appels}, rejets : ${rejets}, coût : ${cout.toFixed(3)} $ US`);
  if (DRY) return;
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    modele: MODELE,
    genereParIA: true,
    avertissement: 'Phrase de résumé générée par IA à partir des décisions de la séance ; les points marquants sont choisis sans IA. Le procès-verbal officiel fait foi.',
    page: CFG.page,
    seances: sortie,
    ordresDuJour: odjSortie,
    // Séances déjà tenues dont la Ville n'a pas encore publié le procès-verbal (Montréal seulement :
    // le calendrier vient de seances.json). La carte le dit, pour qu'on ne croie pas le site en retard.
    enAttente: (decisions.seances ?? [])
      .filter((s) => s.etat === 'procès-verbal non publié' && s.date <= new Date().toISOString().slice(0, 10))
      .map((s) => ({ instance: s.nom, date: s.date })),
  }, null, 1) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
