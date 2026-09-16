// Training: die Woche im Überblick, der Grund hinter jeder Platzierung,
// die Progression und die Vorbelastung.

import { esc, icon } from '../ui/dom.js';
import { barChart, stackedBar, meter, ZONE_COLORS } from '../ui/charts.js';
import { sessionCard, dayRow, weekStrip, weekStripLegend, phaseBar } from '../ui/components.js';
import { PHASES, countdown, weeksUntil, zoneTargets } from '../core/race.js';
import { addDays, weekStart, shortDate, weekdayShort, round, durationLabel, longDate } from '../core/util.js';
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

  const rc = plan.race;
  const race = ctx.state.settings.race;
  const cd = race ? countdown(race, ctx.date) : null;
  const startWeeksOut = race ? weeksUntil(race.date, ctx.state.settings.planStart) : 0;

  return `
  <div class="view">

    ${race ? `
    <div class="card card--accent">
      <div class="row row--between" style="align-items:flex-start">
        <div class="grow" style="min-width:0">
          <div class="section-label">Ziel</div>
          <h2 style="font-size:20px;margin-top:5px">${esc(race.name)}</h2>
          <div class="small secondary" style="margin-top:3px">${esc(longDate(race.date))} · Start ${esc(race.startTime)}</div>
        </div>
        <div style="text-align:right;flex:none">
          <div class="goal-figure" style="justify-content:flex-end">
            <span class="goal-figure__value">${cd.past ? '–' : Math.max(0, rc ? rc.weeksOut : cd.weeks)}</span>
          </div>
          <div class="tiny muted">${cd.past ? 'gelaufen'
            : (rc ? rc.weeksOut : cd.weeks) === 1 ? 'Woche vorher' : 'Wochen vorher'}</div>
          ${offset !== 0 && !cd.past ? `<div class="tiny muted" style="margin-top:2px">heute: ${esc(cd.text)}</div>` : ''}
        </div>
      </div>

      <div class="row wrap" style="gap:6px;margin-top:12px">
        <span class="chip">${race.distanceKm} km</span>
        <span class="chip">${race.vertM} hm+</span>
        <span class="chip">Limit ${race.limitHours} h</span>
      </div>

      ${rc ? `<div style="margin-top:16px">${phaseBar(PHASES, rc.weeksOut, startWeeksOut)}</div>
      <div class="note" style="margin-top:14px">${esc(rc.phase.detail)}</div>

      <div class="metric-grid" style="margin-top:12px">
        <div class="metric">
          <div class="metric__label">Laufen</div>
          <div class="metric__value">${prog.weeklyRunMinutes}<span class="metric__unit"> min</span></div>
          <div class="metric__delta muted">${durationLabel(prog.weeklyRunMinutes)}</div>
        </div>
        <div class="metric">
          <div class="metric__label">Höhenmeter</div>
          <div class="metric__value">${plan.plannedVert}<span class="metric__unit"> hm</span></div>
          <div class="metric__delta muted">Ziel ${rc.vertM}</div>
        </div>
        <div class="metric">
          <div class="metric__label">Phase</div>
          <div class="metric__value" style="font-size:16px">${esc(rc.phase.label)}</div>
        </div>
      </div>

      <div class="row wrap" style="gap:6px;margin-top:12px">
        ${rc.backToBackWeek ? '<span class="chip chip--on">Doppeltag diese Woche</span>' : ''}
        ${rc.downhillWeek ? '<span class="chip chip--on">Bergab-Einheit</span>' : ''}
        ${rc.nightWeek ? '<span class="chip chip--on">Nachtlauf</span>' : ''}
      </div>` : ''}

      <button class="btn btn--block" style="margin-top:14px" data-action="open-raceplan">Rennplan ansehen</button>
    </div>` : `
    <div class="card">
      <div class="section-label">Kein Ziel hinterlegt</div>
      <p class="small secondary" style="margin-top:8px">
        Ohne Zielrennen läuft der Plan endlos in Vierwochenblöcken weiter. Mit Ziel rechnet er
        vom Renntag rückwärts und wird zum Termin hin spezifischer.
      </p>
      <button class="btn btn--primary btn--block" style="margin-top:12px" data-action="open-settings">Ziel eintragen</button>
    </div>`}

    <div class="card">
      <div class="row row--between">
        <button class="icon-btn" data-action="week-shift" data-delta="-1" aria-label="Vorherige Woche">${icon('back')}</button>
        <div style="text-align:center">
          <div class="section-label">Woche ${plan.weekIndex + 1} · ${esc(prog.blockPhase || prog.phase)}</div>
          <div class="small secondary" style="margin-top:3px">${esc(shortDate(monday))} – ${esc(shortDate(addDays(monday, 6)))}</div>
        </div>
        <button class="icon-btn" data-action="week-shift" data-delta="1" aria-label="Nächste Woche"
                style="transform:rotate(180deg)">${icon('back')}</button>
      </div>
      ${offset !== 0 ? `<div style="margin-top:12px"><button class="btn btn--ghost btn--block btn--sm" data-action="week-shift" data-delta="0">Zurück zu dieser Woche</button></div>` : ''}
    </div>

    <div class="card">
      <div class="card__head">
        <h3 class="card__title">Wochenrhythmus</h3>
        <span class="card__meta">${plan.runs}× Lauf · ${plan.strength}× Kraft</span>
      </div>
      ${weekStrip(plan, ctx.date)}
      ${weekStripLegend()}
      <div class="divider" style="margin:14px 0 2px"></div>
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

      ${rc && totalRunMin ? `
      <div class="divider" style="margin:14px 0"></div>
      <div class="section-label" style="margin-bottom:10px">Gegen das Rennziel</div>
      <div class="stack">
        ${[
          ['Locker (Z1–Z2)', zm[0] + zm[1], zoneTargets(rc.weeksOut).easy],
          ['Schwelle (Z3)', zm[2], zoneTargets(rc.weeksOut).threshold],
          ['Hart (Z4–Z5)', zm[3] + zm[4], zoneTargets(rc.weeksOut).hard],
        ].map(([label, minutes, target]) => {
          const share = minutes / totalRunMin;
          const off = Math.abs(share - target) > 0.06;
          return `<div>
            <div class="row row--between">
              <span class="small">${esc(label)}</span>
              <span class="small num ${off ? 'tone-warn' : 'tone-good'}">
                ${Math.round(share * 100)} % <span class="muted">/ Ziel ${Math.round(target * 100)} %</span>
              </span>
            </div>
            <div style="margin-top:5px">${meter(share, Math.max(share, target), off ? 'var(--warn)' : 'var(--good)')}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="tiny muted" style="margin-top:10px">
        Ein Rennen über ${rc.plan.targetHours} Stunden läuft fast vollständig in Zone 1 und 2.
        Harte Einheiten schaden nicht, aber jede kostet Erholung, die für die langen Einheiten fehlt.
        Zone 5 kommt mit diesem Ziel gar nicht mehr vor.
      </div>` : `
      <div class="tiny muted" style="margin-top:10px">
        Der Löwenanteil gehört in Zone 1 und 2. Wenn hier zu viel Zone 3 steht, wird aus lockerem Laufen
        unbeabsichtigtes Halbgas – die teuerste Trainingsform, die es gibt.
      </div>`}
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
          <div class="metric__label">Blockwoche</div>
          <div class="metric__value" style="font-size:16px">${esc(prog.blockPhase || prog.phase)}</div>
        </div>
      </div>
      <div class="note" style="margin-top:12px">
        ${prog.deload
          ? 'Entlastungswoche: Der Laufumfang fällt auf rund 72 %. Genau hier kommt die Anpassung der drei Wochen davor an – nicht im Training selbst. Im Kraftraum wäre jetzt ein guter Zeitpunkt, es ebenfalls ruhiger angehen zu lassen.'
          : 'Aufbauwoche: Der Laufumfang steigt kontrolliert.'}
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
            <p><strong>Kraft:</strong> Die App legt nur fest, wann welche Einheit ansteht und wie viel
            Zeit dafür da ist. Übungen, Sätze und Gewichte steuerst du selbst – die Progression im
            Kraftraum liegt bei dir. Der Schwerpunkt (Beine, Oberkörper, Athletik) bleibt trotzdem im
            Modell, weil davon abhängt, was am Folgetag noch sinnvoll ist.</p>
            <p><strong>Intensive Läufe</strong> rotieren durch sechs Formen, damit Schwelle und VO2max
            abwechselnd gereizt werden. Die Wiederholungszahl wächst mit dem Wochenindex.</p>
            <p>Der Plan hat kein Ziel und kein Ende – er läuft in Blöcken weiter und passt sich über
            deine Marker an, nicht über einen Wettkampftermin.</p>
            <p>Was du in einer Krafteinheit gemacht hast, kannst du beim Abhaken notieren. Daraus wird
            dein eigener Verlauf, ohne dass die App dir Gewichte vorschreibt.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card" data-chart>
      <div class="card__head">
        <h3 class="card__title">Vorbelastung</h3>
        <span class="card__meta ${acwrTone}">${ctx.load.ratio == null
          ? `noch ${Math.max(0, ctx.load.minDays - ctx.load.trackedDays)} Tage sammeln`
          : `Verhältnis ${ctx.load.ratio}`}</span>
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
          ${ctx.load.ratio == null ? `<div class="metric__delta muted">ab ${ctx.load.minDays} Tagen</div>` : ''}
        </div>
      </div>
      <div class="tiny muted" style="margin-top:10px">
        Die gestrichelte Linie ist dein 28-Tage-Schnitt. Ein Verhältnis zwischen 0,8 und 1,3 ist der Bereich,
        in dem du dich steigerst, ohne dich zu überfahren. Über 1,45 senkt die App den Bereitschaftswert von
        sich aus. Solange weniger als ${ctx.load.minDays} Tage im Logbuch stehen, bleibt die Zahl leer – aus
        einer Einheit gegen lauter Nullen ließe sich nichts ablesen.
      </div>
    </div>

  </div>`;
}
