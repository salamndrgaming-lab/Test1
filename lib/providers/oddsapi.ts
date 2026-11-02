import type { BookPrice, Game, League } from "@/types";
import { isBookmaker } from "@/lib/market";

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
  { withinHours: 2, ttlMinutes: 12 },
  { withinHours: 6, ttlMinutes: 45 },
  { withinHours: 24, ttlMinutes: 150 },
  { withinHours: Infinity, ttlMinutes: 360 },
];

/**
 * Daily spend the bands are tuned for, in credits.
 *
 * Observed burn on the live app was about 49 credits a day against a 500
 * monthly allowance — comfortable for ten days and then nothing. This is the
 * rate the base TTLs above are meant to produce; the stretch below defends
 * it when traffic says otherwise.
 */
export const COMFORTABLE_DAILY_CREDITS = 30;

/** Most the TTL may be stretched when the budget is tight. */
const MAX_STRETCH = 4;

/**
 * How much to lengthen the cache given what is left in the month.
 *
 * A fixed TTL cannot defend a monthly budget, because it does not know how
 * much traffic is arriving: raise it once and a busier week drains the
 * allowance anyway. This closes the loop. When the credits left per
 * remaining day fall below what the bands assume, the cache stretches in
 * proportion, and relaxes again after the monthly reset.
 *
 * Running out matters more than it sounds. With one book, "consensus fair
 * value" is that book's own de-vigged price, so price edge becomes
 * arithmetically impossible rather than merely rare and arbitrage detection
 * stops entirely — every measured thing this tool does goes dark at once.
 * Degrading freshness is much cheaper than degrading to a single source.
 */
export function budgetStretch(
  remaining: number | null,
  daysLeft = daysLeftInMonth(),
): number {
  if (remaining == null || !Number.isFinite(remaining) || remaining <= 0) return 1;
  const perDay = remaining / Math.max(1, daysLeft);
  if (perDay >= COMFORTABLE_DAILY_CREDITS) return 1;
  return Math.min(MAX_STRETCH, COMFORTABLE_DAILY_CREDITS / Math.max(1, perDay));
}

/**
 * TTL for a league whose next game starts in `hoursToFirstGame`, stretched
 * by whatever the month's remaining budget can afford.
 */
export function ttlMsFor(
  hoursToFirstGame: number | null,
  remaining: number | null = null,
): number {
  const stretch = budgetStretch(remaining);
  if (hoursToFirstGame == null || !Number.isFinite(hoursToFirstGame)) {
    return CACHE_TTL_MS * stretch;
  }
  // Already underway or imminent: the shortest window.
  const h = Math.max(0, hoursToFirstGame);
  for (const band of ADAPTIVE_TTL) {
    if (h <= band.withinHours) return band.ttlMinutes * 60 * 1000 * stretch;
  }
  return CACHE_TTL_MS * stretch;
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

    const price: BookPrice = { book: title, lastUpdate: b.last_update };

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
  const ttl = ttlMsFor(hoursToFirstGame, remainingCredits);
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
    /*
     * Remember which Odds API event this game matched to. Props are served
     * only by the per-event endpoint, which is keyed on THEIR id, not
     * ESPN's — and the match is made here by team name, so this is the one
     * place that knows the pairing. Recording it means a props request
     * costs one call for the props rather than a call to rediscover the id.
     */
    if (ev.id) eventIdByGame.set(g.id, ev.id);
    const books = parseEventBooks(ev, g.home.name, g.away.name);
    if (books.length > 0) out[g.id] = books;
  }
  return out;
}

/**
 * Our game id -> The Odds API's event id, learned while matching the slate.
 *
 * In-process only, which is the honest limit: on a cold serverless instance
 * it is empty and a props request has to say so rather than guess at an id.
 */
const eventIdByGame = new Map<string, string>();

/** The Odds API event id for one of our games, if the slate matched it. */
export function oddsApiEventId(gameId: string): string | undefined {
  return eventIdByGame.get(gameId);
}

/* ------------------------------------------------------------------ *
 * Player props — fetched per game, only when asked for
 * ------------------------------------------------------------------ */

/**
 * Prop markets worth asking for, per sport.
 *
 * Kept deliberately short. Props are billed per market per region PER EVENT,
 * not per league, so this list is the per-click price: four markets is four
 * credits for one game, against three credits for a whole league's main
 * lines. That asymmetry is why props are never fetched with the slate and
 * only ever on an explicit request.
 */
