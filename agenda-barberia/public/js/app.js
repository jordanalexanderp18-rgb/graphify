// Panel de la barbería (SPA con rutas por hash).
import {
  APP_NAME, h, clear, icon, api, toast, money, toMinor, fromMinor, todayIn, addDays, weekdayOf, dateLabel, dateTimeLabel,
  partsIn, minToHHMM, hhmmToMin, field, input, select, formData, showFormError, busy, modal, confirmDialog, emptyState,
  statusBadge, METHODS, avatar, resizeImage,
} from './ui.js';

const root = document.getElementById('app');
const S = { me: null, services: [], staff: [], products: [] };
const biz = () => S.me.business;
const cur = () => biz().currency;
const fmt = (v) => money(v, cur());
const feature = (f) => !!S.me.plan?.features?.[f];
const can = (perm) => ({
  owner: ['settings', 'catalog', 'reports', 'operate', 'agenda', 'users'],
  reception: ['operate', 'agenda'],
  barber: ['agenda'],
})[S.me.user.role].includes(perm);

// ------------------------------------------------------------ arranque y rutas

const NAV = [
  ['agenda', 'Agenda', 'calendar', 'agenda'],
  ['clientes', 'Clientes', 'users', 'agenda'],
  ['caja', 'Caja', 'cash', 'operate'],
  ['productos', 'Productos', 'box', 'operate', true],
  ['reportes', 'Reportes', 'chart', 'reports'],
  ['mensajes', 'Mensajes', 'chat', 'operate', true],
  ['config', 'Configuración', 'gear', 'settings'],
];

async function boot() {
  try {
    const me = await api('GET', '/api/me');
    if (!me.user) return renderAuth(location.hash === '#/registro' ? 'signup' : 'login');
    S.me = me;
  } catch (e) {
    return clear(root, h('div', { class: 'auth' }, h('div', { class: 'card stack' }, h('h2', {}, 'No pudimos cargar'), h('p', {}, e.message),
      h('button', { class: 'btn btn-primary', onclick: boot }, 'Reintentar'))));
  }
  await loadCatalog();
  window.addEventListener('hashchange', route);
  route();
}

async function loadCatalog() {
  [S.services, S.staff, S.products] = await Promise.all([api('GET', '/api/services'), api('GET', '/api/staff'), api('GET', '/api/products')]);
}

const VIEWS = {
  agenda: viewAgenda, clientes: viewClients, cliente: viewClient, caja: viewPos, productos: viewProducts,
  reportes: viewReports, mensajes: viewMessages, config: viewConfig, design: viewDesign,
};

function route() {
  if (!S.me) return;
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, arg] = path.split('/');
  const view = VIEWS[name] ? name : 'agenda';
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const navKey = view === 'cliente' ? 'clientes' : view;
  const main = h('main', { class: 'main', id: 'main' });
  clear(root, h('div', { class: 'shell' }, sidebar(navKey), main));
  document.title = `${NAV.find((n) => n[0] === navKey)?.[1] || 'Panel'} · ${biz().name} · ${APP_NAME}`;
  Promise.resolve(VIEWS[view](main, arg, params)).catch((e) => {
    if (e.status === 402) {
      return clear(main, h('div', { class: 'card stack' }, h('h2', {}, 'Función de un plan pago'), h('p', {}, e.message),
        can('settings') ? h('a', { class: 'btn btn-primary', href: '#/config?tab=plan' }, 'Ver planes') : h('p', { class: 'muted' }, 'Pídele al dueño que active el plan.')));
    }
    clear(main, h('div', { class: 'card stack' }, h('h2', {}, 'Algo salió mal'), h('p', {}, e.message),
      h('button', { class: 'btn', onclick: route }, 'Reintentar')));
  });
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function sidebar(active) {
  return h('nav', { class: 'side', 'aria-label': 'Principal' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, APP_NAME[0]), h('span', {}, APP_NAME)),
    NAV.filter((n) => can(n[3])).map(([key, label, ic, , secondary]) =>
      h('a', { class: 'nav-link', href: `#/${key}`, 'aria-current': key === active ? 'page' : null, 'data-secondary': secondary || null }, icon(ic), h('span', {}, label))),
    h('div', { class: 'side-foot stack-sm' },
      S.me.plan?.status === 'trialing' && S.me.plan.trial_ends_at && can('settings')
        ? h('a', { class: 'badge badge-accent', href: '#/config?tab=plan' }, `Prueba: ${Math.max(0, Math.ceil((Date.parse(S.me.plan.trial_ends_at) - Date.now()) / 86400000))} días`) : null,
      S.me.branches?.length > 1
        ? select({ 'aria-label': 'Sucursal', class: 'input', onchange: async (e) => {
          await api('POST', '/api/branches/switch', { business_id: e.target.value });
          location.hash = '#/agenda'; location.reload();
        } }, S.me.branches.map((x) => [x.id, x.name]), biz().id)
        : h('div', { class: 'xs muted' }, biz().name),
      h('div', { class: 'xs muted' }, `${S.me.user.name || S.me.user.email} · ${{ owner: 'Dueño', reception: 'Recepción', barber: 'Barbero' }[S.me.user.role]}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: logout }, icon('logout'), 'Salir')));
}

async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  location.hash = '';
  location.reload();
}

// ------------------------------------------------------------ ingreso / registro

function renderAuth(mode) {
  const isSignup = mode === 'signup';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago';
  const country = COUNTRIES.find((c) => c.tz === tz) || COUNTRIES[0];
  const form = h('form', { class: 'stack', novalidate: true },
    isSignup ? field('Nombre de la barbería', input({ name: 'business_name', required: true, autocomplete: 'organization' })) : null,
    isSignup ? field('Tu nombre', input({ name: 'name', required: true, autocomplete: 'name' })) : null,
    field('Correo', input({ name: 'email', type: 'email', required: true, autocomplete: 'email' })),
    field('Contraseña', input({ name: 'password', type: 'password', required: true, autocomplete: isSignup ? 'new-password' : 'current-password', minlength: isSignup ? 8 : null }),
      isSignup ? 'Mínimo 8 caracteres.' : null),
    isSignup ? field('País', select({ name: 'country' }, COUNTRIES.map((c, i) => [i, c.name]), COUNTRIES.indexOf(country))) : null,
    isSignup ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'demo', checked: true }), 'Cargar datos de ejemplo para probar') : null,
    h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isSignup ? 'Crear mi cuenta' : 'Entrar'),
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const d = formData(form);
    await busy(btn, async () => {
      try {
        if (isSignup) {
          const c = COUNTRIES[Number(d.country)] || COUNTRIES[0];
          await api('POST', '/api/auth/signup', { business_name: d.business_name, name: d.name, email: d.email, password: d.password, demo: d.demo, timezone: c.tz, currency: c.currency, phone_prefix: c.prefix });
        } else {
          await api('POST', '/api/auth/login', { email: d.email, password: d.password });
        }
        location.hash = '#/agenda';
        location.reload();
      } catch (e) { showFormError(form, e); }
    });
  });
  document.title = `${isSignup ? 'Crear cuenta' : 'Entrar'} · ${APP_NAME}`;
  clear(root, h('div', { class: 'auth' }, h('div', { class: 'card stack' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, APP_NAME[0]), h('span', {}, APP_NAME)),
    h('h1', {}, isSignup ? 'Crea tu barbería' : 'Entra a tu panel'),
    h('p', { class: 'muted' }, isSignup ? 'En dos minutos tienes agenda, enlace de reservas y caja.' : 'Agenda, caja y clientes en un solo lugar.'),
    form,
    h('p', { class: 'muted' }, isSignup ? '¿Ya tienes cuenta? ' : '¿Primera vez? ',
      h('a', { href: isSignup ? '#/login' : '#/registro', onclick: (e) => { e.preventDefault(); history.replaceState(null, '', isSignup ? '#/login' : '#/registro'); renderAuth(isSignup ? 'login' : 'signup'); } },
        isSignup ? 'Entrar' : 'Crear cuenta gratis')))));
  form.querySelector('input')?.focus();
}

const COUNTRIES = [
  { name: 'Chile', tz: 'America/Santiago', currency: 'CLP', prefix: '56' },
  { name: 'México', tz: 'America/Mexico_City', currency: 'MXN', prefix: '52' },
  { name: 'Colombia', tz: 'America/Bogota', currency: 'COP', prefix: '57' },
  { name: 'Perú', tz: 'America/Lima', currency: 'PEN', prefix: '51' },
  { name: 'Argentina', tz: 'America/Argentina/Buenos_Aires', currency: 'ARS', prefix: '54' },
  { name: 'Ecuador', tz: 'America/Guayaquil', currency: 'USD', prefix: '593' },
  { name: 'República Dominicana', tz: 'America/Santo_Domingo', currency: 'DOP', prefix: '1' },
  { name: 'España', tz: 'Europe/Madrid', currency: 'EUR', prefix: '34' },
  { name: 'Estados Unidos (Este)', tz: 'America/New_York', currency: 'USD', prefix: '1' },
];

// ------------------------------------------------------------ agenda

const SLOT_PX = 18; // 15 minutos
const agendaState = { date: null, mode: 'day', staffId: null };

async function viewAgenda(main, _arg, params) {
  const tz = biz().timezone;
  agendaState.date = params.date || agendaState.date || todayIn(tz);
  const activeStaff = S.staff.filter((s) => s.active && (S.me.user.role !== 'barber' || s.id === S.me.user.staff_id));
  if (!agendaState.staffId || !activeStaff.some((s) => s.id === agendaState.staffId)) agendaState.staffId = activeStaff[0]?.id;
  const { date, mode } = agendaState;
  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7));
  const from = mode === 'week' ? weekStart : date;
  const to = mode === 'week' ? addDays(weekStart, 6) : date;

  const setDate = (d) => { agendaState.date = d; go(`#/agenda?date=${d}`); };
  const step = mode === 'week' ? 7 : 1;
  const bar = h('div', { class: 'agenda-bar' },
    h('button', { class: 'btn btn-sm', type: 'button', onclick: () => setDate(todayIn(tz)) }, 'Hoy'),
    h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Anterior', onclick: () => setDate(addDays(date, -step)) }, icon('left')),
    h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Siguiente', onclick: () => setDate(addDays(date, step)) }, icon('right')),
    h('h1', { class: 'agenda-date' }, mode === 'week'
      ? `Semana del ${dateLabel(weekStart, { day: 'numeric', month: 'short' })} al ${dateLabel(to, { day: 'numeric', month: 'short' })}`
      : dateLabel(date)),
    h('input', { class: 'input', type: 'date', value: date, 'aria-label': 'Ir a fecha', style: { width: 'auto' }, onchange: (e) => e.target.value && setDate(e.target.value) }),
    h('div', { class: 'grow' }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' },
      h('button', { type: 'button', 'aria-pressed': String(mode === 'day'), onclick: () => { agendaState.mode = 'day'; route(); } }, 'Día'),
      h('button', { type: 'button', 'aria-pressed': String(mode === 'week'), onclick: () => { agendaState.mode = 'week'; route(); } }, 'Semana')),
    mode === 'week' && activeStaff.length > 1
      ? select({ 'aria-label': 'Barbero', style: { width: 'auto' }, onchange: (e) => { agendaState.staffId = e.target.value; route(); } },
        activeStaff.map((s) => [s.id, s.name]), agendaState.staffId)
      : null,
    can('operate') ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => apptModal({ walkin: true }) }, 'Sin cita') : null,
    can('operate') ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => apptModal({ date }) }, icon('plus'), 'Nueva cita') : null,
  );
  clear(main, bar, h('div', { class: 'cal', 'aria-busy': 'true' }, h('p', { class: 'empty' }, 'Cargando agenda…')));

  if (!activeStaff.length) {
    return clear(main, bar, h('div', { class: 'card' }, emptyState('Todavía no hay barberos activos.',
      can('catalog') ? h('a', { class: 'btn btn-primary', href: '#/config?tab=equipo' }, 'Agregar barbero') : null)));
  }
  const [appts, off] = await Promise.all([
    api('GET', `/api/appointments?from=${from}&to=${to}`),
    api('GET', `/api/time-off?from=${from}&to=${to}`),
  ]);
  const cols = mode === 'week'
    ? Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), staff: activeStaff.find((s) => s.id === agendaState.staffId) }))
    : activeStaff.map((s) => ({ date, staff: s }));

  // Rango visible: desde la primera apertura hasta el último cierre (o 9-20).
  let startMin = 24 * 60, endMin = 0;
  for (const c of cols) for (const r of c.staff.hours.filter((x) => x.weekday === weekdayOf(c.date))) {
    startMin = Math.min(startMin, hhmmToMin(r.start)); endMin = Math.max(endMin, hhmmToMin(r.end));
  }
  for (const a of appts) {
    const s = partsIn(a.start_at, tz).min, e = s + (Date.parse(a.end_at) - Date.parse(a.start_at)) / 60000;
    startMin = Math.min(startMin, s); endMin = Math.max(endMin, e);
  }
  if (startMin >= endMin) { startMin = 9 * 60; endMin = 20 * 60; }
  startMin = Math.floor(startMin / 60) * 60; endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60);
  const slots = (endMin - startMin) / 15;

  const grid = h('div', { class: 'cal-grid', style: { gridTemplateColumns: `56px repeat(${cols.length}, minmax(150px, 1fr))` } });
  grid.append(h('div', { class: 'cal-corner' }));
  for (const c of cols) {
    grid.append(h('div', { class: `cal-head sc-${c.staff.color}` }, mode === 'week'
      ? [h('span', {}, dateLabel(c.date, { weekday: 'short', day: 'numeric' })), c.date === todayIn(tz) ? h('span', { class: 'badge badge-accent' }, 'Hoy') : null]
      : [avatar(c.staff, 28), h('span', {}, c.staff.name)]));
  }
  const times = h('div', { class: 'cal-times' });
  for (let m = startMin; m < endMin; m += 60) times.append(h('div', { class: 'cal-time' }, minToHHMM(m)));
  grid.append(times);

  const nowP = partsIn(Date.now(), tz);
  for (const c of cols) {
    const col = h('div', { class: `cal-col sc-${c.staff.color}`, style: { height: `${slots * SLOT_PX}px` } });
    const ranges = c.staff.hours.filter((x) => x.weekday === weekdayOf(c.date)).map((r) => [hhmmToMin(r.start), hhmmToMin(r.end)]);
    for (let i = 0; i < slots; i++) {
      const m = startMin + i * 15;
      const open = ranges.some(([a, b]) => m >= a && m < b);
      col.append(h('button', {
        class: open ? 'cal-slot open' : 'cal-slot', type: 'button', tabindex: open ? null : '-1',
        'aria-label': `Nueva cita ${minToHHMM(m)} con ${c.staff.name}`,
        onclick: can('operate') ? () => apptModal({ date: c.date, time: minToHHMM(m), staffId: c.staff.id }) : null,
        disabled: can('operate') ? null : true,
      }));
    }
    for (const t of off.filter((t) => t.staff_id === c.staff.id)) {
      const s = partsIn(t.start_at, tz), e = partsIn(t.end_at, tz);
      if (s.date > c.date || e.date < c.date) continue;
      const a = s.date < c.date ? 0 : s.min, b = e.date > c.date ? 1440 : e.min;
      const top = Math.max(a, startMin), bottom = Math.min(b, endMin);
      if (bottom <= top) continue;
      col.append(h('div', { class: 'cal-off', style: { top: `${((top - startMin) / 15) * SLOT_PX}px`, height: `${((bottom - top) / 15) * SLOT_PX}px` } }, t.reason || 'Bloqueado'));
    }
    for (const a of appts.filter((x) => x.staff_id === c.staff.id && partsIn(x.start_at, tz).date === c.date)) {
      const s = partsIn(a.start_at, tz).min;
      const len = (Date.parse(a.end_at) - Date.parse(a.start_at)) / 60000;
      col.append(h('button', {
        class: 'appt', type: 'button', 'data-status': a.status,
        style: { top: `${((s - startMin) / 15) * SLOT_PX + 1}px`, height: `${Math.max(SLOT_PX, (len / 15) * SLOT_PX) - 2}px`, zIndex: a.status === 'cancelled' ? '1' : '2' },
        'aria-label': `${minToHHMM(s)} ${a.client_name}, ${a.service_name}, ${statusText(a.status)}`,
        onclick: () => apptDetail(a),
      }, h('strong', {}, `${minToHHMM(s)} ${a.client_name}`), h('span', {}, a.service_name)));
    }
    if (c.date === nowP.date && nowP.min >= startMin && nowP.min < endMin) {
      col.append(h('div', { class: 'now-line', style: { top: `${((nowP.min - startMin) / 15) * SLOT_PX}px` } }));
    }
    grid.append(col);
  }
  const cal = h('div', { class: 'cal' }, grid);
  const counts = appts.filter((a) => a.status !== 'cancelled');
  clear(main, bar, cal, h('p', { class: 'xs muted', style: { marginTop: 'var(--s-2)' } },
    `${counts.length} cita(s) · ${fmt(counts.reduce((s, a) => s + a.price, 0))} agendado`));
  // Llevar la vista a la hora actual.
  if (nowP.date >= from && nowP.date <= to && nowP.min > startMin) cal.scrollTop = Math.max(0, ((nowP.min - startMin) / 15) * SLOT_PX - 120);
}

