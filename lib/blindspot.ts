import type { Article, BiasLean } from "@/types";

export type LeanColumn = "left" | "center" | "right";

export const COLUMN_LABEL: Record<LeanColumn, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
};

/** Collapse the 5-point lean scale (+ unknown) into 3 columns. */
export function columnFor(bias: BiasLean): LeanColumn {
  if (bias === "left" || bias === "lean-left") return "left";
  if (bias === "right" || bias === "lean-right") return "right";
  return "center"; // center + unknown
}

export function groupByLean(
  articles: Article[],
): Record<LeanColumn, Article[]> {
  const groups: Record<LeanColumn, Article[]> = {
    left: [],
    center: [],
    right: [],
  };
  for (const a of articles) groups[columnFor(a.bias)].push(a);
  return groups;
}

const STOP = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","as","at","by",
  "from","is","are","was","new","after","over","amid","says","say","will",
  "this","that","how","why","what","its","it","up","down","more","than",
]);

/** Derive a search topic from the most prominent headline (proper nouns first). */
export function pickTopic(articles: Article[]): string {
  const title = articles[0]?.title ?? "";
  const proper = title.match(/\b[A-Z][A-Za-z'-]{2,}\b/g) ?? [];
  const picked = proper
    .filter((w) => !STOP.has(w.toLowerCase()))
    .slice(0, 3);
  if (picked.length >= 2) return picked.join(" ");
  // fallback: first few significant words
  return (title.match(/[A-Za-z'-]{3,}/g) ?? [])
    .filter((w) => !STOP.has(w.toLowerCase()))
    .slice(0, 3)
    .join(" ");
}

/** A column is a "blindspot" when others cover the story but it barely does. */
export function blindspotFlags(
  groups: Record<LeanColumn, Article[]>,
): Record<LeanColumn, boolean> {
  const total = groups.left.length + groups.center.length + groups.right.length;
  const flag = (n: number) => total >= 4 && n === 0;
  return {
    left: flag(groups.left.length),
    center: flag(groups.center.length),
    right: flag(groups.right.length),
  };
}
