// Shared domain types for NewsScope.

export type BiasLean =
  | "left"
  | "lean-left"
  | "center"
  | "lean-right"
  | "right"
  | "unknown";

export type Confidence = "low" | "medium" | "high";

export type NewsCategory =
  | "top"
  | "politics"
  | "business"
  | "technology"
  | "science"
  | "health"
  | "world"
  | "local"
  | "sports"
  | "entertainment";

export type Scope = "local" | "national" | "world";

export interface Article {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string; // outlet display name
  sourceDomain: string; // normalized domain, used for bias lookup
  publishedAt: string; // ISO
  category: NewsCategory;
  scope: Scope;
  imageUrl?: string;
  bias: BiasLean;
  biasConfidence: Confidence;
  /** -1 (very negative) .. 1 (very positive) */
  sentiment: number;
  /** optional lat/lon for geo visualizations */
  geo?: { lat: number; lon: number; place: string };
}

export interface ArticleSynopsis {
  title: string;
  synopsis: string;
  image?: string;
  url: string; // resolved publisher URL
  siteName?: string;
}

// ---------- Sports ----------

export type League = "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "NCAAB";

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  record?: string;
  /** MLB only: the listed starter, which drives most of a baseball line. */
  probablePitcher?: ProbablePitcher;
}

/** A probable starting pitcher, as the scoreboard reports them. */
export interface ProbablePitcher {
  name: string;
  /** Earned run average per nine innings, when the feed carries it. */
  era?: number;
  wins?: number;
  losses?: number;
}

/**
 * Injury exposure for one team. Deliberately a count, not an estimate of
 * points: we can't tell a starter from a third-stringer from this feed, so
 * the model uses this to reduce its own weight rather than to guess a line.
 */
export interface TeamInjuryReport {
  teamId: string;
  /** Players listed out or doubtful. */
  out: number;
  /** Players listed questionable or day-to-day. */
  questionable: number;
  /** A few names, for display only. */
  names: string[];
}

export interface Game {
  id: string;
  league: League;
  startTime: string; // ISO
  status: "scheduled" | "in" | "final";
  home: Team;
  away: Team;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
}

export interface MarketOdds {
  gameId: string;
  book: string;
  // American odds
  homeMoneyline?: number;
  awayMoneyline?: number;
  spread?: number; // home spread, e.g. -3.5
  spreadHomeOdds?: number;
  spreadAwayOdds?: number;
  total?: number; // over/under line
  overOdds?: number;
  underOdds?: number;
  favorite?: "home" | "away";
  details?: string; // raw "NYY -1.5"
  /** How the price has moved since it opened. */
  movement?: LineMovement;
}

/**
 * Opening vs current prices. Line movement is the most useful public signal a
 * keyless feed exposes: it aggregates every sharp bet placed since the market
 * opened, so a line moving toward a side is independent confirmation of it.
 */
export interface LineMovement {
  openSpread?: number; // home spread at open
  currentSpread?: number;
  openTotal?: number;
  currentTotal?: number;
  openHomeMoneyline?: number;
  openAwayMoneyline?: number;
  /** Points the home spread has moved; negative = money came in on home. */
  spreadDelta?: number;
  /** Points the total has moved; positive = money came in on the over. */
  totalDelta?: number;
  /** Change in the de-vigged home win probability since open, in points. */
  homeProbDelta?: number;
}

/**
 * How recently a team played. A second game on consecutive nights is a
 * measurable disadvantage in basketball and hockey.
 */
export interface TeamRest {
  teamId: string;
  /** 1 = played last night (a back-to-back). Infinity = no recent game seen. */
  daysSinceLastGame: number;
  /** Games played in the window we looked at. */
  gamesInWindow: number;
}

/**
 * The last price the market showed before a game started.
 *
 * Comparing the number we took against the number the market closed at is
 * closing-line value: a much lower-variance verdict on a pick than whether it
 * happened to win, and it converges in tens of picks rather than hundreds.
 */
export interface ClosingLine {
  gameId: string;
  /** Home spread at the close. */
  spread?: number;
  total?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
}

/** One completed game, the raw input to the ratings solve. */
export interface CompletedGame {
  gameId: string;
  league: League;
  /** ISO timestamp of the game. */
  date: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Opponent-adjusted ratings for one team, in points per game relative to
 * league average. `net` is offense minus defense, so a projected margin is
 * `net(home) - net(away) + homeEdge`.
 */
export interface TeamRating {
  teamId: string;
  /** Points scored above league average, schedule-adjusted. */
  offense: number;
  /** Points conceded above league average (negative is good). */
  defense: number;
  net: number;
  games: number;
  /** Games played, after recency decay — what shrinkage is based on. */
  effectiveGames: number;
}

/** Season scoring rates for one team, used by the margin and totals models. */
export interface TeamScoring {
  teamId: string;
  abbreviation: string;
  gamesPlayed: number;
  /** Points/goals/runs scored per game. */
  pointsForPerGame: number;
  /** Points/goals/runs conceded per game. */
  pointsAgainstPerGame: number;
}

export interface Standing {
  group: string; // division / conference name
  team: string;
  abbreviation: string;
  wins: number;
  losses: number;
  pct: string; // win %
  gamesBehind?: string;
}

// ---------- SGP research tool ----------

export interface SgpReference {
  label: string;
  url: string;
}

/** One component of a leg's confidence score (0..1), with why it scored that. */
export interface SgpConfidenceFactor {
  label: string;
  value: number;
  note: string;
}

/** Lets the slip compute exact same-game correlation from the margin model. */
export interface SgpLegModelMeta {
  kind: "margin" | "total";
  /** "home"/"away" for margin legs; "over"/"under" for totals. */
  side?: "home" | "away" | "over" | "under";
  /** The team's margin must exceed this for the leg to win. */
  threshold?: number;
  blendedMargin?: number;
  sigma?: number;
  /** Totals: the posted line, and our projected total + its SD. */
  totalLine?: number;
  totalMean?: number;
  totalSigma?: number;
  /** Projected scores, for the count-model sports — rebuilds the distribution. */
  lambdaHome?: number;
  lambdaAway?: number;
  /** Which distribution family priced this leg. */
  family?: "skellam" | "key-number" | "normal" | "poisson";
  /** P(landing exactly on the line). Zero for half-point lines. */
  pushProbability?: number;
}

export interface SgpLeg {
  id: string;
  gameId: string;
  league: League;
  matchup: string; // "LAL @ BOS"
  market: string; // "Moneyline", "Spread", "Total"...
  selection: string; // "Boston Celtics -4.5"
  americanOdds: number;
  rationale: string; // cited reasoning
  references: SgpReference[];
  supportingStats: { label: string; value: string }[];

