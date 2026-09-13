// Publie le détail de l'argent vérifié dans Supabase (table details_argent), d'où la fonction
// api/detail.js le sert aux abonnés.
//
//   node scripts/publier-details.js           publie tout ce qui est vérifié et utilisable
//
// Pourquoi pas dans le site : le dépôt GitHub de DossierQuébec est public. Un fichier versionné
// est lisible par tous, abonnés ou non — data/details.json est donc gardé en local seulement
// (.gitignore), comme cache, et la copie servie vit dans Supabase, sans aucun accès public.
//
// Demande SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, dans l'environnement ou dans api.env
// (celui du volet ou celui de DossierQuébec). La clé est celle déjà configurée dans Vercel.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VILLE = 'quebec';
const RACINE = fileURLToPath(new URL('../', import.meta.url));

export function chargerCles() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    for (const f of [RACINE + 'api.env', RACINE + '../api.env']) {
      if (existsSync(f)) process.loadEnvFile(f);
    }
  }
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function publier(details) {
  if (!chargerCles()) {
    console.warn('⚠ Détail non publié : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent (api.env). Les abonnés ne le verront pas.');
    return 0;
  }
  const publiables = details.filter((d) => d.verification?.version >= 2 && d.verification.utilisable);
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let n = 0;
  for (let i = 0; i < publiables.length; i += 50) {
    const lot = publiables.slice(i, i + 50).map((d) => ({ ville: VILLE, dossier_id: d.id, detail: d, updated_at: new Date().toISOString() }));
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/details_argent?on_conflict=ville,dossier_id`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lot),
    });
    if (!res.ok) throw new Error(`details_argent → ${res.status} ${await res.text()}`);
    n += lot.length;
  }
  console.log(`Détail publié pour les abonnés : ${n} dossier(s).`);
  return n;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { details } = JSON.parse(await readFile(new URL('../data/details.json', import.meta.url), 'utf8'));
  await publier(details);
}
