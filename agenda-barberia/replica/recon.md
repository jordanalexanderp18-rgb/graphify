# Recon map: AgendaPro (web + app móvil)

Scope: el núcleo para barberías — reservas online, agenda por barbero, recordatorios, clientes, caja, comisiones, inventario y reportes.
For: producto propio de Jordan para vender a barberías en Latinoamérica.
Date: 2026-10-26

Solo fuentes públicas. No se usó ninguna cuenta, código, bundle JS ni API privada del original.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing barberías (ES) | https://agendapro.com/es/barberia/software-para-barberias | agenda 24/7, recordatorios email/WhatsApp/SMS, pagos online y POS, comisiones por profesional/servicio/producto |
| 2 | marketing barberías (MX) | https://agendapro.com/mx/barberia/app-para-barberia | propinas, ficha de cliente, caja multi-sucursal |
| 3 | marketing barberías (EN) | https://agendapro.com/en/barbershop/barber-software | recordatorios desde el mismo día hasta 3 días antes; email + WhatsApp combinables |
| 4 | funcionalidades | https://go.agendapro.com/lp/agendapro-funcionalidades-mx | sitio de reservas en Google, fichas, cuadre de caja, reportes de comisiones |
| 5 | software de citas (MX) | https://agendapro.com/mx/software-para-agendar-citas | disponibilidad por profesional/servicio/sede, anticipos, widget embebible, inventario |
| 6 | reportes | https://agendapro.com/br/reportes-de-gestion | ventas, inventario, comisiones, reservas, caja en tiempo real |
| 7 | ficha Google Play | https://play.google.com/store/apps/details?id=com.ionicframework.agendaproappiframe903400 | app de negocio 3.5★ (1.2k reseñas); ingresos diarios/semanales/mensuales, ocupación por profesional, servicios top, nuevos vs recurrentes |
| 8 | reseñas Capterra | https://www.capterra.com/p/218709/AgendaPro/reviews | 4.8★ (159), muchas incentivadas por el proveedor |

## Core loop

El cliente reserva solo por un enlace, recibe recordatorio por WhatsApp, llega, el barbero lo atiende y la recepción cobra; la comisión se calcula sola.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Registro / ingreso | /login | crear cuenta y negocio, entrar | form, input, button | empty, error |
| S02 | Agenda (día) | panel → Agenda | citas del día en columnas por barbero | time grid, appointment card, date picker, filtros | empty, filled, mobile |
| S03 | Agenda (semana) | Agenda → Semana | vista semanal de un barbero | time grid | filled |
| S04 | Modal de cita | clic en hueco o cita | crear/editar/cambiar estado | modal, select, search de cliente | new, edit, conflict error |
| S05 | Clientes | panel → Clientes | lista y búsqueda | table, search | empty, filled |
| S06 | Ficha de cliente | Clientes → fila | historial, notas, gasto total | tabs, list | filled |
| S07 | Servicios | Configuración → Servicios | catálogo con duración/precio | table, form | empty, filled |
| S08 | Equipo | Configuración → Profesionales | barberos, horario, servicios, comisión | table, weekly schedule editor | empty, filled |
| S09 | Caja / Punto de venta | panel → Caja | cobrar cita o venta suelta, propina, medio de pago | cart, totals, payment buttons | empty cart, filled, success |
| S10 | Cuadre de caja | Caja → Abrir/Cerrar | apertura, movimientos, cierre con diferencia | form, summary | closed, open |
| S11 | Inventario | panel → Productos | stock, precio, costo | table, badge stock bajo | empty, filled, low stock |
| S12 | Reportes | panel → Reportes | ventas, ocupación, servicios top, nuevos vs recurrentes | stat tiles, bar chart, date range | empty, filled |
| S13 | Comisiones | Reportes → Comisiones | comisión por barbero en rango | table, date range | filled |
| S14 | Configuración del negocio | panel → Configuración | datos, horario, políticas, enlace de reserva | form, copy link | filled |
| S15 | Sitio de reservas: servicio | /b/{slug} | elegir servicio | list cards | filled, closed business |
| S16 | Sitio de reservas: barbero y hora | /b/{slug} paso 2 | barbero o cualquiera, día, horas libres | day strip, slot chips | no slots |
| S17 | Sitio de reservas: datos | paso 3 | nombre, teléfono, email | form | error |
| S18 | Confirmación | paso 4 | resumen, añadir a calendario, enlace gestionar | summary | success |
| S19 | Gestionar reserva | /r/{token} | cancelar o reprogramar | summary, buttons | active, cancelled, too late |
| S20 | Recordatorios / mensajes | panel → Mensajes | cola de recordatorios enviados/pendientes | table | empty, filled |

## Flows

