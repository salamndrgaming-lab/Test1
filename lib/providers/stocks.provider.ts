import type { Quote } from "@/types";
import { type DataProvider } from "./withFallback";
import { fetchStooqQuotes, type StooqSymbol } from "./stooq";

export type StocksParams = Record<string, never>;

const INDICES: StooqSymbol[] = [
  { stooq: "^spx", name: "S&P 500" },
  { stooq: "^dji", name: "Dow Jones" },
  { stooq: "^ndq", name: "Nasdaq" },
  { stooq: "^vix", name: "VIX" },
];

// Major indices via Stooq (keyless CSV, server-side only).
export const stocksProvider: DataProvider<StocksParams, Quote[]> = {
  name: "Stooq",
  fetchLive: (_params, signal) => fetchStooqQuotes(INDICES, signal),
};
