import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadText, REVOKE_DELAY_MS } from './download';

interface ClickRecord {
  download: string;
  href: string;
  isConnected: boolean;
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let createObjectURL: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
let clicks: ClickRecord[];

beforeEach(() => {
  vi.useFakeTimers();
  createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:mock');
  revokeObjectURL = vi.fn<(url: string) => void>();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href, isConnected: this.isConnected });
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadBlob', () => {
  it('clicks an attached anchor, removes it, and revokes the URL after the delay', () => {
    const blob = new Blob(['x']);

    downloadBlob(blob, 'zeiterfassung-2026-09.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks).toEqual([{ download: 'zeiterfassung-2026-09.csv', href: 'blob:mock', isConnected: true }]);
    expect(document.body.querySelectorAll('a')).toHaveLength(0);
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('downloadText', () => {
  it('encodes the text as UTF-8 with the given type and file name', async () => {
    downloadText('\uFEFFä', 'text/csv;charset=utf-8', 'x.csv');

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa4]);
    expect(clicks.map((click) => click.download)).toEqual(['x.csv']);
  });
});
