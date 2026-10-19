import { NextResponse } from "next/server";
import type {
  BookPrice,
  League,
  ProviderResult,
  SgpRecommendation,
} from "@/types";
import {
  fetchEspn,
  fetchEventOdds,
  fetchInjuries,
  mergeBooks,
  fetchResultsWindow,
  fetchTeamScoring,
} from "@/lib/providers/espn";
import { buildAllRatings, linesAsResults, scheduleFromResults } from "@/lib/ratings";
import { backtest, votesFromBacktest } from "@/lib/backtest";
import { fetchGameWeather } from "@/lib/providers/gameweather";
import { fetchOddsApiBooks, oddsApiStatus } from "@/lib/providers/oddsapi";
import {
  buildRecommendation,
  legsFromGames,
  type GameOpportunities,
} from "@/lib/sgp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUES: League[] = ["NBA", "NFL", "NHL", "MLB", "NCAAF", "NCAAB"];

// The SGP research tool, built from REAL current games + odds (ESPN, keyless).
export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const { games, odds, gameLinks } = await fetchEspn(
      LEAGUES,
      controller.signal,
    );
    // Only ask for standings in leagues that actually have a priced game, so
    // we don't spend the request budget on sports that are out of season.
    const active = [
      ...new Set(
        games
          .filter((g) => g.status !== "final" && odds.some((o) => o.gameId === g.id))
          .map((g) => g.league),
      ),
    ];
    // Games we will actually price, which is all the per-event odds endpoint
    // needs to be asked about.
    const priced = games.filter(
      (g) => g.status !== "final" && odds.some((o) => o.gameId === g.id),
    );

    const [scoring, results, injuries, weather, eventOdds, apiOdds] = active.length
      ? await Promise.all([
          fetchTeamScoring(active, controller.signal),
          fetchResultsWindow(active, controller.signal),
          fetchInjuries(active, controller.signal),
          // One request covers the whole slate, and only outdoor venues.
          fetchGameWeather(games, controller.signal),
          // One request per game: every bookmaker ESPN lists. This is what
          // makes a price edge and a standard error on fair value measurable.
          fetchEventOdds(priced, controller.signal),
          // A real multi-book feed, when a key is configured. One request per
          // league, cached, with the monthly allowance guarded.
          fetchOddsApiBooks(priced, controller.signal),
        ])
      : [{}, [], {}, {}, {} as Record<string, BookPrice[]>, {} as Record<string, BookPrice[]>];

    /*
     * Merge all three price sources, widest first.
     *
     * The Odds API is preferred where present: it returns many bookmakers and
     * its spreads are keyed by team rather than parsed out of a details
     * string, so it cannot suffer the sign ambiguity the ESPN path has to
     * guard against. ESPN's per-event survey comes next, and the
     * scoreboard-embedded book last. mergeBooks de-duplicates by name and
     * keeps the earlier source on a collision.
     */
    const enrichedOdds = odds.map((o) => {
      const merged = mergeBooks(
        mergeBooks(apiOdds[o.gameId] ?? [], eventOdds[o.gameId] ?? []),
        o.books ?? [],
      );
      return merged.length > 0 ? { ...o, books: merged } : o;
    });

    // One results window feeds the ratings solve, the schedule model, AND the
    // measurement that decides how much the model is allowed to vote.
    const asOf = Date.now();
    const schedule = scheduleFromResults(results, asOf);

    /*
     * Fit the ratings to whichever signal the backtest says predicts better.
     *
     * Final scores are a very noisy observation of team strength; closing
     * lines are the market's much tighter estimate of the same thing, and the
     * window already contains them. Rather than assume which is better, the
     * backtest measures it per league and we follow the measurement.
     */
    const measured = backtest(results);
    const linePreference = measured.filter(
      (m) => m.ratingSource?.better === "lines",
    );
    const preferLines = linePreference.length > 0;
    const trainingSet = preferLines
      ? // Keep score-based games for leagues with no usable lines.
        (() => {
          const lineBased = linesAsResults(results);
          const covered = new Set(lineBased.map((g) => g.gameId));
          return [...lineBased, ...results.filter((g) => !covered.has(g.gameId))];
        })()
      : results;
    /*
     * A closing line is a far tighter read of team strength than a game
     * result, so it needs far less shrinking — the backtest searches how much
     * and we use what it found. At the score-calibrated prior the line-fitted
     * ratings came out at 77% of their true scale.
     */
    const priorScale = preferLines
      ? Math.min(...linePreference.map((m) => m.ratingSource!.bestPriorScale))
      : 1;
    const { ratings } = buildAllRatings(trainingSet, asOf, priorScale);

    /*
     * The model's vote is whatever the regression could justify — the median
     * of the cells that produced a significant fit, per market, and zero
     * otherwise. No constant is being chosen here; the data either supports a
     * vote or it does not.
     *
     * Two things matter about how this is now computed. It is split by market,
     * because a margin measurement is not evidence about totals. And the
     * significance bar every cell had to clear is corrected for how many cells
     * were tested across all leagues and both markets — without that, running
     * six leagues at |t| > 2 and opening the vote on any of them was a 26.5%
     * chance of opening it on noise.
     */
    const modelVote = votesFromBacktest(measured);

    // Collected rather than returned in module state, so concurrent requests
    // on one instance cannot see each other's findings.
    const opportunities: GameOpportunities[] = [];
    const legs = legsFromGames(
      games,
      enrichedOdds,
      gameLinks,
      scoring,
      schedule,
      injuries,
      ratings,
      weather,
      modelVote,
      opportunities,
    );
    if (legs.length === 0) {
      throw new Error(
        "No upcoming games with live odds are posted right now — check back closer to game time.",
      );
    }
    /*
     * Three legs by default, because that is what the expected-value curve
     * says. Vig compounds at roughly 2pp per leg, so six legs surrendered
     * ~16% of the stake before any forecast was involved and three surrenders
     * ~6-8%. The user can still pick anything up to ten, with each length's
     * expected value printed beside it.
     */
    const recommendation = buildRecommendation(
      legs, 3, 10, 1, modelVote, opportunities,
    );
    // Report the price-feed state so a missing key is visible in the UI
    // rather than silently degrading to one book.
    const feed = oddsApiStatus();
    const result: ProviderResult<SgpRecommendation> = {
      data: {
        ...recommendation,
        marketSurvey: {
          ...recommendation.marketSurvey,
          priceFeed: feed.configured
            ? {
                name: "The Odds API",
                remainingCredits: feed.remaining,
                leaguesCached: feed.leaguesCached,
              }
            : null,
        },
      },
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: reason,
    } satisfies ProviderResult<SgpRecommendation>);
  } finally {
    clearTimeout(timer);
  }
}
