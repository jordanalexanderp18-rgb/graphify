// Contador de regreso: después de cada visita atendida se programa un aviso
// "te toca volver" a los N días (los del servicio, o los que ponga el
// profesional). El texto se arma el día del envío con horas libres reales.
import { localParts, zonedToUtc, addDays, todayIn, iso } from './time.js';
import { slotsFor, minToHHMM } from './availability.js';
import { termsOf } from './verticals.js';
import { queue, baseUrl } from './notify.js';

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SEND_AT_MIN = 11 * 60; // 11:00 hora local: ni muy temprano ni de noche

// La cita que representa la visita (la primera, si tuvo varios servicios).
const headOf = (db, appt) => (appt.group_id ? db.get('select * from appointments where id = ?', appt.group_id) || appt : appt);

export function defaultReturnDays(db, appt) {
  const b = db.get('select rebook_days from businesses where id = ?', appt.business_id);
  const s = db.get('select return_days from services where id = ?', appt.service_id);
  return s?.return_days ?? b.rebook_days;
}

// Programa (o reprograma) el aviso. days = null lo apaga para esta visita.
export function scheduleReturn(db, apptIn, days) {
  const appt = headOf(db, apptIn);
  const business = db.get('select * from businesses where id = ?', appt.business_id);
  const client = db.get('select * from clients where id = ?', appt.client_id);
  // Un solo aviso pendiente por cliente: el de su última visita.
  db.run("update reminders set status = 'skipped' where client_id = ? and kind = 'rebook' and status = 'pending'", client.id);
  db.run('update appointments set return_days = ? where id = ?', days ?? null, appt.id);
  if (!days) return { return_days: null, return_at: null };
  const date = addDays(localParts(appt.start_at, business.timezone).date, days);
  let sendAt = zonedToUtc(date, SEND_AT_MIN, business.timezone);
  if (sendAt < Date.now()) sendAt = Date.now();
  const r = queue(db, 'rebook', { business, client, appt }, sendAt, 'Se arma con horas libres el día del envío.');
  return { return_days: days, return_at: iso(sendAt), reminder_id: r?.id ?? null };
}

// Al quedar atendida, se programa con los días sugeridos si nadie lo hizo antes.
export function ensureReturn(db, appt) {
  const head = headOf(db, appt);
  if (head.return_days !== null && head.return_days !== undefined) return;
  scheduleReturn(db, head, defaultReturnDays(db, head));
}

// Texto del aviso con las próximas horas libres del mismo profesional (o de
// cualquiera, si ya no está). Devuelve null si el cliente ya tiene hora.
export function returnMessage(db, reminder) {
  const appt = db.get('select * from appointments where id = ?', reminder.appointment_id);
  if (!appt) return null;
  const business = db.get('select * from businesses where id = ?', appt.business_id);
  const client = db.get('select * from clients where id = ?', appt.client_id);
  const future = db.get(`select 1 from appointments where client_id = ? and start_at > ? and status in ('booked','confirmed')`, client.id, new Date().toISOString());
  if (future) return null;
  const service = db.get('select * from services where id = ?', appt.service_id);
  let staff = db.get('select * from staff where id = ? and active = 1', appt.staff_id);
  if (staff && !db.get('select 1 from staff_services where staff_id = ? and service_id = ?', staff.id, service.id)) staff = null;
  const tz = business.timezone;
  const picks = [];
  if (service?.active) {
    const today = todayIn(tz);
    for (let i = 0; i < 10 && picks.length < 3; i++) {
      const date = addDays(today, i);
      const first = slotsFor(db, business, [service], date, staff?.id || null, { enforcePolicy: true })[0];
      if (first) picks.push(first);
    }
  }
  const label = (s) => {
    const p = localParts(s.start, tz);
    return `${DAYS[p.weekday]} ${p.d} a las ${minToHHMM(p.min)}`;
  };
  const name = (client.name || '').split(' ')[0] || 'Hola';
  const who = staff ? staff.name.split(' ')[0] : null;
  const days = appt.return_days ?? Math.round((Date.now() - Date.parse(appt.start_at)) / 86400000);
  const link = `${baseUrl()}/b/${business.slug}${service ? `?s=${service.id}${staff ? `&p=${staff.id}` : ''}` : ''}`;
  const what = service ? `tu ${service.name.toLowerCase()}` : 'tu última visita';
  const hours = picks.length
    ? ` ${who ? `${who} tiene libre` : 'Tenemos libre'}: ${picks.map(label).join(' · ')}.`
    : '';
  return `${name}, ya pasaron ${days} días desde ${what}${who ? ` con ${who}` : ''} en ${business.name}. ${termsOf(business).rebook}.${hours} Reserva en un toque: ${link}`;
}
