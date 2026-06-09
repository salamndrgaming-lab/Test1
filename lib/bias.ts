import type { Article, BiasLean, Confidence } from "@/types";
import biasOutlets from "@/data/bias-outlets.json";

interface BiasEntry {
  lean: BiasLean;
  confidence: Confidence;
}

const BIAS_MAP = biasOutlets as Record<string, BiasEntry>;

/** Numeric position on the spectrum: -2 (left) .. +2 (right). */
export const LEAN_SCORE: Record<BiasLean, number> = {
  left: -2,
  "lean-left": -1,
  center: 0,
  "lean-right": 1,
  right: 2,
  unknown: 0,
};

export const LEAN_LABEL: Record<BiasLean, string> = {
  left: "Left",
  "lean-left": "Lean Left",
  center: "Center",
  "lean-right": "Lean Right",
  right: "Right",
  unknown: "Unrated",
};

export const ALL_LEANS: BiasLean[] = [
  "left",
  "lean-left",
  "center",
  "lean-right",
  "right",
];

/** Strip protocol/www and path so "https://www.cnn.com/x" -> "cnn.com". */
export function normalizeDomain(input: string): string {
  try {
    const host = input.includes("://")
      ? new URL(input).hostname
      : input.split("/")[0];
    return host.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^www\./, "").toLowerCase();
  }
}

/** Look up an outlet's lean. Unknown outlets default to center/low confidence. */
export function lookupBias(domain: string): BiasEntry {
  const key = normalizeDomain(domain);
  if (BIAS_MAP[key]) return BIAS_MAP[key];
  // try parent domain (e.g. "edition.cnn.com" -> "cnn.com")
  const parts = key.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (BIAS_MAP[parent]) return BIAS_MAP[parent];
  }
  return { lean: "unknown", confidence: "low" };
}

/** Attach bias to an article unless it already carries an explicit override. */
export function applyBias(
  article: Omit<Article, "bias" | "biasConfidence"> &
    Partial<Pick<Article, "bias" | "biasConfidence">>,
): Article {
  if (article.bias && article.bias !== "unknown") {
    return article as Article;
  }
  const { lean, confidence } = lookupBias(article.sourceDomain);
  return { ...article, bias: lean, biasConfidence: confidence };
}

/** Count of articles per lean — used by the bias spectrum + coverage spread. */
export function biasDistribution(articles: Article[]): Record<BiasLean, number> {
  const dist: Record<BiasLean, number> = {
    left: 0,
    "lean-left": 0,
    center: 0,
    "lean-right": 0,
    right: 0,
    unknown: 0,
  };
  for (const a of articles) dist[a.bias]++;
  return dist;
}
