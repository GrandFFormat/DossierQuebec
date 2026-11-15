// « Aujourd'hui à l'Assemblée » (14 nov. 2026) : les séances de commission qui portent sur un projet
// de loi (consultations, étude détaillée…), résumées à partir du Journal des débats.
//
//   node --env-file=api.env scrapers/debats.js              les séances nouvelles de la session en cours
//   node --env-file=api.env scrapers/debats.js --dry-run    liste ce qui serait résumé, n'appelle rien
//   DEBATS_SESSION=43-2 DEBATS_MAX=3 node … scrapers/debats.js   une session précise, 3 séances au plus
//
// Source : la version PRÉLIMINAIRE du Journal des débats de chaque commission
// (assnat.qc.ca/fr/travaux-parlementaires/commissions/<code>-<législature>-<session>/journal-debats/).
// La version définitive paraît « dans un délai moyen de 2 ans » : on ne l'attend pas. Rien n'est lu
// à l'Assemblée elle-même (la Chambre) pour l'instant : c'est en commission que les projets de loi
// avancent entre deux votes.
//
// Le résumé : Haiku lit la transcription entière (20 000 à 25 000 mots pour une journée, ≈ 3 ¢) et
// rend des puces de faits, les votes tenus, ce qui suit. Consigne : ne rien ajouter, ne pas juger.
// Garde-fous : un mot de jugement rejette le résumé ; un numéro de projet de loi ou d'article cité
// dans les puces doit figurer dans la transcription. Une séance déjà résumée n'est jamais redemandée.
//
// Écrit data/debats.json (tout) et data/site/debats.json (les 60 derniers jours, pour l'accueil et
// les fiches des projets de loi). Sans ANTHROPIC_API_KEY, repère les séances mais ne résume pas.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const DRY = process.argv.includes('--dry-run');
const MAX = Number(process.env.DEBATS_MAX || 12);
const JOURS = Number(process.env.DEBATS_JOURS || 45);
const MODELE = 'claude-haiku-4-5';
const TARIF = { entree: 1, sortie: 5 };   // $ US par million de jetons
const BASE = 'https://www.assnat.qc.ca';
const UA = { 'User-Agent': 'DossierQuebec/1.0 (+https://dossierquebec.ca/)' };
const SORTIE = 'data/debats.json';
const SORTIE_SITE = 'data/site/debats.json';

// Les commissions permanentes qui étudient des projets de loi (la CAN et la CAP n'en étudient pas).
const COMMISSIONS = {
  capern: "Commission de l'agriculture, des pêcheries, de l'énergie et des ressources naturelles",
  cat: "Commission de l'aménagement du territoire",
  cce: 'Commission de la culture et de l’éducation',
  cet: 'Commission de l’économie et du travail',
  cfp: 'Commission des finances publiques',
  ci: 'Commission des institutions',
  crc: 'Commission des relations avec les citoyens',
  csss: 'Commission de la santé et des services sociaux',
  cte: 'Commission des transports et de l’environnement',
};
const COMMISSIONS_EN = {
  capern: 'Committee on Agriculture, Fisheries, Energy and Natural Resources',
  cat: 'Committee on Planning and the Public Domain',
  cce: 'Committee on Culture and Education',
  cet: 'Committee on Labour and the Economy',
  cfp: 'Committee on Public Finance',
  ci: 'Committee on Institutions',
  crc: 'Committee on Citizen Relations',
  csss: 'Committee on Health and Social Services',
  cte: 'Committee on Transportation and the Environment',
};

const decoder = (s) => String(s ?? '').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&rsquo;|&#8217;/g, '’').replace(/&laquo;|&#171;/g, '«').replace(/&raquo;|&#187;/g, '»')
  .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&ccedil;/g, 'ç').replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô').replace(/&icirc;/g, 'î').replace(/&ucirc;/g, 'û')
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

