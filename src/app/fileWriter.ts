/** Writing a file is the one capability jsdom cannot provide, so it is an injectable seam (0058).
 *  It resolves once the browser has accepted the file — NOT once the file is on disk: a blocked
 *  download or a full disk are invisible to the app. */
export interface FileWriter {
  writeTextFile(filename: string, text: string): Promise<void>;
}

/** The default implementation: Blob → object URL → temporary anchor → revoke. */
export function createDownloadFileWriter(doc: Document = document): FileWriter {
  return {
    async writeTextFile(filename: string, text: string): Promise<void> {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      try {
        const anchor = doc.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        doc.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };
}
