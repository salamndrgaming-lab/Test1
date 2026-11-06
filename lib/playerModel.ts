import type { PlayerGameLine } from "@/lib/providers/playerlogs";
import type { League } from "@/types";
import { fairAmericanOdds } from "@/lib/sgp";

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
 * There is NO market input anywhere in this file. The thresholds are chosen
 * from the player's own simulated distribution, and the odds beside them are
 * the fair odds for the probability the games imply — not a comparison with
 * anything posted, and not de-vigged from anyone's price. What a book thinks
 * is a separate question, asked on a separate panel.
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

/**
 * Which stats are a slice of the number the game model projects.
 *
 * Points in a sport whose scoreboard counts points can be written as a share
 * of the team's score, so tonight's projected scoring enters the projection.
 * Nothing else here can: rebounds plainly co-move with missed shots, but
 * estimating that needs far more than a season's opening weeks, and a
 * correlation fitted from nine games is noise with a sign.
 */
export function couplesToScoreboard(
  league: League,
  market: PlayerMarket,
): boolean {
  return market === "points" && (league === "NBA" || league === "NCAAB");
}

/** One threshold, with the odds the player's own games imply for it. */
export interface LadderRung {
  line: number;
  /** Simulated probability of clearing it. */
  pOver: number;
  /** Fair odds for each side at that probability — no margin, no book. */
  overOdds: number;
  underOdds: number;
  /** 90% range on pOver, from resampling which games we saw. */
  lo: number;
  hi: number;
  /** True when the range is wide enough that the rung says little. */
  uncertain: boolean;
}

/**
 * How wide a 90% range has to be before a rung is called uninformative.
 *
 * A range of 25 points or more spans most of the plausible prices for a prop,
 * so the rung cannot distinguish a good number from a bad one. In the opening
 * weeks of a season most rungs will exceed this, and saying so is the point.
 */
export const UNINFORMATIVE_RANGE = 0.25;

/**
 * The thresholds this player's own distribution makes worth quoting.
 *
 * Chosen from the simulated outcomes rather than from anything posted: the
 * half-points spanning the middle of the distribution, capped so the table
 * stays readable. A rung the player clears 99% or 1% of the time carries no
 * information and is left off.
 */
export function ladderLines(drawn: number[], maxRungs = 7): number[] {
  if (drawn.length === 0) return [];
  const sorted = [...drawn].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const lo = Math.floor(q(0.1));
  const hi = Math.ceil(q(0.9));
  const out: number[] = [];
  const step = Math.max(1, Math.ceil((hi - lo) / maxRungs));
  for (let v = lo; v <= hi && out.length < maxRungs; v += step) out.push(v + 0.5);
  return out;
}

/**
 * Everything the player's games say, with no market input of any kind.
 *
 * The draws are generated once and every rung is read off the same set, so
 * the ladder is internally consistent: P(over 19.5) can never exceed
 * P(over 18.5) because of sampling noise between rows.
 */
export interface PlayerOdds {
  player: string;
  teamAbbr: string;
  market: PlayerMarket;
  /** Mean of the simulated outcome for THIS game. */
  projected: number;
  /** The player's plain per-game average, for comparison with the projection. */
  historicalMean: number;
  games: number;
  meanMinutes: number;
  coupledToGame: boolean;
  rungs: LadderRung[];
  /** Hit rate above/below the game's projected total, at the central rung. */
  hitGivenOver?: number;
  hitGivenUnder?: number;
}

