import type { Article } from "@/types";
import { columnFor, type LeanColumn } from "@/lib/blindspot";

/**
 * Framing analysis: which words each side of the spectrum uses that the other
 * side doesn't, for the same story.
 *
 * Coverage comparison answers "who is reporting this?". This answers the more
 * revealing question: "how are they wording it?" — e.g. "riot" vs "protest",
 * "illegal" vs "undocumented".
 */

const STOP = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","as","at","by",
  "from","is","are","was","were","be","been","being","it","its","this","that",
  "these","those","he","she","they","them","their","his","her","we","us","you",
  "your","our","i","will","would","could","should","can","may","might","must",
  "has","have","had","do","does","did","not","no","but","if","then","than",
  "so","such","what","which","who","whom","how","why","when","where","all",
  "any","some","more","most","other","into","over","after","before","about",
  "up","down","out","off","new","says","say","said","told","according","report",
  "reports","reported","news","latest","update","updates","live","watch","read",
  "video","photos","amid","via","one","two","three","first","last","year",
  "years","day","days","week","weeks","month","time","now","get","gets","make",
  "makes","just","also","back","still","like","many","much",
]);

export interface FramingTerm {
  term: string;
  /** Smoothed log-odds: positive = distinctive to this side. */
  score: number;
  /** Times it appears in this side's coverage. */
  count: number;
  /** Times it appears in the other side's coverage. */
  otherCount: number;
}

export interface FramingGapResult {
  left: FramingTerm[];
  right: FramingTerm[];
  /** Articles analysed per side (sample size — be honest about it). */
  sampleLeft: number;
  sampleRight: number;
  /** Mean sentiment per lean, -1..1. */
  tone: Record<LeanColumn, number | null>;
  /** True when there's enough text on both sides to say anything. */
  reliable: boolean;
}

function tokenize(article: Article, sourceWords: Set<string>): string[] {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return (text.match(/[a-z][a-z'-]{2,}/g) ?? []).filter(
    (w) => !STOP.has(w) && !sourceWords.has(w) && w.length > 2,
  );
}

function tally(words: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

function meanSentiment(list: Article[]): number | null {
  if (list.length === 0) return null;
  return list.reduce((s, a) => s + a.sentiment, 0) / list.length;
}

/**
 * Compare Left vs Right vocabulary with an additively-smoothed log-odds ratio
 * — the standard way to surface group-distinctive words without letting rare
 * terms dominate. Center coverage is reported for tone but excluded from the
 * contrast so the comparison stays a clean two-way.
 */
export function framingGap(
  articles: Article[],
  opts: { perSide?: number; minCount?: number } = {},
): FramingGapResult {
  const perSide = opts.perSide ?? 8;
  const minCount = opts.minCount ?? 1;

  const groups: Record<LeanColumn, Article[]> = { left: [], center: [], right: [] };
  for (const a of articles) groups[columnFor(a.bias)].push(a);

  // outlet names would be perfectly "distinctive" and tell us nothing
  const sourceWords = new Set<string>();
  for (const a of articles) {
    for (const w of a.source.toLowerCase().split(/[^a-z]+/)) {
      if (w.length > 2) sourceWords.add(w);
    }
  }

  const leftWords = groups.left.flatMap((a) => tokenize(a, sourceWords));
  const rightWords = groups.right.flatMap((a) => tokenize(a, sourceWords));
  const leftCounts = tally(leftWords);
  const rightCounts = tally(rightWords);

  const vocab = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  const V = Math.max(vocab.size, 1);
  const alpha = 0.5; // additive smoothing
  const totalL = leftWords.length;
  const totalR = rightWords.length;

  const scored: FramingTerm[] = [];
  for (const term of vocab) {
    const cL = leftCounts.get(term) ?? 0;
    const cR = rightCounts.get(term) ?? 0;
    if (cL + cR < minCount) continue;
    const pL = (cL + alpha) / (totalL + alpha * V);
    const pR = (cR + alpha) / (totalR + alpha * V);
    scored.push({
      term,
      score: Math.log(pL) - Math.log(pR),
      count: cL,
      otherCount: cR,
    });
  }

  const left = scored
    .filter((t) => t.score > 0 && t.count > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, perSide);
  const right = scored
    .filter((t) => t.score < 0 && t.otherCount > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, perSide)
    .map((t) => ({ ...t, count: t.otherCount, otherCount: t.count }));

  return {
    left,
    right,
    sampleLeft: groups.left.length,
    sampleRight: groups.right.length,
    tone: {
      left: meanSentiment(groups.left),
      center: meanSentiment(groups.center),
      right: meanSentiment(groups.right),
    },
    // headlines are short; demand a little substance before drawing conclusions
    reliable:
      totalL >= 15 &&
      totalR >= 15 &&
      groups.left.length >= 2 &&
      groups.right.length >= 2,
  };
}
