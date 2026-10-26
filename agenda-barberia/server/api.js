// Rutas de la API del panel (con sesión) y de la reserva pública.
import { randomBytes } from 'node:crypto';
import { uid, nowIso, HttpError } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearCookie, rateLimit, allow, setSessionBusiness,
} from './auth.js';
import { requireFeature, checkStaffLimit, has, planInfo, TRIAL_DAYS } from './plans.js';
import { checkoutUrl, portalUrl, verifySignature, handleEvent } from './billing.js';
import { str, int, bool, oneOf, email, phone, pick, slugify, parseCsv } from './validate.js';
import { isValidTz, isDate, dayRangeUtc, todayIn, addDays, zonedToUtc, localParts, weekdayOf, iso } from './time.js';
import {
  slotsFor, staffForServices, isBookable, pickStaff, withinPolicyWindow, hhmmToMin, minToHHMM, minutesFor, visitMinutes,
} from './availability.js';
import { scheduleForAppointment, dropPending, queue, waLink, money, baseUrl, fillTemplate } from './notify.js';
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
    const plan = ['free', 'barberia', 'cadena'].includes(body.plan) ? body.plan : 'barberia';
    const business = db.insert('businesses', {
      id: uid(), name: businessName, slug, timezone: tz, currency, phone_prefix: prefix,
      plan, plan_status: plan === 'free' ? 'active' : 'trialing', trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
    });
    const user = db.insert('users', { id: uid(), business_id: business.id, email: mail, name, password_hash: hashPassword(pw), role: 'owner' });
    db.insert('memberships', { user_id: user.id, business_id: business.id, role: 'owner' });
    if (body.demo !== false) seedBusiness(db, biz(db, business.id), { maxStaff: plan === 'free' ? 1 : 3 });
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

