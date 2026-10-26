// Rutas de la API del panel (con sesión) y de la reserva pública.
import { randomBytes } from 'node:crypto';
import { uid, nowIso, HttpError } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearCookie, rateLimit, allow,
} from './auth.js';
import { str, int, bool, oneOf, email, phone, pick, slugify, parseCsv } from './validate.js';
import { isValidTz, isDate, dayRangeUtc, todayIn, addDays, zonedToUtc, localParts, weekdayOf, iso } from './time.js';
import {
  slotsFor, staffForService, isBookable, pickStaff, withinPolicyWindow, hhmmToMin, minToHHMM,
} from './availability.js';
import { scheduleForAppointment, dropPending, queue, waLink, money } from './notify.js';
import { seedBusiness } from './seed.js';

const token = () => randomBytes(18).toString('base64url');
const routes = [];
const on = (method, path, handler) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

export function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const notFound = (what = 'Registro') => new HttpError(404, `${what} no encontrado.`);
const biz = (db, id) => db.get('select * from businesses where id = ?', id);
const owned = (db, table, id, businessId, what) => {
  const row = db.get(`select * from ${table} where id = ? and business_id = ?`, id, businessId);
  if (!row) throw notFound(what);
  return row;
};
const range = (q, tz) => {
  const today = todayIn(tz);
  const from = isDate(q.from) ? q.from : today;
  const to = isDate(q.to) ? q.to : from;
  if (to < from) throw new HttpError(400, 'El rango de fechas está invertido.');
  if (addDays(from, 370) < to) throw new HttpError(400, 'El rango máximo es de un año.');
  return { from, to, utc: dayRangeUtc(from, to, tz) };
};

// Inicio de una cita a partir de { start } ISO o { date, time } locales.
function startFrom(body, tz) {
  if (body.start) {
    const ms = Date.parse(body.start);
    if (!Number.isFinite(ms)) throw new HttpError(400, 'Hora de inicio no válida.', { field: 'start' });
    return ms;
  }
  const m = hhmmToMin(body.time);
  if (!isDate(body.date) || m === null) throw new HttpError(400, 'Indica fecha y hora.', { field: 'time' });
  return zonedToUtc(body.date, m, tz);
}

function publicBusiness(b) {
  const { id, name, slug, timezone, currency, phone: tel, address, instagram, min_notice_min, cancel_window_min, max_days_ahead } = b;
  return { id, name, slug, timezone, currency, phone: tel, address, instagram, min_notice_min, cancel_window_min, max_days_ahead };
}

function findOrCreateClient(db, business, { name, phone: tel, email: mail }) {
  if (tel) {
    const c = db.get('select * from clients where business_id = ? and phone = ?', business.id, tel);
    if (c) {
      const fix = {};
      if (!c.email && mail) fix.email = mail;
      if (name && c.name !== name && c.name === 'Cliente') fix.name = name;
      if (Object.keys(fix).length) db.update('clients', c.id, business.id, fix);
      return { ...c, ...fix };
    }
  }
  return db.insert('clients', { id: uid(), business_id: business.id, name: name || 'Cliente', phone: tel, email: mail || '' });
}

function apptContext(db, appt) {
  return {
    appt,
    business: biz(db, appt.business_id),
    client: db.get('select * from clients where id = ?', appt.client_id),
    service: db.get('select * from services where id = ?', appt.service_id),
    staff: db.get('select * from staff where id = ?', appt.staff_id),
  };
}

const conflict = (reason) => new HttpError(409, reason === 'outside_hours'
  ? 'Esa hora está fuera del horario del barbero.'
  : 'Esa hora ya está ocupada. Elige otra.', { reason });

// ---------------------------------------------------------------- auth

