// Servidor HTTP: API JSON + archivos estáticos. Sin dependencias.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './db.js';
import { match } from './api.js';
import { COOKIE, parseCookies, sessionUser } from './auth.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};

// Páginas: rutas amigables -> archivo HTML.
function pageFor(pathname) {
  if (pathname === '/') return 'index.html';
  if (pathname === '/app' || pathname === '/app/') return 'app.html';
  if (/^\/b\/[^/]+\/?$/.test(pathname) || /^\/r\/[^/]+\/?$/.test(pathname)) return 'book.html';
  return null;
}

async function serveStatic(req, res, pathname) {
  const page = pageFor(pathname);
  const rel = page || decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Prohibido');
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not file');
    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY,
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': page ? 'no-cache' : 'public, max-age=300',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'No encontrado');
  }
}

function send(res, status, text) {
  res.writeHead(status, { ...SECURITY, 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { ...SECURITY, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'La solicitud es demasiado grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApp(db, { trustProxy = false } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
      return serveStatic(req, res, pathname);
    }
    const cookies = [];
    try {
      const route = match(req.method, pathname);
      if (!route) throw new HttpError(404, 'Ruta no encontrada.');
      let body = {};
      if (req.method !== 'GET') {
        // Solo JSON: un formulario de otro sitio no puede enviar esto sin CORS.
        const raw = await readBody(req);
        if (raw) {
          if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
            throw new HttpError(415, 'Se espera JSON.');
          }
          try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON no válido.'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'JSON no válido.');
        } else if (req.headers['content-type'] && !String(req.headers['content-type']).startsWith('application/json')) {
          throw new HttpError(415, 'Se espera JSON.');
        }
      }
      const sessionToken = parseCookies(req.headers.cookie)[COOKIE];
      const fwd = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
      const ctx = {
        db, body, params: route.params, query: Object.fromEntries(url.searchParams),
        user: sessionUser(db, sessionToken), sessionToken,
        ip: fwd || req.socket.remoteAddress || '',
        secure: trustProxy ? req.headers['x-forwarded-proto'] === 'https' : false,
        setCookie: (c) => cookies.push(c),
      };
      const out = await route.handler(ctx);
      const isWrapped = out && typeof out === 'object' && 'status' in out && 'data' in out && Object.keys(out).length === 2;
      json(res, isWrapped ? out.status : 200, isWrapped ? out.data : out, cookies.length ? { 'set-cookie': cookies } : {});
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...(e.extra || {}) });
      if (String(e?.message).includes('UNIQUE constraint failed: cash_registers')) return json(res, 409, { error: 'La caja ya está abierta.' });
      console.error(e);
      json(res, 500, { error: 'Algo falló de nuestro lado. Intenta de nuevo.' });
    }
  });
}
