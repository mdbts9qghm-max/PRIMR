// Zielrennen: Periodisierung, Höhenmeter, Renn- und Verpflegungsplan.
//
// Der Coach ist auf genau ein Rennen ausgelegt und rechnet vom Renntag
// rückwärts: Je näher der Termin, desto spezifischer wird das Training, und
// die letzten Wochen nehmen den Umfang gezielt zurück. Distanz, Höhenmeter
// und Zeitlimit des Rennens bestimmen Umfang, Steigrate und Inhalte – einen
// zielfreien Plan gibt es nicht.

import { weekStart, daysBetween, addDays, clamp, round } from './util.js';

export const DEFAULT_RACE = {
  name: 'Zugspitz Ultratrail',
  category: '100K / M',
  date: '2027-06-18',
  startTime: '23:00',
  startPlace: 'Ehrwald',
  distanceKm: 86,
  vertM: 4295,
  limitHours: 22,
};

/**
 * Wochen bis zur Rennwoche. 0 = Rennwoche, negativ = das Rennen ist vorbei.
 */
export function weeksUntil(raceDate, isoDate) {
  return Math.round(daysBetween(weekStart(isoDate), weekStart(raceDate)) / 7);
}

/**
 * Phasen, von hinten gezählt. `from` ist die Zahl der Wochen bis zum Rennen,
 * ab der die Phase gilt.
 */
export const PHASES = [
  {
    key: 'grundlage',
    from: 53,
    label: 'Grundlage',
    focus: 'Wochenumfang aufbauen, Sehnen und Gelenke an das Laufen gewöhnen',
    detail: 'In dieser Phase entscheidet sich, wie viel Training du später verträgst. Höhenmeter kommen langsam dazu, alles andere bleibt locker.',
  },
  {
    key: 'aufbau',
    from: 25,
    label: 'Aufbau',
    focus: 'Höhenmeter systematisch steigern, lange Einheiten verlängern',
    detail: 'Jetzt wird aus dem Läufer ein Bergläufer. Die langen Einheiten wachsen in Stunden, nicht in Kilometern, und Power-Hiking wird geübt wie eine eigene Disziplin.',
  },
  {
    key: 'spezifisch',
    from: 4,
    label: 'Spezifisch',
    focus: 'Rennsimulation: Bergab-Toleranz, Nacht, Verpflegung, Doppeltage',
    detail: 'Alles, was im Rennen vorkommt, wird vorher geprobt – bei Dunkelheit, mit der echten Verpflegung, auf müden Beinen.',
  },
  {
    key: 'taper',
    from: 1,
    label: 'Taper',
    focus: 'Umfang zurücknehmen, Spannung halten',
    detail: 'Der Umfang fällt deutlich, die Intensität bleibt kurz erhalten. Hier wird nichts mehr aufgebaut – hier wird geerntet.',
  },
  {
    key: 'rennwoche',
    from: 0,
    label: 'Rennwoche',
    focus: 'Ankommen, schlafen, essen',
    detail: 'Diese Woche gehört dem Rennen. Kurze lockere Läufe, Beine hochlegen, Schlaf nachholen – der Start ist um 23:00, dafür brauchst du einen Schlafvorrat.',
  },
  {
    key: 'regeneration',
    from: -4,
    label: 'Regeneration',
    focus: 'Erholen, nichts erzwingen',
    detail: 'Nach einem 86-km-Berglauf braucht der Körper Wochen, nicht Tage. Erst Spaziergänge, dann lockeres Laufen, Struktur kommt später zurück.',
  },
];

export function phaseFor(weeksOut) {
  return PHASES.find((p) => weeksOut >= p.from) || PHASES[PHASES.length - 1];
}

// Mehr als zehn Prozent Zuwachs pro Woche verträgt kein Bewegungsapparat
// über Monate – unabhängig davon, was der Kalender verlangt.
export const MAX_WEEKLY_GROWTH = 1.10;

/**
 * Höhenmeter-Ziel der Woche.
 *
 * Als Zielgröße dient rund 55 % der Renn-Höhenmeter in der stärksten Woche –
 * mehr braucht es nicht, und mehr verträgt niemand über Monate. Von dort wird
 * linear zurückgerechnet, mit einem sehr flachen Einstieg in der Grundlage.
 */
