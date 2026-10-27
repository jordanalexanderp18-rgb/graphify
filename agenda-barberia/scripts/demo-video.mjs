// Graba un video de demostración recorriendo la app real (Playwright + ffmpeg).
// Uso: node scripts/demo-video.mjs <carpeta-de-salida>   -> <carpeta>/silla-llena-demo.mp4
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const OUT = resolve(process.argv[2] || 'demo');
const RAW = join(OUT, 'raw');
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
const db = openDb(join(OUT, 'demo.db'));
const server = createApp(db);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Cursor visible y subtítulos, inyectados solo para la grabación.
const OVERLAY = () => {
  const ready = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    Object.assign(c.style, { position: 'fixed', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(166,61,20,.35)', border: '2px solid #a63d14', zIndex: 99999, pointerEvents: 'none', left: '-50px', top: '-50px', transform: 'translate(-50%,-50%)', transition: 'left .25s, top .25s' });
    document.body.append(c);
    addEventListener('mousemove', (e) => { c.style.left = `${e.clientX}px`; c.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { c.style.background = 'rgba(166,61,20,.8)'; }, true);
    addEventListener('mouseup', () => { c.style.background = 'rgba(166,61,20,.35)'; }, true);
  };
  if (document.body) ready(); else addEventListener('DOMContentLoaded', ready);
};
async function caption(page, text, ms = 2500) {
  await page.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', maxWidth: '88%', background: 'rgba(27,23,20,.88)', color: '#fff', font: '600 22px/1.35 Inter, system-ui, sans-serif', padding: '14px 22px', borderRadius: '14px', zIndex: 99998, textAlign: 'center', pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.25)' });
      document.body.append(el);
    }
    el.textContent = t;
    el.style.display = t ? 'block' : 'none';
  }, text);
  if (ms) await wait(ms);
}
async function card(page, title, sub, ms = 3200) {
  await page.evaluate(([t, s]) => {
    const el = document.createElement('div');
    el.id = '__card';
    Object.assign(el.style, { position: 'fixed', inset: 0, background: '#a63d14', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '18px', zIndex: 100000, textAlign: 'center', padding: '40px', font: '700 56px/1.1 Inter, system-ui, sans-serif' });
    const a = document.createElement('div'); a.textContent = t;
    const b = document.createElement('div'); b.textContent = s;
    Object.assign(b.style, { font: '500 26px/1.4 Inter, system-ui, sans-serif', opacity: '.92', maxWidth: '900px' });
    el.append(a, b);
    document.body.append(el);
  }, [title, sub]);
  await wait(ms);
  await page.evaluate(() => document.getElementById('__card')?.remove());
}
const type = (loc, text) => loc.pressSequentially(text, { delay: 55 });
async function scrollTo(page, y, steps = 30) {
  const start = await page.evaluate(() => scrollY);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((v) => scrollTo(0, v), start + ((y - start) * i) / steps);
    await wait(40);
  }
}

const browser = await chromium.launch();
const desk = { viewport: { width: 1280, height: 720 }, locale: 'es-CL', timezoneId: 'America/Santiago' };
const target = (() => { const d = new Date(); d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); })();

