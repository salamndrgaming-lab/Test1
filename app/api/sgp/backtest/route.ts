import { NextResponse } from "next/server";
import type { League, ProviderResult } from "@/types";
import { fetchEspn, fetchResultsWindow } from "@/lib/providers/espn";
import { backtest, type BacktestResult } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUES: League[] = ["NBA", "NFL", "NHL", "MLB", "NCAAF", "NCAAB"];

/**
 * Measure the model against the closing line on games it was not fitted to.
 *
 * Uses the same results window the ratings already need, so it costs one set
 * of scoreboard requests and no API key. Walk-forward: ratings for each test
 * date see only games strictly before it.
 */
export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const { games, odds } = await fetchEspn(LEAGUES, controller.signal);
    const active = [
      ...new Set(
        games
          .filter((g) => odds.some((o) => o.gameId === g.id))
          .map((g) => g.league),
      ),
    ];
    // Fall back to every league when nothing is on today, so the measurement
    // is still available out of season.
    const results = await fetchResultsWindow(
      active.length > 0 ? active : LEAGUES,
      controller.signal,
      45,
    );
    const data = backtest(results);
    if (data.length === 0) {
      throw new Error(
        "Not enough completed games with closing lines in the window yet — this needs about a week of history per league.",
      );
    }
    return NextResponse.json({
      data,
      source: "live",
      fetchedAt: new Date().toISOString(),
    } satisfies ProviderResult<BacktestResult[]>);
  } catch (err) {
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "unknown error",
    } satisfies ProviderResult<BacktestResult[]>);
  } finally {
    clearTimeout(timer);
  }
}
