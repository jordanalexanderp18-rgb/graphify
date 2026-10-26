// Cobro de la suscripción con Stripe (Checkout + Portal + webhooks).
// Solo se activa con STRIPE_SECRET_KEY; los precios se crean en Stripe y sus
// ids van en STRIPE_PRICE_<PLAN>_<MONTH|YEAR>.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, nowIso } from './db.js';

const priceEnv = (plan, interval) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`];

export function planForPrice(priceId) {
  for (const plan of ['barberia', 'cadena']) for (const i of ['month', 'year']) if (priceEnv(plan, i) === priceId) return plan;
  return null;
}

async function stripe(path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Los pagos aún no están configurados en este servidor.');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, `Stripe: ${data.error?.message || res.status}`);
  return data;
}

export async function checkoutUrl(b, user, plan, interval, base) {
  const price = priceEnv(plan, interval);
  if (!price) throw new HttpError(503, `Falta configurar el precio ${plan}/${interval}.`);
  const params = {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: `${base}/app#/config?tab=plan&pago=ok`, cancel_url: `${base}/app#/config?tab=plan`,
    client_reference_id: b.id, 'metadata[business_id]': b.id, 'metadata[plan]': plan,
    'subscription_data[metadata][business_id]': b.id, allow_promotion_codes: 'true',
  };
  if (b.stripe_customer_id) params.customer = b.stripe_customer_id; else params.customer_email = user.email;
  return (await stripe('checkout/sessions', params)).url;
}

// Portal de Stripe: cambiar tarjeta, plan o cancelar con un clic.
export async function portalUrl(b, base) {
  if (!b.stripe_customer_id) throw new HttpError(409, 'Todavía no tienes una suscripción pagada.');
  return (await stripe('billing_portal/sessions', { customer: b.stripe_customer_id, return_url: `${base}/app#/config?tab=plan` })).url;
}

export function verifySignature(raw, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > 300) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
  return sigs.some((s) => s.length === want.length && timingSafeEqual(Buffer.from(s), want));
}

const STATUS = { active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete_expired: 'canceled' };

// Procesa un evento una sola vez (Stripe reintenta).
export function handleEvent(db, ev) {
  if (db.get('select 1 from billing_events where id = ?', ev.id)) return 'duplicate';
  const o = ev.data?.object || {};
  const byId = (id) => id && db.get('select * from businesses where id = ?', id);
  const set = (b, f) => b && db.run(`update businesses set ${Object.keys(f).map((k) => `${k} = ?`).join(', ')}, updated_at = ? where id = ?`, ...Object.values(f), nowIso(), b.id);
  db.tx(() => {
    if (ev.type === 'checkout.session.completed') {
      const b = byId(o.client_reference_id || o.metadata?.business_id);
      const plan = ['barberia', 'cadena'].includes(o.metadata?.plan) ? o.metadata.plan : 'barberia';
      set(b, { stripe_customer_id: o.customer, stripe_subscription_id: o.subscription, plan, plan_status: 'active' });
    } else if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
      const b = db.get('select * from businesses where stripe_subscription_id = ?', o.id) || byId(o.metadata?.business_id);
      const f = { plan_status: ev.type.endsWith('deleted') ? 'canceled' : STATUS[o.status] || 'active' };
      const plan = planForPrice(o.items?.data?.[0]?.price?.id);
      if (plan) f.plan = plan;
      set(b, f);
    } else if (ev.type === 'invoice.payment_failed') {
      set(db.get('select * from businesses where stripe_customer_id = ?', o.customer), { plan_status: 'past_due' });
    }
    db.insert('billing_events', { id: ev.id, type: ev.type });
  });
  return 'ok';
}
