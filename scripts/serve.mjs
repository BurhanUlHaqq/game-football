import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const base = fileURLToPath(new URL('../dist', import.meta.url));
const port = Number(process.env.PORT ?? 41730);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Set PORT to a number from 1 to 65535.');
await stat(resolve(base, 'index.html')).catch(() => { throw new Error('Build the game with npm run build first.'); });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const origin = `http://127.0.0.1:${port}`;

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, origin).pathname);
    const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(`${base}${sep}`) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
    if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});

async function currentBuildIsRunning() {
  try {
    const index = await readFile(resolve(base, 'index.html'), 'utf8');
    const response = await fetch(`${origin}/`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html')) return false;
    return (await response.text()) === index;
  } catch {
    return false;
  }
}

server.once('error', async error => {
  if (error.code === 'EADDRINUSE') {
    if (await currentBuildIsRunning()) {
      console.log(`Rush Arena is already running at ${origin}/`);
      return;
    }
    console.error(`Port ${port} is in use. Set PORT to a different port and run npm run serve again.`);
  } else {
    console.error(`Could not start Rush Arena at ${origin}/`, error.message);
  }
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Rush Arena production capture: ${origin}/`));
