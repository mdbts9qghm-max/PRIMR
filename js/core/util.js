// Kleine Helfer, die überall gebraucht werden.

export const MS_DAY = 86400000;

export function iso(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return iso(new Date());
}

export function addDays(isoDate, n) {
  const d = fromIso(isoDate);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(a, b) {
  return Math.round((fromIso(b) - fromIso(a)) / MS_DAY);
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function round(v, digits = 0) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Minuten seit Mitternacht -> "07:30" */
export function hhmm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "07:30" -> Minuten seit Mitternacht */
export function minutes(hhmmStr) {
  const [h, m] = hhmmStr.split(':').map(Number);
  return h * 60 + m;
}

export function durationLabel(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function weekday(isoDate) {
  return WEEKDAYS[fromIso(isoDate).getDay()];
}

export function weekdayShort(isoDate) {
  return WEEKDAYS_SHORT[fromIso(isoDate).getDay()];
}

export function longDate(isoDate) {
  const d = fromIso(isoDate);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDate(isoDate) {
  const d = fromIso(isoDate);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** Montag der Woche, in der isoDate liegt. */
export function weekStart(isoDate) {
  const d = fromIso(isoDate);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return iso(d);
}

export function mean(values) {
  const xs = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Lineare Abbildung mit Begrenzung: value aus [lo,hi] -> [0,100] */
export function scale(value, lo, hi) {
  if (value == null) return null;
  return clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
}
