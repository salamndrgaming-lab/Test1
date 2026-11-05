import type { ScoreGrid } from "@/lib/distributions";
import type { League } from "@/types";

/**
 * Simulating a player prop without inventing a player model.
 *
 * The honest problem first. This project's model projects a team's margin
 * and total. It has no player-level distribution, and the props panel says
 * so. Sampling a player's rebounds therefore needs something the model does
 * not contain, and the obvious shortcuts are all fiction:
 *
 *  - Assume the posted line is the median and pick a variance. The variance
 *    is then the entire answer, and it was made up.
 *  - De-vig the price and report that. Honest, but it is the market's number
 *    with extra steps — a simulation that adds nothing.
 *
 * What IS available is more interesting. Books post DIFFERENT lines for the
 * same player, and each carries a price. Two or more (line, probability)
 * pairs pin down both the location and the scale of that player's
 * distribution, fitted from the market rather than assumed.
 *
 * And then the coupling to the game falls out rather than being chosen.
 * Treat a player's output as a share of the game's, plus their own noise:
 *
 *     X = share · T + noise,    share = line / E[T]
 *
 * from which
 *
 *     Cov(X,T) = share · Var(T)
 *     rho      = share · SD(T) / SD(X)
 *
 * Every term on the right is measured: `share` from the posted line and our
 * projected scoring, SD(T) from the score grid we already build, SD(X)
 * fitted from the market's own lines. The correlation is derived, not a
 * parameter anyone picked — which matters, because the correlation is
 * precisely what the simulation is for.
 *
 * One honest limit on WHICH T. The props feed names a player and a number
 * and does not say which of the two teams they play for, and this project
 * has no roster data to look it up with. So T is the GAME's total, not one
 * team's score. That is a real cost — a player's own team's scoring carries
 * more information about them than the game's does — but it is a weaker
 * decomposition rather than a wrong one, and the alternative was to guess at
 * the attribution and let a coin flip set the correlation's subject. For the
 * same reason there is no "hit rate when their team won" here: the side whose
 * winning would matter is not known.
 *
 * So the marginal stays the market's and the CO-MOVEMENT is ours. The useful
 * output is therefore not "this prop hits 52%" — the market already said
 * that — but "it hits 52% overall and 68% of the times this game goes over
 * the total", which is information a single posted number cannot give you
 * and which is exactly what a same-game slip needs.
 *
 * Where a player has only one line, the scale is not identified and this
 * declines to simulate them rather than guessing at it.
 */

export interface PropQuote {
  /** The posted number. */
  line: number;
  /** De-vigged probability of going OVER that number. */
  pOver: number;
}

export interface PropFit {
  player: string;
  market: string;
  /** Fitted mean of the player's outcome. */
  mean: number;
  /** Fitted standard deviation. Null when the lines cannot identify it. */
  sd: number | null;
  /** How many distinct priced lines the fit used. */
  points: number;
  /** Mean absolute error of the fit against the market's probabilities. */
  fitError: number;
}

/** Standard normal CDF, Abramowitz-Stegun 7.1.26. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Inverse standard normal, Acklam's rational approximation. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return 0;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
             138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
             66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
             -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
         (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

/**
 * Fit a player's distribution to the market's own prices.
 *
 * Each quote gives a point on the CDF: P(X > line) = pOver, so
 * (line - mean)/sd = -Phi^-1(pOver). With two or more lines that is a
 * straight line in (line, -z) space, and its slope and intercept ARE the
 * scale and location — no assumption beyond normality of the player's
 * outcome, which for a counting stat over a full game is a reasonable one
 * and is at least checkable: `fitError` reports how well it reproduced the
 * prices it was given.
 *
 * With one quote the system is underdetermined — one equation, two
 * unknowns — and `sd` comes back null rather than invented.
 */
