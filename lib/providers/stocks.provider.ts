import type { Quote } from "@/types";
import { type DataProvider } from "./withFallback";
import { fetchQuotes } from "./quotes";
import { INDICES } from "@/lib/markets";

export type StocksParams = Record<string, never>;

// Major indices via Yahoo Finance (keyless chart endpoint, server-side).
export const stocksProvider: DataProvider<StocksParams, Quote[]> = {
  name: "Yahoo Finance",
  fetchLive: (_params, signal) => fetchQuotes(INDICES, signal),
};
