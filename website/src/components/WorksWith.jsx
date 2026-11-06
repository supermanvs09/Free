import { Logo, logoTitle } from './viz/kit.jsx';

/* The brand marks in the Products menu, loaded only when the menu opens. */
const KEYS = ['aws', 'entra', 'okta', 'm365', 'google', 'ad', 'github', 'salesforce', 'slack', 'atlassian', 'claude', 'copilot', 'gemini', 'mcp', 'kubernetes', 'upi'];

export default function WorksWith({ keys = KEYS }) {
  return (
    <ul className="mt-5 grid grid-cols-4 gap-2.5">
      {keys.map((k) => (
        <li key={k} title={logoTitle(k)} className="flex aspect-square items-center justify-center rounded-[12px] border border-line bg-white text-[#12171f] shadow-[0_2px_6px_-3px_rgba(6,25,55,.18)]">
          <Logo k={k} size={24} />
          <span className="sr-only">{logoTitle(k)}</span>
        </li>
      ))}
    </ul>
  );
}
