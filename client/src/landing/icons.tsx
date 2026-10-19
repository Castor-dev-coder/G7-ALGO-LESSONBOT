/**
 * Inline SVG icons — the repository has no icon dependency, and adding one
 * purely for decoration is not justified. Every icon here is drawn on the same
 * 24×24 grid with the same stroke weight so navigation, calls to action and
 * the animation controls read as one family. Icons are always `aria-hidden`
 * accompaniments to a readable text label, never a replacement for it.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false as const,
    className,
  };
}

/** Speech bubble — the chat product itself. */
export function IconChat({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

/** Down arrow — jump to a section below. */
export function IconArrowDown({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
    </svg>
  );
}

/** Right arrow — follow a link onward. */
export function IconArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h14m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

/** Pause bars — halt a running animation. */
export function IconPause({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)} strokeWidth={2}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

/** Play triangle — resume a paused animation. */
export function IconPlay({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

/** Restart arrow — begin the cycle again. */
export function IconRestart({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

/** Close mark — dismiss an overlay. */
export function IconClose({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

/** Menu — the navigation drawer affordance. */
export function IconMenu({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}
