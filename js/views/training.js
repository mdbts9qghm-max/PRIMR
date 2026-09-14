// Training: die Woche im Überblick, der Grund hinter jeder Platzierung,
// die Progression und die Vorbelastung.

import { esc, icon } from '../ui/dom.js';
import { barChart, stackedBar, ZONE_COLORS } from '../ui/charts.js';
import { sessionCard, dayRow } from '../ui/components.js';
import { addDays, weekStart, shortDate, weekdayShort, round, durationLabel } from '../core/util.js';
import { weekPlan } from '../core/context.js';
import { progression } from '../core/plan.js';
import { ZONES } from '../core/zones.js';

function zoneMinutes(plan) {
  const totals = [0, 0, 0, 0, 0];
  plan.days.forEach((d) => {
    [d.session, d.extra].filter(Boolean).forEach((session) => {
      (session.blocks || []).forEach((b) => {
        if (b.zone && b.minutes) totals[b.zone - 1] += b.minutes;
      });
    });
  });
  return totals;
}

function loadBars(ctx) {
  const bars = [];
  for (let i = 27; i >= 0; i -= 1) {
    const d = addDays(ctx.date, -i);
    const entry = ctx.state.log[d];
    bars.push({
      label: shortDate(d),
      value: entry ? entry.load || 0 : 0,
      tick: i % 7 === 0 ? weekdayShort(d) : '',
      readout: entry && entry.sessions && entry.sessions.length
        ? `${shortDate(d)}: ${entry.sessions.map((x) => x.title).join(' + ')} · ${entry.load} Punkte`
        : `${shortDate(d)}: kein Training`,
    });
  }
  return bars;
}