const statusText = (s) => ({ booked: 'reservada', confirmed: 'confirmada', done: 'atendida', no_show: 'no llegó', cancelled: 'cancelada' })[s];

function apptDetail(a) {
  const tz = biz().timezone;
  const p = partsIn(a.start_at, tz);
  const setStatus = async (btn, status, opts = {}) => busy(btn, async () => {
    try {
      await api('POST', `/api/appointments/${a.id}/status`, { status, ...opts });
      toast(`Cita ${statusText(status)}.`);
      m.close(); route();
    } catch (e) { toast(e.message, 'error'); }
  });
  const waText = `Hola ${a.client_name.split(' ')[0]}, te escribimos de ${biz().name} por tu hora del ${dateTimeLabel(a.start_at, tz)}.`;
  const body = h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('h3', {}, a.client_name), statusBadge(a.status)),
    h('div', { class: 'grid-2' },
      h('div', {}, h('div', { class: 'label' }, 'Servicio'), h('div', {}, a.service_name)),
      h('div', {}, h('div', { class: 'label' }, 'Barbero'), h('div', {}, a.staff_name)),
      h('div', {}, h('div', { class: 'label' }, 'Cuándo'), h('div', {}, `${dateLabel(p.date)} · ${p.time}`)),
      h('div', {}, h('div', { class: 'label' }, 'Precio'), h('div', { class: 'num' }, fmt(a.price))),
      h('div', {}, h('div', { class: 'label' }, 'Origen'), h('div', {}, { online: 'Reserva online', panel: 'Panel', walkin: 'Sin cita' }[a.source])),
      a.client_phone ? h('div', {}, h('div', { class: 'label' }, 'Teléfono'), h('a', { href: `https://wa.me/${a.client_phone}?text=${encodeURIComponent(waText)}`, target: '_blank', rel: 'noopener' }, `+${a.client_phone} · WhatsApp`)) : null,
    ),
    a.deposit ? h('div', { class: 'row-between card-flat' },
      h('span', {}, `Anticipo ${fmt(a.deposit)}: `, h('span', { class: `badge ${a.deposit_status === 'paid' ? 'badge-ok' : 'badge-warn'}` }, a.deposit_status === 'paid' ? 'recibido' : 'pendiente')),
      can('operate') ? h('button', { class: 'btn btn-sm', type: 'button', onclick: async (e) => {
        await busy(e.currentTarget, async () => {
          try {
            await api('POST', `/api/appointments/${a.id}/deposit`, { status: a.deposit_status === 'paid' ? 'pending' : 'paid' });
            toast(a.deposit_status === 'paid' ? 'Anticipo marcado como pendiente.' : 'Anticipo recibido.'); m.close(); route();
          } catch (err) { toast(err.message, 'error'); }
        });
      } }, a.deposit_status === 'paid' ? 'Marcar pendiente' : 'Anticipo recibido') : null) : null,
    a.notes ? h('div', {}, h('div', { class: 'label' }, 'Notas'), h('p', {}, a.notes)) : null,
    h('a', { href: `#/cliente/${a.client_id}`, onclick: () => m.close() }, 'Ver ficha del cliente'),
  );
  const active = ['booked', 'confirmed'].includes(a.status);
  const btns = [];
  if (active && a.status === 'booked') btns.push(h('button', { class: 'btn', type: 'button', onclick: (e) => setStatus(e.currentTarget, 'confirmed') }, 'Confirmar'));
  if (active && can('operate')) btns.push(h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); apptModal({ appt: a }); } }, 'Mover / editar'));
  if (active) btns.push(h('button', { class: 'btn btn-danger', type: 'button', onclick: (e) => setStatus(e.currentTarget, 'no_show') }, 'No llegó'));
  if (active && can('operate')) btns.push(h('button', { class: 'btn btn-danger', type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    if (await confirmDialog('Cancelar cita', `¿Cancelar la cita de ${a.client_name}? Le avisaremos por WhatsApp.`, 'Cancelar cita', true)) setStatus(btn, 'cancelled', { notify: true });
  } }, 'Cancelar'));
  if (['cancelled', 'no_show'].includes(a.status) && can('operate')) btns.push(h('button', { class: 'btn', type: 'button', onclick: (e) => setStatus(e.currentTarget, 'booked') }, 'Reactivar'));
  if (!a.sale_id && a.status !== 'cancelled' && can('operate')) btns.push(h('a', { class: 'btn btn-primary', href: `#/caja?appt=${a.id}`, onclick: () => m.close() }, 'Cobrar'));
  if (!a.sale_id && a.status !== 'done' && active && !can('operate')) btns.push(h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => setStatus(e.currentTarget, 'done') }, 'Marcar atendida'));
  const m = modal('Cita', body, btns);
}

