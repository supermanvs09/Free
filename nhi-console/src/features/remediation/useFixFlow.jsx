import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * The fix flow for any screen that lists findings: `openFix(finding)` opens
 * the finding's fix page (steps, then Start guided fix); `openPlan(id)` opens
 * a plan. `element` is kept for callers that render it; it is empty.
 */
export function useFixFlow() {
  const navigate = useNavigate();
  const openFix = useCallback(
    (f) => {
      const id = f?.finding_id ?? f?.findingId ?? f?.id;
      if (id) navigate(`/remediation/findings/${encodeURIComponent(id)}`);
    },
    [navigate],
  );
  const openPlan = useCallback((id) => navigate(`/remediation/plans/${encodeURIComponent(id)}`), [navigate]);
  return { openFix, openPlan, element: null };
}
