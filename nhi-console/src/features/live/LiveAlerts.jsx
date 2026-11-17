import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectNow, onLiveEvent, startWatching } from '../../lib/local/notifyBus';
import { getEpoch, subscribeEpoch } from '../../lib/sync/engine';
import { useToast } from '../../ui/Toast';

const KIND = { exposure: 'Exposed credential', anomaly: 'Behaviour anomaly', posture: 'Posture drop', scan: 'Discovery' };
const VARIANT = { CRITICAL: 'error', HIGH: 'warning', MEDIUM: 'info', LOW: 'info' };

/**
 * Real-time alerts while the console is open: a new detection shows as a
 * toast with a link to it and refreshes the alert badge.
 * A finished "Sync now"
 * picks up the next detection straight away.
 */
export function LiveAlerts() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const epoch = useSyncExternalStore(subscribeEpoch, getEpoch);

  useEffect(() => {
    startWatching();
    return onLiveEvent((event) => {
      notify({
        variant: VARIANT[event.severity] ?? 'info',
        title: `${KIND[event.kind] ?? 'Alert'} · ${event.severity[0]}${event.severity.slice(1).toLowerCase()}`,
        description: event.title,
        duration: 9000,
        action: { label: 'Open', onSelect: () => navigate(event.link) },
      });
    });
  }, [notify, navigate]);

  useEffect(() => {
    if (epoch > 0) detectNow();
  }, [epoch]);

  return null;
}
