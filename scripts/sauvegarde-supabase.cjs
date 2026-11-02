// Copie de sauvegarde d'un projet Supabase en JSON (le forfait gratuit n'a pas de sauvegardes automatiques).
// Lit chaque table exposée par l'API avec la clé serveur, plus la liste des comptes (auth).
// Usage : node scripts/sauvegarde-supabase.cjs <fichier .env avec SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY> <nom>
// Écrit dans Documents/sauvegardes-supabase/<nom>-AAAA-MM-JJ/ (hors des dépôts : les données contiennent des courriels).
const fs = require('fs'), path = require('path'), os = require('os');
const [fichierEnv, nom] = process.argv.slice(2);
if (!fichierEnv || !nom) { console.error('usage : node sauvegarde-supabase.cjs <fichier .env> <nom>'); process.exit(1); }
const env = {};
for (const l of fs.readFileSync(fichierEnv, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const entetes = { apikey: K, Authorization: 'Bearer ' + K };
const jour = new Date().toISOString().slice(0, 10);
const dossier = path.join(os.homedir(), 'Documents', 'sauvegardes-supabase', `${nom}-${jour}`);

async function lireTable(t) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${encodeURIComponent(t)}?select=*`, { headers: { ...entetes, Range: `${debut}-${debut + 999}` } });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
    const lot = await r.json(); lignes.push(...lot);
    if (lot.length < 1000) return lignes;
  }
}

(async () => {
  fs.mkdirSync(dossier, { recursive: true });
  const api = await (await fetch(`${BASE}/rest/v1/`, { headers: entetes })).json();
  const tables = Object.keys(api.definitions || {}).sort();
  const bilan = {};
  for (const t of tables) {
    try { const l = await lireTable(t); fs.writeFileSync(path.join(dossier, t + '.json'), JSON.stringify(l)); bilan[t] = l.length; }
    catch (e) { bilan[t] = 'non lue : ' + e.message; }
  }
  const comptes = [];
  for (let page = 1; ; page++) {
    const r = await (await fetch(`${BASE}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: entetes })).json();
    comptes.push(...(r.users || [])); if (!r.users || r.users.length < 1000) break;
  }
  fs.writeFileSync(path.join(dossier, '_comptes.json'), JSON.stringify(comptes));
  bilan._comptes = comptes.length;
  fs.writeFileSync(path.join(dossier, '_bilan.json'), JSON.stringify(bilan, null, 1));
  const nonLues = Object.entries(bilan).filter(([, v]) => typeof v === 'string');
  console.log(`${dossier} : ${tables.length} tables, ${comptes.length} comptes, ${nonLues.length} non lues`);
  for (const [t, v] of nonLues) console.log('  ' + t + ' : ' + v);
})();