function apptModal({ appt, date, time, staffId, walkin, client } = {}) {
  const tz = biz().timezone;
  const editing = !!appt;
  const services = S.services.filter((s) => s.active);
  const staff = S.staff.filter((s) => s.active);
  if (!services.length || !staff.length) return toast('Primero crea servicios y barberos en Configuración.', 'error');
  const p = appt ? partsIn(appt.start_at, tz) : null;
  let clientId = appt?.client_id || null;

  const svc = select({ name: 'service_id' }, services.map((s) => [s.id, `${s.name} · ${s.duration_min} min · ${fmt(s.price)}`]), appt?.service_id || services[0].id);
  const st = select({ name: 'staff_id' }, staff.map((s) => [s.id, s.name]), appt?.staff_id || staffId || staff[0].id);
  const dt = input({ name: 'date', type: 'date', value: p?.date || date || todayIn(tz), required: true });
  const tm = input({ name: 'time', type: 'time', step: 300, value: p?.time || time || '', required: !walkin });
  const price = input({ name: 'price', inputmode: 'decimal', placeholder: 'Precio del servicio', value: appt ? fromMinor(appt.price, cur()) : '' });
  const notes = h('textarea', { class: 'input', name: 'notes', maxlength: 500, placeholder: 'Ej.: degradado bajo, número 1 a los lados' }, appt?.notes || '');
  const free = h('div', { class: 'row', 'aria-live': 'polite' });

  const loadFree = async () => {
    if (!dt.value) return;
    clear(free, h('span', { class: 'xs muted' }, 'Buscando horas libres…'));
    try {
      const slots = await api('GET', `/api/availability?service_id=${svc.value}&staff_id=${st.value}&date=${dt.value}`);
      const shown = slots.slice(0, 24);
      clear(free, shown.length ? shown.map((s) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { tm.value = s.time; } }, s.time))
        : h('span', { class: 'xs muted' }, 'Sin horas libres ese día con este barbero.'));
    } catch { clear(free); }
  };
  [svc, st, dt].forEach((el) => el.addEventListener('change', loadFree));

  // Cliente: buscar uno existente o crear al vuelo.
  const clientBox = h('div', { class: 'stack-sm' });
  const renderClient = (c) => {
    if (c) {
      clientId = c.id;
      clear(clientBox, h('div', { class: 'card-flat row-between' }, h('div', {}, h('strong', {}, c.name), c.phone ? h('div', { class: 'xs muted' }, `+${c.phone}`) : null),
        editing ? null : h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { clientId = null; renderClient(null); } }, 'Cambiar')));
      return;
    }
    const q = input({ placeholder: 'Buscar por nombre o teléfono', 'aria-label': 'Buscar cliente', autocomplete: 'off' });
    const results = h('div', { class: 'stack-sm' });
    let t;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.value.trim().length < 2) return clear(results);
        const list = await api('GET', `/api/clients?q=${encodeURIComponent(q.value.trim())}`).catch(() => []);
        clear(results, list.slice(0, 5).map((c) => h('button', { type: 'button', class: 'btn btn-sm', style: { justifyContent: 'flex-start' }, onclick: () => renderClient(c) },
          `${c.name}${c.phone ? ` · +${c.phone}` : ''}`)));
      }, 200);
    });
    clear(clientBox, q, results,
      h('div', { class: 'grid-2' },
        field('Nombre (cliente nuevo)', input({ name: 'client_name', autocomplete: 'off' })),
        field('Teléfono / WhatsApp', input({ name: 'client_phone', type: 'tel', autocomplete: 'off' }))));
  };
  renderClient(appt ? { id: appt.client_id, name: appt.client_name, phone: appt.client_phone } : client || null);

  const form = h('form', { class: 'stack', novalidate: true },
    h('div', {}, h('div', { class: 'label' }, 'Cliente'), clientBox),
    field('Servicio', svc), field('Barbero', st),
    walkin ? h('p', { class: 'muted' }, 'Cliente sin cita: queda registrado desde ahora con el barbero elegido.') :
      h('div', { class: 'grid-2' }, field('Fecha', dt), field('Hora', tm)),
    walkin ? null : h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Horas libres'), free),
    field('Precio (opcional)', price, 'Déjalo vacío para usar el precio del servicio.'),
    field('Notas', notes),
    walkin ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'force' }), 'Permitir fuera del horario del barbero'),
    walkin || editing ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'notify', checked: true }), 'Enviar confirmación y recordatorio por WhatsApp'),
  );
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Guardar cambios' : walkin ? 'Registrar' : 'Agendar');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(form);
    const payload = {
      service_id: d.service_id, staff_id: d.staff_id, notes: d.notes, force: d.force,
      price: d.price === '' ? undefined : toMinor(d.price, cur()),
    };
    if (walkin) payload.source = 'walkin';
    else { payload.date = d.date; payload.time = d.time; }
    if (!editing) {
      payload.notify = d.notify;
      if (clientId) payload.client_id = clientId;
      else payload.client = { name: d.client_name, phone: d.client_phone };
    }
    await busy(save, async () => {
      try {
        await api(editing ? 'PUT' : 'POST', editing ? `/api/appointments/${appt.id}` : '/api/appointments', payload);
        toast(editing ? 'Cita actualizada.' : 'Cita agendada.');
        m.close();
        if (!walkin && d.date) agendaState.date = d.date;
        go(`#/agenda?date=${agendaState.date}`);
      } catch (e) {
        if (e.data?.field === 'client.name') e.data.field = 'client_name';
        if (e.data?.field === 'client.phone') e.data.field = 'client_phone';
        showFormError(form, e);
      }
    });
  });
  const m = modal(editing ? 'Editar cita' : walkin ? 'Cliente sin cita' : 'Nueva cita', form, [
    h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save,
  ]);
  save.setAttribute('form', form.id = `f-${Date.now()}`);
  if (!walkin) loadFree();
}

// ------------------------------------------------------------ clientes

async function viewClients(main) {
  const q = input({ type: 'search', placeholder: 'Buscar por nombre, teléfono o correo', 'aria-label': 'Buscar clientes', style: { maxWidth: '360px' } });
  const list = h('div', {});
  const load = async () => {
    const rows = await api('GET', `/api/clients?q=${encodeURIComponent(q.value.trim())}`);
    if (!rows.length) {
      return clear(list, h('div', { class: 'card' }, emptyState(q.value ? 'No encontramos clientes con esa búsqueda.' : 'Aún no tienes clientes. Se crean solos cuando alguien reserva.',
        can('operate') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => clientModal() }, 'Agregar cliente') : null)));
    }
    clear(list, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nombre'), h('th', {}, 'Teléfono'), h('th', { class: 'r' }, 'Visitas'), h('th', {}, 'Última visita'), h('th', { class: 'r' }, 'Gastado'))),
      h('tbody', {}, rows.map((c) => h('tr', { class: 'click', onclick: () => go(`#/cliente/${c.id}`) },
        h('td', {}, h('a', { href: `#/cliente/${c.id}` }, c.name)),
        h('td', { class: 'num' }, c.phone ? `+${c.phone}` : '—'),
        h('td', { class: 'r num' }, c.visits),
        h('td', {}, c.last_visit ? dateTimeLabel(c.last_visit, biz().timezone) : '—'),
        h('td', { class: 'r num' }, fmt(c.spent))))))));
  };
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  clear(main, h('div', { class: 'page-head' }, h('h1', {}, 'Clientes'),
    h('div', { class: 'row' }, q, can('operate') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => clientModal() }, icon('plus'), 'Cliente') : null)), list);
  await load();
}

function clientModal(c) {
  const form = h('form', { class: 'stack', novalidate: true },
    field('Nombre', input({ name: 'name', value: c?.name || '', required: true })),
    h('div', { class: 'grid-2' },
      field('Teléfono / WhatsApp', input({ name: 'phone', type: 'tel', value: c?.phone ? `+${c.phone}` : '' })),
      field('Correo', input({ name: 'email', type: 'email', value: c?.email || '' }))),
    h('div', { class: 'grid-2' },
      field('Cumpleaños (MM-DD)', input({ name: 'birthday', placeholder: '08-24', value: c?.birthday || '', pattern: '\\d{2}-\\d{2}' })),
      field('Etiquetas', input({ name: 'tags', value: c?.tags || '', placeholder: 'vip, barba' }))),
    field('Notas', h('textarea', { class: 'input', name: 'notes', maxlength: 1000, placeholder: 'Preferencias, alergias, cómo le gusta el corte' }, c?.notes || '')),
    c ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'marketing_opt_out', checked: !!c.marketing_opt_out }), 'No quiere recibir campañas') : null,
  );
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Guardar');
  save.addEventListener('click', () => busy(save, async () => {
    try {
      const out = await api(c ? 'PUT' : 'POST', c ? `/api/clients/${c.id}` : '/api/clients', formData(form));
      toast('Cliente guardado.');
      m.close();
      go(`#/cliente/${out.id}`);
    } catch (e) {
      if (e.status === 409 && e.data.id) { toast(e.message, 'error'); m.close(); return go(`#/cliente/${e.data.id}`); }
      showFormError(form, e);
    }
  }));
  const m = modal(c ? 'Editar cliente' : 'Nuevo cliente', form, [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save]);
}

async function viewClient(main, id) {
  const c = await api('GET', `/api/clients/${id}`);
  const tz = biz().timezone;
  const next = c.appointments.filter((a) => ['booked', 'confirmed'].includes(a.status) && Date.parse(a.start_at) > Date.now()).at(-1);
  const due = c.last_visit && c.avg_interval_days ? addDays(partsIn(c.last_visit, tz).date, c.avg_interval_days) : null;
  clear(main,
    h('div', { class: 'page-head' },
      h('div', { class: 'stack-sm' }, h('a', { href: '#/clientes', class: 'xs' }, '← Clientes'), h('h1', {}, c.name),
        h('div', { class: 'row' }, c.phone ? h('a', { href: `https://wa.me/${c.phone}`, target: '_blank', rel: 'noopener' }, `+${c.phone}`) : null,
          c.email ? h('span', { class: 'muted' }, c.email) : null,
          c.tags ? c.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => h('span', { class: 'badge' }, t)) : null)),
      h('div', { class: 'row' },
        can('operate') ? h('button', { class: 'btn', type: 'button', onclick: () => clientModal(c) }, 'Editar') : null,
        can('operate') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => apptModalFor(c) }, 'Agendar') : null)),
    h('div', { class: 'grid-4', style: { marginBottom: 'var(--s-5)' } },
      stat('Visitas', c.visits), stat('Gastado', fmt(c.spent)),
      stat('Cada cuánto viene', c.avg_interval_days ? `${c.avg_interval_days} días` : '—'),
      stat('No llegó', c.no_shows)),
    next ? h('div', { class: 'card-flat', style: { marginBottom: 'var(--s-4)' } }, `Próxima cita: ${dateTimeLabel(next.start_at, tz)} · ${next.service_name} con ${next.staff_name}`)
      : due ? h('div', { class: 'card-flat', style: { marginBottom: 'var(--s-4)' } }, `Sin cita futura. Según su ritmo, le toca alrededor del ${dateLabel(due, { day: 'numeric', month: 'long' })}.`) : null,
    c.notes ? h('div', { class: 'card', style: { marginBottom: 'var(--s-4)' } }, h('div', { class: 'label' }, 'Notas'), h('p', {}, c.notes)) : null,
    h('h2', { style: { marginBottom: 'var(--s-3)' } }, 'Historial'),
    c.appointments.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Servicio'), h('th', {}, 'Barbero'), h('th', {}, 'Estado'), h('th', { class: 'r' }, 'Precio'))),
      h('tbody', {}, c.appointments.map((a) => h('tr', {},
        h('td', {}, dateTimeLabel(a.start_at, tz)), h('td', {}, a.service_name), h('td', {}, a.staff_name), h('td', {}, statusBadge(a.status)), h('td', { class: 'r num' }, fmt(a.price)))))))
      : h('div', { class: 'card' }, emptyState('Sin citas todavía.')),
    can('settings') ? h('div', { style: { marginTop: 'var(--s-6)' } }, h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => {
      if (!await confirmDialog('Borrar datos del cliente', 'Se borran nombre, teléfono, correo y notas. El historial de ventas queda anónimo. No se puede deshacer.', 'Borrar datos', true)) return;
      await api('DELETE', `/api/clients/${c.id}`);
      toast('Datos borrados.');
      go('#/clientes');
    } }, 'Borrar datos personales')) : null,
  );
}