on('POST', '/api/auth/signup', ({ db, body, ip, setCookie, secure }) => {
  rateLimit(`signup:${ip}`, 10, 3600000);
  const businessName = str(body.business_name, 'business_name', { required: true, max: 80, label: 'el nombre de la barbería' });
  const name = str(body.name, 'name', { required: true, max: 80, label: 'tu nombre' });
  const mail = email(body.email, 'email', { required: true });
  const pw = str(body.password, 'password', { required: true, max: 200, label: 'la contraseña' });
  if (pw.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', { field: 'password' });
  const tz = body.timezone && isValidTz(body.timezone) ? body.timezone : 'America/Santiago';
  const currency = /^[A-Z]{3}$/.test(body.currency || '') ? body.currency : 'CLP';
  const prefix = /^\d{1,4}$/.test(body.phone_prefix || '') ? body.phone_prefix : '56';
  if (db.get('select 1 from users where email = ?', mail)) throw new HttpError(409, 'Ya existe una cuenta con ese correo.', { field: 'email' });
  return db.tx(() => {
    let slug = slugify(businessName);
    for (let i = 2; db.get('select 1 from businesses where slug = ?', slug); i++) slug = `${slugify(businessName)}-${i}`;
    const business = db.insert('businesses', { id: uid(), name: businessName, slug, timezone: tz, currency, phone_prefix: prefix });
    const user = db.insert('users', { id: uid(), business_id: business.id, email: mail, name, password_hash: hashPassword(pw), role: 'owner' });
    if (body.demo !== false) seedBusiness(db, biz(db, business.id));
    const s = createSession(db, user.id);
    setCookie(sessionCookie(s.token, s.expires, secure));
    return { status: 201, data: { user: { id: user.id, name, email: mail, role: 'owner' }, business: biz(db, business.id) } };
  });
});

on('POST', '/api/auth/login', ({ db, body, ip, setCookie, secure }) => {
  const mail = email(body.email, 'email', { required: true });
  rateLimit(`login:${ip}:${mail}`, 8, 900000);
  const u = db.get('select * from users where email = ?', mail);
  if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  const s = createSession(db, u.id);
  setCookie(sessionCookie(s.token, s.expires, secure));
  return { user: { id: u.id, name: u.name, email: u.email, role: u.role, staff_id: u.staff_id } };
});

on('POST', '/api/auth/logout', ({ db, sessionToken, setCookie }) => {
  destroySession(db, sessionToken);
  setCookie(clearCookie());
  return { ok: true };
});

on('GET', '/api/me', ({ db, user }) => {
  allow(user, 'agenda');
  const { expires_at, ...u } = user;
  return { user: u, business: biz(db, user.business_id) };
});

// ---------------------------------------------------------------- negocio

on('PUT', '/api/business', ({ db, user, body }) => {
  allow(user, 'settings');
  const f = pick(body, {
    name: (v, k) => str(v, k, { required: true, max: 80, label: 'el nombre' }),
    slug: (v, k) => {
      const s = slugify(str(v, k, { required: true, max: 40, label: 'el enlace' }));
      if (db.get('select 1 from businesses where slug = ? and id <> ?', s, user.business_id)) {
        throw new HttpError(409, 'Ese enlace ya lo usa otra barbería.', { field: 'slug' });
      }
      return s;
    },
    timezone: (v, k) => { if (!isValidTz(v)) throw new HttpError(400, 'Zona horaria no válida.', { field: k }); return v; },
    currency: (v, k) => { if (!/^[A-Z]{3}$/.test(v)) throw new HttpError(400, 'Moneda no válida.', { field: k }); return v; },
    phone_prefix: (v, k) => { if (!/^\d{1,4}$/.test(String(v))) throw new HttpError(400, 'Código de país no válido.', { field: k }); return String(v); },
    phone: (v, k) => str(v, k, { max: 30 }),
    address: (v, k) => str(v, k, { max: 160 }),
    instagram: (v, k) => str(v, k, { max: 60 }).replace(/^@/, ''),
    slot_step_min: (v, k) => oneOf(int(v, k), k, [5, 10, 15, 20, 30, 60]),
    min_notice_min: (v, k) => int(v, k, { max: 10080 }),
    max_days_ahead: (v, k) => int(v, k, { min: 1, max: 365 }),
    cancel_window_min: (v, k) => int(v, k, { max: 10080 }),
    reminder_hours: (v, k) => int(v, k, { min: 1, max: 72 }),
    rebook_days: (v, k) => int(v, k, { min: 7, max: 120 }),
  });
  db.update('businesses', user.business_id, null, { ...f, updated_at: nowIso() });
  return biz(db, user.business_id);
});

// ---------------------------------------------------------------- servicios

const serviceSpec = {
  name: (v, k) => str(v, k, { required: true, max: 80, label: 'el nombre' }),
  category: (v, k) => str(v, k, { max: 40 }),
  description: (v, k) => str(v, k, { max: 300 }),
  duration_min: (v, k) => int(v, k, { min: 5, max: 480, label: 'la duración' }),
  buffer_min: (v, k) => int(v, k, { max: 120, label: 'el tiempo extra' }),
  price: (v, k) => int(v, k, { max: 1e10, label: 'el precio' }),
  deposit: (v, k) => int(v, k, { max: 1e10, label: 'el anticipo' }),
  online: bool, active: bool,
  sort: (v, k) => int(v, k, { max: 1000 }),
};

on('GET', '/api/services', ({ db, user }) => {
  allow(user, 'agenda');
  return db.all(`select s.*, (select count(*) from staff_services ss join staff st on st.id = ss.staff_id
                  where ss.service_id = s.id and st.active = 1) staff_count
                 from services s where business_id = ? order by active desc, sort, name`, user.business_id);
});

on('POST', '/api/services', ({ db, user, body }) => {
  allow(user, 'catalog');
  const f = pick(body, serviceSpec);
  if (!f.name || f.duration_min === undefined || f.price === undefined) throw new HttpError(400, 'Nombre, duración y precio son obligatorios.');
  return db.tx(() => {
    const s = db.insert('services', { id: uid(), business_id: user.business_id, ...f });
    // Por defecto lo hacen todos los barberos activos; se ajusta en Equipo.
    for (const st of db.all('select id from staff where business_id = ? and active = 1', user.business_id)) {
      db.insert('staff_services', { staff_id: st.id, service_id: s.id });
    }
    return { status: 201, data: db.get('select * from services where id = ?', s.id) };
  });
});

on('PUT', '/api/services/:id', ({ db, user, body, params }) => {
  allow(user, 'catalog');
  owned(db, 'services', params.id, user.business_id, 'Servicio');
  db.update('services', params.id, user.business_id, pick(body, serviceSpec));
  return db.get('select * from services where id = ?', params.id);
});

on('DELETE', '/api/services/:id', ({ db, user, params }) => {
  allow(user, 'catalog');
  owned(db, 'services', params.id, user.business_id, 'Servicio');
  const used = db.get('select 1 from appointments where service_id = ? limit 1', params.id);
  if (used) db.update('services', params.id, user.business_id, { active: 0, online: 0 });
  else db.run('delete from services where id = ? and business_id = ?', params.id, user.business_id);
  return { ok: true, archived: !!used };
});

// ---------------------------------------------------------------- equipo

const staffSpec = {
  name: (v, k) => str(v, k, { required: true, max: 80, label: 'el nombre' }),
  specialty: (v, k) => str(v, k, { max: 80 }),
  color: (v, k) => oneOf(v, k, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']),
  phone: (v, k) => str(v, k, { max: 30 }),
  active: bool,
  commission_service_pct: (v, k) => int(v, k, { max: 100, label: 'la comisión de servicios' }),
  commission_product_pct: (v, k) => int(v, k, { max: 100, label: 'la comisión de productos' }),
  sort: (v, k) => int(v, k, { max: 1000 }),
};

function withStaffDetails(db, rows) {
  return rows.map((s) => ({
    ...s,
    hours: db.all('select weekday, start_min, end_min from staff_hours where staff_id = ? order by weekday, start_min', s.id)
      .map((h) => ({ weekday: h.weekday, start: minToHHMM(h.start_min), end: minToHHMM(h.end_min) })),
    service_ids: db.all('select service_id from staff_services where staff_id = ?', s.id).map((r) => r.service_id),
  }));
}

function saveStaffExtras(db, businessId, staffId, body) {
  if (Array.isArray(body.hours)) {
    const hours = body.hours.slice(0, 50).map((h, i) => {
      const weekday = int(h.weekday, `hours.${i}.weekday`, { max: 6 });
      const start = hhmmToMin(h.start), end = hhmmToMin(h.end);
      if (start === null || end === null || end <= start) throw new HttpError(400, 'Revisa el horario: el término debe ser después del inicio.', { field: 'hours' });
      return { weekday, start, end };
    });
    for (const a of hours) {
      if (hours.some((b) => b !== a && b.weekday === a.weekday && a.start < b.end && a.end > b.start)) {
        throw new HttpError(400, 'Hay franjas que se cruzan el mismo día.', { field: 'hours' });
      }
    }
    db.run('delete from staff_hours where staff_id = ?', staffId);
    for (const h of hours) db.insert('staff_hours', { id: uid(), staff_id: staffId, weekday: h.weekday, start_min: h.start, end_min: h.end });
  }
  if (Array.isArray(body.service_ids)) {
    db.run('delete from staff_services where staff_id = ?', staffId);
    for (const sid of new Set(body.service_ids)) {
      if (db.get('select 1 from services where id = ? and business_id = ?', sid, businessId)) {
        db.insert('staff_services', { staff_id: staffId, service_id: sid });
      }
    }
  }
}

on('GET', '/api/staff', ({ db, user }) => {
  allow(user, 'agenda');
  return withStaffDetails(db, db.all('select * from staff where business_id = ? order by active desc, sort, name', user.business_id));
});

on('POST', '/api/staff', ({ db, user, body }) => {
  allow(user, 'catalog');
  const f = pick(body, staffSpec);
  if (!f.name) throw new HttpError(400, 'Falta el nombre.', { field: 'name' });
  return db.tx(() => {
    const count = db.get('select count(*) n from staff where business_id = ?', user.business_id).n;
    const s = db.insert('staff', { id: uid(), business_id: user.business_id, color: `c${(count % 6) + 1}`, ...f });
    saveStaffExtras(db, user.business_id, s.id, body);
    return { status: 201, data: withStaffDetails(db, [db.get('select * from staff where id = ?', s.id)])[0] };
  });
});

on('PUT', '/api/staff/:id', ({ db, user, body, params }) => {
  allow(user, 'catalog');
  owned(db, 'staff', params.id, user.business_id, 'Barbero');
  return db.tx(() => {
    db.update('staff', params.id, user.business_id, pick(body, staffSpec));
    saveStaffExtras(db, user.business_id, params.id, body);
    return withStaffDetails(db, [db.get('select * from staff where id = ?', params.id)])[0];
  });
});

on('DELETE', '/api/staff/:id', ({ db, user, params }) => {
  allow(user, 'catalog');
  owned(db, 'staff', params.id, user.business_id, 'Barbero');
  const future = db.get("select count(*) n from appointments where staff_id = ? and start_at > ? and status in ('booked','confirmed')", params.id, nowIso()).n;
  if (future) throw new HttpError(409, `Tiene ${future} cita(s) futuras. Muévelas o cancélalas antes de darlo de baja.`);
  db.update('staff', params.id, user.business_id, { active: 0 });
  return { ok: true };
});

on('GET', '/api/time-off', ({ db, user, query }) => {
  allow(user, 'agenda');
  const b = biz(db, user.business_id);
  const { utc } = range(query, b.timezone);
  return db.all('select * from time_off where business_id = ? and end_at > ? and start_at < ? order by start_at', user.business_id, utc[0], utc[1]);
});

on('POST', '/api/staff/:id/time-off', ({ db, user, body, params }) => {
  allow(user, 'operate');
  owned(db, 'staff', params.id, user.business_id, 'Barbero');
  const b = biz(db, user.business_id);
  if (!isDate(body.date)) throw new HttpError(400, 'Indica la fecha.', { field: 'date' });
  const s = hhmmToMin(body.start ?? '00:00'), e = hhmmToMin(body.end ?? '24:00');
  if (s === null || e === null || e <= s) throw new HttpError(400, 'Revisa las horas del bloqueo.', { field: 'end' });
  const endDate = isDate(body.end_date) && body.end_date >= body.date ? body.end_date : body.date;
  const row = db.insert('time_off', {
    id: uid(), business_id: user.business_id, staff_id: params.id,
    start_at: iso(zonedToUtc(body.date, s, b.timezone)), end_at: iso(zonedToUtc(endDate, e, b.timezone)),
    reason: str(body.reason, 'reason', { max: 120 }),
  });
  return { status: 201, data: row };
});

on('DELETE', '/api/time-off/:id', ({ db, user, params }) => {
  allow(user, 'operate');
  owned(db, 'time_off', params.id, user.business_id, 'Bloqueo');
  db.run('delete from time_off where id = ? and business_id = ?', params.id, user.business_id);
  return { ok: true };
});

// ---------------------------------------------------------------- usuarios

on('GET', '/api/users', ({ db, user }) => {
  allow(user, 'users');
  return db.all('select id, email, name, role, staff_id, created_at from users where business_id = ? order by created_at', user.business_id);
});

on('POST', '/api/users', ({ db, user, body }) => {
  allow(user, 'users');
  const mail = email(body.email, 'email', { required: true });
  const pw = str(body.password, 'password', { required: true, label: 'la contraseña' });
  if (pw.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.', { field: 'password' });
  const role = oneOf(body.role, 'role', ['owner', 'reception', 'barber']);
  let staffId = null;
  if (role === 'barber') {
    staffId = owned(db, 'staff', body.staff_id, user.business_id, 'Barbero').id;
  }
  if (db.get('select 1 from users where email = ?', mail)) throw new HttpError(409, 'Ya existe un usuario con ese correo.', { field: 'email' });
  const u = db.insert('users', {
    id: uid(), business_id: user.business_id, email: mail, name: str(body.name, 'name', { max: 80 }),
    password_hash: hashPassword(pw), role, staff_id: staffId,
  });
  return { status: 201, data: { id: u.id, email: u.email, name: u.name, role, staff_id: staffId } };
});

on('DELETE', '/api/users/:id', ({ db, user, params }) => {
  allow(user, 'users');
  if (params.id === user.id) throw new HttpError(400, 'No puedes eliminar tu propio usuario.');
  owned(db, 'users', params.id, user.business_id, 'Usuario');
  db.run('delete from users where id = ? and business_id = ?', params.id, user.business_id);
  return { ok: true };
});

// ---------------------------------------------------------------- agenda

const APPT_SELECT = `select a.*, c.name client_name, c.phone client_phone, s.name service_name, s.duration_min,
  st.name staff_name, st.color staff_color
  from appointments a join clients c on c.id = a.client_id join services s on s.id = a.service_id join staff st on st.id = a.staff_id`;

on('GET', '/api/appointments', ({ db, user, query }) => {
  allow(user, 'agenda');
  const b = biz(db, user.business_id);
  const { utc } = range(query, b.timezone);
  const staffId = user.role === 'barber' ? user.staff_id : query.staff_id || null;
  return db.all(`${APPT_SELECT} where a.business_id = ? and a.start_at >= ? and a.start_at < ?
                 and (? is null or a.staff_id = ?) order by a.start_at`,
    user.business_id, utc[0], utc[1], staffId, staffId);
});

on('GET', '/api/availability', ({ db, user, query }) => {
  allow(user, 'agenda');
  const b = biz(db, user.business_id);
  const service = owned(db, 'services', query.service_id, user.business_id, 'Servicio');
  if (!isDate(query.date)) throw new HttpError(400, 'Fecha no válida.');
  return slotsFor(db, b, service, query.date, query.staff_id || null, { now: 0 });
});

on('POST', '/api/appointments', ({ db, user, body }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  const staff = owned(db, 'staff', body.staff_id, user.business_id, 'Barbero');
  const service = owned(db, 'services', body.service_id, user.business_id, 'Servicio');
  const source = body.source === 'walkin' ? 'walkin' : 'panel';
  const start = source === 'walkin' && !body.start && !body.time ? Math.ceil(Date.now() / 60000) * 60000 : startFrom(body, b.timezone);
  return db.tx(() => {
    let client;
    if (body.client_id) client = owned(db, 'clients', body.client_id, user.business_id, 'Cliente');
    else {
      const c = body.client || {};
      client = findOrCreateClient(db, b, {
        name: str(c.name, 'client.name', { required: true, max: 80, label: 'el nombre del cliente' }),
        phone: phone(c.phone, b.phone_prefix, 'client.phone'),
        email: email(c.email, 'client.email'),
      });
    }
    const check = isBookable(db, b, staff, service, start, { checkHours: !body.force });
    if (!check.ok) throw conflict(check.reason);
    const price = body.price !== undefined && body.price !== '' ? int(body.price, 'price', { max: 1e10, label: 'el precio' }) : service.price;
    const appt = db.insert('appointments', {
      id: uid(), business_id: b.id, staff_id: staff.id, client_id: client.id, service_id: service.id,
      start_at: iso(start), end_at: iso(start + (service.duration_min + service.buffer_min) * 60000),
      status: 'booked', source, price, notes: str(body.notes, 'notes', { max: 500 }), token: token(),
    });
    if (source !== 'walkin' && body.notify !== false) scheduleForAppointment(db, { appt, business: b, client, service, staff });
    return { status: 201, data: db.get(`${APPT_SELECT} where a.id = ?`, appt.id) };
  });
});

on('PUT', '/api/appointments/:id', ({ db, user, body, params }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  const appt = owned(db, 'appointments', params.id, user.business_id, 'Cita');
  if (['cancelled', 'done'].includes(appt.status) && (body.start || body.time || body.staff_id)) {
    throw new HttpError(409, 'No se puede mover una cita cancelada o ya atendida.');
  }
  const staff = owned(db, 'staff', body.staff_id || appt.staff_id, user.business_id, 'Barbero');
  const service = owned(db, 'services', body.service_id || appt.service_id, user.business_id, 'Servicio');
  const start = body.start || body.time ? startFrom(body, b.timezone) : Date.parse(appt.start_at);
  return db.tx(() => {
    const moved = start !== Date.parse(appt.start_at) || staff.id !== appt.staff_id || service.id !== appt.service_id;
    if (moved) {
      const check = isBookable(db, b, staff, service, start, { ignoreAppointmentId: appt.id, checkHours: !body.force });
      if (!check.ok) throw conflict(check.reason);
    }
    const f = {
      staff_id: staff.id, service_id: service.id, start_at: iso(start),
      end_at: iso(start + (service.duration_min + service.buffer_min) * 60000), updated_at: nowIso(),
    };
    if (body.notes !== undefined) f.notes = str(body.notes, 'notes', { max: 500 });
    if (body.price !== undefined && body.price !== '') f.price = int(body.price, 'price', { max: 1e10 });
    else if (service.id !== appt.service_id) f.price = service.price;
    db.update('appointments', appt.id, b.id, f);
    const fresh = db.get('select * from appointments where id = ?', appt.id);
    if (moved && start !== Date.parse(appt.start_at)) {
      dropPending(db, appt.id);
      if (body.notify !== false && fresh.source !== 'walkin') scheduleForAppointment(db, apptContext(db, fresh));
    }
    return db.get(`${APPT_SELECT} where a.id = ?`, appt.id);
  });
});

on('POST', '/api/appointments/:id/status', ({ db, user, body, params }) => {
  allow(user, 'agenda');
  const appt = owned(db, 'appointments', params.id, user.business_id, 'Cita');
  if (user.role === 'barber' && appt.staff_id !== user.staff_id) throw new HttpError(403, 'Solo puedes cambiar tus propias citas.');
  const status = oneOf(body.status, 'status', ['booked', 'confirmed', 'done', 'no_show', 'cancelled']);
  if (appt.sale_id && status !== 'done') throw new HttpError(409, 'La cita ya está cobrada. Anula la venta antes de cambiar el estado.');
  return db.tx(() => {
    if (status === 'booked' || status === 'confirmed') {
      if (['cancelled', 'no_show'].includes(appt.status)) {
        const ctx = apptContext(db, appt);
        const check = isBookable(db, ctx.business, ctx.staff, ctx.service, Date.parse(appt.start_at), { ignoreAppointmentId: appt.id, checkHours: false });
        if (!check.ok) throw conflict(check.reason);
      }
    }
    db.update('appointments', appt.id, user.business_id, { status, updated_at: nowIso() });
    if (status === 'cancelled' || status === 'no_show') dropPending(db, appt.id);
    if (status === 'cancelled' && body.notify && appt.status !== 'cancelled') {
      queue(db, 'cancelled', apptContext(db, { ...appt, status }), Date.now());
    }
    return db.get(`${APPT_SELECT} where a.id = ?`, appt.id);
  });
});

// ---------------------------------------------------------------- clientes

const CLIENT_STATS = `(select max(start_at) from appointments a where a.client_id = c.id and a.status = 'done') last_visit,
  (select count(*) from appointments a where a.client_id = c.id and a.status = 'done') visits,
  (select coalesce(sum(total),0) from sales s where s.client_id = c.id) spent`;

on('GET', '/api/clients', ({ db, user, query }) => {
  allow(user, 'agenda');
  const q = str(query.q, 'q', { max: 80 });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const digits = q.replace(/\D/g, '');
  return db.all(`select c.*, ${CLIENT_STATS} from clients c where c.business_id = ?
                 and (? = '' or c.name like ? or c.email like ? or (? <> '' and c.phone like ?))
                 order by c.name limit 100`,
    user.business_id, q, like, like, digits, `%${digits}%`);
});

on('POST', '/api/clients', ({ db, user, body }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  const f = {
    name: str(body.name, 'name', { required: true, max: 80, label: 'el nombre' }),
    phone: phone(body.phone, b.phone_prefix),
    email: email(body.email),
    notes: str(body.notes, 'notes', { max: 1000 }),
    tags: str(body.tags, 'tags', { max: 200 }),
    birthday: /^\d{2}-\d{2}$/.test(body.birthday || '') ? body.birthday : '',
  };
  if (f.phone) {
    const dup = db.get('select id from clients where business_id = ? and phone = ?', b.id, f.phone);
    if (dup) throw new HttpError(409, 'Ya hay un cliente con ese teléfono.', { field: 'phone', id: dup.id });
  }
  return { status: 201, data: db.insert('clients', { id: uid(), business_id: b.id, ...f }) };
});

on('GET', '/api/clients/:id', ({ db, user, params }) => {
  allow(user, 'agenda');
  owned(db, 'clients', params.id, user.business_id, 'Cliente');
  const client = db.get(`select c.*, ${CLIENT_STATS} from clients c where c.id = ?`, params.id);
  const appointments = db.all(`${APPT_SELECT} where a.client_id = ? order by a.start_at desc limit 100`, params.id);
  const done = appointments.filter((a) => a.status === 'done').map((a) => Date.parse(a.start_at)).sort((x, y) => x - y);
  let avg_interval_days = null;
  if (done.length > 1) avg_interval_days = Math.round((done.at(-1) - done[0]) / 86400000 / (done.length - 1));
  const no_shows = appointments.filter((a) => a.status === 'no_show').length;
  return { ...client, appointments, avg_interval_days, no_shows };
});

on('PUT', '/api/clients/:id', ({ db, user, body, params }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  owned(db, 'clients', params.id, b.id, 'Cliente');
  const f = pick(body, {
    name: (v, k) => str(v, k, { required: true, max: 80, label: 'el nombre' }),
    phone: (v, k) => phone(v, b.phone_prefix, k),
    email: (v, k) => email(v, k),
    notes: (v, k) => str(v, k, { max: 1000 }),
    tags: (v, k) => str(v, k, { max: 200 }),
    birthday: (v) => (/^\d{2}-\d{2}$/.test(v || '') ? v : ''),
  });
  if (f.phone && db.get('select 1 from clients where business_id = ? and phone = ? and id <> ?', b.id, f.phone, params.id)) {
    throw new HttpError(409, 'Otro cliente ya tiene ese teléfono.', { field: 'phone' });
  }
  db.update('clients', params.id, b.id, f);
  return db.get('select * from clients where id = ?', params.id);
});

// Borrado de datos personales: se anonimiza para no romper el historial de ventas.
on('DELETE', '/api/clients/:id', ({ db, user, params }) => {
  allow(user, 'settings');
  owned(db, 'clients', params.id, user.business_id, 'Cliente');
  db.tx(() => {
    db.run('delete from reminders where client_id = ?', params.id);
    db.run('delete from waitlist where client_id = ?', params.id);
    db.update('clients', params.id, user.business_id, { name: 'Cliente eliminado', phone: '', email: '', notes: '', tags: '', birthday: '' });
  });
  return { ok: true };
});

on('POST', '/api/clients/import', ({ db, user, body }) => {
  allow(user, 'settings');
  const b = biz(db, user.business_id);
  const rows = parseCsv(str(body.csv, 'csv', { required: true, max: 1_000_000, label: 'el archivo' }));
  if (!rows.length) throw new HttpError(400, 'El archivo está vacío.');
  const head = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
  const col = (names) => head.findIndex((h) => names.includes(h));
  let iName = col(['nombre', 'name', 'cliente']), iPhone = col(['telefono', 'phone', 'celular', 'movil', 'whatsapp']), iMail = col(['email', 'correo', 'mail']);
  let data = rows.slice(1);
  if (iName < 0) { iName = 0; iPhone = 1; iMail = 2; data = rows; }
  let imported = 0, skipped = 0;
  const errors = [];
  db.tx(() => {
    data.slice(0, 5000).forEach((r, n) => {
      try {
        const name = str(r[iName], 'name', { max: 80 });
        if (!name) { skipped++; return; }
        const tel = iPhone >= 0 ? phone(r[iPhone] || '', b.phone_prefix) : '';
        const mail = iMail >= 0 ? email(r[iMail] || '') : '';
        if (tel && db.get('select 1 from clients where business_id = ? and phone = ?', b.id, tel)) { skipped++; return; }
        db.insert('clients', { id: uid(), business_id: b.id, name, phone: tel, email: mail });
        imported++;
      } catch (e) {
        skipped++;
        if (errors.length < 10) errors.push(`Fila ${n + 2}: ${e.message}`);
      }
    });
  });
  return { imported, skipped, errors };
});

// ---------------------------------------------------------------- productos

const productSpec = {
  name: (v, k) => str(v, k, { required: true, max: 80, label: 'el nombre' }),
  sku: (v, k) => str(v, k, { max: 40 }),
  price: (v, k) => int(v, k, { max: 1e10, label: 'el precio' }),
  cost: (v, k) => int(v, k, { max: 1e10, label: 'el costo' }),
  stock: (v, k) => int(v, k, { min: -100000, max: 1e7, label: 'el stock' }),
  low_stock_at: (v, k) => int(v, k, { max: 1e6 }),
  active: bool,
};

on('GET', '/api/products', ({ db, user }) => {
  allow(user, 'agenda');
  return db.all('select * from products where business_id = ? order by active desc, name', user.business_id);
});

on('POST', '/api/products', ({ db, user, body }) => {
  allow(user, 'catalog');
  const f = pick(body, productSpec);
  if (!f.name || f.price === undefined) throw new HttpError(400, 'Nombre y precio son obligatorios.');
  return { status: 201, data: db.insert('products', { id: uid(), business_id: user.business_id, ...f }) };
});

on('PUT', '/api/products/:id', ({ db, user, body, params }) => {
  allow(user, 'operate');
  owned(db, 'products', params.id, user.business_id, 'Producto');
  // Recepción solo ajusta stock; el resto lo cambia el dueño.
  const spec = user.role === 'owner' ? productSpec : { stock: productSpec.stock };
  db.update('products', params.id, user.business_id, pick(body, spec));
  return db.get('select * from products where id = ?', params.id);
});

// ---------------------------------------------------------------- caja

function registerSummary(db, reg) {
  const by = db.all(`select payment_method, count(*) n, sum(total) total, sum(tip) tips from sales
                     where register_id = ? group by payment_method`, reg.id);
  const cash = by.find((r) => r.payment_method === 'cash')?.total || 0;
  return { ...reg, by_method: by, expected_cash: reg.opening_amount + cash, sales_total: by.reduce((s, r) => s + r.total, 0) };
}

on('GET', '/api/register', ({ db, user }) => {
  allow(user, 'operate');
  const open = db.get('select * from cash_registers where business_id = ? and closed_at is null', user.business_id);
  const history = db.all('select * from cash_registers where business_id = ? and closed_at is not null order by opened_at desc limit 10', user.business_id);
  return { open: open ? registerSummary(db, open) : null, history };
});

on('POST', '/api/register/open', ({ db, user, body }) => {
  allow(user, 'operate');
  if (db.get('select 1 from cash_registers where business_id = ? and closed_at is null', user.business_id)) {
    throw new HttpError(409, 'La caja ya está abierta.');
  }
  const reg = db.insert('cash_registers', {
    id: uid(), business_id: user.business_id, opened_by: user.id, opened_at: nowIso(),
    opening_amount: int(body.amount ?? 0, 'amount', { max: 1e10, label: 'el fondo inicial' }),
  });
  return { status: 201, data: registerSummary(db, reg) };
});

on('POST', '/api/register/close', ({ db, user, body }) => {
  allow(user, 'operate');
  const open = db.get('select * from cash_registers where business_id = ? and closed_at is null', user.business_id);
  if (!open) throw new HttpError(409, 'No hay una caja abierta.');
  const sum = registerSummary(db, open);
  const counted = int(body.counted, 'counted', { max: 1e10, label: 'el efectivo contado' });
  db.update('cash_registers', open.id, user.business_id, {
    closed_at: nowIso(), counted_amount: counted, expected_amount: sum.expected_cash, notes: str(body.notes, 'notes', { max: 300 }),
  });
  return { ...registerSummary(db, db.get('select * from cash_registers where id = ?', open.id)), difference: counted - sum.expected_cash };
});

// ---------------------------------------------------------------- ventas

on('POST', '/api/sales', ({ db, user, body }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  const method = oneOf(body.payment_method, 'payment_method', ['cash', 'card', 'transfer', 'online']);
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Agrega al menos un servicio o producto.');
  if (body.items.length > 50) throw new HttpError(400, 'Máximo 50 líneas por venta.');
  return db.tx(() => {
    const appt = body.appointment_id ? owned(db, 'appointments', body.appointment_id, b.id, 'Cita') : null;
    if (appt?.sale_id) throw new HttpError(409, 'Esta cita ya fue cobrada.');
    if (appt?.status === 'cancelled') throw new HttpError(409, 'No se puede cobrar una cita cancelada.');
    const register = db.get('select * from cash_registers where business_id = ? and closed_at is null', b.id);
    if (method === 'cash' && !register) throw new HttpError(409, 'Abre la caja para recibir efectivo.');
    const lines = body.items.map((it, i) => {
      const kind = oneOf(it.kind, `items.${i}.kind`, ['service', 'product']);
      const qty = int(it.qty ?? 1, `items.${i}.qty`, { min: 1, max: 999, label: 'la cantidad' });
      const ref = owned(db, kind === 'service' ? 'services' : 'products', it.ref_id, b.id, kind === 'service' ? 'Servicio' : 'Producto');
      const staffId = it.staff_id ? owned(db, 'staff', it.staff_id, b.id, 'Barbero').id : (appt?.staff_id ?? null);
      let unit = kind === 'service' && appt && appt.service_id === ref.id ? appt.price : ref.price;
      if (it.unit_price !== undefined && it.unit_price !== '') unit = int(it.unit_price, `items.${i}.unit_price`, { max: 1e10, label: 'el precio' });
      if (kind === 'product' && ref.stock < qty) throw new HttpError(409, `No hay stock suficiente de ${ref.name} (quedan ${ref.stock}).`);
      return { kind, ref, qty, unit, staffId, gross: unit * qty };
    });
    const subtotal = lines.reduce((s, l) => s + l.gross, 0);
    const discount = int(body.discount ?? 0, 'discount', { max: subtotal, label: 'el descuento' });
    const tip = int(body.tip ?? 0, 'tip', { max: 1e10, label: 'la propina' });
    const net = subtotal - discount;
    // Prorratear el descuento para que la comisión salga de lo realmente cobrado.
    let assigned = 0;
    lines.forEach((l, i) => {
      l.lineTotal = i === lines.length - 1 ? net - assigned : (subtotal ? Math.round((l.gross * net) / subtotal) : 0);
      assigned += l.lineTotal;
    });
    const clientId = appt?.client_id ?? (body.client_id ? owned(db, 'clients', body.client_id, b.id, 'Cliente').id : null);
    const tipStaff = tip ? (body.tip_staff_id ? owned(db, 'staff', body.tip_staff_id, b.id, 'Barbero').id : appt?.staff_id ?? lines.find((l) => l.staffId)?.staffId ?? null) : null;
    const sale = db.insert('sales', {
      id: uid(), business_id: b.id, register_id: register?.id ?? null, client_id: clientId, appointment_id: appt?.id ?? null,
      subtotal, discount, tip, tip_staff_id: tipStaff, total: net + tip, payment_method: method, created_by: user.id,
    });
    for (const l of lines) {
      const st = l.staffId ? db.get('select * from staff where id = ?', l.staffId) : null;
      const pct = st ? (l.kind === 'service' ? st.commission_service_pct : st.commission_product_pct) : 0;
      db.insert('sale_items', {
        id: uid(), sale_id: sale.id, kind: l.kind, ref_id: l.ref.id, name: l.ref.name, staff_id: l.staffId, qty: l.qty,
        unit_price: l.unit, line_total: l.lineTotal, commission_pct: pct, commission_amount: Math.round((l.lineTotal * pct) / 100),
      });
      if (l.kind === 'product') db.run('update products set stock = stock - ? where id = ?', l.qty, l.ref.id);
    }
    if (appt) db.update('appointments', appt.id, b.id, { status: 'done', sale_id: sale.id, updated_at: nowIso() });
    return { status: 201, data: saleWithItems(db, sale.id) };
  });
});

function saleWithItems(db, id) {
  const sale = db.get(`select s.*, c.name client_name from sales s left join clients c on c.id = s.client_id where s.id = ?`, id);
  return { ...sale, items: db.all('select * from sale_items where sale_id = ?', id) };
}

on('GET', '/api/sales', ({ db, user, query }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  const { utc } = range(query, b.timezone);
  return db.all('select id from sales where business_id = ? and created_at >= ? and created_at < ? order by created_at desc limit 500',
    b.id, utc[0], utc[1]).map((r) => saleWithItems(db, r.id));
});

on('DELETE', '/api/sales/:id', ({ db, user, params }) => {
  allow(user, 'settings');
  const sale = owned(db, 'sales', params.id, user.business_id, 'Venta');
  if (sale.register_id && db.get('select closed_at from cash_registers where id = ?', sale.register_id)?.closed_at) {
    throw new HttpError(409, 'La caja de esta venta ya se cerró; no se puede anular.');
  }
  db.tx(() => {
    for (const it of db.all("select * from sale_items where sale_id = ? and kind = 'product'", sale.id)) {
      db.run('update products set stock = stock + ? where id = ?', it.qty, it.ref_id);
    }
    if (sale.appointment_id) db.run("update appointments set sale_id = null, status = 'booked' where id = ?", sale.appointment_id);
    db.run('delete from sales where id = ?', sale.id);
  });
  return { ok: true };
});

// ---------------------------------------------------------------- reportes

on('GET', '/api/reports/summary', ({ db, user, query }) => {
  allow(user, 'reports');
  const b = biz(db, user.business_id);
  const { from, to, utc } = range(query, b.timezone);
  const [a, z] = utc;
  const totals = db.get(`select coalesce(sum(total),0) total, coalesce(sum(tip),0) tips, coalesce(sum(discount),0) discounts, count(*) n
                        from sales where business_id = ? and created_at >= ? and created_at < ?`, b.id, a, z);
  const byKind = db.all(`select i.kind, coalesce(sum(i.line_total),0) total from sale_items i join sales s on s.id = i.sale_id
                         where s.business_id = ? and s.created_at >= ? and s.created_at < ? group by i.kind`, b.id, a, z);
  const status = db.all(`select status, count(*) n from appointments where business_id = ? and start_at >= ? and start_at < ? group by status`, b.id, a, z);
  const statusMap = Object.fromEntries(status.map((r) => [r.status, r.n]));
  const totalAppts = status.reduce((s, r) => s + r.n, 0);
  const topServices = db.all(`select s.name, count(*) n, coalesce(sum(a.price),0) revenue from appointments a join services s on s.id = a.service_id
                              where a.business_id = ? and a.start_at >= ? and a.start_at < ? and a.status in ('booked','confirmed','done')
                              group by s.id order by n desc limit 6`, b.id, a, z);
  const byStaff = db.all(`select st.id, st.name, st.color,
      (select count(*) from appointments x where x.staff_id = st.id and x.start_at >= ? and x.start_at < ? and x.status = 'done') done,
      (select coalesce(sum(i.line_total),0) from sale_items i join sales s on s.id = i.sale_id where i.staff_id = st.id and s.created_at >= ? and s.created_at < ?) revenue,
      (select coalesce(sum((julianday(x.end_at) - julianday(x.start_at)) * 1440),0) from appointments x
         where x.staff_id = st.id and x.start_at >= ? and x.start_at < ? and x.status in ('booked','confirmed','done')) booked_min
    from staff st where st.business_id = ? and st.active = 1 order by st.sort, st.name`, a, z, a, z, a, z, b.id);
  // Ocupación = minutos reservados / minutos del horario semanal (sin restar bloqueos).
  let days = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) days++;
  for (const st of byStaff) {
    let avail = 0;
    const hours = db.all('select weekday, start_min, end_min from staff_hours where staff_id = ?', st.id);
    for (let d = from, i = 0; i < days; d = addDays(d, 1), i++) {
      const wd = weekdayOf(d);
      avail += hours.filter((h) => h.weekday === wd).reduce((s, h) => s + h.end_min - h.start_min, 0);
    }
    st.available_min = avail;
    st.occupancy = avail ? Math.min(100, Math.round((st.booked_min / avail) * 100)) : 0;
    st.booked_min = Math.round(st.booked_min);
  }
  const bookedAll = byStaff.reduce((s, x) => s + x.booked_min, 0);
  const availAll = byStaff.reduce((s, x) => s + x.available_min, 0);
  const clientsSeen = db.all(`select distinct client_id from appointments where business_id = ? and start_at >= ? and start_at < ? and status in ('booked','confirmed','done')`, b.id, a, z);
  let newClients = 0;
  for (const { client_id } of clientsSeen) {
    if (!db.get(`select 1 from appointments where client_id = ? and start_at < ? and status = 'done' limit 1`, client_id, a)) newClients++;
  }
  const daily = db.all(`select created_at, total from sales where business_id = ? and created_at >= ? and created_at < ?`, b.id, a, z);
  const series = {};
  for (let d = from, i = 0; i < Math.min(days, 92); d = addDays(d, 1), i++) series[d] = 0;
  for (const s of daily) {
    const d = localParts(s.created_at, b.timezone).date;
    if (d in series) series[d] += s.total;
  }
  const online = db.get(`select count(*) n from appointments where business_id = ? and start_at >= ? and start_at < ? and source = 'online'`, b.id, a, z).n;
  const lowStock = db.all('select id, name, stock, low_stock_at from products where business_id = ? and active = 1 and stock <= low_stock_at order by stock', b.id);
  return {
    from, to, currency: b.currency,
    revenue: totals.total, tips: totals.tips, discounts: totals.discounts, sales: totals.n,
    services_revenue: byKind.find((r) => r.kind === 'service')?.total || 0,
    products_revenue: byKind.find((r) => r.kind === 'product')?.total || 0,
    avg_ticket: totals.n ? Math.round(totals.total / totals.n) : 0,
    appointments: totalAppts, by_status: statusMap,
    no_show_rate: totalAppts ? Math.round(((statusMap.no_show || 0) / totalAppts) * 100) : 0,
    online_share: totalAppts ? Math.round((online / totalAppts) * 100) : 0,
    occupancy: availAll ? Math.min(100, Math.round((bookedAll / availAll) * 100)) : 0,
    clients: clientsSeen.length, new_clients: newClients, returning_clients: clientsSeen.length - newClients,
    top_services: topServices, by_staff: byStaff,
    series: Object.entries(series).map(([date, total]) => ({ date, total })),
    low_stock: lowStock,
  };
});

on('GET', '/api/reports/commissions', ({ db, user, query }) => {
  allow(user, 'reports');
  const b = biz(db, user.business_id);
  const { from, to, utc } = range(query, b.timezone);
  const rows = db.all(`select st.id, st.name, st.commission_service_pct, st.commission_product_pct,
      coalesce(sum(case when i.kind = 'service' then i.line_total end),0) services_total,
      coalesce(sum(case when i.kind = 'service' then i.commission_amount end),0) services_commission,
      coalesce(sum(case when i.kind = 'product' then i.line_total end),0) products_total,
      coalesce(sum(case when i.kind = 'product' then i.commission_amount end),0) products_commission,
      count(case when i.kind = 'service' then 1 end) services_count
    from staff st
    left join sale_items i on i.staff_id = st.id
      and i.sale_id in (select id from sales where business_id = ? and created_at >= ? and created_at < ?)
    where st.business_id = ?
    group by st.id order by st.sort, st.name`, b.id, utc[0], utc[1], b.id);
  for (const r of rows) {
    r.tips = db.get('select coalesce(sum(tip),0) t from sales where tip_staff_id = ? and created_at >= ? and created_at < ?', r.id, utc[0], utc[1]).t;
    r.total_to_pay = r.services_commission + r.products_commission + r.tips;
  }
  return { from, to, currency: b.currency, rows };
});

// ---------------------------------------------------------------- mensajes y lista de espera

on('GET', '/api/reminders', ({ db, user, query }) => {
  allow(user, 'operate');
  const status = ['pending', 'sent', 'manual', 'failed', 'skipped'].includes(query.status) ? query.status : null;
  return db.all(`select r.*, c.name client_name, c.phone client_phone, c.email client_email from reminders r
                 left join clients c on c.id = r.client_id
                 where r.business_id = ? and (? is null or r.status = ?) order by r.send_at desc limit 200`,
    user.business_id, status, status).map((r) => ({ ...r, wa_link: r.client_phone ? waLink(r.client_phone, r.body) : null }));
});

on('POST', '/api/reminders/:id/sent', ({ db, user, params }) => {
  allow(user, 'operate');
  owned(db, 'reminders', params.id, user.business_id, 'Mensaje');
  db.run("update reminders set status = 'sent', sent_at = ? where id = ?", nowIso(), params.id);
  return { ok: true };
});

on('POST', '/api/reminders/:id/retry', ({ db, user, params }) => {
  allow(user, 'operate');
  owned(db, 'reminders', params.id, user.business_id, 'Mensaje');
  db.run("update reminders set status = 'pending', attempts = 0, error = '', send_at = ? where id = ?", nowIso(), params.id);
  return { ok: true };
});

on('GET', '/api/waitlist', ({ db, user }) => {
  allow(user, 'operate');
  const b = biz(db, user.business_id);
  return db.all(`select w.*, c.name client_name, c.phone client_phone, s.name service_name, st.name staff_name from waitlist w
                 join clients c on c.id = w.client_id left join services s on s.id = w.service_id left join staff st on st.id = w.staff_id
                 where w.business_id = ? and w.day >= ? and w.status in ('waiting','notified') order by w.day, w.created_at`,
    b.id, todayIn(b.timezone)).map((w) => ({
    ...w,
    wa_link: waLink(w.client_phone, `Hola ${w.client_name.split(' ')[0]}, se liberó una hora en ${b.name}. Resérvala aquí antes que otro: ${process.env.PUBLIC_URL || ''}/b/${b.slug}`),
  }));
});

on('POST', '/api/waitlist/:id/status', ({ db, user, body, params }) => {
  allow(user, 'operate');
  owned(db, 'waitlist', params.id, user.business_id, 'Registro');
  db.update('waitlist', params.id, user.business_id, { status: oneOf(body.status, 'status', ['waiting', 'notified', 'booked', 'removed']) });
  return { ok: true };
});

// ---------------------------------------------------------------- público

function publicBiz(db, slug) {
  const b = db.get('select * from businesses where slug = ?', String(slug).toLowerCase());
  if (!b) throw notFound('Barbería');
  return b;
}

function publicService(db, b, id) {
  const s = db.get('select * from services where id = ? and business_id = ? and active = 1 and online = 1', id, b.id);
  if (!s) throw notFound('Servicio');
  return s;
}

on('GET', '/api/public/:slug', ({ db, params }) => {
  const b = publicBiz(db, params.slug);
  const services = db.all(`select id, name, category, description, duration_min, price, deposit from services s
                           where business_id = ? and active = 1 and online = 1
                           and exists (select 1 from staff_services ss join staff st on st.id = ss.staff_id where ss.service_id = s.id and st.active = 1)
                           order by sort, name`, b.id);
  const staff = db.all('select id, name, specialty, color from staff where business_id = ? and active = 1 order by sort, name', b.id)
    .map((s) => ({ ...s, service_ids: db.all('select service_id from staff_services where staff_id = ?', s.id).map((r) => r.service_id) }));
  return { business: publicBusiness(b), services, staff, today: todayIn(b.timezone) };
});

on('GET', '/api/public/:slug/days', ({ db, params, query }) => {
  const b = publicBiz(db, params.slug);
  const service = publicService(db, b, query.service_id);
  const today = todayIn(b.timezone);
  const start = isDate(query.from) && query.from >= today ? query.from : today;
  const out = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i);
    if (!withinPolicyWindow(b, date)) break;
    out.push({ date, available: slotsFor(db, b, service, date, query.staff_id || null, { enforcePolicy: true }).length > 0 });
  }
  return out;
});

