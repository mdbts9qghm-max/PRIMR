// Schlafmodell. Jeder Tagtyp hat genau zwei feste Zeiten: wann aufgestanden
// wird und wann es ins Bett geht. Alles andere ergibt sich daraus – vor allem
// die entscheidende Unterscheidung:
//
//   "Schlaf davor"  = die Nacht, die heute früh geendet hat. Das ist der Wert,
//                     den WHOOP beim Check-in zeigt, und der Maßstab für die
//                     Bereitschaft von heute.
//   "Schlaf danach" = das Fenster, das heute Abend beginnt.
//
// Beispiel Ü-Tag: WHOOP meldet die sechs Stunden von 08:00 bis 14:00 – nicht
// die acht Stunden, die abends ab 00:00 noch folgen.

import { minutes, hhmm, durationLabel, round } from './util.js';

/** Bettzeiten vor Mittag liegen am Folgetag (00:00 bzw. 08:00 nach der Nacht). */
const NEXT_DAY_BED = 12 * 60;

export const DAY_SLEEP = {
  tag: {
    wake: '05:30',
    bed: '23:30',
    naps: [],
  },
  nacht: {
    wake: '08:00',
    bed: '08:00', // am Morgen danach
    naps: [{ label: 'Vorschlaf', from: '15:00', to: '17:30' }],
  },
  nacht_folge: {
    wake: '14:00',
    bed: '08:00',
    naps: [{ label: 'Kurzer Vorschlaf (optional)', from: '16:30', to: '17:30' }],
  },
  schlaftag: {
    wake: '14:00',
    bed: '00:00',
    naps: [],
  },
  frei_vor_tag: {
    wake: '08:00',
    bed: '22:00',
    naps: [],
  },
  frei: {
    wake: '08:00',
    bed: '23:30',
    naps: [],
  },
  // Krank: kein Wecker, früher ins Bett, Mittagsschlaf erwünscht. Schlaf ist
  // beim Infekt die wirksamste Maßnahme, die es gibt.
  krank: {
    wake: '08:00',
    bed: '22:00',
    naps: [{ label: 'Mittagsschlaf', from: '13:00', to: '14:30' }],
  },
};

function bedOffsetDays(dayKey) {
  return minutes(DAY_SLEEP[dayKey].bed) < NEXT_DAY_BED ? 1 : 0;
}

/** Minuten seit Mitternacht des Bezugstags – auch über Tagesgrenzen hinweg. */
function bedAbsolute(dayKey, dayOffset = 0) {
  return (dayOffset + bedOffsetDays(dayKey)) * 1440 + minutes(DAY_SLEEP[dayKey].bed);
}

function wakeAbsolute(dayKey, dayOffset = 0) {
  return dayOffset * 1440 + minutes(DAY_SLEEP[dayKey].wake);
}

function span(fromAbs, toAbs) {
  const dur = toAbs - fromAbs;
  return dur > 0 ? dur : 0;
}

/**
 * Schlafplan eines Tages. prevKey und nextKey bestimmen, wie lang die Nacht
 * davor und die Nacht danach wirklich sind.
 */
export function sleepPlan(dayKey, prevKey = null, nextKey = null) {
  const self = DAY_SLEEP[dayKey];
  const prev = prevKey || fallbackPrev(dayKey);
  const next = nextKey || fallbackNext(dayKey);

  const before = {
    label: dayKey === 'schlaftag' || dayKey === 'nacht_folge' ? 'Schlaf nach der Nachtschicht' : 'Nacht davor',
    from: DAY_SLEEP[prev].bed,
    to: self.wake,
    durationMin: span(bedAbsolute(prev, -1), wakeAbsolute(dayKey, 0)),
  };

  const after = {
    label: dayKey === 'nacht' || dayKey === 'nacht_folge' ? 'Schlaf nach der Schicht' : 'Nacht danach',
    from: self.bed,
    to: DAY_SLEEP[next].wake,
    durationMin: span(bedAbsolute(dayKey, 0), wakeAbsolute(next, 1)),
  };

  return {
    wake: self.wake,
    bed: self.bed,
    before,
    after,
    naps: self.naps.map((n) => ({ ...n, durationMin: span(minutes(n.from), minutes(n.to)) })),
    summary: summaryFor(dayKey, before, after),
  };
}

