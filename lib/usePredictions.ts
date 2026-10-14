"use client";

import { useCallback, useMemo } from "react";
import type { League, SgpLeg } from "@/types";
import { usePersistentState } from "@/lib/usePersistentState";
import {
  applyClosingLine,
  gradePrediction,
  scoreClv,
  scorePredictions,
  toPrediction,
  type GameResult,
  type PredictionRecord,
} from "@/lib/predictions";
import type { ClosingLine } from "@/types";

const CAP = 500;
/** Don't bother asking for a result until the game has had time to finish. */
const SETTLE_DELAY_MS = 3 * 60 * 60 * 1000;
/**
 * How long after a pick we start looking for the closing line. The market has
 * to have moved and settled, but we want this long before the final score —
 * that earlier read is the whole point of tracking CLV.
 */
const CLOSE_DELAY_MS = 45 * 60 * 1000;

export function usePredictions() {
  const [records, setRecords] = usePersistentState<PredictionRecord[]>(
    "newsscope.predictions",
    [],
  );

  /** Log any legs we haven't seen before. Safe to call on every render. */
  const record = useCallback(
    (legs: SgpLeg[]) => {
      setRecords((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const additions = legs
          .map(toPrediction)
          .filter((p): p is PredictionRecord => p !== null && !seen.has(p.id));
        if (additions.length === 0) return prev;
        return [...additions, ...prev].slice(0, CAP);
      });
    },
    [setRecords],
  );

  /** Ungraded picks, for display. */
  const pendingCount = useMemo(
    () => records.filter((r) => !r.graded).length,
    [records],
  );

  /** Picks still waiting on a closing line. */
  const unpricedCount = useMemo(
    () =>
      records.filter(
        (r) => r.lineValue === undefined && r.probabilityValue === undefined,
      ).length,
    [records],
  );

  /**
   * Read the market's closing number for picks that have had time to settle.
   *
   * Deliberately separate from grading: a pick gets its CLV verdict within the
   * hour, while the score can be hours away and tells us far less per pick.
   */
  const checkClosingLines = useCallback(async () => {
    const ready = records.filter(
      (r) =>
        r.lineValue === undefined &&
        r.probabilityValue === undefined &&
        Date.now() - +new Date(r.recordedAt) > CLOSE_DELAY_MS,
    );
    if (ready.length === 0) return 0;

    const byGame = new Map<string, League>();
    for (const r of ready) byGame.set(r.gameId, r.league);
    const payload = [...byGame.entries()]
      .slice(0, 25)
      .map(([gameId, league]) => ({ gameId, league }));

    let closingLines: ClosingLine[] = [];
    try {
      const res = await fetch("/api/sgp/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending: payload }),
      });
      closingLines = (await res.json()).closingLines ?? [];
    } catch {
      return 0;
    }
    if (closingLines.length === 0) return 0;

    const byId = new Map(closingLines.map((c) => [c.gameId, c]));
    let priced = 0;
    setRecords((prev) =>
      prev.map((r) => {
        if (r.lineValue !== undefined || r.probabilityValue !== undefined) {
          return r;
        }
        const closing = byId.get(r.gameId);
        if (!closing) return r;
        const next = applyClosingLine(r, closing);
        if (next !== r) priced++;
        return next;
      }),
    );
    return priced;
  }, [records, setRecords]);

  /** Ask the server for final scores and settle whatever has finished. */
  const grade = useCallback(async () => {
    // the settle delay is evaluated here, not during render, so the hook stays pure
    const ready = records.filter(
      (r) => !r.graded && Date.now() - +new Date(r.recordedAt) > SETTLE_DELAY_MS,
    );
    if (ready.length === 0) return 0;
    const byGame = new Map<string, League>();
    for (const r of ready) byGame.set(r.gameId, r.league);
    const payload = [...byGame.entries()]
      .slice(0, 25)
      .map(([gameId, league]) => ({ gameId, league }));

    let results: GameResult[] = [];
    try {
      const res = await fetch("/api/sgp/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending: payload }),
      });
      results = (await res.json()).results ?? [];
    } catch {
      return 0;
    }
    if (results.length === 0) return 0;

    const byId = new Map(results.map((r) => [r.gameId, r]));
    let graded = 0;
    setRecords((prev) =>
      prev.map((r) => {
        if (r.graded) return r;
        const result = byId.get(r.gameId);
        if (!result) return r;
        graded++;
        return gradePrediction(r, result);
      }),
    );
    return graded;
  }, [records, setRecords]);

  const score = useMemo(() => scorePredictions(records), [records]);
  const clv = useMemo(() => scoreClv(records), [records]);

  return {
    records,
    record,
    grade,
    checkClosingLines,
    score,
    clv,
    pendingCount,
    unpricedCount,
    clear: () => setRecords([]),
  };
}
