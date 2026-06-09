// Lightweight lexicon-based sentiment scorer — no external dependency.
// Returns a score in [-1, 1]. Powers the Good News tab + sentiment visuals.

const POSITIVE = new Set([
  "win",
  "wins",
  "won",
  "breakthrough",
  "record",
  "rescue",
  "rescued",
  "hope",
  "hopeful",
  "recovery",
  "recovers",
  "celebrate",
  "celebrated",
  "success",
  "successful",
  "improve",
  "improved",
  "improvement",
  "boost",
  "thriving",
  "donate",
  "donated",
  "donation",
  "save",
  "saved",
  "heal",
  "healed",
  "cure",
  "cured",
  "award",
  "awarded",
  "milestone",
  "soar",
  "soars",
  "surge",
  "growth",
  "grows",
  "innovation",
  "kind",
  "kindness",
  "hero",
  "heroes",
  "reunite",
  "reunited",
  "free",
  "freed",
  "protect",
  "protected",
  "gift",
  "joy",
  "joyful",
  "love",
  "volunteer",
  "charity",
  "progress",
  "achieve",
  "achievement",
  "triumph",
]);

const NEGATIVE = new Set([
  "death",
  "dead",
  "dies",
  "died",
  "kill",
  "killed",
  "killing",
  "war",
  "crisis",
  "attack",
  "attacks",
  "crash",
  "crashes",
  "disaster",
  "fear",
  "feared",
  "loss",
  "losses",
  "lost",
  "fail",
  "failed",
  "failure",
  "collapse",
  "shooting",
  "shot",
  "violence",
  "violent",
  "threat",
  "threats",
  "outbreak",
  "scandal",
  "fraud",
  "layoff",
  "layoffs",
  "recession",
  "decline",
  "declines",
  "fire",
  "flood",
  "storm",
  "victim",
  "victims",
  "abuse",
  "corruption",
  "protest",
  "arrest",
  "arrested",
  "lawsuit",
  "sue",
  "warning",
  "danger",
  "dangerous",
  "deadly",
  "tragedy",
  "tragic",
  "panic",
  "plunge",
  "plunges",
  "fall",
  "falls",
  "slump",
]);

export function scoreSentiment(text: string): number {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return 0;
  let score = 0;
  let hits = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) {
      score += 1;
      hits++;
    } else if (NEGATIVE.has(w)) {
      score -= 1;
      hits++;
    }
  }
  if (hits === 0) return 0;
  // normalize by hits, then dampen so a single word isn't ±1
  const raw = score / hits;
  const magnitude = Math.min(1, hits / 4);
  return Number((raw * magnitude).toFixed(3));
}

export function sentimentLabel(score: number): "positive" | "neutral" | "negative" {
  if (score > 0.15) return "positive";
  if (score < -0.15) return "negative";
  return "neutral";
}

/** Threshold used by the Good News tab. */
export const GOOD_NEWS_THRESHOLD = 0.15;

export function isGoodNews(score: number): boolean {
  return score >= GOOD_NEWS_THRESHOLD;
}
