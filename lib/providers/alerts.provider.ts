import type { WeatherAlert } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export interface AlertsParams {
  lat?: number;
  lon?: number;
}

interface NwsAlertsResponse {
  features?: {
    id?: string;
    properties?: {
      event?: string;
      severity?: string;
      headline?: string;
      areaDesc?: string;
      expires?: string;
    };
  }[];
}

// US severe-weather alerts from the National Weather Service (keyless; requires
// a User-Agent). Non-US points simply return an empty list.
export const alertsProvider: DataProvider<AlertsParams, WeatherAlert[]> = {
  name: "NWS Alerts",
  async fetchLive(params, signal) {
    const lat = params.lat ?? 40.7128;
    const lon = params.lon ?? -74.006;
    const data = await fetchJson<NwsAlertsResponse>(
      `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
      signal,
      {
        "User-Agent": "NewsScope/0.1 (contact@newsscope.example)",
        Accept: "application/geo+json",
      },
    );
    return (data.features ?? []).map((f, i) => ({
      id: f.id ?? `alert-${i}`,
      event: f.properties?.event ?? "Weather Alert",
      severity: f.properties?.severity ?? "Unknown",
      headline: f.properties?.headline ?? "",
      area: f.properties?.areaDesc ?? "",
      expires: f.properties?.expires,
    }));
  },
};