  /** Our estimated true probability (0..1). */
  modelProbability: number;
  /** The market's de-vigged probability — what the price says once the book's margin is removed. */
  marketProbability: number;
  /** Raw implied probability: the win rate needed just to break even at this price. */
  breakEvenProbability: number;
  /** Odds that would be fair at our model probability. */
  fairAmericanOdds: number;
  /** modelProbability - breakEvenProbability. Positive = +EV. */
  edge: number;
  /** Expected profit per $1 staked. */
  expectedValue: number;
  /** Kelly stake fraction (0 when there's no edge). */
  kellyFraction: number;

  confidence: Confidence;
  /** 0..1 reliability of this estimate. */
  confidenceScore: number;
  confidenceFactors: SgpConfidenceFactor[];

  modelMeta?: SgpLegModelMeta;
}

export interface SgpRecommendation {
  id: string;
  title: string;
  legs: SgpLeg[]; // 6+
  combinedDecimalOdds: number;
  combinedAmericanOdds: number;
  /** Break-even probability implied by the combined price. */
  impliedProbability: number;
  /** Correlation-adjusted probability that every leg wins. */
  modelProbability: number;
  /** Naive product of leg probabilities (ignores same-game correlation). */
  naiveProbability: number;
  /** Fair price at our adjusted probability. */
  fairAmericanOdds: number;
  /** Expected profit per $1 staked on the slip. */
  expectedValue: number;
  /** True when the slip mixes legs from the same game. */
  correlated: boolean;
  /**
   * True when the combined price isn't obtainable (correlated legs priced as
   * independent), so expectedValue is illustrative rather than a real edge.
   */
  expectedValueIsTheoretical: boolean;
  modelVersion: string;
  /** Which inputs actually drove this slip, for an always-visible summary. */
  inputs: { label: string; detail: string }[];
  /** Plain-language notes about the model and its caveats. */
  notes: string[];
  disclaimer: string;
}

// ---------- Weather ----------

export interface WeatherCurrent {
  place: string;
  tempF: number;
  feelsLikeF: number;
  condition: string;
  humidity: number;
  windMph: number;
  windDir?: number; // degrees
  pressureHpa?: number;
  uvIndex?: number;
  isDay?: boolean;
  icon?: string;
}

export interface WeatherForecastDay {
  date: string; // ISO date
  label: string; // "Mon"
  highF: number;
  lowF: number;
  condition: string;
  precipChance: number; // 0..100
  sunrise?: string;
  sunset?: string;
  uvMax?: number;
}

export interface WeatherHour {
  time: string; // ISO
  label: string; // "3 PM"
  tempF: number;
  precipChance: number;
}

export interface WeatherReport {
  current: WeatherCurrent;
  daily: WeatherForecastDay[];
  hourly: WeatherHour[];
}

export interface WeatherAlert {
  id: string;
  event: string; // "Severe Thunderstorm Warning"
  severity: string; // Extreme | Severe | Moderate | Minor | Unknown
  headline: string;
  area: string;
  expires?: string;
}

export interface AirQuality {
  usAqi: number;
  category: string; // Good | Moderate | Unhealthy ...
  pm25?: number;
  pm10?: number;
  ozone?: number;
  no2?: number;
  so2?: number;
  co?: number;
}

// ---------- Entertainment ----------

export interface EntertainmentItem {
  id: string;
  title: string;
  kind: "movie" | "tv" | "music" | "celebrity" | "gaming";
  blurb: string;
  rating?: number; // 0..10
  releaseDate?: string;
  imageUrl?: string;
  url?: string;
}

// ---------- Markets ----------

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  changePct: number; // day / 24h percent change
  spark?: number[]; // recent price series for a sparkline
  currency?: string;
}

export interface MarketsData {
  indices: Quote[];
  crypto: Quote[];
}

export interface IpoEntry {
  symbol: string;
  company: string;
  date?: string; // expected / priced date
  priceRange?: string;
  shares?: string;
  exchange?: string;
  status: "priced" | "upcoming" | "filed";
}

export interface IpoData {
  priced: IpoEntry[];
  upcoming: IpoEntry[];
}

// ---------- Provider envelope ----------

export type DataSourceKind = "live" | "error";

export interface ProviderResult<T> {
  data: T | null;
  source: DataSourceKind;
  fetchedAt: string;
  /** present when source === "error" */
  error?: string;
}