const apptModalFor = (c) => apptModal({ date: todayIn(biz().timezone), client: c });

const stat = (label, value, hint) => h('div', { class: 'stat' }, h('span', { class: 'xs muted' }, label), h('span', { class: 'stat-value' }, value), hint ? h('span', { class: 'xs muted' }, hint) : null);

// ------------------------------------------------------------ caja

async function viewPos(main, _arg, params) {
  const tz = biz().timezone;
  const today = todayIn(tz);
  const [reg, todayAppts, sales] = await Promise.all([
    api('GET', '/api/register'),
    api('GET', `/api/appointments?from=${today}&to=${today}`),
    api('GET', `/api/sales?from=${today}&to=${today}`),
  ]);
  S.products = await api('GET', '/api/products');
  const cart = { items: [], appt: null, client: null, discount: 0, tip: 0, method: reg.open ? 'cash' : 'card' };
  // Las visitas con varios servicios aparecen una vez (su primera cita).
  const pending = todayAppts.filter((a) => !a.sale_id && a.status !== 'cancelled' && a.status !== 'no_show' && (!a.group_id || a.group_id === a.id));
  const firstStaff = S.staff.find((s) => s.active)?.id || null;

  const loadAppt = (a, pool = todayAppts) => {
    // Una visita con varios servicios se cobra junta.
    const visit = a.group_id ? pool.filter((x) => x.group_id === a.group_id && x.status !== 'cancelled' && !x.sale_id) : [a];
    cart.appt = visit[0] || a;
    cart.client = { id: a.client_id, name: a.client_name };
    cart.items = (visit.length ? visit : [a]).map((x) => ({ kind: 'service', ref_id: x.service_id, name: x.service_name, staff_id: x.staff_id, qty: 1, unit: x.price }));
    renderCart();
  };
  const addItem = (kind, ref) => {
    const same = cart.items.find((i) => i.kind === kind && i.ref_id === ref.id);
    if (same && kind === 'product') same.qty++;
    else cart.items.push({ kind, ref_id: ref.id, name: ref.name, staff_id: cart.appt?.staff_id || firstStaff, qty: 1, unit: ref.price });
    renderCart();
  };

  const cartBox = h('div', { class: 'card stack', 'aria-label': 'Venta actual' });
  const renderCart = () => {
    const subtotal = cart.items.reduce((s, i) => s + i.unit * i.qty, 0);
    cart.discount = Math.min(cart.discount, subtotal);
    const prepaid = cart.appt?.deposit_status === 'paid' ? Math.min(cart.appt.deposit, subtotal - cart.discount + cart.tip) : 0;
    const total = subtotal - cart.discount + cart.tip - prepaid;
    const pay = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: cart.items.length ? null : true }, `Cobrar ${fmt(total)}`);
    pay.addEventListener('click', () => busy(pay, async () => {
      try {
        const sale = await api('POST', '/api/sales', {
          appointment_id: cart.appt?.id, client_id: cart.client?.id, payment_method: cart.method,
          discount: cart.discount, tip: cart.tip,
          items: cart.items.map((i) => ({ kind: i.kind, ref_id: i.ref_id, staff_id: i.staff_id, qty: i.qty, unit_price: i.unit })),
        });
        toast(`Venta registrada: ${fmt(sale.total)} en ${METHODS[sale.payment_method].toLowerCase()}.`);
        go('#/caja');
      } catch (e) { toast(e.message, 'error'); }
    }));
    const staffOpts = S.staff.filter((s) => s.active).map((s) => [s.id, s.name]);
    clear(cartBox,
      h('div', { class: 'row-between' }, h('h2', {}, 'Venta'), cart.items.length ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { Object.assign(cart, { items: [], appt: null, client: null, discount: 0, tip: 0 }); renderCart(); } }, 'Vaciar') : null),
      cart.client ? h('div', { class: 'card-flat' }, `Cliente: ${cart.client.name}`) : null,
      cart.items.length ? h('div', {}, cart.items.map((it, idx) => h('div', { class: 'cart-line' },
        h('div', { class: 'stack-sm' }, h('strong', {}, it.name),
          select({ 'aria-label': `Barbero para ${it.name}`, class: 'input', onchange: (e) => { it.staff_id = e.target.value; } }, staffOpts, it.staff_id)),
        it.kind === 'product'
          ? h('input', { class: 'input', type: 'number', min: 1, value: it.qty, 'aria-label': `Cantidad de ${it.name}`, style: { width: '64px' }, onchange: (e) => { it.qty = Math.max(1, Number(e.target.value) || 1); renderCart(); } })
          : h('span', {}),
        h('div', { class: 'stack-sm', style: { alignItems: 'flex-end' } }, h('span', { class: 'num' }, fmt(it.unit * it.qty)),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Quitar ${it.name}`, onclick: () => { cart.items.splice(idx, 1); if (!cart.items.some((i) => i.kind === 'service')) cart.appt = null; renderCart(); } }, icon('x'))))))
        : emptyState('Elige una cita por cobrar o agrega servicios y productos.'),
      h('div', { class: 'grid-2' },
        field('Descuento', input({ inputmode: 'decimal', value: cart.discount ? fromMinor(cart.discount, cur()) : '', placeholder: '0', onchange: (e) => { cart.discount = toMinor(e.target.value, cur()); renderCart(); } })),
        field('Propina', input({ inputmode: 'decimal', value: cart.tip ? fromMinor(cart.tip, cur()) : '', placeholder: '0', onchange: (e) => { cart.tip = toMinor(e.target.value, cur()); renderCart(); } }))),
      h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Medio de pago'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Medio de pago' }, ['cash', 'card', 'transfer'].map((k) =>
          h('button', { type: 'button', 'aria-pressed': String(cart.method === k), onclick: () => { cart.method = k; renderCart(); } }, METHODS[k]))),
        cart.method === 'cash' && !reg.open ? h('span', { class: 'field-error' }, 'Abre la caja para recibir efectivo.') : null),
      h('div', { class: 'totals num' },
        h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, fmt(subtotal))),
        cart.discount ? h('div', {}, h('span', {}, 'Descuento'), h('span', {}, `− ${fmt(cart.discount)}`)) : null,
        cart.tip ? h('div', {}, h('span', {}, 'Propina'), h('span', {}, fmt(cart.tip))) : null,
        prepaid ? h('div', {}, h('span', {}, 'Anticipo ya pagado'), h('span', {}, `− ${fmt(prepaid)}`)) : null,
        h('div', { class: 'grand' }, h('span', {}, 'Total'), h('span', {}, fmt(total)))),
      pay);
  };

  const regCard = reg.open
    ? h('div', { class: 'card row-between' },
      h('div', { class: 'stack-sm' }, h('div', { class: 'row' }, h('span', { class: 'badge badge-ok' }, 'Caja abierta'), h('span', { class: 'xs muted' }, `desde ${dateTimeLabel(reg.open.opened_at, tz)}`)),
        h('div', { class: 'row num' }, h('span', {}, `Fondo ${fmt(reg.open.opening_amount)}`),
          reg.open.by_method.map((r) => h('span', { class: 'muted' }, `${METHODS[r.payment_method]} ${fmt(r.total)}`)),
          h('strong', {}, `Efectivo esperado ${fmt(reg.open.expected_cash)}`))),
      h('button', { class: 'btn', type: 'button', onclick: () => closeRegister(reg.open) }, 'Cerrar caja'))
    : h('div', { class: 'card row-between' }, h('div', { class: 'stack-sm' }, h('span', { class: 'badge' }, 'Caja cerrada'), h('span', { class: 'muted' }, 'Ábrela con el efectivo inicial para recibir pagos en efectivo.')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: openRegister }, 'Abrir caja'));

  const services = S.services.filter((s) => s.active);
  const products = S.products.filter((p) => p.active);
  clear(main,
    h('div', { class: 'page-head' }, h('h1', {}, 'Caja')),
    h('div', { class: 'stack' }, regCard,
      h('div', { class: 'pos' },
        h('div', { class: 'stack' },
          h('section', { class: 'stack-sm' }, h('h2', {}, 'Citas de hoy por cobrar'),
            pending.length ? h('div', { class: 'pick-list' }, pending.map((a) => h('button', { class: `pick sc-${a.staff_color}`, type: 'button', onclick: () => loadAppt(a) },
              h('span', { class: 'row' }, h('span', { class: 'dot' }), h('strong', {}, partsIn(a.start_at, tz).time)), h('span', {}, a.client_name), h('span', { class: 'xs muted' }, a.group_id
                ? `${todayAppts.filter((x) => x.group_id === a.group_id).map((x) => x.service_name).join(' + ')}`
                : `${a.service_name} · ${fmt(a.price)}`))))
              : h('p', { class: 'muted' }, 'No quedan citas por cobrar hoy.')),
          h('section', { class: 'stack-sm' }, h('h2', {}, 'Servicios'),
            h('div', { class: 'pick-list' }, services.map((s) => h('button', { class: 'pick', type: 'button', onclick: () => addItem('service', s) }, h('strong', {}, s.name), h('span', { class: 'xs muted num' }, fmt(s.price)))))),
          h('section', { class: 'stack-sm' }, h('h2', {}, 'Productos'),
            products.length ? h('div', { class: 'pick-list' }, products.map((p) => h('button', { class: 'pick', type: 'button', disabled: p.stock <= 0 ? true : null, onclick: () => addItem('product', p) },
              h('strong', {}, p.name), h('span', { class: 'xs muted num' }, `${fmt(p.price)} · ${p.stock} en stock`))))
              : h('p', { class: 'muted' }, 'Sin productos a la venta.'))),
        cartBox),
      h('section', { class: 'stack-sm' }, h('h2', {}, 'Ventas de hoy'),
        sales.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Hora'), h('th', {}, 'Cliente'), h('th', {}, 'Detalle'), h('th', {}, 'Pago'), h('th', { class: 'r' }, 'Total'), can('settings') ? h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')) : null)),
          h('tbody', {}, sales.map((s) => h('tr', {},
            h('td', { class: 'num' }, partsIn(s.created_at, tz).time), h('td', {}, s.client_name || '—'),
            h('td', {}, s.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')),
            h('td', {}, METHODS[s.payment_method]), h('td', { class: 'r num' }, fmt(s.total)),
            can('settings') ? h('td', { class: 'r' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
              if (!await confirmDialog('Anular venta', 'Se devuelve el stock y la cita vuelve a quedar por cobrar.', 'Anular', true)) return;
              try { await api('DELETE', `/api/sales/${s.id}`); toast('Venta anulada.'); route(); } catch (e) { toast(e.message, 'error'); }
            } }, 'Anular')) : null)))))
          : h('p', { class: 'muted' }, 'Todavía no hay ventas hoy.'))));
  const pre = params.appt && todayAppts.find((a) => a.id === params.appt);
  if (pre && !pre.sale_id) loadAppt(pre);
  else if (params.appt) {
    // Cita de otro día: traerla igual para cobrarla.
    const all = await api('GET', `/api/appointments?from=${addDays(today, -60)}&to=${addDays(today, 60)}`).catch(() => []);
    const a = all.find((x) => x.id === params.appt);
    if (a && !a.sale_id) loadAppt(a, all); else renderCart();
  } else renderCart();
}

function openRegister() {
  const amount = input({ name: 'amount', inputmode: 'decimal', placeholder: '0' });
  const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Abrir caja');
  ok.addEventListener('click', () => busy(ok, async () => {
    try { await api('POST', '/api/register/open', { amount: toMinor(amount.value || 0, cur()) }); toast('Caja abierta.'); m.close(); route(); } catch (e) { toast(e.message, 'error'); }
  }));
  const m = modal('Abrir caja', h('div', { class: 'stack' }, field('Efectivo inicial (fondo)', amount)), [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), ok]);
  amount.focus();
}

function closeRegister(open) {
  const counted = input({ name: 'counted', inputmode: 'decimal', placeholder: fromMinor(open.expected_cash, cur()) });
  const notes = input({ name: 'notes', placeholder: 'Opcional' });
  const diff = h('p', { class: 'num', 'aria-live': 'polite' });
  counted.addEventListener('input', () => {
    const d = toMinor(counted.value || 0, cur()) - open.expected_cash;
    diff.textContent = counted.value ? (d === 0 ? 'Cuadra exacto.' : d > 0 ? `Sobran ${fmt(d)}` : `Faltan ${fmt(-d)}`) : '';
  });
  const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Cerrar caja');
  ok.addEventListener('click', () => busy(ok, async () => {
    if (counted.value === '') return toast('Cuenta el efectivo e ingresa el total.', 'error');
    try {
      const r = await api('POST', '/api/register/close', { counted: toMinor(counted.value, cur()), notes: notes.value });
      toast(r.difference === 0 ? 'Caja cerrada. Cuadra exacto.' : `Caja cerrada. Diferencia ${fmt(r.difference)}.`);
      m.close(); route();
    } catch (e) { toast(e.message, 'error'); }
  }));
  const m = modal('Cerrar caja', h('div', { class: 'stack' },
    h('div', { class: 'card-flat stack-sm num' },
      h('div', {}, `Fondo inicial: ${fmt(open.opening_amount)}`),
      open.by_method.map((r) => h('div', {}, `${METHODS[r.payment_method]}: ${fmt(r.total)} (${r.n} venta${r.n === 1 ? '' : 's'})`)),
      h('strong', {}, `Efectivo esperado en caja: ${fmt(open.expected_cash)}`)),
    field('Efectivo contado', counted), diff, field('Notas', notes)), [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Volver'), ok]);
  counted.focus();
}

// ------------------------------------------------------------ productos

async function viewProducts(main) {
  S.products = await api('GET', '/api/products');
  const rows = S.products;
  clear(main,
    h('div', { class: 'page-head' }, h('h1', {}, 'Productos'),
      can('catalog') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => productModal() }, icon('plus'), 'Producto') : null),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Producto'), h('th', { class: 'r' }, 'Precio'), h('th', { class: 'r' }, 'Costo'), h('th', { class: 'r' }, 'Stock'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, rows.map((p) => h('tr', {},
        h('td', {}, h('div', { class: 'row' }, h('strong', {}, p.name), p.sku ? h('span', { class: 'xs muted' }, p.sku) : null, p.active ? null : h('span', { class: 'badge' }, 'Inactivo'))),
        h('td', { class: 'r num' }, fmt(p.price)), h('td', { class: 'r num' }, fmt(p.cost)),
        h('td', { class: 'r' }, h('span', { class: `badge ${p.stock <= p.low_stock_at ? 'badge-warn' : ''}` }, p.stock <= p.low_stock_at ? `${p.stock} · bajo` : p.stock)),
        h('td', { class: 'r' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => productModal(p) }, can('catalog') ? 'Editar' : 'Ajustar stock')))))))
      : h('div', { class: 'card' }, emptyState('Agrega los productos que vendes (ceras, aceites, shampoo) para cobrarlos en caja y controlar el stock.',
        can('catalog') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => productModal() }, 'Agregar producto') : null)));
}

function productModal(p) {
  const full = can('catalog');
  const form = h('form', { class: 'stack', novalidate: true },
    full ? field('Nombre', input({ name: 'name', value: p?.name || '', required: true })) : h('h3', {}, p.name),
    full ? h('div', { class: 'grid-2' },
      field('Precio de venta', input({ name: 'price', inputmode: 'decimal', value: p ? fromMinor(p.price, cur()) : '' })),
      field('Costo', input({ name: 'cost', inputmode: 'decimal', value: p ? fromMinor(p.cost, cur()) : '' }))) : null,
    h('div', { class: 'grid-2' },
      field('Stock', input({ name: 'stock', type: 'number', value: p?.stock ?? 0 })),
      full ? field('Avisar cuando queden', input({ name: 'low_stock_at', type: 'number', min: 0, value: p?.low_stock_at ?? 3 })) : null),
    full ? field('Código (SKU)', input({ name: 'sku', value: p?.sku || '' })) : null,
    full && p ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: p.active }), 'Activo (se puede vender)') : null);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Guardar');
  save.addEventListener('click', () => busy(save, async () => {
    const d = formData(form);
    const body = { stock: Number(d.stock) };
    if (full) Object.assign(body, { name: d.name, sku: d.sku, price: toMinor(d.price, cur()), cost: toMinor(d.cost || 0, cur()), low_stock_at: Number(d.low_stock_at) });
    if (full && p) body.active = d.active;
    try { await api(p ? 'PUT' : 'POST', p ? `/api/products/${p.id}` : '/api/products', body); toast('Producto guardado.'); m.close(); route(); } catch (e) { showFormError(form, e); }
  }));
  const m = modal(p ? 'Producto' : 'Nuevo producto', form, [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save]);
}

// ------------------------------------------------------------ reportes

async function viewReports(main, _arg, params) {
  const tz = biz().timezone;
  const today = todayIn(tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = {
    hoy: [today, today], '7d': [addDays(today, -6), today], mes: [monthStart, today],
    'mes-pasado': [addDays(monthStart, -1).slice(0, 8) + '01', addDays(monthStart, -1)],
  };
  const tab = params.tab === 'comisiones' ? 'comisiones' : 'resumen';
  const [from, to] = params.from && params.to ? [params.from, params.to] : presets[params.p] || presets.mes;
  const setRange = (f, t, p) => go(`#/reportes?tab=${tab}&from=${f}&to=${t}${p ? `&p=${p}` : ''}`);
  const fromI = input({ type: 'date', value: from, 'aria-label': 'Desde', style: { width: 'auto' } });
  const toI = input({ type: 'date', value: to, 'aria-label': 'Hasta', style: { width: 'auto' } });
  const apply = () => fromI.value && toI.value && setRange(fromI.value, toI.value);
  fromI.addEventListener('change', apply); toI.addEventListener('change', apply);
  const head = h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Reportes'),
      h('div', { class: 'row' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Periodo' }, [['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Este mes'], ['mes-pasado', 'Mes pasado']].map(([k, l]) =>
          h('button', { type: 'button', 'aria-pressed': String(presets[k][0] === from && presets[k][1] === to), onclick: () => setRange(...presets[k], k) }, l))),
        fromI, toI)),
    h('div', { class: 'tabs', role: 'tablist' },
      h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === 'resumen'), onclick: () => go(`#/reportes?tab=resumen&from=${from}&to=${to}`) }, 'Resumen'),
      h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === 'comisiones'), onclick: () => go(`#/reportes?tab=comisiones&from=${from}&to=${to}`) }, 'Comisiones')));
  clear(main, head, h('p', { class: 'muted' }, 'Calculando…'));

  if (tab === 'comisiones') {
    const r = await api('GET', `/api/reports/commissions?from=${from}&to=${to}`);
    const total = r.rows.reduce((s, x) => s + x.total_to_pay, 0);
    const csv = () => {
      const lines = [['Barbero', 'Servicios', 'Ventas servicios', '% serv', 'Comisión servicios', 'Ventas productos', '% prod', 'Comisión productos', 'Propinas', 'Total a pagar']];
      for (const x of r.rows) lines.push([x.name, x.services_count, fromMinor(x.services_total, cur()), x.commission_service_pct, fromMinor(x.services_commission, cur()), fromMinor(x.products_total, cur()), x.commission_product_pct, fromMinor(x.products_commission, cur()), fromMinor(x.tips, cur()), fromMinor(x.total_to_pay, cur())]);
      const blob = new Blob(['﻿' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `comisiones_${from}_${to}.csv` });
      document.body.append(a); a.click(); a.remove();
    };
    return clear(main, head,
      h('div', { class: 'row-between', style: { marginBottom: 'var(--s-4)' } }, h('p', { class: 'muted' }, `Total a pagar en el periodo: `, h('strong', { class: 'num' }, fmt(total))),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: csv }, 'Descargar CSV')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Barbero'), h('th', { class: 'r' }, 'Servicios'), h('th', { class: 'r' }, 'Comisión servicios'), h('th', { class: 'r' }, 'Comisión productos'), h('th', { class: 'r' }, 'Propinas'), h('th', { class: 'r' }, 'Total a pagar'))),
        h('tbody', {}, r.rows.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name)),
          h('td', { class: 'r num' }, `${x.services_count} · ${fmt(x.services_total)}`),
          h('td', { class: 'r num' }, `${fmt(x.services_commission)} (${x.commission_service_pct}%)`),
          h('td', { class: 'r num' }, `${fmt(x.products_commission)} (${x.commission_product_pct}%)`),
          h('td', { class: 'r num' }, fmt(x.tips)),
          h('td', { class: 'r num' }, h('strong', {}, fmt(x.total_to_pay)))))))),
      h('p', { class: 'xs muted', style: { marginTop: 'var(--s-3)' } }, 'La comisión se calcula sobre lo cobrado después de descuentos, con el porcentaje de cada barbero al momento de la venta.'));
  }

  const r = await api('GET', `/api/reports/summary?from=${from}&to=${to}`);
  const maxDay = Math.max(1, ...r.series.map((s) => s.total));
  const maxSvc = Math.max(1, ...r.top_services.map((s) => s.n));
  clear(main, head,
    h('div', { class: 'stack' },
      h('div', { class: 'grid-4' },
        stat('Ingresos', fmt(r.revenue), `${r.sales} venta(s) · ticket ${fmt(r.avg_ticket)}`),
        stat('Citas', r.appointments, `${r.by_status.done || 0} atendidas · ${r.online_share}% online`),
        stat('Ocupación', `${r.occupancy}%`, 'horas reservadas / horas de atención'),
        stat('No llegaron', `${r.no_show_rate}%`, `${r.by_status.no_show || 0} cita(s)`),
        stat('Clientes', r.clients, `${r.new_clients} nuevos · ${r.returning_clients} vuelven`),
        stat('Servicios / productos', fmt(r.services_revenue), `productos ${fmt(r.products_revenue)} · propinas ${fmt(r.tips)}`)),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card stack' }, h('h2', {}, 'Ingresos por día'),
          r.series.some((s) => s.total) ? h('div', { class: 'spark', role: 'img', 'aria-label': 'Ingresos por día' },
            r.series.map((s) => h('div', { class: 'spark-col', title: `${dateLabel(s.date, { day: 'numeric', month: 'short' })}: ${fmt(s.total)}`, style: { height: `${Math.round((s.total / maxDay) * 100)}%` } })))
            : emptyState('Sin ventas en este periodo.')),
        h('section', { class: 'card stack' }, h('h2', {}, 'Servicios más pedidos'),
          r.top_services.length ? h('div', { class: 'bars' }, r.top_services.map((s) => h('div', { class: 'bar-row' },
            h('span', {}, s.name), h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${(s.n / maxSvc) * 100}%` } })), h('span', { class: 'num xs' }, s.n))))
            : emptyState('Sin citas en este periodo.'))),
      h('section', { class: 'stack-sm' }, h('h2', {}, 'Por barbero'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Barbero'), h('th', { class: 'r' }, 'Atendidas'), h('th', { class: 'r' }, 'Ingresos'), h('th', { class: 'r' }, 'Ocupación'))),
          h('tbody', {}, r.by_staff.map((s) => h('tr', {},
            h('td', {}, h('span', { class: `row sc-${s.color}` }, h('span', { class: 'dot' }), s.name)),
            h('td', { class: 'r num' }, s.done), h('td', { class: 'r num' }, fmt(s.revenue)), h('td', { class: 'r num' }, `${s.occupancy}%`))))))),
      r.low_stock.length ? h('section', { class: 'card stack-sm' }, h('h2', {}, 'Stock bajo'),
        r.low_stock.map((p) => h('div', { class: 'row-between' }, h('span', {}, p.name), h('span', { class: 'badge badge-warn' }, `${p.stock} en stock`)))) : null));
}

// ------------------------------------------------------------ mensajes

async function viewMessages(main, _arg, params) {
  const tab = ['manual', 'pending', 'sent', 'failed', 'espera', 'campana'].includes(params.tab) ? params.tab : 'manual';
  const tz = biz().timezone;
  const tabs = [['manual', 'Por enviar'], ['pending', 'Programados'], ['sent', 'Enviados'], ['failed', 'Con error'], ['espera', 'Lista de espera'], ...(can('settings') ? [['campana', 'Campaña']] : [])];
  const head = h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Mensajes')),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) =>
      h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => go(`#/mensajes?tab=${k}`) }, l))));
  if (tab === 'campana') return clear(main, head, campaignForm());
  if (tab === 'espera') {
    const rows = await api('GET', '/api/waitlist');
    return clear(main, head, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Día'), h('th', {}, 'Cliente'), h('th', {}, 'Servicio'), h('th', {}, 'Estado'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, rows.map((w) => h('tr', {},
        h('td', {}, dateLabel(w.day, { weekday: 'short', day: 'numeric', month: 'short' })), h('td', {}, w.client_name),
        h('td', {}, `${w.service_name || '—'}${w.staff_name ? ` · ${w.staff_name}` : ''}`),
        h('td', {}, h('span', { class: `badge ${w.status === 'notified' ? 'badge-accent' : ''}` }, w.status === 'notified' ? 'Avisado' : 'Esperando')),
        h('td', { class: 'r' }, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
          h('a', { class: 'btn btn-sm btn-primary', href: w.wa_link, target: '_blank', rel: 'noopener', onclick: () => api('POST', `/api/waitlist/${w.id}/status`, { status: 'notified' }).then(() => setTimeout(route, 500)) }, 'Avisar por WhatsApp'),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => api('POST', `/api/waitlist/${w.id}/status`, { status: 'removed' }).then(route) }, 'Quitar'))))))))
      : h('div', { class: 'card' }, emptyState('Nadie en lista de espera. Cuando un día está lleno, los clientes pueden anotarse desde tu página de reservas.')));
  }
  const rows = await api('GET', `/api/reminders?status=${tab}`);
  const kinds = { confirmation: 'Confirmación', reminder: 'Recordatorio', cancelled: 'Cancelación', rebook: 'Te toca corte', campaign: 'Campaña' };
  clear(main, head,
    tab === 'manual' ? h('p', { class: 'muted', style: { marginBottom: 'var(--s-4)' } }, 'Sin la integración de WhatsApp Business conectada, los mensajes quedan aquí: tócalos para enviarlos desde el WhatsApp del local con el texto listo.') : null,
    rows.length ? h('div', { class: 'stack-sm' }, rows.map((r) => h('div', { class: 'card stack-sm' },
      h('div', { class: 'row-between' }, h('div', { class: 'row' }, h('strong', {}, r.client_name || 'Cliente'), h('span', { class: 'badge' }, kinds[r.kind]),
        h('span', { class: 'xs muted' }, `${{ whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' }[r.channel]} · ${dateTimeLabel(r.send_at, tz)}`)),
        h('div', { class: 'row' },
          tab === 'manual' && r.sms_link ? h('a', { class: 'btn btn-sm btn-primary', href: r.sms_link, onclick: () => api('POST', `/api/reminders/${r.id}/sent`).then(() => setTimeout(route, 500)) }, 'Enviar por SMS') : null,
          tab === 'manual' && r.wa_link ? h('a', { class: 'btn btn-sm btn-primary', href: r.wa_link, target: '_blank', rel: 'noopener', onclick: () => api('POST', `/api/reminders/${r.id}/sent`).then(() => setTimeout(route, 500)) }, 'Enviar por WhatsApp') : null,
          tab === 'manual' ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => api('POST', `/api/reminders/${r.id}/sent`).then(route) }, 'Marcar enviado') : null,
          tab === 'failed' ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => api('POST', `/api/reminders/${r.id}/retry`).then(route) }, 'Reintentar') : null)),
      h('p', { class: 'muted' }, r.body),
      r.error ? h('p', { class: 'field-error' }, r.error) : null)))
      : h('div', { class: 'card' }, emptyState({ manual: 'No hay mensajes por enviar. ¡Todo al día!', pending: 'No hay mensajes programados.', sent: 'Aún no se han enviado mensajes.', failed: 'Ningún mensaje con error.' }[tab])));
}

