# Backend

- Auth: email + contraseña (scrypt), sesión en cookie httpOnly SameSite=Lax (Secure detrás de HTTPS con `TRUST_PROXY=1`). Tokens guardados como sha256. Roles owner / reception / barber con una función `allow()`.
- Base: SQLite (`data/app.db`, WAL). El esquema `db/schema.sql` se aplica al iniciar, con migraciones de columnas en `server/db.js`. Respaldo = copiar el archivo (activar los snapshots de volumen del host).
- Pagos: caja local; anticipos por transferencia o enlace de pago propio de la barbería; suscripción con Stripe (Checkout, Portal y webhooks verificados con HMAC e idempotentes en `billing_events`).
- Sucursales: tabla `memberships`; la sesión guarda la sucursal activa.
- SMS: Twilio (`TWILIO_*`).
- Mensajes: adaptadores WhatsApp Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`) y Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Sin claves quedan en "Mensajes" para enviarlos con un toque. Ojo: fuera de la ventana de 24 h, Meta exige plantillas aprobadas para mensajes iniciados por el negocio; hay que crear las plantillas en Meta antes de activar el envío automático.
- Jobs: en el mismo proceso, cada 60 s, con hasta 3 reintentos. Los mensajes fallidos quedan en `failed` con el error.

## Checklist de seguridad

- [x] secretos solo en variables de entorno; `.env*` en `.gitignore`; `.env.example` sin valores
- [x] entrada validada en el servidor en cada ruta (`server/validate.js`)
- [x] autorización en cada lectura y escritura, probada con un segundo negocio y con rol barbero
- [x] límites de frecuencia en registro, login, reservas públicas y gestión de reservas
- [x] webhooks con firma: Stripe, con tolerancia de 5 min e idempotencia (probado)
- [x] subidas: solo jpeg/png/webp, ~300 KB máx., servidas con su content-type
- [x] sin datos de usuario en logs; los enlaces de reserva usan tokens aleatorios
- [x] dependencias: ninguna de npm
- [x] política de privacidad con los procesadores (borrador en `/privacidad`; revisión legal pendiente)
- [x] borrado de datos personales de un cliente (anonimiza y conserva las ventas)
