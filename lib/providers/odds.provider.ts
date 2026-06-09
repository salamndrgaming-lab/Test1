import type { MarketOdds } from "@/types";
import { type DataProvider } from "./withFallback";
import { SEED_ODDS } from "@/data/seed-sports";

export interface OddsParams {
  gameId?: string;
}

// Most odds APIs require a key. We default to seed odds and allow an optional
// The Odds API key to enrich. (Kept seed-first so the app never breaks.)
export const oddsProvider: DataProvider<OddsParams, MarketOdds[]> = {
  name: "Odds (seed / optional The Odds API)",
  async fetchLive() {
    // Intentionally conservative: most odds APIs require a key and have no
    // stable free schema, so we always fall back to bundled seed odds rather
    // than risk rendering malformed live data. (Optional ODDS_API_KEY could be
    // wired here in the future.)
    throw new Error("live odds enrichment not enabled");
  },
  seed(params) {
    if (params.gameId) {
      const filtered = SEED_ODDS.filter((o) => o.gameId === params.gameId);
      if (filtered.length > 0) return filtered;
    }
    return SEED_ODDS;
  },
};
