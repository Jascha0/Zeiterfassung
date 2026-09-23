import { describe, expect, it } from 'vitest';
import { installStructuredClone } from './structuredClonePolyfill';

describe('installStructuredClone', () => {
  it('installs a faithful clone when the target has none', () => {
    const target: { structuredClone?: unknown } = {};
    expect(installStructuredClone(target)).toBe('installed');
    const clone = target.structuredClone as <T>(value: T) => T;
    const source = { id: 'a', end: null, start: 1_700_000_000_000, nested: [1, 2] };
    const copy = clone(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.end).toBeNull();
    expect(copy.nested).not.toBe(source.nested);
  });

  it('leaves an existing structuredClone untouched', () => {
    const existing = <T>(value: T): T => value;
    const target: { structuredClone?: unknown } = { structuredClone: existing };
    expect(installStructuredClone(target)).toBe('present');
    expect(target.structuredClone).toBe(existing);
  });
});
