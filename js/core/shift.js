// Schichtmodell nach dem Dienstplan: 35-Tage-Zyklus, aufgebaut aus dem
// Fünferblock T · N · Ü · DF · DF, siebenmal wiederholt.
//
// Gespeichert wird nur, ob ein Tag Tagschicht (T), Nachtschicht (N) oder
// dienstfrei (F) ist. Ü und die beiden DF-Tage ergeben sich aus der Lage:
// der freie Tag direkt nach einer Nacht ist der Ü-Tag, der freie Tag direkt
// vor einer Tagschicht ist der zweite DF-Tag mit der früheren Bettzeit.
//
// Dazu kommen zwei Abwesenheiten, die nur als Ausnahme für einzelne Tage
// eingetragen werden: U (Urlaub) verhält sich in jeder Hinsicht wie ein
// dienstfreier Tag und wird nur anders beschriftet. K (krank) ist ein
// eigener Tagtyp – dort wird nicht trainiert, sondern auskuriert.

import { daysBetween, addDays, minutes, hhmm } from './util.js';

export const CYCLE_LENGTH = 35;
export const BLOCK = ['T', 'N', 'F', 'F', 'F'];

/** T · N · Ü · DF · DF, siebenmal – das ergibt die 35 Tage des Dienstplans. */
export const DEFAULT_CYCLE = Array.from({ length: 7 }, () => BLOCK).flat();

/** Position im Fünferblock, wie sie im Dienstplan steht. */
export const BLOCK_POSITIONS = [
  { index: 0, code: 'T', key: 'tag', label: 'Tagschicht' },
  { index: 1, code: 'N', key: 'nacht', label: 'Nachtschicht' },
  { index: 2, code: 'Ü', key: 'schlaftag', label: 'Ü-Tag (nach der Nacht)' },
  { index: 3, code: 'DF', key: 'frei', label: 'DF – erster freier Tag' },
  { index: 4, code: 'DF', key: 'frei_vor_tag', label: 'DF – vor der Tagschicht' },
];

/** Abwesenheiten, die einzelne Tage überschreiben. */
export const ABSENCE = {
  U: { raw: 'U', code: 'U', label: 'Urlaub', hint: 'Zählt als dienstfrei – der Plan nutzt den Tag wie einen DF-Tag.' },
  K: { raw: 'K', code: 'K', label: 'Krank', hint: 'Kein Training. Die App plant Erholung und einen vorsichtigen Wiedereinstieg.' },
};

export const DAY_TYPES = {
  tag: {
    key: 'tag',
    code: 'T',
    label: 'Tagschicht',
    short: 'T',
    work: { from: '06:45', to: '19:00' },
    capacity: 0,
    note: 'Zwölf Stunden Dienst plus Anfahrt. Heute nur Mobility.',
  },
  nacht: {
    key: 'nacht',
    code: 'N',
    label: 'Nachtschicht',
    short: 'N',
    work: { from: '18:45', to: '07:00' },
    capacity: 3,
    note: 'Der Vormittag ist frei und ausgeschlafen – das beste Fenster neben den DF-Tagen.',
  },
  nacht_folge: {
    key: 'nacht_folge',
    code: 'N',
    label: 'Nachtschicht (zweite in Folge)',
    short: 'N',
    work: { from: '18:45', to: '07:00' },
    capacity: 1,
    note: 'Nach dem Morgenschlaf bleibt nur ein kurzes Fenster. Nichts Hartes.',
  },
  schlaftag: {
    key: 'schlaftag',
    code: 'Ü',
    label: 'Ü-Tag',
    short: 'Ü',
    work: null,
    capacity: 2,
    note: 'Nach der Nacht. Wie viel heute geht, entscheidet der Schlaf von 08:00 bis 14:00.',
  },
  frei_vor_tag: {
    key: 'frei_vor_tag',
    code: 'DF',
    label: 'DF (vor Tagschicht)',
    short: 'DF',
    work: null,
    capacity: 4,
    note: 'Dienstfrei, aber um 22:00 ins Bett. Training am Vormittag.',
  },
  frei: {
    key: 'frei',
    code: 'DF',
    label: 'DF (dienstfrei)',
    short: 'DF',
    work: null,
    capacity: 5,
    note: 'Ganzer Tag verfügbar. Hier liegen die großen Einheiten.',
  },
  krank: {
    key: 'krank',
    code: 'K',
    label: 'Krank',
    short: 'K',
    work: null,
    capacity: 0,
    note: 'Auskurieren. Training kostet heute Substanz, die für die Genesung gebraucht wird.',
  },
};

/**
 * Position im Zyklus für ein Datum.
 * config: { cycle, anchorDate, anchorIndex, overrides }
 */
