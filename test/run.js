// Prüft die Rechenkerne: Schichtableitung, Schlaffenster, Planerregeln,
// Progression, Bereitschaft und Aufgaben. Läuft ohne Browser.

import assert from 'node:assert/strict';
import { shiftDay, DEFAULT_CYCLE, trainingWindow, typeFor } from '../js/core/shift.js';
import { sleepPlan, sleepTargetHours, caffeineCutoff, screensOff } from '../js/core/sleep.js';
import {
  planWeek, progression, weekIndex, loadBalance, illnessRamp, applyDirective, MAX_RAMP_DAYS,
} from '../js/core/plan.js';
import {
  phaseFor, volumePlan, vertTarget, phaseVert, features, MAX_WEEKLY_GROWTH,
  zoneTargets, vertRateTarget, terrainSplit, racePlan as racePlanFn,
} from '../js/core/race.js';
import { HARD_SLOTS } from '../js/core/library.js';
import { KIND_LABEL } from '../js/ui/components.js';
import { readiness, baselines, trainingDirective, BANDS } from '../js/core/readiness.js';
import { defaultHabits, dueOn, createTask } from '../js/core/tasks.js';
import { addDays, weekStart, hhmm, minutes } from '../js/core/util.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${err.message.split('\n')[0]}`);
  }
}

const CONFIG = { cycle: DEFAULT_CYCLE.slice(), anchorDate: '2026-01-05', anchorIndex: 0, overrides: {} };

/* ---------- Schicht ---------- */

test('Zyklus hat 35 Tage aus sieben Blöcken T N Ü DF DF', () => {
  assert.equal(DEFAULT_CYCLE.length, 35);
  assert.equal(DEFAULT_CYCLE.slice(0, 5).join(''), 'TNFFF');
  assert.equal(DEFAULT_CYCLE.filter((x) => x === 'T').length, 7);
  assert.equal(DEFAULT_CYCLE.filter((x) => x === 'N').length, 7);
  assert.equal(DEFAULT_CYCLE.filter((x) => x === 'F').length, 21);
});

test('Der Fünferblock wird korrekt in Tagtypen übersetzt', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-05').key, 'tag');
  assert.equal(shiftDay(CONFIG, '2026-01-06').key, 'nacht');
  assert.equal(shiftDay(CONFIG, '2026-01-07').key, 'schlaftag');
  assert.equal(shiftDay(CONFIG, '2026-01-08').key, 'frei');
  assert.equal(shiftDay(CONFIG, '2026-01-09').key, 'frei_vor_tag');
  assert.equal(shiftDay(CONFIG, '2026-01-10').key, 'tag');
});

test('Die Kürzel entsprechen dem Dienstplan', () => {
  assert.deepEqual(
    ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
      .map((d) => shiftDay(CONFIG, d).code),
    ['T', 'N', 'Ü', 'DF', 'DF'],
  );
});

test('Zyklus wiederholt sich nach 35 Tagen', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-05').key, shiftDay(CONFIG, '2026-02-09').key);
  assert.equal(shiftDay(CONFIG, '2026-01-05').index, shiftDay(CONFIG, '2026-02-09').index);
});

test('Zyklus rechnet auch rückwärts korrekt', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-04').key, 'frei_vor_tag');
  assert.equal(shiftDay(CONFIG, '2026-01-03').key, 'frei');
  assert.equal(shiftDay(CONFIG, '2026-01-02').key, 'schlaftag');
  assert.equal(shiftDay(CONFIG, '2025-12-31').key, 'tag');
});

test('Jeder Tag im Zyklus bekommt einen gültigen Typ', () => {
  for (let i = 0; i < 35; i += 1) {
    const key = typeFor(CONFIG, addDays('2026-01-05', i));
    assert.ok(['tag', 'nacht', 'nacht_folge', 'schlaftag', 'frei', 'frei_vor_tag'].includes(key));
  }
});

test('Ein Zusatzdienst überschreibt nur diesen einen Tag', () => {
  const cfg = { ...CONFIG, overrides: { '2026-01-08': 'T' } };
  assert.equal(shiftDay(cfg, '2026-01-08').key, 'tag');
  assert.equal(shiftDay(cfg, '2026-01-08').overridden, true);
  // Der Tag davor bleibt der Ü-Tag, der Tag danach bleibt DF vor Tagschicht.
  assert.equal(shiftDay(cfg, '2026-01-07').key, 'schlaftag');
  assert.equal(shiftDay(cfg, '2026-01-09').key, 'frei_vor_tag');
  assert.equal(shiftDay(CONFIG, '2026-01-08').key, 'frei');
});

/* ---------- Schlaf ---------- */

test('Nacht vor der Tagschicht ist 7,5 Stunden lang', () => {
  const p = sleepPlan('tag', 'frei_vor_tag', 'nacht');
  assert.equal(p.wake, '05:30');
  assert.equal(p.before.durationMin, 450);
  assert.equal(p.after.from, '23:30');
  assert.equal(p.after.durationMin, 510);
});

