import type { Quote } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export interface MarketSymbol {
  symbol: string; // Yahoo symbol, e.g. "AAPL" or "^GSPC"
  name: string;
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
      };
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
    error?: unknown;
  };
}

async function fetchOne(
  sym: MarketSymbol,
  signal: AbortSignal,
): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    sym.symbol,
  )}?range=1mo&interval=1d`;
  const j = await fetchJson<YahooChart>(url, signal, {
    "User-Agent": "Mozilla/5.0 (compatible; NewsScope/0.1)",
  });
  const res = j.chart?.result?.[0];
  if (!res?.meta) return null;
  const closes = (res.indicators?.quote?.[0]?.close ?? []).filter(
    (c): c is number => typeof c === "number",
  );
  const price = res.meta.regularMarketPrice ?? closes.at(-1);
  if (price == null) return null;
  const prev =
    res.meta.previousClose ?? closes.at(-2) ?? res.meta.chartPreviousClose;
  const changePct = prev ? ((price - prev) / prev) * 100 : 0;
  // downsample to ~24 points for a light sparkline
  const step = Math.max(1, Math.floor(closes.length / 24));
  const spark = closes.filter((_, i) => i % step === 0);
  return {
    symbol: sym.symbol.replace(/^\^/, ""),
    name: sym.name,
    price: Number(price.toFixed(price >= 1 ? 2 : 4)),
    changePct: Number(changePct.toFixed(2)),
    spark: spark.length > 1 ? spark : undefined,
    currency: res.meta.currency ?? "usd",
  };
}

/**
 * Quotes via Yahoo Finance's keyless chart endpoint (server-side). One request
 * per symbol, run in parallel; partial success is fine (failed symbols drop).
 */
export async function fetchQuotes(
  symbols: MarketSymbol[],
  signal: AbortSignal,
): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const settled = await Promise.allSettled(
    symbols.map((s) => fetchOne(s, signal)),
  );
  const quotes = settled
    .filter(
      (r): r is PromiseFulfilledResult<Quote | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);
  if (quotes.length === 0) throw new Error("no quotes available");
  return quotes;
}

export const quoteProvider: DataProvider<{ symbols: MarketSymbol[] }, Quote[]> =
  {
    name: "Yahoo Finance",
    fetchLive: ({ symbols }, signal) => fetchQuotes(symbols, signal),
  };
