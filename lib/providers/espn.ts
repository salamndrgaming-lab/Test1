import type {
  Game,
  League,
  LineMovement,
  MarketOdds,
  TeamRest,
  TeamScoring,
} from "@/types";
import { fetchJson } from "./withFallback";
import { americanToDecimal, impliedProbability, removeVig } from "@/lib/sgp";

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
/** ESPN nests a priced snapshot under open/current/close. */
interface EspnSnapshot {
  moneyLine?: EspnMoneyLine;
  pointSpread?: { value?: number; american?: string | number };
  spread?: { value?: number; american?: string | number };
  total?: { value?: number; american?: string | number };
  over?: { value?: number; american?: string | number };
  under?: { value?: number; american?: string | number };
}
interface EspnTeamOdds {
  moneyLine?: number;
  spreadOdds?: number;
  favorite?: boolean;
  current?: EspnSnapshot;
  close?: EspnSnapshot;
  open?: EspnSnapshot;
}

interface EspnOdds {
  details?: string; // e.g. "BOS -4.5"
  spread?: number;
  overUnder?: number;
  overOdds?: number;
  underOdds?: number;
  homeTeamOdds?: EspnTeamOdds;
  awayTeamOdds?: EspnTeamOdds;
  provider?: { name?: string };
}

/** American odds come back as 2500, "+2500" or "-110" depending on the field. */
function toAmerican(v?: string | number): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseInt(v.replace("+", ""), 10) : v;
  return Number.isFinite(n) ? n : undefined;
}

function numeric(v?: number | string): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Pull an American moneyline from the several shapes ESPN uses. */
function extractMoneyline(t?: EspnTeamOdds): number | undefined {
  if (!t) return undefined;
  if (typeof t.moneyLine === "number") return t.moneyLine;
  return (
    toAmerican(t.current?.moneyLine?.american) ??
    toAmerican(t.close?.moneyLine?.american) ??
    toAmerican(t.open?.moneyLine?.american) ??
    numeric(t.current?.moneyLine?.value) ??
    numeric(t.open?.moneyLine?.value)
  );
}

/** The team's moneyline as it stood when the market opened. */
function openMoneyline(t?: EspnTeamOdds): number | undefined {
  return (
    toAmerican(t?.open?.moneyLine?.american) ?? numeric(t?.open?.moneyLine?.value)
  );
}

/** Spread from one open/current snapshot, as a signed line for that team. */
function snapshotSpread(s?: EspnSnapshot): number | undefined {
  return numeric(s?.pointSpread?.value) ?? numeric(s?.spread?.value);
}

/**
 * Compare the opening snapshot against the current one.
 *
 * Nothing here is persisted: ESPN ships `open` alongside `current` in the same
 * payload, so the movement is available on every request. Returns undefined
 * when the feed carries no opening price to compare against.
 */
export function buildMovement(
  o: EspnOdds,
  currentHomeSpread: number | undefined,
  currentTotal: number | undefined,
  homeMl: number | undefined,
  awayMl: number | undefined,
): LineMovement | undefined {
  const openHomeSpread = snapshotSpread(o.homeTeamOdds?.open);
  const openAwaySpread = snapshotSpread(o.awayTeamOdds?.open);
  // Prefer the home snapshot; fall back to negating the away line.
  const openSpread =
    openHomeSpread ??
    (openAwaySpread != null ? -openAwaySpread : undefined);
  const openTotal =
    numeric(o.homeTeamOdds?.open?.total?.value) ??
    numeric(o.awayTeamOdds?.open?.total?.value) ??
    numeric(o.homeTeamOdds?.open?.over?.value);
  const openHomeMl = openMoneyline(o.homeTeamOdds);
  const openAwayMl = openMoneyline(o.awayTeamOdds);

  let homeProbDelta: number | undefined;
  if (
    openHomeMl != null &&
    openAwayMl != null &&
    homeMl != null &&
    awayMl != null
  ) {
    const fairHome = (h: number, a: number) =>
      removeVig([
        impliedProbability(americanToDecimal(h)),
        impliedProbability(americanToDecimal(a)),
      ]).fair[0];
    homeProbDelta = fairHome(homeMl, awayMl) - fairHome(openHomeMl, openAwayMl);
  }

  const spreadDelta =
    openSpread != null && currentHomeSpread != null
      ? currentHomeSpread - openSpread
      : undefined;
  const totalDelta =
    openTotal != null && currentTotal != null
      ? currentTotal - openTotal
      : undefined;

  if (
    spreadDelta == null &&
    totalDelta == null &&
    homeProbDelta == null
  ) {
    return undefined;
  }

  return {
    openSpread,
    currentSpread: currentHomeSpread,
    openTotal,
    currentTotal,
    openHomeMoneyline: openHomeMl,
    openAwayMoneyline: openAwayMl,
    spreadDelta:
      spreadDelta == null ? undefined : Number(spreadDelta.toFixed(2)),
    totalDelta: totalDelta == null ? undefined : Number(totalDelta.toFixed(2)),
    homeProbDelta:
      homeProbDelta == null ? undefined : Number(homeProbDelta.toFixed(4)),
  };
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
          spreadHomeOdds: o.homeTeamOdds?.spreadOdds,
          spreadAwayOdds: o.awayTeamOdds?.spreadOdds,
          total: o.overUnder,
          overOdds: o.overOdds,
          underOdds: o.underOdds,
          favorite,
          details: o.details,
          movement: buildMovement(o, homeSpread, o.overUnder, homeMl, awayMl),
        });
      }
    }
  }

  return { games, odds, gameLinks };
}