test('Vor der Nachtschicht wird bis 08:00 geschlafen', () => {
  const p = sleepPlan('nacht', 'tag', 'schlaftag');
  assert.equal(p.before.durationMin, 510);
  const nap = p.naps[0];
  assert.equal(nap.from, '15:00');
  assert.equal(nap.to, '17:30');
  assert.equal(nap.durationMin, 150);
});

test('Nach der Nacht folgen sechs Stunden Morgenschlaf', () => {
  const p = sleepPlan('nacht', 'tag', 'schlaftag');
  assert.equal(p.after.from, '08:00');
  assert.equal(p.after.durationMin, 360);
});

test('Ü-Tag: 08:00 bis 14:00, abends ab 00:00 acht Stunden', () => {
  const p = sleepPlan('schlaftag', 'nacht', 'frei');
  assert.equal(p.wake, '14:00');
  assert.equal(p.before.durationMin, 360);
  assert.equal(p.after.from, '00:00');
  assert.equal(p.after.durationMin, 480);
});

test('Zweiter DF-Tag geht wegen der Tagschicht um 22:00 ins Bett', () => {
  const p = sleepPlan('frei_vor_tag', 'frei', 'tag');
  assert.equal(p.after.from, '22:00');
  assert.equal(p.after.durationMin, 450);
});

test('Schlafsoll ist die Nacht davor, nicht die Nacht danach', () => {
  assert.equal(sleepTargetHours('tag', 'frei_vor_tag'), 7.5);
  assert.equal(sleepTargetHours('nacht', 'tag'), 8.5);
  assert.equal(sleepTargetHours('schlaftag', 'nacht'), 6);
  assert.equal(sleepTargetHours('frei', 'schlaftag'), 8);
  assert.equal(sleepTargetHours('frei_vor_tag', 'frei'), 8.5);
});

test('Über den Block summiert sich der Schlaf auf 38,5 Stunden', () => {
  const total = ['tag', 'nacht', 'schlaftag', 'frei', 'frei_vor_tag']
    .map((k, i, all) => sleepTargetHours(k, all[(i - 1 + all.length) % all.length]))
    .reduce((a, b) => a + b, 0);
  assert.equal(total, 38.5);
});

test('Koffein-Stopp liegt acht Stunden vor dem Schlafbeginn', () => {
  assert.equal(caffeineCutoff('tag'), '15:30');
  assert.equal(caffeineCutoff('nacht'), '00:00');
  assert.equal(caffeineCutoff('schlaftag'), '16:00');
  assert.equal(caffeineCutoff('frei_vor_tag'), '14:00');
});

test('Bildschirme gehen eine Stunde vor dem Schlafbeginn aus', () => {
  assert.equal(screensOff('tag'), '22:30');
  assert.equal(screensOff('frei_vor_tag'), '21:00');
});

/* ---------- Planer ---------- */

const SETTINGS = {
  planStart: '2026-01-05',
  startRunMinutes: 130,
  sessionMinutes: 90,
  gymTravelMinutes: 20,
  easyPace: 6.4,
};

function weeksOf(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(planWeek(addDays('2026-01-05', i * 7), CONFIG, SETTINGS));
  return out;
}

test('An der Tagschicht steht nie eine Trainingseinheit', () => {
  weeksOf(10).forEach((w) => w.days.forEach((d) => {
    if (d.shift.key === 'tag') {
      assert.ok(['mobility', 'rest'].includes(d.session.kind), `${d.date}: ${d.session.title}`);
    }
  }));
});

test('Keine zwei harten Einheiten an aufeinanderfolgenden Tagen', () => {
  weeksOf(12).forEach((w) => {
    for (let i = 1; i < w.days.length; i += 1) {
      const a = w.days[i - 1];
      const b = w.days[i];
      assert.ok(!(a.session.hard && b.session.hard), `${a.date} und ${b.date} beide hart`);
    }
  });
});

test('Longrun liegt an einem freien Tag oder vor der Nachtschicht', () => {
  weeksOf(12).forEach((w) => {
    const long = w.days.find((d) => d.slot === 'long');
    if (!long) return;
    assert.ok(['frei', 'frei_vor_tag', 'nacht', 'schlaftag'].includes(long.shift.key), long.shift.key);
  });
});

test('Drei Läufe und drei Krafteinheiten je Woche', () => {
  weeksOf(12).forEach((w) => {
    assert.equal(w.runs, 3, `${w.monday}: ${w.runs} Läufe`);
    assert.equal(w.strength, 3, `${w.monday}: ${w.strength} Krafteinheiten`);
  });
});

test('Eine zweite Einheit am Tag nur dienstfrei und nur locker', () => {
  weeksOf(12).forEach((w) => w.days.filter((d) => d.extra).forEach((d) => {
    assert.ok(['frei', 'frei_vor_tag'].includes(d.shift.key), `${d.date}: ${d.shift.key}`);
    assert.equal(d.session.hard, false, `${d.date}: erste Einheit hart`);
    assert.equal(d.extra.hard, false, `${d.date}: zweite Einheit hart`);
    assert.notEqual(d.session.kind, d.extra.kind, `${d.date}: zweimal dieselbe Art`);
  }));
});

