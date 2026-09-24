import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useServices } from './ServicesContext';
import { useToast } from './ToastContext';
import { useTheme } from '../theme/ThemeContext';

/**
 * Edge case 37: useServices/useTheme/useToast must throw a descriptive error when used
 * outside their provider. renderHook mounts a minimal host component so the hook runs inside a
 * real render (a bare function call would hit React's "invalid hook call" guard instead of ours).
 */
describe('Hooks throw outside their provider (edge case 37)', () => {
  it('useServices throws', () => {
    expect(() => renderHook(() => useServices())).toThrow('useServices must be used within ServicesProvider');
  });

  it('useToast throws', () => {
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used within ToastProvider');
  });

  it('useTheme throws', () => {
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within ThemeProvider');
  });
});
