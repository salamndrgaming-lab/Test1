import type { PlayerGameLine } from "@/lib/providers/playerlogs";

/**
 * A player prop simulated from the player's own games, not from the book.
 *
 * What changed, and why it matters. The earlier approach read a player's
 * distribution out of the several lines bookmakers post for them. It was
 * honest about its inputs, but it could never disagree with the book about
 * whether a prop hits: the book's number was the answer and the simulation
 * only added co-movement. To say anything the market has not said, the
 * distribution must come from the player's statistics.
 *
 * The method here is deliberately non-parametric, because the honest
 * alternative is worse. Fitting a negative binomial to nine games means
 * choosing a dispersion parameter the data cannot pin down, and the fitted
 * curve would then look authoritative about tails that nothing observed. So:
 *
 *   RESAMPLE WHOLE GAMES. Each simulated game draws one of the player's
 *   actual games and uses what happened in it.
 *
 * That assumes nothing about shape. It also makes the ceiling obvious: with
 * nine games, the support of the distribution has nine points, and every
 * probability it produces is a multiple of 1/9 before coupling.
 *
 * Two markets are treated differently, because one can be tied to the game
 * being simulated and the others cannot:
 *
 * POINTS are a slice of the scoreboard. A player's share of their team's
 * points is measured per game, and tonight's simulated team score multiplies
 * it. This is the part that beats "what fraction of their games cleared the
 * line": tonight's projected scoring is not the average of past opponents',
 * and a share applied to a projection reflects that. The coupling is
 * structural and both of its terms are measured.
 *
 * REBOUNDS, ASSISTS and THREES are not slices of any number this model
 * projects. The relationships are real — rebounds rise with missed shots —
 * but estimating them needs more than nine games, and a correlation fitted
 * from nine is noise with a sign. So those are resampled on their own terms
 * and reported as what they are: the player's own history, with minutes, and
 * no claim about tonight's pace.
 *
 * Everything carries its sample size and a bootstrap interval, and those
 * intervals are usually wide enough to say the quiet part: a nine-game
 * history cannot reliably tell a 50% prop from a 60% one. That is the true
 * state of the data in early November, not a flaw in the reporting of it.
 */

export type PlayerMarket = "points" | "rebounds" | "assists" | "threes";

export const MARKET_FIELD: Record<PlayerMarket, keyof PlayerGameLine> = {
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  threes: "threes",
};

/** A player's observed history for one market. */
export interface PlayerSample {
  player: string;
  teamId: string;
  teamAbbr: string;
  market: PlayerMarket;
  /** One value per game played, oldest first. */
  values: number[];
  /** Minutes in each of those games, same order. */
  minutes: number[];
  /** Share of the team's points, same order. Only meaningful for points. */
  shares: number[];
  mean: number;
  sd: number;
  /** Games the player actually appeared in. */
  games: number;
  /** Mean minutes, because a prop on a 12-minute player is a different bet. */
  meanMinutes: number;
}

/** Collect one market's history for every player in the lines. */
export function samplesFor(
  lines: PlayerGameLine[],
  market: PlayerMarket,
  minMinutes = 1,
): PlayerSample[] {
  const field = MARKET_FIELD[market];
  const byPlayer = new Map<string, PlayerGameLine[]>();
  for (const l of lines) {
    if (l.minutes < minMinutes) continue;
    const k = `${l.teamId}|${l.player}`;
    const g = byPlayer.get(k);
    if (g) g.push(l);
    else byPlayer.set(k, [l]);
  }

  const out: PlayerSample[] = [];
  for (const rows of byPlayer.values()) {
    const values = rows.map((r) => Number(r[field]) || 0);
    const minutes = rows.map((r) => r.minutes);
    const shares = rows.map((r) =>
      r.teamPoints > 0 ? r.points / r.teamPoints : 0,
    );
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1),
    );
    out.push({
      player: rows[0].player,
      teamId: rows[0].teamId,
      teamAbbr: rows[0].teamAbbr,
      market,
      values,
      minutes,
      shares,
      mean,
      sd,
      games: n,
      meanMinutes: minutes.reduce((a, b) => a + b, 0) / n,
    });
  }
  return out.sort((a, b) => b.mean - a.mean);
}

export interface PlayerProjection {
  player: string;
  teamAbbr: string;
  market: PlayerMarket;
  /** The line this was graded against. */
  line: number;
  /** Simulated probability of going over it. */
  hitRate: number;
  /** 90% bootstrap interval on that probability, from resampling the games. */
  lo: number;
  hi: number;
  /** Mean of the simulated outcome. */
  projected: number;
  /** The player's raw per-game average, for comparison with the projection. */
  historicalMean: number;
  /** How often their actual games cleared this line — the naive answer. */
  historicalHitRate: number;
  games: number;
  meanMinutes: number;
  /** Whether the simulated game's scoring fed into this. */
  coupledToGame: boolean;
  /** Hit rate in runs where the game went over its total. Points only. */
  hitGivenOver?: number;
  hitGivenUnder?: number;
}

