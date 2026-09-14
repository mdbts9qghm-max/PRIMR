// Aus den WHOOP-Werten des Check-ins wird ein Bereitschaftswert (0–100).
// Baselines kommen aus den eigenen Check-ins der letzten 14 bzw. 28 Tage,
// nicht aus Normwerten – nur der Vergleich mit dir selbst ist aussagekräftig.

import { clamp, mean, round, scale } from './util.js';

export const BANDS = [
  { key: 'gruen', min: 75, label: 'Grün', headline: 'Voll belastbar', tone: 'good' },
  { key: 'gelb', min: 55, label: 'Gelb', headline: 'Belastbar mit Abstrichen', tone: 'warn' },
  { key: 'orange', min: 38, label: 'Orange', headline: 'Nur locker', tone: 'caution' },
  { key: 'rot', min: 0, label: 'Rot', headline: 'Regeneration', tone: 'bad' },
];

export function band(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

/** Rollierende Baselines aus vergangenen Check-ins (ohne den heutigen). */
export function baselines(checkins, beforeIso) {
  const past = checkins
    .filter((c) => c.date < beforeIso)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = (field, n) => mean(past.slice(0, n).map((c) => c[field]).filter((v) => v != null));
  return {
    hrv: last('hrv', 14),
    rhr: last('rhr', 14),
    recovery: last('recovery', 28),
    strain: last('strain', 7),
    sleepHours: last('sleepHours', 14),
    samples: past.length,
  };
}

/**
 * Einzelbeiträge, damit die App erklären kann, woher der Wert kommt.
 * Jeder Beitrag: { key, label, weight, points (0-100), value, detail }
 */
export function components(checkin, base, dayKey, sleepTarget) {
  const out = [];

  if (checkin.recovery != null) {
    out.push({
      key: 'recovery',
      label: 'Recovery',
      weight: 0.42,
      points: clamp(checkin.recovery, 0, 100),
      value: `${checkin.recovery} %`,
      detail: base.recovery
        ? `Dein Schnitt der letzten Wochen liegt bei ${round(base.recovery)} %.`
        : 'Noch kein eigener Vergleichswert – der Rohwert zählt.',
    });
  }

  if (checkin.sleepPerformance != null) {
    out.push({
      key: 'sleepPerformance',
      label: 'Schlaf-Performance',
      weight: 0.18,
      points: clamp(checkin.sleepPerformance, 0, 100),
      value: `${checkin.sleepPerformance} %`,
      detail: 'Anteil des Schlafbedarfs, den du tatsächlich abgedeckt hast.',
    });
  }

  if (checkin.sleepHours != null && sleepTarget) {
    const target = sleepTarget;
    const ratio = checkin.sleepHours / target;
    out.push({
      key: 'sleepHours',
      label: 'Schlafdauer',
      weight: 0.14,
      points: clamp(scale(ratio, 0.55, 1.05), 0, 100),
      value: `${round(checkin.sleepHours, 1)} h`,
      detail: `Soll für einen ${dayLabel(dayKey)} sind ${target} h.`,
    });
  }

  if (checkin.hrv != null && base.hrv) {
    const delta = (checkin.hrv - base.hrv) / base.hrv;
    out.push({
      key: 'hrv',
      label: 'HRV',
      weight: 0.14,
      points: clamp(scale(delta, -0.35, 0.2), 0, 100),
      value: `${round(checkin.hrv)} ms`,
      detail: `${delta >= 0 ? '+' : ''}${round(delta * 100)} % gegenüber deinem 14-Tage-Schnitt (${round(base.hrv)} ms).`,
    });
  }

  if (checkin.rhr != null && base.rhr) {
    const delta = checkin.rhr - base.rhr;
    out.push({
      key: 'rhr',
      label: 'Ruhepuls',
      weight: 0.12,
      points: clamp(scale(-delta, -6, 3), 0, 100),
      value: `${round(checkin.rhr)} bpm`,
      detail: `${delta >= 0 ? '+' : ''}${round(delta, 1)} bpm gegenüber deinem 14-Tage-Schnitt (${round(base.rhr)} bpm).`,
    });
  }

  if (checkin.soreness != null) {
    out.push({
      key: 'soreness',
      label: 'Muskelgefühl',
      weight: 0.1,
      points: clamp(scale(5 - checkin.soreness, 0, 4), 0, 100),
      value: ['frisch', 'leicht', 'spürbar', 'deutlich', 'stark'][checkin.soreness - 1] || '–',
      detail: 'Dein eigenes Urteil – es korrigiert, was die Uhr nicht sieht.',
    });
  }

  return out;
}

function dayLabel(key) {
  return {
    tag: 'Tagschicht-Tag',
    nacht: 'Nachtschicht-Tag',
    nacht_folge: 'Nachtschicht-Folgetag',
    schlaftag: 'Ü-Tag',
    frei_vor_tag: 'freien Tag vor der Tagschicht',
    frei: 'freien Tag',
  }[key] || 'Tag';
}

/**
 * Gesamtbewertung.
 * load: { acute, chronic, ratio } aus dem Belastungsmodell (optional).
 */
export function readiness(checkin, base, dayKey, load, sleepTarget) {
  if (!checkin) return null;
  const parts = components(checkin, base, dayKey, sleepTarget);
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  if (!totalWeight) return null;

  let score = parts.reduce((a, p) => a + p.points * p.weight, 0) / totalWeight;

  const adjustments = [];
  if (load && load.ratio != null) {
    if (load.ratio > 1.45) {
      score -= 9;
      adjustments.push({ label: 'Vorbelastung hoch', delta: -9, detail: `Deine 7-Tage-Last liegt ${round(load.ratio, 2)}× über dem 28-Tage-Schnitt. Das ist der Bereich, in dem Überlastung entsteht.` });
    } else if (load.ratio > 1.25) {
      score -= 4;
      adjustments.push({ label: 'Vorbelastung erhöht', delta: -4, detail: `7-Tage-Last ${round(load.ratio, 2)}× über dem Schnitt – noch im Rahmen, aber beobachten.` });
    } else if (load.ratio < 0.8) {
      score += 3;
      adjustments.push({ label: 'Frisch', delta: +3, detail: 'Die letzten sieben Tage waren ruhig – du verträgst heute mehr.' });
    }
  }

  if (dayKey === 'nacht_folge') {
    score -= 5;
    adjustments.push({ label: 'Zweite Nacht in Folge', delta: -5, detail: 'Der Morgenschlaf ersetzt keine volle Nacht. Der Körper arbeitet gegen die innere Uhr.' });
  }

  // Erst runden, dann einordnen – sonst zeigt die App 75 an und nennt es Gelb.
  const rounded = Math.round(clamp(score, 0, 100));
  return { score: rounded, parts, adjustments, band: band(rounded) };
}

/**
 * Wie der Wert das Training heute verändert.
 * Gibt Faktoren zurück, die der Trainingsplaner direkt anwendet.
 */
export function trainingDirective(score, dayKey) {
  if (score == null) {
    return { key: 'unbekannt', volume: 1, allowHard: true, hrCap: null, text: 'Ohne Check-in plant die App nach Schichtlage – trag die Werte nach, dann wird es präzise.' };
  }
  if (score >= 75) {
    return {
      key: 'gruen',
      volume: 1,
      allowHard: true,
      hrCap: null,
      text: 'Alles im grünen Bereich. Die geplante Einheit steht so, harte Intervalle inklusive. Wenn sich die ersten 10 Minuten gut anfühlen, darfst du am oberen Ende der Zielzone laufen.',
    };
  }
  if (score >= 55) {
    return {
      key: 'gelb',
      volume: 0.85,
      allowHard: true,
      hrCap: 190,
      text: 'Qualität ja, Menge nein. Intensität bleibt, der Umfang wird um etwa 15 % gekürzt. Halte in harten Intervallen bei Zone 4 die Bremse und geh nicht in Zone 5.',
    };
  }
  if (score >= 38) {
    return {
      key: 'orange',
      volume: 0.6,
      allowHard: false,
      hrCap: 160,
      text: 'Heute kein harter Reiz. Die Einheit wird auf ruhiges Grundlagentempo umgestellt, Puls unter 160. Ein harter Tag auf diesem Wert kostet dich zwei gute Tage danach.',
    };
  }
  return {
    key: 'rot',
    volume: 0,
    allowHard: false,
    hrCap: 138,
    text: 'Regeneration. Kein strukturiertes Training – Spaziergang, Mobility, Atemarbeit. Das ist keine verlorene Einheit, sondern die Voraussetzung für die nächste gute.',
  };
}

/** Was die Werte für den Alltag bedeuten, nicht nur fürs Training. */
export function dayAdvice(result, checkin, dayKey, base, hasHardSession, sleepTarget) {
  const tips = [];
  if (!result) return tips;

  if (checkin.sleepHours != null && sleepTarget && checkin.sleepHours < sleepTarget - 1) {
    tips.push({
      label: 'Schlafdefizit',
      text: `Dir fehlen rund ${round(sleepTarget - checkin.sleepHours, 1)} h. Plane heute einen Powernap von 20 min vor 15:00 ein – länger und du landest im Tiefschlaf und wachst zerschlagen auf.`,
    });
  }
  if (checkin.hrv != null && base.hrv && checkin.hrv < base.hrv * 0.85) {
    tips.push({
      label: 'HRV unter Schnitt',
      text: 'Dein Nervensystem steht noch unter Spannung. Koffein heute früher stoppen, Alkohol weglassen, abends 10 min langsam ausatmen (4 s ein, 8 s aus).',
    });
  }
  if (checkin.rhr != null && base.rhr && checkin.rhr > base.rhr + 4) {
    tips.push({
      label: 'Ruhepuls erhöht',
      text: 'Mehr als 4 bpm über deinem Schnitt. Typisch für beginnenden Infekt, Flüssigkeitsmangel oder zu wenig Schlaf. Trink über den Tag 1 L mehr und beobachte den Wert morgen.',
    });
  }
  if (checkin.strain != null && checkin.strain >= 14) {
    tips.push({
      label: 'Gestern war hart',
      text: `Strain ${round(checkin.strain, 1)}. Heute zählt Eiweiß (1,8–2,2 g je kg Körpergewicht) und Kohlenhydrate früh am Tag, damit der Speicher vor der nächsten Einheit wieder voll ist.`,
    });
  }
  if (dayKey === 'schlaftag') {
    tips.push({
      label: 'Ü-Tag',
      text: 'Sechs Stunden Morgenschlaf sind keine volle Nacht, auch wenn sich der Nachmittag gut anfühlt. Heute zählt, dass du um 00:00 wirklich im Bett liegst – daran hängt der ganze Rest des Blocks.',
    });
  }
  if (dayKey === 'nacht' || dayKey === 'nacht_folge') {
    tips.push({
      label: 'Nachtschicht',
      text: 'Letztes Koffein spätestens um 00:00, sonst frisst es den Morgenschlaf. Auf dem Heimweg Sonnenbrille – Morgenlicht schaltet dich sonst wach.',
    });
  }
  if (dayKey === 'tag') {
    tips.push({
      label: 'Tagschicht',
      text: 'Zwölf Stunden Dienst zählen als Belastung, auch wenn kein Training stattfindet. Bewegungspausen alle zwei Stunden, zwei Minuten Hüfte und Brustwirbelsäule.',
    });
  }
  if (result.score >= 75 && hasHardSession) {
    tips.push({
      label: 'Fenster nutzen',
      text: 'Solche Tage sind selten im Wechselschichtdienst. Wenn heute eine harte Einheit ansteht, zieh sie durch – verschobene Qualität holst du später kaum nach.',
    });
  }
  return tips;
}
