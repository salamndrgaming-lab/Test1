"use client";

import { useMemo, useState } from "react";
import type { Article } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useFollows } from "@/lib/useFollows";
import { ArticleCard } from "@/components/news/ArticleCard";
import { CoverageSpread } from "@/components/charts/CoverageSpread";
import { Spinner, ErrorState } from "@/components/ui";
import {
  COLUMN_LABEL,
  blindspotFlags,
  groupByLean,
  type LeanColumn,
} from "@/lib/blindspot";

const COLUMN_ACCENT: Record<LeanColumn, string> = {
  left: "text-blue-400",
  center: "text-neutral-300",
  right: "text-red-400",
};

export function BlindspotColumns() {
  const [topic, setTopic] = useState("");
  const [submitted, setSubmitted] = useState("");
  const url = submitted
    ? `/api/blindspot?topic=${encodeURIComponent(submitted)}`
    : "/api/blindspot";
  const { data, loading, error, refetch } = useProvider<Article[]>(url);
  const { isFollowing, toggleFollow } = useFollows();
  const followable = submitted.trim() || topic.trim();

  const groups = useMemo(() => groupByLean(data ?? []), [data]);
  const flags = useMemo(() => blindspotFlags(groups), [groups]);
  const columns: LeanColumn[] = ["left", "center", "right"];

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(topic.trim());
        }}
        className="mb-3 flex gap-2"
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (blank = today's top story)"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button type="submit" className="btn-primary">
          Compare
        </button>
        {followable && (
          <button
            type="button"
            onClick={() => toggleFollow(followable)}
            className="chip text-xs"
            title="Follow this story"
          >
            {isFollowing(followable) ? "★ Following" : "☆ Follow"}
          </button>
        )}
      </form>

      {loading && <Spinner label="Comparing coverage…" />}
      {!loading && error && (
        <ErrorState message={`Couldn't compare coverage. ${error}`} onRetry={refetch} />
      )}

      {!loading && !error && (data?.length ?? 0) > 0 && (
        <>
          <div className="mb-4">
            <CoverageSpread articles={data ?? []} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {columns.map((col) => (
              <div key={col} className="rounded-2xl bg-[var(--surface-2)] p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className={`font-semibold ${COLUMN_ACCENT[col]}`}>
                    {COLUMN_LABEL[col]}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {groups[col].length}
                  </span>
                </div>
                {flags[col] ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-3 text-center text-xs text-amber-200">
                    ⚠ Blindspot — this side isn&apos;t covering the story.
                  </p>
                ) : groups[col].length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-[var(--muted)]">
                    No coverage found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groups[col].slice(0, 6).map((a) => (
                      <ArticleCard key={a.id} article={a} compact />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
