import type { CompletedGame, League, TeamRating } from "@/types";

/**
 * Opponent-adjusted team ratings.
 *
 * Raw points for/against doesn't know who you played. In October that is a
 * severe bias: a team that has faced three bad defences looks elite, and two
 * teams with identical records can have opposite point differentials. This
 * solves for ratings that explain the actual results, so strength of schedule
 * is divided out.
 *
 * The model is the standard additive decomposition, in deviations from the
 * league's average score:
 *
 *     pointsFor(i vs j, i home) - leagueAvg = offense(i) + defense(j) + hfa/2
 *
 * Solved by iterative weighted averaging (the classic "simple rating system"
 * fixed point) rather than a matrix inversion — it converges in a few dozen
 * passes, needs no linear algebra, and degrades gracefully on a sparse
 * schedule.
 *
 * Two properties fall out for free:
 *
 *  - A net rating, `offense - defense`, which gives the projected margin as
 *    `net(home) - net(away) + hfa`. That is *algebraically* the same number
 *    the offense/defense pair gives for the total, so the margin and total
 *    projections can never contradict each other.
 *  - Recency weighting: a game's influence decays with age, because a team's
 *    last ten games predict better than its first ten.
 */

export interface RatingParams {
  /** Home advantage in margin units, split between the two sides. */
  homeEdge: number;
  /**
   * Days after which a game counts half as much. Shorter for sports that
   * change fast (basketball rotations) than for ones with long stable
   * seasons.
   */
  halfLifeDays: number;
  /**
   * Shrinkage constant, in effective games. A team with few weighted games
   * has its rating pulled toward league average.
   */
  priorGames: number;
  /** Fixed-point iterations. Convergence is fast; this is a safety bound. */
  iterations?: number;
}

/**
 * Update damping for the fixed point.
 *
 * Updating every rating simultaneously from the previous pass (Jacobi) can
 * oscillate rather than converge when the schedule is sparse: with a single
 * game between two teams the offense and defense estimates trade the whole
 * margin back and forth every pass, so the answer you get depends on whether
 * you stopped on an even or odd iteration. Moving each rating only part of
 * the way to its target each pass damps that out and converges to the same
 * fixed point on dense schedules.
 */
const DAMPING = 0.5;

export const RATING_PARAMS: Record<League, RatingParams> = {
  NBA: { homeEdge: 2.2, halfLifeDays: 30, priorGames: 8, iterations: 150 },
  NFL: { homeEdge: 1.6, halfLifeDays: 45, priorGames: 4, iterations: 150 },
  NHL: { homeEdge: 0.25, halfLifeDays: 35, priorGames: 10, iterations: 150 },
  MLB: { homeEdge: 0.2, halfLifeDays: 40, priorGames: 15, iterations: 150 },
  NCAAF: { homeEdge: 2.4, halfLifeDays: 45, priorGames: 3, iterations: 150 },
  NCAAB: { homeEdge: 3.0, halfLifeDays: 30, priorGames: 6, iterations: 150 },
};

export interface RatingsResult {
  league: League;
  /** Keyed by team id. */
  teams: Record<string, TeamRating>;
  /** Average points scored by one team in one game, over the window. */
  leagueAvgScore: number;
  /** Games that fed the solve. */
  gameCount: number;
  /** Fixed-point residual at the last pass, for diagnostics. */
  residual: number;
}

const EMPTY = (league: League): RatingsResult => ({
  league,
  teams: {},
  leagueAvgScore: 0,
  gameCount: 0,
  residual: 0,
});

/** Exponential decay: a game `age` days old counts 0.5^(age/halfLife). */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 1;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

interface Side {
  /** This team's weighted observations: what it scored and conceded. */
  scored: { value: number; opponent: string; weight: number; hfaShare: number }[];
  conceded: { value: number; opponent: string; weight: number; hfaShare: number }[];
  weight: number;
  games: number;
}

/**
 * Solve one league's ratings from its completed games.
 *
 * `asOf` exists so the recency weights are computed against a caller-supplied
 * instant rather than a clock read inside the solver — which keeps this pure
 * and makes the tests deterministic.
 */
