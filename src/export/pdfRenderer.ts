import type { PdfContent } from '../domain/pdfContent';

const MARGIN_PT = 40;

/** Browser-only. No formatting logic. Rejects if a chunk fails to load or jsPDF throws. */
export async function renderPdf(content: PdfContent): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(content.title, MARGIN_PT, 50);
  doc.setFontSize(10);
  content.headerLines.forEach((line, index) => {
    doc.text(line, MARGIN_PT, 72 + index * 14);
  });
  autoTable(doc, {
    head: [content.dayHead],
    body: content.dayRows,
    startY: 72 + content.headerLines.length * 14 + 8,
    margin: { left: MARGIN_PT, right: MARGIN_PT },
  });
  autoTable(doc, { body: content.totalRows, margin: { left: MARGIN_PT, right: MARGIN_PT } });
  return doc.output('blob');
}
