# Marca: Silla Llena

## Nombre

Ángulo (de `fixes.md`): mensajes sin límite para que la silla no quede vacía.

**20 candidatos:** Filo, Navaja, Perfila, Patilla, Sillón, Turnio, Cortia, Tupé, Fadeo, Rasura, Silla Llena, Peine, Brocha, Corteo, Mostacho, Recorte, Tijeral, Sillalibre, Vuelve, Ronda.

**Descartados por la búsqueda web (2026-10-26):**
- Filo: ya existen la app Filo de tutorías, Filo Track y la barbería "Don Filo".
- Navaja: NavajaBook es un competidor directo (reservas para barberías).
- Perfila: perfila.ai (edtech).
- Turnio: app de reservas de GoGemu y turnio.net.
- Rasura: marca registrada (®) de artículos de afeitado en Países Bajos.
- Fadeo: app social en App Store.
- Cortia: cortia.dev.
- Corteo: espectáculo del Cirque du Soleil.

**Elegido como nombre de trabajo: Silla Llena.** Dice el resultado que busca el dueño (la silla nunca vacía), se escribe al oírlo una vez, está en español para el mercado objetivo y no se parece al original en sonido, forma ni significado.

| check | resultado |
| --- | --- |
| la web ("Silla Llena" app / software / barbería) | 2026-10-26: no hay app ni software con ese nombre. Ojo: "La Silla Llena" es una sección de opinión del medio colombiano La Silla Vacía. Es otra categoría (prensa), pero hay que considerarlo en Colombia. |
| marca USPTO (clases 9 y 42) | por correr: tmsearch.uspto.gov |
| marca EUIPO / TMview | por correr |
| WIPO Global Brand Database | por correr |
| INAPI (Chile), IMPI (México), SIC (Colombia) | por correr: son los mercados de lanzamiento |
| dominio sillallena.com / .app / .cl | por correr: `whois sillallena.com` |
| App Store y Google Play | por correr: buscar "Silla Llena" |
| Instagram, TikTok, X | por correr: @sillallena |

Estas son búsquedas de descarte y no una autorización legal. Antes de gastar en el nombre, un abogado de marcas debe hacer la búsqueda formal.

## Paleta

Cobre (`accent #a63d14`) sobre neutros cálidos. Es otra familia de color que la del original, que usa morado/índigo. Las barberías la asocian a cuero, madera y navaja. Los tokens están en `replica/design/tokens.json`: 26 pares, 0 fallas AA.

## Brief de logo

- **Idea:** una silla de barbero de frente, simple, que se lee como "lugar ocupado".
- **Tipo:** símbolo + wordmark. El símbolo funciona solo como ícono.
- **Debe funcionar** a 16 px (favicon) y a 1024 px (ícono de app, sin transparencia para iOS).
- **Entregables:** SVG, ícono 1024×1024, set de favicon, imagen social 1200×630.
- **No debe parecerse** al logo del original: nada de calendario ni check, y nada de morado.
- El borrador actual es `public/icon.svg`: silla blanca sobre cobre, hecha aquí.

## Voz

Tres palabras: **directa** (no seca), **de barrio** (no informal de más), **segura** (no arrogante).

| sí | no |
| --- | --- |
| "Tu hora quedó reservada" | "¡Su cita ha sido agendada exitosamente!" |
| "Esa hora ya está ocupada. Elige otra." | "Error 409: conflicto de horario" |
| "Te toca corte" | "Le recordamos que su servicio periódico está próximo" |
| "Cuadra exacto." | "La conciliación no presenta diferencias" |
| tutear siempre | mezclar usted y tú |

Textos más vistos, ya escritos en esta voz (todos nuevos, ninguno copiado del original): "Crea tu barbería", "Entra a tu panel", "Nueva cita", "Sin cita", "Cobrar $X", "¡Reserva lista!", "Alguien acaba de tomar esa hora. Elige otra, por favor.", "Aún no tienes clientes. Se crean solos cuando alguien reserva.", "No hay mensajes por enviar. ¡Todo al día!", "Abre la caja para recibir efectivo."

## Barrido

`python3 ~/replica-skill/replica-brand/sweep.py . --config replica/brand.json`: el resultado está en el resumen de la sesión y debe salir limpio antes de cualquier deploy. El color `#3a4ccf` del brand.json es el acento provisional que se usó durante el build, no el del original. Antes del lanzamiento conviene sumar los hex reales del original, medidos a mano en su sitio público.
