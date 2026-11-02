import type { League, SgpLeg } from "@/types";
import { buildScoreGrid, type ScoreGrid } from "@/lib/distributions";

/**
 * Monte Carlo over the model's actual joint score distribution.
 *
 * Two things this is, and one it very deliberately is not.
 *
 * It IS exact in its sampling: every leg already carries the inputs needed to
 * rebuild the joint pmf over (home score, away score) — that is why
 * gridMargin, gridTotal, the sigmas and the Poisson means are on it — so the
 * grid is reconstructed in the browser and sampled from directly. No request
 * is made, nothing is fetched, and the draws come from the same object that
 * prices every leg on the slip. A simulated win rate and the published
 * probability cannot disagree, because they are the same distribution read
 * two ways.
 *
 * It is NOT a play-by-play simulation. There is no drive model, no
 * possession model, no player in it anywhere. Animating invented drives
 * would look far more impressive and would be fiction, and this project has
 * spent its whole life removing numbers nobody can check. What runs is a
 * sample of FINAL SCORES, shown accumulating.
 *
 * The scoring path drawn on the field is interpolation for display only, and
 * the UI says so where it is drawn.
 */

export interface SimResult {
  homeScore: number;
  awayScore: number;
}

export interface SimSummary {
  runs: number;
  /** Share of runs the home side won outright. */
  homeWinRate: number;
  awayWinRate: number;
  tieRate: number;
  meanHome: number;
  meanAway: number;
  meanMargin: number;
  meanTotal: number;
  /** The exact final score that came up most often, and how often. */
  modalScore: { home: number; away: number; count: number; share: number };
  /** Most common exact scores, best first. */
  topScores: { home: number; away: number; share: number }[];
  /** Margin histogram, home perspective. */
  marginBuckets: { margin: number; share: number }[];
  /** Middle 80% of simulated margins. */
  marginP10: number;
  marginP90: number;
  totalP10: number;
  totalP90: number;
}

/** How a posted line fared across the simulation. */
export interface SimMarketCheck {
  label: string;
  /** Share of runs this side won, pushes excluded. */
  winRate: number;
  pushRate: number;
  /** What the price implies it needs. */
  breakEven?: number;
}

/**
 * Rebuild the joint grid for a game from any one of its legs.
 *
 * Returns null when the leg predates the fields the grid needs, which is
 * better than guessing at them — a simulation built on invented inputs would
 * be exactly the kind of confident fiction the rest of this file avoids.
 */
export function gridForLeg(leg: SgpLeg): ScoreGrid | null {
  const m = leg.modelMeta;
  if (!m) return null;
  const margin = m.gridMargin ?? m.blendedMargin;
  const total = m.gridTotal ?? m.totalMean;
  if (margin == null || total == null) return null;
  const marginSd = m.sigma;
  const totalSd = m.totalSigma;
  if (marginSd == null || totalSd == null) return null;
  try {
    return buildScoreGrid({
      league: leg.league,
      margin,
      total,
      marginSd,
      totalSd,
      lambdaHome: m.lambdaHome,
      lambdaAway: m.lambdaAway,
    });
  } catch {
    return null;
  }
}

/**
 * Draw one final score from the grid.
 *
 * Inverse-CDF over the flattened pmf. The grid is a few thousand cells, so a
 * linear scan is faster than building an alias table for the run counts
 * anyone actually asks for.
 */
export function sampleScore(grid: ScoreGrid, rnd: () => number): SimResult {
  const target = rnd();
  let acc = 0;
  for (let i = 0; i < grid.p.length; i++) {
    acc += grid.p[i];
    if (acc >= target) {
      const row = Math.floor(i / grid.colsAway);
      const col = i % grid.colsAway;
      return { homeScore: grid.loHome + row, awayScore: grid.loAway + col };
    }
  }
  // Floating point can leave a sliver; take the last cell.
  const i = grid.p.length - 1;
  return {
    homeScore: grid.loHome + Math.floor(i / grid.colsAway),
    awayScore: grid.loAway + (i % grid.colsAway),
  };
}

