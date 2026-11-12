import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DIST_DIR = fileURLToPath(new URL('../../client/dist', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

export function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0];
  const rel = url === '/' ? 'index.html' : normalize(url).replace(/^([/\\])+/, '');
  const file = resolve(DIST_DIR, rel);
  if (!file.startsWith(DIST_DIR + sep) && file !== DIST_DIR) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
}
