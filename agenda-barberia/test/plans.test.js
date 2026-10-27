import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { startServer, client, signup, nextWeekday } from './helpers.js';
import { runReminders } from '../server/jobs.js';
import { zonedToUtc } from '../server/time.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(zonedToUtc(date, h * 60 + m, 'America/Santiago')).toISOString(); };

test('prueba de 30 días; al vencer queda en Gratis con límites', async () => {
  const { c, business } = await signup(srv.base, 101);
  const me = (await c.get('/api/me')).data;
  assert.equal(me.plan.status, 'trialing');
  assert.equal(me.plan.effective, 'barberia');
  assert.equal(me.branches.length, 1);
  srv.db.run("update businesses set trial_ends_at = '2000-01-01T00:00:00Z' where id = ?", business.id);
  assert.equal((await c.get('/api/me')).data.plan.effective, 'free');
  const reg = await c.get('/api/register');
  assert.equal(reg.status, 402);
  assert.match(reg.data.error, /plan Barbería/);
  assert.equal((await c.get('/api/reports/summary')).status, 402);
  // Ya tiene 3 barberos de ejemplo: no puede sumar otro activo.
  assert.equal((await c.post('/api/staff', { name: 'Nuevo' })).status, 402);
  assert.equal((await c.post('/api/staff', { name: 'Inactivo', active: false })).status, 201);
  // Lo básico sigue funcionando.
  assert.equal((await c.get('/api/clients')).status, 200);
});

test('registro en plan Gratis carga un solo barbero', async () => {
  const { c } = await signup(srv.base, 102, { plan: 'free' });
  assert.equal((await c.get('/api/staff')).data.length, 1);
  assert.equal((await c.get('/api/me')).data.plan.effective, 'free');
});