// Für den Zyklus T · N · Ü · DF · DF: sinnvolle Nachbarn, falls keine
// übergeben werden (etwa in einer isolierten Vorschau).
function fallbackPrev(dayKey) {
  return {
    tag: 'frei_vor_tag', nacht: 'tag', nacht_folge: 'nacht',
    schlaftag: 'nacht', frei: 'schlaftag', frei_vor_tag: 'frei', krank: 'krank',
  }[dayKey];
}

function fallbackNext(dayKey) {
  return {
    tag: 'nacht', nacht: 'schlaftag', nacht_folge: 'schlaftag',
    schlaftag: 'frei', frei: 'frei_vor_tag', frei_vor_tag: 'tag', krank: 'krank',
  }[dayKey];
}

function summaryFor(dayKey, before, after) {
  const h = (b) => durationLabel(b.durationMin);
  switch (dayKey) {
    case 'tag':
      return `Aufstehen 05:30 nach ${h(before)}, abends um ${after.from} ins Bett.`;
    case 'nacht':
      return `Aufstehen 08:00 wie im Frei, Vorschlaf 15:00–17:30, nach der Schicht ab 08:00 ins Bett (${h(after)}).`;
    case 'nacht_folge':
      return `Morgenschlaf ${before.from}–${before.to} (${h(before)}), abends wieder in den Dienst.`;
    case 'schlaftag':
      return `Schlaf ${before.from}–${before.to} (${h(before)}), abends um ${after.from} wieder ins Bett (${h(after)}).`;
    case 'frei_vor_tag':
      return `Aufstehen 08:00, wegen der kommenden Tagschicht schon um ${after.from} ins Bett (${h(after)}).`;
    case 'krank':
      return `Ohne Wecker aufstehen, Mittagsschlaf 13:00–14:30, abends um ${after.from} ins Bett (${h(after)}).`;
    default:
      return `Aufstehen 08:00 nach ${h(before)}, Licht aus um ${after.from}.`;
  }
}

/**
 * Sollwert für die Bereitschaft: die Nacht, die heute früh geendet hat.
 * Genau diese Zahl meldet WHOOP beim Check-in.
 */
export function sleepTargetHours(dayKey, prevKey = null) {
  return round(sleepPlan(dayKey, prevKey).before.durationMin / 60, 1);
}

/** Koffein-Stopp: acht Stunden vor dem heutigen Schlafbeginn. */
export function caffeineCutoff(dayKey) {
  return hhmm(minutes(DAY_SLEEP[dayKey].bed) - 8 * 60);
}

/** Letzte große Mahlzeit: drei Stunden vorher. */
export function lastMealCutoff(dayKey) {
  return hhmm(minutes(DAY_SLEEP[dayKey].bed) - 3 * 60);
}

/** Bildschirme und helles Licht: eine Stunde vorher. */
export function screensOff(dayKey) {
  return hhmm(minutes(DAY_SLEEP[dayKey].bed) - 60);
}

