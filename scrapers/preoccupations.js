// « CE QUI VOUS PRÉOCCUPE » (Martin, 18 oct. 2026). Les visiteurs connectés écrivent, dans Mon
// dossier, ce qui les préoccupe (table Supabase `preoccupations`, scripts/supabase-schema-
// preoccupations.sql). Une fois par jour, ce script :
//   1. lit les messages pas encore classés ;
//   2. les fait classer par Claude : spam écarté, sinon rangé dans un sujet existant, ou dans un
//      nouveau sujet si l'idée est la première du genre ;
//   3. note le résultat dans la table, puis recompte tout ;
//   4. publie le tableau, SANS AUCUN MESSAGE, dans data/preoccupations.json (affiché dans Mon dossier).
// Une personne compte une fois par sujet, même si elle en parle trois fois. Les sujets se corrigent
// à la main (renommer un libellé dans le JSON, déplacer un message dans la table) : le script garde
// les libellés existants et ne fait que compter.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY. Sans elles, rien ne se passe.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const SORTIE = 'data/preoccupations.json';
const MODELE = 'claude-haiku-4-5-20251001';
const URL = process.env.SUPABASE_URL, CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !CLE || !process.env.ANTHROPIC_API_KEY) {
  console.log('Préoccupations : variables absentes, étape sautée.');
  process.exit(0);
}

async function supabase(chemin, { methode = 'GET', corps, entetes = {} } = {}) {
  const r = await fetch(URL + chemin, {
    method: methode,
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json', ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${methode} ${chemin.split('?')[0]} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

const etat = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf8')) : { sujets: [] };
const sujets = new Map((etat.sujets || []).map((s) => [s.cle, { cle: s.cle, fr: s.fr, en: s.en }]));

const SYSTEME = `Tu classes des messages laissés par des visiteurs d'un site citoyen sur l'Assemblée nationale du Québec, à qui on a demandé « Qu'est-ce qui vous préoccupe ? ».

Pour chaque message, décide :
- "spam" : publicité, insulte, texte sans sens, message qui vise une personne privée, ou qui n'exprime aucune préoccupation ;
- sinon, range-le dans UN sujet existant s'il parle de la même chose (même en d'autres mots) ;
- sinon, crée un nouveau sujet.

Un sujet est un thème court et neutre, 2 à 6 mots, sans opinion ni verdict (« Coût du logement », « Attente aux urgences », « Transport en commun à Québec »). Jamais le nom d'une personne privée. Regroupe largement : deux messages sur le même problème vont dans le même sujet. Pour un nouveau sujet, donne une clé (minuscules, chiffres et tirets, ex. "cout-du-logement"), un libellé français et sa traduction anglaise.

Réponds UNIQUEMENT avec un tableau JSON, un objet par message, dans cet ordre :
[{"id": "...", "spam": true} ou {"id": "...", "sujet": "cle-existante"} ou {"id": "...", "nouveau": {"cle": "...", "fr": "...", "en": "..."}}]`;

const nouveaux = await supabase('/rest/v1/preoccupations?statut=eq.nouveau&select=id,texte&order=created_at&limit=200');
if (nouveaux.length) {
  const client = new Anthropic();
  const liste = [...sujets.values()].map((s) => `- ${s.cle} : ${s.fr}`).join('\n') || '(aucun pour l’instant)';
  const r = await client.messages.create({
    model: MODELE,
    max_tokens: 8000,
    system: SYSTEME,
    messages: [{ role: 'user', content: `Sujets existants :\n${liste}\n\nMessages :\n${JSON.stringify(nouveaux.map((m) => ({ id: m.id, texte: m.texte })))}` }],
  });
  const texte = r.content.find((b) => b.type === 'text')?.text || '';
  const debut = texte.indexOf('['), fin = texte.lastIndexOf(']');
  const reponses = debut >= 0 ? JSON.parse(texte.slice(debut, fin + 1)) : [];
  const ids = new Set(nouveaux.map((m) => m.id));
  let classes = 0, spams = 0;
  for (const rep of reponses) {
    if (!ids.has(rep.id)) continue;
    let corps;
    if (rep.spam) { corps = { statut: 'spam', sujet: null }; spams++; }
    else {
      let cle = rep.sujet;
      if (rep.nouveau && /^[a-z0-9-]{2,60}$/.test(rep.nouveau.cle || '')) {
        cle = rep.nouveau.cle;
        if (!sujets.has(cle)) sujets.set(cle, { cle, fr: String(rep.nouveau.fr || cle).slice(0, 80), en: String(rep.nouveau.en || rep.nouveau.fr || cle).slice(0, 80) });
      }
      if (!cle || !sujets.has(cle)) continue;   // réponse incomprise : le message attend le prochain passage
      corps = { statut: 'classe', sujet: cle };
      classes++;
    }
    await supabase(`/rest/v1/preoccupations?id=eq.${rep.id}`, { methode: 'PATCH', corps, entetes: { Prefer: 'return=minimal' } });
  }
  console.log(`Préoccupations : ${nouveaux.length} nouveaux messages, ${classes} classés, ${spams} écartés comme spam.`);
} else {
  console.log('Préoccupations : aucun nouveau message.');
}

// Le recompte, sur tous les messages classés : une personne compte une fois par sujet.
const classes = await supabase('/rest/v1/preoccupations?statut=eq.classe&select=user_id,sujet&limit=100000');
const parSujet = new Map();
for (const m of classes) {
  if (!parSujet.has(m.sujet)) parSujet.set(m.sujet, new Set());
  parSujet.get(m.sujet).add(m.user_id);
}
const tous = await fetch(URL + '/rest/v1/preoccupations?select=id&statut=neq.spam', { headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, Prefer: 'count=exact', Range: '0-0' } });
const recus = Number((tous.headers.get('content-range') || '').split('/')[1]) || classes.length;
const liste = [...sujets.values()]
  .map((s) => ({ ...s, n: parSujet.get(s.cle)?.size || 0 }))
  .filter((s) => s.n > 0)
  .sort((a, b) => b.n - a.n || a.fr.localeCompare(b.fr, 'fr'));
const contenu = JSON.stringify({ recus, mentions: liste.reduce((t, s) => t + s.n, 0), sujets: liste }, null, 1);
const avant = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
const sansDate = (t) => t.replace(/"majLe":"[^"]*",?/, '');
if (sansDate(avant) !== sansDate(contenu)) {
  writeFileSync(SORTIE, contenu.replace('{', `{\n "majLe": "${new Date().toISOString().slice(0, 10)}",`));
  console.log(`Préoccupations : tableau publié, ${liste.length} sujets.`);
}
