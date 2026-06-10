import type { WeatherCurrent, WeatherForecastDay } from "@/types";

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

function compass(deg?: number): string {
  if (deg == null) return "—";
  return COMPASS[Math.round(deg / 22.5) % 16];
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function uvLabel(uv?: number): string {
  if (uv == null) return "";
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very High";
  return "Extreme";
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-3">
      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-[var(--muted-2)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export function WeatherDetails({
  current,
  today,
}: {
  current: WeatherCurrent;
  today?: WeatherForecastDay;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <Tile label="Feels like" value={`${current.feelsLikeF}°`} />
      <Tile label="Humidity" value={`${current.humidity}%`} />
      <Tile
        label="Wind"
        value={`${current.windMph} mph`}
        sub={compass(current.windDir)}
      />
      <Tile
        label="UV Index"
        value={String(current.uvIndex ?? "—")}
        sub={uvLabel(current.uvIndex)}
      />
      <Tile
        label="Pressure"
        value={current.pressureHpa ? `${current.pressureHpa}` : "—"}
        sub="hPa"
      />
      <Tile
        label="Precip"
        value={`${today?.precipChance ?? 0}%`}
        sub="chance today"
      />
      <Tile label="Sunrise" value={fmtTime(today?.sunrise)} />
      <Tile label="Sunset" value={fmtTime(today?.sunset)} />
    </div>
  );
}
