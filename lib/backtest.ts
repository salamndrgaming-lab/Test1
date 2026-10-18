import type { CompletedGame, League } from "@/types";
import { buildRatings, RATING_PARAMS } from "@/lib/ratings";
import { LEAGUE_MODEL, normalCdf } from "@/lib/sgp";

/**
 * Walk-forward backtesting against the closing line.
 *
 * Until now the model's accuracy was unmeasured. The prediction log measures
 * it going forward, but needs a season to say anything — so every parameter in
 * this model stayed an assertion, and the model's vote stayed at zero because
 * there was no evidence to justify opening it.
 *
 * That wait was unnecessary. The results window already fetched for the
 * ratings solve contains, for every completed game, both the final score AND
 * the line it closed at. So the model can be tested right now, on games it was
 * not fitted to, against the only benchmark that matters:
 *
 *   for each date in the window:
 *     build ratings from games STRICTLY BEFORE it
 *     project the games ON it
 *     compare our projection, and the closing spread, to what happened
 *
 * No peeking: ratings for a test date never see that date's results. The
 * market's number for those games is the closing line, which is the sharpest
 * public forecast there is, so this measures the only thing worth knowing —
 * whether our projection adds anything to it.
 *
 * Two honest limits. The window is short, so the sample is small and the
 * numbers are noisy; `meaningful` says when it is worth reading. And margin
 * error converges much faster than win-probability calibration, so the error
 * figures mean something long before the Brier figures do.
 */

export interface BacktestResult {
  league: League;
  /** Games predicted out-of-sample. */
  games: number;
  /** Of those, how many had an orientable closing spread to compare against. */
  gamesWithLine: number;

  /** Mean absolute error of our projected margin, in points. */
  modelMae: number;
  modelRmse: number;
  /** Same for the closing spread, on the same games. */
  marketMae: number;
  marketRmse: number;
  /** A model that knows nothing but home advantage. */
  baselineMae: number;

  /**
   * 1 - modelRmse/marketRmse. Positive means our projection beat the closing
   * line on these games. Expect negative: that is the normal result, and it
   * is the honest reason the model's vote is zero.
   */
  skillVsMarket: number;
  /** Fraction of games where our projection was closer than the line. */
  beatLineRate: number;

  /** The sigma that best calibrated our win probabilities on this window. */
  fittedSigma: number;
  /** The sigma currently configured for the league. */
  configuredSigma: number;
  /** Brier score of our win probabilities at the fitted sigma. */
  brierModel: number;
  /** Brier score of the closing line's implied win probability. */
  brierMarket: number;

  /** Error figures stabilise around here; probabilities need far more. */
  meaningful: boolean;
}

/** Days of history needed before a date can be predicted. */
const MIN_TRAIN_DAYS = 7;
/** Below this, the window is too thin to report. */
const MIN_TEST_GAMES = 30;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Run the walk-forward test for one league.
 *
 * Deliberately takes no "now": each test date weights its training games as of
 * THAT date, so recency decay is computed from the cutoff rather than from
 * today. Passing in the current clock would have let information from after
 * the test date influence how the training games were weighted — a subtle
 * lookahead that would have flattered every result here.
 */
