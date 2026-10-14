"use client";

import { useEffect, useState } from "react";
import { usePredictions } from "@/lib/usePredictions";
import { CalibrationCurve } from "@/components/charts/CalibrationCurve";
import { Card } from "@/components/ui";
import { classNames } from "@/lib/format";

function Metric({
  label,
  value,
  sub,
  tone,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  title?: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-3" title={title}>
      <p className="text-[0.65rem] uppercase tracking-wide text-[var(--muted-2)]">
        {label}
      </p>
      <p
        className={classNames(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[0.65rem] text-[var(--muted-2)]">{sub}</p>}
    </div>
  );
}

/**
 * The model's report card. Every leg the SGP tool shows is logged with the
 * probability we claimed; once games finish we grade them and score ourselves
 * against the de-vigged market price.
 */
export function CalibrationPanel() {
  const { score, grade, pendingCount, records, clear } = usePredictions();
  const [checking, setChecking] = useState(false);
  const [justGraded, setJustGraded] = useState<number | null>(null);

  // settle anything that has finished since the last visit
  useEffect(() => {
    if (pendingCount === 0) return;
    let cancelled = false;
    (async () => {
      const n = await grade();
      if (!cancelled && n > 0) setJustGraded(n);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      setJustGraded(await grade());
    } finally {
      setChecking(false);
    }
  };

  const beatsMarket = score.skillScore > 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-medium text-[var(--text)]">
            Model report card
          </h3>
          <button onClick={check} className="chip text-xs" disabled={checking}>
            {checking ? "Checking…" : "Check results"}
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Every pick is logged with the probability we claimed, then graded
          against the final score. This is the only honest test of the model.
        </p>

        {score.graded === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {records.length === 0
              ? "No picks logged yet — open the SGP tab and the model starts keeping score automatically."
              : `${records.length} pick${records.length === 1 ? "" : "s"} logged, none settled yet. Results land once those games finish.`}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Record"
                value={`${score.wins}–${score.losses}`}
                sub={`${score.graded} settled${score.pushes ? ` · ${score.pushes} push` : ""}`}
              />
              <Metric
                label="Brier (us)"
                value={score.brierModel.toFixed(3)}
                sub="lower is better · 0.25 = coinflip"
                title="Mean squared error of our probabilities"
              />
              <Metric
                label="Brier (market)"
                value={score.brierMarket.toFixed(3)}
                sub="the de-vigged price"
                title="Same metric scored on the market's own probability"
              />
              <Metric
                label="Skill vs market"
                value={`${score.skillScore >= 0 ? "+" : ""}${(score.skillScore * 100).toFixed(1)}%`}
                tone={beatsMarket ? "good" : "bad"}
                sub={beatsMarket ? "beating the price" : "the market is sharper"}
                title="1 - (our Brier / market Brier). Positive means we're more accurate than the closing price."
              />
            </div>

            <div className="mt-3">
              <Metric
                label="Flat-stake ROI"
                value={`${score.roi >= 0 ? "+" : ""}${(score.roi * 100).toFixed(1)}%`}
                tone={score.roi >= 0 ? "good" : "bad"}
                sub="per unit, if every logged pick were backed"
              />
            </div>

            {!score.meaningful && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] text-amber-200">
                Only {score.graded} settled pick
                {score.graded === 1 ? "" : "s"} — far too few to judge a model.
                These numbers are noise until roughly 50+, and a few hundred
                before any ROI figure means anything.
              </p>
            )}
          </>
        )}

        {justGraded !== null && justGraded > 0 && (
          <p className="mt-2 text-xs text-good">
            Settled {justGraded} pick{justGraded === 1 ? "" : "s"}.
          </p>
        )}
        {pendingCount > 0 && (
          <p className="mt-2 text-xs text-[var(--muted-2)]">
            {pendingCount} awaiting a final score.
          </p>
        )}
      </Card>

      {score.bins.length > 0 && (
        <Card>
          <h3 className="font-serif text-lg font-medium text-[var(--text)]">
            Calibration
          </h3>
          <p className="mb-3 text-xs text-[var(--muted)]">
            When we say 65%, does it happen 65% of the time? Points on the dashed
            line are perfectly calibrated; below it we&apos;re over-confident,
            above it under-confident. Dot size = sample in that bucket.
          </p>
          <CalibrationCurve bins={score.bins} />
        </Card>
      )}

      {records.length > 0 && (
        <div className="text-right">
          <button
            onClick={clear}
            className="text-xs text-[var(--muted-2)] underline underline-offset-2 hover:text-[var(--bad)]"
          >
            Reset prediction log
          </button>
        </div>
      )}
    </div>
  );
}
