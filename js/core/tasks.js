// Aufgaben: tägliche Gewohnheiten und selbst angelegte Aufgaben.
// Gewohnheiten wiederholen sich, eigene Aufgaben können einmalig,
// täglich, an bestimmten Wochentagen oder an bestimmten Schichttagen stehen.

import { uid, addDays, fromIso } from './util.js';

export const CATEGORIES = {
  schlaf: { label: 'Schlaf', color: 'cat-sleep' },
  ernaehrung: { label: 'Ernährung', color: 'cat-food' },
  bewegung: { label: 'Bewegung', color: 'cat-move' },
  kopf: { label: 'Kopf', color: 'cat-mind' },
  alltag: { label: 'Alltag', color: 'cat-life' },
};

/** Startset an Gewohnheiten – bewusst klein, damit es durchhaltbar bleibt. */
export function defaultHabits() {
  return [
    h('Tageslicht direkt nach dem Aufstehen', 'schlaf', 'daily', '10–20 min draußen. Der stärkste Taktgeber für deinen Rhythmus im Wechselschichtdienst.'),
    h('3 Liter Wasser', 'ernaehrung', 'daily', 'Über den Tag verteilt. Ein Liter davon vor der ersten Mahlzeit.'),
    h('Protein-Ziel erreicht', 'ernaehrung', 'daily', '1,8–2,2 g je kg Körpergewicht. Ohne das läuft die Anpassung aus dem Training ins Leere.'),
    h('Koffein-Stopp eingehalten', 'schlaf', 'daily', 'Acht Stunden vor dem Hauptschlaf. Die App zeigt dir die Uhrzeit für heute.'),
    h('Bildschirme 60 min vor dem Bett aus', 'schlaf', 'daily', 'Nicht wegen des blauen Lichts, sondern weil der Kopf sonst nicht runterfährt.'),
    h('10 min Mobility', 'bewegung', 'daily', 'Hüfte, Brustwirbelsäule, Sprunggelenk. Auch an Schichttagen machbar.'),
    h('Tagesabschluss notiert', 'kopf', 'daily', 'Zwei Sätze: Was lief gut, was steht morgen an. Nimmt Druck vom Einschlafen.'),
  ];
}

function h(title, category, repeat, note) {
  return {
    id: uid(),
    title,
    category,
    repeat,
    note,
    habit: true,
    created: null,
    weekdays: null,
    shiftDays: null,
    due: null,
    archived: false,
  };
}

export function createTask(input) {
  return {
    id: uid(),
    title: input.title.trim(),
    category: input.category || 'alltag',
    repeat: input.repeat || 'once',
    note: input.note || '',
    habit: input.habit || false,
    created: input.created,
    weekdays: input.weekdays || null,
    shiftDays: input.shiftDays || null,
    due: input.due || null,
    archived: false,
  };
}

/** Steht die Aufgabe an diesem Tag an? */
export function dueOn(task, isoDate, shiftKey) {
  if (task.archived) return false;
  if (task.created && isoDate < task.created) return false;

  switch (task.repeat) {
    case 'daily':
      return true;
    case 'weekdays': {
      const wd = fromIso(isoDate).getDay();
      return Array.isArray(task.weekdays) && task.weekdays.includes(wd);
    }
    case 'shift':
      return Array.isArray(task.shiftDays) && task.shiftDays.includes(shiftKey);
    case 'once':
      return task.due === isoDate;
    default:
      return false;
  }
}

export function tasksFor(tasks, isoDate, shiftKey) {
  return tasks.filter((t) => dueOn(t, isoDate, shiftKey));
}

/** Offene Einmal-Aufgaben, deren Termin verstrichen ist. */
export function overdue(tasks, done, isoDate) {
  return tasks.filter(
    (t) => !t.archived && t.repeat === 'once' && t.due && t.due < isoDate && !(done[t.due] || []).includes(t.id),
  );
}

/** Aktuelle Serie einer Gewohnheit (Tage in Folge bis gestern/heute). */
export function streak(task, done, isoDate, shiftKeyFor) {
  let count = 0;
  let cursor = isoDate;
  for (let i = 0; i < 400; i += 1) {
    if (!dueOn(task, cursor, shiftKeyFor(cursor))) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const list = done[cursor] || [];
    if (list.includes(task.id)) {
      count += 1;
    } else if (cursor !== isoDate) {
      break;
    } else if (count === 0) {
      // Heute noch offen – die Serie von gestern zählt weiter.
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** Erledigungsquote der letzten n Tage. */
export function completionRate(tasks, done, isoDate, n, shiftKeyFor) {
  let due = 0;
  let hit = 0;
  for (let i = 0; i < n; i += 1) {
    const d = addDays(isoDate, -i);
    const list = done[d] || [];
    tasks.forEach((t) => {
      if (!dueOn(t, d, shiftKeyFor(d))) return;
      due += 1;
      if (list.includes(t.id)) hit += 1;
    });
  }
  return { due, hit, pct: due ? Math.round((hit / due) * 100) : null };
}
