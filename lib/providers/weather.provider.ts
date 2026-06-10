import type { WeatherReport } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export interface WeatherParams {
  lat?: number;
  lon?: number;
  place?: string;
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    surface_pressure: number;
    weather_code: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
  };
}

// WMO weather codes -> human label
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy Rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy Snow",
  80: "Showers",
  81: "Showers",
  82: "Showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const weatherProvider: DataProvider<WeatherParams, WeatherReport> = {
  name: "Open-Meteo",
  async fetchLive(params, signal) {
    const hasCoords = params.lat !== undefined && params.lon !== undefined;
    const lat = params.lat ?? 40.7128;
    const lon = params.lon ?? -74.006;
    const place = params.place ?? (hasCoords ? "Selected Location" : "New York, NY");
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code,is_day` +
      `&hourly=temperature_2m,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
    const data = await fetchJson<OpenMeteoResponse>(url, signal);

    // next 24 hours starting from the current hour
    const nowMs = Date.now();
    const hourly = data.hourly.time
      .map((iso, i) => ({ iso, i }))
      .filter(({ iso }) => new Date(iso).getTime() >= nowMs - 3600_000)
      .slice(0, 24)
      .map(({ iso, i }) => ({
        time: iso,
        label: new Date(iso).toLocaleTimeString(undefined, { hour: "numeric" }),
        tempF: Math.round(data.hourly.temperature_2m[i]),
        precipChance: data.hourly.precipitation_probability[i] ?? 0,
      }));

    return {
      current: {
        place,
        tempF: Math.round(data.current.temperature_2m),
        feelsLikeF: Math.round(data.current.apparent_temperature),
        condition: WMO[data.current.weather_code] ?? "—",
        humidity: data.current.relative_humidity_2m,
        windMph: Math.round(data.current.wind_speed_10m),
        windDir: data.current.wind_direction_10m,
        pressureHpa: Math.round(data.current.surface_pressure),
        uvIndex: Math.round(data.daily.uv_index_max?.[0] ?? 0),
        isDay: data.current.is_day === 1,
      },
      hourly,
      daily: data.daily.time.map((iso, i) => ({
        date: iso,
        label: DAYS[new Date(iso).getDay()],
        highF: Math.round(data.daily.temperature_2m_max[i]),
        lowF: Math.round(data.daily.temperature_2m_min[i]),
        condition: WMO[data.daily.weather_code[i]] ?? "—",
        precipChance: data.daily.precipitation_probability_max[i] ?? 0,
        sunrise: data.daily.sunrise?.[i],
        sunset: data.daily.sunset?.[i],
        uvMax: data.daily.uv_index_max?.[i],
      })),
    };
  },
};

// ---- Geocoding (keyless via Open-Meteo) for the lookup box ----

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  admin1?: string;
  country?: string;
}

export const geocodeProvider: DataProvider<{ q: string }, GeoResult[]> = {
  name: "Open-Meteo Geocoding",
  async fetchLive({ q }, signal) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const data = await fetchJson<{
      results?: {
        name: string;
        latitude: number;
        longitude: number;
        admin1?: string;
        country?: string;
      }[];
    }>(url, signal);
    return (data.results ?? []).map((r) => ({
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      admin1: r.admin1,
      country: r.country,
    }));
  },
};
