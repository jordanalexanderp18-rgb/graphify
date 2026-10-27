// SEO del lado del servidor: las páginas públicas salen con título,
// descripción, canonical, Open Graph y JSON-LD ya en el HTML (no dependen de
// JavaScript), más robots.txt y sitemap.xml.
import { readFileSync } from 'node:fs';
import { VERTICALS, verticalOf } from './verticals.js';
import { minToHHMM } from './availability.js';

const PUBLIC = new URL('../public/', import.meta.url);
const read = (f) => readFileSync(new URL(f, PUBLIC), 'utf8');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const ZERO = ['CLP', 'COP', 'PYG', 'ARS'];
const major = (amount, cur) => (ZERO.includes(cur) ? amount : amount / 100);

function head(html, { title, description, url, image, type = 'website', extra = '' }) {
  const tags = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${type}">`,
    '<meta property="og:site_name" content="Silla Llena">',
    '<meta property="og:locale" content="es_CL">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    extra,
  ].filter(Boolean).join('\n  ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</title>', `</title>\n  <meta name="description" content="${esc(description)}">`)
    .replace('</head>', `  ${tags}\n</head>`);
}

// Landing general (barbería) o por rubro (/para/peluquerias, …).
export function renderLanding(base, verticalId = 'barberia') {
  const v = VERTICALS[verticalId];
  const url = verticalId === 'barberia' ? `${base}/` : `${base}/para/${v.seo.slug}`;
  let html = read('index.html');
  if (verticalId !== 'barberia') {
    html = html
      .replace(/<p class="lp-eyebrow">[^<]*<\/p>/, `<p class="lp-eyebrow">${esc(v.seo.eyebrow)}</p>`)
      .replace(/<h1>[^<]*<\/h1>/, `<h1>${esc(v.seo.h1)}</h1>`)
      .replace(/<p class="lp-lead">[^<]*<\/p>/, `<p class="lp-lead">${esc(v.seo.description)}</p>`)
      .replaceAll('href="/app#/registro"', `href="/app?rubro=${verticalId}#/registro"`);
  }
  const offers = [['Gratis', 0], [v.terms.planLabel, 15], ['Cadena', 29]].map(([name, price]) => ({
    '@type': 'Offer', name, price: String(price), priceCurrency: 'USD',
  }));
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Silla Llena',
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, iOS (navegador)',
      description: v.seo.description, url, offers, inLanguage: 'es',
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Silla Llena', url: `${base}/`, logo: `${base}/icon.svg` },
  ];
  return head(html, {
    title: v.seo.title, description: v.seo.description, url, image: `${base}/img/og.png`,
    extra: ld.map(jsonLd).join('\n  '),
  });
}

// Horario del negocio = unión de los horarios de su equipo, por día.
function openingHours(db, businessId) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const rows = db.all(`select h.weekday, min(h.start_min) s, max(h.end_min) e from staff_hours h join staff st on st.id = h.staff_id
                       where st.business_id = ? and st.active = 1 group by h.weekday order by h.weekday`, businessId);
  return rows.map((r) => ({
    '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${DAYS[r.weekday]}`,
    opens: minToHHMM(r.s), closes: r.e >= 1440 ? '23:59' : minToHHMM(r.e),
  }));
}

// Página de reservas de un negocio: título, descripción y servicios en el HTML.
export function renderBooking(db, base, slug) {
  const b = db.get('select * from businesses where slug = ?', String(slug).toLowerCase());
  const html = read('book.html');
  if (!b) return { status: 404, html: html.replace('</head>', '  <meta name="robots" content="noindex">\n</head>') };
  const v = verticalOf(b);
  const services = db.all(`select name, duration_min, price from services s where business_id = ? and active = 1 and online = 1
                           and exists (select 1 from staff_services ss join staff st on st.id = ss.staff_id where ss.service_id = s.id and st.active = 1)
                           order by sort, name`, b.id);
  const url = `${base}/b/${b.slug}`;
  const fmt = (p) => { try { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: b.currency, maximumFractionDigits: ZERO.includes(b.currency) ? 0 : 2 }).format(major(p, b.currency)); } catch { return String(major(p, b.currency)); } };
  const title = clip(`${b.name}: reserva tu hora online${b.address ? ` · ${b.address}` : ''}`, 65);
  const top = services.slice(0, 3).map((s) => `${s.name} ${fmt(s.price)}`).join(', ');
  const description = clip(`Reserva en ${b.name} (${v.terms.biz}) las 24 horas, sin llamar.${top ? ` ${top}.` : ''} Confirmación y recordatorio por WhatsApp.`, 160);
  const ld = {
    '@context': 'https://schema.org', '@type': v.seo.schemaType, name: b.name, url,
    image: `${base}/img/og.png`,
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.address ? { address: { '@type': 'PostalAddress', streetAddress: b.address } } : {}),
    ...(b.instagram ? { sameAs: [`https://www.instagram.com/${b.instagram}`] } : {}),
    openingHoursSpecification: openingHours(db, b.id),
    hasOfferCatalog: {
      '@type': 'OfferCatalog', name: 'Servicios',
      itemListElement: services.map((s) => ({
        '@type': 'Offer', price: String(major(s.price, b.currency)), priceCurrency: b.currency,
        itemOffered: { '@type': 'Service', name: s.name },
      })),
    },
    potentialAction: { '@type': 'ReserveAction', target: url },
  };
  // Contenido visible sin JavaScript (lo reemplaza la app al cargar).
  const body = `<header class="book-head"><h1>${esc(b.name)}</h1>${b.address ? `<p class="muted">${esc(b.address)}</p>` : ''}</header>
    <section class="stack"><h2>Servicios</h2><ul class="stack-sm">${services.map((s) => `<li>${esc(s.name)} · ${s.duration_min} min · ${esc(fmt(s.price))}</li>`).join('')}</ul>
    <p class="muted">Cargando horas disponibles…</p></section>`;
  const out = head(html, { title, description, url, image: `${base}/img/og.png`, type: 'business.business', extra: jsonLd(ld) })
    .replace('<p class="empty">Cargando…</p>', body);
  return { status: 200, html: out };
}

export function robots(base) {
  return `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /r/\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}

export function sitemap(db, base) {
  const urls = [
    `${base}/`, ...Object.values(VERTICALS).filter((v) => v.seo.slug !== 'barberias').map((v) => `${base}/para/${v.seo.slug}`),
    `${base}/privacidad`, `${base}/terminos`,
    ...db.all(`select slug from businesses b where exists (select 1 from services s where s.business_id = b.id and s.active = 1 and s.online = 1)
               order by created_at limit 45000`).map((r) => `${base}/b/${r.slug}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
