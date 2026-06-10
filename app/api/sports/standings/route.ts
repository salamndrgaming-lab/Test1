import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { standingsProvider } from "@/lib/providers/standings.provider";
import type { League } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const league = (req.nextUrl.searchParams.get("league") as League) ?? "NBA";
  const result = await getLive(standingsProvider, { league });
  return NextResponse.json(result);
}
