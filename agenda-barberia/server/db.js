// Capa de datos: abre SQLite, aplica el esquema y expone helpers.
// Regla: toda consulta de datos de un negocio lleva business_id en el where.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  db.exec(schema);
  migrate(db);
  db.exec(schema); // índices de tablas reconstruidas por la migración
  return wrap(db);
}

// Columnas agregadas después de la primera versión: se suman a bases existentes.
const ADDED = [
  ['businesses', 'phone_prefix', "text not null default '56'"],
  ['staff', 'photo', "text not null default ''"],
  ['staff_services', 'duration_min', 'integer check (duration_min between 5 and 480)'],
  ['appointments', 'group_id', 'text'],
  ['businesses', 'deposit_instructions', "text not null default ''"],
  ['businesses', 'payment_link', "text not null default ''"],
  ['businesses', 'message_channel', "text not null default 'whatsapp'"],
  ['businesses', 'plan', "text not null default 'barberia'"],
  ['businesses', 'plan_status', "text not null default 'trialing'"],
  ['businesses', 'trial_ends_at', 'text'],
  ['businesses', 'stripe_customer_id', 'text'],
  ['businesses', 'stripe_subscription_id', 'text'],
  ['businesses', 'owner_business_id', 'text'],
  ['clients', 'marketing_opt_out', 'integer not null default 0'],
  ['appointments', 'deposit', 'integer not null default 0'],
  ['appointments', 'deposit_status', "text not null default 'none'"],
  ['sales', 'prepaid', 'integer not null default 0'],
  ['sessions', 'business_id', 'text'],
  ['businesses', 'vertical', "text not null default 'barberia'"],
  ['services', 'return_days', 'integer'],
  ['appointments', 'return_days', 'integer'],
];
function migrate(db) {
  for (const [table, col, def] of ADDED) {
    const cols = db.prepare(`pragma table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) db.exec(`alter table ${table} add column ${col} ${def}`);
  }
  // reminders.kind ganó 'campaign': SQLite no altera un CHECK, se reconstruye la tabla.
  const rem = db.prepare("select sql from sqlite_master where name = 'reminders'").get();
  if (rem && !rem.sql.includes("'campaign'")) {
    db.exec(`begin; alter table reminders rename to reminders_old;
      ${rem.sql.replace("'cancelled')", "'cancelled','campaign')")};
      insert into reminders select * from reminders_old; drop table reminders_old; commit;`);
  }
}

function wrap(db) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const clean = (row) => (row ? { ...row } : row);
  let depth = 0;
  return {
    raw: db,
    get: (sql, ...p) => clean(stmt(sql).get(...p)),
    all: (sql, ...p) => stmt(sql).all(...p).map(clean),
    run: (sql, ...p) => stmt(sql).run(...p),
    // Transacción de escritura. IMMEDIATE toma el candado de escritura al
    // empezar, así dos reservas simultáneas se serializan.
    tx(fn) {
      if (depth > 0) return fn();
      db.exec('begin immediate');
      depth++;
      try {
        const out = fn();
        db.exec('commit');
        return out;
      } catch (e) {
        db.exec('rollback');
        throw e;
      } finally {
        depth--;
      }
    },
    insert(table, row) {
      const keys = Object.keys(row);
      stmt(`insert into ${table} (${keys.join(',')}) values (${keys.map(() => '?').join(',')})`)
        .run(...keys.map((k) => row[k]));
      return row;
    },
    update(table, id, businessId, fields) {
      const keys = Object.keys(fields);
      if (!keys.length) return;
      const where = businessId ? 'id = ? and business_id = ?' : 'id = ?';
      const params = [...keys.map((k) => fields[k]), id];
      if (businessId) params.push(businessId);
      return stmt(`update ${table} set ${keys.map((k) => `${k} = ?`).join(', ')} where ${where}`).run(...params);
    },
    close: () => db.close(),
  };
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
