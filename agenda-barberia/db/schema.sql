-- Esquema de la base de datos. SQLite (node:sqlite), un archivo por instalación.
-- Ids: uuid en texto. Horas: ISO-8601 en UTC. Dinero: entero en unidades
-- menores (centavos; para CLP o COP una unidad = 1) + businesses.currency.
-- Acceso: cada consulta del servidor filtra por business_id de la sesión
-- (control en la capa de datos, ver server/db.js).

pragma foreign_keys = on;

create table if not exists businesses (
  id text primary key,
  name text not null,
  slug text not null unique,
  vertical text not null default 'barberia',  -- rubro (server/verticals.js)
  timezone text not null default 'America/Santiago',
  currency text not null default 'CLP',
  phone_prefix text not null default '56',   -- código de país para WhatsApp
  phone text not null default '',
  address text not null default '',
  instagram text not null default '',
  -- reglas de reserva online
  slot_step_min integer not null default 15 check (slot_step_min between 5 and 60),
  min_notice_min integer not null default 60 check (min_notice_min >= 0),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  cancel_window_min integer not null default 120 check (cancel_window_min >= 0),
  reminder_hours integer not null default 24 check (reminder_hours between 1 and 72),
  rebook_days integer not null default 28 check (rebook_days between 7 and 120),
  -- anticipo: instrucciones de transferencia y/o enlace de pago propio (Mercado Pago, etc.)
  deposit_instructions text not null default '',
  payment_link text not null default '',
  message_channel text not null default 'whatsapp' check (message_channel in ('whatsapp','sms')),
  -- suscripción
  plan text not null default 'barberia' check (plan in ('free','barberia','cadena')),
  plan_status text not null default 'trialing' check (plan_status in ('trialing','active','past_due','canceled')),
  trial_ends_at text,
  stripe_customer_id text,
  stripe_subscription_id text,
  owner_business_id text,              -- sucursal: id del negocio principal (para facturar una vez)
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists staff (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  specialty text not null default '',
  color text not null default 'c1',
  photo text not null default '',      -- data URL (jpeg/png/webp, máx. ~300 KB)
  phone text not null default '',
  active integer not null default 1 check (active in (0,1)),
  commission_service_pct integer not null default 40 check (commission_service_pct between 0 and 100),
  commission_product_pct integer not null default 10 check (commission_product_pct between 0 and 100),
  sort integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists staff_business on staff (business_id);

create table if not exists users (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  email text not null unique collate nocase,
  name text not null default '',
  password_hash text not null,
  role text not null default 'owner' check (role in ('owner','reception','barber')),
  staff_id text references staff(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists users_business on users (business_id);

create table if not exists sessions (
  id text primary key,          -- sha256 del token; el token solo vive en la cookie
  user_id text not null references users(id) on delete cascade,
  business_id text,             -- sucursal activa (si el usuario tiene varias)
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists sessions_user on sessions (user_id);

-- Franjas semanales. Varias por día = descanso entre ellas. weekday 0 = domingo.
create table if not exists staff_hours (
  id text primary key,
  staff_id text not null references staff(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_min integer not null check (start_min between 0 and 1439),
  end_min integer not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);
create index if not exists staff_hours_staff on staff_hours (staff_id, weekday);

create table if not exists time_off (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  staff_id text not null references staff(id) on delete cascade,
  start_at text not null,
  end_at text not null,
  reason text not null default '',
  check (end_at > start_at)
);
create index if not exists time_off_staff on time_off (staff_id, start_at);

create table if not exists services (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  category text not null default '',
  description text not null default '',
  duration_min integer not null check (duration_min between 5 and 480),
  buffer_min integer not null default 0 check (buffer_min between 0 and 120),
  price integer not null check (price >= 0),
  deposit integer not null default 0 check (deposit >= 0),
  return_days integer check (return_days between 1 and 365),  -- días sugeridos para volver
  online integer not null default 1 check (online in (0,1)),
  active integer not null default 1 check (active in (0,1)),
  sort integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists services_business on services (business_id);

create table if not exists staff_services (
  staff_id text not null references staff(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  duration_min integer check (duration_min between 5 and 480),  -- null = la del servicio
  primary key (staff_id, service_id)
);
create index if not exists staff_services_service on staff_services (service_id);

create table if not exists clients (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  phone text not null default '',     -- normalizado a solo dígitos
  email text not null default '',
  notes text not null default '',
  tags text not null default '',
  birthday text not null default '',  -- MM-DD
  marketing_opt_out integer not null default 0 check (marketing_opt_out in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists clients_business on clients (business_id, name);
create unique index if not exists clients_phone on clients (business_id, phone) where phone <> '';

create table if not exists appointments (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  staff_id text not null references staff(id) on delete restrict,
  client_id text not null references clients(id) on delete restrict,
  service_id text not null references services(id) on delete restrict,
  start_at text not null,
  end_at text not null,                -- incluye el buffer del servicio
  status text not null default 'booked'
    check (status in ('booked','confirmed','done','no_show','cancelled')),
  source text not null default 'panel' check (source in ('online','panel','walkin')),
  price integer not null check (price >= 0),
  notes text not null default '',
  token text not null unique,          -- enlace de gestión para el cliente
  sale_id text,
  group_id text,                       -- visita con varios servicios: id de la primera cita
  deposit integer not null default 0,  -- anticipo pedido
  return_days integer,                 -- aviso de regreso programado a N días (null = sin aviso)
  deposit_status text not null default 'none' check (deposit_status in ('none','pending','paid')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (end_at > start_at)
);
create index if not exists appointments_staff_time on appointments (staff_id, start_at);
create index if not exists appointments_business_time on appointments (business_id, start_at);
create index if not exists appointments_client on appointments (client_id);
create index if not exists appointments_group on appointments (group_id) where group_id is not null;

create table if not exists products (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  name text not null,
  sku text not null default '',
  price integer not null check (price >= 0),
  cost integer not null default 0 check (cost >= 0),
  stock integer not null default 0,
  low_stock_at integer not null default 3,
  active integer not null default 1 check (active in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists products_business on products (business_id);

create table if not exists cash_registers (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  opened_by text references users(id) on delete set null,
  opened_at text not null,
  opening_amount integer not null default 0,
  closed_at text,
  counted_amount integer,
  expected_amount integer,
  notes text not null default ''
);
create index if not exists cash_registers_business on cash_registers (business_id, opened_at);
-- una sola caja abierta por negocio
create unique index if not exists cash_registers_one_open on cash_registers (business_id) where closed_at is null;

create table if not exists sales (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  register_id text references cash_registers(id) on delete set null,
  client_id text references clients(id) on delete set null,
  appointment_id text references appointments(id) on delete set null,
  subtotal integer not null,
  discount integer not null default 0 check (discount >= 0),
  tip integer not null default 0 check (tip >= 0),
  tip_staff_id text references staff(id) on delete set null,
  prepaid integer not null default 0 check (prepaid >= 0),  -- anticipo ya recibido, se descuenta del total
  total integer not null,
  payment_method text not null check (payment_method in ('cash','card','transfer','online')),
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists sales_business_time on sales (business_id, created_at);

create table if not exists sale_items (
  id text primary key,
  sale_id text not null references sales(id) on delete cascade,
  kind text not null check (kind in ('service','product')),
  ref_id text not null,
  name text not null,
  staff_id text references staff(id) on delete set null,
  qty integer not null default 1 check (qty > 0),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null,         -- después del descuento prorrateado
  commission_pct integer not null default 0,
  commission_amount integer not null default 0
);
create index if not exists sale_items_sale on sale_items (sale_id);
create index if not exists sale_items_staff on sale_items (staff_id);

create table if not exists reminders (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  appointment_id text references appointments(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  kind text not null check (kind in ('confirmation','reminder','rebook','cancelled','campaign')),
  channel text not null check (channel in ('whatsapp','email','sms')),
  send_at text not null,
  status text not null default 'pending' check (status in ('pending','sent','manual','failed','skipped')),
  body text not null default '',
  attempts integer not null default 0,
  sent_at text,
  error text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists reminders_due on reminders (status, send_at);
create index if not exists reminders_business on reminders (business_id, send_at);

create table if not exists waitlist (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  service_id text references services(id) on delete set null,
  staff_id text references staff(id) on delete set null,
  day text not null,                   -- YYYY-MM-DD en hora local del negocio
  status text not null default 'waiting' check (status in ('waiting','notified','booked','removed')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists waitlist_day on waitlist (business_id, day, status);

-- Sucursales: un usuario puede trabajar en varios negocios.
create table if not exists memberships (
  user_id text not null references users(id) on delete cascade,
  business_id text not null references businesses(id) on delete cascade,
  role text not null check (role in ('owner','reception','barber')),
  staff_id text references staff(id) on delete set null,
  primary key (user_id, business_id)
);
create index if not exists memberships_business on memberships (business_id);

-- Eventos de Stripe ya procesados (los webhooks llegan repetidos).
create table if not exists billing_events (
  id text primary key,
  type text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