// ---------- parte 1: la barbería se registra (escritorio)
const c1 = await browser.newContext({ ...desk, recordVideo: { dir: join(RAW, '1'), size: desk.viewport } });
await c1.addInitScript(OVERLAY);
const p1 = await c1.newPage();
await p1.goto(`${BASE}/`);
await card(p1, 'Silla Llena', 'Agenda, reservas online y caja para barberías');
await caption(p1, 'La página de inicio: lo que ve una barbería antes de registrarse');
await scrollTo(p1, 1500, 60);
await caption(p1, 'Funciones pensadas para barberías, y precios sin cobro por mensaje');
await scrollTo(p1, 3000, 60);
await wait(800);
await scrollTo(p1, 0, 30);
await caption(p1, 'Crear la barbería toma un minuto', 1200);
await p1.getByRole('link', { name: 'Crear mi barbería gratis' }).first().click();
await p1.getByLabel('Nombre del negocio').waitFor();
await type(p1.getByLabel('Nombre del negocio'), 'Barbería El Bigote');
await type(p1.getByLabel('Tu nombre'), 'Jordan');
await type(p1.getByLabel('Correo'), 'jordan@ejemplo.com');
await type(p1.getByLabel('Contraseña'), 'una-clave-segura');
await wait(500);
await p1.getByRole('button', { name: 'Crear mi cuenta' }).click();
await p1.getByRole('button', { name: 'Nueva cita', exact: true }).waitFor();
await caption(p1, 'La agenda del día: una columna por barbero', 3000);
await caption(p1, 'Agendar a un cliente que llamó por teléfono', 1000);
await p1.goto(`${BASE}/app#/agenda?date=${target}`);
await p1.getByRole('button', { name: 'Nueva cita', exact: true }).click();
const dlg = p1.getByRole('dialog');
await type(dlg.getByLabel('Nombre (cliente nuevo)'), 'Pedro Pascal');
await type(dlg.getByLabel('Teléfono / WhatsApp'), '912340099');
await dlg.getByLabel('Servicio').selectOption({ index: 2 });
await wait(600);
await caption(p1, 'Sugiere las horas libres del barbero', 0);
await dlg.getByRole('button', { name: '17:00', exact: true }).click();
await wait(1500);
await dlg.getByRole('button', { name: 'Agendar' }).click();
await p1.getByRole('button', { name: /17:00 Pedro Pascal/ }).waitFor();
await caption(p1, 'Listo: queda en la agenda y le llega la confirmación por WhatsApp', 3000);
await caption(p1, 'Ahora, el cliente reserva solo desde su celular…', 2200);
const cookies = await c1.cookies();
await c1.close();

// ---------- parte 2: el cliente reserva (celular)
const mob = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CL', timezoneId: 'America/Santiago' };
const c2 = await browser.newContext({ ...mob, recordVideo: { dir: join(RAW, '2'), size: mob.viewport } });
await c2.addInitScript(OVERLAY);
const p2 = await c2.newPage();
await p2.goto(`${BASE}/b/barberia-el-bigote`);
await p2.getByRole('heading', { name: 'Barbería El Bigote' }).waitFor();
await caption(p2, 'El enlace que pones en Instagram y WhatsApp', 2500);
await caption(p2, 'Puede elegir varios servicios en una visita', 0);
await p2.getByRole('button', { name: /Degradado \(fade\)/ }).click();
await wait(700);
await p2.getByRole('button', { name: /Cejas/ }).click();
await wait(1500);
await p2.getByRole('button', { name: /^Continuar · / }).click();
await caption(p2, 'Elige barbero, o "me da igual"', 0);
await wait(1500);
await p2.getByRole('button', { name: /Camila Soto/ }).click();
await caption(p2, 'Solo ve horas realmente libres', 0);
await p2.locator('.slot').first().waitFor();
await p2.locator(`.day[data-date="${target}"]`).click();
await p2.locator(`.day[data-date="${target}"][aria-pressed="true"]`).waitFor();
await wait(800);
await wait(1500);
const slot = p2.locator('.slot').nth(2);
const slotTime = await slot.innerText();
await slot.click();
await wait(800);
await p2.getByRole('button', { name: 'Continuar' }).click();
await caption(p2, 'Sin descargar nada ni crear cuenta', 0);
await type(p2.getByLabel('Nombre y apellido'), 'Ana María Núñez');
await type(p2.getByLabel('WhatsApp'), '9 8765 4321');
await wait(600);
await p2.getByRole('button', { name: 'Confirmar reserva' }).click();
await p2.getByRole('heading', { name: '¡Reserva lista!' }).waitFor();
writeFileSync(join(RAW, 'slot.txt'), slotTime);
await caption(p2, 'Puede cambiar o cancelar desde aquí, y agregarla a su calendario', 3500);
await c2.close();

