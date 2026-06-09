"use client";

import type { WeatherForecastDay } from "@/types";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ForecastStrip({ daily }: { daily: WeatherForecastDay[] }) {
  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {daily.map((d) => (
          <div
            key={d.date}
            className="flex min-w-[4.5rem] flex-col items-center rounded-xl bg-[var(--surface-2)] p-3 text-center"
          >
            <span className="text-xs text-[var(--muted)]">{d.label}</span>
            <span className="my-1 text-lg font-bold tabular-nums">{d.highF}°</span>
            <span className="text-xs text-[var(--muted)] tabular-nums">
              {d.lowF}°
            </span>
            <span className="mt-1 text-[0.65rem] text-sky-300">
              {d.precipChance}%
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart
          data={daily}
          margin={{ top: 8, right: 12, bottom: 0, left: -24 }}
        >
          <XAxis dataKey="label" tick={{ fill: "#93a1b5", fontSize: 10 }} />
          <YAxis tick={{ fill: "#93a1b5", fontSize: 10 }} unit="°" />
          <Tooltip
            contentStyle={{
              background: "#141a26",
              border: "1px solid #283246",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="highF"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="High"
          />
          <Line
            type="monotone"
            dataKey="lowF"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
            name="Low"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
