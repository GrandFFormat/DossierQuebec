// « CE QUI VOUS PRÉOCCUPE » (Martin, 18 oct. 2026). Les visiteurs connectés écrivent, dans Mon
// dossier, ce qui les préoccupe (table Supabase `preoccupations`, scripts/supabase-schema-
// preoccupations*.sql). Martin lit les messages et les range lui-même dans des sujets, depuis le
// panneau admin de la page Lexique — sans IA (« j'ai pas besoin de l'IA, je vais m'en occuper »).
// Le sujet d'un message EST son libellé (« Coût du logement »).
//
// Ce script, une fois par jour, ne fait que compter : pour chaque sujet, le nombre de personnes qui
// en ont parlé (une personne compte une fois par sujet), et le nombre de messages reçus (spam
// exclu). Il publie le tableau, SANS AUCUN MESSAGE, dans data/preoccupations.json.
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Sans elles, rien ne se passe.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SORTIE = 'data/preoccupations.json';
const URL = process.env.SUPABASE_URL, CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !CLE) {
  console.log('Préoccupations : variables absentes, étape sautée.');
  process.exit(0);
}
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

const r = await fetch(URL + '/rest/v1/preoccupations?statut=eq.classe&select=user_id,sujet&limit=100000', { headers: entetes });
if (!r.ok) throw new Error(`Supabase → ${r.status} ${(await r.text()).slice(0, 200)}`);
const classes = await r.json();
const parSujet = new Map();
for (const m of classes) {
  if (!m.sujet) continue;
  if (!parSujet.has(m.sujet)) parSujet.set(m.sujet, new Set());
  parSujet.get(m.sujet).add(m.user_id);
}
const tous = await fetch(URL + '/rest/v1/preoccupations?select=id&statut=neq.spam', { headers: { ...entetes, Prefer: 'count=exact', Range: '0-0' } });
const recus = Number((tous.headers.get('content-range') || '').split('/')[1]) || classes.length;

const sujets = [...parSujet]
  .map(([libelle, personnes]) => ({ cle: libelle, fr: libelle, en: libelle, n: personnes.size }))
  .sort((a, b) => b.n - a.n || a.fr.localeCompare(b.fr, 'fr'));
const contenu = JSON.stringify({ recus, mentions: sujets.reduce((t, s) => t + s.n, 0), sujets }, null, 1);
const avant = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
const sansDate = (t) => t.replace(/\s*"majLe": "[^"]*",?/, '');
if (sansDate(avant) !== sansDate(contenu)) {
  writeFileSync(SORTIE, contenu.replace('{', `{\n "majLe": "${new Date().toISOString().slice(0, 10)}",`));
  console.log(`Préoccupations : ${recus} messages reçus, ${sujets.length} sujets publiés.`);
} else {
  console.log('Préoccupations : rien de changé.');
}
