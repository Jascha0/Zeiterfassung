import { describe, expect, it, vi } from 'vitest';
import { applyTheme, isThemePreference, readLocalTheme, resolveTheme, writeLocalTheme } from './theme';

describe('isThemePreference', () => {
  it.each(['light', 'dark', 'system'])('accepts "%s"', (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([undefined, null, '', 'blue', 42, {}])('rejects %s', (value) => {
    expect(isThemePreference(value)).toBe(false);
  });
});

describe('readLocalTheme', () => {
  it('reads a valid stored preference', () => {
    const storage = { getItem: () => 'dark' };
    expect(readLocalTheme(storage)).toBe('dark');
  });

  it('returns "system" when nothing is stored (edge case 33)', () => {
    const storage = { getItem: () => null };
    expect(readLocalTheme(storage)).toBe('system');
  });

  it('returns "system" for an invalid stored value (edge case 33)', () => {
    const storage = { getItem: () => 'blue' };
    expect(readLocalTheme(storage)).toBe('system');
  });

  it('returns "system" when storage.getItem throws (private mode, edge case 33)', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLocalTheme(storage)).toBe('system');
  });
});

describe('writeLocalTheme', () => {
  it('calls setItem with the storage key and preference', () => {
    const setItem = vi.fn();
    writeLocalTheme({ setItem }, 'dark');
    expect(setItem).toHaveBeenCalledWith('zeiterfassung.theme', 'dark');
  });

  it('swallows storage errors silently (edge case 33)', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => writeLocalTheme(storage, 'light')).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('resolves "light" to light regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('resolves "dark" to dark regardless of system preference', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('resolves "system" using the systemPrefersDark flag', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets dataset.theme and style.colorScheme on the given root element', () => {
    const root = document.createElement('div');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('applies "light" the same way', () => {
    const root = document.createElement('div');
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
  });
});