on('GET', '/api/public/:slug/slots', ({ db, params, query }) => {
  const b = publicBiz(db, params.slug);
  const service = publicService(db, b, query.service_id);
  if (!isDate(query.date) || !withinPolicyWindow(b, query.date)) return [];
  return slotsFor(db, b, service, query.date, query.staff_id || null, { enforcePolicy: true })
    .map(({ start, time, staff_ids }) => ({ start, time, staff_count: staff_ids.length }));
});

function bookPublic(db, b, service, body, ignoreAppointmentId) {
  const start = Date.parse(body.start);
  if (!Number.isFinite(start)) throw new HttpError(400, 'Elige una hora.', { field: 'start' });
  const date = localParts(start, b.timezone).date;
  if (!withinPolicyWindow(b, date) || start < Date.now() + b.min_notice_min * 60000) {
    throw new HttpError(409, 'Esa hora ya no se puede reservar. Elige otra.', { reason: 'policy' });
  }
  let candidates = staffForService(db, b.id, service.id);
  if (body.staff_id && body.staff_id !== 'any') candidates = candidates.filter((s) => s.id === body.staff_id);
  const free = candidates.filter((s) => isBookable(db, b, s, service, start, { ignoreAppointmentId }).ok);
  if (!free.length) throw new HttpError(409, 'Alguien acaba de tomar esa hora. Elige otra, por favor.', { reason: 'taken' });
  return { start, staff: pickStaff(db, b, free, start, b.timezone) };
}

