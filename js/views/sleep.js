// Schlaf: das Fenster für heute, die Routinen davor und danach,
// und wie gut die letzten zwei Wochen tatsächlich gelaufen sind.

import { esc } from '../ui/dom.js';
import { barChart, lineChart } from '../ui/charts.js';
import { shiftBadge } from '../ui/components.js';
import {
  sleepPlan, sleepTargetHours, morningRoutine, eveningRoutine,
} from '../core/sleep.js';
import { addDays, shortDate, weekdayShort, round, durationLabel } from '../core/util.js';

function routineList(items) {
  return `<div class="list">${items.map((r) => `
    <div class="list__item" style="padding:11px 0">
      <div class="num tiny muted" style="width:52px;flex:none;padding-top:2px">${esc(r.time)}</div>
      <div class="grow small">${esc(r.text)}</div>
    </div>`).join('')}</div>`;
}

export function render(ctx) {
  const s = ctx.state;

  const bars = [];
  const line = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = addDays(ctx.date, -i);
    const c = s.checkins.find((x) => x.date === d);
    const target = sleepTargetHours(ctx.shiftKeyFor(d));
    bars.push({
      label: shortDate(d),
      value: c && c.sleepHours != null ? c.sleepHours : 0,
      tick: i % 3 === 0 ? weekdayShort(d) : '',
      readout: c && c.sleepHours != null
        ? `${shortDate(d)}: ${round(c.sleepHours, 1)} h von ${target} h Soll`
        : `${shortDate(d)}: kein Eintrag`,
    });
    if (c && c.sleepPerformance != null) line.push({ label: shortDate(d), value: c.sleepPerformance });
  }
  const logged = bars.filter((b) => b.value > 0);
  const avg = logged.length ? logged.reduce((a, b) => a + b.value, 0) / logged.length : null;

  const upcoming = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(ctx.date, i);
    const key = ctx.shiftKeyFor(d);
    upcoming.push({ date: d, key, plan: sleepPlan(key) });
  }

  return `
  <div class="view">

    <div class="card card--accent">
      <div class="section-label">Schlaf heute</div>
      <div class="row wrap" style="gap:8px;margin-top:10px">${shiftBadge(ctx.day)}</div>
      <p class="small secondary" style="margin-top:10px">${esc(ctx.sleep.summary)}</p>
      <div class="divider" style="margin:14px 0"></div>
      <div class="stack">
        ${ctx.sleep.blocks.map((b) => `
          <div class="row row--between">
            <div>
              <div class="small">${esc(b.label)}</div>
              <div class="tiny muted">${b.kind === 'vorschlaf' ? 'Zusatzschlaf, zählt nicht aufs Soll' : 'zählt aufs Tagessoll'}</div>
            </div>
            <div style="text-align:right">
              <div class="num">${esc(b.from)} – ${esc(b.to)}</div>
              <div class="tiny muted">${durationLabel(b.durationMin)}</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="row wrap" style="gap:6px;margin-top:14px">
        <span class="chip">Soll ${ctx.sleepTarget} h</span>
        <span class="chip">Koffein-Stopp ${esc(ctx.caffeine)}</span>
        <span class="chip">Letzte große Mahlzeit ${esc(ctx.lastMeal)}</span>
        <span class="chip">Bildschirm aus ${esc(ctx.screens)}</span>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Abendroutine</h3>
        <span class="card__meta">rückwärts vom Hauptschlaf</span>
      </div>
      ${routineList(eveningRoutine(ctx.day.key))}
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Morgenroutine</h3>
        <span class="card__meta">${esc(ctx.day.label)}</span>
      </div>
      ${routineList(morningRoutine(ctx.day.key))}
    </div>

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Schlafdauer, 14 Tage</h3>
        <span class="card__meta">${avg == null ? '–' : `⌀ ${round(avg, 1)} h`}</span>
      </div>
      <div class="chart-readout">Stunden je Nacht aus deinen Check-ins. Zum Ablesen antippen.</div>
      ${barChart(bars, {
        max: 10,
        color: 'var(--shift-n)',
        reference: ctx.sleepTarget,
        ariaLabel: 'Schlafdauer der letzten 14 Tage',
        emptyText: 'Noch keine Schlafwerte. Sie entstehen aus deinen täglichen Check-ins.',
      })}
      <div class="tiny muted" style="margin-top:8px">
        Die gestrichelte Linie ist dein heutiges Soll (${ctx.sleepTarget} h). Im Wechselschichtdienst zählt nicht
        die einzelne Nacht, sondern der Schnitt über den ganzen Zyklus.
      </div>
    </div>

    ${line.length >= 2 ? `
    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Schlaf-Performance</h3>
        <span class="card__meta">Prozent des Bedarfs</span>
      </div>
      <div class="chart-readout">Zum Ablesen antippen.</div>
      ${lineChart(line, { color: 'var(--shift-n)', unit: '%', min: 0, max: 100, ariaLabel: 'Schlaf-Performance' })}
    </div>` : ''}

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Die nächsten sieben Tage</h3>
        <span class="card__meta">Schlaffenster</span>
      </div>
      <div class="list">
        ${upcoming.map((u) => `
          <div class="list__item">
            <div style="width:44px;flex:none">
              <div class="tiny">${weekdayShort(u.date)}</div>
              <div class="tiny muted num">${shortDate(u.date)}</div>
            </div>
            <div class="grow small secondary">${esc(u.plan.summary)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Warum diese Zeiten</h3>
      </div>
      <div class="stack small secondary">
        <p>Die feste Aufstehzeit von 08:00 an freien Tagen und vor der Nachtschicht ist der Anker des ganzen
        Systems. Wer im Frei bis mittags schläft, bekommt den Vorschlaf um 15:00 nicht mehr hin – und dann
        fehlt in der Nacht die Substanz.</p>
        <p>Der Vorschlaf von 15:00 bis 17:30 liegt bewusst in der natürlichen Nachmittagssenke. Er ersetzt
        keinen Nachtschlaf, aber er halbiert den Leistungseinbruch zwischen 03:00 und 05:00.</p>
        <p>Nach der Nacht ab 08:00 ins Bett, nicht später: Je weiter der Morgenschlaf in den Tag rutscht,
        desto kürzer und flacher wird er, weil die innere Uhr auf wach schaltet.</p>
        <p>Der Schlaftag mit 08:00–14:00 und wieder 00:00 ist eine Doppelstrategie – erst den Schlafdruck
        abbauen, dann früh genug wieder in die normale Nacht finden.</p>
        <p>Vor der Tagschicht um 22:00 ins Bett: Bei Aufstehen um 05:30 sind das siebeneinhalb Stunden.
        Alles später kostet dich direkt Tiefschlaf, weil der Wecker nicht verhandelt.</p>
      </div>
    </div>

  </div>`;
}