export function cycleIndex(config, isoDate) {
  const len = config.cycle.length || CYCLE_LENGTH;
  const offset = daysBetween(config.anchorDate, isoDate) + config.anchorIndex;
  return ((offset % len) + len) % len;
}

/**
 * Rohbuchstabe eines Tages. Ein Eintrag in overrides schlägt den Zyklus –
 * damit lassen sich angeordnete Zusatzdienste, Tausch oder Urlaub abbilden,
 * ohne den Rhythmus zu verbiegen.
 */
export function rawFor(config, isoDate) {
  const override = config.overrides && config.overrides[isoDate];
  if (override) return override;
  const len = config.cycle.length || CYCLE_LENGTH;
  return config.cycle[cycleIndex(config, isoDate) % len];
}

/**
 * Abgeleiteter Tagtyp – hängt vom Vor- und Folgetag ab.
 *
 * Urlaub ist hier bewusst kein eigener Typ: Er verhält sich wie ein freier
 * Tag und durchläuft dieselbe Ableitung. Ein Urlaubstag direkt vor einer
 * Tagschicht bekommt also die frühere Bettzeit, ein Urlaubstag direkt nach
 * einer Nacht bleibt der Ü-Tag – beides ist richtig so.
 */
export function typeFor(config, isoDate) {
  const raw = rawFor(config, isoDate);
  const prev = rawFor(config, addDays(isoDate, -1));
  const next = rawFor(config, addDays(isoDate, 1));

  if (raw === 'K') return 'krank';
  if (raw === 'T') return 'tag';
  if (raw === 'N') return prev === 'N' ? 'nacht_folge' : 'nacht';
  if (prev === 'N') return 'schlaftag';
  if (next === 'T') return 'frei_vor_tag';
  return 'frei';
}

export function shiftDay(config, isoDate) {
  const key = typeFor(config, isoDate);
  const raw = rawFor(config, isoDate);
  const day = {
    date: isoDate,
    raw,
    prevKey: typeFor(config, addDays(isoDate, -1)),
    nextKey: typeFor(config, addDays(isoDate, 1)),
    index: cycleIndex(config, isoDate),
    overridden: Boolean(config.overrides && config.overrides[isoDate]),
    absence: ABSENCE[raw] ? raw : null,
    ...DAY_TYPES[key],
  };

  // Urlaub plant wie ein freier Tag, heißt aber Urlaub.
  if (raw === 'U') {
    day.code = 'U';
    day.short = 'U';
    day.label = key === 'frei_vor_tag' ? 'Urlaub (vor Tagschicht)' : 'Urlaub';
    day.note = key === 'frei_vor_tag'
      ? 'Letzter Urlaubstag vor der Tagschicht – abends um 22:00 ins Bett.'
      : 'Urlaub. Der Plan behandelt den Tag wie einen dienstfreien Tag.';
  }
  return day;
}

export function cycleWindow(config, startIso, length = CYCLE_LENGTH) {
  return Array.from({ length }, (_, i) => shiftDay(config, addDays(startIso, i)));
}

/**
 * Wann am Tag überhaupt Zeit für Training ist und wie belastbar das Fenster
 * ist. minutesFree begrenzt, was der Planer hineinlegen darf.
 */
export function trainingWindow(dayKey) {
  switch (dayKey) {
    case 'tag':
      return { from: '19:45', to: '21:00', minutesFree: 30, quality: 'nur Mobility nach dem Dienst' };
    case 'nacht':
      return { from: '09:00', to: '12:30', minutesFree: 150, quality: 'ausgeschlafener Vormittag, vier Stunden vor dem Vorschlaf' };
    case 'nacht_folge':
      return { from: '14:45', to: '17:00', minutesFree: 60, quality: 'kurzes Fenster nach dem Morgenschlaf' };
    case 'schlaftag':
      return { from: '15:30', to: '19:00', minutesFree: 150, quality: 'Nachmittag nach dem Schlaf, Bett erst um 00:00' };
    case 'frei_vor_tag':
      return { from: '09:30', to: '13:00', minutesFree: 150, quality: 'Vormittag, der Abend bleibt ruhig' };
    case 'krank':
      // minutesFree 0: hier passt bewusst keine Einheit hinein.
      return { from: '11:00', to: '12:00', minutesFree: 0, quality: 'kein Training – höchstens ein kurzer Spaziergang' };
    default:
      return { from: '09:30', to: '13:00', minutesFree: 180, quality: 'dienstfrei, der ganze Tag steht offen' };
  }
}

/** Dienstdauer inklusive Anfahrt in Minuten – fürs Belastungsbild. */
export function dutyMinutes(dayKey) {
  const t = DAY_TYPES[dayKey];
  if (!t.work) return 0;
  const from = minutes(t.work.from);
  const to = minutes(t.work.to);
  return to > from ? to - from : 1440 - from + to;
}

export { hhmm };
