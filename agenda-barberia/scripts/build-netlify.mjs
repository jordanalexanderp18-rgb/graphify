// Arma una versión estática para Netlify: landing + video demo + páginas legales.
// Netlify sirve archivos estáticos; el panel y las reservas necesitan el servidor
// Node con su base de datos (ver replica/deploy.md), así que aquí los botones
// de registro llevan al video demo.
// Uso: node scripts/build-netlify.mjs <video.mp4> <carpeta-salida>
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [video, outArg] = process.argv.slice(2);
if (!video || !outArg) { console.error('Uso: node scripts/build-netlify.mjs <video.mp4> <carpeta-salida>'); process.exit(1); }
const OUT = resolve(outArg);
const PUB = new URL('../public/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const dir of ['css', 'img']) cpSync(join(PUB, dir), join(OUT, dir), { recursive: true });
for (const f of ['icon.svg']) copyFileSync(join(PUB, f), join(OUT, f));
copyFileSync(video, join(OUT, 'demo.mp4'));

const toDemo = (html) => html
  .replace(/<a class="([^"]*)" href="\/app#\/registro">[^<]*<\/a>/g, '<a class="$1" href="#demo">Ver la demo</a>')
  .replace(/<a class="btn btn-sm" href="\/app">Entrar<\/a>/, '<a class="btn btn-sm" href="#demo">Ver demo</a>')
  .replace(/<a href="\/app">Entrar<\/a>/g, '')
  .replace(/\s*<link rel="manifest" href="\/manifest.webmanifest">/, '');

let index = toDemo(readFileSync(join(PUB, 'index.html'), 'utf8'));
const demo = `
    <section class="lp-wrap" id="demo">
      <h2 class="lp-h2">Mira cómo funciona</h2>
      <p class="muted" style="margin-bottom: var(--s-4)">Un recorrido real: la barbería se registra, un cliente reserva desde el celular y se cobra en caja.</p>
      <video class="lp-video" src="/demo.mp4" poster="/img/agenda.png" controls playsinline preload="metadata"></video>
      <p class="xs muted lp-note">Muy pronto disponible. ¿Quieres probarla en tu barbería? Escríbenos.</p>
    </section>
`;
index = index.replace('    <section class="lp-band" id="precios">', `${demo}\n    <section class="lp-band" id="precios">`);
writeFileSync(join(OUT, 'index.html'), index);
for (const f of ['privacidad.html', 'terminos.html']) writeFileSync(join(OUT, f), toDemo(readFileSync(join(PUB, f), 'utf8')));
writeFileSync(join(OUT, 'css', 'landing.css'), `${readFileSync(join(OUT, 'css', 'landing.css'), 'utf8')}.lp-video { width: 100%; border-radius: var(--r-lg); border: 1px solid var(--c-border); box-shadow: var(--shadow-pop); background: var(--c-text); display: block; }\n`);

writeFileSync(join(OUT, 'netlify.toml'), `# Sitio estático de muestra (landing + demo).
[[redirects]]
  from = "/privacidad"
  to = "/privacidad.html"
  status = 200
[[redirects]]
  from = "/terminos"
  to = "/terminos.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "same-origin"
    X-Frame-Options = "SAMEORIGIN"
    Content-Security-Policy = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'"
`);
// Netlify Drop no lee netlify.toml: las mismas reglas en _redirects y _headers.
writeFileSync(join(OUT, '_redirects'), '/privacidad  /privacidad.html  200\n/terminos  /terminos.html  200\n');
writeFileSync(join(OUT, '_headers'), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: SAMEORIGIN\n  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'\n");
console.log(OUT);
