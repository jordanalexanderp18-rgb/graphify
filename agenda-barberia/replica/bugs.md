# Bugs encontrados y corregidos

### BUG-001: el registro con datos de ejemplo fallaba con 500
- Severidad: S1 (flujo central bloqueado)
- Pasos: crear cuenta con "Cargar datos de ejemplo".
- Esperado: cuenta creada. Actual: 500. La franja del sábado 15:00-15:00 violaba `check (end_min > start_min)`.
- Evidencia: las 8 pruebas de API fallaban con "CHECK constraint failed".
- Estado: corregido (el sábado ahora es corrido 10-15).

### BUG-002: al reprogramar, el selector abría otro día
- Severidad: S3. Al tocar "Cambiar hora" se mostraba el primer día libre y no el de la cita, y era fácil mover la cita a otro día sin darse cuenta.
- Estado: corregido (`initialDate`).

### BUG-003: la hora propia contaba como ocupada al reprogramar
- Severidad: S3. No se podía correr una cita 15 minutos si se cruzaba con su propia hora.
- Estado: corregido (los horarios ignoran la visita a mover; prueba de API).

### BUG-004: la vista previa de la foto del barbero bloqueada por CSP
- Severidad: S2. `img-src` no permitía `blob:`.
- Evidencia: error de consola detectado por la prueba en navegador.
- Estado: corregido.

### BUG-005: montos como "10.000 CLP" en vez de "$10.000"
- Severidad: S4. Estado: corregido (formato regional por moneda).

### BUG-006: error de consola en la pantalla de ingreso
- Severidad: S4. `/api/me` devolvía 401 sin sesión. Estado: corregido (200 con `user: null`).

Abiertos: ninguno S1/S2.
