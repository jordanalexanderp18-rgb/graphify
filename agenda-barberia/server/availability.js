// Motor de disponibilidad: qué horas puede tomar una visita (uno o varios
// servicios seguidos) con un barbero. Cada barbero puede tener su propia
// duración para un servicio (staff_services.duration_min).
import { zonedToUtc, weekdayOf, localParts, addDays, todayIn, iso } from './time.js';

const ACTIVE = "status in ('booked','confirmed','done')";

// Barberos activos que hacen todos los servicios pedidos.
export function staffForServices(db, businessId, serviceIds) {
  const ids = [...new Set(serviceIds)];
  return db.all(
    `select s.* from staff s where s.business_id = ? and s.active = 1
       and (select count(*) from staff_services ss where ss.staff_id = s.id
            and ss.service_id in (${ids.map(() => '?').join(',')})) = ?
     order by s.sort, s.name`,
    businessId, ...ids, ids.length);
}
export const staffForService = (db, businessId, serviceId) => staffForServices(db, businessId, [serviceId]);

// Minutos que ocupa un servicio con un barbero (incluye el tiempo extra).
export function minutesFor(db, staffId, service) {
  const o = db.get('select duration_min from staff_services where staff_id = ? and service_id = ?', staffId, service.id);
  return (o?.duration_min ?? service.duration_min) + service.buffer_min;
}
export const visitMinutes = (db, staffId, services) => services.reduce((s, sv) => s + minutesFor(db, staffId, sv), 0);

// Intervalos ocupados [ms, ms) de un barbero que tocan [fromMs, toMs).
export function busyIntervals(db, staffId, fromMs, toMs, ignore = []) {
  const skip = Array.isArray(ignore) ? ignore : [ignore];
  const a = db.all(
    `select id, start_at, end_at from appointments
     where staff_id = ? and ${ACTIVE} and end_at > ? and start_at < ?`,
    staffId, iso(fromMs), iso(toMs)).filter((r) => !skip.includes(r.id));
  const t = db.all(
    'select start_at, end_at from time_off where staff_id = ? and end_at > ? and start_at < ?',
    staffId, iso(fromMs), iso(toMs));
  return [...a, ...t].map((r) => [Date.parse(r.start_at), Date.parse(r.end_at)]);
}

export function hoursFor(db, staffId, weekday) {
  return db.all('select start_min, end_min from staff_hours where staff_id = ? and weekday = ? order by start_min',
    staffId, weekday);
}

const overlaps = (s, e, list) => list.some(([bs, be]) => s < be && e > bs);

// Horas libres de un barbero en una fecha local para una visita de lenMin
// minutos. Devuelve ms UTC de inicio. opts.enforcePolicy aplica la
// anticipación mínima (reserva pública).
export function staffSlots(db, business, staff, lenMin, date, opts = {}) {
  const tz = business.timezone;
  const len = lenMin * 60000;
  const ranges = hoursFor(db, staff.id, weekdayOf(date));
  if (!ranges.length) return [];
  const dayStart = zonedToUtc(date, 0, tz);
  const dayEnd = zonedToUtc(addDays(date, 1), 0, tz);
  const busy = busyIntervals(db, staff.id, dayStart, dayEnd + len, opts.ignore);
  const now = opts.now ?? Date.now();
  const earliest = opts.enforcePolicy ? now + business.min_notice_min * 60000 : now;
  const out = [];
  for (const { start_min, end_min } of ranges) {
    for (let m = start_min; m + lenMin <= end_min; m += business.slot_step_min) {
      const s = zonedToUtc(date, m, tz);
      if (s < earliest) continue;
      if (overlaps(s, s + len, busy)) continue;
      out.push(s);
    }
  }
  return out;
}

export function withinPolicyWindow(business, date) {
  const today = todayIn(business.timezone);
  return date >= today && date <= addDays(today, business.max_days_ahead);
}

// Huecos para "cualquier barbero" o uno puntual. [{ start, time, staff_ids }]
export function slotsFor(db, business, services, date, staffId, opts = {}) {
  const team = staffForServices(db, business.id, services.map((s) => s.id)).filter((s) => !staffId || s.id === staffId);
  const byStart = new Map();
  for (const st of team) {
    for (const s of staffSlots(db, business, st, visitMinutes(db, st.id, services), date, opts)) {
      if (!byStart.has(s)) byStart.set(s, []);
      byStart.get(s).push(st.id);
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staff_ids]) => ({
    start: iso(start), time: minToHHMM(localParts(start, business.timezone).min), staff_ids,
  }));
}

// ¿Puede este barbero tomar [start, start+lenMin) ? Revisa horario y solapamientos.
export function isBookable(db, business, staff, lenMin, startMs, { ignore, checkHours = true } = {}) {
  const len = lenMin * 60000;
  if (checkHours) {
    const lp = localParts(startMs, business.timezone);
    const endMin = lp.min + lenMin;
    const fits = hoursFor(db, staff.id, lp.weekday).some((r) => lp.min >= r.start_min && endMin <= r.end_min);
    if (!fits) return { ok: false, reason: 'outside_hours' };
  }
  const busy = busyIntervals(db, staff.id, startMs, startMs + len, ignore);
  if (overlaps(startMs, startMs + len, busy)) return { ok: false, reason: 'overlap' };
  return { ok: true };
}

// Para "cualquiera": el barbero libre con menos citas ese día (reparte la carga).
export function pickStaff(db, candidates, startMs, tz) {
  if (candidates.length < 2) return candidates[0];
  const date = localParts(startMs, tz).date;
  const from = iso(zonedToUtc(date, 0, tz));
  const to = iso(zonedToUtc(addDays(date, 1), 0, tz));
  const load = (id) => db.get(
    `select count(*) n from appointments where staff_id = ? and ${ACTIVE} and start_at >= ? and start_at < ?`,
    id, from, to).n;
  return [...candidates].sort((a, b) => load(a.id) - load(b.id))[0];
}

export const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v <= 1440 ? v : null;
};
