import type { BookPrice, Game, League } from "@/types";

/**
 * The Odds API — a real multi-bookmaker price feed.
 *
 * This exists because of an arithmetic wall. With one price source, edge is
 * exactly minus half the book's hold: the "consensus fair" value IS that
 * book's own de-vigged price, so comparing its price to it is circular and
 * positive expected value is impossible rather than merely rare. No modelling
 * improvement can move that number. The only fix is more than one price.
 *
 * ESPN's per-event endpoint helps when it lists several sportsbooks, but it
 * often returns one, so this is the dependable route. It needs a free API key
 * (`ODDS_API_KEY`); with no key configured the whole module is inert and the
 * model falls back to ESPN exactly as before.
 *
 * **The quota governs the design.** The free tier is 500 credits a month and a
 * credit is markets × regions per request, so one call for three markets costs
 * three. That is roughly 160 calls a month — about five a day — which a
 * per-request fetch would exhaust in an afternoon. So:
 *
 *  - one request per LEAGUE, not per game: a single call returns the whole
 *    slate, which is the cheapest possible shape;
 *  - only leagues that actually have priced games today;
 *  - an in-process cache with a TTL, so repeated page loads are free;
 *  - and a hard monthly ceiling tracked from the API's own usage headers, so a
 *    traffic spike cannot silently burn the allowance.
 */

const SPORT_KEYS: Record<League, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  NHL: "icehockey_nhl",
  MLB: "baseball_mlb",
  NCAAF: "americanfootball_ncaaf",
  NCAAB: "basketball_ncaab",
};

/** Markets we price. Each one costs a credit per region per request. */
const MARKETS = "h2h,spreads,totals";
const REGIONS = "us";

/**
 * How long a league's slate is reused before paying for it again.
 *
 * Five minutes is a deliberate trade: lines do move faster than that, but a
 * stale-by-minutes price across every book shifts the consensus barely at all,
 * while a per-request fetch would spend the month's entire allowance in a day.
 */
export const CACHE_TTL_MS = 20 * 60 * 1000;

/**
 * How long a slate is reused, as a function of how soon it starts.
 *
 * A fixed TTL is the wrong shape on both ends. Hours before kickoff, lines
 * barely move and a short cache spends the month's allowance on nothing. In
 * the final hour they move constantly, and a stale consensus is exactly when
 * price shopping fails — we would report an edge that has already gone.
 *
 * So spend the budget where freshness is worth something. The morning before
 * a slate costs almost nothing; the hour before first pitch gets the fresh
 * data the feature actually depends on.
 */
export const ADAPTIVE_TTL: { withinHours: number; ttlMinutes: number }[] = [
  { withinHours: 2, ttlMinutes: 8 },
  { withinHours: 6, ttlMinutes: 30 },
  { withinHours: 24, ttlMinutes: 90 },
  { withinHours: Infinity, ttlMinutes: 240 },
];

/** TTL for a league whose next game starts in `hoursToFirstGame`. */
export function ttlMsFor(hoursToFirstGame: number | null): number {
  if (hoursToFirstGame == null || !Number.isFinite(hoursToFirstGame)) {
    return CACHE_TTL_MS;
  }
  // Already underway or imminent: the shortest window.
  const h = Math.max(0, hoursToFirstGame);
  for (const band of ADAPTIVE_TTL) {
    if (h <= band.withinHours) return band.ttlMinutes * 60 * 1000;
  }
  return CACHE_TTL_MS;
}

/**
 * Keep enough credits to cover the rest of the month at this minimum daily
 * rate, so a heavy afternoon cannot strand the following three weeks.
 *
 * At 3 credits per league per fetch, 12 credits a day is roughly two leagues
 * refreshed twice — enough to keep the tool usable every day of the month
 * rather than excellent for a week and dead afterwards.
 */
export const DAILY_FLOOR_CREDITS = 12;

/** Days left in the current month, including today. */
function daysLeftInMonth(now = new Date()): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, end - now.getDate() + 1);
}

/** Leave headroom so the allowance can't be fully drained by this feature. */
export const MIN_REMAINING_CREDITS = 25;

interface OddsApiOutcome {
  name?: string;
  price?: number;
  point?: number;
}
interface OddsApiMarket {
  key?: string;
  outcomes?: OddsApiOutcome[];
}
interface OddsApiBookmaker {
  key?: string;
  title?: string;
  last_update?: string;
  markets?: OddsApiMarket[];
}
export interface OddsApiEvent {
  id?: string;
  sport_key?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsApiBookmaker[];
}

/* ------------------------------------------------------------------ *
 * Matching their events to ours
 * ------------------------------------------------------------------ */

