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
  const {
    score,
    clv,
    grade,
    checkClosingLines,
    pendingCount,
    unpricedCount,
    records,
    clear,
  } = usePredictions();
  const [checking, setChecking] = useState(false);
  const [justGraded, setJustGraded] = useState<number | null>(null);

  // settle anything that has finished, and price anything the market has closed
  useEffect(() => {
    if (pendingCount === 0 && unpricedCount === 0) return;
    let cancelled = false;
    (async () => {
      const [n] = await Promise.all([grade(), checkClosingLines()]);
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
      const [n] = await Promise.all([grade(), checkClosingLines()]);
      setJustGraded(n);
    } finally {
      setChecking(false);
    }
  };

  const beatsMarket = score.skillScore > 0;

  return (
    <div className="space-y-4">
      {/* CLV first: it's the measure that produces a verdict soonest. */}
      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-medium text-[var(--text)]">
            Closing line value
          </h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            the fast signal
          </span>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Did the market move toward the number we took? A side taken at −3
          that closes −4 beat the market, whether or not the bet won. This
          needs roughly 20 picks to mean something; win/loss records need
          hundreds.
        </p>

        {clv.checked === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {records.length === 0
              ? "No picks logged yet — open the SGP tab and the model starts keeping score automatically."
              : `${records.length} pick${records.length === 1 ? "" : "s"} logged. Closing lines are read about an hour after each pick.`}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric
                label="Beat the close"
                value={`${(clv.beatRate * 100).toFixed(0)}%`}
                tone={clv.beatRate > 0.5 ? "good" : "bad"}
                sub={`of ${clv.checked} priced pick${clv.checked === 1 ? "" : "s"}`}
                title="Share of picks where the line moved in our favour after we took it"
              />
              <Metric
                label="Avg line value"
                value={`${clv.avgLineValue >= 0 ? "+" : ""}${clv.avgLineValue.toFixed(2)}`}
                tone={clv.avgLineValue > 0 ? "good" : "bad"}
                sub="points of line, per pick"
                title="Mean points the line moved toward our side between our pick and the close"
              />
              <Metric
                label="Avg price value"
                value={`${clv.avgProbabilityValue >= 0 ? "+" : ""}${(clv.avgProbabilityValue * 100).toFixed(1)}pp`}
                tone={clv.avgProbabilityValue > 0 ? "good" : "bad"}
                sub="de-vigged, from moneylines"
                title="Mean change in de-vigged probability in our favour by the close"
              />
            </div>
            {!clv.meaningful && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] text-amber-200">
                {clv.checked} priced pick{clv.checked === 1 ? "" : "s"} — still
                thin. CLV stabilises much faster than win rate, but give it
                ~20 before reading anything into it.
              </p>
            )}
            {clv.meaningful && clv.beatRate < 0.5 && (
              <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
                Losing to the close is the expected result for a free-data
                model, and it&apos;s the honest baseline: it means the market
                knows things we don&apos;t, not that the model is broken.
              </p>
            )}
          </>
        )}
        {unpricedCount > 0 && (
          <p className="mt-2 text-xs text-[var(--muted-2)]">
            {unpricedCount} awaiting a closing line.
          </p>
        )}
      </Card>
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
              {/*
                * Tone and verdict text stay NEUTRAL until the sample can
                * carry them. A 3-0 start otherwise painted two large green
                * numbers reading "beating the price" over a caption saying
                * the sample is far too small to judge — the colour wins that
                * argument long before the caption is read.
                */}
              <Metric
                label="Skill vs market"
                value={`${score.skillScore >= 0 ? "+" : ""}${(score.skillScore * 100).toFixed(1)}%`}
                tone={
                  score.meaningful ? (beatsMarket ? "good" : "bad") : "neutral"
                }
                sub={
                  score.meaningful
                    ? beatsMarket
                      ? "beating the price"
                      : "the market is sharper"
                    : "not yet readable"
                }
                title="1 - (our Brier / market Brier). Positive means we're more accurate than the closing price."
              />
            </div>

            <div className="mt-3">
              <Metric
                label="Flat-stake ROI"
                value={`${score.roi >= 0 ? "+" : ""}${(score.roi * 100).toFixed(1)}%`}
                tone={
                  score.meaningful ? (score.roi >= 0 ? "good" : "bad") : "neutral"
                }
                sub={
                  score.meaningful
                    ? "per unit, if every logged pick were backed"
                    : "per unit — needs a few hundred picks to mean anything"
                }
              />
            </div>

            {!score.meaningful && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-amber-200">
                Only {score.graded} settled pick
                {score.graded === 1 ? "" : "s"} — far too few to judge a model.
                These numbers are noise until roughly 50+, and a few hundred
                before any ROI figure means anything. An unbeaten start is
                weaker evidence than it looks: at the prices these legs carry,
                winning the first {score.graded} in a row happens{" "}
                {(Math.pow(0.6, score.graded) * 100).toFixed(0)}% of the time
                with no skill at all.
              </p>
            )}

            {/*
              * The price-edge cohort, kept apart from the forecast record.
              * It is a claim about price, not prediction, and it is the only
              * strategy here with measured promise.
              */}
            <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-2.5">
              <p className="mb-1 text-[0.7rem] font-semibold text-[var(--text)]">
                Price edge — tracked separately
              </p>
              <p className="mb-2 text-[0.65rem] leading-relaxed text-[var(--muted)]">
                Edge taken from the <em>price</em> rather than the forecast:
                the gap between the consensus fair value and the best number
                any surveyed book offered. Tested on 9,716 historical games,
                shopping alone returned −2.2% (half the vig recovered) and the
                bets clearing the significance bar returned +18.8% — promising,
                but on too few bets to call. This is where the volume to settle
                it accumulates.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
                <div>
                  <p className="text-[var(--muted-2)]">All picks (shopped)</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {score.priceEdge.shopped.roi >= 0 ? "+" : ""}
                    {(score.priceEdge.shopped.roi * 100).toFixed(1)}% ROI
                  </p>
                  <p className="text-[var(--muted-2)] tabular-nums">
                    {score.priceEdge.shopped.wins}/{score.priceEdge.shopped.n} won
                  </p>
                </div>
                <div>
                  <p className="text-[var(--muted-2)]">Cleared the bar</p>
                  <p
                    className={classNames(
                      "mt-0.5 font-semibold tabular-nums",
                      score.priceEdge.meaningful
                        ? score.priceEdge.value.roi >= 0
                          ? "text-good"
                          : "text-bad"
                        : "",
                    )}
                  >
                    {score.priceEdge.value.n === 0
                      ? "—"
                      : `${score.priceEdge.value.roi >= 0 ? "+" : ""}${(score.priceEdge.value.roi * 100).toFixed(1)}% ROI`}
                  </p>
                  <p className="text-[var(--muted-2)] tabular-nums">
                    {score.priceEdge.value.wins}/{score.priceEdge.value.n} won
                    {score.priceEdge.value.n > 0 &&
                      ` · ${(score.priceEdge.value.meanEdge * 100).toFixed(1)}pp avg edge`}
                  </p>
                </div>
              </div>
              {!score.priceEdge.meaningful && (
                <p className="mt-1.5 text-[0.65rem] text-[var(--muted-2)]">
                  {score.priceEdge.value.n} of ~160 value bets needed before
                  this figure means anything. Until then it is a counter, not a
                  result.
                </p>
              )}
            </div>

            {/*
              * Whose record is this? While the vote is gated the published
              * probability is the consensus plus a distribution correction,
              * so the W-L is mostly the market's. Derived from the records
              * themselves rather than asserted, so it stays true if the vote
              * later opens.
              */}
            <p className="mt-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-[var(--muted)]">
              Our published probability sat a median of{" "}
              <span className="tabular-nums text-[var(--text)]">
                {(score.medianLean * 100).toFixed(1)}pp
              </span>{" "}
              from the consensus on these picks.{" "}
              {score.medianLean < 0.01 ? (
                <>
                  That is close to nothing, which is by design — the
                  model&apos;s vote is gated until the backtest measures skill,
                  so what is being graded here is essentially the market&apos;s
                  forecast with our distribution shape on top. A winning or
                  losing streak is the market&apos;s, not evidence about the
                  model.
                </>
              ) : (
                <>
                  That gap is what a record can actually test. The larger it
                  is, the more this scoreboard is about our forecast rather
                  than the market&apos;s.
                </>
              )}
            </p>
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