export function playerOdds(
  sample: PlayerSample,
  teamTotals: number[],
  gameTotals: number[],
  overUnderLine: number,
  coupled: boolean,
  rnd: () => number,
): PlayerOdds {
  const runs = Math.min(teamTotals.length, gameTotals.length);
  const n = sample.values.length;
  const useShare = coupled && sample.shares.some((s) => s > 0);

  // One set of draws, reused for every rung.
  const drawn = new Float64Array(runs);
  const gameIdx = new Int32Array(runs);
  for (let i = 0; i < runs; i++) {
    const g = Math.min(n - 1, Math.floor(rnd() * n));
    gameIdx[i] = g;
    drawn[i] = useShare ? sample.shares[g] * teamTotals[i] : sample.values[g];
  }
  const lines = ladderLines(Array.from(drawn));

  /*
   * The bootstrap is over WHICH GAMES WE SAW, not over simulation runs.
   *
   * That distinction is the whole value of the interval. Resampling runs
   * would shrink the range as runs rise and tell the reader nothing; what
   * actually dominates the uncertainty is that there are nine games and a
   * different nine would have said something else. So each replicate draws n
   * games with replacement from the n observed and re-reads the ladder.
   */
  const REPLICATES = 300;
  const perRep = Math.max(80, Math.floor(runs / 25));
  const repRates: number[][] = lines.map(() => []);
  for (let b = 0; b < REPLICATES; b++) {
    const pool: number[] = [];
    for (let k = 0; k < n; k++) pool.push(Math.min(n - 1, Math.floor(rnd() * n)));
    const vals: number[] = [];
    for (let i = 0; i < perRep; i++) {
      const g = pool[Math.min(n - 1, Math.floor(rnd() * n))];
      const t = teamTotals[Math.min(runs - 1, Math.floor(rnd() * runs))];
      vals.push(useShare ? sample.shares[g] * t : sample.values[g]);
    }
    lines.forEach((line, li) => {
      repRates[li].push(vals.filter((v) => v > line).length / vals.length);
    });
  }

  const built: LadderRung[] = lines.map((line, li) => {
    let over = 0;
    for (let i = 0; i < runs; i++) if (drawn[i] > line) over++;
    const pOver = runs > 0 ? over / runs : 0;
    const sortedRep = repRates[li].sort((a, b) => a - b);
    const qq = (p: number) =>
      sortedRep[Math.min(sortedRep.length - 1, Math.floor(p * sortedRep.length))] ?? pOver;
    const lo = qq(0.05);
    const hi = qq(0.95);
    return {
      line,
      pOver,
      overOdds: fairAmericanOdds(pOver),
      underOdds: fairAmericanOdds(1 - pOver),
      lo,
      hi,
      uncertain: hi - lo >= UNINFORMATIVE_RANGE,
    };
  });

  /*
   * Drop the rungs that say nothing, and the ones that repeat.
   *
   * Both come straight from the sample size and both were visible the moment
   * this ran on real games. With nine games the distribution has nine support
   * points, so several adjacent half-point lines sit in the same gap between
   * observed values and return the IDENTICAL probability — one player showed
   * 89% at 3.5, 4.5 and 5.5. Printing all three implies the model
   * distinguishes them. Only the highest line in each run is kept, because
   * that is the strongest true statement available.
   *
   * A rung nobody ever cleared prices at +99900, which is not a number to put
   * in front of anyone; it means "not in nine games", which is not the same
   * as "never". Rungs outside 2–98% are dropped rather than quoted.
   */
  const rungs: LadderRung[] = [];
  for (const r of built) {
    if (r.pOver < 0.02 || r.pOver > 0.98) continue;
    const prev = rungs[rungs.length - 1];
    if (prev && Math.abs(prev.pOver - r.pOver) < 1e-9) {
      rungs[rungs.length - 1] = r;
      continue;
    }
    rungs.push(r);
  }

  // The conditional split, read at the rung nearest the projection.
  let hitGivenOver: number | undefined;
  let hitGivenUnder: number | undefined;
  if (useShare && rungs.length > 0) {
    const central = rungs.reduce((a, b) =>
      Math.abs(b.pOver - 0.5) < Math.abs(a.pOver - 0.5) ? b : a,
    );
    let ho = 0, hu = 0, no = 0, nu = 0;
    for (let i = 0; i < runs; i++) {
      const hit = drawn[i] > central.line;
      if (gameTotals[i] > overUnderLine) { no++; if (hit) ho++; }
      else if (gameTotals[i] < overUnderLine) { nu++; if (hit) hu++; }
    }
    hitGivenOver = no ? ho / no : 0;
    hitGivenUnder = nu ? hu / nu : 0;
  }

  let sum = 0;
  for (let i = 0; i < runs; i++) sum += drawn[i];
  return {
    player: sample.player,
    teamAbbr: sample.teamAbbr,
    market: sample.market,
    projected: runs > 0 ? sum / runs : 0,
    historicalMean: sample.mean,
    games: sample.games,
    meanMinutes: sample.meanMinutes,
    coupledToGame: useShare,
    rungs,
    hitGivenOver,
    hitGivenUnder,
  };
}

/** The smallest history worth simulating at all. */
export const MIN_GAMES = 4;
