"use client";

import type { CoverageSnapshot } from "@/lib/useFollows";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// How Left / Center / Right coverage of a followed story changed over time.
export function FollowTimeline({ snapshots }: { snapshots: CoverageSnapshot[] }) {
  if (snapshots.length < 2) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Revisit over a few days to build a coverage timeline.
      </p>
    );
  }
  const data = snapshots.map((s) => ({
    label: new Date(s.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    Left: s.left,
    Center: s.center,
    Right: s.right,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
        <CartesianGrid stroke="#283143" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#93a0b4", fontSize: 10 }} />
        <YAxis allowDecimals={false} tick={{ fill: "#93a0b4", fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: "#141925",
            border: "1px solid #283143",
            borderRadius: 10,
            fontSize: 12,
          }}
        />
        <Line type="monotone" dataKey="Left" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Center" stroke="#a3a3a3" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Right" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
