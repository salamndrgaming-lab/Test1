import type { WeatherReport } from "@/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildDaily(baseHigh: number, baseLow: number, conditions: string[]) {
  const today = new Date();
  return conditions.map((condition, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      label: DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1],
      highF: baseHigh + Math.round(Math.sin(i) * 6),
      lowF: baseLow + Math.round(Math.cos(i) * 4),
      condition,
      precipChance: [10, 20, 60, 80, 30, 10, 5][i] ?? 15,
    };
  });
}

export function seedWeather(place = "Your Area"): WeatherReport {
  return {
    current: {
      place,
      tempF: 68,
      condition: "Partly Cloudy",
      humidity: 54,
      windMph: 8,
    },
    daily: buildDaily(72, 55, [
      "Sunny",
      "Partly Cloudy",
      "Showers",
      "Rain",
      "Cloudy",
      "Sunny",
      "Clear",
    ]),
  };
}