on('POST', '/api/public/:slug/book', ({ db, params, body, ip }) => {
  rateLimit(`book:${ip}`, 12, 600000);
  const b = publicBiz(db, params.slug);
  const service = publicService(db, b, body.service_id);
  const name = str(body.name, 'name', { required: true, max: 80, label: 'tu nombre' });
  const tel = phone(body.phone, b.phone_prefix, 'phone', { required: true });
  const mail = email(body.email);
  const notes = str(body.notes, 'notes', { max: 300 });
  return db.tx(() => {
    const { start, staff } = bookPublic(db, b, service, body);
    const client = findOrCreateClient(db, b, { name, phone: tel, email: mail });
    const appt = db.insert('appointments', {
      id: uid(), business_id: b.id, staff_id: staff.id, client_id: client.id, service_id: service.id,
      start_at: iso(start), end_at: iso(start + (service.duration_min + service.buffer_min) * 60000),
      status: 'booked', source: 'online', price: service.price, notes, token: token(),
    });
    scheduleForAppointment(db, { appt, business: b, client, service, staff });
    db.run("update waitlist set status = 'booked' where client_id = ? and day = ? and status <> 'removed'", client.id, localParts(start, b.timezone).date);
    return { status: 201, data: { token: appt.token } };
  });
});

on('POST', '/api/public/:slug/waitlist', ({ db, params, body, ip }) => {
  rateLimit(`wait:${ip}`, 6, 600000);
  const b = publicBiz(db, params.slug);
  const service = publicService(db, b, body.service_id);
  if (!isDate(body.day) || !withinPolicyWindow(b, body.day)) throw new HttpError(400, 'Fecha no válida.', { field: 'day' });
  const staffId = body.staff_id && body.staff_id !== 'any' ? owned(db, 'staff', body.staff_id, b.id, 'Barbero').id : null;
  const client = findOrCreateClient(db, b, {
    name: str(body.name, 'name', { required: true, max: 80, label: 'tu nombre' }),
    phone: phone(body.phone, b.phone_prefix, 'phone', { required: true }),
  });
  if (!db.get("select 1 from waitlist where client_id = ? and day = ? and status = 'waiting'", client.id, body.day)) {
    db.insert('waitlist', { id: uid(), business_id: b.id, client_id: client.id, service_id: service.id, staff_id: staffId, day: body.day });
  }
  return { status: 201, data: { ok: true } };
});

