// Bausteine, die in mehreren Tabs vorkommen.

import { esc, icon } from './dom.js';
import { ZONE_COLORS } from './charts.js';
import { zone, zoneRange } from '../core/zones.js';
import { durationLabel, weekdayShort, shortDate, round } from '../core/util.js';

/** Eine Quelle für die Farbe eines Tages – Streifen, Raster und Editor
 *  sollen nicht auseinanderlaufen. */
export function shiftColor(raw) {
  if (raw === 'T') return 'var(--shift-t)';
  if (raw === 'N') return 'var(--shift-n)';
  if (raw === 'K') return 'var(--critical)';
  return 'var(--shift-f)'; // F und U – Urlaub ist ein freier Tag
}

const BADGE_CLASS = {
  tag: 'badge--tag',
  nacht: 'badge--nacht',
  nacht_folge: 'badge--nacht',
  schlaftag: 'badge--schlaf',
  frei: 'badge--frei',
  frei_vor_tag: 'badge--frei',
  krank: 'badge--krank',
};

export function shiftBadge(day) {
  const time = day.work ? ` · ${day.work.from}–${day.work.to}` : '';
  return `<span class="badge ${BADGE_CLASS[day.key]}">${esc(day.label)}${esc(time)}</span>`;
}

export function zonePill(n) {
  return `<span class="zone-pill" style="background:${ZONE_COLORS[n - 1]}">Z${n} · ${zoneRange(n)}</span>`;
}

export function blockRows(session) {
  if (!session.blocks || !session.blocks.length) return '';
  return `<div class="list">${session.blocks.map((b) => `
    <div class="block-row">
      <div class="block-row__rail" style="background:${b.zone ? ZONE_COLORS[b.zone - 1] : 'var(--line)'}"></div>
      <div class="grow">
        <div class="block-row__label">${esc(b.label)}</div>
        <div class="block-row__detail">${esc(b.detail)}</div>
      </div>
      ${b.minutes ? `<div class="block-row__min">${b.minutes}′</div>` : ''}
    </div>`).join('')}</div>`;
}

/**
 * Trainingskarte. compact = Vorschau in der Wochenliste.
 */
export function sessionCard(session, opts = {}) {
  const {
    window: win, why, note, changed, date, logged, compact,
  } = opts;
  const slot = opts.slot || session.slot;
  const entry = logged && (logged.sessions || []).find((x) => x.slot === slot);

  if (!session) return '';

  if (compact) {
    return `<div class="row row--between" style="gap:12px">
      <div class="grow">
        <div class="block-row__label">${esc(session.title)}</div>
        <div class="tiny muted">${esc(session.subtitle || '')}</div>
      </div>
      ${session.durationMin ? `<div class="tiny muted num">${durationLabel(session.durationMin)}</div>` : ''}
    </div>`;
  }

  const zoneRow = session.primaryZone
    ? `<div class="row wrap" style="gap:6px;margin-top:10px">${zonePill(session.primaryZone)}
        <span class="tiny muted">${esc(zone(session.primaryZone).purpose)}</span></div>`
    : '';

  return `
    <div class="card card--accent">
      <div class="row row--between">
        <div class="grow">
          <div class="section-label">${esc(opts.label || 'Training heute')}</div>
          <h2 style="font-size:21px;margin-top:5px">${esc(session.title)}</h2>
          <div class="small secondary" style="margin-top:3px">${esc(session.subtitle || '')}</div>
        </div>
        ${session.durationMin ? `<div style="text-align:right;flex:none">
          <div class="num" style="font-size:20px;font-weight:600">${session.durationMin}</div>
          <div class="tiny muted">${esc(session.durationCaption || 'Minuten')}</div>
        </div>` : ''}
      </div>

      ${zoneRow}

      ${win && session.kind !== 'rest' ? `<div class="row wrap" style="gap:6px;margin-top:10px">
        <span class="chip">Fenster ${esc(win.from)}–${esc(win.to)}</span>
        <span class="chip">${esc(win.quality)}</span>
      </div>` : ''}

      ${changed && note ? `<div class="note note--warn" style="margin-top:12px">${esc(note)}</div>` : ''}
      ${why ? `<div class="note" style="margin-top:12px">${esc(why)}</div>` : ''}

      ${session.blocks && session.blocks.length ? `
        <div class="disclose" data-disclose="blocks-${esc(date || '')}">
          <button class="disclose__toggle" data-action="toggle-disclose">
            <span>Ablauf der Einheit</span>
            <span class="disclose__chev">${icon('chevron')}</span>
          </button>
          <div class="disclose__body">
            ${blockRows(session)}
            ${session.coachNote ? `<div class="note" style="margin-top:12px">${esc(session.coachNote)}</div>` : ''}
            ${session.focus ? `<div class="tiny muted" style="margin-top:10px">Ziel: ${esc(session.focus)}</div>` : ''}
          </div>
        </div>` : ''}

      ${session.kind !== 'rest' && session.kind !== 'sick' && date ? `
        <div class="btn-group" style="margin-top:14px">
          ${entry
            ? `<button class="btn btn--ghost" data-action="undo-session" data-date="${esc(date)}" data-slot="${esc(slot)}">Eintrag zurücknehmen</button>`
            : `<button class="btn btn--primary" data-action="complete-session" data-date="${esc(date)}" data-slot="${esc(slot)}">${icon('check')} Erledigt</button>
               <button class="btn" data-action="skip-session" data-date="${esc(date)}" data-slot="${esc(slot)}">Ausgelassen</button>`}
        </div>` : ''}
      ${entry ? `<div class="tiny muted" style="margin-top:8px">${entry.skipped ? 'Ausgelassen' : `Eingetragen: ${esc(entry.title)}${entry.rpe ? ` · Anstrengung ${entry.rpe}/10` : ''}`}</div>` : ''}
    </div>`;
}

