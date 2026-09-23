import { deserialize, serialize } from 'node:v8';

/** Installs a faithful structuredClone when the environment has none (jsdom 30 has none), using V8
 *  serialization so `end: null` stays null and numbers stay numbers. Returns what it did. */
export function installStructuredClone(target: { structuredClone?: unknown }): 'installed' | 'present' {
  if (typeof target.structuredClone === 'function') return 'present';
  target.structuredClone = <T>(value: T): T => deserialize(serialize(value)) as T;
  return 'installed';
}
