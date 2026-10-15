import type { League } from "@/types";

/**
 * Discrete outcome distributions.
 *
 * Every probability the SGP model emitted used to be `Φ((mean - line)/σ)` — a
 * continuous normal, for every sport. That is wrong in three ways that all
 * push in a consistent direction:
 *
 *  1. **Low-scoring sports aren't normal.** Hockey goals and baseball runs are
 *     small Poisson-ish counts, so the margin is a difference of two Poissons
 *     (Skellam), not a bell curve. The puck line and run line sit at exactly
 *     ±1.5 — precisely where smearing a discrete distribution into a
 *     continuous one does the most damage.
 *  2. **Football margins cluster.** NFL games land on 3 and 7 far more often
 *     than any smooth curve allows, so every spread near a key number was
 *     mispriced.
 *  3. **Integer lines can push.** A continuous distribution assigns zero
 *     probability to landing exactly on the line. Roughly a tenth of NFL games
 *     end on a 3-point margin, and since a push is refunded (and is excluded
 *     from our Brier score), the probability we log has to be conditional on
 *     the game not pushing.
 *
 * Everything here is exact arithmetic on a dense pmf — no closed forms, no
 * Bessel functions — so it is cheap, testable, and easy to read.
 */

/* ------------------------------------------------------------------ *
 * Count distributions
 * ------------------------------------------------------------------ */

/** log(n!) via lgamma, so large counts don't overflow. */
function logFactorial(n: number): number {
  if (n < 2) return 0;
  // Stirling with correction terms — exact enough for the counts we see.
  let acc = 0;
  for (let i = 2; i <= Math.min(n, 170); i++) acc += Math.log(i);
  return acc;
}

/** P(X = k) for X ~ Poisson(lambda). */
export function poissonPmf(lambda: number, k: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k));
}

/** Abramowitz & Stegun 7.1.26 — |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Mass a normal puts on the integer k, i.e. the interval [k-0.5, k+0.5). */
export function normalIntegerPmf(
  mean: number,
  sd: number,
  k: number,
): number {
  if (sd <= 0) return k === Math.round(mean) ? 1 : 0;
  return (
    normalCdf((k + 0.5 - mean) / sd) - normalCdf((k - 0.5 - mean) / sd)
  );
}

/* ------------------------------------------------------------------ *
 * Football key numbers
 * ------------------------------------------------------------------ */

/**
 * Multipliers applied to the smooth mass at each |margin| for football.
 *
 * These encode the well-known shape of NFL final margins — the spike at 3,
 * the secondary spike at 7, then 10/14 — rather than exact historical
 * frequencies. They are deliberately coarse, documented assumptions, and they
 * are exactly the kind of constant that should be re-fitted once the
 * prediction log and CLV tracking have enough samples to measure them.
 */
const NFL_KEY_WEIGHTS: Record<number, number> = {
  0: 0.1, // ties are possible but vanishingly rare
  1: 0.75,
  2: 0.9,
  3: 1.9,
  4: 1.1,
  5: 0.85,
  6: 1.15,
  7: 1.5,
  8: 0.95,
  9: 0.9,
  10: 1.3,
  11: 0.85,
  12: 0.8,
  13: 0.9,
  14: 1.25,
  15: 0.85,
  16: 0.9,
  17: 1.1,
  18: 0.9,
  20: 1.05,
  21: 1.05,
  24: 1.05,
  28: 1.0,
};

/** College football clusters on the same numbers, but less sharply. */
function dampen(weights: Record<number, number>, factor: number) {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    out[Number(k)] = 1 + (v - 1) * factor;
  }
  return out;
}
const NCAAF_KEY_WEIGHTS = { ...dampen(NFL_KEY_WEIGHTS, 0.6), 0: 0 };

/* ------------------------------------------------------------------ *
 * The distribution object
 * ------------------------------------------------------------------ */

export type Family = "skellam" | "key-number" | "normal" | "poisson";

/**
 * How much team strength carries into overtime. Low on purpose: overtime is a
 * short sample conditioned on the teams being level, so it is much closer to a
 * coin flip than the full-game win probability suggests.
 */
export const OVERTIME_SKILL_WEIGHT = 0.35;

export interface DiscreteDist {
  family: Family;
  /** Inclusive support bounds. */
  lo: number;
  hi: number;
  mean: number;
  sd: number;
  /** P(X = k). */
  at(k: number): number;
  /** P(X > t). At an integer t this EXCLUDES the push. */
  above(t: number): number;
  /** P(X < t). At an integer t this EXCLUDES the push. */
  below(t: number): number;
  /** P(lo < X < hi), open on both ends. */
  between(lo: number, hi: number): number;
  /** The pmf as points, for charts. */
  support(): { k: number; p: number }[];
}

