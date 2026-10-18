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

    const [scoring, results, injuries, weather, eventOdds] = active.length
      ? await Promise.all([
          fetchTeamScoring(active, controller.signal),
          fetchResultsWindow(active, controller.signal),
          fetchInjuries(active, controller.signal),
          // One request covers the whole slate, and only outdoor venues.
          fetchGameWeather(games, controller.signal),
          // One request per game: every bookmaker ESPN lists. This is what
          // makes a price edge and a standard error on fair value measurable.
          fetchEventOdds(priced, controller.signal),
        ])
      : [{}, [], {}, {}, {} as Record<string, BookPrice[]>];

    // Prefer the per-event survey, keep the scoreboard's book as a fallback.
    const enrichedOdds = odds.map((o) => {
      const fromEvent = eventOdds[o.gameId];
      if (!fromEvent || fromEvent.length === 0) return o;
      return { ...o, books: mergeBooks(fromEvent, o.books ?? []) };
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
    const result: ProviderResult<SgpRecommendation> = {
      data: recommendation,
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
