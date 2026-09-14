// Aufgaben: tägliche Gewohnheiten oben, eigene Aufgaben darunter.

import { esc, icon } from '../ui/dom.js';
import { barChart, meter } from '../ui/charts.js';
import { CATEGORIES, streak, completionRate, dueOn } from '../core/tasks.js';
import { addDays, weekdayShort, shortDate } from '../core/util.js';

const REPEAT_LABEL = {
  daily: 'täglich',
  weekdays: 'an festen Wochentagen',
  shift: 'an bestimmten Schichttagen',
  once: 'einmalig',
};

export function taskList(tasks, done, date, opts = {}) {
  if (!tasks.length) {
    return '<div class="empty">Für heute steht nichts an.</div>';
  }
  return `<div class="list">${tasks.map((t) => {
    const checked = done.includes(t.id);
    return `<div class="list__item">
      <button class="check" role="checkbox" aria-checked="${checked}" aria-label="${esc(t.title)}"
              data-action="toggle-task" data-id="${esc(t.id)}" data-date="${esc(date)}">${icon('check')}</button>
      <div class="grow" style="min-width:0">
        <div class="${checked ? 'done-text' : ''}" style="font-size:15px">${esc(t.title)}</div>
        ${t.note ? `<div class="tiny muted" style="margin-top:2px">${esc(t.note)}</div>` : ''}
        ${opts.showMeta ? `<div class="row wrap" style="gap:6px;margin-top:7px">
          <span class="chip" style="padding:2px 8px">${esc(CATEGORIES[t.category] ? CATEGORIES[t.category].label : t.category)}</span>
          <span class="chip" style="padding:2px 8px">${esc(REPEAT_LABEL[t.repeat] || t.repeat)}</span>
          ${opts.streaks && opts.streaks[t.id] > 1 ? `<span class="chip" style="padding:2px 8px">${opts.streaks[t.id]} Tage in Folge</span>` : ''}
        </div>` : ''}
      </div>
      ${opts.editable ? `<button class="icon-btn" style="width:32px;height:32px"
          data-action="edit-task" data-id="${esc(t.id)}" aria-label="Bearbeiten">${icon('settings')}</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

export function render(ctx) {
  const s = ctx.state;
  const habits = s.tasks.filter((t) => t.habit && !t.archived);
  const own = s.tasks.filter((t) => !t.habit && !t.archived);
  const todayOwn = own.filter((t) => dueOn(t, ctx.date, ctx.day.key));
  const laterOwn = own.filter((t) => !dueOn(t, ctx.date, ctx.day.key) && !(t.repeat === 'once' && t.due && t.due < ctx.date));

  const shiftKeyFor = (d) => ctx.shiftKeyFor(d);
  const streaks = {};
  habits.forEach((t) => { streaks[t.id] = streak(t, s.done, ctx.date, shiftKeyFor); });

  const rate14 = completionRate(habits, s.done, ctx.date, 14, shiftKeyFor);

  const bars = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = addDays(ctx.date, -i);
    const dayTasks = habits.filter((t) => dueOn(t, d, shiftKeyFor(d)));
    const hit = (s.done[d] || []).filter((id) => dayTasks.some((t) => t.id === id)).length;
    const pct = dayTasks.length ? Math.round((hit / dayTasks.length) * 100) : 0;
    bars.push({
      label: shortDate(d),
      value: pct,
      tick: i % 3 === 0 ? weekdayShort(d) : '',
      dim: d === ctx.date,
      readout: `${shortDate(d)}: ${hit} von ${dayTasks.length} erledigt (${pct} %)`,
    });
  }

  return `
  <div class="view">

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Gewohnheiten, letzte 14 Tage</h3>
        <span class="card__meta">${rate14.pct == null ? '–' : `${rate14.pct} %`}</span>
      </div>
      <div class="chart-readout">Anteil erledigter Gewohnheiten je Tag. Zum Ablesen antippen.</div>
      ${barChart(bars, {
        max: 100,
        color: 'var(--accent)',
        ariaLabel: 'Erledigungsquote der letzten 14 Tage',
        emptyText: 'Noch nichts abgehakt. Ab dem ersten Tag siehst du hier deine Quote.',
      })}
      <div class="tiny muted" style="margin-top:8px">${rate14.hit} von ${rate14.due} fälligen Gewohnheiten erledigt.</div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Tägliche Gewohnheiten</h3>
        <span class="card__meta">${habits.filter((t) => ctx.doneToday.includes(t.id)).length} / ${habits.length}</span>
      </div>
      ${meter(habits.filter((t) => ctx.doneToday.includes(t.id)).length, habits.length)}
      <div style="margin-top:6px">
        ${taskList(habits.filter((t) => dueOn(t, ctx.date, ctx.day.key)), ctx.doneToday, ctx.date, { showMeta: true, editable: true, streaks })}
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Eigene Aufgaben</h3>
        <span class="card__meta">${todayOwn.length} heute</span>
      </div>
      ${ctx.overdue.length ? `<div class="note note--warn" style="margin-bottom:12px">
        <strong>Überfällig</strong>
        <div class="list" style="margin-top:6px">
          ${ctx.overdue.map((t) => `<div class="list__item" style="padding:8px 0">
            <button class="check" role="checkbox" aria-checked="false" aria-label="${esc(t.title)}"
                    data-action="toggle-task" data-id="${esc(t.id)}" data-date="${esc(t.due)}">${icon('check')}</button>
            <div class="grow"><div style="font-size:14px">${esc(t.title)}</div>
            <div class="tiny muted">fällig war ${esc(shortDate(t.due))}</div></div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      ${taskList(todayOwn, ctx.doneToday, ctx.date, { showMeta: true, editable: true })}

      ${laterOwn.length ? `
        <div class="disclose" data-disclose="later">
          <button class="disclose__toggle" data-action="toggle-disclose">
            <span>Später fällig (${laterOwn.length})</span>
            <span class="disclose__chev">${icon('chevron')}</span>
          </button>
          <div class="disclose__body">
            <div class="list">${laterOwn.map((t) => `<div class="list__item">
              <div class="grow"><div style="font-size:14px">${esc(t.title)}</div>
              <div class="tiny muted">${esc(t.due ? shortDate(t.due) : REPEAT_LABEL[t.repeat] || '')}</div></div>
              <button class="icon-btn" style="width:32px;height:32px" data-action="edit-task" data-id="${esc(t.id)}" aria-label="Bearbeiten">${icon('settings')}</button>
            </div>`).join('')}</div>
          </div>
        </div>` : ''}

      <button class="btn btn--primary btn--block" style="margin-top:14px" data-action="new-task">${icon('plus')} Aufgabe hinzufügen</button>
    </div>

  </div>`;
}
