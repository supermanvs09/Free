/* Open the Prompt Heist practice lab from anywhere on the site. The launcher
   listens for this event; `from` is the element focus returns to on close. */
export const OPEN_EVENT = 'ph-lab:open';
export const PROGRESS_EVENT = 'ph-lab:progress';

export function openHeistLab(from) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { from: from || null } }));
}