export function buildRatings(
  league: League,
  games: CompletedGame[],
  params: RatingParams,
  asOf: number,
): RatingsResult {
  const usable = games.filter(
    (g) =>
      g.league === league &&
      g.homeId &&
      g.awayId &&
      g.homeId !== g.awayId &&
      Number.isFinite(g.homeScore) &&
      Number.isFinite(g.awayScore),
  );
  if (usable.length === 0) return EMPTY(league);

  const half = params.homeEdge / 2;
  const sides = new Map<string, Side>();
  const side = (id: string): Side => {
    let s = sides.get(id);
    if (!s) {
      s = { scored: [], conceded: [], weight: 0, games: 0 };
      sides.set(id, s);
    }
    return s;
  };

  let weightedScore = 0;
  let totalWeight = 0;

  for (const g of usable) {
    const ageDays = (asOf - +new Date(g.date)) / 86_400_000;
    const w = recencyWeight(ageDays, params.halfLifeDays);
    if (!(w > 0)) continue;

    const home = side(g.homeId);
    const away = side(g.awayId);

    // Home scoring carries +hfa/2; away scoring carries -hfa/2.
    home.scored.push({ value: g.homeScore, opponent: g.awayId, weight: w, hfaShare: half });
    home.conceded.push({ value: g.awayScore, opponent: g.awayId, weight: w, hfaShare: -half });
    away.scored.push({ value: g.awayScore, opponent: g.homeId, weight: w, hfaShare: -half });
    away.conceded.push({ value: g.homeScore, opponent: g.homeId, weight: w, hfaShare: half });

    home.weight += w;
    away.weight += w;
    home.games++;
    away.games++;
    weightedScore += w * (g.homeScore + g.awayScore);
    totalWeight += 2 * w;
  }

  if (totalWeight <= 0) return EMPTY(league);
  const leagueAvgScore = weightedScore / totalWeight;

  // Fixed point: each team's offense is the average of what it scored, net of
  // the opponents' defensive ratings; each defense is the mirror image.
  const ids = [...sides.keys()];
  const off = new Map<string, number>(ids.map((id) => [id, 0]));
  const def = new Map<string, number>(ids.map((id) => [id, 0]));

  let residual = 0;
  const iterations = params.iterations ?? 150;
  for (let pass = 0; pass < iterations; pass++) {
    residual = 0;
    const nextOff = new Map<string, number>();
    const nextDef = new Map<string, number>();

    for (const id of ids) {
      const s = sides.get(id)!;
      let oNum = 0;
      let oDen = 0;
      for (const obs of s.scored) {
        // observed - leagueAvg - opponentDefense - hfaShare  =>  offense
        oNum +=
          obs.weight *
          (obs.value - leagueAvgScore - (def.get(obs.opponent) ?? 0) - obs.hfaShare);
        oDen += obs.weight;
      }
      let dNum = 0;
      let dDen = 0;
      for (const obs of s.conceded) {
        // The opponent scored this against us; strip their offense and the
        // home share that applied to THEM.
        dNum +=
          obs.weight *
          (obs.value - leagueAvgScore - (off.get(obs.opponent) ?? 0) - obs.hfaShare);
        dDen += obs.weight;
      }
      nextOff.set(id, oDen > 0 ? oNum / oDen : 0);
      nextDef.set(id, dDen > 0 ? dNum / dDen : 0);
    }

    // Re-centre so the ratings stay deviations from league average. Without
    // this the offense and defense scales drift against each other.
    const meanOff = mean([...nextOff.values()]);
    const meanDef = mean([...nextDef.values()]);
    for (const id of ids) {
      const prevO = off.get(id) ?? 0;
      const prevD = def.get(id) ?? 0;
      const targetO = (nextOff.get(id) ?? 0) - meanOff;
      const targetD = (nextDef.get(id) ?? 0) - meanDef;
      // Damped step — see DAMPING.
      const o = prevO + DAMPING * (targetO - prevO);
      const d = prevD + DAMPING * (targetD - prevD);
      residual += Math.abs(o - prevO) + Math.abs(d - prevD);
      off.set(id, o);
      def.set(id, d);
    }
    if (residual < 1e-9) break;
  }

  // Shrink toward league average by effective sample, so a team with two
  // games doesn't arrive with an extreme rating.
  const teams: Record<string, TeamRating> = {};
  for (const id of ids) {
    const s = sides.get(id)!;
    const shrink = s.weight / (s.weight + params.priorGames);
    const o = (off.get(id) ?? 0) * shrink;
    const d = (def.get(id) ?? 0) * shrink;
    teams[id] = {
      teamId: id,
      offense: round(o),
      defense: round(d),
      net: round(o - d),
      games: s.games,
      effectiveGames: round(s.weight),
    };
  }

  return {
    league,
    teams,
    leagueAvgScore: round(leagueAvgScore),
    gameCount: usable.length,
    residual: round(residual),
  };
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(x: number): number {
  return Number(x.toFixed(4));
}

/** Solve every league present in the results, keyed `${league}:${teamId}`. */
export function buildAllRatings(
  games: CompletedGame[],
  asOf: number,
): {
  ratings: Record<string, TeamRating>;
  byLeague: Partial<Record<League, RatingsResult>>;
} {
  const ratings: Record<string, TeamRating> = {};
  const byLeague: Partial<Record<League, RatingsResult>> = {};
  const leagues = [...new Set(games.map((g) => g.league))];

  for (const league of leagues) {
    const params = RATING_PARAMS[league];
    if (!params) continue;
    const result = buildRatings(league, games, params, asOf);
    byLeague[league] = result;
    for (const [teamId, rating] of Object.entries(result.teams)) {
      ratings[`${league}:${teamId}`] = rating;
    }
  }
  return { ratings, byLeague };
}

/**
 * Rest and back-to-backs, derived from the same results window.
 *
 * Previously this came from its own pair of requests. Folding it into the
 * ratings window means one source of truth and fewer calls.
 */
export function restFromResults(
  games: CompletedGame[],
  asOf: number,
): Record<string, { teamId: string; daysSinceLastGame: number; gamesInWindow: number }> {
  const out: Record<
    string,
    { teamId: string; daysSinceLastGame: number; gamesInWindow: number }
  > = {};
  for (const g of games) {
    const ageDays = (asOf - +new Date(g.date)) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays < 0) continue;
    // Calendar days back, so a game late last night reads as 1, not 0.
    const daysAgo = Math.max(1, Math.ceil(ageDays));
    for (const teamId of [g.homeId, g.awayId]) {
      if (!teamId) continue;
      const key = `${g.league}:${teamId}`;
      const prev = out[key];
      out[key] = {
        teamId,
        daysSinceLastGame: Math.min(prev?.daysSinceLastGame ?? Infinity, daysAgo),
        gamesInWindow: (prev?.gamesInWindow ?? 0) + (daysAgo <= 3 ? 1 : 0),
      };
    }
  }
  return out;
}
