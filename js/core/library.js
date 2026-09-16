// Einheiten-Bibliothek. Jede Einheit kennt ihre Bausteine, ihre Zielzone und
// ihre Belastungspunkte. Der Umfang kommt von außen (Progressionsmodell),
// die Struktur steht hier.

import { zone, zoneLabel, zoneRange } from './zones.js';
import { round } from './util.js';

export const LOAD_FACTOR = {
  long: 1.0,
  easy: 0.75,
  intensiv: 1.7,
  kraft_a: 1.15,
  kraft_b: 0.95,
  kraft_c: 1.0,
  mobility: 0.15,
};

export const HARD_SLOTS = ['long', 'intensiv', 'kraft_a'];

/** Intervallformen, die im Wochenrhythmus rotieren. */
export const INTENSIV_ROTATION = [
  {
    key: 'threshold_lang',
    title: 'Schwelle lang',
    focus: 'Laktatschwelle',
    reps: (w) => 3 + Math.min(2, Math.floor(w / 8)),
    repMin: (w) => 8 + Math.min(4, Math.floor(w / 6)),
    restMin: 2,
    zone: 3,
    note: 'Das Tempo soll sich anstrengend, aber kontrollierbar anfühlen – du könntest noch kurze Sätze sprechen.',
  },
  {
    key: 'vo2_3min',
    title: 'VO2max 3 min',
    focus: 'Maximale Sauerstoffaufnahme',
    reps: (w) => 5 + Math.min(3, Math.floor(w / 6)),
    repMin: () => 3,
    restMin: 2,
    zone: 4,
    note: 'Die erste Wiederholung muss sich zu leicht anfühlen. Wenn nicht, bist du zu schnell gestartet.',
  },
  {
    key: 'cruise',
    title: 'Cruise-Intervalle',
    focus: 'Tempohärte bei kurzer Pause',
    reps: (w) => 4 + Math.min(3, Math.floor(w / 7)),
    repMin: () => 5,
    restMin: 1,
    zone: 3,
    note: 'Kurze Pausen halten den Laktatspiegel oben – deshalb ist hier Disziplin beim Tempo wichtiger als Mut.',
  },
  {
    key: 'vo2_1000',
    title: '1000er',
    focus: 'VO2max und Laufökonomie',
    reps: (w) => 4 + Math.min(3, Math.floor(w / 6)),
    repMin: () => 4,
    restMin: 2,
    zone: 4,
    note: 'Gleichmäßig laufen. Die letzte Wiederholung soll die schnellste sein können, nicht müssen.',
  },
  {
    key: 'threshold_block',
    title: 'Schwellen-Block',
    focus: 'Dauerleistung an der Schwelle',
    reps: (w) => 2 + Math.min(1, Math.floor(w / 12)),
    repMin: (w) => 10 + Math.min(6, Math.floor(w / 5)),
    restMin: 3,
    zone: 3,
    note: 'Der zäheste Reiz im Plan und der wirksamste für deine Schwellenherzfrequenz.',
  },
  {
    key: 'kurz_schnell',
    title: 'Kurz und schnell',
    focus: 'Spritzigkeit, Laufökonomie',
    reps: (w) => 8 + Math.min(6, Math.floor(w / 4)),
    repMin: () => 1,
    restMin: 2,
    zone: 5,
    note: 'Technik vor Tempo: hohe Frequenz, aufrechter Oberkörper, Fuß unter dem Körper.',
  },
];

function warmup(min = 12) {
  return { label: 'Einlaufen', detail: `${min} min locker`, zone: 1, minutes: min };
}
function cooldown(min = 10) {
  return { label: 'Auslaufen', detail: `${min} min sehr locker`, zone: 1, minutes: min };
}