test('Am Ü-Tag steht nie eine intensive Laufeinheit ohne Not', () => {
  const withIntensivOnUe = weeksOf(12).filter((w) => w.days.some((d) => d.slot === 'intensiv' && d.shift.key === 'schlaftag'));
  assert.ok(withIntensivOnUe.length <= 2, `${withIntensivOnUe.length} Wochen mit Intervallen am Ü-Tag`);
});

test('Genau ein intensiver Lauf, ein Longrun, ein lockerer Lauf', () => {
  weeksOf(12).forEach((w) => {
    ['long', 'intensiv', 'easy'].forEach((slot) => {
      assert.equal(w.days.filter((d) => d.slot === slot).length, 1, `${w.monday}: ${slot}`);
    });
  });
});

test('Einheiten passen in ihr Zeitfenster', () => {
  weeksOf(12).forEach((w) => w.days.forEach((d) => {
    [d.session, d.extra].filter(Boolean).forEach((session) => {
      if (session.kind === 'rest' || session.kind === 'mobility') return;
      const travel = session.kind === 'strength' ? SETTINGS.gymTravelMinutes * 2 : 0;
      const room = Math.min(trainingWindow(d.shift.key).minutesFree - travel, SETTINGS.sessionMinutes) + 10;
      assert.ok(session.durationMin <= room, `${d.date}: ${session.durationMin} min in ${room} min`);
    });
  }));
});

test('Harte Einheiten tragen ein hard-Kennzeichen', () => {
  const w = planWeek('2026-01-05', CONFIG, SETTINGS);
  w.days.forEach((d) => {
    if (HARD_SLOTS.includes(d.slot) && d.session.kind !== 'rest') {
      assert.ok(typeof d.session.hard === 'boolean');
    }
  });
});

test('Planer ist deterministisch', () => {
  const a = planWeek('2026-02-02', CONFIG, SETTINGS);
  const b = planWeek('2026-02-02', CONFIG, SETTINGS);
  assert.deepEqual(a.days.map((d) => d.slot), b.days.map((d) => d.slot));
});

/* ---------- Urlaub und Krankheit ---------- */

function withOverrides(overrides) {
  return { ...CONFIG, overrides };
}

test('Urlaub wird wie ein dienstfreier Tag geplant', () => {
  // 2026-01-05 wäre eine Tagschicht.
  const cfg = withOverrides({ '2026-01-05': 'U' });
  const day = shiftDay(cfg, '2026-01-05');
  assert.equal(day.key, 'frei');
  assert.equal(day.code, 'U');
  assert.equal(day.label, 'Urlaub');
  assert.equal(day.absence, 'U');
});

test('Urlaub direkt vor einer Tagschicht behält die frühe Bettzeit', () => {
  // 2026-01-09 ist DF vor der Tagschicht am 10.01.
  const cfg = withOverrides({ '2026-01-09': 'U' });
  const day = shiftDay(cfg, '2026-01-09');
  assert.equal(day.key, 'frei_vor_tag');
  assert.equal(sleepPlan(day.key, day.prevKey, day.nextKey).after.from, '22:00');
});

test('Urlaub direkt nach einer Nachtschicht bleibt der Ü-Tag', () => {
  const cfg = withOverrides({ '2026-01-07': 'U' });
  assert.equal(shiftDay(cfg, '2026-01-07').key, 'schlaftag');
});

test('Ein Urlaubsblock bekommt durchgehend Trainingstage', () => {
  const overrides = {};
  for (let i = 0; i < 7; i += 1) overrides[addDays('2026-01-05', i)] = 'U';
  const plan = planWeek('2026-01-05', withOverrides(overrides), SETTINGS);
  assert.equal(plan.runs, 3);
  assert.equal(plan.strength, 3);
  plan.days.forEach((d) => assert.equal(d.shift.code, 'U'));
});

test('An einem Krankheitstag wird nicht trainiert', () => {
  const cfg = withOverrides({ '2026-01-08': 'K' });
  const plan = planWeek('2026-01-05', cfg, SETTINGS);
  const sick = plan.days.find((d) => d.date === '2026-01-08');
  assert.equal(sick.shift.key, 'krank');
  assert.equal(sick.session.kind, 'sick');
  assert.equal(sick.session.load, 0);
  assert.equal(sick.extra, null);
});

test('Krank schlägt jeden Dienst des Zyklus', () => {
  // 2026-01-05 wäre Tagschicht, 06.01. Nachtschicht.
  const cfg = withOverrides({ '2026-01-05': 'K', '2026-01-06': 'K' });
  assert.equal(shiftDay(cfg, '2026-01-05').key, 'krank');
  assert.equal(shiftDay(cfg, '2026-01-06').key, 'krank');
});

test('Krank heißt zehn Stunden Schlafsoll statt sechs', () => {
  assert.equal(sleepTargetHours('krank', 'krank'), 10);
  assert.equal(sleepPlan('krank', 'krank', 'krank').naps.length, 1);
});

test('Die Bereitschaft erlaubt am Krankheitstag kein Training', () => {
  const d = trainingDirective(95, 'krank');
  assert.equal(d.volume, 0);
  assert.equal(d.allowHard, false);
});