export function backtestLeague(
  league: League,
  games: CompletedGame[],
): BacktestResult | null {
  const lm = LEAGUE_MODEL[league];
  const params = RATING_PARAMS[league];
  if (!lm || !params) return null;

  const usable = games
    .filter(
      (g) =>
        g.league === league &&
        Number.isFinite(g.homeScore) &&
        Number.isFinite(g.awayScore) &&
        Number.isFinite(Date.parse(g.date)),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (usable.length === 0) return null;

  const days = [...new Set(usable.map((g) => dayKey(g.date)))].sort();
  if (days.length <= MIN_TRAIN_DAYS) return null;

  interface Prediction {
    projected: number;
    actual: number;
    closingSpread?: number;
  }
  const predictions: Prediction[] = [];

  for (const day of days.slice(MIN_TRAIN_DAYS)) {
    const cutoff = Date.parse(`${day}T00:00:00Z`);
    const train = usable.filter((g) => Date.parse(g.date) < cutoff);
    const test = usable.filter((g) => dayKey(g.date) === day);
    if (train.length === 0 || test.length === 0) continue;

    // Ratings as they would have stood that morning, weighted as of then.
    const rated = buildRatings(league, train, params, cutoff);

    for (const g of test) {
      const home = rated.teams[g.homeId];
      const away = rated.teams[g.awayId];
      // A team with no history yet cannot be projected; skipping it is
      // honest, and counting it as a zero projection would flatter the
      // baseline rather than the model.
      if (!home || !away) continue;
      predictions.push({
        projected: home.net - away.net + lm.homeEdge,
        actual: g.homeScore - g.awayScore,
        closingSpread: g.closingSpread,
      });
    }
  }

  if (predictions.length < MIN_TEST_GAMES) return null;

  const withLine = predictions.filter(
    (p) => p.closingSpread != null && Number.isFinite(p.closingSpread),
  );

  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
  const mae = (errs: number[]) => mean(errs.map(Math.abs));
  const rmse = (errs: number[]) => Math.sqrt(mean(errs.map((e) => e * e)));

  const modelErrs = predictions.map((p) => p.projected - p.actual);
  // The market's projected margin is minus its home spread.
  const marketErrs = withLine.map((p) => -(p.closingSpread as number) - p.actual);
  // Compare like with like: our error on exactly the games the market priced.
  const modelErrsOnLined = withLine.map((p) => p.projected - p.actual);
  const baselineErrs = predictions.map((p) => lm.homeEdge - p.actual);

  const modelRmseOnLined = rmse(modelErrsOnLined);
  const marketRmseVal = rmse(marketErrs);

  const beatLine =
    withLine.length === 0
      ? 0
      : withLine.filter(
          (p, i) =>
            Math.abs(modelErrsOnLined[i]) < Math.abs(marketErrs[i]),
        ).length / withLine.length;

  /*
   * Fit the margin sigma on this window.
   *
   * Sigma does not change the projected margin, only how that margin converts
   * into a win probability, so it can be fitted without re-running the
   * ratings. The criterion is Brier score on the actual outcomes: the sigma
   * that would have made our stated probabilities most accurate.
   */
  const brierAt = (sigma: number) =>
    mean(
      predictions.map((p) => {
        const pHome = Math.min(
          0.99,
          Math.max(0.01, normalCdf(p.projected / sigma)),
        );
        const won = p.actual > 0 ? 1 : 0;
        return (pHome - won) ** 2;
      }),
    );

  let fittedSigma = lm.marginSigma;
  let bestBrier = Infinity;
  for (let s = lm.marginSigma * 0.5; s <= lm.marginSigma * 2.0; s += lm.marginSigma * 0.02) {
    const b = brierAt(s);
    if (b < bestBrier) {
      bestBrier = b;
      fittedSigma = s;
    }
  }

  // The market's own win probability, read off the closing spread through the
  // SAME distribution, so the comparison isolates the projection.
  const brierMarket =
    withLine.length === 0
      ? 0
      : mean(
          withLine.map((p) => {
            const marketMargin = -(p.closingSpread as number);
            const pHome = Math.min(
              0.99,
              Math.max(0.01, normalCdf(marketMargin / fittedSigma)),
            );
            const won = p.actual > 0 ? 1 : 0;
            return (pHome - won) ** 2;
          }),
        );

  const round = (x: number) => Number(x.toFixed(4));
  return {
    league,
    games: predictions.length,
    gamesWithLine: withLine.length,
    modelMae: round(mae(modelErrs)),
    modelRmse: round(rmse(modelErrs)),
    marketMae: round(mae(marketErrs)),
    marketRmse: round(marketRmseVal),
    baselineMae: round(mae(baselineErrs)),
    skillVsMarket:
      marketRmseVal > 0 ? round(1 - modelRmseOnLined / marketRmseVal) : 0,
    beatLineRate: round(beatLine),
    fittedSigma: round(fittedSigma),
    configuredSigma: lm.marginSigma,
    brierModel: round(bestBrier),
    brierMarket: round(brierMarket),
    // Margin error settles around here. Probability figures need far more, and
    // the UI says so separately.
    meaningful: predictions.length >= 100 && withLine.length >= 50,
  };
}

/** Run the test for every league present in the window. */
export function backtest(games: CompletedGame[]): BacktestResult[] {
  const leagues = [...new Set(games.map((g) => g.league))];
  const out: BacktestResult[] = [];
  for (const league of leagues) {
    const r = backtestLeague(league, games);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.games - a.games);
}
