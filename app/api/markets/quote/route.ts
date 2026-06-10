import { NextRequest, NextResponse } from "next/server";
import { getLive } from "@/lib/providers/withFallback";
import { stooqQuoteProvider } from "@/lib/providers/stooq";
import { decodeSymbols } from "@/lib/markets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = decodeSymbols(raw).slice(0, 30);
  if (symbols.length === 0) {
    return NextResponse.json({
      data: [],
      source: "live",
      fetchedAt: new Date().toISOString(),
    });
  }
  const result = await getLive(stooqQuoteProvider, { symbols });
  return NextResponse.json(result);
}
