import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, signup } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const get = async (p) => { const r = await fetch(srv.base + p, { redirect: 'manual' }); return { status: r.status, headers: r.headers, text: await r.text() }; };
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

test('landing: título, canonical, Open Graph y SoftwareApplication', async () => {
  const r = await get('/');
  assert.match(r.text, /<title>Software para barberías: agenda online \| Silla Llena<\/title>/);
  assert.equal((r.text.match(/<meta name="description"/g) || []).length, 1);
  assert.match(r.text, /<link rel="canonical" href="http:\/\/localhost:\d+\/">/);
  assert.match(r.text, /property="og:image" content="[^"]+\/img\/og\.png"/);
  const app = ld(r.text).find((x) => x['@type'] === 'SoftwareApplication');
  assert.equal(app.offers.length, 3);
  assert.ok(!JSON.stringify(ld(r.text)).includes('aggregateRating'), 'sin calificaciones inventadas');
});

test('páginas por rubro y redirección de la duplicada', async () => {
  const r = await get('/para/peluquerias');
  assert.equal(r.status, 200);
  assert.match(r.text, /<title>Sistema de reservas para peluquerías y salones \| Silla Llena<\/title>/);
  assert.match(r.text, /<h1>Tu agenda llena, sin pagar por cada WhatsApp\.<\/h1>/);
  assert.match(r.text, /href="\/app\?rubro=peluqueria#\/registro"/);
  assert.match(r.text, /<link rel="canonical" href="[^"]+\/para\/peluquerias">/);
  const dup = await get('/para/barberias');
  assert.equal(dup.status, 301);
  assert.equal(dup.headers.get('location'), '/');
  assert.equal((await get('/para/dentistas')).status, 404);
});

test('página de reservas: datos del negocio en el HTML y LocalBusiness', async () => {
  const { c, business } = await signup(srv.base, 201, { vertical: 'peluqueria' });
  await c.put('/api/business', { name: 'Salón <script>alert(1)</script> & Co', address: 'Av. Providencia 123, Santiago', instagram: 'salonco', phone: '+56 9 1234 5678' });
  const r = await get(`/b/${business.slug}`);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('<script>alert(1)</script>'), 'el nombre se escapa');
  assert.match(r.text, /<h1>Salón &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Co<\/h1>/);
  assert.match(r.text, /<li>Mechas \/ balayage · 180 min · \$65\.000<\/li>/);
  const biz = ld(r.text)[0];
  assert.equal(biz['@type'], 'HairSalon');
  assert.equal(biz.address.streetAddress, 'Av. Providencia 123, Santiago');
  assert.equal(biz.sameAs[0], 'https://www.instagram.com/salonco');
  assert.ok(biz.hasOfferCatalog.itemListElement.some((o) => o.itemOffered.name === 'Mechas / balayage' && o.price === '65000' && o.priceCurrency === 'CLP'));
  assert.ok(biz.openingHoursSpecification.length >= 5);
  const missing = await get('/b/no-existe-este');
  assert.equal(missing.status, 404);
  assert.match(missing.text, /<meta name="robots" content="noindex">/);
});

test('robots.txt, sitemap y noindex en lo privado', async () => {
  const { business } = await signup(srv.base, 202);
  const robots = await get('/robots.txt');
  assert.match(robots.text, /Disallow: \/app\nDisallow: \/r\/\nDisallow: \/api\//);
  assert.match(robots.text, /Sitemap: http:\/\/localhost:\d+\/sitemap\.xml/);
  const map = await get('/sitemap.xml');
  assert.match(map.headers.get('content-type'), /application\/xml/);
  assert.ok(map.text.includes(`/b/${business.slug}</loc>`));
  assert.ok(map.text.includes('/para/tatuajes</loc>'));
  assert.equal((await get('/app')).headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await get('/r/cualquiera')).headers.get('x-robots-tag'), 'noindex, nofollow');
});
