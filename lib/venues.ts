import type { League } from "@/types";

/**
 * Stadium locations and roof status for the outdoor sports.
 *
 * Weather is one of the few genuinely slow-priced free signals: books move on
 * injuries within minutes but on a wind forecast more gradually. We already
 * own an Open-Meteo client, so the only missing piece was knowing where each
 * game is played — and the scoreboard gives us the home team reliably, which
 * is a far more dependable key than a venue display name that changes with
 * every sponsorship.
 *
 * Only NFL and MLB are listed. Basketball and hockey are played indoors, and
 * college football has too many venues to curate by hand without the table
 * becoming its own maintenance problem.
 *
 * `roof: "dome"` games are skipped entirely. `"retractable"` is treated as
 * closed when the weather is bad, which is what teams actually do — so those
 * venues are also skipped rather than guessed at.
 */

export type Roof = "open" | "dome" | "retractable";

export interface Venue {
  /** Home team abbreviation as ESPN reports it. */
  team: string;
  name: string;
  lat: number;
  lon: number;
  roof: Roof;
}

const NFL_VENUES: Venue[] = [
  { team: "ARI", name: "State Farm Stadium", lat: 33.53, lon: -112.26, roof: "retractable" },
  { team: "ATL", name: "Mercedes-Benz Stadium", lat: 33.76, lon: -84.40, roof: "retractable" },
  { team: "BAL", name: "M&T Bank Stadium", lat: 39.28, lon: -76.62, roof: "open" },
  { team: "BUF", name: "Highmark Stadium", lat: 42.77, lon: -78.787, roof: "open" },
  { team: "CAR", name: "Bank of America Stadium", lat: 35.23, lon: -80.85, roof: "open" },
  { team: "CHI", name: "Soldier Field", lat: 41.86, lon: -87.62, roof: "open" },
  { team: "CIN", name: "Paycor Stadium", lat: 39.10, lon: -84.52, roof: "open" },
  { team: "CLE", name: "Huntington Bank Field", lat: 41.51, lon: -81.70, roof: "open" },
  { team: "DAL", name: "AT&T Stadium", lat: 32.75, lon: -97.09, roof: "retractable" },
  { team: "DEN", name: "Empower Field at Mile High", lat: 39.74, lon: -105.02, roof: "open" },
  { team: "DET", name: "Ford Field", lat: 42.34, lon: -83.05, roof: "dome" },
  { team: "GB", name: "Lambeau Field", lat: 44.50, lon: -88.06, roof: "open" },
  { team: "HOU", name: "NRG Stadium", lat: 29.68, lon: -95.41, roof: "retractable" },
  { team: "IND", name: "Lucas Oil Stadium", lat: 39.76, lon: -86.16, roof: "retractable" },
  { team: "JAX", name: "EverBank Stadium", lat: 30.32, lon: -81.64, roof: "open" },
  { team: "KC", name: "GEHA Field at Arrowhead", lat: 39.05, lon: -94.48, roof: "open" },
  { team: "LAC", name: "SoFi Stadium", lat: 33.95, lon: -118.34, roof: "dome" },
  { team: "LAR", name: "SoFi Stadium", lat: 33.95, lon: -118.34, roof: "dome" },
  { team: "LV", name: "Allegiant Stadium", lat: 36.09, lon: -115.18, roof: "dome" },
  { team: "MIA", name: "Hard Rock Stadium", lat: 25.96, lon: -80.24, roof: "open" },
  { team: "MIN", name: "U.S. Bank Stadium", lat: 44.97, lon: -93.26, roof: "dome" },
  { team: "NE", name: "Gillette Stadium", lat: 42.09, lon: -71.26, roof: "open" },
  { team: "NO", name: "Caesars Superdome", lat: 29.95, lon: -90.08, roof: "dome" },
  { team: "NYG", name: "MetLife Stadium", lat: 40.81, lon: -74.07, roof: "open" },
  { team: "NYJ", name: "MetLife Stadium", lat: 40.81, lon: -74.07, roof: "open" },
  { team: "PHI", name: "Lincoln Financial Field", lat: 39.90, lon: -75.17, roof: "open" },
  { team: "PIT", name: "Acrisure Stadium", lat: 40.447, lon: -80.016, roof: "open" },
  { team: "SEA", name: "Lumen Field", lat: 47.595, lon: -122.332, roof: "open" },
  { team: "SF", name: "Levi's Stadium", lat: 37.40, lon: -121.97, roof: "open" },
  { team: "TB", name: "Raymond James Stadium", lat: 27.976, lon: -82.503, roof: "open" },
  { team: "TEN", name: "Nissan Stadium", lat: 36.166, lon: -86.771, roof: "open" },
  { team: "WSH", name: "Northwest Stadium", lat: 38.908, lon: -76.864, roof: "open" },
];

