# Architecture: app de agenda para barberías (reconstrucción de las funciones núcleo de AgendaPro)

## Stack

Este stack se aparta a propósito del que recomienda el pack (Next.js + Supabase).
La app tiene que correr con un solo comando, sin cuentas ni claves, en cualquier
VPS de 5 USD o en una PC de la barbería. Por eso usa cero dependencias de npm.

| layer | choice | why |
| --- | --- | --- |
| web | Node 22, `node:http`, SPA en JavaScript puro (módulos ES) | cero `npm install`; un solo proceso sirve la API y los archivos estáticos |
| styling | CSS con tokens (`public/css/tokens.css`) | replica-brand solo cambia valores; ningún componente usa hex directo |
| mobile | web responsive instalable (PWA: manifest + viewport) | la recepción y los barberos lo usan desde el celular sin pasar por tiendas |
| database | SQLite vía `node:sqlite`, archivo `data/app.db`, WAL | una base, cero administración, respaldo = copiar un archivo; migrable a Postgres después (SQL estándar) |
| auth | email + contraseña (scrypt de `node:crypto`), sesión en cookie httpOnly SameSite=Lax | sin proveedor externo; tokens de sesión guardados como sha256 |
| payments | caja local (efectivo, tarjeta, transferencia); adaptador de pago online por variables de entorno | cobrar en línea requiere la cuenta Mercado Pago/Stripe del dueño |
| WhatsApp | adaptador: WhatsApp Business Cloud API si hay `WHATSAPP_TOKEN`, si no, cola "manual" con enlace wa.me de un toque | funciona desde el día 1 sin aprobación de Meta |
| email | adaptador SMTP-less: Resend vía HTTPS si hay `RESEND_API_KEY`, si no queda registrado | igual que arriba |
| jobs | bucle en proceso cada 60 s (`server/jobs.js`), idempotente | un solo proceso; sin cron externo |
| hosting | cualquier host con Node 22 (Fly, Render, Railway, VPS) + volumen para `data/` | |

## Schema

Tablas: 16 (ver `db/schema.sql`, se aplica al iniciar). Acceso: controlado en la capa de datos.
Cada handler obtiene `business_id` de la sesión y toda consulta lo incluye en el `where`.
Las rutas públicas solo resuelven por `slug` o `token`.

## API

Todas bajo `/api`. JSON. "owner+" = owner o reception; "staff" = cualquier usuario del negocio.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /auth/signup | crea negocio + dueño + datos de ejemplo opcionales | público | business, name, email, password | user, business | F08 |
| POST /auth/login | inicia sesión | público | email, password | user | F08 |
| POST /auth/logout | cierra sesión | staff | – | ok | – |
| GET /me | sesión actual + negocio | staff | – | user, business | – |
| PUT /business | datos y políticas | owner | campos | business | F08 |
| GET/POST /services, PUT/DELETE /services/:id | catálogo | GET staff, resto owner | name, duration, price… | service | F08 |
| GET/POST /staff, PUT/DELETE /staff/:id | barberos, horario, servicios, comisión | GET staff, resto owner | name, hours[], service_ids[] | staff | F08 |
| POST /staff/:id/time-off, DELETE /time-off/:id | bloqueos | owner+ | start_at, end_at | time_off | F03 |
| GET /appointments?from&to&staff_id | agenda | staff (barbero: solo las suyas) | rango | appointments[] | F03 |
| POST /appointments | crea cita (panel / walk-in) | owner+ | staff, service, client, start | appointment | F03 |
| PUT /appointments/:id | mueve / edita | owner+ | campos | appointment | F03 |
| POST /appointments/:id/status | confirmada, atendida, no-show, cancelada | staff | status | appointment | F04 |
| GET /availability?service_id&staff_id&date | huecos libres (panel) | staff | – | slots[] | F03 |
| GET /clients?q, POST /clients, GET/PUT /clients/:id | CRM | staff | – | client + historial | F03 |
| POST /clients/import | CSV nombre,teléfono,email | owner | csv | imported, skipped | F08 |
| GET/POST /products, PUT /products/:id | inventario | GET staff, resto owner | – | product | F04 |
| GET /register, POST /register/open, POST /register/close | caja | owner+ | amount | register + resumen | F05 |
| POST /sales, GET /sales?from&to | cobrar / listado | owner+ | items[], discount, tip, method | sale | F04 |
| GET /reports/summary?from&to | ventas, citas, ocupación, top, nuevos vs recurrentes, no-show | owner | rango | report | – |
| GET /reports/commissions?from&to | comisión por barbero | owner | rango | rows[] | F06 |
| GET /reminders, POST /reminders/:id/sent | cola de mensajes | owner+ | – | reminders[] | F07 |
| GET /waitlist, POST /waitlist/:id/status | lista de espera | owner+ | – | rows[] | – |
| GET /public/:slug | negocio, servicios online, barberos | público | – | info | F01 |
| GET /public/:slug/slots?service_id&staff_id&date | horas libres | público | – | slots[] | F01 |
| GET /public/:slug/days?service_id&staff_id | días con disponibilidad (14 días) | público | – | days[] | F01 |
| POST /public/:slug/book | reserva | público (rate limit) | service, staff/any, start, name, phone, email | token | F01 |
| POST /public/:slug/waitlist | anotarse si no hay hora | público (rate limit) | service, day, name, phone | ok | – |
| GET /public/r/:token | ver reserva | quien tenga el token | – | appointment | F02 |
| POST /public/r/:token/cancel | cancelar | token | – | ok | F02 |
| POST /public/r/:token/reschedule | reprogramar | token | start, staff? | appointment | F02 |

Webhooks in: ninguno en esta versión (pago online queda para cuando el dueño conecte su cuenta).
Webhooks out: ninguno.
Jobs: `reminders` cada 60 s: envía pendientes vencidos por el adaptador; reintenta 3 veces; los fallidos quedan en `failed` con error (registro de cartas muertas).
`rebook` cada 60 s, una vez al día por negocio: clientes cuya última visita supera `rebook_days` y no tienen cita futura reciben "te toca corte".

## The parts that bite

- time zones: el negocio tiene `timezone`; los horarios del barbero son minutos locales; los huecos se calculan en hora local y se convierten a UTC con `Intl` (correcto también en cambios de horario de verano: se re-resuelve el offset por cada instante).
- idempotency: el job marca `attempts` y `status` en la misma transacción antes de enviar; un reinicio no duplica envíos de los ya marcados `sent`.
- races: la reserva corre en `BEGIN IMMEDIATE` (SQLite serializa escritores) y vuelve a verificar solapamiento antes de insertar: dos clientes no pueden quedarse con la misma hora.
- rate limits: reservas públicas y login limitados por IP (ventana en memoria).
- multi-tenancy: `business_id` en todas las tablas de negocio y en cada `where`; test con un segundo negocio.
- dinero: enteros; el descuento se prorratea en las líneas para que la comisión se calcule sobre lo cobrado.
- GDPR / datos personales: borrar un cliente borra sus mensajes; las citas se anonimizan.

## Build order

1. Vertical slice: S14/S07/S08 (config mínima) → S15-S18 (reserva pública) → S02 (aparece en la agenda). Tablas businesses, staff, staff_hours, services, clients, appointments.
2. Must-haves: S04 modal de cita y estados, S05/S06 clientes, S09/S10 caja, S13 comisiones, S12 reportes, recordatorios (S20), S19 gestionar reserva.
3. Should-haves: semana (S03), inventario (S11), propinas, descuentos, importar CSV, roles.
4. Fixes de replica-entrepreneur: ver `replica/entrepreneur.md`.