export function phaseVert(race, weeksOut) {
  const peak = Math.round((race.vertM * 0.55) / 50) * 50;
  const phase = phaseFor(weeksOut);

  switch (phase.key) {
    case 'grundlage': {
      // Von 200 m sanft auf etwa ein Drittel des Ziels.
      const total = Math.max(1, weeksOut - 52);
      const progress = clamp(1 - total / 40, 0, 1);
      return Math.round((200 + (peak * 0.33 - 200) * progress) / 50) * 50;
    }
    case 'aufbau': {
      const progress = clamp(1 - (weeksOut - 24) / 28, 0, 1);
      return Math.round((peak * 0.33 + (peak * 0.75 - peak * 0.33) * progress) / 50) * 50;
    }
    case 'spezifisch': {
      const progress = clamp(1 - (weeksOut - 3) / 21, 0, 1);
      return Math.round((peak * 0.75 + (peak - peak * 0.75) * progress) / 50) * 50;
    }
    case 'taper':
      return Math.round((peak * [0.2, 0.35, 0.55][clamp(weeksOut - 1, 0, 2)]) / 50) * 50;
    case 'rennwoche':
      return 150;
    default:
      return 0;
  }
}

/**
 * Was der Kalender verlangt, ist das eine – was der Körper bis dahin
 * aufgebaut hat, das andere. Die Vorgabe ist immer das Kleinere von beidem.
 *
 * weeksTrained zählt die Wochen seit Planstart. So beginnt der Aufbau bei
 * dem, was du heute kannst, und nicht bei dem, was die Phase vorsieht.
 */
export function vertTarget(race, weeksOut, weeksTrained = 0, startVert = 200) {
  const phase = phaseVert(race, weeksOut);
  const ramp = startVert * MAX_WEEKLY_GROWTH ** Math.max(0, weeksTrained);
  const p = phaseFor(weeksOut);
  if (['taper', 'rennwoche', 'regeneration'].includes(p.key)) return phase;
  return Math.round(Math.min(phase, ramp) / 50) * 50;
}

/**
 * Umfangsplanung mit Ziel.
 *
 * Als Spitzenwoche dient rund ein Drittel der erwarteten Rennzeit – die
 * gängige Faustregel für lange Ultras. Von dort wird zurückgerechnet, wie
 * stark der Umfang je Woche wachsen müsste, und geprüft, ob das im
 * verbleibenden Zeitraum überhaupt vertretbar ist.
 */
export function volumePlan(race, startMinutes, weeksOut) {
  const plan = racePlan(race);
  // Rund die Hälfte der erwarteten Rennzeit als stärkste Trainingswoche.
  // Ein Drittel reicht für einen Marathon, nicht für 86 km mit 4295 hm.
  const peak = Math.round((plan.targetHours * 60 * 0.5) / 5) * 5;
  const weeksToPeak = Math.max(8, weeksOut - 4);
  const required = (peak / startMinutes) ** (1 / weeksToPeak);
  const growth = Math.min(required, MAX_WEEKLY_GROWTH);
  const reachable = Math.round(startMinutes * growth ** weeksToPeak);

  return {
    peakMinutes: peak,
    weeksToPeak,
    growthPerWeek: round((growth - 1) * 100, 1),
    reachablePeak: Math.min(reachable, peak),
    reachesPeak: reachable >= peak * 0.95,
    // Fehlt Zeit, sagt die App das offen, statt die Steigerung zu überdrehen.
    shortfallPct: reachable >= peak ? 0 : Math.round((1 - reachable / peak) * 100),
  };
}

/** Wochenumfang in Minuten für eine bestimmte Woche des Plans. */
export function weeklyMinutes(race, startMinutes, weeksOut, weeksTrained) {
  const vp = volumePlan(race, startMinutes, weeksOut + weeksTrained);
  const factor = (1 + vp.growthPerWeek / 100) ** Math.max(0, weeksTrained);
  return Math.round(Math.min(vp.peakMinutes, startMinutes * factor));
}

/**
 * Anteil der langen Einheit am Wochenumfang. Er wächst mit der Nähe zum
 * Rennen: In der Grundlage zählt die Häufigkeit, später die Einzeldauer.
 */
export function longShare(weeksOut, backToBackWeek) {
  const phase = phaseFor(weeksOut);
  if (phase.key === 'spezifisch') return backToBackWeek ? 0.38 : 0.45;
  if (phase.key === 'aufbau') return 0.4;
  return 0.35;
}

/** Umfangsfaktor der Phase – greift auf die Laufminuten der Woche. */
export function volumeFactor(weeksOut) {
  const phase = phaseFor(weeksOut);
  if (phase.key === 'taper') return [0.4, 0.55, 0.75][clamp(weeksOut - 1, 0, 2)];
  if (phase.key === 'rennwoche') return 0.3;
  if (phase.key === 'regeneration') return [0.2, 0.25, 0.35, 0.45][clamp(-weeksOut, 0, 3)];
  return 1;
}

/**
 * Welche rennspezifischen Inhalte in dieser Woche vorkommen dürfen.
 */
