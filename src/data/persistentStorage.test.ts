import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persistentStorage';

describe('requestPersistentStorage', () => {
  it('returns true and calls persist once when the browser grants persistence', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    await expect(requestPersistentStorage({ storage: { persist } })).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns false when the browser denies persistence', async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    await expect(requestPersistentStorage({ storage: { persist } })).resolves.toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns false without throwing when persist rejects', async () => {
    const persist = vi.fn(() => Promise.reject(new Error('denied')));
    await expect(requestPersistentStorage({ storage: { persist } })).resolves.toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns false when storage exists but has no persist method', async () => {
    await expect(requestPersistentStorage({ storage: {} })).resolves.toBe(false);
  });

  it('returns false when the navigator has no storage at all', async () => {
    await expect(requestPersistentStorage({})).resolves.toBe(false);
  });

  it('returns false for null and for undefined', async () => {
    await expect(requestPersistentStorage(null)).resolves.toBe(false);
    await expect(requestPersistentStorage(undefined)).resolves.toBe(false);
  });
});