/** Strip everything that differs between two feeds' spelling of a team. */
export function normalizeTeam(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/** The mascot — the last word — which is the most stable part of a club name. */
function mascot(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/);
  return normalizeTeam(words[words.length - 1]);
}

/**
 * Do these two names refer to the same team?
 *
 * The two feeds disagree in predictable ways: "LA Clippers" against "Los
 * Angeles Clippers", "St. Louis" against "St Louis". Exact normalized equality
 * catches most; the mascot catches the rest without matching unrelated clubs,
 * since mascots are near-unique within a league.
 */
export function sameTeam(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ma = mascot(a);
  const mb = mascot(b);
  return ma.length >= 4 && ma === mb;
}

/** How far apart two feeds' start times may be and still be one game. */
const START_TOLERANCE_MS = 12 * 60 * 60 * 1000;

/** Find the event in their slate that is our game, or null. */
export function matchEvent(
  game: Game,
  events: OddsApiEvent[],
): OddsApiEvent | null {
  const ourStart = Date.parse(game.startTime);
  for (const ev of events) {
    if (!sameTeam(game.home.name, ev.home_team)) continue;
    if (!sameTeam(game.away.name, ev.away_team)) continue;
    if (Number.isFinite(ourStart) && ev.commence_time) {
      const theirStart = Date.parse(ev.commence_time);
      if (
        Number.isFinite(theirStart) &&
        Math.abs(theirStart - ourStart) > START_TOLERANCE_MS
      ) {
        continue;
      }
    }
    return ev;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * Convert one event's bookmakers into our price shape.
 *
 * Their outcomes are keyed by team NAME rather than home/away, and their
 * spread `point` is from each named team's own perspective — so the home
 * spread is read off the home team's outcome directly, with no details string
 * to misparse. That makes this feed structurally safer than the ESPN path.
 */
export function parseEventBooks(
  event: OddsApiEvent,
  homeName: string,
  awayName: string,
): BookPrice[] {
  /*
   * Refuse the event outright if its teams are not the ones we asked about.
   *
   * Moneylines and spreads are keyed by team name, so a mismatch simply drops
   * them — but a TOTAL is keyed by "Over"/"Under" and carries no team at all,
   * so it would still parse cleanly and get attached to whichever game we
   * were pricing. That is the one way this feed could contaminate a game with
   * another game's number, so it is checked before anything is read.
   */
  if (
    !sameTeam(event.home_team, homeName) ||
    !sameTeam(event.away_team, awayName)
  ) {
    return [];
  }

  const out: BookPrice[] = [];

  for (const b of event.bookmakers ?? []) {
    const title = b.title ?? b.key;
    if (!title) continue;

    const price: BookPrice = { book: title };

    for (const m of b.markets ?? []) {
      const outcomes = m.outcomes ?? [];
      const home = outcomes.find((o) => sameTeam(o.name, homeName));
      const away = outcomes.find((o) => sameTeam(o.name, awayName));

      if (m.key === "h2h") {
        if (Number.isFinite(home?.price)) price.homeMoneyline = home!.price;
        if (Number.isFinite(away?.price)) price.awayMoneyline = away!.price;
      } else if (m.key === "spreads") {
        if (Number.isFinite(home?.point)) price.spread = home!.point;
        if (Number.isFinite(home?.price)) price.spreadHomeOdds = home!.price;
        if (Number.isFinite(away?.price)) price.spreadAwayOdds = away!.price;
      } else if (m.key === "totals") {
        const over = outcomes.find((o) => /over/i.test(o.name ?? ""));
        const under = outcomes.find((o) => /under/i.test(o.name ?? ""));
        if (Number.isFinite(over?.point)) price.total = over!.point;
        if (Number.isFinite(over?.price)) price.overOdds = over!.price;
        if (Number.isFinite(under?.price)) price.underOdds = under!.price;
      }
    }

    const usable =
      price.homeMoneyline != null ||
      price.spreadHomeOdds != null ||
      price.overOdds != null;
    if (usable) out.push(price);
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Fetching, with the quota guarded
 * ------------------------------------------------------------------ */

interface CacheEntry {
  at: number;
  events: OddsApiEvent[];
}
const cache = new Map<League, CacheEntry>();

/** What the API last told us about the allowance. */
let remainingCredits: number | null = null;
let usedCredits: number | null = null;

export interface OddsApiStatus {
  configured: boolean;
  remaining: number | null;
  used: number | null;
  leaguesCached: number;
}

export function oddsApiStatus(): OddsApiStatus {
  return {
    configured: Boolean(process.env.ODDS_API_KEY),
    remaining: remainingCredits,
    used: usedCredits,
    leaguesCached: cache.size,
  };
}

/** Exposed for tests; clears the in-process cache. */
export function resetOddsApiCache(): void {
  cache.clear();
  remainingCredits = null;
  usedCredits = null;
}

async function fetchLeague(
  league: League,
  apiKey: string,
  signal: AbortSignal,
  hoursToFirstGame: number | null,
): Promise<OddsApiEvent[]> {
  const ttl = ttlMsFor(hoursToFirstGame);
  const cached = cache.get(league);
  if (cached && Date.now() - cached.at < ttl) return cached.events;

  /*
   * Two guards, both from the API's own accounting.
   *
   * The hard floor stops the allowance being drained to zero. The pacing
   * reserve is the more useful one: it keeps back enough to cover every
   * remaining day of the month at a minimum daily rate, so the tool stays
   * usable all month instead of being excellent for a week and dead for the
   * next three.
   */
  if (remainingCredits != null) {
    const paceReserve = daysLeftInMonth() * DAILY_FLOOR_CREDITS;
    if (
      remainingCredits < MIN_REMAINING_CREDITS ||
      remainingCredits < paceReserve
    ) {
      return cached?.events ?? [];
    }
  }

  const sport = SPORT_KEYS[league];
  if (!sport) return [];
  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=${REGIONS}&markets=${MARKETS}` +
    `&oddsFormat=american&dateFormat=iso`;

  /*
   * Two cache layers, because the in-process one alone was close to useless.
   *
   * The Map above lives in a single serverless instance's memory. On Vercel a
   * cold start begins with it empty, and on low traffic cold starts are
   * common — so with `cache: "no-store"` a large share of page loads paid full
   * price regardless of the TTL. Measured against the budget, that was the
   * difference between the allowance lasting a week and lasting two days.
   *
   * `next.revalidate` uses the platform's Data Cache, which is SHARED across
   * instances and survives deployments, so a fetch one visitor paid for
   * serves everyone else inside the window. The in-process Map stays as a
   * cheap first-level hit for a warm instance.
   */
  const res = await fetch(url, {
    signal,
    next: { revalidate: Math.floor(ttl / 1000) },
  });
  // The API reports the allowance in headers; read them so the ceiling above
  // is based on its accounting rather than our guess at it.
  const rem = Number(res.headers.get("x-requests-remaining"));
  const used = Number(res.headers.get("x-requests-used"));
  if (Number.isFinite(rem)) remainingCredits = rem;
  if (Number.isFinite(used)) usedCredits = used;

  if (!res.ok) {
    // Serve a stale slate rather than nothing: an old consensus across many
    // books still beats a fresh single book.
    if (cached) return cached.events;
    throw new Error(`odds api ${res.status}`);
  }

  const events = (await res.json()) as OddsApiEvent[];
  const list = Array.isArray(events) ? events : [];
  cache.set(league, { at: Date.now(), events: list });
  return list;
}

/**
 * Bookmaker prices for the given games, keyed by OUR game id.
 *
 * Inert without `ODDS_API_KEY`. Best-effort per league: a league that fails
 * contributes nothing and those games keep their ESPN prices.
 */
export async function fetchOddsApiBooks(
  games: Game[],
  signal: AbortSignal,
): Promise<Record<string, BookPrice[]>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return {};

  const leagues = [...new Set(games.map((g) => g.league))].filter(
    (l) => SPORT_KEYS[l],
  );
  if (leagues.length === 0) return {};

  // How soon does each league's next game start? That sets how fresh its
  // prices need to be, and therefore how much of the budget it deserves.
  const hoursToFirst = (league: League): number | null => {
    const starts = games
      .filter((g) => g.league === league)
      .map((g) => Date.parse(g.startTime))
      .filter((t) => Number.isFinite(t));
    if (starts.length === 0) return null;
    return (Math.min(...starts) - Date.now()) / 3_600_000;
  };

  const settled = await Promise.allSettled(
    leagues.map(async (league) => ({
      league,
      events: await fetchLeague(league, apiKey, signal, hoursToFirst(league)),
    })),
  );

  const byLeague = new Map<League, OddsApiEvent[]>();
  for (const r of settled) {
    if (r.status === "fulfilled") byLeague.set(r.value.league, r.value.events);
  }

  const out: Record<string, BookPrice[]> = {};
  for (const g of games) {
    const events = byLeague.get(g.league);
    if (!events || events.length === 0) continue;
    const ev = matchEvent(g, events);
    if (!ev) continue;
    const books = parseEventBooks(ev, g.home.name, g.away.name);
    if (books.length > 0) out[g.id] = books;
  }
  return out;
}
