import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { mapAuthError } from './authErrors';
import type { AuthError, AuthUser } from './authTypes';

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  redirectError: AuthError | null;
  clearRedirectError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const { auth } = useServices();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<AuthError | null>(null);
  const redirectHandled = useRef(false);
  const signedIn = useRef(false);

  useEffect(() => {
    return auth.onAuthStateChanged((nextUser) => {
      // A redirect error raised while signed in (e.g. failed linking) must not reappear on the login screen.
      if (signedIn.current && nextUser === null) setRedirectError(null);
      signedIn.current = nextUser !== null;
      setUser(nextUser);
      setLoading(false);
    });
  }, [auth]);

  useEffect(() => {
    if (redirectHandled.current) return;
    redirectHandled.current = true;
    auth.completeRedirect().catch((error: unknown) => {
      const mapped = mapAuthError(error);
      if (mapped.code !== 'cancelled') setRedirectError(mapped);
    });
  }, [auth]);

  const clearRedirectError = useCallback(() => setRedirectError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, redirectError, clearRedirectError }),
    [user, loading, redirectError, clearRedirectError],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
