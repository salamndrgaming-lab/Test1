import { NextResponse } from "next/server";
import type { League, ProviderResult, SgpRecommendation } from "@/types";
import { fetchEspn } from "@/lib/providers/espn";
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
    const legs = legsFromGames(games, odds, gameLinks);
    if (legs.length < 2) {
      throw new Error(
        "Not enough upcoming games with live odds right now to build a slip.",
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
