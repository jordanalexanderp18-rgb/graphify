// Motor de disponibilidad: qué horas puede tomar un servicio con un barbero.
import { zonedToUtc, weekdayOf, localParts, addDays, todayIn, iso } from './time.js';

const ACTIVE = "status in ('booked','confirmed','done')";

export function staffForService(db, businessId, serviceId) {
  return db.all(
    `select s.* from staff s join staff_services ss on ss.staff_id = s.id
     where s.business_id = ? and ss.service_id = ? and s.active = 1 order by s.sort, s.name`,
    businessId, serviceId);
}

// Intervalos ocupados [ms, ms) de un barbero que tocan [fromMs, toMs).
export function busyIntervals(db, staffId, fromMs, toMs, ignoreAppointmentId = '') {
  const a = db.all(
    `select start_at, end_at from appointments
     where staff_id = ? and ${ACTIVE} and end_at > ? and start_at < ? and id <> ?`,
    staffId, iso(fromMs), iso(toMs), ignoreAppointmentId);
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

// Horas libres de un barbero en una fecha local. Devuelve ms UTC de inicio.
// opts.enforcePolicy aplica anticipación mínima y días máximos (reserva pública).
export function staffSlots(db, business, staff, service, date, opts = {}) {
  const tz = business.timezone;
  const len = (service.duration_min + service.buffer_min) * 60000;
  const step = business.slot_step_min;
  const ranges = hoursFor(db, staff.id, weekdayOf(date));
  if (!ranges.length) return [];
  const dayStart = zonedToUtc(date, 0, tz);
  const dayEnd = zonedToUtc(addDays(date, 1), 0, tz);
  const busy = busyIntervals(db, staff.id, dayStart, dayEnd + len, opts.ignoreAppointmentId);
  const now = opts.now ?? Date.now();
  const earliest = opts.enforcePolicy ? now + business.min_notice_min * 60000 : now;
  const out = [];
  for (const { start_min, end_min } of ranges) {
    for (let m = start_min; m + service.duration_min + service.buffer_min <= end_min; m += step) {
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

// Huecos para "cualquier barbero" o uno puntual. [{ start, staff_ids }]
export function slotsFor(db, business, service, date, staffId, opts = {}) {
  const team = staffForService(db, business.id, service.id).filter((s) => !staffId || s.id === staffId);
  const byStart = new Map();
  for (const st of team) {
    for (const s of staffSlots(db, business, st, service, date, opts)) {
      if (!byStart.has(s)) byStart.set(s, []);
      byStart.get(s).push(st.id);
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staff_ids]) => ({
    start: iso(start), time: minToHHMM(localParts(start, business.timezone).min), staff_ids,
  }));
}

// ¿Puede este barbero tomar [start, start+len) ? Revisa horario y solapamientos.
export function isBookable(db, business, staff, service, startMs, { ignoreAppointmentId, checkHours = true } = {}) {
  const len = (service.duration_min + service.buffer_min) * 60000;
  if (checkHours) {
    const lp = localParts(startMs, business.timezone);
    const endMin = lp.min + service.duration_min + service.buffer_min;
    const fits = hoursFor(db, staff.id, lp.weekday).some((r) => lp.min >= r.start_min && endMin <= r.end_min);
    if (!fits) return { ok: false, reason: 'outside_hours' };
  }
  const busy = busyIntervals(db, staff.id, startMs, startMs + len, ignoreAppointmentId);
  if (overlaps(startMs, startMs + len, busy)) return { ok: false, reason: 'overlap' };
  return { ok: true };
}

// Para "cualquiera": el barbero libre con menos citas ese día (reparte la carga).
export function pickStaff(db, business, candidates, startMs, tz) {
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
