// Der Tag als Zeitstrahl: vom Aufstehen bis zum Aufstehen am nächsten Tag.
//
// Das ist bewusst keine 24-Stunden-Achse. Im Wechselschichtdienst passt ein
// gelebter Tag selten in ein Kalenderdatum – der Nachtschichttag dauert von
// 08:00 bis 14:00 des Folgetags, also 30 Stunden. Der Zeitstrahl bildet ab,
// was zwischen zwei Aufstehzeiten wirklich passiert.

import { DAY_SLEEP, sleepPlan } from './sleep.js';
import { DAY_TYPES, trainingWindow } from './shift.js';
import { minutes, hhmm } from './util.js';

export const ROLES = {
  duty: { key: 'duty', label: 'Dienst', color: 'var(--c-duty)' },
  sleep: { key: 'sleep', label: 'Schlaf', color: 'var(--c-sleep)' },
  nap: { key: 'nap', label: 'Vorschlaf', color: 'var(--c-sleep)', soft: true },
  training: { key: 'training', label: 'Trainingsfenster', color: 'var(--c-train)' },
};

function bedAbsolute(dayKey, dayOffset = 0) {
  const bed = minutes(DAY_SLEEP[dayKey].bed);
  return (dayOffset + (bed < 12 * 60 ? 1 : 0)) * 1440 + bed;
}

/**
 * Zeitstrahl eines Tages.
 * Alle Zeiten in Minuten seit Mitternacht des Bezugstags – Werte über 1440
 * liegen am Folgetag.
 */
export function dayTimeline(dayKey, prevKey = null, nextKey = null, opts = {}) {
  const plan = sleepPlan(dayKey, prevKey, nextKey);
  const type = DAY_TYPES[dayKey];
  const start = minutes(plan.wake);

  // Das Ende ist das nächste Aufstehen – der Strahl umfasst genau einen
  // vollständigen Wach-Schlaf-Zyklus.
  const bed = bedAbsolute(dayKey, 0);
  const end = bed + plan.after.durationMin;

  const segments = [];

  if (type.work) {
    const from = minutes(type.work.from);
    const to = minutes(type.work.to);
    segments.push({
      ...ROLES.duty,
      from,
      to: to > from ? to : to + 1440,
      text: `${type.work.from}–${type.work.to}`,
    });
  }

  if (opts.includeTraining !== false) {
    const win = trainingWindow(dayKey);
    segments.push({
      ...ROLES.training,
      // An der Tagschicht bleibt nur Mobility – das soll der Strahl auch sagen.
      label: type.capacity > 0 ? ROLES.training.label : 'Mobility-Fenster',
      soft: type.capacity === 0,
      from: minutes(win.from),
      to: minutes(win.to),
      text: `${win.from}–${win.to}`,
    });
  }

  plan.naps.forEach((n) => {
    segments.push({
      ...ROLES.nap,
      label: n.label,
      from: minutes(n.from),
      to: minutes(n.to),
      text: `${n.from}–${n.to}`,
    });
  });

  segments.push({
    ...ROLES.sleep,
    label: plan.after.label,
    from: bed,
    to: end,
    text: `${plan.after.from}–${plan.after.to}`,
  });

  return {
    start,
    end,
    spanMin: end - start,
    segments: segments
      .filter((s) => s.to > start && s.from < end)
      .map((s) => ({ ...s, from: Math.max(s.from, start), to: Math.min(s.to, end) }))
      .sort((a, b) => a.from - b.from),
    wake: plan.wake,
    bed: plan.bed,
  };
}

/** Stundenmarken alle `step` Stunden innerhalb des Strahls. */
export function ticks(tl, step = 4) {
  const out = [];
  const first = Math.ceil(tl.start / (step * 60)) * step * 60;
  for (let t = first; t < tl.end; t += step * 60) {
    out.push({ at: t, label: hhmm(t) });
  }
  return out;
}

/**
 * Wo steht die aktuelle Uhrzeit auf dem Strahl? null, wenn sie außerhalb
 * liegt – dann gehört die Markierung nicht auf diesen Tag.
 */
export function nowOffset(tl, date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= tl.start && m <= tl.end) return m;
  // Nach Mitternacht: die Uhrzeit gehört zum Folgetag des Strahls.
  if (m + 1440 >= tl.start && m + 1440 <= tl.end) return m + 1440;
  return null;
}