test('Nach der Erkrankung folgt ein Tag Wiedereinstieg je Krankheitstag', () => {
  const cfg = withOverrides({ '2026-02-01': 'K', '2026-02-02': 'K', '2026-02-03': 'K' });
  assert.equal(illnessRamp(cfg, '2026-02-04').rampDays, 3);
  assert.equal(illnessRamp(cfg, '2026-02-04').dayIndex, 1);
  assert.equal(illnessRamp(cfg, '2026-02-06').dayIndex, 3);
  assert.equal(illnessRamp(cfg, '2026-02-07'), null, 'nach der Rampe wieder normal');
});

test('Der Wiedereinstieg dauert mindestens zwei und höchstens sieben Tage', () => {
  const kurz = withOverrides({ '2026-02-01': 'K' });
  assert.equal(illnessRamp(kurz, '2026-02-02').rampDays, 2);

  const lang = {};
  for (let i = 0; i < 14; i += 1) lang[addDays('2026-02-01', i)] = 'K';
  assert.equal(illnessRamp(withOverrides(lang), '2026-02-15').rampDays, MAX_RAMP_DAYS);
});

test('Während der Krankheit selbst läuft keine Rampe', () => {
  const cfg = withOverrides({ '2026-02-01': 'K', '2026-02-02': 'K' });
  assert.equal(illnessRamp(cfg, '2026-02-02'), null);
});

test('Im Wiedereinstieg steht keine harte Einheit', () => {
  const overrides = {};
  for (let i = 0; i < 4; i += 1) overrides[addDays('2026-01-05', i)] = 'K';
  const plan = planWeek('2026-01-05', withOverrides(overrides), SETTINGS);
  plan.days.filter((d) => d.ramp).forEach((d) => {
    [d.session, d.extra].filter(Boolean).forEach((session) => {
      assert.equal(session.hard, false, `${d.date}: ${session.title} ist hart`);
    });
  });
  assert.ok(plan.days.some((d) => d.ramp), 'keine Rampe im Plan');
});

test('Jede Einheitenart hat eine Beschriftung im Wochenstreifen', () => {
  // Ohne diese Prüfung stand im Streifen "undefined", sobald eine neue Art
  // dazukam – zuletzt bei den Krankheitstagen.
  const overrides = { '2026-01-05': 'K', '2026-01-06': 'U' };
  const plan = planWeek('2026-01-05', withOverrides(overrides), SETTINGS);
  const kinds = new Set(plan.days.flatMap((d) => [d.session, d.extra].filter(Boolean).map((x) => x.kind)));
  kinds.forEach((kind) => {
    assert.ok(KIND_LABEL[kind], `keine Beschriftung für die Art "${kind}"`);
  });
});

test('Nach dem Wiedereinstieg kehren harte Einheiten zurück', () => {
  const overrides = {};
  for (let i = 0; i < 2; i += 1) overrides[addDays('2026-01-05', i)] = 'K';
  const plan = planWeek('2026-01-05', withOverrides(overrides), SETTINGS);
  const later = plan.days.filter((d) => !d.ramp && d.shift.key !== 'krank');
  assert.ok(later.some((d) => d.session.hard), 'die Woche bleibt komplett weich');
});

/* ---------- Zielrennen ---------- */

const RACE = {
  name: 'Zugspitz Ultratrail',
  date: '2027-06-18',
  startTime: '23:00',
  startPlace: 'Ehrwald',
  distanceKm: 86,
  vertM: 4295,
  limitHours: 22,
};
const RACE_SETTINGS = { ...SETTINGS, planStart: '2026-09-14', hillMeters: 120, startVertM: 200, longSessionMinutes: 360, race: RACE };

function racePlanFor(weeksBefore) {
  return planWeek(addDays('2026-09-14', weeksBefore * 7), CONFIG, RACE_SETTINGS);
}

test('Die Phasen laufen vom Renntag rückwärts', () => {
  assert.equal(phaseFor(60).key, 'grundlage');
  assert.equal(phaseFor(30).key, 'aufbau');
  assert.equal(phaseFor(10).key, 'spezifisch');
  assert.equal(phaseFor(2).key, 'taper');
  assert.equal(phaseFor(0).key, 'rennwoche');
  assert.equal(phaseFor(-2).key, 'regeneration');
});

test('Der Umfang steigt nie schneller als zehn Prozent je Woche', () => {
  const vp = volumePlan(RACE, 130, 39);
  assert.ok(vp.growthPerWeek <= (MAX_WEEKLY_GROWTH - 1) * 100 + 0.01, `${vp.growthPerWeek} %`);
});

test('Ein zu knapper Zeitraum wird offen ausgewiesen statt überdreht', () => {
  const eng = volumePlan(RACE, 60, 10);
  assert.ok(eng.growthPerWeek <= (MAX_WEEKLY_GROWTH - 1) * 100 + 0.01);
  assert.ok(eng.shortfallPct > 0, 'kein Defizit gemeldet, obwohl die Zeit nicht reicht');
  assert.equal(eng.reachesPeak, false);
});

