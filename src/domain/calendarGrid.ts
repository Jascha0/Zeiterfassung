import { addDays, endOfMonth, endOfWeek, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { toDateKey } from './routing';

export interface CalendarCell {
  dayStart: number;
  dateKey: string;
  dayOfMonth: number;
  inMonth: boolean;
}

export function buildCalendarWeeks(monthStart: number): CalendarCell[][] {
  const gridStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });

  const cells: CalendarCell[] = [];
  for (let d = gridStart; d.getTime() <= gridEnd.getTime(); d = addDays(d, 1)) {
    cells.push({
      dayStart: startOfDay(d).getTime(),
      dateKey: toDateKey(d.getTime()),
      dayOfMonth: d.getDate(),
      inMonth: isSameMonth(d, monthStart),
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
