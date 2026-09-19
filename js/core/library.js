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

function warmup(min = 12) {
  return { label: 'Einlaufen', detail: `${min} min locker`, zone: 1, minutes: min };
}
function cooldown(min = 10) {
  return { label: 'Auslaufen', detail: `${min} min sehr locker`, zone: 1, minutes: min };
}

/**
 * Qualitätseinheiten am Berg.
 *
 * Für ein Rennen über 86 km mit 4295 Höhenmetern sind Bahnintervalle und
 * 1000er verschenkte Erholung: Sie trainieren eine Fähigkeit, die in diesem
 * Rennen nie abgerufen wird. Alles Harte findet deshalb am Anstieg statt und
 * wird in Höhenmetern gerechnet, nicht in Metern auf der Ebene.
 *
 * Die vier Formen rotieren. Reicht das Wochenziel nicht für Wiederholungen,
 * greift der Berg-Dauerlauf – er sammelt auch kleine Mengen ein.
 */
export const HILL_FORMS = [
  {
    key: 'intervalle',
    title: 'Berg-Intervalle',
    zone: 4,
    focus: 'Aerobe Obergrenze am Anstieg',
    minReps: 4,
    climbMinPer100: 7,
    note: 'Die erste Wiederholung muss sich zu leicht anfühlen. Oben nicht stehen bleiben – im Rennen geht es nach jedem Anstieg direkt weiter.',
    detail: (hm) => `${hm} hm am Stück zügig laufen, oben kurz durchatmen, locker herunter. Die einzige Einheit im Plan, in der du am Anstieg wirklich drückst.`,
  },
  {
    key: 'schwelle',
    title: 'Berg-Schwelle',
    zone: 3,
    focus: 'Dauerleistung am Anstieg',
    minReps: 3,
    climbMinPer100: 9,
    note: 'Anstrengend, aber kontrollierbar – du könntest noch kurze Sätze sprechen. Genau dieses Gefühl trägt im Rennen über Stunden.',
    detail: (hm) => `${hm} hm gleichmäßig, ohne Einbruch am Ende. Tempo so wählen, dass die letzte Wiederholung wie die erste aussieht.`,
  },
  {
    key: 'hiking',
    title: 'Power-Hiking-Block',
    zone: 3,
    focus: 'Die Renngeschwindigkeit am Anstieg',
    minReps: 3,
    climbMinPer100: 11,
    note: 'Bei 4295 Höhenmetern gehst du den Großteil der Anstiege. Gehen ist hier die Renngeschwindigkeit und keine Schwäche – wer es nicht übt, verliert damit mehr Zeit als durch jedes zu langsame Laufen.',
    detail: (hm) => `${hm} hm durchgehend gehen, nicht laufen. Kurze Schritte, Hände auf den Oberschenkeln, Blick nach vorn. Miss dabei deine Höhenmeter pro Stunde.`,
  },
  {
    key: 'dauerlauf',
    title: 'Berg-Dauerlauf',
    zone: 2,
    focus: 'Höhenmeter im Grundlagentempo',
    minReps: 0,
    climbMinPer100: 10,
    note: 'Keine Wiederholungen, sondern eine wellige Runde. Anstiege gehen oder locker laufen, Abstiege kontrolliert – so sieht der größte Teil des Rennens aus.',
    detail: (hm) => `Welliges Profil suchen und über die Einheit rund ${hm} hm sammeln. Puls in Zone 2 halten, an den Anstiegen darf er kurz darüber gehen.`,
  },
];

/**
 * Bergeinheit für ein Höhenmeter-Budget.
 *
 * Das Budget bestimmt die Form. Reicht es nicht für den längsten erreichbaren
 * Anstieg, wird nicht die Einheit gestrichen, sondern die Wiederholung kürzer
 * genommen – ein Anstieg über 60 hm ist eine vollwertige Wiederholung. Erst
 * unterhalb von 40 hm lohnt sich keine mehr; dann werden die Höhenmeter in
 * einem Dauerlauf auf welligem Profil eingesammelt. Passt die Einheit nicht
 * ins Zeitfenster, wird die Menge gekürzt – nie das Tempo erhöht.
 */
const MIN_REP_VERT = 40;