test('Höhenmeter starten bei dem, was du heute kannst', () => {
  // Der Kalender verlangt in der Aufbauphase über 1000 hm – in der ersten
  // Trainingswoche darf trotzdem nur der Ausgangswert stehen.
  assert.equal(vertTarget(RACE, 39, 0, 200), 200);
  assert.ok(vertTarget(RACE, 39, 0, 200) < phaseVert(RACE, 39));
});

test('Die geplanten Höhenmeter treffen das Wochenziel', () => {
  for (let t = 0; t <= 43; t += 1) {
    const plan = racePlanFor(t);
    const target = plan.race.vertM;
    if (!target) continue;
    const ratio = plan.plannedVert / target;
    assert.ok(ratio >= 0.75 && ratio <= 1.15, `Woche ${t}: ${plan.plannedVert} von ${target} hm (${Math.round(ratio * 100)} %)`);
  }
});

test('Die spezifische Phase enthält alle vier Ultra-Inhalte', () => {
  const titles = new Set();
  for (let t = 15; t <= 36; t += 1) {
    racePlanFor(t).days.forEach((d) => {
      [d.session, d.extra].filter(Boolean).forEach((x) => titles.add(x.title));
    });
  }
  ['Time on Feet', 'Bergwiederholungen', 'Bergab-Toleranz', 'Zweiter langer Tag', 'Nacht-Longrun']
    .forEach((t) => assert.ok(titles.has(t), `"${t}" kommt nie vor`));
});

test('Der zweite lange Tag steht immer direkt nach dem Longrun', () => {
  for (let t = 0; t <= 43; t += 1) {
    const days = racePlanFor(t).days;
    days.forEach((d, i) => {
      if (d.slot !== 'long_b') return;
      assert.ok(i > 0, `Woche ${t}: Doppeltag am Wochenanfang`);
      assert.equal(days[i - 1].slot, 'long', `Woche ${t}: Doppeltag ohne Longrun davor`);
    });
  }
});

test('Bergab-Einheiten beginnen nicht in der Grundlage', () => {
  const f = features(60);
  assert.equal(f.downhill, false);
  assert.equal(f.timeOnFeet, false);
  assert.equal(features(10).downhill, true);
});

test('Am Renntag steht das Rennen und sonst nichts', () => {
  const week = planWeek('2027-06-14', CONFIG, RACE_SETTINGS);
  const day = week.days.find((d) => d.date === '2027-06-18');
  assert.equal(day.session.kind, 'race');
  assert.equal(day.extra, null);
  assert.equal(week.days.filter((d) => d.session.hard && d.session.kind !== 'race').length, 0,
    'in der Rennwoche steht eine harte Einheit');
});

test('Nach dem Rennen wird in derselben Woche nicht mehr trainiert', () => {
  const week = planWeek('2027-06-14', CONFIG, RACE_SETTINGS);
  week.days.filter((d) => d.date > '2027-06-18').forEach((d) => {
    assert.equal(d.session.kind, 'rest', `${d.date}: ${d.session.title}`);
  });
});

test('In der Regeneration steht nichts Hartes', () => {
  [44, 45, 46].forEach((t) => {
    racePlanFor(t).days.forEach((d) => {
      [d.session, d.extra].filter(Boolean).forEach((x) => {
        assert.equal(x.hard, false, `Woche ${t}: ${x.title}`);
      });
    });
  });
});

test('Der Taper nimmt den Umfang deutlich zurück', () => {
  const spezifisch = racePlanFor(33).progression.weeklyRunMinutes;
  const taper = racePlanFor(38).progression.weeklyRunMinutes;
  assert.ok(taper < spezifisch * 0.7, `Taper ${taper} min gegen ${spezifisch} min`);
});

test('Mit Bergziel kommt Zone 5 nicht mehr vor', () => {
  for (let t = 0; t <= 38; t += 1) {
    racePlanFor(t).days.forEach((d) => {
      [d.session, d.extra].filter(Boolean).forEach((x) => {
        (x.blocks || []).forEach((b) => {
          assert.notEqual(b.zone, 5, `Woche ${t}: ${x.title} enthält Zone 5`);
        });
      });
    });
  }
});

test('Die Intensitätsverteilung trifft das Rennziel', () => {
  for (let t = 10; t <= 34; t += 1) {
    const plan = racePlanFor(t);
    const zm = [0, 0, 0, 0, 0];
    plan.days.forEach((d) => [d.session, d.extra].filter(Boolean).forEach((x) => {
      (x.blocks || []).forEach((b) => { if (b.zone && b.minutes) zm[b.zone - 1] += b.minutes; });
    }));
    const total = zm.reduce((a, b) => a + b, 0);
    if (total < 60) continue;
    const easy = (zm[0] + zm[1]) / total;
    const target = zoneTargets(plan.race.weeksOut).easy;
    assert.ok(easy >= target - 0.12, `Woche ${t}: nur ${Math.round(easy * 100)} % locker, Ziel ${Math.round(target * 100)} %`);
  }
});

