import type {
  Confidence,
  Game,
  GameWeather,
  League,
  LineMovement,
  Justification,
  MarketOdds,
  ProbablePitcher,
  RiskFlag,
  TeamInjuryReport,
  TeamRating,
  TeamSchedule,
  TeamScoring,
  SgpConfidenceFactor,
  SgpLeg,
  SgpLegModelMeta,
  SgpRecommendation,
} from "@/types";
import { formatOdds } from "@/lib/format";
import { RATING_PARAMS } from "@/lib/ratings";
import {
  buildGameConsensus,
  UNKNOWN_FAIR_SE,
  type ConsensusSide,
} from "@/lib/market";
import {
  findArbitrage,
  findMiddles,
  findStaleBooks,
  type MarketOpportunities,
} from "@/lib/arbitrage";
import {
  distanceKm,
  parkFactor,
  teamCity,
  timeZonesCrossed,
} from "@/lib/venues";
import {
  buildScoreGrid,
  gridMarginDist,
  gridRegionProbability,
  gridTotalDist,
  lineProbability,
  normalCdf,
  usesCountModel,
  type DiscreteDist,
  type RegionConstraints,
  type ScoreGrid,
} from "@/lib/distributions";

export { normalCdf };

export const SGP_DISCLAIMER =
  "For informational and educational purposes only. This is not betting or " +
  "financial advice and does not guarantee any outcome. Odds and stats are " +
  "illustrative. Must be 21+ (or legal age in your jurisdiction). If you or " +
  "someone you know has a gambling problem, call 1-800-GAMBLER.";

export const MODEL_VERSION = "cells-v17";

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

/**
 * Shin's method for removing the bookmaker's margin.
 *
 * Proportional normalization (`removeVig`) strips the same *relative* margin
 * from every outcome. Books don't price that way: they load more margin onto
 * longshots, which is the favourite-longshot bias. So proportional de-vigging
 * systematically overstates a longshot's fair probability and understates a
 * heavy favourite's — and since we compare our model against these numbers to
 * compute edge, that bias becomes phantom edge on exactly the heavy-favourite
 * moneylines a parlay is built from.
 *
 * Shin models the margin as the book protecting itself against a share `z` of
 * informed money, which gives
 *
 *     p_i = [sqrt(z^2 + 4(1-z) * pi_i^2 / S) - z] / (2(1-z))
 *
 * where `pi_i` are the raw implied probabilities and `S` their sum. We solve
 * for the `z` that makes the fair probabilities sum to 1 by bisection, which
 * is simple, always converges on this monotone function, and generalizes past
 * two outcomes.
 */
