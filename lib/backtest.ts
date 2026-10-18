import type { CompletedGame, League } from "@/types";
import {
  buildRatings,
  linesAsResults,
  RATING_PARAMS,
  scheduleFromResults,
} from "@/lib/ratings";
import {
  BACK_TO_BACK_PENALTY,
  LEAGUE_MODEL,
  normalCdf,
  scheduleEdge,
} from "@/lib/sgp";
import { regress } from "@/lib/regression";

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

  /**
   * The decisive measurement: when our projection and the closing line are
   * both offered as explanations of what happened, how much weight does the
   * data put on ours?
   *
   * An efficient market with nothing to add from us gives ourWeight near 0
   * and marketWeight near 1. A projection carrying real information shows a
   * positive, statistically significant ourWeight.
   */
  skillFit: SkillFit | null;

  /** Constants fitted on this window, against what is configured. */
  fitted: {
    /** Empirical home advantage: the regression intercept on rating difference. */
    homeEdge: number | null;
    configuredHomeEdge: number;
    /** Points a back-to-back was actually worth, if the window had any. */
    backToBack: number | null;
    configuredBackToBack: number;
  };

  /**
   * Out-of-sample margin RMSE when the ratings are fitted to final SCORES
   * versus to CLOSING LINES. Lines are a far less noisy observation of the
   * same quantity, so this is expected to favour them.
   */
  ratingSource: {
    fromScoresRmse: number;
    fromLinesRmse: number;
    /** Which source predicted better on this window. */
    better: "scores" | "lines" | "tie";
    /**
     * Shrinkage multiplier chosen for the line-fitted solve, searched rather
     * than assumed. A closing line is a far more precise read of team
     * strength than a game result, so it needs much less shrinking — at the
     * score-calibrated prior the line-fitted ratings came out at 77% of their
     * true scale, and searching this recovered 98%.
     */
    bestPriorScale: number;
  } | null;
}

export interface SkillFit {
  /** Coefficient on our projection, with its error. */
  ourWeight: number;
  ourStandardError: number;
  ourT: number;
  /** Coefficient on the closing line. */
  marketWeight: number;
  marketT: number;
  n: number;
  rSquared: number;
  /**
   * The model vote this fit justifies: our coefficient normalized against the
   * total weight, and ZERO unless it is statistically significant. This is
   * what should drive MEASURED_MODEL_SKILL — a weight the data chose rather
   * than one anybody asserted.
   */
  justifiedVote: number;
  /** Whether ourT cleared the significance bar. */
  significant: boolean;
}

/** t-statistic a coefficient must clear before it is treated as real. */
export const SIGNIFICANCE_T = 2;

/**
 * Shrinkage multipliers tried for the line-fitted ratings.
 *
 * Searched out-of-sample rather than asserted. The span is wide because the
 * right answer is genuinely far from 1: a line observation carries a fraction
 * of a game result's noise, so it needs a fraction of its shrinkage.
 */
