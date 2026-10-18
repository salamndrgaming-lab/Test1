import type {
  BookPrice,
  Game,
  League,
  LineMovement,
  ClosingLine,
  CompletedGame,
  MarketOdds,
  ProbablePitcher,
  Team,
  TeamInjuryReport,
  TeamScoring,
} from "@/types";
import { fetchJson } from "./withFallback";
import { isBookmaker } from "@/lib/market";

export { isBookmaker };
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

interface EspnStatistic {
  name?: string;
  abbreviation?: string;
  displayValue?: string;
  value?: number;
}
interface EspnProbable {
  name?: string;
  displayName?: string;
  athlete?: { displayName?: string; shortName?: string };
  statistics?: EspnStatistic[];
}
interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team?: { id?: string; displayName?: string; abbreviation?: string };
  records?: { summary?: string }[];
  probables?: EspnProbable[];
}

/**
 * The listed starting pitcher and their ERA.
 *
 * Baseball is the one sport where a single player is most of the line, and
 * ESPN ships probables in the same scoreboard payload we already fetch. Field
 * names vary, so match the ERA on several spellings.
 */
function extractPitcher(c?: EspnCompetitor): ProbablePitcher | undefined {
  const p = c?.probables?.[0];
  if (!p) return undefined;
  const name =
    p.athlete?.displayName ?? p.athlete?.shortName ?? p.displayName ?? p.name;
  if (!name) return undefined;

  const stat = (keys: string[]): number | undefined => {
    for (const s of p.statistics ?? []) {
      const tag = (s.abbreviation ?? s.name ?? "").toLowerCase();
      if (!keys.includes(tag)) continue;
      const n =
        s.value ?? (s.displayValue ? parseFloat(s.displayValue) : undefined);
      if (n != null && Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const era = stat(["era", "earnedrunaverage"]);
  return {
    name,
    // A nonsensical ERA is worse than none: it would move the projection.
    era: era != null && era >= 0 && era <= 15 ? era : undefined,
    wins: stat(["w", "wins"]),
    losses: stat(["l", "losses"]),
  };
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
          probablePitcher: extractPitcher(home),
        },
        away: {
          id: away.team?.id ?? "a",
          name: away.team?.displayName ?? "Away",
          abbreviation: away.team?.abbreviation ?? "AWY",
          record: away.records?.[0]?.summary,
          probablePitcher: extractPitcher(away),
        },
        homeScore: home.score ? Number(home.score) : undefined,
        awayScore: away.score ? Number(away.score) : undefined,
      };
      games.push(game);

      const webLink = ev.links?.find((l) => l.href?.includes("/game"))?.href;
      if (webLink) gameLinks[ev.id] = webLink;

      // ESPN returns an ARRAY of bookmakers. Reading only the first threw away
      // the one thing that makes positive expected value measurable: the
      // spread between what different books will pay for the same bet.
      const allOdds = comp?.odds ?? [];
      const o = allOdds[0];
      if (o) {
        const books: BookPrice[] = [];
        for (const q of allOdds) {
          const qHomeMl = extractMoneyline(q.homeTeamOdds);
          const qAwayMl = extractMoneyline(q.awayTeamOdds);
          // Resolve each book's spread to the HOME side on its own terms.
          const qDet = parseDetails(q.details);
          let qSpread = q.spread;
          if (qDet.abbr && qDet.line != null) {
            const abs = Math.abs(qDet.line);
            qSpread =
              qDet.abbr === game.home.abbreviation
                ? -abs
                : qDet.abbr === game.away.abbreviation
                  ? abs
                  : q.spread;
          }
          if (!isBookmaker(q.provider?.name)) continue;
          books.push({
            book: q.provider?.name ?? `book ${books.length + 1}`,
            homeMoneyline: qHomeMl,
            awayMoneyline: qAwayMl,
            spread: qSpread,
            spreadHomeOdds: q.homeTeamOdds?.spreadOdds,
            spreadAwayOdds: q.awayTeamOdds?.spreadOdds,
            total: q.overUnder,
            overOdds: q.overOdds,
            underOdds: q.underOdds,
          });
        }
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
          books,
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
 * Per-event odds: every bookmaker ESPN lists
 * ------------------------------------------------------------------ *
 * The scoreboard embeds one or two providers. ESPN's core API has a dedicated
 * per-event odds endpoint that enumerates all of them, which is the whole
 * basis for measuring a price edge and a standard error on fair value — with
 * one quote, "edge against the consensus" is circular.
 *
 * Costs one request per game, so it is capped and run in parallel, and a
 * failure degrades to whatever the scoreboard carried.
 */

/** Core API paths differ from the site API's: sport/leagues/league. */
const CORE_PATH: Record<League, string> = {
  NFL: "football/leagues/nfl",
  NBA: "basketball/leagues/nba",
  MLB: "baseball/leagues/mlb",
  NHL: "hockey/leagues/nhl",
  NCAAF: "football/leagues/college-football",
  NCAAB: "basketball/leagues/mens-college-basketball",
};

interface EspnOddsCollection {
  items?: EspnOdds[];
}

/**
 * Map a collection of provider odds to book prices for one game.
 *
 * `homeAbbr`/`awayAbbr` resolve each book's spread onto the home side; a book
 * whose details string names neither team keeps ESPN's raw `spread`, which is
 * the favourite's, and is therefore only trustworthy in magnitude.
 */
export function parseOddsItems(
  items: EspnOdds[] | undefined,
  homeAbbr: string,
  awayAbbr: string,
): BookPrice[] {
  const out: BookPrice[] = [];
  const seen = new Set<string>();

  for (const q of items ?? []) {
    const name = q.provider?.name;
    if (!isBookmaker(name)) continue;
    const key = (name ?? "").toLowerCase();
    if (seen.has(key)) continue;

    const det = parseDetails(q.details);
    let spread = q.spread;
    if (det.abbr && det.line != null) {
      const abs = Math.abs(det.line);
      if (det.abbr === homeAbbr) spread = -abs;
      else if (det.abbr === awayAbbr) spread = abs;
    }

    const price: BookPrice = {
      book: name!,
      homeMoneyline: extractMoneyline(q.homeTeamOdds),
      awayMoneyline: extractMoneyline(q.awayTeamOdds),
      spread,
      spreadHomeOdds: q.homeTeamOdds?.spreadOdds,
      spreadAwayOdds: q.awayTeamOdds?.spreadOdds,
      total: q.overUnder,
      overOdds: q.overOdds,
      underOdds: q.underOdds,
    };
    // A provider with no usable price on any market is not a quote.
    const anyPrice =
      price.homeMoneyline != null ||
      price.awayMoneyline != null ||
      price.spreadHomeOdds != null ||
      price.overOdds != null;
    if (!anyPrice) continue;

    seen.add(key);
    out.push(price);
  }
  return out;
}

/** Merge two book lists, preferring the first on a name collision. */
export function mergeBooks(
  preferred: BookPrice[],
  fallback: BookPrice[],
): BookPrice[] {
  const out = [...preferred];
  const seen = new Set(preferred.map((b) => b.book.toLowerCase()));
  for (const b of fallback) {
    const key = b.book.toLowerCase();
    if (seen.has(key) || !isBookmaker(b.book)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

/**
 * Every bookmaker's prices for the given games, keyed by game id.
 *
 * Best-effort and bounded: games are capped, requests run in parallel, and
 * any game that fails simply keeps whatever the scoreboard carried.
 */
export async function fetchEventOdds(
  games: {
    id: string;
    league: League;
    home: Team;
    away: Team;
    startTime?: string;
  }[],
  signal: AbortSignal,
  cap = 20,
): Promise<Record<string, BookPrice[]>> {
  // A Saturday college slate can be a hundred games, so the cap matters —
  // and it should keep the games nearest to starting rather than whatever
  // order the scoreboard happened to return.
  const targets = [...games]
    .sort((a, b) => {
      const ta = a.startTime ? Date.parse(a.startTime) : Infinity;
      const tb = b.startTime ? Date.parse(b.startTime) : Infinity;
      return (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity);
    })
    .slice(0, cap);
  if (targets.length === 0) return {};

  const results = await Promise.allSettled(
    targets.map(async (g) => {
      const path = CORE_PATH[g.league];
      if (!path) return { id: g.id, books: [] as BookPrice[] };
      const data = await fetchJson<EspnOddsCollection>(
        `https://sports.core.api.espn.com/v2/sports/${path}/events/${encodeURIComponent(g.id)}/competitions/${encodeURIComponent(g.id)}/odds`,
        signal,
      );
      return {
        id: g.id,
        books: parseOddsItems(
          data.items,
          g.home.abbreviation,
          g.away.abbreviation,
        ),
      };
    }),
  );

  const out: Record<string, BookPrice[]> = {};
  for (const r of results) {
    if (r.status !== "fulfilled" || r.value.books.length === 0) continue;
    out[r.value.id] = r.value.books;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The results window
 * ------------------------------------------------------------------ *
 * The scoreboard endpoint takes a `dates` parameter, so past results are
 * available without a schedule endpoint and without per-team requests. One
 * window serves two purposes: it is the training data for the
 * opponent-adjusted ratings, and it is how we detect who played last night.
 */

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
 * Pull every completed game out of one or more scoreboard payloads.
 *
 * This one window feeds both the ratings solve and the rest/back-to-back
 * detection, so there is a single source of truth and far fewer requests than
 * fetching each separately.
 */
export function parseCompletedGames(
  league: League,
  boards: EspnScoreboard[],
): CompletedGame[] {
  const out: CompletedGame[] = [];
  const seen = new Set<string>();

  for (const board of boards ?? []) {
    for (const ev of board?.events ?? []) {
      if (ev.status?.type?.state !== "post") continue;
      if (seen.has(ev.id)) continue;
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      const homeId = home?.team?.id;
      const awayId = away?.team?.id;
      const homeScore = Number(home?.score);
      const awayScore = Number(away?.score);
      if (
        !homeId ||
        !awayId ||
        !ev.date ||
        !Number.isFinite(homeScore) ||
        !Number.isFinite(awayScore)
      ) {
        continue;
      }
      seen.add(ev.id);
      out.push({
        gameId: ev.id,
        league,
        date: ev.date,
        homeId,
        awayId,
        homeAbbr: home?.team?.abbreviation,
        awayAbbr: away?.team?.abbreviation,
        homeScore,
        awayScore,
      });
    }
  }
  return out;
}

/**
 * Completed games over the last `days` for each league.
 *
 * ESPN's scoreboard accepts a date range, which gets a whole window in one
 * request. Ranges aren't honoured uniformly across sports, so if a range
 * comes back looking like a single day we fall back to fetching individual
 * days — capped, because this runs inside a request budget.
 */
export async function fetchResultsWindow(
  leagues: League[],
  signal: AbortSignal,
  days = 30,
  now: Date = new Date(),
): Promise<CompletedGame[]> {
  const DAY = 86_400_000;
  const FALLBACK_DAYS = 8;

  const board = (league: League, dates: string) =>
    fetchJson<EspnScoreboard>(
      `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/scoreboard?dates=${dates}`,
      signal,
    ).catch(() => ({}) as EspnScoreboard);

  const perLeague = await Promise.allSettled(
    leagues.map(async (league) => {
      const from = easternDateStamp(new Date(now.getTime() - days * DAY));
      const to = easternDateStamp(new Date(now.getTime() - DAY));
      const ranged = parseCompletedGames(league, [
        await board(league, `${from}-${to}`),
      ]);

      // A range that worked spans many dates; one date means it was ignored.
      const distinctDates = new Set(ranged.map((g) => g.date.slice(0, 10)));
      if (distinctDates.size > 2) return ranged;

      const stamps = Array.from({ length: FALLBACK_DAYS }, (_, i) =>
        easternDateStamp(new Date(now.getTime() - (i + 1) * DAY)),
      );
      const boards = await Promise.all(stamps.map((s) => board(league, s)));
      const daily = parseCompletedGames(league, boards);
      // Keep whichever window gave us more to work with.
      return daily.length >= ranged.length ? daily : ranged;
    }),
  );

  const out: CompletedGame[] = [];
  for (const r of perLeague) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Injuries
 * ------------------------------------------------------------------ *
 * Used as a brake, not an estimate. We can't tell a franchise player from a
 * third-stringer out of this feed, so the model reads these counts as "there
 * is information here we don't have" and defers further to the market, rather
 * than inventing a points adjustment.
 */

interface EspnInjuryEntry {
  status?: string;
  type?: { name?: string; description?: string };
  athlete?: { displayName?: string; shortName?: string };
  details?: { type?: string };
}
interface EspnInjuryTeam {
  team?: { id?: string; abbreviation?: string };
  id?: string;
  abbreviation?: string;
  injuries?: EspnInjuryEntry[];
}
interface EspnInjuryResponse {
  injuries?: EspnInjuryTeam[];
  items?: EspnInjuryTeam[];
}

const OUT_STATUSES = ["out", "doubtful", "injured reserve", "ir", "suspension"];
const QUESTIONABLE_STATUSES = ["questionable", "day-to-day", "game-time decision", "probable"];

function classifyStatus(entry: EspnInjuryEntry): "out" | "questionable" | null {
  const raw = (
    entry.status ??
    entry.type?.name ??
    entry.type?.description ??
    entry.details?.type ??
    ""
  ).toLowerCase();
  if (!raw) return null;
  if (OUT_STATUSES.some((s) => raw.includes(s))) return "out";
  if (QUESTIONABLE_STATUSES.some((s) => raw.includes(s))) return "questionable";
  return null;
}

/** Parse one league's injury payload into per-team counts. */
export function parseInjuries(
  league: League,
  data: unknown,
): Record<string, TeamInjuryReport> {
  const body = (data ?? {}) as EspnInjuryResponse;
  const teams = body.injuries ?? body.items ?? [];
  const out: Record<string, TeamInjuryReport> = {};

  for (const t of teams) {
    const teamId = t.team?.id ?? t.id;
    if (!teamId) continue;
    const report: TeamInjuryReport = {
      teamId,
      out: 0,
      questionable: 0,
      names: [],
    };
    for (const entry of t.injuries ?? []) {
      const kind = classifyStatus(entry);
      if (!kind) continue;
      if (kind === "out") report.out++;
      else report.questionable++;
      const name = entry.athlete?.displayName ?? entry.athlete?.shortName;
      if (name && report.names.length < 6) report.names.push(name);
    }
    if (report.out > 0 || report.questionable > 0) {
      out[`${league}:${teamId}`] = report;
    }
  }
  return out;
}

/**
 * Injury reports keyed by `${league}:${teamId}`. Best-effort: a league whose
 * report fails contributes nothing, which simply means no brake is applied.
 */
export async function fetchInjuries(
  leagues: League[],
  signal: AbortSignal,
): Promise<Record<string, TeamInjuryReport>> {
  const results = await Promise.allSettled(
    leagues.map((league) =>
      fetchJson<EspnInjuryResponse>(
        `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/injuries`,
        signal,
      ).then((data) => ({ league, data })),
    ),
  );

  const out: Record<string, TeamInjuryReport> = {};
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    Object.assign(out, parseInjuries(r.value.league, r.value.data));
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
        team?: { abbreviation?: string };
      }[];
    }[];
  };
  pickcenter?: EspnOdds[];
}

export interface EspnGameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
}

/**
 * One game's final score and the last price the market showed, from a single
 * summary request.
 *
 * The closing line is what makes closing-line value measurable: comparing the
 * number we took against the number the market settled on is a far
 * lower-variance verdict on a pick than whether it happened to win.
 */
export interface EspnGameSnapshot {
  gameId: string;
  result: EspnGameResult | null;
  closing: ClosingLine | null;
}

/** Last snapshot a priced market offers, preferring an explicit close. */
function extractClosing(
  gameId: string,
  odds: EspnOdds | undefined,
  homeAbbr: string | undefined,
): ClosingLine | null {
  if (!odds) return null;

  const snapshotSide = (t?: EspnTeamOdds) =>
    snapshotSpread(t?.close) ?? snapshotSpread(t?.current);
  const homeSnap = snapshotSide(odds.homeTeamOdds);
  const awaySnap = snapshotSide(odds.awayTeamOdds);

  // Fall back to the details string, which is unambiguous about the favourite.
  const det = parseDetails(odds.details);
  let spread =
    homeSnap ?? (awaySnap != null ? -awaySnap : undefined) ?? odds.spread;
  if (det.abbr && det.line != null && homeAbbr) {
    const lineAbs = Math.abs(det.line);
    spread = det.abbr === homeAbbr ? -lineAbs : lineAbs;
  }

  const closeMl = (t?: EspnTeamOdds) =>
    toAmerican(t?.close?.moneyLine?.american) ??
    numeric(t?.close?.moneyLine?.value) ??
    extractMoneyline(t);

  const line: ClosingLine = {
    gameId,
    spread: spread != null && Number.isFinite(spread) ? spread : undefined,
    total:
      numeric(odds.homeTeamOdds?.close?.total?.value) ??
      (odds.overUnder != null && Number.isFinite(odds.overUnder)
        ? odds.overUnder
        : undefined),
    homeMoneyline: closeMl(odds.homeTeamOdds),
    awayMoneyline: closeMl(odds.awayTeamOdds),
  };

  const empty =
    line.spread == null &&
    line.total == null &&
    line.homeMoneyline == null &&
    line.awayMoneyline == null;
  return empty ? null : line;
}

/**
 * Fetch one game's score and closing line via ESPN's summary endpoint
 * (keyless). `result` is null until the game is final; `closing` can be
 * present before then, which is fine — a line read at kickoff is the closing
 * line for our purposes.
 */
export async function fetchGameSnapshot(
  league: League,
  gameId: string,
  signal: AbortSignal,
): Promise<EspnGameSnapshot> {
  const data = await fetchJson<EspnSummary>(
    `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[league]}/summary?event=${encodeURIComponent(gameId)}`,
    signal,
  );
  const comp = data.header?.competitions?.[0];
  const status = comp?.status?.type;
  const final = status?.completed === true || status?.state === "post";

  const home = comp?.competitors?.find((c) => c.homeAway === "home");
  const away = comp?.competitors?.find((c) => c.homeAway === "away");
  const homeScore = Number(home?.score);
  const awayScore = Number(away?.score);

  const result: EspnGameResult | null =
    final && Number.isFinite(homeScore) && Number.isFinite(awayScore)
      ? { gameId, homeScore, awayScore, final: true }
      : null;

  return {
    gameId,
    result,
    closing: extractClosing(gameId, data.pickcenter?.[0], home?.team?.abbreviation),
  };
}
