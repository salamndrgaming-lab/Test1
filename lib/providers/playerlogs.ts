import type { League } from "@/types";

/**
 * Per-game player box scores, which is the data a real player model needs.
 *
 * The props work before this fitted a player's distribution out of the
 * market's own posted lines. That was honest about its inputs but it can
 * never disagree with the book about whether a prop hits — the book's number
 * IS the answer, with a correlation bolted on. To say anything the market has
 * not already said, the distribution has to come from the player.
 *
 * ESPN serves it keyless, in two steps. A team's schedule gives the event ids
 * of its completed games, one request. Each game's summary carries the full
 * box score for BOTH teams, one request, so a player's history is assembled
 * from games rather than from per-player endpoints (the per-athlete route
 * would be one request per player per game — about 160 for a single matchup).
 *
 * Completed games never change, so a summary is cached for the life of the
 * process and the second visitor to a game pays nothing.
 *
 * The thing to keep in view: this is EARLY NOVEMBER. Teams have played
 * between eight and twelve games. Every estimate downstream of this carries a
 * sample size that small, and the models in playerModel.ts report it rather
 * than smoothing it out of sight.
 */

const ESPN_SPORT: Partial<Record<League, string>> = {
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
};

/** One player's line from one game. */
export interface PlayerGameLine {
  eventId: string;
  date: string;
  player: string;
  playerId: string;
  teamId: string;
  teamAbbr: string;
  /** Minutes played. 0 means they did not play, which is kept, not dropped. */
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  /** The team's own final score that game, for a share-of-scoring model. */
  teamPoints: number;
  /** The game's total, for coupling a share to a simulated total. */
  gameTotal: number;
}

interface EspnSummary {
  boxscore?: {
    players?: {
      team?: { id?: string; abbreviation?: string };
      statistics?: {
        names?: string[];
        labels?: string[];
        athletes?: {
          athlete?: { id?: string; displayName?: string };
          stats?: string[];
          didNotPlay?: boolean;
        }[];
      }[];
    }[];
    teams?: {
      team?: { id?: string };
      statistics?: { name?: string; displayValue?: string }[];
    }[];
  };
  header?: {
    competitions?: {
      date?: string;
      competitors?: { id?: string; score?: string; homeAway?: string }[];
    }[];
  };
}

/** Completed games never change; keep them for the life of the process. */
const summaryCache = new Map<string, PlayerGameLine[]>();
const scheduleCache = new Map<string, { at: number; ids: { id: string; date: string }[] }>();
const SCHEDULE_TTL_MS = 60 * 60 * 1000;

/** Minutes can arrive as "32", "32:14" or "--". */
function parseMinutes(raw: string | undefined): number {
  if (!raw) return 0;
  const t = raw.trim();
  if (!t || t === "--") return 0;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    return (Number(m) || 0) + (Number(s) || 0) / 60;
  }
  return Number(t) || 0;
}

/** "5-11" style pairs resolve to the MADE count, which is the prop's unit. */
function parseMade(raw: string | undefined): number {
  if (!raw) return 0;
  const made = raw.split("-")[0];
  const n = Number(made);
  return Number.isFinite(n) ? n : 0;
}

