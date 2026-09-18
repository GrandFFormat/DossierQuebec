// Version anglaise des sujets suivables : leur titre, leur description, et le récapitulatif
// « Où en est le projet » que lit Mes dossiers.
//
//   node --env-file=../api.env scrapers/projets-en.js            traduit ce qui a changé
//   node --env-file=../api.env scrapers/projets-en.js --force    tout refaire
//   node --env-file=../api.env scrapers/projets-en.js --dry-run  estime, n'appelle rien
//
// Un sujet = un appel : seize appels, quelques cents sur Sonnet. Un sujet n'est retraduit que
// si son texte français a changé (empreinte), donc le rafraîchissement quotidien ne paie que
// pour ce qui bouge.
//
// GARDE-FOU, le même que pour les résumés (scrapers/traductions.js) : chaque nombre du français
// doit se retrouver dans l'anglais. Une traduction qui perd, ajoute ou change un chiffre est
// refusée, et Mes dossiers garde le français pour ce sujet-là.
//
// Écrit data/projets/en.json : { generatedAt, modele, projets: { <clé>: { titre, description,
// recap: { enBref, etapes: [{ periode, titre, texte }], aSurveiller: [{ texte }], source },
// source: <empreinte> } } }. Les numéros de résolution ne sont pas traduits : ils vivent à part
// dans le fichier français, et Mes dossiers les reprend tels quels.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';

const DOSSIER = new URL('../data/projets/', import.meta.url);
const OUT = new URL('../data/projets/en.json', import.meta.url);
const MODELE = 'claude-sonnet-5';
const TARIF = { entree: 2, sortie: 10 };

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

const CONSIGNE = `You translate, from French into clear, simple Canadian English, what a civic
information website says about a City of Montréal (Canada) topic people can follow: its title, its
one-line description, and the recap of where the project stands.

Translate faithfully, field by field: same meaning, same order, same number of steps and watch items.
Do not add, remove, explain, soften or judge anything. No context from your general knowledge. Your
reader has no training in municipal administration.

Numbers: keep every figure. Use Canadian English formatting ($2,000,000; $175M; 6.5%; October 31, 2027).
Never change, round, add or drop a number. "Avril 2026" is "April 2026"; "Janvier–mars 2026" is
"January–March 2026".

Names: keep proper names in French exactly as written — streets ("boulevard Décarie", "rue Namur"),
boroughs ("Le Plateau-Mont-Royal", "Côte-des-Neiges–Notre-Dame-de-Grâce"), parks, buildings, companies,
organizations and people. Usual English terms: conseil municipal = city council; conseil d'agglomération =
urban agglomeration council; comité exécutif = executive committee; conseil d'arrondissement = borough
council; arrondissement = borough; sommaire décisionnel = decision summary; procès-verbal = minutes;
règlement = by-law; règlement d'emprunt = loan by-law; appel d'offres = call for tenders.

Fill in the tool. Every field you are given has a translation; a field given as null stays null.`;

const OUTIL = {
  name: 'enregistrer_projet_en',
  description: "Enregistre la version anglaise d'un sujet suivable.",
  input_schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' },
      description: { type: 'string' },
      enBref: { type: ['string', 'null'] },
      etapes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { periode: { type: 'string' }, titre: { type: 'string' }, texte: { type: 'string' } },
          required: ['periode', 'titre', 'texte'],
          additionalProperties: false,
        },
      },
      aSurveiller: {
        type: 'array',
        items: { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'], additionalProperties: false },
      },
      source: { type: ['string', 'null'] },
    },
    required: ['titre', 'description', 'enBref', 'etapes', 'aSurveiller', 'source'],
    additionalProperties: false,
  },
};

// Les nombres d'un texte, séparateurs retirés et triés — le même garde-fou que les résumés.
export function nombres(texte) {
  return (String(texte ?? '').replace(/(\d)(?:[\s  ]+|[.,])(?=\d)/g, '$1').match(/\d+/g) ?? []).sort();
}
const memesNombres = (fr, en) => nombres(fr).join(' ') === nombres(en).join(' ');
const CONTROLE = /[\x00-\x09\x0b-\x1f\x7f]/;
const propre = (s) => typeof s === 'string' && s.trim() && !CONTROLE.test(s);

// Ce qu'on envoie au modèle : le texte, rien que le texte. Les numéros restent côté français.
function francaisDe(projet) {
  const r = projet.recap ?? null;
  return {
    titre: projet.titre ?? '',
    description: projet.description ?? '',
    enBref: r?.enBref ?? null,
    etapes: (r?.etapes ?? []).map(({ periode, titre, texte }) => ({ periode, titre, texte })),
    aSurveiller: (r?.aSurveiller ?? []).map(({ texte }) => ({ texte })),
    source: r?.source ?? null,
  };
}

