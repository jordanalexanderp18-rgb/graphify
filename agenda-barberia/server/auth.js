// Contraseñas (scrypt), sesiones en cookie httpOnly y límites de frecuencia.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'sid';

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), want.length);
  return timingSafeEqual(want, got);
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.insert('sessions', { id: sha(token), user_id: userId, expires_at: expires });
  return { token, expires };
}

export function sessionUser(db, token) {
  if (!token) return null;
  const row = db.get(
    `select u.id, u.business_id, u.email, u.name, u.role, u.staff_id, s.expires_at
     from sessions s join users u on u.id = s.user_id where s.id = ?`, sha(token));
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return row;
}

export function destroySession(db, token) {
  if (token) db.run('delete from sessions where id = ?', sha(token));
}

export function sessionCookie(token, expires, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${new Date(expires).toUTCString()}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Ventana deslizante en memoria. Suficiente para un solo proceso.
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, 'Demasiados intentos. Espera un momento y vuelve a intentarlo.');
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
export const resetRateLimits = () => hits.clear();

// Quién puede hacer qué. owner: todo. reception: operación diaria. barber: su agenda.
const CAN = {
  owner: new Set(['settings', 'catalog', 'reports', 'operate', 'agenda', 'users']),
  reception: new Set(['operate', 'agenda']),
  barber: new Set(['agenda']),
};
export function allow(user, perm) {
  if (!user) throw new HttpError(401, 'Inicia sesión para continuar.');
  if (!CAN[user.role]?.has(perm)) throw new HttpError(403, 'Tu usuario no tiene permiso para esto.');
}

