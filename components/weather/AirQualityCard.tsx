"use client";

import type { AirQuality } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { Card, Spinner } from "@/components/ui";

function aqiColor(aqi: number): string {
  if (aqi <= 50) return "#22c55e";
  if (aqi <= 100) return "#eab308";
  if (aqi <= 150) return "#f97316";
  if (aqi <= 200) return "#ef4444";
  if (aqi <= 300) return "#a855f7";
  return "#7f1d1d";
}

export function AirQualityCard({ lat, lon }: { lat?: number; lon?: number }) {
  const qs = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : "";
  const { data, loading, error } = useProvider<AirQuality>(
    `/api/weather/air-quality${qs}`,
  );

  if (loading)
    return (
      <Card>
        <Spinner label="Air quality…" />
      </Card>
    );
  if (error || !data) return null;

  const color = aqiColor(data.usAqi);
  const pct = Math.min(100, (data.usAqi / 300) * 100);

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Air Quality</h3>
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full text-slate-950"
          style={{ background: color }}
        >
          <span className="text-xl font-bold leading-none">{data.usAqi}</span>
          <span className="text-[0.6rem] font-medium">US AQI</span>
        </div>
        <div className="flex-1">
          <p className="font-medium" style={{ color }}>
            {data.category}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] text-[var(--muted)]">
            {data.pm25 != null && <span>PM2.5 {data.pm25.toFixed(0)}</span>}
            {data.pm10 != null && <span>PM10 {data.pm10.toFixed(0)}</span>}
            {data.ozone != null && <span>O₃ {data.ozone.toFixed(0)}</span>}
            {data.no2 != null && <span>NO₂ {data.no2.toFixed(0)}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