const MLB_VENUES: Venue[] = [
  { team: "ARI", name: "Chase Field", lat: 33.445, lon: -112.067, roof: "retractable" },
  { team: "ATL", name: "Truist Park", lat: 33.891, lon: -84.468, roof: "open" },
  { team: "BAL", name: "Oriole Park at Camden Yards", lat: 39.284, lon: -76.622, roof: "open" },
  { team: "BOS", name: "Fenway Park", lat: 42.346, lon: -71.097, roof: "open" },
  { team: "CHC", name: "Wrigley Field", lat: 41.948, lon: -87.656, roof: "open" },
  { team: "CHW", name: "Rate Field", lat: 41.830, lon: -87.634, roof: "open" },
  { team: "CIN", name: "Great American Ball Park", lat: 39.097, lon: -84.507, roof: "open" },
  { team: "CLE", name: "Progressive Field", lat: 41.496, lon: -81.685, roof: "open" },
  { team: "COL", name: "Coors Field", lat: 39.756, lon: -104.994, roof: "open" },
  { team: "DET", name: "Comerica Park", lat: 42.339, lon: -83.049, roof: "open" },
  { team: "HOU", name: "Daikin Park", lat: 29.757, lon: -95.355, roof: "retractable" },
  { team: "KC", name: "Kauffman Stadium", lat: 39.051, lon: -94.480, roof: "open" },
  { team: "LAA", name: "Angel Stadium", lat: 33.800, lon: -117.883, roof: "open" },
  { team: "LAD", name: "Dodger Stadium", lat: 34.074, lon: -118.240, roof: "open" },
  { team: "MIA", name: "loanDepot park", lat: 25.778, lon: -80.220, roof: "retractable" },
  { team: "MIL", name: "American Family Field", lat: 43.028, lon: -87.971, roof: "retractable" },
  { team: "MIN", name: "Target Field", lat: 44.982, lon: -93.278, roof: "open" },
  { team: "NYM", name: "Citi Field", lat: 40.757, lon: -73.846, roof: "open" },
  { team: "NYY", name: "Yankee Stadium", lat: 40.829, lon: -73.926, roof: "open" },
  { team: "OAK", name: "Sutter Health Park", lat: 38.580, lon: -121.513, roof: "open" },
  { team: "PHI", name: "Citizens Bank Park", lat: 39.906, lon: -75.167, roof: "open" },
  { team: "PIT", name: "PNC Park", lat: 40.447, lon: -80.006, roof: "open" },
  { team: "SD", name: "Petco Park", lat: 32.707, lon: -117.157, roof: "open" },
  { team: "SEA", name: "T-Mobile Park", lat: 47.591, lon: -122.332, roof: "retractable" },
  { team: "SF", name: "Oracle Park", lat: 37.778, lon: -122.389, roof: "open" },
  { team: "STL", name: "Busch Stadium", lat: 38.622, lon: -90.193, roof: "open" },
  { team: "TB", name: "Tropicana Field", lat: 27.768, lon: -82.653, roof: "dome" },
  { team: "TEX", name: "Globe Life Field", lat: 32.747, lon: -97.084, roof: "retractable" },
  { team: "TOR", name: "Rogers Centre", lat: 43.641, lon: -79.389, roof: "retractable" },
  { team: "WSH", name: "Nationals Park", lat: 38.873, lon: -77.007, roof: "open" },
];

