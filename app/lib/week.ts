export interface WeekBounds {
  start: Date; // Monday 00:00:00.000
  end: Date; // Sunday 23:59:59.999
}

function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekBounds(date: Date): WeekBounds {
  const start = getMonday(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getPreviousWeek(date: Date): WeekBounds {
  const monday = getMonday(date);
  monday.setDate(monday.getDate() - 7);
  return getWeekBounds(monday);
}

export function getNextWeek(date: Date): WeekBounds {
  const monday = getMonday(date);
  monday.setDate(monday.getDate() + 7);
  return getWeekBounds(monday);
}

export function formatWeekKey(date: Date): string {
  const monday = getMonday(date);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