export function removeVigShin(rawImplied: number[]): {
  fair: number[];
  vig: number;
  /** Estimated share of informed money. 0 reduces to proportional. */
  z: number;
} {
  const S = rawImplied.reduce((a, b) => a + b, 0);
  if (S <= 0 || rawImplied.length < 2) {
    return { fair: rawImplied, vig: 0, z: 0 };
  }
  // No margin to remove (or a negative one) — nothing to do.
  if (S <= 1) return { fair: rawImplied.map((p) => p / S), vig: S - 1, z: 0 };

  const fairFor = (z: number) =>
    rawImplied.map((pi) => {
      const inner = z * z + (4 * (1 - z) * pi * pi) / S;
      return (Math.sqrt(Math.max(0, inner)) - z) / (2 * (1 - z));
    });

  // The sum falls monotonically in z (at z = 0 it is sqrt(S) > 1), so bisect
  // on the signed error to find the z that makes it exactly 1.
  let lo = 0;
  let hi = 0.5;
  let z = 0;
  for (let i = 0; i < 60; i++) {
    z = (lo + hi) / 2;
    const sum = fairFor(z).reduce((a, b) => a + b, 0);
    if (sum > 1) lo = z;
    else hi = z;
    if (Math.abs(sum - 1) < 1e-12) break;
  }

  const fair = fairFor(z);
  // Renormalize away the last of the bisection residual.
  const sum = fair.reduce((a, b) => a + b, 0);
  return {
    fair: sum > 0 ? fair.map((p) => p / sum) : fair,
    vig: S - 1,
    z: Number(z.toFixed(6)),
  };
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

/**
 * The rest of the schedule model, as multiples of the league's back-to-back
 * penalty — so a league where fatigue doesn't apply (football, which plays
 * weekly) gets zero for all of it automatically.
 *
 * Congestion is not binary. Three games in four nights is a worse spot than a
 * single back-to-back, and a long road trip or a cross-country flight is a
 * different cost again. Coarse, documented, capped assumptions.
 */
export const SCHEDULE_MODEL = {
  /** Extra penalty for a third game in four nights. */
  threeInFour: 0.45,
  /** Extra penalty for a fourth game in six nights. */
  fourInSix: 0.3,
  /** Bonus for arriving on three or more days of rest. */
  wellRested: 0.3,
  /** Penalty per 1000 km travelled since the last game. */
  travelPer1000Km: 0.25,
  /** Extra penalty per time zone crossed. */
  perTimeZone: 0.2,
  /** Penalty once a road trip reaches its fourth straight game. */
  longRoadTrip: 0.35,
  /** Hard cap on the whole asymmetry, in margin units. */
  capMultiple: 2.2,
} as const;

/**
 * Smallest share of a league's average per-side score that a team can
 * plausibly be projected for. No MLB team is projected under about a run, and
 * no NHL team under about a goal, however lopsided the matchup.
 */
export const MIN_SIDE_SCORE_SHARE = 0.25;

/**
 * How far the spread-implied and moneyline-implied win probabilities may
 * differ before we stop believing the spread. Two correctly-parsed market
 * signals agree within a few points; a gap this wide is far more likely to be
 * a parsing fault than a real market inconsistency.
 */
export const MAX_SIGNAL_DISAGREEMENT = 0.1;

/**
 * Above this probability a leg is not shown as a pick.
 *
 * Three reasons, all of them about the number being unusable rather than
 * merely large. The distribution's far tail is the part we can least validate
 * — it is set by an assumed shape, not by anything measured. The published
 * probability is clamped at 0.999, so a saturated leg reports a ceiling
 * rather than an estimate, and the expected-value and Kelly figures computed
 * from it are meaningless. And a market that agrees it is near-certain prices
 * it accordingly, so there was never anything to win there.
 *
 * A -45 college football favourite really does win about 99% of the time.
 * That is a fact about the game, not a betting opinion, and the slip is for
 * betting opinions.
 */
export const SATURATION_CEILING = 0.97;

/**
 * How many standard errors an edge must clear to count as a value leg.
 *
 * The books disagree with each other by some amount on every market. An
 * apparent edge smaller than that disagreement is not an edge — it is one
 * book's rounding sitting inside the spread of opinion, and acting on it is
 * acting on noise. Two standard errors is the conventional bar and it is the
 * difference between "a price exists that is better than fair" and "a price
 * exists that is better than our estimate of fair, by less than our estimate's
 * own error".
 */
export const MIN_EDGE_SIGNIFICANCE = 2;

/**
 * Projected scores for the count sports, derived from a projected total and
 * margin.
 *
 * The naive `(total ± margin)/2` is unconstrained: a large margin against a
 * normal total drives one side's projection toward zero, and a baseball team
 * projected for 0.185 runs produces a near-certainty that is an artifact of
 * the arithmetic rather than a view about the game. Worse, flooring the lambda
 * on its own silently breaks the identity `lambdaHome - lambdaAway = margin`
 * that the rest of the model relies on.
 *
 * So the MARGIN is what gets constrained, not the lambda. Both sides stay
 * above a plausible floor and the identity holds exactly.
 */
export function deriveLambdas(
  league: League,
  total: number,
  margin: number,
): { lambdaHome: number; lambdaAway: number; margin: number; clamped: boolean } {
  const lm = LEAGUE_MODEL[league];
  const safeTotal = Math.max(0.5, total);
  const floor = Math.max(
    0.1,
    (lm ? lm.avgTotal / 2 : safeTotal / 2) * MIN_SIDE_SCORE_SHARE,
  );
  // Keeping both sides above the floor caps how large the margin can be.
  const maxMargin = Math.max(0, safeTotal - 2 * floor);
  const constrained = clamp(margin, -maxMargin, maxMargin);

  return {
    lambdaHome: Number(((safeTotal + constrained) / 2).toFixed(3)),
    lambdaAway: Number(((safeTotal - constrained) / 2).toFixed(3)),
    margin: Number(constrained.toFixed(3)),
    clamped: Math.abs(constrained - margin) > 1e-6,
  };
}

/**
 * Invert a win probability into a projected margin, for the count sports.
 *
 * The normal quantile is the right inverse for a normal margin, but hockey and
 * baseball are priced on a Poisson difference, and the two don't round-trip:
 * inverting a -200 baseball moneyline through a normal and then pricing it
 * with a Skellam came back 6.4 points too high, a systematic bias on every
 * favourite. So invert the distribution we actually price with, numerically.
 *
 * Bisection on a monotone function — more scoring margin always means a higher
 * win probability — so it converges in a fixed number of cheap steps.
 */
export function marginFromWinProb(
  league: League,
  total: number,
  pHome: number,
): number {
  const target = clamp(pHome, 0.005, 0.995);
  const safeTotal = Math.max(0.5, total);
  const probAt = (margin: number) => {
    const d = deriveLambdas(league, safeTotal, margin);
    return gridMarginDist(
      buildScoreGrid({
        league,
        margin: d.margin,
        total: safeTotal,
        marginSd: LEAGUE_MODEL[league]?.marginSigma ?? 1,
        totalSd: LEAGUE_MODEL[league]?.totalSigma ?? 1,
        lambdaHome: d.lambdaHome,
        lambdaAway: d.lambdaAway,
      }),
    ).above(0);
  };

  let lo = -safeTotal;
  let hi = safeTotal;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (probAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return Number(((lo + hi) / 2).toFixed(3));
}

export interface ScheduleRead {
  /** Margin units favouring the home team. Negative favours the away team. */
  edge: number;
  /** What drove it, for display. Empty when nothing applied. */
  notes: string[];
}

/**
 * How much the schedule favours one side.
 *
 * Only the ASYMMETRY matters: both teams tired cancels out. Everything is
 * expressed as a fatigue cost per side and then subtracted, so the sign
 * convention can't drift.
 */
export function scheduleEdge(
  game: Game,
  schedule: Record<string, TeamSchedule>,
): ScheduleRead {
  const unit = BACK_TO_BACK_PENALTY[game.league] ?? 0;
  if (unit === 0) return { edge: 0, notes: [] };

  const S = SCHEDULE_MODEL;
  const notes: string[] = [];
  const venue = teamCity(game.league, game.home.abbreviation);

  const costFor = (
    team: Game["home"],
    label: string,
    isHomeTeam: boolean,
  ): number => {
    const s = schedule[`${game.league}:${team.id}`];
    if (!s) return 0;
    let cost = 0;

    if (s.daysSinceLastGame === 1) {
      cost += unit;
      notes.push(`${label} on a back-to-back`);
    } else if (s.daysSinceLastGame >= 3) {
      cost -= unit * S.wellRested;
      notes.push(`${label} on ${s.daysSinceLastGame} days' rest`);
    }

    if (s.gamesInLast4Days >= 3) {
      cost += unit * S.threeInFour;
      notes.push(`${label} 3-in-4`);
    }
    if (s.gamesInLast6Days >= 4) {
      cost += unit * S.fourInSix;
      notes.push(`${label} 4-in-6`);
    }

    // Travel only burdens the visiting side: the home team slept at home.
    if (!isHomeTeam && venue && s.lastVenueAbbr) {
      const origin = teamCity(game.league, s.lastVenueAbbr);
      if (origin) {
        const km = distanceKm(origin, venue);
        if (km > 500) {
          cost += unit * S.travelPer1000Km * (km / 1000);
          const tz = timeZonesCrossed(origin, venue);
          if (tz > 0) cost += unit * S.perTimeZone * tz;
          notes.push(
            `${label} travelled ${Math.round(km)} km${tz > 0 ? `, ${tz} time zone${tz === 1 ? "" : "s"}` : ""}`,
          );
        }
      }
    }

    // A long road trip is a burden in its own right and doesn't depend on
    // knowing where they flew from. Only charged to the visiting side: a team
    // whose last five games were away but who is now at home is coming home,
    // which is relief rather than cost.
    if (!isHomeTeam && s.consecutiveRoadGames >= 4) {
      cost += unit * S.longRoadTrip;
      notes.push(`${label} ${s.consecutiveRoadGames} straight on the road`);
    }

    return cost;
  };

  const homeCost = costFor(game.home, game.home.abbreviation, true);
  const awayCost = costFor(game.away, game.away.abbreviation, false);
  const cap = unit * S.capMultiple;

  return {
    edge: Number(clamp(awayCost - homeCost, -cap, cap).toFixed(2)),
    notes,
  };
}

/**
 * Weather's effect on the projected total, in the sport's own units.
 *
 * Coarse, documented, capped assumptions — the kind of constant that should be
 * re-fitted once CLV tracking has samples, not treated as measured truth. All
 * of it is applied inside OUR projection and shrunk with it: the market prices
 * weather too, just more slowly, so this is an input to our vote rather than
 * a bonus on top.
 *
 * Only the mean shifts we can actually justify are applied:
 *
 *  - **Wind suppresses football scoring.** The passing game degrades above a
 *    light breeze and the effect grows with speed.
 *  - **Cold suppresses football scoring**, mildly.
 *  - **Rain suppresses football scoring**, mildly.
 *  - **Heat raises baseball scoring**, mildly — the ball carries further.
 *  - **Wind in baseball is directional.** Blowing out it adds runs, blowing in
 *    it removes them, and we have no stadium orientation, so we deliberately
 *    apply NO mean shift and instead record it as a blind spot. Guessing the
 *    sign would be worse than admitting we don't know it.
 */
export const WEATHER_MODEL = {
  /** Wind above this is treated as calm for football. */
  footballCalmMph: 8,
  /** Total points removed per mph of wind above calm. */
  footballWindPerMph: 0.15,
  footballWindCap: 4,
  /** Points removed per °F below freezing. */
  footballColdPerDegree: 0.05,
  footballColdCap: 2,
  /** Points removed per inch of precipitation in the hour. */
  footballRainPerInch: 8,
  footballRainCap: 2,
  /** Runs added per °F above 70 (and removed below). */
  baseballTempPerDegree: 0.012,
  baseballTempCap: 0.6,
  /** Baseball wind above this is flagged as an unmodelled unknown. */
  baseballWindUnknownMph: 12,
} as const;

export interface WeatherEffect {
  /** Change to the projected total. Negative suppresses scoring. */
  totalAdjustment: number;
  /** Human-readable summary for the leg's stats. */
  note: string;
  /** Set when conditions matter but we can't sign the effect. */
  blindSpot?: string;
}

/** Translate a forecast into a total adjustment. Returns null when it's a non-event. */
export function weatherEffect(
  league: League,
  w: GameWeather | undefined,
): WeatherEffect | null {
  if (!w) return null;
  const W = WEATHER_MODEL;
  const parts: string[] = [];
  let adjustment = 0;
  let blindSpot: string | undefined;

  if (league === "NFL") {
    if (w.windMph > W.footballCalmMph) {
      const wind = Math.min(
        W.footballWindCap,
        (w.windMph - W.footballCalmMph) * W.footballWindPerMph,
      );
      adjustment -= wind;
      parts.push(`${Math.round(w.windMph)} mph wind (−${wind.toFixed(1)})`);
    }
    if (w.tempF != null && w.tempF < 32) {
      const cold = Math.min(
        W.footballColdCap,
        (32 - w.tempF) * W.footballColdPerDegree,
      );
      adjustment -= cold;
      parts.push(`${Math.round(w.tempF)}°F (−${cold.toFixed(1)})`);
    }
    if (w.precipInches != null && w.precipInches > 0.005) {
      const rain = Math.min(
        W.footballRainCap,
        w.precipInches * W.footballRainPerInch,
      );
      adjustment -= rain;
      parts.push(`precipitation (−${rain.toFixed(1)})`);
    }
  } else if (league === "MLB") {
    if (w.tempF != null) {
      const temp = clamp(
        (w.tempF - 70) * W.baseballTempPerDegree,
        -W.baseballTempCap,
        W.baseballTempCap,
      );
      if (Math.abs(temp) > 0.05) {
        adjustment += temp;
        parts.push(
          `${Math.round(w.tempF)}°F (${temp > 0 ? "+" : ""}${temp.toFixed(2)})`,
        );
      }
    }
    if (w.windMph >= W.baseballWindUnknownMph) {
      blindSpot = `${Math.round(w.windMph)} mph wind at ${w.venue}, direction unknown — not applied`;
      parts.push(`${Math.round(w.windMph)} mph wind (direction unknown)`);
    }
  } else {
    return null;
  }

  if (parts.length === 0) return null;
  return {
    totalAdjustment: Number(adjustment.toFixed(2)),
    note: parts.join(", "),
    blindSpot,
  };
}

export interface LeagueModel {
  /** SD of final margin, in the sport's own units. */
  marginSigma: number;
  /** SD of the combined final total. */
  totalSigma: number;
  /** Home advantage expressed in margin units. */
  homeEdge: number;
  /** Shrinkage constant: games needed before records carry real weight. */
  priorGames: number;
  /** League-average combined total — the fallback when none is posted. */
  avgTotal: number;
  unit: string;
}

export const LEAGUE_MODEL: Record<League, LeagueModel> = {
  NBA: { marginSigma: 12.0, totalSigma: 16.5, homeEdge: 2.2, priorGames: 20, avgTotal: 226, unit: "pts" },
  NFL: { marginSigma: 13.2, totalSigma: 13.5, homeEdge: 1.6, priorGames: 6, avgTotal: 44, unit: "pts" },
  NHL: { marginSigma: 2.3, totalSigma: 2.7, homeEdge: 0.25, priorGames: 25, avgTotal: 6.1, unit: "goals" },
  MLB: { marginSigma: 4.2, totalSigma: 4.4, homeEdge: 0.2, priorGames: 40, avgTotal: 8.8, unit: "runs" },
  NCAAF: { marginSigma: 16.5, totalSigma: 17.5, homeEdge: 2.4, priorGames: 6, avgTotal: 55, unit: "pts" },
  NCAAB: { marginSigma: 11.0, totalSigma: 15.0, homeEdge: 3.0, priorGames: 15, avgTotal: 145, unit: "pts" },
};

/**
 * Hard cap on how much our scoring-rate model can move off the market.
 * Betting markets are highly efficient; even a decent model deserves a
 * minority vote. Keeping this explicit (and low) is what stops the tool
 * inventing edge.
 */
export const MAX_MODEL_WEIGHT = 0.35;

/**
 * How much of its own view the model is allowed to vote. Currently zero.
 *
 * This is the uncomfortable consequence of taking the rest of the file
 * seriously. Blending an independent view into a well-calibrated forecast only
 * helps if that view carries information the forecast lacks. If it does not,
 * the blend is the forecast plus noise, and adding noise to a calibrated
 * probability strictly increases squared error — monotonically in the weight.
 * Simulated at our own cap: a 35% vote costs 2.5% of skill score against the
 * market, 20% at a full vote, and 0% only at zero.
 *
 * So: does our deviation carry information the price lacks? We have no
 * evidence that it does — zero graded picks — and good reason to doubt it.
 * Everything the model knows is public season data: scoring rates, schedule,
 * rest, travel, weather, park. The market knows all of it, and also knows
 * lineups, injuries, and where the sharp money went. Our disagreement with it
 * is therefore far more likely to be noise relative to its information set
 * than signal.
 *
 * Voting 35% on that basis was an assertion dressed as a model. It is the same
 * argument that zeroed the win%-only prior, applied where it actually bites.
 *
 * What the model still contributes, all of it structural rather than
 * predictive, and none of it affected by this:
 *
 *  - the shape of the outcome distribution (Poisson differences, key numbers,
 *    discrete support), which the posted price does not express;
 *  - push probability on integer lines, which books sometimes misprice;
 *  - exact same-game correlation, from parity and nested thresholds;
 *  - the consensus itself, which is a better estimate than any single book.
 *
 * Raise this ONLY from the prediction log: if graded picks show positive skill
 * against the closing line, the weight the data supports is roughly that
 * measured skill. Not before, and never because the output looks more
 * impressive with it turned up.
 */
export const MEASURED_MODEL_SKILL = 0;

/**
 * The vote, per market.
 *
 * Margin and total are measured separately because they are separate claims.
 * Sides are the most heavily traded number on the board; totals take a
 * fraction of the action and are the softer market in most books. Letting one
 * number gate both meant a margin measurement was silently authorising the
 * totals opinion, and a soft spot in totals could never surface because it was
 * being averaged against efficiency in sides.
 */
export interface ModelVote {
  margin: number;
  total: number;
}

/** Accept a single number (both markets) or an explicit per-market pair. */
export function normalizeVote(vote: number | ModelVote): ModelVote {
  return typeof vote === "number"
    ? { margin: vote, total: vote }
    : { margin: vote.margin, total: vote.total };
}

/**
 * Season points for/against, with no adjustment for who you played. Strictly
 * weaker than the opponent-adjusted ratings, so it votes less.
 */
export const MAX_SCORING_WEIGHT = 0.28;

/**
 * A win%-only prior gets NO vote.
 *
 * It was on 20% because it was better than nothing. On reflection it isn't:
 * win% cannot separate two 10-6 teams with opposite point differentials, it
 * cannot produce a totals opinion at all, and it is the one input in the model
 * with no measured support of any kind. Meanwhile it is the input that fires
 * precisely when we know least — no results window, no scoring data — which
 * is exactly when deferring to the market is the right answer.
 *
 * Shrinking an uninformative signal toward the market still moves the number;
 * it just moves it by a smaller random amount. Removing it entirely is the
 * honest version. The record is still PARSED and displayed as context.
 */
export const MAX_RECORD_WEIGHT = 0;

/** Totals are the sharpest market of the three, so we lean on it hardest. */
export const MAX_TOTAL_WEIGHT = 0.3;

/**
 * Margin variance scales with the scoring environment.
 *
 * A league-constant sigma says a 240-total basketball game has the same
 * margin spread as a 205-total one, which cannot be right: more possessions
 * means more variance. Scaling by sqrt(total / leagueAvg) is the natural
 * first-order correction — variance grows roughly linearly in possessions, so
 * the standard deviation grows with its square root.
 *
 * The count-model sports (hockey, baseball) get this for free, because a
 * Skellam's variance is the sum of its lambdas. This is for the rest.
 */
/**
 * Margin standard deviation implied by the market itself.
 *
 * The spread and the moneyline are two prices on the same distribution, and
 * together they pin its width: if the market posts a 5.5-point spread and
 * prices the favourite at 64.8%, then the sigma consistent with BOTH is
 * 5.5 / Phi-inverse(0.648) = 14.5, not the 12.0 this model had been asserting.
 * Assuming sigma instead of reading it left our own moneyline probability 3
 * points away from the moneyline price, with the gap coming entirely from a
 * constant I picked.
 *
 * This is the same move as every other improvement that measured well: replace
 * an asserted parameter with one the data determines. Note that it does NOT
 * make the model disagree with the market — it makes it agree with BOTH market
 * signals at once, which assuming sigma could not do.
 *
 * Returns null when the inversion is ill-conditioned: near a pick'em the
 * quantile is near zero and the ratio explodes, and a tiny spread carries no
 * information about width.
 */
export function marketImpliedSigma(
  league: League,
  spreadMargin: number | null,
  marketHomeWinProb: number,
): number | null {
  const lm = LEAGUE_MODEL[league];
  if (!lm || spreadMargin == null) return null;
  // Count sports price their margin off the moneyline already, so there is no
  // independent second signal to combine.
  if (!STANDARD_SPREAD_LEAGUES.has(league)) return null;

  const p = marketHomeWinProb;
  if (!(p > 0.05 && p < 0.95)) return null;
  const z = normalQuantile(p);
  // Near a coin flip both the quantile and the spread go to zero together and
  // their ratio is pure noise.
  if (Math.abs(z) < 0.12 || Math.abs(spreadMargin) < 0.5) return null;
  // The two must at least agree on who is favoured.
  if (Math.sign(z) !== Math.sign(spreadMargin)) return null;

  const implied = Math.abs(spreadMargin) / Math.abs(z);
  // A market-implied width wildly off the league norm is far more likely to be
  // a mismatched spread-and-moneyline pair than a real distribution.
  return clamp(implied, lm.marginSigma * 0.6, lm.marginSigma * 1.6);
}

export function effectiveSigma(league: League, total: number | null): number {
  const lm = LEAGUE_MODEL[league];
  if (!lm) return 1;
  if (total == null || !Number.isFinite(total) || total <= 0) {
    return lm.marginSigma;
  }
  const ratio = Math.sqrt(total / lm.avgTotal);
  // Clamped: a wild posted total shouldn't be able to distort every price.
  return lm.marginSigma * clamp(ratio, 0.85, 1.2);
}

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
  /** True when the projection had to be pulled back to a possible value. */
  marginClamped: boolean;
  /** Weight given to our model (0..MAX_MODEL_WEIGHT). */
  modelWeight: number;
  /** Which inputs produced modelMargin, best first. */
  marginBasis: "ratings" | "scoring" | "record" | "market";
  /** De-vigged market probability that the home team wins. */
  marketHomeWinProb: number;
  /** Book margin on the moneyline (0 when unavailable). */
  vig: number;
  /** Shin's estimated share of informed money behind that margin. */
  shinZ: number;
  /** Margin SD implied jointly by the spread and the moneyline (null if unusable). */
  impliedSigma: number | null;
  /** Spread-implied minus moneyline-implied margin (null without both). */
  marginDisagreement: number | null;
  /** True when the spread was rejected in favour of the moneyline. */
  spreadDistrusted: boolean;
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

  /** Forecast conditions and what they did to the projected total. */
  weather?: GameWeather;
  weatherEffect?: WeatherEffect;
  /** Venue run-scoring multiplier applied to our projected total (1 = none). */
  parkFactor: number;

  // --- distributions ---
  /** Projected scores, present for the count-model sports (NHL, MLB). */
  lambdaHome?: number;
  lambdaAway?: number;
  /**
   * The joint distribution over (home score, away score). Every market is a
   * marginal of this one object, so they are consistent by construction.
   */
  grid: ScoreGrid;
  /** Final margin distribution — a marginal of `grid`. */
  marginDist: DiscreteDist;
  /** Combined total distribution (null when no total is posted). */
  totalDist: DiscreteDist | null;

  // --- information we know we're missing ---
  /** 0..1 — how much of the picture we think we have. */
  infoQuality: number;
  /** Plain-language account of what we're blind to. */
  blindSpots: string[];
  /** MLB: the probable starters, when the feed carries them. */
  pitchers?: { home?: ProbablePitcher; away?: ProbablePitcher };
}

/**
 * Share of a baseball game the listed starter is expected to cover.
 * Roughly five and a bit innings of nine across the modern league.
 */
export const STARTER_SHARE = 0.55;
/** ERA counts earned runs only; total runs allowed run a little higher. */
export const UNEARNED_RUN_FACTOR = 1.08;

/**
 * Projected points for each side from season scoring rates.
 *
 * A team's expected output is the midpoint of what it scores and what the
 * opponent concedes. Crude, but it is the standard first-order estimate.
 *
 * For baseball the "what the opponent concedes" term is replaced by a
 * starter-weighted version, because the listed pitcher — not the opponent's
 * season average — is most of the information in a run line or a total. This
 * is the single largest input the model was missing.
 */
function projectScores(
  home: TeamScoring,
  away: TeamScoring,
  homeEdge: number,
  pitchers?: { home?: ProbablePitcher; away?: ProbablePitcher },
) {
  const concede = (
    teamAgainstPerGame: number,
    starter?: ProbablePitcher,
  ): number => {
    if (starter?.era == null || !Number.isFinite(starter.era)) {
      return teamAgainstPerGame;
    }
    const starterRuns = starter.era * UNEARNED_RUN_FACTOR;
    return (
      STARTER_SHARE * starterRuns + (1 - STARTER_SHARE) * teamAgainstPerGame
    );
  };

  // The home team's run output is shaped by the AWAY starter, and vice versa.
  const homeFacing = concede(away.pointsAgainstPerGame, pitchers?.away);
  const awayFacing = concede(home.pointsAgainstPerGame, pitchers?.home);

  const projHome = (home.pointsForPerGame + homeFacing) / 2;
  const projAway = (away.pointsForPerGame + awayFacing) / 2;
  return {
    projHome: projHome + homeEdge / 2,
    projAway: projAway - homeEdge / 2,
  };
}

/**
 * Projected scores from opponent-adjusted ratings.
 *
 * The decomposition is additive in deviations from league average, so each
 * side's expected output is `avg/2 + own offense + opponent defense`, plus the
 * home split. Because the margin is `net(home) - net(away) + homeEdge` by
 * construction, this is the same arithmetic the totals projection uses — one
 * solve, two consistent markets.
 */
function projectFromRatings(
  home: TeamRating,
  away: TeamRating,
  lm: LeagueModel,
  pitchers?: { home?: ProbablePitcher; away?: ProbablePitcher },
  homeScoring?: TeamScoring,
  awayScoring?: TeamScoring,
) {
  const base = lm.avgTotal / 2;
  let homeDefence = away.defense;
  let awayDefence = home.defense;

  // Baseball: the listed starter replaces most of the opponent's season-long
  // defensive rating, for the same reason as in projectScores.
  const pitcherDefence = (
    starter: ProbablePitcher | undefined,
    teamDefence: number,
    teamScoring: TeamScoring | undefined,
  ): number => {
    if (starter?.era == null || !Number.isFinite(starter.era)) return teamDefence;
    const starterRuns = starter.era * UNEARNED_RUN_FACTOR;
    // Express the starter on the same deviation-from-average scale.
    const starterDeviation = starterRuns - base;
    const fallback = teamScoring
      ? teamScoring.pointsAgainstPerGame - base
      : teamDefence;
    return (
      STARTER_SHARE * starterDeviation +
      (1 - STARTER_SHARE) * (teamDefence || fallback)
    );
  };

  homeDefence = pitcherDefence(pitchers?.away, away.defense, awayScoring);
  awayDefence = pitcherDefence(pitchers?.home, home.defense, homeScoring);

  return {
    projHome: Number(
      (base + home.offense + homeDefence + lm.homeEdge / 2).toFixed(3),
    ),
    projAway: Number(
      (base + away.offense + awayDefence - lm.homeEdge / 2).toFixed(3),
    ),
  };
}

export function buildGameModel(
  game: Game,
  odds: MarketOdds,
  scoring: Record<string, TeamScoring> = {},
  schedule: Record<string, TeamSchedule> = {},
  injuries: Record<string, TeamInjuryReport> = {},
  ratings: Record<string, TeamRating> = {},
  weather: Record<string, GameWeather> = {},
  /**
   * The model vote, which the caller supplies from the backtest regression.
   * Defaults to MEASURED_MODEL_SKILL — i.e. zero — so nothing votes unless
   * measured evidence is handed in.
   */
  modelVote: number | ModelVote = MEASURED_MODEL_SKILL,
): GameModel | null {
  const lm = LEAGUE_MODEL[game.league];
  if (!lm) return null;
  const { totalSigma } = lm;

  // Margin spread follows the scoring environment rather than a constant.
  // Refined below once both market signals are known.
  const scoringEnvironmentSigma = effectiveSigma(
    game.league,
    odds.total != null && Number.isFinite(odds.total) ? odds.total : null,
  );

  // --- market view -------------------------------------------------
  let marketHomeWinProb = 0.5;
  let vig = 0;
  let shinZ = 0;
  if (odds.homeMoneyline != null && odds.awayMoneyline != null) {
    const rawHome = impliedProbability(americanToDecimal(odds.homeMoneyline));
    const rawAway = impliedProbability(americanToDecimal(odds.awayMoneyline));
    // Shin rather than proportional: the latter overstates longshots, which
    // would show up as phantom edge on heavy favourites.
    const dv = removeVigShin([rawHome, rawAway]);
    marketHomeWinProb = dv.fair[0];
    vig = dv.vig;
    shinZ = dv.z;
  }

  // The posted spread IS the market's projected margin — prefer it when
  // present; otherwise invert the de-vigged moneyline through the margin model.
  /*
   * A posted spread is only the market's projected margin in the sports that
   * post a TRUE point spread. The hockey puck line and the baseball run line
   * are fixed at ±1.5 and priced through their odds instead, so reading one as
   * a projected margin claimed every hockey game would be decided by 1.5
   * goals — which priced a pick'em NHL game at 74% for the home side against
   * a 50% market, on every game.
   *
   * STANDARD_SPREAD_LEAGUES already encoded this distinction for pricing the
   * spread leg; it belongs here too.
   */
  const impliedSigma = marketImpliedSigma(
    game.league,
    odds.spread != null && Number.isFinite(odds.spread)
      ? -(odds.spread as number)
      : null,
    marketHomeWinProb,
  );
  /*
   * Prefer the width the market's own two prices imply; fall back to the
   * scoring-environment estimate when that inversion is ill-conditioned.
   */
  const sigma = impliedSigma ?? scoringEnvironmentSigma;

  const hasTrueSpread =
    odds.spread != null &&
    Number.isFinite(odds.spread) &&
    STANDARD_SPREAD_LEAGUES.has(game.league);
  const spreadMargin = hasTrueSpread
    ? -(odds.spread as number) // stored as the HOME spread (negative = home favoured)
    : null;
  // The moneyline is a second, independent read on the same quantity. For the
  // count sports it must be inverted through the distribution we actually
  // price with, not through a normal — see marginFromWinProb.
  const marketTotalForInversion =
    odds.total != null && Number.isFinite(odds.total) ? odds.total : lm.avgTotal;
  const moneylineMargin = usesCountModel(game.league)
    ? marginFromWinProb(game.league, marketTotalForInversion, marketHomeWinProb)
    : sigma * normalQuantile(clamp(marketHomeWinProb, 0.01, 0.99));

  /*
   * Cross-check the two market signals.
   *
   * The model used to take the spread as gospel for the margin and use the
   * moneyline only as a de-vig benchmark — so when the two disagreed, nothing
   * noticed. That matters because the home spread's SIGN is derived from
   * matching a team abbreviation inside a free-text "details" string, and when
   * that match fails we fall back to ESPN's raw `spread` field, which is the
   * FAVOURITE's spread rather than the home team's. On an away favourite that
   * flips the sign, turning a 6.5-point home underdog into a 6.5-point home
   * favourite — a 43pp swing in our win probability with no complaint.
   *
   * A moneyline pair cannot be misread that way: whichever price is shorter
   * is the favourite, with no name matching involved. So when the two
   * disagree materially we trust the moneyline and say so.
   */
  const mlIsInformative =
    odds.homeMoneyline != null &&
    odds.awayMoneyline != null &&
    marketHomeWinProb > 0.03 &&
    marketHomeWinProb < 0.97;

  let marginDisagreement: number | null = null;
  let spreadDistrusted = false;
  if (spreadMargin != null && mlIsInformative) {
    marginDisagreement = spreadMargin - moneylineMargin;
    // Compared in PROBABILITY space, not margin space. The same three-point
    // discrepancy is noise in college football and a 36pp swing in baseball,
    // so a tolerance in margin units is the wrong instrument — what we care
    // about is how far the two signals disagree about who wins.
    const pFromSpread = normalCdf(spreadMargin / sigma);
    spreadDistrusted =
      Math.abs(pFromSpread - marketHomeWinProb) > MAX_SIGNAL_DISAGREEMENT;
  }

  const marketMargin =
    spreadMargin == null || spreadDistrusted ? moneylineMargin : spreadMargin;

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

  const pitchers =
    game.league === "MLB" && (game.home.probablePitcher || game.away.probablePitcher)
      ? { home: game.home.probablePitcher, away: game.away.probablePitcher }
      : undefined;

  const homeRating = ratings[`${game.league}:${game.home.id}`];
  const awayRating = ratings[`${game.league}:${game.away.id}`];
  const haveRatings =
    homeRating != null &&
    awayRating != null &&
    homeRating.effectiveGames >= 2 &&
    awayRating.effectiveGames >= 2;

  if (haveRatings) {
    // Opponent-adjusted ratings: the same offense/defense pair produces the
    // margin and the total, so the two can't contradict each other, and
    // strength of schedule is already divided out.
    sampleGames = Math.min(
      homeRating.effectiveGames,
      awayRating.effectiveGames,
    );
    const { projHome, projAway } = projectFromRatings(
      homeRating,
      awayRating,
      lm,
      pitchers,
      homeScore,
      awayScore,
    );
    modelMargin = projHome - projAway;
    modelTotal = projHome + projAway;
    marginBasis = "ratings";
    maxWeight = MAX_MODEL_WEIGHT;
    scoringDetail = {
      homeFor: Number((lm.avgTotal / 2 + homeRating.offense).toFixed(2)),
      homeAgainst: Number((lm.avgTotal / 2 + homeRating.defense).toFixed(2)),
      awayFor: Number((lm.avgTotal / 2 + awayRating.offense).toFixed(2)),
      awayAgainst: Number((lm.avgTotal / 2 + awayRating.defense).toFixed(2)),
      projHome,
      projAway,
    };
  } else if (haveScoring) {
    // Points for/against beats win% on both counts: it separates teams with
    // identical records, and it is the only input that yields a total.
    sampleGames = Math.min(homeScore.gamesPlayed, awayScore.gamesPlayed);
    const { projHome, projAway } = projectScores(
      homeScore,
      awayScore,
      lm.homeEdge,
      pitchers,
    );
    modelMargin = projHome - projAway;
    modelTotal = projHome + projAway;
    marginBasis = "scoring";
    maxWeight = MAX_SCORING_WEIGHT;
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
    // Recorded as the basis for display, but with zero weight: see
    // MAX_RECORD_WEIGHT. The projection falls through to the market.
    marginBasis = "record";
    maxWeight = MAX_RECORD_WEIGHT;
  }

  // --- schedule and travel ------------------------------------------
  // Applied inside OUR projection, not on top of the blend: the market knows
  // the schedule too, so this is an input to our vote, not a bonus edge.
  const sched = scheduleEdge(game, schedule);
  const restEdge = sched.edge;
  if (modelMargin !== null && restEdge !== 0) modelMargin += restEdge;

  // --- park factor ---------------------------------------------------
  // Our scoring inputs are season aggregates across every park a team
  // visited, so our projected total is park-NEUTRAL while the posted total is
  // park-specific. Correcting that isn't an edge claim, it makes the two
  // numbers comparable before we compare them.
  const park = parkFactor(game.league, game.home.abbreviation);
  if (modelTotal !== null && park !== 1) modelTotal *= park;

  // --- weather ------------------------------------------------------
  // Inside our projection and shrunk with it: the market prices weather too,
  // just more slowly than it prices injuries.
  const wx = weatherEffect(game.league, weather[game.id]);
  if (wx && modelTotal !== null) modelTotal += wx.totalAdjustment;

  // --- what we know we don't know ----------------------------------
  // Injuries are the largest variable we don't model, and the market prices
  // them within minutes. That creates the system's worst failure mode: if a
  // line moved four points on an injury we can't see, our model now
  // "disagrees" with the market by four points and would happily call that
  // value. So rather than guess a magnitude we can't estimate, we detect that
  // information is missing and defer further to the market — the model's vote
  // shrinks exactly when it is least informed.
  const homeInj = injuries[`${game.league}:${game.home.id}`];
  const awayInj = injuries[`${game.league}:${game.away.id}`];
  const blindSpots: string[] = [];
  let infoQuality = 1;

  const outTotal = (homeInj?.out ?? 0) + (awayInj?.out ?? 0);
  const questionableTotal =
    (homeInj?.questionable ?? 0) + (awayInj?.questionable ?? 0);
  if (outTotal > 0 || questionableTotal > 0) {
    // Capped, because we cannot tell a starter from a third-stringer here.
    const brake = Math.min(0.35, 0.06 * outTotal + 0.02 * questionableTotal);
    infoQuality *= 1 - brake;
    blindSpots.push(
      `${outTotal} player${outTotal === 1 ? "" : "s"} out, ${questionableTotal} questionable — we don't model who they are`,
    );
  }
  if (game.league === "MLB" && !pitchers?.home?.era && !pitchers?.away?.era) {
    // The starter is most of a baseball line; without one we are guessing.
    infoQuality *= 0.55;
    blindSpots.push("no probable pitchers in the feed — the dominant input");
  }
  if (spreadDistrusted) {
    blindSpots.push(
      `posted spread implies a ${spreadMargin?.toFixed(1)} margin (${(normalCdf((spreadMargin ?? 0) / sigma) * 100).toFixed(0)}% to win) but the moneyline implies ${moneylineMargin.toFixed(1)} (${(marketHomeWinProb * 100).toFixed(0)}%) — using the moneyline`,
    );
    infoQuality *= 0.75;
  }
  if (wx?.blindSpot) {
    infoQuality *= 0.9;
    blindSpots.push(wx.blindSpot);
  }
  if (marginBasis === "record") {
    infoQuality *= 0.8;
    blindSpots.push("no scoring data: win% only, which can't separate teams with equal records");
  }

  // --- blend with shrinkage ---------------------------------------
  // The prior has to match the units the sample is measured in. A ratings
  // sample is in recency-weighted effective games, which is always a smaller
  // number than a raw season game count — with a 30-day half-life even a full
  // season settles around 20. Shrinking it against a prior tuned for raw
  // counts would under-weight the better basis, and the ratings have already
  // been shrunk toward league average inside the solve, so this second step
  // only needs to be mild.
  const prior =
    marginBasis === "ratings"
      ? (RATING_PARAMS[game.league]?.priorGames ?? lm.priorGames)
      : lm.priorGames;
  const shrink = sampleGames / (sampleGames + prior);
  // The vote is gated by measured skill, per market. See MEASURED_MODEL_SKILL.
  const votes = normalizeVote(modelVote);
  const vote = clamp(votes.margin, 0, 1);
  const totalVote = clamp(votes.total, 0, 1);
  const modelWeight =
    modelMargin === null ? 0 : maxWeight * shrink * infoQuality * vote;
  const blendedMargin =
    modelMargin === null
      ? marketMargin
      : modelWeight * modelMargin + (1 - modelWeight) * marketMargin;

  const marketTotal =
    odds.total != null && Number.isFinite(odds.total) ? odds.total : null;
  const totalWeight =
    modelTotal === null || marketTotal === null
      ? 0
      : MAX_TOTAL_WEIGHT * shrink * infoQuality * totalVote;
  const blendedTotal =
    marketTotal === null
      ? modelTotal
      : modelTotal === null
        ? marketTotal
        : totalWeight * modelTotal + (1 - totalWeight) * marketTotal;

  // --- distributions ------------------------------------------------
  // Count-model sports need a projected score for each side. Deriving them
  // from the BLENDED margin and total means the market's view is baked in,
  // and it couples the margin and total distributions instead of treating
  // them as two independent guesses.
  let lambdaHome: number | undefined;
  let lambdaAway: number | undefined;
  let marginForGrid = blendedMargin;
  let lambdaClamped = false;
  if (usesCountModel(game.league)) {
    const totalForLambda = blendedTotal ?? lm.avgTotal;
    const derived = deriveLambdas(game.league, totalForLambda, blendedMargin);
    lambdaHome = derived.lambdaHome;
    lambdaAway = derived.lambdaAway;
    lambdaClamped = derived.clamped;
    // Use the constrained margin everywhere, so the reported projection and
    // the distribution that prices the legs cannot disagree.
    marginForGrid = derived.margin;
    if (derived.clamped) {
      blindSpots.push(
        `projected margin of ${blendedMargin.toFixed(1)} is impossible against a ${totalForLambda.toFixed(1)} total — pulled back to ${derived.margin.toFixed(1)}`,
      );
      infoQuality *= 0.7;
    }
  }

  // One joint object; the margin and total distributions are its marginals.
  const grid = buildScoreGrid({
    league: game.league,
    margin: marginForGrid,
    total: blendedTotal ?? lm.avgTotal,
    marginSd: sigma,
    totalSd: totalSigma,
    lambdaHome,
    lambdaAway,
  });
  const marginDist = gridMarginDist(grid);
  const totalDist = blendedTotal === null ? null : gridTotalDist(grid);

  return {
    league: game.league,
    sigma,
    totalSigma,
    marketMargin,
    modelMargin,
    blendedMargin: marginForGrid,
    marginClamped: lambdaClamped,
    modelWeight,
    marginBasis,
    marketHomeWinProb,
    vig,
    shinZ,
    impliedSigma: impliedSigma === null ? null : Number(impliedSigma.toFixed(2)),
    marginDisagreement:
      marginDisagreement === null
        ? null
        : Number(marginDisagreement.toFixed(2)),
    spreadDistrusted,
    sampleGames,
    marketTotal,
    modelTotal:
      modelTotal === null ? null : Number(modelTotal.toFixed(2)),
    blendedTotal:
      blendedTotal === null ? null : Number(blendedTotal.toFixed(2)),
    totalWeight,
    scoring: scoringDetail,
    movement: odds.movement,
    weather: weather[game.id],
    weatherEffect: wx ?? undefined,
    parkFactor: park,
    restEdge: Number(restEdge.toFixed(2)),
    restNote: sched.notes.length > 0 ? sched.notes.join(" · ") : undefined,
    lambdaHome:
      lambdaHome === undefined ? undefined : Number(lambdaHome.toFixed(3)),
    lambdaAway:
      lambdaAway === undefined ? undefined : Number(lambdaAway.toFixed(3)),
    grid,
    marginDist,
    totalDist,
    infoQuality: Number(infoQuality.toFixed(3)),
    blindSpots,
    pitchers,
  };
}

/**
 * P(home margin > threshold), conditional on the game not landing exactly on
 * the number. A push is refunded and is excluded from our Brier score, so the
 * probability we publish has to be the no-push-conditional one.
 */
function pHomeMarginAbove(gm: GameModel, threshold: number): number {
  return lineProbability(gm.marginDist, threshold, "above").win;
}

/** Push probability at a margin line (zero for half-point lines). */
function pMarginPush(gm: GameModel, threshold: number): number {
  return gm.marginDist.at(threshold);
}

/** P(combined total > line | no push). */
function pTotalAbove(gm: GameModel, line: number): number {
  if (!gm.totalDist) return 0.5;
  return lineProbability(gm.totalDist, line, "above").win;
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
  vig: number;
  isModelled: boolean;
  movement?: MovementRead | null;
  basis?: GameModel["marginBasis"];
  infoQuality?: number;
  blindSpots?: string[];
  /** The market survey for this side, which is what edge is measured against. */
  consensus?: ConsensusSide;
}): ConfidenceResult {
  const {
    sampleGames,
    priorGames,
    vig,
    isModelled,
    movement,
    basis,
    infoQuality = 1,
    blindSpots = [],
    consensus,
  } = opts;

  const sample = clamp(sampleGames / (sampleGames + priorGames), 0, 1);
  // 2% hold -> ~1.0 ; 10% hold -> ~0.0
  const priceQuality = clamp(1 - (vig - 0.02) / 0.08, 0, 1);
  // Unknown movement is neutral (0.5), not a penalty.
  const confirmation =
    movement == null ? 0.5 : clamp((movement.agreement + 1) / 2, 0, 1);

  /*
   * Confidence is confidence in the EDGE, and edge is now a statement about
   * the price. So the question it answers is "how sure are we that this price
   * is better than the bet is worth?" — which has two measurable parts.
   *
   * The old formula's largest single term was "market agreement": confidence
   * fell as our projection diverged from the market. That had to go. It was a
   * reasonable proxy when the model's disagreement WAS the edge, but edge no
   * longer depends on the projection at all, so the term was penalising
   * confidence for something that can no longer affect the number — noise
   * with a weight attached. Worse, it made confidence and edge
   * anti-correlated by construction.
   */
  const se = consensus?.standardError ?? UNKNOWN_FAIR_SE;
  const booksSeen = consensus?.books ?? 1;
  // How precisely we know fair value. 0.4pp of SE reads as precise; 3pp does not.
  const benchmarkPrecision = clamp(1 - (se - 0.004) / 0.026, 0, 1);
  // Independent quotes. One book is unverifiable; four is a real survey.
  const survey = clamp((booksSeen - 1) / 3, 0, 1);

  /*
   * Edge significance is deliberately NOT a term here, though it was in the
   * first version of this formula and it broke the thing it was meant to
   * measure: markets whose books scattered scored HIGHER confidence (0.635)
   * than markets whose books agreed (0.619), because wide dispersion produces
   * a big gap between the best price and the consensus, and that fed
   * significance faster than it drained precision.
   *
   * Confidence and value have to stay orthogonal. Confidence answers "how
   * well do we know fair value and our inputs"; significance answers "is this
   * gap bigger than our uncertainty about fair value". Feeding the second
   * into the first makes confidence rise with edge, so a leg ranks higher for
   * being more profitable rather than for being better understood — which is
   * how a model talks itself into its own worst picks. Significance stays as
   * the screening gate and on the card, where it belongs.
   */
  const base =
    0.34 * benchmarkPrecision +
    0.24 * survey +
    0.18 * priceQuality +
    0.14 * clamp(infoQuality, 0, 1) +
    0.05 * sample +
    0.05 * confirmation;

  /*
   * With a single book there is nothing to verify fair value against: the
   * benchmark is that book's own de-vigged price, so "edge against it" is
   * circular. Cap confidence hard, because the honest statement is that we
   * cannot tell.
   */
  const unverified = booksSeen < 2;
  let score = clamp(base, 0, 1);
  /*
   * Scaled rather than capped. A hard ceiling flattened every single-book leg
   * to the same number, which threw away real information: whether the line
   * had moved our way, whether players were out, how much scoring data was
   * behind the projection. Those still differentiate one unverified leg from
   * another even when none of them can be verified. Halving preserves the
   * ordering while keeping the level honestly low — a one-book leg can reach
   * "medium" but never "high".
   */
  if (unverified) score *= 0.5;
  // An unmodelled market has no directional view of its own — that must never
  // read as confidence in a forecast, though the PRICE edge can still be real.
  if (!isModelled) score = Math.min(score, consensus && booksSeen > 1 ? 0.55 : 0.3);

  const level: Confidence = score >= 0.7 ? "high" : score >= 0.45 ? "medium" : "low";

  return {
    score: Number(score.toFixed(3)),
    level,
    factors: [
      {
        label: "Sample size",
        value: Number(sample.toFixed(2)),
        note:
          basis === "ratings"
            ? `${sampleGames.toFixed(1)} recency-weighted games behind the ratings`
            : basis === "scoring"
            ? `${sampleGames} games of scoring data behind the projection`
            : `${sampleGames} games of record behind the prior`,
      },
      {
        label: "Fair value precision",
        value: Number(benchmarkPrecision.toFixed(2)),
        note: consensus && booksSeen > 1
          ? `${booksSeen} books agree to within ±${(se * 100).toFixed(1)}pp`
          : "one book only — fair value can't be verified",
      },
      {
        // Reported, but not part of the score — see the note in the formula.
        label: "Edge vs noise",
        value: consensus
          ? Number(clamp(consensus.edgeSignificance / 4, 0, 1).toFixed(2))
          : 0,
        note: consensus
          ? `edge is ${consensus.edgeSignificance.toFixed(1)}× the books' own disagreement (screening only, not scored)`
          : "no survey to measure against",
      },
      {
        label: "Books surveyed",
        value: Number(survey.toFixed(2)),
        note: `${booksSeen} independent quote${booksSeen === 1 ? "" : "s"}`,
      },
      {
        label: "Price quality",
        value: Number(priceQuality.toFixed(2)),
        note: `book margin ${(vig * 100).toFixed(1)}%`,
      },
      {
        label: "Information",
        value: Number(clamp(infoQuality, 0, 1).toFixed(2)),
        note:
          blindSpots.length === 0
            ? "no known gaps in this game's inputs"
            : blindSpots.join("; "),
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

/**
 * Which side of a two-way market is the better buy.
 *
 * Judged on the price against the consensus fair value, not on our model's
 * preference — otherwise the tool picks whichever side our unvalidated
 * disagreement happens to favour and then reports that choice as value.
 */
function sideValue(side: {
  american: number;
  /** De-vigged fallback when the market wasn't quoted by several books. */
  market?: number;
  con?: ConsensusSide;
}): number {
  const benchmark = side.con?.fairProbability ?? side.market ?? 0.5;
  return benchmark - impliedProbability(americanToDecimal(side.american));
}

/**
 * Price value is barely distinguishable between the two sides of a market —
 * at a symmetrical -110/-110 they are identical.
 */
const SIDE_VALUE_TIE = 0.002;

/**
 * Choose between the two sides of a market.
 *
 * Price value decides it, because that is the part we can defend. But when
 * the two prices are effectively symmetrical there is no price signal at all,
 * and picking whichever side the array happened to list first would be worse
 * than useless. In that case the model's lean breaks the tie — which costs
 * nothing, since expected value is still computed from the price alone.
 */
function pickSide<
  T extends { american: number; market?: number; model: number; con?: ConsensusSide },
>(sides: T[]): T {
  return sides.reduce((a, b) => {
    const diff = sideValue(b) - sideValue(a);
    if (Math.abs(diff) > SIDE_VALUE_TIE) return diff > 0 ? b : a;
    return b.model > a.model ? b : a;
  });
}

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
  /** Consensus across books for this exact side, when it was quoted. */
  consensus?: ConsensusSide;
  rationale: string;
  stats: { label: string; value: string }[];
  reference: { label: string; url: string };
  meta: LegModelMeta;
}

/**
 * Measured reasons to distrust a leg.
 *
 * Every flag names a condition observed in the data rather than a feeling
 * about the pick, so each one can be checked. A leg with no flags is not a
 * good bet — it is a bet with no known problems, which is a different and
 * weaker claim.
 */
function buildRiskFlags(
  gm: GameModel,
  con: ConsensusSide | undefined,
  meta: LegModelMeta,
  edge: number,
  isModelled: boolean,
  movement: MovementRead | null,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // --- the price, which is where value actually comes from ---
  if (!con || con.books < 2) {
    flags.push({
      severity: "high",
      label: "Unverified price",
      detail:
        "Only one bookmaker quoted this market, so fair value is that book's own de-vigged price. Edge against it is circular and comes out at minus half its hold by arithmetic.",
    });
  } else if (edge <= 0) {
    flags.push({
      severity: "high",
      label: "No price edge",
      detail: `The best available price is ${Math.abs(edge * 100).toFixed(1)} points worse than the consensus fair value. This leg costs money in expectation; it is not a play.`,
    });
  } else if ((con.edgeSignificance ?? 0) < MIN_EDGE_SIGNIFICANCE) {
    flags.push({
      severity: "high",
      label: "Edge inside noise",
      detail: `The +${(edge * 100).toFixed(1)}pp gap is only ${con.edgeSignificance.toFixed(1)} standard errors from zero, against a ±${(con.standardError * 100).toFixed(1)}pp error on fair value. The books disagree with each other by more than this apparent edge.`,
    });
  }

  if (con && con.books >= 2 && con.standardError > 0.02) {
    flags.push({
      severity: "medium",
      label: "Books disagree",
      detail: `The ${con.books} books surveyed spread over ±${(con.standardError * 100).toFixed(1)}pp on fair value, so the benchmark itself is imprecise.`,
    });
  }

  // --- the bet's own mechanics ---
  const push = meta.pushProbability ?? 0;
  if (push > 0.05) {
    flags.push({
      severity: "medium",
      label: `${(push * 100).toFixed(0)}% push`,
      detail: `This line can be landed on exactly, which returns the stake. The quoted probability is conditional on that not happening.`,
    });
  }

  if (!isModelled) {
    flags.push({
      severity: "low",
      label: "No model view",
      detail:
        "We have no directional opinion on this market — it is priced at the consensus. Any value here is in the price alone.",
    });
  }

  // --- what we know we don't know ---
  if (gm.infoQuality < 0.8) {
    flags.push({
      severity: gm.infoQuality < 0.6 ? "high" : "medium",
      label: `${Math.round(gm.infoQuality * 100)}% information`,
      detail:
        gm.blindSpots.length > 0
          ? gm.blindSpots.join("; ")
          : "Inputs for this game are incomplete.",
    });
  }

  if (gm.spreadDistrusted) {
    flags.push({
      severity: "high",
      label: "Market signals conflict",
      detail: `The posted spread and the moneyline disagree by ${Math.abs(gm.marginDisagreement ?? 0).toFixed(1)} ${LEAGUE_MODEL[gm.league].unit} about who wins. One of them is likely misreported, so we deferred to the moneyline.`,
    });
  }

  if (gm.marginClamped) {
    flags.push({
      severity: "medium",
      label: "Projection clamped",
      detail:
        "Our raw projection implied a margin impossible against this total, so it was pulled back to a possible value.",
    });
  }

  if (movement && movement.agreement < -0.15) {
    flags.push({
      severity: "medium",
      label: "Line moving away",
      detail: `Since this market opened the price has moved against this side (${movement.label}). Sharp money disagrees with it.`,
    });
  }

  if (gm.marginBasis === "record" || gm.marginBasis === "market") {
    flags.push({
      severity: "low",
      label: "No scoring data",
      detail:
        "We have no points-for/against or ratings for these teams in the window, so the projection is the market's with no independent input.",
    });
  }

  return flags;
}

/** The case for a leg: what is true, what follows, and how certain. */
function buildJustification(
  input: LegInput,
  con: ConsensusSide | undefined,
  benchmark: number,
  edge: number,
): Justification {
  const gm = input.gm;
  const lm = LEAGUE_MODEL[input.game.league];
  const facts: string[] = [];
  const statistics: string[] = [];

  // --- facts: the observable inputs ---
  if (gm.marginBasis === "ratings") {
    facts.push(
      `Schedule-adjusted ratings over ${gm.sampleGames.toFixed(1)} recency-weighted games project ${gm.blendedMargin > 0 ? input.game.home.abbreviation : input.game.away.abbreviation} by ${Math.abs(gm.blendedMargin).toFixed(1)} ${lm.unit}.`,
    );
  } else if (gm.marginBasis === "scoring" && gm.scoring) {
    facts.push(
      `Season scoring: ${input.game.home.abbreviation} ${gm.scoring.homeFor.toFixed(1)} for / ${gm.scoring.homeAgainst.toFixed(1)} against, ${input.game.away.abbreviation} ${gm.scoring.awayFor.toFixed(1)} / ${gm.scoring.awayAgainst.toFixed(1)} per game.`,
    );
  } else {
    facts.push(
      `No scoring or ratings data for these teams in the window, so the projection is the market's.`,
    );
  }

  if (input.game.home.record || input.game.away.record) {
    facts.push(
      `Records: ${input.game.home.abbreviation} ${input.game.home.record ?? "N/A"}, ${input.game.away.abbreviation} ${input.game.away.record ?? "N/A"}.`,
    );
  }
  if (gm.restNote) facts.push(`Schedule: ${gm.restNote}.`);
  if (gm.weatherEffect) {
    facts.push(
      `Forecast at ${gm.weather?.venue ?? "the venue"}: ${gm.weatherEffect.note}.`,
    );
  }
  if (gm.pitchers?.home?.era != null || gm.pitchers?.away?.era != null) {
    facts.push(
      `Probable starters: ${gm.pitchers.away?.name ?? "TBD"} (${gm.pitchers.away?.era?.toFixed(2) ?? "—"} ERA) at ${gm.pitchers.home?.name ?? "TBD"} (${gm.pitchers.home?.era?.toFixed(2) ?? "—"} ERA).`,
    );
  }
  if (gm.parkFactor !== 1) {
    facts.push(
      `${input.game.home.abbreviation}'s park plays ${((gm.parkFactor - 1) * 100).toFixed(0)}% ${gm.parkFactor > 1 ? "above" : "below"} average for runs.`,
    );
  }
  if (con && con.books > 1) {
    facts.push(
      `${con.books} bookmakers surveyed; best price ${formatOdds(con.bestAmerican)} at ${con.bestBook}.`,
    );
  } else {
    facts.push(`One bookmaker quoted this market.`);
  }

  // --- statistics: the quantified part, with its errors ---
  statistics.push(
    `Consensus fair value ${(benchmark * 100).toFixed(1)}%${con && con.books > 1 ? ` ± ${(con.standardError * 100).toFixed(1)}pp across ${con.books} books` : " (single book, unverifiable)"}.`,
  );
  statistics.push(
    `Break-even at the best available price is ${(impliedProbability(americanToDecimal(con?.bestAmerican ?? input.americanOdds)) * 100).toFixed(1)}%, so the price edge is ${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}pp${con && con.books > 1 ? ` (${con.edgeSignificance.toFixed(1)}σ)` : ""}.`,
  );
  if (input.meta.kind === "margin" && input.meta.sigma != null) {
    statistics.push(
      `Priced off a ${gm.marginDist.family} margin distribution, σ ${input.meta.sigma.toFixed(1)} ${lm.unit}${gm.impliedSigma != null ? " read from the spread and moneyline together" : ""}.`,
    );
  }
  if (input.meta.kind === "total" && input.meta.totalMean != null) {
    statistics.push(
      `Projected total ${input.meta.totalMean.toFixed(1)} against a posted ${input.meta.totalLine}, σ ${input.meta.totalSigma?.toFixed(1)}.`,
    );
  }
  const push = input.meta.pushProbability ?? 0;
  if (push > 0.005) {
    statistics.push(
      `${(push * 100).toFixed(1)}% chance of landing exactly on the number, which returns the stake; the probability above excludes it.`,
    );
  }
  statistics.push(
    `Information quality ${Math.round(gm.infoQuality * 100)}%${gm.blindSpots.length > 0 ? ` — ${gm.blindSpots.join("; ")}` : " — no known gaps"}.`,
  );

  // --- logic: why this side, at this price ---
  const logic =
    edge > 0
      ? `The consensus says this is worth ${(benchmark * 100).toFixed(1)}% and the best book will pay as if it were ${(impliedProbability(americanToDecimal(con?.bestAmerican ?? input.americanOdds)) * 100).toFixed(1)}%. That gap is the entire case — it comes from the price being out of line with the other books, not from us claiming to forecast the game better than the market.`
      : `There is no price edge here: every surveyed book prices this at or inside fair value, so backing it costs the hold in expectation. It is included for comparison, not as a play.`;

  return { facts, logic, statistics };
}

function makeLeg(input: LegInput): SgpLeg {
  /*
   * Price the leg at the BEST number any surveyed book offers, and measure
   * edge against the consensus fair probability across all of them.
   *
   * This is the difference between a tool that reports a structural loss and
   * one that can find a real play. Against a single book you are comparing a
   * shrunken projection to that book's own de-vigged price and then paying its
   * hold, so the answer is always slightly negative and correctly so. Across
   * several books, the same bet is sometimes available at a number that is
   * better than the consensus fair value — and that gap is edge that owes
   * nothing to forecasting skill.
   */
  const con = input.consensus;
  const americanOdds = con?.bestAmerican ?? input.americanOdds;
  const decimal = americanToDecimal(americanOdds);
  const rawImplied = impliedProbability(decimal);
  // The benchmark is the consensus where we have one, the single book's
  // de-vigged price otherwise.
  const benchmark = con?.fairProbability ?? input.marketProb;
  /*
   * Edge is measured against the CONSENSUS FAIR PRICE, not against our own
   * probability. This is the most important line in the file.
   *
   * Measuring `modelProbability - breakEven` counts our model's disagreement
   * with the market as profit. On three books quoting identical prices — a
   * market where there is objectively nothing to win — that produced a
   * claimed +16.6pp edge and +0.32 expected value per dollar, every cent of
   * it from the model differing from the market by 19 points. We have no
   * evidence that disagreement is skill: zero graded picks, and the whole
   * reason CLV tracking exists is that it is the thing still to be measured.
   * Presenting it as expected value is inventing a number.
   *
   * So edge, expected value and Kelly all come from the price: the gap
   * between what the consensus says the bet is worth and what the best book
   * will pay for it. That number owes nothing to forecasting skill, which is
   * exactly why it can be trusted today. The model's lean is reported
   * separately and labelled unproven.
   *
   * When the prediction log shows measured skill against the closing line,
   * the model's view can be blended back in at a weight the data supports.
   * Not before.
   */
  const edge = benchmark - rawImplied;
  /** Our forecast's disagreement with the consensus. Unvalidated. */
  const modelLean = input.modelProb - benchmark;
  const movement = readMovement(input.gm, input.meta);
  const conf = computeConfidence({
    sampleGames: input.gm.sampleGames,
    priorGames:
      input.gm.marginBasis === "ratings"
        ? (RATING_PARAMS[input.game.league]?.priorGames ??
           LEAGUE_MODEL[input.game.league].priorGames)
        : LEAGUE_MODEL[input.game.league].priorGames,
    vig: input.gm.vig,
    isModelled: input.isModelled,
    movement,
    basis: input.gm.marginBasis,
    infoQuality: input.gm.infoQuality,
    blindSpots: input.gm.blindSpots,
    consensus: con,
  });
  // Movement is surfaced as a header chip and a confidence factor, so it
  // deliberately doesn't get a third copy in the stat chips.
  const stats = [...input.stats];
  if (input.gm.restNote) {
    stats.push({
      label: "Rest",
      value:
        input.gm.restEdge !== 0
          ? `${input.gm.restNote} (${input.gm.restEdge > 0 ? "+" : ""}${input.gm.restEdge} ${LEAGUE_MODEL[input.game.league].unit} to home)`
          : input.gm.restNote,
    });
  }
  // A push is a refund, so the probability above is conditional on not
  // landing here — worth stating when it's a real chance.
  const push = input.meta.pushProbability ?? 0;
  if (push > 0.005) {
    stats.push({
      label: "Push",
      value: `${(push * 100).toFixed(1)}% (stake returned)`,
    });
  }
  if (con && con.books > 1) {
    stats.push({
      label: "Best of",
      value: `${con.books} books — ${con.bestBook} at ${formatOdds(con.bestAmerican)}${
        con.priceDispersion > 0.005
          ? ` (${(con.priceDispersion * 100).toFixed(1)}pp spread)`
          : ""
      }`,
    });
    stats.push({
      label: "Price edge",
      value:
        `${con.priceEdge >= 0 ? "+" : ""}${(con.priceEdge * 100).toFixed(1)}pp vs consensus fair ` +
        `(±${(con.standardError * 100).toFixed(1)}pp, ${con.edgeSignificance.toFixed(1)}σ` +
        `${con.edgeSignificance >= MIN_EDGE_SIGNIFICANCE ? "" : " — inside noise"})`,
    });
  }
  if (input.gm.impliedSigma != null) {
    stats.push({
      label: "Spread σ",
      value: `${input.gm.impliedSigma} ${LEAGUE_MODEL[input.game.league].unit}, read from the spread + moneyline together`,
    });
  }
  if (input.gm.spreadDistrusted) {
    stats.push({
      label: "Market conflict",
      value: `spread and moneyline disagree by ${Math.abs(input.gm.marginDisagreement ?? 0).toFixed(1)} ${LEAGUE_MODEL[input.game.league].unit} — moneyline used`,
    });
  }
  if (input.gm.marginClamped) {
    stats.push({
      label: "Projection",
      value: "pulled back: the raw margin was impossible against this total",
    });
  }
  if (input.gm.parkFactor !== 1) {
    const pf = input.gm.parkFactor;
    stats.push({
      label: "Park",
      value: `${input.game.home.abbreviation} ${pf.toFixed(2)}× runs (${pf > 1 ? "+" : ""}${((pf - 1) * 100).toFixed(0)}%)`,
    });
  }
  if (input.gm.weatherEffect) {
    const wxEffect = input.gm.weatherEffect;
    stats.push({
      label: "Weather",
      value:
        wxEffect.totalAdjustment !== 0
          ? `${wxEffect.note} → ${wxEffect.totalAdjustment > 0 ? "+" : ""}${wxEffect.totalAdjustment} to the total`
          : wxEffect.note,
    });
  }
  const p = input.gm.pitchers;
  if (p?.home?.era != null || p?.away?.era != null) {
    stats.push({
      label: "Starters",
      value:
        `${p.away?.name ?? "TBD"}${p.away?.era != null ? ` ${p.away.era.toFixed(2)}` : ""}` +
        ` @ ${p.home?.name ?? "TBD"}${p.home?.era != null ? ` ${p.home.era.toFixed(2)}` : ""} ERA`,
    });
  }

  const priceEdge = con ? con.priceEdge : null;
  const saturated =
    input.modelProb >= SATURATION_CEILING ||
    input.modelProb <= 1 - SATURATION_CEILING;

  return {
    id: input.id,
    gameId: input.game.id,
    saturated,
    bestBook: con?.bestBook,
    booksSurveyed: con?.books ?? 1,
    priceEdge: priceEdge === null ? undefined : priceEdge,
    priceDispersion: con?.priceDispersion,
    fairStandardError: con?.standardError,
    edgeSignificance: con?.edgeSignificance,
    riskFlags: buildRiskFlags(
      input.gm, con, input.meta, edge, input.isModelled, movement,
    ),
    justification: buildJustification(input, con, benchmark, edge),
    league: input.game.league,
    matchup: `${input.game.away.abbreviation} @ ${input.game.home.abbreviation}`,
    market: input.market,
    selection: input.selection,
    americanOdds,
    modelProbability: Number(input.modelProb.toFixed(4)),
    marketProbability: Number(benchmark.toFixed(4)),
    breakEvenProbability: Number(rawImplied.toFixed(4)),
    // Fair odds at the CONSENSUS, not at our projection: a "fair price" built
    // from an unvalidated forecast is the same inflation as a model-based EV.
    fairAmericanOdds: fairAmericanOdds(benchmark),
    edge: Number(edge.toFixed(4)),
    expectedValue: Number(expectedValue(benchmark, decimal).toFixed(4)),
    kellyFraction: Number(kellyFraction(benchmark, decimal).toFixed(4)),
    modelLean: Number(modelLean.toFixed(4)),
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
  schedule: Record<string, TeamSchedule> = {},
  injuries: Record<string, TeamInjuryReport> = {},
  ratings: Record<string, TeamRating> = {},
  weather: Record<string, GameWeather> = {},
  modelVote: number | ModelVote = MEASURED_MODEL_SKILL,
  /**
   * Optional collector for market-vs-itself opportunities. Passed in rather
   * than stashed in module state, which on a shared serverless instance
   * could leak one request's findings into another's response.
   */
  collect?: GameOpportunities[],
): SgpLeg[] {
  const oddsByGame = new Map(odds.map((o) => [o.gameId, o]));
  const legs: SgpLeg[] = [];

  for (const g of games) {
    if (g.status === "final") continue;
    const o = oddsByGame.get(g.id);
    if (!o) continue;
    const gm = buildGameModel(
      g, o, scoring, schedule, injuries, ratings, weather, modelVote,
    );
    if (!gm) continue;

    // Survey every book ESPN returned for this game. With one book this
    // degrades to that book's own de-vigged price, and the UI says so.
    const consensus = buildGameConsensus(
      o.books && o.books.length > 0
        ? o.books
        : [
            {
              book: o.book,
              homeMoneyline: o.homeMoneyline,
              awayMoneyline: o.awayMoneyline,
              spread: o.spread,
              spreadHomeOdds: o.spreadHomeOdds,
              spreadAwayOdds: o.spreadAwayOdds,
              total: o.total,
              overOdds: o.overOdds,
              underOdds: o.underOdds,
            },
          ],
    );

    /*
     * Edge that needs no forecast: the market disagreeing with itself.
     *
     * Arbitrage is only looked for among books quoting the SAME line —
     * comparing a -3 against a -6.5 would manufacture a risk-free profit out
     * of two different bets, which is the single easiest way to produce a
     * number that looks spectacular and is false.
     */
    const books = o.books ?? [];
    if (books.length >= 2) {
      const atModalSpread = books.filter(
        (b) => b.spread === consensus.modalSpread,
      );
      const atModalTotal = books.filter(
        (b) => b.total === consensus.modalTotal,
      );

      const arbs = [
        findArbitrage("moneyline", books,
          { label: `${g.home.abbreviation} ML`, pick: (b) => b.homeMoneyline },
          { label: `${g.away.abbreviation} ML`, pick: (b) => b.awayMoneyline }),
        findArbitrage("spread", atModalSpread,
          { label: `${g.home.abbreviation} ${consensus.modalSpread ?? ""}`, pick: (b) => b.spreadHomeOdds },
          { label: `${g.away.abbreviation} ${-(consensus.modalSpread ?? 0)}`, pick: (b) => b.spreadAwayOdds }),
        findArbitrage("total", atModalTotal,
          { label: `Over ${consensus.modalTotal ?? ""}`, pick: (b) => b.overOdds },
          { label: `Under ${consensus.modalTotal ?? ""}`, pick: (b) => b.underOdds }),
      ].filter((a): a is NonNullable<typeof a> => a !== null);

      // Middles need the DIFFERENT lines, priced off the real distribution.
      const spreadMiddles = findMiddles(
        "spread", books, gm.marginDist,
        (b) => (b.spread != null ? -b.spread : undefined),
        (b) => b.spreadHomeOdds,
        (b) => b.spreadAwayOdds,
        {
          low: (line) => `${g.home.abbreviation} ${line > 0 ? "-" : "+"}${Math.abs(line)}`,
          high: (line) => `${g.away.abbreviation} ${line > 0 ? "+" : "-"}${Math.abs(line)}`,
        },
      );
      const totalMiddles = gm.totalDist
        ? findMiddles(
            "total", books, gm.totalDist,
            (b) => b.total,
            (b) => b.overOdds,
            (b) => b.underOdds,
            { low: (l) => `Over ${l}`, high: (l) => `Under ${l}` },
          )
        : [];

      const found: MarketOpportunities = {
        arbitrage: arbs,
        middles: [...spreadMiddles, ...totalMiddles]
          .sort((a, b) => b.expectedValue - a.expectedValue)
          .slice(0, 3),
        stale: findStaleBooks(
          books,
          consensus.moneyline.home?.fairProbability ?? null,
        ),
      };
      if (
        found.arbitrage.length > 0 ||
        found.middles.length > 0 ||
        found.stale.length > 0
      ) {
        collect?.push({
          matchup: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
          ...found,
        });
      }
    }

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
        gm.marginBasis === "ratings"
          ? `adjusted ratings · ${gm.sampleGames.toFixed(1)} eff. games`
          : gm.marginBasis === "scoring"
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
          american: consensus.moneyline.home?.bestAmerican ?? o.homeMoneyline,
          model: pHome,
          market: consensus.moneyline.home?.fairProbability ?? gm.marketHomeWinProb,
          con: consensus.moneyline.home,
        },
        {
          team: g.away,
          opp: g.home,
          isHome: false,
          american: consensus.moneyline.away?.bestAmerican ?? o.awayMoneyline,
          model: 1 - pHome,
          market: consensus.moneyline.away?.fairProbability ?? 1 - gm.marketHomeWinProb,
          con: consensus.moneyline.away,
        },
      ];
      // Price value decides; the model only breaks a tie. See pickSide.
      const best = pickSide(sides);
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
          consensus: best.con,
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
            lambdaHome: gm.lambdaHome,
            lambdaAway: gm.lambdaAway,
            family: gm.marginDist.family,
            totalSigma: gm.totalSigma,
            gridMargin: gm.blendedMargin,
            gridTotal: gm.blendedTotal ?? lm.avgTotal,
            pushProbability: 0, // a moneyline cannot push (no sport allows ties)
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
          american: consensus.spread.home?.bestAmerican ?? priceHome,
          model: pHomeCover,
          threshold: -homeLine,
          con: consensus.spread.home,
        },
        {
          team: g.away,
          isHome: false,
          line: -homeLine,
          american: consensus.spread.away?.bestAmerican ?? priceAway,
          model: 1 - pHomeCover,
          threshold: homeLine,
          con: consensus.spread.away,
        },
      ];
      // Price value decides; the model only breaks a tie. See pickSide.
      const best = pickSide(sides);
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
          marketProb: best.con?.fairProbability ?? marketProb,
          consensus: best.con,
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
            lambdaHome: gm.lambdaHome,
            lambdaAway: gm.lambdaAway,
            family: gm.marginDist.family,
            totalSigma: gm.totalSigma,
            gridMargin: gm.blendedMargin,
            gridTotal: gm.blendedTotal ?? lm.avgTotal,
            pushProbability: Number(pMarginPush(gm, best.threshold).toFixed(4)),
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
          american: consensus.total.home?.bestAmerican ?? priceOver,
          model: pOver,
          market: consensus.total.home?.fairProbability ?? dv.fair[0],
          con: consensus.total.home,
        },
        {
          side: "under" as const,
          selection: `Under ${line}`,
          american: consensus.total.away?.bestAmerican ?? priceUnder,
          model: 1 - pOver,
          market: consensus.total.away?.fairProbability ?? dv.fair[1],
          con: consensus.total.away,
        },
      ];
      // With no scoring data both sides are market-priced, so this reduces to
      // the over — which is exactly the old, honestly-neutral behaviour.
      // Price value decides; the model only breaks a tie. See pickSide.
      const best = pickSide(sides);

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
          consensus: best.con,
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
                basisStat,
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
            lambdaHome: modelled ? gm.lambdaHome : undefined,
            lambdaAway: modelled ? gm.lambdaAway : undefined,
            family: modelled ? gm.totalDist?.family : undefined,
            gridMargin: modelled ? gm.blendedMargin : undefined,
            gridTotal: modelled ? (gm.blendedTotal ?? undefined) : undefined,
            pushProbability: Number((gm.totalDist?.at(line) ?? 0).toFixed(4)),
          },
        }),
      );
    }
  }

  return legs;
}

