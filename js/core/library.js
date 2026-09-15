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

export function longRun(w, targetMin, paceMinPerKm) {
  const strides = w % 4 === 2;
  const km = paceMinPerKm ? round(targetMin / paceMinPerKm, 1) : null;
  const blocks = [
    { label: 'Start', detail: 'Erste 15 min bewusst langsam, Zone 1 bis untere Zone 2', zone: 1, minutes: 15 },
    { label: 'Hauptteil', detail: `${targetMin - 20} min gleichmäßig in ${zoneRange(2)}`, zone: 2, minutes: targetMin - 20 },
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
    title: 'Longrun',
    subtitle: `${targetMin} min${km ? ` · ca. ${km} km` : ''} · ${zoneLabel(2)}`,
    focus: 'Aerobe Basis, Kapillarisierung, Fettstoffwechsel',
    durationMin: targetMin + (strides ? 5 : 0),
    primaryZone: 2,
    blocks,
    coachNote: 'Wenn die Herzfrequenz im letzten Drittel bei gleichem Tempo davonläuft, war der Einstieg zu schnell oder der Schlaf zu kurz. Beides notieren.',
    load: Math.round(targetMin * LOAD_FACTOR.long),
  };
}

export function easyRun(w, targetMin, paceMinPerKm) {
  const km = paceMinPerKm ? round(targetMin / paceMinPerKm, 1) : null;
  return {
    slot: 'easy',
    kind: 'run',
    hard: false,
    title: 'Easy Run',
    subtitle: `${targetMin} min${km ? ` · ca. ${km} km` : ''} · Z1–Z2 · ${zone(1).from}–${zone(2).to}`,
    focus: 'Regeneration bei gleichzeitigem aerobem Reiz',
    durationMin: targetMin,
    primaryZone: 2,
    blocks: [
      { label: 'Dauerlauf', detail: `${targetMin} min, Puls konsequent unter 160 halten`, zone: 2, minutes: targetMin },
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
