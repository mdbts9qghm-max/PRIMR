// Vollflächige Formulare: Check-in, Aufgabe, Messung, Einstellungen,
// Schichtplan und die Detailansicht eines Plantages.

import { esc, icon } from '../ui/dom.js';
import { shiftBadge, sessionCard } from '../ui/components.js';
import { longDate, shortDate, weekdayShort, addDays } from '../core/util.js';
import { CATEGORIES } from '../core/tasks.js';
import { MARKERS } from './stats.js';
import { BLOCK_POSITIONS, DAY_TYPES, typeFor } from '../core/shift.js';
import { sleepPlan } from '../core/sleep.js';
import { VERSION } from '../version.js';

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
  const hasExtras = c.rhr != null || c.sleepPerformance != null || c.strain != null;

  return `<div class="sheet__inner">
    ${head('Daily Check-in', longDate(ctx.date))}

    <div class="card">
      <div class="row wrap" style="gap:8px">${shiftBadge(ctx.day)}</div>
      <p class="small secondary" style="margin-top:10px">
        Drei Werte aus WHOOP genügen. Daraus berechnet die App deine Bereitschaft, passt das Training
        an und schreibt den Verlauf mit. Der Rest ist freiwillig und macht den Wert nur genauer.
      </p>
    </div>

    <form id="checkin-form" class="stack">
      <div class="card stack">
        <div class="section-label">Die drei Werte</div>
        ${numField('recovery', 'Recovery', 'Der große Prozentwert auf dem Startbildschirm.', c.recovery, 'min="0" max="100" step="1"')}
        ${numField('sleepHours', 'Schlaf', `Stunden der Nacht, die heute früh geendet hat. Soll für einen ${ctx.day.label}-Tag: ${ctx.sleepTarget} h.`, c.sleepHours, 'min="0" max="16" step="0.1"')}
        ${numField('hrv', 'HRV', 'Herzfrequenzvariabilität in Millisekunden.', c.hrv, 'min="0" max="300" step="1"')}
      </div>

      <div class="card stack">
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

      <div class="card">
        <div class="disclose" data-disclose="checkin-extra" data-open="${hasExtras}">
          <button type="button" class="disclose__toggle" data-action="toggle-disclose">
            <span>Weitere Werte (optional)</span>
            <span class="disclose__chev">${icon('chevron')}</span>
          </button>
          <div class="disclose__body">
            <div class="stack">
              ${numField('rhr', 'Ruhepuls', 'Schläge pro Minute im Schlaf. Ab etwa sieben Einträgen vergleicht die App gegen deinen eigenen Schnitt.', c.rhr, 'min="25" max="120" step="1"')}
              ${numField('sleepPerformance', 'Schlaf-Performance', 'Prozent des Schlafbedarfs, den WHOOP ausweist.', c.sleepPerformance, 'min="0" max="100" step="1"')}
              ${numField('strain', 'Strain gestern', 'Belastungswert des Vortags, 0 bis 21.', c.strain, 'min="0" max="21" step="0.1"')}
            </div>
          </div>
        </div>
      </div>

      <div class="card stack">
        <div class="field">
          <label class="field__label" for="f-note">Notiz (optional)</label>
          <textarea id="f-note" name="note" placeholder="Alkohol, Infekt, Zusatzdienst, Stress …">${esc(c.note || '')}</textarea>
        </div>
      </div>

      <button class="btn btn--primary btn--block" type="submit" data-action="save-checkin">Check-in speichern</button>
      ${ctx.checkin ? '' : '<button class="btn btn--ghost btn--block" type="button" data-action="close-sheet">Später eintragen</button>'}
    </form>
  </div>`;
}

/* ---------------- Aufgabe ---------------- */

const SHIFT_PICKER = [
  ['tag', 'Tagschicht'], ['nacht', 'Nachtschicht'], ['schlaftag', 'Ü-Tag'],
  ['frei', 'DF (erster)'], ['frei_vor_tag', 'DF (vor Tagschicht)'], ['nacht_folge', 'Zweite Nacht'],
];