const BY_LEAGUE: Partial<Record<League, Map<string, Venue>>> = {
  NFL: new Map(NFL_VENUES.map((v) => [v.team, v])),
  MLB: new Map(MLB_VENUES.map((v) => [v.team, v])),
};

export const ALL_VENUES = { NFL: NFL_VENUES, MLB: MLB_VENUES };

/**
 * Where a game is played, keyed on the home team.
 *
 * Returns null for indoor sports, unlisted teams, and roofed venues — the
 * last deliberately, because a retractable roof is closed when the weather is
 * bad, so "there is wind outside" tells us nothing about the game.
 *
 * A neutral-site game (an international series, a relocation) will resolve to
 * the nominal home team's stadium and be wrong. Those are rare, and the
 * adjustment is small and shrunk, so the cost of being wrong is bounded.
 */
export function outdoorVenue(league: League, homeAbbr: string): Venue | null {
  const v = BY_LEAGUE[league]?.get(homeAbbr);
  if (!v) return null;
  return v.roof === "open" ? v : null;
}

/* ------------------------------------------------------------------ *
 * Where each team plays — for travel distance and time zones
 * ------------------------------------------------------------------ *
 * City-centre coordinates are plenty here: the output is a flight distance in
 * the hundreds or thousands of kilometres, so being a few kilometres off the
 * arena is irrelevant. Keyed on ESPN's team abbreviations.
 */

export interface TeamCity {
  lat: number;
  lon: number;
}

const NBA_CITIES: Record<string, TeamCity> = {
  ATL: { lat: 33.76, lon: -84.39 }, BOS: { lat: 42.36, lon: -71.06 },
  BKN: { lat: 40.68, lon: -73.97 }, CHA: { lat: 35.23, lon: -80.84 },
  CHI: { lat: 41.88, lon: -87.63 }, CLE: { lat: 41.50, lon: -81.69 },
  DAL: { lat: 32.78, lon: -96.80 }, DEN: { lat: 39.74, lon: -104.98 },
  DET: { lat: 42.33, lon: -83.05 }, GS: { lat: 37.77, lon: -122.42 },
  HOU: { lat: 29.76, lon: -95.37 }, IND: { lat: 39.77, lon: -86.16 },
  LAC: { lat: 34.05, lon: -118.24 }, LAL: { lat: 34.05, lon: -118.24 },
  MEM: { lat: 35.15, lon: -90.05 }, MIA: { lat: 25.76, lon: -80.19 },
  MIL: { lat: 43.04, lon: -87.91 }, MIN: { lat: 44.98, lon: -93.27 },
  NO: { lat: 29.95, lon: -90.07 }, NY: { lat: 40.75, lon: -73.99 },
  OKC: { lat: 35.47, lon: -97.52 }, ORL: { lat: 28.54, lon: -81.38 },
  PHI: { lat: 39.95, lon: -75.17 }, PHX: { lat: 33.45, lon: -112.07 },
  POR: { lat: 45.52, lon: -122.68 }, SAC: { lat: 38.58, lon: -121.49 },
  SA: { lat: 29.42, lon: -98.49 }, TOR: { lat: 43.65, lon: -79.38 },
  UTAH: { lat: 40.76, lon: -111.89 }, WSH: { lat: 38.90, lon: -77.04 },
};

