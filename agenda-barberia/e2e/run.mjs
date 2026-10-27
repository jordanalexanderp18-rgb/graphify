// Pruebas de punta a punta en Chromium con Playwright (preinstalado).
// Uso: npm run e2e   — falla con errores de consola, respuestas 5xx o pasos rotos.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const SHOTS = new URL('../replica/clone-screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
rmSync('data/e2e.db', { force: true });
const db = openDb('data/e2e.db');
const server = createApp(db);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const results = [];
const pages = [];
const browserPages = () => pages;
const watch = (page, label) => {
  page.__label = label; pages.push(page);
  // Los 4xx esperados (p. ej. un choque de horario) los registra Chrome como error de recurso; los 5xx se vigilan aparte.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource: the server responded with a status of 4')) problems.push(`[${label}] consola: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] error JS: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${label}] ${r.status()} ${r.url()}`); });
};
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['ok', name, Date.now() - t]); console.log(`ok   ${name}`); } catch (e) {
    results.push(['FAIL', name, Date.now() - t]); console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);
    for (const p of browserPages()) await p.screenshot({ path: `${SHOTS}FAIL-${p.__label || 'page'}.png` }).catch(() => {});
    throw e;
  }
}
const pickServices = async (page, ...names) => {
  for (const n of names) await page.getByRole('button', { name: n }).click();
  await page.getByRole('button', { name: /^Continuar · / }).click();
};
// La landing usa WebP con PNG de respaldo; si hay ffmpeg, se regeneran juntos.
const toWebp = (name) => {
  const img = new URL(`../public/img/${name}`, import.meta.url).pathname;
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${img}.png`, '-c:v', 'libwebp', '-quality', '80', `${img}.webp`]); } catch { /* sin ffmpeg queda el WebP anterior */ }
};
const shot = (page, id) => page.screenshot({ path: `${SHOTS}${id}.png`, fullPage: false });

const browser = await chromium.launch();
let exitCode = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const page = await ctx.newPage();
  watch(page, 'panel');

  await step('F08 registro del dueño con datos de ejemplo', async () => {
    await page.goto(`${BASE}/app#/registro`);
    await shot(page, 'S01');
    await page.getByLabel('Nombre del negocio').fill('Barbería El Bigote');
    await page.getByLabel('Tu nombre').fill('Jordan');
    await page.getByLabel('Correo').fill('jordan@example.com');
    await page.getByLabel('Contraseña').fill('una-clave-segura');
    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await page.getByRole('button', { name: 'Nueva cita', exact: true }).waitFor();
  });

  await step('S02 agenda del día con columnas por barbero', async () => {
    await page.getByText('Matías Rojas').first().waitFor();
    await shot(page, 'S02');
    await page.screenshot({ path: new URL('../public/img/agenda.png', import.meta.url).pathname });
    toWebp('agenda');
  });

  await step('S03 vista semanal', async () => {
    await page.getByRole('button', { name: 'Semana' }).click();
    await page.getByText(/Semana del/).waitFor();
    await shot(page, 'S03');
    await page.getByRole('button', { name: 'Día', exact: true }).click();
  });

  // Fecha de mañana (o pasado si es domingo) para reservas.
  const target = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  await step('F03 nueva cita desde el panel con cliente nuevo', async () => {
    await page.goto(`${BASE}/app#/agenda?date=${target}`);
    await page.getByRole('button', { name: 'Nueva cita', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre (cliente nuevo)').fill('Pedro Pascal');
    await dlg.getByLabel('Teléfono / WhatsApp').fill('912340099');
    await dlg.getByLabel('Hora', { exact: true }).fill('17:00');
    await shot(page, 'S04');
    await dlg.getByRole('button', { name: 'Agendar' }).click();
    await page.getByRole('button', { name: /17:00 Pedro Pascal/ }).waitFor();
  });

  await step('F03 solapamiento rechazado con mensaje claro', async () => {
    await page.getByRole('button', { name: 'Nueva cita', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre (cliente nuevo)').fill('Choque');
    await dlg.getByLabel('Hora', { exact: true }).fill('17:00');
    await dlg.getByRole('button', { name: 'Agendar' }).click();
    await dlg.getByText('Esa hora ya está ocupada').waitFor();
    await dlg.getByRole('button', { name: 'Cerrar' }).first().click();
  });

  const slug = 'barberia-el-bigote';
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago', isMobile: true, hasTouch: true });
  const guest = await guestCtx.newPage();
  watch(guest, 'cliente');
  let manageUrl;

  await step('F01 cliente reserva online desde el celular', async () => {
    await guest.goto(`${BASE}/b/${slug}`);
    await guest.getByRole('heading', { name: 'Barbería El Bigote' }).waitFor();
    await shot(guest, 'S15');
    await pickServices(guest, /Degradado \(fade\)/);
    await guest.getByRole('button', { name: /Me da igual/ }).click();
    await guest.getByRole('button', { name: new RegExp(`^${await guest.evaluate((d) => {
      const [y, m, dd] = d.split('-').map(Number);
      const s = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
      return s.charAt(0).toUpperCase() + s.slice(1);
    }, target)}$`) }).click();
    await guest.getByRole('button', { name: '11:00', exact: true }).click();
    await shot(guest, 'S16');
    await guest.screenshot({ path: new URL('../public/img/reserva.png', import.meta.url).pathname });
    toWebp('reserva');
    await guest.getByRole('button', { name: 'Continuar' }).click();
    await guest.getByLabel('Nombre y apellido').fill('Ana María Núñez');
    await guest.getByLabel('WhatsApp').fill('9 8765 4321');
    await shot(guest, 'S17');
    await guest.getByRole('button', { name: 'Confirmar reserva' }).click();
    await guest.getByRole('heading', { name: '¡Reserva lista!' }).waitFor();
    await shot(guest, 'S18');
    manageUrl = guest.url().split('?')[0];
  });

  await step('F01b visita con dos servicios seguidos y un solo cobro', async () => {
    await guest.goto(`${BASE}/b/${slug}`);
    await pickServices(guest, /Corte clásico/, /Cejas/);
    await guest.getByRole('button', { name: /Diego Fuentes/ }).click();
    await guest.getByText('Corte clásico + Cejas').waitFor();
    await guest.locator('.slot').first().click();
    await guest.getByRole('button', { name: 'Continuar' }).click();
    await guest.getByLabel('Nombre y apellido').fill('Doble Servicio');
    await guest.getByLabel('WhatsApp').fill('987650555');
    await guest.getByRole('button', { name: 'Confirmar reserva' }).click();
    await guest.getByRole('heading', { name: '¡Reserva lista!' }).waitFor();
    await guest.getByText('Corte clásico + Cejas').waitFor();
    await guest.getByText('$13.000').waitFor();
  });

  await step('F02 cliente reprograma su hora', async () => {
    await guest.goto(manageUrl);
    await guest.getByRole('button', { name: 'Cambiar hora' }).click();
    await guest.getByRole('button', { name: '12:00', exact: true }).first().click();
    await guest.getByRole('button', { name: 'Cambiar a esta hora' }).click();
    await guest.getByText(/a las 12:00/).waitFor();
    await shot(guest, 'S19');
  });

  await step('la reserva online aparece en la agenda del panel', async () => {
    await page.goto(`${BASE}/app#/agenda?date=${target}`);
    await page.reload();
    await page.getByRole('button', { name: /12:00 Ana María Núñez/ }).waitFor();
  });

  await step('F04 abrir caja y cobrar la cita con producto, descuento y propina', async () => {
    await page.getByRole('button', { name: /12:00 Ana María Núñez/ }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Cobrar' }).click();
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await page.getByRole('dialog').getByLabel('Efectivo inicial (fondo)').fill('20000');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir caja' }).click();
    await page.getByText('Caja abierta', { exact: true }).waitFor();
    // La cita no es de hoy: la caja la carga igual por el enlace.
    await page.goto(`${BASE}/app#/agenda?date=${target}`);
    await page.getByRole('button', { name: /12:00 Ana María Núñez/ }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Cobrar' }).click();
    await page.getByText('Cliente: Ana María Núñez').waitFor();
    await page.getByRole('button', { name: /Cera mate/ }).click();
    await page.getByLabel('Descuento').fill('2000');
    await page.getByLabel('Descuento').press('Tab');
    await page.getByLabel('Propina').fill('1000');
    await page.getByLabel('Propina').press('Tab');
    await shot(page, 'S09');
    // 12.000 + 9.000 − 2.000 + 1.000 = 20.000
    await page.getByRole('button', { name: /Cobrar \$20\.000/ }).click();
    await page.getByText(/Venta registrada/).waitFor();
  });

  await step('F05 cerrar caja con cuadre', async () => {
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText(/Efectivo esperado en caja: \$40\.000/).waitFor();
    await dlg.getByLabel('Efectivo contado').fill('40000');
    await dlg.getByText('Cuadra exacto.').waitFor();
    await shot(page, 'S10');
    await dlg.getByRole('button', { name: 'Cerrar caja' }).click();
    await page.getByText('Caja cerrada', { exact: true }).waitFor();
  });

  await step('S05/S06 clientes y ficha con historial', async () => {
    await page.goto(`${BASE}/app#/clientes`);
    await page.getByRole('link', { name: 'Ana María Núñez' }).click();
    await page.getByRole('heading', { name: 'Ana María Núñez' }).waitFor();
    await page.getByText('Atendida').first().waitFor();
    await shot(page, 'S06');
    await page.goto(`${BASE}/app#/clientes`);
    await page.getByLabel('Buscar clientes').fill('pedro');
    await page.getByRole('link', { name: 'Pedro Pascal' }).waitFor();
    await shot(page, 'S05');
  });

  await step('contador de regreso: el barbero elige 15 días y el aviso queda programado', async () => {
    await page.goto(`${BASE}/app#/clientes`);
    await page.getByRole('link', { name: 'Ana María Núñez' }).click();
    const card = page.getByRole('region', { name: 'Contador de regreso' });
    await card.waitFor();
    await card.getByRole('button', { name: '15 días' }).click();
    await page.getByText(/Le escribiremos el/).waitFor();
    await card.getByText(/aviso programado para el/).waitFor();
    await shot(page, 'S24-contador');
    await page.goto(`${BASE}/app#/clientes`);
    await page.getByRole('row', { name: /Ana María Núñez/ }).getByText(/Vuelve en|Le toca|Atrasado/).waitFor();
  });

  await step('enlace del aviso abre la reserva con servicio y barbero elegidos', async () => {
    const ids = await page.evaluate(async () => {
      const [svc, staff] = await Promise.all([fetch('/api/services').then((r) => r.json()), fetch('/api/staff').then((r) => r.json())]);
      return { s: svc.find((x) => x.name === 'Corte clásico').id, p: staff.find((x) => x.name === 'Diego Fuentes').id };
    });
    await guest.goto(`${BASE}/b/${slug}?s=${ids.s}&p=${ids.p}`);
    await guest.getByRole('heading', { name: 'Elige tu hora' }).waitFor();
    await guest.getByText(/Corte clásico · \d+ min · Diego Fuentes/).waitFor();
  });

  await step('S12/S13 reportes y comisiones', async () => {
    // Los ingresos cuentan el día del cobro (hoy), igual que la caja.
    await page.goto(`${BASE}/app#/reportes?tab=resumen&p=hoy`);
    await page.getByRole('heading', { name: 'Ingresos por día' }).waitFor();
    await page.locator('.hero-card').getByText('$20.000', { exact: true }).first().waitFor();
    await page.locator('.colchart .col').last().focus();
    await page.locator('.chart-tip').getByText('$20.000').waitFor();
    await page.getByRole('button', { name: 'Ver como tabla' }).click();
    await page.getByRole('cell', { name: '$20.000' }).waitFor();
    await page.getByRole('button', { name: 'Ver gráfico' }).click();
    await shot(page, 'S12');
    await page.getByRole('tab', { name: 'Comisiones' }).click();
    await page.getByRole('button', { name: 'Descargar CSV' }).waitFor();
    await shot(page, 'S13');
  });

  await step('S20 mensajes por enviar con enlace de WhatsApp', async () => {
    await page.goto(`${BASE}/app#/mensajes`);
    await page.getByRole('heading', { name: 'Mensajes' }).waitFor();
    await page.getByRole('tab', { name: 'Programados' }).click();
    await page.getByText(/Recordatorio/).first().waitFor();
    await shot(page, 'S20');
  });

  await step('S11 productos con stock descontado', async () => {
    await page.goto(`${BASE}/app#/productos`);
    await page.getByRole('cell', { name: 'Cera mate' }).waitFor();
    await page.getByRole('row', { name: /Cera mate/ }).getByText('11').waitFor();
    await shot(page, 'S11');
  });

  await step('S07/S08/S14 configuración: servicio nuevo y horario de barbero', async () => {
    await page.goto(`${BASE}/app#/config?tab=negocio`);
    await page.getByText('Tu página de reservas').waitFor();
    await shot(page, 'S14');
    await page.getByRole('tab', { name: 'Servicios' }).click();
    await page.getByRole('button', { name: 'Servicio', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre').fill('Diseño con navaja');
    await dlg.getByLabel('Precio').fill('5000');
    await dlg.getByLabel('Duración (min)').fill('20');
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('Diseño con navaja').waitFor();
    await shot(page, 'S07');
    await page.getByRole('tab', { name: 'Equipo' }).click();
    await page.getByRole('row', { name: /Camila Soto/ }).getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('dialog').getByText('Horario semanal').waitFor();
    // Foto: PNG de 2x2 generado aquí mismo.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNk+M/AwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    await page.getByRole('dialog').getByLabel('Foto (se ve al reservar)').setInputFiles({ name: 'camila.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('dialog').locator('img.avatar').waitFor();
    await shot(page, 'S08');
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('Barbero guardado.').waitFor();
    await page.getByRole('row', { name: /Camila Soto/ }).locator('img.avatar').waitFor();
    const photo = await page.request.get(BASE + await page.getByRole('row', { name: /Camila Soto/ }).locator('img.avatar').getAttribute('src'));
    if (photo.headers()['content-type'] !== 'image/jpeg') throw new Error('la foto no se sirve como JPEG');
  });

  await step('plan: prueba visible y planes ofrecidos', async () => {
    await page.goto(`${BASE}/app#/config?tab=plan`);
    await page.getByText(/En prueba: quedan 30 día/).waitFor();
    await page.getByRole('heading', { name: 'Cadena' }).waitFor();
    await shot(page, 'S21-plan');
  });

  await step('anticipo: se pide al reservar y la recepción lo marca recibido', async () => {
    await page.goto(`${BASE}/app#/config?tab=negocio`);
    await page.getByLabel('Datos para transferir el anticipo').fill('Banco Estado, Cuenta Vista 123456, a nombre de El Bigote');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByText('Datos guardados.').waitFor();
    await page.goto(`${BASE}/app#/config?tab=servicios`);
    await page.getByRole('row', { name: /Afeitado con toalla/ }).getByRole('button', { name: 'Editar' }).click();
    await page.getByRole('dialog').getByLabel(/Anticipo al reservar/).fill('3000');
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('Servicio guardado.').waitFor();
    await guest.goto(`${BASE}/b/${slug}`);
    await guest.getByText(/anticipo \$3\.000/).waitFor();
    await pickServices(guest, /Afeitado con toalla/);
    await guest.getByRole('button', { name: /Matías Rojas/ }).click();
    await guest.locator('.slot').first().click();
    await guest.getByRole('button', { name: 'Continuar' }).click();
    await guest.getByLabel('Nombre y apellido').fill('Con Anticipo');
    await guest.getByLabel('WhatsApp').fill('987650444');
    await guest.getByRole('button', { name: 'Confirmar reserva' }).click();
    await guest.getByText('Anticipo pendiente: $3.000').waitFor();
    await guest.getByText(/Cuenta Vista 123456/).waitFor();
    await shot(guest, 'S18-anticipo');
    // Ir al día de la cita usando la API con la sesión del panel.
    const r = await page.evaluate(async () => (await fetch('/api/clients?q=anticipo')).json());
    const c = await page.evaluate(async (id) => (await fetch(`/api/clients/${id}`)).json(), r[0].id);
    const d = c.appointments[0].start_at;
    const local = await page.evaluate((iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(iso)), d);
    await page.goto(`${BASE}/app#/agenda?date=${local}`);
    await page.getByRole('button', { name: /Con Anticipo/ }).click();
    await page.getByRole('dialog').getByText('pendiente').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Anticipo recibido' }).click();
    await page.getByText('Anticipo recibido.').waitFor();
  });

  await step('campaña a clientes que no vuelven', async () => {
    await page.goto(`${BASE}/app#/mensajes?tab=campana`);
    await page.getByLabel('A quién').selectOption('all');
    await page.getByText(/Llegaría a \d+ cliente/).waitFor();
    await shot(page, 'S22-campana');
    await page.getByRole('button', { name: 'Enviar campaña' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
    await page.getByText(/mensaje\(s\) en cola/).waitFor();
  });

  await step('agenda usable en el celular (390 px)', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-CL', timezoneId: 'America/Santiago' });
    await m.addCookies((await ctx.cookies()).map((c) => ({ ...c })));
    const mp = await m.newPage();
    watch(mp, 'panel-móvil');
    await mp.goto(`${BASE}/app#/agenda?date=${target}`);
    await mp.getByRole('button', { name: /17:00 Pedro Pascal/ }).waitFor();
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('la página tiene scroll horizontal en móvil');
    await shot(mp, 'S02-mobile');
    await m.close();
  });

  await step('F02 una cita ya atendida no se puede cancelar en línea', async () => {
    await guest.goto(manageUrl);
    await guest.getByText('¡Gracias por venir!').waitFor();
    if (await guest.getByRole('button', { name: 'Cancelar reserva' }).count()) throw new Error('ofrece cancelar una cita atendida');
  });

  await step('F02 cliente cancela y la hora se libera', async () => {
    await guest.goto(`${BASE}/b/${slug}`);
    await pickServices(guest, /Perfilado de barba/);
    await guest.getByRole('button', { name: /Diego Fuentes/ }).click();
    // Un día futuro: una hora de hoy puede caer dentro de la ventana en que ya no se cancela.
    await guest.locator('.slot').first().waitFor();
    await guest.locator(`.day[data-date="${target}"]`).click();
    await guest.locator(`.day[data-date="${target}"][aria-pressed="true"]`).waitFor();
    await guest.waitForTimeout(500);
    const time = await guest.locator('.slot').first().innerText();
    await guest.locator('.slot').first().click();
    await guest.getByRole('button', { name: 'Continuar' }).click();
    await guest.getByLabel('Nombre y apellido').fill('Rocío Cancela');
    await guest.getByLabel('WhatsApp').fill('987650777');
    await guest.getByRole('button', { name: 'Confirmar reserva' }).click();
    await guest.getByRole('button', { name: 'Cancelar reserva' }).click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Sí, cancelar' }).click();
    await guest.getByText('Esta reserva está cancelada.').waitFor();
    await guest.goto(`${BASE}/b/${slug}`);
    await pickServices(guest, /Perfilado de barba/);
    await guest.getByRole('button', { name: /Diego Fuentes/ }).click();
    await guest.locator('.slot').first().waitFor();
    await guest.locator(`.day[data-date="${target}"]`).click();
    await guest.getByRole('button', { name: time, exact: true }).first().waitFor();
  });

  await step('teclado: completar una reserva solo con teclado', async () => {
    const k = await browser.newPage();
    watch(k, 'teclado');
    await k.goto(`${BASE}/b/${slug}`);
    await k.getByRole('button', { name: /Corte clásico/ }).focus();
    await k.keyboard.press('Enter');
    await k.getByRole('button', { name: /^Continuar · / }).focus();
    await k.keyboard.press('Enter');
    await k.getByRole('button', { name: /Me da igual/ }).focus();
    await k.keyboard.press('Enter');
    await k.locator('.slot').first().waitFor();
    await k.locator('.slot').first().focus();
    await k.keyboard.press('Enter');
    await k.getByRole('button', { name: 'Continuar' }).focus();
    await k.keyboard.press('Enter');
    await k.keyboard.type('Teclado Pérez');
    await k.keyboard.press('Tab');
    await k.keyboard.type('912349999');
    await k.getByRole('button', { name: 'Confirmar reserva' }).focus();
    await k.keyboard.press('Enter');
    await k.getByRole('heading', { name: '¡Reserva lista!' }).waitFor();
    await k.close();
  });

  await step('rubro: una peluquería ve "estilista" en vez de "barbero"', async () => {
    const ctxP = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
    const pp = await ctxP.newPage();
    watch(pp, 'peluqueria');
    await pp.goto(`${BASE}/app?rubro=peluqueria#/registro`);
    await pp.getByLabel('Tipo de negocio').waitFor();
    if (await pp.getByLabel('Tipo de negocio').inputValue() !== 'peluqueria') throw new Error('no toma el rubro del enlace');
    await pp.getByLabel('Nombre del negocio').fill('Salón Aurora');
    await pp.getByLabel('Tu nombre').fill('Aurora');
    await pp.getByLabel('Correo').fill('aurora@example.com');
    await pp.getByLabel('Contraseña').fill('otra-clave-segura');
    await pp.getByRole('button', { name: 'Crear mi cuenta' }).click();
    await pp.getByText('Valentina Ríos').first().waitFor();
    await pp.goto(`${BASE}/app#/config?tab=equipo`);
    await pp.getByRole('button', { name: 'Estilista', exact: true }).waitFor();
    if (await pp.getByText(/barbero/i).count()) throw new Error('quedó la palabra barbero');
    await shot(pp, 'S23-peluqueria');
    const g = await ctxP.newPage();
    await g.goto(`${BASE}/b/salon-aurora`);
    await g.getByText('2. Estilista').waitFor();
    await ctxP.close();
  });

  await step('página de inicio sin errores, en escritorio y celular', async () => {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const l = await browser.newPage({ viewport: vp });
      watch(l, `inicio-${vp.width}`);
      await l.goto(`${BASE}/`);
      await l.getByRole('heading', { level: 1 }).waitFor();
      const broken = await l.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
      if (broken.length) throw new Error(`imágenes rotas: ${broken.join(', ')}`);
      if (await l.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error(`scroll horizontal a ${vp.width}px`);
      await l.screenshot({ path: `${SHOTS}landing-${vp.width}.png`, fullPage: true });
      await l.getByRole('link', { name: 'Crear mi barbería gratis' }).first().click();
      await l.getByRole('heading', { name: 'Crea tu negocio' }).waitFor();
      await l.close();
    }
  });

  if (problems.length) throw new Error(`Problemas detectados:\n${problems.join('\n')}`);
} catch (e) {
  exitCode = 1;
  console.error(`\n${e.message}`);
  if (problems.length) console.error(problems.join('\n'));
} finally {
  await browser.close();
  server.close();
  db.close();
  const ok = results.filter((r) => r[0] === 'ok').length;
  console.log(`\n${ok}/${results.length} pasos OK`);
  process.exit(exitCode);
}