// Sin sesión responde 200 con user null: la app muestra el ingreso sin ensuciar la consola.
on('GET', '/api/me', ({ db, user }) => {
  if (!user) return { user: null };
  const { expires_at, ...u } = user;
  const b = biz(db, user.business_id);
  const branches = db.all(`select b.id, b.name, b.slug from memberships m join businesses b on b.id = m.business_id
                           where m.user_id = ? order by b.created_at`, user.id);
  return { user: u, business: b, plan: planInfo(db, b), branches };
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
    deposit_instructions: (v, k) => str(v, k, { max: 500 }),
    payment_link: (v, k) => {
      const u = str(v, k, { max: 300 });
      if (u && !/^https:\/\/[^\s]+$/.test(u)) throw new HttpError(400, 'El enlace de pago debe empezar con https://', { field: k });
      return u;
    },
    message_channel: (v, k) => oneOf(v, k, ['whatsapp', 'sms']),
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

const photoUrl = (s) => (s.photo ? `/photos/${s.id}?v=${s.photo.length}` : '');

function withStaffDetails(db, rows) {
  return rows.map(({ photo, ...s }) => ({
    ...s,
    photo_url: photoUrl({ ...s, photo }),
    hours: db.all('select weekday, start_min, end_min from staff_hours where staff_id = ? order by weekday, start_min', s.id)
      .map((h) => ({ weekday: h.weekday, start: minToHHMM(h.start_min), end: minToHHMM(h.end_min) })),
    service_ids: db.all('select service_id from staff_services where staff_id = ?', s.id).map((r) => r.service_id),
    durations: Object.fromEntries(db.all('select service_id, duration_min from staff_services where staff_id = ? and duration_min is not null', s.id)
      .map((r) => [r.service_id, r.duration_min])),
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
    // Duración propia del barbero por servicio (p. ej. corta en 20 en vez de 30). Vacío = la del servicio.
    const durations = body.service_durations && typeof body.service_durations === 'object' ? body.service_durations : {};
    db.run('delete from staff_services where staff_id = ?', staffId);
    for (const sid of new Set(body.service_ids)) {
      if (db.get('select 1 from services where id = ? and business_id = ?', sid, businessId)) {
        const d = durations[sid];
        db.insert('staff_services', {
          staff_id: staffId, service_id: sid,
          duration_min: d === undefined || d === null || d === '' ? null : int(d, 'service_durations', { min: 5, max: 480, label: 'la duración' }),
        });
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
  if (f.active !== 0) checkStaffLimit(db, biz(db, user.business_id));
  return db.tx(() => {
    const count = db.get('select count(*) n from staff where business_id = ?', user.business_id).n;
    const s = db.insert('staff', { id: uid(), business_id: user.business_id, color: `c${(count % 6) + 1}`, ...f });
    saveStaffExtras(db, user.business_id, s.id, body);
    return { status: 201, data: withStaffDetails(db, [db.get('select * from staff where id = ?', s.id)])[0] };
  });
});

on('PUT', '/api/staff/:id', ({ db, user, body, params }) => {
  allow(user, 'catalog');
  const current = owned(db, 'staff', params.id, user.business_id, 'Barbero');
  const f = pick(body, staffSpec);
  if (f.active === 1 && !current.active) checkStaffLimit(db, biz(db, user.business_id));
  return db.tx(() => {
    db.update('staff', params.id, user.business_id, f);
    saveStaffExtras(db, user.business_id, params.id, body);
    return withStaffDetails(db, [db.get('select * from staff where id = ?', params.id)])[0];
  });
});

on('PUT', '/api/staff/:id/photo', ({ db, user, body, params }) => {
  allow(user, 'catalog');
  owned(db, 'staff', params.id, user.business_id, 'Barbero');
  const data = String(body.data_url || '');
  if (data && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) {
    throw new HttpError(400, 'La foto debe ser JPG, PNG o WebP.', { field: 'photo' });
  }
  if (data.length > 400_000) throw new HttpError(413, 'La foto pesa demasiado (máximo ~300 KB).', { field: 'photo' });
  db.update('staff', params.id, user.business_id, { photo: data });
  return { photo_url: photoUrl({ id: params.id, photo: data }) };
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
  requireFeature(db, biz(db, user.business_id), 'roles');
  let staffId = null;
  if (role === 'barber') {
    staffId = owned(db, 'staff', body.staff_id, user.business_id, 'Barbero').id;
  }
  if (db.get('select 1 from users where email = ?', mail)) throw new HttpError(409, 'Ya existe un usuario con ese correo.', { field: 'email' });
  const u = db.insert('users', {
    id: uid(), business_id: user.business_id, email: mail, name: str(body.name, 'name', { max: 80 }),
    password_hash: hashPassword(pw), role, staff_id: staffId,
  });
  db.insert('memberships', { user_id: u.id, business_id: user.business_id, role, staff_id: staffId });
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
  return slotsFor(db, b, [service], query.date, query.staff_id || null, { now: 0 });
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
    const len = minutesFor(db, staff.id, service);
    const check = isBookable(db, b, staff, len, start, { checkHours: !body.force });
    if (!check.ok) throw conflict(check.reason);
    const price = body.price !== undefined && body.price !== '' ? int(body.price, 'price', { max: 1e10, label: 'el precio' }) : service.price;
    const appt = db.insert('appointments', {
      id: uid(), business_id: b.id, staff_id: staff.id, client_id: client.id, service_id: service.id,
      start_at: iso(start), end_at: iso(start + len * 60000),
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
    const len = minutesFor(db, staff.id, service);
    if (moved) {
      const check = isBookable(db, b, staff, len, start, { ignore: appt.id, checkHours: !body.force });
      if (!check.ok) throw conflict(check.reason);
    }
    const f = {
      staff_id: staff.id, service_id: service.id, start_at: iso(start),
      end_at: iso(start + len * 60000), updated_at: nowIso(),
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
        const len = (Date.parse(appt.end_at) - Date.parse(appt.start_at)) / 60000;
        const check = isBookable(db, ctx.business, ctx.staff, len, Date.parse(appt.start_at), { ignore: appt.id, checkHours: false });
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
    marketing_opt_out: bool,
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
  requireFeature(db, biz(db, user.business_id), 'inventario');
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
  requireFeature(db, biz(db, user.business_id), 'caja');
  const open = db.get('select * from cash_registers where business_id = ? and closed_at is null', user.business_id);
  const history = db.all('select * from cash_registers where business_id = ? and closed_at is not null order by opened_at desc limit 10', user.business_id);
  return { open: open ? registerSummary(db, open) : null, history };
});

on('POST', '/api/register/open', ({ db, user, body }) => {
  allow(user, 'operate');
  requireFeature(db, biz(db, user.business_id), 'caja');
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
  requireFeature(db, b, 'caja');
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
    // Anticipo ya recibido: se descuenta de lo que paga hoy (no entra a la caja).
    const prepaid = appt?.deposit_status === 'paid' ? Math.min(appt.deposit, net + tip) : 0;
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
      subtotal, discount, tip, tip_staff_id: tipStaff, prepaid, total: net + tip - prepaid, payment_method: method, created_by: user.id,
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
    if (appt) {
      // Una visita con varios servicios se cobra entera.
      const visit = appt.group_id ? db.all("select id from appointments where group_id = ? and status <> 'cancelled' and sale_id is null", appt.group_id) : [appt];
      for (const x of visit) db.update('appointments', x.id, b.id, { status: 'done', sale_id: sale.id, updated_at: nowIso() });
    }
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
    db.run("update appointments set sale_id = null, status = 'booked' where sale_id = ?", sale.id);
    db.run('delete from sales where id = ?', sale.id);
  });
  return { ok: true };
});

// ---------------------------------------------------------------- reportes

on('GET', '/api/reports/summary', ({ db, user, query }) => {
  allow(user, 'reports');
  const b = biz(db, user.business_id);
  requireFeature(db, b, 'reportes');
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
  requireFeature(db, b, 'comisiones');
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
    user.business_id, status, status).map((r) => ({
    ...r,
    wa_link: r.client_phone && r.channel === 'whatsapp' ? waLink(r.client_phone, r.body) : null,
    sms_link: r.client_phone && r.channel === 'sms' ? `sms:+${r.client_phone}?body=${encodeURIComponent(r.body)}` : null,
  }));
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
  requireFeature(db, b, 'waitlist');
  return db.all(`select w.*, c.name client_name, c.phone client_phone, s.name service_name, st.name staff_name from waitlist w
                 join clients c on c.id = w.client_id left join services s on s.id = w.service_id left join staff st on st.id = w.staff_id
                 where w.business_id = ? and w.day >= ? and w.status in ('waiting','notified') order by w.day, w.created_at`,
    b.id, todayIn(b.timezone)).map((w) => ({
    ...w,
    wa_link: waLink(w.client_phone, `Hola ${w.client_name.split(' ')[0]}, se liberó una hora en ${b.name}. Resérvala aquí antes que otro: ${baseUrl()}/b/${b.slug}`),
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

// Uno o varios servicios en una misma visita (máx. 4), en el orden pedido.
function publicServices(db, b, src) {
  let ids = src.service_ids ?? src.service_id;
  if (typeof ids === 'string') ids = ids.split(',');
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Elige al menos un servicio.', { field: 'service_ids' });
  if (ids.length > 4) throw new HttpError(400, 'Máximo 4 servicios por visita.', { field: 'service_ids' });
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Hay servicios repetidos.', { field: 'service_ids' });
  return ids.map((id) => publicService(db, b, String(id)));
}
const visitName = (services) => services.map((s) => s.name).join(' + ');

on('GET', '/api/public/:slug', ({ db, params }) => {
  const b = publicBiz(db, params.slug);
  const services = db.all(`select id, name, category, description, duration_min, price, deposit from services s
                           where business_id = ? and active = 1 and online = 1
                           and exists (select 1 from staff_services ss join staff st on st.id = ss.staff_id where ss.service_id = s.id and st.active = 1)
                           order by sort, name`, b.id);
  const staff = db.all('select id, name, specialty, color, photo from staff where business_id = ? and active = 1 order by sort, name', b.id)
    .map(({ photo, ...s }) => {
      const links = db.all('select service_id, duration_min from staff_services where staff_id = ?', s.id);
      return {
        ...s, photo_url: photoUrl({ ...s, photo }), service_ids: links.map((r) => r.service_id),
        durations: Object.fromEntries(links.filter((r) => r.duration_min).map((r) => [r.service_id, r.duration_min])),
      };
    });
  return { business: publicBusiness(b), services, staff, today: todayIn(b.timezone), waitlist: has(db, b, 'waitlist'), deposits: has(db, b, 'anticipos') };
});

on('GET', '/api/public/:slug/days', ({ db, params, query }) => {
  const b = publicBiz(db, params.slug);
  const services = publicServices(db, b, query);
  const today = todayIn(b.timezone);
  const start = isDate(query.from) && query.from >= today ? query.from : today;
  const out = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i);
    if (!withinPolicyWindow(b, date)) break;
    out.push({ date, available: slotsFor(db, b, services, date, query.staff_id || null, { enforcePolicy: true, ignore: groupIds(db, query.ignore) }).length > 0 });
  }
  return out;
});

on('GET', '/api/public/:slug/slots', ({ db, params, query }) => {
  const b = publicBiz(db, params.slug);
  const services = publicServices(db, b, query);
  if (!isDate(query.date) || !withinPolicyWindow(b, query.date)) return [];
  return slotsFor(db, b, services, query.date, query.staff_id || null, { enforcePolicy: true, ignore: groupIds(db, query.ignore) })
    .map(({ start, time, staff_ids }) => ({ start, time, staff_count: staff_ids.length }));
});

// Al reprogramar, la propia visita no cuenta como ocupada (se pasa su token).
function groupIds(db, tok) {
  if (!tok) return [];
  const a = db.get('select * from appointments where token = ?', String(tok));
  return a ? visitOf(db, a).map((x) => x.id) : [];
}

function bookPublic(db, b, services, body, ignore = []) {
  const start = Date.parse(body.start);
  if (!Number.isFinite(start)) throw new HttpError(400, 'Elige una hora.', { field: 'start' });
  const date = localParts(start, b.timezone).date;
  if (!withinPolicyWindow(b, date) || start < Date.now() + b.min_notice_min * 60000) {
    throw new HttpError(409, 'Esa hora ya no se puede reservar. Elige otra.', { reason: 'policy' });
  }
  let candidates = staffForServices(db, b.id, services.map((s) => s.id));
  if (body.staff_id && body.staff_id !== 'any') candidates = candidates.filter((s) => s.id === body.staff_id);
  const free = candidates.filter((s) => isBookable(db, b, s, visitMinutes(db, s.id, services), start, { ignore }).ok);
  if (!free.length) throw new HttpError(409, 'Alguien acaba de tomar esa hora. Elige otra, por favor.', { reason: 'taken' });
  return { start, staff: pickStaff(db, free, start, b.timezone) };
}

// Escribe los servicios uno tras otro con el mismo barbero. Devuelve las citas.
function writeVisit(db, b, staff, services, start, existing, extra) {
  let cursor = start;
  const out = [];
  services.forEach((sv, i) => {
    const len = minutesFor(db, staff.id, sv);
    const fields = { staff_id: staff.id, service_id: sv.id, start_at: iso(cursor), end_at: iso(cursor + len * 60000), status: 'booked', updated_at: nowIso() };
    if (existing) {
      db.update('appointments', existing[i].id, b.id, fields);
      out.push({ ...existing[i], ...fields });
    } else {
      const row = { id: uid(), business_id: b.id, ...fields, price: sv.price, token: token(), ...extra };
      if (services.length > 1) row.group_id = out[0]?.id ?? row.id;
      out.push(db.insert('appointments', row));
    }
    cursor += len * 60000;
  });
  return out;
}

// Mensajes de una visita: uno solo por visita, no uno por servicio.
function scheduleVisit(db, b, visit, services, staff, client) {
  scheduleForAppointment(db, { appt: visit[0], business: b, client, staff, service: { ...services[0], name: visitName(services) } });
}

on('POST', '/api/public/:slug/book', ({ db, params, body, ip }) => {
  rateLimit(`book:${ip}`, 12, 600000);
  const b = publicBiz(db, params.slug);
  const services = publicServices(db, b, body);
  const name = str(body.name, 'name', { required: true, max: 80, label: 'tu nombre' });
  const tel = phone(body.phone, b.phone_prefix, 'phone', { required: true });
  const mail = email(body.email);
  const notes = str(body.notes, 'notes', { max: 300 });
  return db.tx(() => {
    const { start, staff } = bookPublic(db, b, services, body);
    const client = findOrCreateClient(db, b, { name, phone: tel, email: mail });
    const visit = writeVisit(db, b, staff, services, start, null, { client_id: client.id, source: 'online', notes });
    // Anticipo: la suma de los anticipos de los servicios queda en la primera cita.
    const deposit = has(db, b, 'anticipos') ? services.reduce((x, sv) => x + sv.deposit, 0) : 0;
    if (deposit) db.update('appointments', visit[0].id, b.id, { deposit, deposit_status: 'pending' });
    scheduleVisit(db, b, visit, services, staff, client);
    db.run("update waitlist set status = 'booked' where client_id = ? and day = ? and status <> 'removed'", client.id, localParts(start, b.timezone).date);
    return { status: 201, data: { token: visit[0].token } };
  });
});

on('POST', '/api/public/:slug/waitlist', ({ db, params, body, ip }) => {
  rateLimit(`wait:${ip}`, 6, 600000);
  const b = publicBiz(db, params.slug);
  requireFeature(db, b, 'waitlist');
  const service = publicServices(db, b, body)[0];
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

// Todas las citas de la visita (una sola si no tiene grupo), en orden.
function visitOf(db, a) {
  return a.group_id
    ? db.all('select * from appointments where group_id = ? order by start_at', a.group_id)
    : [db.get('select * from appointments where id = ?', a.id)];
}

function publicAppt(db, tok) {
  const a = db.get(`${APPT_SELECT} where a.token = ?`, String(tok));
  if (!a) throw notFound('Reserva');
  const b = biz(db, a.business_id);
  const visit = visitOf(db, a).filter((x) => x.status !== 'cancelled' || a.status === 'cancelled');
  const first = visit[0] || a;
  const canChange = ['booked', 'confirmed'].includes(a.status) && Date.parse(first.start_at) - b.cancel_window_min * 60000 > Date.now();
  return { a, b, visit, canChange };
}

on('GET', '/api/public/r/:token', ({ db, params }) => {
  const { a, b, visit, canChange } = publicAppt(db, params.token);
  const services = visit.map((x) => db.get('select id, name from services where id = ?', x.service_id));
  const price = visit.reduce((s, x) => s + x.price, 0);
  return {
    business: publicBusiness(b),
    appointment: {
      start_at: visit[0].start_at, end_at: visit.at(-1).end_at, status: a.status,
      service_id: services[0].id, service_ids: services.map((s) => s.id), service_name: services.map((s) => s.name).join(' + '),
      staff_id: a.staff_id, staff_name: a.staff_name, client_name: a.client_name, price,
      price_text: money(price, b.currency),
      deposit: visit[0].deposit, deposit_status: visit[0].deposit_status, deposit_text: money(visit[0].deposit, b.currency),
    },
    deposit_instructions: b.deposit_instructions, payment_link: b.payment_link,
    can_change: canChange,
  };
});

on('POST', '/api/public/r/:token/cancel', ({ db, params, ip }) => {
  rateLimit(`manage:${ip}`, 20, 600000);
  const { a, visit, canChange } = publicAppt(db, params.token);
  if (!canChange) throw new HttpError(409, 'Ya no se puede cancelar en línea. Escríbele directo a la barbería.');
  db.tx(() => {
    for (const x of visit) {
      db.update('appointments', x.id, a.business_id, { status: 'cancelled', updated_at: nowIso() });
      dropPending(db, x.id);
    }
  });
  return { ok: true };
});

on('POST', '/api/public/r/:token/reschedule', ({ db, params, body, ip }) => {
  rateLimit(`manage:${ip}`, 20, 600000);
  const { a, b, visit, canChange } = publicAppt(db, params.token);
  if (!canChange) throw new HttpError(409, 'Ya no se puede cambiar en línea. Escríbele directo a la barbería.');
  const services = visit.map((x) => db.get('select * from services where id = ?', x.service_id));
  return db.tx(() => {
    const ids = visit.map((x) => x.id);
    const { start, staff } = bookPublic(db, b, services, { start: body.start, staff_id: body.staff_id || a.staff_id }, ids);
    const moved = writeVisit(db, b, staff, services, start, visit);
    ids.forEach((id) => dropPending(db, id));
    scheduleVisit(db, b, moved, services, staff, db.get('select * from clients where id = ?', a.client_id));
    return { ok: true };
  });
});

// ---------------------------------------------------------------- anticipos

on('POST', '/api/appointments/:id/deposit', ({ db, user, body, params }) => {
  allow(user, 'operate');
  const appt = owned(db, 'appointments', params.id, user.business_id, 'Cita');
  const first = appt.group_id ? db.get('select * from appointments where id = ?', appt.group_id) : appt;
  if (!first.deposit) throw new HttpError(409, 'Esta cita no pide anticipo.');
  db.update('appointments', first.id, user.business_id, { deposit_status: oneOf(body.status, 'status', ['pending', 'paid']), updated_at: nowIso() });
  return db.get(`${APPT_SELECT} where a.id = ?`, appt.id);
});

// ---------------------------------------------------------------- campañas

// Clientes de un segmento con forma de contacto y sin baja de marketing.
function segmentClients(db, b, q) {
  const segment = oneOf(q.segment || 'all', 'segment', ['all', 'inactive', 'birthday', 'tag']);
  const params = [b.id];
  let where = "c.business_id = ? and c.marketing_opt_out = 0 and (c.phone <> '' or c.email <> '')";
  if (segment === 'inactive') {
    const days = int(q.days ?? 45, 'days', { min: 7, max: 730, label: 'los días' });
    where += ` and exists (select 1 from appointments a where a.client_id = c.id and a.status = 'done')
               and not exists (select 1 from appointments a where a.client_id = c.id and a.status in ('done','booked','confirmed') and a.start_at > ?)`;
    params.push(new Date(Date.now() - days * 86400000).toISOString());
  } else if (segment === 'birthday') {
    where += ' and substr(c.birthday, 1, 2) = ?';
    params.push(todayIn(b.timezone).slice(5, 7));
  } else if (segment === 'tag') {
    const tag = str(q.tag, 'tag', { required: true, max: 40, label: 'la etiqueta' }).toLowerCase();
    where += " and (',' || replace(lower(c.tags), ' ', '') || ',') like ?";
    params.push(`%,${tag.replace(/\s/g, '').replace(/[%_]/g, '')},%`);
  }
  return db.all(`select c.* from clients c where ${where} order by c.name limit 1000`, ...params);
}

on('GET', '/api/campaigns/preview', ({ db, user, query }) => {
  allow(user, 'settings');
  const b = biz(db, user.business_id);
  requireFeature(db, b, 'campanas');
  const list = segmentClients(db, b, query);
  return { count: list.length, sample: list.slice(0, 5).map((c) => c.name) };
});

on('POST', '/api/campaigns', ({ db, user, body }) => {
  allow(user, 'settings');
  const b = biz(db, user.business_id);
  requireFeature(db, b, 'campanas');
  const text = str(body.text, 'text', { required: true, max: 700, label: 'el mensaje' });
  const list = segmentClients(db, b, body);
  if (!list.length) throw new HttpError(409, 'Ningún cliente cumple ese filtro.');
  let queued = 0;
  db.tx(() => {
    for (const client of list) if (queue(db, 'campaign', { business: b, client }, Date.now(), fillTemplate(text, b, client))) queued++;
  });
  return { status: 201, data: { queued } };
});

// ---------------------------------------------------------------- sucursales

on('POST', '/api/branches', ({ db, user, body }) => {
  allow(user, 'settings');
  const current = biz(db, user.business_id);
  requireFeature(db, current, 'sucursales');
  const main = current.owner_business_id ? biz(db, current.owner_business_id) : current;
  const name = str(body.name, 'name', { required: true, max: 80, label: 'el nombre de la sucursal' });
  return db.tx(() => {
    let slug = slugify(name);
    for (let i = 2; db.get('select 1 from businesses where slug = ?', slug); i++) slug = `${slugify(name)}-${i}`;
    const b = db.insert('businesses', {
      id: uid(), name, slug, timezone: main.timezone, currency: main.currency, phone_prefix: main.phone_prefix,
      owner_business_id: main.id, plan: main.plan, plan_status: main.plan_status,
    });
    db.insert('memberships', { user_id: user.id, business_id: b.id, role: 'owner' });
    return { status: 201, data: biz(db, b.id) };
  });
});

on('POST', '/api/branches/switch', ({ db, user, body, sessionToken }) => {
  allow(user, 'agenda');
  if (!db.get('select 1 from memberships where user_id = ? and business_id = ?', user.id, String(body.business_id))) {
    throw new HttpError(404, 'Sucursal no encontrada.');
  }
  setSessionBusiness(db, sessionToken, body.business_id);
  return { ok: true };
});

// ---------------------------------------------------------------- suscripción

on('GET', '/api/billing', ({ db, user }) => {
  allow(user, 'settings');
  return planInfo(db, biz(db, user.business_id));
});

on('POST', '/api/billing/checkout', async ({ db, user, body }) => {
  allow(user, 'settings');
  const b = biz(db, user.business_id);
  if (b.owner_business_id) throw new HttpError(409, 'La suscripción se maneja desde el negocio principal.');
  const plan = oneOf(body.plan, 'plan', ['barberia', 'cadena']);
  const interval = oneOf(body.interval || 'month', 'interval', ['month', 'year']);
  return { url: await checkoutUrl(b, user, plan, interval, baseUrl()) };
});

on('POST', '/api/billing/portal', async ({ db, user }) => {
  allow(user, 'settings');
  const b = biz(db, user.business_id);
  return { url: await portalUrl(b.owner_business_id ? biz(db, b.owner_business_id) : b, baseUrl()) };
});

// Webhook de Stripe: firma verificada, procesado una sola vez.
on('POST', '/api/billing/webhook', ({ db, raw, headers }) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Webhook no configurado.');
  if (!verifySignature(raw, headers['stripe-signature'], secret)) throw new HttpError(400, 'Firma no válida.');
  return { received: handleEvent(db, JSON.parse(raw)) };
});