export function hillSession(w, budgetVert, hillMeters, minutesAvailable) {
  const wanted = HILL_FORMS[w % HILL_FORMS.length];
  // Höhe einer Wiederholung: so viel wie der Anstieg hergibt, aber nie mehr,
  // als das Budget für die Mindestzahl an Wiederholungen zulässt.
  const repVert = wanted.minReps > 0
    ? Math.min(hillMeters, Math.floor(budgetVert / wanted.minReps / 10) * 10)
    : 0;
  const form = wanted.minReps > 0 && repVert >= MIN_REP_VERT
    ? wanted
    : HILL_FORMS[HILL_FORMS.length - 1];

  const continuous = form.minReps === 0;
  let reps = continuous ? 0 : Math.max(form.minReps, Math.floor(budgetVert / repVert));
  let vertM = continuous ? budgetVert : reps * repVert;
  const warm = continuous ? 10 : 12;
  const total = () => warm + Math.round((vertM / 100) * form.climbMinPer100)
    + Math.round((vertM / 100) * 4) + 10;

  while (minutesAvailable && total() > minutesAvailable
    && (continuous ? vertM > 100 : reps > form.minReps)) {
    if (continuous) vertM -= 50;
    else { reps -= 1; vertM = reps * repVert; }
  }

  const minutes = total();
  return {
    slot: 'intensiv',
    kind: 'run',
    hard: form.zone >= 3,
    title: form.title,
    subtitle: continuous
      ? `${minutes} min · ${vertM} hm · ${zoneLabel(form.zone)}`
      : `${reps} × ${repVert} hm · ${vertM} hm gesamt · ${zoneLabel(form.zone)}`,
    focus: form.focus,
    durationMin: minutes,
    primaryZone: form.zone,
    vertM,
    blocks: [
      warmup(warm),
      {
        label: continuous ? 'Hauptteil' : `${reps} × Anstieg`,
        detail: form.detail(continuous ? vertM : repVert),
        zone: form.zone,
        minutes: Math.round((vertM / 100) * form.climbMinPer100),
      },
      {
        label: 'Abstiege',
        detail: 'Kontrolliert herunter, kurze Schritte, hohe Frequenz. Nicht mit gestrecktem Bein bremsen – das ist die Bewegung, die im Rennen die Oberschenkel zerlegt.',
        zone: 2,
        minutes: Math.round((vertM / 100) * 4),
      },
      cooldown(10),
    ],
    coachNote: form.note,
    load: Math.round(minutes * (form.zone >= 4 ? 1.7 : form.zone === 3 ? 1.45 : 1.1)),
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

  // Die Einheit wächst über die Vorbereitung von unter einer Stunde auf über
  // vier. Struktur und Sprache passen sich mit: Verpflegung wird erst ab
  // anderthalb Stunden geübt, vorher gibt es dafür keinen Anlass.
  const einlauf = Math.min(20, Math.round(targetMin * 0.2));
  const schluss = targetMin >= 90 ? 20 : 10;
  const haupt = Math.max(15, targetMin - einlauf - schluss);

  const blocks = [
    {
      label: 'Einlaufen',
      detail: `${einlauf} min bewusst zu langsam. Im Rennen ist der zu schnelle Start der Unterschied zwischen Stunde 15 und dem Ausstieg.`,
      zone: 1,
      minutes: einlauf,
    },
    {
      label: 'Hauptteil',
      detail: `${haupt} min in ${zoneRange(2)}${vertM ? `, dabei rund ${vertM} hm sammeln` : ''}. Jeden Anstieg über 50 hm konsequent gehen – Power-Hiking ist die Renngeschwindigkeit, nicht die Notlösung.`,
      zone: 2,
      minutes: haupt,
    },
  ];

  if (targetMin >= 90) {
    blocks.push({
      label: 'Verpflegung',
      detail: `${plan.carbsPerHour[0]}–${plan.carbsPerHour[1]} g Kohlenhydrate und ${plan.fluidPerHour[0]}–${plan.fluidPerHour[1]} ml pro Stunde, dazu ${plan.sodiumPerHour[0]}–${plan.sodiumPerHour[1]} mg Natrium. Genau die Produkte nehmen, die du im Rennen nehmen willst – der Magen muss trainiert werden wie die Beine.`,
    });
  }

  blocks.push({
    label: `Letzte ${schluss} min`,
    detail: 'Auf müden Beinen sauber laufen. Hier entscheidet sich die Technik der letzten Rennstunden.',
    zone: 2,
    minutes: schluss,
  });

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
    title: night ? 'Nacht-Longrun' : targetMin >= 150 ? 'Time on Feet' : 'Lange Einheit',
    subtitle: `${hours} h${vertM ? ` · ${vertM} hm` : ''} · ${zoneLabel(2)}`,
    focus: night ? 'Rennsimulation bei Dunkelheit' : 'Dauerbelastung, Verpflegung, Power-Hiking',
    durationMin: targetMin,
    primaryZone: 2,
    vertM,
    blocks,
    coachNote: night
      ? 'Nachts läuft man langsamer, isst weniger und unterschätzt die Kälte. Genau deshalb wird das vorher geprobt – du kennst Nachtschichten, aber nicht Laufen um drei Uhr morgens.'
      : targetMin >= 90
        ? 'Wenn dir ab Stunde drei schlecht wird, lag es fast immer an zu wenig Flüssigkeit oder zu viel Zucker auf einmal. Notiere, was du wann gegessen hast.'
        : 'Noch kurz, aber schon die Einheit, aus der später vier Stunden werden. Gelände statt flacher Runde, Anstiege gehen statt laufen.',
    load: Math.round(targetMin * 1.1),
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
    focus: 'Bergab-Kraft',
    hard: true,
    note: 'Bei 4295 Höhenmetern bergab entscheidet die Belastbarkeit des Quadrizeps über die letzten 25 Kilometer. Der Schwerpunkt liegt auf dem Nachgeben unter Last – was du dafür machst, entscheidest du.',
  },
  kraft_b: {
    title: 'Kraft B · Oberkörper',
    focus: 'Rumpf, Rücken, Stöcke',
    hard: false,
    note: 'Rücken und Schultern tragen im Rennen den Rucksack über 19 Stunden, und wer mit Stöcken steigt, braucht dafür Zugkraft. Belastet die Beine nicht und darf deshalb auch neben einem Lauftag stehen.',
  },
  kraft_c: {
    title: 'Kraft C · Athletik',
    focus: 'Einbeinig, Sprunggelenk, Rumpf',
    hard: false,
    note: 'Auf technischem Gelände steht man tausendfach kurz auf einem Bein. Sprunggelenk und Hüftstabilität entscheiden dort über Umknicken und über die Ökonomie in den späten Stunden.',
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
  const focus = tpl.focus;

  return {
    slot,
    kind: 'strength',
    hard: tpl.hard,
    title: tpl.title,
    subtitle: focus,
    focus,
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