const PRIOR_SCALES = [1, 0.5, 0.25, 0.1, 0.05];

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
    /** Same projection from line-fitted ratings, one per prior scale tried. */
    projectedFromLines: (number | null)[];
    actual: number;
    closingSpread?: number;
    /** Rating difference alone, with no home-advantage term added. */
    ratingDiff: number;
    /** Schedule asymmetry in the league's back-to-back units. */
    scheduleAsymmetry: number;
  }
  const predictions: Prediction[] = [];

  for (const day of days.slice(MIN_TRAIN_DAYS)) {
    const cutoff = Date.parse(`${day}T00:00:00Z`);
    const train = usable.filter((g) => Date.parse(g.date) < cutoff);
    const test = usable.filter((g) => dayKey(g.date) === day);
    if (train.length === 0 || test.length === 0) continue;

    // Ratings as they would have stood that morning, weighted as of then.
    const rated = buildRatings(league, train, params, cutoff);
    // The same solve, fitted to the market's closing lines instead of to the
    // final scores — a much lower-noise observation of the same quantity.
    const lineTrain = linesAsResults(train);
    // One solve per candidate shrinkage, so the right amount can be measured
    // out-of-sample instead of guessed.
    const ratedFromLines =
      lineTrain.length >= 10
        ? PRIOR_SCALES.map((priorScale) =>
            buildRatings(league, lineTrain, { ...params, priorScale }, cutoff),
          )
        : null;
    // Schedule state as of that morning, from the same training window.
    const schedule = scheduleFromResults(train, cutoff);

    for (const g of test) {
      const home = rated.teams[g.homeId];
      const away = rated.teams[g.awayId];
      // A team with no history yet cannot be projected; skipping it is
      // honest, and counting it as a zero projection would flatter the
      // baseline rather than the model.
      if (!home || !away) continue;

      const lineProjections = (ratedFromLines ?? []).map((r) => {
        const lh = r.teams[g.homeId];
        const la = r.teams[g.awayId];
        return lh && la ? lh.net - la.net + lm.homeEdge : null;
      });

      // Reconstruct the schedule edge for this matchup, in penalty units so
      // the regression coefficient reads directly as its points value.
      const unit = BACK_TO_BACK_PENALTY[league] ?? 0;
      const sched =
        unit > 0
          ? scheduleEdge(
              {
                id: g.gameId,
                league,
                startTime: g.date,
                status: "final",
                home: { id: g.homeId, name: g.homeId, abbreviation: g.homeAbbr ?? "" },
                away: { id: g.awayId, name: g.awayId, abbreviation: g.awayAbbr ?? "" },
              },
              schedule,
            ).edge / unit
          : 0;

      predictions.push({
        projected: home.net - away.net + lm.homeEdge,
        projectedFromLines: lineProjections,
        actual: g.homeScore - g.awayScore,
        closingSpread: g.closingSpread,
        ratingDiff: home.net - away.net,
        scheduleAsymmetry: sched,
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

  /* ---------------- the decisive measurement ---------------- *
   * Offer the data both explanations at once and let it choose. If the market
   * already contains everything we know, our coefficient collapses to zero
   * and the market's goes to one; that is the result that justifies a zero
   * model vote, and it would be justified by evidence rather than argument.
   */
  let skillFit: SkillFit | null = null;
  if (withLine.length >= 40) {
    const fit = regress(
      withLine.map((p) => p.actual),
      [
        { name: "ours", values: withLine.map((p) => p.projected) },
        {
          name: "market",
          values: withLine.map((p) => -(p.closingSpread as number)),
        },
      ],
    );
    if (fit) {
      const ours = fit.coefficients.find((c) => c.name === "ours")!;
      const market = fit.coefficients.find((c) => c.name === "market")!;
      const significant = Math.abs(ours.t) >= SIGNIFICANCE_T && ours.value > 0;
      const total = ours.value + market.value;
      // Normalized share of the explanatory weight, and only when the
      // coefficient is distinguishable from zero.
      const justified =
        significant && total > 0
          ? Math.min(1, Math.max(0, ours.value / total))
          : 0;
      skillFit = {
        ourWeight: ours.value,
        ourStandardError: ours.standardError,
        ourT: ours.t,
        marketWeight: market.value,
        marketT: market.t,
        n: fit.n,
        rSquared: fit.rSquared,
        justifiedVote: round(justified),
        significant,
      };
    }
  }

  /* ---------------- constants the window can fit ---------------- *
   * Home advantage falls out as the intercept when actual margin is
   * regressed on rating difference alone: whatever is left over once team
   * strength is accounted for IS the home edge. The back-to-back value comes
   * out the same way, as the coefficient on schedule asymmetry measured in
   * penalty units, so it reads directly in points.
   */
  let fittedHomeEdge: number | null = null;
  let fittedB2B: number | null = null;
  const hasSchedule = predictions.some((p) => p.scheduleAsymmetry !== 0);
  const edgeFit = regress(
    predictions.map((p) => p.actual),
    [
      { name: "ratingDiff", values: predictions.map((p) => p.ratingDiff) },
      ...(hasSchedule
        ? [
            {
              name: "schedule",
              values: predictions.map((p) => p.scheduleAsymmetry),
            },
          ]
        : []),
    ],
  );
  if (edgeFit) {
    const intercept = edgeFit.coefficients.find((c) => c.name === "intercept");
    if (intercept) fittedHomeEdge = round(intercept.value);
    const sched = edgeFit.coefficients.find((c) => c.name === "schedule");
    // Only report a schedule value the window can actually see.
    if (sched && Math.abs(sched.t) >= SIGNIFICANCE_T) {
      fittedB2B = round(-sched.value);
    }
  }

  /* ---------------- scores versus lines as the training signal ---------- */
  const withLineRatings = predictions.filter(
    (p) => p.projectedFromLines.length === PRIOR_SCALES.length &&
           p.projectedFromLines.every((v) => v != null),
  );
  let ratingSource: BacktestResult["ratingSource"] = null;
  if (withLineRatings.length >= MIN_TEST_GAMES) {
    const fromScores = rmse(
      withLineRatings.map((p) => p.projected - p.actual),
    );
    // Pick the shrinkage that predicted best on games it never saw.
    let bestRmse = Infinity;
    let bestScale = PRIOR_SCALES[0];
    PRIOR_SCALES.forEach((scale, i) => {
      const r = rmse(
        withLineRatings.map(
          (p) => (p.projectedFromLines[i] as number) - p.actual,
        ),
      );
      if (r < bestRmse) {
        bestRmse = r;
        bestScale = scale;
      }
    });
    ratingSource = {
      fromScoresRmse: round(fromScores),
      fromLinesRmse: round(bestRmse),
      better:
        Math.abs(fromScores - bestRmse) < 0.05
          ? "tie"
          : bestRmse < fromScores
            ? "lines"
            : "scores",
      bestPriorScale: bestScale,
    };
  }

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
    skillFit,
    fitted: {
      homeEdge: fittedHomeEdge,
      configuredHomeEdge: lm.homeEdge,
      backToBack: fittedB2B,
      configuredBackToBack: BACK_TO_BACK_PENALTY[league] ?? 0,
    },
    ratingSource,
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