/** Intensive Laufeinheit für Wochenindex w und Gesamtdauer targetMin. */
export function intensivSession(w, targetMin) {
  const tpl = INTENSIV_ROTATION[w % INTENSIV_ROTATION.length];
  let reps = tpl.reps(w);
  const repMin = tpl.repMin(w);
  const wu = 12;
  const cd = 10;

  // Wiederholungen so kürzen, dass die Einheit ins Zeitfenster passt.
  const per = repMin + tpl.restMin;
  while (reps > 2 && wu + cd + reps * per - tpl.restMin > targetMin) reps -= 1;

  const work = reps * repMin;
  const total = wu + cd + reps * per - tpl.restMin;

  return {
    slot: 'intensiv',
    kind: 'run',
    hard: true,
    title: tpl.title,
    subtitle: `${reps} × ${repMin} min · ${zoneLabel(tpl.zone)}`,
    focus: tpl.focus,
    durationMin: Math.round(total),
    primaryZone: tpl.zone,
    blocks: [
      warmup(wu),
      {
        label: 'Hauptteil',
        detail: `${reps} × ${repMin} min in ${zoneRange(tpl.zone)}, dazwischen ${tpl.restMin} min Trabpause in Zone 1`,
        zone: tpl.zone,
        minutes: reps * per - tpl.restMin,
      },
      cooldown(cd),
    ],
    coachNote: tpl.note,
    workMinutes: work,
    load: Math.round(total * LOAD_FACTOR.intensiv),
  };
}

/**
 * Höhenmeter-Einheit: Bergwiederholungen.
 *
 * Ohne langen Anstieg vor der Tür entstehen Höhenmeter aus Wiederholungen.
 * Das ist keine Notlösung: Für die Muskulatur zählt die Summe, und der
 * Wechsel aus Steigen und Abwärtslaufen trifft genau die Belastung, die im
 * Rennen tausendfach vorkommt.
 */
export function vertSession(targetVert, hillMeters, opts = {}) {
  const reps = Math.max(3, Math.round(targetVert / hillMeters));
  const actual = reps * hillMeters;
  // Grob: 100 hm bergauf im zügigen Gehen oder Traben ≈ 8 min, Abstieg ≈ 4 min.
  const minutes = Math.round(24 + reps * ((hillMeters / 100) * 8 + (hillMeters / 100) * 4));
  const hike = opts.powerHike !== false;

  return {
    slot: 'intensiv',
    kind: 'run',
    hard: true,
    title: 'Bergwiederholungen',
    subtitle: `${reps} × ${hillMeters} hm · ${actual} hm gesamt`,
    focus: 'Höhenmeter, Power-Hiking, Bergab-Gewöhnung',
    durationMin: minutes,
    primaryZone: 3,
    vertM: actual,
    blocks: [
      warmup(12),
      {
        label: `${reps} × Anstieg`,
        detail: hike
          ? `${hillMeters} hm am Stück. Die ersten Wiederholungen laufen, ab der Hälfte bewusst Power-Hiking üben: kurze Schritte, Hände auf den Oberschenkeln, Blick nach vorn. Im Rennen wirst du den Großteil der 4295 hm gehen, nicht laufen.`
          : `${hillMeters} hm am Stück, durchgehend laufen in ${zoneRange(3)}`,
        zone: 3,
        minutes: Math.round(reps * (hillMeters / 100) * 8),
      },
      {
        label: 'Abstiege',
        detail: 'Locker und kontrolliert herunter, kurze Schritte, hohe Frequenz. Der Abstieg ist hier Erholung – und gleichzeitig die Gewöhnung, die im Rennen zählt.',
        zone: 2,
        minutes: Math.round(reps * (hillMeters / 100) * 4),
      },
      cooldown(12),
    ],
    coachNote: 'Die Herzfrequenz darf im Anstieg hoch gehen, muss aber nicht. Entscheidend ist, dass du oben nicht am Limit stehst – im Rennen kommen 4295 hm, nicht 700.',
    load: Math.round(minutes * 1.4),
  };
}

/**
 * Bergab-Belastungstoleranz.
 *
 * Bei 4295 Höhenmetern bergauf kommen 4295 wieder herunter. Die exzentrische
 * Belastung im Quadrizeps ist der häufigste Grund, warum Läufer bei einem
 * Rennen dieser Länge aussteigen – und der einzige Reiz, den man nicht
 * improvisieren kann. Die Toleranz baut sich nur über Wochen auf.
 */
