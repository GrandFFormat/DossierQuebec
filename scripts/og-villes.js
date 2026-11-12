// Images de partage (og:image) des volets de ville, 1200 × 630, le format exact de Facebook.
// L'ancienne image commune (1702 × 630) se faisait rogner des deux côtés (Martin, 12 nov. 2026).
// Usage : node scripts/og-villes.js  → <ville>/og-<ville>.png
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VILLES = {
  quebec: 'Québec', montreal: 'Montréal', levis: 'Lévis', laval: 'Laval', longueuil: 'Longueuil',
};

const page = (nom) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fff;font-family:Archivo,sans-serif;color:#16191D;
  display:flex;flex-direction:column;justify-content:center;padding:0 80px;border-bottom:18px solid #0B8A4B}
.logo{font-size:${nom.length > 8 ? 74 : 84}px;font-weight:850;letter-spacing:-.03em;line-height:1}
.logo span{color:#0B8A4B}
.trait{width:120px;height:8px;background:#16191D;margin:40px 0 36px}
.titre{font-size:50px;font-weight:750;line-height:1.15;letter-spacing:-.015em;max-width:1000px}
.pied{margin-top:44px;font-size:24px;font-weight:600;color:#5B6570;letter-spacing:.06em;text-transform:uppercase}
</style></head><body>
<div class="logo">Dossier<span>VilleDe${nom}</span></div>
<div class="trait"></div>
<div class="titre">Les décisions du conseil municipal de ${nom}, en langage clair.</div>
<div class="pied">Procès-verbaux officiels · Votes · Conseil · dossierquebec.ca</div>
</body></html>`;

const nav = await chromium.launch();
const p = await nav.newPage({ viewport: { width: 1200, height: 630 } });
for (const [cle, nom] of Object.entries(VILLES)) {
  await p.setContent(page(nom), { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(RACINE, cle, `og-${cle}.png`) });
  console.log(`${cle}/og-${cle}.png`);
}
await nav.close();
