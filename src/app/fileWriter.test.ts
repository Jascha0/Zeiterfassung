/**
 * The file-writing seam (0058). jsdom defines neither `URL.createObjectURL` nor
 * `URL.revokeObjectURL` — which is exactly why writing a file is an injectable seam. Both are
 * installed here so the whole hand-off (Blob → object URL → temporary anchor → revoke) is visible,
 * and a capturing click handler suppresses jsdom's unimplemented navigation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDownloadFileWriter } from './fileWriter';

let captured: Blob | null = null;
let revoked: string[] = [];
let suppressNavigation: (event: Event) => void = () => undefined;

beforeEach(() => {
  captured = null;
  revoked = [];
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      captured = blob;
      return 'blob:test';
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  suppressNavigation = (event: Event) => event.preventDefault();
  document.addEventListener('click', suppressNavigation, true);
});

afterEach(() => {
  document.removeEventListener('click', suppressNavigation, true);
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  vi.restoreAllMocks();
});

describe('createDownloadFileWriter', () => {
  it('hands the browser the file under its name and cleans up afterwards', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    const writer = createDownloadFileWriter();

    await expect(writer.writeTextFile('x.json', '{"a":1}')).resolves.toBeUndefined();

    const anchors = createElement.mock.calls
      .map((call, index) => ({ tag: call[0], element: createElement.mock.results[index].value }))
      .filter((created) => created.tag === 'a')
      .map((created) => created.element as HTMLAnchorElement);
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0];
    expect(anchor.download).toBe('x.json');
    expect(anchor.href).toBe('blob:test');

    const blob = captured;
    if (blob === null) throw new Error('no Blob reached URL.createObjectURL');
    expect(await blob.text()).toBe('{"a":1}');
    expect(blob.type).toBe('application/json');

    expect(revoked).toEqual(['blob:test']);
    expect(document.body.contains(anchor)).toBe(false);
  });

  it('rejects when the browser refuses the hand-off', async () => {
    Object.assign(URL, {
      createObjectURL: () => {
        throw new Error('kein Object-URL');
      },
    });
    const writer = createDownloadFileWriter();

    await expect(writer.writeTextFile('x.json', 'text')).rejects.toThrow();
  });
});
