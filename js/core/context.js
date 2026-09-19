// Alles, was ein Render-Durchlauf über "heute" wissen muss, an einer Stelle
// berechnet – damit Views nicht jeder für sich dieselben Zahlen herleiten.

import * as store from './store.js';
import { shiftDay, trainingWindow } from './shift.js';
import { dayTimeline, ticks, nowOffset } from './timeline.js';
import { sleepPlan, sleepTargetHours, caffeineCutoff, screensOff, lastMealCutoff } from './sleep.js';
import { baselines, readiness, trainingDirective, dayAdvice } from './readiness.js';
import { planWeek, applyDirective, loadBalance } from './plan.js';
import { tasksFor, overdue } from './tasks.js';
import { today as todayIso, addDays, weekStart } from './util.js';

const planCache = new Map();

export function invalidate() {
  planCache.clear();
}

export function weekPlan(isoDate) {
  const s = store.get();
  // Auf den Wochenanfang schlüsseln, nicht auf das Datum: Sieben Tage
  // derselben Woche ergeben denselben Plan, und dessen Berechnung durchsucht
  // alle Verteilungen der Einheiten. Sieben Mal wäre siebenmal zu viel.
  const monday = weekStart(isoDate);
  const key = `${monday}|${s.shift.cycle.join('')}|${s.shift.anchorDate}|${s.shift.anchorIndex}|${JSON.stringify(s.shift.overrides)}|${JSON.stringify(s.settings)}`;
  if (!planCache.has(key)) planCache.set(key, planWeek(monday, s.shift, s.settings));
  return planCache.get(key);
}

/**
 * Rollendes Fenster: n Tage ab startIso, unabhängig von Kalenderwochen.
 *
 * Geplant wird weiter je Kalenderwoche – der Coach braucht die Woche als
 * Einheit, sonst sprängen die Einheiten bei jeder Neuberechnung. Nur die
 * Anzeige rollt, und die holt sich jeden Tag aus dem Plan seiner Woche.
 */
export function rollingDays(startIso, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(startIso, i);
    return weekPlan(date).days.find((d) => d.date === date);
  }).filter(Boolean);
}

/** Der Plantag eines beliebigen Datums – für Detailansichten. */
export function entryFor(isoDate) {
  return weekPlan(isoDate).days.find((d) => d.date === isoDate) || null;
}

export function shiftKeyFor(isoDate) {
  return shiftDay(store.get().shift, isoDate).key;
}

export function shiftDayFor(isoDate) {
  return shiftDay(store.get().shift, isoDate);
}

/**
 * Bereitschaftswerte der letzten Tage – gibt der großen Zahl von heute
 * einen Verlauf zur Seite.
 */
export function readinessTrend(isoDate, n = 14) {
  const s = store.get();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = addDays(isoDate, -i);
    const checkin = s.checkins.find((c) => c.date === d);
    if (!checkin) continue;
    const day = shiftDay(s.shift, d);
    const r = readiness(
      checkin,
      baselines(s.checkins, d),
      day.key,
      loadBalance(s.log, d),
      sleepTargetHours(day.key, day.prevKey),
    );
    if (r) out.push({ date: d, score: r.score });
  }
  return out;
}

/** Schlafsoll eines beliebigen Tages – braucht den Vortag für die Nachtlänge. */
export function sleepTargetFor(isoDate) {
  const d = shiftDay(store.get().shift, isoDate);
  return sleepTargetHours(d.key, d.prevKey);
}

const MOVABLE = ['long', 'long_b', 'intensiv'];

function suggestMove(plan, entry, directive, isoDate) {
  if (!plan.race || !entry || directive.volume >= 1) return null;
  if (!MOVABLE.includes(entry.slot)) return null;

  const later = plan.days.filter((d) => d.date > isoDate
    && d.session.kind === 'rest'
    && d.shift.capacity >= 4);
  if (!later.length) return null;

  return {
    date: later[0].date,
    label: later[0].shift.label,
    title: entry.session.title,
  };
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

  // Eine gekürzte Schlüsseleinheit ist in der Rennvorbereitung schlechter als
  // eine verschobene: Der lange Lauf ist der Reiz, um den die Woche gebaut
  // ist. Steht später noch ein freier Tag ohne Einheit, wird er vorgeschlagen.
  const moveTo = suggestMove(plan, entry, directive, isoDate);

  // Der Blick auf morgen gehört zur heutigen Entscheidung: Ob abends noch
  // etwas geht, hängt davon ab, was danach ansteht.
  const nextIso = addDays(isoDate, 1);
  const nextPlan = weekPlan(nextIso);
  const tomorrow = nextPlan.days.find((d) => d.date === nextIso) || null;

  const tl = dayTimeline(day.key, day.prevKey, day.nextKey);

  return {
    date: isoDate,
    state: s,
    timeline: tl,
    timelineTicks: ticks(tl, 4),
    timelineNow: isoDate === todayIso() ? nowOffset(tl) : null,
    readinessTrend: readinessTrend(isoDate),
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
    ramp: entry ? entry.ramp : null,
    tomorrow,
    // Liegt der Start der Vorbereitung noch vor uns, sagt die App das –
    // sonst sieht der Plan aus, als liefe er schon.
    beforeStart: isoDate < s.settings.planStart ? s.settings.planStart : null,
    // Longrun und intensive Einheit tragen die Woche. Fällt eine davon aus,
    // fehlt der Reiz; die lockeren Einheiten lassen sich dagegen ersetzen.
    isKeySession: Boolean(entry && ['long', 'long_b', 'intensiv'].includes(entry.slot)),
    extra: adjustedExtra ? adjustedExtra.session : null,
    sessionChanged: adjusted ? adjusted.changed : false,
    sessionNote: adjusted ? adjusted.note : null,
    moveTo,
    logged,
    tasks: tasksFor(s.tasks, isoDate, day.key),
    doneToday: s.done[isoDate] || [],
    overdue: overdue(s.tasks, s.done, isoDate),
    yesterday: addDays(isoDate, -1),
  };
}