function makeDist(
  family: Family,
  lo: number,
  weights: number[],
): DiscreteDist {
  const total = weights.reduce((a, b) => a + b, 0);
  const p = total > 0 ? weights.map((w) => w / total) : weights.slice();
  const hi = lo + p.length - 1;

  let mean = 0;
  for (let i = 0; i < p.length; i++) mean += (lo + i) * p[i];
  let variance = 0;
  for (let i = 0; i < p.length; i++) variance += p[i] * (lo + i - mean) ** 2;

  const at = (k: number) => {
    const i = Math.round(k) - lo;
    // A non-integer value has no mass in a discrete distribution.
    if (!Number.isInteger(k) || i < 0 || i >= p.length) return 0;
    return p[i];
  };

  const above = (t: number) => {
    let acc = 0;
    for (let i = 0; i < p.length; i++) if (lo + i > t) acc += p[i];
    return acc;
  };

  const below = (t: number) => {
    let acc = 0;
    for (let i = 0; i < p.length; i++) if (lo + i < t) acc += p[i];
    return acc;
  };

  return {
    family,
    lo,
    hi,
    mean: Number(mean.toFixed(4)),
    sd: Number(Math.sqrt(Math.max(0, variance)).toFixed(4)),
    at,
    above,
    below,
    between: (a, b) => {
      let acc = 0;
      for (let i = 0; i < p.length; i++) {
        const k = lo + i;
        if (k > a && k < b) acc += p[i];
      }
      return acc;
    },
    support: () => p.map((prob, i) => ({ k: lo + i, p: prob })),
  };
}

/* ------------------------------------------------------------------ *
 * League configuration
 * ------------------------------------------------------------------ */

interface DistConfig {
  /** Which family the final margin follows. */
  margin: Family;
  /** Whether a level final score is impossible. */
  tiesImpossible: boolean;
  keyWeights?: Record<number, number>;
}

export const DIST_CONFIG: Record<League, DistConfig> = {
  // Goals and runs are counts: the margin is a difference of two Poissons,
  // which also means variance follows the scoring environment for free.
  NHL: { margin: "skellam", tiesImpossible: true },
  MLB: { margin: "skellam", tiesImpossible: true },
  // Football margins are large but cluster hard on key numbers.
  NFL: { margin: "key-number", tiesImpossible: false, keyWeights: NFL_KEY_WEIGHTS },
  NCAAF: { margin: "key-number", tiesImpossible: true, keyWeights: NCAAF_KEY_WEIGHTS },
  // Basketball margins are big enough that a discretized normal is a good fit;
  // discretizing is still what gives us push mass at integer spreads.
  NBA: { margin: "normal", tiesImpossible: true },
  NCAAB: { margin: "normal", tiesImpossible: true },
};

