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
