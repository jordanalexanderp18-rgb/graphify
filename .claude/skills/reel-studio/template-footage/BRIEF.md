---
workflow: general-video
flow: automation
storyboard: no
message: "La sentadilla tiene 3 niveles: sin peso, con barra y pesado con asistencia"
destination: instagram-reels
aspect: 1080x1920
language: es
length: 24s
angle: how-to
---

## Intent

Reel de técnica para @jordan_pincheira (personal trainer, Chile) hecho con sus propios
videos de 2019 y su voz clonada de HeyGen. Jordan pidió que se vieran sus videos reales y
dijo "elige tú" para el tema y el guion. Contenido, no venta.

## Assets

- assets/a.mp4: sentadilla sin peso (2019-06-23), 4K HEVC rotado → 1080x1920 H.264 30 fps.
- assets/b.mp4: sentadilla con barra, vista trasera (2019-09-05), 60 fps → 30 fps.
- assets/c.mp4: sentadilla pesada con asistencia, vista lateral (2019-09-11), 60 fps → 30 fps.
- assets/voz.wav: narración con su voz clonada "Jor" (HeyGen create_speech, motor orca),
  masterizada a −14 LUFS / −1.5 dBTP, 22.86 s. Tiempos por palabra de HeyGen,
  verificados con Parakeet (coinciden palabra por palabra).
- assets/tile1-3.jpg: miniaturas de los tres niveles para la tarjeta final.

## Customizations

- Gancho: el clip más pesado primero ("Nadie empieza cargando así de pesado"), luego el
  nivel 1. Título "3 niveles de sentadilla" visible desde el primer cuadro.
- Rótulo de nivel arriba a la izquierda; subtítulos karaoke de marca abajo.
- Tarjeta final: "¿En qué nivel estás tú?", tres miniaturas, "Guarda este video" y el @.
- Audio original de los clips silenciado (ruido de gimnasio y música de terceros).

## Notes

- Zona segura 1080x1920: nada importante sobre y=230 ni bajo y=1440; 230 px derechos libres.
- Indicaciones técnicas estándar, sin cifras inventadas.
- Guion: "Nadie empieza cargando así de pesado. Se empieza aquí. Nivel uno: sin peso.
  Pecho arriba, rodillas hacia afuera y baja controlado. Nivel dos: con barra. Abdomen
  firme y empuja el piso con todo el pie. Nivel tres: pesado. Y ahí, nunca solo: siempre
  con alguien que te asista. ¿En qué nivel estás tú? Guarda este video para tu próximo
  entrenamiento."
