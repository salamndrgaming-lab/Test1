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
import { buildAllRatings, scheduleFromResults } from "@/lib/ratings";
import { fetchGameWeather } from "@/lib/providers/gameweather";
import { fetchOddsApiBooks, oddsApiStatus } from "@/lib/providers/oddsapi";
import { buildRecommendation, legsFromGames } from "@/lib/sgp";

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

    // One results window feeds both the ratings solve and the schedule model.
    const asOf = Date.now();
    const { ratings } = buildAllRatings(results, asOf);
    const schedule = scheduleFromResults(results, asOf);

    const legs = legsFromGames(
      games,
      enrichedOdds,
      gameLinks,
      scoring,
      schedule,
      injuries,
      ratings,
      weather,
    );
    if (legs.length === 0) {
      throw new Error(
        "No upcoming games with live odds are posted right now — check back closer to game time.",
      );
    }
    const recommendation = buildRecommendation(legs, 6);
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
