---
name: google-fotos
description: Conectar con Google Fotos de Jordan y traer fotos/videos al contenedor (Photos Picker API). Usar cuando pida ver, bajar, analizar o usar fotos o videos de su Google Fotos / Google Photos.
---

# Google Fotos

No existe conector de Google Fotos en Claude, y desde marzo de 2025 Google no deja
a ninguna app leer la biblioteca entera: solo las fotos que el usuario **elige a mano**
en el selector oficial de Google (Photos Picker API). Este skill hace ese flujo.

Script: `.claude/skills/google-fotos/scripts/google_fotos.py` (solo stdlib).
Alias abajo: `GF="python3 .claude/skills/google-fotos/scripts/google_fotos.py"`.

## Requisitos (una sola vez, los hace Jordan)

1. **Cliente OAuth** en https://console.cloud.google.com:
   - Crear/elegir proyecto → "APIs y servicios" → Biblioteca → activar **Google Photos Picker API**.
   - "Pantalla de consentimiento OAuth" → tipo Externo → agregar su correo como **usuario de prueba**.
   - "Credenciales" → Crear credenciales → ID de cliente OAuth → tipo **App de escritorio**.
2. **Secretos del entorno** (configuración del entorno cloud → variables de entorno):
   `GOOGLE_FOTOS_CLIENT_ID`, `GOOGLE_FOTOS_CLIENT_SECRET` y, después del paso de
   autorización, `GOOGLE_FOTOS_REFRESH_TOKEN` (así no hay que reautorizar en cada contenedor).
3. **Red**: el entorno debe permitir `photospicker.googleapis.com`,
   `oauth2.googleapis.com` y **`lh3.googleusercontent.com`** (de ahí se descargan los archivos;
   la política "Limited" por defecto lo bloquea con 403).

## Flujo

1. Autorizar (solo si no hay refresh token):
   - `$GF auth-url` → mandar el link a Jordan. Al aceptar, el navegador va a
     `http://localhost/?code=...` y muestra error de conexión: **es normal**. Jordan copia
     esa URL completa de la barra de direcciones y la pega.
   - `$GF auth-code '<url pegada>'` → imprime el refresh token; pedirle que lo guarde como
     `GOOGLE_FOTOS_REFRESH_TOKEN`. No repetirlo en commits ni archivos del repo.
2. `$GF pick` → devuelve `session` y `open_this`. Mandar `open_this` a Jordan: lo abre
   en el celular, toca las fotos y pulsa "Listo".
3. `$GF wait <session>` → espera hasta que termine de elegir (10 min por defecto).
4. `$GF list <session>` para ver qué eligió, o
   `$GF download <session> --out <scratchpad>/google-fotos` para bajarlas
   (borra la sesión al final salvo `--keep`).

Las fotos bajadas son datos del usuario: guardarlas en el scratchpad, nunca commitearlas.

## Errores comunes

- `403` al descargar / "unreachable": falta permitir `lh3.googleusercontent.com` en la red.
- `invalid_grant`: el refresh token caducó (en apps en modo "Prueba" dura 7 días) → repetir paso 1,
  o publicar la app en la pantalla de consentimiento.
- `redirect_uri_mismatch`: el cliente OAuth no es de tipo "App de escritorio".

## Alternativa sin nada de esto

Google Drive ya está conectado (`mcp__Google_Drive__*`). Si Jordan guarda fotos en Drive
o hace un Google Takeout de Fotos con destino Drive, se leen desde ahí directamente.
