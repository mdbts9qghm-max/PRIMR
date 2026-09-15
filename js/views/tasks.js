// Aufgaben: tägliche Gewohnheiten oben, eigene Aufgaben darunter.

import { esc, icon } from '../ui/dom.js';
import { progressRing } from '../ui/charts.js';
import { CATEGORIES, streak, completionRate, dueOn } from '../core/tasks.js';
import { addDays, shortDate } from '../core/util.js';

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

/**
 * Raster aus Gewohnheit × Tag. Gefüllt heißt erledigt, leer heißt offen,
 * gestrichelt heißt: stand an dem Tag gar nicht an.
 */
function heatGrid(habits, days, done, shiftDayFor, todayIso) {
  if (!habits.length) return '<div class="empty tiny">Keine Gewohnheiten angelegt.</div>';

  const shiftDays = days.map((d) => shiftDayFor(d));
  const hue = (raw) => (raw === 'T' ? 'var(--shift-t)' : raw === 'N' ? 'var(--shift-n)' : 'var(--shift-f)');

  // Kopfzeile ist der Dienst des Tages, nicht der Wochentag: "Mo" und "Mi"
  // wären auf einen Buchstaben gekürzt beide "M", und der Dienst sagt hier
  // ohnehin mehr – man sieht sofort, an welchen Schichttagen es reißt.
  const header = `<div class="heat__row" style="--cols:${days.length}">
    <span class="tiny muted">Dienst</span>
    ${shiftDays.map((sd, i) => `<span class="heat__head ${days[i] === todayIso ? 'heat__head--today' : ''}"
        style="color:${hue(sd.raw)}" title="${esc(`${shortDate(days[i])} · ${sd.label}`)}">${esc(sd.code.slice(0, 1))}</span>`).join('')}
  </div>`;

  const rows = habits.map((t) => `
    <div class="heat__row" style="--cols:${days.length}">
      <span class="heat__label" title="${esc(t.title)}">${esc(t.title)}</span>
      ${days.map((d, i) => {
        const due = dueOn(t, d, shiftDays[i].key);
        const hit = (done[d] || []).includes(t.id);
        const cls = !due ? 'heat__cell--na' : hit ? 'heat__cell--on' : 'heat__cell--off';
        return `<span class="heat__cell ${cls}"
                  title="${esc(`${shortDate(d)} · ${t.title}: ${!due ? 'stand nicht an' : hit ? 'erledigt' : 'offen'}`)}"></span>`;
      }).join('')}
    </div>`).join('');

  return `<div class="heat" role="img" aria-label="Gewohnheiten der letzten Tage">${header}${rows}</div>
    <div class="legend" style="margin-top:10px">
      <span class="legend__item"><span class="legend__swatch heat__cell--on" style="background:var(--accent)"></span>erledigt</span>
      <span class="legend__item"><span class="legend__swatch" style="background:var(--surface-2)"></span>offen</span>
      <span class="legend__item"><span class="legend__swatch" style="background:transparent;border:1px dashed var(--line)"></span>stand nicht an</span>
    </div>`;
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
  const bestStreak = habits
    .map((t) => ({ title: t.title, days: streaks[t.id] }))
    .filter((x) => x.days >= 3)
    .sort((a, b) => b.days - a.days)[0] || null;

  const DAYS = 10;  // genau zwei Fünferblöcke des Dienstplans
  const days = Array.from({ length: DAYS }, (_, i) => addDays(ctx.date, -(DAYS - 1 - i)));
  const doneHabits = habits.filter((t) => ctx.doneToday.includes(t.id));
  const dueHabits = habits.filter((t) => dueOn(t, ctx.date, ctx.day.key));

  return `
  <div class="view">

    <div class="card">
      <div class="row" style="gap:16px;align-items:center">
        <div style="flex:none">${progressRing(doneHabits.length, dueHabits.length, {
          size: 84,
          color: dueHabits.length && doneHabits.length === dueHabits.length ? 'var(--good)' : 'var(--accent)',
          ariaLabel: `${doneHabits.length} von ${dueHabits.length} Gewohnheiten erledigt`,
        })}</div>
        <div class="grow" style="min-width:0">
          <h3 class="card__title">Gewohnheiten heute</h3>
          <div class="tiny muted" style="margin-top:4px">
            ${rate14.pct == null ? 'Noch keine Historie.' : `${rate14.pct} % über die letzten 14 Tage`}
          </div>
          ${bestStreak ? `<div class="tiny secondary" style="margin-top:6px">Längste Serie: ${bestStreak.days} Tage · ${esc(bestStreak.title)}</div>` : ''}
        </div>
      </div>

      <div class="divider" style="margin:16px 0 12px"></div>

      <div class="section-label" style="margin-bottom:10px">Letzte ${DAYS} Tage · zwei Dienstblöcke</div>
      ${heatGrid(habits, days, s.done, ctx.shiftDayFor, ctx.date)}

      <div class="divider" style="margin:16px 0 2px"></div>
      ${taskList(dueHabits, ctx.doneToday, ctx.date, { showMeta: true, editable: true, streaks })}
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