// ------------------------------------------------------------ configuración

async function viewConfig(main, _arg, params) {
  const tab = ['negocio', 'servicios', 'equipo', 'usuarios', 'importar', 'sucursales', 'plan'].includes(params.tab) ? params.tab : 'negocio';
  await loadCatalog();
  const head = h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Configuración')),
    h('div', { class: 'tabs', role: 'tablist' }, [['negocio', 'Negocio'], ['servicios', 'Servicios'], ['equipo', 'Equipo'], ['usuarios', 'Usuarios'], ['importar', 'Importar clientes'], ['sucursales', 'Sucursales'], ['plan', 'Plan']].map(([k, l]) =>
      h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => go(`#/config?tab=${k}`) }, l))));
  const body = h('div', {});
  clear(main, head, body);
  if (params.pago === 'ok') toast('¡Gracias! Tu plan se activa en unos segundos.');
  ({ negocio: cfgBusiness, servicios: cfgServices, equipo: cfgStaff, usuarios: cfgUsers, importar: cfgImport, sucursales: cfgBranches, plan: cfgPlan })[tab](body);
}

function cfgBusiness(box) {
  const b = biz();
  const link = `${location.origin}/b/${b.slug}`;
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'grid-2' },
      field('Nombre de la barbería', input({ name: 'name', value: b.name })),
      field('Enlace de reservas', input({ name: 'slug', value: b.slug }), `${location.host}/b/…`),
      field('Teléfono', input({ name: 'phone', value: b.phone, type: 'tel' })),
      field('Instagram', input({ name: 'instagram', value: b.instagram, placeholder: '@tubarberia' })),
      field('Dirección', input({ name: 'address', value: b.address })),
      field('Código de país (WhatsApp)', input({ name: 'phone_prefix', value: b.phone_prefix, inputmode: 'numeric' }))),
    h('h2', {}, 'Reglas de reserva online'),
    h('div', { class: 'grid-2' },
      field('Intervalo entre horas', select({ name: 'slot_step_min' }, [5, 10, 15, 20, 30, 60].map((v) => [v, `${v} min`]), b.slot_step_min)),
      field('Anticipación mínima', select({ name: 'min_notice_min' }, [[0, 'Sin mínimo'], [30, '30 min'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [1440, '1 día']], b.min_notice_min)),
      field('Se puede reservar hasta', select({ name: 'max_days_ahead' }, [7, 14, 30, 60, 90].map((v) => [v, `${v} días antes`]), b.max_days_ahead)),
      field('Cancelar o cambiar en línea hasta', select({ name: 'cancel_window_min' }, [[0, 'Hasta la hora'], [60, '1 hora antes'], [120, '2 horas antes'], [240, '4 horas antes'], [1440, '1 día antes']], b.cancel_window_min)),
      field('Recordatorio por WhatsApp', select({ name: 'reminder_hours' }, [2, 3, 6, 12, 24, 48, 72].map((v) => [v, `${v} horas antes`]), b.reminder_hours)),
      field('Aviso "te toca corte"', select({ name: 'rebook_days' }, [14, 21, 28, 35, 45, 60].map((v) => [v, `${v} días sin venir`]), b.rebook_days))),
    h('div', { class: 'grid-2' },
      field('Zona horaria', input({ name: 'timezone', value: b.timezone })),
      field('Moneda', input({ name: 'currency', value: b.currency, maxlength: 3 }))),
    h('h2', {}, 'Mensajes y anticipos'),
    h('div', { class: 'grid-2' },
      field('Canal para clientes con teléfono', select({ name: 'message_channel' }, [['whatsapp', 'WhatsApp'], ['sms', 'SMS']], b.message_channel)),
      field('Enlace de pago para anticipos (opcional)', input({ name: 'payment_link', value: b.payment_link, placeholder: 'https://mpago.la/…' }))),
    field('Datos para transferir el anticipo', h('textarea', { class: 'input', name: 'deposit_instructions', maxlength: 500, placeholder: 'Banco, tipo y número de cuenta, RUT/RFC, correo' }, b.deposit_instructions),
      'Se muestran al cliente cuando reserva un servicio con anticipo. El anticipo se define en cada servicio.'),
    h('div', {}, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar')));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(form);
    for (const k of ['slot_step_min', 'min_notice_min', 'max_days_ahead', 'cancel_window_min', 'reminder_hours', 'rebook_days']) d[k] = Number(d[k]);
    await busy(form.querySelector('[type=submit]'), async () => {
      try { S.me.business = await api('PUT', '/api/business', d); toast('Datos guardados.'); route(); } catch (e) { showFormError(form, e); }
    });
  });
  const copy = h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Enlace copiado. Pégalo en tu Instagram y WhatsApp.'); } catch { toast(link); } } }, icon('link'), 'Copiar enlace');
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'card row-between' }, h('div', { class: 'stack-sm grow' }, h('div', { class: 'label' }, 'Tu página de reservas'), h('a', { href: link, target: '_blank', rel: 'noopener' }, link),
      h('span', { class: 'xs muted' }, 'Ponla en la bio de Instagram, en Google Maps y en la respuesta automática de WhatsApp.')), copy),
    h('div', { class: 'card' }, form)));
}