test('Die Steigrate ergibt sich aus Höhenmetern und Zeitlimit', () => {
  // 4295 hm, angepeilt 19,4 h, davon rund 45 % im Anstieg.
  assert.equal(vertRateTarget(RACE), 490);
  const split = terrainSplit(RACE);
  assert.ok(split.climbHours > split.descentHours);
  assert.ok(split.climbHours + split.descentHours + split.flatHours <= racePlanFn(RACE).targetHours + 0.2);
});

test('Krafteinheiten bekommen mit Bergziel den passenden Schwerpunkt', () => {
  const mit = racePlanFor(20).days.map((d) => d.session).find((x) => x.slot === 'kraft_a');
  assert.equal(mit.focus, 'Bergab-Kraft');
  const ohne = planWeek('2026-09-14', CONFIG, SETTINGS).days.map((d) => d.session).find((x) => x.slot === 'kraft_a');
  assert.equal(ohne.focus, 'Schwerer Beintag');
});

test('Ohne Ziel bleibt der Plan unverändert endlos', () => {
  const ohne = planWeek('2026-09-14', CONFIG, SETTINGS);
  assert.equal(ohne.race, null);
  assert.equal(ohne.plannedVert, 0);
  assert.equal(ohne.runs, 3);
});

test('Der Rennplan rechnet Flachäquivalent und Verpflegung aus', () => {
  const p = racePlanFor(0).race.plan;
  assert.equal(p.flatEquivalent, 129);      // 86 km + 4295 hm / 100
  assert.ok(p.targetHours < RACE.limitHours, 'kein Puffer zum Limit');
  assert.equal(p.carbsPerHour[0], 60);
  assert.ok(p.carbsTotal[0] > 1000);
});

/* ---------- Rollende Anzeige ---------- */

test('Der Plan hängt am Wochenanfang, nicht am aufgerufenen Tag', () => {
  // Sonst läge für jeden Tag derselben Woche ein anderer Plan vor – und die
  // rollende Anzeige zeigte sieben widersprüchliche Wochen.
  const montag = planWeek('2026-01-05', CONFIG, SETTINGS);
  const donnerstag = planWeek('2026-01-08', CONFIG, SETTINGS);
  assert.equal(donnerstag.monday, montag.monday);
  assert.deepEqual(donnerstag.days.map((d) => d.slot), montag.days.map((d) => d.slot));
});

test('Ein rollendes Fenster setzt sich aus zwei Wochenplänen zusammen', () => {
  const start = '2026-01-08'; // Donnerstag
  const fenster = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return planWeek(date, CONFIG, SETTINGS).days.find((d) => d.date === date);
  });
  assert.equal(fenster.length, 7);
  assert.equal(fenster[0].date, start);
  assert.equal(fenster[6].date, addDays(start, 6));
  fenster.forEach((d) => assert.ok(d, 'ein Tag des Fensters fehlt'));

  // Die Tage stammen aus zwei Kalenderwochen und bleiben trotzdem die,
  // die der Wochenplan für sie vorsieht.
  const zweite = planWeek('2026-01-12', CONFIG, SETTINGS);
  assert.equal(fenster[6].slot, zweite.days.find((d) => d.date === fenster[6].date).slot);
});

test('Die Wochenziele bleiben an der Kalenderwoche hängen', () => {
  // Das rollende Fenster ändert nichts an dem, was die Woche vorsieht.
  const a = planWeek('2026-01-08', CONFIG, SETTINGS);
  assert.equal(a.runs, 3);
  assert.equal(a.strength, 3);
  assert.equal(a.monday, '2026-01-05');
});

/* ---------- Progression ---------- */

test('Vierwochenblock steigt dreimal und entlastet einmal', () => {
  const p = [0, 1, 2, 3].map((i) => progression(i, SETTINGS).weeklyRunMinutes);
  assert.ok(p[1] > p[0] && p[2] > p[1] && p[3] < p[0]);
  assert.equal(progression(3, SETTINGS).deload, true);
});

test('Jeder neue Block startet über dem vorherigen', () => {
  assert.ok(progression(4, SETTINGS).weeklyRunMinutes > progression(0, SETTINGS).weeklyRunMinutes);
  assert.ok(progression(8, SETTINGS).weeklyRunMinutes > progression(4, SETTINGS).weeklyRunMinutes);
});

test('Umfang ist nach oben gedeckelt', () => {
  assert.ok(progression(400, SETTINGS).weeklyRunMinutes <= SETTINGS.startRunMinutes * 2.6 * 1.2 + 1);
});

test('Zonenangaben in den Untertiteln bleiben lesbar', () => {
  weeksOf(6).forEach((w) => w.days.forEach((d) => {
    [d.session, d.extra].filter(Boolean).forEach((session) => {
      if (session.kind !== 'run') return;
      // Kein doppelter Zonenblock der Form "Z1 · 114–138–Z2 · 139–160":
      // eine Pulszahl darf nie direkt an eine Zonenbezeichnung stoßen.
      assert.ok(!/\d{3}–Z\d/.test(session.subtitle), `${d.date}: ${session.subtitle}`);
    });
  }));
});

