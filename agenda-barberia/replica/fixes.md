# Fixes: lo que los usuarios del original odian, piden y no tienen resuelto

Muestra: **68 reseñas, 2 fuentes**. Son 67 de Capterra (páginas 1 a 3 de 159; muchas fueron invitadas por el proveedor con incentivo, así que están sesgadas a lo positivo, con promedio de 4.8) y 1 de Google Play (la app de negocio tiene 3.5★ con unas 1.2 mil reseñas que no pudimos leer una por una). Todos los temas salen "thin" (una sola fuente) menos el de la app móvil. Esto es una señal y no una tendencia probada. Los datos crudos están en `reviews.csv` y el ranking en `feedback.md`.

## 1. Lo que odian

| # | problema | reseñas | fuentes | cita |
| --- | --- | --- | --- | --- |
| 1 | App móvil lenta o que falla | 12 | 2 | "Otra es la App que es un poco lenta." ([Capterra](https://www.capterra.com/p/218709/AgendaPro/reviews)) · "no sirve nunca." ([Google Play](https://play.google.com/store/apps/details?id=com.ionicframework.agendaproappiframe903400)) |
| 2 | Pagos y abonos que fallan o son engorrosos | 11 | 1 | "la manera en que funciona lo del apartado y abonos y que seguido no funciona la plataforma para que los pagos de abonos pasen" ([Capterra p2](https://www.capterra.com/p/218709/AgendaPro/reviews?page=2)) |
| 3 | Mensajes de WhatsApp limitados y cobrados aparte | 6 | 1 | "Que los mensajes de whatsapp se tengan que comprar aparte. Los que tiene incluídos son muy pocos y siempre termino comprando más." ([Capterra p2](https://www.capterra.com/p/218709/AgendaPro/reviews?page=2)) |
| 4 | Funciones cobradas aparte / precio | 5 | 1 | "cambia mucho tiene algunas limitacioneste obliga a pagar muchas funciones que deberian venir como parte del programa" ([Capterra p3](https://www.capterra.com/p/218709/AgendaPro/reviews?page=3)) |
| 5 | Cuadre de caja poco claro | 3 | 1 | "el manejo de caja, no te da el exacto de cuando tendrás en caja teniendo en cuenta que el pago con tarjeta o tranferencia no lo encontraremos asi que se debe realizar el cote del día de manera manual" ([Capterra p3](https://www.capterra.com/p/218709/AgendaPro/reviews?page=3)) |

## 2. Lo que falta

| # | pedido | reseñas | cita |
| --- | --- | --- | --- |
| 1 | Reservar varios servicios juntos | 5 | "Que no se puede reservar varios servicios, como un carrito de compra." ([Capterra p2](https://www.capterra.com/p/218709/AgendaPro/reviews?page=2)) |
| 2 | Reactivar clientes que no volvieron | 2 | "debería enviar mensajes de recordatorio personalizado a los clientes, ejemplo "Hola XXXX, La ultima vez que viniste fue el dìa 1 del mes XXX, es hora de una nueva cita"" ([Capterra p2](https://www.capterra.com/p/218709/AgendaPro/reviews?page=2)) |
| 3 | Cita en el calendario del cliente | 3 | "debería poder aparecerle en el google calendar al cliente" ([Capterra p3](https://www.capterra.com/p/218709/AgendaPro/reviews?page=3)) |
| 4 | Duración distinta por barbero | 1 (thin) | "no se puede dar tiempos de servicios independientes por cada barbero, por ejemplo hay barberos que cortan en 20 minutos y otros por lo mismo se demoran 1 hora" ([Capterra](https://www.capterra.com/p/218709/AgendaPro/reviews)) |
| 5 | Un recordatorio por cliente, no por servicio | 1 (thin) | "en los recordatorios de múltiples servicios que es común en una estética o salón se envía el recordatorio por servicio y no por cliente" ([Capterra p3](https://www.capterra.com/p/218709/AgendaPro/reviews?page=3)) |

## 3. Lo que no resuelve

- **El dueño de barbería que quiere ver la plata desde el celular.** "soy dueño de barbería y necesito estar pendiente de los flujos de dinero, agenda completa (no por barbero) etc." ([Capterra p3](https://www.capterra.com/p/218709/AgendaPro/reviews?page=3)). 1 reseña (thin).
- **Negocios que no están en Chile.** "el sistema de abonos de la membresia es dificultoso para quienes no somos de chile" y "Solo que ni tienen la moneda de Costa Rica" ([Capterra p2](https://www.capterra.com/p/218709/AgendaPro/reviews?page=2)). Son 2 reseñas (thin).

## Plan de mejoras (hecho en esta sesión)

| fix | qué se construyó | tamaño | estado |
| --- | --- | --- | --- |
| Mensajes sin límite | Sin claves, cada mensaje queda en "Mensajes" con el texto listo y un toque lo envía por el WhatsApp del local, sin costo por mensaje. Con la cuenta Meta del dueño se envían solos y el dueño le paga a Meta directo, sin recargo nuestro. | S | hecho |
| Varios servicios en una visita | Selección múltiple (hasta 4), mismo barbero, uno tras otro, un solo enlace para cambiar o cancelar, un solo recordatorio y un solo cobro. | M | hecho |
| Duración por barbero | Cada barbero puede tener su propia duración por servicio. Las horas libres se calculan con ella. | S | hecho |
| "Te toca corte" | Aviso automático cuando un cliente pasa N días sin volver y no tiene cita futura. Se manda una vez por ciclo. | S | hecho |
| Caja exacta | Cierre con fondo + efectivo esperado, desglose por medio de pago y diferencia al instante. | S | hecho |
| Calendario del cliente | Botones "Agregar a Google Calendar" y descargar .ics en la confirmación. | S | hecho |
| App rápida en el celular | Web instalable sin dependencias. Ver el peso medido en `launch/landing.md`. | S | hecho |
| Cualquier país | Moneda, zona horaria y código de WhatsApp por negocio desde el registro. | S | hecho |

Pendiente (no hecho): cobro de anticipo en línea (Mercado Pago/Stripe con la cuenta del dueño), SMS, campañas masivas y multi-sucursal.

## El ángulo

1. **Para barberías que pagan de más por cada WhatsApp:** Silla Llena manda confirmaciones, recordatorios y "te toca corte" sin límite y sin cobrar por mensaje. Evidencia: tema "mensajes", 6 reseñas.
2. **Para el dueño que quiere la caja y la plata claras:** cierre de caja con diferencia exacta y comisiones calculadas solas. Evidencia: tema "caja", 3 reseñas, más pagos con 11.
3. **Para barberías con combos y barberos de distinto ritmo:** varios servicios en una visita y duración por barbero. Evidencia: 5 + 1 reseñas.

**Recomendado: el 1** ("mensajes sin límite"). Es la queja más concreta y fácil de entender, y conecta con lo que más le importa a una barbería: que la silla no quede vacía. Los otros dos se usan como funciones de apoyo.
