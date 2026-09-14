// Schlaffenster pro Schichttag + Routine-Empfehlungen.
// Die Zeiten stammen 1:1 aus der Vorgabe; alles andere ist daraus abgeleitet.

import { minutes, hhmm, durationLabel } from './util.js';

/**
 * Ein Schlafblock: { label, from, to, crossesMidnight, durationMin, kind }
 * kind: 'haupt' | 'morgen' | 'vorschlaf'
 */
function block(label, from, to, kind) {
  const f = minutes(from);
  const t = minutes(to);
  const dur = t > f ? t - f : 1440 - f + t;
  return { label, from, to, kind, durationMin: dur, crossesMidnight: t <= f };
}

/** Schlafplan für einen Tagtyp. Enthält alle Blöcke, die diesen Tag prägen. */
export function sleepPlan(dayKey, prevKey) {
  switch (dayKey) {
    case 'tag':
      return {
        wake: '05:30',
        bed: '23:30',
        blocks: [block('Hauptschlaf', '23:30', '05:30', 'haupt')],
        summary: 'Aufstehen 05:30, Licht aus 23:30.',
      };
    case 'nacht':
      return {
        wake: '08:00',
        bed: '08:00',
        blocks: [
          block('Vorschlaf', '15:00', '17:30', 'vorschlaf'),
          block('Schlaf nach der Schicht', '08:00', '14:00', 'morgen'),
        ],
        summary: 'Aufstehen wie im Frei (08:00), Vorschlaf 15:00–17:30, nach der Schicht ab 08:00 ins Bett.',
      };
    case 'nacht_folge':
      return {
        wake: '14:00',
        bed: '08:00',
        blocks: [
          block('Morgenschlaf', '08:00', '14:00', 'morgen'),
          block('Kurzer Vorschlaf (optional)', '16:30', '17:30', 'vorschlaf'),
        ],
        summary: 'Morgenschlaf 08:00–14:00, danach optional 60 min Nickerchen vor der nächsten Nacht.',
      };
    case 'schlaftag':
      return {
        wake: '14:00',
        bed: '00:00',
        blocks: [
          block('Morgenschlaf', '08:00', '14:00', 'morgen'),
          block('Nachtschlaf', '00:00', '08:00', 'haupt'),
        ],
        summary: 'Schlaf 08:00–14:00, abends um 00:00 wieder ins Bett.',
      };
    case 'frei_vor_tag':
      return {
        wake: '08:00',
        bed: '22:00',
        blocks: [block('Hauptschlaf', '22:00', '05:30', 'haupt')],
        summary: 'Aufstehen 08:00, wegen der kommenden Tagschicht schon um 22:00 ins Bett.',
      };
    default:
      return {
        wake: '08:00',
        bed: '23:30',
        blocks: [block('Hauptschlaf', '23:30', '08:00', 'haupt')],
        summary: 'Aufstehen 08:00, Licht aus 23:30.',
      };
  }
}

/** Soll-Schlafmenge des Tages in Stunden (Summe der Hauptblöcke). */
export function sleepTargetHours(dayKey) {
  const plan = sleepPlan(dayKey);
  const total = plan.blocks
    .filter((b) => b.kind !== 'vorschlaf')
    .reduce((a, b) => a + b.durationMin, 0);
  return Math.round((total / 60) * 10) / 10;
}

/** Koffein-Stopp: 8 h vor dem nächsten längeren Schlafblock. */
export function caffeineCutoff(dayKey) {
  const plan = sleepPlan(dayKey);
  const main = plan.blocks.find((b) => b.kind !== 'vorschlaf') || plan.blocks[0];
  return hhmm(minutes(main.from) - 8 * 60);
}

/** Letzte große Mahlzeit: 3 h vor dem Hauptschlaf. */
export function lastMealCutoff(dayKey) {
  const plan = sleepPlan(dayKey);
  const main = plan.blocks.find((b) => b.kind !== 'vorschlaf') || plan.blocks[0];
  return hhmm(minutes(main.from) - 3 * 60);
}

/** Bildschirm/helles Licht aus: 60 min vor dem Hauptschlaf. */
export function screensOff(dayKey) {
  const plan = sleepPlan(dayKey);
  const main = plan.blocks.find((b) => b.kind !== 'vorschlaf') || plan.blocks[0];
  return hhmm(minutes(main.from) - 60);
}

