"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Article } from "@/types";
import { useProvider } from "@/lib/useProvider";
import { useFollows } from "@/lib/useFollows";
import { usePro } from "@/lib/usePro";
import { groupByLean, COLUMN_LABEL, type LeanColumn } from "@/lib/blindspot";
import { ArticleCard } from "@/components/news/ArticleCard";
import { FollowTimeline } from "@/components/news/FollowTimeline";
import { CoverageSpread } from "@/components/charts/CoverageSpread";
import { UpgradeCard } from "@/components/UpgradeCard";
import { PageHeader, Card, Spinner } from "@/components/ui";
import { accentVars } from "@/lib/sections";
import { classNames } from "@/lib/format";

function StoryView({ topic }: { topic: string }) {
  const { snapshots, recordSnapshot } = useFollows();
  const { data, loading } = useProvider<Article[]>(
    `/api/blindspot?topic=${encodeURIComponent(topic)}`,
  );

  const groups = groupByLean(data ?? []);
  // record one snapshot/day for the timeline
  useEffect(() => {
    if (data && data.length > 0) {
      recordSnapshot(topic, {
        left: groups.left.length,
        center: groups.center.length,
        right: groups.right.length,
        total: data.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, topic]);

  const cols: LeanColumn[] = ["left", "center", "right"];

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 font-semibold">Coverage timeline</h3>
        <p className="mb-3 text-xs text-[var(--muted)]">
          How each side&apos;s coverage of &quot;{topic}&quot; has shifted.
        </p>
        <FollowTimeline snapshots={snapshots[topic] ?? []} />
      </Card>

      {loading ? (
        <Spinner label="Loading coverage…" />
      ) : (data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[var(--muted)]">No coverage found right now.</p>
      ) : (
        <>
          <Card>
            <h3 className="mb-3 font-semibold">Coverage now</h3>
            <CoverageSpread articles={data ?? []} />
          </Card>
          <div className="grid gap-3 md:grid-cols-3">
            {cols.map((col) => (
              <div key={col} className="rounded-2xl bg-[var(--surface-2)] p-2">
                <p className="mb-2 px-1 text-sm font-semibold">
                  {COLUMN_LABEL[col]}{" "}
                  <span className="text-[var(--muted)]">
                    ({groups[col].length})
                  </span>
                </p>
                <div className="space-y-2">
                  {groups[col].slice(0, 4).map((a) => (
                    <ArticleCard key={a.id} article={a} compact />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function FollowingPage() {
  const { isPro } = usePro();
  const { topics, toggleFollow } = useFollows();
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? topics[0] ?? null;

  return (
    <div style={accentVars("news")}>
      <PageHeader
        kicker="Following"
        title="Your Stories"
        subtitle="Follow a story and watch how Left, Center, and Right cover it over time."
      />

      {!isPro ? (
        <UpgradeCard feature="Follow-a-story timelines" />
      ) : topics.length === 0 ? (
        <Card className="text-center">
          <p className="mb-3 text-sm text-[var(--muted)]">
            You&apos;re not following any stories yet. Open the{" "}
            <Link href="/bias" className="text-[var(--accent)]">
              Blindspot
            </Link>{" "}
            tool or search news and tap “Follow.”
          </p>
        </Card>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => setSelected(t)}
                className={classNames(
                  "chip whitespace-nowrap",
                  active === t && "chip-active",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {active && (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  onClick={() => {
                    toggleFollow(active);
                    setSelected(null);
                  }}
                  className="chip text-xs"
                >
                  Unfollow “{active}”
                </button>
              </div>
              <StoryView key={active} topic={active} />
            </>
          )}
        </>
      )}
    </div>
  );
}
