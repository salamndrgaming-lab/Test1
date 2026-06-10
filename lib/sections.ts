import type { CSSProperties } from "react";

/** Each section gets its own vibrant accent pair (primary, secondary). */
export const SECTION_ACCENTS = {
  home: ["#38bdf8", "#818cf8"],
  news: ["#38bdf8", "#3b82f6"],
  good: ["#22c55e", "#10b981"],
  sports: ["#f59e0b", "#fb923c"],
  weather: ["#22d3ee", "#38bdf8"],
  bias: ["#a78bfa", "#818cf8"],
  ent: ["#ec4899", "#d946ef"],
  markets: ["#34d399", "#10b981"],
} as const;

export type SectionName = keyof typeof SECTION_ACCENTS;

/**
 * Inline style that overrides --accent / --accent-2 for a section, so every
 * accent-driven element (headline kicker, chips, spinner, buttons, rules)
 * recolors automatically within that page.
 */
export function accentVars(name: SectionName): CSSProperties {
  const [a, b] = SECTION_ACCENTS[name];
  return { ["--accent"]: a, ["--accent-2"]: b } as CSSProperties;
}
