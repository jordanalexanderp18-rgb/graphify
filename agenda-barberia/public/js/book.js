// Página pública: reservar (/b/:slug) y gestionar una reserva (/r/:token).
import {
  APP_NAME, h, clear, api, money, dateLabel, partsIn, field, input, formData, showFormError, busy, confirmDialog, avatar,
} from './ui.js';

const root = document.getElementById('book');
const [, kind, key] = location.pathname.split('/');

const fmtWhen = (iso, tz) => {
  const p = partsIn(iso, tz);
  return `${dateLabel(p.date)} a las ${p.time}`;
};

// ------------------------------------------------------------ selector de día y hora

function dayPicker({ slug, serviceIds, staffId, tz, onPick, onNoSlots, initialDate, ignoreToken }) {
  const box = h('div', { class: 'stack' });
  const strip = h('div', { class: 'days', role: 'group', 'aria-label': 'Día' });
  const slotsBox = h('div', { class: 'stack-sm', 'aria-live': 'polite' });
  let from = null;
  let selected = null;
  const staffQ = `service_ids=${serviceIds.join(',')}${staffId && staffId !== 'any' ? `&staff_id=${staffId}` : ''}${ignoreToken ? `&ignore=${encodeURIComponent(ignoreToken)}` : ''}`;

  const loadSlots = async (date) => {
    selected = date;
    strip.querySelectorAll('.day').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === date)));
    clear(slotsBox, h('p', { class: 'muted' }, 'Buscando horas…'));
    const slots = await api('GET', `/api/public/${slug}/slots?${staffQ}&date=${date}`);
    if (!slots.length) return clear(slotsBox, h('p', { class: 'muted' }, 'Ese día ya no quedan horas.'), onNoSlots ? onNoSlots(date) : null);
    const groups = [['Mañana', (m) => m < 720], ['Tarde', (m) => m >= 720 && m < 1080], ['Noche', (m) => m >= 1080]];
    clear(slotsBox, groups.map(([label, test]) => {
      const list = slots.filter((s) => test(partsIn(s.start, tz).min));
      return list.length ? h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, label),
        h('div', { class: 'slots' }, list.map((s) => h('button', { class: 'slot', type: 'button', 'aria-pressed': 'false', onclick: (e) => {
          slotsBox.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          e.currentTarget.setAttribute('aria-pressed', 'true');
          onPick(s.start);
        } }, s.time)))) : null;
    }));
  };

  const loadDays = async () => {
    clear(strip, h('span', { class: 'muted' }, 'Cargando días…'));
    const days = await api('GET', `/api/public/${slug}/days?${staffQ}${from ? `&from=${from}` : ''}`);
    if (!days.length) return clear(strip, h('p', { class: 'muted' }, 'No hay más días disponibles para reservar en línea.'));
    clear(strip, days.map((d) => {
      const [y, m, dd] = d.date.split('-').map(Number);
      const wd = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
      return h('button', { class: 'day', type: 'button', 'data-date': d.date, 'aria-pressed': 'false', disabled: d.available ? null : true,
        'aria-label': `${dateLabel(d.date)}${d.available ? '' : ', sin horas'}`, onclick: () => loadSlots(d.date) },
      h('span', { class: 'xs' }, wd.replace('.', '')), h('strong', {}, dd), h('span', { class: 'xs' }, new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd))).replace('.', '')));
    }), days.length === 14 ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { from = addOne(days.at(-1).date); loadDays(); } }, 'Más días') : null);
    const wanted = initialDate && days.find((d) => d.date === initialDate && d.available);
    const first = wanted || days.find((d) => d.available);
    if (first && !selected) loadSlots(first.date);
    else if (!first) clear(slotsBox, h('p', { class: 'muted' }, 'No quedan horas en estos días.'), onNoSlots ? onNoSlots(days[0].date) : null);
  };
  const addOne = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  };
  clear(box, h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Día'), strip), slotsBox);
  loadDays().catch((e) => clear(strip, h('p', { class: 'field-error' }, e.message)));
  return box;
}

// ------------------------------------------------------------ reservar

