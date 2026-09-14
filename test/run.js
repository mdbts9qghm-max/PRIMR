// Prüft die Rechenkerne: Schichtableitung, Schlaffenster, Planerregeln,
// Progression, Bereitschaft und Aufgaben. Läuft ohne Browser.

import assert from 'node:assert/strict';
import { shiftDay, DEFAULT_CYCLE, trainingWindow } from '../js/core/shift.js';
import { sleepPlan, sleepTargetHours, caffeineCutoff } from '../js/core/sleep.js';
import { planWeek, progression, weekIndex, effectiveTrainingMax, loadBalance } from '../js/core/plan.js';
import { HARD_SLOTS } from '../js/core/library.js';
import { readiness, baselines, trainingDirective } from '../js/core/readiness.js';
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

const CONFIG = { cycle: DEFAULT_CYCLE.slice(), anchorDate: '2026-01-05', anchorIndex: 0 };

/* ---------- Schicht ---------- */

test('Zyklus beginnt am Ankertag bei Tagschicht', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-05').key, 'tag');
  assert.equal(shiftDay(CONFIG, '2026-01-06').key, 'tag');
});

test('Erste Nacht und Folgenacht werden unterschieden', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-07').key, 'nacht');
  assert.equal(shiftDay(CONFIG, '2026-01-08').key, 'nacht_folge');
});

test('Tag nach der letzten Nacht ist der Schlaftag', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-09').key, 'schlaftag');
});

test('Freier Tag vor der Tagschicht wird als Frei 2 erkannt', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-10').key, 'frei');
  assert.equal(shiftDay(CONFIG, '2026-01-11').key, 'frei_vor_tag');
  assert.equal(shiftDay(CONFIG, '2026-01-12').key, 'tag');
});

test('Zyklus wiederholt sich nach 35 Tagen', () => {
  assert.equal(shiftDay(CONFIG, '2026-01-05').key, shiftDay(CONFIG, '2026-02-09').key);
});

test('Zyklus rechnet auch rückwärts korrekt', () => {
  assert.equal(shiftDay(CONFIG, '2025-12-01').index, (((-35) % 35) + 35) % 35);
  assert.ok(['T', 'N', 'F'].includes(shiftDay(CONFIG, '2025-12-01').raw));
});

/* ---------- Schlaf ---------- */

test('Tagschicht: Aufstehen 05:30, Bett 23:30', () => {
  const p = sleepPlan('tag');
  assert.equal(p.wake, '05:30');
  assert.equal(p.bed, '23:30');
  assert.equal(p.blocks[0].durationMin, 360);
});

test('Nachtschicht hat Vorschlaf 15:00 bis 17:30', () => {
  const nap = sleepPlan('nacht').blocks.find((b) => b.kind === 'vorschlaf');
  assert.equal(nap.from, '15:00');
  assert.equal(nap.to, '17:30');
  assert.equal(nap.durationMin, 150);
});

test('Schlaftag: 08:00 bis 14:00 und Bett um 00:00', () => {
  const p = sleepPlan('schlaftag');
  assert.equal(p.wake, '14:00');
  assert.equal(p.bed, '00:00');
  assert.equal(sleepTargetHours('schlaftag'), 14);
});

test('Frei vor Tagschicht geht um 22:00 ins Bett', () => {
  assert.equal(sleepPlan('frei_vor_tag').bed, '22:00');
});

test('Vorschlaf zählt nicht auf das Schlafsoll', () => {
  assert.equal(sleepTargetHours('nacht'), 6);
});

test('Koffein-Stopp liegt acht Stunden vor dem Hauptschlaf', () => {
  assert.equal(caffeineCutoff('tag'), '15:30');
  assert.equal(caffeineCutoff('frei_vor_tag'), '14:00');
});

/* ---------- Planer ---------- */

const SETTINGS = {
  planStart: '2026-01-05',
  startRunMinutes: 130,
  sessionMinutes: 90,
  easyPace: 6.4,
  trainingMax: { squat: 120, bench: 90, trapbar: 150 },
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

test('Genau ein intensiver Lauf, ein Longrun, ein lockerer Lauf', () => {
  weeksOf(12).forEach((w) => {
    ['long', 'intensiv', 'easy'].forEach((slot) => {
      assert.equal(w.days.filter((d) => d.slot === slot).length, 1, `${w.monday}: ${slot}`);
    });
  });
});

test('Einheiten passen in ihr Zeitfenster', () => {
  weeksOf(12).forEach((w) => w.days.forEach((d) => {
    if (d.session.kind === 'rest') return;
    const room = Math.min(trainingWindow(d.shift.key).minutesFree, SETTINGS.sessionMinutes) + 10;
    assert.ok(d.session.durationMin <= room, `${d.date}: ${d.session.durationMin} min in ${room} min`);
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

test('Trainingsmaximum wächst je Block', () => {
  const tm = effectiveTrainingMax({ squat: 120, bench: 90, trapbar: 150 }, 3);
  assert.equal(tm.squat, 135);
  assert.equal(tm.bench, 97.5);
  assert.equal(tm.trapbar, 165);
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
    base, 'frei', { acute: 100, chronic: 100, ratio: 1 },
  );
  assert.ok(r.score >= 75, `Wert ${r.score}`);
  assert.equal(r.band.key, 'gruen');
});

test('Schlechte Werte ergeben Rot', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const r = readiness(
    { date: '2026-02-01', recovery: 18, hrv: 32, rhr: 60, sleepHours: 4, sleepPerformance: 45, soreness: 5 },
    base, 'frei', { acute: 100, chronic: 100, ratio: 1 },
  );
  assert.ok(r.score < 38, `Wert ${r.score}`);
  assert.equal(r.band.key, 'rot');
});

test('Hohe Vorbelastung senkt den Wert', () => {
  const base = baselines(HISTORY, '2026-02-01');
  const c = { date: '2026-02-01', recovery: 70, hrv: 60, rhr: 50, sleepHours: 7, sleepPerformance: 80, soreness: 2 };
  const calm = readiness(c, base, 'frei', { acute: 100, chronic: 100, ratio: 1.0 });
  const loaded = readiness(c, base, 'frei', { acute: 160, chronic: 100, ratio: 1.6 });
  assert.ok(loaded.score < calm.score);
});

test('Rot verbietet harte Einheiten, Grün erlaubt sie', () => {
  assert.equal(trainingDirective(20, 'frei').allowHard, false);
  assert.equal(trainingDirective(20, 'frei').volume, 0);
  assert.equal(trainingDirective(85, 'frei').allowHard, true);
  assert.equal(trainingDirective(60, 'frei').volume, 0.85);
});

test('Fehlende Werte kippen die Berechnung nicht', () => {
  const r = readiness({ date: '2026-02-01', recovery: 55 }, baselines([], '2026-02-01'), 'frei', null);
  assert.equal(r.score, 55);
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