export function fitProp(
  player: string,
  market: string,
  quotes: PropQuote[],
): PropFit {
  const usable = quotes.filter(
    (q) => Number.isFinite(q.line) && q.pOver > 0.001 && q.pOver < 0.999,
  );
  const distinct = [...new Map(usable.map((q) => [q.line, q])).values()];

  if (distinct.length === 0) {
    return { player, market, mean: NaN, sd: null, points: 0, fitError: NaN };
  }
  if (distinct.length === 1) {
    /*
     * One quote is one equation in two unknowns. It is tempting to call the
     * line the mean, but that only holds when the price sits at 50%, and
     * reporting a number that is right by coincidence is worse than
     * reporting none. Neither parameter is identified, so neither is given.
     */
    return { player, market, mean: NaN, sd: null, points: 1, fitError: NaN };
  }

  // Regress z = -Phi^-1(pOver) on line. Then line = mean + sd*z, so a fit of
  // line against z gives intercept = mean and slope = sd.
  const xs = distinct.map((q) => -normalQuantile(q.pOver));
  const ys = distinct.map((q) => q.line);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const sd = den > 1e-12 ? num / den : null;
  const mean = sd != null ? my - sd * mx : my;

  // How well did it reproduce the prices it was fitted to?
  let err = 0;
  if (sd != null && sd > 0) {
    for (const q of distinct) err += Math.abs(1 - normalCdf((q.line - mean) / sd) - q.pOver);
    err /= distinct.length;
  }
  return {
    player, market, mean,
    sd: sd != null && sd > 0.01 ? sd : null,
    points: distinct.length,
    fitError: err,
  };
}

export interface PropCoupling {
  fit: PropFit;
  /** Fraction of the game's scoring this player's output accounts for. */
  share: number;
  /** Correlation with the game total, derived rather than chosen. */
  rho: number;
  /** SD of the part of the player's outcome not explained by game scoring. */
  residualSd: number;
  /** Whether the share-of-scoring decomposition holds for this player. */
  usable: boolean;
  /** Why not, when it does not. */
  reason?: string;
}

/**
 * Tie a fitted player to the simulated scoring aggregate.
 *
 * The decomposition X = share·T + noise is the one modelling assumption
 * here, and it is a structural one rather than a free parameter: a player's
 * output IS part of the game's. Everything it implies is then measured.
 *
 * It can fail, and failure is reported rather than clamped. If
 * share·SD(T) exceeds SD(X), the implied correlation would be above 1 —
 * which says the player's own outcome is less variable than the slice of
 * aggregate variance attributed to them, so the decomposition does not
 * describe this player. Silently capping rho at 1 would hide a broken
 * assumption behind a plausible number.
 *
 * The rho>1 check is NOT, however, what keeps a stat on the wrong scale out.
 * It does not catch one: passing yards against an NFL total give a share of
 * 1.16 and a perfectly respectable-looking rho of 0.40. The share is
 * nonsense — a quarterback is not 116% of a game's scoring — but the
 * arithmetic downstream of it is clean, which is precisely how an invented
 * correlation gets published. The unit check in `isScoringComponent` is what
 * excludes those, and it runs before this.
 */
export function coupleToAggregate(
  fit: PropFit,
  aggMean: number,
  aggSd: number,
): PropCoupling {
  const base = { fit, share: 0, rho: 0, residualSd: 0, usable: false };
  if (fit.sd == null || !(fit.sd > 0)) {
    return { ...base, reason: "only one posted line — the spread is not identified" };
  }
  if (!(aggMean > 0) || !(aggSd > 0)) {
    return { ...base, reason: "no score distribution for this game" };
  }
  const share = fit.mean / aggMean;
  if (!(share > 0)) {
    return { ...base, reason: "implied share of game scoring is not positive" };
  }
  if (share >= 1) {
    return {
      ...base, share,
      reason: "the implied share of game scoring is above 100% — wrong scale",
    };
  }
  const explained = share * aggSd;
  if (explained >= fit.sd) {
    return {
      ...base, share,
      reason:
        "the share-of-scoring model does not fit this stat: it would need a correlation above 1",
    };
  }
  const residualSd = Math.sqrt(fit.sd * fit.sd - explained * explained);
  return {
    fit,
    share,
    rho: explained / fit.sd,
    residualSd,
    usable: true,
  };
}