async function bookingFlow(slug) {
  let info;
  try { info = await api('GET', `/api/public/${slug}`); } catch (e) {
    document.title = `No encontrado · ${APP_NAME}`;
    return clear(root, h('div', { class: 'card stack' }, h('h1', {}, 'No encontramos esta barbería'), h('p', { class: 'muted' }, 'Revisa el enlace que te compartieron.')));
  }
  const b = info.business;
  const tz = b.timezone;
  document.title = `Reserva en ${b.name}`;
  const st = { services: [], staffId: null, start: null };
  const totalPrice = () => st.services.reduce((x, s) => x + s.price, 0);
  const names = () => st.services.map((s) => s.name).join(' + ');
  // Minutos de la visita con un barbero (cada uno puede tener su propia duración).
  const minutesWith = (staff) => st.services.reduce((x, s) => x + (staff?.durations?.[s.id] || s.duration_min), 0);
  const header = () => h('header', { class: 'book-head' },
    h('h1', {}, b.name),
    b.address ? h('p', { class: 'muted' }, b.address) : null,
    h('p', { class: 'xs muted' }, [b.instagram ? `@${b.instagram}` : null, b.phone].filter(Boolean).join(' · ')));
  const steps = (n) => h('nav', { class: 'steps', 'aria-label': 'Pasos' }, ['Servicio', 'Barbero', 'Hora', 'Tus datos'].map((s, i) =>
    h('span', { 'aria-current': i === n ? 'step' : null }, `${i + 1}. ${s}`)));
  const back = (fn) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: fn }, '← Volver');
  const show = (...children) => { clear(root, header(), ...children); window.scrollTo(0, 0); };

  const stepService = () => {
    if (!info.services.length) return show(h('div', { class: 'card' }, h('p', {}, 'Por ahora no hay servicios para reservar en línea. Escríbenos para agendar.')));
    const cats = [...new Set(info.services.map((s) => s.category || ''))];
    const chosen = new Set(st.services.map((s) => s.id));
    const next = h('button', { class: 'btn btn-primary btn-block book-next', type: 'button', onclick: () => {
      st.services = info.services.filter((s) => chosen.has(s.id));
      stepStaff();
    } });
    const refresh = () => {
      const list = info.services.filter((s) => chosen.has(s.id));
      next.disabled = !list.length;
      next.textContent = list.length
        ? `Continuar · ${list.length} servicio${list.length > 1 ? 's' : ''} · ${list.reduce((x, s) => x + s.duration_min, 0)} min · ${money(list.reduce((x, s) => x + s.price, 0), b.currency)}`
        : 'Elige uno o más servicios';
    };
    show(steps(0), h('section', { class: 'stack' }, h('h2', {}, '¿Qué te quieres hacer?'),
      h('p', { class: 'xs muted' }, 'Puedes elegir varios: los hacemos seguidos en la misma visita.'),
      cats.map((c) => h('div', { class: 'stack-sm' }, c ? h('div', { class: 'label' }, c) : null,
        info.services.filter((s) => (s.category || '') === c).map((s) => h('button', { class: 'opt', type: 'button', 'aria-pressed': String(chosen.has(s.id)), onclick: (e) => {
          if (chosen.has(s.id)) chosen.delete(s.id);
          else if (chosen.size >= 4) return;
          else chosen.add(s.id);
          e.currentTarget.setAttribute('aria-pressed', String(chosen.has(s.id)));
          refresh();
        } },
        h('span', { class: 'stack-sm' }, h('strong', {}, s.name), h('span', { class: 'xs muted' }, `${s.duration_min} min${s.description ? ` · ${s.description}` : ''}`)),
        h('strong', { class: 'num' }, money(s.price, b.currency)))))),
      next));
    refresh();
  };

  const stepStaff = () => {
    const team = info.staff.filter((x) => st.services.every((sv) => x.service_ids.includes(sv.id)));
    if (!team.length) {
      return show(steps(1), h('section', { class: 'stack' }, back(stepService), h('div', { class: 'card' }, h('p', {}, 'Ningún barbero hace todos esos servicios en una misma visita. Quita alguno e intenta de nuevo.'))));
    }
    if (team.length === 1) { st.staffId = team[0].id; return stepTime(true); }
    show(steps(1), h('section', { class: 'stack' }, back(stepService), h('h2', {}, '¿Con quién?'),
      h('button', { class: 'opt', type: 'button', onclick: () => { st.staffId = 'any'; stepTime(); } },
        h('span', { class: 'stack-sm' }, h('strong', {}, 'Me da igual'), h('span', { class: 'xs muted' }, 'Te mostramos todas las horas libres')), h('span', { 'aria-hidden': 'true' }, '→')),
      team.map((x) => h('button', { class: `opt sc-${x.color}`, type: 'button', onclick: () => { st.staffId = x.id; stepTime(); } },
        h('span', { class: 'row' }, avatar(x, 44), h('span', { class: 'stack-sm' }, h('strong', {}, x.name), h('span', { class: 'xs muted' }, [x.specialty, `${minutesWith(x)} min`].filter(Boolean).join(' · ')))),
        h('span', { 'aria-hidden': 'true' }, '→')))));
  };

  const stepTime = (skippedStaff = false) => {
    const next = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, onclick: stepDetails }, 'Continuar');
    const picker = dayPicker({
      slug, serviceIds: st.services.map((s) => s.id), staffId: st.staffId, tz,
      onPick: (start) => { st.start = start; next.disabled = false; },
      onNoSlots: (date) => waitlistOffer(date),
    });
    show(steps(2), h('section', { class: 'stack' }, back(skippedStaff ? stepService : stepStaff),
      h('h2', {}, 'Elige tu hora'),
      h('p', { class: 'muted' }, `${names()}${st.staffId !== 'any' ? ` · ${minutesWith(info.staff.find((x) => x.id === st.staffId))} min · ${info.staff.find((x) => x.id === st.staffId)?.name}` : ''}`),
      picker, next));
  };

  const waitlistOffer = (date) => {
    const box = h('div', { class: 'card-flat stack-sm' });
    const open = () => {
      const form = h('form', { class: 'stack', novalidate: true },
        field('Tu nombre', input({ name: 'name', autocomplete: 'name' })),
        field('WhatsApp', input({ name: 'phone', type: 'tel', autocomplete: 'tel' })),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Avisarme'));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await busy(form.querySelector('[type=submit]'), async () => {
          try {
            await api('POST', `/api/public/${slug}/waitlist`, { ...formData(form), service_ids: st.services.map((s) => s.id), staff_id: st.staffId, day: date });
            clear(box, h('p', {}, 'Listo. Si se libera una hora ese día te escribimos por WhatsApp.'));
          } catch (e) { showFormError(form, e); }
        });
      });
      clear(box, h('strong', {}, `Lista de espera · ${dateLabel(date)}`), form);
    };
    clear(box, h('p', {}, '¿Querías ese día? Anótate y te avisamos si alguien cancela.'), h('button', { class: 'btn btn-sm', type: 'button', onclick: open }, 'Anotarme en lista de espera'));
    return box;
  };

  const stepDetails = () => {
    const staffName = st.staffId !== 'any' ? info.staff.find((x) => x.id === st.staffId)?.name : null;
    const form = h('form', { class: 'stack', novalidate: true },
      field('Nombre y apellido', input({ name: 'name', required: true, autocomplete: 'name' })),
      field('WhatsApp', input({ name: 'phone', type: 'tel', required: true, autocomplete: 'tel', placeholder: '9 1234 5678' }), 'Te mandamos la confirmación y un recordatorio.'),
      field('Correo (opcional)', input({ name: 'email', type: 'email', autocomplete: 'email' })),
      field('¿Algo que debamos saber? (opcional)', h('textarea', { class: 'input', name: 'notes', maxlength: 300 })),
      h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Confirmar reserva'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await busy(form.querySelector('[type=submit]'), async () => {
        try {
          const r = await api('POST', `/api/public/${slug}/book`, { ...formData(form), service_ids: st.services.map((s) => s.id), staff_id: st.staffId, start: st.start });
          location.href = `/r/${r.token}?nueva=1`;
        } catch (e) {
          if (e.status === 409) {
            await confirmDialog('Esa hora se ocupó', e.message, 'Elegir otra hora');
            return stepTime();
          }
          showFormError(form, e);
        }
      });
    });
    show(steps(3), h('section', { class: 'stack' }, back(() => stepTime()),
      h('div', { class: 'card summary' }, h('strong', {}, names()), h('span', {}, fmtWhen(st.start, tz)),
        h('span', { class: 'muted' }, `${staffName ? `Con ${staffName} · ` : ''}${money(totalPrice(), b.currency)}`)),
      h('h2', {}, 'Tus datos'), form));
    form.querySelector('input').focus();
  };

  stepService();
}

