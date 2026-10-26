// Zonas horarias sin librerías: Intl resuelve el offset de cada instante,
// así los cambios de horario de verano quedan bien.

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTz(tz) {
  try { fmt(tz); return true; } catch { return false; }
}

// Partes locales de un instante (ms o Date o ISO).
export function localParts(t, tz) {
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  const p = {};
  for (const { type, value } of fmt(tz).formatToParts(ms)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    min: Number(p.hour) * 60 + Number(p.minute),
    weekday: WD[p.weekday],
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), mi: Number(p.minute), s: Number(p.second),
  };
}

function offsetMs(ms, tz) {
  const p = localParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// 'YYYY-MM-DD' + minutos locales -> ms UTC.
export function zonedToUtc(date, minutes, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let utc = guess - offsetMs(guess, tz);
  const o2 = offsetMs(utc, tz);
  if (guess - o2 !== utc) utc = guess - o2;
  return utc;
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayIn(tz) {
  return localParts(Date.now(), tz).date;
}

// Rango UTC [inicio del día from, inicio del día siguiente a to) en la zona.
export function dayRangeUtc(from, to, tz) {
  return [new Date(zonedToUtc(from, 0, tz)).toISOString(), new Date(zonedToUtc(addDays(to, 1), 0, tz)).toISOString()];
}

export const iso = (ms) => new Date(ms).toISOString();
