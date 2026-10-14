"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { useSettings } from "@/components/SettingsProvider";
import { classNames } from "@/lib/format";

interface Frame {
  time: number;
  path: string;
  forecast: boolean;
}

/**
 * Animated precipitation radar (RainViewer, keyless) with a draggable
 * timeline. Past frames and the nowcast are visually separated so a forecast
 * is never mistaken for an observation.
 *
 * Frames that have been shown stay mounted at zero opacity, so scrubbing back
 * through them is instant instead of re-fetching tiles on every step.
 */
export function RadarMap({ lat, lon }: { lat: number; lon: number }) {
  const { settings } = useSettings();
  const [host, setHost] = useState("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(!settings.reduceMotion);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  // held in state so render stays pure (no clock reads during render)
  const [nowMs, setNowMs] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const past: Frame[] = (j?.radar?.past ?? []).map(
          (f: { time: number; path: string }) => ({ ...f, forecast: false }),
        );
        const now: Frame[] = (j?.radar?.nowcast ?? []).map(
          (f: { time: number; path: string }) => ({ ...f, forecast: true }),
        );
        const all = [...past.slice(-10), ...now.slice(0, 3)];
        setHost(j?.host ?? "https://tilecache.rainviewer.com");
        setFrames(all);
        // start on the most recent observation, not the forecast
        setIdx(Math.max(0, past.slice(-10).length - 1));
      })
      .catch(() => {
        /* radar unavailable — the base map still renders */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoaded((prev) => (prev.has(idx) ? prev : new Set(prev).add(idx)));
  }, [idx]);

  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (playing && frames.length > 1) {
      timer.current = setInterval(
        () => setIdx((i) => (i + 1) % frames.length),
        700,
      );
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, frames]);

  const frame = frames[idx];
  const lastPast = useMemo(
    () => frames.map((f) => f.forecast).lastIndexOf(false),
    [frames],
  );

  const relative = (f: Frame) => {
    if (nowMs === null) return "";
    const mins = Math.round((f.time * 1000 - nowMs) / 60000);
    if (Math.abs(mins) < 3) return "now";
    return mins > 0 ? `+${mins}m` : `${mins}m`;
  };

  const tileUrl = (f: Frame) =>
    `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`;

  return (
    <div>
      <div className="h-64 w-full overflow-hidden rounded-2xl">
        <MapContainer
          key={`${lat},${lon}`}
          center={[lat, lon]}
          zoom={6}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap, CARTO"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {host &&
            frames.map((f, i) =>
              loaded.has(i) ? (
                <TileLayer
                  key={f.path}
                  url={tileUrl(f)}
                  opacity={i === idx ? 0.65 : 0}
                  zIndex={400 + i}
                />
              ) : null,
            )}
        </MapContainer>
      </div>

      {frames.length > 1 && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause radar" : "Play radar"}
              className="chip shrink-0 text-xs"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={idx}
              aria-label="Radar time"
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-3)] accent-[var(--accent)]"
            />
            <span
              className={classNames(
                "w-14 shrink-0 text-right text-xs tabular-nums",
                frame?.forecast ? "text-amber-300" : "text-[var(--muted)]",
              )}
            >
              {frame ? relative(frame) : "—"}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between text-[0.65rem] text-[var(--muted-2)]">
            <span>
              {frame
                ? new Date(frame.time * 1000).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
              {frame?.forecast && (
                <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-amber-300">
                  forecast
                </span>
              )}
            </span>
            <span>
              {lastPast >= 0 && idx <= lastPast
                ? "observed"
                : "predicted movement"}
            </span>
            <span>Radar by RainViewer</span>
          </div>
        </div>
      )}
    </div>
  );
}
