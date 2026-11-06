import { NextResponse } from "next/server";
import type { League } from "@/types";
import { fetchPlayerHistory } from "@/lib/providers/playerlogs";

export const dynamic = "force-dynamic";

/**
 * Both teams' recent player box scores for one upcoming game.
 *
 * Keyless, so this costs no odds-API credits — the entire budget argument
 * that shapes the props endpoint does not apply here. What it costs is
 * latency: a team's schedule is one request and each past game is another
 * half-megabyte summary, so a cold game takes a few seconds and a warm one is
 * instant. Completed games are immutable and cached for the life of the
 * process.
 *
 * Returns raw per-game lines, not a model. Estimating distributions and
 * simulating happens in the browser from these, for the same reason the game
 * simulation does: the numbers are then checkable against the games they came
 * from, and nothing in between can quietly add an assumption.
 */

const SUPPORTED: League[] = ["NBA", "NCAAB"];

const ESPN_SPORT: Partial<Record<League, string>> = {
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
};

/** The two team ids in an upcoming game, from its own summary. */
async function teamsInGame(
  league: League,
  eventId: string,
  signal: AbortSignal,
): Promise<{ id: string; abbr: string; homeAway: string }[]> {
  const sport = ESPN_SPORT[league];
  if (!sport) return [];
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/summary?event=${encodeURIComponent(eventId)}`,
    { signal },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    header?: {
      competitions?: {
        competitors?: {
          id?: string;
          homeAway?: string;
          team?: { abbreviation?: string };
        }[];
      }[];
    };
  };
  const out: { id: string; abbr: string; homeAway: string }[] = [];
  for (const c of json.header?.competitions?.[0]?.competitors ?? []) {
    if (c.id) {
      out.push({
        id: c.id,
        abbr: c.team?.abbreviation ?? "",
        homeAway: c.homeAway ?? "",
      });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const league = url.searchParams.get("league") as League | null;
  const eventId = url.searchParams.get("eventId");
  if (!league || !eventId || !SUPPORTED.includes(league)) {
    return NextResponse.json(
      {
        error: "unsupported",
        reason:
          "Player box scores are only wired up for basketball, where a player's points are a slice of the number the model projects.",
      },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const teams = await teamsInGame(league, eventId, controller.signal);
    if (teams.length < 2) {
      return NextResponse.json({ error: "no-teams-for-event", lines: [] });
    }
    const history = await fetchPlayerHistory(
      league,
      teams.map((t) => t.id),
      controller.signal,
    );
    return NextResponse.json({
      teams,
      gamesRead: history.gamesRead,
      missed: history.missed,
      lines: history.lines,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "timeout" : "network", lines: [] },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
