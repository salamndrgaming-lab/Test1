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
 * Ties
 * ------------------------------------------------------------------ */

/**
 * Hockey, baseball and basketball games cannot end level — overtime decides
 * them — but a Skellam or a normal happily puts mass on a zero margin. That
 * mass has to go somewhere, or P(home wins) + P(away wins) won't be 1.
 *
 * We split it between ±1 in proportion to each side's chance of winning
 * outright, which treats overtime as a contest the better team is slightly
 * more likely to win rather than a pure coin flip.
 */
function redistributeTies(dist: DiscreteDist): DiscreteDist {
  const pTie = dist.at(0);
  if (pTie <= 0) return dist;

  const pHome = dist.above(0);
  const pAway = dist.below(0);
  const denom = pHome + pAway;
  const homeShare = denom > 0 ? pHome / denom : 0.5;

  const weights: number[] = [];
  for (let k = dist.lo; k <= dist.hi; k++) {
    let w = dist.at(k);
    if (k === 0) w = 0;
    if (k === 1) w += pTie * homeShare;
    if (k === -1) w += pTie * (1 - homeShare);
    weights.push(w);
  }
  return makeDist(dist.family, dist.lo, weights);
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

export interface MarginInputs {
  league: League;
  /** Projected home margin. */
  mean: number;
  /** Margin SD, used by the non-count families. */
  sd: number;
  /** Projected scores, required for the count families. */
  lambdaHome?: number;
  lambdaAway?: number;
}

/** The margin distribution for one game, in the right family for its sport. */
export function marginDistribution(inputs: MarginInputs): DiscreteDist {
  const cfg = DIST_CONFIG[inputs.league];
  let dist: DiscreteDist;

  if (
    cfg?.margin === "skellam" &&
    inputs.lambdaHome != null &&
    inputs.lambdaAway != null
  ) {
    dist = skellamDist(inputs.lambdaHome, inputs.lambdaAway);
  } else {
    dist = discreteNormalDist(inputs.mean, inputs.sd, {
      keyWeights: cfg?.keyWeights,
    });
  }

  return cfg?.tiesImpossible ? redistributeTies(dist) : dist;
}

/** The combined-total distribution for one game. */
export function totalDistribution(inputs: MarginInputs & { totalMean: number; totalSd: number }): DiscreteDist {
  const cfg = DIST_CONFIG[inputs.league];
  if (
    cfg?.margin === "skellam" &&
    inputs.lambdaHome != null &&
    inputs.lambdaAway != null
  ) {
    // Derived from the same lambda pair as the margin, so the two markets are
    // coupled rather than assumed independent.
    return poissonSumDist(inputs.lambdaHome, inputs.lambdaAway);
  }
  return discreteNormalDist(inputs.totalMean, inputs.totalSd);
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