```
F01 Cliente reserva online
    S15 -> S16 -> S17 -> S18
    happy path clicks: 5 (servicio, barbero, día, hora, confirmar) + formulario
    edge: sin horas libres, hora tomada mientras llena el form, barbero sin ese servicio, fuera de anticipación mínima

F02 Cliente cancela o reprograma
    S19 -> S16 -> S18
    edge: dentro de la ventana de no-cancelación, cita ya pasada

F03 Recepción agenda por teléfono / walk-in
    S02 -> S04 (buscar o crear cliente) -> S02
    edge: solapamiento con otra cita, barbero fuera de horario

F04 Atender y cobrar
    S02 -> S04 (marcar atendida) -> S09 (agregar producto, propina, medio de pago) -> recibo
    edge: pago mixto, descuento, producto sin stock

F05 Cuadre de caja diario
    S10 abrir con fondo -> ventas del día -> S10 cerrar con conteo -> diferencia

F06 Pagar comisiones
    S13 rango de fechas -> total por barbero (servicios % + productos %)

F07 Recordatorio automático
    cita creada -> job programa recordatorio N horas antes -> WhatsApp/email -> S20 registro

F08 Configuración inicial
    S01 -> S14 -> S07 -> S08 -> copiar enlace de reservas
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | all |
| Input / Select / Textarea | text, tel, email, number, money | default, focus, error, disabled | S01, S04, S07-S11, S14, S17 |
| Time grid | day (columnas por barbero), week | empty, filled, now-line | S02, S03 |
| Appointment card | por estado (color) | default, hover, cancelled | S02, S03 |
| Modal | form, confirm | open, closing | S04, S08, S10 |
| Table | default, compact | empty, filled | S05, S07, S08, S11, S13, S20 |
| Stat tile | money, count, percent | default | S12 |
| Bar chart | horizontal | empty, filled | S12 |
| Slot chip | default, selected, disabled | | S16 |
| Day strip | | selected, closed | S16 |
| Toast | success, error | | all |
| Nav (sidebar / bottom en móvil) | | active | panel |
| Badge | estado de cita, stock bajo | | S02, S11 |

## Inferred data model

```
Business     id, name, slug, timezone, address, phone, opening hours, policies (min notice, cancel window, slot step)
             evidence: S14, S15 (enlace por negocio), fuente 5 "por sede"   confidence: high
User         id, business_id, email, password, role (owner|reception|barber), staff_id?
             evidence: roles implícitos en app de negocio   confidence: medium
Staff        id, business_id, name, photo, specialty, active, commission_service_pct, commission_product_pct
             evidence: fuente 1 "comisiones por profesional, servicio o producto"   confidence: high
StaffHours   staff_id, weekday, start, end (varias franjas por día = descanso)   confidence: high
TimeOff      staff_id, start_at, end_at, reason   confidence: high
Service      id, business_id, name, category, duration_min, price, active, online   confidence: high
StaffService staff_id, service_id   confidence: high
Client       id, business_id, name, phone, email, notes, tags, birthday   evidence: ficha de cliente   confidence: high
Appointment  id, business_id, staff_id, client_id, service_id, start_at, end_at, status, source (online|panel|walkin), price, token, notes
             confidence: high
Product      id, business_id, name, price, cost, stock, low_stock_at   evidence: fuente 5 inventario   confidence: high
Sale         id, business_id, client_id?, appointment_id?, staff_id?, subtotal, discount, tip, total, payment_method, register_id
SaleItem     sale_id, kind (service|product), ref_id, staff_id, qty, unit_price, commission_pct, commission_amount
CashRegister id, business_id, opened_at, opening_amount, closed_at, counted_amount, expected_amount
Reminder     id, appointment_id, channel (whatsapp|email|sms), send_at, status, sent_at, error
             evidence: fuente 3 "desde el mismo día hasta 3 días antes"   confidence: high
```

Relationships: Business 1-n Staff/Service/Client/Product/Appointment; Staff n-n Service; Appointment 1-n Reminder; Sale 1-n SaleItem; CashRegister 1-n Sale.

## Feature matrix

See `features.csv`. Must: 26, should: 12, could: 6, skip: 3.

## Out of scope (cannot or should not be cloned)

- Reserve with Google: requiere ser partner aprobado de Google.
- El marketplace de AgendaPro: es su red de usuarios.
- Facturación electrónica: regulada por país; se integra después con un proveedor certificado.
- Su marca, logo, textos y colores.

## Size

Screens 20, flows 8, entities 14. Hard parts: motor de disponibilidad con zonas horarias y sin dobles reservas; envío real de WhatsApp (requiere WhatsApp Business Platform con número verificado); pagos online (requiere cuenta Mercado Pago/Stripe del dueño). Size: M.
