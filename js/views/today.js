// Heute: Datum, Schichttag, WHOOP-Werte mit Deutung, die Einheit des Tages
// und die anstehenden Aufgaben – in genau dieser Reihenfolge.

import { esc, icon } from '../ui/dom.js';
import { readinessRing, meter, timelineBar, timelineLegend, sparkline, progressRing } from '../ui/charts.js';
import { sessionCard, shiftBadge, blockPosition } from '../ui/components.js';
import { BLOCK_POSITIONS } from '../core/shift.js';
import { longDate, round, durationLabel, weekdayShort, shortDate } from '../core/util.js';
import { taskList } from './tasks.js';

function metric(label, value, unit, delta, deltaTone) {
  return `<div class="metric">
    <div class="metric__label">${esc(label)}</div>
    <div class="metric__value">${value == null ? '–' : esc(String(value))}${unit ? `<span class="metric__unit">${esc(unit)}</span>` : ''}</div>
    ${delta ? `<div class="metric__delta ${deltaTone || 'muted'}">${esc(delta)}</div>` : ''}
  </div>`;
}

function whoopGrid(ctx) {
  const c = ctx.checkin;
  const b = ctx.baselines;
  if (!c) {
    return `<div class="empty">Noch kein Check-in für heute.<br>
      <button class="btn btn--primary" style="margin-top:14px" data-action="open-checkin">Check-in starten</button></div>`;
  }
  const hrvDelta = c.hrv != null && b.hrv ? `${c.hrv >= b.hrv ? '+' : ''}${round(c.hrv - b.hrv)} ms vs. Schnitt` : null;
  const rhrDelta = c.rhr != null && b.rhr ? `${c.rhr >= b.rhr ? '+' : ''}${round(c.rhr - b.rhr, 1)} bpm vs. Schnitt` : null;
  const sleepDelta = c.sleepHours != null ? `Soll ${ctx.sleepTarget} h` : null;

  return `<div class="metric-grid">
    ${metric('Recovery', c.recovery, ' %')}
    ${metric('HRV', c.hrv, ' ms', hrvDelta, c.hrv != null && b.hrv ? (c.hrv >= b.hrv ? 'tone-good' : 'tone-warn') : '')}
    ${metric('Ruhepuls', c.rhr, ' bpm', rhrDelta, c.rhr != null && b.rhr ? (c.rhr <= b.rhr ? 'tone-good' : 'tone-warn') : '')}
    ${metric('Schlaf', c.sleepHours != null ? round(c.sleepHours, 1) : null, ' h', sleepDelta)}
    ${metric('Schlaf-Perf.', c.sleepPerformance, ' %')}
    ${metric('Strain gestern', c.strain != null ? round(c.strain, 1) : null)}
  </div>`;
}

function impactPanel(ctx) {
  const r = ctx.readiness;
  if (!r) return '';
  const parts = r.parts.map((p) => `
    <div class="block-row">
      <div class="block-row__rail" style="background:${p.points >= 70 ? 'var(--good)' : p.points >= 45 ? 'var(--warn)' : 'var(--critical)'}"></div>
      <div class="grow">
        <div class="row row--between">
          <span class="block-row__label">${esc(p.label)}</span>
          <span class="small num secondary">${esc(p.value)}</span>
        </div>
        <div class="block-row__detail">${esc(p.detail)}</div>
        <div style="margin-top:7px">${meter(p.points, 100, p.points >= 70 ? 'var(--good)' : p.points >= 45 ? 'var(--warn)' : 'var(--critical)')}</div>
      </div>
    </div>`).join('');

  const adj = r.adjustments.length ? `
    <div class="divider"></div>
    <div class="section-label" style="margin-bottom:8px">Korrekturen</div>
    ${r.adjustments.map((a) => `<div class="small secondary" style="margin-bottom:8px">
      <span class="num ${a.delta < 0 ? 'tone-warn' : 'tone-good'}">${a.delta > 0 ? '+' : ''}${a.delta}</span>
      &nbsp;<strong>${esc(a.label)}</strong> — ${esc(a.detail)}</div>`).join('')}` : '';

  const advice = ctx.advice.length ? `
    <div class="divider"></div>
    <div class="section-label" style="margin-bottom:8px">Was das für heute heißt</div>
    <div class="stack">
      ${ctx.advice.map((t) => `<div class="note"><strong>${esc(t.label)}</strong><br>${esc(t.text)}</div>`).join('')}
    </div>` : '';

  return `
    <div class="note" style="margin-bottom:14px"><strong>Training:</strong> ${esc(ctx.directive.text)}</div>
    <div class="section-label" style="margin-bottom:8px">Woher der Wert kommt</div>
    <div class="list">${parts}</div>
    ${ctx.baselines.samples < 7 ? `<div class="tiny muted" style="margin-top:10px">
      HRV und Ruhepuls fließen erst ein, wenn ein eigener Vergleichswert vorliegt. Nach etwa
      sieben Check-ins ist der Schnitt belastbar – bis dahin tragen Recovery und Schlaf den Wert.
    </div>` : ''}
    ${adj}
    ${advice}`;
}

