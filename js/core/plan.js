// Der Trainingsplaner. Er bekommt den Schichtzyklus und die Woche und legt
// sechs Einheiten so, dass Erholung, Vorbelastung und Dienst zusammenpassen.
//
// Grundregeln, die hier in Zahlen gegossen sind:
//   - An der Tagschicht wird nicht trainiert, höchstens Mobility.
//   - Longrun bevorzugt an freien Tagen, sonst am Vormittag vor der Nacht.
//   - Keine zwei harten Tage hintereinander.
//   - Drei Läufe (intensiv, lang, locker) und drei Krafteinheiten je Woche.
//   - Der Umfang steigt in Vierwochenblöcken und fällt in der vierten Woche ab.

import { addDays, weekStart, daysBetween, clamp, round } from './util.js';
import { shiftDay, trainingWindow, dutyMinutes } from './shift.js';
import {
  intensivSession, longRun, easyRun, strengthSession, mobilitySession, restDay, HARD_SLOTS,
} from './library.js';

export const SLOTS = ['long', 'intensiv', 'kraft_a', 'easy', 'kraft_b', 'kraft_c'];

const SLOT_LABEL = {
  long: 'Longrun',
  intensiv: 'Intensive Laufeinheit',
  easy: 'Lockerer Lauf',
  kraft_a: 'Kraft A (Beine schwer)',
  kraft_b: 'Kraft B (Oberkörper)',
  kraft_c: 'Kraft C (Athletik)',
};

// Wie gut passt eine Einheit zu einem Schichttag. -1 bedeutet unmöglich.
const FIT = {
  long: { tag: -1, nacht: 7, nacht_folge: -1, schlaftag: 4, frei_vor_tag: 8, frei: 10 },
  intensiv: { tag: -1, nacht: 8, nacht_folge: -1, schlaftag: 5, frei_vor_tag: 8, frei: 10 },
  easy: { tag: -1, nacht: 7, nacht_folge: 5, schlaftag: 7, frei_vor_tag: 7, frei: 8 },
  kraft_a: { tag: -1, nacht: 7, nacht_folge: -1, schlaftag: 5, frei_vor_tag: 8, frei: 10 },
  kraft_b: { tag: -1, nacht: 7, nacht_folge: 4, schlaftag: 7, frei_vor_tag: 8, frei: 9 },
  kraft_c: { tag: -1, nacht: 7, nacht_folge: 3, schlaftag: 6, frei_vor_tag: 8, frei: 9 },
};

const UNPLACED_PENALTY = { long: 150, intensiv: 140, easy: 90, kraft_a: 120, kraft_b: 85, kraft_c: 80 };

/**
 * Wochenindex seit Planstart – Grundlage jeder Progression.
 */
export function weekIndex(planStartIso, isoDate) {
  return Math.max(0, Math.floor(daysBetween(weekStart(planStartIso), weekStart(isoDate)) / 7));
}

/**
 * Umfangsvorgabe der Woche. Vierwochenblöcke, drei Wochen Aufbau, eine Entlastung.
 * Von Block zu Block steigt die Basis um 5 %, gedeckelt beim 2,6-fachen Start.
 */
export function progression(w, settings) {
  const start = settings.startRunMinutes || 130;
  const block = Math.floor(w / 4);
  const inBlock = w % 4;
  const cap = start * 2.6;
  const base = Math.min(cap, start * 1.05 ** block);
  const weekFactor = [1, 1.1, 1.2, 0.72][inBlock];
  const weekly = Math.round(base * weekFactor);

  return {
    week: w,
    block,
    inBlock,
    phase: ['Aufbau', 'Volumen', 'Intensität', 'Entlastung'][inBlock],
    deload: inBlock === 3,
    weeklyRunMinutes: weekly,
    longMinutes: Math.round(weekly * 0.4),
    intensivMinutes: Math.round(weekly * 0.32),
    easyMinutes: Math.round(weekly * 0.28),
  };
}

