import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { geocodeProvider } from "@/lib/providers/weather.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({
      data: [],
      source: "live",
      fetchedAt: new Date().toISOString(),
    });
  }
  const result = await getLive(geocodeProvider, { q });
  return NextResponse.json(result);
}