/**
 * Market-vs-itself edge for one game.
 *
 * These describe a GAME's market rather than any single leg, so they are
 * collected separately instead of being duplicated onto every leg of the
 * same game.
 */
export interface GameOpportunities extends MarketOpportunities {
  matchup: string;
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
    const priced = group.filter((l) => l.modelMeta != null);
    const unpriced = group.filter((l) => l.modelMeta == null);

    // Rebuild this game's joint score distribution from the metadata the legs
    // carry, so the slip's probability is read off the same object that priced
    // each leg individually.
    const seed = priced.find(
      (l) => l.modelMeta?.gridMargin != null && l.modelMeta.gridTotal != null,
    );
    if (seed && priced.length > 0) {
      const m = seed.modelMeta!;
      const grid = buildScoreGrid({
        league: seed.league,
        margin: m.gridMargin!,
        total: m.gridTotal!,
        marginSd: m.sigma ?? 1,
        totalSd: m.totalSigma ?? (m.sigma ?? 1),
        lambdaHome: m.lambdaHome,
        lambdaAway: m.lambdaAway,
      });

      // Collapse every leg in this game into bounds on the two axes.
      const c: RegionConstraints = {};
      const independent: SgpLeg[] = [];
      for (const leg of priced) {
        const mm = leg.modelMeta!;
        if (mm.kind === "margin") {
          const t = mm.threshold ?? 0;
          if (mm.side === "home") {
            c.marginLower = Math.max(c.marginLower ?? -Infinity, t);
          } else {
            c.marginUpper = Math.min(c.marginUpper ?? Infinity, -t);
          }
        } else if (mm.kind === "total" && mm.totalLine != null) {
          // Only fold in a total we actually modelled. An unmodelled total was
          // priced AT the market on purpose; repricing it off our grid here
          // would quietly give it an opinion the leg itself disclaims, and
          // could make the slip's probability exceed that leg's own.
          if (mm.totalMean == null) {
            independent.push(leg);
          } else if (mm.side === "under") {
            c.totalUpper = Math.min(c.totalUpper ?? Infinity, mm.totalLine);
          } else {
            c.totalLower = Math.max(c.totalLower ?? -Infinity, mm.totalLine);
          }
        }
      }
      for (const leg of independent) joint *= leg.modelProbability;
      // One pass over the score grid gives the exact joint probability,
      // including the parity constraint that a margin and a total must agree
      // on — a total of 6 with a margin of 1 cannot happen, which multiplying
      // two separate distributions could never express.
      joint *= gridRegionProbability(grid, c);
    } else {
      for (const leg of priced) joint *= leg.modelProbability;
    }