export function downhillSession(reps, hillMeters) {
  const n = Math.max(3, reps);
  const minutes = Math.round(20 + n * ((hillMeters / 100) * 7 + (hillMeters / 100) * 5));
  return {
    slot: 'easy',
    kind: 'run',
    hard: true,
    title: 'Bergab-Toleranz',
    subtitle: `${n} × ${hillMeters} hm bergab · kontrolliert`,
    focus: 'Exzentrische Belastbarkeit des Quadrizeps',
    durationMin: minutes,
    primaryZone: 2,
    vertM: n * hillMeters,
    blocks: [
      warmup(15),
      {
        label: 'Hinauf',
        detail: 'Gemütlich gehen oder traben – der Anstieg ist hier nur der Weg nach oben.',
        zone: 1,
        minutes: Math.round(n * (hillMeters / 100) * 7),
      },
      {
        label: `${n} × Abstieg`,
        detail: 'Zügig, aber kontrolliert. Kurze Schritte, Fuß unter dem Körper, Oberkörper leicht vor. Nicht bremsen mit gestrecktem Bein – genau das zerstört die Muskulatur.',
        zone: 2,
        minutes: Math.round(n * (hillMeters / 100) * 5),
      },
      cooldown(10),
    ],
    coachNote: 'Der Muskelkater kommt zwei Tage später und fällt beim ersten Mal heftig aus. Genau deshalb fängt diese Einheit Monate vor dem Rennen an und steigert sich in kleinen Schritten – nicht drei Wochen vorher.',
    load: Math.round(minutes * 1.5),
  };
}

export function longRun(w, targetMin, paceMinPerKm, vertM = 0) {
  const strides = w % 4 === 2;
  const km = paceMinPerKm ? round(targetMin / paceMinPerKm, 1) : null;
  const blocks = [
    { label: 'Start', detail: 'Erste 15 min bewusst langsam, Zone 1 bis untere Zone 2', zone: 1, minutes: 15 },
    {
      label: 'Hauptteil',
      detail: vertM
        ? `${targetMin - 20} min gleichmäßig in ${zoneRange(2)}, dabei rund ${vertM} hm sammeln – welliges Profil suchen statt flacher Runde.`
        : `${targetMin - 20} min gleichmäßig in ${zoneRange(2)}`,
      zone: 2,
      minutes: targetMin - 20,
    },
    { label: 'Ausklang', detail: '5 min locker austraben', zone: 1, minutes: 5 },
  ];
  if (strides) {
    blocks.splice(2, 0, {
      label: 'Steigerungen',
      detail: '4 × 20 s zügig, volle Pause – hält die Spannkraft im langen Lauf',
      zone: 4,
      minutes: 5,
    });
  }
  return {
    slot: 'long',
    kind: 'run',
    hard: true,
    vertM,
    title: 'Longrun',
    subtitle: `${targetMin} min${km ? ` · ca. ${km} km` : ''}${vertM ? ` · ${vertM} hm` : ''} · ${zoneLabel(2)}`,
    focus: 'Aerobe Basis, Kapillarisierung, Fettstoffwechsel',
    durationMin: targetMin + (strides ? 5 : 0),
    primaryZone: 2,
    blocks,
    coachNote: 'Wenn die Herzfrequenz im letzten Drittel bei gleichem Tempo davonläuft, war der Einstieg zu schnell oder der Schlaf zu kurz. Beides notieren.',
    load: Math.round(targetMin * LOAD_FACTOR.long),
  };
}

/**
 * Lange Einheit mit Ziel: Time on Feet statt Kilometer.
 *
 * Bei einem Rennen über 19 bis 22 Stunden zählt nicht, wie schnell du eine
 * Distanz läufst, sondern wie lange du dich bewegen kannst, ohne dass Magen,
 * Kopf oder Beine aufgeben. Deshalb wird hier in Stunden gerechnet, gegessen
 * wie im Rennen und der Anstieg gegangen statt gelaufen.
 */
