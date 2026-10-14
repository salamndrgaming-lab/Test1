import type {
  Confidence,
  Game,
  League,
  LineMovement,
  MarketOdds,
  TeamRest,
  TeamScoring,
  SgpConfidenceFactor,
  SgpLeg,
  SgpLegModelMeta,
  SgpRecommendation,
} from "@/types";
import { formatOdds } from "@/lib/format";

export const SGP_DISCLAIMER =
  "For informational and educational purposes only. This is not betting or " +
  "financial advice and does not guarantee any outcome. Odds and stats are " +
  "illustrative. Must be 21+ (or legal age in your jurisdiction). If you or " +
  "someone you know has a gambling problem, call 1-800-GAMBLER.";

export const MODEL_VERSION = "ratings-v3";

/* ------------------------------------------------------------------ *
 * 1. Odds math
 * ------------------------------------------------------------------ */

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

/** Break-even probability implied by decimal odds (INCLUDES the book's margin). */
export function impliedProbability(decimal: number): number {
  return 1 / decimal;
}

/** Fair American odds for a given true probability. */
export function fairAmericanOdds(prob: number): number {
  const p = clamp(prob, 0.001, 0.999);
  return decimalToAmerican(1 / p);
}

/**
 * Remove the bookmaker's margin ("vig") from a set of raw implied probabilities
 * so they sum to 1. Raw implieds on a two-way market sum to ~1.02–1.08; that
 * excess is the book's hold, not real probability. Comparing a model against
 * RAW implied invents edge that isn't there — de-vigging is the single most
 * important accuracy fix in this model.
 */
export function removeVig(rawImplied: number[]): {
  fair: number[];
  vig: number;
} {
  const sum = rawImplied.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fair: rawImplied, vig: 0 };
  return { fair: rawImplied.map((p) => p / sum), vig: sum - 1 };
}

/** Expected value per $1 staked at these odds, given a true probability. */
export function expectedValue(prob: number, decimal: number): number {
  return prob * (decimal - 1) - (1 - prob);
}

/** Kelly stake fraction (0 when there's no edge). Negative edge -> 0. */
export function kellyFraction(prob: number, decimal: number): number {
  const b = decimal - 1;
  if (b <= 0) return 0;
  return Math.max(0, (prob * b - (1 - prob)) / b);
}

/** Combine legs' prices into the parlay's decimal odds (what a book would pay). */
export function combineLegs(legs: SgpLeg[]): number {
  return legs.reduce((acc, leg) => acc * americanToDecimal(leg.americanOdds), 1);
}