/**
 * Progressive Overload im Kraftraum: Nach jedem abgeschlossenen Vierwochenblock
 * steigt das Trainingsmaximum – Beinübungen 5 kg, Oberkörper 2,5 kg.
 */
export function effectiveTrainingMax(base, block) {
  if (!base) return base;
  const step = { squat: 5, trapbar: 5, bench: 2.5 };
  const out = {};
  Object.keys(step).forEach((k) => {
    out[k] = base[k] == null ? null : base[k] + step[k] * block;
  });
  return out;
}

function buildSession(slot, w, prog, settings, minutesFree) {
  switch (slot) {
    case 'long':
      return longRun(w, clamp(prog.longMinutes, 30, minutesFree), settings.easyPace);
    case 'intensiv':
      return intensivSession(w, Math.min(prog.intensivMinutes + 22, minutesFree));
    case 'easy':
      return easyRun(w, clamp(prog.easyMinutes, 20, minutesFree), settings.easyPace);
    default:
      return strengthSession(slot, w, effectiveTrainingMax(settings.trainingMax, prog.block), minutesFree);
  }
}

/**
 * Sucht die beste Verteilung der sechs Einheiten auf die sieben Tage.
 * Der Suchraum ist klein genug, um ihn vollständig zu durchlaufen – das
 * Ergebnis ist damit reproduzierbar und nicht von einer Heuristik abhängig.
 *
 * Ein Tag nimmt normalerweise eine Einheit auf. An freien Tagen darf eine
 * zweite dazukommen, wenn beide locker sind und es ein Lauf plus Kraft ist –
 * sonst gehen in Wochen mit zwei Tagschichten schlicht nicht sechs Einheiten
 * in fünf nutzbare Tage.
 */
const DOUBLE_OK = ['frei', 'frei_vor_tag'];

function isRun(slot) {
  return slot === 'long' || slot === 'intensiv' || slot === 'easy';
}

function assign(days, candidates) {
  let best = null;
  const chosen = new Array(SLOTS.length).fill(-1);

  function canPlace(slotIndex, day) {
    const slot = SLOTS[slotIndex];
    const existing = [];
    for (let j = 0; j < slotIndex; j += 1) if (chosen[j] === day) existing.push(SLOTS[j]);
    if (!existing.length) return true;
    if (existing.length > 1) return false;
    if (!DOUBLE_OK.includes(days[day].key)) return false;
    const other = existing[0];
    if (HARD_SLOTS.includes(slot) || HARD_SLOTS.includes(other)) return false;
    if (isRun(slot) === isRun(other)) return false;
    const total = candidates[day][slot].durationMin + candidates[day][other].durationMin;
    return total <= days[day].window.minutesFree + 60;
  }

  function evaluate() {
    const byDay = days.map(() => []);
    let score = 0;

    SLOTS.forEach((slot, i) => {
      const d = chosen[i];
      if (d === -1) {
        score -= UNPLACED_PENALTY[slot];
      } else {
        byDay[d].push(slot);
        score += FIT[slot][days[d].key] * 10;
      }
    });

    byDay.forEach((slots) => { if (slots.length > 1) score -= 18; });

    const hardDay = byDay.map((slots) => slots.some((s) => HARD_SLOTS.includes(s)));
    const runDay = byDay.map((slots) => slots.some(isRun));
    const busy = byDay.map((slots) => slots.length > 0);

    for (let i = 1; i < days.length; i += 1) {
      if (hardDay[i - 1] && hardDay[i]) score -= 70;
      if (runDay[i - 1] && runDay[i]) score -= 12;
      if (i >= 2 && busy[i - 2] && busy[i - 1] && busy[i]) score -= 6;
    }

    // Longrun möglichst weit weg von der intensiven Einheit.
    const li = byDay.findIndex((s) => s.includes('long'));
    const ii = byDay.findIndex((s) => s.includes('intensiv'));
    if (li >= 0 && ii >= 0) score += Math.min(3, Math.abs(li - ii)) * 6;

    // Harte Einheit direkt vor der ersten Nacht eines Blocks kostet etwas.
    byDay.forEach((slots, i) => {
      if (slots.some((s) => HARD_SLOTS.includes(s)) && days[i].key === 'nacht') score -= 8;
    });

    if (!best || score > best.score) best = { score, byDay: byDay.map((s) => s.slice()) };
  }

  function step(i) {
    if (i === SLOTS.length) {
      evaluate();
      return;
    }
    const slot = SLOTS[i];
    for (let d = 0; d < days.length; d += 1) {
      if (FIT[slot][days[d].key] < 0) continue;
      if (!candidates[d] || !candidates[d][slot]) continue;
      if (!canPlace(i, d)) continue;
      chosen[i] = d;
      step(i + 1);
    }
    chosen[i] = -1; // Einheit bewusst nicht platzieren
    step(i + 1);
  }

  step(0);
  return best || { score: 0, byDay: days.map(() => []) };
}

