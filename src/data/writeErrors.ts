export function mapWriteError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined;
  if (code === 'permission-denied') return 'Speichern fehlgeschlagen: keine Berechtigung.';
  return 'Speichern fehlgeschlagen. Bitte versuche es später erneut.';
}
