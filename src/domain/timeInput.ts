import { addDays, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from 'date-fns';

export interface TimeOfDay {
  hours: number;
  minutes: number;
}

export function parseTimeOfDay(value: string): TimeOfDay | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatTimeOfDay(time: TimeOfDay): string {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

export function dayStartOf(instant: number): number {
  return startOfDay(instant).getTime();
}

export function combineDayAndTime(dayStart: number, time: TimeOfDay): number {
  const day = new Date(dayStart);
  return setMilliseconds(setSeconds(setMinutes(setHours(day, time.hours), time.minutes), 0), 0).getTime();
}

export function combineNextDayAndTime(dayStart: number, time: TimeOfDay): number {
  const nextDay = addDays(startOfDay(new Date(dayStart)), 1);
  return setMilliseconds(setSeconds(setMinutes(setHours(nextDay, time.hours), time.minutes), 0), 0).getTime();
}

export function resolveEntryInstants(
  dayStart: number,
  start: TimeOfDay,
  end: TimeOfDay | null,
): { start: number; end: number | null } {
  const startInstant = combineDayAndTime(dayStart, start);
  if (end === null) return { start: startInstant, end: null };
  const sameDayEnd = combineDayAndTime(dayStart, end);
  return {
    start: startInstant,
    end: sameDayEnd < startInstant ? combineNextDayAndTime(dayStart, end) : sameDayEnd,
  };
}

export function resolveEndForStart(start: number, end: TimeOfDay): number {
  const dayStart = dayStartOf(start);
  const sameDay = combineDayAndTime(dayStart, end);
  return sameDay < start ? combineNextDayAndTime(dayStart, end) : sameDay;
}