/* ------------------------------------------------------------------ *
 * 2. Statistics helpers
 * ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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

/** Inverse standard normal CDF (Acklam's approximation). */
export function normalQuantile(p: number): number {
  const a = [
    -3.969683028665376e1, 2.20946098424521e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pl = 0.02425;
  const q0 = clamp(p, 1e-9, 1 - 1e-9);
  if (q0 < pl) {
    const q = Math.sqrt(-2 * Math.log(q0));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (q0 <= 1 - pl) {
    const q = q0 - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - q0));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/**
 * Log5 (Bill James): probability team A beats team B given each team's win
 * rate, on neutral ground. The standard way to turn two win% values into a
 * head-to-head probability.
 */
export function log5(pA: number, pB: number): number {
  const a = clamp(pA, 0.02, 0.98);
  const b = clamp(pB, 0.02, 0.98);
  const denom = a + b - 2 * a * b;
  if (denom <= 0) return 0.5;
  return (a - a * b) / denom;
}

/* ------------------------------------------------------------------ *
 * 3. League parameters
 * ------------------------------------------------------------------ */

/**
 * Cost of playing on consecutive nights, in margin units, by league.
 *
 * Back-to-backs are a well-documented drag in basketball and hockey; football
 * is weekly so the concept doesn't apply, and baseball plays most days, which
 * is why its penalty is ~0 (it is the starting pitcher, not rest, that drives
 * MLB — and this feed gives us no pitcher data, so we claim nothing).
 */
export const BACK_TO_BACK_PENALTY: Record<League, number> = {
  NBA: 1.8,
  NHL: 0.2,
  NCAAB: 1.5,
  MLB: 0,
  NFL: 0,
  NCAAF: 0,
};

export interface LeagueModel {
  /** SD of final margin, in the sport's own units. */
  marginSigma: number;
  /** SD of the combined final total. */
  totalSigma: number;
  /** Home advantage expressed in margin units. */
  homeEdge: number;
  /** Shrinkage constant: games needed before records carry real weight. */
  priorGames: number;
  unit: string;
}

export const LEAGUE_MODEL: Record<League, LeagueModel> = {
  NBA: { marginSigma: 12.0, totalSigma: 16.5, homeEdge: 2.2, priorGames: 20, unit: "pts" },
  NFL: { marginSigma: 13.2, totalSigma: 13.5, homeEdge: 1.6, priorGames: 6, unit: "pts" },
  NHL: { marginSigma: 2.3, totalSigma: 2.7, homeEdge: 0.25, priorGames: 25, unit: "goals" },
  MLB: { marginSigma: 4.2, totalSigma: 4.4, homeEdge: 0.2, priorGames: 40, unit: "runs" },
  NCAAF: { marginSigma: 16.5, totalSigma: 17.5, homeEdge: 2.4, priorGames: 6, unit: "pts" },
  NCAAB: { marginSigma: 11.0, totalSigma: 15.0, homeEdge: 3.0, priorGames: 15, unit: "pts" },
};

/**
 * Hard cap on how much our scoring-rate model can move off the market.
 * Betting markets are highly efficient; even a decent model deserves a
 * minority vote. Keeping this explicit (and low) is what stops the tool
 * inventing edge.
 */
export const MAX_MODEL_WEIGHT = 0.35;

/**
 * A win%-only prior (no scoring data) is materially weaker than a points
 * for/against one — two 10-6 teams can have opposite point differentials — so
 * it gets a smaller vote.
 */
export const MAX_RECORD_WEIGHT = 0.2;

/** Totals are the sharpest market of the three, so we lean on it hardest. */
export const MAX_TOTAL_WEIGHT = 0.3;

/**
 * Leagues whose spread is a true point spread priced at the standard -110.
 * NHL (puck line) and MLB (run line) are excluded: they are fixed at ±1.5 and
 * priced like moneylines, so -110 must never be assumed for them.
 */
export const STANDARD_SPREAD_LEAGUES = new Set<League>([
  "NBA",
  "NFL",
  "NCAAF",
  "NCAAB",
]);

/* ------------------------------------------------------------------ *
 * 4. Team records
 * ------------------------------------------------------------------ */

export interface ParsedRecord {
  wins: number;
  games: number;
  winPct: number;
}

/** Parse "41-15" or "34-16-5" (NHL: W-L-OTL). An OTL is still a loss. */
export function parseRecord(record?: string): ParsedRecord | null {
  if (!record) return null;
  const nums = record.split("-").map((n) => Number(n.trim()));
  if (nums.length < 2 || nums.some((n) => !Number.isFinite(n))) return null;
  const games = nums.reduce((a, b) => a + b, 0);
  if (games <= 0) return null;
  return { wins: nums[0], games, winPct: nums[0] / games };
}

/* ------------------------------------------------------------------ *
 * 5. The game model — one coherent margin distribution per game
 * ------------------------------------------------------------------ *
 * Everything (moneyline, spread) is derived from a single projected margin and
 * its standard deviation, so the markets stay internally consistent and the
 * same-game correlation becomes exactly computable.
 */

export interface GameModel {
  league: League;
  sigma: number;
  /** SD of the combined total. */
  totalSigma: number;
  /** Market's projected home margin (positive = home favoured). */
  marketMargin: number;
  /** Our projected home margin (null when we have no inputs at all). */
  modelMargin: number | null;
  /** Final blended projection used for all legs in this game. */
  blendedMargin: number;
  /** Weight given to our model (0..MAX_MODEL_WEIGHT). */
  modelWeight: number;
  /** Which inputs produced modelMargin. */
  marginBasis: "scoring" | "record" | "market";
  /** De-vigged market probability that the home team wins. */
  marketHomeWinProb: number;
  /** Book margin on the moneyline (0 when unavailable). */
  vig: number;
  /** Games played by the less-established team (drives shrinkage). */
  sampleGames: number;

  // --- totals ---
  /** Posted total (null when the feed carries none). */
  marketTotal: number | null;
  /** Our projected total from scoring rates (null without scoring data). */
  modelTotal: number | null;
  /** Blended total used for over/under legs. */
  blendedTotal: number | null;
  totalWeight: number;
  /** Per-game scoring rates behind modelTotal, for the rationale text. */
  scoring?: {
    homeFor: number;
    homeAgainst: number;
    awayFor: number;
    awayAgainst: number;
    projHome: number;
    projAway: number;
  };

  movement?: LineMovement;

  /** Margin units applied for schedule asymmetry (positive favours home). */
  restEdge: number;
  restNote?: string;
}

/** Projected points for each side from season scoring rates. */
function projectScores(home: TeamScoring, away: TeamScoring, homeEdge: number) {
  // A team's expected output is the midpoint of what it scores and what the
  // opponent concedes. Crude, but it is the standard first-order estimate and
  // it is the only way to get a totals opinion out of this feed.
  const projHome = (home.pointsForPerGame + away.pointsAgainstPerGame) / 2;
  const projAway = (away.pointsForPerGame + home.pointsAgainstPerGame) / 2;
  return {
    projHome: projHome + homeEdge / 2,
    projAway: projAway - homeEdge / 2,
  };
}

export function buildGameModel(
  game: Game,
  odds: MarketOdds,
  scoring: Record<string, TeamScoring> = {},
  rest: Record<string, TeamRest> = {},
): GameModel | null {
  const lm = LEAGUE_MODEL[game.league];
  if (!lm) return null;
  const { marginSigma: sigma, totalSigma } = lm;

  // --- market view -------------------------------------------------
  let marketHomeWinProb = 0.5;
  let vig = 0;
  if (odds.homeMoneyline != null && odds.awayMoneyline != null) {
    const rawHome = impliedProbability(americanToDecimal(odds.homeMoneyline));
    const rawAway = impliedProbability(americanToDecimal(odds.awayMoneyline));
    const dv = removeVig([rawHome, rawAway]);
    marketHomeWinProb = dv.fair[0];
    vig = dv.vig;
  }

  // The posted spread IS the market's projected margin — prefer it when
  // present; otherwise invert the de-vigged moneyline through the margin model.
  const marketMargin =
    odds.spread != null && Number.isFinite(odds.spread)
      ? -odds.spread // stored as the HOME spread (negative = home favoured)
      : sigma * normalQuantile(clamp(marketHomeWinProb, 0.01, 0.99));

  // --- our view ----------------------------------------------------
  const homeRec = parseRecord(game.home.record);
  const awayRec = parseRecord(game.away.record);
  const homeScore = scoring[`${game.league}:${game.home.id}`];
  const awayScore = scoring[`${game.league}:${game.away.id}`];

  let modelMargin: number | null = null;
  let marginBasis: GameModel["marginBasis"] = "market";
  let sampleGames = 0;
  let maxWeight = 0;
  let scoringDetail: GameModel["scoring"];
  let modelTotal: number | null = null;

  const haveScoring =
    homeScore != null &&
    awayScore != null &&
    homeScore.gamesPlayed >= 3 &&
    awayScore.gamesPlayed >= 3;

  if (haveScoring) {
    // Points for/against beats win% on both counts: it separates teams with
    // identical records, and it is the only input that yields a total.
    sampleGames = Math.min(homeScore.gamesPlayed, awayScore.gamesPlayed);
    const { projHome, projAway } = projectScores(
      homeScore,
      awayScore,
      lm.homeEdge,
    );
    modelMargin = projHome - projAway;
    modelTotal = projHome + projAway;
    marginBasis = "scoring";
    maxWeight = MAX_MODEL_WEIGHT;
    scoringDetail = {
      homeFor: homeScore.pointsForPerGame,
      homeAgainst: homeScore.pointsAgainstPerGame,
      awayFor: awayScore.pointsForPerGame,
      awayAgainst: awayScore.pointsAgainstPerGame,
      projHome,
      projAway,
    };
  } else if (homeRec && awayRec) {
    sampleGames = Math.min(homeRec.games, awayRec.games);
    const neutralHomeWin = log5(homeRec.winPct, awayRec.winPct);
    modelMargin =
      sigma * normalQuantile(clamp(neutralHomeWin, 0.02, 0.98)) + lm.homeEdge;
    marginBasis = "record";
    maxWeight = MAX_RECORD_WEIGHT;
  }

  // --- rest / back-to-backs ----------------------------------------
  // Applied inside OUR projection, not on top of the blend: the market knows
  // the schedule too, so this is an input to our vote, not a bonus edge.
  const penalty = BACK_TO_BACK_PENALTY[game.league] ?? 0;
  const homeRest = rest[`${game.league}:${game.home.id}`];
  const awayRest = rest[`${game.league}:${game.away.id}`];
  const isB2B = (r?: TeamRest) => r != null && r.daysSinceLastGame === 1;
  const homeB2B = isB2B(homeRest);
  const awayB2B = isB2B(awayRest);
  // Only the ASYMMETRY matters — both teams tired cancels out.
  const restEdge =
    penalty === 0 ? 0 : (awayB2B ? penalty : 0) - (homeB2B ? penalty : 0);
  if (modelMargin !== null && restEdge !== 0) modelMargin += restEdge;

  // --- blend with shrinkage ---------------------------------------
  const shrink = sampleGames / (sampleGames + lm.priorGames);
  const modelWeight = modelMargin === null ? 0 : maxWeight * shrink;
  const blendedMargin =
    modelMargin === null
      ? marketMargin
      : modelWeight * modelMargin + (1 - modelWeight) * marketMargin;

  const marketTotal =
    odds.total != null && Number.isFinite(odds.total) ? odds.total : null;
  const totalWeight =
    modelTotal === null || marketTotal === null ? 0 : MAX_TOTAL_WEIGHT * shrink;
  const blendedTotal =
    marketTotal === null
      ? modelTotal
      : modelTotal === null
        ? marketTotal
        : totalWeight * modelTotal + (1 - totalWeight) * marketTotal;

  return {
    league: game.league,
    sigma,
    totalSigma,
    marketMargin,
    modelMargin,
    blendedMargin,
    modelWeight,
    marginBasis,
    marketHomeWinProb,
    vig,
    sampleGames,
    marketTotal,
    modelTotal:
      modelTotal === null ? null : Number(modelTotal.toFixed(2)),
    blendedTotal:
      blendedTotal === null ? null : Number(blendedTotal.toFixed(2)),
    totalWeight,
    scoring: scoringDetail,
    movement: odds.movement,
    restEdge: Number(restEdge.toFixed(2)),
    restNote:
      homeB2B && awayB2B
        ? "both teams on a back-to-back"
        : homeB2B
          ? `${game.home.abbreviation} on a back-to-back`
          : awayB2B
            ? `${game.away.abbreviation} on a back-to-back`
            : undefined,
  };
}

/** P(home margin > threshold) under the model. */
function pHomeMarginAbove(gm: GameModel, threshold: number): number {
  return clamp(normalCdf((gm.blendedMargin - threshold) / gm.sigma), 0.01, 0.99);
}

/** P(combined total > line) under the model. */
function pTotalAbove(gm: GameModel, line: number): number {
  if (gm.blendedTotal === null) return 0.5;
  return clamp(
    normalCdf((gm.blendedTotal - line) / gm.totalSigma),
    0.01,
    0.99,
  );
}

/* ------------------------------------------------------------------ *
 * 5b. Line movement
 * ------------------------------------------------------------------ *
 * Deliberately NOT used to shift probabilities. The current price already
 * embeds every bet that moved it, so adding movement on top would double-count
 * it. What movement genuinely tells us is whether our disagreement with the
 * market is being corroborated or contradicted: if we like the home side and
 * the line has moved toward home since open, sharp money agrees with us; if it
 * moved away, our read is more likely stale. That is a statement about how
 * much to TRUST the estimate, so it feeds confidence only.
 */

export interface MovementRead {
  /** -1 (market moved hard against this side) .. +1 (moved hard toward it). */
  agreement: number;
  /** Human-readable summary of the move. */
  label: string;
}

export function readMovement(
  gm: GameModel,
  meta: LegModelMeta,
): MovementRead | null {
  const mv: LineMovement | undefined = gm.movement;
  if (!mv) return null;

  if (meta.kind === "total") {
    if (mv.totalDelta == null || mv.totalDelta === 0) return null;
    // A move of ~12% of a total's SD is treated as full confirmation.
    const toward = meta.side === "under" ? -mv.totalDelta : mv.totalDelta;
    const scale = 0.12 * gm.totalSigma;
    return {
      agreement: clamp(toward / scale, -1, 1),
      label: `total ${mv.openTotal} → ${mv.currentTotal}`,
    };
  }

  // Margin legs: prefer the spread move (less noisy than a moneyline pair).
  if (mv.spreadDelta != null && mv.spreadDelta !== 0) {
    // Home spread falling (e.g. -3 -> -4.5) means money came in on home.
    const towardHome = -mv.spreadDelta;
    const toward = meta.side === "home" ? towardHome : -towardHome;
    const scale = 0.12 * gm.sigma;
    return {
      agreement: clamp(toward / scale, -1, 1),
      label: `spread ${mv.openSpread} → ${mv.currentSpread}`,
    };
  }

  if (mv.homeProbDelta != null && Math.abs(mv.homeProbDelta) > 0.002) {
    const toward =
      meta.side === "home" ? mv.homeProbDelta : -mv.homeProbDelta;
    return {
      agreement: clamp(toward / 0.03, -1, 1),
      label: `home price ${mv.homeProbDelta > 0 ? "+" : ""}${(mv.homeProbDelta * 100).toFixed(1)}pp`,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * 6. Confidence — how much we trust THIS estimate (not how likely it is)
 * ------------------------------------------------------------------ */

export type ConfidenceFactor = SgpConfidenceFactor;

export interface ConfidenceResult {
  score: number; // 0..1
  level: Confidence;
  factors: ConfidenceFactor[];
}

/**
 * Confidence reflects the RELIABILITY of the estimate, combining:
 *  - sample size behind the record prior,
 *  - how far our model strays from an efficient market (big gaps usually mean
 *    bad inputs, not free money),
 *  - the price quality (high vig = a worse, noisier market),
 *  - whether sharp money has moved the line toward or away from our side,
 *  - whether we actually model this market at all.
 */
export function computeConfidence(opts: {
  sampleGames: number;
  priorGames: number;
  modelProb: number;
  marketProb: number;
  vig: number;
  isModelled: boolean;
  movement?: MovementRead | null;
  basis?: GameModel["marginBasis"];
}): ConfidenceResult {
  const {
    sampleGames,
    priorGames,
    modelProb,
    marketProb,
    vig,
    isModelled,
    movement,
    basis,
  } = opts;

  const sample = clamp(sampleGames / (sampleGames + priorGames), 0, 1);
  const divergence = Math.abs(modelProb - marketProb);
  // 0 divergence -> 1.0 ; 15pp divergence -> ~0.0
  const agreement = clamp(1 - divergence / 0.15, 0, 1);
  // 2% hold -> ~1.0 ; 10% hold -> ~0.0
  const priceQuality = clamp(1 - (vig - 0.02) / 0.08, 0, 1);
  // Unknown movement is neutral (0.5), not a penalty.
  const confirmation =
    movement == null ? 0.5 : clamp((movement.agreement + 1) / 2, 0, 1);

  const base =
    0.32 * sample +
    0.24 * agreement +
    0.24 * priceQuality +
    0.2 * confirmation;
  // An unmodelled market scores perfect "agreement" only because the model IS
  // the market — that must never read as confidence, so gate it hard.
  const score = clamp(isModelled ? base : Math.min(base * 0.35, 0.3), 0, 1);

  const level: Confidence = score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low";

  return {
    score: Number(score.toFixed(3)),
    level,
    factors: [
      {
        label: "Sample size",
        value: Number(sample.toFixed(2)),
        note:
          basis === "scoring"
            ? `${sampleGames} games of scoring data behind the projection`
            : `${sampleGames} games of record behind the prior`,
      },
      {
        label: "Market agreement",
        value: Number(agreement.toFixed(2)),
        note: `model differs from market by ${(divergence * 100).toFixed(1)}pp`,
      },
      {
        label: "Price quality",
        value: Number(priceQuality.toFixed(2)),
        note: `book margin ${(vig * 100).toFixed(1)}%`,
      },
      {
        label: "Line movement",
        value: Number(confirmation.toFixed(2)),
        note:
          movement == null
            ? "no opening price in the feed to compare against"
            : movement.agreement > 0.15
              ? `sharp money agrees — ${movement.label}`
              : movement.agreement < -0.15
                ? `market moved against this side — ${movement.label}`
                : `barely moved — ${movement.label}`,
      },
      {
        label: "Market coverage",
        value: isModelled ? 1 : 0,
        note: isModelled
          ? "this market is modelled"
          : "no directional model for this market — confidence capped",
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 7. Leg construction
 * ------------------------------------------------------------------ */

/** Everything needed to compute exact same-game correlation later. */
export type LegModelMeta = SgpLegModelMeta;

interface LegInput {
  id: string;
  game: Game;
  gm: GameModel;
  market: string;
  selection: string;
  americanOdds: number;
  modelProb: number;
  marketProb: number;
  isModelled: boolean;
  rationale: string;
  stats: { label: string; value: string }[];
  reference: { label: string; url: string };
  meta: LegModelMeta;
}

function makeLeg(input: LegInput): SgpLeg {
  const decimal = americanToDecimal(input.americanOdds);
  const rawImplied = impliedProbability(decimal);
  const edge = input.modelProb - rawImplied;
  const movement = readMovement(input.gm, input.meta);
  const conf = computeConfidence({
    sampleGames: input.gm.sampleGames,
    priorGames: LEAGUE_MODEL[input.game.league].priorGames,
    modelProb: input.modelProb,
    marketProb: input.marketProb,
    vig: input.gm.vig,
    isModelled: input.isModelled,
    movement,
    basis: input.gm.marginBasis,
  });
  // Movement is surfaced as a header chip and a confidence factor, so it
  // deliberately doesn't get a third copy in the stat chips.
  const stats =
    input.gm.restNote && input.gm.restEdge !== 0
      ? [
          ...input.stats,
          {
            label: "Rest",
            value: `${input.gm.restNote} (${input.gm.restEdge > 0 ? "+" : ""}${input.gm.restEdge} ${LEAGUE_MODEL[input.game.league].unit} to home)`,
          },
        ]
      : input.gm.restNote
        ? [...input.stats, { label: "Rest", value: input.gm.restNote }]
        : input.stats;

  return {
    id: input.id,
    gameId: input.game.id,
    league: input.game.league,
    matchup: `${input.game.away.abbreviation} @ ${input.game.home.abbreviation}`,
    market: input.market,
    selection: input.selection,
    americanOdds: input.americanOdds,
    modelProbability: Number(input.modelProb.toFixed(4)),
    marketProbability: Number(input.marketProb.toFixed(4)),
    breakEvenProbability: Number(rawImplied.toFixed(4)),
    fairAmericanOdds: fairAmericanOdds(input.modelProb),
    edge: Number(edge.toFixed(4)),
    expectedValue: Number(expectedValue(input.modelProb, decimal).toFixed(4)),
    kellyFraction: Number(kellyFraction(input.modelProb, decimal).toFixed(4)),
    confidence: conf.level,
    confidenceScore: conf.score,
    confidenceFactors: conf.factors,
    rationale: input.rationale,
    supportingStats: stats,
    references: [input.reference],
    modelMeta: input.meta,
  };
}

/**
 * Turn upcoming games with real odds into research legs.
 *
 * For each game we build one margin distribution (see buildGameModel) and read
 * every market off it, so moneyline and spread can never contradict each other.
 * Both sides of each market are evaluated and the better-value side is kept —
 * the old version always took the favourite, which ignored underdog value.
 */
export function legsFromGames(
  games: Game[],
  odds: MarketOdds[],
  gameLinks: Record<string, string> = {},
  scoring: Record<string, TeamScoring> = {},
  rest: Record<string, TeamRest> = {},
): SgpLeg[] {
  const oddsByGame = new Map(odds.map((o) => [o.gameId, o]));
  const legs: SgpLeg[] = [];

  for (const g of games) {
    if (g.status === "final") continue;
    const o = oddsByGame.get(g.id);
    if (!o) continue;
    const gm = buildGameModel(g, o, scoring, rest);
    if (!gm) continue;

    const lm = LEAGUE_MODEL[g.league];
    const ref = gameLinks[g.id]
      ? { label: "ESPN — Game preview & odds", url: gameLinks[g.id] }
      : { label: "ESPN — Scoreboard", url: "https://www.espn.com/" };

    const marginStat = {
      label: "Proj. margin",
      value: `${gm.blendedMargin > 0 ? g.home.abbreviation : g.away.abbreviation} by ${Math.abs(gm.blendedMargin).toFixed(1)} ${lm.unit}`,
    };
    const weightStat = {
      label: "Model weight",
      value: `${(gm.modelWeight * 100).toFixed(0)}%`,
    };
    const basisStat = {
      label: "Basis",
      value:
        gm.marginBasis === "scoring"
          ? `scoring rates · ${gm.sampleGames} games`
          : gm.marginBasis === "record"
            ? `season record · ${gm.sampleGames} games`
            : "market only",
    };

    // ---- Moneyline: evaluate BOTH sides, keep the better value ----
    if (o.homeMoneyline != null && o.awayMoneyline != null) {
      const pHome = pHomeMarginAbove(gm, 0);
      const sides = [
        {
          team: g.home,
          opp: g.away,
          isHome: true,
          american: o.homeMoneyline,
          model: pHome,
          market: gm.marketHomeWinProb,
        },
        {
          team: g.away,
          opp: g.home,
          isHome: false,
          american: o.awayMoneyline,
          model: 1 - pHome,
          market: 1 - gm.marketHomeWinProb,
        },
      ];
      const best = sides.reduce((a, b) =>
        b.model - impliedProbability(americanToDecimal(b.american)) >
        a.model - impliedProbability(americanToDecimal(a.american))
          ? b
          : a,
      );
      legs.push(
        makeLeg({
          id: `${g.id}-ml`,
          game: g,
          gm,
          market: "Moneyline",
          selection: `${best.team.name} ML`,
          americanOdds: best.american,
          modelProb: best.model,
          marketProb: best.market,
          isModelled: true,
          rationale:
            `Model projects ${marginStat.value}. That puts ${best.team.name} at ` +
            `${(best.model * 100).toFixed(1)}% to win outright versus a de-vigged market price of ` +
            `${(best.market * 100).toFixed(1)}%. Records: ${g.home.abbreviation} ${g.home.record ?? "N/A"}, ` +
            `${g.away.abbreviation} ${g.away.record ?? "N/A"}.`,
          stats: [
            { label: "Price", value: formatOdds(best.american) },
            { label: "Model", value: `${(best.model * 100).toFixed(1)}%` },
            { label: "Market (no vig)", value: `${(best.market * 100).toFixed(1)}%` },
            marginStat,
            weightStat,
            basisStat,
          ],
          reference: ref,
          meta: {
            kind: "margin",
            side: best.isHome ? "home" : "away",
            threshold: 0,
            blendedMargin: gm.blendedMargin,
            sigma: gm.sigma,
          },
        }),
      );
    }

    // ---- Spread: P(cover) straight off the margin distribution ----
    // Only assume the standard -110 price for true point-spread sports. NHL
    // puck lines and MLB run lines are fixed at ±1.5 and priced like a
    // moneyline (often -200/+170), so defaulting them to -110 would invent a
    // large fake edge. Without a real price we skip the leg.
    const spreadPriced =
      (o.spreadHomeOdds != null && o.spreadAwayOdds != null) ||
      STANDARD_SPREAD_LEAGUES.has(g.league);
    if (o.spread != null && Number.isFinite(o.spread) && spreadPriced) {
      const homeLine = o.spread; // e.g. -4.5 => home must win by >4.5
      const pHomeCover = pHomeMarginAbove(gm, -homeLine);
      const priceHome = o.spreadHomeOdds ?? -110;
      const priceAway = o.spreadAwayOdds ?? -110;
      const sides = [
        {
          team: g.home,
          isHome: true,
          line: homeLine,
          american: priceHome,
          model: pHomeCover,
          threshold: -homeLine,
        },
        {
          team: g.away,
          isHome: false,
          line: -homeLine,
          american: priceAway,
          model: 1 - pHomeCover,
          threshold: homeLine,
        },
      ];
      const best = sides.reduce((a, b) =>
        b.model - impliedProbability(americanToDecimal(b.american)) >
        a.model - impliedProbability(americanToDecimal(a.american))
          ? b
          : a,
      );
      const lineStr = `${best.line > 0 ? "+" : ""}${best.line}`;
      // de-vigged market view of a spread is ~50/50 by construction
      const rawPair = removeVig([
        impliedProbability(americanToDecimal(priceHome)),
        impliedProbability(americanToDecimal(priceAway)),
      ]);
      const marketProb = best.isHome ? rawPair.fair[0] : rawPair.fair[1];

      legs.push(
        makeLeg({
          id: `${g.id}-spread`,
          game: g,
          gm,
          market: "Spread",
          selection: `${best.team.name} ${lineStr}`,
          americanOdds: best.american,
          modelProb: best.model,
          marketProb,
          isModelled: true,
          rationale:
            `The market line implies a ${Math.abs(gm.marketMargin).toFixed(1)}-${lm.unit} margin; ` +
            `our blended projection is ${Math.abs(gm.blendedMargin).toFixed(1)}. ` +
            `Against ${lineStr}, that gives ${best.team.name} a ${(best.model * 100).toFixed(1)}% cover probability.`,
          stats: [
            { label: "Line", value: `${best.team.abbreviation} ${lineStr}` },
            { label: "Price", value: formatOdds(best.american) },
            { label: "Model cover", value: `${(best.model * 100).toFixed(1)}%` },
            marginStat,
            weightStat,
            basisStat,
          ],
          reference: ref,
          meta: {
            kind: "margin",
            side: best.isHome ? "home" : "away",
            threshold: best.threshold,
            blendedMargin: gm.blendedMargin,
            sigma: gm.sigma,
          },
        }),
      );
    }

    // ---- Total: a real projection when scoring rates are available ----
    if (gm.marketTotal != null) {
      const line = gm.marketTotal;
      const priceOver = o.overOdds ?? -110;
      const priceUnder = o.underOdds ?? -110;
      const dv = removeVig([
        impliedProbability(americanToDecimal(priceOver)),
        impliedProbability(americanToDecimal(priceUnder)),
      ]);
      const modelled = gm.modelTotal != null;
      const pOver = modelled ? pTotalAbove(gm, line) : dv.fair[0];

      const sides = [
        {
          side: "over" as const,
          selection: `Over ${line}`,
          american: priceOver,
          model: pOver,
          market: dv.fair[0],
        },
        {
          side: "under" as const,
          selection: `Under ${line}`,
          american: priceUnder,
          model: 1 - pOver,
          market: dv.fair[1],
        },
      ];
      // With no scoring data both sides are market-priced, so this reduces to
      // the over — which is exactly the old, honestly-neutral behaviour.
      const best = sides.reduce((a, b) =>
        b.model - impliedProbability(americanToDecimal(b.american)) >
        a.model - impliedProbability(americanToDecimal(a.american))
          ? b
          : a,
      );

      const sc = gm.scoring;
      legs.push(
        makeLeg({
          id: `${g.id}-total`,
          game: g,
          gm,
          market: "Total",
          selection: best.selection,
          americanOdds: best.american,
          modelProb: best.model,
          marketProb: best.market,
          isModelled: modelled,
          rationale: modelled
            ? `Scoring rates project ${gm.scoring?.projHome.toFixed(1)} for ${g.home.abbreviation} and ` +
              `${gm.scoring?.projAway.toFixed(1)} for ${g.away.abbreviation}: a ${gm.modelTotal?.toFixed(1)}-${lm.unit} total ` +
              `against a posted ${line}. Shrunk ${Math.round(gm.totalWeight * 100)}% toward our projection, the blended ` +
              `total is ${gm.blendedTotal?.toFixed(1)}, giving ${best.selection} a ${(best.model * 100).toFixed(1)}% chance ` +
              `versus a de-vigged market price of ${(best.market * 100).toFixed(1)}%.`
            : `Posted total is ${line}. No scoring data is available for these teams from this feed, so ` +
              `no directional model is applied — this leg is priced at the market and carries ` +
              `negative expected value equal to the book's margin. Shown for completeness.`,
          stats: modelled
            ? [
                { label: "Total", value: String(line) },
                { label: "Price", value: formatOdds(best.american) },
                { label: "Proj. total", value: `${gm.modelTotal?.toFixed(1)}` },
                {
                  label: "Blended",
                  value: `${gm.blendedTotal?.toFixed(1)} ${lm.unit}`,
                },
                {
                  label: "Scoring",
                  value: sc
                    ? `${g.home.abbreviation} ${sc.homeFor.toFixed(1)}/${sc.homeAgainst.toFixed(1)} · ${g.away.abbreviation} ${sc.awayFor.toFixed(1)}/${sc.awayAgainst.toFixed(1)}`
                    : "—",
                },
                {
                  label: "Model",
                  value: `${(best.model * 100).toFixed(1)}%`,
                },
              ]
            : [
                { label: "Total", value: String(line) },
                { label: "Price", value: formatOdds(best.american) },
                { label: "Model", value: "market-neutral" },
              ],
          reference: ref,
          meta: {
            kind: "total",
            side: best.side,
            totalLine: line,
            // Only carry curve data when we actually projected a total. An
            // unmodelled leg would otherwise draw a bell centred exactly on
            // the line, implying modelling that didn't happen.
            totalMean: modelled ? (gm.blendedTotal ?? undefined) : undefined,
            totalSigma: modelled ? gm.totalSigma : undefined,
          },
        }),
      );
    }
  }

  return legs;
}

/* ------------------------------------------------------------------ *
 * 8. Correlation — the honest joint probability of a slip
 * ------------------------------------------------------------------ */

/**
 * True probability that every leg wins.
 *
 * Legs from DIFFERENT games are independent, so they multiply. Legs from the
 * SAME game are not: "Team A ML" and "Team A -4.5" are nested events, and
 * multiplying them understates the joint probability badly. Because every
 * margin leg is a threshold on the same normal margin, the exact joint is the
 * probability that the margin lands in the intersection of those thresholds.
 */
export function jointProbability(legs: SgpLeg[]): number {
  const byGame = new Map<string, SgpLeg[]>();
  for (const leg of legs) {
    const list = byGame.get(leg.gameId) ?? [];
    list.push(leg);
    byGame.set(leg.gameId, list);
  }

  let joint = 1;
  for (const group of byGame.values()) {
    const marginLegs = group.filter(
      (l) => l.modelMeta?.kind === "margin" && l.modelMeta.sigma != null,
    );
    const otherLegs = group.filter((l) => l.modelMeta?.kind !== "margin");

    if (marginLegs.length > 0) {
      const meta = marginLegs[0].modelMeta!;
      const m = meta.blendedMargin ?? 0;
      const sigma = meta.sigma ?? 1;
      // Convert every constraint into bounds on the HOME margin.
      let lower = -Infinity;
      let upper = Infinity;
      for (const leg of marginLegs) {
        const mm = leg.modelMeta!;
        const t = mm.threshold ?? 0;
        if (mm.side === "home") lower = Math.max(lower, t);
        else upper = Math.min(upper, -t);
      }
      const pUpper = upper === Infinity ? 1 : normalCdf((upper - m) / sigma);
      const pLower = lower === -Infinity ? 0 : normalCdf((lower - m) / sigma);
      joint *= clamp(pUpper - pLower, 0.0001, 0.9999);
    }

    // totals are treated as independent of the margin within a game
    for (const leg of otherLegs) joint *= leg.modelProbability;
  }

  return joint;
}

/** True when a slip contains more than one leg from the same game. */
export function hasCorrelatedLegs(legs: SgpLeg[]): boolean {
  const seen = new Set<string>();
  for (const l of legs) {
    if (seen.has(l.gameId)) return true;
    seen.add(l.gameId);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 9. Payout + slip assembly
 * ------------------------------------------------------------------ */

export interface PayoutBreakdown {
  stake: number;
  decimalOdds: number;
  americanOdds: number;
  payout: number;
  profit: number;
  /** Break-even probability implied by the combined price. */
  impliedProbability: number;
  /** Our correlation-adjusted probability that the slip wins. */
  modelProbability: number;
  /** Naive product of leg probabilities (ignores same-game correlation). */
  naiveProbability: number;
  /** Expected profit/loss on this stake. */
  expectedValue: number;
  correlated: boolean;
}

export function calculatePayout(
  stake: number,
  legs: SgpLeg[],
): PayoutBreakdown {
  const decimalOdds = combineLegs(legs);
  const payout = stake * decimalOdds;
  const adjusted = jointProbability(legs);
  const naive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  return {
    stake,
    decimalOdds: Number(decimalOdds.toFixed(2)),
    americanOdds: decimalToAmerican(decimalOdds),
    payout: Number(payout.toFixed(2)),
    profit: Number((payout - stake).toFixed(2)),
    impliedProbability: Number(impliedProbability(decimalOdds).toFixed(4)),
    modelProbability: Number(adjusted.toFixed(4)),
    naiveProbability: Number(naive.toFixed(4)),
    expectedValue: Number(
      (stake * expectedValue(adjusted, decimalOdds)).toFixed(2),
    ),
    correlated: hasCorrelatedLegs(legs),
  };
}

/** Edge of a single leg: model probability minus the break-even price. */
export function legEdge(leg: SgpLeg): number {
  if (typeof leg.edge === "number") return leg.edge;
  const implied = impliedProbability(americanToDecimal(leg.americanOdds));
  return Number((leg.modelProbability - implied).toFixed(4));
}

/** Rank score: edge, discounted by how much we trust the estimate. */
function legScore(leg: SgpLeg): number {
  return legEdge(leg) * (0.4 + 0.6 * (leg.confidenceScore ?? 0.5));
}

/**
 * Assemble the research slip.
 *
 * Legs are ranked by confidence-weighted edge and diversified across games
 * (one per game by default) so the independence assumption behind the combined
 * price actually holds. Same-game legs are only pulled in to reach the minimum
 * length, and the slip is flagged when that happens.
 */
export function buildRecommendation(
  candidates: SgpLeg[],
  minLegs = 6,
  cap = 10,
  maxPerGame = 1,
): SgpRecommendation {
  const ranked = [...candidates].sort((a, b) => legScore(b) - legScore(a));
  const perGame = new Map<string, number>();
  const legs: SgpLeg[] = [];

  // Pass 1 — one leg per game, so the independence behind the combined price
  // actually holds. Take as many as we can up to the cap.
  for (const leg of ranked) {
    if (legs.length >= cap) break;
    const used = perGame.get(leg.gameId) ?? 0;
    if (used >= maxPerGame) continue;
    perGame.set(leg.gameId, used + 1);
    legs.push(leg);
  }

  // Pass 2 — only to reach the minimum slip length when there simply aren't
  // enough games. Stop at minLegs rather than padding with correlated legs.
  const taken = new Set(legs.map((l) => l.id));
  for (const leg of ranked) {
    if (legs.length >= minLegs) break;
    if (taken.has(leg.id)) continue;
    taken.add(leg.id);
    legs.push(leg);
  }

  const combinedDecimalOdds = combineLegs(legs);
  const adjusted = jointProbability(legs);
  const naive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  const correlated = hasCorrelatedLegs(legs);

  const basisCounts = legs.reduce<Record<string, number>>((acc, l) => {
    const b = l.supportingStats.find((s) => s.label === "Basis")?.value ?? "";
    const key = b.startsWith("scoring")
      ? "scoring"
      : b.startsWith("season")
        ? "record"
        : "market";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const withMovement = legs.filter((l) => {
    const f = l.confidenceFactors.find((c) => c.label === "Line movement");
    return f != null && f.value !== 0.5;
  }).length;
  const withRest = legs.filter((l) =>
    l.supportingStats.some((s) => s.label === "Rest"),
  ).length;

  // Always-visible account of what actually drove the slip, so the inputs
  // aren't hidden behind a collapsed explainer.
  const inputs: SgpRecommendation["inputs"] = [
    {
      label: "Scoring rates",
      detail: `${basisCounts.scoring ?? 0}/${legs.length} legs`,
    },
    { label: "Line movement", detail: `${withMovement}/${legs.length} legs` },
    { label: "Back-to-backs", detail: withRest > 0 ? `${withRest} legs` : "none today" },
    {
      label: "Market de-vigged",
      detail: `${legs.length}/${legs.length} legs`,
    },
  ];

  const notes: string[] = [
    `Model ${MODEL_VERSION}: one projected margin and one projected total per game, built from season points for/against (shrunk toward the de-vigged market by at most ${Math.round(MAX_MODEL_WEIGHT * 100)}% on the margin and ${Math.round(MAX_TOTAL_WEIGHT * 100)}% on the total). Games without scoring data fall back to a log5 record prior capped at ${Math.round(MAX_RECORD_WEIGHT * 100)}%.`,
    "Probabilities are compared against de-vigged market prices, so the book's margin is never counted as edge.",
    "Line movement since the market opened is reported and folded into confidence, but never into the probability: the current price already contains it, so adding it again would double-count the same information.",
    "Back-to-backs are read from the last two days of results and applied inside our projection (NBA/NCAAB ~1.5-1.8 pts, NHL ~0.2 goals), so a rested team is never credited twice.",
  ];
  if (basisCounts.scoring) {
    notes.push(
      `${basisCounts.scoring} of ${legs.length} legs are backed by scoring rates; ${basisCounts.record ?? 0} by season record alone and ${basisCounts.market ?? 0} by the market only.`,
    );
  }
  const ev = expectedValue(adjusted, combinedDecimalOdds);
  if (correlated) {
    notes.push(
      "This slip contains multiple legs from the same game. Those outcomes are correlated, so the true win probability is higher than the naive product — and a sportsbook would price a real same-game parlay well below the combined odds shown.",
    );
    if (ev > 0) {
      notes.push(
        "Heads up: the positive expected value above is an artifact of pricing correlated legs as if they were independent. That price is not obtainable — treat it as a demonstration of why correlation matters, not as a betting edge.",
      );
    }
  }
  if (legs.every((l) => legEdge(l) <= 0)) {
    notes.push(
      "No leg currently shows positive expected value: efficient markets plus the book's margin usually leave every side negative-EV. The slip is ranked least-bad first.",
    );
  }

  return {
    id: `sgp-${legs.map((l) => l.id).join("-").slice(0, 40)}`,
    title: `${legs.length}-Leg ${correlated ? "Same-Game" : "Cross-Game"} Research Slip`,
    legs,
    combinedDecimalOdds: Number(combinedDecimalOdds.toFixed(2)),
    combinedAmericanOdds: decimalToAmerican(combinedDecimalOdds),
    impliedProbability: Number(
      impliedProbability(combinedDecimalOdds).toFixed(4),
    ),
    modelProbability: Number(adjusted.toFixed(4)),
    naiveProbability: Number(naive.toFixed(4)),
    fairAmericanOdds: fairAmericanOdds(adjusted),
    expectedValue: Number(
      expectedValue(adjusted, combinedDecimalOdds).toFixed(4),
    ),
    correlated,
    /** EV is only meaningful when the combined price is actually obtainable. */
    expectedValueIsTheoretical: correlated,
    modelVersion: MODEL_VERSION,
    inputs,
    notes,
    disclaimer: SGP_DISCLAIMER,
  };
}
