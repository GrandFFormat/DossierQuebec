// Petit serveur statique. Le prototype lit ses données via fetch(), ce qu'un navigateur
// refuse de faire quand la page est ouverte en file:// — d'où ce serveur.
//
//   npm run serve   ->   http://localhost:4321

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relatif = normalize(chemin === '/' ? 'index.html' : chemin.slice(1));
  if (relatif.startsWith('..')) {
    res.writeHead(403).end('Interdit');
    return;
  }
  try {
    const contenu = await readFile(join(RACINE, relatif));
    // Serveur de développement : jamais de cache, sinon on débogue un app.js que le
    // navigateur n'a pas rechargé après modification.
    res.writeHead(200, {
      'Content-Type': TYPES[extname(relatif)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable : ' + relatif);
  }
}).listen(PORT, () => console.log('DossierVille sur http://localhost:' + PORT));
