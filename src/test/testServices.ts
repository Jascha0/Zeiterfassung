import type { Services } from '../app/ServicesContext';
import type { FileWriter } from '../app/fileWriter';
import type { LocalStore } from '../data/localStore';

/** A writer that must not be used: a test that exports injects its own recording double. */
export const unusedFileWriter: FileWriter = {
  writeTextFile: () => Promise.reject(new Error('this test injected no FileWriter')),
};

/** Every Services member wired to one store. Overrides replace individual members. */
export function servicesOf(store: LocalStore, overrides: Partial<Services> = {}): Services {
  return { entries: store, settings: store, backup: store, files: unusedFileWriter, ...overrides };
}