export function verifier(fr, sortie) {
  if (!sortie) return { raison: "le modèle n'a pas rempli l'outil" };
  if (!propre(sortie.titre) || !propre(sortie.description)) return { raison: 'titre ou description vide' };
  if ((sortie.etapes ?? []).length !== fr.etapes.length) return { raison: `${(sortie.etapes ?? []).length} étapes au lieu de ${fr.etapes.length}` };
  if ((sortie.aSurveiller ?? []).length !== fr.aSurveiller.length) return { raison: `${(sortie.aSurveiller ?? []).length} points à surveiller au lieu de ${fr.aSurveiller.length}` };
  if ((fr.enBref == null) !== (sortie.enBref == null)) return { raison: 'en bref ajouté ou perdu' };
  // Les nombres, champ par champ : c'est là que se cachent les montants et les échéances.
  const paires = [
    [fr.titre, sortie.titre],
    [fr.enBref ?? '', sortie.enBref ?? ''],
    ...fr.etapes.map((e, i) => [`${e.periode} ${e.titre} ${e.texte}`, `${sortie.etapes[i].periode} ${sortie.etapes[i].titre} ${sortie.etapes[i].texte}`]),
    ...fr.aSurveiller.map((e, i) => [e.texte, sortie.aSurveiller[i].texte]),
  ];
  for (const [a, b] of paires) {
    if (!memesNombres(a, b)) return { raison: `nombres différents : ${nombres(a).join(',')} ≠ ${nombres(b).join(',')}` };
  }
  if ((sortie.etapes ?? []).some((e) => !propre(e.periode) || !propre(e.titre) || !propre(e.texte))) return { raison: 'étape vide' };
  if ((sortie.aSurveiller ?? []).some((e) => !propre(e.texte))) return { raison: 'point à surveiller vide' };
  return { en: sortie };
}

const empreinteDe = (fr) => createHash('sha256').update(JSON.stringify(fr)).digest('hex').slice(0, 16);

async function main() {
  const fichiers = (await readdir(DOSSIER)).filter((f) => f.endsWith('.json') && !['index.json', 'en.json'].includes(f));
  const projets = [];
  for (const f of fichiers) {
    const p = JSON.parse(await readFile(new URL(f, DOSSIER), 'utf8'));
    if (p?.cle) projets.push(p);
  }
  let precedent = {};
  try { ({ projets: precedent = {} } = JSON.parse(await readFile(OUT, 'utf8'))); } catch { /* première fois */ }

  const aFaire = projets
    .map((p) => ({ p, fr: francaisDe(p) }))
    .map((x) => ({ ...x, empreinte: empreinteDe(x.fr) }))
    .filter((x) => args.has('force') || precedent[x.p.cle]?.source !== x.empreinte);

  const jetons = aFaire.reduce((n, x) => n + Math.round(JSON.stringify(x.fr).length / 3.6), 0);
  const cout = aFaire.length ? ((jetons + aFaire.length * 500) / 1e6) * TARIF.entree + ((jetons * 1.4) / 1e6) * TARIF.sortie : 0;
  console.log(`Sujets en anglais : ${Object.keys(precedent).length} déjà traduits, ${aFaire.length} à faire — ~${cout.toFixed(2)} $ US estimés.`);
  if (!aFaire.length || args.has('dry-run')) return;
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Sujets en anglais : sautés, pas de clé ANTHROPIC_API_KEY.'); return; }

  const client = new Anthropic();
  const faits = {};
  const echecs = [];
  let entree = 0;
  let sortieJetons = 0;
  for (const { p, fr, empreinte } of aFaire) {
    try {
      const message = await client.messages.create({
        model: MODELE,
        max_tokens: 8000,
        system: CONSIGNE,
        tools: [OUTIL],
        tool_choice: { type: 'tool', name: OUTIL.name },
        messages: [{ role: 'user', content: JSON.stringify(fr) }],
      });
      entree += message.usage?.input_tokens ?? 0;
      sortieJetons += message.usage?.output_tokens ?? 0;
      const v = verifier(fr, message.content.find((b) => b.type === 'tool_use' && b.name === OUTIL.name)?.input ?? null);
      if (v.raison) { echecs.push(`${p.cle} : ${v.raison}`); continue; }
      faits[p.cle] = { ...v.en, source: empreinte, genereLe: new Date().toISOString() };
    } catch (err) {
      echecs.push(`${p.cle} : ${err.message ?? err}`);
    }
  }

  const cles = new Set(projets.map((p) => p.cle));
  const tous = Object.fromEntries(Object.entries({ ...precedent, ...faits }).filter(([cle]) => cles.has(cle)));
  const coutReel = (entree / 1e6) * TARIF.entree + (sortieJetons / 1e6) * TARIF.sortie;
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    modele: MODELE,
    genereParIA: true,
    avertissement: "Traductions automatiques des textes français ; chaque nombre a été vérifié contre le français. Les documents de la Ville sont en français et font foi.",
    nombre: Object.keys(tous).length,
    projets: tous,
  }, null, 1), 'utf8');
  console.log(`Sujets en anglais : ${Object.keys(faits).length} traduits (${echecs.length} refusés), ${Object.keys(tous).length} au total — ${coutReel.toFixed(2)} $ US.`);
  for (const e of echecs.slice(0, 10)) console.warn(`  ⚠ ${e}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) await main();
