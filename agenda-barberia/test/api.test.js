import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client, signup, nextWeekday } from './helpers.js';
import { runReminders, runRebook } from '../server/jobs.js';
import { zonedToUtc } from '../server/time.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const TZ = 'America/Santiago';
const at = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(zonedToUtc(date, h * 60 + m, TZ)).toISOString();
};

test('F08 registro crea negocio con datos de ejemplo y sesión', async () => {
  const { c, business } = await signup(srv.base, 1);
  assert.equal(business.slug, 'barberia-prueba-1');
  const me = await c.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'owner');
  const services = await c.get('/api/services');
  assert.ok(services.data.length >= 5);
  const dup = await client(srv.base).post('/api/auth/signup', { business_name: 'X', name: 'Y', email: 'dueno1@example.com', password: 'otra-clave-1' });
  assert.equal(dup.status, 409);
});

test('login con contraseña equivocada falla y sin sesión no hay datos', async () => {
  const anon = client(srv.base);
  assert.equal((await anon.post('/api/auth/login', { email: 'dueno1@example.com', password: 'mala' })).status, 401);
  assert.equal((await anon.get('/api/clients')).status, 401);
  assert.equal((await anon.post('/api/auth/login', { email: 'dueno1@example.com', password: 'clave-segura-1' })).status, 200);
});

