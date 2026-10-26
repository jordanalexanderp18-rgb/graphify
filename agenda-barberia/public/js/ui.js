// Utilidades de interfaz compartidas. Todo el texto entra con textContent:
// nunca se arma HTML con datos de usuarios.

export const APP_NAME = 'Silla Llena';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

// Iconos (trazos propios, estilo línea 24x24).
const ICONS = {
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  percent: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', plus: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || '');
  svg.append(p);
  return svg;
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Error de red');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { error: 'Sin conexión. Revisa internet e intenta de nuevo.' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: kind === 'error' ? 'toast toast-error' : 'toast' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), 3500);
}

// Moneda: CLP/COP/ARS sin decimales (unidad = 1); el resto en centavos.
const ZERO = ['CLP', 'COP', 'PYG', 'ARS'];
export const minorFactor = (cur) => (ZERO.includes(cur) ? 1 : 100);
const LOCALE = { CLP: 'es-CL', MXN: 'es-MX', COP: 'es-CO', ARS: 'es-AR', PEN: 'es-PE', DOP: 'es-DO', EUR: 'es-ES', USD: 'es-EC' };
export function money(amount, cur) {
  const f = minorFactor(cur);
  try {
    return new Intl.NumberFormat(LOCALE[cur] || 'es', { style: 'currency', currency: cur, maximumFractionDigits: f === 1 ? 0 : 2 }).format((amount || 0) / f);
  } catch {
    return `${(amount || 0) / f} ${cur}`;
  }
}
export const toMinor = (v, cur) => Math.round(Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.') || 0) * minorFactor(cur));
export const fromMinor = (v, cur) => (v || 0) / minorFactor(cur);

// Fechas en la zona del negocio.
export function partsIn(isoOrMs, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(isoOrMs)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
export const todayIn = (tz) => partsIn(Date.now(), tz).date;
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function dateLabel(date, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const [y, m, d] = date.split('-').map(Number);
  const s = new Intl.DateTimeFormat('es', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function dateTimeLabel(iso, tz) {
  const s = new Intl.DateTimeFormat('es', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMin = (s) => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); };

// Formularios: lee campos por name; muestra errores del servidor en el campo.
export function field(label, input, hint) {
  const id = input.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'xs muted' }, hint) : null);
}
export const input = (attrs = {}) => h('input', { class: 'input', type: 'text', ...attrs });
export function select(attrs, options, selected) {
  return h('select', { class: 'input', ...attrs },
    options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(selected) ? 'selected' : null }, label)));
}
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value;
  }
  return out;
}
export function showFormError(form, err) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error, .form-error').forEach((el) => el.remove());
  const name = err?.data?.field;
  const target = name && form.querySelector(`[name="${CSS.escape(name)}"]`);
  if (target) {
    target.setAttribute('aria-invalid', 'true');
    const msg = h('span', { class: 'field-error', id: `${target.id}-err` }, err.message);
    target.setAttribute('aria-describedby', msg.id);
    target.after(msg);
    target.focus();
  } else {
    form.prepend(h('div', { class: 'form-error', role: 'alert' }, err.message));
  }
}

// Botón con estado de carga mientras corre una promesa.
export async function busy(btn, fn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  try { return await fn(); } finally { btn.removeAttribute('aria-busy'); btn.disabled = false; }
}

// Modal con <dialog>. Devuelve { el, close }.
export function modal(title, body, footer) {
  const dlg = h('dialog', { class: 'modal', 'aria-label': title });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('div', { class: 'modal-head' }, h('h2', {}, title),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null,
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); m.close(); } };
    const m = modal(title, h('p', {}, text), [
      h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Volver'),
      h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: () => finish(true) }, okLabel),
    ]);
    m.el.addEventListener('close', () => { if (!done) { done = true; resolve(false); } });
  });
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('p', {}, text), action || null);
}

export const STATUS = {
  booked: ['Reservada', 'badge-accent'],
  confirmed: ['Confirmada', ''],
  done: ['Atendida', 'badge-ok'],
  no_show: ['No llegó', 'badge-bad'],
  cancelled: ['Cancelada', ''],
};
export const statusBadge = (s) => h('span', { class: `badge ${STATUS[s]?.[1] || ''}` }, STATUS[s]?.[0] || s);
// Foto del barbero o sus iniciales sobre su color.
export function avatar(staff, size = 36) {
  const style = { width: `${size}px`, height: `${size}px` };
  if (staff.photo_url) return h('img', { class: 'avatar', src: staff.photo_url, alt: '', style, loading: 'lazy' });
  const initials = staff.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return h('span', { class: `avatar avatar-initials sc-${staff.color}`, 'aria-hidden': 'true', style }, initials);
}

// Reduce una imagen a un cuadrado JPEG para subirla liviana.
export function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('No pudimos leer esa imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

export const METHODS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', online: 'Pago online' };
