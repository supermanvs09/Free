import { useCallback, useState } from 'react';
import { FixDrawer } from './FixDrawer';
import { PlanDrawer } from './PlanDrawer';

/**
 * The fix flow for any screen that lists findings: `openFix(finding)` opens
 * "Fix this finding"; a plan made or picked there replaces it with the plan
 * drawer. Render `element` once in the screen.
 */
export function useFixFlow({ onChanged } = {}) {
  const [finding, setFinding] = useState(null);
  const [plan, setPlan] = useState(null); // { id, followFrom }

  const openFix = useCallback((f) => {
    setPlan(null);
    setFinding(f);
  }, []);
  const openPlan = useCallback((id, follow = false) => {
    setFinding(null);
    setPlan({ id, followFrom: follow ? Date.now() : 0 });
  }, []);

  const element = (
    <>
      <FixDrawer finding={finding} onClose={() => setFinding(null)} onOpenPlan={openPlan} />
      <PlanDrawer planId={plan?.id ?? null} followFrom={plan?.followFrom ?? 0} onClose={() => setPlan(null)} onChanged={onChanged} />
    </>
  );
  return { openFix, openPlan, element };
}
