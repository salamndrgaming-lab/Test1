import type { Article } from "@/types";
import { columnFor, type LeanColumn } from "@/lib/blindspot";

export interface DiversityResult {
  articles: number;
  outlets: number;
  /** How many of Left / Center / Right you actually read. */
  leansCovered: number;
  topOutlet: { name: string; share: number } | null;
  /** Perplexity of the outlet distribution: your "effective" outlet count. */
  effectiveOutlets: number;
  /** 0..1, how evenly reading is spread across the spectrum. */
  leanBalance: number;
  /** 0..100 overall. */
  score: number;
  grade: "Narrow" | "Mixed" | "Broad";
  enough: boolean;
}

/** Reading 10 outlets evenly is treated as a full-marks spread. */
const OUTLET_TARGET = 8;

/**
 * How varied someone's reading actually is.
 *
 * Counting outlets alone is misleading — 10 outlets is not diverse if 9 reads
 * came from one of them. So we use the perplexity of the outlet distribution
 * (your *effective* number of outlets) and combine it with how evenly reading
 * is spread across the spectrum.
 */
export function readingDiversity(history: Article[]): DiversityResult {
  const articles = history.length;
  const empty: DiversityResult = {
    articles,
    outlets: 0,
    leansCovered: 0,
    topOutlet: null,
    effectiveOutlets: 0,
    leanBalance: 0,
    score: 0,
    grade: "Narrow",
    enough: false,
  };
  if (articles < 5) return empty;

  // --- outlet concentration -------------------------------------
  const bySource = new Map<string, number>();
  for (const a of history) bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);
  let entropy = 0;
  for (const count of bySource.values()) {
    const p = count / articles;
    entropy -= p * Math.log(p);
  }
  const effectiveOutlets = Math.exp(entropy);
  const outletScore = Math.min(1, effectiveOutlets / OUTLET_TARGET);

  const [topName, topCount] = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];

  // --- spectrum balance ------------------------------------------
  const leanCounts: Record<LeanColumn, number> = { left: 0, center: 0, right: 0 };
  for (const a of history) leanCounts[columnFor(a.bias)]++;
  const leansCovered = (["left", "center", "right"] as LeanColumn[]).filter(
    (l) => leanCounts[l] > 0,
  ).length;
  // total absolute deviation from an even third, normalised to 0..1
  const deviation =
    (["left", "center", "right"] as LeanColumn[]).reduce(
      (sum, l) => sum + Math.abs(leanCounts[l] / articles - 1 / 3),
      0,
    ) / (4 / 3);
  const leanBalance = Math.max(0, 1 - deviation);

  const score = Math.round(100 * (0.55 * outletScore + 0.45 * leanBalance));
  const grade = score >= 67 ? "Broad" : score >= 38 ? "Mixed" : "Narrow";

  return {
    articles,
    outlets: bySource.size,
    leansCovered,
    topOutlet: { name: topName, share: topCount / articles },
    effectiveOutlets: Number(effectiveOutlets.toFixed(1)),
    leanBalance: Number(leanBalance.toFixed(3)),
    score,
    grade,
    enough: true,
  };
}
