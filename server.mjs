// Minimal production server for the sidecar SPA.
//
// The frontend is a static Vite bundle with no backend of its own, but it
// depends on two same-origin endpoints that the Vite dev server provides
// (see vite.config.ts → configureServer):
//
//   GET/PUT /sidecar/config  — read/write config.json (bucket layout)
//   /api/*                    — Ghostfolio API, proxied same-origin to avoid
//                               CORS and let the Authorization header pass
//                               straight through.
//
// This server reproduces both for production, then serves the built bundle
// from dist/ with an SPA fallback to index.html. Zero dependencies — uses
// Node's built-in http module and the global fetch (Node 18+).

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const CONFIG = path.join(__dirname, 'config.json');

const PORT = Number(process.env.PORT ?? 5173);
// Where Ghostfolio lives (container hostname in docker-compose, e.g.
// http://ghostfolio:3333). Empty = no /api proxy (browser must reach the
// API itself, e.g. via an external reverse proxy or a public GHOSTFOLIO_URL
// baked into the bundle).
const UPSTREAM = (process.env.GHOSTFOLIO_URL ?? '').replace(/\/+$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Hop-by-hop and length-encoding headers must not be copied across a proxy
// boundary. Node's fetch also auto-decompresses gzip/br and strips
// content-encoding/content-length, so forwarding the upstream's values would
// lie to the browser about the body length.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-encoding'
]);

function cleanHeaders(headers) {
  const out = {};
  // Accept both a plain object (Node's req.headers — NOT iterable) and a
  // Headers instance (fetch Response.headers, which IS iterable). Iterating
  // a plain object with for..of throws "headers is not iterable", which was
  // silently swallowed by the proxy's catch and surfaced as a 502.
  const entries =
    typeof headers?.[Symbol.iterator] === 'function'
      ? [...headers]
      : Object.entries(headers ?? {});
  for (const [k, v] of entries) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- /sidecar/config: persist bucket layout to config.json ----------------
  if (pathname === '/sidecar/config') {
    if (req.method === 'GET') {
      try {
        const data = await readFile(CONFIG, 'utf8');
        return send(res, 200, data, { 'Content-Type': 'application/json; charset=utf-8' });
      } catch {
        return send(res, 404, JSON.stringify({ error: 'config.json not found' }));
      }
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      try {
        JSON.parse(body); // validate before persisting
      } catch {
        return send(res, 400, JSON.stringify({ error: 'invalid JSON' }));
      }
      try {
        await writeFile(CONFIG, body, 'utf8');
        return send(res, 200, body, { 'Content-Type': 'application/json; charset=utf-8' });
      } catch {
        return send(res, 500, JSON.stringify({ error: 'failed to write config' }));
      }
    }
    return send(res, 405, JSON.stringify({ error: 'method not allowed' }));
  }

  // --- /api/*: reverse proxy to Ghostfolio (same-origin, no CORS) -----------
  if (pathname.startsWith('/api/')) {
    if (!UPSTREAM) {
      return send(res, 502, JSON.stringify({ error: 'GHOSTFOLIO_URL not configured' }));
    }
    try {
      const target = UPSTREAM + pathname + url.search;
      const reqHeaders = cleanHeaders(req.headers);
      reqHeaders.host = new URL(UPSTREAM).host;
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const proxyRes = await fetch(target, { method: req.method, headers: reqHeaders, body });
      const buf = Buffer.from(await proxyRes.arrayBuffer());
      res.writeHead(proxyRes.status, cleanHeaders(proxyRes.headers));
      return res.end(buf);
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: 'upstream unreachable', detail: String(e) }));
    }
  }

  // --- static files from dist/ (SPA fallback to index.html) -----------------
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(DIST, rel || 'index.html');
  if (!file.startsWith(DIST + path.sep)) {
    return send(res, 403, JSON.stringify({ error: 'forbidden' }));
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    return send(res, 200, data, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  } catch {
    // Unknown route without a file extension → let client-side routing handle it.
    if (!path.extname(rel)) {
      try {
        const html = await readFile(path.join(DIST, 'index.html'));
        return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
      } catch {
        // fall through to 404
      }
    }
    return send(res, 404, JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[sidecar] listening on :${PORT}, upstream=${UPSTREAM || '(none)'}`);
});
