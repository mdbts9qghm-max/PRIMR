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
import { shiftDay, trainingWindow, dutyMinutes, rawFor } from './shift.js';
import {
  easyRun, strengthSession, mobilitySession, restDay, sickDay,
  hillSession, downhillSession, timeOnFeet, backToBack, raceSession, HARD_SLOTS,
} from './library.js';
import {
  DEFAULT_RACE, weeksUntil, phaseFor, vertTarget, volumeFactor, features, racePlan,
  weeklyMinutes, longShare, isRaceDay,
} from './race.js';

// long_b ist der zweite lange Tag in Folge. Er existiert nur in der
// spezifischen Phase und nur direkt nach dem Longrun.
export const SLOTS = ['long', 'long_b', 'intensiv', 'kraft_a', 'easy', 'kraft_b', 'kraft_c'];

const SLOT_LABEL = {
  long: 'Longrun',
  long_b: 'Zweiter langer Tag',
  intensiv: 'Intensive Laufeinheit',
  easy: 'Lockerer Lauf',
  kraft_a: 'Kraft A (Beine schwer)',
  kraft_b: 'Kraft B (Oberkörper)',
  kraft_c: 'Kraft C (Athletik)',
};

// Wie gut passt eine Einheit zu einem Schichttag. -1 bedeutet unmöglich.
// -1 bedeutet: an diesem Tag unmöglich. Krank steht überall auf -1.
const FIT = {
  long: { tag: -1, nacht: 7, nacht_folge: -1, schlaftag: 4, frei_vor_tag: 8, frei: 10, krank: -1 },
  long_b: { tag: -1, nacht: 5, nacht_folge: -1, schlaftag: 4, frei_vor_tag: 7, frei: 9, krank: -1 },
  intensiv: { tag: -1, nacht: 8, nacht_folge: -1, schlaftag: 5, frei_vor_tag: 8, frei: 10, krank: -1 },
  easy: { tag: -1, nacht: 7, nacht_folge: 5, schlaftag: 7, frei_vor_tag: 7, frei: 8, krank: -1 },
  kraft_a: { tag: -1, nacht: 7, nacht_folge: -1, schlaftag: 5, frei_vor_tag: 8, frei: 10, krank: -1 },
  kraft_b: { tag: -1, nacht: 7, nacht_folge: 4, schlaftag: 7, frei_vor_tag: 8, frei: 9, krank: -1 },
  kraft_c: { tag: -1, nacht: 7, nacht_folge: 3, schlaftag: 6, frei_vor_tag: 8, frei: 9, krank: -1 },
};

export const MAX_RAMP_DAYS = 7;

/**
 * Wiedereinstieg nach einer Erkrankung.
 *
 * Nach einem Infekt sofort wieder hart zu trainieren ist der Fehler, der aus
 * drei Krankheitstagen drei verlorene Wochen macht. Die App hält deshalb für
 * jeden Krankheitstag einen Tag ohne harte Reize frei – mindestens zwei, höchstens
 * sieben – und fährt den Umfang in dieser Zeit gestaffelt wieder hoch.
 *
 * Gibt null zurück, wenn der Tag nicht in einer solchen Phase liegt.
 */
export function illnessRamp(shiftConfig, isoDate) {
  let lastSick = null;
  for (let i = 1; i <= 28; i += 1) {
    if (rawFor(shiftConfig, addDays(isoDate, -i)) === 'K') { lastSick = i; break; }
  }
  if (lastSick == null) return null;
  if (rawFor(shiftConfig, isoDate) === 'K') return null; // heute noch krank

  let length = 0;
  while (length < 28 && rawFor(shiftConfig, addDays(isoDate, -(lastSick + length))) === 'K') length += 1;

  const rampDays = clamp(length, 2, MAX_RAMP_DAYS);
  if (lastSick > rampDays) return null;

  return {
    dayIndex: lastSick,            // 1 = erster Tag nach der Erkrankung
    rampDays,
    illnessDays: length,
    remaining: rampDays - lastSick + 1,
    factor: clamp(0.45 + 0.55 * (lastSick / rampDays), 0.45, 1),
  };
}

