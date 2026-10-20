export const REVOKE_DELAY_MS = 1_000;

/** Creates an object URL, clicks a temporary hidden <a download={fileName}> appended to document.body,
 *  removes the anchor right after the click, and revokes the URL after REVOKE_DELAY_MS via setTimeout. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Immediate revocation can cancel the download in Firefox/Safari.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** downloadBlob(new Blob([text], { type: mimeType }), fileName). The text is encoded as UTF-8 (a leading '\uFEFF' becomes EF BB BF). */
export function downloadText(text: string, mimeType: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), fileName);
}
