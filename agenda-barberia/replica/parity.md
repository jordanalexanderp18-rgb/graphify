## Parity: 89.4 / 100

features 89.4  (44 counted, must-haves 24 of 26 done)

Not shippable yet: 2 must-have features are not done.

## By area, weakest first
- pagos                          0.0  (2 features)
- marketing                      0.0  (1 features)
- sucursales                     0.0  (1 features)
- notificaciones                44.4  (4 features)
- plataforma                    50.0  (1 features)
- integraciones                 50.0  (1 features)
- onboarding                   100.0  (2 features)
- servicios                    100.0  (1 features)
- equipo                       100.0  (5 features)
- agenda                       100.0  (6 features)
- reservas online              100.0  (6 features)
- clientes                     100.0  (3 features)
- caja                         100.0  (5 features)
- comisiones                   100.0  (2 features)
- inventario                   100.0  (2 features)
- reportes                     100.0  (2 features)

## Missing, in build order
- [must] notificaciones: Confirmación de cita al cliente, partial  (igual que recordatorios: automática con claves, un toque sin ellas)
- [must] notificaciones: Recordatorio automático por WhatsApp, partial  (se programa y envía solo con WhatsApp Cloud API (claves de Meta del dueño); sin claves queda en Mensajes para enviar con un toque)
- [should] pagos: Pago online o anticipo al reservar, no  (campo de anticipo en servicios existe; falta pasarela (Mercado Pago/Stripe con cuenta del dueño))
- [should] notificaciones: Recordatorio por email, partial  (adaptador Resend listo; requiere RESEND_API_KEY)
- [should] plataforma: App móvil (uso desde el celular), partial  (web responsive instalable (PWA); sin app nativa en tiendas)
- [could] marketing: Campañas de email marketing, no  (hay "te toca corte" automático; campañas masivas pendientes)
- [could] notificaciones: Recordatorio por SMS, no  (pendiente: proveedor SMS por país)
- [could] pagos: Terminal POS bancaria integrada, no  (se registra el cobro con tarjeta; sin integración con terminal)
- [could] sucursales: Multi-sucursal, no  (un negocio por cuenta)
- [could] integraciones: Integración Google Calendar, partial  (el cliente agrega su cita a Google Calendar o .ics; sin sincronización del barbero)

## Left out on purpose (not scored)
- Reservar con Google (Reserve with Google): requiere ser partner aprobado de Google; no es parte del producto que se puede reconstruir
- Marketplace de AgendaPro: es la red y los usuarios del original
- Facturación electrónica por país: regulado por país (SII/SAT/DIAN); se integra con un proveedor certificado después

## Yours, not in the original (not scored)
- Reservar varios servicios en una visita (carrito)
- Un solo recordatorio por visita y no por servicio
- Duración del servicio distinta por barbero
- Aviso automático "te toca corte" según última visita
- Mensajes de WhatsApp sin límite ni costo por mensaje
- Cuadre de caja con desglose por medio de pago y diferencia
- Cliente agrega su cita a Google Calendar o .ics
- Lista de espera cuando el día está lleno

## Veredicto

**Aún no se puede lanzar con cobro automático**, pero ya sirve para usarlo en una barbería real.

- Las 2 funciones obligatorias que faltan son el envío automático de WhatsApp (confirmación y recordatorio). El código está hecho, pero necesita la cuenta de WhatsApp Business del dueño y plantillas aprobadas por Meta. Mientras tanto se envían con un toque.
- No hay bugs S1/S2 abiertos.
- 8 mejoras que el original no tiene, sacadas de reseñas reales (`fixes.md`).
- No hubo comparación visual de layout contra el original: no se guardaron capturas suyas (`replica/screens/` vacío). Solo se trabajó con fuentes públicas de texto.

## Próximos 5 a construir

1. Conectar WhatsApp Business (plantillas Meta) → cierra las 2 obligatorias.
2. Anticipo y pago online (Mercado Pago / Stripe con la cuenta del dueño).
3. Suscripción y límites por plan (`launch/pricing.md`).
4. Email marketing / campañas a segmentos.
5. Multi-sucursal.
