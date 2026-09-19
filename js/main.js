// App-Schale: Tabs, Blätter (Sheets) und alle Aktionen an einer Stelle.

import * as store from './core/store.js';
import * as ctxBuilder from './core/context.js';
import { esc, icon, on, toast, $ } from './ui/dom.js';
import { wireChartReadout } from './ui/charts.js';
import { today as todayIso, longDate, shortDate, uid, weekStart, addDays, daysBetween } from './core/util.js';
import { createTask } from './core/tasks.js';
import { shiftDay, DEFAULT_CYCLE } from './core/shift.js';
import { VERSION } from './version.js';
import { DEFAULT_RACE } from './core/race.js';

import * as todayView from './views/today.js';
import * as trainingView from './views/training.js';
import * as tasksView from './views/tasks.js';
import * as sleepView from './views/sleep.js';
import * as statsView from './views/stats.js';
import { MARKERS } from './views/stats.js';
import * as sheets from './views/sheets.js';

const TABS = [
  { key: 'today', label: 'Heute', icon: 'today', view: todayView },
  { key: 'training', label: 'Training', icon: 'training', view: trainingView },
  { key: 'tasks', label: 'Aufgaben', icon: 'tasks', view: tasksView },
  { key: 'sleep', label: 'Schlaf', icon: 'sleep', view: sleepView },
  { key: 'stats', label: 'Werte', icon: 'stats', view: statsView },
];

const app = {
  sheet: null,       // { type, payload }
  openDisclosures: new Set(),
  draft: {},         // Zwischenstand offener Formulare
};

function ctx() {
  return ctxBuilder.build(todayIso());
}

/* ---------------- Rendern ---------------- */

function renderTopbar(c) {
  const tab = TABS.find((t) => t.key === c.state.ui.tab) || TABS[0];
  return `<header class="topbar">
    <div class="grow" style="min-width:0">
      <div class="topbar__title">${esc(tab.label)}</div>
      <div class="topbar__sub">${esc(shortDate(c.date))} · ${esc(c.day.label)}</div>
    </div>
    <button class="icon-btn" data-action="open-settings" aria-label="Einstellungen">${icon('settings')}</button>
  </header>`;
}

function renderTabbar(c) {
  return `<nav class="tabbar"><div class="tabbar__inner">
    ${TABS.map((t) => `<button data-action="go-tab" data-tab="${t.key}"
      ${c.state.ui.tab === t.key ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}
  </div></nav>`;
}

function renderSheet(c) {
  if (!app.sheet) return '';
  const { type, payload } = app.sheet;
  let body = '';
  if (type === 'checkin') body = sheets.checkinSheet(c);
  else if (type === 'task') body = sheets.taskSheet(c, payload);
  else if (type === 'marker') body = sheets.markerSheet(c);
  else if (type === 'settings') body = sheets.settingsSheet(c);
  else if (type === 'shift') body = sheets.shiftSheet(c);
  else if (type === 'day') body = sheets.daySheet(c, payload);
  else if (type === 'raceplan') body = sheets.racePlanSheet(c);
  else if (type === 'complete') body = completeSheet(c, payload);
  else if (type === 'welcome') body = welcomeSheet(c);
  return `<div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
}