/** Zeile in der Wochenübersicht. */
export function dayRow(entry, todayIso, logged) {
  const isToday = entry.date === todayIso;
  const sessions = (logged && logged.sessions) || [];
  const planned = [entry.session, entry.extra].filter(Boolean);
  const done = planned.length > 0 && planned.every((s) => sessions.some((x) => x.slot === s.slot));
  return `
    <button class="list__item" style="width:100%;text-align:left;background:none"
            data-action="open-day" data-date="${esc(entry.date)}">
      <div style="width:44px;flex:none">
        <div class="tiny ${isToday ? '' : 'muted'}" style="font-weight:${isToday ? 700 : 400}">${weekdayShort(entry.date)}</div>
        <div class="tiny muted num">${shortDate(entry.date)}</div>
      </div>
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:6px">
          <span class="chip" style="padding:2px 8px">${esc(entry.shift.short)}</span>
          <span class="block-row__label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(entry.session.title)}${entry.extra ? ` + ${esc(entry.extra.title)}` : ''}</span>
        </div>
        <div class="tiny muted" style="margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(entry.session.subtitle || entry.shift.label)}</div>
      </div>
      <div style="flex:none;text-align:right">
        ${done ? `<span class="tone-good">${icon('check')}</span>`
          : entry.session.durationMin ? `<span class="tiny muted num">${entry.session.durationMin + (entry.extra ? entry.extra.durationMin : 0)}′</span>` : ''}
      </div>
    </button>`;
}

export const KIND_LABEL = {
  run: 'Lauf', strength: 'Kraft', mobility: 'Mob.', rest: 'frei', sick: 'krank',
};

/**
 * Wochenrhythmus als Streifen: Dienst oben, geplanter Umfang als Balken,
 * darunter die Art der Einheit. Ein Punkt markiert harte Tage – daran sieht
 * man auf einen Blick, ob genug Abstand dazwischen liegt.
 */
export function weekStrip(plan, todayIso) {
  // Höhe der Balken sind Belastungspunkte, nicht Minuten: bei Kraft ist die
  // Minutenzahl das Zeitfenster, beim Laufen die tatsächliche Dauer – die
  // beiden nebeneinander zu stellen wäre irreführend.
  const loadOf = (d) => [d.session, d.extra].filter(Boolean)
    .reduce((a, s) => a + (s.load || 0), 0);
  const max = Math.max(20, ...plan.days.map(loadOf));

  return `<div class="weekstrip">${plan.days.map((d) => {
    const total = loadOf(d);
    const hard = [d.session, d.extra].filter(Boolean).some((s) => s.hard);
    const color = shiftColor(d.shift.raw);
    const label = (KIND_LABEL[d.session.kind] || '–') + (d.extra ? '+' : '');
    const height = total ? Math.max(3, (total / max) * 34) : 2;

    return `<button class="weekstrip__col ${d.date === todayIso ? 'weekstrip__col--today' : ''}"
              data-action="open-day" data-date="${esc(d.date)}"
              aria-label="${esc(`${weekdayShort(d.date)} ${shortDate(d.date)}, ${d.shift.label}, ${d.session.title}${d.extra ? ` und ${d.extra.title}` : ''}${hard ? ', harte Einheit' : ''}`)}">
      <span class="weekstrip__wd">${weekdayShort(d.date)}</span>
      <span class="weekstrip__shift" style="background:${color}">${esc(d.shift.code)}</span>
      <span class="weekstrip__hard ${hard ? '' : 'weekstrip__hard--empty'}"></span>
      <span class="weekstrip__bar">
        <span class="weekstrip__fill ${total && !hard ? 'weekstrip__fill--soft' : ''}"
              style="height:${round(height, 1)}px"></span>
      </span>
      <span class="weekstrip__kind">${esc(label)}</span>
    </button>`;
  }).join('')}</div>`;
}