    for (const leg of unpriced) joint *= leg.modelProbability;
  }

  return joint;
}

/**
 * The slip's probability with MARKET marginals and only the model's
 * correlation structure.
 *
 * The leg-level fix moved edge onto the price but left the slip computing its
 * expected value from `jointProbability`, which is the model's view — so the
 * same inflation survived one level up. The honest construction separates the
 * two things the joint probability is made of:
 *
 *  - the MARGINALS, i.e. how likely each leg is, which the consensus knows
 *    better than we do, and
 *  - the CORRELATION, i.e. how much more likely the legs are together than
 *    their product suggests, which is a structural fact about the sport
 *    (nested thresholds, score parity) rather than a forecast.
 *
 * So take the marginals from the market and borrow only the correlation ratio
 * from the model.
 */
export function jointFairProbability(legs: SgpLeg[]): number {
  if (legs.length === 0) return 0;
  const naiveFair = legs.reduce((acc, l) => acc * l.marketProbability, 1);
  const modelNaive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  const modelJoint = jointProbability(legs);
  // The uplift is 1 for a cross-game slip and >1 for nested same-game legs.
  const uplift = modelNaive > 0 ? modelJoint / modelNaive : 1;
  return clamp(naiveFair * uplift, 0.0001, 0.9999);
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
  /** Market marginals with the model's correlation — the basis for EV. */
  fairProbability: number;
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
  const fairJoint = jointFairProbability(legs);
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
      (stake * expectedValue(fairJoint, decimalOdds)).toFixed(2),
    ),
    fairProbability: Number(fairJoint.toFixed(4)),
    correlated: hasCorrelatedLegs(legs),
  };
}