export function timeOnFeet(targetMin, vertM, plan, opts = {}) {
  const hours = round(targetMin / 60, 1);
  const night = Boolean(opts.night);
  const blocks = [
    {
      label: 'Erste Stunde',
      detail: 'Bewusst zu langsam starten. Im Rennen ist das der Unterschied zwischen Stunde 15 und dem Ausstieg.',
      zone: 1,
      minutes: 60,
    },
    {
      label: 'Hauptteil',
      detail: `${Math.max(30, targetMin - 90)} min in ${zoneRange(2)}${vertM ? `, dabei rund ${vertM} hm sammeln` : ''}. Jeden Anstieg über 50 hm konsequent gehen – Power-Hiking ist die Renngeschwindigkeit, nicht die Notlösung.`,
      zone: 2,
      minutes: Math.max(30, targetMin - 90),
    },
    {
      label: 'Verpflegung',
      detail: `${plan.carbsPerHour[0]}–${plan.carbsPerHour[1]} g Kohlenhydrate und ${plan.fluidPerHour[0]}–${plan.fluidPerHour[1]} ml pro Stunde, dazu ${plan.sodiumPerHour[0]}–${plan.sodiumPerHour[1]} mg Natrium. Genau die Produkte nehmen, die du im Rennen nehmen willst – der Magen muss trainiert werden wie die Beine.`,
    },
    {
      label: 'Letzte 30 min',
      detail: 'Auf müden Beinen sauber laufen. Hier entscheidet sich die Technik der letzten Rennstunden.',
      zone: 2,
      minutes: 30,
    },
  ];

  if (night) {
    blocks.unshift({
      label: 'Nachtlauf',
      detail: 'Start zwischen 22:00 und 23:00, mit der Stirnlampe, die du im Rennen trägst. Der Zugspitz Ultratrail startet um 23:00 – die ersten sechs bis sieben Stunden läufst du im Dunkeln.',
    });
  }

  return {
    slot: 'long',
    kind: 'run',
    hard: true,
    title: night ? 'Nacht-Longrun' : 'Time on Feet',
    subtitle: `${hours} h${vertM ? ` · ${vertM} hm` : ''} · ${zoneLabel(2)}`,
    focus: night ? 'Rennsimulation bei Dunkelheit' : 'Dauerbelastung, Verpflegung, Power-Hiking',
    durationMin: targetMin,
    primaryZone: 2,
    vertM,
    blocks,
    coachNote: night
      ? 'Nachts läuft man langsamer, isst weniger und unterschätzt die Kälte. Genau deshalb wird das vorher geprobt – du kennst Nachtschichten, aber nicht Laufen um drei Uhr morgens.'
      : 'Wenn dir ab Stunde drei schlecht wird, lag es fast immer an zu wenig Flüssigkeit oder zu viel Zucker auf einmal. Notiere, was du wann gegessen hast.',
    load: Math.round(targetMin * 1.1),
  };
}

/** Zweiter langer Tag in Folge – Laufen auf müden Beinen. */
export function backToBack(targetMin, vertM, plan) {
  return {
    ...timeOnFeet(targetMin, vertM, plan),
    slot: 'long_b',
    title: 'Zweiter langer Tag',
    subtitle: `${round(targetMin / 60, 1)} h auf müden Beinen${vertM ? ` · ${vertM} hm` : ''}`,
    focus: 'Die letzten Rennstunden simulieren, ohne sie zu laufen',
    coachNote: 'Das ist der wirksamste Trick der Ultravorbereitung: Zwei lange Tage hintereinander erzeugen den Zustand der Stunden 14 bis 20, ohne dass du 14 Stunden am Stück laufen musst. Heute geht es nicht um Tempo, sondern darum, überhaupt loszugehen.',
    load: Math.round(targetMin * 1.25),
  };
}

export function easyRun(w, targetMin, paceMinPerKm, vertM = 0) {
  const km = paceMinPerKm ? round(targetMin / paceMinPerKm, 1) : null;
  return {
    slot: 'easy',
    kind: 'run',
    hard: false,
    vertM,
    title: 'Easy Run',
    subtitle: `${targetMin} min${km ? ` · ca. ${km} km` : ''}${vertM ? ` · ${vertM} hm` : ''} · Z1–Z2 · ${zone(1).from}–${zone(2).to}`,
    focus: 'Regeneration bei gleichzeitigem aerobem Reiz',
    durationMin: targetMin,
    primaryZone: 2,
    blocks: [
      {
        label: 'Dauerlauf',
        detail: vertM
          ? `${targetMin} min, Puls konsequent unter 160 halten, dabei rund ${vertM} hm mitnehmen`
          : `${targetMin} min, Puls konsequent unter 160 halten`,
        zone: 2,
        minutes: targetMin,
      },
      { label: 'Abschluss', detail: '6 × 15 s Lauf-ABC oder Steigerungen, wenn die Beine wollen', zone: 3, minutes: 5 },
    ],
    coachNote: 'Der häufigste Fehler im Hybrid-Training: der lockere Lauf wird zu schnell. Zu schnell heißt hier alles über 160 bpm.',
    load: Math.round(targetMin * LOAD_FACTOR.easy),
  };
}

