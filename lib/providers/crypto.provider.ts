import type { Quote } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export type CryptoParams = Record<string, never>;

const IDS = ["bitcoin", "ethereum", "solana", "ripple", "dogecoin"];

interface CoinGeckoCoin {
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h?: number;
  sparkline_in_7d?: { price?: number[] };
}

// Crypto prices via CoinGecko keyless public API (~30 calls/min — the route
// caches results to stay under the limit).
export const cryptoProvider: DataProvider<CryptoParams, Quote[]> = {
  name: "CoinGecko",
  async fetchLive(_params, signal) {
    const url =
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd` +
      `&ids=${IDS.join(",")}&sparkline=true&price_change_percentage=24h`;
    const data = await fetchJson<CoinGeckoCoin[]>(url, signal);
    if (!Array.isArray(data) || data.length === 0)
      throw new Error("no crypto data");
    return data.map((c) => {
      const prices = c.sparkline_in_7d?.price ?? [];
      // downsample 7d hourly series to ~24 points for a light sparkline
      const step = Math.max(1, Math.floor(prices.length / 24));
      const spark = prices.filter((_, i) => i % step === 0);
      return {
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        changePct: c.price_change_percentage_24h ?? 0,
        spark,
        currency: "usd",
      };
    });
  },
};
