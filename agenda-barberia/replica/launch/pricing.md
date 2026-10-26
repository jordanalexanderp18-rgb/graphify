# Precios

## Referencias públicas (leídas el 2026-10-26)

| producto | precio | fuente |
| --- | --- | --- |
| AgendaPro (MX) | Básico $299 MXN/mes, Premium $1500 MXN/mes; anual −20% | blog del propio AgendaPro, 2025-10-11: https://agendapro.com/blog/agendapro-vs-booksy/ (puede estar desactualizado) |
| Booksy (UK) | £40 + IVA/mes, +£5 por miembro extra | https://biz.booksy.com/en-gb/comparison/fresha-comparison (comparación hecha por Booksy, al 11/06/2026) |
| Fresha (UK) | £14.95 + IVA/mes, +£9.95 por miembro; 20% de comisión en el primer cliente nuevo | misma fuente (la comparación la publica un competidor) |

## Lo que dicen los usuarios sobre el precio (de `feedback.md`)

- Funciones y mensajes cobrados aparte: 5 reseñas sobre precio y 6 sobre WhatsApp limitado o cobrado aparte, de Capterra.
- Pagos y abonos engorrosos: 11 reseñas.

## Modelo

Precio fijo por barbería y no por mensaje. Sin cargos ocultos y cancelación con un clic.

| plan | para quién | precio | incluye |
| --- | --- | --- | --- |
| Gratis | barbero independiente | US$0 | 1 barbero, reservas online, mensajes con un toque sin límite, clientes |
| Barbería | 2 a 5 barberos | US$15/mes · US$150/año | caja, comisiones, inventario, reportes, "te toca corte", lista de espera, roles |
| Cadena | 6+ barberos | US$29/mes · US$290/año | barberos ilimitados, WhatsApp automático con la cuenta Business del dueño, soporte prioritario |

## En el producto

- Prueba de 30 días al registrarse. Al vencer sin pago, la cuenta pasa a Gratis (1 barbero, sin caja ni reportes) sin perder datos.
- Límites por plan aplicados en el servidor: barberos activos, caja, comisiones, inventario, reportes, "te toca corte", lista de espera, campañas, anticipos y roles (Barbería); sucursales y WhatsApp automático (Cadena).
- Cobro con Stripe Checkout, cambio de tarjeta y cancelación con un clic en el Customer Portal, y webhooks firmados e idempotentes (`server/billing.js`). Se activa con las claves de `.env.example` (ver `replica/deploy.md`).
