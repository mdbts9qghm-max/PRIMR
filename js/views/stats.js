// Werte: Fortschritt an physiologischen Markern, nicht an Wettkampfzeiten.
// VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und Herzfrequenzerholung.

import { esc, icon } from '../ui/dom.js';
import { lineChart, barChart } from '../ui/charts.js';
import { addDays, shortDate, round, mean, weekStart } from '../core/util.js';
import { vertRateTarget, racePlan } from '../core/race.js';

export const MARKERS = [
  {
    key: 'vertRate',
    label: 'Steigrate',
    unit: 'hm/h',
    better: 'up',
    color: 'var(--accent)',
    raceOnly: true,
    why: 'Wie viele Höhenmeter du pro Stunde im Renntempo steigst – gemessen in den Bergwiederholungen. Im Gelände sagt eine Pace nichts aus, diese Zahl schon. Sie ist der direkteste Gradmesser dafür, ob du im Zeitlimit ankommst.',
    target: (race, helpers) => ({
      value: helpers.vertRateTarget(race),
      text: `Für ${race.vertM} hm in ${helpers.targetHours} h brauchst du rund ${helpers.vertRateTarget(race)} hm/h im Anstieg.`,
    }),
  },
  {
    key: 'hfDrift',
    label: 'HF-Drift im Longrun',
    unit: '%',
    better: 'down',
    color: 'var(--shift-n)',
    raceOnly: true,
    why: 'Um wie viel deine Herzfrequenz in der zweiten Hälfte einer langen Einheit steigt, obwohl das Tempo gleich bleibt. Unter 5 % heißt: Die Grundlage trägt. Über 10 % heißt: zu schnell gestartet, zu wenig getrunken oder die Distanz ist noch zu lang für den jetzigen Stand.',
    target: () => ({ value: 5, text: 'Unter 5 % ist das Ziel. Über 10 % ist ein Warnsignal.' }),
  },
  {
    key: 'vo2max',
    label: 'VO2max',
    unit: 'ml/kg/min',
    better: 'up',
    color: 'var(--accent)',
    why: 'Die Obergrenze deiner Ausdauerleistung. Für ein Rennen über 19 Stunden ist sie der unwichtigste der hier gelisteten Werte – entscheidend ist, wie lange du unterhalb davon durchhältst, nicht wie hoch sie liegt.',
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

  const race = s.settings.race;
  const cards = MARKERS.filter((m) => !m.raceOnly || race).map((m) => {
    const target = race && m.target ? m.target(race, {
      vertRateTarget,
      targetHours: racePlan(race).targetHours,
    }) : null;
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
      ${target ? `<div class="row wrap" style="gap:6px;margin-bottom:10px">
        <span class="chip ${last != null && (m.better === 'up' ? last >= target.value : last <= target.value) ? 'chip--on' : ''}">
          Ziel ${target.value} ${esc(m.unit)}
        </span>
      </div>` : ''}
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
        <div class="disclose__body">
          <p class="small secondary">${esc(m.why)}</p>
          ${target ? `<p class="small secondary" style="margin-top:8px"><strong>${esc(target.text)}</strong></p>` : ''}
        </div>
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
      ${race ? `<div class="note" style="margin-top:12px">
        Für ${esc(race.name)} zählen vor allem die beiden obersten Werte: die Steigrate, weil sie
        direkt über das Zeitlimit entscheidet, und die HF-Drift, weil sie zeigt, ob die Grundlage
        die Renndauer trägt. VO2max steht bewusst weiter unten.
      </div>` : ''}
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