async function page(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// La session en cours : celle des projets de loi (data/bills.json), sauf si DEBATS_SESSION la fixe.
function sessionCourante() {
  if (process.env.DEBATS_SESSION) return process.env.DEBATS_SESSION;
  const bills = existsSync('data/bills.json') ? JSON.parse(readFileSync('data/bills.json', 'utf8')).bills ?? [] : [];
  const leg = Math.max(0, ...bills.map((b) => Number(b.legislature) || 0));
  const session = Math.max(0, ...bills.filter((b) => Number(b.legislature) === leg).map((b) => Number(b.introSession) || 0));
  if (!leg || !session) throw new Error('session introuvable dans data/bills.json (DEBATS_SESSION=43-2 pour forcer)');
  return `${leg}-${session}`;
}

// Le type d'une séance, d'après l'intitulé du mandat.
function typeDe(sujet) {
  const s = sujet.toLowerCase();
  if (/^consultations? /.test(s)) return 'consultations';
  if (/^étude détaillée/.test(s)) return 'etude-detaillee';
  if (/prise en considération/.test(s)) return 'prise-en-consideration';
  if (/^adoption/.test(s)) return 'adoption';
  return 'autre';
}
const TYPES = {
  consultations: ['Consultations', 'Consultations'],
  'etude-detaillee': ['Étude détaillée', 'Clause-by-clause study'],
  'prise-en-consideration': ['Prise en considération', 'Consideration of the report'],
  adoption: ['Adoption', 'Passage'],
  autre: ['Séance', 'Sitting'],
};

// L'index d'une commission : une ligne par séance (date, adresse, mandats du jour).
async function seancesDe(code, session) {
  const url = `${BASE}/fr/travaux-parlementaires/commissions/${code}-${session}/journal-debats/index.html`;
  let html;
  try { html = await page(url); } catch (e) { if (/^404/.test(e.message)) return []; throw e; }
  const plat = html.replace(/\s+/g, ' ');
  const lignes = [];
  for (const m of plat.matchAll(/<tr>\s*<td class="colonneDate"\s*>(\d{4}-\d{2}-\d{2})<\/td>\s*<td>\s*<a href="([^"]+)">([^<]*)<\/a>\s*<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/g)) {
    const [, date, href, volume, reste] = m;
    const sujets = [...reste.matchAll(/<li>(.*?)<\/li>/g)].map((x) => decoder(x[1].replace(/<[^>]+>/g, ' ')));
    const pls = [...new Set(sujets.flatMap((s) => [...s.matchAll(/projet de loi n[°o]\s*(\d+)/gi)].map((x) => Number(x[1]))))];
    if (!pls.length) continue;   // mandats d'initiative, pétitions, crédits : pas ici
    lignes.push({ id: href.split('/').pop().replace(/\.html$/, ''), date, url: BASE + href, volume: decoder(volume), commission: code, sujets, pls, type: typeDe(sujets[0]) });
  }
  return lignes;
}

// La transcription, en texte : du corps de la page jusqu'au pied, sans le menu ni les scripts.
function texteDe(html) {
  const a = html.indexOf('id="divAncreContenuPrincipal"');
  const b = html.indexOf('id="ClearPiedPage"');
  const corps = a >= 0 ? html.slice(a, b > a ? b : undefined) : html;
  const t = decoder(corps.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<\/p>|<br\s*\/?>|<\/h\d>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')).replace(/ \n /g, '\n');
  const debut = t.search(/\([A-ZÉ][a-zéû-]+(?: [a-zéû-]+)* heures?[^)]*\)/);
  return { texte: t, debut: debut >= 0 ? t.slice(debut) : t };
}
const heuresDe = (t) => {
  const d = t.match(/\(([A-ZÉ][a-zéû-]+(?: [a-zéû-]+)*) heures?(?: [a-zéû -]+ minutes?)?\)/);
  const f = t.match(/\(Fin de la séance à (\d{1,2}) h ?(\d{2})?\)/);
  return { debut: d ? d[0].replace(/[()]/g, '') : null, fin: f ? `${f[1]} h ${f[2] ?? ''}`.trim() : null };
};

const CONSIGNE = `Tu résumes une séance d'une commission parlementaire de l'Assemblée nationale du Québec pour un site d'information citoyenne, neutre, en langage clair.

Tu reçois la transcription officielle (version préliminaire) d'une séance. Tu rends :
- puces : 3 à 5 phrases courtes de FAITS, dans l'ordre de la séance. Ce qui a été décidé, déposé, adopté, rejeté, reporté ; quels articles ont été étudiés ; les motions et leur sort ; une position exprimée seulement si elle est attribuée à la personne qui l'a dite (« Le député d'Acadie, André Morin, a demandé… »). Nomme les gens par leur titre et leur circonscription tels qu'ils apparaissent, et leur parti seulement si la transcription le dit.
- votes : chaque vote tenu (par appel nominal ou non), avec son objet en une phrase, le nombre de voix pour, contre, les abstentions, et le résultat tel que prononcé par la présidence. Compte toi-même les voix d'un vote par appel nominal en lisant la liste.
- aSuivre : une phrase sur ce qui reprend à la prochaine séance, ou null.
- pucesEn et aSuivreEn : la traduction anglaise fidèle, mêmes nombres.

Règles absolues : rien qui ne soit dans la transcription ; aucun jugement, aucun adjectif d'appréciation (important, historique, controversé, vif…) ; pas de « notamment », pas de résumé des arguments de fond au-delà d'une proposition claire par intervenant ; les nombres recopiés tels quels. Si la séance n'a fait qu'entendre des groupes en consultation, dis qui a été entendu et ce que chaque groupe demandait en une proposition. Écris en français du Québec, sans virgule avant « et ».`;

