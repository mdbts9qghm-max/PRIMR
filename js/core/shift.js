// Schichtmodell: 35-Tage-Zyklus aus T (Tagschicht), N (Nachtschicht), F (frei).
// Aus dieser rohen Folge werden die fünf Tagtypen abgeleitet, die der Rest der
// App kennt: tag, nacht, nacht_folge, schlaftag, frei_vor_tag, frei.

import { daysBetween, minutes, hhmm } from './util.js';

export const CYCLE_LENGTH = 35;

// Platzhalter, bis der echte Schichtplan im Editor hinterlegt ist:
// fünf Blöcke à 2 Tag / 2 Nacht / 3 frei.
export const DEFAULT_CYCLE = 'TTNNFFF'.repeat(5).split('');

export const DAY_TYPES = {
  tag: {
    key: 'tag',
    label: 'Tagschicht',
    short: 'T',
    color: 'shift-tag',
    work: { from: '06:45', to: '19:00' },
    capacity: 0,
    note: 'Zwölf Stunden Dienst plus Anfahrt. Heute nur Mobility.',
  },
  nacht: {
    key: 'nacht',
    label: 'Nachtschicht',
    short: 'N',
    color: 'shift-nacht',
    work: { from: '18:45', to: '07:00' },
    capacity: 3,
    note: 'Vormittag ist frei und ausgeschlafen – das beste Fenster neben den freien Tagen.',
  },
  nacht_folge: {
    key: 'nacht_folge',
    label: 'Nachtschicht (Folgetag)',
    short: 'N',
    color: 'shift-nacht',
    work: { from: '18:45', to: '07:00' },
    capacity: 1,
    note: 'Nach dem Morgenschlaf bleibt ein kurzes Fenster. Nichts Hartes.',
  },
  schlaftag: {
    key: 'schlaftag',
    label: 'Schlaftag',
    short: 'S',
    color: 'shift-schlaf',
    work: null,
    capacity: 2,
    note: 'Nach der letzten Nacht. Wie viel geht, entscheidet der Morgenschlaf.',
  },
  frei_vor_tag: {
    key: 'frei_vor_tag',
    label: 'Frei (vor Tagschicht)',
    short: 'F',
    color: 'shift-frei',
    work: null,
    capacity: 4,
    note: 'Frei, aber um 22:00 ins Bett. Training am Vormittag.',
  },
  frei: {
    key: 'frei',
    label: 'Frei',
    short: 'F',
    color: 'shift-frei',
    work: null,
    capacity: 5,
    note: 'Ganzer Tag verfügbar. Hier liegen die großen Einheiten.',
  },
};

/**
 * Position im Zyklus für ein Datum.
 * config: { cycle: string[], anchorDate: 'YYYY-MM-DD', anchorIndex: number }
 */
export function cycleIndex(config, isoDate) {
  const len = config.cycle.length || CYCLE_LENGTH;
  const offset = daysBetween(config.anchorDate, isoDate) + config.anchorIndex;
  return ((offset % len) + len) % len;
}

function rawAt(config, isoDate, delta = 0) {
  const len = config.cycle.length || CYCLE_LENGTH;
  const idx = (cycleIndex(config, isoDate) + delta + len * 2) % len;
  return config.cycle[idx];
}

/** Rohbuchstabe -> abgeleiteter Tagtyp, abhängig von Vor- und Folgetag. */
export function shiftDay(config, isoDate) {
  const raw = rawAt(config, isoDate, 0);
  const prev = rawAt(config, isoDate, -1);
  const next = rawAt(config, isoDate, 1);

  let key;
  if (raw === 'T') key = 'tag';
  else if (raw === 'N') key = prev === 'N' ? 'nacht_folge' : 'nacht';
  else if (prev === 'N') key = 'schlaftag';
  else if (next === 'T') key = 'frei_vor_tag';
  else key = 'frei';

  return {
    date: isoDate,
    raw,
    prev,
    next,
    index: cycleIndex(config, isoDate),
    ...DAY_TYPES[key],
  };
}

export function cycleWindow(config, startIso, length = CYCLE_LENGTH) {
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const d = new Date(startIso);
    d.setDate(d.getDate() + i);
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(shiftDay(config, isoDate));
  }
  return out;
}

/**
 * Trainingsfenster des Tages: wann überhaupt Zeit ist und wie belastbar
 * dieses Fenster ist. minutesFree begrenzt, was der Planer hineinlegt.
 */
export function trainingWindow(dayKey) {
  switch (dayKey) {
    case 'tag':
      return { from: '19:45', to: '21:00', minutesFree: 30, quality: 'nur Mobility nach dem Dienst' };
    case 'nacht':
      return { from: '09:00', to: '12:30', minutesFree: 150, quality: 'ausgeschlafener Vormittag vor der Nacht' };
    case 'nacht_folge':
      return { from: '14:45', to: '17:00', minutesFree: 60, quality: 'kurzes Fenster nach dem Morgenschlaf' };
    case 'schlaftag':
      return { from: '15:00', to: '18:00', minutesFree: 90, quality: 'Nachmittag nach dem Morgenschlaf' };
    case 'frei_vor_tag':
      return { from: '09:30', to: '13:00', minutesFree: 120, quality: 'Vormittag, Abend bleibt ruhig' };
    default:
      return { from: '09:30', to: '13:00', minutesFree: 180, quality: 'freier Tag' };
  }
}

/** Dienstdauer inklusive Anfahrt, in Minuten – fürs Belastungsmodell. */
export function dutyMinutes(dayKey) {
  const t = DAY_TYPES[dayKey];
  if (!t.work) return 0;
  const from = minutes(t.work.from);
  const to = minutes(t.work.to);
  return to > from ? to - from : 1440 - from + to;
}

export { hhmm };
