import type { League, MarketOdds } from "@/types";
import { type DataProvider } from "./withFallback";
import { fetchEspn } from "./espn";

export interface OddsParams {
  league?: League;
}

const DEFAULT_LEAGUES: League[] = [
  "NBA",
  "NFL",
  "NHL",
  "MLB",
  "NCAAF",
  "NCAAB",
];

// Real, keyless betting odds parsed from ESPN's scoreboard response.
export const oddsProvider: DataProvider<OddsParams, MarketOdds[]> = {
  name: "ESPN Odds",
  async fetchLive(params, signal) {
    const leagues = params.league ? [params.league] : DEFAULT_LEAGUES;
    const { odds } = await fetchEspn(leagues, signal);
    if (odds.length === 0) throw new Error("no odds available");
    return odds;
  },
};
