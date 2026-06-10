import type { Game, League, MarketOdds } from "@/types";
import { fetchJson } from "./withFallback";

// ESPN unofficial scoreboard endpoints (keyless). The same response carries
// scores AND betting odds, so we parse both in one call.
const ESPN_PATH: Record<League, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

interface EspnTeamOdds {
  moneyLine?: number;
  favorite?: boolean;
}

interface EspnOdds {
  details?: string; // e.g. "BOS -4.5"
  spread?: number;
  overUnder?: number;
  homeTeamOdds?: EspnTeamOdds;
  awayTeamOdds?: EspnTeamOdds;
  provider?: { name?: string };
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team?: { id?: string; displayName?: string; abbreviation?: string };
  records?: { summary?: string }[];
}

interface EspnEvent {
  id: string;
  date: string;
  status?: { type?: { state?: string } };
  links?: { href?: string; rel?: string[] }[];
  competitions?: {
    venue?: { fullName?: string };
    competitors?: EspnCompetitor[];
    odds?: EspnOdds[];
  }[];
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

function mapState(state?: string): Game["status"] {
  if (state === "in") return "in";
  if (state === "post") return "final";
  return "scheduled";
}

export interface EspnData {
  games: Game[];
  odds: MarketOdds[];
  /** id -> public ESPN game summary page */
  gameLinks: Record<string, string>;
}

export async function fetchEspn(
  leagues: League[],
  signal: AbortSignal,
): Promise<EspnData> {
  const games: Game[] = [];
  const odds: MarketOdds[] = [];
  const gameLinks: Record<string, string> = {};

  const results = await Promise.allSettled(
    leagues.map((league) =>
      fetchJson<EspnScoreboard>(
        `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/scoreboard`,
        signal,
      ).then((data) => ({ league, data })),
    ),
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { league, data } = r.value;
    for (const ev of data.events ?? []) {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const game: Game = {
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
      };
      games.push(game);

      const webLink = ev.links?.find((l) => l.href?.includes("/game"))?.href;
      if (webLink) gameLinks[ev.id] = webLink;

      const o = comp?.odds?.[0];
      if (o) {
        odds.push({
          gameId: ev.id,
          book: o.provider?.name ?? "ESPN BET",
          homeMoneyline: o.homeTeamOdds?.moneyLine,
          awayMoneyline: o.awayTeamOdds?.moneyLine,
          spread: o.spread,
          total: o.overUnder,
        });
      }
    }
  }

  return { games, odds, gameLinks };
}
