import type { Game, GameWeather, League } from "@/types";
import { fetchJson } from "./withFallback";
import { outdoorVenue, type Venue } from "@/lib/venues";

/**
 * Forecast conditions at kickoff for outdoor games.
 *
 * Open-Meteo accepts comma-separated coordinate lists and returns an array of
 * locations, so an entire NFL slate costs one request rather than sixteen.
 * Only open-roof venues are queried (see `outdoorVenue`).
 */

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: number[];
  wind_speed_10m?: number[];
  wind_gusts_10m?: number[];
  precipitation?: number[];
  precipitation_probability?: number[];
}
interface OpenMeteoLocation {
  latitude?: number;
  longitude?: number;
  hourly?: OpenMeteoHourly;
}

/** Index of the forecast hour closest to a given instant. */
function nearestHour(times: string[], target: number): number {
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (!Number.isFinite(t)) continue;
    const gap = Math.abs(t - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  // A forecast more than six hours from kickoff isn't about this game.
  return bestGap <= 6 * 3_600_000 ? best : -1;
}

function pick(arr: number[] | undefined, i: number): number | undefined {
  const v = arr?.[i];
  return v != null && Number.isFinite(v) ? v : undefined;
}

/**
 * Conditions keyed by game id, for every outdoor game in the slate.
 *
 * Best-effort throughout: a failed request, a roofed stadium or an unlisted
 * team simply yields no entry, and the model applies no weather adjustment.
 */
export async function fetchGameWeather(
  games: Game[],
  signal: AbortSignal,
): Promise<Record<string, GameWeather>> {
  // One venue per distinct coordinate, with the games that are played there.
  const targets = new Map<string, { venue: Venue; games: Game[] }>();
  for (const g of games) {
    if (g.status === "final") continue;
    const venue = outdoorVenue(g.league as League, g.home.abbreviation);
    if (!venue) continue;
    const key = `${venue.lat},${venue.lon}`;
    const entry = targets.get(key);
    if (entry) entry.games.push(g);
    else targets.set(key, { venue, games: [g] });
  }
  if (targets.size === 0) return {};

  const entries = [...targets.values()];
  const lats = entries.map((e) => e.venue.lat).join(",");
  const lons = entries.map((e) => e.venue.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&forecast_days=7&timeformat=iso8601&timezone=UTC`;

  let payload: OpenMeteoLocation | OpenMeteoLocation[];
  try {
    payload = await fetchJson<OpenMeteoLocation | OpenMeteoLocation[]>(url, signal);
  } catch {
    return {};
  }
  // A single coordinate comes back as an object, several as an array.
  const locations = Array.isArray(payload) ? payload : [payload];

  const out: Record<string, GameWeather> = {};
  entries.forEach((entry, idx) => {
    const hourly = locations[idx]?.hourly;
    const times = hourly?.time;
    if (!times || times.length === 0) return;

    for (const g of entry.games) {
      const kickoff = Date.parse(g.startTime);
      if (!Number.isFinite(kickoff)) continue;
      const i = nearestHour(times, kickoff);
      if (i < 0) continue;

      const windMph = pick(hourly.wind_speed_10m, i);
      if (windMph == null) continue;

      out[g.id] = {
        gameId: g.id,
        venue: entry.venue.name,
        tempF: pick(hourly.temperature_2m, i),
        windMph,
        gustMph: pick(hourly.wind_gusts_10m, i),
        precipInches: pick(hourly.precipitation, i),
        precipChance: pick(hourly.precipitation_probability, i),
        forecastFor: times[i],
      };
    }
  });

  return out;
}
