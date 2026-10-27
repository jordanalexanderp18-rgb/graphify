// Tareas en segundo plano. Corren en el mismo proceso cada minuto.
import { nowIso } from './db.js';
import { deliver, queue } from './notify.js';
import { localParts } from './time.js';
import { has } from './plans.js';

export async function runReminders(db, limit = 50) {
  const due = db.all(
    "select * from reminders where status = 'pending' and send_at <= ? order by send_at limit ?", nowIso(), limit);
  for (const r of due) await deliver(db, r);
  return due.length;
}

// "Te toca corte": clientes cuya última visita atendida supera rebook_days,
// sin cita futura y sin aviso de este tipo en el último ciclo. Una vez al día,
// después de las 10:00 hora local.
const lastRun = new Map();
export function runRebook(db, now = Date.now()) {
  let queued = 0;
  for (const business of db.all('select * from businesses')) {
    const today = localParts(now, business.timezone).date;
    if (lastRun.get(business.id) === today) continue;
    if (!has(db, business, 'rebook')) continue;
    if (localParts(now, business.timezone).min < 600) continue;
    lastRun.set(business.id, today);
    const cutoff = new Date(now - business.rebook_days * 86400000).toISOString();
    const rows = db.all(
      `select c.* from clients c
       where c.business_id = ?
         and (select max(start_at) from appointments a where a.client_id = c.id and a.status = 'done') < ?
         and not exists (select 1 from appointments a where a.client_id = c.id and a.start_at > ? and a.status in ('booked','confirmed'))
         and not exists (select 1 from reminders r where r.client_id = c.id and r.kind = 'rebook' and r.created_at > ?)
       limit 200`,
      business.id, cutoff, new Date(now).toISOString(), cutoff);
    for (const client of rows) if (queue(db, 'rebook', { business, client }, now)) queued++;
  }
  return queued;
}

export function startJobs(db) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      runRebook(db);
      await runReminders(db);
    } catch (e) {
      console.error('[jobs]', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  setTimeout(tick, 2000).unref();
  return () => clearInterval(timer);
}
