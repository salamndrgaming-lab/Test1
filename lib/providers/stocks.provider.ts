import type { Quote } from "@/types";
import { fetchText, type DataProvider } from "./withFallback";

export type StocksParams = Record<string, never>;

// Symbol → display name. Stooq uses ^ for indices and .us for US equities.
const SYMBOLS: { stooq: string; name: string }[] = [
  { stooq: "^spx", name: "S&P 500" },
  { stooq: "^dji", name: "Dow Jones" },
  { stooq: "^ndq", name: "Nasdaq" },
  { stooq: "^vix", name: "VIX" },
];

// Stooq quote CSV (keyless). MUST be server-side — Stooq blocks browser/CORS.
export const stocksProvider: DataProvider<StocksParams, Quote[]> = {
  name: "Stooq",
  async fetchLive(_params, signal) {
    const s = SYMBOLS.map((x) => x.stooq).join(",");
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
      const cols = lines[r].split(",");
      const meta = SYMBOLS[r - 1];
      const open = Number(cols[iOpen]);
      const close = Number(cols[iClose]);
      if (!Number.isFinite(close) || !meta) continue; // skip N/D rows
      const changePct =
        Number.isFinite(open) && open !== 0 ? ((close - open) / open) * 100 : 0;
      quotes.push({
        symbol: meta.stooq.replace("^", "").toUpperCase(),
        name: meta.name,
        price: close,
        changePct: Number(changePct.toFixed(2)),
        currency: "usd",
      });
    }
    if (quotes.length === 0) throw new Error("no parsable quotes");
    return quotes;
  },
};