test('F01 reserva online, sin dobles reservas, y F02 cancelar/reprogramar', async () => {
  const { c, business } = await signup(srv.base, 2, { demo: true });
  const pub = client(srv.base);
  const info = await pub.get(`/api/public/${business.slug}`);
  assert.equal(info.status, 200);
  const service = info.data.services.find((s) => s.duration_min === 30);
  const barber = info.data.staff[0];
  const date = nextWeekday(2);

  const days = await pub.get(`/api/public/${business.slug}/days?service_id=${service.id}`);
  assert.ok(days.data.some((d) => d.available));

  const slots = await pub.get(`/api/public/${business.slug}/slots?service_id=${service.id}&staff_id=${barber.id}&date=${date}`);
  assert.ok(slots.data.length > 10);
  assert.equal(slots.data[0].time, '10:00');
  assert.ok(!slots.data.some((s) => s.time === '14:00'), 'el descanso 14-15 no ofrece horas');

  const start = at(date, '11:00');
  const book = await pub.post(`/api/public/${business.slug}/book`, {
    service_id: service.id, staff_id: barber.id, start, name: 'Ana Cliente', phone: '9 8765 4321',
  });
  assert.equal(book.status, 201, JSON.stringify(book.data));

  // La misma hora con el mismo barbero ya no está.
  const again = await pub.post(`/api/public/${business.slug}/book`, {
    service_id: service.id, staff_id: barber.id, start, name: 'Otro', phone: '987650000',
  });
  assert.equal(again.status, 409);
  const slots2 = await pub.get(`/api/public/${business.slug}/slots?service_id=${service.id}&staff_id=${barber.id}&date=${date}`);
  assert.ok(!slots2.data.some((s) => s.start === start));

  // "Cualquiera" en esa hora asigna a otro barbero.
  const any = await pub.post(`/api/public/${business.slug}/book`, {
    service_id: service.id, staff_id: 'any', start, name: 'Beto', phone: '987650001',
  });
  assert.equal(any.status, 201);

  // Reservas simultáneas a una misma hora libre: solo una gana.
  const race = at(date, '16:00');
  const results = await Promise.all([0, 1, 2, 3].map((i) => client(srv.base).post(`/api/public/${business.slug}/book`, {
    service_id: service.id, staff_id: barber.id, start: race, name: `R${i}`, phone: `98765010${i}`,
  })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);

  // El cliente quedó creado con teléfono normalizado y aparece en la agenda.
  const clients = await c.get('/api/clients?q=ana');
  assert.equal(clients.data[0].phone, '56987654321');
  const agenda = await c.get(`/api/appointments?from=${date}&to=${date}`);
  assert.ok(agenda.data.some((a) => a.start_at === start && a.client_name === 'Ana Cliente' && a.source === 'online'));

  // Confirmación + recordatorio en cola.
  const rem = await c.get('/api/reminders');
  assert.ok(rem.data.some((r) => r.kind === 'confirmation' && r.client_name === 'Ana Cliente'));
  assert.ok(rem.data.some((r) => r.kind === 'reminder' && r.client_name === 'Ana Cliente'));

  // Reservar con el teléfono de otro cliente no revela su nombre ni cambia su ficha.
  const spoof = await pub.post(`/api/public/${business.slug}/book`, {
    service_id: service.id, staff_id: 'any', start: at(date, '17:00'), name: 'Curioso', phone: '9 8765 4321', email: 'curioso@example.com',
  });
  assert.equal(spoof.status, 201);
  const leaked = (await pub.get(`/api/public/r/${spoof.data.token}`)).data;
  assert.ok(!JSON.stringify(leaked).includes('Ana Cliente'), 'no expone el nombre guardado');
  assert.equal((await c.get('/api/clients?q=ana')).data[0].email, '', 'no cambia la ficha existente');

  // F02: ver, reprogramar y cancelar con el token.
  const tok = book.data.token;
  const view = await pub.get(`/api/public/r/${tok}`);
  assert.equal(view.data.can_change, true);
  const newStart = at(date, '12:00');
  assert.equal((await pub.post(`/api/public/r/${tok}/reschedule`, { start: newStart })).status, 200);
  assert.equal((await pub.get(`/api/public/r/${tok}`)).data.appointment.start_at, newStart);
  assert.equal((await pub.post(`/api/public/r/${tok}/cancel`)).status, 200);
  assert.equal((await pub.get(`/api/public/r/${tok}`)).data.appointment.status, 'cancelled');
  assert.equal((await pub.post(`/api/public/r/${tok}/cancel`)).status, 409);
  // La hora liberada vuelve a estar disponible.
  const slots3 = await pub.get(`/api/public/${business.slug}/slots?service_id=${service.id}&staff_id=${barber.id}&date=${date}`);
  assert.ok(slots3.data.some((s) => s.start === newStart));
});

test('reserva pública valida datos y política de anticipación', async () => {
  const { business } = await signup(srv.base, 3);
  const pub = client(srv.base);
  const info = await pub.get(`/api/public/${business.slug}`);
  const service = info.data.services[0];
  const date = nextWeekday(3);
  const noPhone = await pub.post(`/api/public/${business.slug}/book`, { service_id: service.id, staff_id: 'any', start: at(date, '10:00'), name: 'Sin Tel' });
  assert.equal(noPhone.status, 400);
  const past = await pub.post(`/api/public/${business.slug}/book`, { service_id: service.id, staff_id: 'any', start: new Date(Date.now() - 3600000).toISOString(), name: 'Pasado', phone: '987650099' });
  assert.equal(past.status, 409);
  const outside = await pub.post(`/api/public/${business.slug}/book`, { service_id: service.id, staff_id: 'any', start: at(date, '23:00'), name: 'Noche', phone: '987650098' });
  assert.equal(outside.status, 409);
  assert.equal((await pub.get('/api/public/no-existe')).status, 404);
});

test('F03 agenda del panel: solapamientos, fuera de horario, estados', async () => {
  const { c } = await signup(srv.base, 4);
  const staff = (await c.get('/api/staff')).data[0];
  const service = (await c.get('/api/services')).data.find((s) => s.duration_min === 60);
  const date = nextWeekday(4);
  const a1 = await c.post('/api/appointments', { staff_id: staff.id, service_id: service.id, date, time: '10:00', client: { name: 'Carlos', phone: '911112222' } });
  assert.equal(a1.status, 201, JSON.stringify(a1.data));
  const overlap = await c.post('/api/appointments', { staff_id: staff.id, service_id: service.id, date, time: '10:30', client: { name: 'Dani' } });
  assert.equal(overlap.status, 409);
  const outside = await c.post('/api/appointments', { staff_id: staff.id, service_id: service.id, date, time: '21:00', client: { name: 'Dani' } });
  assert.equal(outside.status, 409);
  const forced = await c.post('/api/appointments', { staff_id: staff.id, service_id: service.id, date, time: '21:00', force: true, client: { name: 'Dani' } });
  assert.equal(forced.status, 201);
  // Mover a una hora libre funciona; encima de otra no.
  const moved = await c.put(`/api/appointments/${forced.data.id}`, { date, time: '12:00' });
  assert.equal(moved.status, 200);
  assert.equal((await c.put(`/api/appointments/${forced.data.id}`, { date, time: '10:15' })).status, 409);
  // No-show y reactivación.
  assert.equal((await c.post(`/api/appointments/${a1.data.id}/status`, { status: 'no_show' })).data.status, 'no_show');
  assert.equal((await c.post(`/api/appointments/${a1.data.id}/status`, { status: 'confirmed' })).data.status, 'confirmed');
  // Horas libres del panel excluyen las tomadas.
  const av = await c.get(`/api/availability?service_id=${service.id}&staff_id=${staff.id}&date=${date}`);
  assert.ok(!av.data.some((s) => s.time === '10:00' || s.time === '12:00'));
});

test('F04/F05/F06 caja, venta con descuento y propina, comisiones, stock', async () => {
  const { c } = await signup(srv.base, 5);
  const staff = (await c.get('/api/staff')).data[0];
  const service = (await c.get('/api/services')).data.find((s) => s.price === 10000);
  const product = (await c.get('/api/products')).data.find((p) => p.price === 9000);
  const date = nextWeekday(5);
  const appt = (await c.post('/api/appointments', { staff_id: staff.id, service_id: service.id, date, time: '15:00', client: { name: 'Eva', phone: '922223333' } })).data;

  const cashNoRegister = await c.post('/api/sales', { appointment_id: appt.id, payment_method: 'cash', items: [{ kind: 'service', ref_id: service.id }] });
  assert.equal(cashNoRegister.status, 409);
  assert.equal((await c.post('/api/register/open', { amount: 20000 })).status, 201);
  assert.equal((await c.post('/api/register/open', { amount: 1 })).status, 409);

  // 10.000 servicio + 9.000 producto = 19.000, descuento 1.900 (10%), propina 2.000
  const sale = await c.post('/api/sales', {
    appointment_id: appt.id, payment_method: 'cash', discount: 1900, tip: 2000,
    items: [{ kind: 'service', ref_id: service.id }, { kind: 'product', ref_id: product.id, qty: 1 }],
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(sale.data.subtotal, 19000);
  assert.equal(sale.data.total, 19100);
  const [sv, pr] = sale.data.items;
  assert.equal(sv.line_total, 9000);
  assert.equal(pr.line_total, 8100);
  assert.equal(sv.commission_amount, Math.round(9000 * staff.commission_service_pct / 100));
  assert.equal(pr.commission_amount, Math.round(8100 * staff.commission_product_pct / 100));
  assert.equal((await c.post('/api/sales', { appointment_id: appt.id, payment_method: 'card', items: [{ kind: 'service', ref_id: service.id }] })).status, 409, 'no se cobra dos veces');

  const agenda = await c.get(`/api/appointments?from=${date}&to=${date}`);
  assert.equal(agenda.data.find((a) => a.id === appt.id).status, 'done');
  assert.equal((await c.get('/api/products')).data.find((p) => p.id === product.id).stock, product.stock - 1);
  const tooMany = await c.post('/api/sales', { payment_method: 'card', items: [{ kind: 'product', ref_id: product.id, qty: 999 }] });
  assert.equal(tooMany.status, 409);

  const today0 = new Date().toISOString().slice(0, 10);
  assert.equal((await c.get('/api/reports/commissions?from=2000-01-01&to=2100-01-01')).status, 400, 'rango máximo un año');
  const comm = await c.get(`/api/reports/commissions?from=${today0}&to=${nextWeekday(5)}`);
  const row = comm.data.rows.find((r) => r.id === staff.id);
  assert.equal(row.tips, 2000);
  assert.equal(row.total_to_pay, sv.commission_amount + pr.commission_amount + 2000);

  const reg = await c.get('/api/register');
  assert.equal(reg.data.open.expected_cash, 20000 + 19100);
  const closed = await c.post('/api/register/close', { counted: 39000 });
  assert.equal(closed.data.difference, -100);

  const rep = await c.get('/api/reports/summary?from=2000-01-01&to=2000-01-02');
  assert.equal(rep.status, 200);
  const today = new Date().toISOString().slice(0, 10);
  const rep2 = await c.get(`/api/reports/summary?from=${today}&to=${nextWeekday(5)}`);
  assert.ok(rep2.data.revenue >= 19100);
  assert.ok(rep2.data.top_services.length > 0);
});

test('aislamiento entre negocios y permisos de rol', async () => {
  const { c: a } = await signup(srv.base, 6);
  const { c: b } = await signup(srv.base, 7);
  const clientA = (await a.get('/api/clients')).data[0];
  assert.equal((await b.get(`/api/clients/${clientA.id}`)).status, 404);
  assert.equal((await b.put(`/api/clients/${clientA.id}`, { name: 'hack' })).status, 404);
  const svcA = (await a.get('/api/services')).data[0];
  assert.equal((await b.del(`/api/services/${svcA.id}`)).status, 404);
  assert.ok(!(await b.get('/api/clients')).data.some((x) => x.id === clientA.id));

  const staff = (await a.get('/api/staff')).data;
  assert.equal((await a.post('/api/users', { email: 'barbero6@example.com', password: 'clave-barbero', role: 'barber', staff_id: staff[0].id, name: 'B' })).status, 201);
  const barber = client(srv.base);
  await barber.post('/api/auth/login', { email: 'barbero6@example.com', password: 'clave-barbero' });
  assert.equal((await barber.get('/api/reports/summary')).status, 403);
  assert.equal((await barber.put('/api/business', { name: 'x' })).status, 403);
  const today = new Date().toISOString().slice(0, 10);
  const mine = await barber.get(`/api/appointments?from=${today}&to=${nextWeekday(1)}`);
  assert.ok(mine.data.every((x) => x.staff_id === staff[0].id));
  const other = (await a.get(`/api/appointments?from=${today}&to=${nextWeekday(1)}`)).data.find((x) => x.staff_id !== staff[0].id);
  if (other) assert.equal((await barber.post(`/api/appointments/${other.id}/status`, { status: 'done' })).status, 403);
});

test('importar CSV, borrar datos de un cliente, mensajes manuales y "te toca corte"', async () => {
  const { c, business } = await signup(srv.base, 8, { demo: false });
  const imp = await c.post('/api/clients/import', { csv: 'Nombre;Teléfono;Correo\n"Pérez, Juan";912340001;juan@example.com\nLuis;912340002;\nLuis repetido;912340002;\n;;\n' });
  assert.deepEqual([imp.data.imported, imp.data.skipped], [2, 1], 'la fila vacía se ignora; el teléfono repetido se salta');
  const juan = (await c.get('/api/clients?q=juan')).data[0];
  assert.equal(juan.name, 'Pérez, Juan');

  // Servicio + barbero mínimos, cita atendida hace 40 días.
  const svc = (await c.post('/api/services', { name: 'Corte', duration_min: 30, price: 5000 })).data;
  const st = (await c.post('/api/staff', { name: 'Pato', service_ids: [svc.id], hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '24:00' })) })).data;
  const past = new Date(Date.now() - 40 * 86400000);
  const ap = await c.post('/api/appointments', { staff_id: st.id, service_id: svc.id, client_id: juan.id, start: past.toISOString(), notify: false });
  assert.equal(ap.status, 201);
  await c.post(`/api/appointments/${ap.data.id}/status`, { status: 'done' });

  const noon = zonedToUtc(new Date().toISOString().slice(0, 10), 12 * 60, business.timezone);
  // Al atenderla se programó su aviso de regreso; el barrido general no duplica.
  assert.equal(srv.db.get("select count(*) n from reminders where client_id = ? and kind = 'rebook' and status = 'pending'", juan.id).n, 1);
  assert.equal(runRebook(srv.db, noon), 0, 'no duplica el aviso de la visita');
  // El aviso quedó programado para el mediodía simulado; se adelanta para que el envío no dependa de la hora real.
  srv.db.run("update reminders set send_at = '2000-01-01T00:00:00.000Z' where kind = 'rebook'");
  await runReminders(srv.db);
  const manual = await c.get('/api/reminders?status=manual');
  const rb = manual.data.find((r) => r.kind === 'rebook');
  assert.ok(rb.wa_link.startsWith('https://wa.me/56912340001?text='));
  assert.equal((await c.post(`/api/reminders/${rb.id}/sent`)).status, 200);

  assert.equal((await c.del(`/api/clients/${juan.id}`)).status, 200);
  const gone = (await c.get(`/api/clients/${juan.id}`)).data;
  assert.equal(gone.name, 'Cliente eliminado');
  assert.equal(gone.phone, '');
});