export function weekStripLegend() {
  return `<div class="legend">
    <span class="legend__item"><span class="legend__swatch" style="background:var(--shift-t)"></span>T · Tagschicht</span>
    <span class="legend__item"><span class="legend__swatch" style="background:var(--shift-n)"></span>N · Nachtschicht</span>
    <span class="legend__item"><span class="legend__swatch" style="background:var(--shift-f)"></span>Ü, DF und Urlaub</span>
    <span class="legend__item"><span class="legend__swatch" style="background:var(--critical)"></span>K · krank</span>
    <span class="legend__item"><span class="weekstrip__hard"></span>harte Einheit</span>
  </div>
  <div class="tiny muted" style="margin-top:6px">Balkenhöhe: geplante Belastungspunkte. Tippen öffnet den Tag.</div>`;
}


/**
 * Position im Fünferblock T · N · Ü · DF · DF. Sagt mehr als "Tag 4 von 35":
 * man sieht, was hinter einem liegt und was als Nächstes kommt.
 */
export function blockPosition(day, positions) {
  const here = day.index % positions.length;
  // Bei Urlaub oder Krankheit zählt der Zyklus zwar weiter, aber der Tag ist
  // nicht dieser Dienst. Dann wird nichts hervorgehoben, sondern nur gezeigt,
  // wo im Block du stehen würdest.
  const absent = Boolean(day.absence);
  return `<div class="blockpos" role="img"
            aria-label="${esc(absent
              ? `Heute ist ${day.label}. Regeldienst wäre ${positions[here].label}.`
              : `Heute ist ${day.label}, Position ${here + 1} im Fünferblock`)}">
    ${positions.map((p, i) => {
      const cls = i === here && !absent ? 'blockpos__cell--now' : i < here ? 'blockpos__cell--past' : '';
      const ring = i === here && absent ? 'outline:1px dashed var(--text-muted);outline-offset:-1px;' : '';
      return `<span class="blockpos__cell ${cls}"
                style="${ring}${i === here && !absent ? `background:${shiftColor(p.code === 'T' ? 'T' : p.code === 'N' ? 'N' : 'F')}` : ''}"
                title="${esc(p.label)}">${esc(p.code)}</span>`;
    }).join('')}
  </div>`;
}


/**
 * Die Phasen bis zum Rennen als Leiste. Breite je Phase entspricht ihrer
 * Dauer, damit sichtbar wird, wie viel Zeit worin steckt.
 */
export function phaseBar(phases, weeksOut, startWeeksOut) {
  const segs = phases
    .map((p, i) => {
      const from = Math.min(startWeeksOut, i === 0 ? startWeeksOut : phases[i - 1].from - 1);
      const to = p.from;
      return { ...p, weeks: Math.max(0, from - to + 1), from, to };
    })
    .filter((p) => p.weeks > 0 && p.to <= startWeeksOut);

  const total = segs.reduce((a, p) => a + p.weeks, 0) || 1;
  const current = segs.find((p) => weeksOut >= p.to && weeksOut <= p.from);

  return `<div>
    <div class="phasebar" role="img" aria-label="${esc(`Phase ${current ? current.label : ''}, noch ${weeksOut} Wochen bis zum Rennen`)}">
      ${segs.map((p) => {
        const state = weeksOut < p.to ? 'done' : p === current ? 'now' : '';
        const cls = p.key === 'rennwoche' ? 'phasebar__seg--race' : state ? `phasebar__seg--${state}` : '';
        return `<span class="phasebar__seg ${cls}" style="flex:${p.weeks}"
                  title="${esc(`${p.label}: ${p.weeks} Wochen`)}"></span>`;
      }).join('')}
    </div>
    <div class="phasebar__labels">
      <span class="tiny" style="color:var(--accent);font-weight:600">${esc(current ? current.label : '')}</span>
      <span class="tiny muted">Rennen</span>
    </div>
  </div>`;
}
