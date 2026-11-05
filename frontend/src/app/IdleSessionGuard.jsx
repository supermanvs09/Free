import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Modal } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { readLastActivity, writeLastActivity } from '../lib/api/session';

/**
 * Signs the session out after a period with no activity.
 *
 * The console holds a refresh token that renews the access token for up to 30
 * days, so a screen left open on an unattended machine stayed signed in
 * indefinitely. Activity is any pointer, key, wheel or touch input; it is
 * shared across this browser's tabs through localStorage, so working in one
 * tab keeps the others alive and a sign-out in one ends them all.
 *
 * A minute before the limit a dialog says so and offers to stay signed in;
 * without an answer the session ends and the sign-in page explains why.
 *
 * The limit is VITE_SESSION_IDLE_MINUTES (default 30).
 */
const IDLE_MINUTES = clampMinutes(Number(import.meta.env.VITE_SESSION_IDLE_MINUTES) || 30);
const IDLE_MS = IDLE_MINUTES * 60_000;
const WARN_MS = Math.min(60_000, IDLE_MS / 2);
const WRITE_EVERY_MS = 5_000; // activity is recorded at most this often
const CHECK_EVERY_MS = 1_000;

function clampMinutes(value) {
  return Math.min(24 * 60, Math.max(1, value));
}

export function IdleSessionGuard() {
  const { logout, isAuthenticated } = useAuth();
  const lastRef = useRef(0);
  const [remaining, setRemaining] = useState(null); // ms left while warning, else null
  const remainingRef = useRef(null);
  remainingRef.current = remaining;
  const signingOut = useRef(false);

  const touch = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastRef.current < WRITE_EVERY_MS) return;
    lastRef.current = now;
    writeLastActivity(now);
  }, []);

  /* Opening the console (a reload, a new tab) carries on the session's clock
     rather than restarting it: a tab reopened hours later on an unattended
     machine must not count as activity. Signing in starts the clock. */
  useEffect(() => {
    if (!isAuthenticated) return;
    const last = readLastActivity();
    if (last > 0 && Date.now() - last >= IDLE_MS) {
      signingOut.current = true;
      logout({ reason: 'idle' });
      return;
    }
    lastRef.current = last || Date.now();
    if (!last) writeLastActivity(lastRef.current);
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onActivity = () => {
      /* While the warning is up only its buttons count: a stray mouse move
         over the dialog must not silently cancel it. */
      if (remainingRef.current !== null) return;
      touch();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'];
    for (const type of events) window.addEventListener(type, onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const last = Math.max(lastRef.current, readLastActivity());
      const idle = Date.now() - last;
      if (idle >= IDLE_MS) {
        if (!signingOut.current) {
          signingOut.current = true;
          logout({ reason: 'idle' });
        }
        return;
      }
      setRemaining(idle >= IDLE_MS - WARN_MS ? IDLE_MS - idle : null);
    }, CHECK_EVERY_MS);

    return () => {
      for (const type of events) window.removeEventListener(type, onActivity);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, logout, touch]);

  const stay = () => {
    touch(true);
    setRemaining(null);
  };

  const seconds = remaining === null ? 0 : Math.max(0, Math.ceil(remaining / 1000));
  return (
    <Modal
      open={remaining !== null}
      onClose={stay}
      icon={Clock3}
      tone="medium"
      title="Are you still there?"
      description={`For your security you will be signed out in ${seconds} second${seconds === 1 ? '' : 's'}, after ${IDLE_MINUTES} minutes without activity.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => logout({ reason: 'signout' })}>
            Sign out now
          </Button>
          <Button onClick={stay} autoFocus>
            Stay signed in
          </Button>
        </>
      }
    />
  );
}

export const SESSION_IDLE_MINUTES = IDLE_MINUTES;
