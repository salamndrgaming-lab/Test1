import type { AirQuality } from "@/types";
import { fetchJson, type DataProvider } from "./withFallback";

export interface AirQualityParams {
  lat?: number;
  lon?: number;
}

interface OpenMeteoAqResponse {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
    pm10?: number;
    ozone?: number;
    nitrogen_dioxide?: number;
    sulphur_dioxide?: number;
    carbon_monoxide?: number;
  };
}

// US EPA AQI bands.
function aqiCategory(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy (Sensitive)";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

// Air quality via Open-Meteo Air Quality API (keyless).
export const airQualityProvider: DataProvider<AirQualityParams, AirQuality> = {
  name: "Open-Meteo Air Quality",
  async fetchLive(params, signal) {
    const lat = params.lat ?? 40.7128;
    const lon = params.lon ?? -74.006;
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide`;
    const data = await fetchJson<OpenMeteoAqResponse>(url, signal);
    const c = data.current;
    if (!c || c.us_aqi == null) throw new Error("no AQI data");
    return {
      usAqi: Math.round(c.us_aqi),
      category: aqiCategory(c.us_aqi),
      pm25: c.pm2_5,
      pm10: c.pm10,
      ozone: c.ozone,
      no2: c.nitrogen_dioxide,
      so2: c.sulphur_dioxide,
      co: c.carbon_monoxide,
    };
  },
};
