// Vollflächige Formulare: Check-in, Aufgabe, Messung, Einstellungen,
// Schichtplan-Editor und die Detailansicht eines Plantages.

import { esc, icon } from '../ui/dom.js';
import { shiftBadge, sessionCard } from '../ui/components.js';
import { longDate, shortDate, weekdayShort, addDays, round } from '../core/util.js';
import { CATEGORIES } from '../core/tasks.js';
import { MARKERS } from './stats.js';
import { CYCLE_LENGTH } from '../core/shift.js';
import { sleepPlan } from '../core/sleep.js';

function head(title, subtitle) {
  return `<div class="row row--between" style="align-items:flex-start">
    <div>
      <h2 style="font-size:22px">${esc(title)}</h2>
      ${subtitle ? `<div class="small muted" style="margin-top:3px">${esc(subtitle)}</div>` : ''}
    </div>
    <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${icon('close')}</button>
  </div>`;
}

function numField(name, label, hint, value, extra = '') {
  return `<div class="field">
    <label class="field__label" for="f-${name}">${esc(label)}</label>
    <input id="f-${name}" name="${name}" type="number" inputmode="decimal" ${extra}
           value="${value == null ? '' : esc(String(value))}" placeholder="–">
    ${hint ? `<div class="field__hint">${esc(hint)}</div>` : ''}
  </div>`;
}

/* ---------------- Check-in ---------------- */

export function checkinSheet(ctx) {
  const c = ctx.checkin || {};
  const soreness = c.soreness || 0;
  return `<div class="sheet__inner">
    ${head('Daily Check-in', longDate(ctx.date))}

    <div class="card">
      <div class="row wrap" style="gap:8px">${shiftBadge(ctx.day)}</div>
      <p class="small secondary" style="margin-top:10px">
        Öffne WHOOP und übertrag die sechs Werte. Daraus berechnet die App deine Bereitschaft,
        passt das Training an und schreibt den Verlauf für den Werte-Tab mit.
      </p>
    </div>

    <form id="checkin-form" class="stack">
      <div class="card stack">
        <div class="section-label">Erholung</div>
        ${numField('recovery', 'Recovery', 'Der große Prozentwert auf dem Startbildschirm.', c.recovery, 'min="0" max="100" step="1"')}
        ${numField('hrv', 'HRV', 'Herzfrequenzvariabilität in Millisekunden.', c.hrv, 'min="0" max="300" step="1"')}
        ${numField('rhr', 'Ruhepuls', 'Schläge pro Minute im Schlaf.', c.rhr, 'min="25" max="120" step="1"')}
      </div>

      <div class="card stack">
        <div class="section-label">Schlaf</div>
        ${numField('sleepHours', 'Schlafdauer', `Stunden gesamt. Soll für heute: ${ctx.sleepTarget} h.`, c.sleepHours, 'min="0" max="16" step="0.1"')}
        ${numField('sleepPerformance', 'Schlaf-Performance', 'Prozent des Schlafbedarfs, den WHOOP ausweist.', c.sleepPerformance, 'min="0" max="100" step="1"')}
      </div>

      <div class="card stack">
        <div class="section-label">Gestern</div>
        ${numField('strain', 'Strain', 'Belastungswert des Vortags, 0 bis 21.', c.strain, 'min="0" max="21" step="0.1"')}
        <div class="field">
          <span class="field__label">Muskelgefühl</span>
          <div class="seg" role="group" data-seg="soreness">
            ${['frisch', 'leicht', 'spürbar', 'deutlich', 'stark'].map((l, i) => `
              <button type="button" data-action="seg" data-seg="soreness" data-value="${i + 1}"
                      aria-pressed="${soreness === i + 1}">${l}</button>`).join('')}
          </div>
          <input type="hidden" name="soreness" value="${soreness || ''}">
          <div class="field__hint">Dein eigenes Urteil korrigiert, was die Uhr nicht sieht.</div>
        </div>
      </div>

      <div class="card stack">
        <div class="field">
          <label class="field__label" for="f-note">Notiz (optional)</label>
          <textarea id="f-note" name="note" placeholder="Alkohol, Infekt, später Dienst, Stress …">${esc(c.note || '')}</textarea>
        </div>
      </div>

      <button class="btn btn--primary btn--block" type="submit" data-action="save-checkin">Check-in speichern</button>
      ${ctx.checkin ? '' : '<button class="btn btn--ghost btn--block" type="button" data-action="close-sheet">Später eintragen</button>'}
    </form>
  </div>`;
}

