import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, type Route } from './routing';

describe('parseHash', () => {
  it('parses the four known hashes and falls back for malformed or retired input', () => {
    expect(parseHash('#/timer')).toEqual({ kind: 'timer' });
    expect(parseHash('#/kalender/2026-09')).toEqual({ kind: 'calendar', monthKey: '2026-09' });
    expect(parseHash('#/tag/2026-09-18')).toEqual({ kind: 'day', dateKey: '2026-09-18' });
    expect(parseHash('#/einstellungen')).toEqual({ kind: 'settings' });

    for (const malformed of [
      '',
      '#',
      '#/',
      '#/foo',
      '#/konto',
      '#/offene-eintraege',
      '#/kalender',
      '#/kalender/2026-13',
      '#/kalender/2026-9',
      '#/tag/2026-02-30',
      '#/tag/2026-09-18/extra',
    ]) {
      expect(parseHash(malformed)).toEqual({ kind: 'timer' });
    }
  });
});

describe('routeToHash', () => {
  it('serialises every route and round-trips through parseHash', () => {
    const routes: Route[] = [
      { kind: 'timer' },
      { kind: 'calendar', monthKey: '2026-09' },
      { kind: 'day', dateKey: '2026-09-18' },
      { kind: 'settings' },
    ];
    expect(routes.map(routeToHash)).toEqual([
      '#/timer',
      '#/kalender/2026-09',
      '#/tag/2026-09-18',
      '#/einstellungen',
    ]);
    for (const route of routes) expect(parseHash(routeToHash(route))).toEqual(route);
  });
});
