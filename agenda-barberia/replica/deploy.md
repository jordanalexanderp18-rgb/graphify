# Deploy

Estado: **listo para publicar, esperando el "go" de Jordan**. Nada se publicó.

## Preflight (2026-10-26)

| check | resultado |
| --- | --- |
| pruebas de API (`npm test`) | 21/21 pasan |
| pruebas en navegador (`npm run e2e`) | 24/24 pasos OK, sin errores de consola ni 5xx |
| paridad (`parity.py`) | 94.0/100; obligatorias 24 de 26. Las 2 que faltan son el envío automático de WhatsApp, que necesita la cuenta Meta (ver abajo) |
| barrido de marca (`sweep.py`) | limpio |
| ficha de tienda (`listing.py`) | 0 errores, 0 advertencias |
| contraste (`contrast.py`) | 26 pares, 0 fallas AA |
| build de producción | no aplica (no hay paso de build); el servidor en modo producción respondió `/healthz` ok y 200 en `/`, `/app`, `/privacidad` y `/terminos` |
| imagen Docker | Dockerfile escrito, **no construido aquí** (el contenedor no tiene daemon de Docker); se construye en el host |
| bugs S1/S2 abiertos | ninguno |
| privacidad y términos | `/privacidad` y `/terminos` publicados como **borradores**; debe revisarlos un abogado |
| cookies | solo la de sesión (necesaria); no hace falta banner |
| borrado de cuenta / datos | borrado de cliente sí; borrado de la cuenta completa de la barbería se pide por soporte (manual) |
| favicon, títulos, ícono | propios (`icon.svg`, "Silla Llena") |

## Lo que haces tú (no lo hace Claude)

1. **Comprar el dominio** después de los checks de marca de `brand.md` (p. ej. `sillallena.com`).
2. **Cuenta en Fly.io** (o Render/Railway). Con Fly:
   ```bash
   cd agenda-barberia
   fly launch --no-deploy          # elige nombre y región (scl = Santiago)
   fly volumes create data --size 1 --region scl
   fly secrets set PUBLIC_URL=https://sillallena.com
   fly deploy
   fly certs add sillallena.com && fly certs add www.sillallena.com
   ```
3. **DNS** en tu registrador:

   | registro | nombre | valor |
   | --- | --- | --- |
   | A | @ | IPv4 que muestra `fly ips list` |
   | AAAA | @ | IPv6 que muestra `fly ips list` |
   | CNAME | www | `<tu-app>.fly.dev` |

   Usa `sillallena.com` como dominio principal y redirige `www` a ese.
4. **Email (Resend)**: verifica el dominio y agrega en el DNS los registros SPF (TXT) y DKIM que te da Resend, más DMARC `TXT _dmarc "v=DMARC1; p=none; rua=mailto:tu@sillallena.com"`. Después: `fly secrets set RESEND_API_KEY=… EMAIL_FROM="Silla Llena <hola@sillallena.com>"`.
5. **Stripe** (modo live): crea los productos "Barbería" y "Cadena", cada uno con precio mensual y anual. Agrega el webhook `https://sillallena.com/api/billing/webhook` con los eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` e `invoice.payment_failed`, y activa el Customer Portal con la opción de cancelar. Después: `fly secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… STRIPE_PRICE_BARBERIA_MONTH=… …`. Haz una compra real y reembólsala.
6. **WhatsApp automático** (cierra las 2 obligatorias que faltan): en Meta Business, crea una app de WhatsApp Business Platform con un número verificado y pide que aprueben plantillas para confirmación, recordatorio, cancelación y "te toca corte". Después: `fly secrets set WHATSAPP_TOKEN=… WHATSAPP_PHONE_ID=…`. **Pendiente en código:** hoy se envía como texto libre, y Meta exige plantillas para los mensajes que inicia el negocio. Hay que cambiar `sendWhatsApp` para que use `type: "template"` una vez aprobados sus nombres.
7. **SMS (opcional)**: `fly secrets set TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_FROM=…`.

## Vigilar la primera semana

- Uptime: monitor externo (UptimeRobot, gratis) contra `/healthz` y `/b/<una-barbería>`.
- Errores: `fly logs`; los 500 quedan registrados con su stack.
- Respaldo: snapshots diarios del volumen (Fly los hace; confirma la retención con `fly volumes snapshots list`).
- Probar la reserva en el sitio real, desde tu celular.