function cfgServices(box) {
  const rows = S.services;
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('p', { class: 'muted' }, 'La duración define cuánto espacio ocupa en la agenda. El tiempo extra sirve para limpiar entre clientes.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => serviceModal() }, icon('plus'), 'Servicio')),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Servicio'), h('th', { class: 'r' }, 'Duración'), h('th', { class: 'r' }, 'Precio'), h('th', {}, 'Online'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, rows.map((s) => h('tr', {},
        h('td', {}, h('div', { class: 'stack-sm' }, h('strong', {}, s.name), h('span', { class: 'xs muted' }, [s.category, `${s.staff_count} barbero(s)`].filter(Boolean).join(' · ')))),
        h('td', { class: 'r num' }, `${s.duration_min} min${s.buffer_min ? ` + ${s.buffer_min}` : ''}`),
        h('td', { class: 'r num' }, fmt(s.price)),
        h('td', {}, !s.active ? h('span', { class: 'badge' }, 'Archivado') : s.online ? h('span', { class: 'badge badge-ok' }, 'Sí') : h('span', { class: 'badge' }, 'Solo panel')),
        h('td', { class: 'r' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => serviceModal(s) }, 'Editar')))))))
      : h('div', { class: 'card' }, emptyState('Crea tu primer servicio: corte, barba, combo…'))));
}