const UNPLACED_PENALTY = {
  long: 150, long_b: 55, intensiv: 140, easy: 90, kraft_a: 120, kraft_b: 85, kraft_c: 80,
};

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
/**
 * Was dieses Wochenziel vom Rennen her betrachtet bedeutet.
 *
 * Der Plan ist auf genau ein Rennen ausgelegt; ohne Ziel gäbe es keinen
 * Maßstab für Umfang, Höhenmeter und Phase. Fehlt eines – etwa nach dem
 * Einspielen einer alten Sicherung –, greift das hinterlegte Standardrennen,
 * statt in einen allgemeinen Plan zurückzufallen.
 */
export function raceContext(settings, monday) {
  const race = settings.race && settings.race.date ? settings.race : DEFAULT_RACE;
  const weeksOut = weeksUntil(race.date, monday);
  const weeksTrained = weekIndex(settings.planStart, monday);
  const phase = phaseFor(weeksOut);
  const f = features(weeksOut);

  return {
    race,
    weeksOut,
    weeksTrained,
    phase,
    features: f,
    plan: racePlan(race),
    vertM: f.vert ? vertTarget(race, weeksOut, weeksTrained, settings.startVertM || 200) : 0,
    volumeFactor: volumeFactor(weeksOut),
    // Bergab und Doppeltage kommen im Wechsel, nicht jede Woche – sonst
    // steckt die Erholung sie nicht weg.
    downhillWeek: f.downhill && weeksOut % 2 === 0,
    backToBackWeek: f.backToBack && weeksOut % 2 === 1,
    nightWeek: f.night && weeksOut % 3 === 0,
  };
}

export function progression(w, settings, rc) {
  const start = settings.startRunMinutes || 130;
  const block = Math.floor(w / 4);
  const inBlock = w % 4;
  const weekFactor = [1, 1.1, 1.2, 0.72][inBlock];

  const base = weeklyMinutes(rc.race, start, rc.weeksOut, rc.weeksTrained);
  const weekly = Math.round(base * weekFactor * rc.volumeFactor);
  const share = longShare(rc.weeksOut, rc.backToBackWeek);

  const vert = vertBudget(rc, settings, weekly);

  return {
    week: w,
    block,
    inBlock,
    phase: rc.phase.label,
    blockPhase: ['Aufbau', 'Volumen', 'Intensität', 'Entlastung'][inBlock],
    deload: inBlock === 3,
    weeklyRunMinutes: weekly,
    longMinutes: Math.round(weekly * share),
    longBMinutes: Math.round(weekly * 0.24),
    intensivMinutes: Math.round(weekly * 0.32),
    easyMinutes: Math.round(weekly * 0.28),
    vert,
  };
}

/**
 * Obergrenze je Einheitenart.
 *
 * Eine Zahl für alles reicht nicht. Ein Longrun über vier Stunden passt in
 * keine 90-Minuten-Schranke, eine Krafteinheit soll aber auch an einem
 * freien Tag nicht ausufern.
 */
/**
 * Wiederholungen der Bergab-Einheit. Sie wächst mit der Nähe zum Rennen,
 * beginnt aber bewusst klein – der Muskelkater danach fällt beim ersten Mal
 * heftig aus. Mehr als 60 % des Wochenziels darf sie nie ausmachen.
 */
function downhillReps(rc, hill) {
  const byPhase = clamp(3 + Math.floor((24 - rc.weeksOut) / 4), 3, 10);
  // Unter drei Wiederholungen lohnt die Einheit nicht, und mehr als 60 % des
  // Wochenziels darf sie nicht ausmachen. Passt beides nicht zusammen, fällt
  // sie in dieser Woche aus.
  return byPhase * hill <= rc.vertM * 0.6 ? byPhase : 0;
}

/**
 * Höhenmeter der Woche auf die Einheiten verteilen – an genau einer Stelle.
 *
 * Verteilt man die Anteile an drei Orten, summiert sich die Woche je nach
 * Lage über oder unter das Ziel: In leichten Wochen greift keine eigene
 * Bergeinheit, in Doppeltag-Wochen kommt eine zweite lange Einheit hinzu.
 * Deshalb wird hier zuerst abgezogen, was feststeht, und der Rest verteilt.
 */
