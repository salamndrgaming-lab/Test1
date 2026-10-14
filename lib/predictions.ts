import type { League, SgpLeg } from "@/types";
import { americanToDecimal } from "@/lib/sgp";

/**
 * Prediction logging + scoring.
 *
 * A model you never grade is a guess with extra steps. Every leg the SGP tool
 * shows is recorded with the probability we claimed at the time; once the game
 * finishes we score it. That gives the only honest answers to "is this model
 * any good?" — calibration (when we say 65%, does it land 65% of the time?)
 * and skill against the market (are we beating the de-vigged price?).
 */

export interface PredictionRecord {
  id: string;
  gameId: string;
  league: League;
  matchup: string;
  market: string;
  selection: string;
  americanOdds: number;
  modelProbability: number;
  /** De-vigged market probability — the benchmark we must beat. */
  marketProbability: number;
  recordedAt: string;

  // everything needed to grade it later
  kind: "margin" | "total";
  /** "home"/"away" for margin legs; "over"/"under" for totals. */
  side?: "home" | "away" | "over" | "under";
  /** The team's margin must exceed this. */
  threshold?: number;
  totalLine?: number;

  // filled in once the game is final
  graded?: boolean;
  won?: boolean;
  push?: boolean;
  finalHome?: number;
  finalAway?: number;
  gradedAt?: string;
}

export interface GameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

/** Turn a live leg into a logged prediction (null when it can't be graded). */
export function toPrediction(leg: SgpLeg): PredictionRecord | null {
  const meta = leg.modelMeta;
  if (!meta) return null;
  const totalLine =
    meta.kind === "total"
      ? (meta.totalLine ?? Number(/([\d.]+)/.exec(leg.selection)?.[1] ?? NaN))
      : undefined;
  if (meta.kind === "total" && !Number.isFinite(totalLine)) return null;

  return {
    id: `${leg.id}-${new Date().toISOString().slice(0, 10)}`,
    gameId: leg.gameId,
    league: leg.league,
    matchup: leg.matchup,
    market: leg.market,
    selection: leg.selection,
    americanOdds: leg.americanOdds,
    modelProbability: leg.modelProbability,
    marketProbability: leg.marketProbability,
    recordedAt: new Date().toISOString(),
    kind: meta.kind,
    side: meta.side,
    threshold: meta.threshold,
    totalLine,
  };
}

/** Grade one prediction against a final score. */
export function gradePrediction(
  p: PredictionRecord,
  r: GameResult,
): PredictionRecord {
  if (!r.final) return p;
  const homeMargin = r.homeScore - r.awayScore;
  let won: boolean;
  let push = false;

  if (p.kind === "total") {
    const total = r.homeScore + r.awayScore;
    const line = p.totalLine ?? 0;
    if (total === line) push = true;
    won = p.side === "under" ? total < line : total > line;
  } else {
    const t = p.threshold ?? 0;
    // "home" legs need homeMargin > t; "away" legs need awayMargin > t
    const value = p.side === "home" ? homeMargin : -homeMargin;
    if (value === t) push = true;
    won = value > t;
  }

  return {
    ...p,
    graded: true,
    won,
    push,
    finalHome: r.homeScore,
    finalAway: r.awayScore,
    gradedAt: new Date().toISOString(),
  };
}

/* ---------------------------- scoring ---------------------------- */

export interface CalibrationBin {
  label: string;
  /** Mean probability we predicted in this bin. */
  predicted: number;
  /** Share that actually won. */
  actual: number;
  count: number;
}

export interface ScoreCard {
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Mean squared error of our probabilities. Lower is better; 0.25 = coinflip. */
  brierModel: number;
  /** Same metric for the de-vigged market price. */
  brierMarket: number;
  /** 1 - model/market. Positive means we beat the market. */
  skillScore: number;
  /** Profit per unit staked if every logged leg were backed flat. */
  roi: number;
  bins: CalibrationBin[];
  /** Brier needs real volume before it means anything. */
  meaningful: boolean;
}

const EMPTY: ScoreCard = {
  graded: 0, wins: 0, losses: 0, pushes: 0,
  brierModel: 0, brierMarket: 0, skillScore: 0, roi: 0,
  bins: [], meaningful: false,
};

/**
 * Score the graded predictions. Pushes are excluded — they're not a test of
 * the probability, they're a refund.
 */
export function scorePredictions(
  records: PredictionRecord[],
  binCount = 5,
): ScoreCard {
  const settled = records.filter((r) => r.graded && !r.push);
  if (settled.length === 0) {
    return { ...EMPTY, pushes: records.filter((r) => r.push).length };
  }

  let seModel = 0;
  let seMarket = 0;
  let profit = 0;
  let wins = 0;

  for (const r of settled) {
    const o = r.won ? 1 : 0;
    seModel += (r.modelProbability - o) ** 2;
    seMarket += (r.marketProbability - o) ** 2;
    profit += r.won ? americanToDecimal(r.americanOdds) - 1 : -1;
    if (r.won) wins++;
  }

  const brierModel = seModel / settled.length;
  const brierMarket = seMarket / settled.length;

  // calibration bins across the probability range we actually produce
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = i / binCount;
    const hi = (i + 1) / binCount;
    const inBin = settled.filter(
      (r) =>
        r.modelProbability >= lo &&
        (i === binCount - 1 ? r.modelProbability <= hi : r.modelProbability < hi),
    );
    if (inBin.length === 0) continue;
    bins.push({
      label: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
      predicted:
        inBin.reduce((s, r) => s + r.modelProbability, 0) / inBin.length,
      actual: inBin.filter((r) => r.won).length / inBin.length,
      count: inBin.length,
    });
  }

  return {
    graded: settled.length,
    wins,
    losses: settled.length - wins,
    pushes: records.filter((r) => r.push).length,
    brierModel: Number(brierModel.toFixed(4)),
    brierMarket: Number(brierMarket.toFixed(4)),
    skillScore:
      brierMarket > 0 ? Number((1 - brierModel / brierMarket).toFixed(4)) : 0,
    roi: Number((profit / settled.length).toFixed(4)),
    bins,
    // below ~50 settled legs the differences are noise, not signal
    meaningful: settled.length >= 50,
  };
}
