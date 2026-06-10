"use client";

import { useEffect, useState } from "react";
import type { WeatherReport, ProviderResult } from "@/types";
import { PageHeader, SourceBadge, Spinner, Card, ErrorState } from "@/components/ui";
import { ForecastStrip } from "@/components/weather/ForecastStrip";
import { accentVars } from "@/lib/sections";

export default function WeatherPage() {
  const [url, setUrl] = useState("/api/weather");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState<ProviderResult<WeatherReport> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Try to use the device location once on mount (mobile-friendly).
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUrl(
            `/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&place=My+Location`,
          ),
        () => setUrl("/api/weather"),
        { timeout: 5000 },
      );
    }
  }, []);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setUrl(`/api/weather?q=${encodeURIComponent(query.trim())}`);
  };

  const w = report?.data;

  return (
    <div style={accentVars("weather")}>
      <PageHeader
        kicker="Forecast"
        title="Weather"
        subtitle="Your local forecast, plus lookup for anywhere."
        right={report && <SourceBadge source={report.source} note={report.error} />}
      />

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900"
        >
          Go
        </button>
      </form>

      {loading ? (
        <Spinner label="Fetching forecast…" />
      ) : !w ? (
        <ErrorState
          message={
            report?.error
              ? `Couldn't load the forecast. ${report.error}`
              : "Couldn't load the forecast."
          }
          onRetry={() => setUrl((u) => `${u}${u.includes("?") ? "&" : "?"}r=${Date.now()}`)}
        />
      ) : (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-sky-500/15 to-transparent">
            <p className="text-sm text-[var(--muted)]">{w.current.place}</p>
            <div className="flex items-end gap-4">
              <span className="text-5xl font-bold tabular-nums">
                {w.current.tempF}°
              </span>
              <div className="pb-1 text-sm">
                <p className="font-medium">{w.current.condition}</p>
                <p className="text-[var(--muted)]">
                  Humidity {w.current.humidity}% · Wind {w.current.windMph} mph
                </p>
              </div>
            </div>
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
