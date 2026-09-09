import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Sert le dossier tel quel, PLUS les « URL propres » comme Vercel (cleanUrls) :
// /votes sert votes.html, /promesses sert promesses.html. Sans ça, tester en
// local les pages de section donne un 404 alors que la prod fonctionne.
async function lire(path) {
  const p = join(ROOT, decodeURIComponent(path));
  try {
    return { data: await readFile(p), ext: extname(p) };
  } catch {
    if (extname(p)) throw new Error('introuvable');
    return { data: await readFile(p + '.html'), ext: '.html' }; // cleanUrls
  }
}

createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const { data, ext } = await lire(path);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
