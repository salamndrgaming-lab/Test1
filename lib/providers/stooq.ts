import type { Quote } from "@/types";
import { fetchText, type DataProvider } from "./withFallback";

export interface StooqSymbol {
  stooq: string; // e.g. "aapl.us" or "^spx"
  name: string;
}

/**
 * Fetch quotes from Stooq's keyless CSV endpoint. MUST run server-side — Stooq
 * blocks browser/CORS requests. Rows return in the requested order (including
 * "N/D" rows for unknown/closed symbols), so we align by index.
 */
export async function fetchStooqQuotes(
  symbols: StooqSymbol[],
  signal: AbortSignal,
): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const s = symbols.map((x) => x.stooq).join(",");
  const csv = await fetchText(
    `https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`,
    signal,
    { "User-Agent": "Mozilla/5.0 (compatible; NewsScope/0.1)" },
  );
  const lines = csv.trim().split("\n");
  if (lines.length < 2) throw new Error("empty stooq response");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iOpen = header.indexOf("open");
  const iClose = header.indexOf("close");

  const quotes: Quote[] = [];
  for (let r = 1; r < lines.length; r++) {
    const meta = symbols[r - 1];
    if (!meta) break;
    const cols = lines[r].split(",");
    const open = Number(cols[iOpen]);
    const close = Number(cols[iClose]);
    if (!Number.isFinite(close)) continue; // skip N/D
    const changePct =
      Number.isFinite(open) && open !== 0 ? ((close - open) / open) * 100 : 0;
    quotes.push({
      symbol: meta.stooq.replace("^", "").replace(/\.us$/i, "").toUpperCase(),
      name: meta.name,
      price: close,
      changePct: Number(changePct.toFixed(2)),
      currency: "usd",
    });
  }
  if (quotes.length === 0) throw new Error("no parsable quotes");
  return quotes;
}

// Provider for an arbitrary symbol set (used by the /quote watchlist route).
export const stooqQuoteProvider: DataProvider<
  { symbols: StooqSymbol[] },
  Quote[]
> = {
  name: "Stooq",
  fetchLive: ({ symbols }, signal) => fetchStooqQuotes(symbols, signal),
};
