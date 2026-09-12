import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',   // feed.xml, sitemap.xml
  '.css': 'text/css; charset=utf-8',
};

// Sert le dossier tel quel, PLUS les « URL propres » comme Vercel (cleanUrls) :
// /votes sert votes.html, /promesses sert promesses.html. Sans ça, tester en
// local les pages de section donne un 404 alors que la prod fonctionne.
async function lire(path) {
  // En production, /feed.xml est réécrit vers la fonction api/feed.js (qui compte
  // les lectures) et le XML vit dans api/feed-data.xml. On reproduit la même URL
  // en local — sans le comptage — sinon /feed.xml donnerait un 404 ici alors que
  // la prod fonctionne.
  if (path === '/feed.xml') {
    return { data: await readFile(join(ROOT, 'api', 'feed-data.xml')), ext: '.xml' };
  }
  const p = join(ROOT, decodeURIComponent(path));
  // Un chemin qui finit par « / » désigne un dossier : Vercel y sert index.html.
  // Sans ce cas, /villedequebec/ donnait un 404 en local alors que la prod aurait
  // fonctionné — le pire des écarts, celui qu'on ne découvre qu'après le déploiement.
  if (path.endsWith('/')) {
    return { data: await readFile(join(p, 'index.html')), ext: '.html' };
  }
  try {
    return { data: await readFile(p), ext: extname(p) };
  } catch {
    if (extname(p)) throw new Error('introuvable');
    return { data: await readFile(p + '.html'), ext: '.html' }; // cleanUrls
  }
}

createServer(async (req, res) => {
  // La query est retirée AVANT de résoudre la racine : sinon « /?debug=1 »
  // n'était pas reconnu comme « / » et renvoyait un 404.
  const sansQuery = req.url.split('?')[0];
  const path = sansQuery === '/' ? '/index.html' : sansQuery;
  try {
    const { data, ext } = await lire(path);
    // Pas de cache en développement : sans ça, le navigateur resservait
    // l'ancien index.html après une modification — on croit tester son
    // correctif alors qu'on mesure la version précédente.
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