export function vertBudget(rc, settings, weeklyRunMinutes) {
  const empty = {
    long: 0, longB: 0, hills: 0, easy: 0, downhill: 0, total: 0,
  };
  if (!rc || !rc.features.vert || !rc.vertM) return empty;

  const hill = settings.hillMeters || 120;
  // Die Bergab-Einheit braucht eine Grundlage. Wird sie nicht gebaut, darf
  // sie auch keine Höhenmeter binden – sonst bleibt die Woche unter Ziel.
  const canDownhill = rc.downhillWeek && weeklyRunMinutes >= 180;
  const downhill = canDownhill ? downhillReps(rc, hill) * hill : 0;
  let rest = Math.max(0, rc.vertM - downhill);

  // Die Bergeinheit bekommt immer ihren Anteil – sie ist die einzige harte
  // Einheit im Plan und findet ausnahmslos am Anstieg statt. Reicht der
  // Anteil nicht für Wiederholungen, wird daraus ein Berg-Dauerlauf; die
  // Höhenmeter bleiben dieselben und die Woche trifft ihr Ziel.
  const hills = Math.round(rest * 0.45);
  rest -= hills;

  const easy = downhill ? 0 : Math.round(rest * 0.2);
  rest -= easy;

  const longB = rc.backToBackWeek ? Math.round(rest * 0.35) : 0;
  const long = rest - longB;

  return {
    long, longB, hills, easy, downhill, total: long + longB + hills + easy + downhill,
  };
}

export function capFor(slot, settings, rc, base) {
  // Nach dem Rennen bleibt alles kurz, egal welche Einheit.
  if (rc.features.recovery) return Math.min(base, 60 + Math.max(0, 3 + rc.weeksOut) * 15);
  if (slot.startsWith('kraft')) return base;
  if (slot === 'long' || slot === 'long_b') return settings.longSessionMinutes || 360;
  return Math.max(base, 150); // Berg- und Bergab-Einheiten brauchen mehr Luft
}

