export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (password !== confirmation) return 'Die Passwörter stimmen nicht überein.';
  return null;
}
