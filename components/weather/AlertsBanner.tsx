"use client";

import { useState } from "react";
import type { WeatherAlert } from "@/types";
import { useProvider } from "@/lib/useProvider";

const SEVERITY_CLASS: Record<string, string> = {
  Extreme: "border-red-500/50 bg-red-500/15 text-red-200",
  Severe: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  Moderate: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  Minor: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
};

export function AlertsBanner({ lat, lon }: { lat?: number; lon?: number }) {
  const qs = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : "";
  const { data } = useProvider<WeatherAlert[]>(`/api/weather/alerts${qs}`);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const alerts = (data ?? []).filter((a) => !dismissed.has(a.id));
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
            SEVERITY_CLASS[a.severity] ??
            "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          <span aria-hidden>⚠</span>
          <div className="flex-1">
            <p className="font-semibold">{a.event}</p>
            <p className="text-xs opacity-90">{a.headline || a.area}</p>
          </div>
          <button
            onClick={() => setDismissed((p) => new Set(p).add(a.id))}
            className="shrink-0 text-xs opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
