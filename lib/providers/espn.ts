import type { Game, League, MarketOdds } from "@/types";
import { fetchJson } from "./withFallback";

// ESPN unofficial scoreboard endpoints (keyless). The same response carries
// scores AND betting odds, so we parse both in one call.
export const ESPN_PATH: Record<League, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

interface EspnMoneyLine {
  american?: string | number;
  value?: number;
}
interface EspnTeamOdds {
  moneyLine?: number;
  favorite?: boolean;
  current?: { moneyLine?: EspnMoneyLine };
  close?: { moneyLine?: EspnMoneyLine };
  open?: { moneyLine?: EspnMoneyLine };
}

interface EspnOdds {
  details?: string; // e.g. "BOS -4.5"
  spread?: number;
  overUnder?: number;
  homeTeamOdds?: EspnTeamOdds;
  awayTeamOdds?: EspnTeamOdds;
  provider?: { name?: string };
}

/** Pull an American moneyline from the several shapes ESPN uses. */
function extractMoneyline(t?: EspnTeamOdds): number | undefined {
  if (!t) return undefined;
  if (typeof t.moneyLine === "number") return t.moneyLine;
  const am =
    t.current?.moneyLine?.american ??
    t.close?.moneyLine?.american ??
    t.open?.moneyLine?.american;
  if (am != null) {
    const n = typeof am === "string" ? parseInt(am.replace("+", ""), 10) : am;
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** Parse "NYY -1.5" -> { abbr: "NYY", line: -1.5 }. */
function parseDetails(details?: string): { abbr?: string; line?: number } {
  if (!details) return {};
  const m = details.match(/([A-Z]{2,4})\s*([+-]?\d+(?:\.\d+)?)/);
  if (m) return { abbr: m[1], line: parseFloat(m[2]) };
  return {};
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
        const homeMl = extractMoneyline(o.homeTeamOdds);
        const awayMl = extractMoneyline(o.awayTeamOdds);
        const homeAbbr = game.home.abbreviation;
        const awayAbbr = game.away.abbreviation;

        // favorite: prefer explicit flag, then details, then moneylines
        let favorite: "home" | "away" | undefined;
        if (o.homeTeamOdds?.favorite) favorite = "home";
        else if (o.awayTeamOdds?.favorite) favorite = "away";
        const det = parseDetails(o.details);
        if (!favorite && det.abbr) {
          if (det.abbr === homeAbbr) favorite = "home";
          else if (det.abbr === awayAbbr) favorite = "away";
        }
        if (!favorite && homeMl != null && awayMl != null)
          favorite = homeMl <= awayMl ? "home" : "away";

        // home spread (negative if home favored), derived unambiguously
        let homeSpread = o.spread;
        if (det.abbr && det.line != null) {
          const lineAbs = Math.abs(det.line);
          homeSpread = det.abbr === homeAbbr ? -lineAbs : lineAbs;
        }

        odds.push({
          gameId: ev.id,
          book: o.provider?.name ?? "ESPN BET",
          homeMoneyline: homeMl,
          awayMoneyline: awayMl,
          spread: homeSpread,
          total: o.overUnder,
          favorite,
          details: o.details,
        });
      }
    }
  }

  return { games, odds, gameLinks };
}