export function taskSheet(ctx, task) {
  const t = task || { repeat: 'once', category: 'alltag', due: ctx.date, weekdays: [], shiftDays: [] };
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
            ${SHIFT_PICKER.map(([k, l]) => `
              <button type="button" class="chip ${(t.shiftDays || []).includes(k) ? 'chip--on' : ''}"
                      data-action="multi" data-field="shiftDays" data-value="${k}">${esc(l)}</button>`).join('')}
          </div>
          <input type="hidden" name="shiftDays" value="${esc((t.shiftDays || []).join(','))}">
          <div class="field__hint">So koppelst du Aufgaben an den Dienst – etwa „Tasche packen“ nur am Nachtschichttag.</div>
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
  const cfg = ctx.state.shift;
  const cells = cfg.cycle.map((raw, i) => {
    // Den abgeleiteten Code anzeigen, damit der Editor so aussieht wie der Dienstplan.
    const len = cfg.cycle.length;
    const prev = cfg.cycle[(i - 1 + len) % len];
    const next = cfg.cycle[(i + 1) % len];
    let key;
    if (raw === 'T') key = 'tag';
    else if (raw === 'N') key = prev === 'N' ? 'nacht_folge' : 'nacht';
    else if (prev === 'N') key = 'schlaftag';
    else if (next === 'T') key = 'frei_vor_tag';
    else key = 'frei';
    const t = DAY_TYPES[key];
    const color = raw === 'T' ? 'var(--shift-t)' : raw === 'N' ? 'var(--shift-n)' : 'var(--shift-f)';
    const here = i === ctx.day.index;
    return `<button class="strip__cell ${here ? 'strip__cell--today' : ''}" style="background:${color}"
              data-action="cycle-day" data-index="${i}"
              aria-label="Zyklustag ${i + 1}: ${esc(t.label)}">${esc(t.code)}</button>`;
  }).join('');

  const overrides = Object.entries(cfg.overrides || {})
    .filter(([date]) => date >= ctx.date)
    .sort(([a], [b]) => (a < b ? -1 : 1));

  return `<div class="sheet__inner">
    ${head('Schichtplan', 'T · N · Ü · DF · DF, siebenmal – 35 Tage')}

    <div class="card">
      <div class="section-label">Schritt 1 · Welchen Dienst hast du heute?</div>
      <p class="small secondary" style="margin-top:8px">
        Der Rhythmus steht schon fest. Die App muss nur wissen, wo im Block du gerade bist –
        dann liegt der ganze Zyklus richtig auf dem Kalender.
      </p>
      <div class="stack" style="margin-top:14px">
        ${BLOCK_POSITIONS.map((p) => `
          <button class="btn ${ctx.day.index % 5 === p.index ? 'btn--primary' : ''}"
                  style="justify-content:flex-start;gap:12px"
                  data-action="set-today-position" data-index="${p.index}">
            <span class="chip" style="padding:3px 9px;min-width:40px;justify-content:center">${esc(p.code)}</span>
            <span>${esc(p.label)}</span>
          </button>`).join('')}
      </div>
      <div class="field__hint" style="margin-top:10px">Heute ist ${esc(longDate(ctx.date))}.</div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Die nächsten 14 Tage</h3>
        <span class="card__meta">zur Kontrolle</span>
      </div>
      <div class="list">
        ${Array.from({ length: 14 }, (_, i) => {
          const d = addDays(ctx.date, i);
          const day = ctx.shiftDayFor(d);
          return `<div class="list__item" style="padding:9px 0">
            <div style="width:52px;flex:none"><div class="tiny">${weekdayShort(d)}</div>
            <div class="tiny muted num">${shortDate(d)}</div></div>
            <div style="width:34px;flex:none"><span class="chip" style="padding:2px 7px">${esc(day.code)}</span></div>
            <div class="grow small secondary">${esc(sleepPlan(day.key, day.prevKey, day.nextKey).summary)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="disclose" data-disclose="cycle-editor">
        <button class="disclose__toggle" data-action="toggle-disclose">
          <span>Zyklus von Hand ändern</span>
          <span class="disclose__chev">${icon('chevron')}</span>
        </button>
        <div class="disclose__body">
          <p class="small secondary">
            Nur nötig, wenn sich der Dienstplan grundsätzlich ändert. Tippen schaltet einen Tag
            weiter: DF → T → N → DF. Ü und der zweite DF-Tag ergeben sich automatisch aus der Lage.
            Der weiße Rahmen markiert den heutigen Tag.
          </p>
          <div class="row wrap" style="gap:6px;margin:12px 0">
            <span class="chip"><span class="chip__dot" style="background:var(--shift-t)"></span>T · 07:00–19:00</span>
            <span class="chip"><span class="chip__dot" style="background:var(--shift-n)"></span>N · 19:00–07:00</span>
            <span class="chip"><span class="chip__dot" style="background:var(--shift-f)"></span>Ü und DF</span>
          </div>
          <div class="strip">${cells}</div>
          <button class="btn btn--ghost btn--block btn--sm" style="margin-top:12px" data-action="reset-cycle">
            Auf T · N · Ü · DF · DF zurücksetzen
          </button>
        </div>
      </div>
    </div>

    ${overrides.length ? `
    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Abweichungen</h3>
        <span class="card__meta">${overrides.length} Tag${overrides.length === 1 ? '' : 'e'}</span>
      </div>
      <div class="list">
        ${overrides.map(([date, raw]) => `<div class="list__item">
          <div class="grow">
            <div class="small">${esc(longDate(date))}</div>
            <div class="tiny muted">${raw === 'T' ? 'Tagschicht' : raw === 'N' ? 'Nachtschicht' : 'dienstfrei'} statt Regeldienst</div>
          </div>
          <button class="btn btn--sm btn--ghost" data-action="clear-override" data-date="${esc(date)}">Zurücksetzen</button>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="card">
      <p class="tiny muted">
        Zusatzdienste, die kurzfristig angeordnet werden, trägst du direkt am Tag ein:
        im Trainings-Tab den Tag öffnen und dort den Dienst ändern. Der Zyklus bleibt davon unberührt.
      </p>
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
      <div class="field__hint">${ctx.state.shift.confirmed
        ? `Heute ist ${esc(ctx.day.label)}, Zyklustag ${ctx.day.index + 1} von ${ctx.state.shift.cycle.length}.`
        : 'Noch nicht festgelegt, wo im Block du heute stehst.'}</div>
    </div>

    <form id="settings-form" class="stack">
      <div class="card stack">
        <div class="section-label">Training</div>
        ${numField('startRunMinutes', 'Start-Laufumfang je Woche (min)', 'Basis der Progression. Bei 0–20 km pro Woche sind 130 min ein realistischer Start.', s.startRunMinutes, 'min="40" max="600" step="5"')}
        ${numField('sessionMinutes', 'Maximale Dauer je Einheit (min)', 'Begrenzt, was der Planer in ein Zeitfenster legt.', s.sessionMinutes, 'min="20" max="240" step="5"')}
        ${numField('gymTravelMinutes', 'Anfahrt zum Gym (min, einfach)', 'Wird bei Krafteinheiten doppelt vom Zeitfenster abgezogen. Läufe starten an der Haustür.', s.gymTravelMinutes, 'min="0" max="90" step="5"')}
        ${numField('easyPace', 'Lockeres Tempo (min/km)', 'Nur für die Kilometer-Schätzung im Plan.', s.easyPace, 'min="3" max="12" step="0.1"')}
      </div>

      <div class="card stack">
        <div class="section-label">Körper</div>
        ${numField('weightKg', 'Körpergewicht (kg)', 'Grundlage für das Proteinziel in den Gewohnheiten.', ctx.state.profile.weightKg, 'min="35" max="200" step="0.5"')}
      </div>

      <button class="btn btn--primary btn--block" type="submit" data-action="save-settings">Speichern</button>
    </form>

    <div class="card stack">
      <div class="section-label">Daten</div>
      <p class="field__hint">Alles liegt ausschließlich auf diesem Gerät. Es gibt keinen Server und
      kein Konto – sichere dir gelegentlich eine Kopie.</p>
      <button class="btn btn--block" data-action="export-data">Daten sichern (JSON)</button>
      <button class="btn btn--block" data-action="import-data">Sicherung einspielen</button>
      <button class="btn btn--ghost btn--block" data-action="reset-data">Alles zurücksetzen</button>
    </div>

    <div class="card">
      <div class="row row--between">
        <span class="section-label">Über</span>
        <span class="tiny muted num">Version ${esc(VERSION)}</span>
      </div>
      <button class="btn btn--block btn--sm" style="margin-top:12px" data-action="check-update">
        Nach Aktualisierung suchen
      </button>
      <p class="small secondary" style="margin-top:12px">
        PRIMR plant Training, Schlaf und Aufgaben um den 35-Tage-Wechselschichtzyklus herum.
        Es ersetzt keine ärztliche Beratung – bei anhaltend erhöhtem Ruhepuls, Schmerzen oder
        Infektzeichen gehört das abgeklärt und nicht wegtrainiert.
      </p>
    </div>
  </div>`;
}

/* ---------------- Tagesdetail ---------------- */

export function daySheet(ctx, entry) {
  const plan = sleepPlan(entry.shift.key, entry.shift.prevKey, entry.shift.nextKey);
  const logged = ctx.state.log[entry.date];
  const raw = entry.shift.raw;

  return `<div class="sheet__inner">
    ${head(longDate(entry.date), entry.shift.label)}

    <div class="card">
      <div class="row wrap" style="gap:8px">${shiftBadge(entry.shift)}
        ${entry.shift.overridden ? '<span class="chip">abweichend eingetragen</span>' : ''}
      </div>
      <p class="small secondary" style="margin-top:10px">${esc(entry.shift.note)}</p>
      <div class="divider" style="margin:14px 0"></div>
      <div class="small"><strong>Schlaf:</strong> <span class="secondary">${esc(plan.summary)}</span></div>
      <div class="small" style="margin-top:6px"><strong>Trainingsfenster:</strong>
        <span class="secondary">${esc(entry.window.from)}–${esc(entry.window.to)} · ${esc(entry.window.quality)}</span></div>

      <div class="disclose" data-disclose="override-${esc(entry.date)}">
        <button class="disclose__toggle" data-action="toggle-disclose">
          <span>Dienst für diesen Tag ändern</span>
          <span class="disclose__chev">${icon('chevron')}</span>
        </button>
        <div class="disclose__body">
          <p class="tiny muted">Für kurzfristig angeordnete Zusatzdienste, Tausch oder Urlaub.
          Der Zyklus selbst bleibt unverändert, nur dieser Tag wird überschrieben.</p>
          <div class="seg" role="group" style="margin-top:10px">
            ${[['T', 'Tagschicht'], ['N', 'Nachtschicht'], ['F', 'dienstfrei']].map(([code, label]) => `
              <button data-action="set-override" data-date="${esc(entry.date)}" data-raw="${code}"
                      aria-pressed="${raw === code}">${esc(label)}</button>`).join('')}
          </div>
          ${entry.shift.overridden ? `<button class="btn btn--ghost btn--block btn--sm" style="margin-top:10px"
            data-action="clear-override" data-date="${esc(entry.date)}">Auf den Regeldienst zurücksetzen</button>` : ''}
        </div>
      </div>
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

export { typeFor };