/** A small deterministic generator, so a run can be reproduced. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function summarise(results: SimResult[]): SimSummary {
  const runs = results.length;
  if (runs === 0) {
    return {
      runs: 0, homeWinRate: 0, awayWinRate: 0, tieRate: 0,
      meanHome: 0, meanAway: 0, meanMargin: 0, meanTotal: 0,
      modalScore: { home: 0, away: 0, count: 0, share: 0 },
      topScores: [], marginBuckets: [],
      marginP10: 0, marginP90: 0, totalP10: 0, totalP90: 0,
    };
  }
  let hw = 0, aw = 0, tie = 0, sh = 0, sa = 0;
  const scoreCounts = new Map<string, number>();
  const marginCounts = new Map<number, number>();
  const margins: number[] = [];
  const totals: number[] = [];

  for (const r of results) {
    const m = r.homeScore - r.awayScore;
    if (m > 0) hw++; else if (m < 0) aw++; else tie++;
    sh += r.homeScore; sa += r.awayScore;
    margins.push(m);
    totals.push(r.homeScore + r.awayScore);
    const k = `${r.homeScore}-${r.awayScore}`;
    scoreCounts.set(k, (scoreCounts.get(k) ?? 0) + 1);
    marginCounts.set(m, (marginCounts.get(m) ?? 0) + 1);
  }
  margins.sort((a, b) => a - b);
  totals.sort((a, b) => a - b);
  const pct = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];

  const ranked = [...scoreCounts.entries()]
    .map(([k, count]) => {
      const [h, a] = k.split("-").map(Number);
      return { home: h, away: a, count, share: count / runs };
    })
    .sort((x, y) => y.count - x.count);

  return {
    runs,
    homeWinRate: hw / runs,
    awayWinRate: aw / runs,
    tieRate: tie / runs,
    meanHome: sh / runs,
    meanAway: sa / runs,
    meanMargin: (sh - sa) / runs,
    meanTotal: (sh + sa) / runs,
    modalScore: ranked[0] ?? { home: 0, away: 0, count: 0, share: 0 },
    topScores: ranked.slice(0, 6).map(({ home, away, share }) => ({ home, away, share })),
    marginBuckets: [...marginCounts.entries()]
      .map(([margin, c]) => ({ margin, share: c / runs }))
      .sort((a, b) => a.margin - b.margin),
    marginP10: pct(margins, 0.1),
    marginP90: pct(margins, 0.9),
    totalP10: pct(totals, 0.1),
    totalP90: pct(totals, 0.9),
  };
}

/**
 * How each posted line on this game fared across the runs.
 *
 * Pushes are reported separately rather than folded in, because a line that
 * lands exactly returns the stake and is not a win by any useful definition.
 */
export function checkMarkets(
  results: SimResult[],
  legs: SgpLeg[],
): SimMarketCheck[] {
  const out: SimMarketCheck[] = [];
  for (const leg of legs) {
    const m = leg.modelMeta;
    if (!m) continue;
    let win = 0, push = 0;
    for (const r of results) {
      const margin = r.homeScore - r.awayScore;
      const total = r.homeScore + r.awayScore;
      if (m.kind === "total" && m.totalLine != null) {
        if (total === m.totalLine) { push++; continue; }
        const over = total > m.totalLine;
        if (m.side === "over" ? over : !over) win++;
      } else if (m.kind === "margin" && m.threshold != null) {
        const value = m.side === "away" ? -margin : margin;
        if (value === m.threshold) { push++; continue; }
        if (value > m.threshold) win++;
      }
    }
    const graded = results.length - push;
    if (graded <= 0) continue;
    out.push({
      label: leg.selection,
      winRate: win / graded,
      pushRate: push / results.length,
      breakEven: leg.breakEvenProbability,
    });
  }
  return out.sort((a, b) => b.winRate - a.winRate);
}

/** Court, field, rink or diamond — whichever this sport is played on. */
export function venueShape(league: League): "court" | "gridiron" | "rink" | "diamond" {
  switch (league) {
    case "NBA":
    case "NCAAB":
      return "court";
    case "NHL":
      return "rink";
    case "MLB":
      return "diamond";
    default:
      return "gridiron";
  }
}