export function render(ctx) {
  const r = ctx.readiness;
  const load = ctx.load;
  const trend = ctx.readinessTrend || [];
  const doneCount = ctx.doneToday.filter((id) => ctx.tasks.some((t) => t.id === id)).length;
  const rc = ctx.plan ? ctx.plan.race : null;

  return `
  <div class="view">

    <div class="card">
      <div class="section-label">${esc(longDate(ctx.date))}</div>
      <div class="row wrap" style="gap:8px;margin-top:10px">
        ${shiftBadge(ctx.day)}
        ${ctx.day.overridden ? '<span class="chip">abweichend eingetragen</span>' : ''}
      </div>
      <p class="small secondary" style="margin-top:10px">${esc(ctx.day.note)}</p>

      <div style="margin-top:14px">
        ${blockPosition(ctx.day, BLOCK_POSITIONS)}
        <div class="row row--between" style="margin-top:6px">
          <span class="tiny muted">${ctx.day.absence
            ? `Regeldienst wäre ${esc(BLOCK_POSITIONS[ctx.day.index % BLOCK_POSITIONS.length].code)}`
            : `Block ${Math.floor(ctx.day.index / BLOCK_POSITIONS.length) + 1} von ${Math.round(ctx.state.shift.cycle.length / BLOCK_POSITIONS.length)}`}</span>
          <span class="tiny muted">Zyklustag ${ctx.day.index + 1} von ${ctx.state.shift.cycle.length}</span>
        </div>
      </div>
      <div style="margin-top:16px" data-chart>
        <div class="row row--between" style="margin-bottom:8px">
          <span class="section-label">Dein Tag</span>
          <span class="tiny muted num">${esc(ctx.sleep.wake)} → ${esc(ctx.sleep.after.to)} · ${durationLabel(ctx.timeline.spanMin)}</span>
        </div>
        <div class="chart-readout">Vom Aufstehen bis zum Aufstehen morgen. Zum Ablesen antippen.</div>
        ${timelineBar(ctx.timeline, {
          ticks: ctx.timelineTicks,
          now: ctx.timelineNow,
          ariaLabel: 'Tagesverlauf mit Dienst, Trainingsfenster und Schlaf',
        })}
        ${timelineLegend(ctx.timeline)}
      </div>

      ${!ctx.state.shift.confirmed ? `<div class="note note--warn" style="margin-top:12px">
        Die App weiß noch nicht, wo im Block T · N · Ü · DF · DF du heute stehst. Bis dahin ist der
        angezeigte Dienst geraten.
        <div style="margin-top:10px"><button class="btn btn--sm" data-action="open-shift-editor">Heutigen Dienst wählen</button></div>
      </div>` : ''}
    </div>

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Bereitschaft</h3>
        <span class="card__meta">${ctx.checkin ? 'aus deinem Check-in' : 'kein Check-in'}</span>
      </div>
      ${r ? `
        <div class="row" style="gap:18px;align-items:center">
          <div style="flex:none">${readinessRing(r.score, r.band.tone, r.band.headline)}</div>
          <div class="grow" style="min-width:0">
            <div class="row" style="gap:8px">
              <span class="chip__dot tone-${r.band.tone}" style="background:currentColor"></span>
              <strong class="tone-${r.band.tone}">${esc(r.band.label)}</strong>
            </div>
            <div style="font-size:17px;font-weight:600;margin-top:4px">${esc(r.band.headline)}</div>
            ${trend.length >= 2 ? `<div style="margin-top:10px">
              ${sparkline(trend.map((t) => t.score), { color: 'var(--text-muted)', ariaLabel: 'Bereitschaft der letzten Tage' })}
              <div class="tiny muted" style="margin-top:2px">letzte ${trend.length} Check-ins</div>
            </div>` : ''}
            <div class="tiny muted" style="margin-top:8px">7-Tage-Last ${load.acute}${load.ratio ? ` · Verhältnis ${load.ratio}` : ''}</div>
          </div>
        </div>` : ''}

      <div style="margin-top:14px">${whoopGrid(ctx)}</div>

      ${r ? `
      <div class="disclose" data-disclose="impact">
        <button class="disclose__toggle" data-action="toggle-disclose">
          <span>Auswirkungen auf Tag und Training</span>
          <span class="disclose__chev">${icon('chevron')}</span>
        </button>
        <div class="disclose__body">${impactPanel(ctx)}</div>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn--ghost btn--block btn--sm" data-action="open-checkin">Werte korrigieren</button>
      </div>` : ''}
    </div>

    ${ctx.ramp ? `<div class="card">
      <div class="section-label">Wiedereinstieg</div>
      <div class="row row--between" style="margin-top:10px;align-items:flex-end">
        <div class="grow">
          <div style="font-size:17px;font-weight:600">Tag ${ctx.ramp.dayIndex} von ${ctx.ramp.rampDays}</div>
          <div class="tiny muted" style="margin-top:3px">nach ${ctx.ramp.illnessDays} Krankheitstag${ctx.ramp.illnessDays === 1 ? '' : 'en'}</div>
        </div>
        <div class="num tone-warn" style="font-size:20px;font-weight:600">${Math.round(ctx.ramp.factor * 100)} %</div>
      </div>
      <div style="margin-top:10px">${meter(ctx.ramp.dayIndex, ctx.ramp.rampDays, 'var(--warn)')}</div>
      <div class="note note--warn" style="margin-top:12px">
        Keine harten Reize, Umfang auf ${Math.round(ctx.ramp.factor * 100)} %. Ab
        ${ctx.ramp.remaining === 1 ? 'morgen' : `in ${ctx.ramp.remaining} Tagen`} plant die App wieder normal.
        Wenn Ruhepuls oder HRV noch abweichen, trag lieber einen Tag mehr Krankheit ein als einen zu wenig.
      </div>
    </div>` : ''}

    ${ctx.moveTo ? `<div class="card">
      <div class="section-label">Vorschlag</div>
      <p class="small secondary" style="margin-top:8px">
        <strong>${esc(ctx.moveTo.title)}</strong> ist die Schlüsseleinheit dieser Woche. Bei deinem
        heutigen Wert würde sie gekürzt – in der Rennvorbereitung ist es besser, sie zu verschieben.
        Am ${esc(weekdayShort(ctx.moveTo.date))}, ${esc(shortDate(ctx.moveTo.date))} ist
        ${esc(ctx.moveTo.label)} und noch nichts geplant.
      </p>
      <div class="btn-group" style="margin-top:12px">
        <button class="btn" data-action="skip-session" data-date="${esc(ctx.date)}" data-slot="${esc(ctx.entry.slot)}">Heute auslassen</button>
      </div>
    </div>` : ''}

    ${ctx.entry && ctx.session && ctx.session.kind !== 'rest' && ctx.session.kind !== 'sick' ? `
    <div class="row wrap" style="gap:6px;margin:2px 0 -6px">
      ${ctx.beforeStart ? `<span class="chip">Vorbereitung ab ${esc(shortDate(ctx.beforeStart))}</span>`
        : rc ? `<span class="chip">${esc(rc.phase.label)} · noch ${rc.weeksOut} Wochen</span>` : ''}
      ${ctx.isKeySession ? '<span class="chip chip--on">Schlüsseleinheit der Woche</span>' : ''}
      ${ctx.session.vertM ? `<span class="chip">${ctx.session.vertM} hm</span>` : ''}
    </div>` : ''}

    ${sessionCard(ctx.session, {
      window: ctx.window,
      why: ctx.entry ? ctx.entry.why : null,
      note: ctx.sessionNote,
      changed: ctx.sessionChanged,
      date: ctx.date,
      logged: ctx.logged,
      slot: ctx.entry ? ctx.entry.slot : null,
      label: 'Training heute',
    })}

    ${ctx.extra ? sessionCard(ctx.extra, {
      window: ctx.window,
      date: ctx.date,
      logged: ctx.logged,
      slot: ctx.entry.extra.slot,
      label: 'Zweite Einheit heute',
      why: 'Zwei lockere Einheiten an einem freien Tag – so gehen drei Läufe und drei Krafteinheiten auch in eine Woche mit zwei Tagschichten.',
    }) : ''}

    ${ctx.tomorrow ? `<div class="card">
      <div class="row row--between" style="align-items:flex-start;gap:12px">
        <div class="grow" style="min-width:0">
          <div class="section-label">Morgen</div>
          <div style="font-size:15px;font-weight:500;margin-top:5px">${esc(ctx.tomorrow.session.title)}</div>
          <div class="tiny muted" style="margin-top:3px">${esc(ctx.tomorrow.shift.label)}${
            ctx.tomorrow.session.durationMin ? ` · ${durationLabel(ctx.tomorrow.session.durationMin)}` : ''}</div>
        </div>
        <span class="chip" style="flex:none">${esc(ctx.tomorrow.shift.code)}</span>
      </div>
      ${ctx.tomorrow.session.hard ? `<div class="note note--warn" style="margin-top:12px">
        Morgen steht eine harte Einheit an. Heute Abend zählt der Schlaf mehr als alles andere.
      </div>` : ''}
    </div>` : ''}

    <div class="card">
      <div class="row" style="gap:16px;align-items:center;margin-bottom:6px">
        <div style="flex:none">${progressRing(doneCount, ctx.tasks.length, {
          size: 76,
          color: doneCount === ctx.tasks.length && ctx.tasks.length ? 'var(--good)' : 'var(--accent)',
          ariaLabel: `${doneCount} von ${ctx.tasks.length} Aufgaben erledigt`,
        })}</div>
        <div class="grow">
          <h3 class="card__title">Aufgaben heute</h3>
          <div class="tiny muted" style="margin-top:4px">
            ${ctx.tasks.length === 0 ? 'Für heute steht nichts an.'
              : doneCount === ctx.tasks.length ? 'Alles abgehakt.'
                : `${ctx.tasks.length - doneCount} offen`}
          </div>
        </div>
      </div>
      ${taskList(ctx.tasks, ctx.doneToday, ctx.date)}
      ${ctx.overdue.length ? `<div class="note note--warn" style="margin-top:12px">
        ${ctx.overdue.length} überfällige Aufgabe${ctx.overdue.length === 1 ? '' : 'n'} aus den Vortagen.
        <button class="btn btn--sm" style="margin-top:10px" data-action="go-tab" data-tab="tasks">Im Aufgaben-Tab ansehen</button>
      </div>` : ''}
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Schlaf heute</h3>
        <span class="card__meta">ab ${esc(ctx.sleep.after.from)}</span>
      </div>
      <div class="stack">
        ${[...ctx.sleep.naps, ctx.sleep.after].map((b) => `<div class="row row--between">
          <span class="small">${esc(b.label)}</span>
          <span class="num secondary">${esc(b.from)} – ${esc(b.to)} <span class="muted tiny">(${durationLabel(b.durationMin)})</span></span>
        </div>`).join('')}
      </div>
      <div class="row wrap" style="gap:6px;margin-top:12px">
        <span class="chip">Koffein-Stopp ${esc(ctx.caffeine)}</span>
        <span class="chip">Bildschirm aus ${esc(ctx.screens)}</span>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn--ghost btn--block btn--sm" data-action="go-tab" data-tab="sleep">Routinen für heute ansehen</button>
      </div>
    </div>

  </div>`;
}
