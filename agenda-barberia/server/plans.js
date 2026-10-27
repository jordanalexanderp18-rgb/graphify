// Planes: qué puede usar cada barbería. La prueba de 30 días da el plan elegido;
// al vencer sin pagar, o al cancelar, queda en Gratis. Las sucursales usan el
// plan del negocio principal.
import { HttpError } from './db.js';

export const PLANS = {
  free: { label: 'Gratis', staff: 1 },
  barberia: { label: 'Barbería', staff: 5 },
  cadena: { label: 'Cadena', staff: Infinity },
};
export const TRIAL_DAYS = 30;

// Función -> plan mínimo que la incluye.
const NEEDS = {
  caja: 'barberia', comisiones: 'barberia', inventario: 'barberia', reportes: 'barberia',
  rebook: 'barberia', waitlist: 'barberia', roles: 'barberia', campanas: 'barberia', anticipos: 'barberia',
  sucursales: 'cadena', whatsapp_auto: 'cadena',
};
const RANK = { free: 0, barberia: 1, cadena: 2 };

export function effectivePlan(db, b, now = Date.now()) {
  const main = b.owner_business_id ? db.get('select * from businesses where id = ?', b.owner_business_id) || b : b;
  if (main.plan_status === 'canceled') return 'free';
  if (main.plan_status === 'trialing' && (!main.trial_ends_at || Date.parse(main.trial_ends_at) < now)) return 'free';
  return main.plan;
}

export const has = (db, b, feature) => RANK[effectivePlan(db, b)] >= RANK[NEEDS[feature] || 'free'];

export function requireFeature(db, b, feature) {
  if (!has(db, b, feature)) {
    throw new HttpError(402, `Esto es parte del plan ${PLANS[NEEDS[feature]].label}. Actívalo en Configuración → Plan.`, { feature, plan: NEEDS[feature] });
  }
}

export function checkStaffLimit(db, b, extra = 1) {
  const limit = PLANS[effectivePlan(db, b)].staff;
  const n = db.get('select count(*) n from staff where business_id = ? and active = 1', b.id).n;
  if (n + extra > limit) {
    throw new HttpError(402, `Tu plan permite ${limit} profesional${limit === 1 ? '' : 'es'} activo${limit === 1 ? '' : 's'}. Sube de plan para agregar más.`, { feature: 'staff' });
  }
}

export function planInfo(db, b) {
  const main = b.owner_business_id ? db.get('select * from businesses where id = ?', b.owner_business_id) || b : b;
  const eff = effectivePlan(db, b);
  return {
    plan: main.plan, status: main.plan_status, effective: eff, label: PLANS[eff].label,
    trial_ends_at: main.trial_ends_at, staff_limit: Number.isFinite(PLANS[eff].staff) ? PLANS[eff].staff : null,
    features: Object.fromEntries(Object.keys(NEEDS).map((f) => [f, RANK[eff] >= RANK[NEEDS[f]]])),
    is_branch: !!b.owner_business_id, billing_enabled: !!process.env.STRIPE_SECRET_KEY,
    has_subscription: !!main.stripe_subscription_id,
  };
}
