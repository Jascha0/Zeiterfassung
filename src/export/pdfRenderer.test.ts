import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfContent } from '../domain/pdfContent';
import { renderPdf } from './pdfRenderer';

const { blob, doc, JsPdf, autoTable } = vi.hoisted(() => {
  const blob = new Blob(['x']);
  const doc = {
    setFontSize: vi.fn(),
    text: vi.fn(),
    output: vi.fn((): unknown => blob),
  };
  const JsPdf = vi.fn(function () {
    return doc;
  });
  const autoTable = vi.fn();
  return { blob, doc, JsPdf, autoTable };
});

vi.mock('jspdf', () => ({ jsPDF: JsPdf }));
vi.mock('jspdf-autotable', () => ({ autoTable }));

const content: PdfContent = {
  title: 'T',
  headerLines: ['a@b.de', 'Erstellt am 17.10.2026 14:05'],
  dayHead: ['Datum', 'Arbeit', 'Pause', 'Projekte'],
  dayRows: [['Di 06.10.2026', '7:30', '0:30', 'Kunde A 7:30']],
  totalRows: [['Arbeit gesamt', '7:30']],
};

beforeEach(() => {
  vi.clearAllMocks();
  doc.output.mockImplementation(() => blob);
  JsPdf.mockImplementation(function () {
    return doc;
  });
});

describe('renderPdf', () => {
  it('draws A4 portrait with header text and both tables', async () => {
    const result = await renderPdf(content);

    expect(JsPdf).toHaveBeenCalledTimes(1);
    expect(JsPdf).toHaveBeenCalledWith(expect.objectContaining({ orientation: 'portrait', format: 'a4' }));
    expect(doc.text.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'T',
      'a@b.de',
      'Erstellt am 17.10.2026 14:05',
    ]);
    expect(autoTable).toHaveBeenCalledTimes(2);
    expect(autoTable).toHaveBeenNthCalledWith(
      1,
      doc,
      expect.objectContaining({ head: [content.dayHead], body: content.dayRows }),
    );
    expect(autoTable).toHaveBeenNthCalledWith(2, doc, expect.objectContaining({ body: content.totalRows }));
    expect(autoTable.mock.calls[1]?.[1]).not.toHaveProperty('head');
    expect(doc.output).toHaveBeenCalledWith('blob');
    expect(result).toBe(blob);
  });

  it('rejects when jsPDF throws', async () => {
    JsPdf.mockImplementation(function () {
      throw new Error('boom');
    });

    await expect(renderPdf(content)).rejects.toThrow('boom');
  });

  it('rejects when the output step throws', async () => {
    doc.output.mockImplementation(() => {
      throw new Error('output failed');
    });

    await expect(renderPdf(content)).rejects.toThrow('output failed');
  });
});