/**
 * Simulate one player's market against a line, on the game's own draws.
 *
 * `teamTotals` is one simulated score for the PLAYER'S team per run, taken
 * from the same grid the rest of the panel samples, so the player's outcome
 * and the game's outcome come from one draw rather than two.
 *
 * For points: each run resamples a game, takes that game's share of team
 * scoring, and applies it to that run's simulated team score. For everything
 * else: each run resamples a game and uses the value, with no pretence that
 * tonight's pace entered into it.
 */
export function simulatePlayer(
  sample: PlayerSample,
  line: number,
  teamTotals: number[],
  gameTotals: number[],
  overUnderLine: number,
  rnd: () => number,
): PlayerProjection {
  const runs = Math.min(teamTotals.length, gameTotals.length);
  const n = sample.values.length;
  const coupled = sample.market === "points" && sample.shares.some((s) => s > 0);

  let hits = 0, sum = 0;
  let hitOver = 0, hitUnder = 0, overRuns = 0, underRuns = 0;
  const drawn = new Float64Array(runs);
  for (let i = 0; i < runs; i++) {
    const g = Math.min(n - 1, Math.floor(rnd() * n));
    const value = coupled ? sample.shares[g] * teamTotals[i] : sample.values[g];
    drawn[i] = value;
    sum += value;
    const over = value > line;
    if (over) hits++;
    if (gameTotals[i] > overUnderLine) {
      overRuns++;
      if (over) hitOver++;
    } else if (gameTotals[i] < overUnderLine) {
      underRuns++;
      if (over) hitUnder++;
    }
  }

  /*
   * The interval is the point of this whole exercise.
   *
   * Resampling WHICH GAMES WE SAW, not just within them: each bootstrap
   * replicate draws n games with replacement from the n observed, and reruns
   * the hit rate on that replicate. That propagates the thing that actually
   * dominates the uncertainty here — that we have nine games and a different
   * nine would have said something else. A sampling interval taken only over
   * simulation runs would shrink with more runs and tell the reader nothing,
   * which would be worse than silence.
   */
  const REPLICATES = 300;
  const rates: number[] = [];
  for (let b = 0; b < REPLICATES; b++) {
    const idx: number[] = [];
    for (let k = 0; k < n; k++) idx.push(Math.min(n - 1, Math.floor(rnd() * n)));
    let h = 0;
    const perRep = Math.max(50, Math.floor(runs / 20));
    for (let i = 0; i < perRep; i++) {
      const g = idx[Math.min(n - 1, Math.floor(rnd() * n))];
      const t = teamTotals[Math.min(runs - 1, Math.floor(rnd() * runs))];
      const value = coupled ? sample.shares[g] * t : sample.values[g];
      if (value > line) h++;
    }
    rates.push(h / perRep);
  }
  rates.sort((a, b) => a - b);
  const q = (p: number) => rates[Math.min(rates.length - 1, Math.floor(p * rates.length))];

  return {
    player: sample.player,
    teamAbbr: sample.teamAbbr,
    market: sample.market,
    line,
    hitRate: runs > 0 ? hits / runs : 0,
    lo: q(0.05),
    hi: q(0.95),
    projected: runs > 0 ? sum / runs : 0,
    historicalMean: sample.mean,
    historicalHitRate:
      sample.values.filter((v) => v > line).length / Math.max(1, n),
    games: sample.games,
    meanMinutes: sample.meanMinutes,
    coupledToGame: coupled,
    ...(coupled
      ? {
          hitGivenOver: overRuns ? hitOver / overRuns : 0,
          hitGivenUnder: underRuns ? hitUnder / underRuns : 0,
        }
      : {}),
  };
}

/**
 * Is this estimate strong enough to argue with a price?
 *
 * Deliberately strict, and deliberately shown. A 90% interval that straddles
 * the market's own probability means the history cannot distinguish the two,
 * and a disagreement inside that interval is not a finding. With nine games
 * most rows will fail this, which is the correct answer in early November
 * rather than a reason to loosen it.
 */
export function beatsMarket(
  p: PlayerProjection,
  marketProbability: number,
): { verdict: "model-higher" | "model-lower" | "indistinguishable"; gap: number } {
  const gap = p.hitRate - marketProbability;
  if (marketProbability > p.lo && marketProbability < p.hi) {
    return { verdict: "indistinguishable", gap };
  }
  return { verdict: gap > 0 ? "model-higher" : "model-lower", gap };
}

/** The smallest history worth simulating at all. */
export const MIN_GAMES = 4;
