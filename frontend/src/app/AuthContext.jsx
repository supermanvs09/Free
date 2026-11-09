import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, login as loginRequest, logout as logoutRequest, profileFrom } from '../lib/api/auth';
import { onSessionExpired, renewSession } from '../lib/api/client';
import { clearFacetRailState } from '../ui/FacetRail';
import { clearLastActivity, clearSession, readStoredUser, readToken, subscribeSignOut, writeLastActivity, writeSession, writeStoredUser } from '../lib/api/session';

const AuthContext = createContext(null);

/**
 * The signed-in session.
 *
 *   status  verifying (a stored session is being checked) | authenticated | anonymous
 *   user    { email, name, team, role (console role), serverRole, tenantId }
 *
 * The access token is renewed by the API client when it expires; only when
 * that fails does the session end (`expired` tells the sign-in page why).
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  // Seeded from storage so a refresh renders the shell immediately and the
  // profile request only corrects it.
  const [user, setUser] = useState(readStoredUser);
  /* A tab with no access token of its own (a new tab) still asks: the refresh
     cookie may hold a session another tab started. */
  const [status, setStatus] = useState('verifying');
  const [expired, setExpired] = useState(false);
  /* Why the last session ended, for the sign-in page: 'signout' (the person
     chose to), 'switch' (sign in as another user), 'idle' (no activity for
     the idle limit), 'expired' (the server ended it). After the first two the
     next sign-in opens the dashboard rather than the screen they left. */
  const [endReason, setEndReason] = useState(null);

  const endSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const logout = useCallback(async ({ reason = 'signout' } = {}) => {
    await logoutRequest();
    clearSession();
    clearLastActivity();
    clearFacetRailState();
    setEndReason(reason);
    endSession();
  }, [endSession]);

  /* Back after signing out must not show the console again. A page the
     browser kept whole in its back/forward cache comes back with the old
     screen drawn; if there is no session any more, start from sign-in. */
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted && !readToken()) window.location.replace('/login');
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  /* Signing out in another tab of the same session signs this one out too. */
  useEffect(() => subscribeSignOut(endSession), [endSession]);

  useEffect(() => {
    onSessionExpired(() => {
      setExpired(true);
      setEndReason('expired');
      endSession();
    });
  }, [endSession]);

  useEffect(() => {
    if (token) return undefined;
    let live = true;
    renewSession().then((renewed) => {
      if (!live) return;
      if (!renewed) {
        setStatus('anonymous');
        return;
      }
      const profile = profileFrom(renewed.user);
      writeStoredUser(profile);
      setUser(profile);
      setToken(readToken());
    });
    return () => {
      live = false;
    };
    // Only on first load: afterwards a missing token means signed out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Confirm a stored session and refresh the role/tenant from the server. */
  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const me = await fetchMe(controller.signal);
        if (controller.signal.aborted) return;
        const stored = readStoredUser() ?? {};
        const profile = {
          ...stored,
          ...profileFrom({ ...stored, full_name: stored.name, email: stored.email }, me),
          lastLoginAt: stored.lastLoginAt ?? null,
        };
        setUser(profile);
        writeStoredUser(profile);
        setStatus('authenticated');
      } catch (error) {
        if (controller.signal.aborted || error?.code === 'CANCELLED') return;
        // The client already tried to renew the session; a 401 here means it
        // could not. Anything else is the service being unreachable, and
        // signing the person out would be wrong.
        if (error?.status === 401) {
          clearSession();
          setExpired(true);
          endSession();
          return;
        }
        setStatus('authenticated');
      }
    })();
    return () => controller.abort();
  }, [token, endSession]);

  const signIn = useCallback(async ({ email, password }) => {
    const result = await loginRequest({ email, password });
    writeSession({ token: result.token, user: result.user });
    writeLastActivity();
    setExpired(false);
    setEndReason(null);
    setUser(result.user);
    setToken(result.token);
    setStatus('authenticated');
    return result;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      expired,
      endReason,
      isAuthenticated: Boolean(token),
      signIn,
      logout,
      clearExpired: () => setExpired(false),
    }),
    [user, token, status, expired, endReason, signIn, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
