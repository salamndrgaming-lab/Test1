import type { IpoData, IpoEntry } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export type IpoParams = { month?: string };

// Nasdaq IPO calendar (keyless, but needs browser-like headers; server-only).
interface NasdaqRow {
  symbol?: string;
  companyName?: string;
  proposedTickerSymbol?: string;
  dealStatus?: string;
  pricedDate?: string;
  expectedPriceDate?: string;
  proposedExchange?: string;
  proposedSharePrice?: string;
  sharesOffered?: string;
  dollarValueOfSharesOffered?: string;
}
interface NasdaqResponse {
  data?: {
    priced?: { rows?: NasdaqRow[] };
    upcoming?: { upcomingTable?: { rows?: NasdaqRow[] } };
  };
}

function mapRow(r: NasdaqRow, status: IpoEntry["status"]): IpoEntry {
  return {
    symbol: r.symbol ?? r.proposedTickerSymbol ?? "—",
    company: r.companyName ?? "—",
    date: r.pricedDate ?? r.expectedPriceDate,
    priceRange: r.proposedSharePrice,
    shares: r.sharesOffered ?? r.dollarValueOfSharesOffered,
    exchange: r.proposedExchange,
    status,
  };
}

export const ipoProvider: DataProvider<IpoParams, IpoData> = {
  name: "Nasdaq IPO Calendar",
  async fetchLive(params, signal) {
    const month =
      params.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    const data = await fetchJson<NasdaqResponse>(
      `https://api.nasdaq.com/api/ipo/calendar?date=${month}`,
      signal,
      {
        "User-Agent": "Mozilla/5.0 (compatible; NewsScope/0.1)",
        Accept: "application/json",
      },
    );
    const priced = (data.data?.priced?.rows ?? []).map((r) =>
      mapRow(r, "priced"),
    );
    const upcoming = (data.data?.upcoming?.upcomingTable?.rows ?? []).map((r) =>
      mapRow(r, "upcoming"),
    );
    if (priced.length === 0 && upcoming.length === 0)
      throw new Error("no IPO data");
    return { priced, upcoming };
  },
};
