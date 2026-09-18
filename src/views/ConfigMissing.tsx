export function ConfigMissing(): React.JSX.Element {
  return (
    <main className="page narrow">
      <h1>Zeiterfassung</h1>
      <p role="alert">Firebase ist nicht konfiguriert. Bitte lege eine .env-Datei gemäß README an.</p>
    </main>
  );
}