function completeSheet(c, payload) {
  const { session, date, slot } = payload;
  return `<div class="sheet__inner">
    <div class="row row--between" style="align-items:flex-start">
      <div><h2 style="font-size:22px">Einheit eintragen</h2>
      <div class="small muted" style="margin-top:3px">${esc(session.title)}</div></div>
      <button class="icon-btn" data-action="close-sheet" aria-label="Schließen">${icon('close')}</button>
    </div>
    <form id="complete-form" class="stack">
      <div class="card stack">
        <div class="field">
          <span class="field__label">Wie hart war es?</span>
          <div class="seg" role="group">
            ${[['leicht', 3], ['moderat', 5], ['fordernd', 7], ['hart', 9]].map(([l, v]) => `
              <button type="button" data-action="seg" data-seg="rpe" data-value="${v}"
                      aria-pressed="${(app.draft.rpe || 0) === v}">${l}</button>`).join('')}
          </div>
          <input type="hidden" name="rpe" value="${app.draft.rpe || ''}">
          <div class="field__hint">Deine Einschätzung skaliert die Belastungspunkte – geplant sind ${session.load}.</div>
        </div>
        <div class="field">
          <label class="field__label" for="f-snote">${session.kind === 'strength' ? 'Was hast du gemacht?' : 'Notiz'}</label>
          <input id="f-snote" name="note" type="text"
                 placeholder="${session.kind === 'strength' ? 'Übungen und Gewichte – für deinen eigenen Verlauf' : 'optional'}">
        </div>
      </div>
      <button class="btn btn--primary btn--block" type="submit" data-action="save-complete"
              data-date="${esc(date)}" data-slot="${esc(slot)}">Als erledigt eintragen</button>
    </form>
  </div>`;
}

function welcomeSheet(c) {
  return `<div class="sheet__inner">
    <div style="padding-top:20px">
      <div class="section-label">Willkommen</div>
      <h1 style="font-size:30px;margin-top:8px;line-height:1.2">Training, Schlaf und Aufgaben<br>um deinen Dienst herum.</h1>
    </div>
    <div class="card stack">
      <p class="small secondary">Drei Dinge macht die App:</p>
      <div class="list">
        <div class="list__item"><div class="grow"><strong>Check-in</strong>
          <div class="small secondary">Du überträgst morgens drei WHOOP-Werte: Recovery, Schlaf, HRV. Daraus wird deine Bereitschaft.</div></div></div>
        <div class="list__item"><div class="grow"><strong>Trainingsplan</strong>
          <div class="small secondary">Drei Läufe, drei Krafteinheiten je Woche – platziert nach Dienst, Erholung und Vorbelastung.</div></div></div>
        <div class="list__item"><div class="grow"><strong>Schlaf und Aufgaben</strong>
          <div class="small secondary">Feste Schlaffenster je Diensttag, dazu Routinen und tägliche Gewohnheiten.</div></div></div>
      </div>
    </div>
    <div class="card">
      <div class="note">Dein Dienstplan ist hinterlegt: <strong>T · N · Ü · DF · DF</strong>, siebenmal –
      die 35 Tage des Zyklus. Die App muss nur noch wissen, wo im Block du heute stehst.</div>
      <button class="btn btn--primary btn--block" style="margin-top:14px" data-action="open-shift-editor">Heutigen Dienst wählen</button>
      <button class="btn btn--ghost btn--block" style="margin-top:8px" data-action="skip-welcome">Erst mal ansehen</button>
    </div>
  </div>`;
}

function render() {
  const c = ctx();
  const tab = TABS.find((t) => t.key === c.state.ui.tab) || TABS[0];
  const root = $('#root');
  root.innerHTML = `${renderTopbar(c)}<main class="app">${tab.view.render(c)}</main>${renderTabbar(c)}${renderSheet(c)}`;

  // Ausgeklappte Bereiche über das Neuzeichnen hinweg erhalten.
  root.querySelectorAll('[data-disclose]').forEach((d) => {
    d.dataset.open = app.openDisclosures.has(d.dataset.disclose) ? 'true' : 'false';
  });
  wireChartReadout(root);
  return c;
}

/* ---------------- Formulare ---------------- */

