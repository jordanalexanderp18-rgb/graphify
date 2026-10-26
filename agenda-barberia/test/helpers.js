import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { resetRateLimits } from '../server/auth.js';

export async function startServer() {
  resetRateLimits();
  const db = openDb(':memory:');
  const app = createApp(db);
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { db, base, close: () => new Promise((r) => app.close(r)) };
}

// Cliente con su propia cookie de sesión.
export function client(base) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
  };
}

export async function signup(base, n = 1, extra = {}) {
  resetRateLimits(); // el límite de registros por IP no es lo que se prueba aquí
  const c = client(base);
  const r = await c.post('/api/auth/signup', {
    business_name: `Barbería Prueba ${n}`, name: 'Dueño', email: `dueno${n}@example.com`, password: 'clave-segura-1', ...extra,
  });
  if (r.status !== 201) throw new Error(JSON.stringify(r));
  return { c, business: r.data.business };
}

// Próxima fecha local (YYYY-MM-DD) con ese día de semana, a partir de mañana.
export function nextWeekday(wd, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 2));
  while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
