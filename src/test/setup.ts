process.env.TZ = 'Europe/Berlin';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installStructuredClone } from './structuredClonePolyfill';

installStructuredClone(globalThis);

afterEach(() => {
  cleanup();
});