test('Krafteinheiten schreiben nichts vor', () => {
  const forbidden = /\d\s*[×x]\s*\d|kg|RPE|%/;
  weeksOf(12).forEach((w) => w.days.forEach((d) => {
    [d.session, d.extra].filter(Boolean).forEach((session) => {
      if (session.kind !== 'strength') return;
      assert.equal(session.blocks.length, 0, `${d.date}: ${session.title} hat einen Ablauf`);
      const text = `${session.title} ${session.subtitle} ${session.focus}`;
      assert.ok(!forbidden.test(text), `${d.date}: "${text}" enthält eine Vorgabe`);
    });
  }));
});

test('Krafteinheiten nennen die verfügbare Zeit, keine Dauer-Vorgabe', () => {
  const w = planWeek('2026-01-05', CONFIG, SETTINGS);
  const strength = w.days.map((d) => d.session).filter((s) => s.kind === 'strength');
  assert.ok(strength.length > 0);
  strength.forEach((s) => {
    assert.equal(s.durationCaption, 'Minuten Zeit');
    assert.ok(s.durationMin >= 30);
  });
});

test('Belastungspunkte einer Krafteinheit hängen nicht am Zeitfenster', () => {
  const short = planWeek('2026-01-05', CONFIG, { ...SETTINGS, sessionMinutes: 45 });
  const long = planWeek('2026-01-05', CONFIG, { ...SETTINGS, sessionMinutes: 120 });
  const loadOf = (plan, slot) => {
    const d = plan.days.find((x) => x.slot === slot);
    return d ? d.session.load : null;
  };
  assert.equal(loadOf(short, 'kraft_b'), loadOf(long, 'kraft_b'));
});

test('Der Beintag bleibt fürs Planen die harte Einheit', () => {
  weeksOf(12).forEach((w) => w.days.forEach((d) => {
    if (d.slot === 'kraft_a' && d.session.kind === 'strength') assert.equal(d.session.hard, true);
    if (d.slot === 'kraft_b' && d.session.kind === 'strength') assert.equal(d.session.hard, false);
  }));
});

test('Wochenindex zählt ab Planstart', () => {
  assert.equal(weekIndex('2026-01-05', '2026-01-05'), 0);
  assert.equal(weekIndex('2026-01-05', '2026-01-11'), 0);
  assert.equal(weekIndex('2026-01-05', '2026-01-12'), 1);
});

/* ---------- Bereitschaft ---------- */

const HISTORY = Array.from({ length: 20 }, (_, i) => ({
  date: addDays('2026-01-01', i),
  recovery: 65, hrv: 60, rhr: 50, sleepHours: 7, sleepPerformance: 80, strain: 12, soreness: 2,
}));

test('Gute Werte ergeben einen grünen Bereitschaftswert', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const r = readiness(
    { date: '2026-02-01', recovery: 92, hrv: 78, rhr: 46, sleepHours: 8, sleepPerformance: 95, soreness: 1 },
    base, 'frei', { acute: 100, chronic: 100, ratio: 1 }, 8,
  );
  assert.ok(r.score >= 75, `Wert ${r.score}`);
  assert.equal(r.band.key, 'gruen');
});

test('Schlechte Werte ergeben Rot', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const r = readiness(
    { date: '2026-02-01', recovery: 18, hrv: 32, rhr: 60, sleepHours: 4, sleepPerformance: 45, soreness: 5 },
    base, 'frei', { acute: 100, chronic: 100, ratio: 1 }, 8,
  );
  assert.ok(r.score < 38, `Wert ${r.score}`);
  assert.equal(r.band.key, 'rot');
});

test('Hohe Vorbelastung senkt den Wert', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const c = { date: '2026-02-01', recovery: 70, hrv: 60, rhr: 50, sleepHours: 7, sleepPerformance: 80, soreness: 2 };
  const calm = readiness(c, base, 'frei', { acute: 100, chronic: 100, ratio: 1.0 }, 8);
  const loaded = readiness(c, base, 'frei', { acute: 160, chronic: 100, ratio: 1.6 }, 8);
  assert.ok(loaded.score < calm.score);
});

test('Rot verbietet harte Einheiten, Grün erlaubt sie', () => {
  assert.equal(trainingDirective(20, 'frei').allowHard, false);
  assert.equal(trainingDirective(20, 'frei').volume, 0);
  assert.equal(trainingDirective(85, 'frei').allowHard, true);
  assert.equal(trainingDirective(60, 'frei').volume, 0.85);
});

test('Angezeigter Wert und Ampel passen immer zusammen', () => {
  const base = baselines(HISTORY, '2026-02-01');
  // Über einen breiten Bereich prüfen, dass die Einstufung zum gerundeten Wert passt.
  for (let recovery = 0; recovery <= 100; recovery += 1) {
    const r = readiness(
      { date: '2026-02-01', recovery, sleepHours: 8, sleepPerformance: 80, hrv: 60, rhr: 50, soreness: 2 },
      base, 'frei', { acute: 100, chronic: 100, ratio: 1 }, 8,
    );
    const expected = BANDS.find((b) => r.score >= b.min);
    assert.equal(r.band.key, expected.key, `Wert ${r.score} als ${r.band.key} eingestuft`);
  }
});

test('Fehlende Werte kippen die Berechnung nicht', () => {
  const r = readiness({ date: '2026-02-01', recovery: 55 }, baselines([], '2026-02-01'), 'frei', null, 8);
  assert.equal(r.score, 55);
});

