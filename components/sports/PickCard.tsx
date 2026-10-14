"use client";

import { useState } from "react";
import type { SgpLeg } from "@/types";
import { formatOdds, formatPct, classNames } from "@/lib/format";
import { MarginCurve } from "@/components/sports/MarginCurve";

const CONF_CLASS = {
  high: "bg-green-500/15 text-green-300",
  medium: "bg-amber-500/15 text-amber-300",
  low: "bg-slate-500/15 text-slate-300",
};

function ProbRow({ leg }: { leg: SgpLeg }) {
  const cells: [string, string, string][] = [
    ["Model", formatPct(leg.modelProbability), "Our estimated true probability"],
    [
      "Market",
      formatPct(leg.marketProbability),
      "The market price with the book's margin removed",
    ],
    [
      "Break-even",
      formatPct(leg.breakEvenProbability),
      "Win rate needed just to break even at this price",
    ],
  ];
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {cells.map(([label, value, title]) => (
        <div
          key={label}
          title={title}
          className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-center"
        >
          <p className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
            {label}
          </p>
          <p className="text-sm font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ConfidenceDetail({ leg }: { leg: SgpLeg }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-[var(--surface-2)] p-2.5">
      {leg.confidenceFactors.map((f) => (
        <div key={f.label}>
          <div className="flex items-baseline justify-between text-[0.7rem]">
            <span className="font-medium">{f.label}</span>
            <span className="tabular-nums text-[var(--muted)]">
              {Math.round(f.value * 100)}%
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.round(f.value * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 text-[0.65rem] text-[var(--muted-2)]">{f.note}</p>
        </div>
      ))}
    </div>
  );
}

export function PickCard({
  leg,
  selected,
  onToggle,
}: {
  leg: SgpLeg;
  selected: boolean;
  onToggle: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showCurve, setShowCurve] = useState(true);
  const positive = leg.edge > 0;

  return (
    <div
      className={classNames(
        "card transition-colors",
        selected ? "border-sky-400/60" : "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{leg.matchup}</span>
            <span>·</span>
            <span>{leg.market}</span>
          </div>
          <h4 className="font-semibold leading-snug">{leg.selection}</h4>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-semibold tabular-nums">
          {formatOdds(leg.americanOdds)}
        </span>
        <span
          className="rounded bg-[var(--surface-2)] px-2 py-0.5 tabular-nums text-[var(--muted)]"
          title="Odds that would be fair at our model probability"
        >
          fair {formatOdds(leg.fairAmericanOdds)}
        </span>
        <span
          className={classNames("rounded px-2 py-0.5", CONF_CLASS[leg.confidence])}
          title="How reliable this estimate is (not how likely the outcome is)"
        >
          {leg.confidence} · {Math.round(leg.confidenceScore * 100)}
        </span>
        <span
          className={classNames(
            "rounded px-2 py-0.5 tabular-nums",
            positive
              ? "bg-green-500/10 text-green-300"
              : "bg-red-500/10 text-red-300",
          )}
          title="Model probability minus the break-even probability at this price"
        >
          edge {positive ? "+" : ""}
          {formatPct(leg.edge)}
        </span>
      </div>

      <ProbRow leg={leg} />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-[var(--muted)]">
        <span title="Expected profit per $1 staked">
          EV{" "}
          <span
            className={classNames(
              "font-semibold tabular-nums",
              positive ? "text-good" : "text-bad",
            )}
          >
            {leg.expectedValue >= 0 ? "+" : ""}
            {leg.expectedValue.toFixed(3)}
          </span>{" "}
          / $1
        </span>
        {leg.kellyFraction > 0 && (
          <span title="Kelly criterion stake fraction for this edge">
            Kelly{" "}
            <span className="font-semibold tabular-nums text-[var(--text)]">
              {(leg.kellyFraction * 100).toFixed(1)}%
            </span>
          </span>
        )}
        {leg.modelMeta?.kind === "margin" && (
          <button
            onClick={() => setShowCurve((v) => !v)}
            className="ml-auto text-[var(--accent)] underline underline-offset-2"
          >
            {showCurve ? "Hide curve" : "Model curve"}
          </button>
        )}
        <button
          onClick={() => setShowWhy((v) => !v)}
          className={classNames(
            "text-[var(--accent)] underline underline-offset-2",
            leg.modelMeta?.kind !== "margin" && "ml-auto",
          )}
        >
          {showWhy ? "Hide confidence" : "Why this confidence?"}
        </button>
      </div>

      {showCurve && <MarginCurve leg={leg} />}
      {showWhy && <ConfidenceDetail leg={leg} />}

      <p className="mt-2 text-sm text-[var(--muted)]">{leg.rationale}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {leg.supportingStats.map((s) => (
          <span
            key={s.label}
            className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[0.7rem]"
          >
            <span className="text-[var(--muted)]">{s.label}: </span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>

      {leg.references.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem]">
          <span className="text-[var(--muted)]">Sources:</span>
          {leg.references.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2"
            >
              {r.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
