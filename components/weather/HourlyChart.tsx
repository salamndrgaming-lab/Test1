"use client";

import type { WeatherHour } from "@/types";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Next-24h temperature (area) with precipitation probability (bars).
export function HourlyChart({ hourly }: { hourly: WeatherHour[] }) {
  if (hourly.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart
        data={hourly}
        margin={{ top: 8, right: 6, bottom: 0, left: -22 }}
      >
        <defs>
          <linearGradient id="hrTemp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#283143" vertical={false} />
        <XAxis
          dataKey="label"
          interval={3}
          tick={{ fill: "#93a0b4", fontSize: 10 }}
        />
        <YAxis
          yAxisId="t"
          tick={{ fill: "#93a0b4", fontSize: 10 }}
          unit="°"
          width={40}
        />
        <YAxis yAxisId="p" orientation="right" hide domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: "#141925",
            border: "1px solid #283143",
            borderRadius: 10,
            fontSize: 12,
          }}
          formatter={(v: number, name: string) =>
            name === "precipChance" ? [`${v}%`, "Precip"] : [`${v}°`, "Temp"]
          }
        />
        <Bar
          yAxisId="p"
          dataKey="precipChance"
          fill="#38bdf8"
          opacity={0.35}
          radius={[3, 3, 0, 0]}
          barSize={8}
        />
        <Area
          yAxisId="t"
          type="monotone"
          dataKey="tempF"
          stroke="var(--accent)"
          strokeWidth={2.5}
          fill="url(#hrTemp)"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
