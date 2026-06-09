import type { Game, League } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";
import { SEED_GAMES } from "@/data/seed-sports";

export interface SportsParams {
  league?: League;
}

// ESPN unofficial scoreboard endpoints (keyless). Undocumented — wrap defensively.
const ESPN_PATH: Record<League, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

interface EspnScoreboard {
  events?: {
    id: string;
    date: string;
    status?: { type?: { state?: string } };
    competitions?: {
      venue?: { fullName?: string };
      competitors?: {
        homeAway: "home" | "away";
        score?: string;
        team?: {
          id?: string;
          displayName?: string;
          abbreviation?: string;
        };
        records?: { summary?: string }[];
      }[];
    }[];
  }[];
}

function mapState(state?: string): Game["status"] {
  if (state === "in") return "in";
  if (state === "post") return "final";
  return "scheduled";
}

export const sportsProvider: DataProvider<SportsParams, Game[]> = {
  name: "ESPN Scoreboard",
  async fetchLive(params, signal) {
    const leagues = params.league
      ? [params.league]
      : (["NBA", "NFL", "NHL", "MLB"] as League[]);
    const all: Game[] = [];
    for (const league of leagues) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/scoreboard`;
      const data = await fetchJson<EspnScoreboard>(url, signal);
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        const home = comp?.competitors?.find((c) => c.homeAway === "home");
        const away = comp?.competitors?.find((c) => c.homeAway === "away");
        if (!home || !away) continue;
        all.push({
          id: ev.id,
          league,
          startTime: ev.date,
          status: mapState(ev.status?.type?.state),
          venue: comp?.venue?.fullName,
          home: {
            id: home.team?.id ?? "h",
            name: home.team?.displayName ?? "Home",
            abbreviation: home.team?.abbreviation ?? "HOM",
            record: home.records?.[0]?.summary,
          },
          away: {
            id: away.team?.id ?? "a",
            name: away.team?.displayName ?? "Away",
            abbreviation: away.team?.abbreviation ?? "AWY",
            record: away.records?.[0]?.summary,
          },
          homeScore: home.score ? Number(home.score) : undefined,
          awayScore: away.score ? Number(away.score) : undefined,
        });
      }
    }
    if (all.length === 0) throw new Error("no events");
    return all;
  },
  seed(params) {
    if (params.league) {
      const filtered = SEED_GAMES.filter((g) => g.league === params.league);
      if (filtered.length > 0) return filtered;
    }
    return SEED_GAMES;
  },
};
