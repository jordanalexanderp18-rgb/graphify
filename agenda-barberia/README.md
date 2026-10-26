# Silla Llena: agenda, reservas y caja para barberías

Reconstrucción clean-room de las funciones núcleo de un software de agenda para barberías, con mejoras sacadas de reseñas reales. El proceso completo (recon, arquitectura, diseño, pruebas, paridad, reseñas, marca y lanzamiento) está en `replica/`.

## Correr

Requiere Node 22.5 o superior. No usa dependencias de npm.

```bash
npm start          # http://localhost:3000  (landing en /, panel en /app)
npm test           # pruebas de API
npm run e2e        # pruebas en Chromium (requiere Playwright instalado)
```

Crea una cuenta en `/app#/registro` con "Cargar datos de ejemplo" y comparte el enlace `/b/<tu-barberia>`.

Configuración opcional: copia `.env.example` a `.env` (`PUBLIC_URL`, WhatsApp Cloud API y Resend).

## Estructura

- `server/`: HTTP, API (`api.js`), disponibilidad (`availability.js`), mensajes (`notify.js`), tareas (`jobs.js`)
- `db/schema.sql`: esquema SQLite
- `public/`: landing, panel (`js/app.js`) y página de reservas (`js/book.js`); estilos con tokens generados por `npm run tokens`
- `test/`, `e2e/`: pruebas
