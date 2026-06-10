"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { WeatherReport, ProviderResult } from "@/types";
import type { GeoResult } from "@/lib/providers/weather.provider";
import {
  PageHeader,
  SourceBadge,
  Spinner,
  Card,
  ErrorState,
} from "@/components/ui";
import { ForecastStrip } from "@/components/weather/ForecastStrip";
import { HourlyChart } from "@/components/weather/HourlyChart";
import { WeatherDetails } from "@/components/weather/WeatherDetails";
import { AlertsBanner } from "@/components/weather/AlertsBanner";
import { AirQualityCard } from "@/components/weather/AirQualityCard";
import { useSettings } from "@/components/SettingsProvider";
import { accentVars } from "@/lib/sections";

const RadarMap = dynamic(
  () => import("@/components/weather/RadarMap").then((m) => m.RadarMap),
  { ssr: false, loading: () => <Spinner label="Loading radar…" /> },
);

interface Loc {
  lat?: number;
  lon?: number;
  place?: string;
}

export default function WeatherPage() {
  const { settings } = useSettings();
  const [loc, setLoc] = useState<Loc>({});
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<ProviderResult<WeatherReport> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Seed from saved location, else device geolocation (once).
  useEffect(() => {
    if (settings.defaultLocation) {
      setLoc(settings.defaultLocation);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setLoc({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            place: "My Location",
          }),
        () => setLoc({}),
        { timeout: 5000 },
      );
    }
  }, [settings.defaultLocation]);

  const url =
    loc.lat != null && loc.lon != null
      ? `/api/weather?lat=${loc.lat}&lon=${loc.lon}&place=${encodeURIComponent(loc.place ?? "Selected Location")}`
      : "/api/weather";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((j: ProviderResult<WeatherReport>) => {
        if (!cancelled) setReport(j);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
    const j = (await r.json()) as ProviderResult<GeoResult[]>;
    const first = j.data?.[0];
    if (first) {
      const place = [first.name, first.admin1, first.country]
        .filter(Boolean)
        .join(", ");
      setLoc({ lat: first.lat, lon: first.lon, place });
      setQuery("");
    }
  };

  const w = report?.data;

  return (
    <div style={accentVars("weather")}>
      <PageHeader
        kicker="Forecast"
        title="Weather"
        subtitle="Your local forecast, air quality, alerts, and radar."
        right={
          report && <SourceBadge source={report.source} note={report.error} />
        }
      />

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button type="submit" className="btn-primary">
          Go
        </button>
      </form>

      <div className="mb-4">
        <AlertsBanner lat={loc.lat} lon={loc.lon} />
      </div>

      {loading ? (
        <Spinner label="Fetching forecast…" />
      ) : !w ? (
        <ErrorState
          message={
            report?.error
              ? `Couldn't load the forecast. ${report.error}`
              : "Couldn't load the forecast."
          }
          onRetry={() => setLoc((l) => ({ ...l }))}
        />
      ) : (
        <div className="animate-in space-y-4">
          <Card className="bg-gradient-to-br from-cyan-500/15 to-transparent">
            <p className="text-sm text-[var(--muted)]">{w.current.place}</p>
            <div className="flex flex-wrap items-end gap-4">
              <span className="text-6xl font-bold leading-none tabular-nums">
                {w.current.tempF}°
              </span>
              <div className="pb-1 text-sm">
                <p className="text-base font-medium">{w.current.condition}</p>
                <p className="text-[var(--muted)]">
                  Feels like {w.current.feelsLikeF}° · H {w.daily[0]?.highF}° / L{" "}
                  {w.daily[0]?.lowF}°
                </p>
              </div>
            </div>
          </Card>

          <WeatherDetails current={w.current} today={w.daily[0]} />

          <AirQualityCard lat={loc.lat} lon={loc.lon} />

          <Card>
            <h3 className="mb-1 font-semibold">Next 24 Hours</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Temperature with hourly precipitation chance.
            </p>
            <HourlyChart hourly={w.hourly} />
          </Card>

          <Card>
            <h3 className="mb-1 font-semibold">Precipitation Radar</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Animated radar for your area.
            </p>
            <RadarMap lat={loc.lat ?? 40.7128} lon={loc.lon ?? -74.006} />
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">7-Day Forecast</h3>
            <ForecastStrip daily={w.daily} />
          </Card>
        </div>
      )}
    </div>
  );
}
