import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { sportsProvider } from "@/lib/providers/sports.provider";
import type { League } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") as League | null;
  const result = await getLive(sportsProvider, {
    league: league ?? undefined,
  });
  return NextResponse.json(result);
}