/* ---------------- Aufgabe ---------------- */

export function taskSheet(ctx, task) {
  const t = task || { repeat: 'once', category: 'alltag', due: ctx.date, weekdays: [], shiftDays: [] };
  const shiftKeys = [
    ['tag', 'Tagschicht'], ['nacht', 'Nachtschicht'], ['nacht_folge', 'Zweite Nacht'],
    ['schlaftag', 'Schlaftag'], ['frei_vor_tag', 'Frei vor Tagschicht'], ['frei', 'Frei'],
  ];
  return `<div class="sheet__inner">
    ${head(task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe')}
    <form id="task-form" class="stack">
      <div class="card stack">
        <div class="field">
          <label class="field__label" for="f-title">Titel</label>
          <input id="f-title" name="title" type="text" required value="${esc(t.title || '')}" placeholder="Was willst du erledigen?">
        </div>
        <div class="field">
          <label class="field__label" for="f-note">Notiz</label>
          <input id="f-note" name="note" type="text" value="${esc(t.note || '')}" placeholder="optional">
        </div>
        <div class="field">
          <span class="field__label">Kategorie</span>
          <div class="row wrap" style="gap:6px">
            ${Object.entries(CATEGORIES).map(([k, v]) => `
              <button type="button" class="chip ${t.category === k ? 'chip--on' : ''}"
                      data-action="pick" data-field="category" data-value="${k}">${esc(v.label)}</button>`).join('')}
          </div>
          <input type="hidden" name="category" value="${esc(t.category)}">
        </div>
      </div>

      <div class="card stack">
        <div class="field">
          <span class="field__label">Wiederholung</span>
          <div class="row wrap" style="gap:6px">
            ${[['once', 'einmalig'], ['daily', 'täglich'], ['weekdays', 'Wochentage'], ['shift', 'Schichttage']].map(([k, l]) => `
              <button type="button" class="chip ${t.repeat === k ? 'chip--on' : ''}"
                      data-action="pick" data-field="repeat" data-value="${k}">${esc(l)}</button>`).join('')}
          </div>
          <input type="hidden" name="repeat" value="${esc(t.repeat)}">
        </div>

        <div class="field" data-when="once" ${t.repeat === 'once' ? '' : 'hidden'}>
          <label class="field__label" for="f-due">Fällig am</label>
          <input id="f-due" name="due" type="date" value="${esc(t.due || ctx.date)}">
        </div>

        <div class="field" data-when="weekdays" ${t.repeat === 'weekdays' ? '' : 'hidden'}>
          <span class="field__label">Wochentage</span>
          <div class="row wrap" style="gap:6px">
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => `
              <button type="button" class="chip ${(t.weekdays || []).includes(d) ? 'chip--on' : ''}"
                      data-action="multi" data-field="weekdays" data-value="${d}">${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d]}</button>`).join('')}
          </div>
          <input type="hidden" name="weekdays" value="${esc((t.weekdays || []).join(','))}">
        </div>

        <div class="field" data-when="shift" ${t.repeat === 'shift' ? '' : 'hidden'}>
          <span class="field__label">Schichttage</span>
          <div class="row wrap" style="gap:6px">
            ${shiftKeys.map(([k, l]) => `
              <button type="button" class="chip ${(t.shiftDays || []).includes(k) ? 'chip--on' : ''}"
                      data-action="multi" data-field="shiftDays" data-value="${k}">${esc(l)}</button>`).join('')}
          </div>
          <input type="hidden" name="shiftDays" value="${esc((t.shiftDays || []).join(','))}">
          <div class="field__hint">So lassen sich Aufgaben an den Dienst koppeln – etwa „Tasche für die Nachtschicht packen“.</div>
        </div>
      </div>

      <button class="btn btn--primary btn--block" type="submit" data-action="save-task" data-id="${esc(t.id || '')}">Speichern</button>
      ${task ? `<button class="btn btn--ghost btn--block" type="button" data-action="delete-task" data-id="${esc(task.id)}">Aufgabe löschen</button>` : ''}
    </form>
  </div>`;
}

