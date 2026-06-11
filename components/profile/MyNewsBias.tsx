"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLibrary } from "@/lib/useLibrary";
import { CoverageSpread } from "@/components/charts/CoverageSpread";
import { biasDistribution } from "@/lib/bias";

export function MyNewsBias() {
  const { history } = useLibrary();

  const stats = useMemo(() => {
    const rated = history.filter((a) => a.bias !== "unknown");
    const dist = biasDistribution(rated);
    const left = dist.left + dist["lean-left"];
    const right = dist.right + dist["lean-right"];
    const center = dist.center;
    const total = left + right + center;
    return { rated, total, left, right, center };
  }, [history]);

  if (stats.total < 3) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Read a few stories and your personal media-diet breakdown will appear
        here — see how balanced (or not) your reading is.
      </p>
    );
  }

  const pct = (n: number) => Math.round((n / stats.total) * 100);
  const leftPct = pct(stats.left);
  const rightPct = pct(stats.right);
  const dominant =
    stats.left > stats.right && stats.left > stats.center
      ? "left-leaning"
      : stats.right > stats.left && stats.right > stats.center
        ? "right-leaning"
        : "centrist";
  const skewed = Math.abs(leftPct - rightPct) >= 25;

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Across your last {stats.total} reads, your media diet skews{" "}
        <span className="font-semibold text-[var(--text)]">{dominant}</span> —
        {" "}
        {leftPct}% left · {pct(stats.center)}% center · {rightPct}% right.
      </p>
      <CoverageSpread articles={stats.rated} />
      {skewed && (
        <p className="mt-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--surface-2)] px-3 py-2 text-sm">
          You&apos;re reading mostly one side.{" "}
          <Link href="/bias" className="text-[var(--accent)] underline">
            See how the other side covers today&apos;s top story →
          </Link>
        </p>
      )}
    </div>
  );
}