function publicAppt(db, tok) {
  const a = db.get(`${APPT_SELECT} where a.token = ?`, String(tok));
  if (!a) throw notFound('Reserva');
  const b = biz(db, a.business_id);
  const canChange = ['booked', 'confirmed'].includes(a.status) && Date.parse(a.start_at) - b.cancel_window_min * 60000 > Date.now();
  return { a, b, canChange };
}

on('GET', '/api/public/r/:token', ({ db, params }) => {
  const { a, b, canChange } = publicAppt(db, params.token);
  return {
    business: publicBusiness(b),
    appointment: {
      start_at: a.start_at, end_at: a.end_at, status: a.status, service_id: a.service_id, service_name: a.service_name,
      staff_id: a.staff_id, staff_name: a.staff_name, client_name: a.client_name, price: a.price,
      price_text: money(a.price, b.currency),
    },
    can_change: canChange,
  };
});

on('POST', '/api/public/r/:token/cancel', ({ db, params, ip }) => {
  rateLimit(`manage:${ip}`, 20, 600000);
  const { a, canChange } = publicAppt(db, params.token);
  if (!canChange) throw new HttpError(409, 'Ya no se puede cancelar en línea. Escríbele directo a la barbería.');
  db.tx(() => {
    db.update('appointments', a.id, a.business_id, { status: 'cancelled', updated_at: nowIso() });
    dropPending(db, a.id);
  });
  return { ok: true };
});

on('POST', '/api/public/r/:token/reschedule', ({ db, params, body, ip }) => {
  rateLimit(`manage:${ip}`, 20, 600000);
  const { a, b, canChange } = publicAppt(db, params.token);
  if (!canChange) throw new HttpError(409, 'Ya no se puede cambiar en línea. Escríbele directo a la barbería.');
  const service = db.get('select * from services where id = ?', a.service_id);
  return db.tx(() => {
    const { start, staff } = bookPublic(db, b, service, { start: body.start, staff_id: body.staff_id || a.staff_id }, a.id);
    db.update('appointments', a.id, b.id, {
      staff_id: staff.id, start_at: iso(start), end_at: iso(start + (service.duration_min + service.buffer_min) * 60000),
      status: 'booked', updated_at: nowIso(),
    });
    dropPending(db, a.id);
    scheduleForAppointment(db, apptContext(db, db.get('select * from appointments where id = ?', a.id)));
    return { ok: true };
  });
});
