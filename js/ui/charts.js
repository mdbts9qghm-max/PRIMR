// Diagramme als reines SVG. Regeln, an die sich alle halten:
//   dünne Marken, 2 px Linien, abgerundete Datenenden an der Grundlinie,
//   zurückhaltende Achsen, direkte Beschriftung statt Zahlen an jedem Punkt,
//   und ein Antipp-Ausleser statt Hover – die App läuft auf dem Handy.

import { esc } from './dom.js';
import { round } from '../core/util.js';

export const ZONE_COLORS = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)'];
export const TONE_COLORS = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  caution: 'var(--serious)',
  bad: 'var(--critical)',
};

/** Rechteck mit abgerundeten oberen Ecken, unten an der Grundlinie verankert. */
function barPath(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0.5) return `M${x} ${y + h} h${w}`;
  return `M${x} ${y + h} V${y + rad} a${rad} ${rad} 0 0 1 ${rad} -${rad} h${w - rad * 2} a${rad} ${rad} 0 0 1 ${rad} ${rad} V${y + h} Z`;
}

/**
 * Bereitschaftsring. Ein einzelner Wert – deshalb kein Diagramm mit Achsen,
 * sondern eine große Zahl mit Skala drumherum.
 */
export function readinessRing(score, tone, label) {
  const size = 132;
  const r = 56;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color = TONE_COLORS[tone] || 'var(--text-muted)';
  return `
    <svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"
         aria-label="Bereitschaft ${score ?? '–'} von 100, ${esc(label || '')}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
              stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"
              transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" dominant-baseline="middle"
            fill="var(--text-primary)" font-size="38" font-weight="650"
            style="font-variant-numeric:tabular-nums">${score ?? '–'}</text>
      <text x="${size / 2}" y="${size / 2 + 26}" text-anchor="middle" fill="var(--text-muted)" font-size="10.5"
            letter-spacing="0.08em">VON 100</text>
    </svg>`;
}

/**
 * Balken über die Zeit, eine Serie. items: [{ label, value, readout, dim }]
 * marker: optionaler Referenzwert als dünne Linie (z. B. 28-Tage-Schnitt).
 */
export function barChart(items, opts = {}) {
  if (!items.some((i) => (i.value || 0) > 0)) {
    return `<div class="empty tiny">${esc(opts.emptyText || 'Noch keine Daten – die Kurve entsteht, sobald du Einheiten einträgst.')}</div>`;
  }
  const w = opts.width || 320;
  const h = opts.height || 96;
  const padB = 16;
  const max = Math.max(opts.max || 0, ...items.map((i) => i.value || 0), 1);
  const n = items.length || 1;
  const slot = w / n;
  const bw = Math.max(4, Math.min(opts.barWidth || 14, slot - 3));
  const color = opts.color || 'var(--accent)';

  const bars = items.map((it, i) => {
    const bh = ((it.value || 0) / max) * (h - padB);
    const x = i * slot + (slot - bw) / 2;
    const y = h - padB - bh;
    return `<path d="${barPath(x, y, bw, bh, 4)}" fill="${color}" opacity="${it.dim ? 0.32 : 1}"
             data-mark="${i}" data-readout="${esc(it.readout || `${it.label}: ${round(it.value, 1)}`)}"/>
            <rect x="${i * slot}" y="0" width="${slot}" height="${h}" fill="transparent"
             data-mark="${i}" data-readout="${esc(it.readout || `${it.label}: ${round(it.value, 1)}`)}"/>`;
  }).join('');

  const ticks = items.map((it, i) => (it.tick
    ? `<text class="axis-label" x="${i * slot + slot / 2}" y="${h - 3}" text-anchor="middle">${esc(it.tick)}</text>`
    : '')).join('');

  const ref = opts.reference != null && opts.reference <= max
    ? `<line x1="0" x2="${w}" y1="${h - padB - (opts.reference / max) * (h - padB)}"
             y2="${h - padB - (opts.reference / max) * (h - padB)}"
             stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 3"/>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" height="${h}" role="img"
            aria-label="${esc(opts.ariaLabel || 'Balkendiagramm')}">
            <line class="grid-line" x1="0" x2="${w}" y1="${h - padB}" y2="${h - padB}"/>
            ${ref}${bars}${ticks}
          </svg>`;
}

/**
 * Verlaufslinie, eine Serie. points: [{ label, value }]
 * Der jüngste Punkt wird direkt beschriftet, alle anderen bleiben stumm.
 */