function serviceModal(s) {
  const form = h('form', { class: 'stack', novalidate: true },
    field('Nombre', input({ name: 'name', value: s?.name || '', required: true })),
    h('div', { class: 'grid-2' },
      field('Categoría', input({ name: 'category', value: s?.category || '', placeholder: 'Cortes, Barba, Combos' })),
      field('Precio', input({ name: 'price', inputmode: 'decimal', value: s ? fromMinor(s.price, cur()) : '' })),
      field('Duración (min)', input({ name: 'duration_min', type: 'number', min: 5, step: 5, value: s?.duration_min ?? 30 })),
      field('Tiempo extra después (min)', input({ name: 'buffer_min', type: 'number', min: 0, step: 5, value: s?.buffer_min ?? 0 }))),
    feature('anticipos') ? field('Anticipo al reservar (0 = sin anticipo)', input({ name: 'deposit', inputmode: 'decimal', value: s ? fromMinor(s.deposit, cur()) : '' })) : null,
    field('Descripción (se ve al reservar)', h('textarea', { class: 'input', name: 'description', maxlength: 300 }, s?.description || '')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'online', checked: s ? !!s.online : true }), 'Se puede reservar online'),
    s ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: !!s.active }), 'Activo') : null);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Guardar');
  save.addEventListener('click', () => busy(save, async () => {
    const d = formData(form);
    const body = { ...d, price: toMinor(d.price, cur()), duration_min: Number(d.duration_min), buffer_min: Number(d.buffer_min || 0) };
    if ('deposit' in d) body.deposit = toMinor(d.deposit || 0, cur());
    try { await api(s ? 'PUT' : 'POST', s ? `/api/services/${s.id}` : '/api/services', body); toast('Servicio guardado.'); m.close(); route(); } catch (e) { showFormError(form, e); }
  }));
  const del = s ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
    if (!await confirmDialog('Eliminar servicio', `¿Eliminar "${s.name}"? Si ya tiene citas, queda archivado.`, 'Eliminar', true)) return;
    const r = await api('DELETE', `/api/services/${s.id}`);
    toast(r.archived ? 'Servicio archivado (tenía citas).' : 'Servicio eliminado.');
    m.close(); route();
  } }, 'Eliminar') : null;
  const m = modal(s ? 'Editar servicio' : 'Nuevo servicio', form, [del, h('div', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save]);
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function cfgStaff(box) {
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('p', { class: 'muted' }, 'Horario, servicios que hace y comisión de cada barbero.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => staffModal() }, icon('plus'), 'Barbero')),
    S.staff.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Barbero'), h('th', {}, 'Días'), h('th', { class: 'r' }, 'Comisión'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, S.staff.map((s) => h('tr', {},
        h('td', {}, h('div', { class: `row sc-${s.color}` }, avatar(s), h('div', { class: 'stack-sm' }, h('strong', {}, s.name), s.specialty ? h('span', { class: 'xs muted' }, s.specialty) : null), s.active ? null : h('span', { class: 'badge' }, 'Inactivo'))),
        h('td', {}, [...new Set(s.hours.map((x) => x.weekday))].map((d) => WEEKDAYS[d].slice(0, 3)).join(' ') || 'Sin horario'),
        h('td', { class: 'r num' }, `${s.commission_service_pct}% serv · ${s.commission_product_pct}% prod`),
        h('td', { class: 'r' }, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => timeOffModal(s) }, 'Bloquear'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => staffModal(s) }, 'Editar'))))))))
      : h('div', { class: 'card' }, emptyState('Agrega a tu equipo para abrir su agenda.'))));
}

function staffModal(s) {
  const hours = {};
  for (let d = 0; d < 7; d++) hours[d] = (s?.hours || []).filter((x) => x.weekday === d).map((x) => ({ ...x }));
  if (!s) for (const d of [1, 2, 3, 4, 5, 6]) hours[d] = [{ start: '10:00', end: '20:00' }];
  const hoursBox = h('div', { class: 'week-hours' });
  const renderHours = () => clear(hoursBox, [1, 2, 3, 4, 5, 6, 0].map((d) => h('div', { class: 'wh-row' },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: hours[d].length > 0, onchange: (e) => { hours[d] = e.target.checked ? [{ start: '10:00', end: '20:00' }] : []; renderHours(); } }), WEEKDAYS[d]),
    h('div', { class: 'wh-ranges' }, hours[d].length ? hours[d].map((r, i) => h('div', { class: 'wh-range' },
      h('input', { class: 'input', type: 'time', value: r.start, 'aria-label': `${WEEKDAYS[d]} desde`, onchange: (e) => { r.start = e.target.value; } }),
      h('span', { class: 'muted' }, 'a'),
      h('input', { class: 'input', type: 'time', value: r.end, 'aria-label': `${WEEKDAYS[d]} hasta`, onchange: (e) => { r.end = e.target.value === '00:00' ? '24:00' : e.target.value; } }),
      i === hours[d].length - 1 ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Agregar franja (p. ej. después del almuerzo)', 'aria-label': `Agregar franja ${WEEKDAYS[d]}`, onclick: () => { hours[d].push({ start: hours[d][i].end, end: '20:00' }); renderHours(); } }, icon('plus')) : null,
      hours[d].length > 1 ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Quitar franja ${WEEKDAYS[d]}`, onclick: () => { hours[d].splice(i, 1); renderHours(); } }, icon('x')) : null))
      : h('span', { class: 'xs muted' }, 'No atiende')))));
  renderHours();
  const svcIds = new Set(s ? s.service_ids : S.services.filter((x) => x.active).map((x) => x.id));
  const durations = { ...(s?.durations || {}) };
  let photoData = null;
  const preview = h('span', {}, avatar(s || { name: '?', color: 'c1' }, 56));
  const photoInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'input', onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      photoData = await resizeImage(f);
      clear(preview, h('img', { class: 'avatar', src: photoData, alt: '', style: { width: '56px', height: '56px' } }));
    } catch (err) { toast(err.message, 'error'); }
  } });
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'row' }, preview, h('div', { class: 'grow' }, field('Foto (se ve al reservar)', photoInput))),
    h('div', { class: 'grid-2' },
      field('Nombre', input({ name: 'name', value: s?.name || '' })),
      field('Especialidad', input({ name: 'specialty', value: s?.specialty || '', placeholder: 'Degradados, barba…' })),
      field('Comisión servicios (%)', input({ name: 'commission_service_pct', type: 'number', min: 0, max: 100, value: s?.commission_service_pct ?? 40 })),
      field('Comisión productos (%)', input({ name: 'commission_product_pct', type: 'number', min: 0, max: 100, value: s?.commission_product_pct ?? 10 }))),
    h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Horario semanal'), hoursBox),
    h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Servicios que hace y cuánto se demora'),
      h('p', { class: 'xs muted' }, 'Deja la duración vacía para usar la del servicio. Útil si este barbero es más rápido o más lento.'),
      S.services.filter((x) => x.active).map((x) => h('div', { class: 'svc-dur' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: svcIds.has(x.id), onchange: (e) => (e.target.checked ? svcIds.add(x.id) : svcIds.delete(x.id)) }), x.name),
        h('input', { class: 'input', type: 'number', min: 5, max: 480, step: 5, placeholder: `${x.duration_min} min`, value: durations[x.id] ?? '',
          'aria-label': `Duración de ${x.name} con este barbero`, onchange: (e) => { durations[x.id] = e.target.value === '' ? null : Number(e.target.value); } })))),
    s ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: !!s.active }), 'Activo (aparece en la agenda y en reservas)') : null);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Guardar');
  save.addEventListener('click', () => busy(save, async () => {
    const d = formData(form);
    const body = {
      name: d.name, specialty: d.specialty,
      commission_service_pct: Number(d.commission_service_pct), commission_product_pct: Number(d.commission_product_pct),
      hours: Object.entries(hours).flatMap(([wd, list]) => list.map((r) => ({ weekday: Number(wd), start: r.start, end: r.end }))),
      service_ids: [...svcIds],
      service_durations: durations,
    };
    if (s) body.active = d.active;
    try {
      const saved = await api(s ? 'PUT' : 'POST', s ? `/api/staff/${s.id}` : '/api/staff', body);
      if (photoData) await api('PUT', `/api/staff/${saved.id}/photo`, { data_url: photoData });
      toast('Barbero guardado.'); m.close(); route();
    } catch (e) { showFormError(form, e); }
  }));
  const m = modal(s ? `Editar · ${s.name}` : 'Nuevo barbero', form, [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save]);
}

async function timeOffModal(s) {
  const tz = biz().timezone;
  const today = todayIn(tz);
  const list = h('div', { class: 'stack-sm' });
  const loadList = async () => {
    const rows = (await api('GET', `/api/time-off?from=${today}&to=${addDays(today, 120)}`)).filter((t) => t.staff_id === s.id);
    clear(list, rows.length ? rows.map((t) => h('div', { class: 'row-between card-flat' }, h('span', {}, `${dateTimeLabel(t.start_at, tz)} → ${dateTimeLabel(t.end_at, tz)}${t.reason ? ` · ${t.reason}` : ''}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { await api('DELETE', `/api/time-off/${t.id}`); loadList(); } }, 'Quitar')))
      : h('p', { class: 'xs muted' }, 'Sin bloqueos próximos.'));
  };
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'grid-2' },
      field('Desde el día', input({ name: 'date', type: 'date', value: today })),
      field('Hasta el día', input({ name: 'end_date', type: 'date', value: today })),
      field('Hora inicio', input({ name: 'start', type: 'time', value: '00:00' })),
      field('Hora término', input({ name: 'end', type: 'time', value: '23:59' }))),
    field('Motivo', input({ name: 'reason', placeholder: 'Vacaciones, trámite, curso…' })));
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Bloquear');
  save.addEventListener('click', () => busy(save, async () => {
    const d = formData(form);
    if (d.end === '23:59') d.end = '24:00';
    try { await api('POST', `/api/staff/${s.id}/time-off`, d); toast('Bloqueo guardado.'); loadList(); } catch (e) { showFormError(form, e); }
  }));
  const m = modal(`Bloquear agenda · ${s.name}`, h('div', { class: 'stack' }, form, h('h3', {}, 'Próximos bloqueos'), list), [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cerrar'), save]);
  loadList();
}

async function cfgUsers(box) {
  const users = await api('GET', '/api/users');
  const roleName = { owner: 'Dueño', reception: 'Recepción', barber: 'Barbero' };
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'grid-2' },
      field('Nombre', input({ name: 'name' })),
      field('Correo', input({ name: 'email', type: 'email' })),
      field('Contraseña inicial', input({ name: 'password', type: 'text', autocomplete: 'off' }), 'Mínimo 8 caracteres. Compártela en persona.'),
      field('Rol', select({ name: 'role' }, [['reception', 'Recepción: agenda, caja y clientes'], ['barber', 'Barbero: solo su agenda'], ['owner', 'Dueño: todo']], 'reception')),
      field('Barbero (si el rol es Barbero)', select({ name: 'staff_id' }, [['', '—'], ...S.staff.filter((s) => s.active).map((s) => [s.id, s.name])], ''))),
    h('div', {}, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Crear usuario')));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await busy(form.querySelector('[type=submit]'), async () => {
      try { await api('POST', '/api/users', formData(form)); toast('Usuario creado.'); route(); } catch (e) { showFormError(form, e); }
    });
  });
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Usuario'), h('th', {}, 'Rol'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, users.map((u) => h('tr', {},
        h('td', {}, h('div', { class: 'stack-sm' }, h('strong', {}, u.name || u.email), h('span', { class: 'xs muted' }, u.email))),
        h('td', {}, roleName[u.role], u.staff_id ? ` · ${S.staff.find((s) => s.id === u.staff_id)?.name || ''}` : ''),
        h('td', { class: 'r' }, u.id === S.me.user.id ? h('span', { class: 'xs muted' }, 'Tú') : h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => {
          if (!await confirmDialog('Quitar acceso', `¿Quitar el acceso de ${u.email}?`, 'Quitar', true)) return;
          await api('DELETE', `/api/users/${u.id}`); toast('Acceso quitado.'); route();
        } }, 'Quitar acceso'))))))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Invitar a alguien del equipo'), form)));
}

