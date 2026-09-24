import { format, isValid, parse, startOfDay, startOfMonth } from 'date-fns';

export type Route =
  | { kind: 'timer' }
  | { kind: 'calendar'; monthKey: string }
  | { kind: 'day'; dateKey: string }
  | { kind: 'settings' };

export const FALLBACK_ROUTE: Route = { kind: 'timer' };

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_FORMAT = 'yyyy-MM';
const DATE_FORMAT = 'yyyy-MM-dd';

function parseKey(value: string, pattern: RegExp, keyFormat: string): Date | null {
  if (!pattern.test(value)) return null;
  const parsed = parse(value, keyFormat, new Date());
  if (!isValid(parsed)) return null;
  if (format(parsed, keyFormat) !== value) return null;
  return parsed;
}

export function isMonthKey(value: string): boolean {
  return parseKey(value, MONTH_PATTERN, MONTH_FORMAT) !== null;
}

export function isDateKey(value: string): boolean {
  return parseKey(value, DATE_PATTERN, DATE_FORMAT) !== null;
}

export function toMonthKey(instant: number): string {
  return format(instant, MONTH_FORMAT);
}

export function toDateKey(instant: number): string {
  return format(instant, DATE_FORMAT);
}

export function monthStartFromKey(monthKey: string): number {
  const parsed = parseKey(monthKey, MONTH_PATTERN, MONTH_FORMAT);
  if (parsed === null) throw new RangeError(`Ungültiger Schlüssel: ${monthKey}`);
  return startOfMonth(parsed).getTime();
}

export function dayStartFromKey(dateKey: string): number {
  const parsed = parseKey(dateKey, DATE_PATTERN, DATE_FORMAT);
  if (parsed === null) throw new RangeError(`Ungültiger Schlüssel: ${dateKey}`);
  return startOfDay(parsed).getTime();
}

export function monthKeyOfDateKey(dateKey: string): string {
  return toMonthKey(dayStartFromKey(dateKey));
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\//, '');
  const segments = path.split('/');
  if (segments.length === 1) {
    const [only] = segments;
    if (only === '' || only === 'timer') return { kind: 'timer' };
    if (only === 'einstellungen') return { kind: 'settings' };
    return FALLBACK_ROUTE;
  }
  if (segments.length === 2) {
    const [head, value] = segments;
    if (head === 'kalender' && isMonthKey(value)) return { kind: 'calendar', monthKey: value };
    if (head === 'tag' && isDateKey(value)) return { kind: 'day', dateKey: value };
  }
  return FALLBACK_ROUTE;
}

export function routeToHash(route: Route): string {
  switch (route.kind) {
    case 'timer':
      return '#/timer';
    case 'calendar':
      return `#/kalender/${route.monthKey}`;
    case 'day':
      return `#/tag/${route.dateKey}`;
    case 'settings':
      return '#/einstellungen';
  }
}