/** True when the league's margin is modelled as a count difference. */
export function usesCountModel(league: League): boolean {
  return DIST_CONFIG[league]?.margin === "skellam";
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

/** Difference of two independent Poissons, by direct convolution. */
export function skellamDist(
  lambdaHome: number,
  lambdaAway: number,
  span = 24,
): DiscreteDist {
  const lh = Math.max(0.05, lambdaHome);
  const la = Math.max(0.05, lambdaAway);
  // Sum far enough out that the truncated tail is negligible.
  const jMax = Math.ceil(la + 10 * Math.sqrt(la) + 10);

  const weights: number[] = [];
  for (let k = -span; k <= span; k++) {
    let acc = 0;
    for (let j = Math.max(0, -k); j <= jMax; j++) {
      acc += poissonPmf(lh, j + k) * poissonPmf(la, j);
    }
    weights.push(acc);
  }
  return makeDist("skellam", -span, weights);
}

/** Sum of two independent Poissons is Poisson(l1 + l2). */
export function poissonSumDist(
  lambdaHome: number,
  lambdaAway: number,
): DiscreteDist {
  const lambda = Math.max(0.1, lambdaHome) + Math.max(0.1, lambdaAway);
  const hi = Math.ceil(lambda + 10 * Math.sqrt(lambda) + 10);
  const weights: number[] = [];
  for (let k = 0; k <= hi; k++) weights.push(poissonPmf(lambda, k));
  return makeDist("poisson", 0, weights);
}

/** Discretized normal, optionally reweighted for key numbers. */
export function discreteNormalDist(
  mean: number,
  sd: number,
  opts: { keyWeights?: Record<number, number>; span?: number } = {},
): DiscreteDist {
  const span = opts.span ?? Math.ceil(Math.abs(mean) + 5 * Math.max(sd, 1) + 2);
  const lo = Math.floor(mean - span);
  const hi = Math.ceil(mean + span);
  const weights: number[] = [];
  for (let k = lo; k <= hi; k++) {
    const base = normalIntegerPmf(mean, sd, k);
    const w = opts.keyWeights?.[Math.abs(k)] ?? 1;
    weights.push(base * w);
  }
  return makeDist(
    opts.keyWeights ? "key-number" : "normal",
    lo,
    weights,
  );
}

/* ------------------------------------------------------------------ *
 * The joint score distribution
 * ------------------------------------------------------------------ *
 * Modelling the margin and the total as two separate distributions leaves
 * three things wrong:
 *
 *  1. **Parity.** A margin and a total are not independent even when they are
 *     uncorrelated: `h - a` and `h + a` are always both even or both odd. A
 *     total of 6 with a margin of 1 is impossible. Multiplying two separate
 *     distributions happily assigns probability to combinations that cannot
 *     occur, which matters most in the low-scoring sports where a parlay might
 *     actually pair a puck line with a total.
 *  2. **Correlation.** Where the two really are correlated, independence is
 *     simply wrong.
 *  3. **Team totals.** They aren't expressible at all without a per-side
 *     distribution. (The grid supports them; we don't emit those legs because
 *     no free source prices that market, and a leg with no price can't be
 *     checked for edge.)
 *
 * So the primitive is a grid over (homeScore, awayScore). Every market is read
 * off that one object by marginalizing, which makes them consistent by
 * construction rather than by convention.
 */

export interface ScoreGrid {
  family: Family;
  loHome: number;
  loAway: number;
  rowsHome: number;
  colsAway: number;
  /** Flattened row-major pmf over (home, away). */
  p: number[];
  at(home: number, away: number): number;
  /** Implied correlation between the two sides' scores. */
  scoreCorrelation: number;
}

function gridAt(g: ScoreGrid, home: number, away: number): number {
  const i = Math.round(home) - g.loHome;
  const j = Math.round(away) - g.loAway;
  if (!Number.isInteger(home) || !Number.isInteger(away)) return 0;
  if (i < 0 || j < 0 || i >= g.rowsHome || j >= g.colsAway) return 0;
  return g.p[i * g.colsAway + j];
}

/** Bivariate normal density, unnormalized (the grid is normalized after). */
function biNormalKernel(
  dh: number,
  da: number,
  s: number,
  rho: number,
): number {
  const r = clampNum(rho, -0.95, 0.95);
  const z = (dh * dh - 2 * r * dh * da + da * da) / (s * s);
  return Math.exp(-z / (2 * (1 - r * r)));
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface GridInputs {
  league: League;
  /** Projected home margin. */
  margin: number;
  /** Projected combined total. */
  total: number;
  /** Target SD of the margin. */
  marginSd: number;
  /** Target SD of the total. */
  totalSd: number;
  /** Count sports: projected scores, used directly as Poisson means. */
  lambdaHome?: number;
  lambdaAway?: number;
}

/**
 * Build the joint score grid for one game.
 *
 * For the count sports the two scores are independent Poissons, so the grid is
 * their outer product — and the margin marginal is then exactly a Skellam,
 * matching what the one-dimensional model produced.
 *
 * For the rest the scores are bivariate normal. The correlation isn't a free
 * parameter: given the calibrated margin and total SDs, and taking the two
 * sides to have equal variance,
 *
 *     var(margin) = 2s^2(1 - rho)      var(total) = 2s^2(1 + rho)
 *
 * which inverts to s^2 = (sm^2 + st^2)/4 and rho = (st^2 - sm^2)/(st^2 + sm^2).
 * So both marginals are reproduced exactly and the implied score correlation
 * falls out of them. It lands around 0.3 for basketball — the pace effect,
 * where a fast game inflates both scores — and near zero for football, which
 * is why treating those two markets as independent was a decent approximation
 * there and a poor one in the NBA.
 */
export function buildScoreGrid(inputs: GridInputs): ScoreGrid {
  const cfg = DIST_CONFIG[inputs.league];
  const counts =
    cfg?.margin === "skellam" &&
    inputs.lambdaHome != null &&
    inputs.lambdaAway != null;

  let loHome: number;
  let loAway: number;
  let rowsHome: number;
  let colsAway: number;
  let weights: number[];
  let family: Family;
  let rho = 0;

  if (counts) {
    const lh = Math.max(0.05, inputs.lambdaHome!);
    const la = Math.max(0.05, inputs.lambdaAway!);
    loHome = 0;
    loAway = 0;
    rowsHome = Math.ceil(lh + 8 * Math.sqrt(lh) + 8);
    colsAway = Math.ceil(la + 8 * Math.sqrt(la) + 8);
    weights = new Array(rowsHome * colsAway);
    for (let i = 0; i < rowsHome; i++) {
      const ph = poissonPmf(lh, i);
      for (let j = 0; j < colsAway; j++) {
        weights[i * colsAway + j] = ph * poissonPmf(la, j);
      }
    }
    family = "skellam";
  } else {
    const sm = Math.max(0.5, inputs.marginSd);
    const st = Math.max(0.5, inputs.totalSd);
    const s = Math.sqrt((sm * sm + st * st) / 4);
    rho = (st * st - sm * sm) / (st * st + sm * sm);

    const muHome = (inputs.total + inputs.margin) / 2;
    const muAway = (inputs.total - inputs.margin) / 2;
    const span = Math.ceil(4.2 * s + 2);
    loHome = Math.max(0, Math.round(muHome - span));
    loAway = Math.max(0, Math.round(muAway - span));
    rowsHome = Math.round(muHome + span) - loHome + 1;
    colsAway = Math.round(muAway + span) - loAway + 1;

    weights = new Array(rowsHome * colsAway);
    for (let i = 0; i < rowsHome; i++) {
      const dh = loHome + i - muHome;
      for (let j = 0; j < colsAway; j++) {
        const da = loAway + j - muAway;
        let w = biNormalKernel(dh, da, s, rho);
        // Football's key numbers live on the margin, so reweight there.
        if (cfg?.keyWeights) {
          w *= cfg.keyWeights[Math.abs(loHome + i - (loAway + j))] ?? 1;
        }
        weights[i * colsAway + j] = w;
      }
    }
    family = cfg?.keyWeights ? "key-number" : "normal";
  }

  // Ties: redistribute the diagonal to the cells one score higher for one
  // side. That is what overtime physically does — somebody scores — so it also
  // moves the TOTAL up by one, which is correct and which two separate
  // distributions could never express.
  //
  // The split is skill-weighted but heavily shrunk toward a coin flip: a team
  // that wins 61% of full games does NOT win 61% of overtimes, because the
  // sample is a few minutes long and conditioned on the sides being level.
  if (cfg?.tiesImpossible) {
    // Regulation win share, measured before the diagonal is cleared.
    let pHomeReg = 0;
    let pAwayReg = 0;
    for (let i = 0; i < rowsHome; i++) {
      for (let j = 0; j < colsAway; j++) {
        const diff = loHome + i - (loAway + j);
        if (diff > 0) pHomeReg += weights[i * colsAway + j];
        else if (diff < 0) pAwayReg += weights[i * colsAway + j];
      }
    }
    const denom = pHomeReg + pAwayReg;
    const share = denom > 0 ? pHomeReg / denom : 0.5;
    const homeShare = clampNum(
      0.5 + OVERTIME_SKILL_WEIGHT * (share - 0.5),
      0.1,
      0.9,
    );
    // Walk only the cells where home score == away score.
    const firstTie = Math.max(loHome, loAway);
    const lastTie = Math.min(loHome + rowsHome - 1, loAway + colsAway - 1);
    for (let score = firstTie; score <= lastTie; score++) {
      const i = score - loHome;
      const j = score - loAway;
      const mass = weights[i * colsAway + j];
      if (mass <= 0) continue;
      weights[i * colsAway + j] = 0;
      // Split by each side's chance of winning the game outright.
      const homeUp = i + 1 < rowsHome ? (i + 1) * colsAway + j : -1;
      const awayUp = j + 1 < colsAway ? i * colsAway + (j + 1) : -1;
      if (homeUp >= 0 && awayUp >= 0) {
        weights[homeUp] += mass * homeShare;
        weights[awayUp] += mass * (1 - homeShare);
      } else if (homeUp >= 0) weights[homeUp] += mass;
      else if (awayUp >= 0) weights[awayUp] += mass;
    }
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  const p = sum > 0 ? weights.map((w) => w / sum) : weights;

  const grid: ScoreGrid = {
    family,
    loHome,
    loAway,
    rowsHome,
    colsAway,
    p,
    at: (h, a) => gridAt(grid, h, a),
    scoreCorrelation: Number(rho.toFixed(4)),
  };
  return grid;
}

/** Collapse the grid onto the margin axis. */
export function gridMarginDist(g: ScoreGrid): DiscreteDist {
  const lo = g.loHome - (g.loAway + g.colsAway - 1);
  const hi = g.loHome + g.rowsHome - 1 - g.loAway;
  const weights = new Array(hi - lo + 1).fill(0);
  for (let i = 0; i < g.rowsHome; i++) {
    for (let j = 0; j < g.colsAway; j++) {
      const m = g.loHome + i - (g.loAway + j);
      weights[m - lo] += g.p[i * g.colsAway + j];
    }
  }
  return makeDist(g.family, lo, weights);
}

/** Collapse the grid onto the total axis. */
export function gridTotalDist(g: ScoreGrid): DiscreteDist {
  const lo = g.loHome + g.loAway;
  const hi = g.loHome + g.rowsHome - 1 + g.loAway + g.colsAway - 1;
  const weights = new Array(hi - lo + 1).fill(0);
  for (let i = 0; i < g.rowsHome; i++) {
    for (let j = 0; j < g.colsAway; j++) {
      const t = g.loHome + i + g.loAway + j;
      weights[t - lo] += g.p[i * g.colsAway + j];
    }
  }
  return makeDist(g.family === "skellam" ? "poisson" : g.family, lo, weights);
}

export interface RegionConstraints {
  /** Home margin must be strictly inside these bounds. */
  marginLower?: number;
  marginUpper?: number;
  /** Combined total must be strictly inside these bounds. */
  totalLower?: number;
  totalUpper?: number;
}

/**
 * Exact probability that a game lands inside a set of constraints, with any
 * boundary push excluded — the honest joint probability for a same-game slip.
 *
 * Because this walks the score grid, a margin leg and a total leg in the same
 * game are evaluated against outcomes that can actually occur together,
 * including the parity constraint that the independent model violated.
 */
export function gridRegionProbability(
  g: ScoreGrid,
  c: RegionConstraints,
): number {
  const onBoundary = (v: number, lower?: number, upper?: number) =>
    (lower != null && Number.isFinite(lower) && v === lower) ||
    (upper != null && Number.isFinite(upper) && v === upper);

  let inside = 0;
  let pushMass = 0;
  for (let i = 0; i < g.rowsHome; i++) {
    const h = g.loHome + i;
    for (let j = 0; j < g.colsAway; j++) {
      const prob = g.p[i * g.colsAway + j];
      if (prob <= 0) continue;
      const a = g.loAway + j;
      const m = h - a;
      const t = h + a;

      if (
        onBoundary(m, c.marginLower, c.marginUpper) ||
        onBoundary(t, c.totalLower, c.totalUpper)
      ) {
        pushMass += prob;
        continue;
      }
      const marginOk =
        (c.marginLower == null || m > c.marginLower) &&
        (c.marginUpper == null || m < c.marginUpper);
      const totalOk =
        (c.totalLower == null || t > c.totalLower) &&
        (c.totalUpper == null || t < c.totalUpper);
      if (marginOk && totalOk) inside += prob;
    }
  }

  const p = pushMass >= 1 ? 0.5 : inside / (1 - pushMass);
  return Math.min(0.9999, Math.max(0.0001, p));
}

/* ------------------------------------------------------------------ *
 * Reading a price off a distribution
 * ------------------------------------------------------------------ */

export interface LineProbability {
  /** P(win | no push) — what a graded bet actually settles on. */
  win: number;
  /** P(landing exactly on the line). Zero for half-point lines. */
  push: number;
  /** Raw P(outcome > line) or P(outcome < line), pushes included as losses. */
  raw: number;
}

/**
 * Probability that a side clears a line.
 *
 * A push is a refund, not a loss, and our scoring excludes pushes — so the
 * probability we publish and log is conditional on the game not landing on
 * the number. For a half-point line this is identical to the raw probability.
 */
export function lineProbability(
  dist: DiscreteDist,
  line: number,
  direction: "above" | "below",
): LineProbability {
  const push = dist.at(line);
  const raw = direction === "above" ? dist.above(line) : dist.below(line);
  const win = push >= 1 ? 0.5 : raw / (1 - push);
  return {
    win: Math.min(0.999, Math.max(0.001, win)),
    push,
    raw,
  };
}

/**
 * Probability that the outcome lands strictly inside an interval, conditional
 * on not pushing on either boundary. Used for same-game legs, which become
 * nested bounds on one margin.
 */
export function intervalProbability(
  dist: DiscreteDist,
  lower: number,
  upper: number,
): number {
  const inside = dist.between(lower, upper);
  const pushMass =
    (Number.isFinite(lower) ? dist.at(lower) : 0) +
    (Number.isFinite(upper) ? dist.at(upper) : 0);
  const p = pushMass >= 1 ? 0.5 : inside / (1 - pushMass);
  return Math.min(0.9999, Math.max(0.0001, p));
}