const OUTIL = {
  name: 'resume_seance',
  description: 'Enregistre le résumé factuel de la séance.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      puces: { type: 'array', items: { type: 'string' } },
      pucesEn: { type: 'array', items: { type: 'string' } },
      votes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            objet: { type: 'string' }, objetEn: { type: 'string' },
            pour: { type: 'integer' }, contre: { type: 'integer' }, abstentions: { type: 'integer' },
            resultat: { type: 'string', enum: ['adopte', 'rejete', 'autre'] },
            appelNominal: { type: 'boolean' },
          },
          required: ['objet', 'objetEn', 'pour', 'contre', 'abstentions', 'resultat', 'appelNominal'],
          additionalProperties: false,
        },
      },
      aSuivre: { type: ['string', 'null'] },
      aSuivreEn: { type: ['string', 'null'] },
    },
    required: ['puces', 'pucesEn', 'votes', 'aSuivre', 'aSuivreEn'],
    additionalProperties: false,
  },
};
const JUGEMENT = /\b(important|importante|importants|importantes|majeur|majeure|historique|controvers|vif|vive|houleu|ambitieu|notamment|significant|major|historic|controversial|heated|notably)\b/i;

async function resumer(client, seance, texte) {
  // Une journée tient dans la fenêtre ; au-delà de 160 000 caractères on garde le début et la fin.
  const corps = texte.length > 160000 ? `${texte.slice(0, 110000)}\n[…]\n${texte.slice(-50000)}` : texte;
  const entete = `${COMMISSIONS[seance.commission]}, séance du ${seance.date}. Mandat : ${seance.sujets.join(' ; ')}.`;
  const rep = await client.messages.create({
    model: MODELE, max_tokens: 1800, system: CONSIGNE, tools: [OUTIL], tool_choice: { type: 'tool', name: OUTIL.name },
    messages: [{ role: 'user', content: `${entete}\n\nTRANSCRIPTION :\n${corps}` }],
  });
  const r = rep.content.find((c) => c.type === 'tool_use')?.input;
  const usage = { entree: rep.usage.input_tokens, sortie: rep.usage.output_tokens };
  if (!r?.puces || r.puces.length < 2) return { erreur: 'moins de deux puces', usage };
  r.votes ??= []; r.pucesEn ??= [];
  const tout = [...r.puces, ...(r.aSuivre ? [r.aSuivre] : [])].join(' ');
  const jug = tout.match(JUGEMENT);
  if (jug) return { erreur: `mot de jugement « ${jug[0]} »`, usage };
  // Les numéros d'articles et de projets de loi cités doivent être dans la transcription.
  const plat = texte.toLowerCase();
  const nums = [...tout.matchAll(/(?:article|projet de loi n[°o]?)\s*(\d+)/gi)].map((m) => m[1]);
  const absents = nums.filter((n) => !new RegExp(`(?:article|loi n[°o]?)\\s*${n}\\b`).test(plat));
  if (absents.length) return { erreur: `numéros absents de la source : ${absents.join(', ')}`, usage };
  return { resume: r, usage };
}

