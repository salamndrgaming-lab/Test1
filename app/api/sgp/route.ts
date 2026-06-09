import { NextResponse } from "next/server";
import { buildRecommendation } from "@/lib/sgp";
import { SEED_SGP_CANDIDATES } from "@/data/seed-sports";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The SGP research tool. Candidate legs (with cited rationale + references) are
// ranked by transparent model edge and combined into a 6+ leg research slip.
export async function GET() {
  const recommendation = buildRecommendation(SEED_SGP_CANDIDATES, 6);
  return NextResponse.json({
    data: recommendation,
    source: "seed",
    fetchedAt: new Date().toISOString(),
    note: "Research slip built from illustrative candidate legs.",
  });
}
