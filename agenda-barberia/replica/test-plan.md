# Plan de pruebas: Silla Llena

Entorno: local, datos de ejemplo. Automático = `npm test` (API, node:test) y `npm run e2e` (Chromium con Playwright, falla ante errores de consola o respuestas 5xx).

| caso | flujo | tipo | esperado | auto | resultado |
| --- | --- | --- | --- | --- | --- |
| F08-H1 | registro | feliz | crea negocio, sesión y datos de ejemplo | api + e2e | pasa |
| F08-N1 | registro | negativo: correo repetido | 409 | api | pasa |
| F08-N2 | login | negativo: clave mala | 401, sin datos sin sesión | api | pasa |
| F01-H1 | reserva online | feliz (celular 390 px) | confirmación y aparece en la agenda | api + e2e | pasa |
| F01-E1 | reserva online | misma hora dos veces | 409, la hora desaparece | api | pasa |
| F01-E2 | reserva online | 4 reservas simultáneas a la misma hora | solo 1 gana | api | pasa |
| F01-E3 | reserva online | "me da igual" a una hora tomada | se asigna otro barbero | api | pasa |
| F01-E4 | reserva online | descanso 14-15 | no ofrece horas | api | pasa |
| F01-E5 | reserva online | varios servicios | seguidos, mismo barbero, 1 recordatorio, precio total | api + e2e | pasa |
| F01-E6 | reserva online | duración por barbero | horas libres según el barbero | api | pasa |
| F01-E7 | reserva online | solo teclado | se completa | e2e | pasa |
| F01-N1 | reserva online | sin teléfono / pasado / fuera de horario / slug inexistente | 400 / 409 / 409 / 404 | api | pasa |
| F02-H1 | reprogramar | feliz, incluso cruzándose con su propia hora | se mueve, recordatorios rehechos | api + e2e | pasa |
| F02-H2 | cancelar | feliz | cancelada, la hora vuelve a estar libre | api + e2e | pasa |
| F02-N1 | cancelar | cita ya atendida | no se ofrece cancelar | e2e | pasa |
| F03-H1 | cita desde panel | feliz, cliente nuevo | aparece en agenda | api + e2e | pasa |
| F03-N1 | cita desde panel | solapamiento / fuera de horario | 409 con mensaje claro; "forzar" solo salta el horario | api + e2e | pasa |
| F04-H1 | cobrar | servicio + producto + descuento + propina | totales, comisión sobre lo cobrado, stock descontado, cita atendida | api + e2e | pasa |
| F04-N1 | cobrar | dos veces / efectivo sin caja / sin stock | 409 | api | pasa |
| F04-H2 | anular venta | visita con varios servicios | stock y citas vuelven atrás | api | pasa |
| F05-H1 | cuadre de caja | abrir, vender, cerrar | efectivo esperado y diferencia | api + e2e | pasa |
| F06-H1 | comisiones | rango de fechas | comisión + propinas por barbero | api + e2e | pasa |
| F07-H1 | recordatorios | sin claves de WhatsApp | quedan como "por enviar" con enlace wa.me | api + e2e | pasa |
| F07-H2 | te toca corte | cliente con 40 días sin volver | 1 aviso, una vez al día | api | pasa |
| SEC-1 | aislamiento | otro negocio pide un cliente ajeno | 404 | api | pasa |
| SEC-2 | roles | barbero pide reportes / config / citas ajenas | 403, solo ve las suyas | api | pasa |
| SEC-3 | CSRF | POST con form-urlencoded | 415 | api | pasa |
| SEC-4 | fotos | data URL que no es imagen | 400 | api | pasa |
| UI-1 | móvil | agenda y landing a 390 px | sin scroll horizontal | e2e | pasa |

Sin automatizar: entrega real de WhatsApp/email (requiere claves), escaneo de accesibilidad con axe (no está instalado en este entorno; los selectores usan roles y etiquetas).