/* ---------------- Messung ---------------- */

export function markerSheet(ctx) {
  return `<div class="sheet__inner">
    ${head('Messung eintragen', 'Nur ausfüllen, was du gemessen hast')}
    <form id="marker-form" class="stack">
      <div class="card stack">
        <div class="field">
          <label class="field__label" for="f-date">Datum</label>
          <input id="f-date" name="date" type="date" value="${esc(ctx.date)}">
        </div>
        ${MARKERS.map((m) => numField(m.key, `${m.label} (${m.unit})`, m.why, null, 'step="0.1"')).join('')}
      </div>
      <button class="btn btn--primary btn--block" type="submit" data-action="save-marker">Speichern</button>
    </form>
  </div>`;
}

/* ---------------- Schichtplan ---------------- */

export function shiftSheet(ctx) {
  const cycle = ctx.state.shift.cycle;
  const cells = cycle.map((raw, i) => {
    const color = raw === 'T' ? 'var(--shift-t)' : raw === 'N' ? 'var(--shift-n)' : 'var(--shift-f)';
    return `<button class="strip__cell" style="background:${color}" data-action="cycle-day" data-index="${i}"
              aria-label="Zyklustag ${i + 1}: ${raw === 'T' ? 'Tagschicht' : raw === 'N' ? 'Nachtschicht' : 'frei'}">${raw === 'F' ? '·' : raw}</button>`;
  }).join('');

  return `<div class="sheet__inner">
    ${head('Schichtplan', `${cycle.length}-Tage-Zyklus`)}

    <div class="card">
      <p class="small secondary">
        Tippe jeden Tag an, bis er stimmt: frei → <strong>T</strong> (Tagschicht) → <strong>N</strong> (Nachtschicht) → frei.
        Schlaftag, Frei 1 und Frei 2 leitet die App selbst ab – der Tag nach der letzten Nacht ist der Schlaftag,
        der freie Tag direkt vor einer Tagschicht ist Frei 2.
      </p>
      <div class="row wrap" style="gap:6px;margin-top:12px">
        <span class="chip"><span class="chip__dot" style="background:var(--shift-t)"></span>Tagschicht 07:00–19:00</span>
        <span class="chip"><span class="chip__dot" style="background:var(--shift-n)"></span>Nachtschicht 19:00–07:00</span>
        <span class="chip"><span class="chip__dot" style="background:var(--shift-f)"></span>frei</span>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><h3 class="card__title">Zyklus</h3><span class="card__meta">Tag 1 oben links</span></div>
      <div class="strip">${cells}</div>
    </div>

    <div class="card stack">
      <div class="field">
        <label class="field__label" for="f-anchor">Welcher Zyklustag ist heute?</label>
        <input id="f-anchor" name="anchorIndex" type="number" min="1" max="${cycle.length}"
               value="${ctx.day.index + 1}">
        <div class="field__hint">Damit legt die App den Zyklus auf den Kalender. Heute ist ${esc(longDate(ctx.date))}.</div>
      </div>
      <button class="btn btn--primary btn--block" data-action="save-shift">Schichtplan übernehmen</button>
      <button class="btn btn--ghost btn--block" data-action="reset-cycle">Zyklus leeren</button>
    </div>

    <div class="card">
      <div class="card__head"><h3 class="card__title">Nächste 14 Tage</h3></div>
      <div class="list">
        ${Array.from({ length: 14 }, (_, i) => {
          const d = addDays(ctx.date, i);
          const key = ctx.shiftKeyFor(d);
          return `<div class="list__item" style="padding:9px 0">
            <div style="width:44px;flex:none"><div class="tiny">${weekdayShort(d)}</div>
            <div class="tiny muted num">${shortDate(d)}</div></div>
            <div class="grow small secondary">${esc(sleepPlan(key).summary)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------------- Einstellungen ---------------- */

export function settingsSheet(ctx) {
  const s = ctx.state.settings;
  const tm = s.trainingMax || {};
  return `<div class="sheet__inner">
    ${head('Einstellungen')}

    <div class="card stack">
      <div class="section-label">Schicht</div>
      <button class="btn btn--block" data-action="open-shift-editor">Schichtplan bearbeiten</button>
      <div class="field__hint">${ctx.state.shift.confirmed ? 'Eigener Zyklus hinterlegt.' : 'Noch der Platzhalter-Zyklus.'}</div>
    </div>

    <form id="settings-form" class="stack">
      <div class="card stack">
        <div class="section-label">Training</div>
        ${numField('startRunMinutes', 'Start-Laufumfang je Woche (min)', 'Basis der Progression. Bei 0–20 km pro Woche sind 130 min ein realistischer Start.', s.startRunMinutes, 'min="40" max="600" step="5"')}
        ${numField('sessionMinutes', 'Maximale Dauer je Einheit (min)', 'Begrenzt, was der Planer in ein Zeitfenster legt.', s.sessionMinutes, 'min="20" max="240" step="5"')}
        ${numField('easyPace', 'Lockeres Tempo (min/km)', 'Nur für die Kilometer-Schätzung im Plan.', s.easyPace, 'min="3" max="12" step="0.1"')}
      </div>

      <div class="card stack">
        <div class="section-label">Trainingsmaxima</div>
        <p class="field__hint">Rund 90 % deines Einer-Maximums. Ohne Angabe plant die App über die Anstrengung statt über Kilogramm.</p>
        ${numField('tm_squat', 'Kniebeuge (kg)', null, tm.squat, 'min="20" max="400" step="2.5"')}
        ${numField('tm_bench', 'Bankdrücken (kg)', null, tm.bench, 'min="20" max="300" step="2.5"')}
        ${numField('tm_trapbar', 'Trap-Bar Kreuzheben (kg)', null, tm.trapbar, 'min="20" max="400" step="2.5"')}
        <div class="field__hint">Nach jedem Vierwochenblock erhöht die App die Maxima automatisch – Beine 5 kg, Oberkörper 2,5 kg.</div>
      </div>

      <button class="btn btn--primary btn--block" type="submit" data-action="save-settings">Speichern</button>
    </form>

    <div class="card stack">
      <div class="section-label">Daten</div>
      <p class="field__hint">Alles liegt ausschließlich auf diesem Gerät. Es gibt keinen Server und kein Konto –
      sichere dir gelegentlich eine Kopie.</p>
      <button class="btn btn--block" data-action="export-data">Daten sichern (JSON)</button>
      <button class="btn btn--block" data-action="import-data">Sicherung einspielen</button>
      <button class="btn btn--ghost btn--block" data-action="reset-data">Alles zurücksetzen</button>
    </div>

    <div class="card">
      <div class="section-label">Über</div>
      <p class="small secondary" style="margin-top:8px">
        PRIMR plant Training, Schlaf und Aufgaben um einen 35-Tage-Wechselschichtzyklus herum.
        Es ersetzt keine ärztliche Beratung – bei anhaltend erhöhtem Ruhepuls, Schmerzen oder Infektzeichen
        gehört das abgeklärt und nicht wegtrainiert.
      </p>
    </div>
  </div>`;
}

/* ---------------- Tagesdetail ---------------- */

export function daySheet(ctx, entry) {
  const plan = sleepPlan(entry.shift.key);
  const logged = ctx.state.log[entry.date];
  return `<div class="sheet__inner">
    ${head(longDate(entry.date), entry.shift.label)}
    <div class="card">
      <div class="row wrap" style="gap:8px">${shiftBadge(entry.shift)}</div>
      <p class="small secondary" style="margin-top:10px">${esc(entry.shift.note)}</p>
      <div class="divider" style="margin:14px 0"></div>
      <div class="small"><strong>Schlaf:</strong> <span class="secondary">${esc(plan.summary)}</span></div>
      <div class="small" style="margin-top:6px"><strong>Trainingsfenster:</strong>
        <span class="secondary">${esc(entry.window.from)}–${esc(entry.window.to)} · ${esc(entry.window.quality)}</span></div>
    </div>
    ${sessionCard(entry.session, {
      window: entry.window,
      why: entry.why,
      date: entry.date,
      logged,
      slot: entry.slot,
      label: 'Geplante Einheit',
    })}
    ${entry.extra ? sessionCard(entry.extra, {
      window: entry.window,
      date: entry.date,
      logged,
      slot: entry.extra.slot,
      label: 'Zweite Einheit',
    }) : ''}
  </div>`;
}

export { CYCLE_LENGTH, round };
