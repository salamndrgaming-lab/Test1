"use client";

import type { CalibrationBin } from "@/lib/predictions";
import {
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

/**
 * Reliability diagram: predicted probability (x) vs how often it actually
 * happened (y). A perfectly calibrated model sits on the diagonal — above it
 * means we're under-confident, below means we're over-confident.
 */
export function CalibrationCurve({ bins }: { bins: CalibrationBin[] }) {
  if (bins.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        No settled predictions yet.
      </p>
    );
  }
  const data = bins.map((b) => ({
    predicted: Number((b.predicted * 100).toFixed(1)),
    actual: Number((b.actual * 100).toFixed(1)),
    count: b.count,
    label: b.label,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="#283143" />
        <XAxis
          type="number"
          dataKey="predicted"
          domain={[0, 100]}
          unit="%"
          tick={{ fill: "#93a0b4", fontSize: 10 }}
          label={{ value: "we predicted", position: "insideBottom", offset: -2, fill: "#6b7688", fontSize: 10 }}
        />
        <YAxis
          type="number"
          dataKey="actual"
          domain={[0, 100]}
          unit="%"
          tick={{ fill: "#93a0b4", fontSize: 10 }}
        />
        <ZAxis type="number" dataKey="count" range={[60, 320]} />
        <Tooltip
          contentStyle={{
            background: "#141925",
            border: "1px solid #283143",
            borderRadius: 10,
            fontSize: 12,
          }}
          formatter={(v: number, n: string) => [`${v}%`, n === "actual" ? "Actually won" : "Predicted"]}
          labelFormatter={() => ""}
        />
        {/* perfect calibration */}
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ]}
          stroke="#6b7688"
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          legendType="none"
        />
        <Scatter dataKey="actual" fill="var(--accent)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