test('foto del barbero: valida formato y se sirve', async () => {
  const { c } = await signup(srv.base, 9);
  const st = (await c.get('/api/staff')).data[0];
  assert.equal((await c.put(`/api/staff/${st.id}/photo`, { data_url: 'data:text/html;base64,PGgxPg==' })).status, 400);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNk+M/AwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';
  const r = await c.put(`/api/staff/${st.id}/photo`, { data_url: png });
  assert.equal(r.status, 200);
  const img = await fetch(srv.base + r.data.photo_url);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const list = (await c.get('/api/staff')).data;
  assert.ok(list[0].photo_url && !('photo' in list[0]), 'el listado no arrastra la imagen completa');
});

test('visita con varios servicios y duración propia por barbero', async () => {
  const { c, business } = await signup(srv.base, 10, { demo: false });
  const corte = (await c.post('/api/services', { name: 'Corte', duration_min: 30, price: 10000 })).data;
  const barba = (await c.post('/api/services', { name: 'Barba', duration_min: 20, price: 6000 })).data;
  const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '10:00', end: '12:00' }));
  // Rápido corta en 20; Lento usa la duración del servicio.
  const rapido = (await c.post('/api/staff', { name: 'Rápido', hours: week, service_ids: [corte.id, barba.id], service_durations: { [corte.id]: 20 } })).data;
  const lento = (await c.post('/api/staff', { name: 'Lento', hours: week, service_ids: [corte.id] })).data;
  assert.equal(rapido.durations[corte.id], 20);
  const pub = client(srv.base);
  const date = nextWeekday(3);
  const q = (ids, staff) => `/api/public/${business.slug}/slots?service_ids=${ids.join(',')}&staff_id=${staff}&date=${date}`;
  // 10:00-12:00 con paso de 15: Rápido (20 min) llega hasta 11:30; Lento (30) hasta 11:30 también, pero 11:45 no.
  assert.ok((await pub.get(q([corte.id], rapido.id))).data.some((s) => s.time === '11:30'));
  assert.ok(!(await pub.get(q([corte.id], lento.id))).data.some((s) => s.time === '11:45'));
  // Corte + barba: solo Rápido hace ambos; 20 + 20 = 40 min -> última 11:15.
  const both = (await pub.get(`/api/public/${business.slug}/slots?service_ids=${corte.id},${barba.id}&date=${date}`)).data;
  assert.equal(both.at(-1).time, '11:15');
  const book = await pub.post(`/api/public/${business.slug}/book`, {
    service_ids: [corte.id, barba.id], staff_id: 'any', start: at(date, '10:00'), name: 'Combo', phone: '911110000',
  });
  assert.equal(book.status, 201, JSON.stringify(book.data));
  const view = (await pub.get(`/api/public/r/${book.data.token}`)).data;
  assert.equal(view.appointment.service_name, 'Corte + Barba');
  assert.equal(view.appointment.price, 16000);
  assert.equal(view.appointment.end_at, at(date, '10:40'));
  const agenda = (await c.get(`/api/appointments?from=${date}&to=${date}`)).data;
  assert.equal(agenda.length, 2);
  assert.ok(agenda.every((a) => a.staff_id === rapido.id && a.group_id === agenda[0].group_id));
  // Un solo recordatorio por visita, no uno por servicio.
  const rem = (await c.get('/api/reminders')).data.filter((r) => r.client_name === 'Combo');
  assert.equal(rem.filter((r) => r.kind === 'reminder').length, 1);
  assert.match(rem[0].body, /Corte \+ Barba/);
  // Reprogramar a 10:15 (se cruza con su propia hora actual) funciona.
  assert.equal((await pub.post(`/api/public/r/${book.data.token}/reschedule`, { start: at(date, '10:15') })).status, 200);
  const moved = (await c.get(`/api/appointments?from=${date}&to=${date}`)).data;
  assert.deepEqual(moved.map((a) => a.start_at), [at(date, '10:15'), at(date, '10:35')]);
  // Cobrar la primera cobra la visita completa.
  const sale = await c.post('/api/sales', { appointment_id: moved[0].id, payment_method: 'card', items: moved.map((a) => ({ kind: 'service', ref_id: a.service_id, unit_price: a.price })) });
  assert.equal(sale.status, 201);
  assert.ok((await c.get(`/api/appointments?from=${date}&to=${date}`)).data.every((a) => a.status === 'done' && a.sale_id === sale.data.id));
  // Anular devuelve ambas a por cobrar.
  assert.equal((await c.del(`/api/sales/${sale.data.id}`)).status, 200);
  assert.ok((await c.get(`/api/appointments?from=${date}&to=${date}`)).data.every((a) => a.status === 'booked' && !a.sale_id));
});

test('solo JSON en escrituras y errores claros', async () => {
  const r = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(r.status, 415);
  const bad = await fetch(`${srv.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const page = await fetch(`${srv.base}/../server/db.js`);
  assert.notEqual(page.status, 200);
});
