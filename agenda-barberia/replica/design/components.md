# Componentes

Todos usan tokens (`var(--c-*)`, `var(--s-*)`, `var(--r-*)`). Se ven juntos en `/app#/design`.

```
Button  .btn
  variants  primary (.btn-primary), secondary (default), ghost (.btn-ghost), danger (.btn-danger)
  sizes     sm 32px (.btn-sm), md 40px
  states    default, hover, active, focus-visible (anillo 2px accent), disabled, loading (aria-busy, mantiene el texto)
  tokens    bg accent, text on-accent, radius md, font sm/600
  a11y      <button> real; enlaces con aspecto de botón son <a class="btn">
  used on   todas

Input / Select / Textarea  .field > label + input
  states    default, focus (borde accent + anillo), invalid (borde danger + mensaje), disabled
  tokens    borde border-input, radius sm, alto 40px
  a11y      <label for>, errores con aria-describedby
  used on   S01, S04, S07-S11, S14, S17

Time grid  .grid-day
  columnas  una por barbero (día) o por día (semana); filas de 15 min (alto fijo 18px)
  states    vacío (mensaje "sin barberos" o "cerrado"), con citas, línea de "ahora"
  a11y      cada hueco es <button aria-label="Nueva cita 10:15 con Ana">
  used on   S02, S03

Appointment card  .appt[data-status]
  variants  booked, confirmed, done, no_show, cancelled (cancelada se tacha)
  tokens    fondo *-soft según estado, borde izq color del barbero
  a11y      <button> con hora, cliente y servicio en el nombre accesible
  used on   S02, S03

Modal  <dialog class="modal">
  states    abierto, cerrando; Esc cierra; foco atrapado (dialog nativo)
  used on   S04, S08, S10

Table  .table
  states    vacía (fila con mensaje + acción), llena; en móvil se convierte en lista apilada
  used on   S05, S07, S08, S11, S13, S20

Stat tile  .stat
  label xs muted, valor xl, delta opcional
  used on   S12

Bar list  .bars
  barras horizontales con valor; vacío = "Sin datos en este rango"
  used on   S12

Slot chip  .slot
  states    default, selected (aria-pressed), disabled
  used on   S16

Day strip  .days
  states    selected, sin horas (deshabilitado, tachado)
  used on   S16

Toast  #toast
  variants  ok, error; role=status, se va a los 3.5 s
  used on   todas

Nav  .side (escritorio) / .tabs-bottom (móvil < 760px)
  states    activo (aria-current=page)

Badge  .badge
  variants  estado de cita, stock bajo (warning), activo/inactivo
```
