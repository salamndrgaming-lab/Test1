import type { Article } from "@/types";

const STOP = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","as","at","by",
  "from","is","are","was","were","be","new","after","over","amid","into","out",
  "this","that","says","say","said","could","will","has","have","had","its","it",
  "up","down","more","than","not","no","but","who","what","how","why","you",
  "your","his","her","their","they","we","us","i","he","she","them","first",
  "year","years","day","days","week","report","reports","amid","off","get",
  "gets","may","one","two","three","plan","top","live","watch","update",
]);

/**
 * Reliable trending source: the most frequent significant words across current
 * headlines (used when Google Trends RSS is unavailable, which is common in
 * 2026). Returns up to `limit` capitalized terms.
 */
export function keywordsFromArticles(articles: Article[], limit = 12): string[] {
  const freq = new Map<string, { count: number; display: string }>();
  for (const a of articles) {
    // prefer Capitalized words (proper nouns) from the original title
    const tokens = a.title.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (STOP.has(lower)) continue;
      const isProper = /^[A-Z]/.test(tok);
      const weight = isProper ? 2 : 1;
      const cur = freq.get(lower) ?? { count: 0, display: tok };
      cur.count += weight;
      // keep a capitalized display form if we see one
      if (isProper) cur.display = tok;
      freq.set(lower, cur);
    }
  }
  return [...freq.values()]
    .filter((v) => v.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((v) => v.display);
}
