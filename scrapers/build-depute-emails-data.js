// Injecte data/deputes-contacts.json dans index.html, entre les marqueurs
// DEPUTE_EMAILS_START / DEPUTE_EMAILS_END, sous forme d'une table de correspondance
// nom-normalisé -> courriel (utilisée par findDeputeEmail() dans la page).

import { readFileSync, writeFileSync } from 'node:fs';

const IN_PATH = 'data/deputes-contacts.json';
const HTML_PATH = 'index.html';
const START_MARKER = '/* DEPUTE_EMAILS_START';
const END_MARKER = '/* DEPUTE_EMAILS_END */';

// Doit rester identique à la fonction norm() du HTML pour que les clés matchent.
// Identique à la fonction norm() du HTML (même plage Unicode explicite ̀-ͯ
// pour éviter tout risque de caractère combinant mal copié).
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));

  const emailByNorm = {};
  for (const c of data.contacts) {
    if (c.email) emailByNorm[norm(c.name)] = c.email;
  }

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs DEPUTE_EMAILS_START/END introuvables dans ${HTML_PATH}`);
  }

  const block = `${START_MARKER} — généré automatiquement par scrapers/build-depute-emails-data.js\n   à partir de data/deputes-contacts.json (voir scrapers/depute-emails.js). Courriel\n   officiel assnat.qc.ca uniquement — pas de réseaux sociaux (voir la conversation :\n   pas de façon fiable de vérifier qu'un compte Google trouvé par nom appartient\n   vraiment à la bonne personne). Ne pas éditer ce bloc à la main.\n   Généré le ${new Date().toISOString()} */\nconst deputeEmails = ${JSON.stringify(emailByNorm, null, 2)};\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);
  console.log(`${Object.keys(emailByNorm).length} courriels injectés dans ${HTML_PATH}`);
}

main();