export function lineChart(points, opts = {}) {
  const valid = points.filter((p) => p.value != null);
  const w = opts.width || 320;
  const h = opts.height || 88;
  const padT = 10;
  const padB = 16;
  const padR = opts.labelLast === false ? 4 : 42;

  if (valid.length < 2) {
    return `<div class="empty tiny">Noch zu wenige Werte für einen Verlauf – ab zwei Einträgen zeichnet die App hier eine Linie.</div>`;
  }

  const values = valid.map((p) => p.value);
  const lo = opts.min != null ? opts.min : Math.min(...values);
  const hi = opts.max != null ? opts.max : Math.max(...values);
  const span = hi - lo || 1;
  const pad = span * 0.15;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i) => (i / (valid.length - 1)) * (w - padR);
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB);

  const d = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(i), 1)} ${round(y(p.value), 1)}`).join(' ');
  const area = `${d} L${round(x(valid.length - 1), 1)} ${h - padB} L0 ${h - padB} Z`;
  const color = opts.color || 'var(--accent)';
  const id = `g${Math.random().toString(36).slice(2, 8)}`;

  const dots = valid.map((p, i) => `
    <circle cx="${round(x(i), 1)}" cy="${round(y(p.value), 1)}" r="${i === valid.length - 1 ? 4.5 : 0}"
            fill="${color}" stroke="var(--surface-1)" stroke-width="2"/>
    <circle cx="${round(x(i), 1)}" cy="${round(y(p.value), 1)}" r="13" fill="transparent"
            data-mark="${i}" data-readout="${esc(`${p.label}: ${round(p.value, 1)}${opts.unit ? ` ${opts.unit}` : ''}`)}"/>`).join('');

  const last = valid[valid.length - 1];
  const label = opts.labelLast === false ? '' : `
    <text x="${round(x(valid.length - 1) + 8, 1)}" y="${round(y(last.value) + 4, 1)}" fill="var(--text-primary)"
          font-size="12" font-weight="600" style="font-variant-numeric:tabular-nums">${round(last.value, 1)}</text>`;

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" height="${h}" role="img"
            aria-label="${esc(opts.ariaLabel || 'Verlauf')}">
            <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient></defs>
            <line class="grid-line" x1="0" x2="${w - padR}" y1="${h - padB}" y2="${h - padB}"/>
            <path d="${area}" fill="url(#${id})"/>
            <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}${label}
            <text class="axis-label" x="0" y="${h - 3}">${esc(valid[0].label)}</text>
            <text class="axis-label" x="${w - padR}" y="${h - 3}" text-anchor="end">${esc(last.label)}</text>
          </svg>`;
}

/**
 * Waagerechter gestapelter Balken mit 2 px Lücken zwischen den Abschnitten.
 * segments: [{ label, value, color }]
 */
export function stackedBar(segments, opts = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return '<div class="empty tiny">Für diese Woche ist noch nichts geplant.</div>';
  const w = 320;
  const h = opts.height || 16;
  let x = 0;
  const gap = 2;
  const usable = w - gap * (segments.filter((s) => s.value > 0).length - 1);

  const parts = segments.filter((s) => s.value > 0).map((s) => {
    const sw = (s.value / total) * usable;
    const rect = `<rect x="${round(x, 1)}" y="0" width="${round(sw, 1)}" height="${h}" rx="3" fill="${s.color}"
                    data-mark="0" data-readout="${esc(`${s.label}: ${Math.round(s.value)} min (${Math.round((s.value / total) * 100)} %)`)}"/>`;
    x += sw + gap;
    return rect;
  }).join('');

  const legend = segments.filter((s) => s.value > 0).map((s) => `
    <span class="legend__item"><span class="legend__swatch" style="background:${s.color}"></span>${esc(s.label)}
      <span class="muted num">${Math.round(s.value)}′</span></span>`).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" height="${h}" preserveAspectRatio="none" role="img"
            aria-label="${esc(opts.ariaLabel || 'Verteilung')}">${parts}</svg>
          <div class="legend">${legend}</div>`;
}

/** Waagerechter Fortschrittsbalken für einen einzelnen Anteil. */
export function meter(value, max, color = 'var(--accent)') {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return `<svg class="chart" viewBox="0 0 100 6" height="6" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--surface-3)"/>
            <rect x="0" y="0" width="${round(pct * 100, 1)}" height="6" rx="3" fill="${color}"/>
          </svg>`;
}

/** Antipp-Ausleser: ersetzt den Hover-Tooltip auf Touch-Geräten. */
export function wireChartReadout(root) {
  root.querySelectorAll('[data-chart]').forEach((box) => {
    const out = box.querySelector('.chart-readout');
    if (!out) return;
    const base = out.textContent;
    const show = (e) => {
      const mark = e.target.closest('[data-readout]');
      if (!mark) return;
      out.textContent = mark.dataset.readout;
    };
    box.addEventListener('pointerdown', show);
    box.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e); });
    box.addEventListener('pointerleave', () => { out.textContent = base; });
  });
}
