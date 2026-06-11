import type { MarketSymbol } from "@/lib/providers/quotes";

// Curated default lists (client-usable). Users can add their own tickers too.
// Yahoo Finance symbols (^ for indices; plain tickers for equities/ETFs).
export const DEFAULT_STOCKS: MarketSymbol[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "JPM", name: "JPMorgan" },
];

export const DEFAULT_ETFS: MarketSymbol[] = [
  { symbol: "SPY", name: "SPDR S&P 500" },
  { symbol: "QQQ", name: "Invesco QQQ" },
  { symbol: "VTI", name: "Vanguard Total Mkt" },
  { symbol: "IWM", name: "iShares Russell 2000" },
  { symbol: "DIA", name: "SPDR Dow Jones" },
  { symbol: "GLD", name: "SPDR Gold" },
  { symbol: "VXUS", name: "Vanguard Intl" },
  { symbol: "ARKK", name: "ARK Innovation" },
];

export const INDICES: MarketSymbol[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^IXIC", name: "Nasdaq" },
  { symbol: "^VIX", name: "VIX" },
];

/** Turn a user-typed ticker into a market symbol. */
export function toMarketSymbol(ticker: string): MarketSymbol {
  const t = ticker.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, "");
  return { symbol: t, name: t };
}

/** Encode a symbol list for the /api/markets/quote route. */
export function encodeSymbols(symbols: MarketSymbol[]): string {
  return symbols.map((s) => `${s.symbol}|${s.name}`).join(",");
}

export function decodeSymbols(param: string): MarketSymbol[] {
  return param
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [symbol, name] = p.split("|");
      return { symbol, name: name || symbol };
    });
}
