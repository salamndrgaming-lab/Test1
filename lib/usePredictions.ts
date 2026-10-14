"use client";

import { useCallback, useMemo } from "react";
import type { League, SgpLeg } from "@/types";
import { usePersistentState } from "@/lib/usePersistentState";
import {
  gradePrediction,
  scorePredictions,
  toPrediction,
  type GameResult,
  type PredictionRecord,
} from "@/lib/predictions";

const CAP = 500;
/** Don't bother asking for a result until the game has had time to finish. */
const SETTLE_DELAY_MS = 3 * 60 * 60 * 1000;

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

  return {
    records,
    record,
    grade,
    score,
    pendingCount,
    clear: () => setRecords([]),
  };
}
