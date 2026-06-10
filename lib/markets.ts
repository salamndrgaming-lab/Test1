import type { StooqSymbol } from "@/lib/providers/stooq";

// Curated default lists (client-usable). Users can add their own tickers too.
export const DEFAULT_STOCKS: StooqSymbol[] = [
  { stooq: "aapl.us", name: "Apple" },
  { stooq: "msft.us", name: "Microsoft" },
  { stooq: "nvda.us", name: "NVIDIA" },
  { stooq: "amzn.us", name: "Amazon" },
  { stooq: "googl.us", name: "Alphabet" },
  { stooq: "meta.us", name: "Meta" },
  { stooq: "tsla.us", name: "Tesla" },
  { stooq: "jpm.us", name: "JPMorgan" },
];

export const DEFAULT_ETFS: StooqSymbol[] = [
  { stooq: "spy.us", name: "SPDR S&P 500" },
  { stooq: "qqq.us", name: "Invesco QQQ" },
  { stooq: "vti.us", name: "Vanguard Total Mkt" },
  { stooq: "iwm.us", name: "iShares Russell 2000" },
  { stooq: "dia.us", name: "SPDR Dow Jones" },
  { stooq: "gld.us", name: "SPDR Gold" },
  { stooq: "vxus.us", name: "Vanguard Intl" },
  { stooq: "arkk.us", name: "ARK Innovation" },
];

/** Turn a user-typed ticker into a Stooq US symbol. */
export function toStooqSymbol(ticker: string): StooqSymbol {
  const t = ticker.trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
  const stooq = t.includes(".") ? t : `${t}.us`;
  return { stooq, name: ticker.trim().toUpperCase() };
}

/** Encode a symbol list for the /api/markets/quote route. */
export function encodeSymbols(symbols: StooqSymbol[]): string {
  return symbols.map((s) => `${s.stooq}|${s.name}`).join(",");
}

export function decodeSymbols(param: string): StooqSymbol[] {
  return param
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [stooq, name] = p.split("|");
      return { stooq, name: name || stooq.replace(/\.us$/i, "").toUpperCase() };
    });
}
