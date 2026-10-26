import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedToUtc, localParts, addDays, isDate } from '../server/time.js';

test('hora local a UTC en Santiago (invierno -04 y verano -03)', () => {
  assert.equal(new Date(zonedToUtc('2026-07-15', 600, 'America/Santiago')).toISOString(), '2026-07-15T14:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-01-15', 600, 'America/Santiago')).toISOString(), '2026-01-15T13:00:00.000Z');
});

test('México sin horario de verano y vuelta a local', () => {
  const ms = zonedToUtc('2026-03-10', 9 * 60 + 30, 'America/Mexico_City');
  assert.equal(new Date(ms).toISOString(), '2026-03-10T15:30:00.000Z');
  const p = localParts(ms, 'America/Mexico_City');
  assert.equal(p.date, '2026-03-10');
  assert.equal(p.min, 570);
});

test('fechas', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(isDate('2026-02-28'));
  assert.ok(!isDate('2026-02-30'));
  assert.ok(!isDate('hoy'));
});
