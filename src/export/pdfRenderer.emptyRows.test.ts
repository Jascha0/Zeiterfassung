import { describe, expect, it } from 'vitest';
import { monthReportPdfContent } from '../domain/pdfContent';
import { projectsById } from '../domain/projects';
import { buildMonthReport } from '../domain/report';
import { renderPdf } from './pdfRenderer';

function header(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob.slice(0, 5), 'latin1');
  });
}

describe('renderPdf with the real jsPDF and an empty day table (spec edge 19)', () => {
  it('renders a head-only day table without throwing', async () => {
    const report = buildMonthReport([], projectsById([]), new Date(2026, 9, 1).getTime());
    const content = monthReportPdfContent(report, { email: null, createdAt: Date.now() });
    expect(content.dayRows).toEqual([]);
    const blob = await renderPdf(content);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(await header(blob)).toBe('%PDF-');
  });
});
