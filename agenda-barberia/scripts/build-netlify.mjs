// Arma una versión estática para Netlify: landing (general y por rubro) con su
// SEO, video demo, páginas legales, robots.txt y sitemap.xml.
// Netlify sirve archivos estáticos; el panel y las reservas necesitan el servidor
// Node con su base de datos (ver replica/deploy.md), así que aquí los botones
// de registro llevan al video demo.
// Uso: node scripts/build-netlify.mjs <video.mp4> <carpeta-salida> [https://tu-sitio.netlify.app]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderLanding, robots } from '../server/seo.js';
import { VERTICALS } from '../server/verticals.js';

const [video, outArg, baseArg] = process.argv.slice(2);
if (!video || !outArg) { console.error('Uso: node scripts/build-netlify.mjs <video.mp4> <carpeta-salida> [url-del-sitio]'); process.exit(1); }
const BASE = (baseArg || 'https://sillallena.netlify.app').replace(/\/$/, '');
const OUT = resolve(outArg);
const PUB = new URL('../public/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const dir of ['css', 'img']) cpSync(join(PUB, dir), join(OUT, dir), { recursive: true });
copyFileSync(join(PUB, 'icon.svg'), join(OUT, 'icon.svg'));
copyFileSync(video, join(OUT, 'demo.mp4'));

const toDemo = (html) => html
  .replace(/<a class="([^"]*)" href="\/app(\?rubro=[a-z]+)?#\/registro">[^<]*<\/a>/g, '<a class="$1" href="#demo">Ver la demo</a>')
  .replace(/<a class="btn btn-sm" href="\/app">Entrar<\/a>/, '<a class="btn btn-sm" href="#demo">Ver demo</a>')
  .replace(/<a href="\/app">Entrar<\/a>/g, '')
  .replace(/\s*<link rel="manifest" href="\/manifest.webmanifest">/, '');

const demo = (biz) => `
    <section class="lp-wrap" id="demo">
      <h2 class="lp-h2">Mira cómo funciona</h2>
      <p class="muted lp-demo-lead">Un recorrido real: el negocio se registra, un cliente reserva desde el celular y se cobra en caja.</p>
      <video class="lp-video" src="/demo.mp4" poster="/img/agenda.webp" controls playsinline preload="metadata"></video>
      <p class="xs muted lp-note">Muy pronto disponible. ¿Quieres probarla en tu ${biz}? Escríbenos.</p>
    </section>
`;
const page = (vertical) => toDemo(renderLanding(BASE, vertical))
  .replace('    <section class="lp-band" id="precios">', `${demo(VERTICALS[vertical].terms.biz)}\n    <section class="lp-band" id="precios">`);

writeFileSync(join(OUT, 'index.html'), page('barberia'));
const urls = [`${BASE}/`];
for (const [id, v] of Object.entries(VERTICALS)) {
  if (id === 'barberia') continue;
  mkdirSync(join(OUT, 'para', v.seo.slug), { recursive: true });
  writeFileSync(join(OUT, 'para', v.seo.slug, 'index.html'), page(id));
  urls.push(`${BASE}/para/${v.seo.slug}`);
}
for (const f of ['privacidad', 'terminos']) {
  writeFileSync(join(OUT, `${f}.html`), toDemo(readFileSync(join(PUB, `${f}.html`), 'utf8')));
  urls.push(`${BASE}/${f}`);
}
writeFileSync(join(OUT, 'css', 'landing.css'), `${readFileSync(join(OUT, 'css', 'landing.css'), 'utf8')}.lp-video { width: 100%; border-radius: var(--r-lg); border: 1px solid var(--c-border); box-shadow: var(--shadow-pop); background: var(--c-text); display: block; }\n.lp-demo-lead { margin-bottom: var(--s-4); }\n`);
writeFileSync(join(OUT, 'robots.txt'), robots(BASE));
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);

// Netlify Drop lee _redirects y _headers (netlify.toml solo con deploy desde Git o CLI).
const csp = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'";
writeFileSync(join(OUT, '_redirects'), '/privacidad  /privacidad.html  200\n/terminos  /terminos.html  200\n/para/barberias  /  301\n');
writeFileSync(join(OUT, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: SAMEORIGIN\n  Content-Security-Policy: ${csp}\n`);
console.log(OUT);