function num(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pull every player's line out of one game summary.
 *
 * Column positions are read from the payload's own `names`, never assumed:
 * the NBA and college box scores do not carry identical column sets, and a
 * hard-coded index silently reads rebounds out of the turnovers column.
 */
export function linesFromSummary(
  eventId: string,
  json: EspnSummary,
): PlayerGameLine[] {
  const comp = json.header?.competitions?.[0];
  const date = comp?.date ?? "";
  const scores = new Map<string, number>();
  for (const c of comp?.competitors ?? []) {
    if (c.id) scores.set(c.id, Number(c.score) || 0);
  }
  const gameTotal = [...scores.values()].reduce((a, b) => a + b, 0);

  const out: PlayerGameLine[] = [];
  for (const block of json.boxscore?.players ?? []) {
    const teamId = block.team?.id ?? "";
    const teamAbbr = block.team?.abbreviation ?? "";
    const stat = block.statistics?.[0];
    const cols = (stat?.names ?? stat?.labels ?? []).map((s) => s.toUpperCase());
    const at = (name: string) => cols.indexOf(name);
    const iMin = at("MIN");
    const iPts = at("PTS");
    const iReb = at("REB");
    const iAst = at("AST");
    const i3pt = at("3PT");
    // Without the columns the model needs, emit nothing for this block rather
    // than zeros that would read as "played and scored nothing".
    if (iMin < 0 || iPts < 0) continue;

    for (const a of stat?.athletes ?? []) {
      const player = a.athlete?.displayName;
      if (!player) continue;
      const s = a.stats ?? [];
      if (a.didNotPlay || s.length === 0) continue;
      out.push({
        eventId,
        date,
        player,
        playerId: a.athlete?.id ?? "",
        teamId,
        teamAbbr,
        minutes: parseMinutes(s[iMin]),
        points: num(s[iPts]),
        rebounds: iReb >= 0 ? num(s[iReb]) : 0,
        assists: iAst >= 0 ? num(s[iAst]) : 0,
        threes: i3pt >= 0 ? parseMade(s[i3pt]) : 0,
        teamPoints: scores.get(teamId) ?? 0,
        gameTotal,
      });
    }
  }
  return out;
}

/** A team's completed games this season, most recent last. */
export async function fetchTeamSchedule(
  league: League,
  teamId: string,
  signal?: AbortSignal,
): Promise<{ id: string; date: string }[]> {
  const sport = ESPN_SPORT[league];
  if (!sport) return [];
  const key = `${league}:${teamId}`;
  const cached = scheduleCache.get(key);
  if (cached && Date.now() - cached.at < SCHEDULE_TTL_MS) return cached.ids;

  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/teams/${encodeURIComponent(teamId)}/schedule`,
    { signal },
  );
  if (!res.ok) return cached?.ids ?? [];
  const json = (await res.json()) as {
    events?: {
      id?: string;
      date?: string;
      competitions?: { status?: { type?: { completed?: boolean } } }[];
    }[];
  };
  const ids: { id: string; date: string }[] = [];
  for (const e of json.events ?? []) {
    if (!e.id) continue;
    if (!e.competitions?.[0]?.status?.type?.completed) continue;
    ids.push({ id: e.id, date: e.date ?? "" });
  }
  ids.sort((a, b) => a.date.localeCompare(b.date));
  scheduleCache.set(key, { at: Date.now(), ids });
  return ids;
}

export async function fetchGameLines(
  league: League,
  eventId: string,
  signal?: AbortSignal,
): Promise<PlayerGameLine[]> {
  const cached = summaryCache.get(eventId);
  if (cached) return cached;
  const sport = ESPN_SPORT[league];
  if (!sport) return [];
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/summary?event=${encodeURIComponent(eventId)}`,
    { signal },
  );
  if (!res.ok) return [];
  const lines = linesFromSummary(eventId, (await res.json()) as EspnSummary);
  summaryCache.set(eventId, lines);
  return lines;
}

export interface PlayerHistory {
  /** How many of each team's completed games were read. */
  gamesRead: number;
  /** Every line, for both teams, most recent last. */
  lines: PlayerGameLine[];
  /** Games that could not be read, so a short history is explained. */
  missed: number;
}

/**
 * Assemble both teams' recent player histories for one upcoming game.
 *
 * `maxGames` is a budget, not a preference: each game is one request and a
 * ~500KB payload, so a deeper history costs real latency on the first visit.
 * It is also an upper bound the season cannot yet meet — in early November
 * there are only eight to twelve games to read.
 */
export async function fetchPlayerHistory(
  league: League,
  teamIds: string[],
  signal?: AbortSignal,
  maxGames = 12,
): Promise<PlayerHistory> {
  const schedules = await Promise.all(
    teamIds.map((t) => fetchTeamSchedule(league, t, signal).catch(() => [])),
  );
  // One event can cover both teams when they have met, so de-duplicate.
  const wanted = new Map<string, string>();
  for (const s of schedules) {
    for (const g of s.slice(-maxGames)) wanted.set(g.id, g.date);
  }
  const settled = await Promise.allSettled(
    [...wanted.keys()].map((id) => fetchGameLines(league, id, signal)),
  );
  const lines: PlayerGameLine[] = [];
  let missed = 0;
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value.length > 0) lines.push(...r.value);
    else missed++;
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  // Keep only the two teams in question; a summary carries their opponents too.
  const keep = new Set(teamIds);
  return {
    gamesRead: wanted.size - missed,
    lines: lines.filter((l) => keep.has(l.teamId)),
    missed,
  };
}
