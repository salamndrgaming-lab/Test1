import type { Article } from "@/types";
import { framingGap, type FramingTerm } from "@/lib/framing";
import type { LeanColumn } from "@/lib/blindspot";

const SIDE_COLOR: Record<"left" | "right", string> = {
  left: "#60a5fa",
  right: "#f87171",
};

function TermCloud({
  terms,
  side,
}: {
  terms: FramingTerm[];
  side: "left" | "right";
}) {
  if (terms.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-2)]">
        No distinctive wording found.
      </p>
    );
  }
  const max = Math.max(...terms.map((t) => Math.abs(t.score)), 0.001);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
      {terms.map((t) => {
        const weight = Math.abs(t.score) / max; // 0..1
        return (
          <span
            key={t.term}
            title={`"${t.term}" — ${t.count}× on this side vs ${t.otherCount}× on the other`}
            style={{
              color: SIDE_COLOR[side],
              fontSize: `${0.8 + weight * 0.55}rem`,
              opacity: 0.6 + weight * 0.4,
            }}
            className="font-serif font-medium leading-none"
          >
            {t.term}
          </span>
        );
      })}
    </div>
  );
}

function ToneBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="text-center">
        <p className="text-[0.65rem] text-[var(--muted-2)]">{label}</p>
        <p className="text-xs text-[var(--muted-2)]">—</p>
      </div>
    );
  }
  const pct = Math.min(Math.abs(value), 1) * 50;
  const positive = value >= 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[0.65rem]">
        <span className="text-[var(--muted)]">{label}</span>
        <span
          className={`tabular-nums ${positive ? "text-good" : "text-bad"}`}
        >
          {value >= 0 ? "+" : ""}
          {value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-[var(--surface-3)]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--border)]" />
        <div
          className={`absolute top-0 h-full rounded-full ${positive ? "bg-good" : "bg-bad"}`}
          style={
            positive
              ? { left: "50%", width: `${pct}%` }
              : { right: "50%", width: `${pct}%` }
          }
        />
      </div>
    </div>
  );
}

/**
 * Shows how each side *words* the same story — the distinctive vocabulary of
 * left- vs right-leaning coverage, plus the tone gap between them.
 */
export function FramingGap({ articles }: { articles: Article[] }) {
  const gap = framingGap(articles);
  const toneLabels: [LeanColumn, string][] = [
    ["left", "Left tone"],
    ["center", "Center tone"],
    ["right", "Right tone"],
  ];

  if (!gap.reliable) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Not enough coverage on both sides yet to compare wording. Found{" "}
        {gap.sampleLeft} left-leaning and {gap.sampleRight} right-leaning
        articles — this needs at least a few of each.
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            Words the left uses
          </p>
          <TermCloud terms={gap.left} side="left" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">
            Words the right uses
          </p>
          <TermCloud terms={gap.right} side="right" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {toneLabels.map(([key, label]) => (
          <ToneBar key={key} label={label} value={gap.tone[key]} />
        ))}
      </div>

      <p className="mt-4 text-[0.65rem] leading-relaxed text-[var(--muted-2)]">
        Distinctive terms are scored by smoothed log-odds across{" "}
        {gap.sampleLeft} left-leaning and {gap.sampleRight} right-leaning
        headlines. Word size reflects how lopsided the usage is. Headlines are a
        small sample — treat this as a prompt to read both sides, not proof of
        intent.
      </p>
    </div>
  );
}
