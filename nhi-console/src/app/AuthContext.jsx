import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, login as loginRequest, logout as logoutRequest, profileFrom } from '../lib/api/auth';
import { onSessionExpired, renewSession } from '../lib/api/client';
import { clearFacetRailState } from '../ui/FacetRail';
import { onRemoteChange, setPresenceUser } from '../lib/local/state';
import { activeSession, users as accountList } from '../lib/local/users';
import { ROLES } from '../lib/roles';
import { useToast } from '../ui/Toast';
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
  /* Why a session ended underneath the person: 'off' (an admin switched the
     account off), 'removed', 'password' (reset by an admin) or null. */
  const [expiredWhy, setExpiredWhy] = useState(null);
  /* Why the last session ended, for the sign-in page: 'signout' (the person
     chose to), 'switch' (sign in as another user), 'idle' (no activity for
     the idle limit), 'expired' (the server ended it). After the first two the
     next sign-in opens the dashboard rather than the screen they left. */
  const [endReason, setEndReason] = useState(null);
  /* Bumped when someone changes the accounts: who this is gets checked again. */
  const [accountsVersion, setAccountsVersion] = useState(0);
  const { notify } = useToast();

  useEffect(
    () =>
      onRemoteChange(({ ops }) => {
        if (ops.some((op) => op.path?.[0] === 'users')) setAccountsVersion((v) => v + 1);
      }),
    [],
  );

  /* Everyone else sees who is here. */
  useEffect(() => {
    setPresenceUser(token && user ? { name: user.name, email: user.email, role: user.role } : null);
  }, [token, user]);

  const endSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  /* The session ends on this screen at once, so no page keeps polling with a
     token the server is about to revoke (those calls would fail with 401);
     the server is told in the background - it is sent before the token is
     cleared, and the cookie goes with it. */
  const logout = useCallback(async ({ reason = 'signout' } = {}) => {
    const told = logoutRequest();
    clearSession();
    clearLastActivity();
    clearFacetRailState();
    setEndReason(reason);
    endSession();
    await told;
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
      const s = activeSession();
      const account = s ? accountList().find((u) => u.id === s.user_id) : null;
      setExpiredWhy(!s ? null : !account ? 'removed' : account.status !== 'active' ? 'off' : (s.epoch ?? 0) !== (account.session_epoch ?? 0) ? 'password' : null);
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
        setUser((prev) => {
          if (accountsVersion > 0 && prev?.role && profile.role && prev.role !== profile.role) {
            notify({ variant: 'info', title: `You are now ${ROLES[profile.role]?.label ?? profile.role}`, description: 'An admin changed your role. What you can see and do has been updated.', duration: 9000 });
          }
          return profile;
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, endSession, accountsVersion]);

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
      expiredWhy,
      endReason,
      isAuthenticated: Boolean(token),
      signIn,
      logout,
      clearExpired: () => setExpired(false),
    }),
    [user, token, status, expired, expiredWhy, endReason, signIn, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
