import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const IDLE_MS = 15 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;
const CHECK_EVERY_MS = 1000;
/** How often ongoing activity is reported to the server, which signs out sessions idle for 17 minutes. */
const HEARTBEAT_MS = 60 * 1000;
const TOAST_ID = 'idle-timeout';
/** Shared by every open tab, so working in one tab keeps the others signed in too. */
const STORAGE_KEY = 'jjm-micro:last-activity';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'wheel', 'touchstart'] as const;

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function readStoredActivity(): number {
  const value = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Signs the user out after 15 minutes without mouse or keyboard activity, preceded by a
 * 2-minute warning toast. Any activity during the warning cancels it. While the user is active,
 * `onActive` is called at most once a minute so the server knows the session is in use.
 */
export function useIdleTimeout(enabled: boolean, onTimeout: () => void, onActive?: () => void) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  useEffect(() => {
    if (!enabled) return;

    let lastActivity = Date.now();
    let lastHeartbeat = lastActivity;
    let warningShown = false;
    let timedOut = false;
    localStorage.setItem(STORAGE_KEY, String(lastActivity));

    const recordActivity = () => {
      const now = Date.now();
      // Mouse movement fires constantly; one write per second is plenty.
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      localStorage.setItem(STORAGE_KEY, String(now));
      if (now - lastHeartbeat >= HEARTBEAT_MS) {
        lastHeartbeat = now;
        onActiveRef.current?.();
      }
    };

    const dismissWarning = () => {
      if (!warningShown) return;
      warningShown = false;
      toast.dismiss(TOAST_ID);
    };

    const check = () => {
      if (timedOut) return;
      const idleFor = Date.now() - Math.max(lastActivity, readStoredActivity());
      if (idleFor < IDLE_MS) return dismissWarning();

      const remaining = IDLE_MS + WARNING_MS - idleFor;
      if (remaining <= 0) {
        timedOut = true;
        dismissWarning();
        onTimeoutRef.current();
        return;
      }
      warningShown = true;
      toast.warning('Session expiring due to inactivity.', {
        id: TOAST_ID,
        description: `You will be signed out in ${formatCountdown(remaining)}. Move the mouse or press any key to stay signed in.`,
        duration: Infinity,
        dismissible: false,
      });
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, recordActivity, { passive: true, capture: true });
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, recordActivity, { capture: true });
      window.clearInterval(timer);
      toast.dismiss(TOAST_ID);
    };
  }, [enabled]);
}