/**
 * Krafteinheiten. Die App plant nur, WANN Kraft ansteht und mit welchem
 * Schwerpunkt – Sätze, Wiederholungen und Gewichte steuerst du selbst.
 *
 * Der Schwerpunkt bleibt trotzdem im Modell, weil er fürs Planen zählt:
 * schwere Beinarbeit verträgt sich nicht mit einem harten Lauf am Folgetag,
 * Oberkörper dagegen schon.
 */
const STRENGTH_TEMPLATES = {
  kraft_a: {
    title: 'Kraft A · Unterkörper',
    focus: 'Schwerer Beintag',
    hard: true,
    note: 'Schwere Beinarbeit hält der Plan mindestens einen Tag von harten Läufen fern. Was du machst und mit welchem Gewicht, entscheidest du.',
  },
  kraft_b: {
    title: 'Kraft B · Oberkörper',
    focus: 'Druck und Zug',
    hard: false,
    note: 'Die verträglichste Einheit der Woche – sie belastet die Beine nicht und darf deshalb auch neben einem Lauftag stehen.',
  },
  kraft_c: {
    title: 'Kraft C · Athletik',
    focus: 'Explosivkraft, Rumpf, Einbeiniges',
    hard: false,
    note: 'Athletik und Sprünge liegen an einem Tag mit frischem Nervensystem, nicht im Anschluss an einen harten Reiz.',
  },
};

/**
 * minutesAvailable ist hier keine Vorgabe, sondern die Zeit, die das
 * Zeitfenster des Tages nach Abzug der Anfahrt wirklich hergibt.
 */
// Für die Belastungspunkte wird eine normale Einheit angesetzt, nicht das
// ganze Zeitfenster – sonst zählte ein freier Nachmittag als härteres Training
// als der Longrun. Was es wirklich war, korrigiert deine Angabe beim Abhaken.
const STRENGTH_NOMINAL_MIN = 60;

export function strengthSession(slot, w, minutesAvailable) {
  const tpl = STRENGTH_TEMPLATES[slot];
  const minutes = Math.max(30, Math.round(Math.min(minutesAvailable, 90) / 5) * 5);

  return {
    slot,
    kind: 'strength',
    hard: tpl.hard,
    title: tpl.title,
    subtitle: tpl.focus,
    focus: tpl.focus,
    durationMin: minutes,
    durationCaption: 'Minuten Zeit',
    blocks: [],
    coachNote: tpl.note,
    load: Math.round(STRENGTH_NOMINAL_MIN * LOAD_FACTOR[slot]),
  };
}

export function mobilitySession(dayKey) {
  const nightly = dayKey === 'tag';
  return {
    slot: 'mobility',
    kind: 'mobility',
    hard: false,
    title: nightly ? 'Mobility nach dem Dienst' : 'Mobility & Atmung',
    subtitle: '20 min · kein Trainingsreiz, reine Regeneration',
    focus: 'Gegenbewegung zur Schicht, Parasympathikus hochfahren',
    durationMin: 20,
    blocks: [
      { label: 'Hüftbeuger-Dehnung', detail: '2 × 60 s je Seite, Becken aufrichten', minutes: 4 },
      { label: 'Brustwirbelsäule Rotation', detail: '10 Wiederholungen je Seite im Vierfüßlerstand', minutes: 3 },
      { label: '90/90 Hüftwechsel', detail: '10 langsame Wechsel', minutes: 3 },
      { label: 'Wadendehnung an der Wand', detail: '2 × 45 s je Seite', minutes: 3 },
      { label: 'Atemübung', detail: '5 min: 4 s ein, 8 s aus – senkt den Puls messbar', minutes: 5 },
    ],
    coachNote: nightly
      ? 'Nach zwölf Stunden Dienst geht es nicht um Leistung, sondern darum, den Körper aus der Haltung des Tages zu holen.'
      : 'Die günstigste Einheit im Plan: kostet kaum Regeneration und verbessert trotzdem, wie du dich morgen bewegst.',
    load: 3,
  };
}

/**
 * Krank. Kein Training, sondern das, was tatsächlich hilft – und die eine
 * Regel, an der sich entscheidet, ob daraus drei Tage oder drei Wochen werden.
 */
