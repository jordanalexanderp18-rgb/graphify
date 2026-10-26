// Validación de entrada en el servidor. Cada ruta pasa lo que recibe por aquí.
import { HttpError } from './db.js';

const bad = (field, msg) => { throw new HttpError(400, msg, { field }); };

export function str(v, field, { max = 200, required = false, label = field } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') bad(field, `${label}: valor no válido.`);
  const s = String(v).trim();
  if (required && !s) bad(field, `Falta ${label}.`);
  if (s.length > max) bad(field, `${label}: máximo ${max} caracteres.`);
  return s;
}

export function int(v, field, { min = 0, max = 1e12, required = true, label = field } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return undefined;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (!Number.isInteger(n)) bad(field, `${label}: debe ser un número entero.`);
  if (n < min || n > max) bad(field, `${label}: debe estar entre ${min} y ${max}.`);
  return n;
}

export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

export function oneOf(v, field, list) {
  if (!list.includes(v)) bad(field, `${field}: valor no permitido.`);
  return v;
}

export function email(v, field = 'email', { required = false } = {}) {
  const s = str(v, field, { max: 200, required, label: 'el correo' }).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad(field, 'El correo no parece válido.');
  return s;
}

// Teléfono a solo dígitos con código de país (formato que usa WhatsApp).
export function phone(v, prefix, field = 'phone', { required = false } = {}) {
  const raw = str(v, field, { max: 30, required, label: 'el teléfono' });
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (!(raw.trim().startsWith('+') || (d.startsWith(prefix) && d.length >= 11))) d = prefix + d.replace(/^0+/, '');
  if (d.length < 8 || d.length > 15) bad(field, 'El teléfono no parece válido.');
  return d;
}

// Solo las claves permitidas, transformadas por su validador.
export function pick(body, spec) {
  const out = {};
  for (const [k, fn] of Object.entries(spec)) if (body[k] !== undefined) out[k] = fn(body[k], k);
  return out;
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'barberia';
}

// CSV sencillo con comillas. Devuelve filas de celdas.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