function num(form, name) {
  const v = form.elements[name] ? form.elements[name].value : '';
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function saveCheckin(form) {
  const c = ctx();
  store.putCheckin({
    date: c.date,
    recovery: num(form, 'recovery'),
    hrv: num(form, 'hrv'),
    rhr: num(form, 'rhr'),
    sleepHours: num(form, 'sleepHours'),
    sleepPerformance: num(form, 'sleepPerformance'),
    strain: num(form, 'strain'),
    soreness: num(form, 'soreness'),
    note: form.elements.note ? form.elements.note.value : '',
  });
  app.sheet = null;
  app.draft = {};
  toast('Check-in gespeichert');
  render();
}

function saveTask(form, id) {
  const c = ctx();
  const data = {
    title: form.elements.title.value,
    note: form.elements.note.value,
    category: form.elements.category.value,
    repeat: form.elements.repeat.value,
    due: form.elements.due ? form.elements.due.value : null,
    weekdays: form.elements.weekdays
      ? form.elements.weekdays.value.split(',').filter(Boolean).map(Number) : null,
    shiftDays: form.elements.shiftDays
      ? form.elements.shiftDays.value.split(',').filter(Boolean) : null,
    created: c.date,
  };
  if (!data.title.trim()) { toast('Titel fehlt'); return; }

  store.update((s) => {
    if (id) {
      const i = s.tasks.findIndex((t) => t.id === id);
      if (i >= 0) s.tasks[i] = { ...s.tasks[i], ...data, id };
    } else {
      s.tasks.push(createTask(data));
    }
  });
  app.sheet = null;
  toast(id ? 'Aufgabe aktualisiert' : 'Aufgabe angelegt');
  render();
}

function saveMarker(form) {
  const entry = { id: uid(), date: form.elements.date.value || todayIso() };
  let any = false;
  // Die Feldliste kommt aus der Marker-Definition, nicht aus einer zweiten
  // Aufzählung – sonst fehlt ein neuer Wert genau hier.
  MARKERS.forEach((m) => {
    const v = num(form, m.key);
    if (v != null) { entry[m.key] = v; any = true; }
  });
  if (!any) { toast('Kein Wert eingetragen'); return; }
  store.update((s) => { s.markers.push(entry); });
  app.sheet = null;
  toast('Messung gespeichert');
  render();
}

function saveSettings(form) {
  store.update((s) => {
    s.settings.startRunMinutes = num(form, 'startRunMinutes') || s.settings.startRunMinutes;
    s.settings.sessionMinutes = num(form, 'sessionMinutes') || s.settings.sessionMinutes;
    s.settings.easyPace = num(form, 'easyPace') || s.settings.easyPace;
    const travel = num(form, 'gymTravelMinutes');
    if (travel != null) s.settings.gymTravelMinutes = travel;
    ['hillMeters', 'startVertM', 'longSessionMinutes'].forEach((key) => {
      const v = num(form, key);
      if (v != null) s.settings[key] = v;
    });
    const start = form.elements.planStart ? form.elements.planStart.value : '';
    if (start) s.settings.planStart = start;
    const weight = num(form, 'weightKg');
    if (weight != null) s.profile.weightKg = weight;
  });
  ctxBuilder.invalidate();
  app.sheet = null;
  toast('Einstellungen gespeichert');
  render();
}

/** Trägt eine einzelne Einheit ins Logbuch ein; ein Tag kann zwei haben. */
function logSession(date, session, slot, extra = {}) {
  store.update((s) => {
    const day = s.log[date] || { sessions: [], load: 0 };
    day.sessions = (day.sessions || []).filter((x) => x.slot !== slot);
    day.sessions.push({
      slot,
      title: session.title,
      kind: session.kind,
      ...extra,
    });
    day.load = day.sessions.reduce((a, x) => a + (x.load || 0), 0);
    day.done = day.sessions.some((x) => !x.skipped);
    s.log[date] = day;
  });
}

function saveComplete(form, date, slot) {
  const c = ctxBuilder.build(date);
  const session = pickSession(c, slot);
  if (!session) return;
  const rpe = num(form, 'rpe');
  const factor = rpe ? 0.6 + (rpe / 10) * 0.8 : 1;
  logSession(date, session, slot, {
    load: Math.round((session.load || 0) * factor),
    rpe: rpe || null,
    note: form.elements.note ? form.elements.note.value : '',
  });
  app.sheet = null;
  app.draft = {};
  toast('Eingetragen');
  render();
}

/** Die tagesaktuell angepasste Fassung einer geplanten Einheit. */
function pickSession(c, slot) {
  if (c.entry && c.entry.extra && c.entry.extra.slot === slot) return c.extra || c.entry.extra;
  return c.session || (c.entry && c.entry.session) || null;
}

/** Zielrennen speichern – ohne Datum gibt es kein Ziel. */
function saveRace(form) {
  const date = form.elements.raceDate.value;
  const name = form.elements.raceName.value.trim();
  if (!date) { toast('Ohne Renntag kein Ziel'); return; }
  if (date <= todayIso()) { toast('Der Renntag muss in der Zukunft liegen'); return; }

  // Der ganze Plan hängt an den Höhenmetern: Ohne sie gäbe es keine
  // Bergeinheit, keine Steigrate und keine Bergab-Toleranz.
  const vertM = num(form, 'raceVert');
  if (!vertM) { toast('Ohne Höhenmeter kann der Coach nicht planen'); return; }

  store.update((s) => {
    s.settings.race = {
      ...DEFAULT_RACE,
      ...s.settings.race,
      name: name || 'Zielrennen',
      date,
      startTime: form.elements.raceStart.value || '08:00',
      distanceKm: num(form, 'raceDistance') || DEFAULT_RACE.distanceKm,
      vertM,
      limitHours: num(form, 'raceLimit') || DEFAULT_RACE.limitHours,
    };
  });
  ctxBuilder.invalidate();
  app.sheet = null;
  toast('Ziel gespeichert');
  render();
}

/**
 * Urlaub, Krankheit oder ein Zusatzdienst über einen Zeitraum. Der Zyklus
 * bleibt unangetastet, überschrieben werden nur die einzelnen Tage.
 */
function saveAbsence(form) {
  const from = form.elements.from.value;
  const to = form.elements.to.value || from;
  const raw = form.elements.absence.value;
  if (!from) { toast('Kein Datum gewählt'); return; }
  if (to < from) { toast('Das Ende liegt vor dem Anfang'); return; }

  const span = daysBetween(from, to) + 1;
  if (span > 120) { toast('Höchstens 120 Tage am Stück'); return; }

  store.update((s) => {
    for (let d = from; d <= to; d = addDays(d, 1)) s.shift.overrides[d] = raw;
  });
  ctxBuilder.invalidate();
  app.sheet = null;
  const label = { U: 'Urlaub', K: 'Krankheit', F: 'Dienstfrei', T: 'Tagschicht', N: 'Nachtschicht' }[raw];
  toast(`${label} für ${span} Tag${span === 1 ? '' : 'e'} eingetragen`);
  render();
}

/* ---------------- Aktionen ---------------- */

const actions = {
  'go-tab': (e, el) => {
    store.update((s) => { s.ui.tab = el.dataset.tab; });
    app.sheet = null;
    window.scrollTo({ top: 0 });
    render();
  },

  'toggle-disclose': (e, el) => {
    const box = el.closest('[data-disclose]');
    const key = box.dataset.disclose;
    if (app.openDisclosures.has(key)) app.openDisclosures.delete(key);
    else app.openDisclosures.add(key);
    box.dataset.open = app.openDisclosures.has(key) ? 'true' : 'false';
  },

  'open-checkin': () => { app.sheet = { type: 'checkin' }; render(); },
  'open-settings': () => { app.sheet = { type: 'settings' }; render(); },
  'open-shift-editor': () => { app.sheet = { type: 'shift' }; render(); },
  'open-raceplan': () => { app.sheet = { type: 'raceplan' }; render(); },

  'prefill-race': () => {
    store.update((s) => { s.settings.race = { ...DEFAULT_RACE }; });
    ctxBuilder.invalidate();
    toast('Renndaten zurückgesetzt');
    render();
  },

  'new-task': () => { app.sheet = { type: 'task', payload: null }; render(); },
  'new-marker': () => { app.sheet = { type: 'marker' }; render(); },
  'close-sheet': () => { app.sheet = null; app.draft = {}; render(); },
  'skip-welcome': () => {
    store.update((s) => { s.profile.onboarded = true; });
    app.sheet = null;
    render();
  },

  'edit-task': (e, el) => {
    const task = store.get().tasks.find((t) => t.id === el.dataset.id);
    app.sheet = { type: 'task', payload: task };
    render();
  },

  'delete-task': (e, el) => {
    store.update((s) => { s.tasks = s.tasks.filter((t) => t.id !== el.dataset.id); });
    app.sheet = null;
    toast('Aufgabe gelöscht');
    render();
  },

  'toggle-task': (e, el) => {
    const { id, date } = el.dataset;
    store.update((s) => {
      const list = s.done[date] || [];
      s.done[date] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });
    render();
  },

  'open-day': (e, el) => {
    // Über das Datum suchen, nicht über die angezeigte Woche: Das rollende
    // Fenster reicht über zwei Kalenderwochen.
    const entry = ctxBuilder.entryFor(el.dataset.date);
    if (entry) { app.sheet = { type: 'day', payload: entry }; render(); }
  },

  'week-shift': (e, el) => {
    const delta = Number(el.dataset.delta);
    store.update((s) => {
      s.ui.weekOffset = delta === 0 ? 0 : (s.ui.weekOffset || 0) + delta;
    });
    render();
  },

  'complete-session': (e, el) => {
    const { date, slot } = el.dataset;
    const c = ctxBuilder.build(date);
    const session = pickSession(c, slot);
    if (!session) return;
    app.draft = {};
    app.sheet = { type: 'complete', payload: { session, date, slot } };
    render();
  },

  'skip-session': (e, el) => {
    const { date, slot } = el.dataset;
    const c = ctxBuilder.build(date);
    const session = pickSession(c, slot);
    if (!session) return;
    logSession(date, session, slot, { load: 0, skipped: true });
    toast('Als ausgelassen vermerkt');
    render();
  },

  'undo-session': (e, el) => {
    const { date, slot } = el.dataset;
    store.update((s) => {
      const day = s.log[date];
      if (!day) return;
      day.sessions = (day.sessions || []).filter((x) => x.slot !== slot);
      day.load = day.sessions.reduce((a, x) => a + (x.load || 0), 0);
      day.done = day.sessions.some((x) => !x.skipped);
      if (!day.sessions.length) delete s.log[date];
    });
    render();
  },

  seg: (e, el) => {
    const { seg, value } = el.dataset;
    app.draft[seg] = Number(value);
    const group = el.closest('.seg');
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
    const input = el.closest('form').elements[seg];
    if (input) input.value = value;
  },

  pick: (e, el) => {
    const { field, value } = el.dataset;
    const form = el.closest('form');
    form.elements[field].value = value;
    el.parentElement.querySelectorAll('[data-action="pick"]').forEach((b) => {
      b.classList.toggle('chip--on', b === el);
    });
    if (field === 'repeat') {
      form.querySelectorAll('[data-when]').forEach((f) => {
        f.hidden = f.dataset.when !== value;
      });
    }
  },

  multi: (e, el) => {
    const { field, value } = el.dataset;
    const input = el.closest('form').elements[field];
    const set = new Set(input.value.split(',').filter(Boolean));
    if (set.has(value)) set.delete(value); else set.add(value);
    input.value = Array.from(set).join(',');
    el.classList.toggle('chip--on', set.has(value));
  },

  'cycle-day': (e, el) => {
    const i = Number(el.dataset.index);
    const order = { F: 'T', T: 'N', N: 'F' };
    store.update((s) => { s.shift.cycle[i] = order[s.shift.cycle[i]] || 'T'; });
    ctxBuilder.invalidate();
    render();
  },

  // Der Zyklus steht fest – es fehlt nur, wo im Fünferblock heute liegt.
  'set-today-position': (e, el) => {
    const idx = Number(el.dataset.index);
    store.update((s) => {
      s.shift.anchorDate = todayIso();
      s.shift.anchorIndex = idx;
      s.shift.confirmed = true;
      s.profile.onboarded = true;
    });
    ctxBuilder.invalidate();
    // Aus dem Onboarding direkt weiter in den ersten Check-in.
    app.sheet = ctxBuilder.build(todayIso()).checkin ? null : { type: 'checkin' };
    toast('Schichtplan übernommen');
    render();
  },

  'set-override': (e, el) => {
    const { date, raw } = el.dataset;
    store.update((s) => { s.shift.overrides[date] = raw; });
    ctxBuilder.invalidate();
    toast('Dienst für diesen Tag geändert');
    app.sheet = null;
    render();
  },

  'clear-range': (e, el) => {
    const { from, to } = el.dataset;
    store.update((s) => {
      for (let d = from; d <= to; d = addDays(d, 1)) delete s.shift.overrides[d];
    });
    ctxBuilder.invalidate();
    toast('Zeitraum entfernt');
    render();
  },

  'clear-override': (e, el) => {
    store.update((s) => { delete s.shift.overrides[el.dataset.date]; });
    ctxBuilder.invalidate();
    toast('Auf den Regeldienst zurückgesetzt');
    render();
  },

  'reset-cycle': () => {
    store.update((s) => { s.shift.cycle = DEFAULT_CYCLE.slice(); });
    ctxBuilder.invalidate();
    toast('Zyklus zurückgesetzt');
    render();
  },

  'check-update': async () => {
    if (!('serviceWorker' in navigator)) { toast('Hier nicht verfügbar'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast('Noch nicht installiert'); return; }
    await reg.update().catch(() => {});
    if (reg.waiting && takeOver(reg.waiting)) { toast('Neue Version wird geladen'); return; }
    toast(`Aktuell – Version ${VERSION}`);
  },

  'apply-update': () => {
    if (!takeOver(waitingWorker)) reloadOnce();
  },

  'export-data': () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `primr-${todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  'import-data': () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        store.importJson(await file.text());
        ctxBuilder.invalidate();
        app.sheet = null;
        toast('Sicherung eingespielt');
        render();
      } catch (err) {
        toast('Datei nicht lesbar');
      }
    };
    input.click();
  },

  'reset-data': () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Wirklich alle Daten löschen? Das lässt sich nicht rückgängig machen.')) return;
    store.reset();
    ctxBuilder.invalidate();
    app.sheet = null;
    render();
  },
};

/* ---------------- Start ---------------- */

function boot() {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  store.load();
  const c = render();

  if (!c.state.profile.onboarded) {
    app.sheet = { type: 'welcome' };
    render();
  } else if (!c.checkin) {
    app.sheet = { type: 'checkin' };
    render();
  }

  on(document, 'click', '[data-action]', (e, el) => {
    const fn = actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'BUTTON' && el.type !== 'submit') e.preventDefault();
    fn(e, el);
  });

  // Ein Formular, das der Browser wegen einer Feldregel ablehnt, sendet gar
  // kein submit-Ereignis. Ohne diesen Zweig passiert beim Tippen nichts und
  // niemand erfährt, warum.
  on(document, 'invalid', 'input, select, textarea', (e, field) => {
    e.preventDefault();
    const label = field.closest('.field');
    const name = label ? (label.querySelector('.field__label') || {}).textContent : field.name;
    toast(`${(name || 'Ein Feld').trim()}: ${field.validationMessage}`);
    field.focus();
  });

  on(document, 'submit', 'form', (e, form) => {
    e.preventDefault();
    if (form.id === 'checkin-form') saveCheckin(form);
    else if (form.id === 'task-form') saveTask(form, form.querySelector('[data-action="save-task"]').dataset.id);
    else if (form.id === 'marker-form') saveMarker(form);
    else if (form.id === 'settings-form') saveSettings(form);
    else if (form.id === 'absence-form') saveAbsence(form);
    else if (form.id === 'race-form') saveRace(form);
    else if (form.id === 'complete-form') {
      const btn = form.querySelector('[data-action="save-complete"]');
      saveComplete(form, btn.dataset.date, btn.dataset.slot);
    }
  });

  // Tageswechsel: beim Zurückkehren in die App neu rechnen.
  let lastDate = todayIso();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (todayIso() !== lastDate) {
      lastDate = todayIso();
      ctxBuilder.invalidate();
      app.sheet = ctxBuilder.build(lastDate).checkin ? null : { type: 'checkin' };
      render();
    }
  });

  setupServiceWorker();
}

/* ---------------- Aktualisierung ---------------- */

// Innerhalb dieser Zeitspanne nach dem Start gilt die App als "gerade
// geöffnet": Eine neue Fassung wird dann still übernommen. Danach wäre ein
// Neuladen ein Eingriff mitten in die Nutzung – dort fragt die App nach.
const QUIET_UPDATE_MS = 12000;
const RELOAD_GUARD = 'primr.updateReload';

let waitingWorker = null;
let reloading = false;
const startedAt = Date.now();

function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  const el = document.createElement('div');
  el.id = 'update-bar';
  el.className = 'update-bar';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>Neue Version verfügbar</span>
    <button class="btn btn--primary btn--sm" data-action="apply-update">Aktualisieren</button>`;
  document.body.appendChild(el);
}

/** Wartenden Worker übernehmen lassen. Der Reload folgt aus controllerchange. */
function takeOver(worker) {
  if (!worker) return false;
  worker.postMessage('skip-waiting');
  return true;
}

function handleWaiting(worker) {
  waitingWorker = worker;
  if (Date.now() - startedAt < QUIET_UPDATE_MS) takeOver(worker);
  else showUpdateBar();
}

/**
 * Gegenprobe über version.json.
 *
 * Ob der Browser von sich aus nach einer neuen sw.js sucht, hängt an seinen
 * eigenen Regeln – bei einer installierten App kann das bis zu einem Tag
 * dauern. Diese Datei wird bei jedem Start am Cache vorbei geladen und mit
 * der eingebauten Version verglichen. Weicht sie ab, läuft noch eine alte
 * Fassung, und die App holt die neue aktiv nach, statt zu warten.
 */
async function checkVersion(reg) {
  let remote;
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    if (!res.ok) return;
    ({ version: remote } = await res.json());
  } catch (err) {
    return; // offline – dann bleibt die installierte Fassung stehen
  }

  if (!remote || remote === VERSION) {
    sessionStorage.removeItem(RELOAD_GUARD);
    return;
  }

  // Nur ein erzwungener Neustart je Sitzung und Version. Ohne diese Bremse
  // liefe die App im Kreis, falls die Dateien auf dem Server einmal nicht zu
  // ihrer Versionsangabe passen.
  if (sessionStorage.getItem(RELOAD_GUARD) === remote) return;
  sessionStorage.setItem(RELOAD_GUARD, remote);

  if (reg) {
    await reg.update().catch(() => {});
    if (reg.waiting && takeOver(reg.waiting)) return;
  }
  reloadOnce();
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    checkVersion(null);
    return;
  }

  // Beim allerersten Start übernimmt der Worker die Seite von sich aus
  // (clients.claim). Das ist kein Update – wer hier neu lädt, schickt jeden
  // neuen Nutzer durch einen überflüssigen Reload und kommt sich beim Laden
  // der Module selbst in die Quere.
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    reloadOnce();
  });

  // updateViaCache: 'none' – sonst kann der Browser sw.js selbst
  // zwischenspeichern und merkt die neue Fassung tagelang nicht.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const track = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) handleWaiting(worker);
      });
    };

    if (reg.waiting && navigator.serviceWorker.controller) handleWaiting(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));

    const check = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 60 * 60 * 1000);
    check();
    checkVersion(reg);
  }).catch(() => checkVersion(null));
}

document.addEventListener('DOMContentLoaded', boot);
export { shiftDay };