/* ------------------------------------------------------------------ *
 * Team scoring rates — the inputs for a real margin and totals model.
 * ------------------------------------------------------------------ *
 * Win% alone can't produce a totals opinion and is a weak margin estimator:
 * two 10-6 teams can have wildly different point differentials. The standings
 * endpoint carries points for/against, which gives both.
 */

interface ScoringStat {
  name?: string;
  type?: string;
  value?: number;
  displayValue?: string;
}
interface ScoringEntry {
  team?: { id?: string; abbreviation?: string };
  stats?: ScoringStat[];
}
interface ScoringGroup {
  standings?: { entries?: ScoringEntry[] };
  entries?: ScoringEntry[];
  children?: ScoringGroup[];
}
type ScoringResponse = ScoringGroup;

/** ESPN names the same stat differently per sport, so match on any alias. */
const FOR_ALIASES = [
  "pointsFor", "avgPointsFor", "goalsFor", "avgGoalsFor", "runsScored",
  "pointsfor", "avgpointsfor",
];
const AGAINST_ALIASES = [
  "pointsAgainst", "avgPointsAgainst", "goalsAgainst", "avgGoalsAgainst",
  "runsAgainst", "pointsagainst", "avgpointsagainst",
];
const AVERAGE_ALIASES = new Set([
  "avgPointsFor", "avgPointsAgainst", "avgGoalsFor", "avgGoalsAgainst",
  "avgpointsfor", "avgpointsagainst",
]);

function findStat(
  stats: ScoringStat[],
  aliases: string[],
): ScoringStat | undefined {
  for (const alias of aliases) {
    const hit = stats.find((s) => s.name === alias || s.type === alias);
    if (hit && Number.isFinite(hit.value)) return hit;
  }
  return undefined;
}

function statValue(s: ScoringStat): number {
  return Number(s.value);
}

/** Walk the nested conference/division tree and yield every team entry. */
function flattenEntries(node: ScoringGroup): ScoringEntry[] {
  const out: ScoringEntry[] = [
    ...(node.standings?.entries ?? []),
    ...(node.entries ?? []),
  ];
  for (const child of node.children ?? []) out.push(...flattenEntries(child));
  return out;
}

function entryToScoring(e: ScoringEntry): TeamScoring | null {
  const teamId = e.team?.id;
  const stats = e.stats ?? [];
  if (!teamId || stats.length === 0) return null;

  const forStat = findStat(stats, FOR_ALIASES);
  const againstStat = findStat(stats, AGAINST_ALIASES);
  if (!forStat || !againstStat) return null;

  const wins = findStat(stats, ["wins"]);
  const losses = findStat(stats, ["losses"]);
  const ties = findStat(stats, ["ties", "otLosses", "otlosses"]);
  const played =
    findStat(stats, ["gamesPlayed", "gamesplayed"]) ??
    (wins && losses
      ? {
          value:
            statValue(wins) + statValue(losses) + (ties ? statValue(ties) : 0),
        }
      : undefined);
  const gamesPlayed = played ? statValue(played) : 0;

  // Season totals need dividing; per-game stats are already rates.
  const forIsAvg = AVERAGE_ALIASES.has(forStat.name ?? forStat.type ?? "");
  const againstIsAvg = AVERAGE_ALIASES.has(
    againstStat.name ?? againstStat.type ?? "",
  );
  if ((!forIsAvg || !againstIsAvg) && gamesPlayed <= 0) return null;

  const pf = forIsAvg ? statValue(forStat) : statValue(forStat) / gamesPlayed;
  const pa = againstIsAvg
    ? statValue(againstStat)
    : statValue(againstStat) / gamesPlayed;
  if (!Number.isFinite(pf) || !Number.isFinite(pa) || pf <= 0) return null;

  return {
    teamId,
    abbreviation: e.team?.abbreviation ?? "",
    gamesPlayed,
    pointsForPerGame: Number(pf.toFixed(3)),
    pointsAgainstPerGame: Number(pa.toFixed(3)),
  };
}

/**
 * Map one standings response to scoring rates keyed by `${league}:${teamId}`.
 * Exported separately from the fetch so the parser can be tested against
 * fixtures without a network call.
 */