/**
 * Edge of a single leg: the consensus fair probability minus the break-even
 * at the best available price. Price-based on purpose — see makeLeg.
 */
export function legEdge(leg: SgpLeg): number {
  if (typeof leg.edge === "number") return leg.edge;
  const implied = impliedProbability(americanToDecimal(leg.americanOdds));
  return Number((leg.marketProbability - implied).toFixed(4));
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
  /**
   * Default slip length.
   *
   * Measured, not chosen for how impressive the payout looks. Every leg pays
   * the bookmaker's margin again, so expected value falls almost linearly
   * with length — about 2pp per leg at a one-book price, 2pp with three books
   * shopped. Six legs threw away 16% of the stake in vig before a single
   * forecast was made; three throws away 6-8%, and the compounding is the
   * reason, not the picks.
   *
   * It is not 1 only because a one-leg slip is not the thing this tool is
   * for. Three is the shortest length that is still a parlay. The UI lets the
   * user pick any length up to the cap and prints the expected value of each
   * one next to it, so the cost of going longer is visible while choosing
   * rather than buried in a note.
   */
  minLegs = 3,
  cap = 10,
  maxPerGame = 1,
  modelVote: number | ModelVote = MEASURED_MODEL_SKILL,
  opportunities: GameOpportunities[] = [],
): SgpRecommendation {
  const votes = normalizeVote(modelVote);
  // The headline figure is the larger of the two, since that is the most the
  // model is contributing anywhere on the slip.
  const topVote = Math.max(
    clamp(votes.margin, 0, 1),
    clamp(votes.total, 0, 1),
  );
  // Drop saturated legs before ranking. They would otherwise rank well — a
  // 99.9% probability against any price looks like enormous edge — while
  // being the one part of the distribution we can least justify. See
  // SATURATION_CEILING.
  const excluded = candidates.filter((l) => l.saturated);
  const usable = candidates.filter((l) => !l.saturated);
  const ranked = [...usable].sort((a, b) => legScore(b) - legScore(a));
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

  /*
   * What does the survey actually support?
   *
   * The tool has to be able to come back with nothing. Ranking six
   * negative-expectation legs "least-bad first" and presenting them as picks
   * is the kind of output that looks like analysis and isn't — the honest
   * answer on an efficient market is that there is no play.
   */
  const allBooks = [
    ...new Set(
      candidates.flatMap((l) => (l.bestBook ? [l.bestBook] : [])),
    ),
  ];
  const maxBooks = Math.max(1, ...candidates.map((l) => l.booksSurveyed ?? 1));
  const priceEdges = candidates
    .map((l) => l.priceEdge)
    .filter((e): e is number => e != null);
  const bestPriceEdge = priceEdges.length > 0 ? Math.max(...priceEdges) : 0;
  // A positive sign is not enough: the edge has to clear the books' own
  // disagreement. See MIN_EDGE_SIGNIFICANCE.
  const isValue = (l: SgpLeg) =>
    legEdge(l) > 0 &&
    (l.edgeSignificance ?? 0) >= MIN_EDGE_SIGNIFICANCE;
  const valueLegs = usable.filter(isValue).length;
  const marginalLegs = usable.filter(
    (l) => legEdge(l) > 0 && !isValue(l),
  ).length;
  const meanVigRaw =
    candidates.length > 0
      ? candidates.reduce((acc, l) => acc + (l.breakEvenProbability - l.marketProbability), 0) /
        candidates.length
      : 0;

  const verdict: SgpRecommendation["verdict"] =
    valueLegs > 0 ? "value" : maxBooks > 1 ? "no-edge" : "single-book";

  const combinedDecimalOdds = combineLegs(legs);
  const adjusted = jointProbability(legs);
  const naive = legs.reduce((acc, l) => acc * l.modelProbability, 1);
  const correlated = hasCorrelatedLegs(legs);

  const basisCounts = legs.reduce<Record<string, number>>((acc, l) => {
    const b = l.supportingStats.find((s) => s.label === "Basis")?.value ?? "";
    const key = b.startsWith("adjusted")
      ? "ratings"
      : b.startsWith("scoring")
        ? "scoring"
        : b.startsWith("season")
          ? "record"
          : "market";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const families: string[] = [
    ...new Set(
      legs
        .map((l) => l.modelMeta?.family)
        .filter((f): f is NonNullable<typeof f> => f != null),
    ),
  ];

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
      label: "Model vote",
      detail:
        topVote > 0
          ? `margin ${Math.round(clamp(votes.margin, 0, 1) * 100)}% · total ${Math.round(clamp(votes.total, 0, 1) * 100)}% — measured`
          : "0% — no measured skill",
    },
    {
      label: "Books surveyed",
      detail: maxBooks > 1 ? `${maxBooks} — shopped` : "1 — no shopping",
    },
    {
      label: "Value legs",
      detail:
        valueLegs > 0
          ? `${valueLegs} clear ${MIN_EDGE_SIGNIFICANCE}σ`
          : marginalLegs > 0
            ? `0 — ${marginalLegs} inside noise`
            : "none today",
    },
    {
      label: "Distribution",
      detail: families.length ? families.join(" + ") : "—",
    },
    {
      label: "Schedule-adjusted",
      detail: `${basisCounts.ratings ?? 0}/${legs.length} legs`,
    },
    {
      label: "Weather-adjusted",
      detail: `${legs.filter((l) => l.supportingStats.some((s) => s.label === "Weather")).length} legs`,
    },
    {
      label: "Push risk priced",
      detail: `${legs.filter((l) => (l.modelMeta?.pushProbability ?? 0) > 0.005).length} legs`,
    },
    {
      label: "Information",
      detail: `${Math.round(
        (legs.reduce(
          (acc, l) =>
            acc +
            (l.confidenceFactors.find((f) => f.label === "Information")?.value ??
              1),
          0,
        ) /
          Math.max(1, legs.length)) *
          100,
      )}% avg`,
    },
  ];

  const notes: string[] = [
    topVote === 0
      ? "Our own forecast currently votes ZERO on the published probability, and that is deliberate. Blending an independent view into a well-calibrated price only helps if the view carries information the price lacks; if it doesn't, the blend is the price plus noise, and adding noise to a calibrated probability strictly increases error — simulated at 2.5% of skill score at the weight this model used to carry, monotonically worse the more it votes. We have no measured evidence our deviation is skill (zero graded picks) and good reason to doubt it, since everything the model knows is public season data the market already has, along with lineups and injuries it doesn't. So the probability you see tracks the consensus; the projection is shown as context. The weight rises only when the prediction log measures skill against the closing line."
      : `Our forecast votes ${Math.round(clamp(votes.margin, 0, 1) * 100)}% of its cap on the margin and ${Math.round(clamp(votes.total, 0, 1) * 100)}% on the total — weights the backtest regression measured against the closing line, market by market, not ones anybody chose. The two are measured separately because they are separate claims: a margin result is not evidence about totals, and the significance bar each had to clear is corrected for how many league-by-market cells were tested, so a vote cannot be opened by the one cell out of twelve that happened to look good.`,
    "Skill is measured per league AND per market, with the significance bar corrected for how many cells were tested. Sides and totals are different problems — sides take most of the action, totals are softer in most books — so one league-wide fit averaged a possible soft spot against efficiency in the other market and lost it. Splitting them means more tests, and more tests means more chances to be fooled: six leagues judged at the conventional two standard errors carries a 26.5% chance that at least one looks significant on noise alone, and twelve league-by-market cells carries 46%. The bar is therefore raised to spend one 5% error budget across every cell tested — twelve cells require |t| > 2.87 rather than 2.00 — so the vote cannot be opened by whichever cell happened to look best. Totals are also now error-checked against the closing total out-of-sample, which they never were before; the totals opinion was previously carrying weight on the strength of a margin measurement.",
    "What the model contributes instead is structural rather than predictive, and none of it depends on out-forecasting anyone: the shape of the outcome distribution, push probability on integer lines, exact same-game correlation, and a consensus across books that is a better estimate than any single book's price.",
    `Model ${MODEL_VERSION}: one projected margin and one projected total per game, from opponent-adjusted team ratings — an offense/defense pair solved from recent results so strength of schedule is divided out, with each game weighted by how recently it was played. Because the margin is net(home) − net(away) + home edge by construction, it is the same arithmetic the total uses, so the two markets can't contradict each other. Shrunk toward the de-vigged market by at most ${Math.round(MAX_MODEL_WEIGHT * 100)}% on the margin and ${Math.round(MAX_TOTAL_WEIGHT * 100)}% on the total; games with no results window fall back to unadjusted scoring rates (${Math.round(MAX_SCORING_WEIGHT * 100)}%), then the market alone. A win%-only prior is deliberately given no weight: it cannot separate two teams with the same record and opposite point differentials, it yields no totals opinion, and it fires exactly when we know least — so it only added motion, not signal.`,
    "The book's margin is removed with Shin's method rather than by proportional normalization. Books load more margin onto longshots, so splitting it evenly overstates a longshot's fair price and understates a heavy favourite's — which would read as free edge on exactly the short moneylines a parlay is built from.",
    "Only true point spreads are read as the market's projected margin. A hockey puck line or baseball run line is fixed at ±1.5 and priced through its odds, so those games take their margin from the moneyline instead. The spread and the moneyline are also cross-checked against each other in probability space: when they disagree by more than 10 points about who wins, the spread is the signal more likely to have been misparsed, so the moneyline wins and the game is flagged.",
    "The margin's standard deviation is read from the market rather than assumed where possible: a posted spread and a moneyline are two prices on the same distribution and together they pin its width. A 5.5-point spread priced at 64.8% implies σ ≈ 14.5, not the 12.0 this model asserted — and assuming it left our own moneyline probability 3 points off the moneyline price. Reading it instead makes the model agree with both market signals at once. Where that inversion is ill-conditioned (near a pick'em) it falls back to scaling with the posted total: more scoring means more variance. The count-model sports get this automatically, since a Poisson difference takes its variance from the projected scores.",
    "Each game is modelled as a joint distribution over the two final scores, and every market is a marginal of that one object. This makes a same-game slip exact rather than approximate: a margin leg and a total leg are scored against outcomes that can actually occur together, including the parity constraint the old independent model violated (a total of 6 with a margin of 1 cannot happen).",
    "Baseball totals carry a park factor, because our scoring inputs are season aggregates across every park a team visited while the posted total is park-specific — Coors and Petco differ by nearly 20% in run environment, and without this our projection was systematically low in one and high in the other.",
    "The schedule model goes beyond back-to-backs: days of rest, three games in four nights, four in six, flight distance and time zones crossed since the last game, and long road trips. Only the asymmetry between the two sides counts, and the whole adjustment is capped.",
    "Outdoor NFL and MLB games carry a forecast adjustment to the projected total — wind, cold and rain suppress football scoring; heat raises baseball scoring. Baseball wind is deliberately NOT applied, because its effect depends on which way the stadium faces and we don't have that, so it is recorded as a known unknown instead of guessed.",
    `Each sport is priced on its own distribution${families.length ? ` (${families.join(", ")})` : ""}, not a single normal curve: hockey and baseball margins are a difference of two Poissons, football margins are reweighted toward the key numbers 3 and 7, and basketball uses a discretized normal. Every distribution is discrete, so a line that can be landed on exactly carries real push mass and the published probability is conditional on not pushing.`,
    "Injuries are detected but never quantified. We can't tell a starter from a third-stringer from this feed, so a team with players out reduces how much the model's own view counts rather than moving the projection — the model defers to the market precisely where it is least informed.",
    "Edge, expected value and Kelly are measured from the PRICE: the gap between the consensus fair value across the surveyed books and the break-even at the best number any of them offers. Our own projection is reported but deliberately excluded from those figures, because we have no measured evidence yet that its disagreement with the market is skill rather than noise — that is what the closing-line log exists to find out. Counting it would have claimed +16.6pp of edge on a market where three books quoted identical prices and there was nothing to win.",
    "An outlier price sets the best price but never the benchmark. A book quoting a two-way market below 100% is arbitraging itself, which in practice means one of its numbers is stale — the least reliable estimate of the truth even when it is the best thing to bet into.",
    "Line movement since the market opened is reported and folded into confidence, but never into the probability: the current price already contains it, so adding it again would double-count the same information.",
    "Back-to-backs are read from the last two days of results and applied inside our projection (NBA/NCAAB ~1.5-1.8 pts, NHL ~0.2 goals), so a rested team is never credited twice.",
  ];
  if (verdict === "single-book") {
    notes.push(
      `Only one bookmaker was available for these games, so no line shopping was possible. Against a single book you are comparing our projection to that book's own de-vigged price and then paying its hold — roughly ${(Math.max(0, meanVigRaw) * 100).toFixed(1)}% here — so every leg is negative expectation by construction. That is the correct answer, not a model failure: these are the least-bad options, not plays. Real edge on free data comes from paying a better price than the consensus, which needs more than one price.`,
    );
  } else if (verdict === "no-edge") {
    notes.push(
      `${maxBooks} bookmakers were surveyed and no leg clears the bar. The best price gap found was ${(bestPriceEdge * 100).toFixed(1)} points${
        marginalLegs > 0
          ? `, and ${marginalLegs} leg${marginalLegs === 1 ? " shows a" : "s show"} positive gap${marginalLegs === 1 ? "" : "s"} smaller than the books' own disagreement with each other — which is noise, not edge`
          : ""
      }. An efficient market producing nothing is the expected result, so the slip below is the least-bad set rather than a recommendation.`,
    );
  } else {
    notes.push(
      `${valueLegs} of ${usable.length} legs are available at a price better than the consensus fair value across ${maxBooks} books by at least ${MIN_EDGE_SIGNIFICANCE} standard errors — a gap of up to ${(bestPriceEdge * 100).toFixed(1)} probability points, measured against how far those books disagree with each other. That edge comes from the PRICE, not from the projection: it is the same bet, at a number one book has moved and the others have not. It is also perishable, since those books move too.`,
    );
  }
  if (excluded.length > 0) {
    notes.push(
      `${excluded.length} leg${excluded.length === 1 ? "" : "s"} were left out for being near-certainties (${excluded.map((l) => l.selection).slice(0, 3).join(", ")}${excluded.length > 3 ? ", …" : ""}). At those probabilities the published figure is a clamp rather than an estimate, the expected-value and Kelly numbers derived from it are meaningless, and the market prices the same near-certainty — so there is nothing there to act on.`,
    );
  }
  if (basisCounts.ratings || basisCounts.scoring) {
    notes.push(
      `${basisCounts.ratings ?? 0} of ${legs.length} legs are backed by schedule-adjusted ratings, ${basisCounts.scoring ?? 0} by unadjusted scoring rates, ${basisCounts.record ?? 0} by season record alone and ${basisCounts.market ?? 0} by the market only.`,
    );
  }
  const fairJoint = jointFairProbability(legs);
  const ev = expectedValue(fairJoint, combinedDecimalOdds);
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
    fairProbability: Number(fairJoint.toFixed(4)),
    fairAmericanOdds: fairAmericanOdds(fairJoint),
    expectedValue: Number(
      expectedValue(fairJoint, combinedDecimalOdds).toFixed(4),
    ),
    correlated,
    /** EV is only meaningful when the combined price is actually obtainable. */
    expectedValueIsTheoretical: correlated,
    candidates: ranked,
    opportunities,
    modelVersion: MODEL_VERSION,
    inputs,
    modelVote: {
      weight: Number(topVote.toFixed(3)),
      marginWeight: Number(clamp(votes.margin, 0, 1).toFixed(3)),
      totalWeight: Number(clamp(votes.total, 0, 1).toFixed(3)),
      source: topVote > 0 ? "measured" : "gated",
    },
    verdict,
    marketSurvey: {
      books: allBooks,
      valueLegs,
      meanVig: Number(Math.max(0, meanVigRaw).toFixed(4)),
      bestPriceEdge: Number(bestPriceEdge.toFixed(4)),
    },
    notes,
    disclaimer: SGP_DISCLAIMER,
  };
}