export function render(ctx) {
  const offset = ctx.ui.weekOffset || 0;
  const monday = addDays(weekStart(ctx.date), offset * 7);
  const plan = weekPlan(monday);
  const prog = plan.progression;
  const zm = zoneMinutes(plan);
  const totalRunMin = plan.days
    .flatMap((d) => [d.session, d.extra].filter(Boolean))
    .filter((s) => s.kind === 'run')
    .reduce((a, s) => a + s.durationMin, 0);

  const next = progression(plan.weekIndex + 1, ctx.state.settings);
  const bars = loadBars(ctx);
  const acwrTone = ctx.load.ratio == null ? 'muted'
    : ctx.load.ratio > 1.45 ? 'tone-bad'
      : ctx.load.ratio > 1.25 ? 'tone-warn'
        : ctx.load.ratio < 0.8 ? 'tone-warn' : 'tone-good';

  return `
  <div class="view">

    <div class="card">
      <div class="row row--between">
        <button class="icon-btn" data-action="week-shift" data-delta="-1" aria-label="Vorherige Woche">${icon('back')}</button>
        <div style="text-align:center">
          <div class="section-label">Woche ${plan.weekIndex + 1} · ${esc(prog.phase)}</div>
          <div class="small secondary" style="margin-top:3px">${esc(shortDate(monday))} – ${esc(shortDate(addDays(monday, 6)))}</div>
        </div>
        <button class="icon-btn" data-action="week-shift" data-delta="1" aria-label="Nächste Woche"
                style="transform:rotate(180deg)">${icon('back')}</button>
      </div>
      ${offset !== 0 ? `<div style="margin-top:12px"><button class="btn btn--ghost btn--block btn--sm" data-action="week-shift" data-delta="0">Zurück zu dieser Woche</button></div>` : ''}
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Wochenplan</h3>
        <span class="card__meta">${plan.runs}× Lauf · ${plan.strength}× Kraft</span>
      </div>
      <div class="list">
        ${plan.days.map((d) => dayRow(d, ctx.date, ctx.state.log[d.date])).join('')}
      </div>
      ${plan.missing.length ? `<div class="note note--warn" style="margin-top:12px">
        Diese Woche lässt sich nicht vollständig füllen: ${esc(plan.missing.join(', '))} findet im Dienstplan keinen sinnvollen Platz.
        Die Einheit fällt lieber aus, als sie auf einen Tag zu zwingen, an dem sie schadet.
      </div>` : ''}
    </div>

    ${ctx.date >= monday && ctx.date <= addDays(monday, 6) ? sessionCard(ctx.session, {
      window: ctx.window,
      why: ctx.entry ? ctx.entry.why : null,
      note: ctx.sessionNote,
      changed: ctx.sessionChanged,
      date: ctx.date,
      logged: ctx.logged,
      slot: ctx.entry ? ctx.entry.slot : null,
      label: 'Heute',
    }) : ''}
    ${ctx.extra ? sessionCard(ctx.extra, {
      window: ctx.window,
      date: ctx.date,
      logged: ctx.logged,
      slot: ctx.entry.extra.slot,
      label: 'Zweite Einheit heute',
    }) : ''}

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Zonenverteilung der Woche</h3>
        <span class="card__meta">${durationLabel(totalRunMin)} Laufen</span>
      </div>
      <div class="chart-readout">Geplante Laufminuten je Herzfrequenzzone.</div>
      ${stackedBar(ZONES.map((z, i) => ({
        label: `Z${z.z}`,
        value: zm[i],
        color: ZONE_COLORS[i],
      })), { ariaLabel: 'Zonenverteilung' })}
      <div class="tiny muted" style="margin-top:10px">
        Der Löwenanteil gehört in Zone 1 und 2. Wenn hier zu viel Zone 3 steht, wird aus lockerem Laufen
        unbeabsichtigtes Halbgas – die teuerste Trainingsform, die es gibt.
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Progression</h3>
        <span class="card__meta">Block ${prog.block + 1}, Woche ${prog.inBlock + 1} von 4</span>
      </div>
      <div class="metric-grid">
        <div class="metric">
          <div class="metric__label">Laufumfang</div>
          <div class="metric__value">${prog.weeklyRunMinutes}<span class="metric__unit"> min</span></div>
          <div class="metric__delta muted">nächste: ${next.weeklyRunMinutes} min</div>
        </div>
        <div class="metric">
          <div class="metric__label">Longrun</div>
          <div class="metric__value">${prog.longMinutes}<span class="metric__unit"> min</span></div>
        </div>
        <div class="metric">
          <div class="metric__label">Phase</div>
          <div class="metric__value" style="font-size:17px">${esc(prog.phase)}</div>
        </div>
      </div>
      <div class="note" style="margin-top:12px">
        ${prog.deload
          ? 'Entlastungswoche: Der Umfang fällt auf rund 72 %. Genau hier kommt die Anpassung der drei Wochen davor an – nicht im Training selbst.'
          : 'Aufbauwoche: Der Umfang steigt kontrolliert. Krafttraining folgt derselben Welle über das Trainingsmaximum.'}
      </div>
      <div class="disclose" data-disclose="prog-detail">
        <button class="disclose__toggle" data-action="toggle-disclose">
          <span>Wie die Steigerung funktioniert</span>
          <span class="disclose__chev">${icon('chevron')}</span>
        </button>
        <div class="disclose__body">
          <div class="stack small secondary">
            <p><strong>Laufen:</strong> Vier-Wochen-Blöcke mit 100 %, 110 %, 120 % und 72 % des Blockumfangs.
            Jeder neue Block startet 5 % über dem letzten. Gedeckelt beim 2,6-fachen deines Startumfangs,
            damit der Plan nicht ins Unendliche wächst.</p>
            <p><strong>Kraft:</strong> Dieselbe Welle über dem Trainingsmaximum – 78 %, 80 %, 87 %, 62 %.
            Nach jedem Block steigt das Trainingsmaximum: 5 kg bei Beinübungen, 2,5 kg beim Oberkörper.</p>
            <p><strong>Intensive Läufe</strong> rotieren durch sechs Formen, damit Schwelle und VO2max
            abwechselnd gereizt werden. Die Wiederholungszahl wächst mit dem Wochenindex.</p>
            <p>Der Plan hat kein Ziel und kein Ende – er läuft in Blöcken weiter und passt sich über
            deine Marker an, nicht über einen Wettkampftermin.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Vorbelastung</h3>
        <span class="card__meta ${acwrTone}">${ctx.load.ratio == null ? 'zu wenig Daten' : `Verhältnis ${ctx.load.ratio}`}</span>
      </div>
      <div class="chart-readout">Belastungspunkte je Tag, letzte 28 Tage. Zum Ablesen antippen.</div>
      ${barChart(bars, {
        color: 'var(--accent)',
        reference: ctx.load.chronic,
        ariaLabel: 'Trainingslast der letzten 28 Tage',
        emptyText: 'Noch keine eingetragenen Einheiten. Sobald du Trainings abhakst, siehst du hier deine Vorbelastung.',
      })}
      <div class="metric-grid" style="margin-top:12px">
        <div class="metric">
          <div class="metric__label">7 Tage</div>
          <div class="metric__value">${ctx.load.acute}</div>
        </div>
        <div class="metric">
          <div class="metric__label">28 Tage ⌀</div>
          <div class="metric__value">${ctx.load.chronic}</div>
        </div>
        <div class="metric">
          <div class="metric__label">Verhältnis</div>
          <div class="metric__value ${acwrTone}">${ctx.load.ratio == null ? '–' : ctx.load.ratio}</div>
        </div>
      </div>
      <div class="tiny muted" style="margin-top:10px">
        Die gestrichelte Linie ist dein 28-Tage-Schnitt. Ein Verhältnis zwischen 0,8 und 1,3 ist der Bereich,
        in dem du dich steigerst, ohne dich zu überfahren. Über 1,45 senkt die App den Bereitschaftswert von sich aus.
      </div>
    </div>

  </div>`;
}