/**
 * Morgenroutine: was direkt nach dem Aufstehen den Rhythmus stabilisiert.
 * Bewusst kurz gehalten – drei bis fünf Punkte, die wirklich zählen.
 */
export function morningRoutine(dayKey) {
  const base = [
    { time: '+0 min', text: 'Sofort 400–500 ml Wasser mit einer Prise Salz.' },
    { time: '+10 min', text: '10–20 min Tageslicht ins Auge – draußen, ohne Sonnenbrille.' },
  ];
  switch (dayKey) {
    case 'tag':
      return [
        { time: '05:30', text: 'Wecker nicht snoozen – bei 05:30 direkt aufstehen, sonst kippt der ganze Tag.' },
        ...base,
        { time: '05:45', text: '5 min Mobility: Hüfte, Brustwirbelsäule, Sprunggelenk. Wach werden statt aufwärmen.' },
        { time: '06:00', text: 'Koffein erst 60–90 min nach dem Aufstehen, dafür wirkt es länger.' },
      ];
    case 'nacht':
      return [
        { time: '08:00', text: 'Normal aufstehen wie im Frei – nicht ausschlafen, sonst klappt der Vorschlaf nicht.' },
        ...base,
        { time: '09:00', text: 'Training ins Vormittagsfenster legen, mindestens 4 h vor dem Vorschlaf.' },
        { time: '14:30', text: 'Raum abdunkeln, kühl stellen, Handy weg – Vorschlaf ab 15:00.' },
      ];
    case 'nacht_folge':
      return [
        { time: '14:00', text: 'Nach dem Morgenschlaf direkt raus ins Tageslicht, sonst bleibt der Kopf zäh.' },
        ...base,
        { time: '14:30', text: 'Richtige Mahlzeit statt Snack – die Nacht ist lang.' },
      ];
    case 'schlaftag':
      return [
        { time: '14:00', text: 'Aufstehen, auch wenn es schwerfällt. Länger schlafen verschiebt die Nacht.' },
        ...base,
        { time: '14:30', text: '20–30 min zügig draußen gehen – das ist der stärkste Reset für den Rhythmus.' },
        { time: '15:00', text: 'Kein Koffein mehr ab jetzt, du gehst um 00:00 ins Bett.' },
      ];
    default:
      return [
        { time: '08:00', text: 'Feste Aufstehzeit halten, auch im Frei. Der Anker für den ganzen Zyklus.' },
        ...base,
        { time: '08:30', text: 'Proteinreiches Frühstück, 30–40 g – stützt die Regeneration vom Vortag.' },
      ];
  }
}

/** Abendroutine, rückwärts vom Hauptschlaf gerechnet. */
export function eveningRoutine(dayKey) {
  const plan = sleepPlan(dayKey);
  const main = plan.blocks.find((b) => b.kind !== 'vorschlaf') || plan.blocks[0];
  const bed = minutes(main.from);
  const at = (offset) => hhmm(bed + offset);

  if (dayKey === 'nacht' || dayKey === 'nacht_folge') {
    return [
      { time: '05:30', text: 'Letzte Stunden der Schicht: Licht dimmen wo möglich, kein Koffein mehr seit 00:00.' },
      { time: '07:00', text: 'Heimweg mit Sonnenbrille – Morgenlicht würde dich wach schalten.' },
      { time: '07:30', text: 'Leichte Mahlzeit, nichts Schweres. Danach warm duschen.' },
      { time: '08:00', text: 'Raum komplett dunkel, 17–19 °C, Ohrstöpsel. Handy außer Reichweite.' },
    ];
  }

  return [
    { time: caffeineCutoff(dayKey), text: 'Ab hier kein Koffein mehr – acht Stunden vor dem Hauptschlaf.' },
    { time: at(-180), text: 'Letzte große Mahlzeit – danach höchstens etwas Leichtes.' },
    { time: at(-90), text: 'Licht im Wohnraum runter, warme Farbtemperatur.' },
    { time: at(-60), text: 'Bildschirme aus. Lesen, Dehnen oder Atemübung 4-7-8.' },
    { time: at(-20), text: 'Schlafzimmer kühl und dunkel, Tagesabschluss in zwei Sätzen notieren.' },
    { time: at(0), text: 'Licht aus.' },
  ];
}

export { durationLabel };