// ---------- parte 3: cobrar y ver números (escritorio)
const c3 = await browser.newContext({ ...desk, recordVideo: { dir: join(RAW, '3'), size: desk.viewport } });
await c3.addCookies(cookies);
await c3.addInitScript(OVERLAY);
const p3 = await c3.newPage();
await p3.goto(`${BASE}/app#/agenda?date=${target}`);
const ana = p3.getByRole('button', { name: /Ana María Núñez/ }).first();
await ana.waitFor();
await caption(p3, 'La reserva online ya aparece en la agenda', 2800);
await ana.scrollIntoViewIfNeeded();
await ana.click();
await wait(1500);
await p3.getByRole('dialog').getByRole('link', { name: 'Cobrar' }).click();
await caption(p3, 'Al terminar, se cobra en caja', 0);
await p3.getByRole('button', { name: 'Abrir caja' }).click();
await type(p3.getByRole('dialog').getByLabel('Efectivo inicial (fondo)'), '20000');
await p3.getByRole('dialog').getByRole('button', { name: 'Abrir caja' }).click();
await p3.getByText('Caja abierta', { exact: true }).waitFor();
await p3.goto(`${BASE}/app#/caja?appt=${await p3.evaluate(async (d) => {
  const list = await (await fetch(`/api/appointments?from=${d}&to=${d}`)).json();
  return list.find((a) => a.client_name === 'Ana María Núñez').id;
}, target)}`);
await p3.getByText('Cliente: Ana María Núñez').waitFor();
await caption(p3, 'Suma un producto, la propina y elige cómo paga', 0);
await p3.getByRole('button', { name: /Cera mate/ }).click();
await wait(700);
await type(p3.getByLabel('Propina'), '2000');
await p3.getByLabel('Propina').press('Tab');
await wait(1500);
await p3.getByRole('button', { name: /^Cobrar \$/ }).click();
await p3.getByText(/Venta registrada/).waitFor();
await caption(p3, 'Las comisiones de cada barbero se calculan solas', 2200);
await p3.getByRole('button', { name: 'Cerrar caja' }).click();
const d3 = p3.getByRole('dialog');
await caption(p3, 'Al cerrar, la caja te dice si cuadra', 0);
const expected = (await d3.getByText(/Efectivo esperado en caja/).innerText()).replace(/\D/g, '');
await type(d3.getByLabel('Efectivo contado'), expected);
await wait(1800);
await d3.getByRole('button', { name: 'Cerrar caja' }).click();
await wait(800);
await p3.goto(`${BASE}/app#/reportes?tab=resumen&p=hoy`);
await p3.getByRole('heading', { name: 'Ingresos por día' }).waitFor();
await caption(p3, 'Reportes: ingresos, ocupación, clientes nuevos y los que vuelven', 3000);
await p3.getByRole('tab', { name: 'Comisiones' }).click();
await caption(p3, 'Cuánto pagarle a cada barbero, listo para descargar', 3000);
await p3.goto(`${BASE}/app#/mensajes?tab=pending`);
await caption(p3, 'Recordatorios y "te toca corte" por WhatsApp, sin límite de mensajes', 3200);
await caption(p3, '', 0);
await card(p3, 'Silla Llena', 'Reservas 24/7 · WhatsApp sin límite · Caja que cuadra · Comisiones automáticas', 4000);
await c3.close();
await browser.close();
server.close();
db.close();

// ---------- unir con ffmpeg (todo a 1280x720, el celular centrado)
const parts = ['1', '2', '3'].map((d) => join(RAW, d, readdirSync(join(RAW, d)).find((f) => f.endsWith('.webm'))));
const mp4s = parts.map((src, i) => {
  const dst = join(RAW, `part${i}.mp4`);
  const vf = i === 1
    ? 'scale=-2:680,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xf7f5f2,fps=30'
    : 'scale=1280:720,fps=30';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '23', dst]);
  return dst;
});
const list = join(RAW, 'list.txt');
writeFileSync(list, mp4s.map((f) => `file '${f}'`).join('\n'));
const final = join(OUT, 'silla-llena-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
console.log(final);
