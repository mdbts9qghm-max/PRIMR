// Zustand der App. Alles liegt lokal im Browser – kein Server, kein Konto.

import { DEFAULT_CYCLE } from './shift.js';
import { DEFAULT_RACE } from './race.js';
import { defaultHabits } from './tasks.js';
import { today, weekStart } from './util.js';

const KEY = 'primr.state.v1';

export function defaultState() {
  return {
    version: 1,
    profile: {
      name: '',
      weightKg: 80,
      onboarded: false,
    },
    shift: {
      cycle: DEFAULT_CYCLE.slice(),
      anchorDate: today(),
      anchorIndex: 0,
      overrides: {},     // { 'YYYY-MM-DD': 'T' | 'N' | 'F' } für Zusatzdienste
      confirmed: false,  // true, sobald der Zyklustag von heute feststeht
    },
    settings: {
      planStart: weekStart(today()),
      startRunMinutes: 130,
      sessionMinutes: 90,
      longSessionMinutes: 360, // lange Einheiten sprengen jede 90-Minuten-Schranke
      gymTravelMinutes: 20,    // einfache Fahrt, zählt bei Krafteinheiten doppelt
      hillMeters: 120,         // Höhenmeter je Anstieg in der Umgebung
      startVertM: 200,         // Höhenmeter, die du heute in einer Woche schaffst
      race: { ...DEFAULT_RACE }, // Zielrennen – der Coach ist ausschließlich darauf ausgelegt
      easyPace: 6.4, // min/km, nur für die km-Schätzung
      theme: 'dark',
    },
    checkins: [],        // [{ date, recovery, hrv, rhr, sleepHours, sleepPerformance, strain, soreness, mood }]
    log: {},             // { 'YYYY-MM-DD': { slot, title, load, done, rpe, note, replaced } }
    tasks: defaultHabits(),
    done: {},            // { 'YYYY-MM-DD': [taskId, ...] }
    markers: [],         // [{ date, vo2max, thresholdHr, restingHr, hrv, hrr60 }]
    ui: { tab: 'today' },
  };
}

let state = null;
const listeners = new Set();

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch (err) {
    console.warn('Gespeicherter Zustand nicht lesbar, starte neu.', err);
    state = defaultState();
  }
  return state;
}

function migrate(saved) {
  const base = defaultState();
  const merged = {
    ...base,
    ...saved,
    profile: { ...base.profile, ...saved.profile },
    shift: { ...base.shift, ...saved.shift, overrides: { ...base.shift.overrides, ...(saved.shift || {}).overrides } },
    settings: { ...base.settings, ...saved.settings },
    ui: { ...base.ui, ...saved.ui },
  };
  if (!Array.isArray(merged.tasks) || !merged.tasks.length) merged.tasks = defaultHabits();
  // Der Plan rechnet immer vom Renntag rückwärts – ohne Ziel gäbe es keinen Plan.
  if (!merged.settings.race || !merged.settings.race.date) merged.settings.race = { ...DEFAULT_RACE };
  return merged;
}

export function get() {
  return load();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Speichern fehlgeschlagen', err);
  }
}

/** Zustand ändern: mutate(draft) und danach alle Views neu zeichnen. */
export function update(mutator) {
  const s = load();
  mutator(s);
  save();
  listeners.forEach((fn) => fn(s));
  return s;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function checkinFor(isoDate) {
  return load().checkins.find((c) => c.date === isoDate) || null;
}

export function putCheckin(entry) {
  return update((s) => {
    const i = s.checkins.findIndex((c) => c.date === entry.date);
    if (i >= 0) s.checkins[i] = { ...s.checkins[i], ...entry };
    else s.checkins.push(entry);
    s.checkins.sort((a, b) => (a.date < b.date ? -1 : 1));
  });
}

export function exportJson() {
  return JSON.stringify(load(), null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  state = migrate(parsed);
  save();
  listeners.forEach((fn) => fn(state));
}

export function reset() {
  state = defaultState();
  save();
  listeners.forEach((fn) => fn(state));
}
