"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformSlip, SgpRecommendation } from "@/types";
import { PickCard } from "./PickCard";
import { ArbBuilder } from "./ArbBuilder";
import { SgpChat } from "./SgpChat";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { calculatePayout } from "@/lib/sgp";
import { usePredictions } from "@/lib/usePredictions";
import { LegEdgeChart, ParlayGrowthChart } from "./SgpCharts";
import { formatMoney, formatOdds, formatPct, classNames } from "@/lib/format";

// Interactive research slip: toggle legs, set a stake, see combined odds and an
// estimated payout. Framed strictly as research/education.
export function SgpBuilder({ rec }: { rec: SgpRecommendation }) {
  // The pool is every usable leg, ranked. Choosing a leg count rebuilds the
  // slip from it without another request; individual legs can still be
  // toggled afterwards.
  /*
   * Which platform the slip is priced for.
   *
   * null means "shop everywhere" — every leg at whichever book offers the
   * best number. That is the highest-value slip and it is NOT placeable at a
   * single sportsbook, so picking a platform swaps the pool for the legs that
   * book actually quotes, at its own prices. Everything downstream is
   * unchanged: the leg-count selector, the payout and the cards all read the
   * pool.
   */
  // Memoised so the `?? []` fallback doesn't produce a fresh array identity
  // on every render and re-run everything downstream of it.
  const allPlatforms = useMemo(() => rec.platforms ?? [], [rec.platforms]);
  const [platform, setPlatform] = useState<string | null>(null);

  /*
   * How to rank the books, and whether to hide the ones you can't use.
   *
   * "EV at this length" is the default because it answers the actual question
   * — which book pays best for the slip I am building. The others matter for
   * different questions: mean edge is length-independent so it is the cleaner
   * read on pure price quality, coverage finds the book that can take the
   * whole slate, and best play finds the single best bet available anywhere.
   */
  const [sortBy, setSortBy] = useState<
    "ev" | "edge" | "coverage" | "best"
  >("ev");
  const [onlyUsable, setOnlyUsable] = useState(false);

  /*
   * Which sub-screen of the tool is showing.
   *
   * "build" is the slip you are assembling. "compare" is every book's version
   * of the same slip side by side — the question "which platform should I put
   * this on" answered on one screen, instead of by clicking into each book
   * and remembering what the last one said.
   */
  const [view, setView] = useState<"build" | "compare">("build");

  const oppCounts = useMemo(() => {
    const os = rec.opportunities ?? [];
    const mids = os.flatMap((o) => o.middles);
    const positive = mids.filter((m) => m.expectedValue > 0);
    return {
      arbitrage: os.reduce((n, o) => n + o.arbitrage.length, 0),
      middles: mids.length,
      stale: os.reduce((n, o) => n + o.stale.length, 0),
      /*
       * Plays that carry positive expected value, which straight legs almost
       * never do. Counted separately because "0 value legs" otherwise reads
       * as "the tool found nothing" when what it actually found was that the
       * value is not in single bets.
       */
      positiveEv: positive.length,
      bestEv: positive.reduce(
        (best, m) => Math.max(best, m.expectedValue),
        0,
      ),
    };
  }, [rec.opportunities]);
  /*
   * Collapsed by default, EXCEPT when there is a genuine arbitrage in there.
   * A risk-free pair is the one finding in this app that is worth money
   * without any forecast being right, and hiding it behind a tap by default
   * would be burying the best thing the tool found.
   */
  const [oppsOpen, setOppsOpen] = useState(oppCounts.arbitrage > 0);
  const activePlatform = platform
    ? allPlatforms.find((p) => p.book === platform)
    : undefined;

  const shoppedPool = rec.candidates.length > 0 ? rec.candidates : rec.legs;
  const pool = activePlatform ? activePlatform.legs : shoppedPool;
  const maxLegs = Math.min(10, pool.length);
  const [legCount, setLegCount] = useState(
    Math.min(rec.legs.length || 1, Math.min(10, shoppedPool.length)),
  );

  /**
   * A book's expected value at the length currently being built.
   *
   * Clamped to what the book actually offers rather than extrapolated: a book
   * quoting four legs has no eight-leg price, and inventing one would be the
   * same mistake as falling back to a better book's number.
   */
  const evAtLength = useCallback(
    (p: PlatformSlip, n: number) =>
      p.evByLength[Math.min(n, p.evByLength.length) - 1] ?? 0,
    [],
  );

  /**
   * The book's best play, derived from its own EV curve when the field is
   * absent.
   *
   * A cached response from before these fields existed rendered "NaN% @ legs"
   * on screen. The curve is already present and the best play is just its
   * argmax, so recomputing costs nothing and removes a class of failure where
   * stale data produces a number that is not a number.
   */
  const bestPlay = useCallback((p: PlatformSlip) => {
    if (
      typeof p.bestLength === "number" &&
      typeof p.bestExpectedValue === "number" &&
      Number.isFinite(p.bestExpectedValue)
    ) {
      return { length: p.bestLength, ev: p.bestExpectedValue };
    }
    let length = 1;
    let ev = p.evByLength[0] ?? 0;
    p.evByLength.forEach((v, i) => {
      if (v > ev) {
        ev = v;
        length = i + 1;
      }
    });
    return { length, ev };
  }, []);

  const platforms = useMemo(() => {
    const rows = onlyUsable
      ? allPlatforms.filter((p) => p.legs.length >= legCount)
      : allPlatforms;
    const key = (p: PlatformSlip) => {
      switch (sortBy) {
        case "edge":
          return p.meanLegEdge;
        case "coverage":
          return p.gamesAvailable;
        case "best":
          return bestPlay(p).ev;
        default:
          return evAtLength(p, legCount);
      }
    };
    return [...rows].sort((a, b) => key(b) - key(a));
  }, [allPlatforms, onlyUsable, sortBy, legCount, evAtLength, bestPlay]);

  // One leg per game, so the combined price's independence assumption holds.
  const slipFor = useCallback((n: number) => {
    const out: typeof pool = [];
    const perGame = new Set<string>();
    for (const leg of pool) {
      if (out.length >= n) break;
      if (perGame.has(leg.gameId)) continue;
      perGame.add(leg.gameId);
      out.push(leg);
    }
    // Only if the slate is too thin to fill the request from distinct games.
    for (const leg of pool) {
      if (out.length >= n) break;
      if (out.some((l) => l.id === leg.id)) continue;
      out.push(leg);
    }
    return out;
  }, [pool]);

  /*
   * The requested length and the chosen legs move together, so they are one
   * piece of state updated in the click handler. An effect that re-seeded the
   * selection whenever the count changed would work, but it would be a
   * render-triggered cascade for something the event already knows.
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(slipFor(legCount).map((l) => l.id)),
  );

  const chooseCount = (n: number) => {
    setLegCount(n);
    setSelectedIds(new Set(slipFor(n).map((l) => l.id)));
  };

  /*
   * Switching platform changes which legs exist, so the length and the
   * selection are reseeded in the same handler rather than in an effect — the
   * click already knows both, and a book offering only three legs must not
   * leave a stale seven-leg selection behind.
   */
  const choosePlatform = (book: string | null) => {
    const next = book ? platforms.find((p) => p.book === book) : undefined;
    const nextPool = next ? next.legs : shoppedPool;
    const nextMax = Math.min(10, nextPool.length);
    const n = Math.max(1, Math.min(legCount, nextMax));
    const seen = new Set<string>();
    const seed: string[] = [];
    for (const leg of nextPool) {
      if (seed.length >= n) break;
      if (seen.has(leg.gameId)) continue;
      seen.add(leg.gameId);
      seed.push(leg.id);
    }
    setPlatform(book);
    setLegCount(n);
    setSelectedIds(new Set(seed));
  };
  const [stake, setStake] = useState(10);
  const [acknowledged, setAcknowledged] = useState(false);
  const { record } = usePredictions();

  /*
   * Log every pick the model shows, so it can be graded once games finish.
   *
   * Deliberately logged from the SHOPPED pool rather than the active
   * platform's. The prediction log measures the model against the closing
   * line, and that measurement has to sit on one consistent price basis —
   * re-logging the same pick at a different book's number every time the user
   * switches platform would make the graded history a record of which tab was
   * open, not of whether the forecast was any good.
   */
  const logSlip = useMemo(() => {
    const out: typeof shoppedPool = [];
    const seen = new Set<string>();
    for (const leg of shoppedPool) {
      if (out.length >= legCount) break;
      if (seen.has(leg.gameId)) continue;
      seen.add(leg.gameId);
      out.push(leg);
    }
    return out;
  }, [shoppedPool, legCount]);
  const legIds = logSlip.map((l) => l.id).join(",");
  useEffect(() => {
    record(logSlip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legIds]);

  const selectedLegs = pool.filter((l) => selectedIds.has(l.id));
  // Measured reasons to distrust the slip, counted from the legs in it.
  const shaky = selectedLegs.filter((l) =>
    (l.riskFlags ?? []).some((f) => f.severity === "high"),
  );
  const flagged = selectedLegs.filter((l) => (l.riskFlags ?? []).length > 0);
  const valueLegs = selectedLegs.filter((l) => l.edge > 0);
  const payout = useMemo(
    () =>
      selectedLegs.length > 0
        ? calculatePayout(stake, selectedLegs)
        : null,
    [selectedLegs, stake],
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /*
   * Shared by both sub-screens, because the question they answer is the same
   * one: which book, ranked how. Defined once rather than duplicated so the
   * two screens cannot drift apart.
   */
  // Sort and filter — the question "which book?" has several forms.
  const sortControls = (
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
        <span className="text-[var(--muted-2)]">Rank by</span>
        {(
          [
            ["ev", `EV at ${legCount} leg${legCount === 1 ? "" : "s"}`],
            ["edge", "price quality"],
            ["best", "best play here"],
            ["coverage", "games covered"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={classNames(
              "rounded-full border px-2 py-0.5 transition-colors",
              sortBy === key
                ? "border-sky-400 bg-sky-400/10 text-sky-200"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50",
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setOnlyUsable((v) => !v)}
          className={classNames(
            "rounded-full border px-2 py-0.5 transition-colors",
            onlyUsable
              ? "border-sky-400 bg-sky-400/10 text-sky-200"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50",
          )}
          title="Hide books that cannot fill the slip at the current length"
        >
          {onlyUsable ? "✓ " : ""}can take all {legCount}
        </button>
      </div>
  );

  if (!acknowledged) {
    return (
      <div className="card space-y-3">
        <DisclaimerBanner />
        <p className="text-sm text-[var(--muted)]">
          This tool builds an illustrative multi-leg research slip from public
          stats and odds, with the reasoning and sources behind each pick. It is
          educational only — not betting advice, and no outcome is guaranteed.
        </p>
        <button
          onClick={() => setAcknowledged(true)}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900"
        >
          I understand — show the research slip
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DisclaimerBanner />

      <SgpChat rec={rec} />

      {/*
        * Risk-free edge first, because it is the only thing here that does
        * not depend on a forecast being right — and the only strategy in the
        * project with a measured, repeatable return.
        */}
      <ArbBuilder rec={rec} />

      {/* Edge that needs no forecast: the market disagreeing with itself. */}
      {(rec.opportunities ?? []).length > 0 && (
        <div className="card border-l-4 border-l-green-400">
          <button
            onClick={() => setOppsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={oppsOpen}
          >
            <h3 className="font-serif text-lg font-medium text-[var(--text)]">
              Market inconsistencies
            </h3>
            <span className="flex shrink-0 items-center gap-1.5 text-[0.65rem] text-[var(--muted)]">
              {oppCounts.arbitrage > 0 && (
                <span className="rounded bg-green-500/15 px-1.5 py-0.5 font-semibold text-green-300">
                  {oppCounts.arbitrage} arb
                </span>
              )}
              {oppCounts.middles > 0 && (
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                  {oppCounts.middles} middle
                  {oppCounts.middles === 1 ? "" : "s"}
                </span>
              )}
              {oppCounts.stale > 0 && (
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                  {oppCounts.stale} stale
                </span>
              )}
              <span className="text-[var(--muted-2)]">
                {oppsOpen ? "▾" : "▸"}
              </span>
            </span>
          </button>
          {!oppsOpen && (
            <p className="mt-1 text-[0.65rem] text-[var(--muted-2)]">
              {oppCounts.arbitrage > 0
                ? "Includes a risk-free pair — worth opening."
                : "Tap to see where the surveyed books disagree."}
            </p>
          )}
          {oppsOpen && (
            <>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-[var(--muted)]">
            These don&apos;t depend on out-predicting anyone — they&apos;re
            places the surveyed books disagree with each other. Limits and
            speed decide whether they survive contact; a price one book has
            already pulled isn&apos;t an opportunity.
          </p>
          <div className="space-y-3">
            {(rec.opportunities ?? []).map((o) => (
              <div key={o.matchup} className="rounded-xl bg-[var(--surface-2)] p-2.5">
                <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">
                  {o.matchup}
                </p>

                {o.arbitrage.map((a, i) => (
                  <div key={`arb${i}`} className="mb-1.5 text-[0.7rem] leading-relaxed">
                    <span className="mr-1.5 rounded bg-green-500/15 px-1.5 py-0.5 font-semibold text-green-300">
                      arbitrage +{(a.guaranteedReturn * 100).toFixed(2)}%
                    </span>
                    <span className="text-[var(--muted)]">
                      {a.sideA.label} {formatOdds(a.sideA.american)} at{" "}
                      {a.sideA.book} ({(a.stakeShareA * 100).toFixed(0)}% of
                      stake) + {a.sideB.label}{" "}
                      {formatOdds(a.sideB.american)} at {a.sideB.book}. Profits
                      whatever happens, at the same line.
                    </span>
                  </div>
                ))}

                {o.middles.map((m, i) => (
                  <div key={`mid${i}`} className="mb-1.5 text-[0.7rem] leading-relaxed">
                    <span
                      className={classNames(
                        "mr-1.5 rounded px-1.5 py-0.5 font-semibold",
                        m.expectedValue > 0
                          ? "bg-green-500/15 text-green-300"
                          : "bg-amber-500/15 text-amber-300",
                      )}
                    >
                      middle {m.expectedValue >= 0 ? "+" : ""}
                      {(m.expectedValue * 100).toFixed(1)}%
                    </span>
                    <span className="text-[var(--muted)]">
                      {m.lowSide.label} at {m.lowSide.book} +{" "}
                      {m.highSide.label} at {m.highSide.book}. Both win if the{" "}
                      {m.market === "total" ? "total" : "margin"} lands between{" "}
                      {m.gapFrom} and {m.gapTo} —{" "}
                      <span className="font-semibold text-[var(--text)]">
                        {(m.middleProbability * 100).toFixed(1)}%
                      </span>{" "}
                      by our distribution.
                    </span>
                  </div>
                ))}

                {o.stale.length > 0 && (
                  <p className="text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
                    <span className="mr-1 rounded bg-[var(--surface)] px-1.5 py-0.5">
                      stale
                    </span>
                    {o.stale
                      .map(
                        (st) =>
                          `${st.book} ${st.minutesBehind}m behind${
                            Math.abs(st.deviation) > 0.005
                              ? ` (${st.deviation > 0 ? "+" : ""}${(st.deviation * 100).toFixed(1)}pp off consensus)`
                              : ""
                          }`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
            </>
          )}
        </div>
      )}

      {/* Sub-screens: build one slip, or compare every book's version of it */}
      {allPlatforms.length > 1 && (
        <div className="flex gap-1.5 text-xs">
          {(
            [
              ["build", "Build slip"],
              ["compare", `Compare books (${allPlatforms.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={classNames(
                "flex-1 rounded-xl border px-3 py-2 font-semibold transition-colors",
                view === key
                  ? "border-sky-400 bg-sky-400/10 text-sky-200"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Which sportsbook the slip has to be placeable at */}
      {view === "build" && allPlatforms.length > 1 && (
        <div className="card">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Which sportsbook?</h3>
            <span className="text-[0.7rem] text-[var(--muted-2)]">
              {platforms.length === allPlatforms.length
                ? `${allPlatforms.length} surveyed`
                : `${platforms.length} of ${allPlatforms.length} shown`}
            </span>
          </div>
          <p className="mb-2 text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
            The default slip prices every leg at whichever book offers the best
            number. That is the best value available — and it is{" "}
            <strong>not placeable at one sportsbook</strong>, because the legs
            can be best at different books. Pick a platform and the slip is
            rebuilt from only the legs that book quotes, at its own prices.
            Expect less value; the gap is the cost of having one account.
          </p>

          {sortControls}

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              onClick={() => choosePlatform(null)}
              className={classNames(
                "flex min-w-[6.5rem] shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                platform === null
                  ? "border-sky-400 bg-sky-400/10"
                  : "border-[var(--border)] hover:border-[var(--accent)]/50",
              )}
            >
              <span className="text-xs font-semibold">Shop everywhere</span>
              <span className="text-[0.6rem] text-[var(--muted-2)]">
                best price per leg
              </span>
              <span className="text-[0.6rem] text-amber-300">
                needs several accounts
              </span>
            </button>
            {platforms.map((p) => {
              const ev = evAtLength(p, legCount);
              return (
                <button
                  key={p.book}
                  onClick={() => choosePlatform(p.book)}
                  className={classNames(
                    "flex min-w-[6.5rem] shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                    platform === p.book
                      ? "border-sky-400 bg-sky-400/10"
                      : "border-[var(--border)] hover:border-[var(--accent)]/50",
                  )}
                >
                  <span className="truncate text-xs font-semibold">
                    {p.book}
                  </span>
                  <span
                    className={classNames(
                      "text-[0.6rem] tabular-nums",
                      ev >= 0 ? "text-good" : "text-[var(--muted-2)]",
                    )}
                  >
                    {ev >= 0 ? "+" : ""}
                    {(ev * 100).toFixed(1)}% EV
                  </span>
                  <span className="text-[0.6rem] text-[var(--muted-2)] tabular-nums">
                    {p.legs.length} leg{p.legs.length === 1 ? "" : "s"}
                    {p.bestOnEveryLeg
                      ? " · best prices"
                      : ` · −${(p.priceGapVsBest * 100).toFixed(1)}pp/leg`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The full comparison, so the ranking can be checked rather than trusted */}
          <table className="mt-2 w-full text-[0.7rem]">
            <thead>
              <tr className="text-[0.6rem] uppercase tracking-wide text-[var(--muted-2)]">
                <th className="pb-1 text-left font-medium">Book</th>
                <th className="pb-1 text-right font-medium">
                  EV @{legCount}
                </th>
                <th className="pb-1 text-right font-medium">Best play</th>
                <th className="pb-1 text-right font-medium">Mean edge</th>
                <th className="pb-1 text-right font-medium">Value</th>
                <th className="pb-1 text-right font-medium">Shaky</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map((p) => (
                <tr
                  key={p.book}
                  className={classNames(
                    "border-t border-[var(--border)]",
                    platform === p.book ? "bg-sky-400/5" : "",
                  )}
                >
                  <td className="py-1 pr-2">
                    <button
                      onClick={() => choosePlatform(p.book)}
                      className="text-left hover:text-[var(--accent)]"
                    >
                      {p.book}
                    </button>
                    <span className="ml-1 text-[0.6rem] text-[var(--muted-2)]">
                      {p.gamesAvailable} game{p.gamesAvailable === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td
                    className={classNames(
                      "py-1 text-right tabular-nums",
                      p.legs.length < legCount
                        ? "text-[var(--muted-2)]"
                        : evAtLength(p, legCount) >= 0
                          ? "text-good"
                          : "text-[var(--muted)]",
                    )}
                    title={
                      p.legs.length < legCount
                        ? `Only offers ${p.legs.length} of the ${legCount} legs`
                        : undefined
                    }
                  >
                    {evAtLength(p, legCount) >= 0 ? "+" : ""}
                    {(evAtLength(p, legCount) * 100).toFixed(1)}%
                    {p.legs.length < legCount && (
                      <span className="text-[0.6rem]"> @{p.legs.length}</span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    <span
                      className={
                        bestPlay(p).ev >= 0
                          ? "text-good"
                          : "text-[var(--muted)]"
                      }
                    >
                      {bestPlay(p).ev >= 0 ? "+" : ""}
                      {(bestPlay(p).ev * 100).toFixed(1)}%
                    </span>
                    <span className="text-[0.6rem] text-[var(--muted-2)]">
                      {" "}
                      @{bestPlay(p).length}
                    </span>
                  </td>
                  <td
                    className={classNames(
                      "py-1 text-right tabular-nums",
                      p.meanLegEdge >= 0 ? "text-good" : "text-[var(--muted)]",
                    )}
                  >
                    {p.meanLegEdge >= 0 ? "+" : ""}
                    {(p.meanLegEdge * 100).toFixed(2)}pp
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {p.significantValueLegs}
                    <span className="text-[var(--muted-2)]">
                      /{p.valueLegs}
                    </span>
                  </td>
                  <td
                    className={classNames(
                      "py-1 text-right tabular-nums",
                      p.shakyLegs > 0 ? "text-bad" : "text-[var(--muted-2)]",
                    )}
                  >
                    {p.shakyLegs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[0.6rem] leading-relaxed text-[var(--muted-2)]">
            <strong>EV @{legCount}</strong> is this book&apos;s expected value
            at the length you&apos;re building, clamped to what it actually
            offers rather than extrapolated. <strong>Best play</strong> is the
            length that pays best <em>at that book</em> — almost always 1,
            because every extra leg pays its margin again, and higher only
            where it genuinely prices legs above fair value.{" "}
            <strong>Mean edge</strong> is the average gap between each
            leg&apos;s price here and the consensus fair value across all
            books, so a book ranks well because its numbers beat fair value,
            never because the benchmark was recomputed from its own prices.{" "}
            <strong>Value</strong> counts legs priced above fair value, with
            the first figure being how many clear the books&apos; own
            disagreement rather than sitting inside it.
          </p>
        </div>
      )}

      {/* Leg count, with the cost of each extra leg visible while choosing */}
      <div className="card">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">How many legs?</h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            {pool.length} candidate{pool.length === 1 ? "" : "s"} from{" "}
            {new Set(pool.map((l) => l.gameId)).size} games
            {activePlatform ? ` at ${activePlatform.book}` : ""}
          </span>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {Array.from({ length: maxLegs }, (_, i) => i + 1).map((n) => {
            const slip = slipFor(n);
            const ev =
              slip.length > 0 ? calculatePayout(1, slip).expectedValue : 0;
            return (
              <button
                key={n}
                onClick={() => chooseCount(n)}
                className={classNames(
                  "flex min-w-[3.6rem] shrink-0 flex-col items-center rounded-xl border px-2 py-1.5 transition-colors",
                  legCount === n
                    ? "border-sky-400 bg-sky-400/10"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50",
                )}
              >
                <span className="text-sm font-semibold tabular-nums">{n}</span>
                <span
                  className={classNames(
                    "text-[0.6rem] tabular-nums",
                    ev >= 0 ? "text-good" : "text-[var(--muted-2)]",
                  )}
                >
                  {ev >= 0 ? "+" : ""}
                  {(ev * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
          The figure under each number is expected value per $1 at that length.
          It falls as legs are added because every leg pays the bookmaker&apos;s
          margin again — measured at roughly 2 percentage points per leg, so
          ten legs surrender about a quarter of the stake to vig before a
          single forecast is involved. That compounding, not the picks, is what
          makes long parlays lose. The default starts short for that reason;
          longer pays more when it hits, far less often.
        </p>
      </div>

      {view === "compare" && (
        <div className="card">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              Best {legCount}-leg play at each book
            </h3>
            <span className="text-[0.7rem] text-[var(--muted-2)]">
              {platforms.length === allPlatforms.length
                ? `${allPlatforms.length} books`
                : `${platforms.length} of ${allPlatforms.length}`}
            </span>
          </div>
          <p className="mb-2 text-[0.7rem] leading-relaxed text-[var(--muted-2)]">
            The same slate, rebuilt independently at every sportsbook from
            only the legs that book quotes, at its own prices. The picks differ
            between books because the prices do — the best value at one book is
            a different bet from the best value at another. Edge is measured
            against the consensus fair value across all of them, so a book
            ranks high because its numbers beat fair value rather than because
            the benchmark came from its own prices.
          </p>
          {/*
            * Why every book shows zero value legs, stated up front rather
            * than left to look like a failure. It is the expected result, and
            * the tool's actual findings live somewhere else.
            */}
          <div className="mb-2 rounded-lg border-l-4 border-l-amber-400 bg-amber-500/5 px-2.5 py-2 text-[0.68rem] leading-relaxed text-amber-100">
            <strong>Expect zero value legs.</strong> No straight bet here beats
            consensus fair value, and that is the normal result rather than a
            miss — shopping every book recovers part of the margin, not all of
            it. On the current slate the best price is a median{" "}
            <span className="tabular-nums">1.4pp</span> below fair, roughly half
            a typical hold.
            {oppCounts.positiveEv > 0 ? (
              <>
                {" "}
                The{" "}
                <span className="font-semibold">
                  {oppCounts.positiveEv} positive-expectation play
                  {oppCounts.positiveEv === 1 ? "" : "s"}
                </span>{" "}
                this tool did find — best{" "}
                <span className="tabular-nums">
                  +{(oppCounts.bestEv * 100).toFixed(2)}%
                </span>{" "}
                — are under <em>Market inconsistencies</em>, not in this table.
                They each need <strong>two</strong> books at once, so they are
                not single-platform plays and deliberately do not count here.
              </>
            ) : (
              <> Nothing on this slate carries positive expectation.</>
            )}
          </div>

          {sortControls}

          {platforms.length === 0 ? (
            <p className="rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
              No book quotes all {legCount} legs. Drop the length, or turn off
              &ldquo;can take all {legCount}&rdquo;.
            </p>
          ) : (
            <div className="space-y-2">
              {platforms.map((p, rank) => {
                const n = Math.min(legCount, p.legs.length);
                const slip = p.legs.slice(0, n);
                const pay = calculatePayout(stake, slip);
                const short = p.legs.length < legCount;
                return (
                  <div
                    key={p.book}
                    className={classNames(
                      "rounded-xl border p-2.5",
                      rank === 0
                        ? "border-sky-400/60 bg-sky-400/5"
                        : "border-[var(--border)]",
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        <span className="mr-1.5 text-[var(--muted-2)]">
                          {rank + 1}.
                        </span>
                        {p.book}
                        {rank === 0 && (
                          <span className="ml-1.5 rounded bg-sky-400/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-sky-200">
                            best here
                          </span>
                        )}
                        {p.bestOnEveryLeg && (
                          <span className="ml-1.5 rounded bg-green-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-green-300">
                            best price on every leg
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() => {
                          choosePlatform(p.book);
                          setView("build");
                        }}
                        className="rounded-lg border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Build this →
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[0.7rem] sm:grid-cols-4">
                      <div>
                        <p className="text-[var(--muted-2)]">
                          {n}-leg price
                        </p>
                        <p className="font-semibold tabular-nums">
                          {formatOdds(pay.americanOdds)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-2)]">Win chance</p>
                        <p className="font-semibold tabular-nums">
                          {formatPct(pay.fairProbability)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-2)]">
                          EV on {formatMoney(stake)}
                        </p>
                        <p
                          className={classNames(
                            "font-semibold tabular-nums",
                            pay.expectedValue >= 0 ? "text-good" : "text-bad",
                          )}
                        >
                          {pay.expectedValue >= 0 ? "+" : ""}
                          {formatMoney(pay.expectedValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-2)]">Best play here</p>
                        <p className="font-semibold tabular-nums">
                          {bestPlay(p).ev >= 0 ? "+" : ""}
                          {(bestPlay(p).ev * 100).toFixed(1)}%
                          <span className="ml-1 text-[0.6rem] font-normal text-[var(--muted-2)]">
                            @{bestPlay(p).length} leg
                            {bestPlay(p).length === 1 ? "" : "s"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <ol className="mt-1.5 space-y-0.5 text-[0.68rem]">
                      {slip.map((l) => (
                        <li key={l.id} className="flex justify-between gap-2">
                          <span className="truncate text-[var(--muted)]">
                            {l.selection}
                            <span className="ml-1 text-[var(--muted-2)]">
                              {l.matchup}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatOdds(l.americanOdds)}
                            <span
                              className={classNames(
                                "ml-1",
                                l.edge > 0 ? "text-good" : "text-[var(--muted-2)]",
                              )}
                            >
                              {l.edge > 0 ? "+" : ""}
                              {(l.edge * 100).toFixed(1)}pp
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>

                    <p className="mt-1.5 flex flex-wrap gap-1.5 text-[0.6rem]">
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--muted)]">
                        {p.gamesAvailable} games quoted
                      </span>
                      <span
                        className={classNames(
                          "rounded px-1.5 py-0.5",
                          p.significantValueLegs > 0
                            ? "bg-green-500/10 text-green-300"
                            : "bg-[var(--surface-2)] text-[var(--muted)]",
                        )}
                      >
                        {p.valueLegs === 0
                          ? "no leg beats fair value"
                          : `${p.significantValueLegs}/${p.valueLegs} value legs clear noise`}
                      </span>
                      <span
                        className={classNames(
                          "rounded px-1.5 py-0.5",
                          p.shakyLegs > 0
                            ? "bg-red-500/10 text-red-300"
                            : "bg-green-500/10 text-green-300",
                        )}
                      >
                        {p.shakyLegs === 0
                          ? "no shaky legs"
                          : `${p.shakyLegs} shaky`}
                      </span>
                      {short && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                          only offers {p.legs.length} of {legCount}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[0.6rem] leading-relaxed text-[var(--muted-2)]">
            Every one of these is worse than the shop-everywhere slip on the
            Build tab, which is not placeable at a single book. That difference
            is the cost of having one account, and it is real rather than
            presentational. Illustrative math on listed odds, not an offer.
          </p>
        </div>
      )}

      {view === "build" && (
      <>
      {/* Sticky payout summary */}
      <div className="sticky top-2 z-10 rounded-2xl border border-sky-400/40 bg-[var(--surface-2)] p-4 shadow-lg md:top-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--muted)]">
              {selectedLegs.length}-leg slip ·{" "}
              {activePlatform ? (
                <span className="text-sky-300">{activePlatform.book}</span>
              ) : platforms.length > 1 ? (
                <span className="text-amber-300">best price per leg</span>
              ) : (
                "combined odds"
              )}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {payout ? formatOdds(payout.americanOdds) : "—"}
            </p>
            {payout && (
              <p className="text-xs text-[var(--muted)]">
                {payout.decimalOdds.toFixed(2)}× · implied{" "}
                {formatPct(payout.impliedProbability)}
              </p>
            )}
          </div>
          <div className="text-right">
            <label className="mb-1 block text-xs text-[var(--muted)]">
              Stake ($)
            </label>
            <input
              type="number"
              min={1}
              value={stake}
              onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
              className="w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-right tabular-nums"
            />
          </div>
        </div>
        {payout && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-[var(--surface)] p-2">
                <p className="text-xs text-[var(--muted)]">Est. payout</p>
                <p className="text-lg font-bold text-good tabular-nums">
                  {formatMoney(payout.payout)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface)] p-2">
                <p className="text-xs text-[var(--muted)]">Est. profit</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatMoney(payout.profit)}
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div
                className="rounded-lg bg-[var(--surface)] p-2"
                title="Our correlation-adjusted probability that every leg wins"
              >
                <p className="text-xs text-[var(--muted)]">Win chance</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatPct(payout.fairProbability)}
                </p>
                <p className="text-[0.6rem] text-[var(--muted-2)]">
                  1 in {(1 / Math.max(1e-6, payout.fairProbability)).toFixed(0)}{" "}
                  · fair {formatOdds(
                    payout.fairProbability > 0
                      ? Math.round(
                          payout.fairProbability >= 0.5
                            ? (-100 * payout.fairProbability) /
                                (1 - payout.fairProbability)
                            : (100 * (1 - payout.fairProbability)) /
                                payout.fairProbability,
                        )
                      : 0,
                  )}
                </p>
                {payout.correlated && (
                  <p className="text-[0.6rem] text-[var(--muted-2)]">
                    naive {formatPct(payout.naiveProbability)}
                  </p>
                )}
              </div>
              <div
                className="rounded-lg bg-[var(--surface)] p-2"
                title={
                  payout.correlated
                    ? "Theoretical only: correlated legs are priced here as if independent, which no sportsbook would offer"
                    : "Expected profit or loss on this stake, at our model probability"
                }
              >
                <p className="text-xs text-[var(--muted)]">
                  {payout.correlated ? "Theoretical EV" : "Expected value"}
                </p>
                <p
                  className={classNames(
                    "text-lg font-bold tabular-nums",
                    payout.correlated
                      ? "text-amber-300"
                      : payout.expectedValue >= 0
                        ? "text-good"
                        : "text-bad",
                  )}
                >
                  {payout.expectedValue >= 0 ? "+" : ""}
                  {formatMoney(payout.expectedValue)}
                  {payout.correlated && "*"}
                </p>
              </div>
            </div>

            {/* Shaky-bet summary: counted from measured flags on the legs. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
              <span
                className={classNames(
                  "rounded px-2 py-0.5",
                  shaky.length === 0
                    ? "bg-green-500/10 text-green-300"
                    : "bg-red-500/10 text-red-300",
                )}
                title="Legs carrying at least one high-severity warning"
              >
                {shaky.length === 0
                  ? "no shaky legs"
                  : `${shaky.length} shaky leg${shaky.length === 1 ? "" : "s"}`}
              </span>
              <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-[var(--muted)]">
                {flagged.length}/{selectedLegs.length} flagged
              </span>
              <span
                className={classNames(
                  "rounded px-2 py-0.5",
                  valueLegs.length > 0
                    ? "bg-green-500/10 text-green-300"
                    : "bg-[var(--surface)] text-[var(--muted)]",
                )}
                title="Legs whose best available price beats the consensus fair value"
              >
                {valueLegs.length} with a price edge
              </span>
              {shaky.length > 0 && (
                <span className="text-[var(--muted-2)]">
                  — open a leg for the specific reason
                </span>
              )}
            </div>

            {payout.correlated && (
              <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[0.65rem] text-amber-200">
                ⚠ This slip has multiple legs from the same game. Those outcomes
                are <strong>correlated</strong>, so the real win chance is higher
                than the naive product — and a sportsbook would price a true
                same-game parlay well below the combined odds shown here.{" "}
                <strong>
                  *The EV above is therefore theoretical, not an obtainable edge.
                </strong>
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-[0.65rem] text-[var(--muted)]">
          Estimated payout is illustrative math on the listed odds, not an offer.
          No outcome is guaranteed.
        </p>
      </div>

      {/* The honest headline: did the survey find a play, or not? */}
      <div
        className={classNames(
          "card border-l-4",
          rec.verdict === "value"
            ? "border-l-green-400"
            : "border-l-amber-400",
        )}
      >
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-medium text-[var(--text)]">
            {rec.verdict === "value"
              ? `${rec.marketSurvey.valueLegs} price edge${rec.marketSurvey.valueLegs === 1 ? "" : "s"} found`
              : rec.verdict === "no-edge"
                ? "No edge on this slate"
                : "One book only — no edge measurable"}
          </h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            {rec.marketSurvey.books.length > 0
              ? rec.marketSurvey.books.slice(0, 4).join(", ")
              : "single price source"}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.7rem]">
          <span
            className={classNames(
              "rounded px-2 py-0.5",
              rec.marketSurvey.priceFeed
                ? "bg-green-500/10 text-green-300"
                : "bg-amber-500/10 text-amber-300",
            )}
            title="A dedicated multi-book feed is the only way edge can be positive. With one bookmaker, edge equals minus half its hold by arithmetic."
          >
            {rec.marketSurvey.priceFeed
              ? `${rec.marketSurvey.priceFeed.name} connected`
              : "No odds feed — set ODDS_API_KEY"}
          </span>
          {rec.marketSurvey.priceFeed?.remainingCredits != null && (
            <span className="text-[var(--muted-2)]">
              {rec.marketSurvey.priceFeed.remainingCredits} credits left this
              month
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          {rec.verdict === "value" ? (
            <>
              The best available price beats the consensus fair value by up to{" "}
              <span className="font-semibold text-good">
                {(rec.marketSurvey.bestPriceEdge * 100).toFixed(1)} points
              </span>
              . That edge is in the price, not the forecast — the same bet at a
              number one book has moved and others haven&apos;t. It decays as
              they catch up.
            </>
          ) : rec.verdict === "no-edge" ? (
            <>
              Every surveyed book is pricing these games at or inside the
              consensus fair value, so nothing below is a play — it&apos;s the
              least-bad set. An efficient market producing no edge is the
              expected result, not a fault.
            </>
          ) : (
            <>
              Only one price source was available, so there was nothing to shop
              against. Expected value is negative by construction here: you
              pay the book&apos;s hold (~
              {(rec.marketSurvey.meanVig * 100).toFixed(1)}%) with no better
              number to compare it to.
            </>
          )}
        </p>
      </div>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <h3 className="font-semibold">Model inputs</h3>
          <span className="text-[0.7rem] text-[var(--muted-2)]">
            {rec.modelVersion}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rec.inputs.map((i) => (
            <div key={i.label} className="rounded-xl bg-[var(--surface-2)] p-2.5">
              <p className="text-[0.65rem] uppercase tracking-wide text-[var(--muted-2)]">
                {i.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {i.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {rec.notes.length > 0 && (
        <details className="card text-xs text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--text)]">
            How this model works ({rec.modelVersion})
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            {rec.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      {selectedLegs.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card">
            <h3 className="font-semibold">Model vs Market</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Each leg&apos;s heuristic model probability (accent) vs the
              odds-implied probability (grey). Accent bars longer than grey =
              positive edge.
            </p>
            <LegEdgeChart legs={selectedLegs} />
          </div>
          <div className="card">
            <h3 className="font-semibold">Payout Growth</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              How a {formatMoney(stake)} stake&apos;s estimated return compounds
              as each leg is added.
            </p>
            <ParlayGrowthChart legs={selectedLegs} stake={stake} />
          </div>
        </div>
      )}

      {/*
        * The cards follow the ACTIVE platform. They used to render rec.legs,
        * which is the fixed shop-everywhere slip — so picking a book changed
        * the payout while the cards below still showed other books' prices.
        */}
      <div className="grid gap-3">
        {slipFor(maxLegs).map((leg) => (
          <PickCard
            key={leg.id}
            leg={leg}
            selected={selectedIds.has(leg.id)}
            onToggle={() => toggle(leg.id)}
          />
        ))}
      </div>
      </>
      )}
    </div>
  );
}