export const PROP_MARKETS: Record<League, string[]> = {
  NBA: ["player_points", "player_rebounds", "player_assists", "player_threes"],
  NCAAB: ["player_points", "player_rebounds", "player_assists"],
  NFL: ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"],
  NCAAF: ["player_pass_yds", "player_rush_yds", "player_reception_yds"],
  NHL: ["player_points", "player_shots_on_goal"],
  MLB: ["batter_hits", "batter_home_runs", "pitcher_strikeouts"],
};

/** What one game's props will cost, so the cost can be shown before it is paid. */
export function propCreditCost(league: League): number {
  return (PROP_MARKETS[league] ?? []).length; // one region
}

export interface PropOutcome {
  book: string;
  /** The player the line is about. */
  player: string;
  /** e.g. "player_points". */
  market: string;
  /** "Over" or "Under". */
  side: string;
  line: number;
  american: number;
}

/** Props cache, keyed by event. Separate from the slate cache by design. */
const propCache = new Map<string, { at: number; props: PropOutcome[] }>();
/** Props move less than sides do, and cost far more, so they are held longer. */
const PROP_TTL_MS = 30 * 60 * 1000;

interface PropApiEvent {
  bookmakers?: {
    key?: string;
    title?: string;
    markets?: {
      key?: string;
      outcomes?: { name?: string; description?: string; price?: number; point?: number }[];
    }[];
  }[];
}

/**
 * Player props for ONE game.
 *
 * Deliberately not part of the slate fetch. The per-event endpoint is the
 * only one that serves props, and it bills per market per event: pulling
 * four markets across a twenty-game board would cost eighty credits against
 * the three a whole league's main lines cost, which would drain a monthly
 * allowance in a couple of refreshes.
 *
 * So this is on-demand, cached for half an hour, and sits behind the same
 * pacing reserve as everything else — a props request cannot eat the budget
 * that keeps the main board alive, because the main board is where the
 * measured edge actually is.
 */
export async function fetchEventProps(
  league: League,
  eventId: string,
  signal?: AbortSignal,
): Promise<{ props: PropOutcome[]; cost: number; reason?: string }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { props: [], cost: 0, reason: "no-key" };

  const markets = PROP_MARKETS[league] ?? [];
  if (markets.length === 0) return { props: [], cost: 0, reason: "unsupported-league" };

  const key = `${league}:${eventId}`;
  const cached = propCache.get(key);
  if (cached && Date.now() - cached.at < PROP_TTL_MS) {
    return { props: cached.props, cost: 0 };
  }

  // The same reserve that protects the slate. Props are the first thing to
  // go when the month is tight, because they are the least proven thing here.
  if (remainingCredits != null) {
    const paceReserve = daysLeftInMonth() * DAILY_FLOOR_CREDITS;
    if (
      remainingCredits < MIN_REMAINING_CREDITS ||
      remainingCredits < paceReserve + markets.length
    ) {
      return { props: cached?.props ?? [], cost: 0, reason: "budget" };
    }
  }

  const sport = SPORT_KEYS[league];
  if (!sport) return { props: [], cost: 0, reason: "unsupported-league" };
  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/events/${encodeURIComponent(eventId)}/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=${REGIONS}&markets=${encodeURIComponent(markets.join(","))}` +
    `&oddsFormat=american&dateFormat=iso`;

  const res = await fetch(url, {
    signal,
    next: { revalidate: Math.floor(PROP_TTL_MS / 1000) },
  });
  const rem = Number(res.headers.get("x-requests-remaining"));
  const used = Number(res.headers.get("x-requests-used"));
  const last = Number(res.headers.get("x-requests-last"));
  if (Number.isFinite(rem)) remainingCredits = rem;
  if (Number.isFinite(used)) usedCredits = used;

  if (!res.ok) {
    return {
      props: cached?.props ?? [],
      cost: 0,
      reason: res.status === 422 ? "no-props-for-this-game" : `http-${res.status}`,
    };
  }

  const json = (await res.json()) as PropApiEvent;
  const out: PropOutcome[] = [];
  for (const bk of json.bookmakers ?? []) {
    const book = bk.title || bk.key || "";
    if (!book || !isBookmaker(book)) continue;
    for (const m of bk.markets ?? []) {
      if (!m.key) continue;
      for (const o of m.outcomes ?? []) {
        // The API puts the PLAYER in `description` and Over/Under in `name`.
        const player = (o.description ?? "").trim();
        const side = (o.name ?? "").trim();
        if (!player || !side) continue;
        if (o.price == null || o.point == null) continue;
        if (!Number.isFinite(o.price) || !Number.isFinite(o.point)) continue;
        out.push({ book, player, market: m.key, side, line: o.point, american: o.price });
      }
    }
  }
  propCache.set(key, { at: Date.now(), props: out });
  return { props: out, cost: Number.isFinite(last) ? last : markets.length };
}
