// Herzfrequenzzonen – fest vorgegeben, alle Einheiten werden darüber gesteuert.

export const ZONES = [
  { z: 1, from: 114, to: 138, name: 'Regeneration', purpose: 'Durchblutung, aktive Erholung', color: 'z1' },
  { z: 2, from: 139, to: 160, name: 'Grundlage', purpose: 'Fettstoffwechsel, Kapillarisierung, aerobe Basis', color: 'z2' },
  { z: 3, from: 161, to: 175, name: 'Schwelle', purpose: 'Laktatschwelle anheben, Tempohärte', color: 'z3' },
  { z: 4, from: 176, to: 190, name: 'VO2max', purpose: 'Maximale Sauerstoffaufnahme', color: 'z4' },
  { z: 5, from: 191, to: 205, name: 'Anaerob', purpose: 'Neuromuskuläre Spritzigkeit, Laufökonomie', color: 'z5' },
];

export function zone(n) {
  return ZONES.find((z) => z.z === n) || ZONES[1];
}

export function zoneRange(n) {
  const z = zone(n);
  return `${z.from}–${z.to} bpm`;
}

export function zoneLabel(n) {
  const z = zone(n);
  return `Z${z.z} · ${z.from}–${z.to}`;
}
