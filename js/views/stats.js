// Werte: Fortschritt an physiologischen Markern, nicht an Wettkampfzeiten.
// VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und Herzfrequenzerholung.

import { esc, icon } from '../ui/dom.js';
import { lineChart, barChart } from '../ui/charts.js';
import { addDays, shortDate, round, mean, weekStart } from '../core/util.js';

export const MARKERS = [
  {
    key: 'vo2max',
    label: 'VO2max',
    unit: 'ml/kg/min',
    better: 'up',
    color: 'var(--accent)',
    why: 'Die Obergrenze deiner Ausdauerleistung. Sie steigt vor allem über intensive Intervalle und einen hohen Grundlagenumfang – in Monaten, nicht in Wochen.',
  },
  {
    key: 'thresholdHr',
    label: 'Schwellen-HF',
    unit: 'bpm',
    better: 'up',
    color: 'var(--shift-n)',
    why: 'Die Herzfrequenz, bei der du gerade noch im Gleichgewicht läufst. Steigt sie bei gleichem Gefühl, hat sich deine Schwelle nach oben verschoben – der ehrlichste Fortschrittsmarker im Plan.',
  },
  {
    key: 'restingHr',
    label: 'Ruhepuls',
    unit: 'bpm',
    better: 'down',
    color: 'var(--shift-t)',
    why: 'Sinkt mit besserer Grundlagenausdauer und steigt bei Überlastung, Infekt oder Schlafmangel. Tagesschwankungen sind normal, der Trend über vier Wochen zählt.',
  },
  {
    key: 'hrv',
    label: 'HRV',
    unit: 'ms',
    better: 'up',
    color: 'var(--accent)',
    why: 'Maß für die Aktivität deines Erholungsnervensystems. Im Wechselschichtdienst schwankt sie stärker als bei anderen – deshalb beurteilt die App sie gegen deinen eigenen Schnitt.',
  },
  {
    key: 'hrr60',
    label: 'HF-Erholung 1 min',
    unit: 'bpm',
    better: 'up',
    color: 'var(--shift-f)',
    why: 'Wie viele Schläge dein Puls in der ersten Minute nach einer harten Belastung fällt. Über 25 bpm ist gut, über 35 sehr gut. Reagiert schneller auf Training als VO2max.',
  },
];

function trend(values) {
  if (values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const older = mean(values.slice(0, half));
  const recent = mean(values.slice(half));
  if (older == null || recent == null) return null;
  return recent - older;
}

export function render(ctx) {
  const s = ctx.state;
  const markers = [...s.markers].sort((a, b) => (a.date < b.date ? -1 : 1));

  const weeklyLoad = [];
  for (let i = 11; i >= 0; i -= 1) {
    const monday = addDays(weekStart(ctx.date), -i * 7);
    let sum = 0;
    for (let d = 0; d < 7; d += 1) {
      const day = addDays(monday, d);
      sum += (s.log[day] && s.log[day].load) || 0;
    }
    weeklyLoad.push({
      label: shortDate(monday),
      value: sum,
      tick: i % 3 === 0 ? shortDate(monday) : '',
      readout: `Woche ab ${shortDate(monday)}: ${sum} Punkte`,
    });
  }

  const recovery = [];
  for (let i = 27; i >= 0; i -= 1) {
    const d = addDays(ctx.date, -i);
    const c = s.checkins.find((x) => x.date === d);
    if (c && c.recovery != null) recovery.push({ label: shortDate(d), value: c.recovery });
  }

  const cards = MARKERS.map((m) => {
    const series = markers
      .filter((x) => x[m.key] != null)
      .map((x) => ({ label: shortDate(x.date), value: x[m.key] }));
    const last = series.length ? series[series.length - 1].value : null;
    const t = trend(series.map((x) => x.value));
    const good = t == null ? null : (m.better === 'up' ? t > 0 : t < 0);

    return `
    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">${esc(m.label)}</h3>
        <span class="card__meta">${last == null ? 'kein Wert' : `${round(last, 1)} ${esc(m.unit)}`}</span>
      </div>
      ${t != null ? `<div class="small ${good ? 'tone-good' : 'tone-warn'}" style="margin-bottom:8px">
        ${t > 0 ? '+' : ''}${round(t, 1)} ${esc(m.unit)} gegenüber der ersten Hälfte deiner Einträge
      </div>` : ''}
      ${series.length >= 2
        ? `<div class="chart-readout">Zum Ablesen antippen.</div>${lineChart(series, { color: m.color, unit: m.unit, ariaLabel: m.label })}`
        : `<div class="tiny muted">${series.length === 1
          ? 'Ein Wert liegt vor – ab dem zweiten zeichnet die App den Verlauf.'
          : 'Noch kein Wert. Trag ihn ein, sobald du ihn misst.'}</div>`}
      <div class="disclose" data-disclose="marker-${esc(m.key)}">
        <button class="disclose__toggle" data-action="toggle-disclose">
          <span>Was dieser Wert aussagt</span>
          <span class="disclose__chev">${icon('chevron')}</span>
        </button>
        <div class="disclose__body"><p class="small secondary">${esc(m.why)}</p></div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="view">

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Fortschritt</h3>
        <span class="card__meta">${markers.length} Messung${markers.length === 1 ? '' : 'en'}</span>
      </div>
      <p class="small secondary">
        Fortschritt wird hier an physiologischen Markern gemessen, nicht an Zeiten über eine Distanz.
        Das ist im Wechselschichtdienst der stabilere Maßstab: Eine schlechte Woche verzerrt eine Zeit,
        aber nicht den Trend über vier Wochen.
      </p>
      <button class="btn btn--primary btn--block" style="margin-top:14px" data-action="new-marker">${icon('plus')} Messung eintragen</button>
    </div>

    ${cards}

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Wochenlast, 12 Wochen</h3>
        <span class="card__meta">Belastungspunkte</span>
      </div>
      <div class="chart-readout">Summe je Woche. Zum Ablesen antippen.</div>
      ${barChart(weeklyLoad, {
        color: 'var(--accent)',
        ariaLabel: 'Wochenlast der letzten 12 Wochen',
        emptyText: 'Noch keine eingetragenen Einheiten. Hak Trainings im Heute-Tab ab, dann füllt sich diese Kurve.',
      })}
      <div class="tiny muted" style="margin-top:8px">
        Die Treppe aus drei steigenden Wochen und einer flachen ist das Muster, das du sehen willst.
      </div>
    </div>

    ${recovery.length >= 2 ? `
    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Recovery, 28 Tage</h3>
        <span class="card__meta">⌀ ${round(mean(recovery.map((r) => r.value)), 0)} %</span>
      </div>
      <div class="chart-readout">Zum Ablesen antippen.</div>
      ${lineChart(recovery, { color: 'var(--accent)', unit: '%', min: 0, max: 100, ariaLabel: 'Recovery-Verlauf' })}
      <div class="tiny muted" style="margin-top:8px">
        Interessant ist weniger der einzelne Wert als die Frage, ob die Recovery nach harten Wochen
        wieder ihr altes Niveau erreicht. Tut sie das über zwei Blöcke nicht, ist der Umfang zu hoch.
      </div>
    </div>` : ''}

  </div>`;
}