/** Morgenroutine – die ersten Minuten entscheiden über den ganzen Tag. */
export function morningRoutine(dayKey) {
  const wake = DAY_SLEEP[dayKey].wake;
  const at = (offset) => hhmm(minutes(wake) + offset);
  const base = [
    { time: at(5), text: 'Sofort 400–500 ml Wasser mit einer Prise Salz.' },
    { time: at(15), text: '10–20 min Tageslicht ins Auge – draußen, ohne Sonnenbrille.' },
  ];

  switch (dayKey) {
    case 'tag':
      return [
        { time: wake, text: 'Nicht snoozen. Bei 05:30 direkt aufstehen, sonst kippt der ganze Tag.' },
        ...base,
        { time: at(20), text: '5 min Mobility: Hüfte, Brustwirbelsäule, Sprunggelenk. Wach werden statt aufwärmen.' },
        { time: at(60), text: 'Koffein erst jetzt – 60 bis 90 min nach dem Aufstehen wirkt es länger und kostet den Abend nicht.' },
      ];
    case 'nacht':
      return [
        { time: wake, text: 'Aufstehen wie im Frei. Nicht ausschlafen – sonst klappt der Vorschlaf um 15:00 nicht.' },
        ...base,
        { time: '09:00', text: 'Wenn Training ansteht, jetzt. Mindestens vier Stunden Abstand zum Vorschlaf.' },
        { time: '14:30', text: 'Raum abdunkeln, kühl stellen, Handy aus dem Zimmer. Vorschlaf ab 15:00.' },
      ];
    case 'nacht_folge':
      return [
        { time: wake, text: 'Nach dem Morgenschlaf direkt raus ins Tageslicht, sonst bleibt der Kopf zäh.' },
        ...base,
        { time: at(30), text: 'Richtige Mahlzeit statt Snack – die Nacht ist lang.' },
      ];
    case 'schlaftag':
      return [
        { time: wake, text: 'Aufstehen, auch wenn es schwerfällt. Länger schlafen verschiebt die Nacht um 00:00.' },
        ...base,
        { time: at(30), text: '20–30 min zügig draußen gehen. Der stärkste Reset nach einer durchwachten Nacht.' },
        { time: caffeineCutoff('schlaftag'), text: 'Ab hier kein Koffein mehr – du gehst heute um 00:00 ins Bett.' },
      ];
    case 'krank':
      return [
        { time: wake, text: 'Kein Wecker. Wach werden, wenn der Körper so weit ist – heute gibt es nichts zu verpassen.' },
        { time: at(5), text: 'Trinken, bevor du irgendetwas anderes tust. Bei Fieber 0,5 l mehr je Grad.' },
        { time: at(20), text: 'Kurz ans offene Fenster oder vor die Tür. Licht hilft dem Rhythmus, auch wenn der Rest liegen bleibt.' },
        { time: at(60), text: 'Ruhepuls und Temperatur notieren – morgen willst du wissen, ob es besser wird.' },
      ];
    default:
      return [
        { time: wake, text: 'Feste Aufstehzeit halten, auch im Frei. Der Anker für den ganzen Zyklus.' },
        ...base,
        { time: at(30), text: 'Proteinreiches Frühstück, 30–40 g – stützt die Regeneration vom Vortag.' },
      ];
  }
}

/** Abendroutine, rückwärts vom heutigen Schlafbeginn gerechnet. */
export function eveningRoutine(dayKey) {
  if (dayKey === 'nacht' || dayKey === 'nacht_folge') {
    return [
      { time: '00:00', text: 'Letztes Koffein der Schicht. Alles später frisst den Morgenschlaf.' },
      { time: '05:30', text: 'Licht dimmen wo möglich. Der Körper soll ab jetzt Richtung Schlaf kippen.' },
      { time: '07:00', text: 'Heimweg mit Sonnenbrille – Morgenlicht würde dich wach schalten.' },
      { time: '07:30', text: 'Leichte Mahlzeit, nichts Schweres. Danach warm duschen.' },
      { time: '08:00', text: 'Raum komplett dunkel, 17–19 °C, Ohrstöpsel. Handy außer Reichweite.' },
    ];
  }

  const bed = minutes(DAY_SLEEP[dayKey].bed);
  const at = (offset) => hhmm(bed + offset);
  return [
    { time: caffeineCutoff(dayKey), text: 'Ab hier kein Koffein mehr.' },
    { time: lastMealCutoff(dayKey), text: 'Letzte große Mahlzeit – danach höchstens etwas Leichtes.' },
    { time: at(-90), text: 'Licht im Wohnraum runter, warme Farbtemperatur.' },
    { time: screensOff(dayKey), text: 'Bildschirme aus. Lesen, Dehnen oder Atemübung 4-7-8.' },
    { time: at(-20), text: 'Schlafzimmer kühl und dunkel, Tagesabschluss in zwei Sätzen notieren.' },
    { time: at(0), text: 'Licht aus.' },
  ];
}

export { durationLabel };