async function main() {
  const session = sessionCourante();
  const [leg, ses] = session.split('-').map(Number);
  const ancien = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf8')) : { seances: [] };
  const connues = new Map(ancien.seances.map((s) => [s.url, s]));
  const depuis = new Date(Date.now() - JOURS * 864e5).toISOString().slice(0, 10);

  const trouvees = [];
  for (const code of Object.keys(COMMISSIONS)) {
    try {
      const l = await seancesDe(code, session);
      trouvees.push(...l);
    } catch (e) {
      console.warn(`  ${code} : index illisible (${e.message})`);
    }
  }
  const nouvelles = trouvees.filter((s) => s.date >= depuis && !connues.get(s.url)?.resume && !((connues.get(s.url)?.rejets ?? 0) >= 2))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX);
  console.log(`Débats : session ${session}, ${trouvees.length} séances sur des projets de loi, ${nouvelles.length} à résumer (depuis ${depuis}, ${MAX} au plus).`);

  const cle = process.env.ANTHROPIC_API_KEY;
  const client = DRY || !cle ? null : new Anthropic();
  if (!client && !DRY) console.warn('  ANTHROPIC_API_KEY absente : les séances sont repérées, pas résumées.');
  let appels = 0, entree = 0, sortie = 0;
  for (const s of nouvelles) {
    const vieux = connues.get(s.url) ?? {};
    let fiche = { ...vieux, ...s, legislature: leg, session: ses, commissionNom: COMMISSIONS[s.commission], commissionNomEn: COMMISSIONS_EN[s.commission], typeNom: TYPES[s.type][0], typeNomEn: TYPES[s.type][1] };
    if (DRY) { console.log(`  ${s.date} ${s.commission.toUpperCase()} — ${s.sujets[0]}`); connues.set(s.url, fiche); continue; }
    let html;
    try { html = await page(s.url); } catch (e) { console.warn(`  ${s.id} : transcription illisible (${e.message})`); continue; }
    const { debut } = texteDe(html);
    const mots = debut.split(/\s+/).length;
    fiche = { ...fiche, heures: heuresDe(debut), mots, preliminaire: /Version préliminaire/i.test(html) };
    if (!client || mots < 300) { connues.set(s.url, fiche); continue; }
    try {
      const { resume, erreur, usage } = await resumer(client, s, debut);
      appels++; entree += usage.entree; sortie += usage.sortie;
      if (erreur) {
        console.log(`  ${s.id} : résumé rejeté (${erreur})`);
        fiche.rejets = (vieux.rejets ?? 0) + 1;
      } else {
        fiche = { ...fiche, resume, modele: MODELE, genereLe: new Date().toISOString(), rejets: 0 };
        console.log(`  ${s.id} : ${s.commission.toUpperCase()} ${s.date}, ${mots} mots, ${resume.puces.length} puces, ${resume.votes.length} vote(s)`);
      }
    } catch (e) {
      console.log(`  ${s.id} : échec (${e.message})`);
    }
    connues.set(s.url, fiche);
  }
  // Les séances déjà connues restent ; celles qu'on vient de voir gardent leurs sujets à jour.
  for (const s of trouvees) if (connues.has(s.url) && !nouvelles.includes(s)) connues.set(s.url, { ...connues.get(s.url), sujets: s.sujets, pls: s.pls, type: s.type, typeNom: TYPES[s.type][0], typeNomEn: TYPES[s.type][1] });

  const seances = [...connues.values()].sort((a, b) => b.date.localeCompare(a.date) || a.commission.localeCompare(b.commission));
  const cout = (entree * TARIF.entree + sortie * TARIF.sortie) / 1e6;
  const sortieJson = { generatedAt: new Date().toISOString(), source: `${BASE}/fr/travaux-parlementaires/journaux-debats.html`, session, modele: MODELE, dernierPassage: { appels, entree, sortie, coutUSD: Number(cout.toFixed(4)) }, seances };
  if (!DRY) {
    writeFileSync(SORTIE, JSON.stringify(sortieJson, null, 1), 'utf8');
    mkdirSync('data/site', { recursive: true });
    // Pour l'accueil et les fiches de projets de loi : les séances résumées des 12 derniers jours de séance
    // (une relâche ou une dissolution ne vide pas le bloc), 80 séances au plus.
    const jours = [...new Set(seances.filter((s) => s.resume).map((s) => s.date))].slice(0, 12);
    const recentes = seances.filter((s) => s.resume && jours.includes(s.date)).slice(0, 80);
    writeFileSync(SORTIE_SITE, JSON.stringify({ generatedAt: sortieJson.generatedAt, session, seances: recentes.map(allegee) }), 'utf8');
  }
  console.log(`Débats : ${seances.length} séances connues, ${seances.filter((s) => s.resume).length} résumées · ce passage : ${appels} appel(s), ${entree} + ${sortie} jetons ≈ ${cout.toFixed(3)} $ US.`);
}
export const allegee = (s) => ({
  id: s.id, date: s.date, url: s.url, commission: s.commission, commissionNom: s.commissionNom, commissionNomEn: s.commissionNomEn,
  type: s.type, typeNom: s.typeNom, typeNomEn: s.typeNomEn, sujets: s.sujets, pls: s.pls, legislature: s.legislature, session: s.session,
  heures: s.heures ?? null, preliminaire: s.preliminaire ?? true, resume: s.resume,
});

main().catch((e) => { console.error(e); process.exit(1); });
