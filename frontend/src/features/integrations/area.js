/**
 * VITE_CODE_CICD_DASHBOARD=true puts a choice in front of Integrations: the
 * AWS cloud dashboard, or the Code & CI/CD dashboard for on-premises sources
 * (GitHub, Bitbucket Data Center, Jenkins). Off: Integrations is the AWS
 * dashboard alone, as before.
 */
export const CODE_CICD_DASHBOARD = String(import.meta.env.VITE_CODE_CICD_DASHBOARD ?? '').toLowerCase() === 'true';

/* Setup progress per on-premises source, kept in this browser so a setup left
   half-way resumes where it stopped. A per-viewer convenience only. */
const PROGRESS_KEY = 'dna.codeSetup.';

export function readProgress(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY + key) || 'null');
    return raw && Array.isArray(raw.done) ? { done: raw.done, current: Number(raw.current) || 0 } : { done: [], current: 0 };
  } catch {
    return { done: [], current: 0 };
  }
}

export function writeProgress(key, progress) {
  try {
    localStorage.setItem(PROGRESS_KEY + key, JSON.stringify(progress));
  } catch {
    /* storage refused: progress lasts for this visit */
  }
}
