"use client";

import type { CoverageSnapshot } from "@/lib/useFollows";
import { storyMomentum } from "@/lib/momentum";
import { COLUMN_LABEL, type LeanColumn } from "@/lib/blindspot";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LEAN_FILL: Record<LeanColumn, string> = {
  left: "#3b82f6",
  center: "#a3a3a3",
  right: "#ef4444",
};

/**
 * Coverage volume by lean over time, plus a plain-language momentum read:
 * is the story growing or fading, and which side is driving it?
 */
export function StoryMomentum({
  snapshots,
}: {
  snapshots: CoverageSnapshot[];
}) {
  const m = storyMomentum(snapshots);

  if (!m.enoughData) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Revisit this story over a few days and its momentum will build here —
        we snapshot coverage once per day.
      </p>
    );
  }

  const arrow =
    m.direction === "rising" ? "↑" : m.direction === "falling" ? "↓" : "→";
  const toneClass =
    m.direction === "rising"
      ? "text-good"
      : m.direction === "falling"
        ? "text-bad"
        : "text-[var(--muted)]";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className={`font-semibold ${toneClass}`}>
          {arrow} Coverage {m.direction}
          {m.totalChangePct !== null && (
            <span className="tabular-nums">
              {" "}
              ({m.totalChangePct >= 0 ? "+" : ""}
              {m.totalChangePct.toFixed(0)}%)
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {m.latestTotal} articles tracked
        </span>
      </div>

      {m.driver && (
        <p className="mb-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs">
          <span className="font-semibold" style={{ color: LEAN_FILL[m.driver] }}>
            {COLUMN_LABEL[m.driver]}
          </span>{" "}
          coverage shifted{" "}
          <span className="font-semibold tabular-nums">
            {m.shareShift[m.driver] >= 0 ? "+" : ""}
            {m.shareShift[m.driver].toFixed(0)}pp
          </span>{" "}
          of the total share — the biggest move on this story.
        </p>
      )}

      <ResponsiveContainer width="100%" height={190}>
        <AreaChart
          data={m.points}
          margin={{ top: 8, right: 10, bottom: 0, left: -22 }}
        >
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
          {(["left", "center", "right"] as LeanColumn[]).map((lean) => (
            <Area
              key={lean}
              type="monotone"
              dataKey={lean}
              name={COLUMN_LABEL[lean]}
              stackId="1"
              stroke={LEAN_FILL[lean]}
              fill={LEAN_FILL[lean]}
              fillOpacity={0.55}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
