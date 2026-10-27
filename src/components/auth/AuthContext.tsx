import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, installSessionWatcher, SESSION_EXPIRED_EVENT, type AuthUser } from '../../services/auth';

interface AuthState {
  user: AuthUser | null;
  signIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut'; setupRequired: boolean; notice?: string; error?: string }
  | { kind: 'signedIn'; user: AuthUser };

/** Checks the session on load and shows either the sign-in screen or the app. */
export const AuthProvider: React.FC<{ children: React.ReactNode; signInScreen: (props: SignInScreenProps) => React.ReactNode }> = ({ children, signInScreen }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const toSignedOut = useCallback(async (notice?: string) => {
    try {
      const { setupRequired } = await authApi.status();
      setPhase({ kind: 'signedOut', setupRequired, notice });
    } catch (e) {
      setPhase({ kind: 'signedOut', setupRequired: false, notice, error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    installSessionWatcher();
    authApi.me()
      .then((user) => setPhase({ kind: 'signedIn', user }))
      .catch(() => toSignedOut());
  }, [toSignedOut]);

  useEffect(() => {
    const onExpired = () => setPhase((p) => {
      if (p.kind !== 'signedIn') return p;
      void toSignedOut('Your session has ended. Please sign in again.');
      return { kind: 'loading' };
    });
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [toSignedOut]);

  const signIn = useCallback((user: AuthUser) => setPhase({ kind: 'signedIn', user }), []);
  const signOut = useCallback(async () => {
    // Unmount the app first so its background polling can't hit a 401 and report "session ended".
    setPhase({ kind: 'loading' });
    try {
      await authApi.logout();
    } finally {
      await toSignedOut('You have been signed out.');
    }
  }, [toSignedOut]);

  if (phase.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-boomi-navy" aria-busy="true">
        <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-boomi-accent animate-spin" />
      </div>
    );
  }
  if (phase.kind === 'signedOut') {
    return <>{signInScreen({ setupRequired: phase.setupRequired, notice: phase.notice, error: phase.error, onSignedIn: signIn })}</>;
  }
  return <AuthContext.Provider value={{ user: phase.user, signIn, signOut }}>{children}</AuthContext.Provider>;
};

export interface SignInScreenProps {
  setupRequired: boolean;
  notice?: string;
  error?: string;
  onSignedIn: (user: AuthUser) => void;
}
