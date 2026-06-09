import { NextRequest, NextResponse } from "next/server";
import { withFallback } from "@/lib/providers/withFallback";
import { oddsProvider } from "@/lib/providers/odds.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("gameId") ?? undefined;
  const result = await withFallback(oddsProvider, { gameId });
  return NextResponse.json(result);
}
