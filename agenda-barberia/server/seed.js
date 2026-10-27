// Datos de ejemplo para un negocio nuevo. Personas ficticias.
import { uid } from './db.js';
import { zonedToUtc, todayIn, addDays, weekdayOf, iso } from './time.js';
import { randomBytes } from 'node:crypto';
import { verticalOf } from './verticals.js';

const CLIENTS = [
  ['Tomás Herrera', '912345601'], ['Benjamín Muñoz', '912345602'], ['Joaquín Pérez', '912345603'],
  ['Vicente Castro', '912345604'], ['Martín Silva', '912345605'], ['Agustín Morales', '912345606'],
  ['Lucas Navarro', '912345607'], ['Sebastián Vega', '912345608'],
];

const COLORS = ['c1', 'c2', 'c3'];

export function seedBusiness(db, business, { withAppointments = true, maxStaff = 3 } = {}) {
  const v = verticalOf(business);
  const services = v.services.map(([name, category, duration, price], i) =>
    db.insert('services', { id: uid(), business_id: business.id, name, category, duration_min: duration, price, sort: i }));
  const staff = v.staff.slice(0, maxStaff).map(([name, specialty], i) =>
    db.insert('staff', { id: uid(), business_id: business.id, name, specialty, color: COLORS[i % 3], commission_service_pct: 40, commission_product_pct: 10, sort: i }));
  for (const st of staff) {
    for (const wd of [1, 2, 3, 4, 5, 6]) {
      // Lunes a viernes 10-14 y 15-20 (almuerzo 14-15); sábado corrido 10-15.
      if (wd === 6) {
        db.insert('staff_hours', { id: uid(), staff_id: st.id, weekday: wd, start_min: 10 * 60, end_min: 15 * 60 });
        continue;
      }
      db.insert('staff_hours', { id: uid(), staff_id: st.id, weekday: wd, start_min: 10 * 60, end_min: 14 * 60 });
      db.insert('staff_hours', { id: uid(), staff_id: st.id, weekday: wd, start_min: 15 * 60, end_min: 20 * 60 });
    }
    for (const sv of services) db.insert('staff_services', { staff_id: st.id, service_id: sv.id });
  }
  for (const [name, sku, price, cost, stock] of v.products) {
    db.insert('products', { id: uid(), business_id: business.id, name, sku, price, cost, stock });
  }
  const clients = CLIENTS.map(([name, phone]) =>
    db.insert('clients', { id: uid(), business_id: business.id, name, phone: business.phone_prefix + phone }));

  if (withAppointments) {
    // Algunas citas hoy y mañana para que la agenda no se vea vacía.
    const today = todayIn(business.timezone);
    let k = 0;
    for (const date of [today, addDays(today, 1)]) {
      if (weekdayOf(date) === 0) continue;
      for (const [si, startMin] of [[0, 600], [1, 660], [2, 900], [0, 960], [1, 1020]]) {
        const sv = services[(k + si) % 3];
        const st = staff[si % staff.length];
        const start = zonedToUtc(date, startMin, business.timezone);
        if (sv.duration_min > 120) continue;
        db.insert('appointments', {
          id: uid(), business_id: business.id, staff_id: st.id, client_id: clients[k % clients.length].id,
          service_id: sv.id, start_at: iso(start), end_at: iso(start + sv.duration_min * 60000),
          status: 'booked', source: k % 2 ? 'online' : 'panel', price: sv.price, token: randomBytes(18).toString('base64url'),
        });
        k++;
      }
    }
  }
  return { services, staff, clients };
}
