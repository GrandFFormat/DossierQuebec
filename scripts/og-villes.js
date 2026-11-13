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

// Image de partage du site principal, même dessin que l'ancienne bannière (1702 × 630), ramené à 1200 × 630.
const dq = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#F1F0EC;border:16px solid #141414;font-family:Archivo,sans-serif;color:#141414;
  padding:62px 64px 0;position:relative}
.logo{font-size:104px;font-weight:900;letter-spacing:-.035em;line-height:.95;text-transform:uppercase;white-space:nowrap}
.logo span{color:#1351C4}.logo i{color:#F7C948;font-style:normal;font-size:52px;vertical-align:middle;margin-left:14px}
.trait{width:330px;height:8px;background:#141414;margin:34px 0 30px}
.titre{font-size:50px;font-weight:850;letter-spacing:-.02em;line-height:1.12;text-transform:uppercase}
.creux{color:transparent;-webkit-text-stroke:2px #141414}
.pied{position:absolute;left:64px;bottom:62px;font-size:17px;font-weight:600;letter-spacing:.06em;color:#5B5852;text-transform:uppercase}
.url{position:absolute;right:56px;bottom:46px;background:#FFD54A;border:4px solid #141414;box-shadow:10px 10px 0 #141414;
  padding:12px 22px;font-size:25px;font-weight:800;letter-spacing:.06em}
</style></head><body>
<div class="logo">Dossier<span>Québec</span><i><svg viewBox="-2015 -2000 4030 4030" width="60" height="60"><path fill="#F7C948" d="m-90 2030 45-863a95 95 0 0 0-111-98l-859 151 116-320a65 65 0 0 0-20-73l-941-762 212-99a65 65 0 0 0 34-79l-186-572 542 115a65 65 0 0 0 73-38l105-247 423 454a65 65 0 0 0 111-57l-204-1052 327 189a65 65 0 0 0 91-27l332-652 332 652a65 65 0 0 0 91 27l327-189-204 1052a65 65 0 0 0 111 57l423-454 105 247a65 65 0 0 0 73 38l542-115-186 572a65 65 0 0 0 34 79l212 99-941 762a65 65 0 0 0-20 73l116 320-859-151a95 95 0 0 0-111 98l45 863z"/></svg></i></div>
<div class="trait"></div>
<div class="titre">Qui siège, <span class="creux">qui légifère</span>,<br>qui vote quoi.</div>
<div class="pied">Site citoyen indépendant · Vraies données publiques</div>
<div class="url">DOSSIERQUEBEC.CA</div>
</body></html>`;
const nav2 = await chromium.launch();
const p2 = await nav2.newPage({ viewport: { width: 1200, height: 630 } });
await p2.setContent(dq, { waitUntil: 'networkidle' });
await p2.screenshot({ path: path.join(RACINE, 'dossierquebec-partage.png') });
console.log('dossierquebec-partage.png');
await nav2.close();
