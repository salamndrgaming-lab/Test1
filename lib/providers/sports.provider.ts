import type { Game, League } from "@/types";
import { type DataProvider } from "./withFallback";
import { fetchEspn } from "./espn";

export interface SportsParams {
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

export const sportsProvider: DataProvider<SportsParams, Game[]> = {
  name: "ESPN Scoreboard",
  async fetchLive(params, signal) {
    const leagues = params.league ? [params.league] : DEFAULT_LEAGUES;
    const { games } = await fetchEspn(leagues, signal);
    if (games.length === 0) throw new Error("no games available");
    // soonest first; live/scheduled before finals
    const rank = { in: 0, scheduled: 1, final: 2 } as const;
    return games.sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        +new Date(a.startTime) - +new Date(b.startTime),
    );
  },
};
