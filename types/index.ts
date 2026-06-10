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

// ---------- Sports ----------

export type League = "NFL" | "NBA" | "MLB" | "NHL" | "NCAAF" | "NCAAB";

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  record?: string;
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
}

// ---------- SGP research tool ----------

export interface SgpReference {
  label: string;
  url: string;
}

export interface SgpLeg {
  id: string;
  gameId: string;
  league: League;
  matchup: string; // "LAL @ BOS"
  market: string; // "Player Points O/U", "Moneyline", "Spread"...
  selection: string; // "Jayson Tatum Over 27.5 PTS"
  americanOdds: number;
  rationale: string; // cited reasoning
  references: SgpReference[];
  confidence: Confidence;
  supportingStats: { label: string; value: string }[];
  /** model's estimated true probability 0..1, for edge display */
  modelProbability: number;
}

export interface SgpRecommendation {
  id: string;
  title: string;
  legs: SgpLeg[]; // 6+
  combinedDecimalOdds: number;
  combinedAmericanOdds: number;
  impliedProbability: number; // from combined odds
  modelProbability: number; // product of leg model probs
  disclaimer: string;
}

// ---------- Weather ----------

export interface WeatherCurrent {
  place: string;
  tempF: number;
  condition: string;
  humidity: number;
  windMph: number;
  icon?: string;
}

export interface WeatherForecastDay {
  date: string; // ISO date
  label: string; // "Mon"
  highF: number;
  lowF: number;
  condition: string;
  precipChance: number; // 0..100
}

export interface WeatherReport {
  current: WeatherCurrent;
  daily: WeatherForecastDay[];
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

// ---------- Provider envelope ----------

export type DataSourceKind = "live" | "error";

export interface ProviderResult<T> {
  data: T | null;
  source: DataSourceKind;
  fetchedAt: string;
  /** present when source === "error" */
  error?: string;
}