function buildSession(slot, w, prog, settings, minutesFree, rc) {
  const hill = settings.hillMeters || 120;

  switch (slot) {
    case 'long':
      // Immer dieselbe Einheit, nur länger: Sie wächst über die Vorbereitung
      // von unter einer Stunde auf über vier.
      return timeOnFeet(
        clamp(prog.longMinutes, 30, minutesFree),
        prog.vert.long,
        rc.plan,
        { night: rc.nightWeek },
      );
    case 'long_b':
      if (!rc.backToBackWeek || prog.longMinutes < 120) return null;
      return backToBack(clamp(prog.longBMinutes, 40, minutesFree), prog.vert.longB, rc.plan);
    case 'intensiv':
      // Alles Harte findet am Anstieg statt. Reicht das Höhenmeter-Budget
      // nicht für Wiederholungen, wird daraus ein Berg-Dauerlauf.
      if (!prog.vert.hills) return null;
      return hillSession(
        w,
        prog.vert.hills,
        hill,
        Math.min(prog.intensivMinutes + 30, minutesFree),
      );
    case 'easy':
      if (prog.vert.downhill > 0) {
        return downhillSession(Math.round(prog.vert.downhill / hill), hill);
      }
      return easyRun(w, clamp(prog.easyMinutes, 20, minutesFree), settings.easyPace, prog.vert.easy);
    default:
      return strengthSession(slot, w, minutesFree);
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
      // Longrun und zweiter langer Tag gehören ausdrücklich hintereinander –
      // das ist der Zweck der Übung und keine Regelverletzung.
      const backToBackPair = byDay[i - 1].includes('long') && byDay[i].includes('long_b');
      if (hardDay[i - 1] && hardDay[i] && !backToBackPair) score -= 70;
      if (runDay[i - 1] && runDay[i] && !backToBackPair) score -= 12;
      if (i >= 2 && busy[i - 2] && busy[i - 1] && busy[i] && !backToBackPair) score -= 6;
    }

    // Der zweite lange Tag ergibt nur direkt nach dem Longrun einen Sinn.
    const bi = byDay.findIndex((slots) => slots.includes('long_b'));
    if (bi >= 0) {
      if (bi === 0 || !byDay[bi - 1].includes('long')) score -= 500;
      else score += 25;
    }

    // Longrun möglichst weit weg von der intensiven Einheit.
    const li = byDay.findIndex((s) => s.includes('long'));
    const ii = byDay.findIndex((s) => s.includes('intensiv'));
    if (li >= 0 && ii >= 0) score += Math.min(3, Math.abs(li - ii)) * 6;

    // Harte Einheit direkt vor der ersten Nacht eines Blocks kostet etwas.
    byDay.forEach((slots, i) => {
      if (slots.some((s) => HARD_SLOTS.includes(s)) && days[i].key === 'nacht') score -= 8;
      // Sehr lange Einheiten gehören an freie Tage. Drei Stunden laufen und
      // danach zwölf Stunden Dienst geht auf Dauer nicht gut.
      slots.forEach((slot) => {
        const session = candidates[i][slot];
        if (session && session.durationMin > 150 && !DOUBLE_OK.includes(days[i].key)) score -= 45;
      });
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
  const rc = raceContext(settings, monday);
  const prog = progression(w, settings, rc);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    const sd = shiftDay(shiftConfig, date);
    const win = trainingWindow(sd.key);
    days.push({
      date,
      key: sd.key,
      shift: sd,
      window: win,
      ramp: illnessRamp(shiftConfig, date),
      isRace: Boolean(rc) && isRaceDay(rc.race, date),
      afterRace: Boolean(rc) && rc.weeksOut === 0 && date > rc.race.date,
    });
  }

  // Vorab für jeden Tag prüfen, welche Einheit zeitlich überhaupt hineinpasst.
  // Laufen startet an der Haustür, Krafttraining kostet zusätzlich die Fahrt
  // zum Gym und zurück.
  const travel = (settings.gymTravelMinutes || 0) * 2;
  const candidates = days.map((d) => {
    const cap = settings.sessionMinutes || 90;
    const out = {};
    // Am Renntag selbst und danach wird nichts geplant.
    if (d.isRace || d.afterRace) return out;

    SLOTS.forEach((slot) => {
      if (FIT[slot][d.key] < 0) return;
      if (rc && rc.features.raceWeek && slot !== 'easy') return;
      // In der Regeneration nach dem Rennen bleibt alles locker.
      if (rc && rc.features.recovery && HARD_SLOTS.includes(slot)) return;
      // In der ersten Woche nach dem Rennen gar keine Krafteinheit.
      if (rc && rc.features.recovery && rc.weeksOut === 0 && slot.startsWith('kraft')) return;
      // Im Wiedereinstieg nach einer Erkrankung fallen harte Reize ganz weg
      // und der Umfang wird gestaffelt zurückgenommen.
      if (d.ramp && HARD_SLOTS.includes(slot)) return;
      const slotCap = capFor(slot, settings, rc, cap);
      const limit = d.ramp ? Math.round(slotCap * d.ramp.factor) : slotCap;
      const room = Math.min(d.window.minutesFree - (slot.startsWith('kraft') ? travel : 0), limit);
      if (room < 30) return;
      const session = buildSession(slot, w, prog, settings, room, rc);
      if (session && session.durationMin <= room + 10) out[slot] = session;
    });
    return out;
  });

  const { byDay } = assign(days, candidates);

  const plan = days.map((d, i) => {
    const slots = byDay[i];
    let session;
    let extra = null;
    if (d.isRace) {
      session = raceSession(rc.race, rc.plan);
    } else if (d.key === 'krank') {
      session = sickDay();
    } else if (slots.length) {
      session = candidates[i][slots[0]];
      if (slots.length > 1) extra = candidates[i][slots[1]];
    } else if (d.afterRace) {
      session = restDay('Nach dem Rennen – gehen statt laufen');
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
      ramp: d.ramp,
      why: explain(slots[0], d, days, byDay),
      dutyLoad: Math.round(dutyMinutes(d.key) * (d.key === 'tag' ? 0.08 : 0.1)),
    };
  });

  const all = plan.flatMap((p) => [p.session, p.extra].filter(Boolean));
  const placed = byDay.flat();
  // long_b ist ein Angebot, kein Soll – es fehlt nicht, wenn es die Woche
  // gar nicht vorsieht.
  const expected = rc && (rc.features.raceWeek || rc.features.recovery)
    ? []
    : SLOTS.filter((slot) => slot !== 'long_b' || (rc && rc.backToBackWeek));

  return {
    monday,
    weekIndex: w,
    progression: prog,
    race: rc,
    days: plan,
    plannedLoad: all.reduce((a, s) => a + (s.load || 0), 0),
    plannedVert: all.reduce((a, s) => a + (s.vertM || 0), 0),
    runs: all.filter((s) => s.kind === 'run').length,
    strength: all.filter((s) => s.kind === 'strength').length,
    missing: expected.filter((s) => !placed.includes(s)).map((s) => SLOT_LABEL[s]),
  };
}

function explain(slot, day, days, byDay) {
  if (day.isRace) return 'Renntag. Neun Monate Vorbereitung laufen heute zusammen.';
  if (day.afterRace) return 'Nach dem Rennen. Spazieren ja, laufen nein – die Muskulatur braucht jetzt Wochen, nicht Tage.';
  if (day.key === 'krank') {
    return 'Krank gemeldet. Es wird nicht trainiert, sondern auskuriert – und danach vorsichtig wieder eingestiegen.';
  }
  if (!slot) {
    if (day.ramp) {
      return `Wiedereinstieg nach der Erkrankung, Tag ${day.ramp.dayIndex} von ${day.ramp.rampDays}. Ruhetag, weil der Körper die Erholung gerade noch woanders braucht.`;
    }
    if (day.key === 'tag') return 'Tagschicht: 12 Stunden Dienst plus Anfahrt. Nur Mobility, alles andere geht auf die Erholung.';
    if (day.key === 'nacht_folge') return 'Zweite Nacht in Folge – der Morgenschlaf ersetzt keine Nacht. Ruhetag schützt die harten Einheiten der Woche.';
    return 'Bewusster Ruhetag: Er hält den Abstand zwischen den harten Reizen groß genug.';
  }
  const parts = [];
  if (day.ramp) {
    parts.push(`Wiedereinstieg nach der Erkrankung, Tag ${day.ramp.dayIndex} von ${day.ramp.rampDays}: nichts Hartes, Umfang auf ${Math.round(day.ramp.factor * 100)} %.`);
  }
  if (day.key === 'frei') parts.push('Freier Tag – das beste Fenster der Woche.');
  if (day.key === 'frei_vor_tag') parts.push('Frei, aber um 22:00 ins Bett: Einheit am Vormittag, Abend bleibt ruhig.');
  if (day.key === 'nacht') parts.push('Vormittag vor der Nachtschicht: ausgeschlafen und mit Abstand zum Vorschlaf.');
  if (day.key === 'schlaftag') parts.push('Nach dem Morgenschlaf – wie viel davon wirklich geht, entscheidet dein Check-in.');
  if (day.key === 'nacht_folge') parts.push('Kurzes Fenster zwischen Morgenschlaf und Dienst, deshalb bewusst leicht.');

  if (slot === 'long') parts.push('Der Longrun braucht Zeit und Ruhe danach, deshalb liegt er hier.');
  if (slot === 'long_b') parts.push('Direkt nach dem Longrun: Genau die müden Beine sind der Trainingsreiz.');
  if (slot === 'intensiv') parts.push('Intensive Reize liegen mit größtmöglichem Abstand zum Longrun.');
  if (slot === 'kraft_a') parts.push('Der Beintag liegt mit mindestens einem Tag Abstand zum nächsten harten Lauf.');
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
  // Ruhetage und Krankheitstage werden nicht nachjustiert – da gibt es nichts
  // zu kürzen oder zu ersetzen.
  if (!s || s.kind === 'rest' || s.kind === 'sick') return { session: s, changed: false, note: null };
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

/**
 * Akute (7 Tage) und chronische (28 Tage) Trainingslast aus dem Logbuch.
 *
 * Das Verhältnis der beiden ist erst aussagekräftig, wenn genug Wochen im
 * Logbuch stehen. In den ersten Tagen ergäbe es absurde Werte – eine einzige
 * Einheit stünde gegen einen Schnitt aus fast lauter Nullen. Deshalb meldet
 * die Funktion so lange `ratio: null` und nennt die Zahl der erfassten Tage.
 */
const RATIO_MIN_DAYS = 12;

export function loadBalance(log, isoDate) {
  let acute = 0;
  let chronic = 0;
  let days = 0;
  let firstEntryAgo = null;

  for (let i = 0; i < 28; i += 1) {
    const d = addDays(isoDate, -i);
    const entry = log[d];
    const value = (entry && entry.load) || 0;
    chronic += value;
    if (i < 7) acute += value;
    if (entry) {
      days += 1;
      firstEntryAgo = i;
    }
  }
  chronic /= 4;

  const reliable = firstEntryAgo != null && firstEntryAgo + 1 >= RATIO_MIN_DAYS && chronic > 0;
  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    days,
    trackedDays: firstEntryAgo == null ? 0 : firstEntryAgo + 1,
    minDays: RATIO_MIN_DAYS,
    ratio: reliable ? round(acute / chronic, 2) : null,
  };
}

export { SLOT_LABEL };