/* ---------- Heute-Tab und Wochenplan ---------- */

test('Die angepasste Einheit ersetzt die geplante vollständig', () => {
  const entry = planWeek('2026-01-08', CONFIG, SETTINGS).days.find((d) => d.date === '2026-01-08');
  const rot = applyDirective(entry, trainingDirective(20, entry.shift.key));
  assert.equal(rot.changed, true);
  assert.notEqual(rot.session.title, entry.session.title);

  const gruen = applyDirective(entry, trainingDirective(90, entry.shift.key));
  assert.equal(gruen.changed, false);
  assert.equal(gruen.session.title, entry.session.title);
});

test('Gekürzte Einheiten behalten Struktur und Zielzonen', () => {
  const entry = planWeek('2026-01-08', CONFIG, SETTINGS).days.find((d) => d.slot === 'long');
  if (!entry) return;
  const gelb = applyDirective(entry, trainingDirective(60, entry.shift.key));
  assert.equal(gelb.session.primaryZone, entry.session.primaryZone);
  assert.ok(gelb.session.durationMin < entry.session.durationMin);
  assert.equal(gelb.session.blocks.length, entry.session.blocks.length);
});

/* ---------- Belastung ---------- */

test('Akute und chronische Last werden korrekt summiert', () => {
  const log = {};
  for (let i = 0; i < 28; i += 1) log[addDays('2026-03-01', -i)] = { load: 10 };
  const lb = loadBalance(log, '2026-03-01');
  assert.equal(lb.acute, 70);
  assert.equal(lb.chronic, 70);
  assert.equal(lb.ratio, 1);
});

test('Ohne genug Historie gibt es kein Belastungsverhältnis', () => {
  const lb = loadBalance({ '2026-03-01': { load: 60 } }, '2026-03-01');
  assert.equal(lb.ratio, null, 'eine einzige Einheit darf kein Verhältnis ergeben');
  assert.equal(lb.acute, 60);
  assert.ok(lb.trackedDays < lb.minDays);
});

test('Ein Belastungsverhältnis entsteht, sobald genug Tage erfasst sind', () => {
  const log = {};
  for (let i = 0; i < 14; i += 1) log[addDays('2026-03-01', -i)] = { load: 10 };
  const lb = loadBalance(log, '2026-03-01');
  assert.ok(lb.ratio != null);
  assert.equal(lb.acute, 70);
});

test('Ohne belastbares Verhältnis bleibt die Bereitschaft unkorrigiert', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const c = { date: '2026-02-01', recovery: 70, hrv: 60, rhr: 50, sleepHours: 7, sleepPerformance: 80, soreness: 2 };
  const fresh = readiness(c, base, 'frei', loadBalance({ '2026-02-01': { load: 60 } }, '2026-02-01'), 8);
  const neutral = readiness(c, base, 'frei', null, 8);
  assert.equal(fresh.score, neutral.score);
  assert.equal(fresh.adjustments.length, 0);
});

/* ---------- Aufgaben ---------- */

test('Tägliche Gewohnheiten stehen jeden Tag an', () => {
  const habit = defaultHabits()[0];
  assert.equal(dueOn(habit, '2026-05-05', 'frei'), true);
});

test('Schichtgebundene Aufgabe nur am passenden Tagtyp', () => {
  const t = createTask({ title: 'Tasche packen', repeat: 'shift', shiftDays: ['nacht'], created: '2026-01-01' });
  assert.equal(dueOn(t, '2026-05-05', 'nacht'), true);
  assert.equal(dueOn(t, '2026-05-05', 'frei'), false);
});

test('Einmalige Aufgabe nur am Fälligkeitstag', () => {
  const t = createTask({ title: 'Arzt', repeat: 'once', due: '2026-05-07', created: '2026-05-01' });
  assert.equal(dueOn(t, '2026-05-07', 'frei'), true);
  assert.equal(dueOn(t, '2026-05-08', 'frei'), false);
});

test('Aufgabe gilt nicht vor ihrem Anlegedatum', () => {
  const t = createTask({ title: 'Neu', repeat: 'daily', created: '2026-05-10' });
  assert.equal(dueOn(t, '2026-05-09', 'frei'), false);
  assert.equal(dueOn(t, '2026-05-11', 'frei'), true);
});

/* ---------- Hilfsfunktionen ---------- */

test('Zeitrechnung über Mitternacht', () => {
  assert.equal(hhmm(minutes('01:00') - 180), '22:00');
  assert.equal(hhmm(minutes('23:30') + 90), '01:00');
});

test('Wochenstart ist immer Montag', () => {
  assert.equal(weekStart('2026-01-08'), '2026-01-05');
  assert.equal(weekStart('2026-01-05'), '2026-01-05');
  assert.equal(weekStart('2026-01-11'), '2026-01-05');
});

/* ---------- Ergebnis ---------- */

if (failures.length) {
  console.error(`\n${failures.length} von ${passed + failures.length} Tests fehlgeschlagen:\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`✓ ${passed} Tests bestanden`);
