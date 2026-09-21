import { describe, expect, it } from 'vitest';
import { validateEntryDraft } from './entryEditing';
import type { Entry } from './types';

describe('validateEntryDraft', () => {
  it('rejects an overlap with the fixed German message and accepts a gap', () => {
    const dayStart = new Date(2026, 8, 18).getTime();
    const now = new Date(2026, 8, 19, 12, 0).getTime();
    const existing: Entry = {
      id: 'e1',
      type: 'work',
      start: new Date(2026, 8, 18, 9, 0).getTime(),
      end: new Date(2026, 8, 18, 12, 0).getTime(),
      createdAt: 1,
      updatedAt: 1,
    };
    const base = { dayStart, allowOpenEnd: false, comparisonEntries: [existing], excludeEntryId: null, now };
    const overlapping = validateEntryDraft({ type: 'work', startText: '11:00', endText: '13:00' }, base);
    expect(overlapping).toEqual({
      ok: false,
      error: { field: 'start', message: 'Der Eintrag überschneidet sich mit einem anderen Eintrag.' },
    });
    const gap = validateEntryDraft({ type: 'work', startText: '13:00', endText: '14:00' }, base);
    expect(gap.ok).toBe(true);
  });
});
