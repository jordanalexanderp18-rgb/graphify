// Genera public/img/og.png (1200x630): la imagen que se ve al compartir el enlace.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const shot = readFileSync(new URL('../public/img/agenda.png', import.meta.url)).toString('base64');
const icon = readFileSync(new URL('../public/icon.svg', import.meta.url)).toString('base64');
const html = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#a63d14;font-family:Inter,system-ui,sans-serif;color:#fff;overflow:hidden;position:relative">
  <div style="position:absolute;left:64px;top:72px;width:520px">
    <div style="display:flex;align-items:center;gap:16px;font-size:34px;font-weight:700"><img src="data:image/svg+xml;base64,${icon}" width="64" height="64" style="border-radius:14px;background:#fff">Silla Llena</div>
    <div style="font-size:54px;line-height:1.08;font-weight:800;margin-top:44px">Agenda y reservas online para tu negocio</div>
    <div style="font-size:26px;line-height:1.4;margin-top:26px;opacity:.92">WhatsApp sin límite · Caja que cuadra · Comisiones automáticas</div>
  </div>
  <img src="data:image/png;base64,${shot}" style="position:absolute;left:640px;top:96px;width:720px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: new URL('../public/img/og.png', import.meta.url).pathname });
await browser.close();
console.log('public/img/og.png');
