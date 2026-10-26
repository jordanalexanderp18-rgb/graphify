// Mensajes al cliente: textos, programación y adaptadores de envío.
// Sin claves configuradas, los mensajes de WhatsApp quedan en modo "manual":
// la recepción los envía con un toque desde Mensajes (enlace wa.me prellenado).
import { uid, nowIso } from './db.js';
import { localParts, iso } from './time.js';
import { minToHHMM } from './availability.js';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function whenText(startIso, tz) {
  const p = localParts(startIso, tz);
  return `${DAYS[p.weekday]} ${p.d} de ${MONTHS[p.m - 1]} a las ${minToHHMM(p.min)}`;
}

const LOCALE = { CLP: 'es-CL', MXN: 'es-MX', COP: 'es-CO', ARS: 'es-AR', PEN: 'es-PE', DOP: 'es-DO', EUR: 'es-ES', USD: 'es-EC' };
export function money(amount, currency) {
  const zeroDecimals = ['CLP', 'COP', 'PYG', 'ARS'].includes(currency);
  const value = zeroDecimals ? amount : amount / 100;
  try {
    return new Intl.NumberFormat(LOCALE[currency] || 'es', { style: 'currency', currency, maximumFractionDigits: zeroDecimals ? 0 : 2 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function baseUrl() {
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function body(kind, { business, client, service, staff, appt }) {
  const first = (client.name || '').split(' ')[0] || 'hola';
  const link = appt ? `${baseUrl()}/r/${appt.token}` : `${baseUrl()}/b/${business.slug}`;
  const when = appt ? whenText(appt.start_at, business.timezone) : '';
  switch (kind) {
    case 'confirmation':
      return `${first}, tu hora en ${business.name} quedó reservada: ${service.name} con ${staff.name}, ${when}. Para cambiarla o cancelarla: ${link}`;
    case 'reminder':
      return `Te esperamos, ${first}: ${service.name} con ${staff.name} el ${when} en ${business.name}${business.address ? ` (${business.address})` : ''}. ¿No puedes venir? Avísanos aquí: ${link}`;
    case 'cancelled':
      return `${first}, tu hora del ${when} en ${business.name} fue cancelada. Cuando quieras, reservas otra aquí: ${link}`;
    case 'rebook':
      return `${first}, ya va siendo hora del próximo corte. Elige tu hora en ${business.name}: ${link}`;
    default:
      return '';
  }
}

export function channelFor(client) {
  if (client.phone) return 'whatsapp';
  if (client.email) return 'email';
  return null;
}

// Agrega un mensaje a la cola. sendAt en ms.
export function queue(db, kind, ctx, sendAt) {
  const channel = channelFor(ctx.client);
  if (!channel) return null;
  return db.insert('reminders', {
    id: uid(), business_id: ctx.business.id, appointment_id: ctx.appt?.id ?? null, client_id: ctx.client.id,
    kind, channel, send_at: iso(sendAt), status: 'pending', body: body(kind, ctx),
  });
}

// Mensajes de una cita nueva: confirmación ya, recordatorio N horas antes.
export function scheduleForAppointment(db, ctx) {
  const now = Date.now();
  queue(db, 'confirmation', ctx, now);
  const at = Date.parse(ctx.appt.start_at) - ctx.business.reminder_hours * 3600000;
  if (at > now) queue(db, 'reminder', ctx, at);
}

// Al cancelar o mover una cita, los recordatorios pendientes ya no sirven.
export function dropPending(db, appointmentId) {
  db.run("update reminders set status = 'skipped' where appointment_id = ? and status = 'pending'", appointmentId);
}

export function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// --- adaptadores --------------------------------------------------------

async function sendWhatsApp(phone, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { status: 'manual' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: 'sent' };
}

async function sendEmail(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { status: 'manual' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: 'sent' };
}

const SUBJECT = { confirmation: 'Tu hora está reservada', reminder: 'Recordatorio de tu hora', cancelled: 'Tu hora fue cancelada', rebook: 'Te toca corte' };

export async function deliver(db, r) {
  const client = db.get('select phone, email from clients where id = ?', r.client_id);
  if (!client) return db.run("update reminders set status = 'skipped' where id = ?", r.id);
  db.run('update reminders set attempts = attempts + 1 where id = ?', r.id);
  try {
    const out = r.channel === 'whatsapp'
      ? await sendWhatsApp(client.phone, r.body)
      : await sendEmail(client.email, SUBJECT[r.kind] || 'Mensaje', r.body);
    db.run('update reminders set status = ?, sent_at = ?, error = ? where id = ?',
      out.status, out.status === 'sent' ? nowIso() : null, '', r.id);
  } catch (e) {
    const failed = r.attempts + 1 >= 3;
    db.run('update reminders set status = ?, error = ? where id = ?', failed ? 'failed' : 'pending', String(e.message).slice(0, 300), r.id);
  }
}
