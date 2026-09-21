import { describe, expect, it } from 'vitest';
import { parseHash } from './routing';

describe('parseHash', () => {
  it('parses the four known hashes and falls back for malformed input', () => {
    expect(parseHash('#/timer')).toEqual({ kind: 'timer' });
    expect(parseHash('#/kalender/2026-09')).toEqual({ kind: 'calendar', monthKey: '2026-09' });
    expect(parseHash('#/tag/2026-09-18')).toEqual({ kind: 'day', dateKey: '2026-09-18' });
    expect(parseHash('#/offene-eintraege')).toEqual({ kind: 'openEntries' });
    expect(parseHash('#/konto')).toEqual({ kind: 'account' });

    for (const malformed of [
      '',
      '#',
      '#/',
      '#/foo',
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
