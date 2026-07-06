// Scraper — Courriels officiels des député·e·s
//
// Source : la page d'index des députés sur assnat.qc.ca (HTML statique, un seul
// fetch — le tableau contient déjà nom, circonscription, parti ET courriel officiel
// pour chaque député·e, pas besoin de visiter 125 pages individuelles).
//
// Volontairement PAS de réseaux sociaux (LinkedIn/FB/Instagram) : ces comptes ne
// sont listés nulle part sur les pages officielles. Les trouver demanderait une
// recherche par nom (ex. Google), avec un vrai risque de confondre des homonymes
// ou de tomber sur un faux compte — décision prise de ne pas faire ça tant qu'il
// n'y a pas une façon fiable de vérifier la correspondance. Courriel seulement.

import { writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

const INDEX_URL = 'https://www.assnat.qc.ca/fr/deputes/index.html';
const OUT_PATH = 'data/deputes-contacts.json';
const USER_AGENT = 'veille-assnat-scraper/0.1 (projet citoyen independant, usage non commercial)';

function normalizeName(rawName) {
  // Format brut : "Bachand, André " (Nom, Prénom) -> "André Bachand"
  const cleaned = rawName.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([^,]+),\s*(.+)$/);
  return match ? `${match[2]} ${match[1]}` : cleaned;
}

async function main() {
  const res = await fetch(INDEX_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const contacts = [];
  $('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const nameLink = $(cells[0]).find('a').first();
    if (nameLink.length === 0) return;
    const name = normalizeName(nameLink.text());

    const emailLink = $(cells[3]).find('a[href^="mailto:"]').first();
    const email = emailLink.length ? emailLink.attr('href').replace(/^mailto:/, '').trim() : null;

    if (name) contacts.push({ name, email });
  });

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { source: INDEX_URL, scrapedAt: new Date().toISOString(), count: contacts.length, contacts },
      null,
      2
    )
  );

  const withEmail = contacts.filter((c) => c.email).length;
  console.log(`${contacts.length} député·e·s trouvé·e·s, ${withEmail} avec courriel — écrit dans ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Échec du scraper depute-emails.js :', err);
  process.exitCode = 1;
});
