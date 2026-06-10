"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";

interface Frame {
  time: number;
  path: string;
}

// Animated precipitation radar via RainViewer (keyless). Attribution required.
export function RadarMap({ lat, lon }: { lat: number; lon: number }) {
  const [host, setHost] = useState<string>("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const past: Frame[] = j?.radar?.past ?? [];
        const now: Frame[] = j?.radar?.nowcast ?? [];
        setHost(j?.host ?? "https://tilecache.rainviewer.com");
        setFrames([...past, ...now].slice(-12));
        setIdx(Math.max(0, past.length - 1));
      })
      .catch(() => {
        /* radar unavailable — base map still renders */
      });
    return () => {
      cancelled = true;
    };
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
  const radarUrl =
    host && frame
      ? `${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`
      : null;

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
            attribution='&copy; OpenStreetMap, CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {radarUrl && (
            <TileLayer key={frame!.path} url={radarUrl} opacity={0.6} />
          )}
        </MapContainer>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted)]">
        {frames.length > 1 && (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="chip text-xs"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
        )}
        {frame && (
          <span>
            {new Date(frame.time * 1000).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
        <span className="ml-auto">Radar by RainViewer</span>
      </div>
    </div>
  );
}