function cfgImport(box) {
  const file = h('input', { type: 'file', accept: '.csv,text/csv', class: 'input' });
  const out = h('div', { 'aria-live': 'polite' });
  const go2 = h('button', { class: 'btn btn-primary', type: 'button' }, 'Importar');
  go2.addEventListener('click', () => busy(go2, async () => {
    const f = file.files[0];
    if (!f) return toast('Elige un archivo CSV.', 'error');
    if (f.size > 1_000_000) return toast('El archivo supera 1 MB.', 'error');
    try {
      const r = await api('POST', '/api/clients/import', { csv: await f.text() });
      clear(out, h('div', { class: 'card-flat stack-sm' }, h('strong', {}, `${r.imported} clientes importados, ${r.skipped} omitidos.`), r.errors.map((e) => h('span', { class: 'xs muted' }, e))));
    } catch (e) { toast(e.message, 'error'); }
  }));
  clear(box, h('div', { class: 'card stack' },
    h('p', {}, 'Sube un CSV (puedes exportarlo desde Excel o Google Sheets) con las columnas: nombre, teléfono, correo. Los teléfonos repetidos se omiten.'),
    field('Archivo', file), h('div', {}, go2), out));
}

// ------------------------------------------------------------ catálogo de componentes (replica-design)

function viewDesign(main) {
  clear(main, h('div', { class: 'stack' },
    h('h1', {}, 'Componentes'),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-primary' }, 'Primario'), h('button', { class: 'btn' }, 'Secundario'), h('button', { class: 'btn btn-ghost' }, 'Fantasma'),
      h('button', { class: 'btn btn-danger' }, 'Peligro'), h('button', { class: 'btn', disabled: true }, 'Deshabilitado'), h('button', { class: 'btn btn-sm' }, 'Pequeño')),
    h('div', { class: 'row' }, Object.keys({ booked: 1, confirmed: 1, done: 1, no_show: 1, cancelled: 1 }).map(statusBadge), h('span', { class: 'badge badge-warn' }, 'Stock bajo')),
    h('div', { class: 'grid-2' }, field('Campo', input({ placeholder: 'Texto' })), field('Con error', input({ 'aria-invalid': 'true', value: 'mal' }))),
    h('div', { class: 'grid-4' }, stat('Ingresos', fmt(123400), 'ticket promedio'), stat('Ocupación', '72%')),
    h('div', { class: 'row' }, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((c) => h('span', { class: `row sc-${c}` }, h('span', { class: 'dot' }), c))),
    h('button', { class: 'btn', onclick: () => toast('Así se ve un aviso.') }, 'Probar aviso')));
}

// ------------------------------------------------------------ campañas, sucursales y plan

function campaignForm() {
  if (!feature('campanas')) return h('div', { class: 'card stack' }, h('p', {}, 'Las campañas son parte del plan Barbería.'), h('a', { class: 'btn btn-primary', href: '#/config?tab=plan' }, 'Ver planes'));
  const seg = select({ name: 'segment' }, [['all', 'Todos los clientes'], ['inactive', 'No vienen hace…'], ['birthday', 'Cumplen años este mes'], ['tag', 'Con etiqueta…']], 'inactive');
  const days = input({ name: 'days', type: 'number', min: 7, value: 45 });
  const tag = input({ name: 'tag', placeholder: 'vip' });
  const text = h('textarea', { class: 'input', name: 'text', maxlength: 700 }, 'Hola {nombre}, hace rato que no te vemos. Esta semana tienes 10% en tu corte. Reserva aquí: {enlace}');
  const preview = h('p', { class: 'muted', 'aria-live': 'polite' });
  const daysF = field('Días sin venir', days), tagF = field('Etiqueta', tag);
  const q = () => `segment=${seg.value}&days=${days.value}&tag=${encodeURIComponent(tag.value)}`;
  const refresh = async () => {
    daysF.hidden = seg.value !== 'inactive'; tagF.hidden = seg.value !== 'tag';
    try {
      const r = await api('GET', `/api/campaigns/preview?${q()}`);
      preview.textContent = r.count ? `Llegaría a ${r.count} cliente(s): ${r.sample.join(', ')}${r.count > 5 ? '…' : ''}` : 'Ningún cliente cumple el filtro.';
    } catch (e) { preview.textContent = e.message; }
  };
  [seg, days, tag].forEach((el) => el.addEventListener('change', refresh));
  const send = h('button', { class: 'btn btn-primary', type: 'button' }, 'Enviar campaña');
  send.addEventListener('click', () => busy(send, async () => {
    if (!await confirmDialog('Enviar campaña', preview.textContent, 'Enviar')) return;
    try {
      const r = await api('POST', '/api/campaigns', { segment: seg.value, days: Number(days.value), tag: tag.value, text: text.value });
      toast(`${r.queued} mensaje(s) en cola.`); go('#/mensajes?tab=manual');
    } catch (e) { toast(e.message, 'error'); }
  }));
  refresh();
  return h('div', { class: 'card stack' },
    h('p', { class: 'muted' }, 'Usa {nombre} y {enlace} (tu página de reservas). Se omiten los clientes que pidieron no recibir campañas.'),
    h('div', { class: 'grid-2' }, field('A quién', seg), daysF, tagF),
    field('Mensaje', text), preview, h('div', {}, send));
}

function cfgBranches(box) {
  const list = S.me.branches || [];
  const name = input({ name: 'name', placeholder: 'Sucursal Centro' });
  const add = h('button', { class: 'btn btn-primary', type: 'button' }, 'Crear sucursal');
  add.addEventListener('click', () => busy(add, async () => {
    try { await api('POST', '/api/branches', { name: name.value }); toast('Sucursal creada. Elígela en el menú para configurarla.'); S.me = await api('GET', '/api/me'); route(); } catch (e) { toast(e.message, 'error'); }
  }));
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Sucursal'), h('th', {}, 'Enlace de reservas'), h('th', {}, h('span', { class: 'sr-only' }, 'Acciones')))),
      h('tbody', {}, list.map((x) => h('tr', {}, h('td', {}, h('strong', {}, x.name)), h('td', {}, `/b/${x.slug}`),
        h('td', { class: 'r' }, x.id === biz().id ? h('span', { class: 'badge badge-accent' }, 'Actual')
          : h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('POST', '/api/branches/switch', { business_id: x.id }); location.hash = '#/agenda'; location.reload(); } }, 'Cambiar a esta'))))))),
    feature('sucursales')
      ? h('div', { class: 'card stack' }, h('h2', {}, 'Nueva sucursal'), h('p', { class: 'muted' }, 'Cada sucursal tiene su propia agenda, equipo, caja y enlace. Se factura una sola vez en el negocio principal.'), field('Nombre', name), h('div', {}, add))
      : h('div', { class: 'card stack' }, h('p', {}, 'Varias sucursales es parte del plan Cadena.'), h('a', { class: 'btn btn-primary', href: '#/config?tab=plan' }, 'Ver planes'))));
}

async function cfgPlan(box) {
  const p = await api('GET', '/api/billing');
  const days = p.trial_ends_at ? Math.ceil((Date.parse(p.trial_ends_at) - Date.now()) / 86400000) : 0;
  const status = { trialing: days > 0 ? `En prueba: quedan ${days} día(s)` : 'La prueba terminó', active: 'Activo', past_due: 'Pago pendiente: revisa tu tarjeta', canceled: 'Cancelado' }[p.status];
  const checkout = (plan, interval) => async (e) => busy(e.currentTarget, async () => {
    try { location.href = (await api('POST', '/api/billing/checkout', { plan, interval })).url; } catch (err) { toast(err.message, 'error'); }
  });
  const offer = (plan, label, price, perks) => h('article', { class: `card stack ${p.effective === plan ? 'lp-featured' : ''}` },
    h('h3', {}, label), h('p', { class: 'stat-value' }, price), h('ul', { class: 'lp-list' }, perks.map((x) => h('li', {}, x))),
    p.billing_enabled && !p.is_branch ? h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: checkout(plan, 'month') }, 'Pagar mensual'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: checkout(plan, 'year') }, 'Anual (2 meses gratis)')) : null);
  clear(box, h('div', { class: 'stack' },
    h('div', { class: 'card row-between' },
      h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Tu plan'), h('h2', {}, p.label), h('span', { class: 'muted' }, status),
        p.staff_limit ? h('span', { class: 'xs muted' }, `Hasta ${p.staff_limit} barbero(s) activos.`) : null),
      p.has_subscription && p.billing_enabled ? h('button', { class: 'btn', type: 'button', onclick: async (e) => busy(e.currentTarget, async () => {
        try { location.href = (await api('POST', '/api/billing/portal')).url; } catch (err) { toast(err.message, 'error'); }
      }) }, 'Cambiar tarjeta o cancelar') : null),
    p.is_branch ? h('p', { class: 'muted' }, 'Esta sucursal usa el plan del negocio principal.') : null,
    !p.billing_enabled ? h('p', { class: 'form-error' }, 'Los pagos aún no están conectados en este servidor (faltan las claves de Stripe). Escríbenos para activar tu plan.') : null,
    h('div', { class: 'grid-2' },
      offer('barberia', 'Barbería', 'US$15 / mes', ['Hasta 5 barberos', 'Caja, comisiones e inventario', 'Reportes', '"Te toca corte", lista de espera y campañas', 'Anticipos', 'Roles de recepción y barbero']),
      offer('cadena', 'Cadena', 'US$29 / mes', ['Barberos ilimitados', 'Todo lo de Barbería', 'Varias sucursales', 'WhatsApp automático'])),
    h('p', { class: 'xs muted' }, 'Cancelas con un clic y sigues usando el plan hasta el fin del periodo pagado. Si no pagas al terminar la prueba, pasas a Gratis sin perder datos.')));
}

boot();
