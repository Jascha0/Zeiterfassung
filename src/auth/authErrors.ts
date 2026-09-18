import { AuthError, type AuthErrorCode } from './authTypes';

export const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-credential':
    'E-Mail-Adresse oder Passwort ist falsch. Falls du dich bisher mit Google angemeldet hast, nutze „Mit Google anmelden“.',
  'wrong-password': 'Das Passwort ist falsch.',
  'user-not-found': 'Zu dieser E-Mail-Adresse gibt es kein Konto.',
  'email-already-in-use':
    'Diese E-Mail-Adresse wird bereits verwendet. Falls du dich bisher mit Google angemeldet hast, melde dich mit Google an und lege danach unter „Konto“ ein Passwort fest.',
  'weak-password': 'Das Passwort ist zu schwach. Bitte verwende mindestens 8 Zeichen.',
  'invalid-email': 'Die E-Mail-Adresse ist ungültig.',
  'account-exists-with-different-credential':
    'Für diese E-Mail-Adresse existiert bereits ein Konto mit E-Mail und Passwort. Bitte melde dich mit E-Mail und Passwort an und verknüpfe Google danach unter „Konto“.',
  'credential-already-in-use': 'Dieses Google-Konto ist bereits mit einem anderen Zeiterfassungs-Konto verknüpft.',
  'provider-already-linked': 'Diese Anmeldemethode ist bereits verknüpft.',
  'requires-recent-login': 'Bitte melde dich aus Sicherheitsgründen erneut an und versuche es dann noch einmal.',
  'network-request-failed': 'Keine Verbindung. Bitte prüfe deine Internetverbindung und versuche es erneut.',
  'too-many-requests': 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.',
  'popup-blocked': 'Das Anmeldefenster wurde blockiert. Bitte erlaube Pop-ups oder versuche es erneut.',
  cancelled: '',
  'user-disabled': 'Dieses Konto wurde deaktiviert.',
  unknown: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
};

const ALIASES: Record<string, AuthErrorCode> = {
  'popup-closed-by-user': 'cancelled',
  'cancelled-popup-request': 'cancelled',
  'user-cancelled': 'cancelled',
  'operation-not-supported-in-environment': 'popup-blocked',
  'invalid-login-credentials': 'invalid-credential',
};

function rawCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isKnownCode(code: string): code is AuthErrorCode {
  return hasOwn(AUTH_MESSAGES, code);
}

export function mapAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const raw = rawCode(error);
  let code: AuthErrorCode = 'unknown';
  if (raw !== null) {
    const stripped = raw.startsWith('auth/') ? raw.slice('auth/'.length) : raw;
    if (hasOwn(ALIASES, stripped)) code = ALIASES[stripped];
    else if (isKnownCode(stripped)) code = stripped;
  }
  return new AuthError(code, AUTH_MESSAGES[code]);
}

export function isCancelledAuthError(error: unknown): boolean {
  return mapAuthError(error).code === 'cancelled';
}

export function shouldFallbackToRedirect(error: unknown): boolean {
  const raw = rawCode(error);
  return raw === 'auth/popup-blocked' || raw === 'auth/operation-not-supported-in-environment';
}
