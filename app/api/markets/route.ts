import { NextResponse } from "next/server";
import type { MarketsData, ProviderResult, Quote } from "@/types";
import { getLive } from "@/lib/providers/withFallback";
import { cryptoProvider } from "@/lib/providers/crypto.provider";
import { stocksProvider } from "@/lib/providers/stocks.provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Short module-level cache to respect CoinGecko's keyless rate limit (~30/min).
let cache: { data: MarketsData; ts: number } | null = null;
const TTL = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({
      data: cache.data,
      source: "live",
      fetchedAt: new Date(cache.ts).toISOString(),
    } satisfies ProviderResult<MarketsData>);
  }

  const [indices, crypto] = await Promise.all([
    getLive(stocksProvider, {}),
    getLive(cryptoProvider, {}),
  ]);

  const idx: Quote[] = indices.data ?? [];
  const cry: Quote[] = crypto.data ?? [];

  // Partial success is fine; only a hard error if BOTH failed.
  if (idx.length === 0 && cry.length === 0) {
    return NextResponse.json({
      data: null,
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: indices.error ?? crypto.error ?? "Markets unavailable",
    } satisfies ProviderResult<MarketsData>);
  }

  const data: MarketsData = { indices: idx, crypto: cry };
  cache = { data, ts: Date.now() };
  return NextResponse.json({
    data,
    source: "live",
    fetchedAt: new Date().toISOString(),
  } satisfies ProviderResult<MarketsData>);
}
