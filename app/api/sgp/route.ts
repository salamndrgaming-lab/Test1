import { NextResponse } from "next/server";
import type { League, ProviderResult, SgpRecommendation } from "@/types";
import {
  fetchEspn,
  fetchInjuries,
  fetchResultsWindow,
  fetchTeamScoring,
} from "@/lib/providers/espn";
import { buildAllRatings, restFromResults } from "@/lib/ratings";
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
    const [scoring, results, injuries, weather] = active.length
      ? await Promise.all([
          fetchTeamScoring(active, controller.signal),
          fetchResultsWindow(active, controller.signal),
          fetchInjuries(active, controller.signal),
          // One request covers the whole slate, and only outdoor venues.
          fetchGameWeather(games, controller.signal),
        ])
      : [{}, [], {}, {}];

    // One results window feeds both the ratings solve and rest detection.
    const asOf = Date.now();
    const { ratings } = buildAllRatings(results, asOf);
    const rest = restFromResults(results, asOf);

    const legs = legsFromGames(
      games,
      odds,
      gameLinks,
      scoring,
      rest,
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
