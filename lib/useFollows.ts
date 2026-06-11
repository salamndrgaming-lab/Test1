"use client";

import { usePersistentState } from "@/lib/usePersistentState";

export interface CoverageSnapshot {
  date: string; // ISO
  left: number;
  center: number;
  right: number;
  total: number;
}

/** Followed story topics + locally-accumulated coverage snapshots for timelines. */
export function useFollows() {
  const [topics, setTopics] = usePersistentState<string[]>(
    "newsscope.follows",
    [],
  );
  const [snapshots, setSnapshots] = usePersistentState<
    Record<string, CoverageSnapshot[]>
  >("newsscope.followSnapshots", {});

  const isFollowing = (topic: string) =>
    topics.some((t) => t.toLowerCase() === topic.toLowerCase());

  const toggleFollow = (topic: string) => {
    const t = topic.trim();
    if (!t) return;
    setTopics((prev) =>
      isFollowing(t)
        ? prev.filter((x) => x.toLowerCase() !== t.toLowerCase())
        : [t, ...prev].slice(0, 20),
    );
  };

  /** Record one coverage snapshot per topic per day (for the timeline). */
  const recordSnapshot = (topic: string, snap: Omit<CoverageSnapshot, "date">) => {
    const today = new Date().toISOString().slice(0, 10);
    setSnapshots((prev) => {
      const list = prev[topic] ?? [];
      if (list.some((s) => s.date.slice(0, 10) === today)) return prev;
      return {
        ...prev,
        [topic]: [...list, { ...snap, date: new Date().toISOString() }].slice(-30),
      };
    });
  };

  return {
    topics,
    snapshots,
    isFollowing,
    toggleFollow,
    recordSnapshot,
  };
}
