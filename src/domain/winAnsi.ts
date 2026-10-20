/** The 27 printable Windows-1252 characters in 0x80–0x9F, as Unicode code points. */
const CP1252_EXTRA: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    CP1252_EXTRA.has(codePoint)
  );
}

/** NFC-normalise, then replace every code point not in U+0020–U+007E, U+00A0–U+00FF or CP1252_EXTRA by '?'.
 *  Iterates by code point (for…of), so one emoji (surrogate pair) → one '?'. Never throws. */
export function toWinAnsi(text: string): string {
  let result = '';
  for (const char of text.normalize('NFC')) {
    result += isWinAnsi(char.codePointAt(0) ?? 0) ? char : '?';
  }
  return result;
}