/**
 * Plan für die Woche, die isoDate enthält.
 * Liefert 7 Einträge mit Schichttag, Zeitfenster und Einheit.
 */
export function planWeek(isoDate, shiftConfig, settings) {
  const monday = weekStart(isoDate);
  const w = weekIndex(settings.planStart, monday);
  const prog = progression(w, settings);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    const sd = shiftDay(shiftConfig, date);
    const win = trainingWindow(sd.key);
    days.push({ date, key: sd.key, shift: sd, window: win });
  }

  // Vorab für jeden Tag prüfen, welche Einheit zeitlich überhaupt hineinpasst.
  const candidates = days.map((d) => {
    const room = Math.min(d.window.minutesFree, settings.sessionMinutes || 90);
    const out = {};
    SLOTS.forEach((slot) => {
      if (FIT[slot][d.key] < 0) return;
      const s = buildSession(slot, w, prog, settings, room);
      if (s.durationMin <= room + 10) out[slot] = s;
    });
    return out;
  });

  const { byDay } = assign(days, candidates);

  const plan = days.map((d, i) => {
    const slots = byDay[i];
    let session;
    let extra = null;
    if (slots.length) {
      session = candidates[i][slots[0]];
      if (slots.length > 1) extra = candidates[i][slots[1]];
    } else if (d.key === 'tag') {
      session = mobilitySession(d.key);
    } else {
      session = restDay(d.key === 'nacht_folge' ? 'Zweite Nacht – Erholung hat Vorrang' : 'Geplanter Ruhetag');
    }
    return {
      date: d.date,
      shift: d.shift,
      window: d.window,
      slot: slots[0] || session.slot,
      session,
      extra,
      why: explain(slots[0], d, days, byDay),
      dutyLoad: Math.round(dutyMinutes(d.key) * (d.key === 'tag' ? 0.08 : 0.1)),
    };
  });

  const all = plan.flatMap((p) => [p.session, p.extra].filter(Boolean));
  const placed = byDay.flat();
  return {
    monday,
    weekIndex: w,
    progression: prog,
    days: plan,
    plannedLoad: all.reduce((a, s) => a + (s.load || 0), 0),
    runs: all.filter((s) => s.kind === 'run').length,
    strength: all.filter((s) => s.kind === 'strength').length,
    missing: SLOTS.filter((s) => !placed.includes(s)).map((s) => SLOT_LABEL[s]),
  };
}