// ------------------------------------------------------------ gestionar reserva

async function manage(token) {
  let r;
  try { r = await api('GET', `/api/public/r/${token}`); } catch {
    document.title = `Reserva no encontrada · ${APP_NAME}`;
    return clear(root, h('div', { class: 'card stack' }, h('h1', {}, 'No encontramos esta reserva'), h('p', { class: 'muted' }, 'El enlace puede estar incompleto.')));
  }
  const { business: b, appointment: a } = r;
  const tz = b.timezone;
  const isNew = new URLSearchParams(location.search).get('nueva') === '1';
  document.title = `Tu reserva · ${b.name}`;
  const ics = () => {
    const d = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//agenda//ES', 'BEGIN:VEVENT', `UID:${token}@agenda`, `DTSTAMP:${d(new Date().toISOString())}`,
      `DTSTART:${d(a.start_at)}`, `DTEND:${d(a.end_at)}`, `SUMMARY:${a.service_name} · ${b.name}`, `LOCATION:${b.address || ''}`,
      `DESCRIPTION:Para cambiar o cancelar: ${location.origin}/r/${token}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const link = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), download: 'reserva.ics' });
    document.body.append(link); link.click(); link.remove();
  };
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${a.service_name} · ${b.name}`)}&dates=${a.start_at.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${a.end_at.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}&location=${encodeURIComponent(b.address || '')}&details=${encodeURIComponent(`Cambiar o cancelar: ${location.origin}/r/${token}`)}`;
  const active = ['booked', 'confirmed'].includes(a.status);
  const statusLine = { cancelled: 'Esta reserva está cancelada.', done: '¡Gracias por venir!', no_show: 'Esta hora quedó como inasistencia.' }[a.status];

  const reschedule = () => {
    const save = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, 'Cambiar a esta hora');
    let start = null;
    save.addEventListener('click', () => busy(save, async () => {
      try { await api('POST', `/api/public/r/${token}/reschedule`, { start }); location.href = `/r/${token}?nueva=1`; } catch (e) {
        await confirmDialog('No se pudo cambiar', e.message, 'Entendido');
        reschedule();
      }
    }));
    clear(root, h('header', { class: 'book-head' }, h('h1', {}, 'Cambiar hora'), h('p', { class: 'muted' }, `${a.service_name} con ${a.staff_name}`)),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => manage(token) }, '← Volver'),
      dayPicker({ slug: b.slug, serviceIds: a.service_ids, staffId: a.staff_id, tz, ignoreToken: token, initialDate: partsIn(a.start_at, tz).date, onPick: (s) => { start = s; save.disabled = false; } }),
      save);
  };

  clear(root,
    h('header', { class: 'book-head' }, h('p', { class: 'muted' }, b.name), h('h1', {}, isNew && active ? '¡Reserva lista!' : 'Tu reserva')),
    h('div', { class: 'card stack' },
      isNew && active ? h('div', { class: 'row' }, h('div', { class: 'ok-mark', 'aria-hidden': 'true' }, '✓'), h('p', {}, `Te enviaremos la confirmación por WhatsApp, ${a.client_name.split(' ')[0]}.`)) : null,
      statusLine ? h('p', { class: 'form-error' }, statusLine) : null,
      h('div', { class: 'summary' }, h('strong', {}, a.service_name), h('span', {}, fmtWhen(a.start_at, tz)),
        h('span', { class: 'muted' }, `Con ${a.staff_name} · ${a.price_text}`), b.address ? h('span', { class: 'muted' }, b.address) : null),
      active ? h('div', { class: 'row' },
        h('a', { class: 'btn btn-sm', href: gcal, target: '_blank', rel: 'noopener' }, 'Agregar a Google Calendar'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: ics }, 'Descargar al calendario')) : null),
    active && r.can_change ? h('div', { class: 'stack-sm' },
      h('button', { class: 'btn', type: 'button', onclick: reschedule }, 'Cambiar hora'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        if (!await confirmDialog('Cancelar reserva', '¿Seguro que quieres cancelar tu hora?', 'Sí, cancelar', true)) return;
        await busy(btn, async () => {
          try { await api('POST', `/api/public/r/${token}/cancel`); manage(token); } catch (err) { await confirmDialog('No se pudo cancelar', err.message, 'Entendido'); }
        });
      } }, 'Cancelar reserva'),
      h('p', { class: 'xs muted' }, b.cancel_window_min ? `Puedes cambiar o cancelar hasta ${b.cancel_window_min >= 60 ? `${b.cancel_window_min / 60} h` : `${b.cancel_window_min} min`} antes.` : ''))
      : active ? h('p', { class: 'muted' }, `Ya no se puede cambiar en línea. Escríbele a ${b.name}${b.phone ? ` al ${b.phone}` : ''}.`) : null,
    h('a', { class: 'btn btn-primary', href: `/b/${b.slug}` }, active ? 'Reservar otra hora' : 'Reservar una hora'),
    h('p', { class: 'xs muted foot' }, `Reservas con ${APP_NAME}`));
}

if (kind === 'b' && key) bookingFlow(decodeURIComponent(key));
else if (kind === 'r' && key) manage(decodeURIComponent(key));
