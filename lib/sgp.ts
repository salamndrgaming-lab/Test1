import type { SgpLeg, SgpRecommendation } from "@/types";

export const SGP_DISCLAIMER =
  "For informational and educational purposes only. This is not betting or " +
  "financial advice and does not guarantee any outcome. Odds and stats are " +
  "illustrative. Must be 21+ (or legal age in your jurisdiction). If you or " +
  "someone you know has a gambling problem, call 1-800-GAMBLER.";

/** American odds -> decimal odds. */
export function americanToDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

/** Decimal odds -> American odds. */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/** Implied probability from decimal odds. */
export function impliedProbability(decimal: number): number {
  return 1 / decimal;
}

/** Combine independent legs into a parlay's decimal odds. */
export function combineLegs(legs: SgpLeg[]): number {
  return legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.americanOdds),
    1,
  );
}

export interface PayoutBreakdown {
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  payout: number; // total returned
  profit: number; // payout - stake
  impliedProbability: number;
}

export function calculatePayout(stake: number, legs: SgpLeg[]): PayoutBreakdown {
  const decimalOdds = combineLegs(legs);
  const payout = stake * decimalOdds;
  return {
    stake,
    decimalOdds: Number(decimalOdds.toFixed(2)),
    americanOdds: decimalToAmerican(decimalOdds),
    payout: Number(payout.toFixed(2)),
    profit: Number((payout - stake).toFixed(2)),
    impliedProbability: Number(impliedProbability(decimalOdds).toFixed(4)),
  };
}

/**
 * Transparent "edge" score for a leg: how much the model's estimated
 * probability exceeds the odds-implied probability. Higher = better value.
 */
export function legEdge(leg: SgpLeg): number {
  const implied = impliedProbability(americanToDecimal(leg.americanOdds));
  return Number((leg.modelProbability - implied).toFixed(4));
}

/**
 * Build a recommendation from a candidate pool: rank by edge, take top N (>=6),
 * and compute combined odds/probabilities. Pure + deterministic for a given pool.
 */
export function buildRecommendation(
  candidates: SgpLeg[],
  minLegs = 6,
): SgpRecommendation {
  const ranked = [...candidates].sort((a, b) => legEdge(b) - legEdge(a));
  const legs = ranked.slice(0, Math.max(minLegs, Math.min(8, ranked.length)));
  const combinedDecimalOdds = combineLegs(legs);
  const modelProbability = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  return {
    id: `sgp-${Date.now()}`,
    title: `${legs.length}-Leg Same-Game / Cross-Game Research Slip`,
    legs,
    combinedDecimalOdds: Number(combinedDecimalOdds.toFixed(2)),
    combinedAmericanOdds: decimalToAmerican(combinedDecimalOdds),
    impliedProbability: Number(
      impliedProbability(combinedDecimalOdds).toFixed(4),
    ),
    modelProbability: Number(modelProbability.toFixed(4)),
    disclaimer: SGP_DISCLAIMER,
  };
}
