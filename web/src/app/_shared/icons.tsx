import type { ReactNode } from "react";

// The navigation icons of the ALLU template (DESIGN.md: "ícones SVG inline desenhados para a
// navegação"): 24px grid, 1.7px round stroke, drawn here rather than pulled from an icon package.
// Decorative — every link beside one carries its own text.

const PATHS = {
  today: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 3-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 5.4a3 3 0 0 1 0 5.6M17.6 14.6c1.8.5 3 2 3.4 4.4" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5z" />
      <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H18M9 8.5h5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2" />
      <path d="M3.5 10h17M16 14.5h1.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="5" width="12" height="15" rx="2" />
      <path d="M9.5 5V4h5v1M9 10h6M9 14h6" />
    </>
  ),
  trend: (
    <>
      <path d="M4 18l5.5-6 4 3.5L20 7" />
      <path d="M15 7h5v5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
