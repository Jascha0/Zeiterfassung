import { describe, expect, it } from 'vitest';
import { monthReportPdfContent } from '../domain/pdfContent';
import { projectsById } from '../domain/projects';
import { buildMonthReport } from '../domain/report';
import type { Entry, Project } from '../domain/types';
import { renderPdf } from './pdfRenderer';

function local(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe('renderPdf with the real jsPDF', () => {
  it('produces a PDF blob for content with an emoji project and WinAnsi punctuation', async () => {
    const project: Project = { id: 'pA', name: 'Kunde 🚀 A', color: 'blue', archived: false, createdAt: 0, updatedAt: 0 };
    const entries: Entry[] = [
      {
        id: 'e1',
        type: 'work',
        start: local(2026, 10, 6, 8),
        end: local(2026, 10, 6, 15, 30),
        projectId: 'pA',
        createdAt: 0,
        updatedAt: 0,
      },
      { id: 'e2', type: 'break', start: local(2026, 10, 6, 12), end: local(2026, 10, 6, 12, 30), createdAt: 0, updatedAt: 0 },
    ];
    const byId = projectsById([project]);
    const report = buildMonthReport(entries, byId, local(2026, 10, 1));
    const content = monthReportPdfContent(report, {
      email: 'jürgen – 5 €@example.de',
      createdAt: local(2026, 10, 17, 14, 5),
    });

    const blob = await renderPdf(content);

    expect(blob.size).toBeGreaterThan(0);
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 4);
    expect(String.fromCharCode(...head)).toBe('%PDF');
  }, 20_000);
});