/**
 * Draw a player's outcome alongside an already-sampled aggregate.
 *
 * X = share·T + noise, with the noise centred so the marginal mean is the
 * fitted mean whatever the aggregate happened to be.
 */
export function drawProp(
  c: PropCoupling,
  aggregate: number,
  aggMean: number,
  gauss: () => number,
): number {
  return (
    c.fit.mean + c.share * (aggregate - aggMean) + c.residualSd * gauss()
  );
}

export interface PropSimResult {
  player: string;
  market: string;
  line: number;
  /** Share of runs the player went over the line. */
  hitRate: number;
  /** What the market's own price implies, for comparison. */
  marketProbability: number;
  /** Correlation with game scoring, derived from the fit. */
  rho: number;
  /** Hit rate in the runs where the GAME went over its total. */
  hitGivenOver: number;
  /** Hit rate in the runs where the game stayed under. */
  hitGivenUnder: number;
  /** Runs in each of those two branches, so thin ones can be dismissed. */
  overRuns: number;
  underRuns: number;
  /** Runs behind these figures. */
  runs: number;
  fit: PropFit;
}

/** Standard normal via Box-Muller, from a uniform generator. */
export function gaussFrom(rnd: () => number): () => number {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** Mean and SD of one side's score, straight off the grid. */
export function teamScoreMoments(
  grid: ScoreGrid,
  side: "home" | "away",
): { mean: number; sd: number } {
  let m = 0, m2 = 0;
  for (let i = 0; i < grid.rowsHome; i++) {
    for (let j = 0; j < grid.colsAway; j++) {
      const p = grid.p[i * grid.colsAway + j];
      if (!p) continue;
      const v = side === "home" ? grid.loHome + i : grid.loAway + j;
      m += p * v;
      m2 += p * v * v;
    }
  }
  return { mean: m, sd: Math.sqrt(Math.max(0, m2 - m * m)) };
}

/** Mean and SD of the game total, straight off the grid. */
export function totalMoments(grid: ScoreGrid): { mean: number; sd: number } {
  let m = 0, m2 = 0;
  for (let i = 0; i < grid.rowsHome; i++) {
    for (let j = 0; j < grid.colsAway; j++) {
      const p = grid.p[i * grid.colsAway + j];
      if (!p) continue;
      const v = grid.loHome + i + grid.loAway + j;
      m += p * v;
      m2 += p * v * v;
    }
  }
  return { mean: m, sd: Math.sqrt(Math.max(0, m2 - m * m)) };
}

export interface PropSimInput {
  player: string;
  market: string;
  /** The line to grade against — normally the most-quoted one. */
  line: number;
  /** De-vigged over probability at that line, for comparison. */
  marketProbability: number;
  coupling: PropCoupling;
}

/**
 * Run the fitted players against totals already drawn for this game.
 *
 * The totals come from the game simulation, so the player draws share the
 * game's randomness rather than running beside it — which is the whole
 * point. Note what is NOT reported: the overall hit rate is included only to
 * be checked against the market's own number, because by construction it
 * reproduces it. The two conditional rates are the output.
 */
export function simulateProps(
  inputs: PropSimInput[],
  totals: number[],
  aggMean: number,
  overUnderLine: number,
  rnd: () => number,
): PropSimResult[] {
  const gauss = gaussFrom(rnd);
  const runs = totals.length;
  const out: PropSimResult[] = [];
  for (const input of inputs) {
    const c = input.coupling;
    if (!c.usable) continue;
    let hit = 0, hitOver = 0, hitUnder = 0, overRuns = 0, underRuns = 0;
    for (let i = 0; i < runs; i++) {
      const value = drawProp(c, totals[i], aggMean, gauss);
      const over = value > input.line;
      if (over) hit++;
      if (totals[i] > overUnderLine) {
        overRuns++;
        if (over) hitOver++;
      } else if (totals[i] < overUnderLine) {
        underRuns++;
        if (over) hitUnder++;
      }
      // A total landing exactly on the line is neither branch; it would push.
    }
    out.push({
      player: input.player,
      market: input.market,
      line: input.line,
      hitRate: runs ? hit / runs : 0,
      marketProbability: input.marketProbability,
      rho: c.rho,
      hitGivenOver: overRuns ? hitOver / overRuns : 0,
      hitGivenUnder: underRuns ? hitUnder / underRuns : 0,
      overRuns,
      underRuns,
      runs,
      fit: c.fit,
    });
  }
  // Largest gap between the two branches first: that gap is the information.
  return out.sort(
    (a, b) =>
      Math.abs(b.hitGivenOver - b.hitGivenUnder) -
      Math.abs(a.hitGivenOver - a.hitGivenUnder),
  );
}

/** The shape the props endpoint returns, reduced to what a fit needs. */
export interface PricedPropLine {
  player: string;
  market: string;
  line: number;
  books: number;
  over?: { fairProbability: number };
}

export interface PropDecline {
  player: string;
  market: string;
  reason: string;
  points: number;
}

/**
 * Is this stat literally a piece of the number the grid models?
 *
 * The decomposition X = share·T + noise earns its keep from a structural
 * fact: a player's points ARE part of the game's points, so `share` is a
 * real fraction and the correlation that follows from it is measured. The
 * moment the stat is in different units that fact is gone. Rebounds,
 * assists, receptions, passing yards and strikeouts are not components of a
 * scoreboard, and `line / E[total]` for one of them is a ratio between
 * unrelated quantities — a number, but not a share of anything.
 *
 * What makes this the dangerous case rather than merely a limited one is
 * that nothing downstream complains. Rebounds give a small, plausible share
 * and a small, plausible correlation, and the output would be
 * indistinguishable from the points case. So the exclusion has to be here,
 * on the units, and it has to be a list rather than a heuristic.
 *
 * The real relationships exist — rebounds plainly co-move with missed shots,
 * receptions with pass attempts — but measuring them needs player box-score
 * history this project does not have. Until it does, the honest output for
 * those markets is nothing.
 *
 * NHL's player_points is excluded despite the name: it counts goals AND
 * assists, so two players share credit for one goal and the sum over a
 * roster exceeds the team's score. It is not a partition of the total.
 */
export function isScoringComponent(league: League, market: string): boolean {
  if (market !== "player_points") return false;
  return league === "NBA" || league === "NCAAB";
}

/**
 * Turn the priced props board into something simulable, and say what it could
 * not take.
 *
 * Every player who is dropped is returned with the reason, because the set of
 * players this can simulate is NOT a selection of the interesting ones — it
 * is whichever players happen to have two books disagreeing about where to
 * set their line. Showing only the survivors would read as a shortlist.
 */
export function prepareProps(
  league: League,
  lines: PricedPropLine[],
  aggMean: number,
  aggSd: number,
): { inputs: PropSimInput[]; declined: PropDecline[] } {
  const groups = new Map<string, PricedPropLine[]>();
  for (const l of lines) {
    if (l.over?.fairProbability == null) continue;
    const k = `${l.player}|${l.market}`;
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }

  const inputs: PropSimInput[] = [];
  const declined: PropDecline[] = [];
  for (const [k, rows] of groups) {
    const [player, market] = k.split("|");
    if (!isScoringComponent(league, market)) {
      declined.push({
        player, market, points: rows.length,
        reason:
          "not measured in points, so its share of the game's scoring is not a share of anything",
      });
      continue;
    }
    const fit = fitProp(
      player,
      market,
      rows.map((r) => ({ line: r.line, pOver: r.over!.fairProbability })),
    );
    const coupling = coupleToAggregate(fit, aggMean, aggSd);
    if (!coupling.usable) {
      declined.push({
        player, market,
        reason: coupling.reason ?? "not simulable",
        points: fit.points,
      });
      continue;
    }
    // Grade against the best-covered line: the one the most books quote.
    const graded = rows.reduce((a, b) => (b.books > a.books ? b : a));
    inputs.push({
      player, market,
      line: graded.line,
      marketProbability: graded.over!.fairProbability,
      coupling,
    });
  }
  return { inputs, declined };
}