export function parseScoringResponse(
  league: League,
  data: unknown,
): Record<string, TeamScoring> {
  const out: Record<string, TeamScoring> = {};
  for (const entry of flattenEntries((data ?? {}) as ScoringGroup)) {
    const scoring = entryToScoring(entry);
    if (scoring) out[`${league}:${scoring.teamId}`] = scoring;
  }
  return out;
}

/**
 * Scoring rates keyed by `${league}:${teamId}` for the requested leagues.
 * Best-effort: a league whose standings fail simply contributes nothing, and
 * the model falls back to its win%-based prior for those games.
 */
export async function fetchTeamScoring(
  leagues: League[],
  signal: AbortSignal,
): Promise<Record<string, TeamScoring>> {
  const out: Record<string, TeamScoring> = {};
  const results = await Promise.allSettled(
    leagues.map((league) =>
      fetchJson<ScoringResponse>(
        `https://site.api.espn.com/apis/v2/sports/${ESPN_PATH[league]}/standings`,
        signal,
      ).then((data) => ({ league, data })),
    ),
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { league, data } = r.value;
    Object.assign(out, parseScoringResponse(league, data));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rest and back-to-backs
 * ------------------------------------------------------------------ *
 * A team playing its second night in a row is measurably worse, and the effect
 * is large enough in basketball and hockey to be worth modelling. The
 * scoreboard endpoint takes a `dates` parameter, so the previous two days'
 * results tell us exactly who played and when — no schedule endpoint, and no
 * per-team requests.
 */

/** Leagues where games can fall on consecutive nights. */
export const BACK_TO_BACK_LEAGUES: League[] = ["NBA", "NHL", "MLB", "NCAAB"];

/** ESPN groups its schedule by US Eastern calendar date. */
function easternDateStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts.replace(/-/g, "");
}

/**
 * Fold day-indexed scoreboards into rest info. `days` must be ordered most
 * recent first, so index 0 is yesterday.
 */
export function parseRest(
  league: League,
  days: EspnScoreboard[],
): Record<string, TeamRest> {
  const out: Record<string, TeamRest> = {};
  days.forEach((board, dayIndex) => {
    const daysAgo = dayIndex + 1;
    for (const ev of board.events ?? []) {
      // Only completed games count as rest consumed.
      if (ev.status?.type?.state !== "post") continue;
      for (const c of ev.competitions?.[0]?.competitors ?? []) {
        const id = c.team?.id;
        if (!id) continue;
        const key = `${league}:${id}`;
        const prev = out[key];
        out[key] = {
          teamId: id,
          daysSinceLastGame: Math.min(prev?.daysSinceLastGame ?? Infinity, daysAgo),
          gamesInWindow: (prev?.gamesInWindow ?? 0) + 1,
        };
      }
    }
  });
  return out;
}

/**
 * Rest info keyed by `${league}:${teamId}`, from the last two days of results.
 * Best-effort: leagues that fail contribute nothing and the model simply
 * applies no rest adjustment for those games.
 */
export async function fetchTeamRest(
  leagues: League[],
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Record<string, TeamRest>> {
  const relevant = leagues.filter((l) => BACK_TO_BACK_LEAGUES.includes(l));
  if (relevant.length === 0) return {};

  const stamps = [1, 2].map((back) =>
    easternDateStamp(new Date(now.getTime() - back * 86_400_000)),
  );

  const results = await Promise.allSettled(
    relevant.map(async (league) => {
      const boards = await Promise.all(
        stamps.map((stamp) =>
          fetchJson<EspnScoreboard>(
            `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/scoreboard?dates=${stamp}`,
            signal,
          ).catch(() => ({}) as EspnScoreboard),
        ),
      );
      return { league, boards };
    }),
  );

  const out: Record<string, TeamRest> = {};
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    Object.assign(out, parseRest(r.value.league, r.value.boards));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Final scores — used to grade logged predictions.
 * ------------------------------------------------------------------ */

interface EspnSummary {
  header?: {
    competitions?: {
      status?: { type?: { state?: string; completed?: boolean } };
      competitors?: {
        homeAway: "home" | "away";
        score?: string;
      }[];
    }[];
  };
}

export interface EspnGameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

/**
 * Fetch one finished game's score via ESPN's summary endpoint (keyless).
 * Returns null when the game isn't final or the shape is unexpected.
 */
export async function fetchGameResult(
  league: League,
  gameId: string,
  signal: AbortSignal,
): Promise<EspnGameResult | null> {
  const data = await fetchJson<EspnSummary>(
    `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/summary?event=${encodeURIComponent(gameId)}`,
    signal,
  );
  const comp = data.header?.competitions?.[0];
  const status = comp?.status?.type;
  const final = status?.completed === true || status?.state === "post";
  if (!final) return null;

  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  const homeScore = Number(home?.score);
  const awayScore = Number(away?.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  return { gameId, homeScore, awayScore, final: true };
}