test('webhook de Stripe: firma, idempotencia y cambios de plan', async () => {
  const { c, business } = await signup(srv.base, 103);
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_CADENA_MONTH = 'price_cadena_m';
  const send = (ev, secret = 'whsec_test') => {
    const raw = JSON.stringify(ev);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    return fetch(`${srv.base}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
  };
  const done = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: business.id, customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'barberia' } } } };
  assert.equal((await send(done, 'otro')).status, 400, 'firma falsa rechazada');
  assert.equal((await (await send(done)).json()).received, 'ok');
  assert.equal((await (await send(done)).json()).received, 'duplicate');
  let plan = (await c.get('/api/billing')).data;
  assert.deepEqual([plan.status, plan.effective, plan.has_subscription], ['active', 'barberia', true]);
  await send({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_cadena_m' } }] } } } });
  assert.equal((await c.get('/api/billing')).data.effective, 'cadena');
  await send({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } });
  plan = (await c.get('/api/billing')).data;
  assert.deepEqual([plan.status, plan.effective], ['canceled', 'free']);
  // Sin claves de Stripe, el checkout lo dice claro.
  assert.equal((await c.post('/api/billing/checkout', { plan: 'barberia' })).status, 503);
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

test('anticipo: queda pendiente, se marca recibido y se descuenta al cobrar', async () => {
  const { c, business } = await signup(srv.base, 104);
  await c.put('/api/business', { deposit_instructions: 'Transferir a Cuenta Vista 123', payment_link: 'https://mpago.la/abc' });
  assert.equal((await c.put('/api/business', { payment_link: 'javascript:alert(1)' })).status, 400);
  const svc = (await c.get('/api/services')).data.find((s) => s.price === 12000);
  await c.put(`/api/services/${svc.id}`, { deposit: 3000 });
  const pub = client(srv.base);
  const date = nextWeekday(2);
  const r = await pub.post(`/api/public/${business.slug}/book`, { service_ids: [svc.id], staff_id: 'any', start: at(date, '11:00'), name: 'Ana', phone: '988887777' });
  assert.equal(r.status, 201);
  const view = (await pub.get(`/api/public/r/${r.data.token}`)).data;
  assert.deepEqual([view.appointment.deposit, view.appointment.deposit_status, view.payment_link], [3000, 'pending', 'https://mpago.la/abc']);
  const appt = (await c.get(`/api/appointments?from=${date}&to=${date}`)).data.find((a) => a.client_name === 'Ana');
  assert.equal((await c.post(`/api/appointments/${appt.id}/deposit`, { status: 'paid' })).data.deposit_status, 'paid');
  const sale = await c.post('/api/sales', { appointment_id: appt.id, payment_method: 'card', items: [{ kind: 'service', ref_id: svc.id }] });
  assert.deepEqual([sale.data.subtotal, sale.data.prepaid, sale.data.total], [12000, 3000, 9000]);
});

test('campañas por segmento respetan la baja y SMS deja enlace manual', async () => {
  const { c } = await signup(srv.base, 105, { demo: false });
  await c.put('/api/business', { message_channel: 'sms' });
  const a = (await c.post('/api/clients', { name: 'Uno Vip', phone: '911000001', tags: 'vip, barba' })).data;
  await c.post('/api/clients', { name: 'Dos Vip', phone: '911000002', tags: 'vip' });
  await c.post('/api/clients', { name: 'Tres', phone: '911000003' });
  await c.put(`/api/clients/${a.id}`, { marketing_opt_out: true });
  assert.equal((await c.get('/api/campaigns/preview?segment=tag&tag=vip')).data.count, 1);
  assert.equal((await c.get('/api/campaigns/preview?segment=all')).data.count, 2);
  const sent = await c.post('/api/campaigns', { segment: 'tag', tag: 'vip', text: 'Hola {nombre}, 20% esta semana: {enlace}' });
  assert.equal(sent.data.queued, 1);
  await runReminders(srv.db);
  const r = (await c.get('/api/reminders?status=manual')).data.find((x) => x.kind === 'campaign');
  assert.equal(r.channel, 'sms');
  assert.match(r.body, /^Hola Dos, 20% esta semana: http/);
  assert.ok(r.sms_link.startsWith('sms:+56911000002?body='));
});

test('sucursales: solo plan Cadena, se cambia de una a otra y los datos no se mezclan', async () => {
  const { c, business } = await signup(srv.base, 106, { plan: 'barberia' });
  assert.equal((await c.post('/api/branches', { name: 'Sucursal Centro' })).status, 402);
  srv.db.run("update businesses set plan = 'cadena' where id = ?", business.id);
  const br = await c.post('/api/branches', { name: 'Sucursal Centro' });
  assert.equal(br.status, 201);
  const me = (await c.get('/api/me')).data;
  assert.equal(me.branches.length, 2);
  assert.equal((await c.post('/api/branches/switch', { business_id: br.data.id })).status, 200);
  const now = (await c.get('/api/me')).data;
  assert.equal(now.business.id, br.data.id);
  assert.equal(now.plan.effective, 'cadena', 'la sucursal usa el plan del principal');
  assert.equal((await c.get('/api/clients')).data.length, 0);
  const other = await signup(srv.base, 107);
  assert.equal((await c.post('/api/branches/switch', { business_id: other.business.id })).status, 404);
  await c.post('/api/branches/switch', { business_id: business.id });
  assert.ok((await c.get('/api/clients')).data.length > 0);
});

test('healthz y páginas legales', async () => {
  assert.equal(await (await fetch(`${srv.base}/healthz`)).text(), 'ok');
  for (const p of ['/privacidad', '/terminos']) assert.equal((await fetch(srv.base + p)).status, 200);
});

test('rubro: palabras, servicios y mensaje "te toca" según el negocio', async () => {
  const { c, business } = await signup(srv.base, 108, { vertical: 'peluqueria' });
  const me = (await c.get('/api/me')).data;
  assert.equal(me.business.vertical, 'peluqueria');
  assert.equal(me.terms.Staff, 'Estilista');
  assert.ok((await c.get('/api/services')).data.some((s) => s.name === 'Mechas / balayage'));
  const pub = (await client(srv.base).get(`/api/public/${business.slug}`)).data;
  assert.equal(pub.terms.staffs, 'estilistas');
  assert.ok(me.verticals.length >= 5);
  // Cambiar de rubro desde Configuración.
  assert.equal((await c.put('/api/business', { vertical: 'masajes' })).data.vertical, 'masajes');
  assert.equal((await c.get('/api/me')).data.terms.Staff, 'Terapeuta');
  assert.equal((await c.put('/api/business', { vertical: 'dentista' })).status, 400);
  // Sin rubro: barbería.
  const { c: c2 } = await signup(srv.base, 109);
  assert.equal((await c2.get('/api/me')).data.terms.staff, 'barbero');
});