function explain(slot, day, days, byDay) {
  if (!slot) {
    if (day.key === 'tag') return 'Tagschicht: 12 Stunden Dienst plus Anfahrt. Nur Mobility, alles andere geht auf die Erholung.';
    if (day.key === 'nacht_folge') return 'Zweite Nacht in Folge – der Morgenschlaf ersetzt keine Nacht. Ruhetag schützt die harten Einheiten der Woche.';
    return 'Bewusster Ruhetag: Er hält den Abstand zwischen den harten Reizen groß genug.';
  }
  const parts = [];
  if (day.key === 'frei') parts.push('Freier Tag – das beste Fenster der Woche.');
  if (day.key === 'frei_vor_tag') parts.push('Frei, aber um 22:00 ins Bett: Einheit am Vormittag, Abend bleibt ruhig.');
  if (day.key === 'nacht') parts.push('Vormittag vor der Nachtschicht: ausgeschlafen und mit Abstand zum Vorschlaf.');
  if (day.key === 'schlaftag') parts.push('Nach dem Morgenschlaf – wie viel davon wirklich geht, entscheidet dein Check-in.');
  if (day.key === 'nacht_folge') parts.push('Kurzes Fenster zwischen Morgenschlaf und Dienst, deshalb bewusst leicht.');

  if (slot === 'long') parts.push('Der Longrun braucht Zeit und Ruhe danach, deshalb liegt er hier.');
  if (slot === 'intensiv') parts.push('Intensive Reize liegen mit größtmöglichem Abstand zum Longrun.');
  if (slot === 'kraft_a') parts.push('Schwere Beinarbeit mit mindestens einem Tag Abstand zum nächsten harten Lauf.');
  if (slot === 'kraft_b') parts.push('Oberkörper belastet die Beine nicht – darf auch nach einem Lauftag stehen.');
  if (slot === 'kraft_c') parts.push('Athletik und Sprünge stehen an einem Tag mit frischem Nervensystem.');
  if (slot === 'easy') parts.push('Lockerer Lauf als Brücke zwischen zwei Reizen.');
  return parts.join(' ');
}

/**
 * Tagesanpassung: Bereitschaft und Schlaf verändern die geplante Einheit,
 * ohne den Wochenplan umzuwerfen.
 */
export function applyDirective(entry, directive) {
  const s = entry.session;
  if (!s || s.kind === 'rest') return { session: s, changed: false, note: null };
  if (directive.volume >= 1 && directive.allowHard) return { session: s, changed: false, note: null };

  if (directive.volume === 0) {
    return {
      session: { ...mobilitySession(entry.shift.key), title: 'Regeneration statt Training' },
      changed: true,
      note: `Ursprünglich geplant: ${s.title}. Bei diesem Bereitschaftswert würde die Einheit mehr kosten als bringen.`,
    };
  }

  if (s.hard && !directive.allowHard) {
    const minutes = Math.round(s.durationMin * directive.volume);
    return {
      session: { ...easyRun(0, Math.max(20, Math.min(minutes, 50))), title: 'Locker statt hart', hard: false },
      changed: true,
      note: `Ursprünglich geplant: ${s.title}. Der harte Reiz wandert auf den nächsten Tag mit besseren Werten.`,
    };
  }

  const factor = directive.volume;
  const scaled = {
    ...s,
    durationMin: Math.round(s.durationMin * factor),
    blocks: s.blocks.map((b) => (b.minutes ? { ...b, minutes: Math.round(b.minutes * factor) } : b)),
    load: Math.round((s.load || 0) * factor),
  };
  return {
    session: scaled,
    changed: true,
    note: `Umfang auf ${Math.round(factor * 100)} % gekürzt – Struktur und Zielzonen bleiben gleich.`,
  };
}

/** Akute (7 Tage) und chronische (28 Tage) Trainingslast aus dem Logbuch. */
export function loadBalance(log, isoDate) {
  const sum = (days) => {
    let total = 0;
    for (let i = 0; i < days; i += 1) {
      const d = addDays(isoDate, -i);
      total += (log[d] && log[d].load) || 0;
    }
    return total;
  };
  const acute = sum(7);
  const chronic = sum(28) / 4;
  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio: chronic > 0 ? round(acute / chronic, 2) : null,
  };
}

export { SLOT_LABEL };