const NHL_CITIES: Record<string, TeamCity> = {
  ANA: { lat: 33.83, lon: -117.91 }, BOS: { lat: 42.36, lon: -71.06 },
  BUF: { lat: 42.89, lon: -78.88 }, CGY: { lat: 51.05, lon: -114.07 },
  CAR: { lat: 35.78, lon: -78.64 }, CHI: { lat: 41.88, lon: -87.63 },
  COL: { lat: 39.74, lon: -104.98 }, CBJ: { lat: 39.96, lon: -83.00 },
  DAL: { lat: 32.78, lon: -96.80 }, DET: { lat: 42.33, lon: -83.05 },
  EDM: { lat: 53.55, lon: -113.49 }, FLA: { lat: 26.13, lon: -80.33 },
  LA: { lat: 34.05, lon: -118.24 }, MIN: { lat: 44.98, lon: -93.27 },
  MTL: { lat: 45.50, lon: -73.57 }, NSH: { lat: 36.16, lon: -86.78 },
  NJ: { lat: 40.74, lon: -74.17 }, NYI: { lat: 40.72, lon: -73.59 },
  NYR: { lat: 40.75, lon: -73.99 }, OTT: { lat: 45.42, lon: -75.70 },
  PHI: { lat: 39.95, lon: -75.17 }, PIT: { lat: 40.44, lon: -79.996 },
  SJ: { lat: 37.33, lon: -121.89 }, SEA: { lat: 47.61, lon: -122.33 },
  STL: { lat: 38.63, lon: -90.20 }, TB: { lat: 27.95, lon: -82.46 },
  TOR: { lat: 43.65, lon: -79.38 }, UTAH: { lat: 40.76, lon: -111.89 },
  VAN: { lat: 49.28, lon: -123.12 }, VGK: { lat: 36.17, lon: -115.14 },
  WSH: { lat: 38.90, lon: -77.04 }, WPG: { lat: 49.90, lon: -97.14 },
};

/** NFL and MLB reuse the stadium table, which is already coordinates. */
const fromVenues = (vs: Venue[]): Record<string, TeamCity> =>
  Object.fromEntries(vs.map((v) => [v.team, { lat: v.lat, lon: v.lon }]));

const CITIES: Partial<Record<League, Record<string, TeamCity>>> = {
  NBA: NBA_CITIES,
  NHL: NHL_CITIES,
  NFL: fromVenues(NFL_VENUES),
  MLB: fromVenues(MLB_VENUES),
};

/** Where a team plays its home games. Null for leagues we don't map (NCAA). */
export function teamCity(league: League, abbr: string): TeamCity | null {
  return CITIES[league]?.[abbr] ?? null;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: TeamCity, b: TeamCity): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Time zones crossed, approximated from longitude (15 degrees per hour). */
export function timeZonesCrossed(a: TeamCity, b: TeamCity): number {
  return Math.abs(Math.round((b.lon - a.lon) / 15));
}

/* ------------------------------------------------------------------ *
 * Park factors
 * ------------------------------------------------------------------ *
 * Our scoring inputs are season aggregates across every park a team visited,
 * so our projected total is park-NEUTRAL while the market's posted total is
 * park-specific. That is a systematic bias in our own input — too low at
 * Coors, too high at Petco — and correcting it is not an edge claim, it is
 * making the two numbers comparable before we compare them.
 *
 * Multipliers on expected runs. Approximate, league-average-centred, and
 * exactly the kind of constant to re-fit once CLV tracking has samples. Only
 * baseball gets these: park geometry has no basketball or hockey equivalent,
 * and football's venue effect is weather, which is modelled directly.
 */
export const MLB_PARK_FACTOR: Record<string, number> = {
  COL: 1.13, BOS: 1.06, CIN: 1.06, KC: 1.03, PHI: 1.03, TEX: 1.03,
  CHC: 1.02, ARI: 1.02, BAL: 1.02, ATL: 1.01, HOU: 1.01, LAA: 1.01,
  TOR: 1.01, MIN: 1.0, WSH: 1.0, NYY: 1.0, OAK: 1.0,
  PIT: 0.99, CHW: 0.99, STL: 0.98, LAD: 0.98, MIL: 0.98,
  NYM: 0.97, TB: 0.97, CLE: 0.97, SD: 0.96, DET: 0.96,
  SF: 0.95, SEA: 0.95, MIA: 0.94,
};

/**
 * Multiplier to apply to OUR projected total for the venue. 1 means no
 * adjustment, which is also what an unmapped team gets.
 */
export function parkFactor(league: League, homeAbbr: string): number {
  if (league !== "MLB") return 1;
  return MLB_PARK_FACTOR[homeAbbr] ?? 1;
}