export function sickDay() {
  return {
    slot: 'krank',
    kind: 'sick',
    hard: false,
    title: 'Auskurieren',
    subtitle: 'Kein Training – heute arbeitet der Körper woanders',
    focus: 'Genesung',
    durationMin: 0,
    blocks: [
      { label: 'Schlaf', detail: 'Ohne Wecker, dazu ein Mittagsschlaf. Die wirksamste Maßnahme beim Infekt, mit Abstand.' },
      { label: 'Trinken', detail: 'Mindestens 3 l, bei Fieber 0,5 l mehr je Grad über 37 °C.' },
      { label: 'Essen', detail: 'Protein nicht streichen. Der Körper baut im Infekt Muskulatur ab, nicht auf.' },
      { label: 'Bewegung', detail: 'Höchstens ein ruhiger Spaziergang an der frischen Luft. Kein Puls über Zone 1.' },
      { label: 'Messen', detail: 'Ruhepuls und Temperatur notieren. Der Verlauf zeigt dir, wann du wieder einsteigen kannst.' },
    ],
    coachNote: 'Die Faustregel: Beschwerden oberhalb des Halses (Schnupfen, Halskratzen) erlauben lockere Bewegung. Fieber, Gliederschmerzen, Husten aus der Brust oder ein Ruhepuls deutlich über deinem Schnitt bedeuten Pause – Training mit einem Infekt im Körper ist der kürzeste Weg zu einer Herzmuskelentzündung.',
    load: 0,
  };
}

/** Der Renntag selbst – kein Training, sondern der Plan für 22 Stunden. */
export function raceSession(race, plan) {
  return {
    slot: 'race',
    kind: 'race',
    hard: true,
    title: race.name,
    subtitle: `${race.distanceKm} km · ${race.vertM} hm+ · Start ${race.startTime} in ${race.startPlace}`,
    focus: 'Ankommen',
    durationMin: Math.round(plan.targetHours * 60),
    vertM: race.vertM,
    blocks: [
      {
        label: 'Zeitplan',
        detail: `Limit ${race.limitHours} h, angepeilt ${plan.targetHours} h. Das sind rund ${plan.targetPace} min je Flachkilometer-Äquivalent – auf die ersten 20 km bewusst langsamer als das.`,
      },
      {
        label: 'Erste Stunden',
        detail: `Start um ${race.startTime}, die ersten rund ${plan.darkHours} Stunden im Dunkeln. Stirnlampe plus Ersatzbatterien, und im Dunkeln nicht schneller laufen, nur weil es sich leicht anfühlt.`,
      },
      {
        label: 'Verpflegung',
        detail: `${plan.carbsPerHour[0]}–${plan.carbsPerHour[1]} g Kohlenhydrate, ${plan.fluidPerHour[0]}–${plan.fluidPerHour[1]} ml und ${plan.sodiumPerHour[0]}–${plan.sodiumPerHour[1]} mg Natrium je Stunde. Über das ganze Rennen sind das ${plan.carbsTotal[0]}–${plan.carbsTotal[1]} g. Stelle dir einen Wecker alle 20 Minuten – ab Stunde zehn vergisst man es sonst.`,
      },
      {
        label: 'Abstiege',
        detail: `${plan.descentM} Höhenmeter gehen auch wieder herunter. Kurze Schritte, nicht mit gestrecktem Bein bremsen. Wer die ersten Abstiege laufen lässt, bezahlt sie ab Kilometer 60.`,
      },
      {
        label: 'Wenn es schlecht läuft',
        detail: 'Übelkeit heißt fast immer: zu wenig getrunken oder zu viel Zucker auf einmal. Zehn Minuten gehen, salzig essen, kleine Schlucke. Fast jeder Tiefpunkt in einem Ultra geht vorbei.',
      },
    ],
    coachNote: 'Heute wird nichts mehr besser gemacht. Alles, was zählt, liegt in den neun Monaten davor.',
    load: Math.round(plan.targetHours * 60 * 1.4),
  };
}

export function restDay(reason) {
  return {
    slot: 'rest',
    kind: 'rest',
    hard: false,
    title: 'Ruhetag',
    subtitle: reason || 'Kein Training geplant',
    focus: 'Anpassung – der Trainingseffekt entsteht heute, nicht gestern',
    durationMin: 0,
    blocks: [],
    coachNote: 'Ein bewusst geplanter Ruhetag ist Teil des Plans, kein Ausfall.',
    load: 0,
  };
}
