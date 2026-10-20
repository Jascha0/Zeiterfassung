import { describe, expect, it } from 'vitest';
import { toWinAnsi } from './winAnsi';

describe('toWinAnsi', () => {
  it('keeps Windows-1252 text and replaces the rest', () => {
    const text = 'Arbeit – Kunde € „Zitat“ äöüÄÖÜß';
    expect(toWinAnsi(text)).toBe(text);
    expect(toWinAnsi('Kunde 🚀 A')).toBe('Kunde ? A');
  });

  it('keeps all 27 Windows-1252 specials', () => {
    const specials = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    expect([...specials]).toHaveLength(27);
    expect(toWinAnsi(specials)).toBe(specials);
  });

  it('keeps the printable ASCII and Latin-1 boundaries', () => {
    expect(toWinAnsi(' ~ ¡ ÿ é ©')).toBe(' ~ ¡ ÿ é ©');
  });

  it('replaces characters outside Windows-1252 one per code point', () => {
    expect(toWinAnsi('東京')).toBe('??');
    expect(toWinAnsi('Łódź')).toBe('?ód?');
    expect(toWinAnsi('Žižek')).toBe('Žižek');
    expect(toWinAnsi('Ω')).toBe('?');
  });

  it('composes decomposed accents via NFC', () => {
    expect(toWinAnsi('é')).toBe('é');
  });

  it('replaces control characters and lone surrogates', () => {
    expect(toWinAnsi('a\tb\nc')).toBe('a?b?c');
    expect(toWinAnsi('\u0081')).toBe('?');
    expect(toWinAnsi('\u007f')).toBe('?');
    expect(toWinAnsi('\uD83D')).toBe('?');
  });

  it('returns an empty string unchanged', () => {
    expect(toWinAnsi('')).toBe('');
  });
});
