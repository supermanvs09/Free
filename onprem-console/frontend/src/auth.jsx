import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getSession, setSession } from './lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setState] = useState(getSession);

  const signOut = useCallback(() => {
    setSession(null);
    setState(null);
  }, []);

  useEffect(() => {
    window.addEventListener('onprem:signed-out', signOut);
    return () => window.removeEventListener('onprem:signed-out', signOut);
  }, [signOut]);

  /* Re-read the role on load: an admin may have changed it since sign-in. */
  useEffect(() => {
    if (!session?.token) return;
    api('/auth/me')
      .then(({ user }) => {
        if (user.role !== session.user.role || user.name !== session.user.name) {
          const next = { ...session, user };
          setSession(next);
          setState(next);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const signIn = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    const next = { token: data.token, user: data.user };
    setSession(next);
    setState(next);
  }, []);

  const value = useMemo(() => {
    const role = session?.user?.role;
    return {
      user: session?.user ?? null,
      role,
      canManage: role === 'admin' || role === 'analyst',
      isAdmin: role === 'admin',
      signIn,
      signOut,
    };
  }, [session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* The reason shown on a locked control, so a viewer learns who can act. */
export const MANAGE_LOCK = 'Admins and analysts can do this. Your role is viewer (read only).';
