// Alles, was ein Render-Durchlauf über "heute" wissen muss, an einer Stelle
// berechnet – damit Views nicht jeder für sich dieselben Zahlen herleiten.

import * as store from './store.js';
import { shiftDay, trainingWindow } from './shift.js';
import { sleepPlan, sleepTargetHours, caffeineCutoff, screensOff, lastMealCutoff } from './sleep.js';
import { baselines, readiness, trainingDirective, dayAdvice } from './readiness.js';
import { planWeek, applyDirective, loadBalance } from './plan.js';
import { tasksFor, overdue } from './tasks.js';
import { today as todayIso, addDays } from './util.js';

const planCache = new Map();

export function invalidate() {
  planCache.clear();
}

export function weekPlan(isoDate) {
  const s = store.get();
  const key = `${isoDate}|${s.shift.cycle.join('')}|${s.shift.anchorDate}|${s.shift.anchorIndex}|${JSON.stringify(s.settings)}`;
  if (!planCache.has(key)) planCache.set(key, planWeek(isoDate, s.shift, s.settings));
  return planCache.get(key);
}

export function shiftKeyFor(isoDate) {
  return shiftDay(store.get().shift, isoDate).key;
}

export function shiftDayFor(isoDate) {
  return shiftDay(store.get().shift, isoDate);
}

/** Schlafsoll eines beliebigen Tages – braucht den Vortag für die Nachtlänge. */
export function sleepTargetFor(isoDate) {
  const d = shiftDay(store.get().shift, isoDate);
  return sleepTargetHours(d.key, d.prevKey);
}

export function build(isoDate = todayIso()) {
  const s = store.get();
  const day = shiftDay(s.shift, isoDate);
  const win = trainingWindow(day.key);
  const sleep = sleepPlan(day.key, day.prevKey, day.nextKey);
  const sleepTarget = sleepTargetHours(day.key, day.prevKey);
  const checkin = s.checkins.find((c) => c.date === isoDate) || null;
  const base = baselines(s.checkins, isoDate);
  const load = loadBalance(s.log, isoDate);
  const result = checkin ? readiness(checkin, base, day.key, load, sleepTarget) : null;
  const directive = trainingDirective(result ? result.score : null, day.key);

  const plan = weekPlan(isoDate);
  const entry = plan.days.find((d) => d.date === isoDate);
  const adjusted = entry ? applyDirective(entry, directive) : null;
  // Bei Bereitschaft "rot" bleibt nur eine Regenerationseinheit stehen,
  // keine zwei.
  const adjustedExtra = entry && entry.extra && directive.volume > 0
    ? applyDirective({ ...entry, session: entry.extra }, directive) : null;
  const logged = s.log[isoDate] || null;

  return {
    date: isoDate,
    state: s,
    ui: s.ui,
    shiftKeyFor,
    shiftDayFor,
    sleepTargetFor,
    day,
    window: win,
    sleep,
    sleepTarget,
    caffeine: caffeineCutoff(day.key),
    screens: screensOff(day.key),
    lastMeal: lastMealCutoff(day.key),
    checkin,
    baselines: base,
    readiness: result,
    directive,
    advice: result
      ? dayAdvice(result, checkin, day.key, base,
        Boolean((adjusted && adjusted.session && adjusted.session.hard)
          || (adjustedExtra && adjustedExtra.session && adjustedExtra.session.hard)), sleepTarget)
      : [],
    load,
    plan,
    entry,
    session: adjusted ? adjusted.session : null,
    extra: adjustedExtra ? adjustedExtra.session : null,
    sessionChanged: adjusted ? adjusted.changed : false,
    sessionNote: adjusted ? adjusted.note : null,
    logged,
    tasks: tasksFor(s.tasks, isoDate, day.key),
    doneToday: s.done[isoDate] || [],
    overdue: overdue(s.tasks, s.done, isoDate),
    yesterday: addDays(isoDate, -1),
  };
}