export function features(weeksOut) {
  const phase = phaseFor(weeksOut);
  return {
    vert: ['grundlage', 'aufbau', 'spezifisch', 'taper'].includes(phase.key),
    // Bergab-Toleranz braucht Vorlauf: zu früh angefangen kostet sie mehr
    // Erholung, als sie in der Grundlage bringt.
    downhill: ['aufbau', 'spezifisch'].includes(phase.key),
    timeOnFeet: ['aufbau', 'spezifisch'].includes(phase.key),
    nutrition: ['aufbau', 'spezifisch', 'taper'].includes(phase.key),
    backToBack: phase.key === 'spezifisch',
    night: phase.key === 'spezifisch',
    taper: phase.key === 'taper',
    raceWeek: phase.key === 'rennwoche',
    recovery: phase.key === 'regeneration',
  };
}

/**
 * Renn- und Zeitplan. Flachäquivalent: Je 100 Höhenmeter wird ein Kilometer
 * aufgeschlagen – eine grobe, aber im Gelände erstaunlich brauchbare Regel.
 */
export function racePlan(race) {
  const flatEquivalent = race.distanceKm + race.vertM / 100;
  const limitPace = (race.limitHours * 60) / flatEquivalent;
  const targetHours = round(race.limitHours * 0.88, 1);
  const targetPace = (targetHours * 60) / flatEquivalent;

  return {
    flatEquivalent: Math.round(flatEquivalent),
    limitPace: round(limitPace, 1),
    targetHours,
    targetPace: round(targetPace, 1),
    avgSpeed: round(race.distanceKm / race.limitHours, 1),
    descentM: race.vertM,
    // Der Start um 23:00 heißt: die ersten Stunden komplett im Dunkeln.
    darkHours: 6.5,
    carbsPerHour: [60, 90],
    fluidPerHour: [500, 750],
    sodiumPerHour: [400, 700],
    carbsTotal: [Math.round(targetHours * 60), Math.round(targetHours * 90)],
  };
}

/**
 * Zielverteilung der Intensität.
 *
 * Ein Rennen über 19 Stunden wird fast vollständig in Zone 1 und 2 gelaufen.
 * Entsprechend gehört der Löwenanteil des Trainings dorthin – nicht, weil
 * harte Einheiten schaden, sondern weil jede davon Erholung kostet, die für
 * die langen Einheiten fehlt. Zone 5 hat für diese Distanz keinen Wert.
 */
export function zoneTargets(weeksOut) {
  const phase = phaseFor(weeksOut);
  switch (phase.key) {
    case 'grundlage': return { easy: 0.80, threshold: 0.15, hard: 0.05 };
    case 'aufbau': return { easy: 0.85, threshold: 0.12, hard: 0.03 };
    case 'spezifisch': return { easy: 0.88, threshold: 0.10, hard: 0.02 };
    case 'taper': return { easy: 0.85, threshold: 0.13, hard: 0.02 };
    default: return { easy: 1, threshold: 0, hard: 0 };
  }
}

/**
 * Steiggeschwindigkeit, die das Rennen verlangt.
 *
 * Bei 4295 Höhenmetern verbringt man grob 45 % der Rennzeit im Anstieg. Aus
 * Höhenmetern und angepeilter Zeit ergibt sich daraus eine Zahl, die man im
 * Training direkt messen kann – anders als eine Pace, die im Gelände nichts
 * aussagt.
 */
export function vertRateTarget(race) {
  const plan = racePlan(race);
  const climbHours = plan.targetHours * 0.45;
  return Math.round(race.vertM / climbHours / 10) * 10;
}

/** Wie viele Stunden im Rennen auf Anstieg, Abstieg und Flaches entfallen. */
export function terrainSplit(race) {
  const plan = racePlan(race);
  return {
    climbHours: round(plan.targetHours * 0.45, 1),
    descentHours: round(plan.targetHours * 0.38, 1),
    flatHours: round(plan.targetHours * 0.17, 1),
  };
}

/** Kurzfassung für die Kopfzeile: "noch 91 Wochen". */
export function countdown(race, isoDate) {
  const days = daysBetween(isoDate, race.date);
  const weeks = weeksUntil(race.date, isoDate);
  return {
    days,
    weeks,
    past: days < 0,
    text: days < 0 ? 'Rennen gelaufen'
      : days === 0 ? 'Heute ist Renntag'
        : days <= 14 ? `noch ${days} Tage`
          : `noch ${weeks} Wochen`,
  };
}

/** Der Renntag selbst, damit der Kalender ihn kennt. */
export function isRaceDay(race, isoDate) {
  return Boolean(race) && race.date === isoDate;
}

export { addDays };
